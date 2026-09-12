/**
 * Access requests from the public site.
 *
 * Someone who has no account fills in the form on `/request-access`; the request is stored here and
 * shown to administrators on the invitations page, where one click turns it into a real invitation.
 * Nothing is emailed, nothing leaves the deployment, and no third party is involved — the store is
 * the whole system. Requests are capped so a flood cannot fill the volume, and the same email can
 * only have one open request at a time.
 */
import { randomUUID } from "node:crypto";
import type { Collection, Store, StoredDoc } from "../../vendor/arag-platform/src/index.ts";
import { badRequest, notFound } from "../../vendor/arag-platform/src/index.ts";
import { normaliseEmail } from "./users.ts";

export type AccessRequestStatus = "new" | "invited" | "dismissed";
export const PARTNER_TYPES = ["isv", "si", "reseller", "other"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  isv: "ISV — we build software products",
  si: "Systems integrator / consultancy",
  reseller: "Reseller / distributor",
  other: "Something else",
};

export interface AccessRequestDoc extends StoredDoc {
  id: string;
  name: string;
  email: string;
  organisation: string;
  message: string;
  products: string[];
  partnerType: PartnerType;
  /** Does the organisation already hold a Progress Agentic RAG account? */
  aragAccount: "yes" | "no" | "unknown";
  status: AccessRequestStatus;
  ip: string | null;
  handledBy: string | null;
  handledAt: string | null;
}

export const MAX_MESSAGE_LENGTH = 2000;

export class AccessRequestsService {
  readonly requests: Collection<AccessRequestDoc>;

  constructor(store: Store) {
    this.requests = store.collection<AccessRequestDoc>("access-requests", { cap: 1000 });
  }

  list(status?: AccessRequestStatus): AccessRequestDoc[] {
    return this.requests.list({
      filter: (r) => !status || r.status === status,
      sort: (a, b) => b.createdAt.localeCompare(a.createdAt),
    });
  }

  get openCount(): number {
    return this.list("new").length;
  }

  submit(input: {
    name: string;
    email: string;
    organisation?: string;
    message?: string;
    products?: string[];
    partnerType?: string;
    aragAccount?: string;
    ip?: string | null;
    /** Slugs that actually exist, so a crafted form cannot inject arbitrary strings. */
    knownSlugs: string[];
  }): AccessRequestDoc {
    const email = normaliseEmail(input.email);
    const name = String(input.name ?? "").trim();
    if (!name) throw badRequest("Please tell us your name.");
    if (name.length > 120) throw badRequest("That name is too long.");
    if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email) || email.length > 254)
      throw badRequest("Please give a valid email address.");
    const message = String(input.message ?? "")
      .trim()
      .slice(0, MAX_MESSAGE_LENGTH);
    const organisation = String(input.organisation ?? "")
      .trim()
      .slice(0, 160);
    const products = (input.products ?? []).filter((p) => input.knownSlugs.includes(p));
    const partnerType = (PARTNER_TYPES as readonly string[]).includes(input.partnerType ?? "")
      ? (input.partnerType as PartnerType)
      : "other";
    const aragAccount = input.aragAccount === "yes" ? "yes" : input.aragAccount === "no" ? "no" : "unknown";
    const existing = this.requests.list({ filter: (r) => r.email === email && r.status === "new" })[0];
    if (existing) {
      // Re-submitting refreshes the details rather than piling up duplicates for the admin to sift.
      return this.requests.update(existing.id, {
        name,
        organisation,
        message,
        products,
        partnerType,
        aragAccount,
      }) as AccessRequestDoc;
    }
    return this.requests.put({
      id: randomUUID(),
      name,
      email,
      organisation,
      message,
      products,
      partnerType,
      aragAccount,
      status: "new",
      ip: input.ip ?? null,
      handledBy: null,
      handledAt: null,
    });
  }

  resolve(id: string, status: Exclude<AccessRequestStatus, "new">, handledBy: string): AccessRequestDoc {
    const request = this.requests.get(id);
    if (!request) throw notFound("Access request");
    return this.requests.update(id, {
      status,
      handledBy,
      handledAt: new Date().toISOString(),
    }) as AccessRequestDoc;
  }

  /** Mark any open request for this email as invited (called when an invite is created). */
  markInvited(email: string, handledBy: string): void {
    const normalised = normaliseEmail(email);
    for (const request of this.requests.list({
      filter: (r) => r.email === normalised && r.status === "new",
    })) {
      this.resolve(request.id, "invited", handledBy);
    }
  }
}
