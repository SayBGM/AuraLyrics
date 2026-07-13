# Pseudo-karaoke Analysis Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pseudo-karaoke recover from transient Spotify audio-analysis failures without delaying line lyrics, then publish the fix as AuraLyrics v1.0.2.

**Architecture:** `AudioAnalysisWaveformService` remains the single URI-keyed analysis owner and adds bounded retries, positive/negative cache lifetimes, in-flight deduplication, and generation-safe invalidation. `TrackSessionController` invalidates analysis before a manual refresh and memoizes only successful synthesis, while its existing generation guards continue to protect rendered state.

**Tech Stack:** TypeScript, Spicetify runtime API, Vitest with fake timers, npm/Vite, GitHub Actions tag release

---

## File map

- Modify `src/renderer/AudioAnalysisWaveformService.ts`: own bounded acquisition cycles, cache entries, URI generations, invalidation, and stale-request guards.
- Modify `tests/renderer/AudioAnalysisWaveformService.test.ts`: prove retry timing, exception/empty recovery, deduplication, cache expiry, explicit invalidation, and stale completion behavior.
- Modify `src/app/TrackSessionController.ts`: expose analysis invalidation through the service boundary, order refresh invalidation before profile loading, and cache only successful synthesis.
- Modify `tests/app/TrackSessionController.test.ts`: prove refresh ordering and failed-synthesis recovery while retaining existing stale-track guarantees.
- Modify `src/app/ExtensionApp.ts`: wire the controller's analysis invalidation callback to `AudioAnalysisWaveformService`.
- Modify `tests/app/ExtensionApp.test.ts`: update the two direct `TrackSessionController` test constructions to satisfy the expanded waveform-service boundary.
- Modify `package.json` and `package-lock.json`: bump the patch version from `1.0.1` to `1.0.2`.
- Generated and verify-only: `dist/aura-lyrics.js` and `release/*`; do not commit generated artifacts unless repository status shows they are already tracked.

### Task 1: Make audio-analysis acquisition bounded and recoverable

**Files:**
- Modify: `tests/renderer/AudioAnalysisWaveformService.test.ts`
- Modify: `src/renderer/AudioAnalysisWaveformService.ts:33-99`

- [ ] **Step 1: Add failing recovery and cache tests**

Add `afterEach(() => vi.useRealTimers())`, a reusable valid analysis fixture, and tests with `vi.useFakeTimers()` for these cases:

```ts
test.each([
	{ name: "undefined", first: undefined },
	{ name: "empty segments", first: { segments: [] } },
])("retries $name analysis and caches the first usable response", async ({ first }) => {
	vi.useFakeTimers();
	const usable = { segments: [{ start: 0, duration: 0.2, loudness_max: -12 }] };
	const getAudioData = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(first).mockResolvedValueOnce(usable);
	const service = new AudioAnalysisWaveformService(getAudioData);

	const analysis = service.getAnalysis(track);
	await vi.advanceTimersByTimeAsync(400);
	await vi.advanceTimersByTimeAsync(1_200);

	await expect(analysis).resolves.toBe(usable);
	await expect(service.getAnalysis(track)).resolves.toBe(usable);
	expect(getAudioData).toHaveBeenCalledTimes(3);
});

test("retries an exception and shares one in-flight cycle", async () => {
	vi.useFakeTimers();
	const usable = { segments: [{ start: 0, duration: 0.2 }] };
	const getAudioData = vi.fn().mockRejectedValueOnce(new Error("not ready")).mockResolvedValueOnce(usable);
	const service = new AudioAnalysisWaveformService(getAudioData);

	const first = service.getAnalysis(track);
	const shared = service.getAnalysis(track);
	await vi.advanceTimersByTimeAsync(400);

	await expect(first).resolves.toBe(usable);
	await expect(shared).resolves.toBe(usable);
	expect(getAudioData).toHaveBeenCalledTimes(2);
});
```

Also add focused tests proving:

