# Code Merging Avançado — Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. **PROJETO OVERRIDE:** per `feedback_sdd_overkill_for_dev_project.md`, default = execução inline. SDD aqui não traz risco worth its weight.

**Goal:** Estender `MergeModal` + `executeMerge` com 4 novos inputs (radio nome, radio cor, política description, política memo), preview rico (markers/filhos/groups/sources) e pre-flight collision check, fechando Tier 2 do Coding Management.

**Architecture:** Helpers puros novos em `mergePolicies.ts` (sem dep de DOM ou registry — testáveis em isolamento). `executeMerge` reordena passos pra que rename rode após `delete(sourceIds)` (libera `nameIndex`). `MergeModal` re-renderiza seções reativamente quando sources mudam. Sem mudança de schema do `data.json`.

**Tech Stack:** TypeScript strict · Vitest + jsdom · Obsidian Modal API · zero novas deps externas.

**Spec:** `docs/superpowers/specs/2026-04-28-code-merging-avancado-design.md`

**Branch:** `feat/code-merging-avancado` (já criada).

---

## File Structure

| Arquivo | Operação | Responsabilidade |
|---------|----------|------------------|
| `src/core/mergePolicies.ts` | **Create** | Types `NameChoice`/`ColorChoice`/`TextPolicy` + helpers puros `resolveName`/`resolveColor`/`applyTextPolicy`. Sem imports de Obsidian, sem registry — só `CodeDefinition`. |
| `src/core/mergeModal.ts` | **Modify** | `MergeParams` reescrito (sem shim legado). `MergeResult` ganha `ok`+`reason`. `executeMerge` reordena passos. `MergeModal` ganha 4 seções reativas + preview rico + pre-flight collision check. |
| `src/core/baseCodeDetailView.ts` | **Modify** | Os 2 callers (linhas ~516, ~951) passam `decision` completo no `onConfirm`. |
| `tests/core/mergePolicies.test.ts` | **Create** | ~12 unit tests dos helpers puros. |
| `tests/core/mergeModal.test.ts` | **Modify** | Reescrever 2 tests legados (linhas 72-85) pra schema novo. Adicionar ~10 tests pra policies + collision + ordering. |
| `styles.css` | **Modify** | Classes `.codebook-merge-section`, `.codebook-merge-radio-row`, `.codebook-merge-radio-row-swatch`, `.codebook-merge-preview-list`, `.codebook-merge-name-error`. |
| `docs/ROADMAP.md` | **Modify** | Marcar item "Code merging avançado" como ✅ FEITO 2026-04-28. |

---

## Chunk 1: Helpers puros (TDD)

### Task 1: Tipos e estrutura inicial de `mergePolicies.ts`

**Files:**
- Create: `src/core/mergePolicies.ts`
- Test: `tests/core/mergePolicies.test.ts`

- [ ] **Step 1.1: Criar arquivo de tipos+stubs**

```ts
// src/core/mergePolicies.ts
import type { CodeDefinition } from './types';

export type NameChoice =
	| { kind: 'target' }
	| { kind: 'source'; codeId: string }
	| { kind: 'custom'; value: string };

export type ColorChoice =
	| { kind: 'target' }
	| { kind: 'source'; codeId: string };

export type TextPolicy =
	| { kind: 'keep-target' }
	| { kind: 'concatenate' }
	| { kind: 'keep-only'; codeId: string }
	| { kind: 'discard' };

export function resolveName(choice: NameChoice, target: CodeDefinition, sources: CodeDefinition[]): string {
	throw new Error('not implemented');
}

export function resolveColor(choice: ColorChoice, target: CodeDefinition, sources: CodeDefinition[]): string {
	throw new Error('not implemented');
}

export function applyTextPolicy(
	policy: TextPolicy,
	target: CodeDefinition,
	sources: CodeDefinition[],
	field: 'description' | 'memo',
): string | undefined {
	throw new Error('not implemented');
}
```

- [ ] **Step 1.2: Verificar tsc**

Run: `npm run build` (só pra checar tsc — esbuild também roda mas tudo bem)
Expected: PASS

---

### Task 2: TDD — `resolveName`

**Files:**
- Modify: `tests/core/mergePolicies.test.ts`
- Modify: `src/core/mergePolicies.ts`

- [ ] **Step 2.1: Escrever testes (vão falhar)**

```ts
// tests/core/mergePolicies.test.ts
import { describe, it, expect } from 'vitest';
import { resolveName, resolveColor, applyTextPolicy } from '../../src/core/mergePolicies';
import type { CodeDefinition } from '../../src/core/types';

function makeCode(over: Partial<CodeDefinition>): CodeDefinition {
	return {
		id: 'c_x',
		name: 'X',
		color: '#000',
		paletteIndex: 0,
		childrenOrder: [],
		createdAt: 0,
		updatedAt: 0,
		...over,
	};
}

describe('resolveName', () => {
	const target = makeCode({ id: 't', name: 'Target' });
	const srcA = makeCode({ id: 'a', name: 'SourceA' });
	const srcB = makeCode({ id: 'b', name: 'SourceB' });

	it('returns target name when choice is target', () => {
		expect(resolveName({ kind: 'target' }, target, [srcA, srcB])).toBe('Target');
	});

	it('returns source name when choice is source', () => {
		expect(resolveName({ kind: 'source', codeId: 'a' }, target, [srcA, srcB])).toBe('SourceA');
	});

	it('returns custom value (trimmed) when choice is custom', () => {
		expect(resolveName({ kind: 'custom', value: '  Foo  ' }, target, [srcA, srcB])).toBe('Foo');
	});

	it('falls back to target when source codeId not in sources list (defensive)', () => {
		expect(resolveName({ kind: 'source', codeId: 'z' }, target, [srcA, srcB])).toBe('Target');
	});
});
```

- [ ] **Step 2.2: Rodar — esperar FAIL**

Run: `npx vitest run tests/core/mergePolicies.test.ts`
Expected: FAIL com "not implemented"

- [ ] **Step 2.3: Implementar `resolveName`**

```ts
export function resolveName(choice: NameChoice, target: CodeDefinition, sources: CodeDefinition[]): string {
	if (choice.kind === 'target') return target.name;
	if (choice.kind === 'custom') return choice.value.trim();
	const src = sources.find(s => s.id === choice.codeId);
	return src ? src.name : target.name;  // defensive fallback
}
```

- [ ] **Step 2.4: Rodar — esperar PASS**

Run: `npx vitest run tests/core/mergePolicies.test.ts -t resolveName`
Expected: 4 PASS

---

### Task 3: TDD — `resolveColor`

**Files:**
- Modify: `tests/core/mergePolicies.test.ts`
- Modify: `src/core/mergePolicies.ts`

- [ ] **Step 3.1: Escrever testes**

```ts
describe('resolveColor', () => {
	const target = makeCode({ id: 't', name: 'T', color: '#aaa' });
	const srcA = makeCode({ id: 'a', name: 'A', color: '#bbb' });

	it('returns target color when choice is target', () => {
		expect(resolveColor({ kind: 'target' }, target, [srcA])).toBe('#aaa');
	});

	it('returns source color when choice is source', () => {
		expect(resolveColor({ kind: 'source', codeId: 'a' }, target, [srcA])).toBe('#bbb');
	});

	it('falls back to target when source not found', () => {
		expect(resolveColor({ kind: 'source', codeId: 'z' }, target, [srcA])).toBe('#aaa');
	});
});
```

