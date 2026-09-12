/**
 * OpenAPI 3.1 document for the Showroom API — the single source of truth for `/api/v1`.
 *
 * Authored before the routes (STANDARDS §2): `operationSchemas()` turns the operations below into
 * the request validators the router uses, and the contract tests fail the build if a route exists
 * that is not described here, or if a response stops matching its declared schema.
 *
 * Authentication is a signed HttpOnly session cookie issued by `POST /api/v1/auth/login`. The
 * cookie scheme is added to the built document below because it is specific to this product.
 */
import {
  BrandingSchema,
  buildOpenApi,
  jsonBody,
  jsonResponse,
  pageSchema,
  standardResponses,
} from "../vendor/arag-platform/src/index.ts";
import { ROLES, SURFACES } from "./permissions.ts";

export const VERSION = "0.1.0";
export const SESSION_COOKIE = "showroom_session";

const Role = { type: "string", enum: [...ROLES], description: "Access level." };
const Surface = { type: "string", enum: [...SURFACES] };
const ProductRoles = {
  type: "object",
  description: "Per-product role overrides, keyed by product slug. Additive to the global role.",
  additionalProperties: Role,
};

const User = {
  type: "object",
  required: ["id", "email", "name", "role", "productRoles", "mustChangePassword", "disabled", "createdAt"],
  properties: {
    id: { type: "string" },
    email: { type: "string", format: "email" },
    name: { type: "string" },
    role: Role,
    productRoles: ProductRoles,
    mustChangePassword: { type: "boolean" },
    disabled: { type: "boolean" },
    locked: { type: "boolean", description: "Temporarily locked after repeated failed sign-ins." },
    lastLoginAt: { type: ["string", "null"], format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
  },
};

const UserCreate = {
  type: "object",
  required: ["email", "role"],
  properties: {
    email: { type: "string", format: "email", maxLength: 254 },
    name: { type: "string", maxLength: 120 },
    role: Role,
    productRoles: ProductRoles,
    password: {
      type: "string",
      minLength: 12,
      maxLength: 256,
      description: "Optional; a temporary password is generated and returned when omitted.",
    },
  },
  additionalProperties: false,
};

const UserPatch = {
  type: "object",
  properties: {
    name: { type: "string", maxLength: 120 },
    role: Role,
    productRoles: ProductRoles,
    disabled: { type: "boolean" },
  },
  additionalProperties: false,
};

const Invite = {
  type: "object",
  required: ["id", "email", "role", "productRoles", "expiresAt", "status", "createdBy", "createdAt"],
  properties: {
    id: { type: "string" },
    email: { type: "string", format: "email" },
    name: { type: "string" },
    role: Role,
    productRoles: ProductRoles,
    expiresAt: { type: "string", format: "date-time" },
    status: { type: "string", enum: ["pending", "accepted", "expired", "revoked"] },
    acceptedAt: { type: ["string", "null"], format: "date-time" },
    createdBy: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    inviteUrl: { type: "string", description: "One-time link. Returned only when the invite is created." },
  },
};

const InviteCreate = {
  type: "object",
  required: ["email", "role"],
  properties: {
    email: { type: "string", format: "email", maxLength: 254 },
    name: { type: "string", maxLength: 120 },
    role: Role,
    productRoles: ProductRoles,
    expiresInDays: { type: "integer", minimum: 1, maximum: 90, default: 7 },
  },
  additionalProperties: false,
};

const InviteOffer = {
  type: "object",
  required: ["email", "role", "expiresAt"],
  properties: {
    email: { type: "string", format: "email" },
    name: { type: "string" },
    role: Role,
    productRoles: ProductRoles,
    expiresAt: { type: "string", format: "date-time" },
  },
};

const ProductAccess = {
  type: "object",
  required: ["slug", "title", "surfaces"],
  properties: {
    slug: { type: "string" },
    title: { type: "string" },
    surfaces: { type: "array", items: Surface },
  },
};

const Session = {
  type: "object",
  required: ["user", "siteAdmin", "products", "expiresAt"],
  properties: {
    user: { $ref: "#/components/schemas/User" },
    siteAdmin: { type: "boolean" },
    products: { type: "array", items: ProductAccess },
    expiresAt: { type: ["string", "null"], format: "date-time" },
  },
};

const ProductSummary = {
  type: "object",
  required: ["slug", "title", "workingTitle", "surfaces", "hasContent"],
  properties: {
    slug: { type: "string" },
    title: {
      type: "string",
      description: "Recommended product name when one exists, else the working title.",
    },
    workingTitle: { type: "string" },
    recommendedName: { type: "string" },
    oneLiner: { type: "string" },
    summary: { type: "string" },
    accent: { type: "string" },
    surfaces: { type: "array", items: Surface, description: "Surfaces the calling user may open." },
    accessLabel: { type: "string" },
    hasContent: { type: "boolean" },
    syncedAt: { type: ["string", "null"], format: "date-time" },
    commit: { type: ["string", "null"] },
    thumbnail: { type: ["string", "null"], description: "Asset path of the showcase thumbnail." },
    video: { type: ["string", "null"] },
    demoUrl: { type: ["string", "null"], description: "Present only with the `demo` surface." },
    adminUrl: { type: ["string", "null"], description: "Present only with the `admin` surface." },
    adminToken: {
      type: ["string", "null"],
      description:
        "The product's ADMIN_TOKEN. Present only with the `admin` surface and only when configured.",
    },
    adminTokenEnv: { type: ["string", "null"] },
    docsUrl: { type: ["string", "null"] },
  },
};

const ContentNode = {
  type: "object",
  required: ["path", "title", "section", "surface"],
  properties: {
    path: { type: "string" },
    title: { type: "string" },
    section: { type: "string" },
    surface: Surface,
    size: { type: "integer" },
  },
};

const ContentTree = {
  type: "object",
  required: ["slug", "sections"],
  properties: {
    slug: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        required: ["section", "items"],
        properties: {
          section: { type: "string" },
          items: { type: "array", items: ContentNode },
        },
      },
    },
  },
};

