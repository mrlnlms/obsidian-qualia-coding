# CSV row marker — cross-coder Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir write-path e read-path do CSV `RowMarker` para respeitar `codedBy` e garantir invariante `1 marker / (file, row, column, codedBy)`. Coders distintos deixam de mutar markers alheios; cell renderer exibe somente o trabalho do active coder fora de compare mode.

**Architecture:** Adicionar helper `getRowMarkerForActiveCoder` no model. Filtrar `findOrCreateRowMarker`, `setCellComment`, `getCellComment`, `getCodesForCell` (branch `'row'`), `buildRowMarkerIndex`, `removeAllRowMarkersFromMany`, `getCodeIntersectionForRows` por active coder. Substituir 6 sites em `csvCodingMenu.ts` e 2 em `csvCodingCellRenderer.ts`. Adicionar subscribe a `onActiveCoderChange` em `csvCodingView.ts` que dispara `gridApi.refreshCells`. Sem mudança de schema.

**Tech Stack:** TypeScript strict, Vitest + jsdom, AG-Grid (gridApi.refreshCells), Obsidian plugin lifecycle (`registerEvent`-style com unsubscribe).

**Spec source:** `docs/superpowers/specs/2026-05-12-csv-row-marker-cross-coder-design.md`

---

## Chunk 1: Foundation — fixture multi-coder + helper

### Task 1: Criar fixture multi-coder + arquivo de tests

**Files:**
- Create: `tests/engine-models/csvCodingModel.crossCoder.test.ts`

- [ ] **Step 1: Criar arquivo com fixture mutable**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CsvCodingModel } from '../../src/csv/csvCodingModel';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { RowMarker } from '../../src/csv/csvCodingTypes';

function createMockDm(initial: Record<string, any> = {}) {
	const store: Record<string, any> = { ...initial };
	return {
		section: (k: string) => {
			if (!store[k]) store[k] = { segmentMarkers: [], rowMarkers: [] };
			return store[k];
		},
		setSection: (k: string, v: any) => { store[k] = v; },
		markDirty: vi.fn(),
	};
}

let model: CsvCodingModel;
let registry: CodeDefinitionRegistry;
let dm: ReturnType<typeof createMockDm>;
let activeCoder: string;

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
	dm = createMockDm();
	activeCoder = 'human:default';
	const plugin = {
		dataManager: dm,
		getActiveCoderId: () => activeCoder,
		sourceHashRegistry: { getHash: () => Promise.resolve(undefined) },
	} as any;
	model = new CsvCodingModel(plugin, registry);
});

