# Toggle Visibility por Código — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar toggle de visibilidade de códigos em duas camadas — global (sidebar) e per-doc override (popover em cada view) — sem afetar Analytics nem export.

**Architecture:** Helper puro compõe `CodeDefinition.hidden` (global) + `visibilityOverrides[fileId][codeId]` (per-doc em data.json) em único check `isCodeVisibleInFile(codeId, fileId)`. Event bus com rAF coalescing notifica os 6 engines que refrescam pontual (DOM-based: CSV/PDF/Image/Audio/Video) ou rebuild filtrado (CM6, framework atômico). Semântica B (self-cleaning): overrides só existem enquanto divergem do global.

**Tech Stack:** TypeScript (strict), Obsidian Plugin API, CodeMirror 6, Fabric.js, AG Grid Community, WaveSurfer.js, vitest + jsdom.

**Design spec:** [`docs/superpowers/specs/2026-04-24-toggle-visibility-per-codigo-design.md`](../specs/2026-04-24-toggle-visibility-per-codigo-design.md)

**Referências obrigatórias antes de começar:**
- `CLAUDE.md` (raiz do repo) — **sem worktrees nesse projeto**; usar branch direto; commits via `~/.claude/scripts/commit.sh`
- `docs/TECHNICAL-PATTERNS.md` — padrões compartilhados (filter loops, popover pattern de Case Variables)
- `docs/ARCHITECTURE.md` — organização de módulos em `src/`

**Padrão de referência:** Case Variables — implementação similar (registry, view.addAction, popover compartilhado). Usar como blueprint em todo lugar que fizer sentido. Arquivos relevantes: `src/core/caseVariables/caseVariablesRegistry.ts`, `src/core/caseVariables/propertiesPopover.ts`, `src/main.ts` (bootstrap `addCaseVariablesActionToView`).

---

## Pre-flight (executar antes da Task 1)

- [ ] **Criar branch:**
  ```bash
  git checkout main
  git pull
  git checkout -b feat/toggle-visibility
  ```

- [ ] **Confirmar estado limpo:**
  ```bash
  git status
  ```
  Expected: "working tree clean" ou apenas arquivos untracked não relacionados (`PROMPT_PARQUET.md`).

- [ ] **Baseline de testes:**
  ```bash
  npm run test
  ```
  Expected: todos os testes passam. Anotar contagem atual (ex.: "2060 testes em 108 suites") — vai servir de baseline pra task 17.

- [ ] **Baseline do build:**
  ```bash
  npm run build
  ```
  Expected: sai 0, `main.js` gerado.

---

## Chunk 1: Foundation — state + events + vault listeners

### Task 1: Schema changes em `types.ts`

Adiciona `hidden?: boolean` ao `CodeDefinition` e nova seção `visibilityOverrides` em `QualiaData`. Atualiza `createDefaultData()`.

**Files:**
- Modify: `src/core/types.ts:71-89` (adicionar `hidden?`)
- Modify: `src/core/types.ts:110-146` (adicionar section em `QualiaData`)
- Modify: `src/core/types.ts:148-174` (inicializar `visibilityOverrides: {}`)

**TDD rationale:** schema é declarativo. O teste desse schema acontece naturalmente no task 2 (helpers puros consomem). Sem teste isolado aqui.

- [ ] **Step 1: Editar `CodeDefinition`**

  Em `src/core/types.ts`, na interface `CodeDefinition` (linhas 71-89), adicionar imediatamente antes do `// Virtual folders (Phase B)`:
  ```ts
  	// Visibility toggle (Phase F)
  	/** When true, this code is globally hidden from editor renders. Analytics/export não são afetados. */
  	hidden?: boolean;
  ```

- [ ] **Step 2: Declarar nova seção em `QualiaData`**

  Em `src/core/types.ts`, na interface `QualiaData` (linhas 110-146), adicionar após `caseVariables: CaseVariablesSection;`:
  ```ts
  	/** Per-doc visibility overrides. overrides[fileId][codeId] = effective visibility in that doc.
  	 *  Self-cleaning: entries só existem quando divergem do global. */
  	visibilityOverrides: Record<string, Record<string, boolean>>;
  ```

- [ ] **Step 3: Adicionar default em `createDefaultData()`**

  Em `src/core/types.ts` `createDefaultData()` (linhas 148-174), adicionar após `caseVariables: { values: {}, types: {} },`:
  ```ts
  		visibilityOverrides: {},
  ```

- [ ] **Step 4: Rodar tsc + testes pra ver que nada quebrou**

  ```bash
  npm run build
  npm run test
  ```
  Expected: build passa; todos os testes passam (nada novo adicionado ainda).

- [ ] **Step 5: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): schema hidden + visibilityOverrides em QualiaData"
  ```

---

### Task 2: Helper puro `codeVisibility.ts`

Funções puras sem dependências externas. Fundamento da feature.

**Files:**
- Create: `src/core/codeVisibility.ts`
- Test: `tests/core/codeVisibility.test.ts`

- [ ] **Step 1: Escrever o teste (TDD, antes do código)**

  Criar `tests/core/codeVisibility.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import {
  	isCodeVisibleInFile,
  	shouldStoreOverride,
  	cleanOverridesAfterGlobalChange,
  } from '../../src/core/codeVisibility';

  describe('isCodeVisibleInFile', () => {
  	const overrides = { 'doc.md': { c1: true, c2: false } };

  	it('returns override when present (true)', () => {
  		expect(isCodeVisibleInFile('c1', 'doc.md', false, overrides)).toBe(true);
  	});

  	it('returns override when present (false)', () => {
  		expect(isCodeVisibleInFile('c2', 'doc.md', false, overrides)).toBe(false);
  	});

  	it('override wins over global hidden', () => {
  		expect(isCodeVisibleInFile('c1', 'doc.md', true, overrides)).toBe(true);
  	});

  	it('no override falls back to !global', () => {
  		expect(isCodeVisibleInFile('c3', 'doc.md', false, overrides)).toBe(true);
  		expect(isCodeVisibleInFile('c3', 'doc.md', true, overrides)).toBe(false);
  	});

  	it('no override and no entry for fileId', () => {
  		expect(isCodeVisibleInFile('c1', 'other.md', true, overrides)).toBe(false);
  	});
  });

  describe('shouldStoreOverride', () => {
  	it('returns false when override equals !global (coincides)', () => {
  		expect(shouldStoreOverride(true, false)).toBe(false);  // visible + global visible
  		expect(shouldStoreOverride(false, true)).toBe(false);  // hidden + global hidden
  	});

  	it('returns true when override diverges from global', () => {
  		expect(shouldStoreOverride(true, true)).toBe(true);   // visible override + global hidden
  		expect(shouldStoreOverride(false, false)).toBe(true); // hidden override + global visible
  	});
  });

  describe('cleanOverridesAfterGlobalChange', () => {
  	it('removes entries that now coincide with new global state', () => {
  		const overrides = {
  			'a.md': { c1: true, c2: false },
  			'b.md': { c1: false, c3: true },
  		};
  		// c1 global goes from hidden → visible. Entries c1: true now coincide (redundant).
  		const result = cleanOverridesAfterGlobalChange(overrides, 'c1', false);
  		expect(result['a.md']).toEqual({ c2: false });
  		expect(result['b.md']).toEqual({ c1: false, c3: true });  // c1: false still diverges
  	});

  	it('deletes the fileId key if its map becomes empty', () => {
  		const overrides = { 'a.md': { c1: true } };
  		const result = cleanOverridesAfterGlobalChange(overrides, 'c1', false);
  		expect(result['a.md']).toBeUndefined();
  	});

  	it('returns unchanged when no entries coincide', () => {
  		const overrides = { 'a.md': { c1: false } };
  		// c1 stays globally visible (hidden=false). override c1:false diverges still.
  		const result = cleanOverridesAfterGlobalChange(overrides, 'c1', false);
  		expect(result).toEqual(overrides);
  	});
  });
  ```

- [ ] **Step 2: Rodar o teste — deve falhar (arquivo não existe)**

  ```bash
  npm run test -- tests/core/codeVisibility.test.ts
  ```
  Expected: FAIL com "Cannot find module '../../src/core/codeVisibility'".

- [ ] **Step 3: Implementar `codeVisibility.ts`**

  Criar `src/core/codeVisibility.ts`:
  ```ts
  /**
   * Code visibility — pure helpers.
   *
   * Composes global CodeDefinition.hidden with per-doc visibilityOverrides
   * into a single "is this code visible in this file?" check.
   *
   * Semântica B (self-cleaning): overrides só existem quando divergem do global.
   */

  export type VisibilityOverrides = Record<string, Record<string, boolean>>;

  /** Efetiva: override > global. */
  export function isCodeVisibleInFile(
  	codeId: string,
  	fileId: string,
  	globalHidden: boolean,
  	overrides: VisibilityOverrides,
  ): boolean {
  	const override = overrides[fileId]?.[codeId];
  	if (override !== undefined) return override;
  	return !globalHidden;
  }

  /**
   * Deve gravar esse override em data.json?
   *
   * @param desiredVisible o valor que o user quer (true = visible, false = hidden)
   * @param globalHidden o estado global atual do código
   * @returns true se o override diverge do global (vale gravar); false se coincide (descarta)
   */
  export function shouldStoreOverride(desiredVisible: boolean, globalHidden: boolean): boolean {
  	const globalVisible = !globalHidden;
  	return desiredVisible !== globalVisible;
  }

  /**
   * Após mudar `code.hidden` globalmente, varre todos os overrides e remove os que
   * passaram a coincidir com o novo estado global (ficaram redundantes).
   *
   * Retorna um novo objeto (imutável — não muta input).
   */
  export function cleanOverridesAfterGlobalChange(
  	overrides: VisibilityOverrides,
  	codeId: string,
  	newGlobalHidden: boolean,
  ): VisibilityOverrides {
  	const newGlobalVisible = !newGlobalHidden;
  	const result: VisibilityOverrides = {};

  	for (const [fileId, perFile] of Object.entries(overrides)) {
  		const entry = perFile[codeId];
  		if (entry === undefined || entry !== newGlobalVisible) {
  			// Mantém: não é do código afetado OU ainda diverge
  			result[fileId] = { ...perFile };
  			continue;
  		}
  		// Remove a entry específica (coincide com global agora)
  		const filtered = { ...perFile };
  		delete filtered[codeId];
  		// Se sobrou entrada, mantém o fileId; senão, descarta a chave
  		if (Object.keys(filtered).length > 0) {
  			result[fileId] = filtered;
  		}
  	}

  	return result;
  }
  ```

- [ ] **Step 4: Rodar o teste — deve passar**

  ```bash
  npm run test -- tests/core/codeVisibility.test.ts
  ```
  Expected: PASS em todos os cases.

- [ ] **Step 5: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): helpers puros isCodeVisibleInFile + self-cleaning + testes"
  ```

