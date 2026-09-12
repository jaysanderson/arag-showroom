/** Unit tests for passwords, sessions, lockout, invites and the audit log. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  generatePassword,
  hashPassword,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  normaliseEmail,
  passwordProblem,
  principalOf,
  UsersService,
  verifyPassword,
} from "../src/services/users.ts";
import { Store } from "../vendor/arag-platform/src/index.ts";

const GOOD = "keel-harbour-mantle-93";
const OTHER = "tundra-lantern-quiver-71";

function svc(now?: () => number, sessionSecret = "unit-test-secret-unit-test-secret") {
  const store = new Store("/tmp/never-written", { persist: false });
  return new UsersService({ store, sessionSecret, now });
}

describe("password hashing", () => {
  test("hashes are salted, self-describing and verify", async () => {
    const hash = await hashPassword(GOOD);
    const [scheme, N, r, p] = hash.split("$");
    assert.equal(scheme, "scrypt");
    assert.equal(Number(N), 16384);
    assert.equal(Number(r), 8);
    assert.equal(Number(p), 1);
    assert.equal(await verifyPassword(GOOD, hash), true);
    assert.equal(await verifyPassword(`${GOOD} `, hash), false);
    assert.notEqual(hash, await hashPassword(GOOD), "the same password must not produce the same hash");
  });

  test("a malformed or truncated hash never verifies", async () => {
    for (const bad of [
      "",
      "nonsense",
      "scrypt$1$2$3",
      "bcrypt$16384$8$1$aa$bb",
      "scrypt$x$8$1$aa$bb",
      "scrypt$16384$8$1$aa$",
    ])
      assert.equal(await verifyPassword(GOOD, bad), false);
  });

  test("unicode passwords normalise so the same keystrokes always work", async () => {
    const composed = "café-harbour-mantle-93";
    const decomposed = "café-harbour-mantle-93";
    assert.equal(await verifyPassword(decomposed, await hashPassword(composed)), true);
  });
});

describe("password policy", () => {
  test("rejects short, repetitive, predictable and email-derived passwords", () => {
    assert.match(passwordProblem("short") ?? "", /at least 12/);
    assert.match(passwordProblem("aaaaaaaaaaaaaa") ?? "", /distinct/);
    assert.match(passwordProblem("mypassword1234") ?? "", /predictable/);
    assert.match(passwordProblem("showroom-1234-x") ?? "", /predictable/);
    assert.match(passwordProblem("harriet-tubman-1", "harriet@example.com") ?? "", /email/);
    assert.equal(passwordProblem("x".repeat(300)), "Password must be at most 256 characters.");
  });

  test("accepts a reasonable passphrase", () => {
    assert.equal(passwordProblem(GOOD, "someone@example.com"), null);
  });

  test("generated passwords satisfy the policy", () => {
    for (let i = 0; i < 20; i++) assert.equal(passwordProblem(generatePassword()), null);
  });
});

describe("users", () => {
  test("emails are normalised and must be unique", async () => {
    const users = svc();
    assert.equal(normaliseEmail("  Ada@Example.COM "), "ada@example.com");
    await users.create({ email: "Ada@Example.com", password: GOOD, role: "viewer" });
    assert.equal(users.byEmail("ada@EXAMPLE.com")?.email, "ada@example.com");
    await assert.rejects(
      () => users.create({ email: "ada@example.com", password: GOOD, role: "viewer" }),
      /already exists/,
    );
  });

  test("an invalid email or a weak password is rejected", async () => {
    const users = svc();
    await assert.rejects(
      () => users.create({ email: "not-an-email", password: GOOD, role: "viewer" }),
      /valid email/,
    );
    await assert.rejects(
      () => users.create({ email: "a@b.co", password: "short", role: "viewer" }),
      /at least 12/,
    );
  });

  test("product roles are sanitised: unknown roles and odd slugs are dropped", async () => {
    const users = svc();
    const user = await users.create({
      email: "a@b.co",
      password: GOOD,
      role: "viewer",
      productRoles: { "call-analysis": "evaluator", "BAD SLUG": "admin", other: "superuser" } as never,
    });
    assert.deepEqual(user.productRoles, { "call-analysis": "evaluator" });
    assert.deepEqual(principalOf(user), { role: "viewer", productRoles: { "call-analysis": "evaluator" } });
  });

  test("the public projection never carries the password hash", async () => {
    const users = svc();
    const user = await users.create({ email: "a@b.co", password: GOOD, role: "admin" });
    const json = JSON.stringify(users.publicUser(user));
    assert.equal(json.includes("passwordHash"), false);
    assert.equal(json.includes("scrypt"), false);
  });

  test("the last administrator cannot be removed", async () => {
    const users = svc();
    const admin = await users.create({ email: "a@b.co", password: GOOD, role: "admin" });
    await users.create({ email: "c@d.co", password: OTHER, role: "viewer" });
    assert.throws(() => users.remove(admin.id), /last remaining administrator/);
    const second = await users.create({ email: "e@f.co", password: `${OTHER}x`, role: "admin" });
    users.remove(admin.id);
    assert.equal(users.byId(second.id)?.role, "admin");
  });
});

describe("sessions", () => {
  test("a token round-trips and identifies the user", async () => {
    const users = svc();
    const user = await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    const { token } = users.issue(user);
    assert.equal(users.verify(token)?.id, user.id);
  });

  test("a tampered, truncated, foreign or missing token is rejected", async () => {
    const users = svc();
    const user = await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    const { token } = users.issue(user);
    const [payload, sig] = token.split(".");
    assert.equal(users.verify(undefined), null);
    assert.equal(users.verify(""), null);
    assert.equal(users.verify("garbage"), null);
    assert.equal(users.verify(payload), null);
    assert.equal(users.verify(`${payload}.${sig}x`), null);
    assert.equal(users.verify(`${payload}x.${sig}`), null);
    // Signed with a different secret: the signature no longer matches this deployment.
    const other = svc(undefined, "a-completely-different-secret-value");
    assert.equal(users.verify(other.issue(user).token), null);
  });

  test("an expired token is rejected", async () => {
    let now = Date.parse("2026-01-01T00:00:00Z");
    const users = svc(() => now);
    const user = await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    const { token } = users.issue(user, 60);
    assert.ok(users.verify(token));
    now += 61_000;
    assert.equal(users.verify(token), null);
  });

  test("changing a password, a role or the disabled flag invalidates outstanding sessions", async () => {
    const users = svc();
    const user = await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    const before = users.issue(user).token;
    await users.setPassword(user.id, OTHER);
    assert.equal(users.verify(before), null);

    const after = users.issue(users.byId(user.id) as never).token;
    users.update(user.id, { role: "operator" });
    assert.equal(users.verify(after), null);

    const third = users.issue(users.byId(user.id) as never).token;
    users.update(user.id, { disabled: true });
    assert.equal(users.verify(third), null);
  });

  test("a renamed user keeps their session (a name is not an identity change)", async () => {
    const users = svc();
    const user = await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    const { token } = users.issue(user);
    users.update(user.id, { name: "Ada" });
    assert.equal(users.verify(token)?.name, "Ada");
  });

  test("CSRF tokens are bound to the session token", async () => {
    const users = svc();
    const user = await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    const a = users.issue(user).token;
    const b = users.issue(user, 3600).token;
    assert.equal(users.csrfValid(a, users.csrfToken(a)), true);
    assert.equal(users.csrfValid(a, users.csrfToken(b)), false);
    assert.equal(users.csrfValid(a, ""), false);
    assert.equal(users.csrfValid(a, undefined), false);
    assert.equal(users.csrfValid(undefined, users.csrfToken(a)), false);
    assert.equal(users.csrfValid(a, a), false);
  });
});

describe("login, lockout and the audit log", () => {
  test("a correct sign-in is recorded and clears the failure counter", async () => {
    const users = svc();
    await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    const result = await users.login("A@B.co", GOOD, "203.0.113.1");
    assert.equal(result.user.email, "a@b.co");
    assert.equal(result.user.failedAttempts, 0);
    assert.ok(result.user.lastLoginAt);
    assert.equal(users.listAudit({ action: "auth.login" }).length, 1);
    assert.equal(users.listAudit({ action: "auth.login" })[0]?.ip, "203.0.113.1");
  });

  test("an unknown user and a wrong password fail identically", async () => {
    const users = svc();
    await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    const messages: string[] = [];
    for (const [email, password] of [
      ["a@b.co", "wrong-password-here"],
      ["nobody@b.co", GOOD],
    ] as const) {
      await assert.rejects(
        () => users.login(email, password),
        (err: Error & { status: number }) => {
          messages.push(err.message);
          assert.equal(err.status, 401);
          return true;
        },
      );
    }
    assert.equal(messages[0], messages[1]);
    assert.equal(users.listAudit({ action: "auth.login.failed" }).length, 2);
  });

  test("the account locks after the configured number of failures and releases on time", async () => {
    let now = Date.parse("2026-01-01T00:00:00Z");
    const users = svc(() => now);
    await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++)
      await assert.rejects(() => users.login("a@b.co", "definitely-wrong-1"));
    assert.equal(users.isLocked(users.byEmail("a@b.co") as never), true);
    // Even the correct password is refused while locked.
    await assert.rejects(() => users.login("a@b.co", GOOD), /locked/i);
    now += LOCKOUT_MS + 1000;
    const result = await users.login("a@b.co", GOOD);
    assert.equal(result.user.failedAttempts, 0);
  });

  test("a disabled account cannot sign in", async () => {
    const users = svc();
    const user = await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    users.update(user.id, { disabled: true });
    await assert.rejects(() => users.login("a@b.co", GOOD), /disabled/);
  });

  test("the per-(ip,email) throttle trips and then resets", () => {
    let now = Date.parse("2026-01-01T00:00:00Z");
    const users = svc(() => now);
    for (let i = 0; i < 10; i++) assert.equal(users.throttleCheck("198.51.100.5", "a@b.co"), null);
    assert.ok((users.throttleCheck("198.51.100.5", "a@b.co") ?? 0) > 0);
    // A different email from the same address is a separate bucket.
    assert.equal(users.throttleCheck("198.51.100.5", "c@d.co"), null);
    now += 16 * 60_000;
    assert.equal(users.throttleCheck("198.51.100.5", "a@b.co"), null);
  });

  test("changing your own password requires the current one and rejects a repeat", async () => {
    const users = svc();
    const user = await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    await assert.rejects(() => users.changeOwnPassword(user.id, "not-the-password", OTHER), /not correct/);
    await assert.rejects(() => users.changeOwnPassword(user.id, GOOD, GOOD), /different/);
    const updated = await users.changeOwnPassword(user.id, GOOD, OTHER);
    assert.equal(updated.mustChangePassword, false);
    assert.equal(await verifyPassword(OTHER, updated.passwordHash), true);
  });

  test("the audit log filters by action and by actor and is newest first", async () => {
    let now = Date.parse("2026-01-01T00:00:00Z");
    const users = svc(() => now);
    await users.create({ email: "a@b.co", password: GOOD, role: "viewer" });
    await users.login("a@b.co", GOOD);
    now += 1000;
    await assert.rejects(() => users.login("a@b.co", "wrong-password-x1"));
    assert.equal(users.listAudit({ actor: "a@b.co" }).length, 2);
    assert.equal(users.listAudit({ action: "auth.login.failed" }).length, 1);
    const all = users.listAudit({});
    assert.ok((all[0]?.ts ?? "") >= (all[1]?.ts ?? ""));
  });
});

describe("invites", () => {
  test("the token is returned once, stored only as a hash, and opens the invite", async () => {
    const users = svc();
    const admin = await users.create({ email: "admin@b.co", password: GOOD, role: "admin" });
    const { invite, token } = users.createInvite({ email: "New@B.co", role: "partner", createdBy: admin });
    assert.equal(invite.email, "new@b.co");
    assert.equal(invite.tokenHash.length, 64);
    assert.equal(JSON.stringify(invite).includes(token), false);
    assert.equal(users.openInvite(token).id, invite.id);
    assert.equal(users.inviteStatus(invite), "pending");
  });

  test("accepting creates the user with the invited roles and signs them in", async () => {
    const users = svc();
    const admin = await users.create({ email: "admin@b.co", password: GOOD, role: "admin" });
    const { token } = users.createInvite({
      email: "new@b.co",
      name: "New Person",
      role: "viewer",
      productRoles: { "call-analysis": "evaluator" },
      createdBy: admin,
    });
    const result = await users.acceptInvite(token, OTHER, { ip: "203.0.113.9" });
    assert.equal(result.user.email, "new@b.co");
    assert.equal(result.user.name, "New Person");
    assert.equal(result.user.mustChangePassword, false);
    assert.deepEqual(result.user.productRoles, { "call-analysis": "evaluator" });
    assert.equal(users.verify(result.token)?.id, result.user.id);
    assert.equal(users.listAudit({ action: "invite.accepted" }).length, 1);
  });

  test("an invite is single-use", async () => {
    const users = svc();
    const admin = await users.create({ email: "admin@b.co", password: GOOD, role: "admin" });
    const { token } = users.createInvite({ email: "new@b.co", role: "viewer", createdBy: admin });
    await users.acceptInvite(token, OTHER);
    assert.throws(() => users.openInvite(token), /already been used/);
  });

  test("expired and revoked invites are refused with distinct reasons", async () => {
    let now = Date.parse("2026-01-01T00:00:00Z");
    const users = svc(() => now);
    const admin = await users.create({ email: "admin@b.co", password: GOOD, role: "admin" });
    const expiring = users.createInvite({
      email: "a@b.co",
      role: "viewer",
      expiresInDays: 1,
      createdBy: admin,
    });
    const revoked = users.createInvite({ email: "c@d.co", role: "viewer", createdBy: admin });
    users.revokeInvite(revoked.invite.id);
    assert.throws(() => users.openInvite(revoked.token), /revoked/);
    now += 2 * 86_400_000;
    assert.throws(() => users.openInvite(expiring.token), /expired/);
    assert.equal(users.inviteStatus(users.invites.get(expiring.invite.id) as never), "expired");
  });

  test("an unknown token is a 404, and a weak password does not consume the invite", async () => {
    const users = svc();
    const admin = await users.create({ email: "admin@b.co", password: GOOD, role: "admin" });
    const { token } = users.createInvite({ email: "new@b.co", role: "viewer", createdBy: admin });
    assert.throws(() => users.openInvite("no-such-token"), /not found/i);
    await assert.rejects(() => users.acceptInvite(token, "weak"), /at least 12/);
    assert.equal(users.openInvite(token).email, "new@b.co", "the invite must still be usable");
  });

  test("expiry is clamped to a sane window", async () => {
    const users = svc();
    const admin = await users.create({ email: "admin@b.co", password: GOOD, role: "admin" });
    const long = users.createInvite({
      email: "a@b.co",
      role: "viewer",
      expiresInDays: 9999,
      createdBy: admin,
    });
    const short = users.createInvite({
      email: "c@d.co",
      role: "viewer",
      expiresInDays: -5,
      createdBy: admin,
    });
    const days = (iso: string) => (Date.parse(iso) - Date.now()) / 86_400_000;
    assert.ok(days(long.invite.expiresAt) <= 90.1);
    assert.ok(days(short.invite.expiresAt) >= 0.9);
  });

  test("you cannot invite someone who already has an account", async () => {
    const users = svc();
    const admin = await users.create({ email: "admin@b.co", password: GOOD, role: "admin" });
    assert.throws(
      () => users.createInvite({ email: "admin@b.co", role: "viewer", createdBy: admin }),
      /already exists/,
    );
  });
});

describe("bootstrap", () => {
  test("creates the first administrator once and never again", async () => {
    const users = svc();
    const first = await users.bootstrap("owner@example.com", GOOD);
    assert.equal(first?.role, "admin");
    assert.equal(first?.mustChangePassword, true);
    assert.equal(await users.bootstrap("someone-else@example.com", OTHER), null);
    assert.equal(users.count, 1);
  });

  test("does nothing without both variables", async () => {
    assert.equal(await svc().bootstrap("", GOOD), null);
    assert.equal(await svc().bootstrap("owner@example.com", ""), null);
  });
});
