/**
 * Users, passwords, sessions, invites, lockout and the audit log.
 *
 * Design notes (the "why"):
 *  - Passwords are hashed with scrypt from `node:crypto` — a memory-hard KDF that ships with Node,
 *    so the showroom keeps its zero-runtime-dependency posture. Parameters and salt are stored
 *    inside the hash string so they can be raised later without invalidating existing hashes.
 *  - Sessions are stateless signed tokens (HMAC-SHA256) carried in an HttpOnly cookie. Each token
 *    pins the user's `sessionEpoch`; bumping that number (password change, disable, role change)
 *    invalidates every outstanding session for that user without a server-side session table.
 *  - Login failures are counted on the user record and the account locks for 15 minutes after 10
 *    failures. A separate in-memory per-IP+email throttle blunts spraying before it ever reaches
 *    the (deliberately slow) KDF.
 *  - Login answers identically for "no such user" and "wrong password", and still burns a scrypt
 *    call for unknown emails, so the endpoint is not a user-enumeration oracle.
 *  - Invite tokens are random 32-byte values; only their SHA-256 is stored, so a leaked data
 *    directory does not hand out usable invitation links.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Collection, Store, StoredDoc } from "../../vendor/arag-platform/src/index.ts";
import {
  badRequest,
  conflict,
  forbidden,
  HttpError,
  notFound,
  unauthorized,
} from "../../vendor/arag-platform/src/index.ts";
import { isRole, type Principal, type Role } from "../permissions.ts";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// Cost parameters: ~64 MB, ~100 ms on a modern core. Raise N (not r/p) to make hashing slower.
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 96 * 1024 * 1024 } as const;
const KEYLEN = 32;

export const MAX_FAILED_ATTEMPTS = 10;
export const LOCKOUT_MS = 15 * 60_000;
export const SESSION_TTL_SEC = 12 * 3600;
export const MIN_PASSWORD_LENGTH = 12;
/** Per (ip, email) login throttle: this many attempts per window before 429s. */
export const LOGIN_THROTTLE = { max: 10, windowMs: 15 * 60_000 } as const;

export interface UserDoc extends StoredDoc {
  id: string;
  email: string;
  name: string;
  role: Role;
  productRoles: Record<string, Role>;
  passwordHash: string;
  mustChangePassword: boolean;
  disabled: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  sessionEpoch: number;
  invitedBy: string | null;
}

export interface InviteDoc extends StoredDoc {
  id: string;
  email: string;
  name: string;
  role: Role;
  productRoles: Record<string, Role>;
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedUserId: string | null;
  createdBy: string;
  revokedAt: string | null;
}

export interface AuditDoc extends StoredDoc {
  id: string;
  ts: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  target: string | null;
  ip: string | null;
  detail: Record<string, unknown>;
}

/** The user as it is safe to send to a browser — never includes `passwordHash`. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  productRoles: Record<string, Role>;
  mustChangePassword: boolean;
  disabled: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface PublicInvite {
  id: string;
  email: string;
  name: string;
  role: Role;
  productRoles: Record<string, Role>;
  expiresAt: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  acceptedAt: string | null;
  createdBy: string;
  createdAt: string;
  /** Only returned once, at creation time. */
  inviteUrl?: string;
}

// ───────────────────────────── password hashing ─────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), derived.toString("base64")].join(
    "$",
  );
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || expected.length === 0)
    return false;
  const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
    N,
    r,
    p,
    maxmem: SCRYPT.maxmem,
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Rejects the passwords that actually get chosen: too short, or the email/word "password". */
export function passwordProblem(password: string, email = ""): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 256) return "Password must be at most 256 characters.";
  const lower = password.toLowerCase();
  if (lower.includes("password") || lower.includes("showroom")) return "Password is too predictable.";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 3 && lower.includes(local)) return "Password must not contain your email address.";
  if (new Set(password).size < 5) return "Password must use at least 5 distinct characters.";
  return null;
}

