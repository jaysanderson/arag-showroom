# Shared brief — marketing asset pass (read this first)

Working directory: `/Users/jsanders/Claude/os-erp-projects/`.
Write **only** under `marketing/`. **Never edit a product repo.**

## Audience (DECISIONS D-25, D-26)

Two levels, in this order:

1. **Primary reader: Progress Software** — the vendor of Progress Agentic RAG (ARAG). The proposal
   to Progress is an **Agentic RAG partner-accelerator programme**: three open-source, production-quality
   reference products that Progress's partner network can take to market, accelerating ARAG adoption
   and Knowledge Box provisioning.
2. **Secondary reader: Progress's ISV / partner network** — they **white-label**, **extend**, or use the
   products as **blueprints to build their own** on ARAG, and take the use cases to market through their
   existing customer reach.

Rules:
- **Never name an individual partner.** The programme is repeatable across all ISVs (D-26).
- No go-to-market plumbing: no SEO, no pricing pages, no signup funnels, no analytics.
- Investor-grade precision and polish. Every number must be traceable to a repo file, `STATUS.md`,
  or a `research/*.md` citation. **Where a number is not verifiable, say so in the text.**
- Frame commercial value as **partner reach × use cases** and **ARAG contract value influenced**,
  not standalone product ARR (research README takeaway #7).

## Verified facts you may use (do not invent others)

### Platform
- `arag-platform` v0.1.5 — shared ARAG REST client, deterministic mock ARAG server, dependency-free
  HTTP toolkit, OpenAPI 3.1 builders + JSON-Schema validator, JSON store + job manager, UI kit,
  `STANDARDS.md`, product template. **37 tests, 95.9 % line coverage** (`STATUS.md`, 2026-09-12 11:40).
- Live platform smoke against the sandbox KB: **18/19 steps pass** (upload → PROCESSED in 20 s, find,
  ask with citations, `answer_json_schema` + `full_resource` extraction returning exact invoice fields,
  stored search-configuration round-trip, labelsets, tasks, schema, cleanup). `/predict/remi` returned
  HTTP 500 on one short context — documented as best-effort. (`STATUS.md`, 2026-09-12 12:50.)
- Apache-2.0; **zero runtime dependencies** (Node ≥ 22.18 runs the TypeScript sources directly);
  RFC 9457 problem+json; OpenAPI 3.1 as an enforced contract with contract tests; SSE job events.

### Document Processing (`arag-doc-processing`)
- 18 API paths under `/api/v1` (`src/openapi.ts`): `documents` (upload/list/get/export/ask/delete),
  `jobs` (list/get/SSE events/cancel), `extraction-configs` (CRUD), `schemas`, `session`,
  `admin/{health,config,usage,logs,login,provision,purge,search-configurations}`.
- 11 built-in extraction schemas + unlimited custom configs, each provisioned as a stored ARAG
  search configuration (`dip_<schema>`).
- `STATUS.md` 2026-09-12 17:45: `make check` **45/45 tests, 98.5 % lines**, Playwright **6/6**,
  `docker build` OK, `fly config validate` OK, 186 doc links resolve.
- Live smoke on the real KB: 12 fields extracted from a scanned invoice, entities + summary,
  end-to-end ≈ **120 s** of which ARAG visual processing ≈ **109 s** (`STATUS.md` 2026-09-12 18:25).
- **Caveat to state honestly:** the repo is mid-change implementing D-24 (verified-evidence contract).
  A re-run on 2026-09-12 showed **59 node:test tests, 56 passing**, with one real failure
  (`toCsv escapes a malicious extracted value`). Cite the 45/45 figure as the last recorded
  verification and note the in-flight change. Do not present D-24 evidence output as shipped.
- Showcase PNGs: `arag-doc-processing/showcase/out/*.png` (12).

### Call Analysis (`call-analysis`)
- 19 API paths / 21 operations (`lib/openapi.ts`): `calls` (list/get/media with Range/ask/upload/delete),
  `dashboard`, `labelsets`, `jobs` (+ SSE), `session`,
  `admin/{health,config,usage,logs,login,agents,provision,cache,cache/invalidate}`.
- `STATUS.md` 2026-09-12 18:40 (platform v0.1.5): **189/189 tests**, **95.7 % lines** on `lib/` + `services/`,
  Playwright **18/18**, showcase video 2:23, `docker build` OK, `fly config validate` OK,
  live read-only smoke OK (24 calls, 2 citations on ask). 39 docs/enablement pages, 103 links resolve.
- Taxonomy: 5 call-level labelsets (call reason 10, outcome 5, sentiment 4, line of business 6,
  disposition flags 8) + 1 paragraph-level labelset (11 call-moment labels), applied by two DA labeler
  agents, plus a two-operation ask agent writing narrative analysis + flat metrics JSON.
- 60 s response cache with single-flight loading; zero extra ARAG calls on repeat views.
- Citations resolve to `<rid>/f/media/<start>-<end>` → a playable audio offset. **Unique in its market**
  per `research/call-analysis-market.md`.
- Showcase PNGs: `call-analysis/showcase/out/*.png` (14).

### VoiceBridge (`arag-voice`)
- Hero = **real-time listening / agent assist** (D-20). 31 API paths (`src/openapi.ts`) including
  `listen/sessions` (+ `/transcript`, `/events` SSE, get, delete), `brief`, `voice-answer`
  (and the legacy `/v1/voice-answer` alias), `prospects`, `models`, `voices`, `scribe-token`,
  `avatar/sessions`, `metrics`, `golden-evals` (+ `{id}`), `jobs` (+ SSE), `session`,
  `admin/{health,config,usage,logs,login,prospects,prospects/{key},prospects/{key}/provision,turns,listen-sessions,golden-evals}`.
- `STATUS.md` 2026-09-12 15:40 (pre-Listen): 160 tests (98.85 % lines), Playwright 14/14, showcase video +
  13 PNGs, docker + fly valid, live smoke 3/3 at **p50 3.0 s / p95 4.9 s**.
- **Re-run 2026-09-12 after the Listen work landed: `node --test` reports 195 tests / 47 suites, 195 passing.**
  Use 195 as the current count and note that the recorded coverage figure (98.85 %) predates the Listen service.
- Listen throttling: refresh only fires on ≥ 4 new words, ≥ 1.5 s since the last refresh, and a
  similarity check that skips windows > 85 % the same as the previous one. A failed refresh never blanks
  the brief. Citations dedupe by title+URL, kept at best score, capped at 12. Per-session p50/p95 latency.
- Deflection path: deterministic `HANDOFF:` sentinel; golden-set gate per prospect; per-turn
  `latency_ms.{retrieve,first_token,total}`; measured ≈ **p50 3.3 s / p95 5.6 s** on a small live sample.
- **Honest limits:** session state is single-machine, in-memory, 200-session cap, last 20 brief versions;
  a restart ends live sessions. Poll-and-replace, not event-triggered incremental patching
  (`research/voicebridge-market.md` recommendation 2).
- Showcase PNGs: `arag-voice/showcase/out/*.png` (8).

### The verifiability wedge (research takeaways #2, #3; D-24)
- **#2** — verifiability, not accuracy, is the only open wedge. No competitor in any of the three
  categories publishes a *citation contract*: a stable object saying which source, which span, which
  offset, openable by the user.
- **#3** — ARAG applies `security.groups` **during retrieval, not as a post-filter**. No document-AI,
  conversation-intelligence or agent-assist vendor documents an equivalent.
- **D-24** — live test on the sandbox KB: `answer_json_schema` + `citations` is **rejected (HTTP 500)**;
  schema-only `/ask` still returns retrieval paragraphs with character offsets
  (`<rid>/f/<field>/<start>-<end>`); an `evidence: string[]` property in the schema returns exact verbatim
  quotes. The contract: request per-field evidence quotes, verify each by exact/normalised match, map to
  paragraph offsets, expose `evidence: [{field, quote, verified, paragraph, start, end}]` and a per-record
  `groundingScore`. **Shipping in Document Processing; the pattern is documented for the other two.**

### Progress facts (public, cite them)
- Progress Partners Network: **"over 3500 partners"**, the **Progress Accelerate partner program**,
  eight partner tracks (Distributor, Value Added Reseller, Service Delivery Partner, Digital Agency,
  Managed Service Provider, Systems Integrator, Independent Software Vendor, Technology Alliance Partner).
  Source: https://www.progress.com/partners (fetched 2026-09-12).
- Progress FY2025 Q4: revenue **$253M (+18 % YoY)**, **ARR $852M** (+2 % YoY cc), net retention **100 %**;
  FY2026 guidance **$986M–$1,002M** revenue (Q2 2026 update: ARR $868M).
  Source: Progress Q4 2025 and Q2 2026 earnings releases (SEC 8-K exhibit 99.1).
- Nuclia (ARAG) was acquired by Progress on **30 June 2025** for consideration Progress called immaterial.
  Source cited in `research/call-analysis-market.md`.
- **Not public / not verifiable:** ARAG/Nuclia customer count, ARAG ARR contribution, per-product-line
  partner counts. Say so wherever it matters.

## Engagement models (use these three names verbatim)

1. **White-label** — deploy the accelerator as-is under the partner's brand, pointed at the partner's
   Knowledge Box. Fastest path to a live use case.
   **CORRECTION (verified 2026-09-12, supersedes any earlier statement that this is missing):**
   branding by configuration **has landed** under D-25. `arag-platform/src/config/branding.ts`
   exposes `readBranding()` reading `BRAND_PRODUCT_NAME`, `BRAND_TAGLINE`, `BRAND_LOGO_URL`,
   `BRAND_PRIMARY_COLOR`, `BRAND_ACCENT_COLOR`, `BRAND_POWERED_BY`, `BRAND_FOOTER_TEXT`,
   `BRAND_DOCS_URL`, `BRAND_SUPPORT_URL`, with invalid colours ignored; every product serves
   `GET /api/v1/branding`; the UI kit applies it (`applyBranding()` / `<arag-shell>`); brand assets are
   served from `DATA_DIR/branding/` at `/branding/` so rebranding needs no rebuild; VoiceBridge adds
   per-prospect brand overlays. Each repo ships `docs/developer/white-label.md` and
   `docs/developer/build-your-own.md`. Honest caveats that remain: the OpenAPI document keeps its own
   title (the API contract is not the brand), branding covers visual identity only and is not
   multi-tenancy, and Call Analysis implemented it product-locally pending a platform sync.
2. **Extend** — fork or vendor the accelerator and add a vertical: new extraction schemas, new labelsets
   and DA agents, new brief fields, new endpoints. Extension points are documented per repo at
   `docs/developer/extension-points.md`.
3. **Build-your-own** — take `arag-platform` (`STANDARDS.md`, the ARAG client, the mock, the HTTP toolkit,
   the UI kit and the product template via `make new-product`) and build a different product on the same
   standards. The three accelerators are the worked examples.

## Enablement assets a partner receives (real paths)

- Source, Apache-2.0, with `docs/developer/`, `docs/architecture/`, `docs/business/`, `docs/product-marketing/`.
- Developer track: `<repo>/enablement/developer-track/LAB.md` + `knowledge-check.md`.
- Architect track: `<repo>/enablement/architect-track/WORKSHOP.md`, `sizing-deployment.md`,
  `design-review-checklist.md`, `knowledge-check.md`.
- Showcase: `<repo>/showcase/SCRIPT.md`, `STORYBOARD.md`, `record.spec.ts`, `out/*.png` + video.
- Deploy recipes: `Dockerfile`, `fly.toml`, `make dev` (mock ARAG, no credentials).

## Style

Plain, precise British English. No em-dashes-as-drama, no hype adjectives, no emoji. Short paragraphs.
Tables where a table is clearer. Every market claim cites a `research/*.md` path.