- [ ] **Step 3.2: Implementar**

```ts
export function resolveColor(choice: ColorChoice, target: CodeDefinition, sources: CodeDefinition[]): string {
	if (choice.kind === 'target') return target.color;
	const src = sources.find(s => s.id === choice.codeId);
	return src ? src.color : target.color;
}
```

- [ ] **Step 3.3: Rodar — PASS**

Run: `npx vitest run tests/core/mergePolicies.test.ts -t resolveColor`
Expected: 3 PASS

---

### Task 4: TDD — `applyTextPolicy`

**Files:**
- Modify: `tests/core/mergePolicies.test.ts`
- Modify: `src/core/mergePolicies.ts`

- [ ] **Step 4.1: Escrever testes**

```ts
describe('applyTextPolicy', () => {
	const target = makeCode({ id: 't', name: 'T', memo: 'target memo' });
	const srcA = makeCode({ id: 'a', name: 'A', memo: 'memo from A' });
	const srcB = makeCode({ id: 'b', name: 'B', memo: 'memo from B' });

	it('keep-target returns target value', () => {
		expect(applyTextPolicy({ kind: 'keep-target' }, target, [srcA, srcB], 'memo')).toBe('target memo');
	});

	it('discard returns undefined', () => {
		expect(applyTextPolicy({ kind: 'discard' }, target, [srcA, srcB], 'memo')).toBeUndefined();
	});

	it('keep-only returns the chosen entity value', () => {
		expect(applyTextPolicy({ kind: 'keep-only', codeId: 'a' }, target, [srcA, srcB], 'memo')).toBe('memo from A');
		expect(applyTextPolicy({ kind: 'keep-only', codeId: 't' }, target, [srcA, srcB], 'memo')).toBe('target memo');
	});

	it('concatenate joins target first, then sources with header', () => {
		expect(applyTextPolicy({ kind: 'concatenate' }, target, [srcA, srcB], 'memo')).toBe(
			'target memo\n\n--- From A ---\nmemo from A\n\n--- From B ---\nmemo from B',
		);
	});

	it('concatenate skips empty entries', () => {
		const noMemoTarget = makeCode({ id: 't', name: 'T', memo: undefined });
		const emptyA = makeCode({ id: 'a', name: 'A', memo: '   ' });
		expect(applyTextPolicy({ kind: 'concatenate' }, noMemoTarget, [emptyA, srcB], 'memo')).toBe(
			'--- From B ---\nmemo from B',
		);
	});

	it('concatenate with all empty returns undefined', () => {
		const empty = makeCode({ id: 't', name: 'T', memo: undefined });
		const empty2 = makeCode({ id: 'a', name: 'A', memo: '' });
		expect(applyTextPolicy({ kind: 'concatenate' }, empty, [empty2], 'memo')).toBeUndefined();
	});

	it('keep-only with empty target returns undefined (signals no update)', () => {
		const empty = makeCode({ id: 't', name: 'T', memo: undefined });
		expect(applyTextPolicy({ kind: 'keep-only', codeId: 't' }, empty, [], 'memo')).toBeUndefined();
	});

	it('works for description field too', () => {
		const t = makeCode({ id: 't', name: 'T', description: 'desc' });
		expect(applyTextPolicy({ kind: 'keep-target' }, t, [], 'description')).toBe('desc');
	});
});
```

- [ ] **Step 4.2: Implementar**

```ts
export function applyTextPolicy(
	policy: TextPolicy,
	target: CodeDefinition,
	sources: CodeDefinition[],
	field: 'description' | 'memo',
): string | undefined {
	if (policy.kind === 'discard') return undefined;

	if (policy.kind === 'keep-target') {
		const val = target[field]?.trim();
		return val ? val : undefined;
	}

	if (policy.kind === 'keep-only') {
		const entity = policy.codeId === target.id
			? target
			: sources.find(s => s.id === policy.codeId);
		const val = entity?.[field]?.trim();
		return val ? val : undefined;
	}

	// concatenate
	const parts: string[] = [];
	const targetText = target[field]?.trim();
	if (targetText) parts.push(targetText);
	for (const src of sources) {
		const text = src[field]?.trim();
		if (text) parts.push(`--- From ${src.name} ---\n${text}`);
	}
	return parts.length > 0 ? parts.join('\n\n') : undefined;
}
```

- [ ] **Step 4.3: Rodar — PASS**

Run: `npx vitest run tests/core/mergePolicies.test.ts`
Expected: ~14 PASS (4 resolveName + 3 resolveColor + ~7 applyTextPolicy)

- [ ] **Step 4.4: Commit**

```bash
~/.claude/scripts/commit.sh "feat(merge): helpers puros mergePolicies.ts (resolveName/resolveColor/applyTextPolicy)"
```

---

## Chunk 2: `executeMerge` reorder + `MergeParams`/`MergeResult` reescritos

### Task 5: Migrar tests legados de `mergeModal.test.ts`

**Files:**
- Modify: `tests/core/mergeModal.test.ts:72-85`

> Migra antes de mexer no `executeMerge` pra que após o refactor a baseline de tests continue verde.

- [ ] **Step 5.1: Substituir os 2 tests legados**

Em `tests/core/mergeModal.test.ts`, substituir as linhas 72-85:

```ts
	it('updates destination name when nameChoice is custom', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			nameChoice: { kind: 'custom', value: 'NewName' },
			colorChoice: { kind: 'target' },
			descriptionPolicy: { kind: 'keep-target' },
			memoPolicy: { kind: 'keep-target' },
		});
		expect(registry.getById(dest.id)!.name).toBe('NewName');
	});

	it('moves destination to new parent when destinationParentId is provided', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		const parent = registry.create('Parent');
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			nameChoice: { kind: 'target' },
			colorChoice: { kind: 'target' },
			descriptionPolicy: { kind: 'keep-target' },
			memoPolicy: { kind: 'keep-target' },
			destinationParentId: parent.id,
		});
		expect(registry.getById(dest.id)!.parentId).toBe(parent.id);
	});
```

E adicionar os 4 fields obrigatórios nos 6 tests anteriores (linhas 14-70). Pattern:

```ts
const result = executeMerge({
	destinationId: dest.id, sourceIds: [src1.id, src2.id], registry, markers,
	nameChoice: { kind: 'target' },
	colorChoice: { kind: 'target' },
	descriptionPolicy: { kind: 'keep-target' },
	memoPolicy: { kind: 'keep-target' },
});
```

- [ ] **Step 5.2: Rodar — esperar FAIL (executeMerge ainda não aceita os fields novos)**

Run: `npx vitest run tests/core/mergeModal.test.ts`
Expected: tsc OU vitest reclamando da assinatura — tudo bem, vamos arrumar na próxima task.

---

### Task 6: Reescrever `MergeParams`/`MergeResult` em `mergeModal.ts`

**Files:**
- Modify: `src/core/mergeModal.ts:17-29`

- [ ] **Step 6.1: Substituir interfaces**

Substituir o bloco `// ─── Merge Logic ───` até o início de `executeMerge` (linhas 15-30) por:

