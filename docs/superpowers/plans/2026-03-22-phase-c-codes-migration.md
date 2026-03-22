# Phase C: codes[] Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `BaseMarker.codes` from `string[]` (code names) to `CodeApplication[]` (objects with `codeId` reference), enabling stable ID-based references and eliminating rename propagation.

**Architecture:** Define `CodeApplication` type in `types.ts`, add helper functions for common operations (hasCode, getCodeNames), then mechanically update each layer bottom-up: types → models → adapters → popover/menus → views → analytics. TypeScript compiler guides every change.

**Tech Stack:** TypeScript strict, Vitest + jsdom for tests

**Spec:** `docs/superpowers/specs/2026-03-22-codebook-evolution-design.md` (Fase C)

**Scope:** ~35 source files + ~25 test files. All changes are mechanical type-driven refactoring.

---

## Chunk 1: Type Foundation + Helpers

### Task 1: Define CodeApplication and update BaseMarker

**Files:**
- Modify: `src/core/types.ts:14-23` (BaseMarker interface)

- [ ] **Step 1: Write failing test for CodeApplication type**

Create test file:

```typescript
// tests/core/codeApplication.test.ts
import { describe, it, expect } from 'vitest';
import type { CodeApplication } from '../../src/core/types';

describe('CodeApplication', () => {
  it('should accept minimal shape (codeId only)', () => {
    const app: CodeApplication = { codeId: 'code_test' };
    expect(app.codeId).toBe('code_test');
    expect(app.magnitude).toBeUndefined();
  });

  it('should accept full shape with magnitude', () => {
    const app: CodeApplication = { codeId: 'code_test', magnitude: 'ALTA' };
    expect(app.magnitude).toBe('ALTA');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/core/codeApplication.test.ts`
Expected: FAIL — `CodeApplication` not exported from types.ts

- [ ] **Step 3: Add CodeApplication interface and update BaseMarker**

In `src/core/types.ts`, add before BaseMarker:

```typescript
export interface CodeApplication {
  codeId: string;
  magnitude?: string;
}
```

Update BaseMarker:

```typescript
codes: CodeApplication[];  // was: string[]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/core/codeApplication.test.ts`
Expected: PASS

- [ ] **Step 5: Run tsc to see all compile errors**

Run: `npx tsc --noEmit 2>&1 | wc -l`
Expected: Many errors — this is the roadmap for remaining tasks. Save output for reference.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts tests/core/codeApplication.test.ts
~/.claude/scripts/commit.sh "feat: define CodeApplication e migra BaseMarker.codes de string[] para CodeApplication[]"
```

### Task 2: Create codeApplicationHelpers utility

**Files:**
- Create: `src/core/codeApplicationHelpers.ts`
- Create: `tests/core/codeApplicationHelpers.test.ts`

These helpers centralize the most common operations on `CodeApplication[]`, avoiding repetitive `.some()` / `.map()` / `.find()` across ~35 files.

- [ ] **Step 1: Write failing tests for helpers**

```typescript
// tests/core/codeApplicationHelpers.test.ts
import { describe, it, expect } from 'vitest';
import {
  hasCode,
  getCodeIds,
  findCodeApplication,
  addCodeApplication,
  removeCodeApplication,
} from '../../src/core/codeApplicationHelpers';
import type { CodeApplication } from '../../src/core/types';