---

### Task 3: Métodos de visibility no `CodeDefinitionRegistry`

Métodos para mutação e leitura. Reusa o padrão existente `onMutateListeners` (linha 29 de `codeDefinitionRegistry.ts`).

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts` (adicionar campos, métodos, events)
- Test: `tests/core/codeDefinitionRegistry.visibility.test.ts` (novo arquivo, padrão de `*.hierarchy.test.ts`)

**Contrato dos métodos novos:**

```ts
class CodeDefinitionRegistry {
	// ...existing

	// State (ficarão no registry, persistidos via DataManager)
	visibilityOverrides: VisibilityOverrides = {};

	// Reads
	getGlobalHidden(codeId: string): boolean;
	getDocOverride(fileId: string, codeId: string): boolean | undefined;
	isCodeVisibleInFile(codeId: string, fileId: string): boolean;
	hasAnyOverrideForFile(fileId: string): boolean;

	// Mutations (aplicam self-cleaning + emitem visibility-changed)
	setGlobalHidden(codeId: string, hidden: boolean): void;
	setDocOverride(fileId: string, codeId: string, visible: boolean): void;
	clearDocOverrides(fileId: string): void;

	// Visibility events (separate listener set — visibility-changed, not onMutate)
	addVisibilityListener(fn: (detail: VisibilityChangedDetail) => void): void;
	removeVisibilityListener(fn: (detail: VisibilityChangedDetail) => void): void;
}

interface VisibilityChangedDetail {
	codeIds: Set<string>;
	fileIds?: Set<string>;  // ausente = change global (afeta todos os fileIds)
}
```

Nota: **emit distinto do `onMutate`.** `onMutate` dispara em create/update/delete de códigos (reconstruir tree). `visibility-changed` dispara em mudança de visibility (refrescar render). Sidebar escuta ambos; engines só escutam visibility.

- [ ] **Step 1: Escrever o teste**

  Criar `tests/core/codeDefinitionRegistry.visibility.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
  	registry = new CodeDefinitionRegistry();
  });

  describe('setGlobalHidden', () => {
  	it('toggles code.hidden and emits visibility-changed with codeIds', () => {
  		const c1 = registry.create('c1');
  		const spy = vi.fn();
  		registry.addVisibilityListener(spy);

  		registry.setGlobalHidden(c1.id, true);

  		expect(registry.getById(c1.id)!.hidden).toBe(true);
  		expect(spy).toHaveBeenCalledOnce();
  		expect(spy.mock.calls[0][0]).toMatchObject({
  			codeIds: new Set([c1.id]),
  		});
  	});

  	it('self-cleans overrides that now coincide with new global state', () => {
  		const c1 = registry.create('c1');
  		registry.visibilityOverrides = {
  			'a.md': { [c1.id]: true },  // override visible + global vai virar visible (coincide)
  			'b.md': { [c1.id]: false }, // override hidden + global vai virar visible (diverge)
  		};
  		registry.setGlobalHidden(c1.id, false);  // global visible (hidden=false)

  		expect(registry.visibilityOverrides['a.md']).toBeUndefined();  // removido
  		expect(registry.visibilityOverrides['b.md']).toEqual({ [c1.id]: false });
  	});
  });

  describe('setDocOverride', () => {
  	it('stores override when it diverges from global', () => {
  		const c1 = registry.create('c1');
  		// global visible. Set hidden override on file.
  		registry.setDocOverride('a.md', c1.id, false);

  		expect(registry.visibilityOverrides['a.md']).toEqual({ [c1.id]: false });
  	});

  	it('does NOT store override when it coincides with global (entry side self-clean)', () => {
  		const c1 = registry.create('c1');
  		registry.setDocOverride('a.md', c1.id, true);  // override visible + global already visible

  		expect(registry.visibilityOverrides['a.md']).toBeUndefined();
  	});

  	it('removes existing override if new value coincides with global', () => {
  		const c1 = registry.create('c1');
  		registry.visibilityOverrides = { 'a.md': { [c1.id]: false } };  // existing hidden override
  		registry.setDocOverride('a.md', c1.id, true);  // set visible; now coincides with global visible

  		expect(registry.visibilityOverrides['a.md']).toBeUndefined();
  	});

  	it('emits visibility-changed with both codeIds and fileIds', () => {
  		const c1 = registry.create('c1');
  		const spy = vi.fn();
  		registry.addVisibilityListener(spy);

  		registry.setDocOverride('a.md', c1.id, false);

  		expect(spy).toHaveBeenCalledOnce();
  		expect(spy.mock.calls[0][0]).toMatchObject({
  			codeIds: new Set([c1.id]),
  			fileIds: new Set(['a.md']),
  		});
  	});
  });

  describe('clearDocOverrides', () => {
  	it('deletes all overrides for the file and emits event with its codeIds', () => {
  		const c1 = registry.create('c1');
  		const c2 = registry.create('c2');
  		registry.visibilityOverrides = { 'a.md': { [c1.id]: false, [c2.id]: true } };
  		const spy = vi.fn();
  		registry.addVisibilityListener(spy);

  		registry.clearDocOverrides('a.md');

  		expect(registry.visibilityOverrides['a.md']).toBeUndefined();
  		expect(spy.mock.calls[0][0]).toMatchObject({
  			codeIds: new Set([c1.id, c2.id]),
  			fileIds: new Set(['a.md']),
  		});
  	});

  	it('no-op when file has no overrides (no event)', () => {
  		const spy = vi.fn();
  		registry.addVisibilityListener(spy);
  		registry.clearDocOverrides('nonexistent.md');
  		expect(spy).not.toHaveBeenCalled();
  	});
  });

  describe('isCodeVisibleInFile', () => {
  	it('integrates with code.hidden and overrides', () => {
  		const c1 = registry.create('c1');
  		registry.setGlobalHidden(c1.id, true);
  		expect(registry.isCodeVisibleInFile(c1.id, 'a.md')).toBe(false);

  		registry.setDocOverride('a.md', c1.id, true);  // diverge: visible
  		expect(registry.isCodeVisibleInFile(c1.id, 'a.md')).toBe(true);
  		expect(registry.isCodeVisibleInFile(c1.id, 'b.md')).toBe(false);  // still hidden globally
  	});
  });

  describe('hasAnyOverrideForFile', () => {
  	it('returns true if fileId has any override', () => {
  		const c1 = registry.create('c1');
  		registry.setDocOverride('a.md', c1.id, false);
  		expect(registry.hasAnyOverrideForFile('a.md')).toBe(true);
  		expect(registry.hasAnyOverrideForFile('b.md')).toBe(false);
  	});
  });
  ```

- [ ] **Step 2: Rodar teste — deve falhar (métodos não existem)**

  ```bash
  npm run test -- tests/core/codeDefinitionRegistry.visibility.test.ts
  ```
  Expected: FAIL com "addVisibilityListener is not a function" ou similar.

- [ ] **Step 3: Implementar métodos + listeners no registry**

  Em `src/core/codeDefinitionRegistry.ts`:

  a) Adicionar import no topo:
  ```ts
  import { cleanOverridesAfterGlobalChange, shouldStoreOverride, isCodeVisibleInFile as isVisibleHelper } from './codeVisibility';
  import type { VisibilityOverrides } from './codeVisibility';
  ```

  b) Adicionar interface e campos privados na classe (perto do `onMutateListeners`):
  ```ts
  	private visibilityListeners: Set<(detail: VisibilityChangedDetail) => void> = new Set();

  	/** Per-doc overrides: overrides[fileId][codeId] = visibility nesse doc. */
  	visibilityOverrides: VisibilityOverrides = {};
  ```

  c) Adicionar a interface exportada (no topo do arquivo, após palette):
  ```ts
  export interface VisibilityChangedDetail {
  	codeIds: Set<string>;
  	fileIds?: Set<string>;  // presente quando change é per-doc; ausente = change global
  }
  ```

  d) Adicionar os métodos (após `removeOnMutate`, mantendo o agrupamento):
  ```ts
  	/** Register a callback invoked on visibility changes (global or per-doc). */
  	addVisibilityListener(fn: (detail: VisibilityChangedDetail) => void): void {
  		this.visibilityListeners.add(fn);
  	}

  	removeVisibilityListener(fn: (detail: VisibilityChangedDetail) => void): void {
  		this.visibilityListeners.delete(fn);
  	}

  	private emitVisibility(detail: VisibilityChangedDetail): void {
  		for (const fn of this.visibilityListeners) fn(detail);
  	}

  	// --- Visibility reads ---

  	getGlobalHidden(codeId: string): boolean {
  		return this.definitions.get(codeId)?.hidden === true;
  	}

  	getDocOverride(fileId: string, codeId: string): boolean | undefined {
  		return this.visibilityOverrides[fileId]?.[codeId];
  	}

  	isCodeVisibleInFile(codeId: string, fileId: string): boolean {
  		return isVisibleHelper(codeId, fileId, this.getGlobalHidden(codeId), this.visibilityOverrides);
  	}

  	hasAnyOverrideForFile(fileId: string): boolean {
  		const file = this.visibilityOverrides[fileId];
  		return !!file && Object.keys(file).length > 0;
  	}

  	// --- Visibility mutations ---

  	setGlobalHidden(codeId: string, hidden: boolean): void {
  		const def = this.definitions.get(codeId);
  		if (!def) return;
  		def.hidden = hidden || undefined;  // undefined = visible (mantém JSON enxuto)
  		def.updatedAt = Date.now();
  		this.visibilityOverrides = cleanOverridesAfterGlobalChange(this.visibilityOverrides, codeId, hidden);
  		this.emitVisibility({ codeIds: new Set([codeId]) });
  	}

  	setDocOverride(fileId: string, codeId: string, visible: boolean): void {
  		const globalHidden = this.getGlobalHidden(codeId);
  		const perFile = this.visibilityOverrides[fileId] ?? {};

  		if (shouldStoreOverride(visible, globalHidden)) {
  			this.visibilityOverrides[fileId] = { ...perFile, [codeId]: visible };
  		} else {
  			// Coincide com global — não grava; se havia override prévio, remove.
  			if (codeId in perFile) {
  				const { [codeId]: _, ...rest } = perFile;
  				if (Object.keys(rest).length > 0) {
  					this.visibilityOverrides[fileId] = rest;
  				} else {
  					delete this.visibilityOverrides[fileId];
  				}
  			}
  		}
  		this.emitVisibility({ codeIds: new Set([codeId]), fileIds: new Set([fileId]) });
  	}

  	clearDocOverrides(fileId: string): void {
  		const perFile = this.visibilityOverrides[fileId];
  		if (!perFile || Object.keys(perFile).length === 0) return;

  		const affectedCodeIds = new Set(Object.keys(perFile));
  		delete this.visibilityOverrides[fileId];
  		this.emitVisibility({ codeIds: affectedCodeIds, fileIds: new Set([fileId]) });
  	}
  ```

- [ ] **Step 4: Rodar o teste — deve passar**

  ```bash
  npm run test -- tests/core/codeDefinitionRegistry.visibility.test.ts
  ```
  Expected: PASS em todos os cases.

  Rodar suite completa pra garantir que não quebrou nada:
  ```bash
  npm run test
  ```
  Expected: todos os testes passam.

- [ ] **Step 5: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): métodos no CodeDefinitionRegistry + visibility-changed event + testes"
  ```