```ts
// ─── Merge Logic ─────────────────────────────────────────────

import type { NameChoice, ColorChoice, TextPolicy } from './mergePolicies';
import { resolveName, resolveColor, applyTextPolicy } from './mergePolicies';

export interface MergeParams {
	destinationId: string;
	sourceIds: string[];
	registry: CodeDefinitionRegistry;
	markers: BaseMarker[];
	nameChoice: NameChoice;
	colorChoice: ColorChoice;
	descriptionPolicy: TextPolicy;
	memoPolicy: TextPolicy;
	/** `null` move pra root. `undefined` deixa intacto. */
	destinationParentId?: string | null;
}

export interface MergeResult {
	updatedMarkers: BaseMarker[];
	affectedCount: number;
	ok: boolean;
	reason?: 'name-collision';
}
```

> **Nota:** o `import type` adicional vai pra **topo do arquivo** (linha 10), agrupado com os outros imports. Apaga a linha duplicada que aparece em §Step 6.1 — esse bloco mostra apenas onde os types ficam declarados.

Após edição, mover os imports:

```ts
// linha 10 — junto com os outros imports
import type { NameChoice, ColorChoice, TextPolicy } from './mergePolicies';
import { resolveName, resolveColor, applyTextPolicy } from './mergePolicies';
```

- [ ] **Step 6.2: Verificar tsc**

Run: `npm run build`
Expected: tsc errors em `executeMerge` (que ainda usa os fields antigos) — esperado.

---

### Task 7: Reescrever `executeMerge` com a nova ordem (10 passos)

**Files:**
- Modify: `src/core/mergeModal.ts:31-107`

- [ ] **Step 7.1: Substituir corpo de `executeMerge`**

Substituir a função inteira (linhas ~31-107) por:

```ts
export function executeMerge(params: MergeParams): MergeResult {
	const {
		destinationId, sourceIds, registry, markers,
		nameChoice, colorChoice, descriptionPolicy, memoPolicy,
		destinationParentId,
	} = params;

	const target = registry.getById(destinationId);
	if (!target) {
		return { updatedMarkers: markers, affectedCount: 0, ok: false };
	}
	const sources = sourceIds
		.map(id => registry.getById(id))
		.filter((d): d is NonNullable<typeof d> => d !== undefined);

	let affectedCount = 0;

	// 1. Reassign markers
	for (const marker of markers) {
		let touched = false;
		for (const srcId of sourceIds) {
			if (hasCode(marker.codes, srcId)) {
				marker.codes = removeCodeApplication(marker.codes, srcId);
				if (!hasCode(marker.codes, destinationId)) {
					marker.codes = addCodeApplication(marker.codes, destinationId);
				}
				touched = true;
			}
		}
		if (touched) affectedCount++;
	}

	// 2. Reparent children of sources to destination
	for (const srcId of sourceIds) {
		const srcDef = registry.getById(srcId);
		if (srcDef) {
			for (const childId of [...srcDef.childrenOrder]) {
				registry.setParent(childId, destinationId);
			}
		}
	}

	// 3. Apply COLOR (não auditado por design — registry.update só seta campo)
	const finalColor = resolveColor(colorChoice, target, sources);
	if (finalColor !== target.color) {
		registry.update(destinationId, { color: finalColor });
	}

	// 4. Apply DESCRIPTION (audit: description_edited automático se mudou)
	const finalDescription = applyTextPolicy(descriptionPolicy, target, sources, 'description');
	if (finalDescription !== (target.description ?? '')) {
		registry.update(destinationId, { description: finalDescription ?? '' });
	}

	// 5. Apply MEMO (audit: memo_edited automático se mudou)
	const finalMemo = applyTextPolicy(memoPolicy, target, sources, 'memo');
	if (finalMemo !== (target.memo ?? '')) {
		registry.update(destinationId, { memo: finalMemo ?? '' });
	}

	// 6. Record mergedFrom + union dos groups (snapshot enquanto srcDef ainda existe)
	const destDefStill = registry.getById(destinationId);
	if (destDefStill) {
		if (!destDefStill.mergedFrom) destDefStill.mergedFrom = [];
		destDefStill.mergedFrom.push(...sourceIds);
		destDefStill.updatedAt = Date.now();

		const unionGroups = new Set<string>(destDefStill.groups ?? []);
		for (const srcDef of sources) {
			if (srcDef.groups) {
				for (const gid of srcDef.groups) unionGroups.add(gid);
			}
		}
		if (unionGroups.size > 0) {
			destDefStill.groups = Array.from(unionGroups);
		}
	}

	// 7. Audit `merged_into` em cada source + `absorbed` no target. Suprime
	//    o `deleted` automático do step 8.
	const finalDestName = registry.getById(destinationId)?.name ?? destinationId;
	const sourceSnapshot = sources.map(s => ({ id: s.id, name: s.name }));
	for (const src of sourceSnapshot) {
		registry.emitAuditExternal({ type: 'merged_into', codeId: src.id, intoId: destinationId, intoName: finalDestName });
		registry.suppressNextDelete(src.id);
	}
	registry.emitAuditExternal({
		type: 'absorbed',
		codeId: destinationId,
		absorbedNames: sourceSnapshot.map(s => s.name),
		absorbedIds: sourceSnapshot.map(s => s.id),
	});

	// 8. Delete sources (libera nameIndex pros nomes antigos)
	for (const srcId of sourceIds) registry.delete(srcId);

	// 9. Apply NAME (após delete sources — names dos sources já liberados em nameIndex)
	const finalName = resolveName(nameChoice, target, sources);
	if (finalName !== target.name) {
		const ok = registry.update(destinationId, { name: finalName });
		if (!ok) {
			return { updatedMarkers: markers, affectedCount, ok: false, reason: 'name-collision' };
		}
	}

	// 10. Apply destinationParentId (independente)
	if (destinationParentId !== undefined) {
		registry.setParent(destinationId, destinationParentId ?? undefined);
	}

	return { updatedMarkers: markers, affectedCount, ok: true };
}
```

- [ ] **Step 7.2: Rodar tests legados — devem passar**

Run: `npx vitest run tests/core/mergeModal.test.ts`
Expected: 8 PASS (todos os tests adaptados na Task 5).

- [ ] **Step 7.3: Rodar suite inteira pra garantir que não quebrou nada**

Run: `npm run test`
Expected: PASS (deve ficar em ~2363 + helpers da Task 4 = ~2377)

- [ ] **Step 7.4: Commit**

```bash
~/.claude/scripts/commit.sh "refactor(merge): reordena executeMerge + MergeParams reescrito (rename pós-delete)"
```

---

### Task 8: Adicionar tests novos pra ordering + collision

**Files:**
- Modify: `tests/core/mergeModal.test.ts`

- [ ] **Step 8.1: Adicionar tests no fim do `describe('executeMerge')`**

