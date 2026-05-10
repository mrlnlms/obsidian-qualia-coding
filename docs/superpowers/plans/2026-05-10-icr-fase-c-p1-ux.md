# ICR Fase C P1 — UX layer Implementation Plan

> **For agentic workers:** Execução inline (regra do projeto: SDD overkill, sem worktree). TDD por task. Smoke obrigatório no Obsidian real ao final de cada chunk (CLAUDE.md §1).

**Goal:** Entregar a camada UX (P1) sobre o motor de transport multi-coder remoto (Slice 3 / Fase C P0). Uma única ItemView "ICR Import" agnóstica ao N de contribuições, com 3 chips (Visão geral / Lado a lado / Por código), divergence resolution inline, ribbon icon pra import e botão pra export no Compare Coders View.

**Architecture:** Reusa pattern `qc-cc-mode-chip` do `unifiedCompareCodersView.ts`. Estado da view em memória session-only. Pré-requisito P0: estender `mergeCoderContribution` com `options: { dryRun?, overrides? }` pra permitir preview sem mutação. Lógica de contagem (N_in/N_out) em função pura `divergenceResolver`. Loader puro pra parse + validação de PayloadV1. Sem deps novas.

**Tech Stack:** TypeScript strict, Obsidian API (ItemView, Modal, Notice, addRibbonIcon, registerView, registerDomEvent, vault.adapter.write/mkdir), Vitest + jsdom pra unit, smoke manual via vault.

**Spec:** `docs/superpowers/specs/2026-05-10-icr-fase-c-p1-ux-design.md`

**Pré-requisitos:**
- Slice 3 (Fase C P0 transport puro) ✅ — `extractCoderContribution`, `mergeCoderContribution`, `crossVaultRemap`, `payloadTypes.ts`

**Decisões cravadas (da spec):**
- Surface única: ItemView `qc-icr-import` (sem modal paralelo, sem setting, sem dialog de entrada)
- Rail (200px) à esquerda + chip toolbar + body re-render
- 3 chips: ▦ Visão geral · ▤ Lado a lado · ▥ Por código
- Codebook + source divergence resolvidos inline em Visão geral (sem chip dedicado)
- Trigger import = ribbon icon `git-pull-request` · trigger export = botão no Compare Coders View toolbar (+ comando palette pra ambos)
- Motor patch P0: parâmetro `options?: { dryRun?: boolean; overrides?: ResolutionOverrides }`
- `ResolutionOverrides` mora em `src/core/icr/contributions/contributionViewTypes.ts` (UI-only; NÃO entra em `payloadTypes.ts`)
- Engines do PayloadV1: só markdown / pdf / csvSegment (audio/video/csvRow/pdfShape/image fora — Slice 3 P0 não cobre)
- Conflitos NÃO renderizados (motor não emite hoje): `code_overwritten` field=description|memo, `memo_overwritten`, `group_overwritten`
- Rail é session-only (sem persistência em data.json)

**Out of scope (registrado em spec §1.1):**
- Persistência da rail
- Document Cloning estilo Dedoose
- Merge driver via git
- Conflict policy configurável
- Marker dedup automática (markers de coders diferentes coexistem)

---

## File Structure

**Novos:**
```
src/core/icr/contributions/
  contributionViewTypes.ts   — IcrImportViewState, PendingContribution, ResolutionOverrides
  contributionLoader.ts      — parse(jsonString) → { payload, errors }
  divergenceResolver.ts      — computeBreakdown(mergeResult, overrides, payload) → { N_in, N_out, breakdown }
  unifiedIcrImportView.ts    — ItemView (registra view type, render skeleton, dispatch chips)
  importToolbar.ts           — render chips + sub-pergunta + meta header
  rail.ts                    — render lista lateral + drop zone
  overviewChip.ts            — render Visão geral (3 seções inline + footer Apply)
  sideBySideChip.ts          — render Lado a lado (marker-by-marker, accept/skip, ←/→)
  byCodeChip.ts              — render Por código (agrupado, batch actions)
  exportTrigger.ts           — orquestra export: filter coders, modal seleção, write file

tests/core/icr/contributions/
  contributionLoader.test.ts
  divergenceResolver.test.ts
  rail.test.ts
  overviewChip.test.ts
  sideBySideChip.test.ts
  byCodeChip.test.ts
  exportTrigger.test.ts

tests/core/icr/transport/
  mergeCoderContribution.test.ts  — estender com testes pra dryRun + overrides
```

**Modificações:**
```
src/core/icr/transport/mergeCoderContribution.ts   — adicionar parâmetro options: { dryRun?, overrides? }
src/core/icr/ui/unifiedCompareCodersView.ts:91     — adicionar botão "↗ exportar contribuição"
src/main.ts                                        — registerView qc-icr-import + addRibbonIcon + 2 commands
```

---

## Chunk 1 — Motor patch P0 (dryRun + overrides)

**Goal:** estender `mergeCoderContribution` com `options.dryRun` (não muta `localData`) e `options.overrides` (skipa items conforme escolha do user). Sem isso, P1 não fecha — `mergePreview` e `Apply` dependem disso.

### Task 1.1: Definir `ResolutionOverrides` em UI module

**Files:**
- Create: `src/core/icr/contributions/contributionViewTypes.ts`

- [ ] **Step 1: Criar arquivo com types iniciais (só ResolutionOverrides por enquanto; restantes vêm em Chunk 3)**

```typescript
// src/core/icr/contributions/contributionViewTypes.ts
/**
 * Types da UI layer da Fase C P1 (ICR Import view).
 *
 * ResolutionOverrides é UI-only — escolhas do user (manter local / aceitar incoming /
 * skip). Motor consome via parâmetro `options.overrides` em mergeCoderContribution
 * (sem entrar em payloadTypes.ts, que descreve só wire format).
 */

export interface ResolutionOverrides {
	/** Override per code: 'local' = mantém local, 'incoming' = aceita Carla (default), 'skip' = não importa code novo. */
	codebookOverrides: Map<string /* codeId */, 'local' | 'incoming' | 'skip'>;
	/** Override per source: 'trust-local' = importa markers mesmo com offsets potencialmente desalinhados, 'skip-source' = não importa, { kind: 'map-manual', localFileId } = remap manual. */
	sourceOverrides: Map<string /* payloadFileId */, 'trust-local' | 'skip-source' | { kind: 'map-manual'; localFileId: string }>;
	/** Markers individuais skipados pelo user (chip Lado a lado). */
	perMarkerSkip: Set<string /* markerId */>;
	/** Codes inteiros skipados (chip Por código — afeta todos markers desse code). */
	perCodeSkip: Set<string /* codeId */>;
}

export function createEmptyOverrides(): ResolutionOverrides {
	return {
		codebookOverrides: new Map(),
		sourceOverrides: new Map(),
		perMarkerSkip: new Set(),
		perCodeSkip: new Set(),
	};
}

/** Clone shallow das estruturas — usado por chips antes de mutar e emitir onOverridesChange. */
export function cloneOverrides(o: ResolutionOverrides): ResolutionOverrides {
	return {
		codebookOverrides: new Map(o.codebookOverrides),
		sourceOverrides: new Map(o.sourceOverrides),
		perMarkerSkip: new Set(o.perMarkerSkip),
		perCodeSkip: new Set(o.perCodeSkip),
	};
}
```

- [ ] **Step 2: Verifica typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 3: Commit**

```bash
git add src/core/icr/contributions/contributionViewTypes.ts
~/.claude/scripts/commit.sh "feat(icr): contributionViewTypes — ResolutionOverrides type pra UI Fase C P1"
```

---

### Task 1.2: Estender `mergeCoderContribution` com `options.dryRun`

**Files:**
- Modify: `src/core/icr/transport/mergeCoderContribution.ts`
- Modify: `tests/core/icr/transport/mergeCoderContribution.test.ts`

- [ ] **Step 1: Ler estado atual da assinatura**

Run: `grep -n "export async function mergeCoderContribution" src/core/icr/transport/mergeCoderContribution.ts`
Expected: linha ~25 com assinatura atual `(localData, payload, localHashRegistry)`.

- [ ] **Step 2: Escrever teste falhando — dryRun não muta localData**

Adicionar em `tests/core/icr/transport/mergeCoderContribution.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { mergeCoderContribution } from '../../../../src/core/icr/transport/mergeCoderContribution';
// ... reusar imports existentes do arquivo (PayloadV1, helpers, etc)

describe('mergeCoderContribution dryRun', () => {
	test('dryRun: true não muta localData (registries, markers, coders)', async () => {
		const localData = makeMinimalLocalData(); // helper já existente ou criar inline com data vazia
		const payload = makeMinimalPayload();      // payload com 1 code novo + 5 markers
		const hashRegistry = makeHashRegistry();

		const beforeCodes = JSON.stringify(localData.registry.definitions);
		const beforeMarkers = JSON.stringify(localData.markdown.markers);
		const beforeCoders = JSON.stringify(localData.coders);

		const result = await mergeCoderContribution(localData, payload, hashRegistry, { dryRun: true });

		// Conflicts/counts ainda computados
		expect(result.added.markers).toBeGreaterThan(0);
		expect(result.fileIdRemap).toBeDefined();

		// Mas localData NÃO mutou
		expect(JSON.stringify(localData.registry.definitions)).toBe(beforeCodes);
		expect(JSON.stringify(localData.markdown.markers)).toBe(beforeMarkers);
		expect(JSON.stringify(localData.coders)).toBe(beforeCoders);
	});

	test('dryRun: false (default) muta normalmente — regression', async () => {
		const localData = makeMinimalLocalData();
		const payload = makeMinimalPayload();
		const hashRegistry = makeHashRegistry();

		const beforeCodeCount = Object.keys(localData.registry.definitions).length;

		await mergeCoderContribution(localData, payload, hashRegistry); // sem options

		expect(Object.keys(localData.registry.definitions).length).toBeGreaterThan(beforeCodeCount);
	});
});
```

Helpers `makeMinimalLocalData`, `makeMinimalPayload`, `makeHashRegistry` — copiar pattern dos testes existentes em `mergeCoderContribution.test.ts`. Se não existirem, criar inline com fixture mínima (1 source, 1 code, 5 markers).

- [ ] **Step 3: Run test pra verificar falha**

Run: `npm test -- mergeCoderContribution.test.ts`
Expected: FAIL — método não aceita `options` (TypeScript error) ou ignora `dryRun` e mutou.

- [ ] **Step 4: Implementar — adicionar parâmetro `options`**

Editar `src/core/icr/transport/mergeCoderContribution.ts`:

```typescript
// Adicionar import
import type { ResolutionOverrides } from '../contributions/contributionViewTypes';

// Modificar assinatura
export async function mergeCoderContribution(
	localData: QualiaData,
	payload: Payload,
	localHashRegistry: SourceHashRegistry,
	options?: { dryRun?: boolean; overrides?: ResolutionOverrides },
): Promise<MergeResult> {
	const dryRun = options?.dryRun ?? false;
	// ... resto
}
```

Em CADA mutação de `localData` no corpo da função, guardar com `if (!dryRun)`:

```typescript
// Exemplo — coder registration
if (!localData.coders) localData.coders = { coders: [] };
if (!localData.coders.coders.find(c => c.id === payload.coder.id)) {
	if (!dryRun) localData.coders.coders.push(payload.coder);
	added.coder = true;
}

// Code merge
for (const code of payload.codes) {
	const existing = localData.registry.definitions[code.id];
	if (!existing) {
		if (!dryRun) {
			localData.registry.definitions[code.id] = code;
			if (!localData.registry.rootOrder.includes(code.id)) {
				localData.registry.rootOrder.push(code.id);
			}
		}
		added.codes++;
	} else {
		if (existing.name !== code.name) {
			conflicts.push({ kind: 'code_overwritten', codeId: code.id, field: 'name', from: existing.name, to: code.name });
			if (!dryRun) existing.name = code.name;
		}
		if (existing.color !== code.color) {
			conflicts.push({ kind: 'code_overwritten', codeId: code.id, field: 'color', from: existing.color, to: code.color });
			if (!dryRun) existing.color = code.color;
		}
	}
}

// Group merge
if (payload.groups) {
	for (const group of payload.groups) {
		if (!localData.registry.groups[group.id]) {
			if (!dryRun) {
				localData.registry.groups[group.id] = group;
				if (!localData.registry.groupOrder.includes(group.id)) {
					localData.registry.groupOrder.push(group.id);
				}
			}
			added.groups++;
		}
	}
}

// Marker insertion — markdown (nested Record<fileId, Marker[]>)
for (const [payloadFileId, markers] of Object.entries(payload.markers.markdown)) {
	const localFileId = remap.fileIdRemap[payloadFileId];
	if (!localFileId) {
		pendingMarkers += markers.length;
		continue;
	}
	if (!dryRun) {
		if (!localData.markdown.markers[localFileId]) localData.markdown.markers[localFileId] = [];
	}
	for (const m of markers) {
		if (!dryRun) localData.markdown.markers[localFileId]!.push({ ...m, fileId: localFileId });
		added.markers++;
	}
}

// Marker insertion — PDF (flat array, fileId no marker)
for (const m of payload.markers.pdf) {
	const localFileId = remap.fileIdRemap[m.fileId];
	if (!localFileId) {
		pendingMarkers++;
		continue;
	}
	if (!dryRun) localData.pdf.markers.push({ ...m, fileId: localFileId });
	added.markers++;
}

// Marker insertion — CSV segment (flat array, fileId no marker)
for (const m of payload.markers.csvSegment) {
	const localFileId = remap.fileIdRemap[m.fileId];
	if (!localFileId) {
		pendingMarkers++;
		continue;
	}
	if (!dryRun) localData.csv.segmentMarkers.push({ ...m, fileId: localFileId });
	added.markers++;
}
```

- [ ] **Step 5: Run tests — devem passar**

Run: `npm test -- mergeCoderContribution.test.ts`
Expected: PASS (testes novos verdes + testes antigos não regridem)

- [ ] **Step 6: Run typecheck full**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/icr/transport/mergeCoderContribution.ts tests/core/icr/transport/mergeCoderContribution.test.ts
~/.claude/scripts/commit.sh "feat(icr): mergeCoderContribution aceita options.dryRun (não muta localData)"
```

---

### Task 1.3: Estender `mergeCoderContribution` com `options.overrides`

**Files:**
- Modify: `src/core/icr/transport/mergeCoderContribution.ts`
- Modify: `tests/core/icr/transport/mergeCoderContribution.test.ts`

- [ ] **Step 1: Escrever testes falhando pra cada tipo de override**

Adicionar em `tests/core/icr/transport/mergeCoderContribution.test.ts`:

```typescript
import { createEmptyOverrides } from '../../../../src/core/icr/contributions/contributionViewTypes';

describe('mergeCoderContribution overrides', () => {
	test('codebookOverrides[codeId] = "local" skipa overwrite desse code', async () => {
		const localData = makeLocalDataWithExistingCode('code_42', 'OLD-NAME');
		const payload = makePayloadWithCode('code_42', 'NEW-NAME'); // tenta renomear
		const overrides = createEmptyOverrides();
		overrides.codebookOverrides.set('code_42', 'local');

		await mergeCoderContribution(localData, payload, makeHashRegistry(), { overrides });

		// Não deve renomear
		expect(localData.registry.definitions['code_42'].name).toBe('OLD-NAME');
	});

	test('codebookOverrides[codeId] = "skip" pra code novo: não adiciona ao registry', async () => {
		const localData = makeMinimalLocalData(); // sem code_999
		const payload = makePayloadWithNewCode('code_999', 'BRAND-NEW');
		const overrides = createEmptyOverrides();
		overrides.codebookOverrides.set('code_999', 'skip');

		const result = await mergeCoderContribution(localData, payload, makeHashRegistry(), { overrides });

		expect(localData.registry.definitions['code_999']).toBeUndefined();
		// E markers desse code também ficam fora — counted em added só os que entraram
	});

	test('sourceOverrides[fid] = "skip-source": markers desse source ficam fora (somam em pendingMarkers)', async () => {
		const localData = makeMinimalLocalData();
		const payload = makePayloadWithMarkersInSource('src_a', 5);
		const overrides = createEmptyOverrides();
		overrides.sourceOverrides.set('src_a', 'skip-source');

		const result = await mergeCoderContribution(localData, payload, makeHashRegistry(), { overrides });

		expect(result.added.markers).toBe(0);
		expect(result.pendingMarkers).toBe(5);
	});

	test('perMarkerSkip: skipa marker individual', async () => {
		const localData = makeMinimalLocalData();
		const payload = makePayloadWithMarkers([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]);
		const overrides = createEmptyOverrides();
		overrides.perMarkerSkip.add('m2');

		const result = await mergeCoderContribution(localData, payload, makeHashRegistry(), { overrides });

		expect(result.added.markers).toBe(2); // m1, m3
	});

	test('perCodeSkip: skipa todos markers desse code', async () => {
		const localData = makeMinimalLocalData();
		const payload = makePayloadWithMarkersOnCode('code_X', 7);
		const overrides = createEmptyOverrides();
		overrides.perCodeSkip.add('code_X');

		const result = await mergeCoderContribution(localData, payload, makeHashRegistry(), { overrides });

		expect(result.added.markers).toBe(0);
	});

	test('combinação ordem-independente: aplicar (skipMarker, skipSource) ou (skipSource, skipMarker) dá mesmo resultado', async () => {
		const localData1 = makeMinimalLocalData();
		const localData2 = makeMinimalLocalData();
		const payload = makeFullPayload();

		const overridesA = createEmptyOverrides();
		overridesA.perMarkerSkip.add('m1');
		overridesA.sourceOverrides.set('src_a', 'skip-source');

		const overridesB = createEmptyOverrides();
		overridesB.sourceOverrides.set('src_a', 'skip-source');
		overridesB.perMarkerSkip.add('m1');

		const r1 = await mergeCoderContribution(localData1, payload, makeHashRegistry(), { overrides: overridesA });
		const r2 = await mergeCoderContribution(localData2, payload, makeHashRegistry(), { overrides: overridesB });

		expect(r1.added.markers).toBe(r2.added.markers);
		expect(r1.pendingMarkers).toBe(r2.pendingMarkers);
	});
});
```

- [ ] **Step 2: Run tests pra verificar falha**

Run: `npm test -- mergeCoderContribution.test.ts`
Expected: FAIL — overrides ainda não consumidos.

- [ ] **Step 3: Implementar consumo de overrides**

Em `mergeCoderContribution.ts`, dentro do corpo:

```typescript
const overrides = options?.overrides;