function insertRowMarker(opts: { file: string; row: number; column: string; coder?: string; codeIds?: string[]; comment?: string }): RowMarker {
	const marker: RowMarker = {
		markerType: 'csv',
		id: `csv-row-${opts.file}-${opts.row}-${opts.column}-${opts.coder ?? 'nocoder'}`,
		fileId: opts.file,
		sourceRowId: opts.row,
		column: opts.column,
		codes: (opts.codeIds ?? []).map(codeId => ({ codeId })),
		...(opts.coder !== undefined && { codedBy: opts.coder }),
		...(opts.comment !== undefined && { comment: opts.comment }),
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
	model.insertMarkerRaw(marker);
	return marker;
}

describe('CSV cross-coder: getRowMarkerForActiveCoder', () => {
	it.todo('placeholder');
});
```

- [ ] **Step 2: Rodar pra ver arquivo compilar e passar**

```bash
npx vitest run tests/engine-models/csvCodingModel.crossCoder.test.ts
```

Esperado: PASS (apenas o `it.todo`).

- [ ] **Step 3: Commit**

```bash
git add tests/engine-models/csvCodingModel.crossCoder.test.ts
~/.claude/scripts/commit.sh "test(csv): fixture multi-coder pra crossCoder tests"
```

---

### Task 2: Helper `getRowMarkerForActiveCoder` no model (TDD)

**Files:**
- Modify: `src/csv/csvCodingModel.ts` (adicionar helper logo após `getRowMarkersForCell` linha 246)
- Modify: `tests/engine-models/csvCodingModel.crossCoder.test.ts`

- [ ] **Step 1: Escrever 3 tests falhos**

Substituir o `it.todo` por:

```ts
describe('CSV cross-coder: getRowMarkerForActiveCoder', () => {
	it('retorna marker do active coder quando cell tem múltiplos coders', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', codeIds: ['c1'] });
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c2'] });
		const result = model.getRowMarkerForActiveCoder('a.csv', 0, 'text');
		expect(result?.codedBy).toBe('human:default');
		expect(result?.codes.map(c => c.codeId)).toEqual(['c1']);
	});

	it('retorna undefined quando active não tem marker mas alheio tem', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c2'] });
		const result = model.getRowMarkerForActiveCoder('a.csv', 0, 'text');
		expect(result).toBeUndefined();
	});

	it('trata marker legado sem codedBy como human:default (defensive ??)', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: undefined, codeIds: ['c1'] });
		activeCoder = 'human:default';
		const result = model.getRowMarkerForActiveCoder('a.csv', 0, 'text');
		expect(result?.codes.map(c => c.codeId)).toEqual(['c1']);
	});
});
```

- [ ] **Step 2: Rodar tests, ver FAIL**

```bash
npx vitest run tests/engine-models/csvCodingModel.crossCoder.test.ts
```

Esperado: FAIL com `model.getRowMarkerForActiveCoder is not a function`.

- [ ] **Step 3: Implementar helper em `csvCodingModel.ts`**

Localizar `getRowMarkersForCell` (linha 246). Adicionar logo depois:

```ts
getRowMarkerForActiveCoder(file: string, sourceRowId: number, column: string): RowMarker | undefined {
	const activeCoder = this.plugin.getActiveCoderId();
	return this.rowMarkers.find(m =>
		m.fileId === file && m.sourceRowId === sourceRowId && m.column === column
		&& (m.codedBy ?? 'human:default') === activeCoder
	);
}
```

- [ ] **Step 4: Rodar tests, ver PASS**

```bash
npx vitest run tests/engine-models/csvCodingModel.crossCoder.test.ts
```

Esperado: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/csv/csvCodingModel.ts tests/engine-models/csvCodingModel.crossCoder.test.ts
~/.claude/scripts/commit.sh "feat(csv): helper getRowMarkerForActiveCoder no model + 3 tests"
```

---

## Chunk 2: Write-path single-cell

### Task 3: `findOrCreateRowMarker` filtra por active coder (TDD)

**Files:**
- Modify: `src/csv/csvCodingModel.ts:250-264`
- Modify: `tests/engine-models/csvCodingModel.crossCoder.test.ts`

- [ ] **Step 1: Escrever 2 tests falhos**

Adicionar novo `describe` no arquivo de tests:

```ts
describe('CSV cross-coder: findOrCreateRowMarker', () => {
	it('cria marker novo do active coder quando alheio existe na cell', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1'] });
		activeCoder = 'human:default';
		const m = model.findOrCreateRowMarker('a.csv', 0, 'text');
		expect(m.codedBy).toBe('human:default');
		expect(m.codes).toEqual([]);
		const all = model.getRowMarkersForCell('a.csv', 0, 'text');
		expect(all).toHaveLength(2);
	});

	it('retorna marker existente do active coder quando já existe', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', codeIds: ['c1'] });
		const m = model.findOrCreateRowMarker('a.csv', 0, 'text');
		expect(m.codedBy).toBe('human:default');
		expect(m.codes.map(c => c.codeId)).toEqual(['c1']);
		const all = model.getRowMarkersForCell('a.csv', 0, 'text');
		expect(all).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Rodar tests, ver FAIL**

```bash
npx vitest run tests/engine-models/csvCodingModel.crossCoder.test.ts -t "findOrCreateRowMarker"
```

Esperado: FAIL no primeiro test (`m.codedBy` é `'human:bob'`, deveria ser `'human:default'`).

- [ ] **Step 3: Mudar `findOrCreateRowMarker` (linha 250)**

Substituir o body:

```ts
findOrCreateRowMarker(file: string, sourceRowId: number, column: string): RowMarker {
	const activeCoder = this.plugin.getActiveCoderId();
	const existing = this.rowMarkers.find(m =>
		m.fileId === file && m.sourceRowId === sourceRowId && m.column === column
		&& (m.codedBy ?? 'human:default') === activeCoder
	);
	if (existing) return existing;
	const marker: RowMarker = {
		// ... resto idêntico ao atual, codedBy: this.plugin.getActiveCoderId() permanece
	};
	// ... resto idêntico
}
```

(O resto do método — criação do marker novo, push, attachSourceHashSnapshot, notify, emitMarkerMutation — fica idêntico ao código atual.)

- [ ] **Step 4: Rodar tests, ver PASS**

```bash
npx vitest run tests/engine-models/csvCodingModel.crossCoder.test.ts -t "findOrCreateRowMarker"
```

Esperado: PASS (2 cases).

- [ ] **Step 5: Rodar suite completa pra garantir sem regressão**

```bash
npx vitest run tests/engine-models/csvCodingModel.test.ts
```

Esperado: PASS (tests pré-existentes seguem passando).

- [ ] **Step 6: Commit**

```bash
git add src/csv/csvCodingModel.ts tests/engine-models/csvCodingModel.crossCoder.test.ts
~/.claude/scripts/commit.sh "fix(csv): findOrCreateRowMarker filtra por active coder"
```

---

### Task 4: `setCellComment` filtra por active coder (TDD)

**Files:**
- Modify: `src/csv/csvCodingModel.ts:102-153`
- Modify: `tests/engine-models/csvCodingModel.crossCoder.test.ts`

- [ ] **Step 1: Escrever test falho**

```ts
describe('CSV cross-coder: setCellComment', () => {
	it('cria marker novo do active coder quando alheio já tem comment na cell', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', comment: 'bob comment' });
		activeCoder = 'human:default';
		model.setCellComment('a.csv', 0, 'text', 'default comment');
		const all = model.getRowMarkersForCell('a.csv', 0, 'text');
		expect(all).toHaveLength(2);
		const defaultMarker = all.find(m => m.codedBy === 'human:default');
		expect(defaultMarker?.comment).toBe('default comment');
		const bobMarker = all.find(m => m.codedBy === 'human:bob');
		expect(bobMarker?.comment).toBe('bob comment');
	});

	it('GC remove marker do active sem codes e comment vazio (não toca no de outro coder)', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1'] });
		model.setCellComment('a.csv', 0, 'text', 'default note');
		model.setCellComment('a.csv', 0, 'text', '');
		const all = model.getRowMarkersForCell('a.csv', 0, 'text');
		expect(all).toHaveLength(1);
		expect(all[0]?.codedBy).toBe('human:bob');
	});
});
```

- [ ] **Step 2: Rodar tests, ver FAIL**

Esperado: FAIL (primeira asserção quebra — o lookup acha o marker do bob e edita o comment dele).

- [ ] **Step 3: Modificar `setCellComment` (linha 102)**

Substituir o lookup interno (linha 104):

```ts
setCellComment(file: string, sourceRowId: number, column: string, value: string): void {
	const trimmed = value;
	const activeCoder = this.plugin.getActiveCoderId();
	const idx = this.rowMarkers.findIndex(m =>
		m.fileId === file && m.sourceRowId === sourceRowId && m.column === column
		&& (m.codedBy ?? 'human:default') === activeCoder
	);
	// ... resto idêntico
}
```

- [ ] **Step 4: Rodar tests, ver PASS**

```bash
npx vitest run tests/engine-models/csvCodingModel.crossCoder.test.ts -t "setCellComment"
```

Esperado: PASS (2 cases).

- [ ] **Step 5: Suite completa**

```bash
npx vitest run tests/engine-models/csvCodingModel.test.ts
```

Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/csv/csvCodingModel.ts tests/engine-models/csvCodingModel.crossCoder.test.ts
~/.claude/scripts/commit.sh "fix(csv): setCellComment filtra por active coder"
```

---

## Chunk 3: Batch ops no model

### Task 5: `buildRowMarkerIndex` filtra por active (TDD via consumer)

`buildRowMarkerIndex` é privado. Test exercita via `addCodeToManyRowMarkers` que o consome.

**Files:**
- Modify: `src/csv/csvCodingModel.ts:276-289`
- Modify: `tests/engine-models/csvCodingModel.crossCoder.test.ts`

- [ ] **Step 1: Escrever test falho**