```ts
	it('applies color from source when colorChoice is source', () => {
		const dest = registry.create('Dest', { color: '#aaa' });
		const src = registry.create('Src', { color: '#bbb' });
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			nameChoice: { kind: 'target' },
			colorChoice: { kind: 'source', codeId: src.id },
			descriptionPolicy: { kind: 'keep-target' },
			memoPolicy: { kind: 'keep-target' },
		});
		expect(registry.getById(dest.id)!.color).toBe('#bbb');
	});

	it('applies name from source after deletion (no collision)', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			nameChoice: { kind: 'source', codeId: src.id },
			colorChoice: { kind: 'target' },
			descriptionPolicy: { kind: 'keep-target' },
			memoPolicy: { kind: 'keep-target' },
		});
		expect(registry.getById(dest.id)!.name).toBe('Src');
		expect(registry.getById(src.id)).toBeUndefined();
	});

	it('returns ok:false with reason when custom name collides with non-source code', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		const other = registry.create('Other');  // não é source nem target
		const result = executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			nameChoice: { kind: 'custom', value: 'Other' },
			colorChoice: { kind: 'target' },
			descriptionPolicy: { kind: 'keep-target' },
			memoPolicy: { kind: 'keep-target' },
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('name-collision');
		// Markers, sources, etc. já foram processados — só rename falhou
		expect(registry.getById(src.id)).toBeUndefined();
	});

	it('concatenates memos with header per source', () => {
		const dest = registry.create('Dest');
		registry.update(dest.id, { memo: 'dest memo' });
		const src = registry.create('Src');
		registry.update(src.id, { memo: 'src memo' });
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			nameChoice: { kind: 'target' },
			colorChoice: { kind: 'target' },
			descriptionPolicy: { kind: 'keep-target' },
			memoPolicy: { kind: 'concatenate' },
		});
		expect(registry.getById(dest.id)!.memo).toBe('dest memo\n\n--- From Src ---\nsrc memo');
	});

	it('discard memo policy clears destination memo', () => {
		const dest = registry.create('Dest');
		registry.update(dest.id, { memo: 'dest memo' });
		const src = registry.create('Src');
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			nameChoice: { kind: 'target' },
			colorChoice: { kind: 'target' },
			descriptionPolicy: { kind: 'keep-target' },
			memoPolicy: { kind: 'discard' },
		});
		expect(registry.getById(dest.id)!.memo).toBeUndefined();
	});

	it('keep-only memo policy uses chosen entity (source)', () => {
		const dest = registry.create('Dest');
		registry.update(dest.id, { memo: 'dest memo' });
		const src = registry.create('Src');
		registry.update(src.id, { memo: 'src memo' });
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			nameChoice: { kind: 'target' },
			colorChoice: { kind: 'target' },
			descriptionPolicy: { kind: 'keep-target' },
			memoPolicy: { kind: 'keep-only', codeId: src.id },
		});
		expect(registry.getById(dest.id)!.memo).toBe('src memo');
	});

	it('description concatenate works analogously to memo', () => {
		const dest = registry.create('Dest');
		registry.update(dest.id, { description: 'desc d' });
		const src = registry.create('Src');
		registry.update(src.id, { description: 'desc s' });
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			nameChoice: { kind: 'target' },
			colorChoice: { kind: 'target' },
			descriptionPolicy: { kind: 'concatenate' },
			memoPolicy: { kind: 'keep-target' },
		});
		expect(registry.getById(dest.id)!.description).toBe('desc d\n\n--- From Src ---\nsrc s');
	});

	it('all-empty memos with concatenate leaves dest memo undefined', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			nameChoice: { kind: 'target' },
			colorChoice: { kind: 'target' },
			descriptionPolicy: { kind: 'keep-target' },
			memoPolicy: { kind: 'concatenate' },
		});
		expect(registry.getById(dest.id)!.memo).toBeUndefined();
	});
```

- [ ] **Step 8.2: Rodar — esperar PASS**

Run: `npx vitest run tests/core/mergeModal.test.ts`
Expected: 16 PASS (8 originais + 8 novos)

- [ ] **Step 8.3: Commit**

```bash
~/.claude/scripts/commit.sh "test(merge): cobertura de policies + collision + ordering"
```

---

## Chunk 3: `MergeModal` UI

### Task 9: State interno do modal + helpers de render

**Files:**
- Modify: `src/core/mergeModal.ts:119-289`

- [ ] **Step 9.1: Substituir `MergeModalOptions` + signature do `onConfirm`**

```ts
export interface MergeDecision {
	destinationId: string;
	sourceIds: string[];
	nameChoice: NameChoice;
	colorChoice: ColorChoice;
	descriptionPolicy: TextPolicy;
	memoPolicy: TextPolicy;
	destinationParentId?: string | null;
}

export interface MergeModalOptions {
	app: App;
	registry: CodeDefinitionRegistry;
	initialDestinationId: string;
	allMarkers: BaseMarker[];
	onConfirm: (decision: MergeDecision) => void;
}
```

- [ ] **Step 9.2: Substituir state interno do `MergeModal`**

Reescrever campos privados:

```ts
export class MergeModal extends Modal {
	private registry: CodeDefinitionRegistry;
	private destinationId: string;
	private allMarkers: BaseMarker[];
	private onConfirm: MergeModalOptions['onConfirm'];
	private sourceIds: Set<string> = new Set();

	// State dos novos inputs
	private nameChoice: NameChoice = { kind: 'target' };
	private colorChoice: ColorChoice = { kind: 'target' };
	private descriptionPolicy: TextPolicy = { kind: 'keep-target' };
	private memoPolicy: TextPolicy = { kind: 'concatenate' };
	private customName = '';

	// DOM zones
	private chipContainer!: HTMLElement;
	private resultsContainer!: HTMLElement;
	private nameSection!: HTMLElement;
	private colorSection!: HTMLElement;
	private descriptionSection!: HTMLElement;
	private memoSection!: HTMLElement;
	private previewSection!: HTMLElement;
	private nameError!: HTMLElement;
	private mergeBtn!: HTMLButtonElement;
	private searchInput!: HTMLInputElement;
```

- [ ] **Step 9.3: Reescrever `onOpen` com layout das 4 seções**

```ts
	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('codebook-merge-modal');

		const destDef = this.registry.getById(this.destinationId);
		if (!destDef) { this.close(); return; }

		// Header
		contentEl.createEl('h3', { text: `Merge into "${destDef.name}"` });

		// Sources section
		const sourcesSection = contentEl.createDiv({ cls: 'codebook-merge-section' });
		sourcesSection.createEl('label', { text: 'Sources to merge:', cls: 'setting-item-name' });
		this.chipContainer = sourcesSection.createDiv({ cls: 'codebook-merge-source-list' });
		this.searchInput = sourcesSection.createEl('input', {
			type: 'text',
			placeholder: 'Search codes...',
			cls: 'codebook-merge-name-input',
		});
		this.resultsContainer = sourcesSection.createDiv({ cls: 'codebook-merge-search-results' });
		this.searchInput.addEventListener('input', () => this.renderSearchResults(this.searchInput.value));

		// Sections (rerendered when sources change)
		this.nameSection = contentEl.createDiv({ cls: 'codebook-merge-section' });
		this.nameError = contentEl.createDiv({ cls: 'codebook-merge-name-error' });
		this.nameError.style.display = 'none';
		this.colorSection = contentEl.createDiv({ cls: 'codebook-merge-section' });
		this.descriptionSection = contentEl.createDiv({ cls: 'codebook-merge-section' });
		this.memoSection = contentEl.createDiv({ cls: 'codebook-merge-section' });
		this.previewSection = contentEl.createDiv({ cls: 'codebook-merge-section codebook-merge-preview-list' });

		// Actions
		const actionsEl = contentEl.createDiv({ cls: 'codebook-merge-actions' });
		const cancelBtn = actionsEl.createEl('button', { text: 'Cancel' });
		this.mergeBtn = actionsEl.createEl('button', { text: 'Merge', cls: 'mod-cta' });

		cancelBtn.addEventListener('click', () => this.close());
		this.mergeBtn.addEventListener('click', () => this.handleConfirm());

		this.rerenderAll();
	}
```

