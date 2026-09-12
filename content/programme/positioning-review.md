# Positioning review — advice for the product leads

Reconciliation of each product's `docs/product-marketing/positioning.md` against `research/` and
against the partner audience set by D-25 and D-26.

**This is advice, not an edit.** No product repository file was changed. Proposed replacement text is
offered as a starting point, not a mandate — you own your positioning.

Read alongside: `research/document-processing-market.md`, `research/call-analysis-market.md`,
`research/voicebridge-market.md`, `research/README.md` (the ten cross-product takeaways), and
`DECISIONS.md` D-15, D-20, D-24, D-25, D-26.

---

## 0. Three things that apply to all three products

### 0.1 Every positioning doc is written for an end customer. The reader is now a partner.

All three documents address a buyer who will use the product: an AP manager, a QA supervisor, a
contact-centre enablement lead. Under D-25 the reader is a **Progress ISV or partner**, who will
white-label the product, embed it in their own application, extend it for a vertical, or use it as a
blueprint. That reader has a different set of questions, and none of the three documents answers
them:

- What do I rebrand, and how? (Answer as of 12 September 2026: `BRAND_*` environment variables,
  `GET /api/v1/branding`, assets in `DATA_DIR/branding/`, plus `docs/developer/white-label.md`.)
- What do I extend, and where are the seams? (`docs/developer/extension-points.md`.)
- What does it take to get from "interesting" to "in front of my customer"?
- Which of my customers is this for, and which is it not for?
- What can I say to my customer that a generic AI vendor cannot say?

**Recommendation:** add a short **"For partners"** section to each positioning document —
engagement models, white-label surface, extension points, time to demo, and the one claim the partner
gets to make. Keep the existing end-customer material; the partner needs it to sell. Do not replace
it.

### 0.2 The end-customer personas are still right, and they are now the partner's customers.

Do not delete them. Reframe the framing sentence: these are the people the partner's customer employs.
The personas are the best-researched part of all three documents.

### 0.3 The "what it is not" sections are the portfolio's strongest asset. Standardise them.

Call Analysis' "What it is not" and VoiceBridge's "Where we don't win" are unusually honest and
directly useful to a partner scoping a pilot. Document Processing has the equivalent buried inside
its competitive-framing section. **Recommendation:** all three adopt the same heading, the same
position (immediately after the elevator paragraph, not at the end), and the same rule — a limit is
named because a partner will otherwise discover it in week five of a pilot.

### 0.4 Naming (D-15): confirmed as a direction, downgraded in importance.

The three naming recommendations — **Fieldwork**, **AfterCall**, **GroundLine** — are each
well-argued and I would not overturn any of them on the merits. But the partner audience changes what
a name is *for*:

- A white-labelling partner replaces the name. A name they will delete is not worth a trademark
  fight.
- Progress and the partner need a **category-descriptive** name to talk about the asset: "the
  Document Processing accelerator", "the Call Analysis accelerator", "the live-context accelerator".
- The reference brands (Fieldwork / AfterCall / GroundLine) remain useful as the name the *unbranded
  reference deployment* ships under, and as a demonstration to a partner that naming has been thought
  about.

**Recommendation:** keep D-15 exactly as it is — repos and code paths unchanged. Use descriptive
accelerator names in programme and Progress-facing material. Keep the three reference brands in the
positioning documents, clearly labelled as reference brands pending legal clearance. Do not spend
money on clearance until a deployment actually needs one.

**One challenge, on Fieldwork specifically.** The positioning doc chose it partly because its
trademark clash is "in an unrelated vertical (field service, not documents or AI)". For a product
whose partner base includes ISVs selling field-service, ERP and workforce applications on Progress
platforms, that clash is *less* unrelated than the analysis assumes — a field-service ISV
white-labelling a product called Fieldwork has a real collision in its own catalogue. Worth
re-testing against DocEngine and Canonical, or against a fourth option, before clearance.

---

## 1. Document Processing (`arag-doc-processing`)

### Keep

- **The one-liner's shape.** "Drop in a document … get back a validated, structured record … through
  one API call." Concrete, testable, and exactly what a partner demos.
- **The four personas and the seven use cases.** The best-grounded section in the document; each use
  case has a before, an after and an outcome. Leave them alone.
- **"What this MVP honestly does not do."** Four accurate limits, stated without hedging.
- **The objection-handling section.** Particularly the handwriting and production-volume answers.
- **The proof points**, with one correction below.

