# Consolidation Cache Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-engine incremental caching to the consolidation pipeline so only dirty engines are reprocessed on each analytics/board refresh.

**Architecture:** New `ConsolidationCache` class wraps the existing `consolidate()` function. Engine models notify the cache via `invalidateEngine()` calls wired in `main.ts`. The consolidator is refactored from 1 monolithic function into 6 per-engine pure functions + 1 codes function, composed back into the original `consolidate()` for backward compatibility.

**Tech Stack:** TypeScript, Vitest + jsdom

**Spec:** `docs/superpowers/specs/2026-03-20-consolidation-cache-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/analytics/data/consolidationCache.ts` | Cache class: dirty tracking, partial recompute, merge |
| Modify | `src/analytics/data/dataConsolidator.ts` | Extract 6 per-engine functions + 1 codes function; keep `consolidate()` as composition |
| Modify | `src/analytics/data/dataTypes.ts:2` | Add `EngineType` type |
| Modify | `src/core/codeDefinitionRegistry.ts:29-35` | Refactor `setOnMutate` to multi-listener (`Set<() => void>`) |
| Modify | `src/main.ts:55-58` | Adapt to new `addOnMutate` API |
| Modify | `src/analytics/index.ts:46-63` | Accept cache, use `cache.getData()` in `loadConsolidatedData()` |
| Modify | `src/main.ts:81` | Create cache, wire invalidation from models + registry |
| Create | `tests/analytics/consolidationCache.test.ts` | ~15 unit tests for cache behavior |
| Modify | `tests/analytics/performanceBenchmark.test.ts` | Add benchmark: full vs cached consolidation |
| Modify | `docs/BACKLOG.md` | Add Explorer/Detail cache item |

---

## Chunk 1: Prerequisites

### Task 1: Add `EngineType` to `dataTypes.ts`

**Files:**
- Modify: `src/analytics/data/dataTypes.ts:2`

- [ ] **Step 1: Add `EngineType` after `SourceType`**

In `src/analytics/data/dataTypes.ts`, after line 2 (`export type SourceType = ...`), add:

```typescript
/** The 6 consolidator inputs. Distinct from SourceType (7 members: csv splits into csv-segment + csv-row). */
export type EngineType = "markdown" | "csv" | "image" | "pdf" | "audio" | "video";
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "feat: adiciona tipo EngineType em dataTypes"
```

---