- [ ] **Step 9.4: Implementar `rerenderAll` + `renderChips` + `renderSearchResults`**

```ts
	private rerenderAll(): void {
		this.renderChips();
		this.renderNameSection();
		this.renderColorSection();
		this.renderDescriptionSection();
		this.renderMemoSection();
		this.renderPreview();
		this.updateMergeButton();
	}

	private renderChips(): void {
		this.chipContainer.empty();
		for (const srcId of this.sourceIds) {
			const srcDef = this.registry.getById(srcId);
			if (!srcDef) continue;
			const chip = this.chipContainer.createDiv({ cls: 'codebook-merge-chip' });
			chip.createSpan({ text: srcDef.name });
			const count = this.allMarkers.filter(m => hasCode(m.codes, srcId)).length;
			if (count > 0) chip.createSpan({ text: `(${count})`, cls: 'codebook-merge-chip-count' });
			const removeBtn = chip.createSpan({ cls: 'codebook-merge-chip-remove' });
			setIcon(removeBtn, 'x');
			removeBtn.addEventListener('click', () => {
				this.sourceIds.delete(srcId);
				// Reset choices que apontam pra essa source pra evitar invalid state
				if (this.nameChoice.kind === 'source' && this.nameChoice.codeId === srcId) this.nameChoice = { kind: 'target' };
				if (this.colorChoice.kind === 'source' && this.colorChoice.codeId === srcId) this.colorChoice = { kind: 'target' };
				if (this.descriptionPolicy.kind === 'keep-only' && this.descriptionPolicy.codeId === srcId) this.descriptionPolicy = { kind: 'keep-target' };
				if (this.memoPolicy.kind === 'keep-only' && this.memoPolicy.codeId === srcId) this.memoPolicy = { kind: 'concatenate' };
				this.rerenderAll();
			});
		}
	}

	private renderSearchResults(query: string): void {
		this.resultsContainer.empty();
		if (!query.trim()) return;
		const lowerQuery = query.toLowerCase();
		const filtered = this.registry.getAll().filter(d =>
			d.id !== this.destinationId &&
			!this.sourceIds.has(d.id) &&
			d.name.toLowerCase().includes(lowerQuery),
		);
		for (const codeDef of filtered.slice(0, 20)) {
			const item = this.resultsContainer.createDiv({ cls: 'codebook-merge-search-item' });
			const swatch = item.createSpan({ cls: 'codebook-merge-radio-row-swatch' });
			swatch.style.backgroundColor = codeDef.color;
			item.createSpan({ text: codeDef.name });
			const count = this.allMarkers.filter(m => hasCode(m.codes, codeDef.id)).length;
			if (count > 0) item.createSpan({ text: `(${count})`, cls: 'codebook-merge-chip-count' });
			item.addEventListener('click', () => {
				this.sourceIds.add(codeDef.id);
				this.searchInput.value = '';
				this.resultsContainer.empty();
				this.rerenderAll();
			});
		}
	}
```

- [ ] **Step 9.5: tsc check**

Run: `npm run build`
Expected: tsc errors em métodos ainda não implementados (próximas tasks). OK.

---

### Task 10: Render das seções Name / Color / Description / Memo

**Files:**
- Modify: `src/core/mergeModal.ts`

- [ ] **Step 10.1: Helper `getParticipants` + `renderNameSection`**

```ts
	/** Returns target + sources (todos os participantes do merge). */
	private getParticipants(): { target: CodeDefinition; sources: CodeDefinition[] } {
		const target = this.registry.getById(this.destinationId)!;
		const sources = Array.from(this.sourceIds)
			.map(id => this.registry.getById(id))
			.filter((d): d is CodeDefinition => !!d);
		return { target, sources };
	}

	private renderNameSection(): void {
		this.nameSection.empty();
		if (this.sourceIds.size === 0) return;

		const { target, sources } = this.getParticipants();
		this.nameSection.createEl('label', { text: 'Keep name from:', cls: 'setting-item-name' });

		const radios: { value: string; choice: NameChoice; def: CodeDefinition | null; label: string }[] = [
			{ value: 'target', choice: { kind: 'target' }, def: target, label: target.name },
			...sources.map(s => ({ value: `src:${s.id}`, choice: { kind: 'source' as const, codeId: s.id }, def: s, label: s.name })),
			{ value: 'custom', choice: { kind: 'custom' as const, value: this.customName }, def: null, label: 'Custom:' },
		];

		const currentValue = this.nameChoice.kind === 'target' ? 'target'
			: this.nameChoice.kind === 'source' ? `src:${this.nameChoice.codeId}`
			: 'custom';

		for (const r of radios) {
			const row = this.nameSection.createDiv({ cls: 'codebook-merge-radio-row' });
			const radio = row.createEl('input', { type: 'radio', attr: { name: 'name-choice' } });
			radio.checked = currentValue === r.value;
			radio.addEventListener('change', () => {
				this.nameChoice = r.choice;
				this.renderNameSection();
				this.updateMergeButton();
			});
			if (r.def) {
				const swatch = row.createSpan({ cls: 'codebook-merge-radio-row-swatch' });
				swatch.style.backgroundColor = r.def.color;
			}
			row.createSpan({ text: r.label });
			if (r.value === 'custom') {
				const input = row.createEl('input', { type: 'text', cls: 'codebook-merge-name-input' });
				input.value = this.customName;
				input.placeholder = 'New name…';
				input.addEventListener('input', () => {
					this.customName = input.value;
					if (this.nameChoice.kind === 'custom') {
						this.nameChoice = { kind: 'custom', value: this.customName };
						this.updateMergeButton();
					}
				});
				input.addEventListener('focus', () => {
					this.nameChoice = { kind: 'custom', value: this.customName };
					this.renderNameSection();
					this.updateMergeButton();
				});
			}
		}
	}
```

- [ ] **Step 10.2: `renderColorSection`**

```ts
	private renderColorSection(): void {
		this.colorSection.empty();
		if (this.sourceIds.size === 0) return;

		const { target, sources } = this.getParticipants();
		this.colorSection.createEl('label', { text: 'Keep color from:', cls: 'setting-item-name' });

		const opts: { value: string; choice: ColorChoice; def: CodeDefinition; label: string }[] = [
			{ value: 'target', choice: { kind: 'target' }, def: target, label: target.name },
			...sources.map(s => ({ value: `src:${s.id}`, choice: { kind: 'source' as const, codeId: s.id }, def: s, label: s.name })),
		];

		const currentValue = this.colorChoice.kind === 'target' ? 'target' : `src:${this.colorChoice.codeId}`;

		for (const o of opts) {
			const row = this.colorSection.createDiv({ cls: 'codebook-merge-radio-row' });
			const radio = row.createEl('input', { type: 'radio', attr: { name: 'color-choice' } });
			radio.checked = currentValue === o.value;
			radio.addEventListener('change', () => {
				this.colorChoice = o.choice;
				this.renderColorSection();
			});
			const swatch = row.createSpan({ cls: 'codebook-merge-radio-row-swatch' });
			swatch.style.backgroundColor = o.def.color;
			row.createSpan({ text: o.label });
		}
	}
```

- [ ] **Step 10.3: `renderTextPolicySection` (genérico para description e memo)**