```ts
describe('CSV cross-coder: addCodeToManyRowMarkers', () => {
	it('opera apenas em markers do active coder, ignora alheios', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1'] });
		insertRowMarker({ file: 'a.csv', row: 1, column: 'text', coder: 'human:default', codeIds: ['c2'] });
		registry.create('newCode');
		const newCodeId = registry.getByName('newCode')!.id;
		model.addCodeToManyRowMarkers('a.csv', [0, 1], 'text', newCodeId);
		const r0 = model.getRowMarkersForCell('a.csv', 0, 'text');
		const bobMarker = r0.find(m => m.codedBy === 'human:bob');
		expect(bobMarker?.codes.map(c => c.codeId)).toEqual(['c1']);
		const defaultMarker0 = r0.find(m => m.codedBy === 'human:default');
		expect(defaultMarker0?.codes.map(c => c.codeId)).toEqual([newCodeId]);
		const r1 = model.getRowMarkersForCell('a.csv', 1, 'text');
		expect(r1[0]?.codes.map(c => c.codeId).sort()).toEqual(['c2', newCodeId].sort());
	});
});
```

- [ ] **Step 2: Rodar test, ver FAIL**

Esperado: FAIL (bob marker é mutado).

- [ ] **Step 3: Modificar `buildRowMarkerIndex` (linha 276)**

```ts
private buildRowMarkerIndex(file: string, column: string): Map<number, RowMarker> {
	const activeCoder = this.plugin.getActiveCoderId();
	const idx = new Map<number, RowMarker>();
	for (const m of this.rowMarkers) {
		if (m.fileId !== file || m.column !== column) continue;
		if ((m.codedBy ?? 'human:default') !== activeCoder) continue;
		idx.set(m.sourceRowId, m);
	}
	return idx;
}
```

- [ ] **Step 4: Rodar test, ver PASS**

```bash
npx vitest run tests/engine-models/csvCodingModel.crossCoder.test.ts -t "addCodeToManyRowMarkers"
```

Esperado: PASS.

- [ ] **Step 5: Suite completa**

```bash
npx vitest run tests/engine-models/csvCodingModel.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/csv/csvCodingModel.ts tests/engine-models/csvCodingModel.crossCoder.test.ts
~/.claude/scripts/commit.sh "fix(csv): buildRowMarkerIndex filtra por active coder"
```

---

### Task 6: `removeAllRowMarkersFromMany` filtra por active (TDD)

**Files:**
- Modify: `src/csv/csvCodingModel.ts:358-378`
- Modify: `tests/engine-models/csvCodingModel.crossCoder.test.ts`

- [ ] **Step 1: Escrever test falho**