### Task 2: Refactor registry `setOnMutate` to multi-listener

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts:29-35`
- Modify: `src/main.ts:55`

The registry currently uses a single-slot `setOnMutate(fn)`. DataManager already occupies this slot (`main.ts:55-58`). The cache also needs to listen. Refactor to `Set<() => void>`.

- [ ] **Step 1: Write test for multi-listener behavior**

Create file `tests/core/registryMutateListeners.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('CodeDefinitionRegistry multi-listener onMutate', () => {
	it('calls all registered listeners on mutation', () => {
		const registry = new CodeDefinitionRegistry();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		registry.addOnMutate(fn1);
		registry.addOnMutate(fn2);

		registry.create('Test Code');

		expect(fn1).toHaveBeenCalledTimes(1);
		expect(fn2).toHaveBeenCalledTimes(1);
	});

	it('removeOnMutate stops calling that listener', () => {
		const registry = new CodeDefinitionRegistry();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		registry.addOnMutate(fn1);
		registry.addOnMutate(fn2);
		registry.removeOnMutate(fn1);

		registry.create('Test Code');

		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/registryMutateListeners.test.ts`
Expected: FAIL — `addOnMutate` does not exist

- [ ] **Step 3: Refactor registry to multi-listener**

In `src/core/codeDefinitionRegistry.ts`, replace the single-slot pattern:

Replace:
```typescript
private onMutate: (() => void) | null = null;
```
With:
```typescript
private onMutateListeners: Set<() => void> = new Set();
```

Replace:
```typescript
setOnMutate(fn: () => void): void {
    this.onMutate = fn;
}
```
With:
```typescript
addOnMutate(fn: () => void): void {
    this.onMutateListeners.add(fn);
}

removeOnMutate(fn: () => void): void {
    this.onMutateListeners.delete(fn);
}
```

Replace all occurrences of `this.onMutate?.()` with:
```typescript
for (const fn of this.onMutateListeners) fn();
```

There are 4 call sites: lines 77, 103, 113, 122 (in `create`, `update`, `delete`, `fromJSON` or similar). Use replace_all on the pattern.

- [ ] **Step 4: Update `main.ts` call site**

In `src/main.ts:55`, replace:
```typescript
this.sharedRegistry.setOnMutate(() => {
```
With:
```typescript
this.sharedRegistry.addOnMutate(() => {
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/registryMutateListeners.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass (no regressions from rename)

- [ ] **Step 7: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: registry setOnMutate para multi-listener (addOnMutate/removeOnMutate)"
```

---

## Chunk 2: Refactor consolidator into per-engine functions

### Task 3: Extract per-engine consolidation functions

**Files:**
- Modify: `src/analytics/data/dataConsolidator.ts`

The current `consolidate()` processes 6 engines sequentially in one function (~300 LOC). Extract each engine block into its own exported pure function. The original `consolidate()` becomes a thin composition of the 7 new functions.

- [ ] **Step 1: Write snapshot test to lock current behavior**

Create file `tests/analytics/consolidatorRefactor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { consolidate } from '../../src/analytics/data/dataConsolidator';
import type { AllEngineData } from '../../src/analytics/data/dataReader';

/** Minimal fixture with data in every engine. */
function makeFixture(): AllEngineData {
	const defs = {
		'id-a': { id: 'id-a', name: 'Alpha', color: '#FF0000' },
		'id-b': { id: 'id-b', name: 'Beta', color: '#00FF00' },
	};
	return {
		markdown: {
			markers: {
				'note.md': [
					{ id: 'm1', codes: ['Alpha', 'Beta'], range: { from: { line: 0, ch: 0 }, to: { line: 1, ch: 10 } }, fileId: 'note.md', createdAt: 1000 },
				],
			},
			settings: {} as any,
			codeDefinitions: defs,
		},
		csv: {
			segmentMarkers: [
				{ id: 'c1', codes: ['Alpha'], fileId: 'data.csv', row: 0, column: 'col1', from: 0, to: 5, createdAt: 2000 },
			],
			rowMarkers: [
				{ id: 'c2', codes: ['Beta'], fileId: 'data.csv', row: 1, column: 'col2', createdAt: 3000 },
			],
			registry: { definitions: defs },
		},
		image: {
			markers: [
				{ id: 'i1', codes: ['Alpha'], fileId: 'img.png', shape: 'rect', coords: { type: 'rect', x: 0, y: 0, w: 100, h: 100 }, createdAt: 4000 },
			],
			settings: { autoOpenImages: false, fileStates: {} },
			registry: { definitions: defs },
		},
		pdf: {
			markers: [
				{ id: 'p1', codes: ['Alpha'], fileId: 'doc.pdf', page: 0, text: 'hello', createdAt: 5000 },
			],
			shapes: [
				{ id: 'p2', codes: ['Beta'], fileId: 'doc.pdf', page: 1, shape: 'rect', createdAt: 6000 },
			],
			registry: { definitions: defs },
		},
		audio: {
			files: [
				{ path: 'clip.mp3', markers: [{ id: 'a1', codes: ['Alpha'], from: 0, to: 5, createdAt: 7000 }] },
			],
			settings: {},
			codeDefinitions: { definitions: defs },
		},
		video: {
			files: [
				{ path: 'clip.mp4', markers: [{ id: 'v1', codes: ['Beta'], from: 0, to: 10, createdAt: 8000 }] },
			],
			settings: {},
			codeDefinitions: { definitions: defs },
		},
	};
}

describe('consolidator refactor — snapshot parity', () => {
	it('consolidate() output matches snapshot', () => {
		const fixture = makeFixture();
		const result = consolidate(
			fixture.markdown, fixture.csv, fixture.image,
			fixture.pdf, fixture.audio, fixture.video,
		);
		// Ignore lastUpdated (timestamp)
		const { lastUpdated, ...stable } = result;
		expect(stable).toMatchSnapshot();
	});

	it('per-engine functions produce same markers as monolithic', () => {
		const fixture = makeFixture();
		const monolithic = consolidate(
			fixture.markdown, fixture.csv, fixture.image,
			fixture.pdf, fixture.audio, fixture.video,
		);

		// Import per-engine functions (will exist after refactor)
		// This test will fail until Step 3 is done — that's expected
		const {
			consolidateMarkdown, consolidateCsv, consolidateImage,
			consolidatePdf, consolidateAudio, consolidateVideo, consolidateCodes,
		} = require('../../src/analytics/data/dataConsolidator');

		const md = consolidateMarkdown(fixture.markdown);
		const csv = consolidateCsv(fixture.csv);
		const img = consolidateImage(fixture.image);
		const pdf = consolidatePdf(fixture.pdf);
		const aud = consolidateAudio(fixture.audio);
		const vid = consolidateVideo(fixture.video);
		const allMarkers = [...md.markers, ...csv.markers, ...img.markers, ...pdf.markers, ...aud.markers, ...vid.markers];

		expect(allMarkers).toEqual(monolithic.markers);

		// Codes: needs registry defs + all markers + active engines
		const defs = fixture.markdown.codeDefinitions;
		const activeEngines = [md, csv, img, pdf, aud, vid]
			.filter(s => s.hasData)
			.map((_, i) => (['markdown', 'csv', 'image', 'pdf', 'audio', 'video'] as const)[i]);
		const codes = consolidateCodes(allMarkers, defs, [...activeEngines]);
		expect(codes).toEqual(monolithic.codes);

		// sources record preserved
		expect(monolithic.sources.markdown).toBe(md.hasData);
		expect(monolithic.sources.csv).toBe(csv.hasData);
	});
});
```

- [ ] **Step 2: Run snapshot test — first test passes, second fails**

Run: `npx vitest run tests/analytics/consolidatorRefactor.test.ts`
Expected: first test PASS (creates snapshot), second test FAIL (per-engine functions don't exist yet)

- [ ] **Step 3: Extract per-engine functions from `consolidate()`**

In `src/analytics/data/dataConsolidator.ts`:

1. Export `extractCodes` and `mergeDef` (currently private) — the per-engine functions need them
2. Extract each `// ── Engine ──` block into its own exported function:
   - `consolidateMarkdown(data: MarkdownEngineData | null): UnifiedMarker[]` — lines 60-89
   - `consolidateCsv(data: CsvEngineData | null): UnifiedMarker[]` — lines 92-134
   - `consolidateImage(data: ImageEngineData | null): UnifiedMarker[]` — lines 137-162
   - `consolidatePdf(data: PdfEngineData | null): UnifiedMarker[]` — lines 165-210
   - `consolidateAudio(data: AudioEngineData | null): UnifiedMarker[]` — lines 213-238
   - `consolidateVideo(data: VideoEngineData | null): UnifiedMarker[]` — lines 241-266
   - `consolidateCodes(allMarkers: UnifiedMarker[], definitions: Record<string, CodeDefinition>): UnifiedCode[]` — lines 268-288 + mergeDef logic from each engine
3. Each per-engine function returns `EngineSlice` — markers + a boolean `hasData` indicating if the engine had raw data (regardless of coded markers):

```typescript
export interface EngineSlice {
  markers: UnifiedMarker[];
  hasData: boolean;  // preserves original `sources` semantics: true if raw data exists
}
```

   Each function sets `hasData` using the same checks as the original (e.g., `markdownData?.markers != null`, `Array.isArray(imageData?.markers)`, etc.).

4. `consolidateCodes` handles ALL code definition merging:
   - Takes `definitions` (the shared registry defs, same across all engines) + `allMarkers` + `activeEngines` (which engines have data, for source tracking on definitions)
   - Builds `codeMap` from definitions — for each engine that `hasData`, adds its source type to the definition's sources set (replicates the per-engine `mergeDef` calls from the original)
   - Then discovers codes in markers not in definitions (fallback with `#6200EE`)
   - Returns sorted `UnifiedCode[]`

```typescript
export function consolidateCodes(
  allMarkers: UnifiedMarker[],
  definitions: Record<string, CodeDefinition>,
  activeEngines: EngineType[],
): UnifiedCode[]
```

   The `activeEngines` parameter tells `consolidateCodes` which engines contributed data, so it can add the correct source types when merging definitions. The mapping from `EngineType` to `SourceType` for definitions is: `markdown → "markdown"`, `csv → "csv-segment"`, `image → "image"`, `pdf → "pdf"`, `audio → "audio"`, `video → "video"` (matches the original `mergeDef` source arguments).
5. Rewrite `consolidate()` as composition:

```typescript
export function consolidate(
  markdownData: MarkdownEngineData | null,
  csvData: CsvEngineData | null,
  imageData: ImageEngineData | null,
  pdfData: PdfEngineData | null = null,
  audioData: AudioEngineData | null = null,
  videoData: VideoEngineData | null = null,
): ConsolidatedData {
  const md = consolidateMarkdown(markdownData);
  const csv = consolidateCsv(csvData);
  const img = consolidateImage(imageData);
  const pdf = consolidatePdf(pdfData);
  const aud = consolidateAudio(audioData);
  const vid = consolidateVideo(videoData);
  const markers = [...md.markers, ...csv.markers, ...img.markers, ...pdf.markers, ...aud.markers, ...vid.markers];

  // Collect definitions from any engine (all share same registry via readAllData)
  const defs = markdownData?.codeDefinitions
    ?? csvData?.registry?.definitions
    ?? imageData?.registry?.definitions
    ?? pdfData?.registry?.definitions
    ?? audioData?.codeDefinitions?.definitions
    ?? videoData?.codeDefinitions?.definitions
    ?? {};

  // Which engines have data — for source tracking on definitions
  const activeEngines: EngineType[] = [];
  if (md.hasData) activeEngines.push('markdown');
  if (csv.hasData) activeEngines.push('csv');
  if (img.hasData) activeEngines.push('image');
  if (pdf.hasData) activeEngines.push('pdf');
  if (aud.hasData) activeEngines.push('audio');
  if (vid.hasData) activeEngines.push('video');

  const codes = consolidateCodes(markers, defs, activeEngines);

  return {
    markers,
    codes,
    sources: {
      markdown: md.hasData,   // preserves original semantics: "data exists", not "markers exist"
      csv: csv.hasData,
      image: img.hasData,
      pdf: pdf.hasData,
      audio: aud.hasData,
      video: vid.hasData,
    },
    lastUpdated: Date.now(),
  };
}
```

- [ ] **Step 4: Also export the engine data interfaces**

The per-engine interfaces (`MarkdownEngineData`, `CsvEngineData`, etc.) at the top of `dataConsolidator.ts` need to be exported so the cache can reference them. Add `export` to each:

```typescript
export interface MarkdownEngineData { ... }
export interface CsvEngineData { ... }
export interface ImageEngineData { ... }
export interface PdfEngineData { ... }
export interface AudioEngineData { ... }
export interface VideoEngineData { ... }
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: all pass. The snapshot test confirms output parity. The per-engine parity test should now also pass.

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: extrai funcoes de consolidacao por engine do consolidate()"
```

---

## Chunk 3: ConsolidationCache + tests

### Task 4: Create `ConsolidationCache` class

**Files:**
- Create: `src/analytics/data/consolidationCache.ts`

- [ ] **Step 1: Write the cache tests first**

Create file `tests/analytics/consolidationCache.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsolidationCache } from '../../src/analytics/data/consolidationCache';
import { consolidate } from '../../src/analytics/data/dataConsolidator';
import type { AllEngineData } from '../../src/analytics/data/dataReader';
import type { EngineType } from '../../src/analytics/data/dataTypes';

// Reuse the fixture from consolidatorRefactor.test.ts concept
function makeFixture(): AllEngineData {
	const defs = {
		'id-a': { id: 'id-a', name: 'Alpha', color: '#FF0000' },
		'id-b': { id: 'id-b', name: 'Beta', color: '#00FF00' },
	};
	return {
		markdown: {
			markers: {
				'note.md': [
					{ id: 'm1', codes: ['Alpha', 'Beta'], range: { from: { line: 0, ch: 0 }, to: { line: 1, ch: 10 } }, fileId: 'note.md', createdAt: 1000 },
				],
			},
			settings: {} as any,
			codeDefinitions: defs,
		},
		csv: {
			segmentMarkers: [
				{ id: 'c1', codes: ['Alpha'], fileId: 'data.csv', row: 0, column: 'col1', from: 0, to: 5, createdAt: 2000 },
			],
			rowMarkers: [],
			registry: { definitions: defs },
		},
		image: { markers: [], settings: { autoOpenImages: false, fileStates: {} }, registry: { definitions: defs } },
		pdf: { markers: [], shapes: [], registry: { definitions: defs } },
		audio: { files: [], settings: {}, codeDefinitions: { definitions: defs } },
		video: { files: [], settings: {}, codeDefinitions: { definitions: defs } },
	};
}

function fullConsolidate(raw: AllEngineData) {
	return consolidate(raw.markdown, raw.csv, raw.image, raw.pdf, raw.audio, raw.video);
}

describe('ConsolidationCache', () => {
	let cache: ConsolidationCache;
	let fixture: AllEngineData;
	let readFn: () => AllEngineData;

	beforeEach(() => {
		cache = new ConsolidationCache();
		fixture = makeFixture();
		readFn = vi.fn(() => fixture);
	});

	it('first call computes everything (cache miss)', async () => {
		const result = await cache.getData(readFn);
		expect(result.markers.length).toBeGreaterThan(0);
		expect(readFn).toHaveBeenCalledTimes(1);
	});

	it('second call without invalidation returns cached (reference ===)', async () => {
		const first = await cache.getData(readFn);
		const second = await cache.getData(readFn);
		expect(second).toBe(first);
		// readFn NOT called again
		expect(readFn).toHaveBeenCalledTimes(1);
	});

	it('invalidateEngine marks only that engine dirty', async () => {
		await cache.getData(readFn);
		cache.invalidateEngine('markdown');
		const result = await cache.getData(readFn);
		expect(result).not.toBe(undefined);
		expect(readFn).toHaveBeenCalledTimes(2);
	});

	it('invalidateEngine for multiple engines reprocesses all dirty', async () => {
		await cache.getData(readFn);
		cache.invalidateEngine('markdown');
		cache.invalidateEngine('csv');
		const result = await cache.getData(readFn);
		expect(result.markers.length).toBeGreaterThan(0);
	});

	it('invalidateRegistry recalculates codes but not markers', async () => {
		const first = await cache.getData(readFn);
		const markersBefore = first.markers;
		cache.invalidateRegistry();
		const second = await cache.getData(readFn);
		// markers array content should be equal (not reprocessed)
		expect(second.markers).toEqual(markersBefore);
		// But result object is new (codes rebuilt)
		expect(second).not.toBe(first);
	});

	it('invalidateAll recomputes everything', async () => {
		const first = await cache.getData(readFn);
		cache.invalidateAll();
		const second = await cache.getData(readFn);
		expect(second).not.toBe(first);
		expect(readFn).toHaveBeenCalledTimes(2);
	});

	it('output matches full consolidate()', async () => {
		const cached = await cache.getData(readFn);
		const full = fullConsolidate(fixture);
		// Compare everything except lastUpdated
		expect(cached.markers).toEqual(full.markers);
		expect(cached.codes).toEqual(full.codes);
		expect(cached.sources).toEqual(full.sources);
	});

	it('multiple invalidations before getData collapse into one recompute', async () => {
		await cache.getData(readFn);
		cache.invalidateEngine('markdown');
		cache.invalidateEngine('markdown');
		cache.invalidateEngine('markdown');
		const result = await cache.getData(readFn);
		// readFn called only twice total (initial + 1 recompute)
		expect(readFn).toHaveBeenCalledTimes(2);
		expect(result.markers.length).toBeGreaterThan(0);
	});

	it('engine with null data works without error', async () => {
		// Override pdf to null
		const nullFixture = { ...makeFixture(), pdf: null as any };
		const nullReadFn = vi.fn(() => nullFixture);
		const nullCache = new ConsolidationCache();
		const result = await nullCache.getData(nullReadFn);
		expect(result.sources.pdf).toBe(false);
	});

	it('sources record reflects hasData (original semantics: data exists, not markers exist)', async () => {
		const result = await cache.getData(readFn);
		// markdown has markers object → true
		expect(result.sources.markdown).toBe(true);
		// csv has segmentMarkers array → true
		expect(result.sources.csv).toBe(true);
		// image has markers: [] (Array.isArray = true) → true (data exists, even if empty)
		expect(result.sources.image).toBe(true);
		// pdf has markers: [] → true
		expect(result.sources.pdf).toBe(true);
		// audio has files: [] → false (Array.isArray is true but empty = no files)
		expect(result.sources.audio).toBe(true);
		// video same
		expect(result.sources.video).toBe(true);
	});

	it('registry + engine dirty together reprocesses both', async () => {
		const first = await cache.getData(readFn);
		cache.invalidateEngine('csv');
		cache.invalidateRegistry();
		const second = await cache.getData(readFn);
		expect(second).not.toBe(first);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/analytics/consolidationCache.test.ts`
Expected: FAIL — `ConsolidationCache` does not exist

- [ ] **Step 3: Implement `ConsolidationCache`**

Create `src/analytics/data/consolidationCache.ts`:

```typescript
import type { EngineType } from './dataTypes';
import type { ConsolidatedData, UnifiedMarker, UnifiedCode } from './dataTypes';
import type { AllEngineData } from './dataReader';
import {
	consolidateMarkdown, consolidateCsv, consolidateImage,
	consolidatePdf, consolidateAudio, consolidateVideo,
	consolidateCodes,
	type EngineSlice,
} from './dataConsolidator';

const ALL_ENGINES: EngineType[] = ['markdown', 'csv', 'image', 'pdf', 'audio', 'video'];

export class ConsolidationCache {
	private cachedData: ConsolidatedData | null = null;
	private dirtyEngines = new Set<EngineType>();
	private registryDirty = false;
	private engineSlices = new Map<EngineType, EngineSlice>();

	invalidateEngine(engine: EngineType): void {
		this.dirtyEngines.add(engine);
	}

	invalidateRegistry(): void {
		this.registryDirty = true;
	}

	invalidateAll(): void {
		for (const e of ALL_ENGINES) this.dirtyEngines.add(e);
		this.registryDirty = true;
	}

	async getData(readFn: () => AllEngineData): Promise<ConsolidatedData> {
		// Cache hit — nothing dirty
		if (this.cachedData && this.dirtyEngines.size === 0 && !this.registryDirty) {
			return this.cachedData;
		}

		const isFirstCall = this.cachedData === null;
		if (isFirstCall) {
			for (const e of ALL_ENGINES) this.dirtyEngines.add(e);
			this.registryDirty = true;
		}

		const raw = readFn();

		// Reprocess only dirty engines
		const engineFns: Record<EngineType, (data: AllEngineData) => EngineSlice> = {
			markdown: (d) => consolidateMarkdown(d.markdown),
			csv: (d) => consolidateCsv(d.csv),
			image: (d) => consolidateImage(d.image),
			pdf: (d) => consolidatePdf(d.pdf),
			audio: (d) => consolidateAudio(d.audio),
			video: (d) => consolidateVideo(d.video),
		};

		for (const engine of this.dirtyEngines) {
			this.engineSlices.set(engine, engineFns[engine](raw));
		}

		// Merge all slices
		const markers: UnifiedMarker[] = [];
		for (const engine of ALL_ENGINES) {
			const slice = this.engineSlices.get(engine);
			if (slice) markers.push(...slice.markers);
		}

		// Rebuild codes if any engine or registry changed
		let codes: UnifiedCode[];
		if (this.registryDirty || this.dirtyEngines.size > 0) {
			const defs = raw.markdown?.codeDefinitions
				?? raw.csv?.registry?.definitions
				?? raw.image?.registry?.definitions
				?? raw.pdf?.registry?.definitions
				?? raw.audio?.codeDefinitions?.definitions
				?? raw.video?.codeDefinitions?.definitions
				?? {};
			// Determine which engines have data (for source tracking on definitions)
			const activeEngines: EngineType[] = [];
			for (const engine of ALL_ENGINES) {
				if (this.engineSlices.get(engine)?.hasData) activeEngines.push(engine);
			}
			codes = consolidateCodes(markers, defs, activeEngines);
		} else {
			codes = this.cachedData!.codes;
		}

		// Rebuild sources from hasData (preserves original semantics)
		const sources = {
			markdown: this.engineSlices.get('markdown')?.hasData ?? false,
			csv: this.engineSlices.get('csv')?.hasData ?? false,
			image: this.engineSlices.get('image')?.hasData ?? false,
			pdf: this.engineSlices.get('pdf')?.hasData ?? false,
			audio: this.engineSlices.get('audio')?.hasData ?? false,
			video: this.engineSlices.get('video')?.hasData ?? false,
		};

		// Clear dirty state
		this.dirtyEngines.clear();
		this.registryDirty = false;

		this.cachedData = { markers, codes, sources, lastUpdated: Date.now() };
		return this.cachedData;
	}
}
```

- [ ] **Step 4: Run cache tests**

Run: `npx vitest run tests/analytics/consolidationCache.test.ts`
Expected: all PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "feat: ConsolidationCache com invalidacao por engine e registry"
```

---

## Chunk 4: Wiring + integration

### Task 5: Wire cache into analytics + main

**Files:**
- Modify: `src/analytics/index.ts:46-63`
- Modify: `src/main.ts:81`

- [ ] **Step 1: Modify `registerAnalyticsEngine` to accept and use cache**

In `src/analytics/index.ts`, add import at top:

```typescript
import type { ConsolidationCache } from './data/consolidationCache';
```

Change function signature from:
```typescript
export function registerAnalyticsEngine(plugin: QualiaCodingPlugin): () => void {
```
To:
```typescript
export function registerAnalyticsEngine(plugin: QualiaCodingPlugin, cache?: ConsolidationCache): () => void {
```

Replace `loadConsolidatedData` body (lines 52-63):

```typescript
async loadConsolidatedData(): Promise<ConsolidatedData> {
    if (cache) {
        api.data = await cache.getData(() => readAllData(plugin.dataManager));
    } else {
        const raw = readAllData(plugin.dataManager);
        api.data = consolidate(
            raw.markdown, raw.csv, raw.image,
            raw.pdf, raw.audio, raw.video,
        );
    }
    return api.data!;
},
```

- [ ] **Step 2: Create cache and wire invalidation in `main.ts`**

In `src/main.ts`, add import:

```typescript
import { ConsolidationCache } from './analytics/data/consolidationCache';
```

Replace line 81 (`this.cleanups.push(registerAnalyticsEngine(this));`) with:

```typescript
// Consolidation cache — per-engine dirty tracking
const consolidationCache = new ConsolidationCache();
this.cleanups.push(registerAnalyticsEngine(this, consolidationCache));
```

After the existing model extraction block (after line 92 `const videoModel = video.model;`), add the wiring:

```typescript
// Wire engine models → consolidation cache invalidation
mdModel.onChange(() => consolidationCache.invalidateEngine('markdown'));
pdfModel.onChange(() => consolidationCache.invalidateEngine('pdf'));
imageModel.onChange(() => consolidationCache.invalidateEngine('image'));
csvModel.onChange(() => consolidationCache.invalidateEngine('csv'));
audioModel.onChange(() => consolidationCache.invalidateEngine('audio'));
videoModel.onChange(() => consolidationCache.invalidateEngine('video'));

// Registry mutations → invalidate codes
this.sharedRegistry.addOnMutate(() => consolidationCache.invalidateRegistry());
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: integra ConsolidationCache no pipeline analytics via main.ts"
```

---

### Task 6: Add benchmark comparison

**Files:**
- Modify: `tests/analytics/performanceBenchmark.test.ts`

- [ ] **Step 1: Add consolidation cache benchmark at end of file**

Before the final "prints benchmark summary" test, add:

```typescript
describe('consolidation cache vs full', () => {
	const { data: xlData } = generateData(5000, 50, 100);

	it('full consolidate baseline', () => {
		const ms = bench('consolidate-full', () => {
			consolidate(
				{ markers: {}, codeDefinitions: {} } as any, // empty placeholder
				null, null, null, null, null,
			);
		});
		// Just log — no threshold
		console.log(`consolidate() full empty: ${ms.toFixed(1)}ms`);
	});

	it('cache hit is near-zero', async () => {
		const { ConsolidationCache } = await import('../../src/analytics/data/consolidationCache');
		const cache = new ConsolidationCache();
		const fixture = {
			markdown: { markers: {}, settings: {} as any, codeDefinitions: {} },
			csv: { segmentMarkers: [], rowMarkers: [], registry: { definitions: {} } },
			image: { markers: [], settings: { autoOpenImages: false, fileStates: {} }, registry: { definitions: {} } },
			pdf: { markers: [], shapes: [], registry: { definitions: {} } },
			audio: { files: [], settings: {}, codeDefinitions: { definitions: {} } },
			video: { files: [], settings: {}, codeDefinitions: { definitions: {} } },
		};
		// Prime cache
		await cache.getData(() => fixture as any);
		// Measure cache hit
		const start = performance.now();
		await cache.getData(() => fixture as any);
		const ms = performance.now() - start;
		console.log(`cache hit (no dirty): ${ms.toFixed(3)}ms`);
		expect(ms).toBeLessThan(1); // should be sub-millisecond
	});
});
```

Add import at top of file:

```typescript
import { consolidate } from '../../src/analytics/data/dataConsolidator';
```

- [ ] **Step 2: Run benchmark**

Run: `npx vitest run tests/analytics/performanceBenchmark.test.ts --reporter=verbose`
Expected: all pass, cache hit shows sub-millisecond time

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "test: benchmark comparativo consolidation cache vs full"
```

---

## Chunk 5: Documentation + cleanup

### Task 7: Update BACKLOG.md with Explorer/Detail cache item

**Files:**
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Add new section after "10. Propostas tecnicas"**

Add at the end of BACKLOG.md, before the last `---` (if any):

```markdown
### Explorer/Detail view cache por engine

**Problema:** `UnifiedModelAdapter.getAllMarkers()` + `BaseCodeExplorerView.renderTree()` re-renderizam em cascata quando qualquer engine muda. Com milhares de markers, rebuild da tree DOM pode ficar pesado.

**Solucao proposta:** mesma pattern do `ConsolidationCache` — cache por engine no `UnifiedModelAdapter`, dirty flag nos listeners, rebuild parcial da tree. Atacar quando benchmark mostrar gargalo.
```

- [ ] **Step 2: Commit**

```bash
~/.claude/scripts/commit.sh "docs: adiciona item Explorer/Detail cache no BACKLOG"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 3: Run benchmark**

Run: `npx vitest run tests/analytics/performanceBenchmark.test.ts --reporter=verbose`
Expected: all pass, sub-millisecond cache hits confirmed

- [ ] **Step 4: Copy build artifacts to demo vault**

Run: `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`

- [ ] **Step 5: Final commit if any loose changes**

```bash
~/.claude/scripts/commit.sh "chore: rebuild demo vault com ConsolidationCache"
```
