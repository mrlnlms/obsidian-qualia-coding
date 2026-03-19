# Code Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all actionable issues found in the project health code review (0 critical, 5 important, 4 suggestions).

**Architecture:** Each task is a self-contained fix with tests. No breaking changes. Fixes are ordered from quickest/most impactful to larger refactors.

**Tech Stack:** TypeScript, Vitest + jsdom, Obsidian API

---

## Chunk 1: Quick Fixes (Tasks 1–4)

### Task 1: Fix dashboard KPI — missing audio/video in "Active Sources"

Bug: `dashboardMode.ts` line 21-26 counts only 4 of 6 source flags, omitting audio and video.

**Files:**
- Modify: `src/analytics/views/modes/dashboardMode.ts:21-26`
- Create: `tests/analytics/dashboardMode.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/analytics/dashboardMode.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', () => ({
  setIcon: vi.fn(),
  Notice: vi.fn(),
}));

import type { ConsolidatedData, FilterConfig } from '../../src/analytics/data/dataTypes';
import type { AnalyticsViewContext } from '../../src/analytics/views/analyticsViewContext';
import { renderDashboard } from '../../src/analytics/views/modes/dashboardMode';

function makeData(overrides: Partial<ConsolidatedData['sources']> = {}): ConsolidatedData {
  return {
    markers: [],
    codes: [],
    sources: { markdown: false, csv: false, image: false, pdf: false, audio: false, video: false, ...overrides },
    lastUpdated: Date.now(),
  };
}

function makeCtx(data: ConsolidatedData): AnalyticsViewContext {
  const container = document.createElement('div');
  return {
    plugin: { addKpiCardToBoard: vi.fn() } as any,
    data,
    chartContainer: container,
    configPanelEl: null,
    footerEl: null,
    viewMode: 'dashboard',
    sortMode: 'freq-desc',
    groupMode: 'none',
    displayMode: 'absolute',
    showEdgeLabels: true,
    minEdgeWeight: 1,
    enabledSources: new Set(['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video']),
    enabledCodes: new Set(),
    minFrequency: 1,
    codeSearch: '',
    matrixSortMode: 'alpha',
    cooccSortMode: 'alpha',
    evolutionFile: '',
    wcStopWordsLang: 'both',
    wcMinWordLength: 3,
    wcMaxWords: 100,
    acmShowMarkers: true,
    acmShowCodeLabels: true,
    mdsMode: 'codes',
    mdsShowLabels: true,
    dendrogramMode: 'codes',
    dendrogramCutDistance: 0.5,
    lagValue: 1,
    tsSort: { col: 'totalWords', asc: false },
    polarFocalCode: '',
    polarMaxLag: 5,
    chiGroupBy: 'source',
    chiSort: { col: 'pValue', asc: true },
    dtOutcomeCode: '',
    dtMaxDepth: 4,
    srcCompSubView: 'chart',
    srcCompDisplayMode: 'count',
    srcCompSort: { col: 'total', asc: false },
    trSearch: '',
    trGroupBy: 'code',
    trSegments: [],
    trCollapsed: new Set(),
    buildFilterConfig: () => ({ sources: ['markdown','csv-segment','csv-row','image','pdf','audio','video'], codes: [], excludeCodes: [], minFrequency: 1 }),
    scheduleUpdate: vi.fn(),
    renderConfigPanel: vi.fn(),
  };
}

describe('renderDashboard', () => {
  it('counts all 6 source types including audio and video', () => {
    const data = makeData({ markdown: true, csv: true, image: true, pdf: true, audio: true, video: true });
    const ctx = makeCtx(data);
    renderDashboard(ctx, ctx.buildFilterConfig());

    const kpiValues = ctx.chartContainer!.querySelectorAll('.codemarker-kpi-value');
    // 4th KPI is "Active Sources"
    const activeSourcesKpi = kpiValues[3];
    expect(activeSourcesKpi?.textContent).toBe('6');
  });

  it('counts audio-only as 1 active source', () => {
    const data = makeData({ audio: true });
    const ctx = makeCtx(data);
    renderDashboard(ctx, ctx.buildFilterConfig());

    const kpiValues = ctx.chartContainer!.querySelectorAll('.codemarker-kpi-value');
    const activeSourcesKpi = kpiValues[3];
    expect(activeSourcesKpi?.textContent).toBe('1');
  });

  it('counts video-only as 1 active source', () => {
    const data = makeData({ video: true });
    const ctx = makeCtx(data);
    renderDashboard(ctx, ctx.buildFilterConfig());

    const kpiValues = ctx.chartContainer!.querySelectorAll('.codemarker-kpi-value');
    const activeSourcesKpi = kpiValues[3];
    expect(activeSourcesKpi?.textContent).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analytics/dashboardMode.test.ts`