// Codebook override (no loop de codes)
for (const code of payload.codes) {
	const override = overrides?.codebookOverrides.get(code.id);
	const existing = localData.registry.definitions[code.id];

	if (!existing) {
		// Code novo
		if (override === 'skip') continue; // não adiciona, não conta em added.codes
		if (!dryRun) { /* push code */ }
		added.codes++;
	} else {
		// Code existe local — se override === 'local', skipa overwrite
		if (override === 'local') continue;
		// Senão: incoming wins (comportamento atual)
		if (existing.name !== code.name) { /* conflict + overwrite */ }
		if (existing.color !== code.color) { /* idem */ }
	}
}

// Source override + marker skip — em CADA loop de markers (markdown, pdf, csvSegment):
for (const [payloadFileId, markers] of Object.entries(payload.markers.markdown)) {
	const sourceOverride = overrides?.sourceOverrides.get(payloadFileId);

	if (sourceOverride === 'skip-source') {
		pendingMarkers += markers.length; // contam como pendentes
		continue;
	}

	let localFileId: string | undefined;
	if (sourceOverride && typeof sourceOverride === 'object' && sourceOverride.kind === 'map-manual') {
		localFileId = sourceOverride.localFileId;
	} else {
		localFileId = remap.fileIdRemap[payloadFileId];
	}
	// 'trust-local' = trata como remap padrão (não há lookup adicional)

	if (!localFileId) {
		pendingMarkers += markers.length;
		continue;
	}

	if (!dryRun && !localData.markdown.markers[localFileId]) {
		localData.markdown.markers[localFileId] = [];
	}
	for (const m of markers) {
		// Skip per marker
		if (overrides?.perMarkerSkip.has(m.id)) {
			pendingMarkers++;
			continue;
		}
		// Skip per code
		const codeIds = m.codes?.map(c => c.codeId) ?? [];
		if (codeIds.some(cid => overrides?.perCodeSkip.has(cid))) {
			pendingMarkers++;
			continue;
		}
		if (!dryRun) localData.markdown.markers[localFileId]!.push({ ...m, fileId: localFileId });
		added.markers++;
	}
}
// Aplicar lógica equivalente em pdf e csvSegment loops
```

**Atenção precedence (spec §4.2):** skipSource ⊃ skipCode ⊃ skipMarker ⊃ pending. Implementação reflete isso no early-`continue` order.

- [ ] **Step 4: Run tests — devem passar**

Run: `npm test -- mergeCoderContribution.test.ts`
Expected: PASS (todos os 6 novos + regression antigos)

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/icr/transport/mergeCoderContribution.ts tests/core/icr/transport/mergeCoderContribution.test.ts
~/.claude/scripts/commit.sh "feat(icr): mergeCoderContribution aceita options.overrides (skip per-code/source/marker + manter local)"
```

---

### Task 1.4: (removida — não há script `test-cross-vault-merge.mjs` existente; unit tests do Task 1.2/1.3 cobrem dryRun + overrides exhaustivamente)

**Chunk 1 done quando:** `npm test` verde (todos os testes novos de mergeCoderContribution + regression dos antigos). Motor pronto pra ser consumido pelo P1.

---

## Chunk 2 — Puros (contributionLoader + divergenceResolver)

**Goal:** funções puras que a UI consome — `contributionLoader.parse(jsonString)` valida PayloadV1, `divergenceResolver.computeBreakdown(...)` calcula contagens N_in/N_out conforme spec §4.2. Ambos sem dep em Obsidian, fáceis de testar com fixtures.

### Task 2.1: `contributionLoader.parse()`

**Files:**
- Create: `src/core/icr/contributions/contributionLoader.ts`
- Create: `tests/core/icr/contributions/contributionLoader.test.ts`

- [ ] **Step 1: Escrever testes primeiro**

```typescript
// tests/core/icr/contributions/contributionLoader.test.ts
import { describe, expect, test } from 'vitest';
import { parseContribution } from '../../../../src/core/icr/contributions/contributionLoader';

describe('parseContribution', () => {
	test('payload v1.0 válido → retorna { payload, errors: [] }', () => {
		const json = JSON.stringify({
			version: '1.0',
			codebookVersion: 'abc123',
			coder: { id: 'human:carla', name: 'Carla', type: 'human', createdAt: 1700000000000 },
			sources: { 'src_a': { hash: 'h1' } },
			codes: [{ id: 'c1', name: 'TEST', color: '#fff', paletteIndex: 0, createdAt: 1700000000000 }],
			markers: { markdown: {}, pdf: [], csvSegment: [] },
			exportedAt: 1700000000000,
		});
		const result = parseContribution(json);
		expect(result.errors).toEqual([]);
		expect(result.payload).toBeDefined();
		expect(result.payload?.version).toBe('1.0');
	});

	test('json malformado → erro "parse"', () => {
		const result = parseContribution('{ not json');
		expect(result.payload).toBeNull();
		expect(result.errors[0]).toMatch(/parse/i);
	});

	test('version: "2.0" → erro "version não suportada"', () => {
		const json = JSON.stringify({ version: '2.0', codebookVersion: '', coder: {}, sources: {}, codes: [], markers: { markdown: {}, pdf: [], csvSegment: [] }, exportedAt: 0 });
		const result = parseContribution(json);
		expect(result.payload).toBeNull();
		expect(result.errors[0]).toMatch(/version.*não suportada|2\.0/i);
	});

	test('faltando "coder" → erro detalhando campo', () => {
		const json = JSON.stringify({ version: '1.0', codebookVersion: '', sources: {}, codes: [], markers: { markdown: {}, pdf: [], csvSegment: [] }, exportedAt: 0 });
		const result = parseContribution(json);
		expect(result.payload).toBeNull();
		expect(result.errors.join(' ')).toMatch(/coder/);
	});

	test('faltando "markers" → erro', () => {
		const json = JSON.stringify({ version: '1.0', codebookVersion: '', coder: {}, sources: {}, codes: [], exportedAt: 0 });
		const result = parseContribution(json);
		expect(result.payload).toBeNull();
		expect(result.errors.join(' ')).toMatch(/markers/);
	});

	test('markers sem subcampo markdown → erro', () => {
		const json = JSON.stringify({ version: '1.0', codebookVersion: '', coder: {}, sources: {}, codes: [], markers: { pdf: [], csvSegment: [] }, exportedAt: 0 });
		const result = parseContribution(json);
		expect(result.payload).toBeNull();
		expect(result.errors.join(' ')).toMatch(/markers\.markdown/);
	});
});
```

- [ ] **Step 2: Run — falha (módulo não existe)**

Run: `npm test -- contributionLoader.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implementar**

```typescript
// src/core/icr/contributions/contributionLoader.ts
/**
 * Parse + valida arquivo .json como PayloadV1 (Slice 3 P0).
 *
 * Validação shallow: confirma version, presença dos campos required.
 * Não valida tipos profundos (assume payload bem-formado se shape bate).
 */

import type { PayloadV1 } from '../transport/payloadTypes';

export interface ParseResult {
	payload: PayloadV1 | null;
	errors: string[];
}

const REQUIRED_TOP_LEVEL = ['version', 'codebookVersion', 'coder', 'sources', 'codes', 'markers', 'exportedAt'] as const;
const REQUIRED_MARKERS = ['markdown', 'pdf', 'csvSegment'] as const;

export function parseContribution(jsonString: string): ParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(jsonString);
	} catch (e) {
		return { payload: null, errors: [`parse: ${(e as Error).message}`] };
	}

	if (typeof raw !== 'object' || raw === null) {
		return { payload: null, errors: ['parse: top-level deve ser objeto'] };
	}

	const obj = raw as Record<string, unknown>;
	const errors: string[] = [];

	for (const field of REQUIRED_TOP_LEVEL) {
		if (!(field in obj)) errors.push(`falta campo "${field}"`);
	}

	if (obj.version !== '1.0') {
		errors.push(`version "${obj.version}" não suportada (esperado "1.0")`);
	}

	if (obj.markers && typeof obj.markers === 'object') {
		const markers = obj.markers as Record<string, unknown>;
		for (const sub of REQUIRED_MARKERS) {
			if (!(sub in markers)) errors.push(`falta campo "markers.${sub}"`);
		}
	}

	if (errors.length > 0) {
		return { payload: null, errors };
	}

	return { payload: obj as unknown as PayloadV1, errors: [] };
}
```

- [ ] **Step 4: Run tests — devem passar**

Run: `npm test -- contributionLoader.test.ts`
Expected: PASS (6 testes verdes)

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/contributions/contributionLoader.ts tests/core/icr/contributions/contributionLoader.test.ts
~/.claude/scripts/commit.sh "feat(icr): contributionLoader.parse() valida PayloadV1 com erros estruturados"
```

---

### Task 2.2: `divergenceResolver.computeBreakdown()`

**Files:**
- Create: `src/core/icr/contributions/divergenceResolver.ts`
- Create: `tests/core/icr/contributions/divergenceResolver.test.ts`

- [ ] **Step 1: Testes (precedence + idempotência)**

```typescript
// tests/core/icr/contributions/divergenceResolver.test.ts
import { describe, expect, test } from 'vitest';
import { computeBreakdown } from '../../../../src/core/icr/contributions/divergenceResolver';
import { createEmptyOverrides } from '../../../../src/core/icr/contributions/contributionViewTypes';
import type { MergeResult } from '../../../../src/core/icr/transport/payloadTypes';
import type { PayloadV1 } from '../../../../src/core/icr/transport/payloadTypes';

function makeMergeResult(pendingMarkers: number, addedMarkers: number): MergeResult {
	return {
		added: { markers: addedMarkers, codes: 0, groups: 0, coder: false },
		conflicts: [],
		warnings: [],
		fileIdRemap: {},
		pendingMarkers,
	};
}

function makePayload(markers: { markdown?: Record<string, any[]>; pdf?: any[]; csvSegment?: any[] }): PayloadV1 {
	return {
		version: '1.0',
		codebookVersion: '',
		coder: { id: 'h:1', name: 'X', type: 'human', createdAt: 0 },
		sources: {},
		codes: [],
		markers: { markdown: markers.markdown ?? {}, pdf: markers.pdf ?? [], csvSegment: markers.csvSegment ?? [] },
		exportedAt: 0,
	};
}

describe('computeBreakdown', () => {
	test('sem overrides: N_in = todos markers do payload', () => {
		const merge = makeMergeResult(0, 5);
		const payload = makePayload({ markdown: { 'src_a': [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }, { id: 'm4' }, { id: 'm5' }] } });
		const overrides = createEmptyOverrides();

		const r = computeBreakdown(merge, overrides, payload);
		expect(r.N_in).toBe(5);
		expect(r.N_out).toBe(0);
	});

	test('skipSource conta markers desse source em breakdown.skipSource', () => {
		const merge = makeMergeResult(3, 0); // motor já marcou pending pq skip-source
		const payload = makePayload({ markdown: { 'src_a': [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] } });
		const overrides = createEmptyOverrides();
		overrides.sourceOverrides.set('src_a', 'skip-source');

		const r = computeBreakdown(merge, overrides, payload);
		expect(r.breakdown.skipSource).toBe(3);
		expect(r.N_out).toBe(3);
	});

	test('precedência: marker em perMarkerSkip E source em skipSource conta APENAS em skipSource', () => {
		const merge = makeMergeResult(2, 0);
		const payload = makePayload({ markdown: { 'src_a': [{ id: 'm1', codes: [] }, { id: 'm2', codes: [] }] } });
		const overrides = createEmptyOverrides();
		overrides.sourceOverrides.set('src_a', 'skip-source');
		overrides.perMarkerSkip.add('m1'); // m1 também tá em perMarkerSkip

		const r = computeBreakdown(merge, overrides, payload);
		expect(r.breakdown.skipSource).toBe(2); // ambos contam aqui
		expect(r.breakdown.skipMarker).toBe(0);  // m1 NÃO conta de novo
		expect(r.N_out).toBe(2); // total sem dupla contagem
	});

	test('precedência: skipCode > skipMarker', () => {
		const merge = makeMergeResult(0, 0);
		const payload = makePayload({ markdown: { 'src_a': [{ id: 'm1', codes: [{ codeId: 'c1' }] }, { id: 'm2', codes: [{ codeId: 'c1' }] }] } });
		const overrides = createEmptyOverrides();
		overrides.perCodeSkip.add('c1');
		overrides.perMarkerSkip.add('m1');

		const r = computeBreakdown(merge, overrides, payload);
		expect(r.breakdown.skipCode).toBe(2);
		expect(r.breakdown.skipMarker).toBe(0);
	});

	test('idempotente: rodar 2x retorna mesmo resultado', () => {
		const merge = makeMergeResult(1, 4);
		const payload = makePayload({ markdown: { 'src_a': [{ id: 'm1', codes: [] }, { id: 'm2', codes: [] }, { id: 'm3', codes: [] }, { id: 'm4', codes: [] }, { id: 'm5', codes: [] }] } });
		const overrides = createEmptyOverrides();
		overrides.perMarkerSkip.add('m3');

		const r1 = computeBreakdown(merge, overrides, payload);
		const r2 = computeBreakdown(merge, overrides, payload);
		expect(r1).toEqual(r2);
	});
});
```

- [ ] **Step 2: Run — falha (módulo não existe)**

Run: `npm test -- divergenceResolver.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implementar**

```typescript
// src/core/icr/contributions/divergenceResolver.ts
/**
 * divergenceResolver — função pura que computa contagem N_in / N_out + breakdown
 * conforme spec §4.2. Espelha o que mergeCoderContribution(..., { dryRun: true }) vai
 * fazer ao Apply, mas pra display no footer da view.
 *
 * Precedência: skipSource ⊃ skipCode ⊃ skipMarker ⊃ pending. Sem dupla contagem.
 */

import type { MergeResult, PayloadV1 } from '../transport/payloadTypes';
import type { ResolutionOverrides } from './contributionViewTypes';

export interface BreakdownResult {
	N_in: number;
	N_out: number;
	breakdown: {
		pending: number;
		skipSource: number;
		skipCode: number;
		skipMarker: number;
	};
}