```ts
	private renderTextPolicySection(opts: {
		container: HTMLElement;
		label: string;
		field: 'description' | 'memo';
		current: TextPolicy;
		onChange: (p: TextPolicy) => void;
	}): void {
		opts.container.empty();
		if (this.sourceIds.size === 0) return;

		const { target, sources } = this.getParticipants();
		const allParticipants = [target, ...sources];
		const withContent = allParticipants.filter(p => (p[opts.field] ?? '').trim().length > 0);

		// Decisão #8: se ninguém tem conteúdo, esconde a seção inteira
		if (withContent.length === 0) return;

		opts.container.createEl('label', { text: opts.label, cls: 'setting-item-name' });

		// Radios: keep-target, concatenate, keep-only, discard
		const radios: { value: string; policy: TextPolicy; label: string; show: boolean }[] = [
			{ value: 'keep-target', policy: { kind: 'keep-target' }, label: 'keep target', show: true },
			{ value: 'concatenate', policy: { kind: 'concatenate' }, label: 'concatenate', show: withContent.length >= 2 },
			{ value: 'keep-only', policy: opts.current.kind === 'keep-only' ? opts.current : { kind: 'keep-only', codeId: withContent[0]!.id }, label: 'keep only…', show: withContent.length >= 2 },
			{ value: 'discard', policy: { kind: 'discard' }, label: 'discard', show: true },
		].filter(r => r.show);

		const currentValue = opts.current.kind;

		for (const r of radios) {
			const row = opts.container.createDiv({ cls: 'codebook-merge-radio-row' });
			const radio = row.createEl('input', { type: 'radio', attr: { name: `policy-${opts.field}` } });
			radio.checked = currentValue === r.value;
			radio.addEventListener('change', () => {
				opts.onChange(r.policy);
				this.renderTextPolicySection(opts);
			});
			row.createSpan({ text: r.label });

			// Dropdown extra pra keep-only
			if (r.value === 'keep-only' && currentValue === 'keep-only') {
				const select = row.createEl('select');
				for (const p of withContent) {
					const optEl = select.createEl('option', { value: p.id, text: p.id === target.id ? `${p.name} (target)` : p.name });
					if ((opts.current as { kind: 'keep-only'; codeId: string }).codeId === p.id) optEl.selected = true;
				}
				select.addEventListener('change', () => {
					opts.onChange({ kind: 'keep-only', codeId: select.value });
				});
			}
		}
	}

	private renderDescriptionSection(): void {
		this.renderTextPolicySection({
			container: this.descriptionSection,
			label: 'Description:',
			field: 'description',
			current: this.descriptionPolicy,
			onChange: (p) => { this.descriptionPolicy = p; },
		});
	}

	private renderMemoSection(): void {
		this.renderTextPolicySection({
			container: this.memoSection,
			label: 'Memos:',
			field: 'memo',
			current: this.memoPolicy,
			onChange: (p) => { this.memoPolicy = p; },
		});
	}
```

- [ ] **Step 10.4: tsc check**

Run: `npm run build`
Expected: pode falhar em `renderPreview` / `updateMergeButton` / `handleConfirm` ainda não implementados — OK.

---

### Task 11: Render do preview + validação + handleConfirm

**Files:**
- Modify: `src/core/mergeModal.ts`

- [ ] **Step 11.1: `renderPreview`**

```ts
	private renderPreview(): void {
		this.previewSection.empty();
		if (this.sourceIds.size === 0) {
			this.previewSection.createEl('div', { text: 'Add sources to see impact.', cls: 'codebook-merge-impact' });
			return;
		}

		const { target, sources } = this.getParticipants();
		this.previewSection.createEl('label', { text: 'Preview', cls: 'setting-item-name' });
		const list = this.previewSection.createEl('ul');

		const srcArr = Array.from(this.sourceIds);
		const affected = this.allMarkers.filter(m =>
			srcArr.some(sid => hasCode(m.codes, sid)),
		).length;
		list.createEl('li', { text: `${affected} marker${affected !== 1 ? 's' : ''} will be reassigned` });

		const childrenCount = sources.reduce((acc, s) => acc + s.childrenOrder.length, 0);
		if (childrenCount > 0) {
			const finalName = (() => {
				const n = this.nameChoice.kind === 'target' ? target.name
					: this.nameChoice.kind === 'source' ? sources.find(s => s.id === this.nameChoice.codeId)?.name ?? target.name
					: this.customName;
				return n;
			})();
			list.createEl('li', { text: `${childrenCount} child code${childrenCount !== 1 ? 's' : ''} will be reparented to "${finalName}"` });
		}

		const targetGroups = new Set(target.groups ?? []);
		const sourceGroupsAll = new Set(sources.flatMap(s => s.groups ?? []));
		const newGroups = [...sourceGroupsAll].filter(g => !targetGroups.has(g));
		if (newGroups.length > 0) {
			const groupNames = newGroups.map(gid => this.registry.groups.get(gid)?.name ?? gid).join(', ');
			list.createEl('li', { text: `Groups unioned: ${groupNames}` });
		}

		const sourceNames = sources.map(s => s.name).join(', ');
		list.createEl('li', { text: `${sources.length} code${sources.length !== 1 ? 's' : ''} will be deleted: ${sourceNames}` });
	}
```

- [ ] **Step 11.2: `updateMergeButton` (validação + collision check)**

```ts
	private updateMergeButton(): void {
		this.nameError.style.display = 'none';
		this.nameError.empty();

		if (this.sourceIds.size === 0) {
			this.mergeBtn.disabled = true;
			return;
		}

		const { target, sources } = this.getParticipants();

		// Custom name vazio
		if (this.nameChoice.kind === 'custom' && this.customName.trim() === '') {
			this.mergeBtn.disabled = true;
			return;
		}

		// Pre-flight collision check
		const finalName = resolveName(this.nameChoice, target, sources);
		if (finalName !== target.name) {
			const collision = this.registry.getAll().find(c =>
				c.id !== target.id &&
				!this.sourceIds.has(c.id) &&
				c.name === finalName,
			);
			if (collision) {
				this.nameError.style.display = '';
				this.nameError.setText(`Name "${finalName}" is already used by another code.`);
				this.mergeBtn.disabled = true;
				return;
			}
		}

		this.mergeBtn.disabled = false;
	}
```

- [ ] **Step 11.3: `handleConfirm`**

```ts
	private handleConfirm(): void {
		if (this.sourceIds.size === 0) return;
		this.onConfirm({
			destinationId: this.destinationId,
			sourceIds: Array.from(this.sourceIds),
			nameChoice: this.nameChoice.kind === 'custom' ? { kind: 'custom', value: this.customName } : this.nameChoice,
			colorChoice: this.colorChoice,
			descriptionPolicy: this.descriptionPolicy,
			memoPolicy: this.memoPolicy,
		});
		this.close();
	}
```

- [ ] **Step 11.4: tsc check**

Run: `npm run build`
Expected: PASS (tsc + esbuild).

- [ ] **Step 11.5: Rodar suite**

Run: `npm run test`
Expected: PASS (incluindo todos os tests novos).

- [ ] **Step 11.6: Commit**

```bash
~/.claude/scripts/commit.sh "feat(merge): MergeModal — 4 seções reativas + preview rico + collision check"
```

---

## Chunk 4: Migração dos callers + CSS + smoke test