---

### Task 4: Cleanup de overrides em `delete` (cobre merge transitivamente)

Código deletado deixa overrides órfãos — limpeza garantida.

**Nota sobre merge:** o método de merge **não é da registry**. Está em `src/core/mergeModal.ts:31` como função `executeMerge(params)`, que reassocia markers do código fonte ao alvo e **chama `registry.delete(sourceId)`** (linha 73). Portanto, cleanup implementado em `registry.delete` cobre merge transitivamente — zero código extra necessário pra merge.

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts` — método `delete(id: string): boolean` (linha 128)
- Test: `tests/core/codeDefinitionRegistry.visibility.test.ts` (adicionar describe)

- [ ] **Step 1: Escrever testes (adicionar ao arquivo existente)**

  Adicionar ao final de `tests/core/codeDefinitionRegistry.visibility.test.ts`:
  ```ts
  describe('cleanup on code delete', () => {
  	it('removes all overrides referencing the deleted code', () => {
  		const c1 = registry.create('c1');
  		const c2 = registry.create('c2');
  		registry.visibilityOverrides = {
  			'a.md': { [c1.id]: false, [c2.id]: true },
  			'b.md': { [c1.id]: true },
  		};

  		registry.delete(c1.id);

  		expect(registry.visibilityOverrides['a.md']).toEqual({ [c2.id]: true });
  		expect(registry.visibilityOverrides['b.md']).toBeUndefined();  // sobrou vazio → key deletada
  	});

  	it('merge cleanup is transitive via delete (documented behavior)', () => {
  		// executeMerge() em mergeModal.ts chama registry.delete(sourceId),
  		// então o cleanup de delete já cobre merge. Esse teste documenta a premissa.
  		const source = registry.create('source');
  		const target = registry.create('target');
  		registry.visibilityOverrides = {
  			'a.md': { [source.id]: true, [target.id]: false },
  		};

  		registry.delete(source.id);  // simula o que executeMerge faz

  		expect(registry.visibilityOverrides['a.md']).toEqual({ [target.id]: false });
  	});
  });
  ```

- [ ] **Step 2: Rodar teste — deve falhar**

  ```bash
  npm run test -- tests/core/codeDefinitionRegistry.visibility.test.ts
  ```
  Expected: FAIL nos 2 cases novos.

- [ ] **Step 3: Implementar cleanup dentro de `delete(id)`**

  Em `src/core/codeDefinitionRegistry.ts`, localizar `delete(id: string): boolean` (linha ~128). **O parâmetro é `id`, não `codeId`**. Adicionar o cleanup ANTES do emit de `onMutateListeners`:
  ```ts
  	// Visibility cleanup: remover overrides do código deletado em todos os docs
  	for (const fileId of Object.keys(this.visibilityOverrides)) {
  		const perFile = this.visibilityOverrides[fileId]!;
  		if (id in perFile) {
  			const { [id]: _, ...rest } = perFile;
  			if (Object.keys(rest).length > 0) {
  				this.visibilityOverrides[fileId] = rest;
  			} else {
  				delete this.visibilityOverrides[fileId];
  			}
  		}
  	}
  ```

- [ ] **Step 4: Rodar teste — deve passar + suite completa**

  ```bash
  npm run test
  ```
  Expected: PASS em tudo.

- [ ] **Step 5: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): cleanup de overrides em registry.delete (cobre merge transitivamente) + testes"
  ```

---

### Task 5: Event bus com rAF coalescing

Reusa pattern existente se houver; caso contrário cria módulo novo.

**Files:**
- Create: `src/core/visibilityEventBus.ts`
- Test: `tests/core/visibilityEventBus.test.ts`

**Contrato:**

```ts
class VisibilityEventBus {
	subscribe(fn: (codeIds: Set<string>) => void): () => void;  // retorna unsubscribe
	notify(codeIds: Set<string>): void;  // batch via rAF
	flush(): void;  // sync flush (para testes)
}

export const visibilityEventBus = new VisibilityEventBus();
```

Batches múltiplas chamadas em um frame: nada é executado sincronamente; tudo vai pro próximo rAF e vira um único `refreshVisibility(unionCodeIds)`.

- [ ] **Step 1: Escrever teste**

  Criar `tests/core/visibilityEventBus.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import { VisibilityEventBus } from '../../src/core/visibilityEventBus';

  describe('VisibilityEventBus', () => {
  	let bus: VisibilityEventBus;

  	beforeEach(() => {
  		bus = new VisibilityEventBus();
  	});

  	it('coalesces multiple notify calls into single callback batch', () => {
  		const cb = vi.fn();
  		bus.subscribe(cb);

  		bus.notify(new Set(['c1']));
  		bus.notify(new Set(['c2', 'c3']));
  		bus.notify(new Set(['c1']));  // dup

  		expect(cb).not.toHaveBeenCalled();  // ainda não rodou rAF
  		bus.flush();

  		expect(cb).toHaveBeenCalledOnce();
  		expect(cb.mock.calls[0][0]).toEqual(new Set(['c1', 'c2', 'c3']));
  	});

  	it('subscribe returns an unsubscribe function', () => {
  		const cb = vi.fn();
  		const unsub = bus.subscribe(cb);
  		unsub();
  		bus.notify(new Set(['c1']));
  		bus.flush();
  		expect(cb).not.toHaveBeenCalled();
  	});

  	it('independently notifies multiple subscribers', () => {
  		const a = vi.fn();
  		const b = vi.fn();
  		bus.subscribe(a);
  		bus.subscribe(b);

  		bus.notify(new Set(['c1']));
  		bus.flush();

  		expect(a).toHaveBeenCalledOnce();
  		expect(b).toHaveBeenCalledOnce();
  	});

  	it('flush is no-op when nothing pending', () => {
  		const cb = vi.fn();
  		bus.subscribe(cb);
  		bus.flush();
  		expect(cb).not.toHaveBeenCalled();
  	});
  });
  ```

- [ ] **Step 2: Rodar teste — deve falhar**

  ```bash
  npm run test -- tests/core/visibilityEventBus.test.ts
  ```
  Expected: FAIL com "Cannot find module".

- [ ] **Step 3: Implementar bus**

  Criar `src/core/visibilityEventBus.ts`:
  ```ts
  /**
   * VisibilityEventBus — coalesces visibility change notifications within a single
   * animation frame (or microtask fallback for jsdom tests).
   *
   * Each engine subscribes once per VIEW INSTANCE (not per file). Multiple views
   * of the same doc each subscribe and each re-render.
   */

  export class VisibilityEventBus {
  	private subscribers: Set<(codeIds: Set<string>) => void> = new Set();
  	private pending: Set<string> = new Set();
  	private scheduled = false;

  	subscribe(fn: (codeIds: Set<string>) => void): () => void {
  		this.subscribers.add(fn);
  		return () => this.subscribers.delete(fn);
  	}

  	notify(codeIds: Set<string>): void {
  		codeIds.forEach(id => this.pending.add(id));
  		if (this.scheduled) return;
  		this.scheduled = true;
  		// Use requestAnimationFrame no browser; fallback sync para jsdom
  		const schedule = typeof requestAnimationFrame !== 'undefined'
  			? requestAnimationFrame
  			: (cb: () => void) => queueMicrotask(() => cb());
  		schedule(() => this.flush());
  	}

  	/** Immediate flush — para testes e emergency sync. */
  	flush(): void {
  		if (this.pending.size === 0) {
  			this.scheduled = false;
  			return;
  		}
  		const batch = this.pending;
  		this.pending = new Set();
  		this.scheduled = false;
  		for (const fn of this.subscribers) fn(batch);
  	}
  }

  /** Singleton — usado em todo o plugin. */
  export const visibilityEventBus = new VisibilityEventBus();
  ```

- [ ] **Step 4: Rodar teste**

  ```bash
  npm run test -- tests/core/visibilityEventBus.test.ts
  ```
  Expected: PASS.

- [ ] **Step 5: Conectar registry → bus**

  Em `src/main.ts` (ou onde o registry é inicializado, procurar `new CodeDefinitionRegistry` ou `dataManager.init`):
  ```ts
  import { visibilityEventBus } from './core/visibilityEventBus';

  // Após instanciar o registry:
  registry.addVisibilityListener((detail) => {
  	visibilityEventBus.notify(detail.codeIds);
  });
  ```

  Rodar:
  ```bash
  npm run build
  npm run test
  ```
  Expected: ambos passam.