const ContentPage = {
  type: "object",
  required: ["slug", "path", "title", "html", "surface"],
  properties: {
    slug: { type: "string" },
    path: { type: "string" },
    title: { type: "string" },
    section: { type: "string" },
    surface: Surface,
    html: { type: "string" },
    raw: { type: "string" },
    hasMermaid: { type: "boolean" },
    sourcePath: { type: "string", description: "Path of the file in the originating product repo." },
    headings: {
      type: "array",
      items: {
        type: "object",
        required: ["level", "text", "id"],
        properties: { level: { type: "integer" }, text: { type: "string" }, id: { type: "string" } },
      },
    },
  },
};

const AuditEntry = {
  type: "object",
  required: ["id", "ts", "action"],
  properties: {
    id: { type: "string" },
    ts: { type: "string", format: "date-time" },
    action: { type: "string" },
    actorId: { type: ["string", "null"] },
    actorEmail: { type: ["string", "null"] },
    target: { type: ["string", "null"] },
    ip: { type: ["string", "null"] },
    detail: { type: "object", additionalProperties: true },
  },
};

const AccessRequest = {
  type: "object",
  required: ["id", "name", "email", "status", "createdAt"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    email: { type: "string", format: "email" },
    organisation: { type: "string" },
    message: { type: "string" },
    products: { type: "array", items: { type: "string" } },
    partnerType: { type: "string", enum: ["isv", "si", "reseller", "other"] },
    aragAccount: { type: "string", enum: ["yes", "no", "unknown"] },
    status: { type: "string", enum: ["new", "invited", "dismissed"] },
    handledBy: { type: ["string", "null"] },
    handledAt: { type: ["string", "null"], format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
  },
};

const cookieAuth = [{ SessionCookie: [] }];

const slugParam = {
  name: "slug",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,48}$" },
};
const pathParam = {
  name: "path",
  in: "path",
  required: true,
  schema: { type: "string", minLength: 1, maxLength: 300 },
  description: "Content path relative to the product's content root, e.g. `docs/business/overview.md`.",
};
const idParam = { name: "id", in: "path", required: true, schema: { type: "string", minLength: 1 } };
const tokenParam = {
  name: "token",
  in: "path",
  required: true,
  schema: { type: "string", minLength: 16, maxLength: 200 },
};

const noContent = { description: "No content" };