/** A readable, high-entropy temporary password for invites and admin resets. */
export function generatePassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}-${out.slice(15, 20)}`;
}

export function normaliseEmail(email: string): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

// ───────────────────────────── service ─────────────────────────────

export interface UsersOptions {
  store: Store;
  /** HMAC secret for session cookies. */
  sessionSecret: string;
  /** Injectable clock, so lockout and expiry are testable without sleeping. */
  now?: () => number;
}

export interface LoginResult {
  user: UserDoc;
  token: string;
  expiresAt: string;
}

export class UsersService {
  readonly users: Collection<UserDoc>;
  readonly invites: Collection<InviteDoc>;
  readonly audit: Collection<AuditDoc>;
  private readonly secret: string;
  private readonly now: () => number;
  private readonly throttle = new Map<string, { count: number; resetAt: number }>();

  constructor(opts: UsersOptions) {
    this.users = opts.store.collection<UserDoc>("users");
    this.invites = opts.store.collection<InviteDoc>("invites");
    this.audit = opts.store.collection<AuditDoc>("audit", { cap: 5000 });
    this.secret = opts.sessionSecret;
    this.now = opts.now ?? (() => Date.now());
  }

  get count(): number {
    return this.users.size;
  }

  // ── audit ──

  record(
    action: string,
    opts: {
      actor?: UserDoc | null;
      target?: string | null;
      ip?: string | null;
      detail?: Record<string, unknown>;
    } = {},
  ): AuditDoc {
    return this.audit.put({
      id: randomUUID(),
      ts: new Date(this.now()).toISOString(),
      action,
      actorId: opts.actor?.id ?? null,
      actorEmail: opts.actor?.email ?? null,
      target: opts.target ?? null,
      ip: opts.ip ?? null,
      detail: opts.detail ?? {},
    });
  }

  listAudit(opts: { limit?: number; action?: string; actor?: string } = {}): AuditDoc[] {
    return this.audit.list({
      filter: (d) =>
        (!opts.action || d.action === opts.action) &&
        (!opts.actor || d.actorEmail === opts.actor || d.actorId === opts.actor),
      sort: (a, b) => b.ts.localeCompare(a.ts),
      limit: Math.min(opts.limit ?? 100, 500),
    });
  }

  // ── users ──

  byEmail(email: string): UserDoc | undefined {
    const e = normaliseEmail(email);
    return this.users.list({ filter: (u) => u.email === e })[0];
  }

  byId(id: string): UserDoc | undefined {
    return this.users.get(id);
  }

  list(): UserDoc[] {
    return this.users.list({ sort: (a, b) => a.email.localeCompare(b.email) });
  }

  async create(input: {
    email: string;
    name?: string;
    password: string;
    role: Role;
    productRoles?: Record<string, Role>;
    mustChangePassword?: boolean;
    invitedBy?: string | null;
  }): Promise<UserDoc> {
    const email = normaliseEmail(input.email);
    if (!isEmail(email)) throw badRequest("A valid email address is required.");
    if (this.byEmail(email)) throw conflict(`A user with the email ${email} already exists.`);
    const problem = passwordProblem(input.password, email);
    if (problem) throw badRequest(problem);
    return this.users.put({
      id: randomUUID(),
      email,
      name: (input.name ?? "").trim() || email.split("@")[0] || email,
      role: input.role,
      productRoles: sanitiseProductRoles(input.productRoles),
      passwordHash: await hashPassword(input.password),
      mustChangePassword: input.mustChangePassword ?? true,
      disabled: false,
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      sessionEpoch: 1,
      invitedBy: input.invitedBy ?? null,
    });
  }

  update(
    id: string,
    patch: { name?: string; role?: Role; productRoles?: Record<string, Role>; disabled?: boolean },
  ): UserDoc {
    const user = this.users.get(id);
    if (!user) throw notFound("User");
    const next: Partial<UserDoc> = {};
    if (patch.name !== undefined) next.name = patch.name.trim() || user.name;
    if (patch.role !== undefined) next.role = patch.role;
    if (patch.productRoles !== undefined) next.productRoles = sanitiseProductRoles(patch.productRoles);
    if (patch.disabled !== undefined) next.disabled = patch.disabled;
    // Any change to who someone is must invalidate their existing sessions.
    const identityChanged =
      next.role !== undefined || next.productRoles !== undefined || next.disabled !== undefined;
    if (identityChanged) next.sessionEpoch = user.sessionEpoch + 1;
    return this.users.update(id, next) as UserDoc;
  }

  /** Deleting the last remaining admin would lock everyone out of administration. */
  remove(id: string): void {
    const user = this.users.get(id);
    if (!user) throw notFound("User");
    if (user.role === "admin" && this.adminCount() <= 1)
      throw conflict("Cannot remove the last remaining administrator.");
    this.users.delete(id);
  }

  adminCount(): number {
    return this.users.list({ filter: (u) => u.role === "admin" && !u.disabled }).length;
  }

  async setPassword(id: string, password: string, opts: { mustChange?: boolean } = {}): Promise<UserDoc> {
    const user = this.users.get(id);
    if (!user) throw notFound("User");
    const problem = passwordProblem(password, user.email);
    if (problem) throw badRequest(problem);
    if (await verifyPassword(password, user.passwordHash))
      throw badRequest("The new password must be different from the current one.");
    return this.users.update(id, {
      passwordHash: await hashPassword(password),
      mustChangePassword: opts.mustChange ?? false,
      failedAttempts: 0,
      lockedUntil: null,
      sessionEpoch: user.sessionEpoch + 1,
    }) as UserDoc;
  }

  async changeOwnPassword(id: string, current: string, next: string): Promise<UserDoc> {
    const user = this.users.get(id);
    if (!user) throw notFound("User");
    if (!(await verifyPassword(current, user.passwordHash)))
      throw unauthorized("The current password is not correct.");
    return this.setPassword(id, next, { mustChange: false });
  }

  isLocked(user: UserDoc): boolean {
    return !!user.lockedUntil && Date.parse(user.lockedUntil) > this.now();
  }

  // ── login ──

  /** Returns null when allowed, or the seconds to wait when the per-IP+email throttle trips. */
  throttleCheck(ip: string, email: string): number | null {
    const key = `${ip}|${normaliseEmail(email)}`;
    const now = this.now();
    const entry = this.throttle.get(key);
    if (!entry || entry.resetAt <= now) {
      this.throttle.set(key, { count: 1, resetAt: now + LOGIN_THROTTLE.windowMs });
      if (this.throttle.size > 5000) this.throttle.delete(this.throttle.keys().next().value as string);
      return null;
    }
    entry.count += 1;
    if (entry.count > LOGIN_THROTTLE.max) return Math.ceil((entry.resetAt - now) / 1000);
    return null;
  }

  async login(email: string, password: string, ip: string | null = null): Promise<LoginResult> {
    const user = this.byEmail(email);
    const fail = (reason: string, detail: Record<string, unknown> = {}) => {
      this.record("auth.login.failed", {
        actor: user ?? null,
        target: normaliseEmail(email),
        ip,
        detail: { reason, ...detail },
      });
      return unauthorized("Email or password is not correct.");
    };
    if (!user) {
      // Burn an equivalent amount of work so timing does not reveal whether the account exists.
      await verifyPassword(password, DUMMY_HASH);
      throw fail("unknown-user");
    }
    if (this.isLocked(user)) {
      this.record("auth.login.locked", { actor: user, target: user.email, ip, detail: {} });
      throw new HttpError(
        423,
        "Account locked",
        `Too many failed sign-in attempts. This account is locked until ${user.lockedUntil}.`,
      );
    }
    if (user.disabled) {
      this.record("auth.login.disabled", { actor: user, target: user.email, ip, detail: {} });
      throw forbidden("This account has been disabled. Ask an administrator to re-enable it.");
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      const failedAttempts = user.failedAttempts + 1;
      const lock = failedAttempts >= MAX_FAILED_ATTEMPTS;
      this.users.update(user.id, {
        failedAttempts,
        lockedUntil: lock ? new Date(this.now() + LOCKOUT_MS).toISOString() : user.lockedUntil,
      });
      throw fail("bad-password", { failedAttempts, locked: lock });
    }
    const updated = this.users.update(user.id, {
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(this.now()).toISOString(),
    }) as UserDoc;
    this.record("auth.login", { actor: updated, target: updated.email, ip, detail: { role: updated.role } });
    return this.issue(updated);
  }

  // ── sessions ──

  issue(user: UserDoc, ttlSec = SESSION_TTL_SEC): LoginResult {
    const exp = Math.floor(this.now() / 1000) + ttlSec;
    const payload = Buffer.from(
      JSON.stringify({ sub: user.id, epoch: user.sessionEpoch, exp }),
      "utf8",
    ).toString("base64url");
    const sig = createHmac("sha256", this.secret).update(payload).digest("base64url");
    return { user, token: `${payload}.${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** Verify a session cookie and return the live user, or null. Never throws. */
  verify(token: string | undefined | null): UserDoc | null {
    if (!token || typeof token !== "string") return null;
    const dot = token.indexOf(".");
    if (dot <= 0) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac("sha256", this.secret).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    let claims: { sub?: string; epoch?: number; exp?: number };
    try {
      claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= this.now()) return null;
    const user = claims.sub ? this.users.get(claims.sub) : undefined;
    if (!user || user.disabled) return null;
    if (claims.epoch !== user.sessionEpoch) return null;
    return user;
  }

  /** A CSRF token bound to the session token; forms submit it and page POSTs verify it. */
  csrfToken(sessionToken: string): string {
    return createHmac("sha256", `${this.secret}:csrf`).update(sessionToken).digest("base64url");
  }

  csrfValid(sessionToken: string | undefined | null, candidate: unknown): boolean {
    if (!sessionToken || typeof candidate !== "string" || candidate.length === 0) return false;
    const expected = this.csrfToken(sessionToken);
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ── invites ──

  createInvite(input: {
    email: string;
    name?: string;
    role: Role;
    productRoles?: Record<string, Role>;
    expiresInDays?: number;
    createdBy: UserDoc;
  }): { invite: InviteDoc; token: string } {
    const email = normaliseEmail(input.email);
    if (!isEmail(email)) throw badRequest("A valid email address is required.");
    if (this.byEmail(email)) throw conflict(`A user with the email ${email} already exists.`);
    const days = Math.min(Math.max(input.expiresInDays ?? 7, 1), 90);
    const token = randomBytes(32).toString("base64url");
    const invite = this.invites.put({
      id: randomUUID(),
      email,
      name: (input.name ?? "").trim(),
      role: input.role,
      productRoles: sanitiseProductRoles(input.productRoles),
      tokenHash: sha256(token),
      expiresAt: new Date(this.now() + days * 86_400_000).toISOString(),
      acceptedAt: null,
      acceptedUserId: null,
      createdBy: input.createdBy.email,
      revokedAt: null,
    });
    return { invite, token };
  }

  inviteStatus(invite: InviteDoc): PublicInvite["status"] {
    if (invite.revokedAt) return "revoked";
    if (invite.acceptedAt) return "accepted";
    if (Date.parse(invite.expiresAt) <= this.now()) return "expired";
    return "pending";
  }

  findInviteByToken(token: string): InviteDoc | undefined {
    if (!token) return undefined;
    const hash = sha256(token);
    return this.invites.list({ filter: (i) => i.tokenHash === hash })[0];
  }

  /** Look up a usable invite, or throw the reason it cannot be used. */
  openInvite(token: string): InviteDoc {
    const invite = this.findInviteByToken(token);
    if (!invite) throw notFound("Invite");
    const status = this.inviteStatus(invite);
    if (status === "accepted") throw conflict("This invitation has already been used.");
    if (status === "revoked") throw conflict("This invitation has been revoked.");
    if (status === "expired") throw conflict("This invitation has expired. Ask for a new one.");
    return invite;
  }

  async acceptInvite(token: string, password: string, opts: { name?: string; ip?: string | null } = {}) {
    const invite = this.openInvite(token);
    const user = await this.create({
      email: invite.email,
      name: opts.name ?? invite.name,
      password,
      role: invite.role,
      productRoles: invite.productRoles,
      mustChangePassword: false,
      invitedBy: invite.createdBy,
    });
    this.invites.update(invite.id, {
      acceptedAt: new Date(this.now()).toISOString(),
      acceptedUserId: user.id,
    });
    this.record("invite.accepted", {
      actor: user,
      target: user.email,
      ip: opts.ip ?? null,
      detail: { inviteId: invite.id, role: user.role },
    });
    return this.issue(user);
  }

  revokeInvite(id: string): InviteDoc {
    const invite = this.invites.get(id);
    if (!invite) throw notFound("Invite");
    if (invite.acceptedAt) throw conflict("This invitation has already been used.");
    return this.invites.update(id, { revokedAt: new Date(this.now()).toISOString() }) as InviteDoc;
  }

  listInvites(): InviteDoc[] {
    return this.invites.list({ sort: (a, b) => b.createdAt.localeCompare(a.createdAt) });
  }

  // ── bootstrap ──

  /**
   * Create the first administrator from SHOWROOM_ADMIN_EMAIL / SHOWROOM_ADMIN_PASSWORD when the
   * store is empty. Refuses to run once any user exists so the env vars can be left in place.
   */
  async bootstrap(email: string, password: string): Promise<UserDoc | null> {
    if (this.users.size > 0) return null;
    if (!email || !password) return null;
    const user = await this.create({
      email,
      name: "Administrator",
      password,
      role: "admin",
      mustChangePassword: true,
    });
    this.record("user.bootstrapped", { actor: user, target: user.email, detail: { role: "admin" } });
    return user;
  }

  // ── projections ──

  publicUser(user: UserDoc): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      productRoles: user.productRoles,
      mustChangePassword: user.mustChangePassword,
      disabled: user.disabled,
      locked: this.isLocked(user),
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  publicInvite(invite: InviteDoc, inviteUrl?: string): PublicInvite {
    return {
      id: invite.id,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      productRoles: invite.productRoles,
      expiresAt: invite.expiresAt,
      status: this.inviteStatus(invite),
      acceptedAt: invite.acceptedAt,
      createdBy: invite.createdBy,
      createdAt: invite.createdAt,
      ...(inviteUrl ? { inviteUrl } : {}),
    };
  }
}

export function principalOf(user: UserDoc): Principal {
  return { role: user.role, productRoles: user.productRoles };
}

function sanitiseProductRoles(input: Record<string, Role> | undefined): Record<string, Role> {
  const out: Record<string, Role> = {};
  for (const [slug, role] of Object.entries(input ?? {})) {
    if (/^[a-z0-9][a-z0-9-]{0,48}$/.test(slug) && isRole(role)) out[slug] = role;
  }
  return out;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

/** A real scrypt hash of a random value, used to equalise timing for unknown accounts. */
const DUMMY_HASH = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${randomBytes(16).toString(
  "base64",
)}$${randomBytes(KEYLEN).toString("base64")}`;