```ts
describe('CSV cross-coder: removeAllRowMarkersFromMany', () => {
	it('deleta apenas markers do active coder', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1'] });
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', codeIds: ['c2'] });
		insertRowMarker({ file: 'a.csv', row: 1, column: 'text', coder: 'human:default', codeIds: ['c3'] });
		model.removeAllRowMarkersFromMany('a.csv', [0, 1], 'text');
		const r0 = model.getRowMarkersForCell('a.csv', 0, 'text');
		expect(r0).toHaveLength(1);
		expect(r0[0]?.codedBy).toBe('human:bob');
		const r1 = model.getRowMarkersForCell('a.csv', 1, 'text');
		expect(r1).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Rodar test, ver FAIL**

- [ ] **Step 3: Modificar `removeAllRowMarkersFromMany` (linha 358)**

```ts
removeAllRowMarkersFromMany(file: string, sourceRowIds: ReadonlyArray<number>, column: string): void {
	if (sourceRowIds.length === 0) return;
	const activeCoder = this.plugin.getActiveCoderId();
	const rowSet = new Set(sourceRowIds);
	const before = this.rowMarkers.length;
	const matches = (m: RowMarker) =>
		m.fileId === file && m.column === column && rowSet.has(m.sourceRowId)
		&& (m.codedBy ?? 'human:default') === activeCoder;
	const removed = this.rowMarkers.filter(matches);
	for (const m of removed) {
		this.markerTextCache.delete(m.id);
		const codes = m.codes.map(c => c.codeId);
		this.emitMarkerMutation({
			fileId: m.fileId, markerId: m.id,
			prevCodeIds: codes, nextCodeIds: [],
			codeIds: codes, marker: undefined,
		});
	}
	this.rowMarkers = this.rowMarkers.filter(m => !matches(m));
	if (this.rowMarkers.length !== before) this.notify();
}
```

- [ ] **Step 4: Rodar test, ver PASS**

- [ ] **Step 5: Suite completa**

- [ ] **Step 6: Commit**

```bash
git add src/csv/csvCodingModel.ts tests/engine-models/csvCodingModel.crossCoder.test.ts
~/.claude/scripts/commit.sh "fix(csv): removeAllRowMarkersFromMany filtra por active coder"
```

---

### Task 7: `getCodeIntersectionForRows` filtra por active (TDD)

**Files:**
- Modify: `src/csv/csvCodingModel.ts:388-409`
- Modify: `tests/engine-models/csvCodingModel.crossCoder.test.ts`

- [ ] **Step 1: Escrever test falho**

```ts
describe('CSV cross-coder: getCodeIntersectionForRows', () => {
	it('calcula intersect apenas sobre markers do active coder', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', codeIds: ['c1', 'c2'] });
		insertRowMarker({ file: 'a.csv', row: 1, column: 'text', coder: 'human:default', codeIds: ['c2', 'c3'] });
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1', 'c4'] });
		insertRowMarker({ file: 'a.csv', row: 1, column: 'text', coder: 'human:bob', codeIds: ['c4', 'c5'] });
		const intersect = model.getCodeIntersectionForRows('a.csv', [0, 1], 'text');
		expect([...intersect]).toEqual(['c2']);
	});
});
```

- [ ] **Step 2: Rodar test, ver FAIL**

Esperado: FAIL (intersect inclui c4 das contribuições de bob também).

- [ ] **Step 3: Modificar `getCodeIntersectionForRows` (linha 388)**

Adicionar filtro no loop principal (linha 391-396):

```ts
getCodeIntersectionForRows(file: string, sourceRowIds: ReadonlyArray<number>, column: string): Set<string> {
	if (sourceRowIds.length === 0) return new Set();
	const activeCoder = this.plugin.getActiveCoderId();
	const rowCodes = new Map<number, Set<string>>();
	for (const m of this.rowMarkers) {
		if (m.fileId !== file || m.column !== column) continue;
		if ((m.codedBy ?? 'human:default') !== activeCoder) continue;
		let set = rowCodes.get(m.sourceRowId);
		if (!set) { set = new Set(); rowCodes.set(m.sourceRowId, set); }
		for (const id of getCodeIds(m.codes)) set.add(id);
	}
	// ... resto idêntico
}
```

- [ ] **Step 4: Rodar test, ver PASS**

- [ ] **Step 5: Suite completa**

- [ ] **Step 6: Commit**

```bash
git add src/csv/csvCodingModel.ts tests/engine-models/csvCodingModel.crossCoder.test.ts
~/.claude/scripts/commit.sh "fix(csv): getCodeIntersectionForRows filtra por active coder"
```

---

## Chunk 4: Read-path no model

### Task 8: `getCellComment` filtra por active (TDD)

**Files:**
- Modify: `src/csv/csvCodingModel.ts:97-100`
- Modify: `tests/engine-models/csvCodingModel.crossCoder.test.ts`

- [ ] **Step 1: Escrever test falho**

```ts
describe('CSV cross-coder: getCellComment', () => {
	it('retorna comment do active coder, ignora alheio', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', comment: 'bob comment' });
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', comment: 'default comment' });
		activeCoder = 'human:default';
		expect(model.getCellComment('a.csv', 0, 'text')).toBe('default comment');
		activeCoder = 'human:bob';
		expect(model.getCellComment('a.csv', 0, 'text')).toBe('bob comment');
	});

	it('retorna vazio quando active não tem marker (mas alheio tem comment)', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', comment: 'bob' });
		activeCoder = 'human:default';
		expect(model.getCellComment('a.csv', 0, 'text')).toBe('');
	});
});
```

- [ ] **Step 2: Rodar tests, ver FAIL**

- [ ] **Step 3: Modificar `getCellComment` (linha 97)**

```ts
getCellComment(file: string, sourceRowId: number, column: string): string {
	const activeCoder = this.plugin.getActiveCoderId();
	const m = this.rowMarkers.find(m =>
		m.fileId === file && m.sourceRowId === sourceRowId && m.column === column
		&& (m.codedBy ?? 'human:default') === activeCoder
	);
	return m?.comment ?? '';
}
```

- [ ] **Step 4: Rodar tests, ver PASS**

- [ ] **Step 5: Suite completa**

- [ ] **Step 6: Commit**

```bash
git add src/csv/csvCodingModel.ts tests/engine-models/csvCodingModel.crossCoder.test.ts
~/.claude/scripts/commit.sh "fix(csv): getCellComment filtra por active coder"
```

---

### Task 9: `getCodesForCell` branch `'row'` filtra por active (TDD)

**Files:**
- Modify: `src/csv/csvCodingModel.ts:486-495`
- Modify: `tests/engine-models/csvCodingModel.crossCoder.test.ts`

- [ ] **Step 1: Escrever test falho**

```ts
describe('CSV cross-coder: getCodesForCell (branch row)', () => {
	it('retorna codes do marker do active coder, ignora alheios', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1', 'c2'] });
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', codeIds: ['c3'] });
		activeCoder = 'human:default';
		expect(model.getCodesForCell('a.csv', 0, 'text', 'row').sort()).toEqual(['c3']);
		activeCoder = 'human:bob';
		expect(model.getCodesForCell('a.csv', 0, 'text', 'row').sort()).toEqual(['c1', 'c2'].sort());
	});

	it('retorna vazio quando active não tem marker mas alheio tem codes', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1'] });
		activeCoder = 'human:default';
		expect(model.getCodesForCell('a.csv', 0, 'text', 'row')).toEqual([]);
	});
});
```

- [ ] **Step 2: Rodar tests, ver FAIL**

Esperado: FAIL (retorna union de todos os coders).

- [ ] **Step 3: Modificar `getCodesForCell` branch 'row' (linha 486)**

Localizar:

```ts
getCodesForCell(file: string, sourceRowId: number, column: string, type: 'segment' | 'row'): string[] {
	const markers = type === 'segment'
		? this.getSegmentMarkersForCell(file, sourceRowId, column)
		: this.getRowMarkersForCell(file, sourceRowId, column);
	// ... resto
}
```

Substituir o branch `'row'`:

```ts
getCodesForCell(file: string, sourceRowId: number, column: string, type: 'segment' | 'row'): string[] {
	let markers: (SegmentMarker | RowMarker)[];
	if (type === 'segment') {
		markers = this.getSegmentMarkersForCell(file, sourceRowId, column);
	} else {
		const m = this.getRowMarkerForActiveCoder(file, sourceRowId, column);
		markers = m ? [m] : [];
	}
	// ... resto idêntico (flatMap dos codes)
}
```

(Segment continua agregando — decisão deferred no spec §7.3.)

- [ ] **Step 4: Rodar tests, ver PASS**

- [ ] **Step 5: Suite completa**

- [ ] **Step 6: Commit**

```bash
git add src/csv/csvCodingModel.ts tests/engine-models/csvCodingModel.crossCoder.test.ts
~/.claude/scripts/commit.sh "fix(csv): getCodesForCell branch row filtra por active coder"
```

---

### Task 10: Invariante test reforçado

**Files:**
- Create: `tests/engine-models/csvCodingModel.invariant.test.ts`

- [ ] **Step 1: Escrever test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CsvCodingModel } from '../../src/csv/csvCodingModel';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { RowMarker } from '../../src/csv/csvCodingTypes';

function createMockDm() {
	const store: Record<string, any> = {};
	return {
		section: (k: string) => {
			if (!store[k]) store[k] = { segmentMarkers: [], rowMarkers: [] };
			return store[k];
		},
		setSection: (k: string, v: any) => { store[k] = v; },
		markDirty: vi.fn(),
	};
}

describe('CSV invariant: 1 marker por (file, row, col, codedBy)', () => {
	it('verifica invariante após sequência mista de operações multi-coder', () => {
		const registry = new CodeDefinitionRegistry();
		const dm = createMockDm();
		let activeCoder = 'human:default';
		const plugin = {
			dataManager: dm,
			getActiveCoderId: () => activeCoder,
			sourceHashRegistry: { getHash: () => Promise.resolve(undefined) },
		} as any;
		const model = new CsvCodingModel(plugin, registry);
		const c1 = registry.create('c1').id;
		const c2 = registry.create('c2').id;

		model.findOrCreateRowMarker('a.csv', 0, 'text');
		model.addCodeToMarker(model.findOrCreateRowMarker('a.csv', 0, 'text').id, c1);
		activeCoder = 'human:bob';
		model.findOrCreateRowMarker('a.csv', 0, 'text');
		model.addCodeToMarker(model.findOrCreateRowMarker('a.csv', 0, 'text').id, c2);
		activeCoder = 'human:default';
		model.setCellComment('a.csv', 0, 'text', 'default note');
		activeCoder = 'human:bob';
		model.setCellComment('a.csv', 0, 'text', 'bob note');

		const all = model.getRowMarkersForCell('a.csv', 0, 'text');
		const tuples = all.map(m => `${m.fileId}|${m.sourceRowId}|${m.column}|${m.codedBy ?? 'human:default'}`);
		expect(new Set(tuples).size).toBe(tuples.length);
		const triple = `${all[0]?.fileId}|${all[0]?.sourceRowId}|${all[0]?.column}`;
		const distinctCoders = new Set(all.map(m => m.codedBy ?? 'human:default'));
		expect(distinctCoders.size).toBe(all.length);
	});
});
```

