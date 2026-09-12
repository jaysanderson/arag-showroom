# Storyboard — ARAG Showroom showcase

Shot list for `showcase/record.spec.ts`. Every still is written to `showcase/out/`; the video is the
same run recorded end to end. Timings are the `beat()` pauses in the spec — long enough to read, and
long enough for Mermaid to draw before a diagram is captured.

| # | File | Surface | What is on screen | Why it is in the cut |
|---|---|---|---|---|
| 1 | `01-home-hero.png` | `/` | Hero headline, sub-head, and the four counted statistics | Opens on the claim and the evidence for it at the same time |
| 2 | `02-platform.png` | `/#platform` | Platform section with the Mermaid architecture diagram | Shows the leverage: one foundation, three products |
| 3 | `03-for-partners.png` | `/#partners-teaser` | The four engagement models, teased | Points an ISV partner at `/partners` |
| 4 | `04-products.png` | `/#products` | A product band: large screenshot, elevator, capability cards | Proves these are products, not slideware |
| 5 | `05-market.png` | `/#market` | Market framing, the per-accelerator table and the caveats | Honest sizing, with its own limitations on the page |
| 6 | `06-traction.png` | `/#traction` | The dark traction band and the per-product table | Counted, not claimed |
| 7 | `07-roadmap.png` | `/#roadmap` | Roadmap phases per accelerator | Honest about what is not built yet |
| 8 | `08-product-hero.png` | `/products/call-analysis` | Product hero with facts row and hero screenshot | One accelerator in depth |
| 9 | `09-what-you-get.png` | `/products/…#outcomes` | The "what you get" outcome cards | Benefit-led, not a feature list |
| 10 | `10-how-it-works.png`, `10b-proof.png` | `/products/…#how`, `#proof` | The numbered steps beside the architecture diagram, then the measured proof table | Shows the mechanism and the evidence for it |
| 10a | `06a-partners-hero.png`, `06b-engagement-models.png`, `06c-white-label.png` | `/partners` | The partner programme: engagement models and the white-label surface | Partner mechanics live here, never on a customer-facing product page |
| 11 | `11-request-partner-access.png` | `/request-access` | The filled form: organisation, partner type, ARAG account | The conversion point, with no third party in it |
| 12 | `12-sign-in.png` | `/login` | Sign-in form | Transition to the gated half |
| 13 | `13-access-requests.png` | `/admin/invites` | The waiting request from shot 11 | The loop closes inside the product |
| 14 | `14-invitation-created.png` | `/admin/invites` | The one-time invitation link, shown once | The core administrative act |
| 15 | `15-users.png` | `/admin` | The user table with roles and per-product roles | Role administration is real, not a mock-up |
| 16 | `16-audit-log.png` | `/admin/audit` | Sign-ins and administrative actions | Governance for a portal with outside users |
| 17 | `17-accept-invitation.png` | `/invite/<token>` | The invitation page with the role explained | The partner's first screen |
| 18 | `18-portal.png` | `/portal` | Three product cards, buttons by role | What a partner actually lands on |
| 19 | `19-product-overview.png` | `/p/call-analysis` | Gated product overview and positioning | The role-aware version of the public page |
| 20 | `20-docs-browser.png` | `/p/…/docs/architecture/architecture.md` | Docs browser: nav, rendered page, diagram, source path | Documentation as a browsable site |
| 21 | `21-enablement.png` | `/p/…/enablement` | Enablement index, both tracks | Enablement is in the product, not a zip file |
| 22 | `22-showcase.png` | `/p/…/showcase` | Recording, gallery, script and storyboard | Each accelerator's own showcase, in the portal |
| 23 | `23-api-reference.png` | `/api/v1/docs` | Redoc over the showroom's OpenAPI document | The portal is API-first like the products |

## Production notes

- Recorded at 1280×800 with `channel: "chrome"` locally and Chromium in CI.
- `make showcase` clears `showcase/out/` and `data/e2e` first, so a run is reproducible.
- Diagram shots pause ~1.8–2 s after scrolling: Mermaid waits for `document.fonts.ready` before it
  measures labels, and capturing sooner would catch a half-drawn graph.
- Nothing in the recording depends on a network service other than the Mermaid CDN; all content is
  the committed snapshot.