export function computeBreakdown(
	merge: MergeResult,
	overrides: ResolutionOverrides,
	payload: PayloadV1,
): BreakdownResult {
	let skipSource = 0;
	let skipCode = 0;
	let skipMarker = 0;

	const visit = (markerId: string, fileId: string, codeIds: string[]) => {
		// Precedência: skipSource > skipCode > skipMarker
		if (overrides.sourceOverrides.get(fileId) === 'skip-source') {
			skipSource++;
			return;
		}
		if (codeIds.some(cid => overrides.perCodeSkip.has(cid))) {
			skipCode++;
			return;
		}
		if (overrides.perMarkerSkip.has(markerId)) {
			skipMarker++;
			return;
		}
	};

	// markdown
	for (const [fid, markers] of Object.entries(payload.markers.markdown)) {
		for (const m of markers) {
			const codeIds = m.codes?.map(c => c.codeId) ?? [];
			visit(m.id, fid, codeIds);
		}
	}
	// pdf
	for (const m of payload.markers.pdf) {
		const codeIds = m.codes?.map(c => c.codeId) ?? [];
		visit(m.id, m.fileId, codeIds);
	}
	// csvSegment
	for (const m of payload.markers.csvSegment) {
		const codeIds = m.codes?.map(c => c.codeId) ?? [];
		visit(m.id, m.fileId, codeIds);
	}

	const pending = merge.pendingMarkers - (skipSource + skipCode + skipMarker);
	// pending puro = pendingMarkers do motor MENOS o que veio de overrides (motor conta tudo junto)
	const N_out = skipSource + skipCode + skipMarker + Math.max(0, pending);

	const totalMarkers = countTotalMarkers(payload);
	const N_in = totalMarkers - N_out;

	return {
		N_in,
		N_out,
		breakdown: { pending: Math.max(0, pending), skipSource, skipCode, skipMarker },
	};
}