- [ ] **Step 2: Rodar test, ver PASS**

```bash
npx vitest run tests/engine-models/csvCodingModel.invariant.test.ts
```

(Já deve passar — todas as mudanças anteriores garantem o invariante. Se falhar, é regressão nas tarefas anteriores.)

- [ ] **Step 3: Commit**

```bash
git add tests/engine-models/csvCodingModel.invariant.test.ts
~/.claude/scripts/commit.sh "test(csv): invariante 1 marker por (file, row, col, codedBy)"
```

---

## Chunk 5: csvCodingMenu — 6 substituições

### Task 11: Substituir 6 sites em `csvCodingMenu.ts`

Não é TDD novo — comportamento testado indiretamente via menu integration, mas as 4 funções consumidoras já estão cobertas pelos tests anteriores. Mudança mecânica.

**Files:**
- Modify: `src/csv/csvCodingMenu.ts:36, 42, 65, 70, 78, 82`

- [ ] **Step 1: Aplicar substituições**

Em cada um dos 6 sites, substituir:

```ts
// antes
const X = model.getRowMarkersForCell(file, sourceRowId, column)[0];
// depois
const X = model.getRowMarkerForActiveCoder(file, sourceRowId, column);
```

Sites:
- Linha 36: `const existingMarker = model.getRowMarkersForCell(file, sourceRowId, column)[0];` → `const existingMarker = model.getRowMarkerForActiveCoder(file, sourceRowId, column);`
- Linha 42, 65, 70, 78, 82: idem com nome `current`.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: PASS (assinatura do helper retorna `RowMarker | undefined`, compatível com `[0]` que também retorna `RowMarker | undefined`).