describe('codeApplicationHelpers', () => {
  const codes: CodeApplication[] = [
    { codeId: 'code_a' },
    { codeId: 'code_b', magnitude: 'ALTA' },
  ];

  describe('hasCode', () => {
    it('returns true when codeId present', () => {
      expect(hasCode(codes, 'code_a')).toBe(true);
    });
    it('returns false when codeId absent', () => {
      expect(hasCode(codes, 'code_z')).toBe(false);
    });
  });

  describe('getCodeIds', () => {
    it('extracts all codeIds', () => {
      expect(getCodeIds(codes)).toEqual(['code_a', 'code_b']);
    });
    it('returns empty array for empty input', () => {
      expect(getCodeIds([])).toEqual([]);
    });
  });

  describe('findCodeApplication', () => {
    it('finds by codeId', () => {
      expect(findCodeApplication(codes, 'code_b')).toEqual({ codeId: 'code_b', magnitude: 'ALTA' });
    });
    it('returns undefined when not found', () => {
      expect(findCodeApplication(codes, 'code_z')).toBeUndefined();
    });
  });

  describe('addCodeApplication', () => {
    it('adds new code returning new array', () => {
      const original: CodeApplication[] = [{ codeId: 'code_a' }];
      const result = addCodeApplication(original, 'code_c');
      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({ codeId: 'code_c' });
      expect(original).toHaveLength(1); // original unchanged
    });
    it('returns same array if duplicate', () => {
      const original: CodeApplication[] = [{ codeId: 'code_a' }];
      const result = addCodeApplication(original, 'code_a');
      expect(result).toHaveLength(1);
    });
  });

  describe('removeCodeApplication', () => {
    it('removes by codeId', () => {
      const result = removeCodeApplication([...codes], 'code_a');
      expect(result).toHaveLength(1);
      expect(result[0].codeId).toBe('code_b');
    });
    it('returns unchanged if not found', () => {
      const result = removeCodeApplication([...codes], 'code_z');
      expect(result).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/core/codeApplicationHelpers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement helpers**

```typescript
// src/core/codeApplicationHelpers.ts
import type { CodeApplication } from './types';

export function hasCode(codes: CodeApplication[], codeId: string): boolean {
  return codes.some(c => c.codeId === codeId);
}

export function getCodeIds(codes: CodeApplication[]): string[] {
  return codes.map(c => c.codeId);
}

export function findCodeApplication(codes: CodeApplication[], codeId: string): CodeApplication | undefined {
  return codes.find(c => c.codeId === codeId);
}

export function addCodeApplication(codes: CodeApplication[], codeId: string): CodeApplication[] {
  if (hasCode(codes, codeId)) return codes;
  return [...codes, { codeId }];
}

export function removeCodeApplication(codes: CodeApplication[], codeId: string): CodeApplication[] {
  return codes.filter(c => c.codeId !== codeId);
}
```

Note: `addCodeApplication` returns a new array (immutable). `removeCodeApplication` also returns new array via `.filter()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/core/codeApplicationHelpers.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/codeApplicationHelpers.ts tests/core/codeApplicationHelpers.test.ts
~/.claude/scripts/commit.sh "feat: helpers centralizados para operacoes em CodeApplication[]"
```

### Task 3: Update SidebarModelInterface, AdapterModel, and BaseSidebarAdapter

**Files:**
- Modify: `src/core/types.ts:25-60` (SidebarModelInterface)
- Modify: `src/core/baseSidebarAdapter.ts:13-26` (AdapterModel) + methods

- [ ] **Step 1: Update SidebarModelInterface**

In `src/core/types.ts`:
- `deleteCode(codeName: string)` → `deleteCode(codeId: string)` — parameter semantics change
- `renameCode(oldName, newName)` → **remove entirely** (rename is atomic in registry, no marker propagation)

- [ ] **Step 2: Update AdapterModel**

In `src/core/baseSidebarAdapter.ts`:
- `getAllMarkers(): Array<{ id: string; codes: string[] }>` → `Array<{ id: string; codes: CodeApplication[] }>`
- `removeCodeFromMarker(markerId: string, codeName: string, keepIfEmpty?: boolean)` → `removeCodeFromMarker(markerId: string, codeId: string, keepIfEmpty?: boolean)`
- Import `CodeApplication` from types

- [ ] **Step 3: Update BaseSidebarAdapter methods**

In `src/core/baseSidebarAdapter.ts`:
- `renameCode()` method: **remove entirely**
- Remove `setOnRenamed` callback registration in listener setup
- `deleteCode(codeId)`:
  - Change `registry.getByName(codeName)` → `registry.delete(codeId)` directly
  - Change `.codes.includes(codeName)` → `hasCode(codes, codeId)` helper
  - Import `hasCode` from `codeApplicationHelpers`

- [ ] **Step 4: Run tsc to check remaining errors**

Run: `npx tsc --noEmit 2>&1 | wc -l`
Expected: Error count reduced from Task 1 (interface consumers now flagged)

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/baseSidebarAdapter.ts
~/.claude/scripts/commit.sh "refactor: atualiza interfaces SidebarModel e AdapterModel para CodeApplication"
```

### Task 4: Update getColorForCodes in CodeDefinitionRegistry

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`

- [ ] **Step 1: Update getColorForCodes**

Current signature: `getColorForCodes(codeNames: string[]): string`
New signature: `getColorForCodeIds(codeIds: string[]): string`

Add new method that looks up by id instead of name. Keep old method temporarily if needed for transition, or replace in-place.

Simplest approach: add `getColorForCodeIds(codeIds: string[])` that iterates `codeIds`, calls `getById(id)`, returns first match's color. Then update all callers to use this + `getCodeIds()` helper.

- [ ] **Step 2: Commit**

```bash
git add src/core/codeDefinitionRegistry.ts
~/.claude/scripts/commit.sh "feat: adiciona getColorForCodeIds no registry para lookup por id"
```

---

## Chunk 2: Engine Models (5 models)

Each model follows the same pattern: update `addCodeToMarker`, `removeCodeFromMarker`, `deleteCode`, and remove `renameCode`. Use helpers from `codeApplicationHelpers.ts`.

### Task 5: Migrate CodeMarkerModel (Markdown)

**Files:**
- Modify: `src/markdown/models/codeMarkerModel.ts`
- Modify: `tests/engine-models/codeMarkerModel.test.ts`

- [ ] **Step 1: Update test fixtures**

In `tests/engine-models/codeMarkerModel.test.ts`:
- All marker factories: change `codes: ['CodeA']` to `codes: [{ codeId: 'code_a' }]`
- All assertions on `.codes`: update to check `CodeApplication[]` structure
- Use `hasCode` helper in assertions where checking presence

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/engine-models/codeMarkerModel.test.ts`
Expected: FAIL — types mismatch

- [ ] **Step 3: Update model methods**

In `src/markdown/models/codeMarkerModel.ts`:

`addCodeToMarker(markerId, codeId, color?)`:
- Change `marker.codes.push(codeName)` → `marker.codes = addCodeApplication(marker.codes, codeId)`
- Import helper

`removeCodeFromMarker(markerId, codeId, keepIfEmpty?)`:
- Change `marker.codes.filter(c => c !== codeName)` → `removeCodeApplication(marker.codes, codeId)`

`deleteCode(codeId)`:
- Change name-based filtering to id-based using `hasCode`

`renameCode()`:
- **Remove entirely**

Legacy migration code (lines 56-65):
- Update old `{ code: string }` migration to produce `CodeApplication[]`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/engine-models/codeMarkerModel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/markdown/models/codeMarkerModel.ts tests/engine-models/codeMarkerModel.test.ts
~/.claude/scripts/commit.sh "refactor: migra CodeMarkerModel (markdown) para CodeApplication[]"
```

### Task 6: Migrate PdfCodingModel

**Files:**
- Modify: `src/pdf/pdfCodingModel.ts`
- Modify: `src/pdf/pdfCodingTypes.ts`
- Modify: `tests/engine-models/pdfCodingModel.test.ts`

- [ ] **Step 1: Update PdfMarker and PdfShapeMarker types**

In `src/pdf/pdfCodingTypes.ts`:
- `PdfMarker.codes: string[]` → `codes: CodeApplication[]`
- `PdfShapeMarker.codes: string[]` → `codes: CodeApplication[]`
- Add import for `CodeApplication`

- [ ] **Step 2: Update test fixtures**

In `tests/engine-models/pdfCodingModel.test.ts`:
- All marker factories: `codes: ['X']` → `codes: [{ codeId: 'code_x' }]`

- [ ] **Step 3: Update model methods**

In `src/pdf/pdfCodingModel.ts`:
- `addCodeToMarker`: use `addCodeApplication` helper
- `removeCodeFromMarker`: use `removeCodeApplication` helper
- `deleteCode`: use `hasCode` helper
- `renameCode`: **remove**
- `reconcileCodes()` (undo helper): update to work with `CodeApplication[]` — reconcile by codeId against registry
- Undo snapshot logic: ensure `codes: CodeApplication[]` is preserved/restored correctly in snapshots

- [ ] **Step 4: Run tests**

Run: `npm run test -- tests/engine-models/pdfCodingModel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pdf/pdfCodingTypes.ts src/pdf/pdfCodingModel.ts tests/engine-models/pdfCodingModel.test.ts
~/.claude/scripts/commit.sh "refactor: migra PdfCodingModel para CodeApplication[]"
```

### Task 7: Migrate CsvCodingModel

**Files:**
- Modify: `src/csv/csvCodingModel.ts`
- Modify: `src/csv/csvCodingTypes.ts`
- Modify: `tests/engine-models/csvCodingModel.test.ts`

- [ ] **Step 1: Update SegmentMarker and RowMarker types**

In `src/csv/csvCodingTypes.ts`:
- `SegmentMarker.codes: string[]` → `codes: CodeApplication[]`
- `RowMarker.codes: string[]` → `codes: CodeApplication[]`

- [ ] **Step 2: Update test fixtures and model methods**

Same pattern as Tasks 5-6:
- Update fixtures in test file
- `addCodeToMarker`: `addCodeApplication` helper
- `removeCodeFromMarker`: `removeCodeApplication` helper
- `getCodesForCell()`: extract codeIds from `CodeApplication[]` using `getCodeIds` helper
- `deleteCode`: `hasCode` helper
- `renameCode`: **remove**

- [ ] **Step 3: Run tests**

Run: `npm run test -- tests/engine-models/csvCodingModel.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/csv/csvCodingTypes.ts src/csv/csvCodingModel.ts tests/engine-models/csvCodingModel.test.ts
~/.claude/scripts/commit.sh "refactor: migra CsvCodingModel para CodeApplication[]"
```

### Task 8: Migrate ImageCodingModel

**Files:**
- Modify: `src/image/imageCodingModel.ts`
- Modify: `src/image/imageCodingTypes.ts`
- Modify: `tests/engine-models/imageCodingModel.test.ts`

- [ ] **Step 1: Update ImageMarker type**

In `src/image/imageCodingTypes.ts`:
- `ImageMarker.codes: string[]` → `codes: CodeApplication[]`

- [ ] **Step 2: Update test fixtures and model methods**

Same pattern:
- `addCodeToMarker`: `addCodeApplication` helper
- `removeCodeFromMarker`: `removeCodeApplication` helper
- `getCodesForMarker()`: extract codeIds using `getCodeIds` helper
- `deleteCode`: `hasCode` helper
- `renameCode`: **remove**

- [ ] **Step 3: Run tests**

Run: `npm run test -- tests/engine-models/imageCodingModel.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/image/imageCodingTypes.ts src/image/imageCodingModel.ts tests/engine-models/imageCodingModel.test.ts
~/.claude/scripts/commit.sh "refactor: migra ImageCodingModel para CodeApplication[]"
```

### Task 9: Migrate MediaCodingModel (Audio + Video)

**Files:**
- Modify: `src/media/mediaCodingModel.ts`
- Modify: `src/media/mediaTypes.ts`
- Modify: `tests/media/mediaCodingModel.test.ts`

- [ ] **Step 1: Update MediaMarker type**

In `src/media/mediaTypes.ts`:
- `MediaMarker.codes: string[]` → `codes: CodeApplication[]`

- [ ] **Step 2: Update test fixtures and model methods**

Same pattern as all other models.

- [ ] **Step 3: Run tests**

Run: `npm run test -- tests/media/mediaCodingModel.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/media/mediaTypes.ts src/media/mediaCodingModel.ts tests/media/mediaCodingModel.test.ts
~/.claude/scripts/commit.sh "refactor: migra MediaCodingModel (audio/video) para CodeApplication[]"
```

---

## Chunk 3: Sidebar Adapters + Popover + Menus

### Task 10: Update PdfSidebarAdapter (override methods)

**Files:**
- Modify: `src/pdf/views/pdfSidebarAdapter.ts`

PDF has its own `renameCode` and `deleteCode` overrides because it has dual marker types (text markers + shape markers).

- [ ] **Step 1: Update deleteCode override**

Change `m.codes.indexOf(codeName)` / `m.codes.includes(codeName)` / `s.codes.indexOf(codeName)` / `s.codes.includes(codeName)` to use `hasCode(m.codes, codeId)` helper for both markers and shapes.

- [ ] **Step 2: Remove renameCode override**

Remove entirely — rename is atomic in registry.

- [ ] **Step 3: Run PDF sidebar tests**

Run: `npm run test -- --grep "pdf.*sidebar\|sidebar.*pdf"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pdf/views/pdfSidebarAdapter.ts
~/.claude/scripts/commit.sh "refactor: atualiza PdfSidebarAdapter para CodeApplication[]"
```

### Task 11: Update popover adapters (6 engine files)

**Files:**
- Modify: `src/core/codingPopover.ts` (minimal — interface stays, clarify flow)
- Modify: `src/markdown/menu/menuActions.ts`
- Modify: `src/pdf/pdfCodingMenu.ts`
- Modify: `src/csv/csvCodingMenu.ts`
- Modify: `src/image/imageCodingMenu.ts`
- Modify: `src/media/mediaCodingMenu.ts`

The popover works with code **names** (user types names, sees names). Each adapter bridges name→id.

- [ ] **Step 1: Update getActiveCodes() in each adapter**

Each adapter returns code names for the popover UI. After migration, extract names from `CodeApplication[]`:

```typescript
// Pattern for all adapters:
getActiveCodes: () => marker.codes.map(c => {
  const def = registry.getById(c.codeId);
  return def?.name ?? '';
}).filter(Boolean)
```

- [ ] **Step 2: Update addCode/removeCode in each adapter**

Each adapter receives a code **name** from popover, resolves to **id** via registry:

```typescript
// Pattern for all adapters:
addCode: (name) => {
  const def = registry.getByName(name);
  if (def) model.addCodeToMarker(markerId, def.id);
}
removeCode: (name) => {
  const def = registry.getByName(name);
  if (def) model.removeCodeFromMarker(markerId, def.id);
}
```

- [ ] **Step 3: Update menuActions.ts (Markdown)**

- `getCodesAtSelection()`: extract names from `CodeApplication[]` via registry lookup
- `addCodeAction()`: resolve name → id before calling model
- `removeCodeAction()`: resolve name → id before calling model

- [ ] **Step 4: Update CSV batch coding popover**

`openBatchCodingPopover` computes `fullyActiveCodes`:
- Change `m.codes.includes(codeDef.name)` → `hasCode(m.codes, codeDef.id)`

- [ ] **Step 5: Update CSV delete action in single-cell popover**

`openCsvCodingPopover` delete iterates `existingMarker.codes`:
- Change to iterate `CodeApplication[]`, resolve names for display

- [ ] **Step 6: Run popover/menu related tests**

Run: `npm run test -- --grep "popover\|menu\|coding"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/codingPopover.ts src/markdown/menu/menuActions.ts src/pdf/pdfCodingMenu.ts src/csv/csvCodingMenu.ts src/image/imageCodingMenu.ts src/media/mediaCodingMenu.ts
~/.claude/scripts/commit.sh "refactor: atualiza popover adapters para resolver name→id via registry"
```

---

## Chunk 4: View Layer (all .codes access in views)

### Task 12: Update Markdown CM6 view files (4 files)

**Files:**
- Modify: `src/markdown/cm6/markerStateField.ts` — iterates `marker.codes` as names
- Modify: `src/markdown/cm6/handleOverlayRenderer.ts` — `m.codes[0]` passed to `getByName`
- Modify: `src/markdown/cm6/hoverBridge.ts` — `marker.codes[0]` for hover state
- Modify: `src/markdown/cm6/marginPanelExtension.ts` — iterates `marker.codes` as names

- [ ] **Step 1: Update each file**

Pattern for all: where code **names** are needed (display, lookup), resolve via registry:
- `marker.codes[0]` → `marker.codes[0]?.codeId` (when passing to id-based APIs)
- `marker.codes[0]` → `registry.getById(marker.codes[0]?.codeId)?.name` (when name is needed)
- `marker.codes.length` → no change needed (array length check still works)

For `setHoverState(codeName)` calls: change to `setHoverState(marker.codes[0]?.codeId ?? null)`

- [ ] **Step 2: Run markdown tests**

Run: `npm run test -- --grep "markdown\|cm6\|margin\|hover"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/markdown/cm6/markerStateField.ts src/markdown/cm6/handleOverlayRenderer.ts src/markdown/cm6/hoverBridge.ts src/markdown/cm6/marginPanelExtension.ts
~/.claude/scripts/commit.sh "refactor: migra arquivos CM6 markdown para CodeApplication[]"
```

### Task 13: Update PDF view files (4 files)

**Files:**
- Modify: `src/pdf/highlightRenderer.ts` — `marker.codes.join(', ')`, `marker.codes[0]`, `resolveCodeColors` iterating codes as names
- Modify: `src/pdf/drawLayer.ts` — `shape.codes[0]`, `shape.codes.length`, `getColorForCodes(shape.codes)`
- Modify: `src/pdf/marginPanelRenderer.ts` — iterates `marker.codes` / `shape.codes` as names, calls `registry.getByName(codeName)`
- Modify: `src/image/canvas/regionManager.ts` — `getColorForCodes(marker.codes)` (shared pattern)

- [ ] **Step 1: Update each file**

Pattern:
- `marker.codes.join(', ')` → resolve names via registry, then join
- `marker.codes[0]` → `marker.codes[0]?.codeId` + resolve name if needed
- `getColorForCodes(marker.codes)` → `getColorForCodeIds(getCodeIds(marker.codes))`
- `resolveCodeColors` iterating codes as names → iterate `CodeApplication[]`, resolve names

- [ ] **Step 2: Run PDF tests**

Run: `npm run test -- --grep "pdf\|highlight\|draw"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pdf/highlightRenderer.ts src/pdf/drawLayer.ts src/pdf/marginPanelRenderer.ts
~/.claude/scripts/commit.sh "refactor: migra PDF view files para CodeApplication[]"
```

### Task 14: Update CSV view files (2 files)

**Files:**
- Modify: `src/csv/csvCodingCellRenderer.ts` — `m.codes.includes(codeName)`
- Modify: `src/csv/segmentEditor.ts` — `seg.codes`, `marker.codes`, `getColorForCodes`

- [ ] **Step 1: Update each file**

- `m.codes.includes(codeName)` → resolve codeName to id via registry, then `hasCode(m.codes, codeId)`
- `getColorForCodes(marker.codes)` → `getColorForCodeIds(getCodeIds(marker.codes))`

- [ ] **Step 2: Run CSV tests**

Run: `npm run test -- --grep "csv\|cell\|segment"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/csv/csvCodingCellRenderer.ts src/csv/segmentEditor.ts
~/.claude/scripts/commit.sh "refactor: migra CSV view files para CodeApplication[]"
```

### Task 15: Update Image view files (3 files)

**Files:**
- Modify: `src/image/regionLabels.ts` — `marker.codes.join(", ")`, `getColorForCodes`
- Modify: `src/image/regionHighlight.ts` — `marker.codes[0]`
- Modify: `src/image/canvas/regionManager.ts` — `getColorForCodes(marker.codes)`

- [ ] **Step 1: Update each file**

Same patterns as PDF (Task 13):
- Resolve names via registry for display
- Use `getColorForCodeIds` + `getCodeIds` for color lookup
- `marker.codes[0]?.codeId` for hover state

- [ ] **Step 2: Run image tests**

Run: `npm run test -- --grep "image\|region"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/image/regionLabels.ts src/image/regionHighlight.ts src/image/canvas/regionManager.ts
~/.claude/scripts/commit.sh "refactor: migra Image view files para CodeApplication[]"
```

### Task 16: Update Media + Core view files (7 files)

**Files:**
- Modify: `src/media/mediaViewCore.ts` — `marker.codes[0]`
- Modify: `src/media/regionRenderer.ts` — `marker.codes.join(', ')`, `for (const codeName of marker.codes)`
- Modify: `src/core/baseCodeExplorerView.ts` — iterates `marker.codes` as names, `marker.codes[0]`
- Modify: `src/core/detailMarkerRenderer.ts` — iterates `marker.codes` as names, `getByName`, `getColorForCodes`
- Modify: `src/core/detailListRenderer.ts` — `countSegmentsPerCode()` iterates `marker.codes` as strings
- Modify: `src/core/unifiedModelAdapter.ts` — `.codes.includes(codeName)` (2 locations)
- Modify: `src/core/detailCodeRenderer.ts` — `.codes.includes(codeName)`

- [ ] **Step 1: Update media files**

- `marker.codes[0]` → `marker.codes[0]?.codeId` + resolve name
- `marker.codes.join(', ')` → resolve names, then join
- `for (const codeName of marker.codes)` → iterate `CodeApplication[]`, resolve name per item

- [ ] **Step 2: Update core view files**

- `marker.codes.includes(codeName)` → resolve codeName to id, then `hasCode(marker.codes, codeId)`
- `marker.codes` iteration as names → iterate `CodeApplication[]`, resolve names
- `getColorForCodes` calls → `getColorForCodeIds` + `getCodeIds`
- `getByName(marker.codes[0])` → `getById(marker.codes[0]?.codeId)`

- [ ] **Step 3: Run core + media view tests**

Run: `npm run test -- --grep "explorer\|detail\|adapter\|media\|region"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/media/mediaViewCore.ts src/media/regionRenderer.ts src/core/baseCodeExplorerView.ts src/core/detailMarkerRenderer.ts src/core/detailListRenderer.ts src/core/unifiedModelAdapter.ts src/core/detailCodeRenderer.ts
~/.claude/scripts/commit.sh "refactor: migra media + core view files para CodeApplication[]"
```

---

## Chunk 5: Analytics + Cleanup

### Task 17: Update dataConsolidator

**Files:**
- Modify: `src/analytics/data/dataConsolidator.ts`
- Modify: `tests/analytics/dataConsolidator.test.ts`

**Key decision:** After consolidation, `UnifiedMarker.codes` remains `string[]` — containing **codeIds** (not names). All analytics mode files that work on consolidated data (`UnifiedMarker`) need no change because they already treat codes as opaque string identifiers. The analytics layer resolves id→name only for display via the `UnifiedCode[]` array (which has both id and name).

- [ ] **Step 1: Update test fixtures**

All test data with `codes: ['codeA']` → `codes: [{ codeId: 'code_a' }]` for raw marker fixtures.
Consolidated `UnifiedMarker` fixtures keep `codes: ['code_a']` (codeIds as strings).

- [ ] **Step 2: Update extractCodes function**

```typescript
// After:
export function extractCodes(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((c) => {
      if (typeof c === 'string') return c;           // legacy/consolidated format
      if (c && typeof c === 'object' && 'codeId' in c) return (c as { codeId: string }).codeId;
      return '';
    }).filter(Boolean);
  }
  return [];
}
```

- [ ] **Step 3: Update consolidateCodes**

`consolidateCodes(allMarkers, definitions, activeEngines)`:
- `m.codes` are now codeIds (strings from extractCodes)
- Resolve codeId → name via `definitions` map for `UnifiedCode.name`
- Build `UnifiedCode` with both id and name

- [ ] **Step 4: Verify analytics modes need no change**

Run: `grep -rn '\.codes' src/analytics/views/modes/ src/analytics/data/`
Confirm all remaining `.codes` access operates on `UnifiedMarker.codes: string[]` (codeIds), not raw `CodeApplication[]`. The following files should need no change since they work on consolidated data:
- `frequency.ts`, `cooccurrence.ts`, `evolution.ts`, `sequential.ts`, `inferential.ts`
- `statsHelpers.ts`, `mcaEngine.ts`, `decisionTreeEngine.ts`
- All `*Mode.ts` files in `views/modes/`
- `boardClusters.ts`, `excerptNode.ts`

If any file accesses raw markers directly, update it.

- [ ] **Step 5: Run analytics tests**

Run: `npm run test -- tests/analytics/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/analytics/data/dataConsolidator.ts tests/analytics/dataConsolidator.test.ts
~/.claude/scripts/commit.sh "refactor: migra dataConsolidator para CodeApplication[] (extractCodes retorna codeIds)"
```

### Task 18: Update remaining test files (~25 files)

**Files:**
- All test files in `tests/` that still use `codes: ['name']` format

- [ ] **Step 1: Find all remaining string-based codes in tests**

Run: `grep -rn "codes: \['" tests/`
Expected: ~25 files with string-based codes in test fixtures

- [ ] **Step 2: Update all test fixtures**

Change all `codes: ['X']` → `codes: [{ codeId: 'code_x' }]`
Update assertions accordingly. Use helpers where appropriate.

Group by directory:
- `tests/core/` — sidebar adapter tests, view tests
- `tests/csv/` — CSV sidebar, cell renderer tests
- `tests/pdf/` — PDF sidebar, highlight tests
- `tests/image/` — image sidebar tests
- `tests/media/` — media sidebar tests
- `tests/analytics/` — remaining analytics tests

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: ALL tests PASS (1548+)

- [ ] **Step 4: Commit**

```bash
git add tests/
~/.claude/scripts/commit.sh "refactor: atualiza todos os testes restantes para CodeApplication[]"
```

### Task 19: Remove renameCode propagation + cleanup main.ts

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts` (optionally keep setOnRenamed, remove if unused)
- Modify: `src/main.ts` (remove setOnRenamed callback wiring)
- Verify: no remaining `renameCode` references in engine files

- [ ] **Step 1: Grep for renameCode and setOnRenamed**

Run: `grep -rn 'renameCode\|setOnRenamed\|onRenamed' src/`
Identify all remaining references.

- [ ] **Step 2: Remove dead code**

- `main.ts`: remove `setOnRenamed` callback that propagated renames to markers
- Registry: `setOnRenamed` can be removed if no callers remain
- Verify each engine's model: `renameCode()` should already be removed (Tasks 5-9)

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add -u
~/.claude/scripts/commit.sh "chore: remove renameCode propagation (rename agora e atomico no registry)"
```

### Task 20: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: 0 tsc errors, esbuild success

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: ALL tests PASS

- [ ] **Step 3: Grep for remaining string-based codes patterns**

Run: `grep -rn "codes: \['" src/` — should return 0 results
Run: `grep -rn '\.codes\.includes(' src/` — should return 0 results (replaced by hasCode)
Run: `grep -rn 'renameCode' src/` — should return 0 results

- [ ] **Step 4: Manual smoke test**

1. `npm run dev`
2. Open demo vault in Obsidian
3. Create a code, apply to a markdown segment
4. Apply to a PDF region
5. Apply to a CSV cell
6. Apply to an image region
7. Verify sidebar shows code correctly in all engines
8. Rename code in registry — verify markers stay linked (no propagation)
9. Delete code — verify markers cleaned up

- [ ] **Step 5: Copy build to demo vault**

Run: `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`

- [ ] **Step 6: Final commit**

```bash
~/.claude/scripts/commit.sh "chore: verificacao final Fase C — build limpo, testes passando"
```