Expected: FAIL — activeSources shows 4 instead of 6

- [ ] **Step 3: Fix dashboardMode.ts — add audio and video to activeSources**

In `src/analytics/views/modes/dashboardMode.ts`, change lines 21-26:

```typescript
  const activeSources = [
    ctx.data.sources.markdown,
    ctx.data.sources.csv,
    ctx.data.sources.image,
    ctx.data.sources.pdf,
    ctx.data.sources.audio,
    ctx.data.sources.video,
  ].filter(Boolean).length;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/analytics/dashboardMode.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "fix: inclui audio e video no KPI 'Active Sources' do dashboard"
```

---

### Task 2: Untrack `main.js` from git

`main.js` is tracked by git but documented as a build artifact. The demo vault copy is the only one that should be committed.

**Files:**
- Modify: `.gitignore`
- Untrack: `main.js`

- [ ] **Step 1: Add `main.js` to `.gitignore`**

Add `main.js` to `.gitignore` (before `node_modules/`).

- [ ] **Step 2: Remove `main.js` from git tracking**

Run: `git rm --cached main.js`

- [ ] **Step 3: Verify demo copy is still tracked**

Run: `git ls-files demo/.obsidian/plugins/qualia-coding/main.js`
Expected: file is listed (still tracked)

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "chore: remove main.js do tracking git (artefato de build)"
```

---

### Task 3: PdfCodingModel — migrate listeners from array to Set

Inconsistent with MediaCodingModel which uses `Set`. Array allows duplicate registrations.

**Files:**
- Modify: `src/pdf/pdfCodingModel.ts:26-27,56-81`
- Modify: `tests/pdf/highlightGeometry.test.ts` (if needed — check for listener usage)
- Create: `tests/pdf/pdfCodingModel.test.ts`

- [ ] **Step 1: Write failing test for duplicate listener prevention**

```typescript
// tests/pdf/pdfCodingModel.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PdfCodingModel } from '../../src/pdf/pdfCodingModel';

function makePdfModel(): PdfCodingModel {
  const dm = {
    section: vi.fn().mockReturnValue({}),
    setSection: vi.fn(),
  } as any;
  const registry = {
    getAll: vi.fn().mockReturnValue([]),
    create: vi.fn(),
    getByName: vi.fn(),
  } as any;
  return new PdfCodingModel(dm, registry);
}