- [ ] **Step 3: Suite completa**

```bash
npm run test
```

Esperado: PASS (3435 + novos tests).

- [ ] **Step 4: Build production**

```bash
npm run build
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/csv/csvCodingMenu.ts
~/.claude/scripts/commit.sh "fix(csv): csvCodingMenu usa getRowMarkerForActiveCoder em 6 sites"
```

---

## Chunk 6: csvCodingCellRenderer + csvCodingView

### Task 12: Substituir 2 sites em `csvCodingCellRenderer.ts`

**Files:**
- Modify: `src/csv/csvCodingCellRenderer.ts:68, 97`

- [ ] **Step 1: Localizar e substituir**

Linha 68 (chip click → detail navigation):
```ts
// antes
? model.getRowMarkersForCell(file, sourceRowId, sourceColumn)
// depois — depende do uso. Se for pra obter um marker pra navegar, troca pra:
?  (() => { const m = model.getRowMarkerForActiveCoder(file, sourceRowId, sourceColumn); return m ? [m] : []; })()
```

Linha 97 (X-button → delete):
Mesma mudança.

**Nota pro implementador:** ler o contexto exato dos 2 sites antes de substituir. Se a lista é usada só pra `[0]` ou `[0]?.id`, simplificar pra `getRowMarkerForActiveCoder(...)`. Se é iterada, manter array via wrapping.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Suite completa**

```bash
npm run test
```

- [ ] **Step 4: Commit**

```bash
git add src/csv/csvCodingCellRenderer.ts
~/.claude/scripts/commit.sh "fix(csv): csvCodingCellRenderer click handlers usam active coder"
```

---

### Task 13: `csvCodingView` subscribe a `onActiveCoderChange`

**Files:**
- Modify: `src/csv/csvCodingView.ts`

