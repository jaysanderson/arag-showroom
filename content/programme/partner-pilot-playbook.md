# Partner Pilot Playbook

The repeatable engagement a Progress partner runs with any of the three Agentic RAG accelerators.

This playbook is **partner-agnostic and vertical-agnostic** by design (workspace decision D-26).
Nothing in it is tailored to a named partner or a named industry; the regulated-industry addendum at
the end covers the constraints that recur in healthcare, insurance and financial services because
those verticals recur, not because the programme targets them.

Repositories referenced throughout:
`arag-platform/`, `arag-doc-processing/`, `call-analysis/`, `arag-voice/`.

---

## 1. Engagement models

Pick one before week 1. The choice determines who does the work, what the partner must bring, and
what "done" looks like.

| Model | The partner's product is… | What they must bring | What they own afterwards | Typical fit |
|---|---|---|---|---|
| **White-label** | the accelerator itself, rebranded | content, a brand, a Knowledge Box, a deployment target | a deployed application and their customer relationship | a partner with reach and no in-house AI engineering |
| **Embed from an existing application** | their existing line-of-business application; the accelerator is a headless service behind it | an HTTP client in their application and somewhere to render a citation | a new capability inside a product their customers already use | an ISV with a long-lived LOB application (policy administration, lending, ERP, funder systems) |
| **Extend** | a fork or vendored copy with vertical additions | engineering capacity and a vertical definition | their own branch, upgradeable by re-syncing the platform | a partner with a specific vertical and a developer team |
| **Build-your-own** | a different product on the same platform | a product idea and a team | a new repository built from `arag-platform`'s template | a partner whose use case is none of the three |

### 1a. White-label — what it requires

- A deployment target (Fly, a container host, or on-premises).
- A Knowledge Box with service-account credentials.
- Brand assets (see the white-label checklist, §6).
- **Branding by configuration ships today** (D-25), verified in source on 2026-09-12: `BRAND_*`
  environment variables read by `arag-platform/src/config/branding.ts`, served at
  `GET /api/v1/branding`, applied by the UI kit, with assets in `DATA_DIR/branding/` served from
  `/branding/` so a rebrand needs no rebuild. Each repo ships `docs/developer/white-label.md`.
  Caveats to state to the customer: the OpenAPI document keeps its own title, branding is visual
  identity only rather than multi-tenancy, and the admin view of the effective branding that D-25 also
  calls for is not built yet.

### 1b. Embed from an existing application — what it requires

The accelerators are headless by construction: the demo app and the admin panel are clients of the
same public `/api/v1`, and nothing the UI does is unavailable to a caller. Embedding means the
accelerator never faces the end user.

```
  ISV line-of-business app             Accelerator (self-hosted / Fly)          ARAG
  ────────────────────────             ──────────────────────────────           ────
  user action in the ISV UI
        │
        │  POST /api/v1/documents        (or /calls, or /listen/sessions/{id}/transcript)
        ├──────────────────────────────▶ validate against OpenAPI, create job
        │  202 {document, job}           │
        │◀──────────────────────────────┤ upload resource, run pipeline ───────▶ Knowledge Box
        │                                │                                       │
        │  GET /api/v1/jobs/{id}/events  │  extract / classify / label / ask ◀────┤
        ├──────────────────────────────▶ │  (security.groups applied at
        │  SSE: stage events             │   retrieval, not as a post-filter)
        │◀──────────────────────────────┤                                       │
        │  GET /api/v1/documents/{id}    │                                       │
        ├──────────────────────────────▶ canonical record + evidence + citations │
        │◀──────────────────────────────┤◀──────────────────────────────────────┘
        │
  ISV renders fields, confidence and "show me where" inside its own screens
```

Requirements:

- An HTTP client in the partner's application stack. Any language; the contract is OpenAPI 3.1,
  served at `/api/v1/openapi.json` with Redoc at `/api/v1/docs`.
- Somewhere in the partner's UI to render **a value, its confidence, and its evidence**. This is the
  single most important integration decision: if the partner's screen cannot show "here is where this
  came from", the verifiability wedge is lost at the last inch.