- [ ] **Step 6: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): event bus com rAF coalescing + ligação registry → bus"
  ```

---

### Task 6: Vault event listeners — rename e delete

Overrides precisam acompanhar rename e delete de arquivos no vault.

**Files:**
- Modify: `src/main.ts` (adicionar listeners de rename/delete)
- Test: `tests/core/registryVaultEvents.test.ts` (novo, testa isoladamente a lógica de migrateFilePath/clearFilePath)

**Padrão:** Case Variables faz isso em `caseVariablesRegistry.migrateFilePath`. Criar métodos análogos no `CodeDefinitionRegistry` — ou (preferível, pra isolamento) criar helpers puros e conectar em `main.ts`.

**Opção escolhida:** métodos no registry (simétrico com Case Variables).

- [ ] **Step 1: Escrever teste**

  Criar `tests/core/registryVaultEvents.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
  	registry = new CodeDefinitionRegistry();
  });

  describe('migrateFilePathForOverrides', () => {
  	it('moves overrides from old path to new path', () => {
  		const c1 = registry.create('c1');
  		registry.visibilityOverrides = { 'old.md': { [c1.id]: false } };

  		registry.migrateFilePathForOverrides('old.md', 'new.md');

  		expect(registry.visibilityOverrides['old.md']).toBeUndefined();
  		expect(registry.visibilityOverrides['new.md']).toEqual({ [c1.id]: false });
  	});

  	it('no-op when old path has no overrides', () => {
  		registry.migrateFilePathForOverrides('none.md', 'new.md');
  		expect(registry.visibilityOverrides).toEqual({});
  	});

  	it('emits visibility-changed so views of the new path re-render', () => {
  		const c1 = registry.create('c1');
  		registry.visibilityOverrides = { 'old.md': { [c1.id]: false } };
  		const spy = vi.fn();
  		registry.addVisibilityListener(spy);

  		registry.migrateFilePathForOverrides('old.md', 'new.md');

  		expect(spy).toHaveBeenCalledOnce();
  		expect(spy.mock.calls[0][0]).toMatchObject({
  			codeIds: new Set([c1.id]),
  			fileIds: new Set(['new.md']),
  		});
  	});
  });

  describe('clearFilePathForOverrides', () => {
  	it('deletes overrides for path', () => {
  		const c1 = registry.create('c1');
  		registry.visibilityOverrides = { 'gone.md': { [c1.id]: false } };

  		registry.clearFilePathForOverrides('gone.md');

  		expect(registry.visibilityOverrides['gone.md']).toBeUndefined();
  	});

  	it('no-op when path has no overrides (no event)', () => {
  		const spy = vi.fn();
  		registry.addVisibilityListener(spy);
  		registry.clearFilePathForOverrides('none.md');
  		expect(spy).not.toHaveBeenCalled();
  	});
  });
  ```

- [ ] **Step 2: Rodar teste — falha**

  ```bash
  npm run test -- tests/core/registryVaultEvents.test.ts
  ```
  Expected: FAIL.

- [ ] **Step 3: Implementar os métodos no registry**

  Em `src/core/codeDefinitionRegistry.ts`, adicionar (agrupados com visibility methods):
  ```ts
  	migrateFilePathForOverrides(oldPath: string, newPath: string): void {
  		const entry = this.visibilityOverrides[oldPath];
  		if (!entry) return;
  		this.visibilityOverrides[newPath] = entry;
  		delete this.visibilityOverrides[oldPath];
  		this.emitVisibility({
  			codeIds: new Set(Object.keys(entry)),
  			fileIds: new Set([newPath]),
  		});
  	}

  	clearFilePathForOverrides(fileId: string): void {
  		const entry = this.visibilityOverrides[fileId];
  		if (!entry || Object.keys(entry).length === 0) return;
  		const codeIds = new Set(Object.keys(entry));
  		delete this.visibilityOverrides[fileId];
  		this.emitVisibility({ codeIds, fileIds: new Set([fileId]) });
  	}
  ```

- [ ] **Step 4: Conectar em `main.ts`**

  Em `src/main.ts`, na seção de vault listeners (perto da linha 141 `this.app.vault.on('create', ...)` e linha 154 `this.app.vault.on('delete', ...)`):

  a) Estender o `vault.on('delete')` existente adicionando a chamada ao fim do callback:
  ```ts
  this.registerEvent(this.app.vault.on('delete', (file) => {
  	// ...código existente
  	this.dataManager.registry.clearFilePathForOverrides(file.path);
  }));
  ```

  b) **Não existe listener de rename em `main.ts` hoje.** (Verificado: `grep -n "vault.on('rename'" src/main.ts` retorna vazio; o único rename handler no projeto está em `src/core/fileInterceptor.ts:102`, pra outra finalidade.) Registrar um listener novo:
  ```ts
  this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
  	this.dataManager.registry.migrateFilePathForOverrides(oldPath, file.path);
  }));
  ```

- [ ] **Step 5: Rodar testes + build**

  ```bash
  npm run test
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): migrate/clear overrides em rename/delete do vault + testes"
  ```

---

### Fim do Chunk 1 — checkpoint

Nesse ponto a foundation está pronta: schema, helpers, registry com métodos, event bus, vault listeners. **Zero impacto visual ainda** (nenhum engine consulta visibility). A feature só aparece nos próximos chunks.

**Critério de saída do Chunk 1:**
- [ ] Todos os testes passam (`npm run test`)
- [ ] `npm run build` sem erros
- [ ] 4 novos arquivos criados (`codeVisibility.ts`, `visibilityEventBus.ts` + 2 novos test files)
- [ ] 6 commits feitos (1 por task)

---

## Chunk 2: UI — sidebar eye icon + popover per-view

### Task 7: Eye icon na row do Code Explorer (sidebar)

Adicionar eye inline em cada linha do codebookTreeRenderer. Dim na row quando `hidden`.

**Files:**
- Modify: `src/core/codebookTreeRenderer.ts` (função `renderRow` ~linha 86)
- Modify: `styles.css` (classe `.qc-code-row-hidden` + eye button)
- Test: `tests/core/codebookTreeRenderer.visibility.test.ts` (novo)

**Signature de `renderCodebookTree`** (verificado em `src/core/codebookTreeRenderer.ts:36`):
```ts
renderCodebookTree(
	container: HTMLElement,
	model: SidebarModelInterface,
	state: CodebookTreeState,
	callbacks: CodebookTreeCallbacks,
): { cleanup: () => void }
```
Chamado em `src/core/detailListRenderer.ts:75`. Consumido por `baseCodeDetailView.ts` (linha 17: `import { renderListShell, renderListContent } from './detailListRenderer'`).

**Pattern:** ler `renderRow` (função interna do renderer, chamada em loop de `renderVisibleRows`) pra saber como já adiciona swatch + contador. O eye entra como mais um child DOM.

- [ ] **Step 1: Ler o renderer atual (região do `renderRow`)**

  ```bash
  grep -n "renderRow\|createDiv\|contador\|count" src/core/codebookTreeRenderer.ts | head -20
  ```
  Usar `Read` tool no arquivo e procurar a função que renderiza cada row (chamada dentro do loop `for (let i = startIdx; i < endIdx; i++)` em `renderVisibleRows`).

- [ ] **Step 2: Escrever teste**

  Criar `tests/core/codebookTreeRenderer.visibility.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
  import { renderCodebookTree, type CodebookTreeState, type CodebookTreeCallbacks } from '../../src/core/codebookTreeRenderer';
  import type { SidebarModelInterface } from '../../src/core/types';

  /** Minimal in-memory model just pra exercitar o renderer. */
  function makeModel(registry: CodeDefinitionRegistry): SidebarModelInterface {
  	return {
  		registry,
  		getAllMarkers: () => [],
  		setHoverState: () => {},
  		getHoverMarkerId: () => null,
  		getHoverMarkerIds: () => [],
  		onHoverChange: () => {},
  		offHoverChange: () => {},
  	} as unknown as SidebarModelInterface;
  }

  function makeCallbacks(): CodebookTreeCallbacks {
  	return {
  		// Completar conforme a interface CodebookTreeCallbacks real — no-op pros testes
  	} as CodebookTreeCallbacks;
  }

  describe('codebookTreeRenderer — visibility UI', () => {
  	let container: HTMLElement;
  	let registry: CodeDefinitionRegistry;

  	beforeEach(() => {
  		container = document.createElement('div');
  		document.body.appendChild(container);
  		Object.assign(container.style, { height: '400px', overflow: 'auto' });
  		registry = new CodeDefinitionRegistry();
  	});

  	it('renders eye icon button in each code row', () => {
  		const c1 = registry.create('c1');
  		registry.rootOrder = [c1.id];
  		renderCodebookTree(container, makeModel(registry), { expanded: new Set(), searchQuery: '' } as CodebookTreeState, makeCallbacks());

  		const eye = container.querySelector('.qc-code-row-eye');
  		expect(eye).toBeTruthy();
  	});

  	it('applies qc-code-row-hidden class when code.hidden is true', () => {
  		const c1 = registry.create('c1');
  		registry.setGlobalHidden(c1.id, true);
  		registry.rootOrder = [c1.id];
  		renderCodebookTree(container, makeModel(registry), { expanded: new Set(), searchQuery: '' } as CodebookTreeState, makeCallbacks());

  		const row = container.querySelector('.qc-codebook-row-code');  // ajustar seletor conforme DOM real
  		expect(row!.classList.contains('qc-code-row-hidden')).toBe(true);
  	});

  	it('clicking eye toggles code.hidden', () => {
  		const c1 = registry.create('c1');
  		registry.rootOrder = [c1.id];
  		renderCodebookTree(container, makeModel(registry), { expanded: new Set(), searchQuery: '' } as CodebookTreeState, makeCallbacks());

  		const eye = container.querySelector('.qc-code-row-eye') as HTMLElement;
  		eye.click();
  		expect(registry.getById(c1.id)!.hidden).toBe(true);
  	});
  });
  ```

  **Nota sobre tipos:** `SidebarModelInterface` e `CodebookTreeCallbacks` têm mais campos; usar `as unknown as` / `as <type>` como acima — no-ops pros testes. Se algum método for chamado pelo renderer e falhar, stubbar só o que precisar.

- [ ] **Step 3: Rodar teste — falha**

  ```bash
  npm run test -- tests/core/codebookTreeRenderer.visibility.test.ts
  ```
  Expected: FAIL (sem eye button ainda).

- [ ] **Step 4: Implementar eye icon**

  Em `src/core/codebookTreeRenderer.ts`, dentro de `renderRow`:

  a) Adicionar eye button (após swatch, antes do contador, usar `ExtraButtonComponent`):
  ```ts
  import { ExtraButtonComponent } from 'obsidian';

  // Dentro do renderRow, pra cada row de código:
  const eye = new ExtraButtonComponent(rowEl);
  const def = registry.getById(node.codeId);
  const hidden = def?.hidden === true;
  eye.setIcon(hidden ? 'eye-off' : 'eye');
  eye.setTooltip('Toggle visibility');
  eye.extraSettingsEl.setAttr('aria-label', 'Toggle visibility');
  eye.extraSettingsEl.addClass('qc-code-row-eye');
  eye.onClick(() => {
  	registry.setGlobalHidden(node.codeId, !hidden);
  	// A re-render do tree será disparada pelo visibility-changed listener em step 7
  });

  if (hidden) rowEl.addClass('qc-code-row-hidden');
  ```

  b) Adicionar re-render quando visibility-changed dispara:

  `renderCodebookTree` é chamado em `src/core/detailListRenderer.ts:75`. O wrapper consumidor é `src/core/baseCodeDetailView.ts` (importa o detailListRenderer). Nesse arquivo (em método como `onOpen` / `onload`), registrar o listener com teardown garantido:
  ```ts
  const onVisibilityChange = () => this.refreshTree();  // método já existente que re-renderiza a tree
  this.dataManager.registry.addVisibilityListener(onVisibilityChange);
  this.register(() => this.dataManager.registry.removeVisibilityListener(onVisibilityChange));
  ```

  Se `refreshTree()` não existir com esse nome, procurar o método atual que faz re-render (provavelmente chamado dentro de listeners `onMutate` existentes) e reusar. `this.register(fn)` é o padrão Obsidian pra cleanup automático no `onunload`.

- [ ] **Step 5: Adicionar CSS em `styles.css`**

  ```css
  /* Toggle visibility — Code Explorer */
  .qc-code-row-eye {
  	display: inline-flex;
  	margin-right: 6px;
  	cursor: pointer;
  	color: var(--icon-color-hover);
  }
  .qc-code-row-eye:hover {
  	color: var(--icon-color);
  }
  .qc-code-row-hidden {
  	opacity: 0.5;
  }
  ```

  (Valores de cor consultar `obsidian-design` skill se precisar padronizar.)

- [ ] **Step 6: Rodar testes + build**

  ```bash
  npm run test
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 7: Smoke test manual**

  Com Obsidian aberto no vault `/Users/mosx/Desktop/obsidian-plugins-workbench/`:
  - Abrir o Code Explorer (sidebar)
  - Clicar no eye de um código — verifica se dim visual ocorre
  - Clicar de novo — retorna ao visível
  - Markers no editor **ainda não mudam** (só na Chunk 3)

