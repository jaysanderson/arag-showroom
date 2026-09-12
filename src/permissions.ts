/**
 * Roles and surfaces.
 *
 * The showroom's only job is to decide *what a signed-in person may see about a product*. That
 * question is answered here, in one place, as pure data — no HTTP, no storage — so the rules can be
 * unit-tested exhaustively and so that a route can never invent its own interpretation of a role.
 *
 * A person has one **global** role plus optional **per-product** roles. The surfaces they get for a
 * product are the union of the two, which is why a global `viewer` can be an `evaluator` for Call
 * Analysis only. Managing users and invites is deliberately *not* a surface: it is a site-wide
 * capability gated on the global role being `admin`, so a per-product `admin` role never becomes a
 * back door into the user table.
 */

export const ROLES = ["viewer", "evaluator", "operator", "partner", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const SURFACES = [
  "marketing",
  "docs",
  "showcase",
  "enablement",
  "enablement-solutions",
  "partner-pitch",
  "demo",
  "admin",
] as const;
export type Surface = (typeof SURFACES)[number];

const VIEWER: Surface[] = ["marketing", "docs", "showcase"];
const EVALUATOR: Surface[] = [...VIEWER, "demo", "enablement"];

/** What each role may see about a single product. */
const ROLE_SURFACES: Record<Role, Surface[]> = {
  viewer: VIEWER,
  evaluator: EVALUATOR,
  operator: [...EVALUATOR, "admin"],
  partner: [...EVALUATOR, "partner-pitch", "enablement-solutions"],
  admin: [...SURFACES],
};

/** Human-readable description of each role, shown in the admin UI and the README roles table. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  viewer: "Positioning, marketing assets, documentation and the showcase recording.",
  evaluator: "Everything a viewer sees, plus the live demo and the enablement labs.",
  operator: "Everything an evaluator sees, plus the product admin panel and its admin token.",
  partner: "Everything an evaluator sees, plus the partner pitch and the enablement solutions.",
  admin: "Every surface of every product, plus user, invite and audit administration.",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Surfaces granted by a single role. */
export function surfacesForRole(role: Role): Surface[] {
  return [...ROLE_SURFACES[role]];
}

export interface Principal {
  /** Global role, applied to every product. */
  role: Role;
  /** Per-product overrides, keyed by product slug. Additive — they never take access away. */
  productRoles: Record<string, Role>;
}

/** Effective surfaces for one product: the union of the global role and any product role. */
export function surfacesFor(principal: Principal, slug: string): Surface[] {
  const productRole = principal.productRoles[slug];
  const set = new Set<Surface>(ROLE_SURFACES[principal.role]);
  if (productRole) for (const s of ROLE_SURFACES[productRole]) set.add(s);
  return SURFACES.filter((s) => set.has(s));
}

export function can(principal: Principal, slug: string, surface: Surface): boolean {
  return surfacesFor(principal, slug).includes(surface);
}

/** Site administration (users, invites, audit) — global role only, never a per-product role. */
export function isSiteAdmin(principal: Principal): boolean {
  return principal.role === "admin";
}

/**
 * A label for the access a principal has to one product. When the union of the global and the
 * product role happens to match a named role exactly we use that name; otherwise we say "custom"
 * rather than pretend a combination is one of the five roles.
 */
export function accessLabel(principal: Principal, slug: string): Role | "custom" {
  const union = surfacesFor(principal, slug);
  for (const role of ROLES) {
    const rs = surfacesForRole(role);
    if (rs.length === union.length && rs.every((s) => union.includes(s))) return role;
  }
  return "custom";
}

/**
 * Content-path gating. Everything under `content/<slug>/` is classified into a surface so that a
 * single rule governs the docs browser, the API and the raw asset route alike.
 */
export function surfaceForContentPath(path: string): Surface {
  const p = path.replace(/^\/+/, "").toLowerCase();
  if (p.startsWith("enablement/")) {
    return /(^|\/)solutions\//.test(p) ? "enablement-solutions" : "enablement";
  }
  if (p.startsWith("showcase/")) return "showcase";
  if (p.startsWith("docs/product-marketing/partner-pitch")) return "partner-pitch";
  if (p.startsWith("docs/product-marketing/")) return "marketing";
  return "docs";
}