### Change

**1.1 The one-liner over-promises on time, and live measurement contradicts it.**
Current: "…in under a minute…". The live run on a real Knowledge Box took **about 120 seconds** for a
scanned invoice, of which ARAG visual processing was roughly **109 seconds** (`STATUS.md`,
2026-09-12 18:25). A partner who demos this in front of a customer on the strength of "under a
minute" loses credibility in the first thirty seconds.

> **Proposed replacement:** "Drop in a document — a PDF, a photo of a form, a scanned invoice — and
> get back a validated, structured record through one API call. Text documents complete in seconds;
> a scanned image takes about two minutes, most of it visual processing in the Knowledge Box."

**1.2 The wedge is missing from the positioning, and it is the whole point.**
Neither the one-liner nor the elevator mentions verifiability, and the D-24 verified-evidence
contract does not appear at all. `research/README.md` takeaway #2 is unambiguous: verifiability, not
accuracy, is the only wedge available, and it is genuinely open. This product is the one implementing
it.

> **Proposed addition, directly after the elevator paragraph:**
>
> **Why you can trust the record.** Every extracted field can carry its own evidence: the verbatim
> quote from the document that supports it, verified by exact then normalised match against the
> extracted text, mapped to the paragraph offsets the retrieval returned, with a per-record grounding
> score. This was designed against a live test rather than a docs page — `answer_json_schema`
> combined with `citations: true` is rejected outright by ARAG, but a schema-only ask still returns
> paragraph offsets, and an `evidence` array in the schema comes back with exact quotes (DECISIONS
> D-24). No competitor in this market publishes an equivalent contract.
>
> Status: shipping, not shipped. Say so.

**1.3 "Confidence" needs a definition, or it is the weakest claim in the document.**
The elevator, the proof points and the objection handling all lean on per-field confidence.
`research/document-processing-market.md` recommendation 3 is that confidence should be a *documented
composite* — REMi groundedness, a null/format-validation flag, and the retrieval score of the citing
paragraph — with the components exposed, because competitors' confidence is calibrated and ours is
not yet.

**Please confirm what the current number actually is.** If it is model-reported, the positioning must
say so: "a model-reported confidence, not a calibrated probability", and the composite becomes a
roadmap item. An undefined confidence score is exactly what a technical evaluator probes first, and a
partner cannot defend it.

**1.4 The competitive framing names the wrong competitors.**
The current table compares against cloud OCR (Textract/Azure/Google), specialist IDP suites
(Rossum/Instabase/Hyperscience) and DIY LLM calls. The research's market map says the buyer's actual
shortlist in 2026 is a different set, and it says precisely where we lose.

> **Proposed replacement for the "Where we lose" material:**
>
> | We lose to | When | Why |
> |---|---|---|
> | **Reducto, Extend** | the evaluator opens a PDF viewer and clicks a field | they draw the box; we return paragraph-level grounding |
> | **Extend** | procurement questionnaires | evals, a review queue and zero data retention on the free tier, with a public accuracy harness |
> | **LandingAI** | traceability is the explicit requirement | word-level grounding *with confidence*, shipped September 2026, at sub-cent per page |
> | **Azure, Textract** | volume-driven and regulated-by-default | public granular pricing, confidence to the table cell, procurement paperwork that already exists |
> | **Docling, MinerU, Unstructured** | the buyer wants a library and no network hop | free, permissive, no third-party RAG backend to also buy |
> | **Rossum, ABBYY, Instabase** | the buyer is operations-led and wants seats, approvals and a validation screen | that is a different company, and losing it is qualification, not defeat |
>
> And keep the honest corollary the research draws: **do not compete on OCR quality, price per page,
> prebuilt-model catalogue breadth, or end-to-end AP workflow.** Parsing is delegated and pluggable;
> say so in the document rather than letting an evaluator discover it.

**1.5 Reframe "no bounding boxes" from an absence into a grade.**
Current text: "No table-cell-level bounding boxes or layout coordinates." Accurate, but it reads as
nothing. The research's framing is better: paragraph-level grounding is *coarser*, not *absent*, and
saying it that way turns a disqualifier into a trade-off a buyer can accept.

> **Proposed replacement:** "Grounding is at paragraph level with character offsets, not at
> bounding-box level. That is an order of magnitude coarser than Textract polygons or LandingAI's
> word-level grounding, and it is a deliberate trade — we return the *span of text* a value came from
> and the verbatim quote that supports it, not a rectangle on a page image. If your customer's
> workflow needs a click-the-box review screen, this is the wrong product today."