- [ ] **Step 8: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): eye icon no Code Explorer + dim + testes"
  ```

---

### Task 8: Popover per-view compartilhado

Componente DOM genérico: lista códigos presentes no doc, toggle bidirecional, link "Resetar" quando há overrides.

**Files:**
- Create: `src/core/codeVisibilityPopover.ts`
- Test: `tests/core/codeVisibilityPopover.test.ts`
- Modify: `styles.css` (popover styles)

**Blueprint:** `src/core/caseVariables/propertiesPopover.ts` — mesmo padrão.

**API:**

```ts
interface CodeVisibilityPopoverConfig {
	fileId: string;
	codesInFile: CodeDefinition[];  // já filtrado por "presentes neste doc"
	registry: CodeDefinitionRegistry;
	onClose?: () => void;
}

export function openCodeVisibilityPopover(anchor: HTMLElement, config: CodeVisibilityPopoverConfig): void;
```

A lista `codesInFile` é calculada pelo caller (cada engine sabe quais markers tem no doc atual).

- [ ] **Step 1: Escrever teste**

  Criar `tests/core/codeVisibilityPopover.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
  import { renderCodeVisibilityPopoverBody } from '../../src/core/codeVisibilityPopover';

  describe('codeVisibilityPopover', () => {
  	let container: HTMLElement;
  	let registry: CodeDefinitionRegistry;

  	beforeEach(() => {
  		container = document.createElement('div');
  		registry = new CodeDefinitionRegistry();
  	});

  	it('renders one row per code in file', () => {
  		const c1 = registry.create('c1');
  		const c2 = registry.create('c2');
  		renderCodeVisibilityPopoverBody(container, {
  			fileId: 'doc.md',
  			codesInFile: [c1, c2],
  			registry,
  		});
  		const rows = container.querySelectorAll('.qc-visibility-row');
  		expect(rows.length).toBe(2);
  	});

  	it('shows effective state — override wins over global', () => {
  		const c1 = registry.create('c1');
  		registry.setGlobalHidden(c1.id, true);   // global hidden
  		registry.setDocOverride('doc.md', c1.id, true);  // override visible

  		renderCodeVisibilityPopoverBody(container, {
  			fileId: 'doc.md', codesInFile: [c1], registry,
  		});
  		const row = container.querySelector('.qc-visibility-row');
  		expect(row!.classList.contains('qc-visibility-visible')).toBe(true);
  	});

  	it('clicking eye toggles override for this file only', () => {
  		const c1 = registry.create('c1');
  		renderCodeVisibilityPopoverBody(container, {
  			fileId: 'doc.md', codesInFile: [c1], registry,
  		});
  		const eye = container.querySelector('.qc-visibility-row .qc-eye') as HTMLElement;
  		eye.click();

  		// Before: global visible, no override. After click: hidden in doc.md only.
  		expect(registry.isCodeVisibleInFile(c1.id, 'doc.md')).toBe(false);
  		expect(registry.isCodeVisibleInFile(c1.id, 'other.md')).toBe(true);
  	});

  	it('Resetar link only appears when fileId has overrides', () => {
  		const c1 = registry.create('c1');
  		renderCodeVisibilityPopoverBody(container, {
  			fileId: 'doc.md', codesInFile: [c1], registry,
  		});
  		expect(container.querySelector('.qc-visibility-reset')).toBeNull();

  		registry.setDocOverride('doc.md', c1.id, false);
  		// Re-render:
  		container.empty();
  		renderCodeVisibilityPopoverBody(container, {
  			fileId: 'doc.md', codesInFile: [c1], registry,
  		});
  		expect(container.querySelector('.qc-visibility-reset')).toBeTruthy();
  	});

  	it('clicking Resetar clears overrides for the file', () => {
  		const c1 = registry.create('c1');
  		registry.setDocOverride('doc.md', c1.id, false);
  		renderCodeVisibilityPopoverBody(container, {
  			fileId: 'doc.md', codesInFile: [c1], registry,
  		});
  		const reset = container.querySelector('.qc-visibility-reset') as HTMLElement;
  		reset.click();

  		expect(registry.hasAnyOverrideForFile('doc.md')).toBe(false);
  	});

  	it('renders empty state when codesInFile is empty', () => {
  		renderCodeVisibilityPopoverBody(container, {
  			fileId: 'doc.md', codesInFile: [], registry,
  		});
  		expect(container.querySelector('.qc-visibility-empty')).toBeTruthy();
  	});
  });
  ```

- [ ] **Step 2: Rodar teste — falha**

  ```bash
  npm run test -- tests/core/codeVisibilityPopover.test.ts
  ```
  Expected: FAIL.

- [ ] **Step 3: Implementar popover**

  Criar `src/core/codeVisibilityPopover.ts`:
  ```ts
  import { Menu, setIcon } from 'obsidian';
  import type { CodeDefinition } from './types';
  import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

  export interface CodeVisibilityPopoverConfig {
  	fileId: string;
  	codesInFile: CodeDefinition[];
  	registry: CodeDefinitionRegistry;
  	onClose?: () => void;
  }

  /**
   * Renderiza o body do popover num container. Extraído pra testabilidade —
   * abrir o popover real (via Menu ou HoverPopover) é responsabilidade do caller.
   */
  export function renderCodeVisibilityPopoverBody(
  	container: HTMLElement,
  	config: CodeVisibilityPopoverConfig,
  ): void {
  	const { fileId, codesInFile, registry } = config;
  	container.empty();
  	container.addClass('qc-visibility-popover-body');

  	const header = container.createDiv({ cls: 'qc-visibility-header' });
  	header.createSpan({ text: 'Códigos neste documento' });

  	if (codesInFile.length === 0) {
  		container.createDiv({ cls: 'qc-visibility-empty', text: 'Nenhum código aplicado neste doc.' });
  		return;
  	}

  	const list = container.createDiv({ cls: 'qc-visibility-list' });
  	for (const code of codesInFile) {
  		renderRow(list, code, fileId, registry, () => {
  			// Re-render após toggle (simples — reconstrói a lista)
  			renderCodeVisibilityPopoverBody(container, config);
  		});
  	}

  	if (registry.hasAnyOverrideForFile(fileId)) {
  		const reset = container.createEl('a', {
  			cls: 'qc-visibility-reset',
  			text: 'Resetar',
  			href: '#',
  		});
  		reset.addEventListener('click', (e) => {
  			e.preventDefault();
  			registry.clearDocOverrides(fileId);
  			renderCodeVisibilityPopoverBody(container, config);
  		});
  	}
  }

  function renderRow(
  	parent: HTMLElement,
  	code: CodeDefinition,
  	fileId: string,
  	registry: CodeDefinitionRegistry,
  	onToggle: () => void,
  ): void {
  	const visible = registry.isCodeVisibleInFile(code.id, fileId);
  	const row = parent.createDiv({ cls: `qc-visibility-row ${visible ? 'qc-visibility-visible' : 'qc-visibility-hidden'}` });

  	const swatch = row.createSpan({ cls: 'qc-visibility-swatch' });
  	swatch.style.backgroundColor = code.color;

  	row.createSpan({ cls: 'qc-visibility-name', text: code.name });

  	const eye = row.createSpan({ cls: 'qc-eye' });
  	setIcon(eye, visible ? 'eye' : 'eye-off');
  	eye.addEventListener('click', () => {
  		registry.setDocOverride(fileId, code.id, !visible);
  		onToggle();
  	});
  }
  ```

- [ ] **Step 4: Adicionar CSS**

  Em `styles.css`:
  ```css
  /* Visibility popover */
  .qc-visibility-popover-body { padding: 8px; min-width: 220px; }
  .qc-visibility-header { font-weight: 600; margin-bottom: 8px; }
  .qc-visibility-list { display: flex; flex-direction: column; gap: 4px; }
  .qc-visibility-row { display: flex; align-items: center; gap: 6px; padding: 2px 4px; }
  .qc-visibility-swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
  .qc-visibility-name { flex: 1; font-size: 0.9em; }
  .qc-visibility-hidden { opacity: 0.5; }
  .qc-eye { cursor: pointer; color: var(--icon-color-hover); display: inline-flex; }
  .qc-eye:hover { color: var(--icon-color); }
  .qc-visibility-reset { display: block; margin-top: 10px; font-size: 0.85em; text-align: right; color: var(--text-muted); text-decoration: underline; }
  .qc-visibility-reset:hover { color: var(--text-normal); }
  .qc-visibility-empty { font-size: 0.9em; color: var(--text-muted); padding: 4px; }
  ```

- [ ] **Step 5: Rodar testes**

  ```bash
  npm run test
  ```
  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): popover compartilhado codeVisibilityPopover + testes"
  ```

---

### Task 9: Bootstrap popover action nos 6 engines

Inserir `view.addAction('eye', 'Toggle code visibility', handler)` no header de cada engine. Reusa o padrão de `addCaseVariablesActionToView` (`src/main.ts:354`).

**Files:**
- Create: função `openCodeVisibilityPopover` em `src/core/codeVisibilityPopover.ts` (extende o arquivo criado na Task 8)
- Modify: `src/main.ts` — nova função privada `addVisibilityActionToView`, chamada nos mesmos hooks de Case Variables