- An authentication decision: `X-API-Key` between the two services (D-09), with admin routes behind
  `ADMIN_TOKEN`.
- Async handling. Today the completion signals are SSE (`/api/v1/jobs/{id}/events`) and polling;
  **webhooks are not implemented** and are the top platform roadmap item. A firewalled server-side
  integrator should poll until they ship.

### 1c. Extend — what it requires

Engineering, and a decision about upgrade path. Vendor the platform (`make sync-platform`) rather
than forking it, so platform fixes arrive as a sync commit. Extension points are documented per repo
at `docs/developer/extension-points.md`. Typical vertical additions:

- Document Processing: new extraction schemas and configs, new export formats, new pipeline stages.
- Call Analysis: new labelsets and data-augmentation agents, new metrics fields, new dashboard
  aggregations, ingestion of transcripts produced by an external ASR.
- VoiceBridge: new brief schema fields, new trigger conditions, new transcript sources, new guards
  and handoff rules, new golden sets.

### 1d. Build-your-own — what it requires

`arag-platform` plus `make new-product`. The partner gets the ARAG client, the deterministic mock,
the HTTP toolkit, OpenAPI-as-contract with contract tests, the job model with SSE, the JSON store,
the UI kit and `STANDARDS.md`. The three accelerators are the worked examples; read one before
starting.

---

## 2. Roles

| Side | Role | Responsibility |
|---|---|---|
| Partner | **Business owner** | Defines the use case, the acceptance criteria and the go/no-go decision |
| Partner | **Technical owner** | Runs the developer track, owns the deployment and the integration |
| Partner | **Content owner** | Decides what goes into the Knowledge Box and what must not |
| Partner | **Pilot users** (3–10) | Use the thing on real work and report what is wrong |
| Programme | **Solution architect** | Runs the architect workshop, reviews the design, sizes the deployment |
| Programme | **Engineer on call** | Unblocks the integration; triages issues and pull requests |
| Progress | **Partner manager** | Programme placement, commercial frame, co-marketing rights |
| Progress | **ARAG provisioning contact** | Knowledge Box creation and service-account keys |

Two named people on the partner side are non-negotiable. A pilot with no business owner produces a
demo; a pilot with no technical owner produces a stalled integration.

---

## 3. The 6–8 week pilot

The shape is the same for all three accelerators; the per-product rows differ. Weeks 7–8 are a
buffer used when content ingestion or procurement runs long — a well-prepared pilot finishes in six.

**All figures in this section are a plan, not a measurement. No partner pilot has yet run.**

### Week 0 — qualification (before the clock starts)

- Confirm the engagement model.
- Confirm the use case in one sentence, with the decision it changes.
- Confirm there is content, that the partner may use it, and roughly how much.
- Run the accelerator against the mock in front of the partner: `make install && make dev` with
  `ARAG_MOCK=1` — a working product, no ARAG account, no LLM spend. This is the time-to-demo moment
  and it should happen on the first call.

### Weeks 1–2 — Knowledge Box and content

| | Document Processing | Call Analysis | VoiceBridge |
|---|---|---|---|
| Provision | KB + service account (SOWNER), keys in `.env` only | same | same, per prospect in the registry |
| Ingest | 50–200 representative documents across the document types in scope, including the bad scans | 50–200 recordings or transcripts across the queues in scope | the knowledge corpus the conversation must be grounded in: product docs, policies, procedures |
| Configure | pick built-in schemas; define custom extraction configs for anything unmatched; `POST /api/v1/admin/provision` | provision labelsets and DA agents; adapt the taxonomy to the partner's own | create the prospect: KB, greeting, handoff line, model, reranker; `POST /api/v1/admin/prospects/{key}/provision` |
| Verify | `GET /api/v1/admin/health` — KB connection, extract strategy, generative model | `GET /api/v1/admin/agents` — DA task status | `GET /api/v1/admin/health` per prospect |