**1.6 Two genuine assets are missing entirely.**

- **Retrieval-native extraction.** Every competitor treats a document as a function call: bytes in,
  JSON out, document discarded. This product leaves the document in a live, security-filtered index
  the same API can answer questions against. The research calls this structurally hard for Reducto or
  Extend to copy because they are deliberately not storage products. It is currently one bullet
  ("grounded Q&A"); it should be a named differentiator.
- **Retrieval-time entitlement filtering.** `security.groups` and `filter_expression` mean one
  deployment can serve many tenants with isolation applied *during retrieval, not as a post-filter*.
  `research/README.md` takeaway #3 calls this the most under-exploited asset in the portfolio, and it
  is a partner-multiplying feature — a single ISV deployment serving many of its own customers. It
  does not appear in the positioning at all.

**1.7 "Per-request model routing" is claimed as an asset; please verify it is one.**
The research lists it among our two genuinely hard-to-copy advantages, but a reading of the code
suggests generative model and reranker are deployment-wide environment values baked into stored
search configurations rather than per-request options. If that is right, it is a roadmap item, not a
proof point, and the positioning should move it.

---

## 2. Call Analysis (`call-analysis`)

### Keep

- **"What it is not."** The strongest paragraph in the portfolio. Do not soften it, and do not move
  it.
- **The honest-gaps list** — no per-user authorization, no real-time, single-tenant. Exactly right.
- **The persona section.** Four personas with jobs and objections; the most usable in the portfolio.
- **The citation-to-timestamp differentiator.** It is real, it is verified, and the research says it
  is unique in this market.
- **The no-credentials demo claim.** For a partner, this is the single most valuable sentence in the
  document.

### Change

**2.1 Lead with verifiability, not with automation.**
Current one-liner: "…transcribed, classified, and scored automatically the moment it lands, with no
analyst tagging a single call by hand." That is an automation claim, and every competitor in the
market makes it. `research/call-analysis-market.md` is blunt: "stop behaving as though transcription
quality is our problem to solve and start behaving as though *verifiability* is."

> **Proposed replacement:** "Call Analysis turns every recorded call into a labelled, searchable
> record in which every claim it makes can be checked — click a citation and the recording scrubs to
> the second the statement was made. Transcription, classification and scoring happen automatically
> when the call lands; the difference is that you can audit the result."

**2.2 The competitive framing names nobody, and the research names everybody.**
Current text describes four unnamed categories ("full-featured call/meeting analytics platforms").
A partner cannot use that. The research provides a specific loss table; adopt it.

> **Proposed replacement for "Competitive framing":**
>
> | We lose to | When | Why |
> |---|---|---|
> | Deepgram, AssemblyAI, Soniox | a developer wants transcript + sentiment + summary and will build the rest | cheaper, faster, benchmarked, better documented, no ARAG dependency |
> | AWS Transcribe Call Analytics / Contact Lens | the buyer is on AWS and needs channel-separated contact-centre metrics | published per-minute pricing, stereo handling, categories, PII redaction, one IAM boundary |
> | Gong, Chorus, Clari | the buyer is a sales leader | the product is the CRM workflow, not the analysis |
> | Observe.AI, CallMiner, NICE, Level AI | the buyer is a CX ops director with more than 100 agents | scorecards, calibration, coaching and an auditor-ready compliance story |
> | Contact Lens, Genesys, Google Quality AI | the buyer already owns the CCaaS | zero integration cost; analytics is a line item on an existing bill |
> | WhisperX + pyannote + a weekend | the buyer is technical, cost-sensitive and wants no vendor | free, permissive, word-level alignment and diarisation already solved |
>
> And the honest addressable wedge, in one sentence: **teams that must justify, audit or dispute what
> an AI said about a recorded conversation, and who want that software inspectable and self-hosted.**

**2.3 A differentiator is stated backwards.**
Current text presents "a purpose-built health-insurance call taxonomy rather than a generic prompt"
as an advantage over generic RAG chat. The research says the differentiator is the opposite one: the
taxonomy is **customer-authored** and applied at ingest at both resource and paragraph level, which
Genesys (phrase lists) and AssemblyAI (a fixed IAB taxonomy) cannot do. For a partner-facing
accelerator serving many verticals, a hard-coded health-insurance taxonomy is a *liability* unless it
is clearly framed as a worked example.

