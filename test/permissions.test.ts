/** Unit tests for the role/surface rules — the one place that decides who sees what. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  accessLabel,
  can,
  isRole,
  isSiteAdmin,
  type Principal,
  ROLE_DESCRIPTIONS,
  ROLES,
  SURFACES,
  surfaceForContentPath,
  surfacesFor,
  surfacesForRole,
} from "../src/permissions.ts";

const p = (role: Principal["role"], productRoles: Principal["productRoles"] = {}): Principal => ({
  role,
  productRoles,
});

describe("roles", () => {
  test("every role has a description", () => {
    for (const role of ROLES) assert.equal(typeof ROLE_DESCRIPTIONS[role], "string");
  });

  test("isRole accepts only the five roles", () => {
    for (const role of ROLES) assert.equal(isRole(role), true);
    for (const bad of ["", "root", "Admin", null, undefined, 1, {}]) assert.equal(isRole(bad), false);
  });

  test("viewer sees marketing, docs and the showcase — and nothing else", () => {
    assert.deepEqual(surfacesForRole("viewer"), ["marketing", "docs", "showcase"]);
  });

  test("evaluator adds the demo and enablement but not admin or partner material", () => {
    const s = surfacesForRole("evaluator");
    assert.ok(s.includes("demo") && s.includes("enablement"));
    assert.ok(!s.includes("admin"));
    assert.ok(!s.includes("partner-pitch"));
    assert.ok(!s.includes("enablement-solutions"));
  });

  test("operator adds admin, partner adds the pitch and the solutions", () => {
    assert.ok(surfacesForRole("operator").includes("admin"));
    assert.ok(!surfacesForRole("operator").includes("partner-pitch"));
    assert.ok(surfacesForRole("partner").includes("partner-pitch"));
    assert.ok(surfacesForRole("partner").includes("enablement-solutions"));
    assert.ok(!surfacesForRole("partner").includes("admin"));
  });

  test("admin sees every surface", () => {
    assert.deepEqual(surfacesForRole("admin"), [...SURFACES]);
  });

  test("surfacesForRole returns a copy that cannot corrupt the table", () => {
    const first = surfacesForRole("viewer");
    first.push("admin");
    assert.deepEqual(surfacesForRole("viewer"), ["marketing", "docs", "showcase"]);
  });
});

describe("per-product roles", () => {
  test("a product role adds access for that product only", () => {
    const principal = p("viewer", { "call-analysis": "evaluator" });
    assert.equal(can(principal, "call-analysis", "demo"), true);
    assert.equal(can(principal, "doc-processing", "demo"), false);
    assert.equal(can(principal, "doc-processing", "docs"), true);
  });

  test("roles are additive: a lower product role never removes global access", () => {
    const principal = p("operator", { "call-analysis": "viewer" });
    assert.equal(can(principal, "call-analysis", "admin"), true);
  });

  test("the union can exceed any single named role", () => {
    const principal = p("operator", { voicebridge: "partner" });
    const surfaces = surfacesFor(principal, "voicebridge");
    assert.ok(surfaces.includes("admin") && surfaces.includes("partner-pitch"));
    assert.equal(accessLabel(principal, "voicebridge"), "admin");
    assert.equal(accessLabel(principal, "doc-processing"), "operator");
  });

  test("accessLabel names an exact match and falls back to custom", () => {
    assert.equal(accessLabel(p("viewer"), "x"), "viewer");
    assert.equal(accessLabel(p("partner"), "x"), "partner");
    assert.equal(accessLabel(p("viewer", { x: "operator" }), "x"), "operator");
    // partner ∪ operator is not one of the named roles but is also not everything.
    const mixed = p("partner", { x: "operator" });
    assert.equal(surfacesFor(mixed, "x").length, SURFACES.length);
    assert.equal(accessLabel(mixed, "x"), "admin");
  });

  test("surfaces come back in the canonical order regardless of how they were granted", () => {
    const surfaces = surfacesFor(p("viewer", { x: "partner" }), "x");
    assert.deepEqual(
      surfaces,
      SURFACES.filter((s) => surfaces.includes(s)),
    );
  });
});

describe("site administration", () => {
  test("only the global admin role administers the site", () => {
    assert.equal(isSiteAdmin(p("admin")), true);
    for (const role of ["viewer", "evaluator", "operator", "partner"] as const)
      assert.equal(isSiteAdmin(p(role)), false);
  });

  test("a per-product admin role is not a site administrator", () => {
    assert.equal(isSiteAdmin(p("viewer", { "doc-processing": "admin" })), false);
  });
});

describe("content path classification", () => {
  test("enablement solutions are separated from the rest of enablement", () => {
    assert.equal(surfaceForContentPath("enablement/developer-track/LAB.md"), "enablement");
    assert.equal(
      surfaceForContentPath("enablement/developer-track/solutions/01-drive-the-api.md"),
      "enablement-solutions",
    );
    assert.equal(
      surfaceForContentPath("enablement/developer-track/exercises/01-drive-the-api.md"),
      "enablement",
    );
  });

  test("the partner pitch is separated from the rest of product marketing", () => {
    assert.equal(surfaceForContentPath("docs/product-marketing/partner-pitch.md"), "partner-pitch");
    assert.equal(surfaceForContentPath("docs/product-marketing/positioning.md"), "marketing");
    assert.equal(surfaceForContentPath("docs/product-marketing/launch-blog.md"), "marketing");
  });

  test("showcase material is its own surface and everything else is docs", () => {
    assert.equal(surfaceForContentPath("showcase/SCRIPT.md"), "showcase");
    assert.equal(surfaceForContentPath("showcase/out/01-home.png"), "showcase");
    assert.equal(surfaceForContentPath("docs/architecture/architecture.md"), "docs");
    assert.equal(surfaceForContentPath("README.md"), "docs");
  });

  test("classification is case-insensitive and tolerates a leading slash", () => {
    assert.equal(surfaceForContentPath("/Enablement/Developer-Track/Solutions/a.md"), "enablement-solutions");
  });
});
