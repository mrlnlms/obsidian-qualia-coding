# Phase E — Relations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add code-level and segment-level relations to Qualia Coding — from data model through all UI entry points, settings toggle, QDPX export, and a Relations Network analytics view.

**Architecture:** Relations live at two levels: `CodeDefinition.relations` (theoretical declarations) and `CodeApplication.relations` (segment-anchored interpretations). Both share the same shape `{ label, target, directed }`. UI entry points are Detail View Level 2 (code-level), popover + marker detail Level 3 (segment-level). A new Relations Network analytics mode renders explicit relation edges instead of co-occurrence.

**Tech Stack:** TypeScript, Obsidian API, Vitest, existing baseCodingMenu/codingPopover patterns, chart.js (canvas for network), REFI-QDA XML.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/core/types.ts` | Add `CodeRelation` type, extend `CodeApplication`, `CodeDefinition`, `GeneralSettings` |
| Modify | `src/core/codeApplicationHelpers.ts` | Add `getRelations`, `addRelation`, `removeRelation` helpers |
| Modify | `src/core/codeDefinitionRegistry.ts` | Extend `update()` to accept `relations`, persist in toJSON/fromJSON |
| Create | `src/core/relationHelpers.ts` | `collectAllLabels()`, `buildRelationEdges()` — pure functions for relation data |
| Modify | `src/core/detailCodeRenderer.ts` | Add `renderRelationsSection()` after magnitude config (code-level) |
| Modify | `src/core/detailMarkerRenderer.ts` | Add `renderRelationsPerCode()` after magnitude per code (segment-level) |
| Modify | `src/core/baseCodingMenu.ts` | Add `renderRelationsSection()` + `RelationsHandle` (popover collapsible section) |
| Modify | `src/core/codingPopover.ts` | Wire relations section, extend adapter interface |
| Modify | `src/core/settingTab.ts` | Add "Show relations in popover" toggle |
| Create | `src/analytics/views/modes/relationsNetworkMode.ts` | Relations Network visualization + options + CSV export |
| Modify | `src/analytics/views/modes/modeRegistry.ts` | Register `"relations-network"` mode |
| Modify | `src/analytics/views/analyticsViewContext.ts` | Add `ViewMode` union member + state fields |
| Create | `src/analytics/data/relationsEngine.ts` | Pure functions: extract relation edges from registry + markers, merge code/segment levels |
| Modify | `src/analytics/index.ts` | Add `dataManager` to `AnalyticsPluginAPI` so relations mode can read raw markers |
| Modify | `src/export/qdpxExporter.ts` | Add `buildLinksXml()`, wire into `buildProjectXml()` |
| Modify | `src/export/qdcExporter.ts` | No change needed (relations use `<Link>`, not `<Code>` children) |
| Create | `src/core/relationUI.ts` | Shared `renderAddRelationRow()` — used by detailCodeRenderer and detailMarkerRenderer (DRY) |
| Create | `tests/core/relationHelpers.test.ts` | Unit tests for pure relation helpers |
| Create | `tests/core/codeApplicationRelations.test.ts` | Unit tests for CodeApplication relation helpers |
| Create | `tests/analytics/relationsEngine.test.ts` | Unit tests for relation edge extraction + merging |
| Create | `tests/export/qdpxLinks.test.ts` | Unit tests for `<Link>` XML generation |

---

## Chunk 1: Data Model + Pure Helpers

### Task 1: Add CodeRelation type and extend interfaces

**Files:**
- Modify: `src/core/types.ts:14-99`

- [ ] **Step 1: Write the failing test**

Create `tests/core/codeApplicationRelations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { CodeApplication, CodeRelation } from '../../src/core/types';