### Task 12: Migrar callers em `baseCodeDetailView.ts`

**Files:**
- Modify: `src/core/baseCodeDetailView.ts:516-537,951-970`

- [ ] **Step 12.1: Substituir `onMergeDrop` (linha 516)**

```ts
				onMergeDrop: (sourceId, targetId) => {
					const modal = new MergeModal({
						app: this.app,
						registry: this.model.registry,
						initialDestinationId: targetId,
						allMarkers: this.model.getAllMarkers(),
						onConfirm: (decision) => {
							const result = executeMerge({
								destinationId: decision.destinationId,
								sourceIds: decision.sourceIds,
								registry: this.model.registry,
								markers: this.model.getAllMarkers(),
								nameChoice: decision.nameChoice,
								colorChoice: decision.colorChoice,
								descriptionPolicy: decision.descriptionPolicy,
								memoPolicy: decision.memoPolicy,
								destinationParentId: decision.destinationParentId,
							});
							if (!result.ok && result.reason === 'name-collision') {
								new Notice('Merge: name collision detected. Markers were reassigned but rename was skipped.');
							}
							this.model.saveMarkers();
							this.showList();
						},
					});
					modal.addSource(sourceId);
					modal.open();
				},
```

- [ ] **Step 12.2: Substituir `openMergeModal` (linha 951)**

```ts
			openMergeModal: (codeId: string) => {
				new MergeModal({
					app: this.app,
					registry: this.model.registry,
					initialDestinationId: codeId,
					allMarkers: this.model.getAllMarkers(),
					onConfirm: (decision) => {
						const result = executeMerge({
							destinationId: decision.destinationId,
							sourceIds: decision.sourceIds,
							registry: this.model.registry,
							markers: this.model.getAllMarkers(),
							nameChoice: decision.nameChoice,
							colorChoice: decision.colorChoice,
							descriptionPolicy: decision.descriptionPolicy,
							memoPolicy: decision.memoPolicy,
							destinationParentId: decision.destinationParentId,
						});
						if (!result.ok && result.reason === 'name-collision') {
							new Notice('Merge: name collision detected. Markers were reassigned but rename was skipped.');
						}
						this.model.saveMarkers();
						this.showList();
					},
				}).open();
			},
```

- [ ] **Step 12.3: Adicionar import de `Notice` se ainda não estiver**

Verificar topo de `baseCodeDetailView.ts`. `Notice` provavelmente já está importado pelos bulk operations do #28. Se não, adicionar:

```ts
import { ..., Notice } from 'obsidian';
```

- [ ] **Step 12.4: tsc check**

Run: `npm run build`
Expected: PASS.

---

### Task 13: CSS — novas classes

**Files:**
- Modify: `styles.css`

- [ ] **Step 13.1: Adicionar bloco no fim de `styles.css`**

```css
/* ─── Merge Modal — Tier 2 expanded ─── */

.codebook-merge-modal .codebook-merge-section {
	margin: var(--size-4-3) 0;
}

.codebook-merge-modal .codebook-merge-radio-row {
	display: flex;
	align-items: center;
	gap: var(--size-4-2);
	padding: var(--size-2-1) 0;
	cursor: pointer;
}

.codebook-merge-modal .codebook-merge-radio-row input[type="radio"] {
	margin: 0;
}

.codebook-merge-modal .codebook-merge-radio-row-swatch {
	width: 12px;
	height: 12px;
	border-radius: 50%;
	flex-shrink: 0;
	display: inline-block;
}

.codebook-merge-modal .codebook-merge-radio-row .codebook-merge-name-input {
	flex: 1;
	margin-left: var(--size-2-2);
}

.codebook-merge-modal .codebook-merge-radio-row select {
	margin-left: var(--size-2-2);
}

.codebook-merge-modal .codebook-merge-name-error {
	color: var(--text-error);
	font-size: var(--font-ui-small);
	padding: var(--size-2-1) 0;
}

.codebook-merge-modal .codebook-merge-preview-list ul {
	margin: var(--size-2-2) 0;
	padding-left: var(--size-4-4);
}

.codebook-merge-modal .codebook-merge-preview-list li {
	padding: var(--size-2-1) 0;
}
```

- [ ] **Step 13.2: Build + copy pra demo (se houver)**

```bash
npm run build
```

Pra workbench vault não precisa copiar — `main.js`/`styles.css` já estão no path certo.

- [ ] **Step 13.3: Commit**

```bash
~/.claude/scripts/commit.sh "feat(merge): callers + CSS pra MergeModal expandido"
```

---

### Task 14: Smoke test em vault real

**Vault:** `/Users/mosx/Desktop/obsidian-plugins-workbench/`

> Per CLAUDE.md, smoke test em vault real é checkpoint obrigatório pra plugin Obsidian. jsdom não cobre Modal layout.

- [ ] **Step 14.1: Reload Obsidian**

Cmd+P → "Reload app without saving" (ou Ctrl+R no Obsidian). Hot-reload do plugin pega `main.js` novo.

- [ ] **Step 14.2: Roteiro — merge simples (sanity)**

1. Abrir Codebook, escolher 2 códigos com markers diferentes
2. Right-click → "Merge with..."
3. Procurar e adicionar 1 source
4. **Verificar**: aparecem 4 seções (Name, Color, Description, Memo) e 1 preview
5. Default: name=target, color=target, description=keep-target, memo=concatenate
6. Apertar Merge — confirmar que markers foram reassignados, source sumiu

- [ ] **Step 14.3: Roteiro — name from source**

1. Pegar 2 códigos com nomes distintos (ex: `frustração` target, `irritação` source)
2. Abrir merge modal, adicionar source
3. Selecionar radio `irritação` no Keep name from
4. Apertar Merge
5. **Verificar**: code resultante chama `irritação` (renomeado pós-delete da source)

- [ ] **Step 14.4: Roteiro — color from source**

1. Mesmo cenário, mas selecionar Keep color from = source
2. **Verificar**: dest mantém o nome target mas cor da source

- [ ] **Step 14.5: Roteiro — memo concatenate**

1. Adicionar memos diferentes em target e source antes de merge
2. Abrir modal, manter memo policy = concatenate (default)
3. Apertar Merge
4. Abrir Code Detail do target — **verificar**: memo = `<target>\n\n--- From <source> ---\n<source memo>`

- [ ] **Step 14.6: Roteiro — collision detection**

1. Tem 3 códigos: A (target), B (source), C (existe, não envolvido)
2. Abrir merge modal A+B
3. Custom name = "C"
4. **Verificar**: botão Merge desabilita, inline error visível: `Name "C" is already used by another code.`

- [ ] **Step 14.7: Roteiro — keep-only memo**

1. Target com memo, source com memo
2. Memo policy = keep only [▼]
3. Selecionar source no dropdown
4. Apertar Merge
5. **Verificar**: dest fica só com o memo do source

- [ ] **Step 14.8: Roteiro — degenerate (sem memos em ninguém)**

1. Códigos sem memo nem description
2. Abrir merge modal
3. **Verificar**: seções Description e Memo somem do modal

- [ ] **Step 14.9: Roteiro — audit log**

1. Após merge com memo concatenate, abrir Code Detail do target
2. Expandir seção History
3. **Verificar**: aparecem entries `memo_edited`, `absorbed`, possivelmente `description_edited` se foi alterado, e `merged_into` no histórico do código que sumiu (este último não navegável já que código foi deletado — mas a entry pode persistir; ver behavior atual)

