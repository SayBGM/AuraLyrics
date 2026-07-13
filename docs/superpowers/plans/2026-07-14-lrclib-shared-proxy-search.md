# LRCLIB Shared Proxy and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route LRCLIB through the existing custom proxy and replace exact lookup with prioritized field and broad searches that select the best synchronized candidate.

**Architecture:** Keep persisted Musixmatch proxy settings stable while exposing their resolved value as provider-neutral context. Share deterministic proxy URL construction, then keep LRCLIB search, validation, ranking, and error classification inside `LrclibProvider`.

**Tech Stack:** TypeScript, Vitest, jsdom, Biome, Vite

---

### Task 1: Shared proxy contract

**Files:**
- Create: `src/lyrics/providers/urlProxy.ts`
- Create: `tests/lyrics/urlProxy.test.ts`
- Modify: `src/lyrics/providers/musixmatchProxy.ts`
- Modify: `src/lyrics/types.ts`
- Modify: `src/app/ExtensionApp.ts`
- Modify: Musixmatch provider tests and call sites that construct `ProviderContext`

- [x] Write tests for direct and encoded proxy URL construction and a provider context using `proxyBaseUrl`.
- [x] Run the focused tests and typecheck to observe the expected failures.
- [x] Implement the pure URL helper, migrate Musixmatch to it, and rename only the internal context property.
- [x] Run proxy, Musixmatch, settings, and app tests plus typecheck.

### Task 2: Prioritized LRCLIB searches

**Files:**
- Modify: `src/lyrics/providers/LrclibProvider.ts`
- Modify: `tests/lyrics/LrclibProvider.test.ts`

- [x] Write a failing test for the field-specific search URL and one-request success path.
- [x] Implement the minimal field-search array decoding path and verify the test passes.
- [x] Write failing tests that apply `proxyBaseUrl` to both field and broad LRCLIB upstream URLs, retain `x-user-agent`, never call Cosmos, preserve direct URLs without a proxy, and encode the complete upstream URL exactly once after its own query parameters are encoded.
- [x] Apply the shared proxy helper to every LRCLIB fetch and verify the proxy-focused tests pass.
- [x] Write failing tests for empty, 404, and unsynchronized fallback to `q=<title> <artist>`.
- [x] Implement the minimal strict two-request fallback and verify focused tests pass.
- [x] Write failing tests that independently lock title, artist, album, duration, and original API-order ranking; cover malformed records and instrumental-only results accumulated across both searches.
- [x] Implement candidate validation and tuple ranking, preserving 429, 5xx, other HTTP, network, JSON, and schema error classifications.
- [x] Run the complete LRCLIB provider test file.

### Task 3: Settings presentation and documentation

**Files:**
- Modify: `src/settings/settingsTranslations.ts`
- Modify: `tests/settings/settingsSchema.test.ts` or the closest existing translation completeness test
- Modify: `docs/superpowers/specs/2026-07-13-lrclib-shared-proxy-design.md`

- [x] Write or update the assertion that the shared proxy copy is present in English, Korean, and Japanese.
- [x] Run the focused settings test and observe the expected failure.
- [x] Update the three translations without renaming persisted settings fields.
- [x] Run focused settings tests and review the design document for consistency with the implementation.

### Task 4: Verification and handoff

- [x] Run `npm run typecheck` and confirm exit code 0.
- [x] Run `npm run lint` and confirm exit code 0 without rewriting files.
- [x] Run `npm run test` and confirm all tests pass.
- [x] Run `npm run build` and confirm the IIFE bundle succeeds.
- [x] Review the final diff against every requirement and commit only scoped files.