- [ ] **Step 1: Localizar onde view tem acesso ao gridApi e plugin**

```bash
grep -n "this.plugin\|gridApi\|onunload\|onload" src/csv/csvCodingView.ts | head -20
```

Identificar:
- Onde a view chama `plugin.onActiveCoderChange` durante setup (após gridApi estar disponível).
- Onde guarda a função de unsubscribe (pra chamar no unload do view).

- [ ] **Step 2: Adicionar field e subscribe**

Adicionar field no class body:

```ts
private unsubActiveCoder: (() => void) | null = null;
```

No setup do view (após `gridApi` estar inicializado, geralmente em `onGridReady` ou equivalente):

```ts
this.unsubActiveCoder = this.plugin.onActiveCoderChange(() => {
	this.gridApi?.refreshCells({ force: true });
});
```

No `onunload` ou `onClose` do view:

```ts
this.unsubActiveCoder?.();
this.unsubActiveCoder = null;
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Suite completa**

```bash
npm run test
```

- [ ] **Step 5: Build production**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/csv/csvCodingView.ts
~/.claude/scripts/commit.sh "feat(csv): csvCodingView refresha grade no onActiveCoderChange"
```

---

## Chunk 7: Smoke test no Obsidian real (TOP PRIORITY §1)

### Task 14: Validar em vault de workbench

**Vault:** `/Users/mosx/Desktop/obsidian-plugins-workbench/`

- [ ] **Step 1: Reload Obsidian (Cmd-R) ou desabilitar/habilitar plugin via Settings → Community plugins**

Confirmar que último build foi copiado (artefato `main.js` está atualizado por hot-reload em watch ou pelo `npm run build` da Task 13).

- [ ] **Step 2: Executar cenário do spec §9.3**

1. Active `'human:default'`. Abrir CSV de teste. Marcar cell A1 com código X. Adicionar comment "default comment" via cell comment input.
2. Settings → criar coder `'human:bob'`. Ativar bob (via TopBarCoderPicker ou statusBar).
3. **Verificar (sem reload)**: grade re-renderiza, cell A1 aparece **vazia** (sem código X, sem comment).
4. Marcar cell A1 com código Y. Adicionar comment "bob comment". Cell A1 exibe Y + comment "bob".
5. Trocar active de volta para default. Cell A1 exibe X + comment "default".
6. Abrir Compare Coders view com ambos coders no scope. Cell A1 mostra stripes (X em uma stripe, Y em outra).
7. Como default, marcar cell A2 com código Z. Trocar para bob. Abrir popover em A2 — modo "create" (vazio, sem "Remove All Codes"). Voltar pra default — popover em A2 reabre em modo hover/edit com Z visível.
8. Inspecionar `.obsidian/plugins/obsidian-qualia-coding/data.json` — 2 RowMarkers para A1 (um por coder), 1 RowMarker para A2 (só do default), sem mutation cruzada.

- [ ] **Step 3: Capturar resultado**

Se todos os passos 3-8 baterem: smoke pass. Reportar ao usuário com a lista de comportamentos confirmados.

Se algum passo divergir: STOP. Reportar o passo + comportamento observado + estado relevante (`data.json` snippet). Não tentar fix sem alinhar.

- [ ] **Step 4: Cleanup**

Antes de fechar:
- Apagar coder `'human:bob'` via Settings → Coders (se desejado).
- Limpar markers de teste do CSV de teste (manualmente ou via comando).
- Voltar active pra `'human:default'`.

- [ ] **Step 5: Atualizar docs do projeto**

Conforme CLAUDE.md §"Atualizacao de docs apos feature/fase":
- `docs/ROADMAP.md`: marcar item "CSV cross-coder row marker" como FEITO + data.
- `docs/CHANGELOG.md`: entrada de feat/fix.
- `CLAUDE.md`: atualizar contagem de tests (3435 → 3435 + 13 cases novos).
- `docs/TECHNICAL-PATTERNS.md`: adicionar pattern se descobriu gotcha durante implementação (provavelmente não — slice mecânico).

- [ ] **Step 6: Commit final dos docs**

```bash
git add docs/ROADMAP.md docs/CHANGELOG.md CLAUDE.md
~/.claude/scripts/commit.sh "docs: pós-CSV cross-coder — ROADMAP FEITO + CHANGELOG + CLAUDE contagem tests"
```