- [ ] **Step 14.10: Se algo quebrar**

Anotar exatamente o que faltou. Voltar a uma das tasks acima e ajustar. Re-rodar `npm run test` antes de commitar.

---

### Task 15: Atualizar ROADMAP + memory

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `~/.claude/projects/-Users-mosx-Desktop-obsidian-plugins-workbench--obsidian-plugins-obsidian-qualia-coding/memory/project_next_task.md`

- [ ] **Step 15.1: Marcar item Tier 2 como FEITO no ROADMAP**

No `docs/ROADMAP.md`, na tabela do Tier 2 (linha 56), substituir a linha `Code merging avançado`:

```markdown
| ~~**Code merging avançado**~~ | ~~Merge interativo: preview rico, escolher nome+cor mantido, política explícita pra memos/descriptions~~ | ✅ FEITO 2026-04-28 — ver registro #30. MergeModal expandido com 4 seções reativas (Name, Color, Description, Memo) + preview rico + pre-flight collision check; helpers puros em `mergePolicies.ts`. Tier 2 fechado. |
```

E na linha 14 do ROADMAP, atualizar a coluna "O que tem aberto" da área Coding Management:

```markdown
| **[Coding Management](#2-coding-management)** | Tier 1 ✅ FEITO 2026-04-28. Tier 2 ✅ FEITO 2026-04-28 · Tier 3 (bloqueado por LLM): Smart Codes |
```

- [ ] **Step 15.2: Adicionar entry #30 no registro de Implementados**

No fim do arquivo, na seção `## ✅ Implementados (registro)`, adicionar:

```markdown
- **#30 Code merging avançado** — 2026-04-28. Branch `feat/code-merging-avancado`. Fecha o Tier 2 do Coding Management. **Implementação:** (a) `src/core/mergePolicies.ts` (novo) — types `NameChoice`/`ColorChoice`/`TextPolicy` e helpers puros `resolveName`/`resolveColor`/`applyTextPolicy`. (b) `executeMerge` reordenado em 10 passos — rename agora roda **após** `delete(sourceIds)` pra liberar `nameIndex` (resolve collision real quando user escolhe `nameChoice = source`). (c) `MergeResult` ganha `ok`+`reason` — caller exibe Notice se `name-collision` detectado em runtime. (d) `MergeModal` reescrito com 4 seções reativas (Name radio com swatches, Color radio, Description policy, Memo policy) + preview rico (markers reassigned, child codes reparented, groups unioned, sources deleted) + pre-flight collision check (botão Merge desabilita + inline error). Defaults: keep-target name+color+description, concatenate memo (filosofia "nada se perde silenciosamente"). (e) Pattern de concatenate inspirado no QDPX importer (`qdcImporter.ts:138-150`) com cabeçalho `--- From {sourceName} ---`. (f) Os 2 callers em `baseCodeDetailView.ts` (drag-merge e context menu) migrados pra schema novo (`onConfirm` recebe `MergeDecision` único). Sem shim legado. (g) Audit log: mudanças em description/memo durante merge disparam `description_edited`/`memo_edited` automaticamente via `registry.update`; cor não é auditada (decisão #29). +25 testes (12 mergePolicies + 8 mergeModal novos + 5 collision/ordering). 2363 → ~2388 tests verde.
```

- [ ] **Step 15.3: Atualizar memory `project_next_task.md`**

```bash
# Manual edit no arquivo de memória — mark Tier 2 done.
```

Edit em `~/.claude/projects/-Users-mosx-Desktop-obsidian-plugins-workbench--obsidian-plugins-obsidian-qualia-coding/memory/project_next_task.md`:

- Linha "Tier 2 — polish do codebook como artefato vivo:" → marcar **Code merging avançado** como `~~tachado~~ ✅ FEITO 2026-04-28 (#30 no ROADMAP)`.
- Linha de combo "Combo natural pra fechar o tema": atualizar pra refletir que **só Codebook timeline central** restou.
- Em "Estado atual": adicionar uma linha "**2026-04-28 (final do dia):** Tier 2 do Coding Management 100% fechado com #30 (code merging avançado)."

- [ ] **Step 15.4: Commit docs**

```bash
~/.claude/scripts/commit.sh "docs(roadmap): #30 code merging avançado feito — fecha Tier 2"
```

---

## Chunk 5: Finalização

### Task 16: Auto-merge pra main

> Per `feedback_auto_post_task_cleanup.md` — auto-merge sem perguntar.

- [ ] **Step 16.1: Verificar tudo verde**

```bash
npm run test 2>&1 | tail -5
npm run build 2>&1 | tail -3
git status
```

Expected: `Test Files  XXX passed`, `npm run build` sem erros, working tree limpo.

- [ ] **Step 16.2: Merge pra main**

```bash
git checkout main
git merge feat/code-merging-avancado --no-ff -m "feat(codebook): code merging avançado — fecha Tier 2 (#30)"
```

- [ ] **Step 16.3: Push + delete branch local e remota**

```bash
git push origin main
git branch -d feat/code-merging-avancado
git push origin --delete feat/code-merging-avancado 2>/dev/null || echo "no remote branch (OK)"
```

- [ ] **Step 16.4: Final report**

Resumir para o user:
- O que foi feito (1-2 linhas)
- Test count antes/depois
- Verificar que main tá com tudo verde
- Apontar o registro #30 no ROADMAP

---

## Resumo de cobertura

| Camada | Cobertura |
|--------|-----------|
| Helpers puros | `mergePolicies.test.ts` ~12 tests |
| `executeMerge` | `mergeModal.test.ts` 8 originais (migrados) + 8 novos = 16 |
| `MergeModal` UI | Smoke test em vault real (Task 14) |
| Round-trip QDPX | Sem mudança — schema não altera, audit log já preserva via existing pipeline |

## Riscos do plano

| Risco | Mitigação |
|-------|-----------|
| Render reativo do modal vira espaguete | Centralizado em `rerenderAll()` que chama 5 helpers `render*Section`; cada seção é função isolada que limpa container e re-popula |
| Estado interno do modal fica inconsistente quando user remove source que ele tinha escolhido em color/name/keep-only | `renderChips` reseta as 4 choices que apontam pra essa source pra defaults seguros antes de re-render |
| `executeMerge` falha em collision mas markers já foram reassignados | `MergeResult.ok` + `reason` + Notice no caller deixam claro pro user; merge não é atômico mas comportamento é consistente com #29 (audit log) |
| Concatenate memo gigante | Aceitável por design — user pediu concatenate, edita depois se quiser enxutar |

---

## Quando algo dá errado

- **tsc fail no Chunk 2/3:** ler o erro completo, ajustar tipos. Provavelmente import faltando ou `MergeDecision` vs `MergeParams` confundidos.
- **Test falha em collision:** verificar que `registry.update` linha 261-262 ainda retorna `false` em colisão (não mudou). Verificar que ordem do Step 7.1 está correta (delete antes de rename).
- **Modal não atualiza ao remover chip:** verificar que `removeBtn.addEventListener` chama `rerenderAll()` (não só `renderChips`).
- **Smoke test mostra audit log com entries duplicadas:** coalescing 60s deveria juntar — checar se há gap de tempo entre as `update` chamadas. Se for >60s (improvável em 1 merge), aceitar.