describe('PdfCodingModel listeners', () => {
  it('does not call duplicate onChange listener twice', () => {
    const model = makePdfModel();
    const fn = vi.fn();
    model.onChange(fn);
    model.onChange(fn); // duplicate
    model.notify();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('offChange removes listener', () => {
    const model = makePdfModel();
    const fn = vi.fn();
    model.onChange(fn);
    model.offChange(fn);
    model.notify();
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not call duplicate onHoverChange listener twice', () => {
    const model = makePdfModel();
    const fn = vi.fn();
    model.onHoverChange(fn);
    model.onHoverChange(fn); // duplicate
    model.setHoverState('id1', 'code1');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('offHoverChange removes listener', () => {
    const model = makePdfModel();
    const fn = vi.fn();
    model.onHoverChange(fn);
    model.offHoverChange(fn);
    model.setHoverState('id1', 'code1');
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails (duplicate test)**

Run: `npx vitest run tests/pdf/pdfCodingModel.test.ts`
Expected: FAIL — duplicate listener called 2 times

- [ ] **Step 3: Refactor PdfCodingModel to use Set**

In `src/pdf/pdfCodingModel.ts`:

Change field declarations (lines 26-27):
```typescript
private listeners = new Set<ChangeListener>();
private hoverListeners = new Set<HoverListener>();
```

Change `onChange`/`offChange` (lines 56-62):
```typescript
onChange(fn: ChangeListener): void {
    this.listeners.add(fn);
}

offChange(fn: ChangeListener): void {
    this.listeners.delete(fn);
}
```

Change `onHoverChange`/`offHoverChange` (lines 75-81):
```typescript
onHoverChange(fn: HoverListener): void {
    this.hoverListeners.add(fn);
}

offHoverChange(fn: HoverListener): void {
    this.hoverListeners.delete(fn);
}
```

No other changes needed — `for (const fn of this.listeners) fn()` works with both Array and Set.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pdf/pdfCodingModel.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: migra listeners do PdfCodingModel de array para Set (consistencia com MediaCodingModel)"
```

---

### Task 4: Remove redundant excludeCodes check in frequency.ts

`applyFilters` already filters markers by `excludeCodes`. The per-code check at `frequency.ts:21` is redundant. Same pattern in `calculateDocumentCodeMatrix` and `calculateSourceComparison`.

**Files:**
- Modify: `src/analytics/data/frequency.ts:21,66-67,130-131`

- [ ] **Step 1: Write test proving behavior is unchanged**

The existing `tests/analytics/statsEngine.test.ts` already tests frequency with excludeCodes. Run it first to establish baseline.

Run: `npx vitest run tests/analytics/statsEngine.test.ts`
Expected: PASS

- [ ] **Step 2: Remove redundant excludeCodes checks**

In `calculateFrequency` (line 21), remove:
```typescript
if (filters.excludeCodes.includes(code)) continue;
```

In `calculateDocumentCodeMatrix` (line 66), remove:
```typescript
if (filters.excludeCodes.includes(code)) continue;
```

In `calculateSourceComparison` (line 130), remove:
```typescript
if (filters.excludeCodes.includes(code)) continue;
```

**Note:** Keep the `filters.codes.length > 0` checks — those are NOT redundant (applyFilters checks at marker level, these check at code level within multi-code markers).

- [ ] **Step 3: Run stats tests to verify no regression**

Run: `npx vitest run tests/analytics/statsEngine.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: remove check redundante de excludeCodes em frequency, docMatrix e sourceComparison (ja filtrado por applyFilters)"
```

---

## Chunk 2: Defensive Guards (Tasks 5–6)

### Task 5: Add guard clauses to configSections.ts

Replace non-null assertions (`ctx.configPanelEl!`, `ctx.data!`) with early returns.

**Files:**
- Modify: `src/analytics/views/configSections.ts:7,11,51,77,157`

- [ ] **Step 1: Add guards to each exported function**

In `renderSourcesSection` — add at top:
```typescript
if (!ctx.configPanelEl || !ctx.data) return;
```
Then remove all `!` from `ctx.configPanelEl!` and `ctx.data!` within the function.

Same pattern for `renderViewModeSection`, `renderCodesSection`, `renderMinFreqSection`.

For `renderCodesList` (private helper), `ctx.data` is already guarded with `if (ctx.data)` — keep that.

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 3: Run tsc to verify no type errors**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "fix: substitui non-null assertions por guard clauses em configSections"
```

---

### Task 6: Improve type safety in MediaCodingModel casts

Replace `{} as unknown as M` with a properly typed base object. The cast is safe today but is a latent trap if subclasses add required fields.

**Files:**
- Modify: `src/media/mediaCodingModel.ts:123-131,244-245`

- [ ] **Step 1: Review current cast usage**

Lines 123-131 (`findOrCreateMarker`):
```typescript
const marker = {
    id: this.generateId(),
    fileId: filePath,
    from, to,
    codes: [],
    createdAt: now,
    updatedAt: now,
} as unknown as M;
```

This already includes ALL fields of `MediaMarker`. The cast is from `MediaMarker` → `M extends MediaMarker`. The `as unknown as M` is technically required because TS can't prove the object satisfies `M` (subclass might add fields). But the object literal already satisfies the base interface.

**Change to a safer pattern**: cast from `MediaMarker` instead of from `unknown`:

```typescript
const marker: M = {
    id: this.generateId(),
    fileId: filePath,
    from, to,
    codes: [],
    createdAt: now,
    updatedAt: now,
} as MediaMarker as M;
```

Lines 244-245 (`getOrCreateFile`):
```typescript
file = { path: filePath, markers: [] } as unknown as F;
```

Change to:
```typescript
file = { path: filePath, markers: [] } as MediaFile<M> as F;
```

- [ ] **Step 2: Run tsc and tests**

Run: `npx tsc --noEmit && npm run test`
Expected: clean build, all tests pass

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: substitui 'as unknown as' por casts tipados em MediaCodingModel"
```

---

## Summary

| Task | Type | Impact | Estimate |
|------|------|--------|----------|
| 1. Dashboard KPI bug | bug fix | Users see wrong source count | ~5 min |
| 2. Untrack main.js | housekeeping | Stops spurious diffs | ~2 min |
| 3. PdfCodingModel Set | refactor | Prevents duplicate listeners | ~5 min |
| 4. Remove redundant excludeCodes | refactor | Clearer data flow | ~3 min |
| 5. configSections guards | defensive | Prevents null crashes | ~3 min |
| 6. MediaCodingModel casts | refactor | Better type safety | ~3 min |

**Not included (tracked in BACKLOG):**
- AnalyticsView state explosion — larger refactor, out of scope for this fix batch
- View-level tests for 6 engines — tracked as separate initiative
- Module-level state in fileInterceptor.ts — already mitigated with `clearFileInterceptRules()`
- `copyToDemo` esbuild plugin — CLAUDE.md already updated by parallel chat