Ingestion is the most commonly underestimated task. ARAG visual processing of a scanned document was
measured live at roughly **109 seconds of a ~120-second end-to-end run** (`STATUS.md`, 2026-09-12
18:25) — bulk ingestion of a real corpus is an overnight job, not a coffee break.

### Week 3 — configuration, branding and integration

- White-label: apply the branding checklist (§6).
- Embed: implement the API calls, the async handling and the evidence rendering in the partner's UI.
- Extend: land the vertical additions behind the existing tests.
- All: decide authentication (`API_KEYS`, `ADMIN_TOKEN`), rate limits, retention and `DATA_DIR`
  persistence; run the architect workshop and the design-review checklist.

### Week 4 — the golden set and acceptance criteria

The highest-leverage hour of the pilot. With the business owner, write **10–20 golden items**:

- Document Processing: 10–20 documents with the correct field values written down by a human, plus
  the documents that *should* fail validation.
- Call Analysis: 10–20 questions with the expected answer and the transcript moment that grounds it,
  plus the questions the corpus genuinely cannot answer.
- VoiceBridge: 10–20 questions the system **must answer** and questions it **must refuse** — this is
  exactly what `POST /api/v1/golden-evals` runs through the production pipeline, asserting behaviour,
  grounding (≥ 1 citation) and voice shape.

Agree the thresholds now, in writing. §5 lists what can actually be measured.

### Weeks 5–6 — pilot with real users

- 3–10 users doing real work, not a scripted demo.
- Weekly review of the admin panel: usage counters, job timeline, logs, and — for VoiceBridge — the
  listen-session brief history with per-session p50/p95 latency.
- Log every disagreement between the system and a human as a golden item. The golden set should grow
  during the pilot.
- Re-run the golden set at the end of each week and record the trend, not just the final number.

### Weeks 7–8 — buffer, review and go/no-go

- Re-run the full golden set.
- Complete the go/no-go template (§7).
- Decide: proceed to production, extend the pilot with a specific fix list, or stop with the reasons
  written down.

---

## 4. Data requirements and handling

**What the partner must supply.** Representative content, including the bad examples — the pilot's
credibility depends on the corpus looking like production, not like a sales deck. For Document
Processing that means poor scans, photographs and unusual layouts; for Call Analysis, noisy calls and
the queues nobody likes reviewing; for VoiceBridge, the knowledge that is actually out of date.

**Where the data goes.** Content is uploaded to an ARAG Knowledge Box. Derived records (documents,
jobs, configs, prospects, listen sessions) are persisted by the accelerator under `DATA_DIR` as
atomic JSON files (D-10). Credentials come only from environment variables and never enter the
stores or the logs; the log layer redacts secrets and the admin configuration view shows secrets
redacted.