function countTotalMarkers(payload: PayloadV1): number {
	let total = 0;
	for (const markers of Object.values(payload.markers.markdown)) total += markers.length;
	total += payload.markers.pdf.length;
	total += payload.markers.csvSegment.length;
	return total;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- divergenceResolver.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/contributions/divergenceResolver.ts tests/core/icr/contributions/divergenceResolver.test.ts
~/.claude/scripts/commit.sh "feat(icr): divergenceResolver.computeBreakdown — N_in/N_out com precedência skipSource > skipCode > skipMarker > pending"
```

**Chunk 2 done quando:** `npm test` verde, 11 novos testes (6 loader + 5 resolver). Sem smoke real (puro, jsdom suficiente).

---

## Chunk 3 — ItemView skeleton + rail

**Goal:** ItemView vazia registrável, com layout grid (rail + main), drop zone funcional na rail, state mutation que muda activeId. Sem chips ainda — só skeleton + capacidade de drop arquivo + selecionar contribution.

### Task 3.1: Estender `contributionViewTypes.ts` com state shapes

**Files:**
- Modify: `src/core/icr/contributions/contributionViewTypes.ts`

- [ ] **Step 1: Adicionar types**

```typescript
// Append em src/core/icr/contributions/contributionViewTypes.ts

import type { PayloadV1, MergeResult } from '../transport/payloadTypes';

export type ChipId = 'overview' | 'side-by-side' | 'by-code';

export interface PendingContribution {
	id: string;                    // uuid local (crypto.randomUUID())
	payload: PayloadV1;
	sourcePath: string;            // path do arquivo (display)
	mergePreview: MergeResult;     // dry-run cacheado, recomputado quando overrides mudam
	overrides: ResolutionOverrides;
}

export interface IcrImportViewState {
	pending: PendingContribution[];
	activeId: string | null;
	activeChip: ChipId;
}

export function createDefaultViewState(): IcrImportViewState {
	return {
		pending: [],
		activeId: null,
		activeChip: 'overview',
	};
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/icr/contributions/contributionViewTypes.ts
~/.claude/scripts/commit.sh "feat(icr): IcrImportViewState + PendingContribution types"
```

---

### Task 3.2: ItemView esqueleto (registrável, render layout vazio)

**Files:**
- Create: `src/core/icr/contributions/unifiedIcrImportView.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// src/core/icr/contributions/unifiedIcrImportView.ts
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type QualiaCodingPlugin from '../../../main';
import { createDefaultViewState, type IcrImportViewState, type PendingContribution } from './contributionViewTypes';

export const ICR_IMPORT_VIEW_TYPE = 'qc-icr-import';

export class UnifiedIcrImportView extends ItemView {
	private state: IcrImportViewState;

	private railEl!: HTMLElement;
	private mainEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private plugin: QualiaCodingPlugin) {
		super(leaf);
		this.state = createDefaultViewState();
	}

	getViewType(): string { return ICR_IMPORT_VIEW_TYPE; }
	getDisplayText(): string { return 'ICR Import'; }
	getIcon(): string { return 'git-pull-request'; }

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('qc-icr-import-view');

		// Layout grid: rail + main
		this.railEl = root.createDiv({ cls: 'qc-icr-import-rail' });
		this.mainEl = root.createDiv({ cls: 'qc-icr-import-main' });

		this.renderRail();
		this.renderMain();
	}

	getViewState(): IcrImportViewState { return this.state; }

	updateState(partial: Partial<IcrImportViewState>): void {
		this.state = { ...this.state, ...partial };
		this.renderRail();
		this.renderMain();
	}

	addContribution(contrib: PendingContribution): void {
		this.state.pending = [...this.state.pending, contrib];
		// Auto-seleciona primeiro adicionado
		if (!this.state.activeId) this.state.activeId = contrib.id;
		this.renderRail();
		this.renderMain();
	}

	private renderRail(): void {
		this.railEl.empty();
		// Stub — vai ser substituído por rail.ts em Task 3.3
		const label = this.railEl.createDiv({ cls: 'qc-icr-rail-label' });
		label.setText(`Pending (${this.state.pending.length})`);
		for (const c of this.state.pending) {
			const item = this.railEl.createDiv({ cls: 'qc-icr-rail-item' });
			if (c.id === this.state.activeId) item.addClass('is-active');
			item.setText(c.payload.coder.name);
			item.onclick = () => this.updateState({ activeId: c.id });
		}
	}

	private renderMain(): void {
		this.mainEl.empty();
		if (!this.state.activeId) {
			const empty = this.mainEl.createDiv({ cls: 'qc-icr-empty' });
			empty.setText('selecione uma contribuição na lista');
			return;
		}
		// Stub — chips vêm em Chunk 4+
		const placeholder = this.mainEl.createDiv();
		placeholder.setText(`active: ${this.state.activeId} · chip: ${this.state.activeChip}`);
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/icr/contributions/unifiedIcrImportView.ts
~/.claude/scripts/commit.sh "feat(icr): UnifiedIcrImportView skeleton — layout rail + main, addContribution stub"
```

---

### Task 3.3: `rail.ts` — render lista lateral + drop zone

**Files:**
- Create: `src/core/icr/contributions/rail.ts`
- Create: `tests/core/icr/contributions/rail.test.ts`
- Modify: `src/core/icr/contributions/unifiedIcrImportView.ts` (delegar pra rail.ts)

- [ ] **Step 1: Testes do componente puro de render (sem Obsidian)**

```typescript
// tests/core/icr/contributions/rail.test.ts
import { describe, expect, test } from 'vitest';
import { renderRailContent } from '../../../../src/core/icr/contributions/rail';
import type { PendingContribution } from '../../../../src/core/icr/contributions/contributionViewTypes';
import { createEmptyOverrides } from '../../../../src/core/icr/contributions/contributionViewTypes';

function makeContribution(id: string, coderName: string, markerCount: number, conflicts: number): PendingContribution {
	return {
		id,
		payload: {
			version: '1.0', codebookVersion: '', exportedAt: 0,
			coder: { id: `h:${id}`, name: coderName, type: 'human', createdAt: 0 },
			sources: {}, codes: [],
			markers: { markdown: {}, pdf: [], csvSegment: [] },
		},
		sourcePath: `/tmp/${id}.json`,
		mergePreview: {
			added: { markers: markerCount, codes: 0, groups: 0, coder: false },
			conflicts: Array(conflicts).fill({ kind: 'codebook_diverged', localHash: 'a', payloadHash: 'b' }) as any,
			warnings: [], fileIdRemap: {}, pendingMarkers: 0,
		},
		overrides: createEmptyOverrides(),
	};
}

describe('renderRailContent', () => {
	test('estado vazio: mostra label "Pending (0)" + drop zone full-height', () => {
		const container = document.createElement('div');
		renderRailContent(container, [], null, () => {});

		expect(container.textContent).toMatch(/Pending \(0\)/);
		expect(container.querySelector('.qc-icr-rail-drop')).toBeTruthy();
		expect(container.querySelector('.qc-icr-rail-item')).toBeNull();
	});

	test('com 3 contribuições: 3 items + drop zone compact', () => {
		const container = document.createElement('div');
		const contribs = [
			makeContribution('1', 'Carla', 200, 2),
			makeContribution('2', 'Bruno', 87, 0),
			makeContribution('3', 'llm:gpt-4', 450, 1),
		];
		renderRailContent(container, contribs, '1', () => {});

		expect(container.textContent).toMatch(/Pending \(3\)/);
		const items = container.querySelectorAll('.qc-icr-rail-item');
		expect(items.length).toBe(3);
		expect(items[0].classList.contains('is-active')).toBe(true);
		expect(items[1].classList.contains('is-active')).toBe(false);
	});

	test('item mostra meta com count + badge de conflicts se >0', () => {
		const container = document.createElement('div');
		renderRailContent(container, [makeContribution('1', 'Carla', 200, 2)], '1', () => {});

		const item = container.querySelector('.qc-icr-rail-item')!;
		expect(item.textContent).toMatch(/Carla/);
		expect(item.textContent).toMatch(/200/);
		expect(item.querySelector('.qc-icr-rail-badge')).toBeTruthy();
	});

	test('click em item invoca onSelect com id', () => {
		const container = document.createElement('div');
		const onSelect = vi.fn();
		renderRailContent(container, [makeContribution('1', 'Carla', 200, 0), makeContribution('2', 'Bruno', 50, 0)], '1', onSelect);

		const items = container.querySelectorAll('.qc-icr-rail-item');
		(items[1] as HTMLElement).click();
		expect(onSelect).toHaveBeenCalledWith('2');
	});
});
```

(Adicionar `import { vi } from 'vitest'` se necessário.)

- [ ] **Step 2: Run — falha**

Run: `npm test -- rail.test.ts`
Expected: FAIL — `Cannot find module ./rail`

- [ ] **Step 3: Implementar `rail.ts`**

```typescript
// src/core/icr/contributions/rail.ts
/**
 * Rail lateral da ICR Import view: lista de contribuições pendentes + drop zone.
 *
 * Render é puro DOM (sem Obsidian deps) pra testabilidade. Drop event handler
 * vive em unifiedIcrImportView.ts (precisa de plugin context pra parse + add).
 */

import type { PendingContribution } from './contributionViewTypes';

export function renderRailContent(
	container: HTMLElement,
	pending: PendingContribution[],
	activeId: string | null,
	onSelect: (id: string) => void,
): void {
	container.empty?.() ?? (container.innerHTML = '');

	const label = container.createDiv({ cls: 'qc-icr-rail-label' });
	label.setText(`Pending (${pending.length})`);

	for (const c of pending) {
		const item = container.createDiv({ cls: 'qc-icr-rail-item' });
		if (c.id === activeId) item.addClass('is-active');

		const name = item.createDiv({ cls: 'qc-icr-rail-item-name' });
		name.setText(c.payload.coder.name);

		const meta = item.createDiv({ cls: 'qc-icr-rail-item-meta' });
		meta.setText(`${c.mergePreview.added.markers} markers`);

		if (c.mergePreview.conflicts.length > 0) {
			const badge = meta.createSpan({ cls: 'qc-icr-rail-badge' });
			badge.setText(` · ${c.mergePreview.conflicts.length} conflicts`);
		}

		item.onclick = () => onSelect(c.id);
	}

	const drop = container.createDiv({ cls: 'qc-icr-rail-drop' });
	if (pending.length === 0) {
		drop.addClass('is-empty');
		drop.setText('drop arquivo .json ou Cmd P → "ICR: Open import"');
	} else {
		drop.setText('drop mais arquivos');
	}
}
```

**Nota jsdom:** `createDiv`/`createSpan`/`empty`/`addClass`/`setText` são extensions Obsidian no HTMLElement.prototype. Em test env, precisam estar mockadas. Verificar `tests/setup.ts` — se `setupObsidianHelpers` não cobrir, adicionar shims locais ao test (ou usar `Element.prototype.appendChild` direto na implementação).

- [ ] **Step 4: Run tests — devem passar (incluindo `vi` import se ausente)**

Run: `npm test -- rail.test.ts`
Expected: PASS (4 testes)

Se falhar por `createDiv` não existir em jsdom:
```typescript
// Usar appendChild explícito como fallback (mais portável):
const label = container.appendChild(document.createElement('div'));
label.className = 'qc-icr-rail-label';
label.textContent = `Pending (${pending.length})`;
// etc
```

- [ ] **Step 5: Atualizar `unifiedIcrImportView.ts` pra delegar pra `renderRailContent`**

```typescript
// Substituir o método renderRail() em unifiedIcrImportView.ts:
import { renderRailContent } from './rail';

private renderRail(): void {
	renderRailContent(
		this.railEl,
		this.state.pending,
		this.state.activeId,
		(id) => this.updateState({ activeId: id }),
	);
}
```

- [ ] **Step 6: Typecheck + tests**

Run: `npx tsc --noEmit && npm test -- rail.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/icr/contributions/rail.ts src/core/icr/contributions/unifiedIcrImportView.ts tests/core/icr/contributions/rail.test.ts
~/.claude/scripts/commit.sh "feat(icr): rail.ts — lista lateral + drop zone (DOM puro testável)"
```

---

### Task 3.4: Drop handler na view (real Obsidian)

**Files:**
- Modify: `src/core/icr/contributions/unifiedIcrImportView.ts`

- [ ] **Step 1: Adicionar `setupDropHandler` em onOpen**

```typescript
// Em UnifiedIcrImportView, após renderRail/renderMain initial:

import { Notice } from 'obsidian';
import { parseContribution } from './contributionLoader';
import { mergeCoderContribution } from '../transport/mergeCoderContribution';
import { createEmptyOverrides } from './contributionViewTypes';

async onOpen(): Promise<void> {
	// ... layout existente ...
	this.setupDropHandler();
}

private setupDropHandler(): void {
	const dropZone = this.railEl; // toda a rail aceita drop (fallback se zone específica não estiver renderizada)

	for (const evt of ['dragenter', 'dragover'] as const) {
		this.registerDomEvent(dropZone, evt, (e) => {
			e.preventDefault();
			dropZone.addClass('is-drag-over');
		});
	}

	this.registerDomEvent(dropZone, 'dragleave', () => {
		dropZone.removeClass('is-drag-over');
	});

	this.registerDomEvent(dropZone, 'drop', async (e: DragEvent) => {
		e.preventDefault();
		dropZone.removeClass('is-drag-over');
		if (!e.dataTransfer) return;

		const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.json'));
		if (files.length === 0) {
			new Notice('ICR Import: só arquivos .json');
			return;
		}

		let lastValidId: string | null = null;
		for (const file of files) {
			const text = await file.text();
			const result = parseContribution(text);
			if (!result.payload) {
				new Notice(`${file.name}: ${result.errors.join('; ')}`);
				continue;
			}

			// Computa dryRun preview
			const overrides = createEmptyOverrides();
			const preview = await mergeCoderContribution(
				this.plugin.dataManager.getDataRef(),
				result.payload,
				this.plugin.sourceHashRegistry,
				{ dryRun: true, overrides },
			);

			const contrib = {
				id: crypto.randomUUID(),
				payload: result.payload,
				sourcePath: file.name,
				mergePreview: preview,
				overrides,
			};
			this.addContribution(contrib);
			lastValidId = contrib.id;
		}

		if (lastValidId) {
			this.updateState({ activeId: lastValidId });
		}
	});
}
```

**Confirmado:** `dataManager.getDataRef(): QualiaData` (`dataManager.ts:75`) + `sourceHashRegistry` exposto no plugin. Não usar `dataManager.data` (private).

- [ ] **Step 2: Verificar APIs reais do plugin**

Run: `grep -n "sourceHashRegistry\|dataManager\|this.data" src/main.ts | head -10`
Expected: identifica nome correto. Ajustar acima.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Smoke manual (Obsidian real) — checkpoint do chunk**

1. `npm run build`
2. Reload Obsidian (workbench)
3. Cmd P → "Reload app without saving" (ou kill + abrir)
4. Validar que NÃO crasha (view ainda não registrada — chunk 7 wirea o ribbon, mas plugin não pode quebrar)
5. Verificar que `npm test` está verde

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/contributions/unifiedIcrImportView.ts
~/.claude/scripts/commit.sh "feat(icr): drop handler na ICR Import view — parse + dryRun preview por arquivo"
```

**Chunk 3 done quando:** `npm test` verde, build verde, view module compila e drop handler tá pronto pra ser exercitado quando wiring (chunk 7) ligar tudo.

---

## Chunk 4 — Toolbar + Visão geral chip

**Goal:** Render toolbar com 3 chips + sub-pergunta + meta header. Implementar chip Visão geral com 3 seções inline (codebook, sources, ok) + footer Apply usando `divergenceResolver`. Conectar Apply pra chamar merge real.

### Task 4.1: `importToolbar.ts` — render chips + sub-pergunta + meta

**Files:**
- Create: `src/core/icr/contributions/importToolbar.ts`
- Create: `tests/core/icr/contributions/importToolbar.test.ts`

- [ ] **Step 1: Testes**

```typescript
// tests/core/icr/contributions/importToolbar.test.ts
import { describe, expect, test, vi } from 'vitest';
import { renderToolbarContent } from '../../../../src/core/icr/contributions/importToolbar';
import type { PendingContribution, ChipId } from '../../../../src/core/icr/contributions/contributionViewTypes';
import { createEmptyOverrides } from '../../../../src/core/icr/contributions/contributionViewTypes';

function makeContrib(coderName: string): PendingContribution {
	return {
		id: 'c1',
		payload: {
			version: '1.0', codebookVersion: '', exportedAt: 1700000000000,
			coder: { id: 'h:1', name: coderName, type: 'human', createdAt: 0 },
			sources: {}, codes: [],
			markers: { markdown: { 'src': new Array(200).fill({ id: 'm', codes: [] }) }, pdf: [], csvSegment: [] },
		},
		sourcePath: '/tmp/c.json',
		mergePreview: { added: { markers: 200, codes: 0, groups: 0, coder: false }, conflicts: [], warnings: [], fileIdRemap: {}, pendingMarkers: 0 },
		overrides: createEmptyOverrides(),
	};
}

describe('renderToolbarContent', () => {
	test('renderiza 3 chips', () => {
		const container = document.createElement('div');
		renderToolbarContent(container, makeContrib('Carla'), 'overview', () => {});
		const chips = container.querySelectorAll('.qc-cc-mode-chip');
		expect(chips.length).toBe(3);
	});

	test('chip ativo recebe is-active', () => {
		const container = document.createElement('div');
		renderToolbarContent(container, makeContrib('Carla'), 'side-by-side', () => {});
		const chips = container.querySelectorAll('.qc-cc-mode-chip');
		expect(chips[0].classList.contains('is-active')).toBe(false);
		expect(chips[1].classList.contains('is-active')).toBe(true);
		expect(chips[2].classList.contains('is-active')).toBe(false);
	});

	test('sub-pergunta muda conforme chip ativo', () => {
		for (const [chip, expected] of [
			['overview', /batch como um todo bate/i],
			['side-by-side', /accept.*skip.*marker/i],
			['by-code', /qual código.*divergindo/i],
		] as Array<[ChipId, RegExp]>) {
			const container = document.createElement('div');
			renderToolbarContent(container, makeContrib('Carla'), chip, () => {});
			const q = container.querySelector('.qc-icr-toolbar-question');
			expect(q?.textContent).toMatch(expected);
		}
	});

	test('meta header mostra coder name + count + data export', () => {
		const container = document.createElement('div');
		renderToolbarContent(container, makeContrib('Carla'), 'overview', () => {});
		const meta = container.querySelector('.qc-icr-toolbar-meta');
		expect(meta?.textContent).toMatch(/Carla/);
		expect(meta?.textContent).toMatch(/200/);
	});

	test('click em chip invoca onChipChange', () => {
		const container = document.createElement('div');
		const onChange = vi.fn();
		renderToolbarContent(container, makeContrib('Carla'), 'overview', onChange);
		const chips = container.querySelectorAll('.qc-cc-mode-chip');
		(chips[1] as HTMLElement).click();
		expect(onChange).toHaveBeenCalledWith('side-by-side');
	});
});
```

- [ ] **Step 2: Run — falha**

Run: `npm test -- importToolbar.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar**

```typescript
// src/core/icr/contributions/importToolbar.ts
import type { PendingContribution, ChipId } from './contributionViewTypes';

const CHIPS: Array<{ id: ChipId; label: string; question: string }> = [
	{ id: 'overview', label: '▦ Visão geral', question: 'o batch como um todo bate? (resolve divergências, depois apply)' },
	{ id: 'side-by-side', label: '▤ Lado a lado', question: 'esse marker bate com o que eu codificaria? (accept/skip por marker)' },
	{ id: 'by-code', label: '▥ Por código', question: 'qual código tá divergindo mais? (revisão temática, til pra LLM batch)' },
];

export function renderToolbarContent(
	container: HTMLElement,
	contrib: PendingContribution,
	activeChip: ChipId,
	onChipChange: (chip: ChipId) => void,
): void {
	container.empty?.() ?? (container.innerHTML = '');

	const row = container.createDiv({ cls: 'qc-icr-toolbar-row' });
	for (const c of CHIPS) {
		const chip = row.createSpan({
			cls: `qc-cc-mode-chip ${c.id === activeChip ? 'is-active' : ''}`,
			text: c.label,
		});
		chip.onclick = () => onChipChange(c.id);
	}

	const meta = container.createSpan({ cls: 'qc-icr-toolbar-meta' });
	const totalMarkers = countTotalMarkers(contrib.payload);
	const dateStr = new Date(contrib.payload.exportedAt).toLocaleString();
	meta.setText(`${contrib.payload.coder.name} · ${totalMarkers} markers · exportado ${dateStr}`);

	const question = container.createDiv({ cls: 'qc-icr-toolbar-question' });
	const active = CHIPS.find(c => c.id === activeChip);
	question.setText(active?.question ?? '');
}

function countTotalMarkers(payload: PendingContribution['payload']): number {
	let total = 0;
	for (const ms of Object.values(payload.markers.markdown)) total += ms.length;
	total += payload.markers.pdf.length;
	total += payload.markers.csvSegment.length;
	return total;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- importToolbar.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/contributions/importToolbar.ts tests/core/icr/contributions/importToolbar.test.ts
~/.claude/scripts/commit.sh "feat(icr): importToolbar — 3 chips + sub-pergunta + meta header (pattern qc-cc-mode-chip)"
```

---

### Task 4.2: `overviewChip.ts` — seção codebook

**Files:**
- Create: `src/core/icr/contributions/overviewChip.ts`
- Create: `tests/core/icr/contributions/overviewChip.test.ts`

- [ ] **Step 1: Testes seção codebook**

```typescript
// tests/core/icr/contributions/overviewChip.test.ts
import { describe, expect, test, vi } from 'vitest';
import { renderOverviewChip } from '../../../../src/core/icr/contributions/overviewChip';
import { createEmptyOverrides, type PendingContribution } from '../../../../src/core/icr/contributions/contributionViewTypes';
import type { ConflictRecord } from '../../../../src/core/icr/transport/payloadTypes';

function makeContrib(opts: { conflicts?: ConflictRecord[]; pendingMarkers?: number; addedMarkers?: number }): PendingContribution {
	return {
		id: 'c1',
		payload: {
			version: '1.0', codebookVersion: '', exportedAt: 0,
			coder: { id: 'h:1', name: 'Carla', type: 'human', createdAt: 0 },
			sources: {}, codes: [],
			markers: { markdown: { 'src': new Array(opts.addedMarkers ?? 0).fill({ id: 'm', codes: [] }) }, pdf: [], csvSegment: [] },
		},
		sourcePath: '',
		mergePreview: {
			added: { markers: opts.addedMarkers ?? 0, codes: 0, groups: 0, coder: false },
			conflicts: opts.conflicts ?? [],
			warnings: [], fileIdRemap: {},
			pendingMarkers: opts.pendingMarkers ?? 0,
		},
		overrides: createEmptyOverrides(),
	};
}

describe('overviewChip — seção codebook', () => {
	test('sem code_overwritten conflict: seção codebook não aparece', () => {
		const container = document.createElement('div');
		renderOverviewChip(container, makeContrib({}), { onApply: vi.fn(), onDiscard: vi.fn(), onOverridesChange: vi.fn() });
		expect(container.querySelector('.qc-icr-section-codebook')).toBeNull();
	});

	test('com code_overwritten field=name: row mostra valores antigo/novo + 2 botões', () => {
		const container = document.createElement('div');
		const contrib = makeContrib({
			conflicts: [{ kind: 'code_overwritten', codeId: 'c1', field: 'name', from: 'OLD', to: 'NEW' }],
		});
		renderOverviewChip(container, contrib, { onApply: vi.fn(), onDiscard: vi.fn(), onOverridesChange: vi.fn() });

		const section = container.querySelector('.qc-icr-section-codebook');
		expect(section).toBeTruthy();
		expect(section!.textContent).toMatch(/OLD/);
		expect(section!.textContent).toMatch(/NEW/);
		const buttons = section!.querySelectorAll('button, .qc-icr-button');
		expect(buttons.length).toBeGreaterThanOrEqual(2);
	});

	test('click "Manter local" registra override em codebookOverrides', () => {
		const container = document.createElement('div');
		const onOverridesChange = vi.fn();
		const contrib = makeContrib({
			conflicts: [{ kind: 'code_overwritten', codeId: 'c42', field: 'name', from: 'OLD', to: 'NEW' }],
		});
		renderOverviewChip(container, contrib, { onApply: vi.fn(), onDiscard: vi.fn(), onOverridesChange });

		const localBtn = Array.from(container.querySelectorAll('button, .qc-icr-button')).find(b => /manter local/i.test(b.textContent ?? '')) as HTMLElement;
		expect(localBtn).toBeTruthy();
		localBtn.click();
		expect(onOverridesChange).toHaveBeenCalledWith(expect.objectContaining({
			codebookOverrides: expect.any(Map),
		}));
		const arg = onOverridesChange.mock.calls[0][0];
		expect(arg.codebookOverrides.get('c42')).toBe('local');
	});
});
```

- [ ] **Step 2: Run — falha**

Run: `npm test -- overviewChip.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar render base + seção codebook**

```typescript
// src/core/icr/contributions/overviewChip.ts
/**
 * Visão geral chip — seções inline (codebook + sources + ok) + footer Apply.
 *
 * Seções aparecem condicionalmente (sem conflito = sem seção). Footer
 * computa N_in/N_out via divergenceResolver. Apply chama callback (a view
 * decide se executa merge real e remove da rail).
 */

import type { PendingContribution, ResolutionOverrides } from './contributionViewTypes';
import type { ConflictRecord } from '../transport/payloadTypes';

export interface OverviewChipCallbacks {
	onApply: () => void;
	onDiscard: () => void;
	onOverridesChange: (overrides: ResolutionOverrides) => void;
}

export function renderOverviewChip(
	container: HTMLElement,
	contrib: PendingContribution,
	cb: OverviewChipCallbacks,
): void {
	container.empty?.() ?? (container.innerHTML = '');

	const codeOverwrittens = contrib.mergePreview.conflicts.filter(
		(c): c is Extract<ConflictRecord, { kind: 'code_overwritten' }> => c.kind === 'code_overwritten',
	);

	if (codeOverwrittens.length > 0) {
		renderCodebookSection(container, contrib, codeOverwrittens, cb);
	}

	// Sources + OK + Footer vêm em Tasks 4.3 e 4.4
	renderFooterStub(container, contrib, cb);
}

function renderCodebookSection(
	container: HTMLElement,
	contrib: PendingContribution,
	conflicts: Array<Extract<ConflictRecord, { kind: 'code_overwritten' }>>,
	cb: OverviewChipCallbacks,
): void {
	const section = container.createDiv({ cls: 'qc-icr-section qc-icr-section-codebook qc-icr-section-warn' });
	const head = section.createDiv({ cls: 'qc-icr-section-head' });
	head.createEl('h4', { text: `⚠ Codebook divergiu desde o export` });
	const meta = head.createSpan({ cls: 'qc-icr-section-meta' });
	meta.setText(`${conflicts.length} codes afetados`);

	const body = section.createDiv({ cls: 'qc-icr-section-body' });

	for (const conf of conflicts) {
		const row = body.createDiv({ cls: 'qc-icr-diff-row' });
		const local = row.createDiv({ cls: 'qc-icr-diff-cell local' });
		local.setText(`${conf.codeId} · ${conf.field}: ${formatVal(conf.from)}`);
		const theirs = row.createDiv({ cls: 'qc-icr-diff-cell theirs' });
		theirs.setText(`${conf.codeId} · ${conf.field}: ${formatVal(conf.to)}`);

		const actions = body.createDiv({ cls: 'qc-icr-diff-actions' });
		const localBtn = actions.createEl('button', { cls: 'qc-icr-button outline', text: 'Manter local' });
		localBtn.onclick = () => {
			const newOverrides = cloneOverrides(contrib.overrides);
			newOverrides.codebookOverrides.set(conf.codeId, 'local');
			cb.onOverridesChange(newOverrides);
		};
		const incomingBtn = actions.createEl('button', { cls: 'qc-icr-button', text: `Aceitar ${contrib.payload.coder.name} (default)` });
		incomingBtn.onclick = () => {
			const newOverrides = cloneOverrides(contrib.overrides);
			newOverrides.codebookOverrides.set(conf.codeId, 'incoming');
			cb.onOverridesChange(newOverrides);
		};
	}
}

function renderFooterStub(container: HTMLElement, contrib: PendingContribution, cb: OverviewChipCallbacks): void {
	// Stub — Task 4.4 substitui por versão completa
	const footer = container.createDiv({ cls: 'qc-icr-overview-footer' });
	const apply = footer.createEl('button', { cls: 'qc-icr-button', text: `Apply (${contrib.mergePreview.added.markers})` });
	apply.onclick = cb.onApply;
	const discard = footer.createEl('button', { cls: 'qc-icr-button secondary', text: 'Discard contribution' });
	discard.onclick = cb.onDiscard;
}

function formatVal(v: string): string {
	return v.length > 30 ? `${v.slice(0, 27)}…` : v;
}
```

(Importar `cloneOverrides` de `./contributionViewTypes` no topo do arquivo.)

- [ ] **Step 4: Run tests**

Run: `npm test -- overviewChip.test.ts`
Expected: PASS (3 testes seção codebook)

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/contributions/overviewChip.ts tests/core/icr/contributions/overviewChip.test.ts
~/.claude/scripts/commit.sh "feat(icr): overviewChip — seção codebook (diff rows + manter local/aceitar)"
```

---

### Task 4.3: `overviewChip.ts` — seção sources + seção OK

**Files:**
- Modify: `src/core/icr/contributions/overviewChip.ts`
- Modify: `tests/core/icr/contributions/overviewChip.test.ts`

- [ ] **Step 1: Adicionar testes pra seção sources**

```typescript
// Append em overviewChip.test.ts
describe('overviewChip — seção sources', () => {
	test('source_hash_mismatch: row mostra fileId + 2 botões (trust local / skip)', () => {
		const container = document.createElement('div');
		const contrib = makeContrib({
			conflicts: [{ kind: 'source_hash_mismatch', fileId: 'P03.md', localHash: 'a', payloadHash: 'b' }],
		});
		renderOverviewChip(container, contrib, { onApply: vi.fn(), onDiscard: vi.fn(), onOverridesChange: vi.fn() });
		const section = container.querySelector('.qc-icr-section-sources');
		expect(section).toBeTruthy();
		expect(section!.textContent).toMatch(/P03\.md/);
		expect(section!.textContent).toMatch(/hash mismatch/i);
	});

	test('source_not_found: row mostra fileId + opção skip', () => {
		const container = document.createElement('div');
		const contrib = makeContrib({
			conflicts: [{ kind: 'source_not_found', fileId: 'P11.md', payloadHash: 'b' }],
		});
		renderOverviewChip(container, contrib, { onApply: vi.fn(), onDiscard: vi.fn(), onOverridesChange: vi.fn() });
		expect(container.querySelector('.qc-icr-section-sources')!.textContent).toMatch(/P11\.md/);
		expect(container.querySelector('.qc-icr-section-sources')!.textContent).toMatch(/not found|não existe/i);
	});

	test('click "Skip source" registra override sourceOverrides[fid] = "skip-source"', () => {
		const container = document.createElement('div');
		const onOverridesChange = vi.fn();
		const contrib = makeContrib({
			conflicts: [{ kind: 'source_hash_mismatch', fileId: 'X.md', localHash: 'a', payloadHash: 'b' }],
		});
		renderOverviewChip(container, contrib, { onApply: vi.fn(), onDiscard: vi.fn(), onOverridesChange });
		const skipBtn = Array.from(container.querySelectorAll('button')).find(b => /skip source/i.test(b.textContent ?? '')) as HTMLElement;
		skipBtn.click();
		const arg = onOverridesChange.mock.calls[0][0];
		expect(arg.sourceOverrides.get('X.md')).toBe('skip-source');
	});

	test('seção OK aparece sempre (mesmo sem conflitos), counts visíveis', () => {
		const container = document.createElement('div');
		renderOverviewChip(container, makeContrib({ addedMarkers: 113 }), { onApply: vi.fn(), onDiscard: vi.fn(), onOverridesChange: vi.fn() });
		const ok = container.querySelector('.qc-icr-section-ok');
		expect(ok).toBeTruthy();
		expect(ok!.textContent).toMatch(/113/);
	});
});
```

- [ ] **Step 2: Run — falha**

Run: `npm test -- overviewChip.test.ts`
Expected: FAIL nos 4 novos testes

- [ ] **Step 3: Adicionar `renderSourcesSection` + `renderOkSection`**

```typescript
// Em overviewChip.ts, expandir renderOverviewChip:

const sourceConflicts = contrib.mergePreview.conflicts.filter(
	(c): c is Extract<ConflictRecord, { kind: 'source_hash_mismatch' | 'source_not_found' | 'multiple_hash_matches' }> =>
		c.kind === 'source_hash_mismatch' || c.kind === 'source_not_found' || c.kind === 'multiple_hash_matches',
);

if (sourceConflicts.length > 0) {
	renderSourcesSection(container, contrib, sourceConflicts, cb);
}

renderOkSection(container, contrib);

renderFooterStub(container, contrib, cb);

// ---

function renderSourcesSection(container, contrib, conflicts, cb): void {
	const section = container.createDiv({ cls: 'qc-icr-section qc-icr-section-sources qc-icr-section-error' });
	const head = section.createDiv({ cls: 'qc-icr-section-head' });
	head.createEl('h4', { text: '⚠ Sources com problemas' });
	head.createSpan({ cls: 'qc-icr-section-meta', text: `${conflicts.length} issues` });

	const body = section.createDiv({ cls: 'qc-icr-section-body' });

	for (const conf of conflicts) {
		const fileId = (conf as any).fileId ?? (conf as any).payloadFileId;
		const row = body.createDiv({ cls: 'qc-icr-source-row' });

		const desc = row.createDiv({ cls: 'qc-icr-source-desc' });
		if (conf.kind === 'source_hash_mismatch') {
			desc.setText(`${fileId} — hash mismatch (você editou esse arquivo depois)`);
		} else if (conf.kind === 'source_not_found') {
			desc.setText(`${fileId} — not found (arquivo não existe local)`);
		} else {
			desc.setText(`${fileId} — multiple hash matches (lookup ambíguo)`);
		}

		const actions = row.createDiv({ cls: 'qc-icr-source-actions' });

		if (conf.kind === 'source_hash_mismatch') {
			const trust = actions.createEl('button', { cls: 'qc-icr-button outline', text: 'Trust local (offsets podem desalinhar)' });
			trust.onclick = () => {
				const o = cloneOverrides(contrib.overrides);
				o.sourceOverrides.set(fileId, 'trust-local');
				cb.onOverridesChange(o);
			};
		}

		const skip = actions.createEl('button', { cls: 'qc-icr-button secondary', text: 'Skip source' });
		skip.onclick = () => {
			const o = cloneOverrides(contrib.overrides);
			o.sourceOverrides.set(fileId, 'skip-source');
			cb.onOverridesChange(o);
		};

		// Map manual: out of scope desta task — UI placeholder pra task futura
	}
}

function renderOkSection(container, contrib): void {
	const section = container.createDiv({ cls: 'qc-icr-section qc-icr-section-ok' });
	const head = section.createDiv({ cls: 'qc-icr-section-head' });
	head.createEl('h4', { text: '✓ Pronto pra importar' });
	head.createSpan({
		cls: 'qc-icr-section-meta',
		text: `${contrib.mergePreview.added.markers} markers · ${contrib.mergePreview.added.codes} codes · 0 conflitos`,
	});
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- overviewChip.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/contributions/overviewChip.ts tests/core/icr/contributions/overviewChip.test.ts
~/.claude/scripts/commit.sh "feat(icr): overviewChip — seções sources + ok inline"
```

---

### Task 4.4: Footer Apply usando `divergenceResolver`

**Files:**
- Modify: `src/core/icr/contributions/overviewChip.ts`
- Modify: `tests/core/icr/contributions/overviewChip.test.ts`

- [ ] **Step 1: Testes do footer**

```typescript
describe('overviewChip — footer Apply', () => {
	test('footer mostra "Apply (N_in markers — N_out ficam fora)" computado pelo divergenceResolver', () => {
		const container = document.createElement('div');
		const contrib = makeContrib({ addedMarkers: 200 });
		// Override: skip 50 markers via perCodeSkip
		contrib.overrides.perCodeSkip.add('c_skipped');
		// Adapta payload pra ter 50 markers em c_skipped
		contrib.payload.markers.markdown = { 'src': [
			...new Array(150).fill({ id: 'm', codes: [{ codeId: 'c_keep' }] }),
			...new Array(50).fill({ id: 'm2', codes: [{ codeId: 'c_skipped' }] }),
		] };
		renderOverviewChip(container, contrib, { onApply: vi.fn(), onDiscard: vi.fn(), onOverridesChange: vi.fn() });

		const apply = Array.from(container.querySelectorAll('button')).find(b => /apply/i.test(b.textContent ?? ''))!;
		expect(apply.textContent).toMatch(/150/); // N_in
		expect(apply.textContent).toMatch(/50/);  // N_out
	});

	test('subtitle "resolva os N_out pendentes" some quando N_out=0', () => {
		const container = document.createElement('div');
		renderOverviewChip(container, makeContrib({ addedMarkers: 200 }), { onApply: vi.fn(), onDiscard: vi.fn(), onOverridesChange: vi.fn() });
		expect(container.textContent).not.toMatch(/resolva os/i);
	});

	test('click Apply invoca onApply', () => {
		const container = document.createElement('div');
		const onApply = vi.fn();
		renderOverviewChip(container, makeContrib({ addedMarkers: 5 }), { onApply, onDiscard: vi.fn(), onOverridesChange: vi.fn() });
		const apply = Array.from(container.querySelectorAll('button')).find(b => /apply/i.test(b.textContent ?? '')) as HTMLElement;
		apply.click();
		expect(onApply).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run — falha (footer ainda é stub)**

Run: `npm test -- overviewChip.test.ts`
Expected: FAIL nos novos

- [ ] **Step 3: Substituir `renderFooterStub` por versão completa**

```typescript
// Em overviewChip.ts:
import { computeBreakdown } from './divergenceResolver';

function renderFooter(container: HTMLElement, contrib: PendingContribution, cb: OverviewChipCallbacks): void {
	const footer = container.createDiv({ cls: 'qc-icr-overview-footer' });
	const breakdown = computeBreakdown(contrib.mergePreview, contrib.overrides, contrib.payload);

	const apply = footer.createEl('button', { cls: 'qc-icr-button' });
	apply.setText(
		breakdown.N_out === 0
			? `Apply (${breakdown.N_in})`
			: `Apply (${breakdown.N_in} markers — ${breakdown.N_out} ficam fora)`
	);
	apply.onclick = cb.onApply;

	const discard = footer.createEl('button', { cls: 'qc-icr-button secondary', text: 'Discard contribution' });
	discard.onclick = cb.onDiscard;

	if (breakdown.N_out > 0) {
		const sub = footer.createDiv({ cls: 'qc-icr-overview-footer-sub' });
		sub.setText(`resolva os ${breakdown.N_out} pendentes acima ou pula eles`);
	}
}

// E substituir renderFooterStub por renderFooter na chamada
```

Remover `renderFooterStub`.

- [ ] **Step 4: Run tests**

Run: `npm test -- overviewChip.test.ts`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/contributions/overviewChip.ts tests/core/icr/contributions/overviewChip.test.ts
~/.claude/scripts/commit.sh "feat(icr): overviewChip footer — N_in/N_out via divergenceResolver"
```

---

### Task 4.5: Conectar overviewChip na view + Apply real

**Files:**
- Modify: `src/core/icr/contributions/unifiedIcrImportView.ts`

- [ ] **Step 1: Atualizar `renderMain` pra dispatch chip + implementar onApply**

```typescript
// Em UnifiedIcrImportView:
import { renderToolbarContent } from './importToolbar';
import { renderOverviewChip } from './overviewChip';
import { Notice } from 'obsidian';

private toolbarEl!: HTMLElement;
private bodyEl!: HTMLElement;

async onOpen(): Promise<void> {
	const root = this.contentEl;
	root.empty();
	root.addClass('qc-icr-import-view');

	this.railEl = root.createDiv({ cls: 'qc-icr-import-rail' });
	const mainCol = root.createDiv({ cls: 'qc-icr-import-main' });
	this.toolbarEl = mainCol.createDiv({ cls: 'qc-icr-import-toolbar' });
	this.bodyEl = mainCol.createDiv({ cls: 'qc-icr-import-body' });
	this.mainEl = mainCol; // backward-compat caso alguém use

	this.renderRail();
	this.renderMain();
	this.setupDropHandler();
}

private renderMain(): void {
	this.toolbarEl.empty();
	this.bodyEl.empty();

	const active = this.state.pending.find(c => c.id === this.state.activeId);
	if (!active) {
		const empty = this.bodyEl.createDiv({ cls: 'qc-icr-empty' });
		empty.setText('selecione uma contribuição na lista');
		return;
	}

	renderToolbarContent(this.toolbarEl, active, this.state.activeChip, (chip) => {
		this.updateState({ activeChip: chip });
	});

	if (this.state.activeChip === 'overview') {
		renderOverviewChip(this.bodyEl, active, {
			onApply: () => this.applyContribution(active),
			onDiscard: () => this.discardContribution(active.id),
			onOverridesChange: (overrides) => this.updateOverrides(active.id, overrides),
		});
	}
	// chips side-by-side e by-code vêm em chunks 5 e 6
}

private async updateOverrides(contribId: string, overrides: ResolutionOverrides): Promise<void> {
	const idx = this.state.pending.findIndex(c => c.id === contribId);
	if (idx === -1) return;
	const contrib = this.state.pending[idx];

	// Recompute mergePreview com novos overrides
	const newPreview = await mergeCoderContribution(
		this.plugin.dataManager.getDataRef(), // ajustar nome conforme main.ts
		contrib.payload,
		this.plugin.sourceHashRegistry, // ajustar nome
		{ dryRun: true, overrides },
	);

	const updated: PendingContribution = { ...contrib, overrides, mergePreview: newPreview };
	this.state.pending = this.state.pending.map((c, i) => i === idx ? updated : c);
	this.renderRail();
	this.renderMain();
}

private async applyContribution(contrib: PendingContribution): Promise<void> {
	const result = await mergeCoderContribution(
		this.plugin.dataManager.getDataRef(),
		contrib.payload,
		this.plugin.sourceHashRegistry,
		{ overrides: contrib.overrides }, // sem dryRun = mutação real
	);

	this.plugin.dataManager.markDirty(); // schedula auto-save (não há save() público — verificado dataManager.ts:75-101)

	new Notice(`ICR Import: ${result.added.markers} markers aplicados, ${result.pendingMarkers} skipped`);

	this.discardContribution(contrib.id);

	// Recompute previews das contribuições restantes (decisão spec §12 item 4)
	for (const remaining of this.state.pending) {
		const newPreview = await mergeCoderContribution(
			this.plugin.dataManager.getDataRef(),
			remaining.payload, // <-- payload da contribuição RESTANTE, não da just-applied
			this.plugin.sourceHashRegistry,
			{ dryRun: true, overrides: remaining.overrides },
		);
		remaining.mergePreview = newPreview;
	}
	this.renderRail();
	this.renderMain();
}

private discardContribution(id: string): void {
	this.state.pending = this.state.pending.filter(c => c.id !== id);
	if (this.state.activeId === id) {
		this.state.activeId = this.state.pending[0]?.id ?? null;
	}
	this.renderRail();
	this.renderMain();
}
```

**Confirmado:** APIs reais — `dataManager.getDataRef()` retorna `QualiaData` (não tem método `data` público); `dataManager.markDirty()` schedula auto-save (não há `save()` público); `sourceHashRegistry` exposto no plugin. Verificado em `src/core/dataManager.ts:75-101`.

- [ ] **Step 2: Verificar APIs reais**

Run: `grep -n "saveData\|dataManager\|this.data\|sourceHashRegistry" src/main.ts | head -15`

Ajustar se nomes diferentes.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Build + smoke (Obsidian real)**

1. `npm run build`
2. Wiring final só em chunk 7 — ainda não dá pra abrir a view via UI. Mas tem que confirmar que NÃO quebra: reload Obsidian, plugin ativa, Notice "Plugin loaded" aparece (ou similar pattern existente).

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/contributions/unifiedIcrImportView.ts
~/.claude/scripts/commit.sh "feat(icr): conectar Visão geral + Apply real + recompute previews da rail"
```

**Chunk 4 done quando:** `npm test` verde, build verde, view module compila com chip overview funcional. Smoke completo só em chunk 7 (precisa do wiring).

---

## Chunk 5 — Lado a lado chip

**Goal:** Renderiza marker da contribuição com seus dados (texto + code + memo) lado a lado com markers locais que sobrepõem (computed via overlap predicate). Botões Accept/Skip (per marker), navegação ←/→. Filter chips secundários: todos / só sobrepondo / só novos.

### Task 5.1: Helper `findOverlappingLocalMarkers` (puro)

**Files:**
- Create: `src/core/icr/contributions/overlapHelper.ts`
- Create: `tests/core/icr/contributions/overlapHelper.test.ts`

- [ ] **Step 1: Verificar tipos dos markers**

Run: `grep -n "export interface\|export type" src/markdown/models/codeMarkerModel.ts src/pdf/pdfCodingTypes.ts src/csv/csvCodingTypes.ts | head -20`

Anotar shapes reais. Esperado:
- `Marker` (markdown) tem `range: { from: {line, ch}, to: {line, ch} }`
- `PdfMarker` tem `beginIndex`, `endIndex`, `pageIndex`, `text`
- `SegmentMarker` tem `sourceRowId`, `column`, `from`, `to`

(Verificar — se diferentes, ajustar os usos abaixo.)

- [ ] **Step 2: Testes**

```typescript
// tests/core/icr/contributions/overlapHelper.test.ts
import { describe, expect, test } from 'vitest';
import { findOverlappingLocalMarkers } from '../../../../src/core/icr/contributions/overlapHelper';

describe('findOverlappingLocalMarkers (markdown)', () => {
	test('mesmo fileId + ranges sobrepondo → retorna match', () => {
		const incoming = { id: 'i1', fileId: 'f1', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 50 } } };
		const local = [
			{ id: 'l1', fileId: 'f1', range: { from: { line: 0, ch: 30 }, to: { line: 0, ch: 80 } } },
			{ id: 'l2', fileId: 'f1', range: { from: { line: 1, ch: 0 }, to: { line: 1, ch: 20 } } },
		];
		const sourceText = 'a'.repeat(200); // dummy — extractMarkdownRange precisa
		const result = findOverlappingLocalMarkers('markdown', incoming, local, sourceText);
		expect(result.map(m => m.id)).toContain('l1');
		expect(result.map(m => m.id)).not.toContain('l2');
	});

	test('fileId diferente → sem match', () => {
		const incoming = { id: 'i1', fileId: 'f1', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 50 } } };
		const local = [{ id: 'l1', fileId: 'f2', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 50 } } }];
		const result = findOverlappingLocalMarkers('markdown', incoming, local, 'aaaaa');
		expect(result.length).toBe(0);
	});

	test('PDF: mesmo fileId + range overlap → match', () => {
		// PdfMarker shape (verificado pdfCodingTypes.ts:23-24): { fileId, page: number, beginIndex, endIndex, text, ... }
		const incoming = { id: 'i1', fileId: 'f1', beginIndex: 100, endIndex: 200, page: 0, text: 't' } as any;
		const local = [{ id: 'l1', fileId: 'f1', beginIndex: 150, endIndex: 250, page: 0, text: 't' } as any];
		const result = findOverlappingLocalMarkers('pdf', incoming, local);
		expect(result.length).toBe(1);
	});

	test('CSV segment: mesmo row+col + char range overlap → match', () => {
		// SegmentMarker shape (verificado csvCodingTypes.ts:6-13): { fileId, sourceRowId: number, column: string, from, to, ... }
		const incoming = { id: 'i1', fileId: 'f1', sourceRowId: 1, column: 'c1', from: 0, to: 50 } as any;
		const local = [
			{ id: 'l1', fileId: 'f1', sourceRowId: 1, column: 'c1', from: 30, to: 80 } as any,
			{ id: 'l2', fileId: 'f1', sourceRowId: 1, column: 'c2', from: 0, to: 50 } as any, // col diferente
		];
		const result = findOverlappingLocalMarkers('csvSegment', incoming, local);
		expect(result.map(m => m.id)).toEqual(['l1']);
	});
});
```

- [ ] **Step 3: Run — falha**

Run: `npm test -- overlapHelper.test.ts`
Expected: FAIL

- [ ] **Step 4: Implementar via `extract*Range` + `computeOverlap`**

```typescript
// src/core/icr/contributions/overlapHelper.ts
/**
 * findOverlappingLocalMarkers — dado um marker incoming + lista de locals,
 * retorna locals que sobrepõem espacialmente. Usa helpers existentes do kappa motor.
 *
 * Engine cobertos: markdown, pdf, csvSegment (alinhado com PayloadV1).
 */

import { extractMarkdownRange, extractPdfRange, extractCsvSegmentRange } from '../textRange';
import { computeOverlap } from '../overlap';
import type { Marker } from '../../../markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../../pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../../csv/csvCodingTypes';

export type EngineForOverlap = 'markdown' | 'pdf' | 'csvSegment';

export function findOverlappingLocalMarkers<M extends Marker | PdfMarker | SegmentMarker>(
	engine: EngineForOverlap,
	incoming: M,
	local: M[],
	sourceText?: string,
): M[] {
	const incRange = extractRange(engine, incoming, sourceText);
	if (!incRange) return [];

	const matches: M[] = [];
	for (const l of local) {
		if ((l as any).fileId !== (incoming as any).fileId) continue;
		const lRange = extractRange(engine, l, sourceText);
		if (!lRange) continue;
		if (lRange.locator !== incRange.locator) continue; // mesmo locator (page/row/col)
		if (computeOverlap(incRange, lRange) !== null) {
			matches.push(l);
		}
	}
	return matches;
}

function extractRange(engine: EngineForOverlap, marker: any, sourceText?: string) {
	if (engine === 'markdown') {
		if (!sourceText) return null;
		return extractMarkdownRange(marker, sourceText);
	}
	if (engine === 'pdf') return extractPdfRange(marker);
	if (engine === 'csvSegment') return extractCsvSegmentRange(marker);
	return null;
}
```

**Nota:** se `Marker` não bater com o expected, ajustar o cast / extração. Verificar com `grep -n "extractMarkdownRange" src/core/icr/textRange.ts` pra confirmar assinatura.

- [ ] **Step 5: Run tests**

Run: `npm test -- overlapHelper.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 6: Commit**

```bash
git add src/core/icr/contributions/overlapHelper.ts tests/core/icr/contributions/overlapHelper.test.ts
~/.claude/scripts/commit.sh "feat(icr): findOverlappingLocalMarkers — predicate per engine via extract*Range + computeOverlap"
```

---

### Task 5.2: `sideBySideChip.ts` — render marker card + accept/skip

**Files:**
- Create: `src/core/icr/contributions/sideBySideChip.ts`
- Create: `tests/core/icr/contributions/sideBySideChip.test.ts`

- [ ] **Step 1: Testes do render**

```typescript
// tests/core/icr/contributions/sideBySideChip.test.ts
import { describe, expect, test, vi } from 'vitest';
import { renderSideBySideChip } from '../../../../src/core/icr/contributions/sideBySideChip';
import { createEmptyOverrides, type PendingContribution } from '../../../../src/core/icr/contributions/contributionViewTypes';

function makeContribWithMarkers(count: number): PendingContribution {
	const markers = Array.from({ length: count }, (_, i) => ({
		id: `m${i}`,
		fileId: 'src_a',
		range: { from: { line: 0, ch: i * 10 }, to: { line: 0, ch: i * 10 + 5 } },
		text: `marker ${i}`,
		codes: [{ codeId: 'c_test' }],
	}));
	return {
		id: 'contrib1',
		payload: {
			version: '1.0', codebookVersion: '', exportedAt: 0,
			coder: { id: 'h:1', name: 'Carla', type: 'human', createdAt: 0 },
			sources: { 'src_a': { hash: 'h' } },
			codes: [{ id: 'c_test', name: 'TEST', color: '#fff', paletteIndex: 0, createdAt: 0 }] as any,
			markers: { markdown: { 'src_a': markers as any }, pdf: [], csvSegment: [] },
		},
		sourcePath: '',
		mergePreview: { added: { markers: count, codes: 1, groups: 0, coder: false }, conflicts: [], warnings: [], fileIdRemap: { 'src_a': 'src_a' }, pendingMarkers: 0 },
		overrides: createEmptyOverrides(),
	};
}

describe('renderSideBySideChip', () => {
	test('renderiza marker card com texto + code + accept/skip buttons', () => {
		const container = document.createElement('div');
		const contrib = makeContribWithMarkers(5);
		renderSideBySideChip(container, contrib, { localMarkersByFileId: {} }, { onSkipMarker: vi.fn(), onNavigate: vi.fn(), filter: 'all', currentIndex: 0, onFilterChange: vi.fn() });

		expect(container.querySelector('.qc-icr-marker-card')).toBeTruthy();
		expect(container.textContent).toMatch(/marker 0/);
		expect(container.textContent).toMatch(/TEST/);
		const buttons = container.querySelectorAll('button');
		expect(Array.from(buttons).some(b => /accept/i.test(b.textContent ?? ''))).toBe(true);
		expect(Array.from(buttons).some(b => /skip/i.test(b.textContent ?? ''))).toBe(true);
	});

	test('header mostra "marker 1/5"', () => {
		const container = document.createElement('div');
		renderSideBySideChip(container, makeContribWithMarkers(5), { localMarkersByFileId: {} }, { onSkipMarker: vi.fn(), onNavigate: vi.fn(), filter: 'all', currentIndex: 0, onFilterChange: vi.fn() });
		expect(container.textContent).toMatch(/marker 1\/5/);
	});

	test('click Skip invoca onSkipMarker(markerId)', () => {
		const container = document.createElement('div');
		const onSkipMarker = vi.fn();
		renderSideBySideChip(container, makeContribWithMarkers(3), { localMarkersByFileId: {} }, { onSkipMarker, onNavigate: vi.fn(), filter: 'all', currentIndex: 1, onFilterChange: vi.fn() });
		const skipBtn = Array.from(container.querySelectorAll('button')).find(b => /skip/i.test(b.textContent ?? '')) as HTMLElement;
		skipBtn.click();
		expect(onSkipMarker).toHaveBeenCalledWith('m1');
	});

	test('renderiza local markers que sobrepõem (cell direito)', () => {
		const container = document.createElement('div');
		const contrib = makeContribWithMarkers(1);
		const localMarkers = {
			'src_a': [{ id: 'l_local', fileId: 'src_a', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 8 } }, text: '...', codes: [{ codeId: 'c_test' }] } as any],
		};
		renderSideBySideChip(container, contrib, { localMarkersByFileId: localMarkers, sourceText: 'a'.repeat(100) }, { onSkipMarker: vi.fn(), onNavigate: vi.fn(), filter: 'all', currentIndex: 0, onFilterChange: vi.fn() });

		const local = container.querySelector('.qc-icr-marker-side-local');
		expect(local).toBeTruthy();
		// Tem marker local sobrepondo
		expect(local!.textContent).not.toMatch(/sem marker/i);
	});

	test('filter chips: todos / só sobrepondo / só novos', () => {
		const container = document.createElement('div');
		renderSideBySideChip(container, makeContribWithMarkers(3), { localMarkersByFileId: {} }, { onSkipMarker: vi.fn(), onNavigate: vi.fn(), filter: 'all', currentIndex: 0, onFilterChange: vi.fn() });
		const filterChips = container.querySelectorAll('.qc-icr-filter-chip');
		expect(filterChips.length).toBe(3);
	});
});
```

- [ ] **Step 2: Run — falha**

Run: `npm test -- sideBySideChip.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/core/icr/contributions/sideBySideChip.ts
/**
 * Lado a lado chip — marker-by-marker da contribuição com locals sobrepondo.
 * Filter: todos / só sobrepondo / só novos. Accept (noop) / Skip (perMarkerSkip).
 * Navegação ←/→ via callback.
 */

import type { PendingContribution } from './contributionViewTypes';
import { findOverlappingLocalMarkers, type EngineForOverlap } from './overlapHelper';

export type SideBySideFilter = 'all' | 'overlapping' | 'new';

export interface SideBySideContext {
	/** Markers locais por fileId (resolvido após remap). View extrai do plugin. */
	localMarkersByFileId: Record<string, any[]>;
	/** Source text pra markdown overlap (opcional, view busca via vault). */
	sourceText?: string;
}

export interface SideBySideCallbacks {
	currentIndex: number;
	filter: SideBySideFilter;
	/** Quando setado, restringe markers àqueles que contenham esse codeId. */
	filterCodeId: string | null;
	onSkipMarker: (markerId: string) => void;
	onNavigate: (delta: number) => void; // -1, +1
	onFilterChange: (f: SideBySideFilter) => void;
	onClearCodeFilter: () => void;
}

interface FlatMarker {
	engine: EngineForOverlap;
	marker: any; // Marker | PdfMarker | SegmentMarker
	fileId: string;
}

export function renderSideBySideChip(
	container: HTMLElement,
	contrib: PendingContribution,
	ctx: SideBySideContext,
	cb: SideBySideCallbacks,
): void {
	container.empty?.() ?? (container.innerHTML = '');

	// Flatten markers da contribuição (3 engines em ordem)
	const all = flattenMarkers(contrib);

	// Aplica filter (overlap + codeId)
	let filtered = filterMarkers(all, ctx, cb.filter);
	if (cb.filterCodeId) {
		filtered = filtered.filter(fm => (fm.marker as any).codes?.some((c: any) => c.codeId === cb.filterCodeId));
	}

	// Filter chips toolbar
	const filterRow = container.createDiv({ cls: 'qc-icr-filter-row' });
	for (const f of ['all', 'overlapping', 'new'] as SideBySideFilter[]) {
		const chip = filterRow.createSpan({
			cls: `qc-icr-filter-chip ${f === cb.filter ? 'is-active' : ''}`,
			text: filterLabel(f),
		});
		chip.onclick = () => cb.onFilterChange(f);
	}
	// Code filter pill (visível quando setado)
	if (cb.filterCodeId) {
		const pill = filterRow.createSpan({ cls: 'qc-icr-filter-pill', text: `code: ${cb.filterCodeId} ✕` });
		pill.onclick = () => cb.onClearCodeFilter();
	}

	if (filtered.length === 0) {
		const empty = container.createDiv({ cls: 'qc-icr-empty' });
		empty.setText('nenhum marker bate com esse filter');
		return;
	}

	const safeIdx = Math.min(cb.currentIndex, filtered.length - 1);
	const current = filtered[safeIdx];

	// Header: "marker N/total · ⌨ ←/→"
	const header = container.createDiv({ cls: 'qc-icr-marker-header' });
	header.setText(`marker ${safeIdx + 1}/${filtered.length} · ⌨ ←/→ navega · source ${current.fileId}`);

	// Card
	const card = container.createDiv({ cls: 'qc-icr-marker-card' });
	const text = card.createDiv({ cls: 'qc-icr-marker-text' });
	text.setText((current.marker as any).text ?? '(sem texto preview)');

	const side = card.createDiv({ cls: 'qc-icr-marker-side' });
	const localCell = side.createDiv({ cls: 'qc-icr-marker-side-local' });
	localCell.createEl('h6', { text: 'Local (você)' });
	const localOverlapping = findOverlappingLocalMarkers(
		current.engine,
		current.marker,
		ctx.localMarkersByFileId[current.fileId] ?? [],
		ctx.sourceText,
	);
	if (localOverlapping.length === 0) {
		const empty = localCell.createSpan({ cls: 'qc-icr-code-tag absent' });
		empty.setText('— sem marker —');
	} else {
		for (const l of localOverlapping) {
			for (const c of (l as any).codes ?? []) {
				const tag = localCell.createSpan({ cls: 'qc-icr-code-tag' });
				tag.setText(resolveCodeName(c.codeId, contrib));
			}
		}
	}

	const incomingCell = side.createDiv({ cls: 'qc-icr-marker-side-incoming' });
	incomingCell.createEl('h6', { text: contrib.payload.coder.name });
	for (const c of (current.marker as any).codes ?? []) {
		const tag = incomingCell.createSpan({ cls: 'qc-icr-code-tag theirs' });
		tag.setText(resolveCodeName(c.codeId, contrib));
	}
	if ((current.marker as any).memo) {
		const memo = incomingCell.createDiv({ cls: 'qc-icr-marker-memo' });
		memo.setText(`memo: "${(current.marker as any).memo}"`);
	}

	// Actions
	const actions = card.createDiv({ cls: 'qc-icr-marker-actions' });
	const accept = actions.createEl('button', { cls: 'qc-icr-button', text: `Accept (mantém ${contrib.payload.coder.name})` });
	accept.onclick = () => cb.onNavigate(+1);
	const skip = actions.createEl('button', { cls: 'qc-icr-button secondary', text: 'Skip (não importa esse)' });
	skip.onclick = () => {
		cb.onSkipMarker(current.marker.id);
		cb.onNavigate(+1);
	};
}

function flattenMarkers(contrib: PendingContribution): FlatMarker[] {
	const out: FlatMarker[] = [];
	for (const [fid, markers] of Object.entries(contrib.payload.markers.markdown)) {
		for (const m of markers) out.push({ engine: 'markdown', marker: m, fileId: fid });
	}
	for (const m of contrib.payload.markers.pdf) out.push({ engine: 'pdf', marker: m, fileId: m.fileId });
	for (const m of contrib.payload.markers.csvSegment) out.push({ engine: 'csvSegment', marker: m, fileId: m.fileId });
	return out;
}

function filterMarkers(all: FlatMarker[], ctx: SideBySideContext, filter: SideBySideFilter): FlatMarker[] {
	if (filter === 'all') return all;
	return all.filter(fm => {
		const overlapping = findOverlappingLocalMarkers(fm.engine, fm.marker, ctx.localMarkersByFileId[fm.fileId] ?? [], ctx.sourceText);
		const hasOverlap = overlapping.length > 0;
		return filter === 'overlapping' ? hasOverlap : !hasOverlap;
	});
}

function filterLabel(f: SideBySideFilter): string {
	return { all: 'todos', overlapping: 'só sobrepondo local', new: 'só novos' }[f];
}

function resolveCodeName(codeId: string, contrib: PendingContribution): string {
	return contrib.payload.codes.find(c => c.id === codeId)?.name ?? codeId;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- sideBySideChip.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/contributions/sideBySideChip.ts tests/core/icr/contributions/sideBySideChip.test.ts
~/.claude/scripts/commit.sh "feat(icr): sideBySideChip — marker-by-marker render com filter + accept/skip"
```

---

### Task 5.3: Conectar sideBySideChip na view + navegação keyboard

**Files:**
- Modify: `src/core/icr/contributions/unifiedIcrImportView.ts`

- [ ] **Step 1: Estender state com `sideBySideIndex` + `sideBySideFilter`**

Em `contributionViewTypes.ts`:

```typescript
import type { SideBySideFilter } from './sideBySideChip';

export interface IcrImportViewState {
	pending: PendingContribution[];
	activeId: string | null;
	activeChip: ChipId;
	sideBySideIndex: number;
	sideBySideFilter: SideBySideFilter;
	/** Filter additional: quando user clica "Revisar 1-a-1 →" no chip Por código,
	 * grava codeId aqui pra restringir markers do side-by-side. null = sem filter. */
	sideBySideFilterCodeId: string | null;
}

export function createDefaultViewState(): IcrImportViewState {
	return {
		pending: [],
		activeId: null,
		activeChip: 'overview',
		sideBySideIndex: 0,
		sideBySideFilter: 'all',
		sideBySideFilterCodeId: null,
	};
}
```

- [ ] **Step 2: Adicionar render do chip e navegação keyboard**

```typescript
// Em UnifiedIcrImportView.renderMain(), após overview:

import { renderSideBySideChip } from './sideBySideChip';

if (this.state.activeChip === 'side-by-side') {
	const localMarkersByFileId = this.collectLocalMarkers(active);
	renderSideBySideChip(this.bodyEl, active, { localMarkersByFileId }, {
		currentIndex: this.state.sideBySideIndex,
		filter: this.state.sideBySideFilter,
		filterCodeId: this.state.sideBySideFilterCodeId,
		onSkipMarker: (markerId) => {
			const updated = cloneOverrides(active.overrides);
			updated.perMarkerSkip.add(markerId);
			this.updateOverrides(active.id, updated);
		},
		onNavigate: (delta) => {
			this.updateState({ sideBySideIndex: Math.max(0, this.state.sideBySideIndex + delta) });
		},
		onFilterChange: (f) => {
			this.updateState({ sideBySideFilter: f, sideBySideIndex: 0 });
		},
		onClearCodeFilter: () => {
			this.updateState({ sideBySideFilterCodeId: null, sideBySideIndex: 0 });
		},
	});
}

private collectLocalMarkers(contrib: PendingContribution): Record<string, any[]> {
	// Pega markers locais (de TODOS coders) por fileId após remap
	const out: Record<string, any[]> = {};
	const data = this.plugin.dataManager.getDataRef();
	for (const [payloadFid, localFid] of Object.entries(contrib.mergePreview.fileIdRemap)) {
		out[payloadFid] = [];
		// markdown
		const mdMarkers = data.markdown.markers[localFid] ?? [];
		out[payloadFid].push(...mdMarkers);
		// pdf
		out[payloadFid].push(...data.pdf.markers.filter((m: any) => m.fileId === localFid));
		// csvSegment
		out[payloadFid].push(...data.csv.segmentMarkers.filter((m: any) => m.fileId === localFid));
	}
	return out;
}

/**
 * Markdown overlap degradation note:
 * `extractMarkdownRange` precisa de sourceText (vault read) — fetch async impacta render.
 * Pra primeira versão, NÃO passa sourceText pro chip (sideBySide passa undefined).
 * Resultado: markdown overlap retorna [] (degraded — filter "só sobrepondo" não captura
 * markdown). Filter "todos" e "só novos" funcionam (novos = sem overlap = todos os
 * markdown). PDF + CSV overlap funcionam normalmente (helpers são puros).
 *
 * Refactor pra fetch sourceText fica como follow-up (#XX no BACKLOG quando o plan virar
 * commit final).
 */
```

E em `onOpen()`, após setup:

```typescript
this.registerDomEvent(this.contentEl, 'keydown', (e: KeyboardEvent) => {
	if (this.state.activeChip !== 'side-by-side') return;
	if (e.key === 'ArrowLeft') {
		this.updateState({ sideBySideIndex: Math.max(0, this.state.sideBySideIndex - 1) });
		e.preventDefault();
	} else if (e.key === 'ArrowRight') {
		this.updateState({ sideBySideIndex: this.state.sideBySideIndex + 1 });
		e.preventDefault();
	}
});
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Build + smoke (Obsidian real)**

`npm run build` — verificar 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/contributions/unifiedIcrImportView.ts src/core/icr/contributions/contributionViewTypes.ts
~/.claude/scripts/commit.sh "feat(icr): conectar Lado a lado chip + navegação ←/→ + filter chips"
```

**Chunk 5 done quando:** `npm test` verde, build verde, chip Lado a lado renderiza marker isolado quando view abrir.

---

## Chunk 6 — Por código chip

**Goal:** Agrupa markers da contribuição por code, mostra contagens (Carla N · você M · overlap O), botões batch (Accept all / Skip all / Revisar 1-a-1 →). Implementa regra "Skip all em code novo → também skipa code definition do codebook" (spec §6).

### Task 6.1: `byCodeChip.ts` — agrupamento + render

**Files:**
- Create: `src/core/icr/contributions/byCodeChip.ts`
- Create: `tests/core/icr/contributions/byCodeChip.test.ts`

- [ ] **Step 1: Testes**

```typescript
// tests/core/icr/contributions/byCodeChip.test.ts
import { describe, expect, test, vi } from 'vitest';
import { renderByCodeChip, groupMarkersByCode } from '../../../../src/core/icr/contributions/byCodeChip';
import { createEmptyOverrides, type PendingContribution } from '../../../../src/core/icr/contributions/contributionViewTypes';

function makeContrib(markersByCode: Record<string, number>): PendingContribution {
	const allMarkers: any[] = [];
	let i = 0;
	for (const [codeId, count] of Object.entries(markersByCode)) {
		for (let j = 0; j < count; j++) {
			allMarkers.push({ id: `m${i++}`, fileId: 'src', codes: [{ codeId }] });
		}
	}
	return {
		id: 'c1',
		payload: {
			version: '1.0', codebookVersion: '', exportedAt: 0,
			coder: { id: 'h:1', name: 'Carla', type: 'human', createdAt: 0 },
			sources: {},
			codes: Object.keys(markersByCode).map(id => ({ id, name: id.toUpperCase(), color: '#fff', paletteIndex: 0, createdAt: 0 } as any)),
			markers: { markdown: { 'src': allMarkers }, pdf: [], csvSegment: [] },
		},
		sourcePath: '',
		mergePreview: { added: { markers: allMarkers.length, codes: 0, groups: 0, coder: false }, conflicts: [], warnings: [], fileIdRemap: { 'src': 'src' }, pendingMarkers: 0 },
		overrides: createEmptyOverrides(),
	};
}

describe('groupMarkersByCode', () => {
	test('agrupa markers por codeId, ordena desc por count', () => {
		const contrib = makeContrib({ 'c1': 47, 'c2': 18, 'c3': 23 });
		const groups = groupMarkersByCode(contrib);
		expect(groups.map(g => g.codeId)).toEqual(['c1', 'c3', 'c2']); // 47, 23, 18
		expect(groups.find(g => g.codeId === 'c1')!.incomingCount).toBe(47);
	});

	test('marker sem codes (codes: []) não aparece em group nenhum', () => {
		const contrib = makeContrib({});
		contrib.payload.markers.markdown = { 'src': [{ id: 'm0', fileId: 'src', codes: [] } as any] };
		const groups = groupMarkersByCode(contrib);
		expect(groups.length).toBe(0);
	});
});

describe('renderByCodeChip', () => {
	test('renderiza um bloco por code com count', () => {
		const container = document.createElement('div');
		renderByCodeChip(container, makeContrib({ 'c1': 47, 'c2': 18 }), { localCountByCode: {}, overlapCountByCode: {} }, { onSkipAllCode: vi.fn(), onRevise: vi.fn(), onAcceptAllCode: vi.fn() });

		const blocks = container.querySelectorAll('.qc-icr-code-block');
		expect(blocks.length).toBe(2);
	});

	test('header mostra "<NAME> · Carla aplicou Nx · você Mx · overlap O"', () => {
		const container = document.createElement('div');
		renderByCodeChip(container, makeContrib({ 'c1': 47 }), { localCountByCode: { 'c1': 12 }, overlapCountByCode: { 'c1': 8 } }, { onSkipAllCode: vi.fn(), onRevise: vi.fn(), onAcceptAllCode: vi.fn() });

		const header = container.querySelector('.qc-icr-code-block-header');
		expect(header?.textContent).toMatch(/Carla.*47/i);
		expect(header?.textContent).toMatch(/você.*12/i);
		expect(header?.textContent).toMatch(/overlap.*8/i);
	});

	test('code novo (você 0x) marcado', () => {
		const container = document.createElement('div');
		renderByCodeChip(container, makeContrib({ 'c_new': 23 }), { localCountByCode: {}, overlapCountByCode: {} }, { onSkipAllCode: vi.fn(), onRevise: vi.fn(), onAcceptAllCode: vi.fn() });
		const block = container.querySelector('.qc-icr-code-block');
		expect(block?.textContent).toMatch(/novo/i);
	});

	test('click "Skip all" invoca onSkipAllCode(codeId)', () => {
		const container = document.createElement('div');
		const onSkipAllCode = vi.fn();
		renderByCodeChip(container, makeContrib({ 'c1': 5 }), { localCountByCode: {}, overlapCountByCode: {} }, { onSkipAllCode, onRevise: vi.fn(), onAcceptAllCode: vi.fn() });
		const skipBtn = Array.from(container.querySelectorAll('button')).find(b => /skip all/i.test(b.textContent ?? '')) as HTMLElement;
		skipBtn.click();
		expect(onSkipAllCode).toHaveBeenCalledWith('c1');
	});

	test('click "Revisar 1-a-1" invoca onRevise(codeId)', () => {
		const container = document.createElement('div');
		const onRevise = vi.fn();
		renderByCodeChip(container, makeContrib({ 'c1': 5 }), { localCountByCode: {}, overlapCountByCode: {} }, { onSkipAllCode: vi.fn(), onRevise, onAcceptAllCode: vi.fn() });
		const reviseBtn = Array.from(container.querySelectorAll('button')).find(b => /revisar/i.test(b.textContent ?? '')) as HTMLElement;
		reviseBtn.click();
		expect(onRevise).toHaveBeenCalledWith('c1');
	});
});
```

- [ ] **Step 2: Run — falha**

Run: `npm test -- byCodeChip.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/core/icr/contributions/byCodeChip.ts
/**
 * Por código chip — agrupa markers da contribuição por codeId, ordena por count desc.
 * Batch actions: Accept all (noop), Skip all (perCodeSkip + skip code def se novo),
 * Revisar 1-a-1 → (muda chip pra side-by-side filtrado).
 */

import type { PendingContribution } from './contributionViewTypes';

export interface ByCodeContext {
	/** Count de markers locais por codeId (de qualquer coder local). */
	localCountByCode: Record<string, number>;
	/** Count de markers que sobrepõem entre incoming e local pra esse code. */
	overlapCountByCode: Record<string, number>;
}

export interface ByCodeCallbacks {
	onAcceptAllCode: (codeId: string) => void; // noop semântico, mas pode usar pra clear skip
	onSkipAllCode: (codeId: string) => void;
	onRevise: (codeId: string) => void; // muda chip + filtra side-by-side
}

export interface CodeGroup {
	codeId: string;
	codeName: string;
	incomingCount: number;
	isNew: boolean;
}

export function groupMarkersByCode(contrib: PendingContribution): CodeGroup[] {
	const counts = new Map<string, number>();
	for (const markers of Object.values(contrib.payload.markers.markdown)) {
		for (const m of markers) {
			for (const c of (m as any).codes ?? []) {
				counts.set(c.codeId, (counts.get(c.codeId) ?? 0) + 1);
			}
		}
	}
	for (const m of contrib.payload.markers.pdf) {
		for (const c of (m as any).codes ?? []) {
			counts.set(c.codeId, (counts.get(c.codeId) ?? 0) + 1);
		}
	}
	for (const m of contrib.payload.markers.csvSegment) {
		for (const c of (m as any).codes ?? []) {
			counts.set(c.codeId, (counts.get(c.codeId) ?? 0) + 1);
		}
	}

	const groups: CodeGroup[] = [];
	for (const [codeId, count] of counts) {
		const codeDef = contrib.payload.codes.find(c => c.id === codeId);
		groups.push({
			codeId,
			codeName: codeDef?.name ?? codeId,
			incomingCount: count,
			isNew: false, // marcado pelo caller via context (localCountByCode === 0)
		});
	}

	return groups.sort((a, b) => b.incomingCount - a.incomingCount);
}

export function renderByCodeChip(
	container: HTMLElement,
	contrib: PendingContribution,
	ctx: ByCodeContext,
	cb: ByCodeCallbacks,
): void {
	container.empty?.() ?? (container.innerHTML = '');

	const groups = groupMarkersByCode(contrib);

	if (groups.length === 0) {
		const empty = container.createDiv({ cls: 'qc-icr-empty' });
		empty.setText('contribuição sem markers');
		return;
	}

	for (const g of groups) {
		const block = container.createDiv({ cls: 'qc-icr-code-block' });
		const localCount = ctx.localCountByCode[g.codeId] ?? 0;
		const overlap = ctx.overlapCountByCode[g.codeId] ?? 0;
		const isNew = localCount === 0;

		const header = block.createDiv({ cls: 'qc-icr-code-block-header' });
		const headerParts = [
			g.codeName,
			`${contrib.payload.coder.name} aplicou ${g.incomingCount}x`,
			`você ${localCount}x`,
			`overlap ${overlap}`,
		];
		if (isNew) headerParts.push('· novo');
		header.setText(headerParts.join(' · '));

		const body = block.createDiv({ cls: 'qc-icr-code-block-body' });
		const desc = body.createDiv();
		const onlyTheirs = g.incomingCount - overlap;
		desc.setText(
			isNew
				? `Código ${g.codeName} é novo (você nunca marcou). ${g.incomingCount} markers de ${contrib.payload.coder.name}.`
				: `${g.incomingCount} markers de ${contrib.payload.coder.name} (${overlap} que você também marcou, ${onlyTheirs} só dele).`,
		);

		const actions = body.createDiv({ cls: 'qc-icr-code-block-actions' });
		const accept = actions.createEl('button', { cls: 'qc-icr-button', text: `Accept all ${g.incomingCount}` });
		accept.onclick = () => cb.onAcceptAllCode(g.codeId);
		const skip = actions.createEl('button', { cls: 'qc-icr-button secondary', text: 'Skip all' });
		skip.onclick = () => cb.onSkipAllCode(g.codeId);
		const revise = actions.createEl('button', { cls: 'qc-icr-button secondary', text: 'Revisar 1-a-1 →' });
		revise.onclick = () => cb.onRevise(g.codeId);
	}
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- byCodeChip.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/icr/contributions/byCodeChip.ts tests/core/icr/contributions/byCodeChip.test.ts
~/.claude/scripts/commit.sh "feat(icr): byCodeChip — agrupa markers por code + batch actions (Accept/Skip/Revisar)"
```

---

### Task 6.2: Conectar byCodeChip + regra Skip-all-em-code-novo

**Files:**
- Modify: `src/core/icr/contributions/unifiedIcrImportView.ts`

- [ ] **Step 1: Atualizar `renderMain` pra dispatch by-code**

```typescript
// Em UnifiedIcrImportView.renderMain():
import { renderByCodeChip } from './byCodeChip';

if (this.state.activeChip === 'by-code') {
	const ctx = this.collectByCodeContext(active);
	renderByCodeChip(this.bodyEl, active, ctx, {
		onAcceptAllCode: (codeId) => {
			// Remove do perCodeSkip se estava (toggle accept)
			const o = cloneOverrides(active.overrides);
			o.perCodeSkip.delete(codeId);
			o.codebookOverrides.delete(codeId);
			this.updateOverrides(active.id, o);
		},
		onSkipAllCode: (codeId) => {
			const o = cloneOverrides(active.overrides);
			o.perCodeSkip.add(codeId);

			// Spec §6: se code é novo (não existe local), também skipa do codebook
			const localCounts = this.collectByCodeContext(active).localCountByCode;
			const isNew = (localCounts[codeId] ?? 0) === 0;
			if (isNew) {
				o.codebookOverrides.set(codeId, 'skip');
			}
			this.updateOverrides(active.id, o);
		},
		onRevise: (codeId) => {
			// Muda chip pra side-by-side filtrado pelo codeId (spec §6 cravado)
			this.updateState({
				activeChip: 'side-by-side',
				sideBySideIndex: 0,
				sideBySideFilterCodeId: codeId,
			});
		},
	});
}

private collectByCodeContext(contrib: PendingContribution): ByCodeContext {
	const localCountByCode: Record<string, number> = {};
	const overlapCountByCode: Record<string, number> = {};

	const data = this.plugin.dataManager.getDataRef(); // ajustar
	const allLocalMarkers = [
		...Object.values(data.markdown?.markers ?? {}).flat(),
		...(data.pdf?.markers ?? []),
		...(data.csv?.segmentMarkers ?? []),
	];

	for (const m of allLocalMarkers) {
		for (const c of (m as any).codes ?? []) {
			localCountByCode[c.codeId] = (localCountByCode[c.codeId] ?? 0) + 1;
		}
	}

	// Overlap: aproximação por codeId compartilhado (não usa range overlap pra evitar
	// async fetch de sourceText markdown). Por código chip mostra "overlap N" como
	// indicador qualitativo — refinement pra range overlap exato fica pra follow-up.
	for (const [codeId, localCount] of Object.entries(localCountByCode)) {
		const incomingForCode = countIncomingMarkersWithCode(contrib, codeId);
		if (incomingForCode > 0) {
			overlapCountByCode[codeId] = Math.min(localCount, incomingForCode);
		}
	}

	return { localCountByCode, overlapCountByCode };
}

function countIncomingMarkersWithCode(contrib: PendingContribution, codeId: string): number {
	let n = 0;
	for (const ms of Object.values(contrib.payload.markers.markdown)) {
		n += ms.filter((m: any) => m.codes?.some((c: any) => c.codeId === codeId)).length;
	}
	n += contrib.payload.markers.pdf.filter((m: any) => m.codes?.some((c: any) => c.codeId === codeId)).length;
	n += contrib.payload.markers.csvSegment.filter((m: any) => m.codes?.some((c: any) => c.codeId === codeId)).length;
	return n;
}
```

**Decisão fixa:** overlap = `min(local, incoming)` por codeId (não-async). Refinement pra range overlap exato é follow-up — não bloqueia P1.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: 0 erros

- [ ] **Step 4: Commit**

```bash
git add src/core/icr/contributions/unifiedIcrImportView.ts
~/.claude/scripts/commit.sh "feat(icr): conectar Por código chip + regra skip-all skipa code def se novo"
```

**Chunk 6 done quando:** `npm test` verde, build verde, todos 3 chips renderizam quando view abrir.

---

## Chunk 7 — Export trigger + main.ts wiring + smoke roundtrip

**Goal:** Implementar `exportTrigger.ts` (modal seleção coder + write file via vault.adapter), adicionar botão no Compare Coders View, registrar view + ribbon + 2 commands em `main.ts`. Smoke real: vault A → export → vault B → import → 3 chips → Apply → markers chegaram.

### Task 7.1: `exportTrigger.ts`

**Files:**
- Create: `src/core/icr/contributions/exportTrigger.ts`
- Create: `tests/core/icr/contributions/exportTrigger.test.ts`

- [ ] **Step 1: Testes (focado em filename + filter)**

```typescript
// tests/core/icr/contributions/exportTrigger.test.ts
import { describe, expect, test } from 'vitest';
import { sanitizeFilename, filterHumanCoders } from '../../../../src/core/icr/contributions/exportTrigger';
import type { Coder } from '../../../../src/core/icr/coderTypes';

describe('sanitizeFilename', () => {
	test('substitui ":" por "-" (Windows compat)', () => {
		const out = sanitizeFilename('Carla', '2026-05-10T14:32:00.000Z');
		expect(out).not.toMatch(/:/);
		expect(out).toMatch(/Carla-2026-05-10T14-32-00\.000Z\.json/);
	});

	test('slug do nome: espaços → -, lowercase, sem caracteres especiais', () => {
		const out = sanitizeFilename('Maria José Silva', '2026-01-01T00:00:00.000Z');
		expect(out).toMatch(/^maria-jose-silva-/i);
	});
});

describe('filterHumanCoders', () => {
	test('filtra type === "human"', () => {
		const coders: Coder[] = [
			{ id: 'h:1', name: 'A', type: 'human', createdAt: 0 },
			{ id: 'l:1', name: 'B', type: 'llm', createdAt: 0 },
			{ id: 'h:2', name: 'C', type: 'human', createdAt: 0 },
		];
		const out = filterHumanCoders(coders);
		expect(out.map(c => c.id)).toEqual(['h:1', 'h:2']);
	});
});
```

- [ ] **Step 2: Run — falha**

Run: `npm test -- exportTrigger.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar (primeiro só os helpers puros + skeleton do orquestrador)**

```typescript
// src/core/icr/contributions/exportTrigger.ts
/**
 * Export trigger — orquestra:
 * 1. filtra coders humanos
 * 2. modal seleção (se >1) ou usa direto (se 1)
 * 3. extractCoderContribution
 * 4. write em vault-relative path
 * 5. Notice de sucesso
 */

import { Modal, Notice, type App, type Vault } from 'obsidian';
import type QualiaCodingPlugin from '../../../main';
import type { Coder } from '../coderTypes';
import { extractCoderContribution } from '../transport/extractCoderContribution';

export function sanitizeFilename(coderName: string, isoTimestamp: string): string {
	const slug = coderName
		.toLowerCase()
		.normalize('NFD').replace(/[̀-ͯ]/g, '') // strip combining diacritics
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	const safeIso = isoTimestamp.replace(/:/g, '-');
	return `${slug}-${safeIso}.json`;
}

export function filterHumanCoders(coders: Coder[]): Coder[] {
	return coders.filter(c => c.type === 'human');
}

export async function runExportTrigger(plugin: QualiaCodingPlugin): Promise<void> {
	const allCoders = plugin.coderRegistry.getAll();
	const humans = filterHumanCoders(allCoders);

	if (humans.length === 0) {
		new Notice('ICR Export: nenhum coder humano registrado');
		return;
	}

	const coder = humans.length === 1
		? humans[0]
		: await pickCoderModal(plugin.app, humans);

	if (!coder) return; // user cancelou

	const result = extractCoderContribution(
		plugin.dataManager.getDataRef(),
		coder.id,
		plugin.sourceHashRegistry, // ajustar nome
	);

	const filename = sanitizeFilename(coder.name, new Date().toISOString());
	const path = `icr-exports/${filename}`;

	const vault: Vault = plugin.app.vault;
	if (!await vault.adapter.exists('icr-exports')) {
		await vault.adapter.mkdir('icr-exports');
	}
	await vault.adapter.write(path, JSON.stringify(result.payload, null, 2));

	new Notice(`ICR Export: salvo em ${path}`);
}

class CoderPickerModal extends Modal {
	private selected: Coder | null = null;
	private resolve!: (c: Coder | null) => void;
	private resolved = false;
	public promise: Promise<Coder | null>;

	constructor(app: App, private coders: Coder[]) {
		super(app);
		// Promise criada NO CONSTRUCTOR pra evitar race com onOpen disparado por super.open()
		this.promise = new Promise(resolve => {
			this.resolve = resolve;
		});
	}

	private resolveOnce(value: Coder | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve(value);
	}

	onOpen(): void {
		this.titleEl.setText('Escolher coder pra exportar');
		const list = this.contentEl.createDiv({ cls: 'qc-icr-coder-picker' });
		for (const c of this.coders) {
			const item = list.createDiv({ cls: 'qc-icr-coder-picker-item' });
			const radio = item.createEl('input', { type: 'radio', attr: { name: 'coder' } });
			radio.value = c.id;
			radio.onchange = () => { this.selected = c; };
			item.createSpan({ text: ` ${c.name}` });
		}

		const buttons = this.contentEl.createDiv({ cls: 'qc-icr-coder-picker-buttons' });
		const confirm = buttons.createEl('button', { text: 'Confirm', cls: 'mod-cta' });
		confirm.onclick = () => { this.resolveOnce(this.selected); this.close(); };
		const cancel = buttons.createEl('button', { text: 'Cancel' });
		cancel.onclick = () => { this.resolveOnce(null); this.close(); };
	}

	onClose(): void {
		// Se fechou sem decidir (X / Esc), resolve com null
		this.resolveOnce(null);
		this.contentEl.empty();
	}
}

async function pickCoderModal(app: App, coders: Coder[]): Promise<Coder | null> {
	const modal = new CoderPickerModal(app, coders);
	modal.open();
	return await modal.promise;
}
```

- [ ] **Step 4: Verificar APIs reais**

Run: `grep -n "coderRegistry\|sourceHashRegistry\|dataManager" src/main.ts | head -10`

Ajustar nomes acima conforme necessário.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- exportTrigger.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/icr/contributions/exportTrigger.ts tests/core/icr/contributions/exportTrigger.test.ts
~/.claude/scripts/commit.sh "feat(icr): exportTrigger — modal seleção coder humano + write em vault/icr-exports/"
```

---

### Task 7.2: Botão no toolbar do Compare Coders View

**Files:**
- Modify: `src/core/icr/ui/unifiedCompareCodersView.ts`

- [ ] **Step 1: Adicionar segundo botão adjacente ao "ver lado a lado"**

Localizar linha ~91 (`sideBtn = pickerHolder.createEl('button', { cls: 'qc-cc-side-btn', text: '↗ ver lado a lado' });`).

```typescript
// Após sideBtn, adicionar:
import { runExportTrigger } from '../contributions/exportTrigger';

const exportBtn = pickerHolder.createEl('button', { cls: 'qc-cc-side-btn', text: '↗ exportar contribuição' });
exportBtn.onclick = () => runExportTrigger(this.plugin);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/icr/ui/unifiedCompareCodersView.ts
~/.claude/scripts/commit.sh "feat(icr): botão 'exportar contribuição' no toolbar do Compare Coders View"
```

---

### Task 7.3: main.ts — registerView + ribbon + 2 commands

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Adicionar imports + registerView no `onload()`**

Localizar bloco `registerView` existente em `src/main.ts:601`.

```typescript
// Imports no topo
import { UnifiedIcrImportView, ICR_IMPORT_VIEW_TYPE } from './core/icr/contributions/unifiedIcrImportView';
import { runExportTrigger } from './core/icr/contributions/exportTrigger';

// Em onload() — após COMPARE_CODERS_VIEW_TYPE:
this.registerView(ICR_IMPORT_VIEW_TYPE, (leaf) =>
	new UnifiedIcrImportView(leaf, this),
);
```

- [ ] **Step 2: Adicionar ribbon icon**

```typescript
// Em onload() — após registerViews:
this.addRibbonIcon('git-pull-request', 'ICR Import', () => {
	this.openIcrImportView();
});

// Helper method (em algum lugar do plugin):
async openIcrImportView(): Promise<void> {
	const existing = this.app.workspace.getLeavesOfType(ICR_IMPORT_VIEW_TYPE);
	if (existing.length > 0) {
		this.app.workspace.revealLeaf(existing[0]);
		return;
	}
	const leaf = this.app.workspace.getRightLeaf(false);
	if (leaf) {
		await leaf.setViewState({ type: ICR_IMPORT_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}
}
```

- [ ] **Step 3: Adicionar 2 commands**

```typescript
// Em onload(), após addCommand existentes:
this.addCommand({
	id: 'icr-open-import',
	name: 'ICR: Open import',
	callback: () => this.openIcrImportView(),
});

this.addCommand({
	id: 'icr-export-my-contribution',
	name: 'ICR: Export my contribution',
	callback: () => runExportTrigger(this),
});
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
~/.claude/scripts/commit.sh "feat(icr): main.ts wiring — registerView ICR Import + ribbon + 2 commands"
```

---

### Task 7.4: Smoke roundtrip (Obsidian real — checkpoint final)

**Files:** nenhuma modificação esperada, apenas validação.

**IMPORTANTE — preparo de DOIS vaults distintos:** ICR transport multi-coder REQUER vaults separados (cada um com seu próprio `sourceHashRegistry`). Mutar o workbench original e re-importar nele NÃO testa cross-vault.

Vault A = workbench atual (`/Users/mosx/Desktop/obsidian-plugins-workbench`).
Vault B = vault temp (`~/Desktop/temp-icr-fase-c-p1/`) — criar com plugin instalado via `bash scripts/smoke-roundtrip.sh` (já existe pra QDPX, padrão pode ser adaptado) OU manualmente: copiar `.obsidian/` essencial + `manifest.json` + `main.js` + `styles.css` pro novo vault.

**Vault A (export):**

- [ ] **Step 1: Preparar vault A**

No workbench atual:
1. Criar 3 sources na raiz: `temp-roundtrip-A/P01.md`, `P02.md`, `P03.md` (texto pra codar)
2. No Obsidian, codar com 1 coder humano (criar via comando se necessário): 5 codes diferentes, ~20 markers distribuídos nos 3 sources

- [ ] **Step 2: Build + reload**

```bash
npm run build
```

Reload Obsidian workbench (Cmd P → "Reload app").

- [ ] **Step 3: Export**

1. Abrir Compare Coders View
2. Click "↗ exportar contribuição"
3. (se 1 humano: skip modal; se >1: escolher)
4. Verificar Notice "salvo em icr-exports/<name>.json"
5. Verificar arquivo existe na raiz do vault A: `ls /Users/mosx/Desktop/obsidian-plugins-workbench/icr-exports/`

- [ ] **Step 4: Setup vault B (TEMP, separado do A)**

```bash
# Criar vault B novo
mkdir -p ~/Desktop/temp-icr-fase-c-p1/.obsidian/plugins/obsidian-qualia-coding
# Copiar plugin
cp manifest.json main.js styles.css ~/Desktop/temp-icr-fase-c-p1/.obsidian/plugins/obsidian-qualia-coding/
# Habilitar plugin (criar community-plugins.json se necessário)
echo '["obsidian-qualia-coding"]' > ~/Desktop/temp-icr-fase-c-p1/.obsidian/community-plugins.json
# Copiar P01/P02/P03 (mesmos arquivos pra ter sources matching)
cp /Users/mosx/Desktop/obsidian-plugins-workbench/temp-roundtrip-A/P*.md ~/Desktop/temp-icr-fase-c-p1/
```

Abrir vault B no Obsidian (File → Open vault → escolher `~/Desktop/temp-icr-fase-c-p1/`).

- [ ] **Step 5: Divergir vault B do A pra exercitar conflicts**

Dentro do vault B:
1. Criar 1 code local (Cmd P → "Add code") com nome diferente do A pra forçar codebook divergence se houver overlap
2. Editar P03.md (adicionar parágrafo) → muda hash do source
3. Deletar P02.md → vai gerar source_not_found no import

- [ ] **Step 6: Import no vault B**

Copiar o .json de vault A pra um path acessível ao vault B:
```bash
cp /Users/mosx/Desktop/obsidian-plugins-workbench/icr-exports/*.json ~/Desktop/temp-icr-fase-c-p1/
```

No vault B (Obsidian aberto):
1. Click ribbon `git-pull-request` → abre ItemView vazia
2. Drop o arquivo .json na rail (drop zone)
3. Verificar contribution aparece na rail
4. Verificar chip "Visão geral" mostra:
   - Seção sources (P02 not found + P03 hash mismatch)
   - Seção OK (markers de P01)
   - Footer com "Apply (X markers — Y ficam fora)"
   - Codebook section pode ou não aparecer (depende se codes do A clashearam com locais do B)

- [ ] **Step 7: Resolver divergências**

1. Sources: P02 → "Skip source"; P03 → "Trust local"
2. Codebook (se houver): "Manter local" ou "Aceitar Carla" conforme o caso
3. Verificar footer atualiza com novos counts

- [ ] **Step 8: Testar Lado a lado**

1. Click chip "Lado a lado"
2. Navegar com ←/→ alguns markers
3. Verificar local + incoming side-by-side
4. Skip 1 marker
5. Voltar pra Visão geral, footer atualizou

- [ ] **Step 9: Testar Por código**

1. Click chip "Por código"
2. Verificar blocos por code com counts
3. Click "Skip all" em 1 code novo
4. Click "Revisar 1-a-1 →" em outro code → muda pra Lado a lado filtrado
5. Verificar pill "code: cXXX ✕" no toolbar do Lado a lado
6. Click "✕" pra clear filter
7. Voltar pra Visão geral

- [ ] **Step 10: Apply**

1. Click Apply
2. Verificar Notice com count
3. Contribution sai da rail
4. Abrir Compare Coders View no vault B → coder importado aparece com markers aplicados

- [ ] **Step 11: Documentar smoke**

Capturar screenshots ou notas em `temp-roundtrip-A/MANUAL-TESTS-ICR-fase-c-p1.md` (raiz do vault A pra ficar visível no Obsidian) descrevendo passos exercitados, problemas encontrados, output esperado vs real.

---

## Pós-implementação — atualização de docs (CLAUDE.md)

Após chunk 7 done:

- [ ] **Step 1: Atualizar `docs/ROADMAP.md`** — marcar Fase C P1 como FEITO
- [ ] **Step 2: Atualizar `docs/ARCHITECTURE.md`** — adicionar §19.10 sobre contributions/ module + ItemView pattern reuse
- [ ] **Step 3: Atualizar `docs/TECHNICAL-PATTERNS.md`** — se descobriu pattern novo (ex: drop handler na rail)
- [ ] **Step 4: Atualizar `docs/BACKLOG.md`** — marcar 6 frentes da Fase C P1 como resolvidas (mover pra "Resolvidos" ou riscar)
- [ ] **Step 5: Atualizar `CLAUDE.md`** se contagem de testes mudou substancialmente

Sugestão de archive: o plan vai pra `obsidian-qualia-coding/plugin-docs/archive/claude_sources/plans/yyyymmdd-icr-fase-c-p1-ux.md` quando terminar (não automático — perguntar ao user).

---

## Resumo do plano

| Chunk | Foco | Testes esperados |
|---|---|---|
| 1 | Motor patch P0 (dryRun + overrides) | ~6 testes novos em mergeCoderContribution |
| 2 | Puros (loader + resolver) | 6 + 5 = 11 testes |
| 3 | ItemView skeleton + rail | 4 testes (rail) + smoke build |
| 4 | Toolbar + Visão geral chip | 5 (toolbar) + 7 (overview) = 12 testes |
| 5 | Lado a lado chip | 4 (overlap) + 5 (sideBySide) = 9 testes |
| 6 | Por código chip | 7 testes |
| 7 | Export + wiring + smoke | 2 (exportTrigger) + smoke roundtrip |

**Total estimado:** ~45-55 testes novos. Smoke real obrigatório no chunk 7.

**Comandos chave:**
- `npm test` — roda tudo
- `npm test -- <name>` — roda arquivo específico
- `npx tsc --noEmit` — typecheck
- `npm run build` — production build (esbuild + tsc)
- `~/.claude/scripts/commit.sh "msg"` — commit (forced author)