> **Proposed replacement:** "The taxonomy is yours. The shipped labelsets — call reason, outcome,
> sentiment, line of business, disposition flags, and eleven call-moment labels — are a worked
> health-insurance example, not a fixed vocabulary. Replace them with your own and the labeler agents
> apply them at ingest, at both call and paragraph level, immediately filterable and searchable.
> Genesys topic spotting is phrase lists; AssemblyAI ships a fixed IAB taxonomy; neither lets the
> customer author the vocabulary."

**2.4 Label the LLM-derived metrics as estimates, or replace them.**
`research/call-analysis-market.md` recommendation 8 is direct: talk-time, talk-ratio, interruption and
silence are LLM-*guessed* rather than measured from the timeline, which is "indefensible in a QA
dispute when the timestamped paragraphs are right there". AWS publishes these as *measured* call
characteristics.

**Please check what the metrics object actually contains.** Whatever is LLM-derived should be labelled
an estimate in the positioning, the API description and the UI until it is computed from paragraph
timings. This is a small change that removes a large objection.

**2.5 REMi is a named asset and is under-sold.**
The overview mentions "an honest confidence signal". The research says REMi self-scoring makes this
"the only product that tells you when its own answer is weak" in this market. Name it, explain it in
one sentence, and note the honest caveat found in live testing: `/predict/remi` returned HTTP 500 on
a single short context and is documented as best-effort (`STATUS.md`, 2026-09-12 12:50).

**2.6 The real-time boundary now has a portfolio answer.**
"What it is not" correctly rules out real-time and in-call assist. Under the accelerator programme,
that boundary is no longer a gap — it is a handover. Add one sentence: *"Live, in-call assistance is
a different accelerator: VoiceBridge."* It costs nothing and it makes the portfolio legible.

**2.7 Naming: AfterCall confirmed.**
It is legible to the buyer, it carries the lowest collision risk of the three candidates, and —
unusually — it is *honest about the product's boundary*, which matches the "what it is not" section
rather than fighting it. Keep it as the reference brand, and note that a white-labelling partner will
replace it.

---

## 3. VoiceBridge (`arag-voice`)

### Keep

- **The D-20 reframing.** Leading with real-time listening is correct and the research independently
  confirms it: agent assist is both the larger and the better-behaved half of the market.
- **The naming analysis.** The best-reasoned section in the portfolio — the argument that "Bridge"
  describes an architecture the hero feature does not have, and "Voice" a transport it does not
  require, is exactly right.
- **"Where we don't win."** Six real limits including the single-machine session store and the
  credential-pooling caveat. Do not trim it.
- **The throttling, failure-mode and citation-accumulation proof points.** Specific, checkable, and
  the kind of detail that convinces an engineer.
- **The deterministic `HANDOFF:` sentinel and the golden-set gate.** Genuinely differentiated;
  most platforms leave handoff to model judgement.

### Change

**3.1 The strongest sentence available is missing.**
The competitive framing describes "mature products in this category" generically. The research's
decisive finding is far stronger, and specific:

> **Proposed addition to "Competitive framing":**
>
> **Only one incumbent — Google CCAI Agent Assist — exposes a documented streaming,
> bring-your-own-telephony agent-assist API that a non-CCaaS customer can build on.** Cresta, Balto,
> Observe.AI, Amazon Q in Connect, Genesys Agent Copilot, NICE, Talkdesk, Dialpad and Salesforce are
> each locked to a platform, a CRM, or an integration project with no public developer surface. And
> Google's API is audio-first and grounds on Google-hosted knowledge bases, not on yours. "Transcript
> chunks in, grounded and cited context out, over HTTP, against your own knowledge base,
> self-hostable" is genuinely unserved.
>
> Two qualifications the research insists on, and which should travel with the claim: real-time agent
> assist *in general* is very well served, and Cresta already supports agent-desktop audio capture
> for conversations that do not live in a CCaaS. The opening is real and narrower than it looks.

**3.2 The single strongest card is not played at all.**
Session-scoped `security.groups` — per-caller entitlement filtering applied **during retrieval, not as
a post-filter** — appears nowhere in the positioning. `research/voicebridge-market.md` calls it "our
strongest single card" and notes that no assist incumbent documents an equivalent. In banking,
insurance, health and public sector it is the reason procurement says yes.

