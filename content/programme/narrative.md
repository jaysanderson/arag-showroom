# Agentic RAG Partner Accelerators — the narrative

**Primary reader: Progress Software.** A proposal for a partner-accelerator programme built on three
open-source reference products for Progress Agentic RAG (ARAG).
**Secondary reader: the Progress ISV and partner network.** What the accelerators are, how to take
them to market, and what they prove that a generic AI vendor cannot.

Written 12 September 2026; product sections and the traction table updated **13 September 2026**
after the full-implementation pass (D-34) landed for Document Processing and VoiceBridge. Call
Analysis is mid-pass, and every figure quoted for it here is its last verified one. Every market
claim cites a file under `research/`. Every product number cites a repository file, a product
`DECISIONS.md` entry or `STATUS.md`. Where a number is not verifiable, this document says so.

---

## 1. The thesis

Enterprises will not put generative AI into a claims queue, a compliance review or a live customer
call on the strength of fluency. They put it there when the output can be checked. The three
products described here are grounded, verifiable AI for the three places unstructured enterprise
content actually lives — **documents, recorded calls, and live conversations** — each built headless
and API-first on ARAG, each Apache-2.0, each running end to end with no credentials against a
deterministic mock.

They are not a company. They are **accelerators**: production-quality reference products that the
Progress partner network can white-label, extend for a vertical, or use as a blueprint to build
something else on the same platform. Their commercial purpose is to make ARAG the substrate under a
large number of partner-delivered use cases, and their success metric is **ARAG contract value
influenced and Knowledge Boxes provisioned**, not standalone product ARR. That conclusion is not a
framing choice; it is what the market research arrived at independently in all three categories
(`research/README.md`, takeaway #7, and the "Combined three-year SOM base case" paragraph).

## 2. Why now

Three things changed at once.

**The parsing and transcription layers commoditised.** Per-page prices collapsed in a single month —
Reducto cut parsing from 3–6¢ to 1¢ and LandingAI moved to sub-cent billing in September 2026
(`research/document-processing-market.md`). ASR sits at $0.0043/min at Deepgram
(`research/call-analysis-market.md`). Nobody wins on raw extraction or WER any more, which means the
value moved up the stack to what the output can be trusted to support.

**Verifiability is the one wedge nobody has taken.** Across all three market maps —
document AI, conversation intelligence and real-time agent assist — no competitor publishes a
*citation contract*: a stable object that says which source, which span, which offset, openable by
the end user (`research/README.md`, takeaway #2). Vendors ship citations as UI garnish. None ships
them as an integrable API object.

**Real-time assist opened a lane.** Only one incumbent — Google CCAI Agent Assist — exposes a
documented streaming, bring-your-own-telephony assist API a non-CCaaS customer can build on, and
Google's is audio-first and grounds on Google's own knowledge bases. Cresta, Balto, Observe.AI,
Amazon Q in Connect, Genesys, NICE, Talkdesk, Dialpad and Salesforce are each locked to a platform
(`research/voicebridge-market.md`, "The decisive finding"). "Transcript chunks in, grounded and cited
context cards out, over HTTP, against your own knowledge base, self-hostable" is genuinely unserved.

---

# Part one — the proposal to Progress

## 3. Why a reference-product programme accelerates ARAG adoption

Progress runs the **Progress Accelerate partner program** with **over 3,500 partners** across eight
partner tracks — distributor, value-added reseller, service delivery partner, digital agency,
managed service provider, systems integrator, independent software vendor and technology alliance
partner (https://www.progress.com/partners, fetched 2026-09-12). Those partners already hold the
customer relationships, the domain knowledge and the vertical data. What they do not have is a
proven, inspectable, production-shaped ARAG application to point at.

A large part of that network sits on long-lived line-of-business applications. Progress publishes
**"2K+ Partners", "5K Business Applications", "100K+ Customers" and "6M+ Application Users"** for
OpenEdge alone, on a platform whose stated purpose is to "develop, run and evolve on-premises or
cloud enterprise applications" (https://www.progress.com/openedge, fetched 2026-09-12). Those are
applications with decades of domain logic, deep customer trust, and — critically — no grounded AI
layer. They do not want to rewrite; they want to add a capability. For them the shortest credible
route is not a new product at all: it is **embedding an accelerator by REST from the application
they already sell**.

A partner evaluating ARAG today has to imagine the product. A partner evaluating these accelerators
runs `make install && make dev` and has a working product in minutes against a mock Knowledge Box,
with no ARAG account and no LLM spend. That is the difference between a platform sale and a use-case
sale, and the use-case sale is the one a partner can take to their installed base.

The programme therefore converts platform interest into provisioned Knowledge Boxes by removing the
three things that stall an ARAG evaluation: no worked application, no enablement path, and no
demonstrable answer to "how do I know the AI is right?"

## 4. What the programme contains

| Component | What it is | Where it lives |
|---|---|---|
| **Platform** | `arag-platform`: typed ARAG REST client, deterministic mock ARAG server, dependency-free HTTP toolkit, OpenAPI 3.1 builders and validator, job manager with SSE, JSON store, UI kit, `STANDARDS.md`, product template | `arag-platform/` |
| **Three accelerators** | Document Processing, Call Analysis, VoiceBridge — each with public API, admin panel and demo app | three product repos |
| **Documentation** | developer, architecture, business and product-marketing docs in every repo | `<repo>/docs/` |
| **Enablement** | a 60–90 minute developer lab and a reference-architecture architect workshop per product, each with a knowledge check | `<repo>/enablement/{developer,architect}-track/` |
| **Showcase** | a 2–3 minute recorded walkthrough with script, storyboard and screenshots, recorded against the mock | `<repo>/showcase/` |
| **Deploy recipes** | `Dockerfile`, `fly.toml`, `make dev` | every repo |
| **Pilot playbook** | the repeatable 6–8 week partner engagement | `marketing/PARTNER-PILOT-PLAYBOOK.md` |

## 5. How it is repeatable

The programme is deliberately partner-agnostic (workspace decision D-26). Every engagement runs the
same playbook: choose an engagement model, provision a Knowledge Box, ingest the partner's own
content, configure or brand the accelerator, agree a golden set and acceptance criteria, run a pilot
with real users for six to eight weeks, and take a go/no-go decision against measurable signals the
products already emit — grounding score, citation coverage, golden-set pass rate, latency, and the
admin usage counters. Nothing in the playbook is tailored to a named partner, and nothing in it
assumes a vertical; a short regulated-industry addendum covers healthcare, insurance and financial
services because those verticals recur.

## 6. What Progress needs to provide

1. **Partner-programme placement** — the accelerators listed as a named asset inside Progress
   Accelerate, so partners find them on the path they already walk.
2. **A Knowledge Box provisioning path for partners** — a documented, low-friction route from
   "partner wants to pilot" to "partner has a KB with service-account keys". Today this is a manual
   act by an account owner.
3. **Enablement delivery** — the developer and architect tracks run as scheduled partner sessions,
   not just as files in a repository.
4. **Co-marketing rights** — permission for a partner to say "built on Progress Agentic RAG", and a
   reciprocal right for Progress to reference partner-delivered use cases.
5. **Internal data to close the market model** — ARAG/Nuclia customer and partner counts are **not
   publicly broken out**, and the research names this as the single biggest hole in every sizing
   (`research/document-processing-market.md`, `research/call-analysis-market.md`,
   `research/voicebridge-market.md`). Without it the reachable-accounts line is an assumption.

## 7. Success metrics for Progress

Measured quarterly, in this order of importance:

- **ARAG Knowledge Boxes provisioned** through partner pilots.
- **ARAG contract value influenced** — deals where an accelerator was the use case that carried the
  platform. This is the primary metric; product ARR is not.
- **Partner pilots started and converted**, by engagement model.
- **Time from partner first contact to a running demo** (target: same day, against the mock) and to a
  pilot go/no-go (target: 6–8 weeks).
- **Use-case breadth** — how many distinct verticals reach pilot on the same three accelerators.

---

# Part two — the proposal to ISVs

## 8. Platform plus products

One platform, three products. `arag-platform` holds everything that is not product-specific: the
ARAG client, the mock, the HTTP toolkit, the OpenAPI machinery, the job model, the store, the UI kit
and the engineering standards. It is vendored into each product (D-06), so every repo stays
self-contained and deployable, and a platform fix ships as a sync commit rather than a dependency
bump. The platform carries **44 tests, all passing** on v0.1.8 — the 95.9 % line-coverage figure on
record was re-measured at v0.1.8: 95.85 % lines, 44 tests.md`, 2026-09-12 11:40) and has not been
re-measured — and
its own live smoke against a sandbox Knowledge Box, which passed **18 of 19 steps** — the exception
being `/predict/remi` returning HTTP 500 on one short context, documented as best-effort
(`STATUS.md`, 2026-09-12 12:50).

The three products are the worked examples. Each has a public `/api/v1` described by an OpenAPI 3.1
document that is the single source of truth for request validation and contract tests, RFC 9457
problem responses, an admin panel, a demo app that consumes only the public API, and a mock mode
that needs no credentials.

**Document Processing** (`arag-doc-processing`) turns a document into a validated canonical record
and then puts that record back into the Knowledge Box. Eleven built-in schemas plus unlimited custom
configs, each provisioned twice — as a stored ARAG search configuration, so the model, the grounding
strategy and the JSON schema live in the Knowledge Box rather than scattered through client code, and
as a matching **key-value schema**, so the verified record is written onto the resource itself as
typed, validated name-value fields. Typed fields with per-field confidence and a verified evidence
quote, named entities, a summary, deterministic validation issues, JSON/XML/CSV export, grounded Q&A
over one document or a filtered set, and in-place field correction with an append-only history.
**Hero moment:** drop in a photographed invoice and watch the pipeline run to a record you could post
to a ledger — live on a real Knowledge Box, 12 fields with entities and summary in about 120 seconds,
of which ARAG visual processing was about 109 (`STATUS.md`, 2026-09-12 18:25) — then open the next
tab and find the same values as searchable fields on the document inside the Knowledge Box. That
write-back is the headline capability of the full-implementation pass, and it was verified live on
13 September 2026 along with the four limits that travel with it: key-value filtering answers with
matches rather than counts (these fields are not facetable and a filter expression is a 422 on
`/catalog`), indexing lags the write by well over a minute, an overwrite leaves the old value in the
filter index, and the provisioned schema marks nothing required because a missing required key
rejects the entire write (`arag-doc-processing/DECISIONS.md` DP-46…DP-55).

**Call Analysis** (`call-analysis`) turns
every recorded call into a labelled, searchable, citable record. ARAG transcribes into timestamped
paragraphs; two data-augmentation labeler agents apply a customer-authored taxonomy at both call and
paragraph level; an ask agent writes a narrative scorecard and a flat metrics object the dashboard
aggregates. **Hero moment:** ask a call a question, click the citation, and the recording scrubs to
the exact second the cited statement was made, with the source transcript line highlighted. Per
`research/call-analysis-market.md`, citations resolving to a playable audio offset are unique in that
market.

**VoiceBridge** (`arag-voice`) listens to a live conversation and keeps one evolving, cited brief in front
of whoever is handling it (D-20). Transcript chunks arrive from any source — realtime STT, a
telephony webhook, a meeting bot, or someone typing — and the server does the throttling so every
client gets the same behaviour and cost profile. **Hero moment:** a conversation streams in and one
brief on screen keeps rewriting itself — topic, who the caller is, what they want, what to say next —
with citations accumulating across the call, and a failed refresh leaving the last good brief in
place rather than blanking it mid-call. The full-implementation pass made it a deployment a partner
can actually operate: all 43 settings are edited in the product and take effect on the next request,
API keys are named and revocable with last-used tracking, conversations are kept with every version
the brief passed through and any two can be compared side by side, retention windows and a purge
decide how long any of it lives, and the ElevenLabs voice agent is configured and pushed to
ElevenLabs from Settings after a field-by-field diff — verified against a throwaway live agent, which
is how three undocumented live-API constraints were found before they could ship broken
(`arag-voice/DECISIONS.md` V-26…V-33). LiveAvatar and LiveKit were **removed** rather than shipped
half-built, because the bar for the pass is that a capability which is not implemented leaves the
product and the spec instead of appearing as "coming soon" (V-25).

## 9. Four ways to engage

| Model | What the partner does | What they must bring | Speed |
|---|---|---|---|
| **White-label** | Deploy an accelerator as-is under their own brand, pointed at their own Knowledge Box | Content, a brand, a Knowledge Box | Fastest to a live use case |
| **Embed from an existing application** | Leave the accelerator headless. The partner's own product calls `/api/v1/...` over REST, receives structured, cited results, and renders them in its own UI | An HTTP client in their application, and somewhere to display a citation | Fastest for an established product |
| **Extend** | Vendor or fork it and add a vertical — new schemas, labelsets, DA agents, brief fields, endpoints | Engineering, a vertical | Weeks |
| **Build-your-own** | Take `arag-platform` and `make new-product`, and build something different on the same standards | A product idea and a team | Their own roadmap |

**Embed is the pattern for an established line-of-business application.** These products are headless
by construction — the demo app and admin panel are clients of the same public API, and nothing the
UI does is unavailable to a caller. An ISV with a policy administration, lending, ERP or funder
system posts a document, a recording or a transcript chunk from inside its own workflow and renders
the structured, cited result in its own screens. The accelerator never faces the end user.

```
  ISV line-of-business app                Accelerator (self-hosted or Fly)         ARAG
  ─────────────────────────               ────────────────────────────────         ────
  user action in the ISV UI
        │
        │  POST /api/v1/documents          (or /calls, or /listen/sessions/{id}/transcript)
        ├────────────────────────────────▶ validate against OpenAPI, create job
        │  202 {document, job}             │
        │◀────────────────────────────────┤  upload resource, run pipeline ──────▶ Knowledge Box
        │                                  │                                        │
        │  GET /api/v1/jobs/{id}/events    │   extract / classify / label / ask ◀───┤
        ├────────────────────────────────▶ │   (security.groups applied at
        │  SSE: stage events               │    retrieval, not as a post-filter)
        │◀────────────────────────────────┤                                        │
        │  GET /api/v1/documents/{id}      │                                        │
        ├────────────────────────────────▶ canonical record + evidence + citations  │
        │◀────────────────────────────────┤◀───────────────────────────────────────┘
        │
  ISV renders fields, confidence and "show me where" in its own UI
```

Both white-label and embed deploy the same way, and both support **in-country, on-premises or
air-gapped operation** — which is what makes them usable for health, insurance and financial-services
data under GDPR-, POPIA- and similar regimes. Retrieval quality and language coverage come from ARAG;
the accelerators are content- and language-agnostic, and multilingual corpora are an ARAG
configuration question rather than a product change. See `PARTNER-PILOT-PLAYBOOK.md` for the data
handling and residency detail.

**Time to demo** is minutes: `make install && make dev` runs the whole product against the in-process
mock, with no ARAG account and no LLM spend. **Time to pilot** is estimated at 6–8 weeks in
`PARTNER-PILOT-PLAYBOOK.md`; that is a plan, not a measurement — no partner pilot has yet run.

**Branding by configuration ships today** (D-25), verified in source on 2026-09-12:
`arag-platform/src/config/branding.ts` reads `BRAND_PRODUCT_NAME`, `BRAND_TAGLINE`,
`BRAND_LOGO_URL`, `BRAND_PRIMARY_COLOR`, `BRAND_ACCENT_COLOR`, `BRAND_POWERED_BY`,
`BRAND_FOOTER_TEXT`, `BRAND_DOCS_URL` and `BRAND_SUPPORT_URL`; every product serves
`GET /api/v1/branding`; the UI kit applies it; brand assets dropped into `DATA_DIR/branding/` are
served from `/branding/`, so a rebrand needs no rebuild. Each repo ships
`docs/developer/white-label.md` and `docs/developer/build-your-own.md`, and VoiceBridge adds
per-prospect brand overlays so one deployment can serve several branded targets. Two honest
caveats: the OpenAPI document deliberately keeps its own title, because the API contract is not the
brand; and branding covers visual identity only — it is not multi-tenancy.

**Since 13 September 2026, in Document Processing and VoiceBridge, branding is not only configured
but edited.** The full-implementation pass (D-34) made every setting a screen: product name,
tagline, logo (uploaded in the product), colours, footer text and the Progress credit are stored in
the product, applied on the next request without a rebuild, audited, and shown with the layer each
effective value came from — which is the admin view of effective branding that D-25 also called for.
An uploaded asset is served under its own locked-down content policy and an SVG carrying active
content is refused at upload, a stored-XSS path that making the logo editable would otherwise have
opened (`arag-voice/DECISIONS.md` V-29, V-32). Call Analysis is mid-pass and still configures
branding by environment variable.

## 10. The verifiability wedge — the partner's differentiation

A partner selling against a generic AI vendor needs one claim that survives a procurement review.
This is it.

**A published citation contract.** Nobody in any of the three categories publishes one
(`research/README.md`, takeaway #2). We can, and Call Analysis is already closest: its citations
resolve to `<rid>/f/media/<start>-<end>`, which resolves to a playable audio offset.

**Verified evidence for structured extraction (D-24).** The obvious objection is that structured
output and grounded citations are mutually exclusive on ARAG. That was tested live on the sandbox
Knowledge Box on 12 September 2026, and the honest result is mixed: `answer_json_schema` combined
with `citations: true` is **rejected with HTTP 500**; a schema-only `/ask` returns **no citations
map**, but its `retrieval` item still carries paragraph ids with character offsets
(`<rid>/f/<field>/<start>-<end>`); and adding an `evidence: string[]` property to the schema returned
**exact verbatim quotes** from the document. The contract built on that finding requests per-field
evidence quotes, verifies each by exact then normalised match against the extracted text, maps
verified quotes to retrieval paragraph offsets, and exposes
`evidence: [{field, quote, verified, paragraph, start, end}]` plus a per-record `groundingScore`.
This is **shipped in Document Processing** and measured live: a grounding score of **0.92**, with
10 evidence quotes matching exactly, 1 after normalisation and 0 unverified (`STATUS.md`,
2026-09-12 20:30).

**Structured values that live in the Knowledge Box (13 September 2026).** Every other extraction
product hands back a JSON blob and keeps the structured data in its own database. Document Processing
provisions a typed key-value schema in the Knowledge Box for every extraction configuration and
writes the verified record onto the resource itself, validated at write, so the extracted values are
first-class Knowledge Box data that any other system on that Knowledge Box can filter and search —
and because the schema and its field descriptions are the same artefact that guides the extraction,
changing what you extract and changing what you can filter on are one action rather than two. It was
built against live behaviour, and the limits are published with the claim: filtering answers with
matches rather than counts (these fields are not facetable, and a key-value filter expression is a
422 on `/catalog`), indexing lags the write by well over a minute, an overwrite leaves the superseded
value in the filter index, and the provisioned schema marks nothing required because one missing key
rejects the whole write (`arag-doc-processing/DECISIONS.md` DP-46…DP-55). For a partner, this is the
argument that the accelerator makes the *platform* more valuable rather than sitting beside it.

**Retrieval-time entitlement filtering.** ARAG applies `security.groups` **during retrieval, not as a
post-filter**, so unauthorised content never leaves the store — the distinction that survives a
security review. No document-AI, conversation-intelligence or agent-assist vendor documents an
equivalent (`research/README.md`, takeaway #3). It is currently a configuration detail; it should be
a documented, tested, per-request and per-session API parameter with a worked regulated-industry
example. For a partner in banking, insurance, health or public sector, this is the reason
procurement says yes.

---

## 11. Market — partner reach × use cases

The right way to size this is **partner reach multiplied by use cases**, not product revenue.
Progress reports **ARR of $852M** at the end of FY2025 (Q4 revenue $253M, +18 % YoY; net retention
100 %) and guided FY2026 revenue to **$986M–$1,002M**; Nuclia, the origin of ARAG, was acquired on
**30 June 2025** for consideration Progress called immaterial. The partner network is **over 3,500
partners** across eight tracks. Each partner that lands one accelerator-shaped use case provisions at
least one Knowledge Box and takes ARAG into an account that a platform-only motion would not have
reached.

The standalone market sizes are context, and they are context with caveats. Reported honestly:

| | Document Processing | Call Analysis | VoiceBridge (voice agents / agent assist) |
|---|---|---|---|
| **Top-down TAM** | $1.7bn (Everest, IDP products) – $14.66bn (M&M, "Document AI" incl. ECM) | ~$4–6bn (Mordor $4.01bn vs Fortune $5.70bn, same market name) | Voice agents ~$2.5–3.5bn; agent assist ~$4–5bn |
| **CAGR** | ~33 % (IDP houses) vs 13.5 % (M&M) | 13–16 % → $8–12bn by 2030–31 | 25–39 % (voice) / ~21 % (assist) |
| **Bottom-up check** | 30–180bn pages/yr × $0.005–0.020 = **$0.15–3.6bn**, central **~$0.75bn** | 14m seats × 22 % attach × $400 = **~$1.2bn** (range $0.3–4.6bn); the minutes route agrees at $1.9bn | Voice: inverting analyst figures → **~$3bn**. Assist: **$0.67–6.0bn** |
| **SAM (ARAG-native, headless, OSS)** | ~$10–30M/yr | ~$20–120M/yr | ~$14–360M/yr |
| **SOM, year-3 base** | **~$0.75M ARR** (low $0.08M / high $5.5M) | **~$0.85M run-rate** (low $0.1M / high $5M) | **~$0.3M ARR** (low $12–60k / high $5.6M) |
| **Biggest hole** | ARAG/Nuclia customer count not publicly broken out | the no-SaaS seat share (1–3 %) is unsourced | contact-centre seat count rests on one 2020 Synergy figure |

Source: `research/README.md` "Market sizing summary", with full assumptions in
`research/document-processing-market.md`, `research/call-analysis-market.md` and
`research/voicebridge-market.md`.

**The caveats, stated plainly.** Analyst sizes in all three categories are definitionally broken: the
IDP estimates span **8.5×** for the same year, two houses using the *same market name* for
conversation intelligence differ by **42 %**, and voice AI spans two orders of magnitude depending on
whether "conversational AI" includes chat (`research/README.md`, takeaway #6). Every bottom-up check
landed at or below the low end. Every pricing figure carries a fetch date of 12 September 2026 and
should be re-checked before it reaches a customer. Several vendor pages were unretrievable and are
marked as such rather than filled in. Private-company revenue figures are secondary and
unverifiable.

**The combined three-year SOM base case across all three products is roughly $1.9M ARR.** That is
real and it is feature-sized, not company-sized. It is also the wrong number to plan on. The research
reaches the same conclusion in all three documents independently: as standalone businesses these are
feature markets; as attaches that make ARAG win regulated, grounded, self-hosted deals it would
otherwise lose, they are well worth building — and success should be measured in **ARAG contract
value influenced**.

## 12. Traction and proof — what exists today

| | Document Processing | Call Analysis | VoiceBridge | Platform |
|---|---|---|---|---|
| API operations (`/api/v1`) | 56 | 20 paths | 58 (55 driven by a screen) | — |
| Unit/integration/contract tests | 241/241, 98.1 % lines | 205/205, 95.8 % lines | 337/337, 98.8 % lines | 44/44 |
| Playwright e2e | 60 journeys | 21/21 | 83 journeys | template 2/2 |
| Settings editable in the product | 29 of 29 fields, six groups | — (mid-pass) | 43 fields, six groups | — |
| `docker build` | OK | OK | OK | — |
| `fly config validate` | OK | OK | OK | — |
| Live ARAG smoke | grounding score 0.92 (10 exact / 1 normalised / 0 unverified); 12 fields from a scanned invoice in ~120 s; key-value writes, filters and the generator-agent lifecycle exercised live on 13 Sep | read-only OK: 24 calls, 2 citations on ask | 3/3 at p50 2.9 s; a live listening session reached brief v3 with 12 sources; live KB writes and a live ElevenLabs agent verified on 13 Sep | 18/19 steps |
| Showcase | narrated walkthrough (17 beats, 3:04) + 28 PNGs + a 90 s launch video | video 2:23 + 14 PNGs | narrated walkthrough + 24 PNGs + a 91 s launch video | — |

**Document Processing and VoiceBridge alone now carry 578 passing tests** (241 and 337) after the
full-implementation pass, plus 143 Playwright journeys between them; the platform adds 44. Sources:
the two products' `mvp` branches and `DECISIONS.md` entries of 2026-09-13, `STATUS.md` 2026-09-13,
and the `STATUS.md` entries of 2026-09-12 at 12:50, 18:25, 20:10, 20:30, 20:40, 21:00 and 21:40 for
everything that predates the pass.

**What shipped since this document was first written.** The full-implementation pass (D-34) turned
the two live demos into working implementations rather than guided tours: every setting editable and
persisted in-product with environment variables demoted to defaults, a real API-key store in place of
a shared variable, an in-product API explorer generated from each product's own OpenAPI document so
every operation is exercisable against the live deployment, and every previously deferred item built
— or, where it could not be verified end to end, removed from the product and the spec rather than
shown as "coming soon" (VoiceBridge's LiveAvatar/LiveKit, V-25). Document Processing gained the
Progress Agentic RAG **key-value field** capability as its headline: verified records written back
onto the Knowledge Box resource as typed name-value data, a generator-agent path beside it, and
filtering through the Knowledge Box. All five repositories are **public** under
`github.com/jaysanderson` as of 13 September 2026 (D-35), every product page carries a flagship
launch video (89–91 s, produced with real captured screens, ElevenLabs narration and Progress brand
direction, D-33) and a narrated walkthrough recording, and the public site now carries suggested
on-sell price ranges for partners instead of market sizing (D-31).

**Three honesty notes.** The platform's line coverage was re-measured at v0.1.8: 95.85 % lines across
44 tests. The Call Analysis column above is its last verified figure: its own full-implementation
pass is still running, and these assets will be restated when it lands. And no partner pilot has run,
so every time-to-pilot figure in this programme is a plan, not a measurement.

## 13. Roadmap to GA

Ordered by the ratio of consequence to effort, drawn from the four research documents.

1. **Platform: webhooks (Standard Webhooks, HMAC-SHA256), idempotency keys, per-key scopes.** One
   build, three products. Webhooks were reached independently by three researchers and the API bar.
   Idempotency is a correctness and cost bug, not a nicety: a retried upload today creates a second
   ARAG resource and a second LLM extraction.
2. **Publish the citation contract** as a versioned API object in all three products — per-field
   provenance and confidence in Document Processing, audio offsets in Call Analysis, card-level
   citations in VoiceBridge.
3. **PII redaction.** A procurement gate we fail in all three products today. Customer content passes
   through and is stored unredacted; redacting our own logs is a different thing.
4. **VoiceBridge: event-triggered incremental brief patches** replacing the 1.5 s poll-and-replace
   loop, and transport-agnostic ingest hardening. The current loop burns ARAG calls on unchanged
   turns and rebuilds the brief instead of patching it.
5. **Ship the open-source claim**: container images, a `docker-compose.yml`, a minimal Helm chart, an
   MCP server per product, and generated TypeScript/Python SDKs from the OpenAPI documents we already
   contract-test. **No published image, compose file or Helm chart exists in any of the four repos
   today** (`research/README.md`, takeaway #10).
6. **Finish the branding work across all three products** (D-25). Document Processing and VoiceBridge
   now edit branding in the product — stored, applied without a rebuild, audited, and shown with the
   layer each effective value came from, which is the admin view D-25 asked for. Call Analysis gets
   the same treatment in its own pass; after that the remaining item is a recorded verification run
   rather than new code.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Structured output and citations do not compose on ARAG** — the correctness blocker under the whole wedge | Tested live and resolved as D-24: schema-requested evidence quotes, verified by match, mapped to retrieval offsets, with a per-record grounding score. Shipping in Document Processing; documented as the recipe for the other two |
| **White-label branding landed after the last verification run** | Confirmed in source across the platform and all three products on 2026-09-12, and since 2026-09-13 branding is editable in the product in Document Processing and VoiceBridge, pinned by Playwright journeys that change a value, reload and assert the effect. Call Analysis is mid-pass |
| **Missing integration plumbing** — webhooks, idempotency, batch, scopes, audit logs — blocks real partner integration | Build once in the platform; all three products inherit. 14 of 39 headless-API-bar rows are met, 12 partial, 13 missing (`research/HEADLESS-API-BAR.md`) — the list is short and specific |
| **Standalone revenue is feature-sized** | Do not plan on it. Measure ARAG contract value influenced and Knowledge Boxes provisioned |
| **We cannot win on parse accuracy, WER or first-audio latency** | Do not compete there. Parsing, transcription and speech are delegated and documented as pluggable |
| **VoiceBridge latency (p50 3.3 s) is disqualifying in the voice-agent tool path** | The hero is the listening path, where nobody is waiting and a 2–4 s budget is comfortable; the tool endpoint stays a supported adapter, not the headline |
| **ARAG customer and partner counts are not public** | Flagged in every sizing; requested from Progress as programme input |
| **Apache-2.0 forces no commercial conversation** | The monetisable unit is ARAG, not the accelerator. That is the point of the programme |
| **Single-machine state** — in-process job runner, JSON stores, in-memory listen sessions | Documented limits, not hidden; the store interface is designed to be swapped for Postgres/Redis at GA (D-10) |

## 15. What we need from partners

Not an investment ask — a participation ask.

1. **One use case and the content behind it.** A Knowledge Box is only as good as what goes in it.
2. **A named technical owner** to run the developer track and a named business owner to define
   acceptance criteria.
3. **Ten to twenty golden questions** — the things the system must answer and the things it must
   refuse. This becomes the acceptance gate, and it is the single highest-leverage hour of the pilot.
4. **Real pilot users**, not a demo audience.
5. **Permission to reference the outcome**, in whatever form the partner is comfortable with.
6. **Feedback as issues and pull requests.** These are open repositories. The fastest way to get the
   vertical you need is to contribute it.

---

*Companion documents: `PARTNER-PILOT-PLAYBOOK.md` (the repeatable engagement), `deck/index.html`
(the partner pitch), `datasheets/` (one per accelerator), `site/` and `market.json` (structured site
copy), `POSITIONING-REVIEW.md` (advice to the product leads).*