- three failed attempts return `undefined` and an immediate second consumer makes no new call during the five-second negative-cache window;
- advancing past the negative-cache window starts a new bounded cycle;
- a partial response with tempo/beats but no segments is returned after exhaustion so `loadProfile()` can preserve rhythm data;
- `invalidateAnalysis(track.uri)` starts a fresh call even while an older call is unresolved;
- resolving that older call after the new call cannot replace the new positive cache entry.

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
npx vitest run tests/renderer/AudioAnalysisWaveformService.test.ts
```

Expected: FAIL because retries, negative-cache expiry, and `invalidateAnalysis` do not exist; the old service also caches `undefined` permanently.

- [ ] **Step 3: Implement retry/cache state with current-request guards**

Replace the value-only cache/in-flight maps with explicit entries:

```ts
type AnalysisCacheEntry = {
	data: AudioAnalysisData | undefined;
	expiresAt: number;
};

type InFlightAnalysis = {
	generation: number;
	promise: Promise<AudioAnalysisData | undefined>;
};

const ANALYSIS_RETRY_DELAYS_MS = [400, 1_200] as const;
const ANALYSIS_FAILURE_CACHE_MS = 5_000;
```

Implement these invariants:

```ts
private readonly analysisCache = new Map<string, AnalysisCacheEntry>();
private readonly inFlight = new Map<string, InFlightAnalysis>();
private readonly generations = new Map<string, number>();

public invalidateAnalysis(uri: string): void {
	this.generations.set(uri, this.generationFor(uri) + 1);
	this.analysisCache.delete(uri);
	this.inFlight.delete(uri);
}
```

`getAnalysis()` must:

1. return an unexpired positive or negative entry;
2. remove expired entries;
3. share only an in-flight entry whose generation matches the current URI generation;
4. start one retry cycle and retain its exact entry identity;
5. cache usable-segment results indefinitely;
6. cache exhausted results for five seconds;
7. write/delete state only if both generation and in-flight identity are still current.

The acquisition loop should catch each individual call, retain the latest non-`undefined` partial response, and stop on the first response containing a segment accepted by the existing `isUsableSegment` predicate:

```ts
private async acquireAnalysis(uri: string): Promise<AudioAnalysisData | undefined> {
	let latest: AudioAnalysisData | undefined;
	for (let attempt = 0; attempt <= ANALYSIS_RETRY_DELAYS_MS.length; attempt += 1) {
		if (attempt > 0) {
			await wait(ANALYSIS_RETRY_DELAYS_MS[attempt - 1]);
		}
		try {
			const data = await this.getAudioData?.(uri);
			latest = data ?? latest;
			if (hasUsableAnalysis(data)) return data;
		} catch {
			// Best-effort: continue the bounded acquisition cycle.
		}
	}
	return latest;
}
```

Keep `loadProfile()` behavior unchanged: usable segments produce an audio-analysis waveform; exhausted partial data may still contribute tempo; otherwise seeded bars remain the fallback.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
npx vitest run tests/renderer/AudioAnalysisWaveformService.test.ts
```

Expected: all waveform-service tests pass with fake timers and no real retry delay.

- [ ] **Step 5: Commit the service behavior**

```bash
git add src/renderer/AudioAnalysisWaveformService.ts tests/renderer/AudioAnalysisWaveformService.test.ts
git commit -m "fix: retry transient audio analysis failures"
```

### Task 2: Let failed synthesis recover and refresh force fresh analysis

**Files:**
- Modify: `tests/app/TrackSessionController.test.ts:74-220`
- Modify: `src/app/TrackSessionController.ts:32-42,97-110,193-205`
- Modify: `src/app/ExtensionApp.ts:96-104`
- Modify: `tests/app/ExtensionApp.test.ts:1009-1018,1089-1102`

- [ ] **Step 1: Add failing controller tests**

Extend `createController()` with an `invalidateAnalysis` spy and expose it in the returned harness:

```ts
const invalidateAnalysis = vi.fn();
const controller = new TrackSessionController(
	{ load, refreshCooldowns, invalidate },
	{ loadProfile, getAnalysis, invalidateAnalysis },
	buildPseudoKaraoke
);
```

Add a test that returns `null` once and synthesized lyrics on the next presentation:

```ts
test("does not memoize failed pseudo-karaoke synthesis", async () => {
	const currentTrack = track("spotify:track:retry-synthesis");
	const source = lineLyrics();
	const synthetic = syllableLyrics();
	const buildPseudoKaraoke = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(synthetic);
	const { controller } = createController({
		load: async () => ready(currentTrack, source),
		buildPseudoKaraoke,
	});

	const initial = await controller.load(currentTrack, settings(), false);
	if (!initial) throw new Error("Expected initial snapshot.");
	expect(await controller.enrichmentFor(initial)).toMatchObject({ lyrics: source, timingSource: "native" });
	expect(await controller.updateSettings(settings())).toMatchObject({ lyrics: synthetic, timingSource: "synthetic" });
	expect(buildPseudoKaraoke).toHaveBeenCalledTimes(2);
});
```