**Blueprint do popover:** `src/core/caseVariables/propertiesPopover.ts:openPropertiesPopover`. Usa plain `document.body.appendChild(div)` + positioning via `getBoundingClientRect()` + outside-click listener com delay de 1 tick. **Não usar Menu/showAtMouseEvent** — a Menu API do Obsidian não expõe `.dom` oficialmente e o positioning ficaria instável.

**Lógica:**
- Ícone base: `eye` (neutro)
- Se `registry.hasAnyOverrideForFile(file.path)` → acrescentar classe `qc-has-overrides` no botão (dot indicator via CSS `::after`)
- Click → abre popover flutuante posicionado abaixo do botão, corpo renderizado via `renderCodeVisibilityPopoverBody`
- Popover fecha em outside-click ou toggle do próprio botão

- [ ] **Step 1: Adicionar `openCodeVisibilityPopover` em `src/core/codeVisibilityPopover.ts`**

  Adicionar ao fim do arquivo criado na Task 8:
  ```ts
  /**
   * Opens a floating visibility popover anchored below the trigger button.
   * Pattern idêntico ao propertiesPopover de Case Variables.
   */
  export function openCodeVisibilityPopover(
  	triggerEl: HTMLElement,
  	config: CodeVisibilityPopoverConfig,
  ): () => void {
  	const popover = document.body.appendChild(document.createElement('div'));
  	popover.className = 'qc-visibility-popover';

  	renderCodeVisibilityPopoverBody(popover, config);

  	const rect = triggerEl.getBoundingClientRect();
  	popover.style.position = 'fixed';
  	popover.style.top = `${rect.bottom + 4}px`;
  	popover.style.right = `${window.innerWidth - rect.right}px`;
  	popover.style.zIndex = '200';

  	let closed = false;
  	const close = () => {
  		if (closed) return;
  		closed = true;
  		popover.remove();
  		document.removeEventListener('click', onOutsideClick, true);
  		config.onClose?.();
  	};

  	const onOutsideClick = (e: MouseEvent) => {
  		if (!popover.contains(e.target as Node) && e.target !== triggerEl) close();
  	};

  	// Delay 1 tick pra evitar fechar imediatamente no click de abertura
  	setTimeout(() => document.addEventListener('click', onOutsideClick, true), 0);

  	return close;
  }
  ```

- [ ] **Step 2: Adicionar função `addVisibilityActionToView` em `src/main.ts`**

  Perto do `addCaseVariablesActionToView` existente (linha ~354). Import de `FileView` e `CodeDefinition` já deve existir:
  ```ts
  private addVisibilityActionToView(view: FileView): void {
  	if (!view.file) return;
  	const existing = view.containerEl.querySelector('.qc-visibility-action');
  	if (existing) return;  // dedupe

  	const button = view.addAction('eye', 'Toggle code visibility', (evt) => {
  		if (!view.file) return;
  		const fileId = view.file.path;
  		const codesInFile = this.collectCodesInFile(fileId);
  		openCodeVisibilityPopover(evt.currentTarget as HTMLElement, {
  			fileId,
  			codesInFile,
  			registry: this.dataManager.registry,
  		});
  	});
  	button.addClass('qc-visibility-action');
  	this.updateVisibilityActionIndicator(view);
  }

  private updateVisibilityActionIndicator(view: FileView): void {
  	const button = view.containerEl.querySelector('.qc-visibility-action');
  	if (!button || !view.file) return;
  	if (this.dataManager.registry.hasAnyOverrideForFile(view.file.path)) {
  		button.classList.add('qc-has-overrides');
  	} else {
  		button.classList.remove('qc-has-overrides');
  	}
  }

  private collectCodesInFile(fileId: string): CodeDefinition[] {
  	// Agrega codeIds únicos dos markers dos 6 engines pra esse fileId.
  	const ids = new Set<string>();
  	const data = this.dataManager.data;

  	// Markdown
  	for (const m of (data.markdown.markers[fileId] ?? [])) {
  		for (const app of m.codes) ids.add(app.codeId);
  	}
  	// PDF (texto + shapes)
  	for (const m of data.pdf.markers) if (m.fileId === fileId) for (const app of m.codes) ids.add(app.codeId);
  	for (const s of data.pdf.shapes) if (s.fileId === fileId) for (const app of s.codes) ids.add(app.codeId);
  	// CSV: SegmentMarker + RowMarker (ambos contam como "presença no doc", spec confirma)
  	for (const m of data.csv.segmentMarkers) if (m.fileId === fileId) for (const app of m.codes) ids.add(app.codeId);
  	for (const m of data.csv.rowMarkers) if (m.fileId === fileId) for (const app of m.codes) ids.add(app.codeId);
  	// Image
  	for (const m of data.image.markers) if (m.fileId === fileId) for (const app of m.codes) ids.add(app.codeId);
  	// Audio
  	for (const f of data.audio.files) if (f.fileId === fileId) for (const m of f.markers) for (const app of m.codes) ids.add(app.codeId);
  	// Video
  	for (const f of data.video.files) if (f.fileId === fileId) for (const m of f.markers) for (const app of m.codes) ids.add(app.codeId);

  	const registry = this.dataManager.registry;
  	return Array.from(ids).map(id => registry.getById(id)!).filter(Boolean);
  }
  ```

  (Ajustar nomes dos campos de `data.*` conforme estrutura real de `QualiaData` em `src/core/types.ts:110-146`.)

- [ ] **Step 3: Conectar nos mesmos hooks de Case Variables**

  Localizar as chamadas exatas de `addCaseVariablesActionToView` (verificado via `grep -n "addCaseVariablesActionToView\b" src/main.ts`):
  - **`src/main.ts:90`** — dentro do `active-leaf-change` listener
  - **`src/main.ts:98`** — dentro de `addActionToAllLeaves`

  Em cada um desses dois call sites, adicionar imediatamente após:
  ```ts
  this.addVisibilityActionToView(leaf.view);  // ou view, conforme o call site
  ```

- [ ] **Step 4: Listener pra atualizar o dot indicator em todas as views abertas**

  Na seção de `onload` do plugin, **após** instanciar o registry, registrar e fazer teardown em hot-reload:
  ```ts
  const onVisibilityChange = () => {
  	this.app.workspace.iterateAllLeaves((leaf) => {
  		if (leaf.view instanceof FileView) {
  			this.updateVisibilityActionIndicator(leaf.view);
  		}
  	});
  };
  this.dataManager.registry.addVisibilityListener(onVisibilityChange);
  this.register(() => this.dataManager.registry.removeVisibilityListener(onVisibilityChange));
  ```

  `this.register(fn)` garante cleanup no `onunload` — essencial pro hot-reload (ver `reference_hot_reload_module_persistence.md` do projeto).

- [ ] **Step 4: CSS pro indicator**

  Em `styles.css`:
  ```css
  .qc-visibility-action.qc-has-overrides::after {
  	content: '';
  	position: absolute;
  	top: 4px; right: 4px;
  	width: 6px; height: 6px;
  	background: var(--interactive-accent);
  	border-radius: 50%;
  }
  .qc-visibility-action { position: relative; }
  ```

- [ ] **Step 5: Build + smoke test manual**

  ```bash
  npm run build
  cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
  ```

  Abrir Obsidian no vault workbench:
  - Abrir um doc markdown com markers → botão eye aparece no header da view
  - Abrir um PDF com markers → idem
  - Abrir CSV → idem
  - Abrir image → idem
  - Abrir audio → idem
  - Abrir video → idem
  - Clicar no eye → popover abre com lista de códigos do doc (posicionado abaixo do botão)
  - Click fora do popover → fecha
  - Click no eye de um código na lista → override aplicado (dados salvos; render ainda não atualiza visualmente — vem na Chunk 3)
  - **Dot indicator**: após criar um override, header do botão eye ganha o dot; após limpar todos (link "Resetar"), o dot some
  - Fechar e reabrir popover → estado persiste (lista reflete overrides)
  - Multi-pane: dot indicator aparece nos 2 headers quando override é criado (em qualquer leaf)

- [ ] **Step 6: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): view.addAction + popover bootstrap nos 6 engines"
  ```

---

### Fim do Chunk 2 — checkpoint

Sidebar e popover funcionam completamente do ponto de vista de **mutação de estado**. O único gap até aqui: clicar no eye **não** remove o highlight dos markers nos editores ainda. Isso é a Chunk 3.

**Critério de saída:**
- [ ] Testes passam
- [ ] Build limpo
- [ ] Smoke manual: eye no sidebar + popover em cada engine funcionam
- [ ] 3 commits (tasks 7, 8, 9)

---

## Chunk 3: Engine render filters + wrap up

Cada engine implementa `refreshVisibility(affectedCodeIds)`. Dentro do `refreshVisibility`, invalida apenas markers que contêm algum `codeId` afetado. Filtro no render: `registry.isCodeVisibleInFile(codeId, fileId)`.

### Task 10: Markdown CM6 — rebuild filtered

CM6 decorations são atômicas — rebuild completo com filtro no loop de build.

**Files:**
- Modify: `src/markdown/cm6/markerViewPlugin.ts` (decorator builder: filter; método `refreshVisibility`)
- Modify: quem monta o ViewPlugin (provavelmente em `src/main.ts` ou em `markdown/`): subscribe no event bus

**Pattern:** ler o builder atual de decorations. Onde itera markers, pular markers cujos códigos estão TODOS hidden. Se tem alguns visíveis, renderizar só com esses.

- [ ] **Step 1: Ler o decorator builder atual**

  ```bash
  grep -n "buildDecorations\|Decoration.mark\|Decoration.set" src/markdown/cm6/markerViewPlugin.ts
  ```

  Identificar o loop que gera decorations por marker.

- [ ] **Step 2: Adicionar filter no build**

  Dentro do loop, pra cada marker, filtrar `marker.codes` por `registry.isCodeVisibleInFile(codeApp.codeId, fileId)`:
  ```ts
  const visibleCodes = marker.codes.filter(app =>
  	registry.isCodeVisibleInFile(app.codeId, fileId)
  );
  if (visibleCodes.length === 0) continue;  // marker totalmente oculto: A.1 some
  // ...usar visibleCodes pra compor cor (em vez de marker.codes)
  ```

  **Importante:** passar só `visibleCodes` pro compose color (per-code blending opacity/N usa essa lista).

- [ ] **Step 3: Adicionar `refreshVisibility` na instância do ViewPlugin**

  No ViewPlugin:
  ```ts
  class MarkerViewPluginValue implements PluginValue {
  	// ...existing
  	refreshVisibility(_affectedCodeIds: Set<string>): void {
  		// Em CM6, o mais barato é rebuild completo (decorations são atômicas)
  		this.decorations = this.buildDecorations(this.view);
  	}
  }
  ```

  E subscribe no bus na criação:
  ```ts
  const unsubscribe = visibilityEventBus.subscribe((codeIds) => {
  	this.refreshVisibility(codeIds);
  	this.view.requestMeasure();
  });
  // destroy: unsubscribe()
  ```

- [ ] **Step 4: Testar (unit)**

  Estender `tests/markdown/cm6/markerViewPlugin.test.ts` (ou arquivo análogo) com:
  ```ts
  it('omits decorations for markers with all codes hidden', () => {
  	// Montar fixture com marker cujos codes estão todos com hidden=true
  	// Verificar que decorations.size é 0 pra aquele marker
  });
  ```

  ```bash
  npm run test -- tests/markdown
  ```

- [ ] **Step 5: Smoke manual**

  - Abrir doc markdown com markers
  - Esconder código no sidebar → marker desaparece imediatamente no editor
  - Mostrar de volta → marker volta

- [ ] **Step 6: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): CM6 markdown — rebuild filtered + subscribe ao event bus"
  ```

