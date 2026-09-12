# marketing/ — Agentic RAG Partner Accelerators

Product-marketing assets for the partner-accelerator programme. Primary reader: **Progress Software**.
Secondary reader: **the Progress ISV and partner network** (D-25, D-26).

Nothing here edits a product repository. Everything cites a repository file, `STATUS.md`, or a
`research/*.md` path; where a number is not verifiable, the text says so.

---

## The story in ten lines

1. Enterprises do not reject AI for being wrong. They reject it for being uncheckable.
2. Parsing, transcription and speech have commoditised, so the value moved to what the output can be trusted to support.
3. In document AI, conversation intelligence and real-time agent assist, **nobody publishes a citation contract** — the one wedge that is genuinely open.
4. We built three open-source reference products on Progress Agentic RAG for documents, recorded calls and live conversations, all headless, all Apache-2.0, all running with no credentials against a deterministic mock.
5. They sit on one shared platform — ARAG client, mock, HTTP toolkit, OpenAPI-as-contract, job model, UI kit, standards, product template — so a fix in one place reaches all three.
6. Verifiability is the mechanism: schema-requested evidence quotes verified against the source text, citations that resolve to a paragraph offset or a playable audio second, and entitlement filtering applied **during retrieval, not as a post-filter**.
7. They are not a company. They are **accelerators** a Progress partner can white-label, embed by REST in the product they already sell, extend for a vertical, or use as a blueprint to build their own.
8. Time to demo is minutes; a pilot runs to a go/no-go in six to eight weeks on a playbook that is deliberately repeatable across every ISV and every vertical — with 521 automated tests across the four repositories behind it, all passing.
9. Standalone, the three markets are feature-sized — roughly $1.9M combined three-year SOM base case, with analyst sizes that are definitionally broken; the metric that matters is **ARAG contract value influenced and Knowledge Boxes provisioned**.
10. What Progress supplies is placement, a Knowledge Box provisioning path, enablement delivery, co-marketing rights and internal partner data; what a partner supplies is one use case, its content, two named owners and twenty golden questions.

---

## Index

| File | What it is |
|---|---|
| [`NARRATIVE.md`](./NARRATIVE.md) | The programme narrative, in two parts — the proposal to Progress, then the proposal to ISVs. Thesis, why now, what the programme contains, the three accelerators with their hero moments, the four engagement models, the verifiability wedge, market framing with the TAM/SAM/SOM table and its caveats, traction, roadmap to GA, risks, and what we need from partners. |
| [`deck/index.html`](./deck/index.html) | The partner pitch: 15 slides, self-contained, arrow-key navigation, `P` to print one slide per page. No external resources except Google Fonts. Screenshots referenced from `assets/`. |
| [`PARTNER-PILOT-PLAYBOOK.md`](./PARTNER-PILOT-PLAYBOOK.md) | The repeatable engagement: engagement models and what each requires, a week-by-week 6–8 week pilot per product, roles on both sides, data requirements and handling, success criteria measured with the products' own signals, a white-label checklist, a go/no-go template, the assets a partner receives, and a regulated-industry addendum. |
| [`POSITIONING-REVIEW.md`](./POSITIONING-REVIEW.md) | Advice to the three product leads: each product's positioning reconciled against the research and the partner audience — keep, change (with proposed replacement text), naming confirmed or challenged, competitive framing corrected. Not an edit to their files. |
| [`datasheets/document-processing.md`](./datasheets/document-processing.md) | One-page accelerator sheet: what it does, how it works, defensibility, API surface, proof, white-label surface, extension points, time to demo and pilot, deployment, roadmap, what it is not. |
| [`datasheets/call-analysis.md`](./datasheets/call-analysis.md) | As above, for Call Analysis. |
| [`datasheets/voicebridge.md`](./datasheets/voicebridge.md) | As above, for VoiceBridge. |
| [`site/home.json`](./site/home.json) | Structured home-page copy: hero, programme (for Progress / for partners), platform, the three products, partner models, enablement, the verifiability wedge, open source, FAQ, calls to action. |
| [`site/document-processing.json`](./site/document-processing.json) · [`site/call-analysis.json`](./site/call-analysis.json) · [`site/voicebridge.json`](./site/voicebridge.json) | Per-product site copy: `name`, `workingTitle`, `oneLiner`, `elevator`, `heroMoment`, `personas[]`, `capabilities[]`, `howItWorks[]`, `whyItWins[]`, `useCases[]`, `partnerModels[]`, `enablement`, `roadmap[]`, `faq[]`, `proof[]`. |
| [`market.json`](./market.json) | The TAM/SAM/SOM table with sources, the caveats, Progress public context, and the combined SOM — for the site's Market section. |
| [`assets/`](./assets) | Showcase screenshots copied from each repo's `showcase/out/`, three per product. |
| `_BRIEF-FOR-CONTRIBUTORS.md` | The working brief the contributors were given: audience, verified facts, engagement models, style. Kept for traceability; not a deliverable. |