Update the refresh test to assert `invalidateAnalysis(currentTrack)` occurs before `loadProfile(currentTrack)` and before lyrics loading begins.

Add `invalidateAnalysis: vi.fn()` to the waveform-service objects passed to both direct `new TrackSessionController(...)` calls in `tests/app/ExtensionApp.test.ts`.

- [ ] **Step 2: Run controller tests to verify RED**

Run:

```bash
npx vitest run tests/app/TrackSessionController.test.ts
```

Expected: FAIL because `TrackSessionWaveformService` has no invalidation callback and `null` synthesis is memoized.

- [ ] **Step 3: Implement controller and app wiring**

Change the service boundary and successful-entry type:

```ts
export type TrackSessionWaveformService = {
	loadProfile(track: TrackIdentity): Promise<TrackWaveformProfile>;
	getAnalysis(track: TrackIdentity): Promise<AudioAnalysisData | undefined>;
	invalidateAnalysis(track: TrackIdentity): void;
};

type PseudoKaraokeEntry = {
	source: LineLyrics;
	lyrics: SyllableLyrics;
};
```

In `load()`, execute the refresh block before starting `loadProfile()`:

```ts
if (refresh) {
	this.lyricsService.refreshCooldowns();
	this.pseudoKaraokeByUri.delete(track.uri);
	this.waveformService.invalidateAnalysis(track);
}
const waveformProfilePromise = this.waveformService.loadProfile(track).catch(() => undefined);
```

In `ensurePseudoKaraoke()`, call the builder once and set the map only for a non-null result. Leave no failed entry behind.

In `ExtensionApp`, wire the new boundary without moving ownership:

```ts
invalidateAnalysis: (track) => this.waveformService.invalidateAnalysis(track.uri),
```

- [ ] **Step 4: Run focused and integration tests to verify GREEN**

Run:

```bash
npx vitest run tests/app/TrackSessionController.test.ts tests/app/ExtensionApp.test.ts tests/renderer/AudioAnalysisWaveformService.test.ts
npm run typecheck
```

Expected: all focused tests pass and TypeScript confirms every controller construction supplies the new boundary.

- [ ] **Step 5: Commit controller recovery**

```bash
git add src/app/TrackSessionController.ts src/app/ExtensionApp.ts tests/app/TrackSessionController.test.ts tests/app/ExtensionApp.test.ts
git commit -m "fix: recover pseudo karaoke after analysis failure"
```

### Task 3: Prepare patch release metadata

**Files:**
- Modify: `package.json:3`
- Modify: `package-lock.json:3,9`

- [ ] **Step 1: Bump the package version without creating a tag**

Run:

```bash
npm version 1.0.2 --no-git-tag-version
```

Expected: `package.json` and the root package entries in `package-lock.json` change from `1.0.1` to `1.0.2`; no Git tag exists yet.

- [ ] **Step 2: Verify only intended metadata changed**

Run:

```bash
git diff -- package.json package-lock.json
git diff --check
```

Expected: only the three root-version fields change and no whitespace errors are reported.

- [ ] **Step 3: Commit release metadata**

```bash
git add package.json package-lock.json
git commit -m "chore: prepare v1.0.2 release"
```

### Task 4: Verify source, behavior, build, and release assets

**Files:**
- Verify: all changed source and tests
- Generate: `dist/aura-lyrics.js`, `release/aura-lyrics.js`, `release/install.sh`, `release/install.ps1`, `release/SHA256SUMS`

- [ ] **Step 1: Run formatting/lint validation**

Run:

```bash
npm run lint
```

Expected: Biome exits 0. If formatting is required, run `npm run format`, inspect the scoped diff, and commit only resulting scoped formatting.

- [ ] **Step 2: Run the full required verification suite**

Run each command independently:

```bash
npm run typecheck
npm run test
npm run build
npm run package
```

Expected:

- TypeScript exits 0.
- All Vitest files/tests pass.
- Vite emits the single IIFE bundle at `dist/aura-lyrics.js`.
- Packaging produces exactly `aura-lyrics.js`, `install.sh`, `install.ps1`, and `SHA256SUMS` under `release/`.

- [ ] **Step 3: Verify package integrity and repository scope**

Run:

```bash
cd release && shasum -a 256 -c SHA256SUMS
git status --short
git diff --check HEAD
```

Expected: every checksum reports `OK`; status contains no unexpected tracked change and does not include the user's unrelated root-worktree `.superpowers/` directory.

- [ ] **Step 4: Commit any required scoped formatting only**

If and only if `npm run format` changed scoped source/test files:

```bash
git add src/renderer/AudioAnalysisWaveformService.ts tests/renderer/AudioAnalysisWaveformService.test.ts src/app/TrackSessionController.ts src/app/ExtensionApp.ts tests/app/TrackSessionController.test.ts tests/app/ExtensionApp.test.ts
git commit -m "style: format analysis retry changes"
```

Otherwise skip this step.

### Task 5: Review and integrate the development branch

**Files:**
- Review: all commits after `a4f049b`

- [ ] **Step 1: Invoke required review skills**

Use `superpowers:requesting-code-review` to review the complete branch diff against `docs/superpowers/specs/2026-07-13-pseudo-karaoke-analysis-retry-design.md`. Address only verified issues, rerun affected tests, and repeat review until approved.

- [ ] **Step 2: Invoke branch-finishing workflow**

Use `superpowers:finishing-a-development-branch`. Because the user explicitly requested a release, select local fast-forward integration after verifying `main` still points to the design commit and contains no overlapping tracked changes.

- [ ] **Step 3: Fast-forward main**

From the primary worktree:

```bash
git merge --ff-only codex/pseudo-karaoke-analysis-retry
```

Expected: `main` advances to the verified release-preparation commit without a merge commit; the unrelated `.superpowers/` path remains untracked and untouched.

- [ ] **Step 4: Re-run release-critical verification on integrated main**

Run:

```bash
npm run typecheck
npm run lint
npm run test
npm run package
```

Expected: all commands pass from the exact commit that will be tagged.

### Task 6: Publish and verify v1.0.2

**Files:**
- External state: `origin/main`, Git tag `v1.0.2`, GitHub Release workflow, GitHub release assets

- [ ] **Step 1: Confirm tag and release do not already exist**

Run:

```bash
git tag --list v1.0.2
gh release view v1.0.2
```

Expected: no local tag and no existing GitHub release. If either exists unexpectedly, stop before mutating release state and reconcile it.

- [ ] **Step 2: Push verified main**

Run:

```bash
git push origin main
```

Expected: `origin/main` advances to the verified v1.0.2 commit.

- [ ] **Step 3: Create and push the release tag**

Run:

```bash
git tag -a v1.0.2 -m "AuraLyrics v1.0.2"
git push origin v1.0.2
```

Expected: the tag push triggers `.github/workflows/release.yml`.

- [ ] **Step 4: Watch the GitHub release workflow to completion**

Poll for at most 60 seconds because a newly pushed tag may not appear in the Actions list immediately, then watch that exact run:

```bash
RUN_ID=""
for attempt in {1..12}; do
	RUN_ID=$(gh run list --workflow Release --event push --limit 5 --json databaseId,headBranch --jq '.[] | select(.headBranch == "v1.0.2") | .databaseId' | head -1)
	[ -n "$RUN_ID" ] && break
	sleep 5
done
test -n "$RUN_ID"
gh run watch "$RUN_ID" --exit-status
```

Expected: the workflow completes successfully after `npm ci`, typecheck, lint, test, package, artifact upload, and GitHub release publication.

- [ ] **Step 5: Verify published release and assets**

Run:

```bash
gh release view v1.0.2 --json tagName,name,isDraft,isPrerelease,url,assets
```

Expected: tag/name `v1.0.2`, not draft, not prerelease, and assets named `aura-lyrics.js`, `install.sh`, `install.ps1`, and `SHA256SUMS`.

- [ ] **Step 6: Report release evidence and clean up**

Report the release URL, passing local verification, workflow conclusion, and exact asset list. After release verification, remove the feature worktree and delete the merged feature branch according to `superpowers:finishing-a-development-branch`, preserving all user-owned unrelated files.
