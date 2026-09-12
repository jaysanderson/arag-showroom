# Contributing

Thanks for helping build the ARAG Showroom — the partner-accelerator site and invite-only portal
for the three open-source products built on Progress Agentic RAG (Document Processing, Call
Analysis, VoiceBridge).

## Ground rules
- Be kind; see `CODE_OF_CONDUCT.md`.
- Never commit secrets. `.env` is git-ignored; use `.env.example` for documentation.
- Use **bun** for tooling (`make install`); do not add `package-lock.json` or run npm.
- Keep runtime dependencies at zero unless a `DECISIONS.md` entry explains why.
- The showroom serves a **committed snapshot** of the three product repos
  (`content/<slug>/`, written by `scripts/sync-content.ts`) — see `docs/content-sync.md`. Don't
  hand-edit files under `content/`; re-run the sync and commit the result instead.
- Every capability lives in `src/routes/pages.ts` (server-rendered HTML, works without
  JavaScript) **and** `src/routes/api.ts` (`/api/v1`), both calling the same service objects in
  `src/services/`. Add both, not just one.
- Roles and surfaces are defined once, in `src/permissions.ts`. A route should call
  `requireSurface`/`requireAdmin`/`isSiteAdmin`, never re-derive access from a role name itself.

## Workflow
1. Fork/branch from `main` (`feat/<topic>`, `fix/<topic>`).
2. `make check` must be green (Biome, `tsc --noEmit`, tests ≥ 80 % coverage).
3. Update docs and `CHANGELOG.md` in the same change. API changes update `src/openapi.ts` first.
4. Open a PR using the template; one reviewer approval and green CI are required to merge.

## Commit messages
Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`.

## Reporting bugs / requesting features
Use the issue templates in `.github/ISSUE_TEMPLATE/`.