> **Proposed addition to the positioning statement or immediately below it:** "A session can be
> scoped to what *this* caller is entitled to see. ARAG applies those groups during retrieval, so
> content the caller may not see never leaves the store — not filtered out of an answer after the
> model has already read it. No agent-assist product documents an equivalent."
>
> Caveat to carry: this is a configuration capability today, not a documented first-class session
> parameter with a worked example and a test. Say which it is.

**3.3 Demote the deflection path further than the document currently does.**
The positioning statement gives listening and deflection roughly equal billing in one sentence. The
research is blunt about the tool path: at p50 3.3 s we are 13×–66× outside the envelope the category
designs to (Vapi ~50 ms, Retell <100 ms, ElevenLabs ~250 ms), the hosts all ship native knowledge-base
RAG bundled, and "voice RAG bridge" as a category name should be retired. On the merits it is "a
feature, not a product".

> **Proposed:** keep deflection, describe it as **a supported adapter and the natural ARAG demo**, and
> move it out of the opening sentence. One clause, not a co-headline.

**3.4 State the latency honestly, and state why it is fine.**
p50 3.3 s / p95 5.6 s appears in the proof points with no interpretation. A partner will be asked
about it in the first technical conversation, and the research supplies the answer:

> **Proposed addition:** "In the listening path, the brief lands alongside a conversation that is
> still happening — nobody is waiting for it. A person speaking for eight to fifteen seconds a turn
> gives a two-to-four-second budget comfortably, and our measured p50 of about 3.3 seconds sits inside
> it. The same number would be disqualifying in a voice-agent tool path, where the caller is waiting
> in silence. That is why the hero is listening and the answer endpoint is an adapter."

**3.5 Add the poll-and-replace loop to "Where we don't win".**
The throttling proof points read as a designed feature. The research reads the same code as a demo
architecture: the 1.5 s clock burns ARAG calls on turns where nothing changed, a wholly replaced
brief flickers and destroys the reader's place, and it fires on a clock rather than on the moment that
matters. The correct design is event-triggered incremental patching.

> **Proposed addition:** "Brief refreshes fire on a throttled clock and replace the brief wholesale
> rather than patching individual cards. That is viable to ship and not viable to scale: it spends
> retrieval on unchanged turns and it moves the reader's eye at the wrong moments. Event-triggered
> incremental patching is the next architectural step, not a tuning exercise."

**3.6 One accuracy check, and it matters.**
The positioning says the brief's factual claims are traceable to citations, and separately that
citations accumulate across the call. D-24 established empirically that a schema-shaped `/ask`
returns **no citations map** — the retrieval item carries paragraph ids and offsets, but the citations
object is absent, and requesting both is rejected with HTTP 500. **Please state in the positioning
exactly where the brief's citations come from** (retrieval results? a second call? schema-carried
evidence fields?). A partner's compliance reviewer will ask, and the answer must match the code. If
the brief is not yet carrying per-claim evidence, adopt the D-24 evidence-field pattern and say it is
coming.

**3.7 Naming: GroundLine confirmed, with one partner-audience note.**
The reasoning is sound, and "Ground" names the single claim a buyer must believe. Two additions:
the repository, binary and Fly app keeping `arag-voice-bridge` will keep re-introducing the
"voice"/"bridge" confusion in every technical conversation — worth a rename at the next convenient
break even though D-15 does not require it. And in the programme's own material, the
category-descriptive form ("the live grounded-context accelerator") travels better than any brand,
because most partners will replace the brand anyway.

---

## 4. Summary table

| Product | Keep | Biggest single change | Naming |
|---|---|---|---|
| **Document Processing** | personas, use cases, honest limits, objection handling | lead with the D-24 verified-evidence contract; name the real competitors; fix "under a minute" | *Fieldwork* — confirmed as a direction, but re-test the field-service collision against a partner base that sells field-service software |
| **Call Analysis** | "what it is not", honest gaps, personas, citation-to-timestamp | lead with verifiability instead of automation; reframe the taxonomy as customer-authored, not health-insurance-specific | *AfterCall* — confirmed without reservation |
| **VoiceBridge** | the D-20 reframing, the naming analysis, "where we don't win" | play the two cards the research says are strongest: the Google-only finding, and session-scoped entitlement filtering at retrieval time | *GroundLine* — confirmed; consider renaming the repository too |
| **All three** | the honesty | add a "For partners" section: engagement models, white-label surface, extension points, time to demo | use descriptive accelerator names in programme material; treat the three brands as reference brands |