---

### Task 11: PDF — pontual highlight refresh

**Files:**
- Modify: `src/pdf/highlightRenderer.ts` (filter no `resolveCodeColors`)
- Modify: `src/pdf/pageObserver.ts` (adicionar `refreshVisibility` + subscribe no bus)

**Context:** PDF markers **não têm `beginPage`**. Page é derivada do `beginIndex` via `pageStartOffsets` (ver `src/pdf/pdfPlainText.ts:26-49`, `src/pdf/extractAnchorFromPlainText.ts:22-23`). `pageObserver.renderPage(pageNumber)` (linha 167) é o ponto de re-render por página. Text layer renderiza via event `textlayerrendered` (linha 72).

- [ ] **Step 1: Prep — ler APIs do PDF model**

  ```bash
  grep -n "renderPage\|pageStartOffsets\|beginIndex" src/pdf/pageObserver.ts src/pdf/highlightRenderer.ts | head -20
  ```
  Confirmar:
  - `pageObserver.renderPage(pageNumber: number)` existe (linha 167)
  - Markers têm `beginIndex` (não `beginPage`). Page mapping precisa ser derivado.

- [ ] **Step 2: Filtrar em `resolveCodeColors` (src/pdf/highlightRenderer.ts)**

  ```ts
  function resolveCodeColors(marker: PdfMarker, registry: CodeDefinitionRegistry, fileId: string): string[] {
  	return marker.codes
  		.filter(app => registry.isCodeVisibleInFile(app.codeId, fileId))
  		.map(app => /* cor atual via registry.getById(app.codeId)?.color */);
  }
  ```

  No caller do render (dentro de `renderPage` / `paintMarkersOnPage` / equivalente), se o array retornado for vazio → skip o marker (não pintar rects, não registrar listeners).

- [ ] **Step 3: `refreshVisibility` pontual no pageObserver**

  Em `src/pdf/pageObserver.ts`, adicionar método público:
  ```ts
  refreshVisibility(affectedCodeIds: Set<string>): void {
  	// Identificar páginas que contêm markers afetados
  	const affectedPages = this.findPagesWithCodes(affectedCodeIds);
  	for (const pageNumber of affectedPages) {
  		this.renderPage(pageNumber);
  	}
  }

  private findPagesWithCodes(codeIds: Set<string>): Set<number> {
  	const pages = new Set<number>();
  	const markers = this.model.getMarkersForFile(this.fileId);  // ajustar conforme API do model
  	for (const m of markers) {
  		if (!m.codes.some(app => codeIds.has(app.codeId))) continue;
  		const page = this.pageForMarker(m);  // usar método já existente ou derivar via beginIndex
  		if (page !== null) pages.add(page);
  	}
  	return pages;
  }
  ```

  **Se `pageForMarker` não existir**, derivar via `pageStartOffsets` (padrão do projeto — ver `extractAnchorFromPlainText.ts`):
  ```ts
  private pageForMarker(m: PdfMarker): number | null {
  	const offsets = this.pageStartOffsets;  // carregado via buildPlainText no load
  	if (!offsets) return null;
  	for (let i = offsets.length - 1; i >= 0; i--) {
  		if (offsets[i]! <= m.beginIndex) return i + 1;  // pages são 1-based no renderPage
  	}
  	return 1;
  }
  ```

  Subscribe no bus no `onload` do observer:
  ```ts
  this.unsubscribeVisibility = visibilityEventBus.subscribe((ids) => this.refreshVisibility(ids));
  ```
  Unsubscribe no `onunload`: `this.unsubscribeVisibility?.()`.

- [ ] **Step 4: Testar**

  Adicionar teste em `tests/pdf/highlightRenderer.test.ts` análogo ao markdown.

  ```bash
  npm run test -- tests/pdf
  ```

- [ ] **Step 5: Smoke manual**

  - Abrir PDF com markers
  - Esconder código no sidebar → highlights somem
  - Popover per-doc → override revela

- [ ] **Step 6: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): PDF — pontual highlight refresh + filter em resolveCodeColors"
  ```

---

### Task 12: CSV — AG Grid `refreshCells` pontual

**Files:**
- Modify: `src/csv/csvCodingCellRenderer.ts` (filter no chip loop)
- Modify: `src/csv/csvCodingView.ts` (método `refreshVisibility` via AG Grid API)

- [ ] **Step 1: Filter no renderer**

  Em `csvCodingCellRenderer.ts`, no loop que monta chips:
  ```ts
  const visibleCodes = codeIds.filter(id => registry.isCodeVisibleInFile(id, fileId));
  if (visibleCodes.length === 0) {
  	wrapper.empty();  // cell sem chips
  	return;
  }
  // usar visibleCodes em vez de codeIds
  ```

- [ ] **Step 2: `refreshVisibility` via AG Grid**

  Em `csvCodingView.ts`:
  ```ts
  refreshVisibility(affectedCodeIds: Set<string>): void {
  	if (!this.gridApi) return;
  	// Localizar rows que contêm markers com os codeIds afetados
  	const affectedRows = this.findRowsWithCodes(affectedCodeIds);
  	this.gridApi.refreshCells({
  		rowNodes: affectedRows,
  		force: true,
  	});
  }

  private findRowsWithCodes(codeIds: Set<string>): RowNode[] {
  	const fileId = this.file?.path ?? '';
  	const rowNodes: RowNode[] = [];
  	const relevantMarkers = [
  		...this.model.data.segmentMarkers.filter(m => m.fileId === fileId),
  		...this.model.data.rowMarkers.filter(m => m.fileId === fileId),
  	].filter(m => m.codes.some(app => codeIds.has(app.codeId)));

  	const rowIndices = new Set(relevantMarkers.map(m => m.row));
  	rowIndices.forEach(rowIdx => {
  		const node = this.gridApi!.getRowNode(`${rowIdx}`);
  		if (node) rowNodes.push(node);
  	});
  	return rowNodes;
  }
  ```

  Subscribe no bus no `onOpen` da view, unsubscribe no `onClose`.

- [ ] **Step 3: Testar**

  ```bash
  npm run test -- tests/csv
  ```

- [ ] **Step 4: Smoke manual**

- [ ] **Step 5: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): CSV — AG Grid refreshCells pontual + filter no chip loop"
  ```

---

### Task 13: Image — Fabric region markDirty pontual

**Files:**
- Modify: `src/image/regionLabels.ts` (filter no label render)
- Modify: `src/image/regionHighlight.ts` (filter no highlight)
- Modify: `src/image/imageCodingView.ts` ou quem orquestra (refreshVisibility)

- [ ] **Step 1: Filter no render de regions**

  Em cada função que renderiza labels/highlights, adicionar filter por `isCodeVisibleInFile`.

  Em `regionLabels.ts:updateLabel` (analogamente):
  ```ts
  const visibleCodes = marker.codes.filter(app =>
  	registry.isCodeVisibleInFile(app.codeId, fileId)
  );
  if (visibleCodes.length === 0) {
  	removeLabel(marker);
  	return;
  }
  // usa visibleCodes
  ```

- [ ] **Step 2: `refreshVisibility` pontual**

  Na ImageCodingView:
  ```ts
  refreshVisibility(affectedCodeIds: Set<string>): void {
  	if (!this.canvas) return;
  	const fileId = this.file?.path ?? '';
  	this.canvas.getObjects().forEach(obj => {
  		const markerId = (obj as any).markerId;
  		const marker = this.model.getMarkerById(markerId);
  		if (!marker) return;
  		if (marker.codes.some(app => affectedCodeIds.has(app.codeId))) {
  			obj.dirty = true;
  			// Re-render ou toggle visibility via obj.visible
  			const anyVisible = marker.codes.some(app => this.registry.isCodeVisibleInFile(app.codeId, fileId));
  			obj.visible = anyVisible;
  		}
  	});
  	this.canvas.requestRenderAll();
  }
  ```

- [ ] **Step 3: Testar**

  ```bash
  npm run test -- tests/image
  ```

- [ ] **Step 4: Smoke manual**

