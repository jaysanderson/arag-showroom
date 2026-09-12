# Content sync

## Why a snapshot, not a live read

The showroom does not read the three product repositories at request time (D-S2 in
[DECISIONS.md](../DECISIONS.md)). `scripts/sync-content.ts` copies what it needs out of each repo
into `content/<slug>/` ahead of time, and that directory is **committed** to this repository. Two
consequences follow from that:

- The portal keeps working even when a sibling product repo is mid-rebase, missing, or simply not
  checked out on the machine that runs the showroom.
- What is deployed is exactly what a reviewer approved in the diff — a content sync is a normal,
  reviewable commit, not something that happens invisibly at deploy time.

## Running it

```bash
make sync-content                              # every product in config/products.json
node scripts/sync-content.ts call-analysis     # just one, by slug
node scripts/sync-content.ts doc-processing voicebridge   # a subset
```

The script resolves each product's `repo` path from `config/products.json` (relative to the repo
root, e.g. `../call-analysis`) and, for each one present on disk:

1. **Deletes and rebuilds** `content/<slug>/` from scratch — it is idempotent, and a file removed
   upstream disappears from the snapshot too. A repo not found at its configured path is skipped
   with a warning; existing content for that product is left untouched.
2. **Copies Markdown trees** `docs/` and `enablement/` wholesale (only `.md` files).
3. **Copies individual files** when present: `README.md`, `CHANGELOG.md`,
   `showcase/SCRIPT.md`, `showcase/STORYBOARD.md`.
4. **Copies showcase output** from `showcase/out/`: every `.png` screenshot (deduplicated by
   filename) and the first `video.webm` found, into `content/<slug>/showcase/out/`. These are the
   only assets served without a session — see the asset route note in
   [SECURITY.md](../SECURITY.md).
5. **Writes `manifest.json`**: `recommendedName` and `oneLiner` parsed out of
   `docs/product-marketing/positioning.md`, the live `demoUrl`/`adminUrl` from the config, the
   synced commit (`git rev-parse --short=12 HEAD` in the source repo) and timestamp, and file/
   screenshot/video counts.
6. **Writes `facts.json`**: everything on the public traction strip that must never be hand-typed —
   commit count, endpoint count (parsed from the synced `api-reference.md`), test and test-file
   counts (counted from `test`/`tests`/`src` in the source repo), the highest coverage percentage
   claimed in the source repo's own `CHANGELOG.md`/`README.md`/`STATUS.md`/`AUDIT.md`, and its
   runtime dependency count from `package.json`. A fact that cannot be measured is omitted, never
   guessed.

The same run also calls `syncMarketing()`, which looks for an optional **sibling** `../marketing/`
directory (outside this repo, not one of the three products):

- `../marketing/site/*.json` → `content/site/*.json` — authored copy from the PMM lead that
  **overrides** text the showroom would otherwise parse out of synced documentation (D-S8). Every
  field is optional; see `SiteCopy` in `src/services/catalogue.ts` for the shape.
- `../marketing/*.md` and `../marketing/programme/*.md` → `content/programme/<slugified-name>.md`,
  served publicly at `/programme/:doc` (the partner pilot playbook and anything placed beside it).
- `../marketing/market.json` → `content/market.json`, the optional market-sizing block on the
  public home page.

`../marketing/` being absent is not an error — the sync logs "nothing to sync" and the showroom
falls back entirely to what it parsed out of the synced product documentation.

## Committing the result

```bash
make sync-content
git status                 # review exactly what changed under content/
git add content/
git commit -m "chore: sync content from product repos"
```

Treat a content sync like any other change: review the diff (a `manifest.json` `commit` field
moving forward is expected; large unexpected deletions under a product's `content/<slug>/docs/`
usually mean that product's own docs were deleted upstream, not a bug here) before committing.

## After a sync: re-deploying

Content ships inside the Docker image, not on the runtime volume (see
[deploy.md](deploy.md#content-lives-in-the-image-not-the-volume)), so a content sync only reaches a live
deployment through `fly deploy`. The sequence is: sync → review → commit → `fly deploy`.