---

## Product asks — capability the partner story needs

Ordered by how much of the programme depends on them.

1. **Webhooks, idempotency keys and per-key scopes, in the platform.** The embed engagement model
   currently tells a firewalled server-side integrator to poll. Standard Webhooks (HMAC-SHA256) is the
   convention; idempotency is a correctness and cost bug, not a nicety — a retried upload today creates
   a second ARAG resource and a second extraction. One build, three products.
   (`research/README.md`, takeaway #4.)
2. **PII redaction of customer content.** A procurement gate the programme fails in all three products
   today. Transcripts, extracted fields and document text pass through and are stored unredacted;
   redacting our own logs is a different thing. Every regulated pilot has to work around this by
   deployment boundary instead. (`research/README.md`, takeaway #5.)
3. **The citation contract as a versioned API object in all three products.** D-24 shipped in
   Document Processing only (measured live at a grounding score of 0.92). Call Analysis needs its audio-offset citation published as a first-class
   object; VoiceBridge needs to state, and then guarantee, where the brief's citations come from — the
   empirical finding is that a schema-shaped `/ask` returns no citations map.
4. **An admin view of the effective branding in every product.** The D-25 branding configuration
   (`BRAND_*`, `GET /api/v1/branding`, `DATA_DIR/branding/` assets, the UI-kit application, and the
   white-label and build-your-own guides) shipped across the platform and all three products, and is
   covered by the final verification runs on platform v0.1.8. The remaining piece D-25 calls for is an
   admin view of the effective branding.
5. **Self-host packaging.** No published container image, `docker-compose.yml` or Helm chart exists in
   any of the four repositories. "Open source" is not a claim a partner can test until `docker run`
   works from the README. (`research/README.md`, takeaway #10.)
6. **`security.groups` as a documented, tested, first-class API parameter** — per request in Document
   Processing and Call Analysis, per session in VoiceBridge — with a worked regulated-industry example
   and a test proving unauthorised content never reaches an answer. It is the strongest card in the
   portfolio and it is currently a configuration detail. (`research/README.md`, takeaway #3.)
7. **Per-user authorization in Call Analysis.** Any caller with a valid key can read every call in the
   Knowledge Box. Every pilot with real recordings needs an identity-aware proxy in front of it until
   this exists.
8. **Event-triggered incremental brief patches in VoiceBridge**, replacing the 1.5 s poll-and-replace
   loop, plus a durable session store. The current design is viable to ship and not viable to scale.
9. **An MCP server and generated TS/Python SDKs per product.** The cheapest distribution available to
   a grounded-RAG product, generated from OpenAPI documents that are already contract-tested.
10. **Define or replace "confidence" in Document Processing.** The positioning leans on per-field
    confidence in four places. If it is model-reported rather than a documented composite, say so and
    make the composite a roadmap item — it is the first thing a technical evaluator probes.

---

## Verification of these assets

- `deck/index.html` rendered in Chrome via Playwright on 2026-09-12: 15 slides in the DOM, arrow-key
  and `Home`/`End` navigation working, **no page errors and no failed requests**, all six referenced
  screenshots loading at their natural dimensions, no vertical or horizontal overflow on any slide,
  and all 15 slides visible under print media with a page break after each but the last. A PDF
  rendered cleanly at A4 landscape.
- Every relative asset path in the deck resolves to a file in `assets/`.
- All five JSON files parse.
- Product numbers are the final verified state on platform v0.1.8 (`STATUS.md`, 2026-09-12 20:10,
  20:30, 20:40, 21:00 and 21:40): Document Processing 66/66 tests at 98.6 % lines with Playwright
  10/10 and a live grounding score of 0.92; Call Analysis 205/205 at 95.8 % with 21/21; VoiceBridge
  206/206 at 99.0 % with 22/22; the platform 44/44. **521 automated tests in total, all passing.**
  API path counts (20 / 20 / 32) were recounted from the OpenAPI source files after the branding
  endpoints landed.
- The product pages in `site/*.json` carry a `customer` block: the benefit-led, vertical-neutral copy
  a partner would put in front of its own customers, alongside the existing partner-facing fields.