**PII and PHI — state the position honestly.** **None of the three products redacts customer
content today.** They redact secrets in their own logs, which is a different thing entirely.
Transcripts, extracted fields and document text pass through and are stored unredacted. This is
identified as a procurement gate the programme currently fails in all three products
(`research/README.md`, takeaway #5) and it is on the GA roadmap. Until it ships, a pilot involving
PII or PHI must handle it by **deployment boundary and access control**, not by product feature:

- Deploy inside the customer's own environment or region.
- Put an identity-aware proxy in front of Call Analysis, which has **no per-user authorization** —
  any caller holding a valid key can read every call in the Knowledge Box.
- Use `security.groups` and `filter_expression` to partition retrieval. ARAG applies these **during
  retrieval, not as a post-filter**, so unauthorised content never leaves the store — the property
  that survives a security review (`research/README.md`, takeaway #3). Today this is a configuration
  detail rather than a documented per-request API parameter; treat it as a design decision to make
  explicitly at the architect workshop.
- Agree retention up front. Document Processing has `POST /api/v1/admin/purge`; deletion removes both
  the local record and the ARAG resource.

**Data residency and self-host.** Every accelerator ships a `Dockerfile` and a `fly.toml`, has zero
runtime dependencies, and runs on Node 22 or Next.js with no external service other than ARAG.
In-country, on-premises and air-gapped deployments are therefore a deployment decision, not a product
change — with one caveat that must be stated: **the ARAG Knowledge Box itself must be reachable**, so
"self-hosted" describes the accelerator, and the ARAG deployment topology is a separate conversation
with Progress. A fully offline pilot can only run against the mock. Note also that **no published
container image, `docker-compose.yml` or Helm chart exists in any repo yet**
(`research/README.md`, takeaway #10) — partners build the image from the `Dockerfile`.

**Multilingual content.** Retrieval, transcription and generation are ARAG's. The accelerators are
content- and language-agnostic: schemas, labelsets and brief fields are authored by the partner in
whatever language the corpus uses. Two practical notes — validation and normalisation in Document
Processing are tuned for Latin-script dates and amounts, and the built-in Call Analysis taxonomy is
English-language and health-insurance-shaped, so a non-English pilot should budget a session to
re-author the taxonomy. Language coverage of transcription and generation should be confirmed with
Progress for the specific languages in scope; it is not something these repos can attest to.

---

## 5. Success criteria, and how they are measured

Use the products' own signals. Do not invent a metric the product cannot emit.

| Criterion | How it is measured | Product signal | Available today? |
|---|---|---|---|
| **Extraction correctness** | golden-set field values vs. human-recorded truth | canonical record fields | yes, manually — there is no in-product eval harness |
| **Grounding score** | per-record score from the verified-evidence contract (D-24) | `groundingScore` + `evidence[]` | **Document Processing only** — shipped, and measured live at 0.92 |
| **Citation coverage** | share of generated claims carrying a resolvable citation | citations on `/ask`; Call Analysis citations resolve to `<rid>/f/media/<start>-<end>`, a playable audio offset | yes for answers; per-field coverage arrives with D-24 |
| **Golden-set pass rate** | must-answer answered with ≥ 1 citation; must-refuse refused | `POST /api/v1/golden-evals` (VoiceBridge, automated); manual for the other two | VoiceBridge automated; others manual |
| **Latency** | p50/p95 per turn or per job | VoiceBridge `latency_ms.{retrieve,first_token,total}` and per-session p50/p95; job timings elsewhere | yes |
| **Throughput / volume** | documents, calls or sessions processed | `GET /api/v1/admin/usage` | yes |
| **Reliability** | failed jobs, upstream errors | `GET /api/v1/admin/logs`, job states | yes |
| **User acceptance** | pilot users' own judgement, recorded weekly | — | human |

Reference points from verification runs, to calibrate expectations rather than to promise:
a scanned invoice yielded **12 fields with entities and summary in ~120 s** end to end
(`STATUS.md`, 2026-09-12 18:25); VoiceBridge live smoke measured **p50 3.0 s / p95 4.9 s** with
per-turn latency around **p50 3.3 s / p95 5.6 s** on a small sample (`STATUS.md`, 2026-09-12 15:40
and the product's positioning document). The research is explicit that ~3.3 s is adequate in the
listening path — nobody is waiting — and disqualifying in a voice-agent tool path
(`research/voicebridge-market.md`, "The latency verdict").

**Suggested thresholds to negotiate, not to assert:** golden-set must-refuse pass rate 100 % (a
system that guesses when it should not is a failed pilot regardless of anything else); must-answer
pass rate ≥ 90 %; citation coverage on generated claims ≥ 95 %; extraction field accuracy agreed per
field, because a total and a free-text description do not deserve the same bar.

---

## 6. White-label checklist

Work through this in week 3. Everything in the first list is environment configuration and needs no
code change; the second list is what still requires an edit. Read `docs/developer/white-label.md` in
the repository first — it is the authoritative version of this checklist.

**Branding configuration keys (D-25, shipped):**

- `BRAND_PRODUCT_NAME`, `BRAND_TAGLINE`, `BRAND_LOGO_URL`
- `BRAND_PRIMARY_COLOR`, `BRAND_ACCENT_COLOR` (invalid colour values are ignored, not applied)
- `BRAND_POWERED_BY` (hides the "Built on Progress Agentic RAG" band; attribution stays in
  `LICENSE`/`NOTICE`, and the wording is worth confirming with the Progress partner manager)
- `BRAND_FOOTER_TEXT`, `BRAND_DOCS_URL`, `BRAND_SUPPORT_URL`
- Logo and other brand assets: drop them into `DATA_DIR/branding/`; they are served from `/branding/`
  with no rebuild
- The effective branding is readable at `GET /api/v1/branding`
- VoiceBridge only: per-prospect brand overlays in the prospect registry, layered on the deployment
  branding, so one deployment can serve several branded targets

**Runtime configuration keys:**

- `ARAG_KB_ID`, `ARAG_API_KEY`, `ARAG_REGION`, optional `ARAG_BASE_URL`
- `PORT`, `LOG_LEVEL`, `DATA_DIR`
- `ADMIN_TOKEN` (admin UI and `/api/v1/admin/*`), `API_KEYS` (makes `X-API-Key` mandatory)
- `RATE_LIMIT_*`, `ALLOWED_ORIGINS`, `TRUST_PROXY`
- `ARAG_MOCK=1` for the credential-free demo
- Document Processing: `DIP_EXTRACT_STRATEGY`
- VoiceBridge: the prospect registry (`DATA_DIR/prospects.json`, example at
  `config/prospects.example.json`) already holds greeting, voice, handoff line, Knowledge Box, model
  and reranker per target — the closest existing analogue to branding-by-configuration

**Still a manual edit:**

- Favicon in `public/` **(manual)**
- Deeper visual changes beyond the branding colours: override the `--arag-*` tokens in
  `vendor/arag-platform/ui/arag-ui.css` — brand `#2b2bb2`/`#4b4bf7`, ink `#00123c`, accent `#00b563`,
  surface `#f4faff` — re-applied after every `make sync-platform` **(manual)**
- Typography tokens `--arag-font-display` / `--arag-font-text` **(manual)**
- OpenAPI `info.title`, `info.description`, contact and licence in `src/openapi.ts` or
  `lib/openapi.ts` — the API contract deliberately keeps its own title, so change it only if the
  partner publishes the spec under their own name **(manual)**
- Docs to rebrand if the partner republishes them: `docs/business/overview.md`,
  `docs/business/when-to-use.md`, `docs/business/faq.md`, `docs/developer/quickstart.md`,
  `README.md`
- Showcase: re-record with `make showcase` after rebranding, so the screenshots match the product the
  customer will see

---

## 7. Go / no-go template

Complete at the end of week 6 (or 8). One page. Copy it as-is.

```
PILOT GO / NO-GO — <accelerator> — <date>

1. Use case, in one sentence:
2. Engagement model:            white-label | embed | extend | build-your-own
3. Decision this changes, and who makes it today:

4. Golden set
   items:            must-answer ___   must-refuse ___   extraction ___
   pass rate:        must-answer __%   must-refuse __%   extraction __%
   thresholds agreed in week 4:        ___ / ___ / ___
   met?              yes | no | partially

5. Measured signals
   citation coverage on generated claims:   __%
   grounding score (where available):       ___
   latency p50 / p95:                       ___ / ___
   volume processed during the pilot:       ___
   failed jobs / upstream errors:           ___

6. Pilot users
   count: ___   sessions: ___
   would they keep using it?  ___ / ___
   the three things they complained about most:

7. Gaps that blocked the pilot
   product gaps (link to issues):
   content gaps:
   integration gaps:

8. Data and compliance
   PII/PHI in scope?              yes | no
   handling agreed and in place?  yes | no
   deployment location:           ___
   retention agreed:              ___

9. Commercial
   Knowledge Boxes provisioned:   ___
   ARAG contract value influenced (estimate, and how it was estimated):
   partner's next step:

10. DECISION:   GO | GO WITH FIX LIST | EXTEND PILOT | NO-GO
    Reasons (written, whatever the decision):
    Owner and date of the next review:
```

---

## 8. What the partner receives

| Asset | Where |
|---|---|
| Source, Apache-2.0 | `arag-doc-processing/`, `call-analysis/`, `arag-voice/`, `arag-platform/` |
| Developer docs | `<repo>/docs/developer/` — quickstart, API reference, examples, extension points, local dev |
| Architecture docs | `<repo>/docs/architecture/` — architecture, ARAG integration, data flow, deployment topologies, security model, scaling, limits |
| Business docs | `<repo>/docs/business/` — overview, when to use, demo and admin walkthroughs, FAQ |
| Product-marketing docs | `<repo>/docs/product-marketing/` — positioning, partner pitch, launch blog |
| **Developer track** | `arag-doc-processing/enablement/developer-track/LAB.md` + `knowledge-check.md`; `call-analysis/enablement/developer-track/LAB.md` + `knowledge-check.md`; `arag-voice/enablement/developer-track/LAB.md` + `knowledge-check.md` |
| **Architect track** | `<repo>/enablement/architect-track/WORKSHOP.md`, `sizing-deployment.md`, `design-review-checklist.md`, `knowledge-check.md` — for each of the three repos |
| Showcase | `<repo>/showcase/SCRIPT.md`, `STORYBOARD.md`, `record.spec.ts`, `out/` (video + screenshots) |
| Deploy recipes | `<repo>/Dockerfile`, `<repo>/fly.toml`, `make dev` |
| Engineering standards | `arag-platform/STANDARDS.md` |
| Marketing assets | `marketing/datasheets/`, `marketing/deck/index.html`, `marketing/site/` |

---

## Appendix — regulated-industry addendum

Common to healthcare, insurance and financial services, and to public-sector work under GDPR-,
POPIA- or similar regimes.

**Assume the answer to "can we use your cloud?" is no.** Plan for in-country, on-premises or
air-gapped deployment of the accelerator from the first conversation. Confirm the ARAG deployment
topology with Progress separately — the accelerator being self-hostable does not by itself make the
whole stack self-hosted.

**Entitlements before features.** In regulated accounts, retrieval-time `security.groups` filtering
is usually the reason procurement says yes and the absence of it is the reason they say no. Design
the group model at the architect workshop, and prove it with a test that shows unauthorised content
never appears in an answer or a brief. No document-AI, conversation-intelligence or agent-assist
vendor documents an equivalent (`research/README.md`, takeaway #3), so this is worth the effort of
demonstrating properly.

**Redaction is not a feature yet.** Say so before the security review, not during it. If redaction is
a hard requirement, the pilot either scopes to non-sensitive content, redacts upstream before
ingestion, or waits for the GA roadmap item. Do not imply it exists.

**Auditability.** Every generated claim should carry a citation an auditor can open — that is the
whole premise. Per-field evidence and a grounding score shipped in Document Processing (D-24) and
were measured live at 0.92 — 10 quotes matched exactly, 1 after normalisation, 0 unverified
(`STATUS.md`, 2026-09-12 20:30); Call Analysis and VoiceBridge adopt the same pattern at GA. One
honest limit remains: there is **no audit log** in any product yet
(`research/HEADLESS-API-BAR.md`), and it belongs on the risk register for a regulated pilot.

**Retention and deletion.** Agree the retention period in week 1, not week 6. Document Processing has
an admin purge that deletes the local record and the ARAG resource; Call Analysis and VoiceBridge
need a documented deletion procedure agreed as part of the design review. Retention and deletion APIs
are a named GA roadmap item in the research for Call Analysis.

**Model and content governance.** Extraction, labelling and generation quality are inherited from the
configured ARAG generative model — the accelerators do not train or fine-tune. Record which model a
pilot ran on, because per-request model routing means it can change without a redeploy, and a
regulated customer will ask.

**Clinical, financial and legal decisions stay human.** All three products are read-and-structure
layers. None decides anything. Write that into the pilot charter: the system produces evidence for a
person, and every claim it makes can be opened and checked.