const doc = buildOpenApi({
  info: {
    title: "ARAG Showroom API",
    version: VERSION,
    description:
      "Invite-only portal for the three ARAG products. Sign in, receive a role, and browse each product's positioning, documentation, enablement material, showcase recording and — with the right role — its live demo and admin panel.",
  },
  tags: [
    { name: "auth", description: "Sign in, sign out, session and password" },
    { name: "invites", description: "Invitations (creation is admin-only; acceptance is public)" },
    { name: "users", description: "User administration" },
    { name: "products", description: "Product catalogue and synced content" },
    { name: "access", description: "Access requests from the public site" },
    { name: "audit", description: "Audit log" },
    { name: "admin", description: "Operator endpoints" },
    { name: "system", description: "Branding and service metadata" },
  ],
  schemas: {
    Role,
    User,
    UserCreate,
    UserPatch,
    UserPage: pageSchema("#/components/schemas/User"),
    Invite,
    InviteCreate,
    InviteOffer,
    Session,
    ProductSummary,
    ContentNode,
    ContentTree,
    ContentPage,
    AuditEntry,
    AccessRequest,
    Branding: BrandingSchema,
  },
  paths: {
    "/api/v1/branding": {
      get: {
        operationId: "getBranding",
        tags: ["system"],
        summary: "Effective white-label branding for this deployment",
        description:
          "BRAND_* environment variables. Every accelerator in this programme — and this portal — is rebrandable by configuration rather than by forking.",
        responses: { 200: jsonResponse({ $ref: "#/components/schemas/Branding" }), ...standardResponses },
      },
    },
    "/api/v1/auth/login": {
      post: {
        operationId: "login",
        tags: ["auth"],
        summary: "Sign in and receive a session cookie",
        requestBody: jsonBody({
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", maxLength: 254 },
            password: { type: "string", minLength: 1, maxLength: 256 },
          },
          additionalProperties: false,
        }),
        responses: {
          200: jsonResponse({ $ref: "#/components/schemas/Session" }, "Signed in"),
          ...standardResponses,
          423: {
            description: "Account locked after repeated failures",
            content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
          },
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        operationId: "logout",
        tags: ["auth"],
        summary: "Clear the session cookie",
        security: cookieAuth,
        responses: { 204: noContent, ...standardResponses },
      },
    },
    "/api/v1/auth/me": {
      get: {
        operationId: "getSession",
        tags: ["auth"],
        summary: "The signed-in user and their per-product access",
        security: cookieAuth,
        responses: {
          200: jsonResponse({ $ref: "#/components/schemas/Session" }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/auth/password": {
      post: {
        operationId: "changePassword",
        tags: ["auth"],
        summary: "Change your own password (all other sessions are invalidated)",
        security: cookieAuth,
        requestBody: jsonBody({
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string", minLength: 1, maxLength: 256 },
            newPassword: { type: "string", minLength: 12, maxLength: 256 },
          },
          additionalProperties: false,
        }),
        responses: {
          200: jsonResponse({ $ref: "#/components/schemas/Session" }, "Password changed"),
          ...standardResponses,
        },
      },
    },
    "/api/v1/invites": {
      get: {
        operationId: "listInvites",
        tags: ["invites"],
        summary: "List invitations",
        security: cookieAuth,
        responses: {
          200: jsonResponse(pageSchema("#/components/schemas/Invite")),
          ...standardResponses,
        },
      },
      post: {
        operationId: "createInvite",
        tags: ["invites"],
        summary: "Create a one-time invitation link",
        security: cookieAuth,
        requestBody: jsonBody({ $ref: "#/components/schemas/InviteCreate" }),
        responses: {
          201: jsonResponse({ $ref: "#/components/schemas/Invite" }, "Created — `inviteUrl` is shown once"),
          ...standardResponses,
          409: {
            description: "A user with that email already exists",
            content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
          },
        },
      },
    },
    "/api/v1/invites/{token}": {
      get: {
        operationId: "getInvite",
        tags: ["invites"],
        summary: "Look up a pending invitation by its one-time token",
        parameters: [tokenParam],
        responses: {
          200: jsonResponse({ $ref: "#/components/schemas/InviteOffer" }),
          ...standardResponses,
          409: {
            description: "Already used, revoked or expired",
            content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
          },
        },
      },
    },
    "/api/v1/invites/{token}/accept": {
      post: {
        operationId: "acceptInvite",
        tags: ["invites"],
        summary: "Accept an invitation by choosing a password",
        parameters: [tokenParam],
        requestBody: jsonBody({
          type: "object",
          required: ["password"],
          properties: {
            password: { type: "string", minLength: 12, maxLength: 256 },
            name: { type: "string", maxLength: 120 },
          },
          additionalProperties: false,
        }),
        responses: {
          201: jsonResponse({ $ref: "#/components/schemas/Session" }, "Account created and signed in"),
          ...standardResponses,
          409: {
            description: "Already used, revoked or expired",
            content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
          },
        },
      },
    },
    "/api/v1/invites/{id}/revoke": {
      post: {
        operationId: "revokeInvite",
        tags: ["invites"],
        summary: "Revoke a pending invitation",
        security: cookieAuth,
        parameters: [idParam],
        responses: {
          200: jsonResponse({ $ref: "#/components/schemas/Invite" }),
          ...standardResponses,
          409: {
            description: "Already accepted",
            content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
          },
        },
      },
    },
    "/api/v1/access-requests": {
      get: {
        operationId: "listAccessRequests",
        tags: ["access"],
        summary: "Access requests submitted from the public site",
        security: cookieAuth,
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["new", "invited", "dismissed"] } },
        ],
        responses: {
          200: jsonResponse(pageSchema("#/components/schemas/AccessRequest")),
          ...standardResponses,
        },
      },
      post: {
        operationId: "createAccessRequest",
        tags: ["access"],
        summary: "Request partner access — asks an administrator for an invitation (public)",
        requestBody: jsonBody({
          type: "object",
          required: ["name", "email"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            email: { type: "string", maxLength: 254 },
            organisation: { type: "string", maxLength: 160 },
            message: { type: "string", maxLength: 2000 },
            products: { type: "array", maxItems: 20, items: { type: "string", maxLength: 60 } },
            partnerType: { type: "string", enum: ["isv", "si", "reseller", "other"] },
            aragAccount: { type: "string", enum: ["yes", "no", "unknown"] },
          },
          additionalProperties: false,
        }),
        responses: {
          201: jsonResponse(
            { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
            "Recorded",
          ),
          ...standardResponses,
        },
      },
    },
    "/api/v1/access-requests/{id}/resolve": {
      post: {
        operationId: "resolveAccessRequest",
        tags: ["access"],
        summary: "Mark an access request as invited or dismissed",
        security: cookieAuth,
        parameters: [idParam],
        requestBody: jsonBody({
          type: "object",
          required: ["status"],
          properties: { status: { type: "string", enum: ["invited", "dismissed"] } },
          additionalProperties: false,
        }),
        responses: {
          200: jsonResponse({ $ref: "#/components/schemas/AccessRequest" }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/users": {
      get: {
        operationId: "listUsers",
        tags: ["users"],
        summary: "List users",
        security: cookieAuth,
        responses: {
          200: jsonResponse(pageSchema("#/components/schemas/User")),
          ...standardResponses,
        },
      },
      post: {
        operationId: "createUser",
        tags: ["users"],
        summary: "Create a user directly (bypassing the invitation flow)",
        security: cookieAuth,
        requestBody: jsonBody({ $ref: "#/components/schemas/UserCreate" }),
        responses: {
          201: jsonResponse(
            {
              type: "object",
              required: ["user"],
              properties: {
                user: { $ref: "#/components/schemas/User" },
                temporaryPassword: {
                  type: "string",
                  description: "Returned once when no password was supplied.",
                },
              },
            },
            "Created",
          ),
          ...standardResponses,
          409: {
            description: "Email already in use",
            content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
          },
        },
      },
    },
    "/api/v1/users/{id}": {
      get: {
        operationId: "getUser",
        tags: ["users"],
        summary: "Read one user",
        security: cookieAuth,
        parameters: [idParam],
        responses: { 200: jsonResponse({ $ref: "#/components/schemas/User" }), ...standardResponses },
      },
      patch: {
        operationId: "updateUser",
        tags: ["users"],
        summary: "Change a user's roles, name or enabled state",
        security: cookieAuth,
        parameters: [idParam],
        requestBody: jsonBody({ $ref: "#/components/schemas/UserPatch" }),
        responses: { 200: jsonResponse({ $ref: "#/components/schemas/User" }), ...standardResponses },
      },
      delete: {
        operationId: "deleteUser",
        tags: ["users"],
        summary: "Remove a user",
        security: cookieAuth,
        parameters: [idParam],
        responses: {
          204: noContent,
          ...standardResponses,
          409: {
            description: "Would remove the last administrator",
            content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
          },
        },
      },
    },
    "/api/v1/users/{id}/password": {
      post: {
        operationId: "resetUserPassword",
        tags: ["users"],
        summary: "Reset a user's password to a generated temporary one",
        security: cookieAuth,
        parameters: [idParam],
        responses: {
          200: jsonResponse(
            {
              type: "object",
              required: ["user", "temporaryPassword"],
              properties: {
                user: { $ref: "#/components/schemas/User" },
                temporaryPassword: { type: "string" },
              },
            },
            "Password reset — the temporary password is shown once",
          ),
          ...standardResponses,
        },
      },
    },
    "/api/v1/products": {
      get: {
        operationId: "listProducts",
        tags: ["products"],
        summary: "The product catalogue with the surfaces the caller may open",
        security: cookieAuth,
        responses: {
          200: jsonResponse(pageSchema("#/components/schemas/ProductSummary")),
          ...standardResponses,
        },
      },
    },
    "/api/v1/products/{slug}": {
      get: {
        operationId: "getProduct",
        tags: ["products"],
        summary: "One product",
        security: cookieAuth,
        parameters: [slugParam],
        responses: {
          200: jsonResponse({ $ref: "#/components/schemas/ProductSummary" }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/products/{slug}/content": {
      get: {
        operationId: "getProductContent",
        tags: ["products"],
        summary: "The content tree, filtered to the caller's surfaces",
        security: cookieAuth,
        parameters: [slugParam],
        responses: {
          200: jsonResponse({ $ref: "#/components/schemas/ContentTree" }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/products/{slug}/content/{path}": {
      get: {
        operationId: "getProductPage",
        tags: ["products"],
        summary: "One content page, rendered to sanitised HTML",
        security: cookieAuth,
        parameters: [slugParam, pathParam],
        responses: {
          200: jsonResponse({ $ref: "#/components/schemas/ContentPage" }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/products/{slug}/assets/{path}": {
      get: {
        operationId: "getProductAsset",
        tags: ["products"],
        summary: "A screenshot or the showcase recording",
        security: cookieAuth,
        parameters: [slugParam, pathParam],
        responses: {
          200: {
            description: "The asset",
            content: {
              "image/png": { schema: { type: "string", format: "binary" } },
              "video/webm": { schema: { type: "string", format: "binary" } },
            },
          },
          ...standardResponses,
        },
      },
    },
    "/api/v1/audit": {
      get: {
        operationId: "listAudit",
        tags: ["audit"],
        summary: "Sign-ins and administrative actions",
        security: cookieAuth,
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
          { name: "action", in: "query", schema: { type: "string", maxLength: 60 } },
          { name: "actor", in: "query", schema: { type: "string", maxLength: 254 } },
        ],
        responses: {
          200: jsonResponse(pageSchema("#/components/schemas/AuditEntry")),
          ...standardResponses,
        },
      },
    },
    "/api/v1/admin/health": {
      get: {
        operationId: "adminHealth",
        tags: ["admin"],
        summary: "Service health, content freshness and store sizes",
        security: cookieAuth,
        responses: {
          200: jsonResponse({
            type: "object",
            required: ["ok", "version"],
            properties: {
              ok: { type: "boolean" },
              version: { type: "string" },
              uptimeSec: { type: "number" },
              users: { type: "integer" },
              invites: { type: "integer" },
              products: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    slug: { type: "string" },
                    hasContent: { type: "boolean" },
                    pages: { type: "integer" },
                    syncedAt: { type: ["string", "null"] },
                    commit: { type: ["string", "null"] },
                  },
                },
              },
              store: { type: "object", additionalProperties: true },
            },
          }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/admin/config": {
      get: {
        operationId: "adminConfig",
        tags: ["admin"],
        summary: "Redacted effective configuration",
        security: cookieAuth,
        responses: {
          200: jsonResponse({ type: "object", additionalProperties: true }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/admin/usage": {
      get: {
        operationId: "adminUsage",
        tags: ["admin"],
        summary: "Request counts, sign-ins and page views since boot",
        security: cookieAuth,
        responses: {
          200: jsonResponse({
            type: "object",
            required: ["startedAt", "requests"],
            properties: {
              startedAt: { type: "number" },
              uptimeSec: { type: "number" },
              requests: { type: "integer" },
              pageViews: { type: "integer" },
              logins: { type: "integer" },
              failedLogins: { type: "integer" },
              deniedRequests: { type: "integer" },
            },
          }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/admin/logs": {
      get: {
        operationId: "adminLogs",
        tags: ["admin"],
        summary: "Recent structured log records",
        security: cookieAuth,
        parameters: [
          {
            name: "level",
            in: "query",
            schema: { type: "string", enum: ["debug", "info", "warn", "error"] },
          },
          { name: "contains", in: "query", schema: { type: "string", maxLength: 200 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
        ],
        responses: {
          200: jsonResponse(pageSchema("#/components/schemas/LogRecord")),
          ...standardResponses,
        },
      },
    },
  },
});

// The showroom authenticates with its own signed session cookie rather than the platform's
// ADMIN_TOKEN, so the scheme is registered here instead of in the shared builder.
(doc.components as { securitySchemes: Record<string, unknown> }).securitySchemes.SessionCookie = {
  type: "apiKey",
  in: "cookie",
  name: SESSION_COOKIE,
  description: "HttpOnly session cookie issued by POST /api/v1/auth/login.",
};

export const openapi = doc;
