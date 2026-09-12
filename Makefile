# ARAG Showroom — task runner. bun installs dev tooling only; npm is never used.
BUN ?= bun
NODE ?= node
.PHONY: help install dev start test coverage e2e lint typecheck check docs sync-content showcase screenshots docker fly-validate
help:
	@echo "make install    bun install (dev tooling, exact pins)"
	@echo "make dev        run with --watch on :8080 (no credentials needed)"
	@echo "make start      run in production mode"
	@echo "make test       unit + integration + contract tests (node:test)"
	@echo "make coverage   tests with coverage gate (80% lines on src/)"
	@echo "make e2e        Playwright end-to-end journeys against a locally booted portal"
	@echo "make check      lint + typecheck + coverage"
	@echo "make sync-content  copy docs/enablement/showcase from the sibling product repos into content/"
	@echo "make showcase   record the showcase walkthrough (video + screenshots) into showcase/out"
	@echo "make screenshots  full-page reference screenshots of the public site into docs/screenshots"
	@echo "make docker     build the container image"
	@echo "make fly-validate  validate fly.toml"
install:
	$(BUN) install --frozen-lockfile || $(BUN) install
dev:
	@test -f .env || cp .env.example .env
	$(NODE) --watch src/index.ts
start:
	$(NODE) src/index.ts
test:
	$(NODE) --test --test-reporter=spec 'test/*.test.ts'
coverage:
	$(NODE) --test --experimental-test-coverage --test-coverage-include='src/**' --test-coverage-lines=80 'test/*.test.ts'
# PW_DISABLE_TS_ESM=1: Playwright's ESM TypeScript loader hangs on Node >= 26 (module.register deprecation); the CJS transform works everywhere.
e2e:
	rm -rf data/e2e
	PW_DISABLE_TS_ESM=1 $(BUN)x playwright test
lint:
	$(BUN)x biome check .
typecheck:
	$(BUN)x tsc --noEmit -p tsconfig.json
check: lint typecheck coverage
sync-content:
	$(NODE) scripts/sync-content.ts $(PRODUCT)
showcase:
	rm -rf data/e2e showcase/out
	PW_DISABLE_TS_ESM=1 SHOWCASE=1 $(BUN)x playwright test showcase/record.spec.ts --config playwright.config.ts
screenshots:
	rm -rf data/e2e docs/screenshots && mkdir -p docs/screenshots
	PW_DISABLE_TS_ESM=1 SCREENSHOTS=1 $(BUN)x playwright test showcase/screenshots.spec.ts --config playwright.config.ts
docker:
	docker build -t arag-showroom:local .
fly-validate:
	fly config validate -c fly.toml
