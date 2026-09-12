# White-labelling the public product pages

A partner can deploy this portal under their own brand and hand the public product pages to their
own customers as-is. Nothing in those pages is specific to Progress beyond an attribution line you
can switch off, and nothing about a rebrand requires a fork, a rebuild, or a code change.

This page is about the **public marketing pages** (`/`, `/products/<slug>`, `/request-access`).
White-labelling an accelerator itself (Document Processing, Call Analysis, VoiceBridge) is the same
mechanism, documented in each product repository's `docs/developer/white-label.md`.

## What a customer-facing product page contains

`/products/<slug>` is deliberately written for a partner's customer, not for a partner:

| Section | Source |
|---|---|
| Hero: benefit headline, sub-head, product screenshot | `customer.headline` / `customer.subhead` in the copy file, falling back to `config/products.json` |
| "What you get" outcomes | `customer.outcomes`, falling back to `outcomes` in `config/products.json` |
| "The moment it clicks" | `customer.heroMoment`, falling back to `heroMoment` |
| Capabilities | `capabilities` in the copy file, falling back to `config/products.json` |
| How it works | `howItWorks` steps plus the Mermaid diagram from the product's `docs/architecture/architecture.md` |
| Where it is used / who it is for | `useCases`, `personas` |
| Proof | `customer.proof` or `proof`, plus `customer.trust` |
| Showcase | the recording and stills synced from the product repository |
| FAQ | `customer.faq` or `faq` |
| Call to action | `customer.cta` |

Partner mechanics — white-labelling, extension points, embedding by REST, enablement, the pilot
playbook — are deliberately **not** on these pages. They live on `/partners`. A partner can link a
customer straight to `/products/<slug>` without that customer reading about reselling.

Anything in the copy files whose heading reads as partner-facing (matching *white-label*, *rebrand*,
*partner*, *reseller*, *OEM*) is filtered out of the customer-facing capability grid and FAQ
automatically, so a copy update cannot accidentally leak partner language onto the page.

## Rebranding a deployment

Branding comes from `BRAND_*` environment variables, read once at boot and served at
`GET /api/v1/branding`. The portal applies them to every page it renders — public and gated.

```bash
fly secrets set \
  BRAND_PRODUCT_NAME="Northwind Intelligence" \
  BRAND_TAGLINE="Document, call and voice intelligence for regulated operations" \
  BRAND_PRIMARY_COLOR="#7a1fa2" \
  BRAND_ACCENT_COLOR="#00a37a" \
  BRAND_POWERED_BY=0 \
  BRAND_FOOTER_TEXT="© Northwind Ltd. Apache-2.0 components." \
  BRAND_SUPPORT_URL="https://support.northwind.example"
```

| Variable | Effect |
|---|---|
| `BRAND_PRODUCT_NAME` | Wordmark in the header and footer, and the suffix of every page title |
| `BRAND_TAGLINE` | The line under the wordmark in the footer |
| `BRAND_LOGO_URL` | Replaces the wordmark with an image — see below |
| `BRAND_PRIMARY_COLOR` | Buttons, links, accents (`--arag-brand-500` and `--sr-accent`) |
| `BRAND_ACCENT_COLOR` | The secondary accent (`--arag-accent-500`) |
| `BRAND_POWERED_BY` | `0` removes "Built on Progress Agentic RAG." from the footer line |
| `BRAND_FOOTER_TEXT` | Replaces the whole footer legal line |
| `BRAND_DOCS_URL`, `BRAND_SUPPORT_URL` | Where the footer's documentation and support links point |

Colours are validated: anything that is not a CSS colour is ignored rather than injected, and the
values are emitted as CSS custom properties on `:root`, so the rest of the design system adapts
around them (hover states, tints, borders) without further configuration.

### A logo file

Put the file in the data volume and point at it:

```bash
fly ssh console -C "mkdir -p /data/branding"
fly sftp shell     # put ./logo.svg /data/branding/logo.svg
fly secrets set BRAND_LOGO_URL=/branding/logo.svg
```

`/branding/*` is served from `DATA_DIR/branding`, so the logo survives a deploy and needs no rebuild.
Use an SVG or a PNG at least 48 px tall; it is rendered at 24 px in the header.

### Product accent colours

Each product band and product page also carries its own accent from `accent` in
`config/products.json`. `BRAND_PRIMARY_COLOR` sets the site-wide accent; edit `config/products.json`
if you want the per-product accents to match your palette too.

## The words

`content/site/<product>.json` holds the copy. A partner has three options, in increasing order of
effort:

1. **Ship it as it is.** The copy is written vertical-neutral and benefit-led; it names no customer,
   no sector and no competitor.
2. **Edit the copy file.** Replace `customer.headline`, `customer.subhead`, `customer.outcomes` and
   `customer.cta` with your own words, commit, redeploy. No code change.
3. **Point it at your own marketing repository.** `make sync-content` copies `../marketing/site/*.json`
   into `content/site/`; change that path in `scripts/sync-content.ts` (one constant) to pull from
   wherever your marketing copy lives.

The copy file's shape is documented in `src/services/site-copy.ts`. Every field is optional: a page
renders from the synced product documentation when a field is missing, so a half-finished copy file
never produces a broken page.

## What you cannot rebrand away

- **Licence attribution.** The Apache-2.0 licence and `NOTICE`-style attribution stay in the
  repository. `BRAND_POWERED_BY=0` removes the visual credit from the footer, not the licence.
- **Content provenance.** The synced documentation, screenshots and recordings are the product
  teams' material; the portal renders them, and the source path is shown on every gated docs page.

## Checking your work

```bash
make dev                                   # http://localhost:8080
curl -s localhost:8080/api/v1/branding     # the effective branding
make screenshots                           # docs/screenshots/*.png at 1440px and 390px
```

`make screenshots` re-captures every public page at desktop and phone width, which is the quickest
way to see a palette change across the whole site before it goes out.