describe('CodeRelation type', () => {
	it('CodeApplication accepts relations array', () => {
		const ca: CodeApplication = {
			codeId: 'c1',
			relations: [{ label: 'causes', target: 'c2', directed: true }],
		};
		expect(ca.relations).toHaveLength(1);
		expect(ca.relations![0].directed).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/core/codeApplicationRelations.test.ts`
Expected: FAIL — `CodeRelation` not exported, `relations` not in `CodeApplication`

- [ ] **Step 3: Add CodeRelation type and extend interfaces**

In `src/core/types.ts`, add after line 13 (before CodeApplication):

```typescript
export interface CodeRelation {
	label: string;       // free text, autocomplete from project labels
	target: string;      // codeId of target code
	directed: boolean;   // true = directional, false = symmetric
}
```

Extend `CodeApplication` (line 14-17):
```typescript
export interface CodeApplication {
	codeId: string;
	magnitude?: string;
	relations?: CodeRelation[];
}
```

Extend `CodeDefinition` (after line 81):
```typescript
	// Relations code-level (Phase E)
	relations?: CodeRelation[];
```

Extend `GeneralSettings` (line 97-99):
```typescript
export interface GeneralSettings {
	showMagnitudeInPopover: boolean;
	showRelationsInPopover: boolean;
}
```

Update `createDefaultData()` (line 137):
```typescript
general: { showMagnitudeInPopover: true, showRelationsInPopover: true },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/core/codeApplicationRelations.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npm run test`
Expected: All existing tests pass. Any that reference `GeneralSettings` without `showRelationsInPopover` may need default value handling — check.

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "feat: add CodeRelation type e extend CodeApplication/CodeDefinition/GeneralSettings (Fase E)"
```

### Task 2: Add CodeApplication relation helpers

**Files:**
- Modify: `src/core/codeApplicationHelpers.ts`
- Modify: `tests/core/codeApplicationRelations.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/codeApplicationRelations.test.ts`:

```typescript
import {
	getRelations,
	addRelation,
	removeRelation,
} from '../../src/core/codeApplicationHelpers';

describe('relation helpers', () => {
	const codes: CodeApplication[] = [
		{ codeId: 'c1', relations: [{ label: 'causes', target: 'c2', directed: true }] },
		{ codeId: 'c2' },
	];

	describe('getRelations', () => {
		it('returns relations for code with relations', () => {
			expect(getRelations(codes, 'c1')).toEqual([{ label: 'causes', target: 'c2', directed: true }]);
		});
		it('returns empty array for code without relations', () => {
			expect(getRelations(codes, 'c2')).toEqual([]);
		});
		it('returns empty array for unknown code', () => {
			expect(getRelations(codes, 'c99')).toEqual([]);
		});
	});

	describe('addRelation', () => {
		it('adds relation to code that has none', () => {
			const result = addRelation(codes, 'c2', { label: 'relates-to', target: 'c1', directed: false });
			const c2 = result.find(c => c.codeId === 'c2')!;
			expect(c2.relations).toHaveLength(1);
			expect(c2.relations![0].label).toBe('relates-to');
		});
		it('appends relation to existing array', () => {
			const result = addRelation(codes, 'c1', { label: 'enables', target: 'c3', directed: true });
			const c1 = result.find(c => c.codeId === 'c1')!;
			expect(c1.relations).toHaveLength(2);
		});
		it('does not duplicate identical relation', () => {
			const result = addRelation(codes, 'c1', { label: 'causes', target: 'c2', directed: true });
			const c1 = result.find(c => c.codeId === 'c1')!;
			expect(c1.relations).toHaveLength(1);
		});
		it('returns original array for unknown code', () => {
			const result = addRelation(codes, 'c99', { label: 'x', target: 'c1', directed: false });
			expect(result).toBe(codes);
		});
	});

	describe('removeRelation', () => {
		it('removes relation by label+target', () => {
			const result = removeRelation(codes, 'c1', 'causes', 'c2');
			const c1 = result.find(c => c.codeId === 'c1')!;
			expect(c1.relations).toEqual([]);
		});
		it('returns original array when no match', () => {
			const result = removeRelation(codes, 'c1', 'unknown', 'c2');
			expect(result).toBe(codes);
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/core/codeApplicationRelations.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement relation helpers**

Append to `src/core/codeApplicationHelpers.ts`:

```typescript
import type { CodeRelation } from './types';

export function getRelations(codes: CodeApplication[], codeId: string): CodeRelation[] {
	return codes.find(c => c.codeId === codeId)?.relations ?? [];
}

export function addRelation(codes: CodeApplication[], codeId: string, relation: CodeRelation): CodeApplication[] {
	const idx = codes.findIndex(c => c.codeId === codeId);
	if (idx < 0) return codes;
	const ca = codes[idx];
	const existing = ca.relations ?? [];
	const dup = existing.some(r => r.label === relation.label && r.target === relation.target && r.directed === relation.directed);
	if (dup) return codes;
	return codes.map((c, i) => i === idx ? { ...c, relations: [...existing, relation] } : c);
}

export function removeRelation(codes: CodeApplication[], codeId: string, label: string, target: string): CodeApplication[] {
	const idx = codes.findIndex(c => c.codeId === codeId);
	if (idx < 0) return codes;
	const ca = codes[idx];
	const existing = ca.relations ?? [];
	const filtered = existing.filter(r => !(r.label === label && r.target === target));
	if (filtered.length === existing.length) return codes;
	return codes.map((c, i) => i === idx ? { ...c, relations: filtered } : c);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/core/codeApplicationRelations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: relation helpers em codeApplicationHelpers (getRelations, addRelation, removeRelation)"
```

### Task 3: Extend registry to handle relations

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts:98-123`
- Modify: `tests/core/codeDefinitionRegistry.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/core/codeDefinitionRegistry.test.ts`:

```typescript
describe('relations', () => {
	it('update() accepts relations field', () => {
		const reg = new CodeDefinitionRegistry();
		const code = reg.create('Alpha', '#ff0000');
		const ok = reg.update(code.id, {
			relations: [{ label: 'causes', target: 'fake-id', directed: true }],
		});
		expect(ok).toBe(true);
		expect(reg.getById(code.id)!.relations).toHaveLength(1);
	});

	it('update() clears relations with undefined', () => {
		const reg = new CodeDefinitionRegistry();
		const code = reg.create('Beta', '#00ff00');
		reg.update(code.id, { relations: [{ label: 'x', target: 'y', directed: false }] });
		reg.update(code.id, { relations: undefined });
		expect(reg.getById(code.id)!.relations).toBeUndefined();
	});

	it('toJSON/fromJSON round-trips relations', () => {
		const reg = new CodeDefinitionRegistry();
		const code = reg.create('Gamma', '#0000ff');
		reg.update(code.id, { relations: [{ label: 'enables', target: 'z', directed: true }] });
		const json = reg.toJSON();
		const restored = CodeDefinitionRegistry.fromJSON(json);
		expect(restored.getById(code.id)!.relations).toEqual([{ label: 'enables', target: 'z', directed: true }]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/core/codeDefinitionRegistry.test.ts`
Expected: FAIL — `update()` type doesn't accept `relations`

- [ ] **Step 3: Extend update() signature and body**

In `src/core/codeDefinitionRegistry.ts` line 98, change:

```typescript
update(id: string, changes: Partial<Pick<CodeDefinition, 'name' | 'color' | 'description' | 'magnitude'>>): boolean {
```

to:

```typescript
update(id: string, changes: Partial<Pick<CodeDefinition, 'name' | 'color' | 'description' | 'magnitude' | 'relations'>>): boolean {
```

After the magnitude block (after line 119), add:

```typescript
if ('relations' in changes) {
	def.relations = changes.relations;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/core/codeDefinitionRegistry.test.ts`
Expected: PASS

- [ ] **Step 5: Run full suite**

Run: `npm run test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "feat: registry.update() aceita relations, toJSON/fromJSON preserva"
```

### Task 4: Create relationHelpers.ts — pure functions

**Files:**
- Create: `src/core/relationHelpers.ts`
- Create: `tests/core/relationHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/relationHelpers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { collectAllLabels, buildRelationEdges } from '../../src/core/relationHelpers';
import type { CodeDefinition, CodeApplication, BaseMarker, CodeRelation } from '../../src/core/types';

function makeDef(id: string, name: string, relations?: CodeRelation[]): CodeDefinition {
	return { id, name, color: '#000', paletteIndex: 0, createdAt: 0, updatedAt: 0, childrenOrder: [], relations };
}

function makeMarker(id: string, codes: CodeApplication[]): BaseMarker {
	return { markerType: 'markdown', id, fileId: 'f1', codes, createdAt: 0, updatedAt: 0 };
}

describe('collectAllLabels', () => {
	it('collects labels from definitions and markers', () => {
		const defs = [
			makeDef('c1', 'A', [{ label: 'causes', target: 'c2', directed: true }]),
			makeDef('c2', 'B'),
		];
		const markers = [
			makeMarker('m1', [
				{ codeId: 'c1', relations: [{ label: 'enables', target: 'c2', directed: false }] },
			]),
		];
		const labels = collectAllLabels(defs, markers);
		expect(labels).toEqual(expect.arrayContaining(['causes', 'enables']));
		expect(labels).toHaveLength(2);
	});

	it('deduplicates labels', () => {
		const defs = [
			makeDef('c1', 'A', [{ label: 'causes', target: 'c2', directed: true }]),
		];
		const markers = [
			makeMarker('m1', [
				{ codeId: 'c1', relations: [{ label: 'causes', target: 'c3', directed: true }] },
			]),
		];
		const labels = collectAllLabels(defs, markers);
		expect(labels).toEqual(['causes']);
	});
});

describe('buildRelationEdges', () => {
	it('returns code-level edges', () => {
		const defs = [
			makeDef('c1', 'A', [{ label: 'causes', target: 'c2', directed: true }]),
			makeDef('c2', 'B'),
		];
		const edges = buildRelationEdges(defs, [], 'code');
		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({
			source: 'c1', target: 'c2', label: 'causes', directed: true, level: 'code', weight: 1,
		});
	});

	it('returns segment-level edges with weight by count', () => {
		const defs = [makeDef('c1', 'A'), makeDef('c2', 'B')];
		const markers = [
			makeMarker('m1', [{ codeId: 'c1', relations: [{ label: 'relates', target: 'c2', directed: false }] }]),
			makeMarker('m2', [{ codeId: 'c1', relations: [{ label: 'relates', target: 'c2', directed: false }] }]),
		];
		const edges = buildRelationEdges(defs, markers, 'both');
		const segEdges = edges.filter(e => e.level === 'segment');
		expect(segEdges).toHaveLength(1);
		expect(segEdges[0].weight).toBe(2);
	});

	it('merges edges when same label+target+directed exists at both levels', () => {
		const defs = [
			makeDef('c1', 'A', [{ label: 'causes', target: 'c2', directed: true }]),
			makeDef('c2', 'B'),
		];
		const markers = [
			makeMarker('m1', [{ codeId: 'c1', relations: [{ label: 'causes', target: 'c2', directed: true }] }]),
		];
		const edges = buildRelationEdges(defs, markers, 'both');
		expect(edges).toHaveLength(1);
		expect(edges[0].level).toBe('merged');
		expect(edges[0].weight).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/core/relationHelpers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement relationHelpers.ts**

Create `src/core/relationHelpers.ts`:

```typescript
import type { CodeDefinition, CodeRelation, BaseMarker } from './types';

export interface RelationEdge {
	source: string;   // codeId
	target: string;   // codeId
	label: string;
	directed: boolean;
	level: 'code' | 'segment' | 'merged';
	weight: number;   // code-level: always 1; segment-level: count of markers
}

/**
 * Collect all unique relation labels from code definitions and markers.
 * Used for autocomplete suggestions.
 */
export function collectAllLabels(definitions: CodeDefinition[], markers: BaseMarker[]): string[] {
	const labels = new Set<string>();
	for (const def of definitions) {
		if (def.relations) {
			for (const r of def.relations) labels.add(r.label);
		}
	}
	for (const marker of markers) {
		for (const ca of marker.codes) {
			if (ca.relations) {
				for (const r of ca.relations) labels.add(r.label);
			}
		}
	}
	return [...labels].sort();
}

type EdgeLevel = 'code' | 'both';

/**
 * Build relation edges from definitions and markers.
 * mode='code' → only code-level. mode='both' → code + segment, merged where overlapping.
 */
export function buildRelationEdges(
	definitions: CodeDefinition[],
	markers: BaseMarker[],
	mode: EdgeLevel,
): RelationEdge[] {
	// Code-level edges (weight always 1)
	const codeEdges = new Map<string, RelationEdge>();
	for (const def of definitions) {
		if (!def.relations) continue;
		for (const r of def.relations) {
			const key = edgeKey(def.id, r.target, r.label, r.directed);
			if (!codeEdges.has(key)) {
				codeEdges.set(key, {
					source: def.id, target: r.target, label: r.label,
					directed: r.directed, level: 'code', weight: 1,
				});
			}
		}
	}

	if (mode === 'code') return [...codeEdges.values()];

	// Segment-level edges (weight = count of unique markers)
	const segCounts = new Map<string, { edge: RelationEdge; markerIds: Set<string> }>();
	for (const marker of markers) {
		for (const ca of marker.codes) {
			if (!ca.relations) continue;
			for (const r of ca.relations) {
				const key = edgeKey(ca.codeId, r.target, r.label, r.directed);
				let entry = segCounts.get(key);
				if (!entry) {
					entry = {
						edge: {
							source: ca.codeId, target: r.target, label: r.label,
							directed: r.directed, level: 'segment', weight: 0,
						},
						markerIds: new Set(),
					};
					segCounts.set(key, entry);
				}
				entry.markerIds.add(marker.id);
			}
		}
	}

	// Merge: if same key exists at both levels, create 'merged' edge
	const result: RelationEdge[] = [];
	const processedKeys = new Set<string>();

	for (const [key, codeEdge] of codeEdges) {
		const segEntry = segCounts.get(key);
		if (segEntry) {
			result.push({
				...codeEdge,
				level: 'merged',
				weight: segEntry.markerIds.size,
			});
			processedKeys.add(key);
		} else {
			result.push(codeEdge);
		}
	}

	for (const [key, entry] of segCounts) {
		if (processedKeys.has(key)) continue;
		entry.edge.weight = entry.markerIds.size;
		result.push(entry.edge);
	}

	return result;
}

function edgeKey(source: string, target: string, label: string, directed: boolean): string {
	if (directed) return `${source}→${target}:${label}`;
	// Undirected: normalize order
	const [a, b] = source < target ? [source, target] : [target, source];
	return `${a}↔${b}:${label}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/core/relationHelpers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: relationHelpers.ts — collectAllLabels e buildRelationEdges puras"
```

---

## Chunk 2: UI — Detail View + Marker Detail + Settings

### Task 5: Settings toggle for relations in popover

**Files:**
- Modify: `src/core/settingTab.ts:30-41`

- [ ] **Step 1: Add the toggle**

After the magnitude toggle (line 40), add:

```typescript
new Setting(containerEl)
	.setName('Show relations in popover')
	.setDesc('Show relations section in the coding popover for adding segment-level relations')
	.addToggle(toggle => toggle
		.setValue(generalSettings.showRelationsInPopover)
		.onChange((value) => {
			generalSettings.showRelationsInPopover = value;
			save();
		}));
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "feat: toggle 'Show relations in popover' nas settings"
```

### Task 6: Relations section in Detail View Level 2 (code-level)

**Files:**
- Modify: `src/core/detailCodeRenderer.ts`

- [ ] **Step 1: Add renderRelationsSection after magnitude config**

After line 91 (`if (def) renderMagnitudeConfigSection(...)`) in `renderCodeDetail()`, add:

```typescript
// Relations code-level
if (def) renderRelationsSection(container, def, model, callbacks);
```

Then implement `renderRelationsSection` as a new function (after `renderMagnitudeConfigSection`, before `renderAuditSection`):

```typescript
function renderRelationsSection(
	container: HTMLElement,
	def: CodeDefinition,
	model: SidebarModelInterface,
	callbacks: Pick<CodeRendererCallbacks, 'showCodeDetail' | 'suspendRefresh' | 'resumeRefresh'>,
): void {
	const relations = def.relations ?? [];
	// Only show section if relations exist or to allow adding
	const section = container.createDiv({ cls: 'codemarker-detail-section codemarker-detail-relations' });

	const headerRow = section.createDiv({ cls: 'codemarker-detail-relations-header' });
	headerRow.createEl('h6', { text: 'Relations' });

	const body = section.createDiv({ cls: 'codemarker-detail-relations-body' });

	const saveRelations = () => {
		model.registry.update(def.id, { relations: def.relations && def.relations.length > 0 ? def.relations : undefined });
		model.saveMarkers();
	};

	const allLabels = collectAllLabels(model.registry.getAll(), model.getAllMarkers());

	const renderRows = () => {
		body.empty();
		const currentRelations = def.relations ?? [];

		for (const rel of currentRelations) {
			const row = body.createDiv({ cls: 'codemarker-detail-relation-row' });

			// Direction indicator
			const dirIcon = row.createSpan({ cls: 'codemarker-detail-relation-dir' });
			setIcon(dirIcon, rel.directed ? 'arrow-right' : 'minus');
			dirIcon.title = rel.directed ? 'Directed' : 'Symmetric';

			// Label
			row.createSpan({ cls: 'codemarker-detail-relation-label', text: rel.label });

			// Target code chip
			const targetDef = model.registry.getById(rel.target);
			if (targetDef) {
				const chip = row.createSpan({ cls: 'codemarker-detail-chip' });
				const dot = chip.createSpan({ cls: 'codemarker-detail-chip-dot' });
				dot.style.backgroundColor = targetDef.color;
				chip.createSpan({ text: targetDef.name });
				chip.addEventListener('click', () => callbacks.showCodeDetail(targetDef.id));
			} else {
				row.createSpan({ cls: 'codemarker-detail-relation-target-missing', text: '(deleted)' });
			}

			// Remove button
			const removeBtn = row.createSpan({ cls: 'codemarker-detail-magnitude-remove' });
			setIcon(removeBtn, 'x');
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				if (!def.relations) return;
				def.relations = def.relations.filter(r => !(r.label === rel.label && r.target === rel.target));
				saveRelations();
				renderRows();
			});
		}

		// Add relation row
		renderAddRelationRow(body, def, model, allLabels, () => {
			saveRelations();
			renderRows();
		}, callbacks);
	};

	renderRows();
}
```

Import `collectAllLabels` from `./relationHelpers`, `CodeRelation` from `./types`, and `renderAddRelationRow` from `./relationUI` at the top of the file.

The `renderAddRelationRow` helper is shared — see Task 6b below.

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "feat: secao Relations no Detail View Level 2 (codigo-level)"
```

### Task 6b: Extract shared renderAddRelationRow to relationUI.ts

**Files:**
- Create: `src/core/relationUI.ts`

- [ ] **Step 1: Create the shared helper**

Create `src/core/relationUI.ts`:

```typescript
import { setIcon } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { CodeRelation } from './types';

interface FocusCallbacks {
	suspendRefresh(): void;
	resumeRefresh(): void;
}

/**
 * Shared "add relation" row used by detailCodeRenderer and detailMarkerRenderer.
 * Renders: label input (with datalist autocomplete) + target input + direction toggle + add button.
 */
export function renderAddRelationRow(
	parent: HTMLElement,
	owner: { relations?: CodeRelation[] },
	registry: CodeDefinitionRegistry,
	allLabels: string[],
	onSave: () => void,
	callbacks: FocusCallbacks,
): void {
	const addRow = parent.createDiv({ cls: 'codemarker-detail-relation-add' });

	// Datalist for label autocomplete
	const labelListId = `relation-labels-${Date.now()}`;
	const datalist = addRow.createEl('datalist', { attr: { id: labelListId } });
	for (const label of allLabels) {
		datalist.createEl('option', { attr: { value: label } });
	}

	const labelInput = addRow.createEl('input', {
		cls: 'codemarker-detail-relation-input',
		attr: { type: 'text', placeholder: 'Label...', list: labelListId },
	});

	// Datalist for target code autocomplete
	const targetListId = `relation-targets-${Date.now()}`;
	const targetDatalist = addRow.createEl('datalist', { attr: { id: targetListId } });
	for (const def of registry.getAll()) {
		targetDatalist.createEl('option', { attr: { value: def.name } });
	}

	const targetInput = addRow.createEl('input', {
		cls: 'codemarker-detail-relation-input',
		attr: { type: 'text', placeholder: 'Target code...', list: targetListId },
	});

	const dirToggle = addRow.createEl('button', { cls: 'codemarker-detail-relation-dir-btn' });
	let directed = true;
	const updateDirIcon = () => {
		dirToggle.empty();
		setIcon(dirToggle, directed ? 'arrow-right' : 'minus');
		dirToggle.title = directed ? 'Directed (click to toggle)' : 'Symmetric (click to toggle)';
	};
	updateDirIcon();
	dirToggle.addEventListener('click', (e) => {
		e.stopPropagation();
		directed = !directed;
		updateDirIcon();
	});

	const addBtn = addRow.createEl('button', { text: 'Add', cls: 'codemarker-detail-relation-add-btn' });
	addBtn.addEventListener('click', () => {
		const label = labelInput.value.trim();
		const targetName = targetInput.value.trim();
		if (!label || !targetName) return;

		// Resolve target: find existing or create new
		let targetDef = registry.getByName(targetName);
		if (!targetDef) {
			targetDef = registry.create(targetName, registry.peekNextPaletteColor());
		}

		if (!owner.relations) owner.relations = [];
		const dup = owner.relations.some(r => r.label === label && r.target === targetDef!.id && r.directed === directed);
		if (dup) return;

		owner.relations.push({ label, target: targetDef.id, directed });
		labelInput.value = '';
		targetInput.value = '';
		onSave();
	});

	// Focus management
	for (const inp of [labelInput, targetInput]) {
		inp.addEventListener('focus', () => callbacks.suspendRefresh());
		inp.addEventListener('blur', () => callbacks.resumeRefresh());
		inp.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
			e.stopPropagation();
		});
	}
}
```

Key: Uses native `<datalist>` for autocomplete on both label (from `allLabels`) and target (from registry code names). This satisfies the spec requirement "Label livre com autocomplete das ja usadas no projeto".

- [ ] **Step 2: Update detailCodeRenderer.ts to use shared helper**

In `renderRelationsSection`, replace the inline add-row with:

```typescript
import { renderAddRelationRow } from './relationUI';
// ...
renderAddRelationRow(body, def, model.registry, allLabels, () => {
	saveRelations();
	renderRows();
}, callbacks);
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: extract renderAddRelationRow para relationUI.ts (DRY)"
```

### Task 7: Relations per code in Marker Detail Level 3 (segment-level)

**Files:**
- Modify: `src/core/detailMarkerRenderer.ts`

- [ ] **Step 1: Add renderRelationsPerCode after magnitude**

In `renderMarkerDetail()`, after line 69 (`renderMagnitudePerCode(...)`) add:

```typescript
// Relations segment-level per code
renderRelationsPerCode(container, marker, model, callbacks);
```

Then implement:

```typescript
import { setIcon } from 'obsidian';
import { collectAllLabels } from './relationHelpers';
import { renderAddRelationRow } from './relationUI';

function renderRelationsPerCode(
	container: HTMLElement,
	marker: BaseMarker,
	model: SidebarModelInterface,
	callbacks: MarkerRendererCallbacks,
) {
	const section = container.createDiv({ cls: 'codemarker-detail-section codemarker-detail-relations' });
	section.createEl('h6', { text: 'Relations' });

	const allLabels = collectAllLabels(model.registry.getAll(), model.getAllMarkers());

	for (const ca of marker.codes) {
		const def = model.registry.getById(ca.codeId);
		if (!def) continue;

		const codeRow = section.createDiv({ cls: 'codemarker-detail-relation-code-group' });
		const codeHeader = codeRow.createDiv({ cls: 'codemarker-detail-magnitude-row' });
		const swatch = codeHeader.createSpan({ cls: 'codemarker-detail-chip-dot' });
		swatch.style.backgroundColor = def.color;
		codeHeader.createSpan({ text: def.name, cls: 'codemarker-detail-magnitude-code-name' });

		const relBody = codeRow.createDiv();

		const saveAndRebuild = () => {
			marker.updatedAt = Date.now();
			model.saveMarkers();
			rebuild();
		};

		const rebuild = () => {
			relBody.empty();
			const rels = ca.relations ?? [];
			for (const rel of rels) {
				const row = relBody.createDiv({ cls: 'codemarker-detail-relation-row' });
				const dirIcon = row.createSpan({ cls: 'codemarker-detail-relation-dir' });
				setIcon(dirIcon, rel.directed ? 'arrow-right' : 'minus');

				row.createSpan({ cls: 'codemarker-detail-relation-label', text: rel.label });

				const targetDef = model.registry.getById(rel.target);
				if (targetDef) {
					const chip = row.createSpan({ cls: 'codemarker-detail-chip' });
					const dot = chip.createSpan({ cls: 'codemarker-detail-chip-dot' });
					dot.style.backgroundColor = targetDef.color;
					chip.createSpan({ text: targetDef.name });
					chip.addEventListener('click', () => callbacks.showCodeDetail(targetDef.id));
				}

				const removeBtn = row.createSpan({ cls: 'codemarker-detail-magnitude-remove' });
				setIcon(removeBtn, 'x');
				removeBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					if (!ca.relations) return;
					ca.relations = ca.relations.filter(r => !(r.label === rel.label && r.target === rel.target));
					saveAndRebuild();
				});
			}

			// Shared add-relation row (with datalist autocomplete)
			renderAddRelationRow(relBody, ca, model.registry, allLabels, saveAndRebuild, callbacks);
		};

		rebuild();
	}
}
```

Import `setIcon` from `obsidian`, `collectAllLabels` from `./relationHelpers`, `renderAddRelationRow` from `./relationUI` at the top.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "feat: secao Relations no Marker Detail Level 3 (segmento-level)"
```

---

## Chunk 3: Popover Relations Section

### Task 8: Add renderRelationsSection to baseCodingMenu

**Files:**
- Modify: `src/core/baseCodingMenu.ts`

- [ ] **Step 1: Add RelationsHandle type and renderRelationsSection**

After `renderMagnitudeSection` (after line 487), add:

```typescript
// ── Relations section ─────────────────────────────────────

export interface RelationsHandle {
	wrapper: HTMLElement;
	separator: HTMLElement;
	updateVisibility(show: boolean): void;
	refresh(activeCodeIds: string[]): void;
}

/**
 * Renders a collapsible relations section in the popover.
 * Shows segment-level relations per active code.
 */
export function renderRelationsSection(
	parent: HTMLElement,
	registry: CodeDefinitionRegistry,
	activeCodeIds: string[],
	getRelations: (codeId: string) => Array<{ label: string; target: string; directed: boolean }>,
	setRelations: (codeId: string, relations: Array<{ label: string; target: string; directed: boolean }>) => void,
	visible: boolean,
	allLabels: string[],
): RelationsHandle {
	const separator = createSeparator();
	const wrapper = document.createElement('div');
	wrapper.className = 'codemarker-tooltip-relations-wrapper';

	// Header
	const header = document.createElement('div');
	header.className = 'codemarker-tooltip-memo-header menu-item';
	const chevron = document.createElement('div');
	chevron.className = 'codemarker-tooltip-memo-chevron';
	setIcon(chevron, 'chevron-right');
	header.appendChild(chevron);
	const headerTitle = document.createElement('span');
	headerTitle.className = 'menu-item-title';
	headerTitle.textContent = 'Relations';
	header.appendChild(headerTitle);

	// Body
	const body = document.createElement('div');
	body.className = 'codemarker-tooltip-relations-body';

	let expanded = false;
	body.style.display = 'none';

	const buildContent = (codeIds: string[]) => {
		body.innerHTML = '';
		if (codeIds.length === 0) {
			separator.style.display = 'none';
			wrapper.style.display = 'none';
			return;
		}
		if (codeIds.length > 0) {
			separator.style.display = visible ? '' : 'none';
			wrapper.style.display = visible ? '' : 'none';
		}

		for (const codeId of codeIds) {
			const def = registry.getById(codeId);
			if (!def) continue;

			const rels = getRelations(codeId);

			const codeGroup = document.createElement('div');
			codeGroup.className = 'codemarker-tooltip-relations-code-group';

			// Code header
			const codeHeader = document.createElement('div');
			codeHeader.className = 'codemarker-tooltip-magnitude-row';
			const swatch = document.createElement('span');
			swatch.className = 'codemarker-popover-swatch';
			swatch.style.backgroundColor = def.color;
			codeHeader.appendChild(swatch);
			const nameEl = document.createElement('span');
			nameEl.className = 'codemarker-tooltip-magnitude-code-name';
			nameEl.textContent = def.name;
			codeHeader.appendChild(nameEl);
			codeGroup.appendChild(codeHeader);

			// Existing relations
			for (const rel of rels) {
				const row = document.createElement('div');
				row.className = 'codemarker-tooltip-relation-row';

				const dirEl = document.createElement('span');
				dirEl.className = 'codemarker-tooltip-relation-dir';
				setIcon(dirEl, rel.directed ? 'arrow-right' : 'minus');
				row.appendChild(dirEl);

				const labelEl = document.createElement('span');
				labelEl.className = 'codemarker-tooltip-relation-label';
				labelEl.textContent = rel.label;
				row.appendChild(labelEl);

				const targetDef = registry.getById(rel.target);
				const targetEl = document.createElement('span');
				targetEl.className = 'codemarker-tooltip-relation-target';
				targetEl.textContent = targetDef?.name ?? '(deleted)';
				row.appendChild(targetEl);

				const removeBtn = document.createElement('span');
				removeBtn.className = 'codemarker-tooltip-relation-remove';
				setIcon(removeBtn, 'x');
				removeBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					const updated = rels.filter(r => !(r.label === rel.label && r.target === rel.target));
					setRelations(codeId, updated);
					buildContent(codeIds);
				});
				row.appendChild(removeBtn);

				codeGroup.appendChild(row);
			}

			// Compact add row
			const addRow = document.createElement('div');
			addRow.className = 'codemarker-tooltip-relation-add';

			const labelIn = document.createElement('input');
			labelIn.className = 'codemarker-tooltip-relation-input';
			labelIn.placeholder = 'Label...';
			applyInputTheme(labelIn);
			addRow.appendChild(labelIn);

			const targetIn = document.createElement('input');
			targetIn.className = 'codemarker-tooltip-relation-input';
			targetIn.placeholder = 'Target...';
			applyInputTheme(targetIn);
			addRow.appendChild(targetIn);

			const dirBtn = document.createElement('button');
			dirBtn.className = 'codemarker-tooltip-relation-dir-btn';
			let directed = true;
			const updateDir = () => { dirBtn.innerHTML = ''; setIcon(dirBtn, directed ? 'arrow-right' : 'minus'); };
			updateDir();
			dirBtn.addEventListener('click', (e) => { e.stopPropagation(); directed = !directed; updateDir(); });
			addRow.appendChild(dirBtn);

			const addBtn = document.createElement('button');
			addBtn.className = 'codemarker-tooltip-relation-add-btn';
			addBtn.textContent = '+';
			addBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const label = labelIn.value.trim();
				const targetName = targetIn.value.trim();
				if (!label || !targetName) return;
				let targetDef = registry.getByName(targetName);
				if (!targetDef) {
					targetDef = registry.create(targetName, registry.peekNextPaletteColor());
				}
				const dup = rels.some(r => r.label === label && r.target === targetDef!.id && r.directed === directed);
				if (dup) return;
				setRelations(codeId, [...rels, { label, target: targetDef.id, directed }]);
				buildContent(codeIds);
			});
			addRow.appendChild(addBtn);

			for (const inp of [labelIn, targetIn]) {
				inp.addEventListener('mousedown', (e) => e.stopPropagation());
				inp.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
					e.stopPropagation();
				});
			}

			codeGroup.appendChild(addRow);
			body.appendChild(codeGroup);
		}
	};

	header.addEventListener('click', (e) => {
		e.stopPropagation();
		expanded = !expanded;
		body.style.display = expanded ? '' : 'none';
		wrapper.toggleClass('is-open', expanded);
	});

	wrapper.appendChild(header);
	wrapper.appendChild(body);

	// Auto-expand if any code has relations
	const hasAnyRelations = activeCodeIds.some(id => getRelations(id).length > 0);
	if (hasAnyRelations) {
		expanded = true;
		body.style.display = '';
		wrapper.addClass('is-open');
	}

	buildContent(activeCodeIds);

	separator.style.display = visible ? '' : 'none';
	wrapper.style.display = visible ? '' : 'none';

	parent.appendChild(separator);
	parent.appendChild(wrapper);

	return {
		wrapper,
		separator,
		updateVisibility(show: boolean) {
			separator.style.display = show ? '' : 'none';
			wrapper.style.display = show ? '' : 'none';
		},
		refresh(codeIds: string[]) {
			buildContent(codeIds);
		},
	};
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "feat: renderRelationsSection no baseCodingMenu (popover collapsible)"
```

### Task 9: Wire relations into codingPopover

**Files:**
- Modify: `src/core/codingPopover.ts`

- [ ] **Step 1: Extend adapter and options interfaces**

Add to `CodingPopoverAdapter` (after line 64):

```typescript
/** Get segment-level relations for a specific code on this marker */
getRelationsForCode?(codeId: string): Array<{ label: string; target: string; directed: boolean }>;
/** Set segment-level relations for a specific code on this marker */
setRelationsForCode?(codeId: string, relations: Array<{ label: string; target: string; directed: boolean }>): void;
```

Add to `CodingPopoverOptions` (after line 108):

```typescript
/** Whether to show the relations section (from settings) */
showRelationsSection?: boolean;
```

- [ ] **Step 2: Add relations section rendering**

Import `renderRelationsSection` and `RelationsHandle` from `./baseCodingMenu`, and `collectAllLabels` from `./relationHelpers`.

After the magnitude section block (after line 327), add:

```typescript
// ── d3) Relations section ──
let relationsHandle: RelationsHandle | null = null;
const showRel = options.showRelationsSection !== false
	&& adapter.getRelationsForCode
	&& adapter.setRelationsForCode;

if (showRel) {
	const activeCodeIds = activeCodes
		.map(name => adapter.registry.getByName(name)?.id)
		.filter((id): id is string => !!id);

	const allLabels = collectAllLabels(adapter.registry.getAll(), []);

	relationsHandle = renderRelationsSection(
		container,
		adapter.registry,
		activeCodeIds,
		(codeId) => adapter.getRelationsForCode!(codeId),
		(codeId, relations) => {
			adapter.setRelationsForCode!(codeId, relations);
			adapter.save();
		},
		activeCodes.length > 0,
		allLabels,
	);
}
```

In the `onToggle` callback (around line 180-188), add relations handle refresh after magnitude:

```typescript
if (relationsHandle) {
	relationsHandle.updateVisibility(activeCodes.length > 0);
	const updatedIds = activeCodes
		.map(name => adapter.registry.getByName(name)?.id)
		.filter((id): id is string => !!id);
	relationsHandle.refresh(updatedIds);
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "feat: secao Relations no codingPopover (segmento-level, toggle nas settings)"
```

### Task 10: Wire adapter implementations in all engines

**Files:**
- Each engine's popover adapter needs `getRelationsForCode` and `setRelationsForCode`.
- Search for all files that implement `CodingPopoverAdapter`.

- [ ] **Step 1: Find all adapter implementations**

Run: `grep -r "CodingPopoverAdapter" src/ --include="*.ts" -l`

- [ ] **Step 2: Add relation methods to each adapter**

For each file found, add the two methods following the same pattern as `getMagnitudeForCode`/`setMagnitudeForCode`. The pattern is:

```typescript
getRelationsForCode: (codeId: string) => {
	const ca = marker.codes.find(c => c.codeId === codeId);
	return ca?.relations ?? [];
},
setRelationsForCode: (codeId: string, relations) => {
	const ca = marker.codes.find(c => c.codeId === codeId);
	if (ca) {
		ca.relations = relations.length > 0 ? relations : undefined;
		marker.updatedAt = Date.now();
	}
},
```

Also pass `showRelationsSection` from settings in the options:

```typescript
showRelationsSection: generalSettings.showRelationsInPopover,
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "feat: adapter Relations em todos os engines (md, pdf, csv, img, media)"
```

---

## Chunk 4: Analytics — Relations Network Mode

### Task 11: Create relationsEngine.ts — pure data extraction

**Files:**
- Create: `src/analytics/data/relationsEngine.ts`
- Create: `tests/analytics/relationsEngine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/analytics/relationsEngine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractRelationNodes, extractRelationEdges } from '../../src/analytics/data/relationsEngine';
import type { CodeDefinition, BaseMarker, CodeApplication } from '../../src/core/types';
import type { RelationEdge } from '../../src/core/relationHelpers';

function makeDef(id: string, name: string, color: string, relations?: CodeDefinition['relations']): CodeDefinition {
	return { id, name, color, paletteIndex: 0, createdAt: 0, updatedAt: 0, childrenOrder: [], relations };
}

function makeMarker(id: string, codes: CodeApplication[]): BaseMarker {
	return { markerType: 'markdown', id, fileId: 'f1', codes, createdAt: 0, updatedAt: 0 };
}

describe('extractRelationEdges', () => {
	it('returns empty array when no relations', () => {
		const edges = extractRelationEdges([], [], 'both');
		expect(edges).toEqual([]);
	});

	it('returns code-level edges from definitions', () => {
		const defs = [
			makeDef('c1', 'A', '#f00', [{ label: 'causes', target: 'c2', directed: true }]),
			makeDef('c2', 'B', '#0f0'),
		];
		const edges = extractRelationEdges(defs, [], 'code');
		expect(edges).toHaveLength(1);
		expect(edges[0].source).toBe('c1');
		expect(edges[0].target).toBe('c2');
		expect(edges[0].level).toBe('code');
	});

	it('returns segment-level edges from markers in both mode', () => {
		const defs = [makeDef('c1', 'A', '#f00'), makeDef('c2', 'B', '#0f0')];
		const markers = [
			makeMarker('m1', [{ codeId: 'c1', relations: [{ label: 'relates', target: 'c2', directed: false }] }]),
		];
		const edges = extractRelationEdges(defs, markers, 'both');
		expect(edges.some(e => e.level === 'segment')).toBe(true);
	});

	it('filters segment-level edges in code-only mode', () => {
		const defs = [makeDef('c1', 'A', '#f00'), makeDef('c2', 'B', '#0f0')];
		const markers = [
			makeMarker('m1', [{ codeId: 'c1', relations: [{ label: 'relates', target: 'c2', directed: false }] }]),
		];
		const edges = extractRelationEdges(defs, markers, 'code');
		expect(edges).toHaveLength(0);
	});
});

describe('extractRelationNodes', () => {
	it('returns nodes for codes involved in edges', () => {
		const defs = [makeDef('c1', 'A', '#f00'), makeDef('c2', 'B', '#0f0'), makeDef('c3', 'C', '#00f')];
		const edges: RelationEdge[] = [
			{ source: 'c1', target: 'c2', label: 'x', directed: true, level: 'code', weight: 1 },
		];
		const nodes = extractRelationNodes(defs, edges, new Map([['c1', 5], ['c2', 3]]));
		expect(nodes).toHaveLength(2);
		expect(nodes.find(n => n.id === 'c1')!.weight).toBe(5);
		expect(nodes.find(n => n.id === 'c3')).toBeUndefined();
	});

	it('returns empty array when no edges', () => {
		const nodes = extractRelationNodes([], [], new Map());
		expect(nodes).toEqual([]);
	});

	it('defaults weight to 0 for codes not in frequency map', () => {
		const defs = [makeDef('c1', 'A', '#f00'), makeDef('c2', 'B', '#0f0')];
		const edges: RelationEdge[] = [
			{ source: 'c1', target: 'c2', label: 'x', directed: true, level: 'code', weight: 1 },
		];
		const nodes = extractRelationNodes(defs, edges, new Map());
		expect(nodes.every(n => n.weight === 0)).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/analytics/relationsEngine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement relationsEngine.ts**

Create `src/analytics/data/relationsEngine.ts`:

```typescript
import type { CodeDefinition, BaseMarker } from '../../core/types';
import { buildRelationEdges, type RelationEdge } from '../../core/relationHelpers';

export type RelationsLevel = 'code' | 'both';

export interface RelationNode {
	id: string;
	name: string;
	color: string;
	weight: number; // frequency count for sizing
}

/**
 * Extract relation edges for the network view.
 * Delegates to the pure buildRelationEdges from core.
 */
export function extractRelationEdges(
	definitions: CodeDefinition[],
	markers: BaseMarker[],
	level: RelationsLevel,
): RelationEdge[] {
	return buildRelationEdges(definitions, markers, level === 'code' ? 'code' : 'both');
}

/**
 * Extract nodes — all codes that appear in at least one relation edge.
 */
export function extractRelationNodes(
	definitions: CodeDefinition[],
	edges: RelationEdge[],
	frequencyMap: Map<string, number>,
): RelationNode[] {
	const nodeIds = new Set<string>();
	for (const e of edges) {
		nodeIds.add(e.source);
		nodeIds.add(e.target);
	}

	const defMap = new Map(definitions.map(d => [d.id, d]));
	const nodes: RelationNode[] = [];
	for (const id of nodeIds) {
		const def = defMap.get(id);
		if (!def) continue;
		nodes.push({
			id: def.id,
			name: def.name,
			color: def.color,
			weight: frequencyMap.get(id) ?? 0,
		});
	}
	return nodes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/analytics/relationsEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: relationsEngine.ts — extractRelationEdges e extractRelationNodes"
```

### Task 12: Expose DataManager on AnalyticsPluginAPI + Create relationsNetworkMode.ts

**Files:**
- Modify: `src/analytics/index.ts:16-26` — add `dataManager` to `AnalyticsPluginAPI`
- Create: `src/analytics/views/modes/relationsNetworkMode.ts`
- Modify: `src/analytics/views/modes/modeRegistry.ts`
- Modify: `src/analytics/views/analyticsViewContext.ts:10`
- Modify: `src/analytics/views/analyticsView.ts` — add `relationsLevel` state + init

- [ ] **Step 1: Add dataManager to AnalyticsPluginAPI**

In `src/analytics/index.ts` line 16, extend the interface:

```typescript
export interface AnalyticsPluginAPI {
  app: App;
  registry: CodeDefinitionRegistry;
  dataManager: DataManager;  // NEW — needed for relations network to read raw markers
  data: ConsolidatedData | null;
  // ... rest unchanged
}
```

Import `DataManager` at the top. In `registerAnalyticsEngine()` (line 50), add to the api object:

```typescript
dataManager: plugin.dataManager,
```

- [ ] **Step 2: Add ViewMode union member + state**

In `src/analytics/views/analyticsViewContext.ts` line 10, add `"relations-network"` to the `ViewMode` union:

```typescript
export type ViewMode = "dashboard" | "frequency" | ... | "code-overlap" | "relations-network";
```

Add state field to `AnalyticsViewContext` interface (after `srcCompSort`, before `trSearch`):

```typescript
// Relations Network state
relationsLevel: 'code' | 'both';
```

In `src/analytics/views/analyticsView.ts`, add the default state (after `srcCompSort` initialization, around line 74):

```typescript
// Relations Network state
relationsLevel: 'code' | 'both' = 'both';
```

- [ ] **Step 3: Create the mode file**

Create `src/analytics/views/modes/relationsNetworkMode.ts`.

**Key differences from graphMode:** uses explicit relation edges (not co-occurrence), reads raw markers via `ctx.plugin.dataManager`, renders solid/dashed/merged edge styles, and arrow heads for directed edges.

```typescript
import type { FilterConfig } from "../../data/dataTypes";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { calculateFrequency } from "../../data/statsEngine";
import { extractRelationEdges, extractRelationNodes } from "../../data/relationsEngine";
import { isLightColor, buildCsv } from "../shared/chartHelpers";
import { readAllData } from "../../data/dataReader";
import type { BaseMarker } from "../../../core/types";

/** Collect all BaseMarker[] from all engines via DataManager. */
function collectAllMarkers(ctx: AnalyticsViewContext): BaseMarker[] {
	const raw = readAllData(ctx.plugin.dataManager);
	const markers: BaseMarker[] = [];
	// Markdown
	for (const fileMarkers of Object.values(raw.markdown.markers)) {
		markers.push(...fileMarkers);
	}
	// CSV
	markers.push(...raw.csv.segmentMarkers, ...raw.csv.rowMarkers);
	// Image
	markers.push(...raw.image.markers);
	// PDF
	markers.push(...raw.pdf.markers, ...raw.pdf.shapes);
	// Audio
	for (const af of raw.audio.files) markers.push(...af.markers);
	// Video
	for (const vf of raw.video.files) markers.push(...vf.markers);
	return markers;
}

export function renderRelationsNetworkOptions(ctx: AnalyticsViewContext): void {
	const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
	section.createDiv({ cls: "codemarker-config-section-title", text: "Relations Network" });

	// Level toggle: Code-level | Code + Segments
	const levelRow = section.createDiv({ cls: "codemarker-config-row" });
	levelRow.createSpan({ text: "Level" });
	const select = levelRow.createEl("select", { cls: "dropdown" });
	select.style.marginLeft = "auto";
	for (const [val, label] of [["code", "Code-level"], ["both", "Code + Segments"]] as const) {
		const opt = select.createEl("option", { text: label, attr: { value: val } });
		if (val === ctx.relationsLevel) opt.selected = true;
	}
	select.addEventListener("change", () => {
		ctx.relationsLevel = select.value as 'code' | 'both';
		ctx.scheduleUpdate();
	});

	// Edge labels toggle
	const labelRow = section.createDiv({ cls: "codemarker-config-row" });
	const labelCb = labelRow.createEl("input", { type: "checkbox" });
	labelCb.checked = ctx.showEdgeLabels;
	labelRow.createSpan({ text: "Show edge labels" });
	labelCb.addEventListener("change", () => {
		ctx.showEdgeLabels = labelCb.checked;
		ctx.scheduleUpdate();
	});
	labelRow.addEventListener("click", (e) => {
		if (e.target !== labelCb) { labelCb.checked = !labelCb.checked; labelCb.dispatchEvent(new Event("change")); }
	});
}

export function renderRelationsNetwork(ctx: AnalyticsViewContext, filters: FilterConfig): void {
	if (!ctx.chartContainer || !ctx.data) return;

	const registry = ctx.plugin.registry;
	const allDefs = registry.getAll();
	const allMarkers = collectAllMarkers(ctx);

	const edges = extractRelationEdges(allDefs, allMarkers, ctx.relationsLevel);

	if (edges.length === 0) {
		ctx.chartContainer.createDiv({
			cls: "codemarker-analytics-empty",
			text: "No relations defined. Add relations in the Codebook detail view or coding popover.",
		});
		return;
	}

	const freq = calculateFrequency(ctx.data, filters);
	const freqMap = new Map(freq.map(f => [f.code, f.total]));
	// Resolve code name→id for frequency
	const nameToId = new Map(allDefs.map(d => [d.name, d.id]));
	const freqById = new Map<string, number>();
	for (const [name, count] of freqMap) {
		const id = nameToId.get(name);
		if (id) freqById.set(id, count);
	}

	const nodes = extractRelationNodes(allDefs, edges, freqById);

	if (nodes.length < 2) {
		ctx.chartContainer.createDiv({
			cls: "codemarker-analytics-empty",
			text: "Need at least 2 codes with relations for a network.",
		});
		return;
	}

	// Canvas-based force-directed layout (same approach as graphMode.ts)
	const canvas = ctx.chartContainer.createEl("canvas");
	canvas.width = ctx.chartContainer.clientWidth;
	canvas.height = Math.max(400, ctx.chartContainer.clientHeight);
	const canvasCtx = canvas.getContext("2d")!;

	// Layout: simple force-directed (same as existing graphMode)
	const n = nodes.length;
	const posX = new Float64Array(n);
	const posY = new Float64Array(n);
	const velX = new Float64Array(n);
	const velY = new Float64Array(n);

	const cx = canvas.width / 2, cy = canvas.height / 2;
	for (let i = 0; i < n; i++) {
		posX[i] = cx + (Math.random() - 0.5) * 200;
		posY[i] = cy + (Math.random() - 0.5) * 200;
	}

	const idxMap = new Map(nodes.map((nd, i) => [nd.id, i]));

	// Simulate
	const iterations = 200;
	const repulsion = 5000;
	const attraction = 0.01;
	const damping = 0.9;

	for (let iter = 0; iter < iterations; iter++) {
		// Repulsion
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				const dx = posX[i] - posX[j];
				const dy = posY[i] - posY[j];
				const dist = Math.sqrt(dx * dx + dy * dy) || 1;
				const force = repulsion / (dist * dist);
				const fx = (dx / dist) * force;
				const fy = (dy / dist) * force;
				velX[i] += fx; velY[i] += fy;
				velX[j] -= fx; velY[j] -= fy;
			}
		}
		// Attraction along edges
		for (const edge of edges) {
			const si = idxMap.get(edge.source);
			const ti = idxMap.get(edge.target);
			if (si === undefined || ti === undefined) continue;
			const dx = posX[ti] - posX[si];
			const dy = posY[ti] - posY[si];
			const dist = Math.sqrt(dx * dx + dy * dy) || 1;
			const force = attraction * dist;
			const fx = (dx / dist) * force;
			const fy = (dy / dist) * force;
			velX[si] += fx; velY[si] += fy;
			velX[ti] -= fx; velY[ti] -= fy;
		}
		// Update positions
		for (let i = 0; i < n; i++) {
			velX[i] *= damping;
			velY[i] *= damping;
			posX[i] += velX[i];
			posY[i] += velY[i];
			// Clamp
			posX[i] = Math.max(40, Math.min(canvas.width - 40, posX[i]));
			posY[i] = Math.max(40, Math.min(canvas.height - 40, posY[i]));
		}
	}

	// Draw edges
	for (const edge of edges) {
		const si = idxMap.get(edge.source);
		const ti = idxMap.get(edge.target);
		if (si === undefined || ti === undefined) continue;

		canvasCtx.beginPath();
		canvasCtx.moveTo(posX[si], posY[si]);
		canvasCtx.lineTo(posX[ti], posY[ti]);

		// Style: solid = code-level, dashed = segment-level, dash-dot = merged
		if (edge.level === 'segment') {
			canvasCtx.setLineDash([6, 4]);
		} else if (edge.level === 'merged') {
			canvasCtx.setLineDash([10, 3, 3, 3]);
		} else {
			canvasCtx.setLineDash([]);
		}

		const lineWidth = Math.min(1 + edge.weight, 8);
		canvasCtx.lineWidth = lineWidth;
		canvasCtx.strokeStyle = "rgba(128, 128, 128, 0.6)";
		canvasCtx.stroke();
		canvasCtx.setLineDash([]);

		// Arrow for directed edges
		if (edge.directed) {
			const dx = posX[ti] - posX[si];
			const dy = posY[ti] - posY[si];
			const len = Math.sqrt(dx * dx + dy * dy) || 1;
			const nodeRadius = 12;
			const tipX = posX[ti] - (dx / len) * nodeRadius;
			const tipY = posY[ti] - (dy / len) * nodeRadius;
			const arrowLen = 10;
			const angle = Math.atan2(dy, dx);
			canvasCtx.beginPath();
			canvasCtx.moveTo(tipX, tipY);
			canvasCtx.lineTo(tipX - arrowLen * Math.cos(angle - 0.4), tipY - arrowLen * Math.sin(angle - 0.4));
			canvasCtx.moveTo(tipX, tipY);
			canvasCtx.lineTo(tipX - arrowLen * Math.cos(angle + 0.4), tipY - arrowLen * Math.sin(angle + 0.4));
			canvasCtx.strokeStyle = "rgba(128, 128, 128, 0.8)";
			canvasCtx.lineWidth = 2;
			canvasCtx.stroke();
		}

		// Edge label
		if (ctx.showEdgeLabels) {
			const midX = (posX[si] + posX[ti]) / 2;
			const midY = (posY[si] + posY[ti]) / 2 - 6;
			canvasCtx.font = "10px var(--font-ui-small, sans-serif)";
			canvasCtx.fillStyle = "rgba(128, 128, 128, 0.8)";
			canvasCtx.textAlign = "center";
			canvasCtx.fillText(edge.label, midX, midY);
		}
	}

	// Draw nodes
	for (let i = 0; i < n; i++) {
		const node = nodes[i];
		const r = Math.max(8, Math.min(24, 6 + (node.weight || 1) * 2));

		canvasCtx.beginPath();
		canvasCtx.arc(posX[i], posY[i], r, 0, Math.PI * 2);
		canvasCtx.fillStyle = node.color;
		canvasCtx.fill();
		canvasCtx.strokeStyle = "rgba(0,0,0,0.3)";
		canvasCtx.lineWidth = 1;
		canvasCtx.stroke();

		// Label
		canvasCtx.font = "11px var(--font-ui-small, sans-serif)";
		canvasCtx.fillStyle = isLightColor(node.color) ? "#333" : "#fff";
		canvasCtx.textAlign = "center";
		canvasCtx.textBaseline = "middle";
		canvasCtx.fillText(node.name, posX[i], posY[i]);
	}

	// ── Hover tooltip on edges ──
	// Track edge geometry for hit-testing
	const edgeGeo = edges.map(edge => {
		const si = idxMap.get(edge.source);
		const ti = idxMap.get(edge.target);
		if (si === undefined || ti === undefined) return null;
		return { x1: posX[si], y1: posY[si], x2: posX[ti], y2: posY[ti], edge };
	}).filter(Boolean) as Array<{ x1: number; y1: number; x2: number; y2: number; edge: typeof edges[0] }>;

	const tooltip = document.createElement('div');
	tooltip.className = 'codemarker-analytics-tooltip';
	tooltip.style.display = 'none';
	tooltip.style.position = 'absolute';
	tooltip.style.pointerEvents = 'none';
	ctx.chartContainer.style.position = 'relative';
	ctx.chartContainer.appendChild(tooltip);

	canvas.addEventListener('mousemove', (evt) => {
		const rect = canvas.getBoundingClientRect();
		const mx = evt.clientX - rect.left;
		const my = evt.clientY - rect.top;
		const hitThreshold = 6;

		let hitEdge: typeof edges[0] | null = null;
		for (const geo of edgeGeo) {
			const dist = pointToSegmentDist(mx, my, geo.x1, geo.y1, geo.x2, geo.y2);
			if (dist < hitThreshold) {
				hitEdge = geo.edge;
				break;
			}
		}

		if (hitEdge) {
			const srcDef = registry.getById(hitEdge.source);
			const tgtDef = registry.getById(hitEdge.target);
			const dirStr = hitEdge.directed ? '→' : '↔';
			tooltip.textContent = `${srcDef?.name ?? '?'} ${dirStr} ${tgtDef?.name ?? '?'} (${hitEdge.label}, ${hitEdge.level}, weight: ${hitEdge.weight})`;
			tooltip.style.display = '';
			tooltip.style.left = `${mx + 12}px`;
			tooltip.style.top = `${my - 20}px`;
		} else {
			tooltip.style.display = 'none';
		}
	});

	canvas.addEventListener('mouseleave', () => {
		tooltip.style.display = 'none';
	});
}

/** Distance from point (px,py) to line segment (x1,y1)-(x2,y2). */
function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
	const dx = x2 - x1, dy = y2 - y1;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(px - x1, py - y1);
	let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function exportRelationsNetworkCSV(ctx: AnalyticsViewContext, date: string): void {
	const allDefs = ctx.plugin.registry.getAll();
	const allMarkers = collectAllMarkers(ctx);
	const edges = extractRelationEdges(allDefs, allMarkers, ctx.relationsLevel);

	const defMap = new Map(allDefs.map(d => [d.id, d.name]));
	const rows = [["source", "target", "label", "directed", "level", "weight"]];
	for (const e of edges) {
		rows.push([
			defMap.get(e.source) ?? e.source,
			defMap.get(e.target) ?? e.target,
			e.label,
			String(e.directed),
			e.level,
			String(e.weight),
		]);
	}
	const csvContent = buildCsv(rows);
	const blob = new Blob([csvContent], { type: "text/csv" });
	const link = document.createElement("a");
	link.download = `qualia-relations-network-${date}.csv`;
	link.href = URL.createObjectURL(blob);
	link.click();
	URL.revokeObjectURL(link.href);
}
```

- [ ] **Step 4: Register in modeRegistry.ts**

Add import at top of `modeRegistry.ts`:

```typescript
import { renderRelationsNetwork, renderRelationsNetworkOptions, exportRelationsNetworkCSV } from "./relationsNetworkMode";
```

Add entry after `"code-overlap"`:

```typescript
"relations-network": {
	label: "Relations Network",
	render: renderRelationsNetwork,
	renderOptions: renderRelationsNetworkOptions,
	exportCSV: exportRelationsNetworkCSV,
},
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: No type errors

- [ ] **Step 6: Run all tests**

Run: `npm run test`
Expected: All pass. `viewModes.test.ts` may need update if it checks `MODE_REGISTRY` keys.

- [ ] **Step 7: Commit**

```bash
~/.claude/scripts/commit.sh "feat: Relations Network mode no analytics (Fase E) + hover tooltip em arestas"
```

---

## Chunk 5: QDPX Export + CSS

### Task 13: Add Links to QDPX export

**Files:**
- Modify: `src/export/qdpxExporter.ts`
- Create: `tests/export/qdpxLinks.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/export/qdpxLinks.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildLinksXml } from '../../src/export/qdpxExporter';
import type { CodeDefinition, BaseMarker, CodeApplication } from '../../src/core/types';

describe('buildLinksXml', () => {
	it('generates Link for code-level relation', () => {
		const defs: CodeDefinition[] = [{
			id: 'c1', name: 'A', color: '#f00', paletteIndex: 0,
			createdAt: 0, updatedAt: 0, childrenOrder: [],
			relations: [{ label: 'causes', target: 'c2', directed: true }],
		}, {
			id: 'c2', name: 'B', color: '#0f0', paletteIndex: 1,
			createdAt: 0, updatedAt: 0, childrenOrder: [],
		}];
		const guidMap = new Map<string, string>();
		const xml = buildLinksXml(defs, [], guidMap);
		expect(xml).toContain('<Link');
		expect(xml).toContain('name="causes"');
		expect(xml).toContain('direction="OneWay"');
	});

	it('generates Associative for undirected relation', () => {
		const defs: CodeDefinition[] = [{
			id: 'c1', name: 'A', color: '#f00', paletteIndex: 0,
			createdAt: 0, updatedAt: 0, childrenOrder: [],
			relations: [{ label: 'relates', target: 'c2', directed: false }],
		}, {
			id: 'c2', name: 'B', color: '#0f0', paletteIndex: 1,
			createdAt: 0, updatedAt: 0, childrenOrder: [],
		}];
		const guidMap = new Map<string, string>();
		const xml = buildLinksXml(defs, [], guidMap);
		expect(xml).toContain('direction="Associative"');
	});

	it('generates Link for segment-level relation', () => {
		const defs: CodeDefinition[] = [
			{ id: 'c1', name: 'A', color: '#f00', paletteIndex: 0, createdAt: 0, updatedAt: 0, childrenOrder: [] },
			{ id: 'c2', name: 'B', color: '#0f0', paletteIndex: 1, createdAt: 0, updatedAt: 0, childrenOrder: [] },
		];
		const markers: BaseMarker[] = [{
			markerType: 'markdown', id: 'm1', fileId: 'f1',
			codes: [{ codeId: 'c1', relations: [{ label: 'supports', target: 'c2', directed: true }] }],
			createdAt: 0, updatedAt: 0,
		}];
		const guidMap = new Map<string, string>();
		const xml = buildLinksXml(defs, markers, guidMap);
		expect(xml).toContain('name="supports"');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/export/qdpxLinks.test.ts`
Expected: FAIL — `buildLinksXml` not exported

- [ ] **Step 3: Implement buildLinksXml**

Add to `src/export/qdpxExporter.ts`:

```typescript
/** Build <Links> XML section from code-level and segment-level relations. */
export function buildLinksXml(
	definitions: CodeDefinition[],
	markers: BaseMarker[],
	guidMap: Map<string, string>,
): string {
	const links: string[] = [];

	// Code-level relations: Code → Code
	for (const def of definitions) {
		if (!def.relations) continue;
		for (const rel of def.relations) {
			const linkGuid = uuidV4();
			const originGuid = ensureGuid(def.id, guidMap);
			const targetGuid = ensureGuid(rel.target, guidMap);
			const direction = rel.directed ? 'OneWay' : 'Associative';
			links.push(
				`<Link ${xmlAttr('guid', linkGuid)} ${xmlAttr('name', rel.label)} ${xmlAttr('direction', direction)} ${xmlAttr('originGUID', originGuid)} ${xmlAttr('targetGUID', targetGuid)}/>`,
			);
		}
	}

	// Segment-level relations: Selection → Code
	for (const marker of markers) {
		for (const ca of marker.codes) {
			if (!ca.relations) continue;
			for (const rel of ca.relations) {
				const linkGuid = uuidV4();
				const originGuid = ensureGuid(marker.id, guidMap);
				const targetGuid = ensureGuid(rel.target, guidMap);
				const direction = rel.directed ? 'OneWay' : 'Associative';
				links.push(
					`<Link ${xmlAttr('guid', linkGuid)} ${xmlAttr('name', rel.label)} ${xmlAttr('direction', direction)} ${xmlAttr('originGUID', originGuid)} ${xmlAttr('targetGUID', targetGuid)}/>`,
				);
			}
		}
	}

	return links.join('\n');
}
```

Import `CodeDefinition` and `BaseMarker` types at the top.

- [ ] **Step 4: Wire into buildProjectXml**

Modify `buildProjectXml()` to accept and include links:

```typescript
export function buildProjectXml(
	registry: CodeDefinitionRegistry,
	sourcesXml: string,
	notesXml: string,
	linksXml: string,  // NEW
	vaultName: string,
	pluginVersion: string,
): string {
	const codebook = buildCodebookXml(registry);
	const sourcesSection = sourcesXml ? `<Sources>\n${sourcesXml}\n</Sources>` : '';
	const notesSection = notesXml ? `<Notes>\n${notesXml}\n</Notes>` : '';
	const linksSection = linksXml ? `<Links>\n${linksXml}\n</Links>` : '';

	const sections = [codebook, sourcesSection, notesSection, linksSection].filter(Boolean).join('\n');

	return `${xmlDeclaration()}\n<Project ${xmlAttr('name', vaultName)} ${xmlAttr('origin', `Qualia Coding ${pluginVersion}`)} ${xmlAttr('creationDateTime', new Date().toISOString())} ${xmlAttr('xmlns', PROJECT_NS)}>\n${sections}\n</Project>`;
}
```

Update the call in `exportProject()`. Before building project XML (around line 414-416), collect all markers and build links:

```typescript
// Collect all markers for link generation
const allMarkersForLinks: BaseMarker[] = [];
for (const markers of Object.values(mdData.markers)) allMarkersForLinks.push(...markers);
for (const { textMarkers, shapeMarkers } of pdfByFile.values()) allMarkersForLinks.push(...textMarkers, ...shapeMarkers);
for (const [, markers] of imgByFile) allMarkersForLinks.push(...markers);
for (const af of audioData.files) allMarkersForLinks.push(...af.markers);
for (const vf of videoData.files) allMarkersForLinks.push(...vf.markers);
// CSV markers too
const csvData = dataManager.section('csv');
allMarkersForLinks.push(...csvData.segmentMarkers, ...csvData.rowMarkers);

const allDefs = registry.getAll();
const linksXml = buildLinksXml(allDefs, allMarkersForLinks, guidMap);

const projectXml = buildProjectXml(registry, sourcesXml, notesXml, linksXml, options.vaultName, options.pluginVersion);
```

Import `BaseMarker` from `../core/types` at the top of the file.

- [ ] **Step 5: Run tests**

Run: `npm run test -- tests/export/qdpxLinks.test.ts`
Expected: PASS

Run: `npm run test -- tests/export/`
Expected: All export tests pass

- [ ] **Step 6: Commit**

```bash
~/.claude/scripts/commit.sh "feat: export QDPX com <Link> para relacoes (codigo-level e segmento-level)"
```

### Task 14: CSS for relation UI components

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add CSS rules**

Append to `styles.css`:

```css
/* ── Relations ──────────────────────────────────── */

/* Detail View relations section */
.codemarker-detail-relations-header {
	display: flex;
	align-items: center;
	gap: 8px;
}

.codemarker-detail-relation-row {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 2px 0;
}

.codemarker-detail-relation-dir {
	display: flex;
	align-items: center;
	color: var(--text-muted);
	flex-shrink: 0;
}
.codemarker-detail-relation-dir svg {
	width: 14px;
	height: 14px;
}

.codemarker-detail-relation-label {
	font-size: var(--font-ui-small);
	color: var(--text-muted);
	font-style: italic;
}

.codemarker-detail-relation-target-missing {
	font-size: var(--font-ui-small);
	color: var(--text-faint);
}

.codemarker-detail-relation-add {
	display: flex;
	align-items: center;
	gap: 4px;
	margin-top: 4px;
}

.codemarker-detail-relation-input {
	flex: 1;
	min-width: 0;
	font-size: var(--font-ui-small);
	padding: 2px 6px;
	border: 1px solid var(--background-modifier-border);
	border-radius: var(--radius-s);
	background: var(--background-primary);
	color: var(--text-normal);
}

.codemarker-detail-relation-dir-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	background: none;
	border: 1px solid var(--background-modifier-border);
	border-radius: var(--radius-s);
	cursor: pointer;
	padding: 2px;
	color: var(--text-muted);
}
.codemarker-detail-relation-dir-btn:hover {
	background: var(--background-modifier-hover);
}
.codemarker-detail-relation-dir-btn svg {
	width: 14px;
	height: 14px;
}

.codemarker-detail-relation-add-btn {
	font-size: var(--font-ui-small);
	padding: 2px 8px;
	cursor: pointer;
}

.codemarker-detail-relation-code-group {
	margin-bottom: 8px;
}

/* Popover relations section — same collapse pattern as memo/magnitude */
.codemarker-tooltip-relations-wrapper .codemarker-tooltip-memo-header {
	cursor: pointer;
}
.codemarker-tooltip-relations-wrapper .codemarker-tooltip-memo-chevron {
	transition: transform 100ms ease;
}
.codemarker-tooltip-relations-wrapper.is-open .codemarker-tooltip-memo-chevron {
	transform: rotate(90deg);
}

.codemarker-tooltip-relations-body {
	padding: 4px 8px;
}

.codemarker-tooltip-relations-code-group {
	margin-bottom: 6px;
}

.codemarker-tooltip-relation-row {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 1px 0;
	font-size: var(--font-ui-small);
}

.codemarker-tooltip-relation-dir {
	display: flex;
	color: var(--text-muted);
}
.codemarker-tooltip-relation-dir svg {
	width: 12px;
	height: 12px;
}

.codemarker-tooltip-relation-label {
	color: var(--text-muted);
	font-style: italic;
}

.codemarker-tooltip-relation-target {
	color: var(--text-normal);
}

.codemarker-tooltip-relation-remove {
	cursor: pointer;
	color: var(--text-faint);
	margin-left: auto;
}
.codemarker-tooltip-relation-remove:hover {
	color: var(--text-error);
}
.codemarker-tooltip-relation-remove svg {
	width: 12px;
	height: 12px;
}

.codemarker-tooltip-relation-add {
	display: flex;
	align-items: center;
	gap: 3px;
	margin-top: 3px;
}

.codemarker-tooltip-relation-input {
	flex: 1;
	min-width: 0;
	font-size: 11px;
	padding: 1px 4px;
	border: 1px solid var(--background-modifier-border);
	border-radius: var(--radius-s);
	background: var(--background-primary);
	color: var(--text-normal);
}

.codemarker-tooltip-relation-dir-btn {
	display: flex;
	align-items: center;
	background: none;
	border: 1px solid var(--background-modifier-border);
	border-radius: var(--radius-s);
	cursor: pointer;
	padding: 1px;
	color: var(--text-muted);
}
.codemarker-tooltip-relation-dir-btn svg {
	width: 12px;
	height: 12px;
}

.codemarker-tooltip-relation-add-btn {
	font-size: 11px;
	padding: 1px 6px;
	background: none;
	border: 1px solid var(--background-modifier-border);
	border-radius: var(--radius-s);
	cursor: pointer;
	color: var(--text-muted);
}
.codemarker-tooltip-relation-add-btn:hover {
	background: var(--background-modifier-hover);
}

/* Analytics edge hover tooltip */
.codemarker-analytics-tooltip {
	font-size: 11px;
	padding: 4px 8px;
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: var(--radius-s);
	color: var(--text-normal);
	white-space: nowrap;
	box-shadow: var(--shadow-s);
	z-index: 100;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "feat: CSS para secoes Relations (detail view, popover, marker detail)"
```

### Task 15: Final integration — build, test, copy to demo

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 2: Build production**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 3: Copy to demo vault**

Run: `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`

- [ ] **Step 4: Commit demo build**

```bash
~/.claude/scripts/commit.sh "chore: build Fase E — relations em todos os entry points, analytics, QDPX"
```