- [ ] **Step 5: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): Image — Fabric region markDirty pontual + filter"
  ```

---

### Task 14: Audio/Video — wavesurfer regions pontual

**Files:**
- Modify: `src/media/regionRenderer.ts` (filter)
- Modify: `src/media/mediaViewCore.ts` (refreshVisibility)

Áudio e vídeo compartilham o mesmo core (`mediaViewCore`). Uma implementação cobre ambos.

**Context:** wavesurfer usa plugin de regions — `renderer.getRegionsPlugin()` (verificado em `mediaViewCore.ts:246`) retorna o plugin com métodos `addRegion/clearRegions/getRegions`. `renderer.addRegion({...})` (ver `regionRenderer.ts:79`) é usado pra criar uma region.

- [ ] **Step 1: Prep — ler API real do wavesurfer plugin**

  ```bash
  grep -n "getRegionsPlugin\|addRegion\|clearRegions\|\.regions" src/media/regionRenderer.ts src/media/mediaViewCore.ts | head -20
  ```
  Confirmar assinatura dos métodos que o plugin expõe (`addRegion`, `clearRegions`, ou similar). A API varia entre versões do WaveSurfer — confiar no que o código atual já consome.

- [ ] **Step 2: Filter em `regionRenderer`**

  Na função que renderiza cada region (perto de `renderer.addRegion` linha 79):
  ```ts
  const visibleCodes = marker.codes.filter(app =>
  	registry.isCodeVisibleInFile(app.codeId, fileId)
  );
  if (visibleCodes.length === 0) return;  // não renderiza a region
  // usar visibleCodes pra compor label/cor (em vez de marker.codes)
  ```

- [ ] **Step 3: `refreshVisibility` no core**

  Em `mediaViewCore.ts`:
  ```ts
  refreshVisibility(affectedCodeIds: Set<string>): void {
  	if (!this.renderer) return;
  	const regionsPlugin = this.renderer.getRegionsPlugin();
  	if (!regionsPlugin) return;
  	const fileId = this.getFileId();

  	// Estratégia simples e correta: clear + re-render só os markers afetados +
  	// re-render dos não-afetados (o caller coalesce via rAF, então custo é por frame).
  	// Alternativa mais cirúrgica existe mas depende de a API do plugin expor
  	// getRegion(id)/remove(id) de forma estável. Começar simples:
  	regionsPlugin.clearRegions();
  	const markers = this.allMarkersInFile();
  	for (const m of markers) {
  		const visible = m.codes.some(app => this.registry.isCodeVisibleInFile(app.codeId, fileId));
  		if (!visible) continue;
  		this.addRegion(m);  // método já existente que usa o plugin
  	}
  }
  ```

  Se `clearRegions()` for muito caro num arquivo com 100+ regions, migrar pra diff (remover só as afetadas, adicionar só as novas). Medir primeiro.

- [ ] **Step 3: Testar**

  ```bash
  npm run test -- tests/media tests/audio tests/video
  ```

- [ ] **Step 4: Smoke manual**

- [ ] **Step 5: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "feat(visibility): Audio/Video — wavesurfer regions pontual + filter"
  ```

---

### Task 15: Smoke test integral

Checklist manual completo para validar o fluxo end-to-end.

- [ ] **Step 1: Build + copy pro demo vault**

  ```bash
  npm run build
  cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
  ```

- [ ] **Step 2: Executar checklist manual**

  Vault de teste: `/Users/mosx/Desktop/obsidian-plugins-workbench/`

  - [ ] **Global toggle** — sidebar eye icon esconde markers em markdown, PDF, CSV, image, audio, video
  - [ ] **Dim no sidebar** — row fica com opacity 0.5 quando hidden
  - [ ] **Popover aparece no header** dos 6 engines
  - [ ] **Popover lista códigos presentes** (só os com ≥ 1 marker no doc)
  - [ ] **CSV combina SegmentMarker + RowMarker** no listing
  - [ ] **Per-doc override persiste** após fechar e reabrir o doc
  - [ ] **Self-cleaning Semântica B**: global muda → overrides coincidentes somem
  - [ ] **Dot indicator** no botão eye quando há overrides no doc
  - [ ] **Link "Resetar"** aparece só com overrides; click limpa
  - [ ] **Multi-pane sync**: 2 leaves do mesmo doc atualizam juntas
  - [ ] **Rename de arquivo**: overrides seguem pro novo path (testar em arquivo com override ativo)
  - [ ] **Delete de arquivo**: overrides somem (verificar `data.json` direto)
  - [ ] **Merge de código**: source some junto com seus overrides; target preserva
  - [ ] **Import QDPX**: códigos novos entram como visíveis (default)
  - [ ] **Hot-reload**: Ctrl+P → "Reload without saving" → estado persiste
  - [ ] **Analytics não muda**: gráficos continuam mostrando todos os códigos
  - [ ] **Export QDPX/CSV**: visibility não aparece no output
  - [ ] **Performance**: click rápido em 10 eyes — sem lag perceptível (rAF coalescing)
  - [ ] **Marker com 1 de 2 codes visible** renderiza só o visible
  - [ ] **Popover mostra estado efetivo, não bruto**: código globalmente oculto + override visible no doc → popover mostra como 👁 visível (não como "oculto com exceção"). Estado mostrado é resultado da composição.

  Se algum item falhar, criar sub-task "fix: <item>" e resolver antes de seguir.

- [ ] **Step 3: Commit do resultado (ou fix + commit)**

  Se passou tudo:
  ```bash
  ~/.claude/scripts/commit.sh "chore(visibility): smoke test integral completo pass em todos os 6 engines"
  ```

---

### Task 16: Atualizar docs + ROADMAP

Per convenção do CLAUDE.md — após feature concluída, atualizar docs.

**Files:**
- Modify: `docs/ROADMAP.md` (marcar #1 como feito)
- Modify: `docs/ARCHITECTURE.md` (novo modulo `codeVisibility` + event bus)
- Modify: `docs/TECHNICAL-PATTERNS.md` (§ nova: rAF coalescing pattern; filter in render loops)
- Modify: `CLAUDE.md` (atualizar contagem de testes e estrutura se necessário)

- [ ] **Step 1: ROADMAP**

  Em `docs/ROADMAP.md`:
  - Mover item #1 "Toggle Visibility por Código" da seção "Próximos a atacar" pra seção "Implementados (registro)" com data 2026-04-XX e hash do merge commit
  - Renumerar a frente (se necessário)

- [ ] **Step 2: ARCHITECTURE**

  Adicionar na seção de `src/core/`:
  ```
  codeVisibility.ts          — helpers puros (compose, self-cleaning)
  codeVisibilityPopover.ts   — popover DOM compartilhado (usado por todos os 6 engines)
  visibilityEventBus.ts      — rAF coalescing bus pra notifications
  ```

- [ ] **Step 3: TECHNICAL-PATTERNS**

  Adicionar seção (ajustar número):
  ```markdown
  ## § NN — rAF coalescing pra eventos de UI repetitivos

  Quando um evento de UI pode disparar em rajadas (toggle múltiplos códigos seguidos), usar `requestAnimationFrame` pra coalescer em 1 refresh por frame. Padrão em `src/core/visibilityEventBus.ts`.

  **Pitfall:** em jsdom não há rAF — usar `queueMicrotask` como fallback.

  **Regra:** subscription é **por instância de view**, não por arquivo. Multi-pane (mesmo doc em 2 leaves) = 2 subscribers = 2 refreshes.
  ```

- [ ] **Step 4: CLAUDE.md (só se mudou estrutura)**

  Atualizar contagem de testes (rodar `npm run test` e ver o total) e adicionar na estrutura de `src/core/`:
  ```
  codeVisibility.ts          — helpers puros visibility
  codeVisibilityPopover.ts   — popover visibility compartilhado
  visibilityEventBus.ts      — rAF coalescing bus
  ```

- [ ] **Step 5: Rodar testes finais**

  ```bash
  npm run test
  npm run build
  ```
  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  ~/.claude/scripts/commit.sh "docs(visibility): ROADMAP #1 feito + ARCHITECTURE + TECHNICAL-PATTERNS"
  ```

---

### Task 17: Merge na main

- [ ] **Step 1: Rebase/push final**

  ```bash
  git checkout main
  git pull
  git checkout feat/toggle-visibility
  git rebase main
  # resolver conflitos se houver
  npm run test
  npm run build
  ```

- [ ] **Step 2: Merge**

  Opção A (merge commit pra preservar história):
  ```bash
  git checkout main
  git merge --no-ff feat/toggle-visibility -m "merge: Toggle Visibility por Código (#1 ROADMAP)"
  ```

  Opção B (squash):
  ```bash
  git checkout main
  git merge --squash feat/toggle-visibility
  ~/.claude/scripts/commit.sh "feat(visibility): Toggle Visibility por Código completo — sidebar global + popover per-doc + 6 engines pontual"
  ```

  Preferência do user: confirmar com ele antes de fazer. (Convenção do projeto tem usado merge commit em features grandes — ex: Board Export.)

- [ ] **Step 3: Push**

  ```bash
  git push origin main
  git branch -d feat/toggle-visibility
  ```

- [ ] **Step 4: Sugerir arquivamento do plano (regra global do CLAUDE.md)**

  Após o merge, sugerir ao user (não mover automaticamente):
  > "Feature mergeada. Quer que eu mova `docs/superpowers/plans/2026-04-24-toggle-visibility-por-codigo.md` pro workspace externo `obsidian-qualia-coding/plugin-docs/archive/` (renomeado pra `YYYYMMDD-toggle-visibility.md` com a data do merge)?"
  O user decide. Caminho de archive confirmado em `memory/reference_plan_archive.md`.

---

### Fim do Chunk 3 — checkpoint final

**Critério de saída:**
- [ ] 6 engines filtram markers hidden
- [ ] Popover funciona em todos os 6 engines
- [ ] Global toggle + per-doc override + self-cleaning funcionam
- [ ] Smoke test manual full pass
- [ ] Docs atualizados
- [ ] Merge pra main feito
- [ ] ~17 commits no total

---

## Resumo de arquivos afetados

### Novos (6)
- `src/core/codeVisibility.ts`
- `src/core/visibilityEventBus.ts`
- `src/core/codeVisibilityPopover.ts`
- `tests/core/codeVisibility.test.ts`
- `tests/core/codeDefinitionRegistry.visibility.test.ts`
- `tests/core/visibilityEventBus.test.ts`
- `tests/core/codeVisibilityPopover.test.ts`
- `tests/core/registryVaultEvents.test.ts`
- `tests/core/codebookTreeRenderer.visibility.test.ts`

### Modificados (principais)
- `src/core/types.ts`
- `src/core/codeDefinitionRegistry.ts`
- `src/core/codebookTreeRenderer.ts`
- `src/main.ts`
- `src/markdown/cm6/markerViewPlugin.ts`
- `src/pdf/highlightRenderer.ts` + `pageObserver.ts`
- `src/csv/csvCodingCellRenderer.ts` + `csvCodingView.ts`
- `src/image/regionLabels.ts` + `regionHighlight.ts` + `imageCodingView.ts`
- `src/media/regionRenderer.ts` + `mediaViewCore.ts`
- `styles.css`
- `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/TECHNICAL-PATTERNS.md`, `CLAUDE.md`

### Total estimado
- ~350-450 LOC novos
- ~80-120 LOC modificados (filters em engines)
- ~400 LOC de testes
- 17 commits

---

## Notas finais

- **Sem worktree** — CLAUDE.md do projeto proíbe worktree. Branch direto (`feat/toggle-visibility`).
- **Commits via `~/.claude/scripts/commit.sh`** — regra global.
- **CLAUDE.md skills** — consultar `obsidian-core`, `obsidian-settings`, `obsidian-design`, `obsidian-cm6` quando precisar de padrão de framework.
- **Smoke test é obrigatório** — plugin é dev-only, sem E2E. Task 15 não pode pular.
