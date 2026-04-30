# Convert memo to note — Implementation Plan

> **Para o executor:** este plano roda **inline** no working dir. CLAUDE.md proíbe worktrees neste projeto (hot-reload depende de `main.js` em `.obsidian/plugins/qualia-coding/`). Memory `feedback_sdd_overkill_for_dev_project.md` rejeita SDD aqui — execução inline em branch normal. Steps usam `- [ ]` pra tracking.

**Goal:** materializar memo de Code como arquivo `.md` no vault, com sync bidirecional via vault listeners.

**Architecture:** schema breaking — `memo?: string` vira `memo?: { content: string; materialized?: { path, mtime } }` em 4 entidades. Helpers `getMemoContent` / `setMemoContent` centralizam acesso pra reduzir blast radius. Vault listeners (modify/rename/delete) + reverse-lookup `Map<path, EntityRef>` + self-write tracker mantêm sync.

**Tech Stack:** TypeScript strict, Obsidian API (`vault`, `MetadataCache`, `workspace`), Vitest + jsdom, esbuild.

**Branch:** `feat/convert-memo-to-note` (criar a partir de main).

**Spec de origem:** `docs/superpowers/specs/2026-04-30-convert-memo-to-note-design.md`.

---

## Mapa de arquivos

### Criar

| Path | Responsabilidade |
|---|---|
| `src/core/memoTypes.ts` | `MemoRecord`, `MaterializedRef`, `EntityRef` (discriminated union 5-way), serializers de EntityRef |
| `src/core/memoHelpers.ts` | `getMemoContent`, `setMemoContent`, `hasContent` — accessors puros pra reduzir blast radius do schema breaking |
| `src/core/memoNoteFormat.ts` | `parseMemoNote(text) → { ref, content }`, `serializeMemoNote(ref, codeName, content) → text`, `parseFrontmatter`, `serializeFrontmatter` (puros) |
| `src/core/memoPathResolver.ts` | `resolveConflictPath(vault, basePath) → string` — sufixo `(2)`, `(3)`... (puro com `vault.adapter.exists`) |
| `src/core/memoMaterializer.ts` | `convertMemoToNote(plugin, ref) → Promise<TFile>`, `unmaterialize(plugin, ref)`, `syncToFile(plugin, ref, content)`, `syncFromFile(plugin, file)` |
| `src/core/memoMaterializerListeners.ts` | `registerMemoListeners(plugin)` — vault.on(modify/rename/delete) + reverse-lookup Map + self-write Set |
| `src/core/memoMigration.ts` | `migrateLegacyMemos(data: QualiaData) → QualiaData` — converte `memo: string` → `{ content }` no load (one-shot) |
| `tests/core/memoNoteFormat.test.ts` | unit tests dos parsers/serializers |
| `tests/core/memoPathResolver.test.ts` | unit tests do resolveConflictPath |
| `tests/core/memoHelpers.test.ts` | unit tests dos accessors |
| `tests/core/memoMigration.test.ts` | unit tests da migração legacy |
| `tests/core/memoMaterializer.test.ts` | integration tests com vault mockado |

### Modificar

| Path | Mudança |
|---|---|
| `src/core/types.ts` | `memo?: string` → `memo?: MemoRecord` em 4 entidades (BaseMarker:46, CodeDefinition:89, GroupDefinition:123, CodeRelation:31). `updateMarkerFields` signature em :63 atualiza pra aceitar `MemoRecord \| undefined`. `QualiaData.settings` ganha bloco `memoFolders` |
| `src/core/codeDefinitionRegistry.ts` | `update()`:250-283 normaliza `changes.memo` (aceita `string \| MemoRecord`); `setGroupMemo`:501; `setRelationMemo`:515. Audit `memo_edited` lê via `getMemoContent` |
| `src/core/auditLog.ts` | `appendEntry` coalescing usa `getMemoContent` pra extrair string; tipo `memo_edited` continua com `from/to: string` |
| `src/core/baseSidebarAdapter.ts` | `updateMarkerFields` accepta `MemoRecord` |
| `src/core/baseCodingMenu.ts` | `renderMemoSection` lê via accessor |
| `src/core/detailCodeRenderer.ts` | textarea + save: linhas 353-367 viram render condicional (textarea OR card materializado); botão Convert no header da seção; novo helper `renderMaterializedCard(container, ref, plugin)` |
| `src/core/detailMarkerRenderer.ts` | textarea + save: linhas 97-110 usa `getMemoContent`/`setMemoContent` (sem materializar — Phase 1 = só Code) |
| `src/core/codeApplicationHelpers.ts` | `setApplicationRelationMemo` aceita `MemoRecord` |
| `src/core/mergeModal.ts`, `src/core/mergePolicies.ts` | TextPolicy concatenate/keep usa `getMemoContent` pra ler, `setMemoContent` pra escrever |
| `src/main.ts` | `onload` chama `registerMemoListeners(this)`, `migrateLegacyMemos(data)` antes de instanciar models. `onunload` faz cleanup |
| `src/core/codingPopover.ts` | qualquer `marker.memo` direto vira accessor |
| `src/csv/csvCodingTypes.ts` (e siblings) | nada — herdam de BaseMarker |
| `src/export/qdcExporter.ts`:55-56,93-94 | `group.memo` / `code.memo` → `getMemoContent(group.memo)` / idem |
| `src/export/qdpxExporter.ts`:99,138,190,240,259,327,346,383,401 | `m.memo` → `getMemoContent(m.memo)`; `rel.memo` → `getMemoContent(rel.memo)` |
| `src/import/qdcImporter.ts`:95-117 | `pc.memo` (parsed) é string; `existing.memo` (record) lê via `getMemoContent`; write via `{ memo: { content: merged } }` ou helper `setMemoContent(existing.memo, merged)` |
| `src/import/qdpxImporter.ts` | mesmo pattern |
| `src/export/tabular/buildCodesTable.ts`, `buildGroupsTable.ts`, `buildRelationsTable.ts`, `buildSegmentsTable.ts` | colunas `memo` → `getMemoContent(...)` |
| `src/analytics/data/memoView.ts` | aggregator lê via accessor |
| `src/analytics/views/modes/memoView/onSaveHandlers.ts` | linhas 5-36 usam `setMemoContent` pra preservar `materialized` |
| `src/analytics/views/modes/memoView/renderMemoEditor.ts` | textarea recebe `getMemoContent(memo)`, save vai via onSave que preserva ref |
| `src/analytics/views/modes/memoView/renderCodeSection.ts`, `renderFileSection.ts`, `renderMarkerCard.ts`, `exportMemoCSV.ts`, `exportMemoMarkdown.ts` | accessors |
| `src/analytics/data/codebookTimelineEngine.ts` | `description_edited`/`memo_edited` continuam strings (audit log já normaliza) — sem mudança |
| `styles.css` | classes novas: `.qc-memo-materialized-card`, `.qc-memo-materialized-path`, `.qc-memo-convert-btn`, `.qc-memo-unmaterialize-btn` |
| Settings tab | bloco "Memo materialization" com 4 inputs (`code`, `group`, `marker`, `relation`) — Phase 1 só `code` ativo, outros visíveis mas grayed (pra não mexer Settings depois) |

---

## Chunk 1: Schema base + accessors + migration

**Objetivo:** schema breaking + helpers que centralizam o pattern + migration one-shot. Sem mudar UI ainda. Build deve continuar verde no fim do chunk.

### Task 1.1: criar branch e tipos base

**Files:**
- Create: `src/core/memoTypes.ts`

- [ ] **Step 1: criar branch**

```bash
git checkout -b feat/convert-memo-to-note
```

- [ ] **Step 2: escrever `memoTypes.ts`**

```typescript
import type { EngineType } from '../analytics/data/dataTypes';

export interface MaterializedRef {
	path: string;
	mtime: number;
}

export interface MemoRecord {
	content: string;
	materialized?: MaterializedRef;
}

export type EntityRef =
	| { type: 'code'; id: string }
	| { type: 'group'; id: string }
	| { type: 'marker'; engineType: EngineType; id: string }
	| { type: 'relation-code'; codeId: string; label: string; target: string }
	| { type: 'relation-app'; engineType: EngineType; markerId: string; codeId: string; label: string; target: string };

/**
 * Serializa EntityRef pra string canônica usada em frontmatter.
 * Formato: `<type>:<id>` ou `<type>:<engineType>:<id>`.
 * Phase 1 só usa 'code'; outros formatos ficam reservados.
 */
export function entityRefToString(ref: EntityRef): string {
	switch (ref.type) {
		case 'code': return `code:${ref.id}`;
		case 'group': return `group:${ref.id}`;
		case 'marker': return `marker:${ref.engineType}:${ref.id}`;
		case 'relation-code': return `relation-code:${ref.codeId}:${ref.label}:${ref.target}`;
		case 'relation-app': return `relation-app:${ref.engineType}:${ref.markerId}:${ref.codeId}:${ref.label}:${ref.target}`;
	}
}

/**
 * Parse de string canônica → EntityRef. Retorna null se formato inválido.
 */
export function entityRefFromString(s: string): EntityRef | null {
	const parts = s.split(':');
	if (parts.length < 2) return null;
	const [type, ...rest] = parts;
	switch (type) {
		case 'code':
			return rest.length === 1 ? { type: 'code', id: rest[0] } : null;
		case 'group':
			return rest.length === 1 ? { type: 'group', id: rest[0] } : null;
		case 'marker':
			return rest.length === 2 ? { type: 'marker', engineType: rest[0] as EngineType, id: rest[1] } : null;
		case 'relation-code':
			return rest.length === 3 ? { type: 'relation-code', codeId: rest[0], label: rest[1], target: rest[2] } : null;
		case 'relation-app':
			return rest.length === 5 ? {
				type: 'relation-app', engineType: rest[0] as EngineType,
				markerId: rest[1], codeId: rest[2], label: rest[3], target: rest[4],
			} : null;
		default: return null;
	}
}
```

- [ ] **Step 3: verificar typecheck**

```bash
npx tsc --noEmit
```

Expected: sem erros novos (memoTypes.ts não é importado ainda).

- [ ] **Step 4: commit**

```bash
~/.claude/scripts/commit.sh "feat(memo): adiciona memoTypes (MemoRecord, EntityRef, serializers)"
```

### Task 1.2: criar accessors (getMemoContent, setMemoContent)

**Files:**
- Create: `src/core/memoHelpers.ts`
- Create: `tests/core/memoHelpers.test.ts`

- [ ] **Step 1: escrever test primeiro**

```typescript
import { describe, it, expect } from 'vitest';
import { getMemoContent, setMemoContent, hasContent } from '../../src/core/memoHelpers';

describe('getMemoContent', () => {
	it('returns empty string when memo is undefined', () => {
		expect(getMemoContent(undefined)).toBe('');
	});

	it('returns content when memo has content', () => {
		expect(getMemoContent({ content: 'hello' })).toBe('hello');
	});

	it('returns empty string when content is empty', () => {
		expect(getMemoContent({ content: '' })).toBe('');
	});
});

describe('setMemoContent', () => {
	it('returns undefined when content is empty and no materialized ref', () => {
		expect(setMemoContent(undefined, '')).toBeUndefined();
		expect(setMemoContent({ content: 'old' }, '')).toBeUndefined();
	});

	it('preserves materialized ref when content empties', () => {
		const result = setMemoContent({ content: 'old', materialized: { path: 'a.md', mtime: 1 } }, '');
		expect(result).toEqual({ content: '', materialized: { path: 'a.md', mtime: 1 } });
	});

	it('creates fresh record when starting from undefined', () => {
		expect(setMemoContent(undefined, 'new')).toEqual({ content: 'new' });
	});

	it('updates content and preserves materialized', () => {
		const result = setMemoContent({ content: 'old', materialized: { path: 'a.md', mtime: 1 } }, 'new');
		expect(result).toEqual({ content: 'new', materialized: { path: 'a.md', mtime: 1 } });
	});
});

describe('hasContent', () => {
	it('false for undefined', () => { expect(hasContent(undefined)).toBe(false); });
	it('false for empty content with no materialized', () => { expect(hasContent({ content: '' })).toBe(false); });
	it('true for non-empty content', () => { expect(hasContent({ content: 'x' })).toBe(true); });
	it('true for empty content but materialized', () => {
		expect(hasContent({ content: '', materialized: { path: 'a.md', mtime: 1 } })).toBe(true);
	});
});
```

- [ ] **Step 2: rodar test → falha (módulo inexistente)**

```bash
npx vitest run tests/core/memoHelpers.test.ts
```

Expected: FAIL `Cannot find module '../../src/core/memoHelpers'`.

- [ ] **Step 3: implementar `memoHelpers.ts`**

```typescript
import type { MemoRecord } from './memoTypes';

export function getMemoContent(memo: MemoRecord | undefined): string {
	return memo?.content ?? '';
}

/**
 * Atualiza content preservando materialized ref. Retorna undefined quando o registro
 * pode ser dropado (sem content e sem materialized) — mantém data.json enxuto.
 */
export function setMemoContent(memo: MemoRecord | undefined, content: string): MemoRecord | undefined {
	if (!content && !memo?.materialized) return undefined;
	return { content, ...(memo?.materialized ? { materialized: memo.materialized } : {}) };
}

/** True se há conteúdo OR ref materializada. Útil pra ramificar UI (textarea vs card). */
export function hasContent(memo: MemoRecord | undefined): boolean {
	if (!memo) return false;
	return memo.content.length > 0 || memo.materialized !== undefined;
}
```

- [ ] **Step 4: rodar test → passa**

```bash
npx vitest run tests/core/memoHelpers.test.ts
```

Expected: PASS (3 describes, 9 tests).

- [ ] **Step 5: commit**

```bash
~/.claude/scripts/commit.sh "feat(memo): accessors getMemoContent/setMemoContent/hasContent"
```

### Task 1.3: schema breaking — types.ts

**Files:**
- Modify: `src/core/types.ts:31` (CodeRelation), `:46` (BaseMarker), `:63` (SidebarModelInterface.updateMarkerFields), `:89` (CodeDefinition), `:123` (GroupDefinition)

- [ ] **Step 1: importar `MemoRecord`**

No topo de `types.ts`, adicionar:

```typescript
import type { MemoRecord } from './memoTypes';
```

- [ ] **Step 2: trocar `memo?: string` por `memo?: MemoRecord` nas 4 entidades**

Linha 31 (CodeRelation): `memo?: MemoRecord;`
Linha 46 (BaseMarker): `memo?: MemoRecord;`
Linha 89 (CodeDefinition): `memo?: MemoRecord;`
Linha 123 (GroupDefinition): `memo?: MemoRecord;`

- [ ] **Step 3: atualizar signature `updateMarkerFields` (:63)**

```typescript
updateMarkerFields(markerId: string, fields: { memo?: MemoRecord | undefined; colorOverride?: string | undefined }): void;
```

- [ ] **Step 4: rodar typecheck**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Expected: muitos erros (~30-40). Esses são os write/read sites que vamos consertar nos próximos chunks. Anotar lista — vai virar guia das próximas tasks.

- [ ] **Step 5: NÃO commitar ainda** — esse chunk fica num único commit no fim com a migração + accessor adoption.

### Task 1.4: migração legacy

**Files:**
- Create: `src/core/memoMigration.ts`
- Create: `tests/core/memoMigration.test.ts`

- [ ] **Step 1: test primeiro**

```typescript
import { describe, it, expect } from 'vitest';
import { migrateLegacyMemos } from '../../src/core/memoMigration';

describe('migrateLegacyMemos', () => {
	it('converts string memo to MemoRecord on CodeDefinition', () => {
		const data: any = {
			registry: {
				definitions: { c1: { id: 'c1', name: 'X', memo: 'hello' } },
				groups: {},
			},
		};
		const out = migrateLegacyMemos(data);
		expect(out.registry.definitions.c1.memo).toEqual({ content: 'hello' });
	});

	it('converts string memo on GroupDefinition', () => {
		const data: any = {
			registry: {
				definitions: {},
				groups: { g1: { id: 'g1', name: 'G', memo: 'group memo' } },
			},
		};
		const out = migrateLegacyMemos(data);
		expect(out.registry.groups.g1.memo).toEqual({ content: 'group memo' });
	});

	it('converts string memo on CodeRelation inside CodeDefinition', () => {
		const data: any = {
			registry: {
				definitions: { c1: { id: 'c1', relations: [{ label: 'L', target: 'T', directed: true, memo: 'rel memo' }] } },
				groups: {},
			},
		};
		const out = migrateLegacyMemos(data);
		expect(out.registry.definitions.c1.relations[0].memo).toEqual({ content: 'rel memo' });
	});

	it('idempotent: already-migrated MemoRecord stays untouched', () => {
		const data: any = {
			registry: {
				definitions: { c1: { id: 'c1', memo: { content: 'already' } } },
				groups: {},
			},
		};
		const out = migrateLegacyMemos(data);
		expect(out.registry.definitions.c1.memo).toEqual({ content: 'already' });
	});

	it('drops empty string memo (becomes undefined)', () => {
		const data: any = {
			registry: {
				definitions: { c1: { id: 'c1', memo: '' } },
				groups: {},
			},
		};
		const out = migrateLegacyMemos(data);
		expect(out.registry.definitions.c1.memo).toBeUndefined();
	});

	// Markers são migrados via Models de cada engine no load — testado em integration test do main.ts depois.
});
```

- [ ] **Step 2: rodar test → falha**

- [ ] **Step 3: implementar `memoMigration.ts`**

```typescript
import type { QualiaData } from './types';
import type { MemoRecord } from './memoTypes';

function migrateMemoField(memo: unknown): MemoRecord | undefined {
	if (memo === undefined || memo === null) return undefined;
	if (typeof memo === 'string') {
		return memo.length > 0 ? { content: memo } : undefined;
	}
	// já é MemoRecord (ou objeto compatível) — passa adiante
	if (typeof memo === 'object' && 'content' in (memo as object)) {
		return memo as MemoRecord;
	}
	return undefined;
}

/**
 * Migra `memo: string` legacy pra MemoRecord em CodeDefinition, GroupDefinition,
 * CodeRelation (dentro de CodeDefinition). Markers são migrados nos Models de cada
 * engine no load (mesmo pattern de outros campos legacy do plugin).
 *
 * Idempotente: se memo já é MemoRecord, retorna inalterado.
 */
export function migrateLegacyMemos(data: QualiaData): QualiaData {
	for (const def of Object.values(data.registry.definitions)) {
		(def as any).memo = migrateMemoField((def as any).memo);
		if (def.relations) {
			for (const rel of def.relations) {
				(rel as any).memo = migrateMemoField((rel as any).memo);
			}
		}
	}
	for (const group of Object.values(data.registry.groups)) {
		(group as any).memo = migrateMemoField((group as any).memo);
	}
	return data;
}
```

- [ ] **Step 4: rodar test → passa**

```bash
npx vitest run tests/core/memoMigration.test.ts
```

- [ ] **Step 5: chamar migração no DataManager.load**

Procurar onde `dataManager.load` (ou equivalente) carrega `data.json`. Inserir `migrateLegacyMemos(data)` logo após o JSON parse.

```bash
grep -n "loadData\|JSON.parse" src/core/dataManager.ts | head
```

Inserir uma linha após o load: `migrateLegacyMemos(data)`. Markers (BaseMarker.memo) são migrados nos Models de cada engine — adicionar chamada equivalente em `codeMarkerModel.ts`, `pdfCodingModel.ts`, `csvCodingModel.ts`, `imageCodingModel.ts`, `mediaCodingModel.ts` (audio/video) durante `load`.

Helper genérico no `memoMigration.ts`:

```typescript
export function migrateMarkerMemo<T extends { memo?: unknown }>(marker: T): T {
	(marker as any).memo = migrateMemoField((marker as any).memo);
	return marker;
}
```

Cada Model chama `markers.forEach(migrateMarkerMemo)` no load.

### Task 1.5: registry update normaliza memo

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts:250-283`, `:501-507`, `:515-523`

- [ ] **Step 1: trocar `update()` (linha 250)**

```typescript
update(id: string, changes: Partial<Pick<CodeDefinition, 'name' | 'color' | 'description' | 'memo' | 'magnitude' | 'relations'>> & { memo?: MemoRecord | string | undefined }): boolean {
	// ...
	const oldMemoContent = getMemoContent(def.memo);
	// ...
	if (changes.memo !== undefined) {
		const incoming = changes.memo;
		const newContent = typeof incoming === 'string' ? incoming : (incoming?.content ?? '');
		if (newContent !== oldMemoContent || (typeof incoming !== 'string' && incoming?.materialized !== def.memo?.materialized)) {
			// preserva materialized se chamador passou só string
			if (typeof incoming === 'string') {
				def.memo = setMemoContent(def.memo, incoming);
			} else {
				def.memo = incoming === undefined ? undefined : (incoming.content || incoming.materialized ? incoming : undefined);
			}
			this.emitAudit({ type: 'memo_edited', codeId: id, from: oldMemoContent, to: newContent });
		}
	}
}
```

- [ ] **Step 2: imports no topo do registry**

```typescript
import type { MemoRecord } from './memoTypes';
import { getMemoContent, setMemoContent } from './memoHelpers';
```

- [ ] **Step 3: trocar `setGroupMemo` (linha 501)**

```typescript
setGroupMemo(id: string, memo: string | undefined): void {
	const g = this.data.registry.groups[id];
	if (!g) return;
	g.memo = setMemoContent(g.memo, memo ?? '');
	this.emit();
}
```

- [ ] **Step 4: trocar `setRelationMemo` (linha 515)**

```typescript
setRelationMemo(codeId: string, label: string, target: string, memo: string | undefined): boolean {
	const def = this.data.registry.definitions[codeId];
	if (!def?.relations) return false;
	const rel = def.relations.find(r => r.label === label && r.target === target);
	if (!rel) return false;
	rel.memo = setMemoContent(rel.memo, memo ?? '');
	this.emit();
	return true;
}
```

### Task 1.6: refactor mecânico — read sites em export/import/tabular/audit/memoView

Esse step toca ~30 sites. **Estratégia:** rodar `tsc --noEmit`, ler os erros, ir consertando arquivo por arquivo, sempre via accessor `getMemoContent` ou `setMemoContent`. Cada arquivo vira um sub-step.

- [ ] **Step 1: `src/core/auditLog.ts`** — coalescing de `description_edited`/`memo_edited` deve normalizar via `getMemoContent`. Procurar onde compara/lê memo string.

- [ ] **Step 2: `src/export/qdcExporter.ts:55-56,93-94`**

```typescript
const memoContent = getMemoContent(group.memo);
const memoEl = memoContent ? `\n<MemoText>${escapeXml(memoContent)}</MemoText>` : '';
```

- [ ] **Step 3: `src/export/qdpxExporter.ts`** — todos os 9 sites de `m.memo` / `rel.memo`. Substituir por `getMemoContent(...)`.

- [ ] **Step 4: `src/import/qdcImporter.ts:95-117`** — `pc.memo` (parsed do XML, é string) fica como está; comparações com `existing.memo` viram `getMemoContent(existing.memo)`; writes viram `registry.update(def.id, { memo: pc.memo })` (string passa pelo update normalizado).

- [ ] **Step 5: `src/import/qdpxImporter.ts`** — mesmo pattern.

- [ ] **Step 6: `src/export/tabular/buildCodesTable.ts`, `buildGroupsTable.ts`, `buildRelationsTable.ts`, `buildSegmentsTable.ts`** — colunas `memo` viram `getMemoContent(...)`.

- [ ] **Step 7: `src/analytics/data/memoView.ts`** — aggregator lê via accessor.

- [ ] **Step 8: `src/analytics/views/modes/memoView/onSaveHandlers.ts`** — todos os 5 handlers usam `setMemoContent`. Exemplo:

```typescript
export function onSaveCodeMemo(ctx: AnalyticsViewContext, codeId: string, value: string): void {
	ctx.plugin.registry.update(codeId, { memo: value }); // já normaliza
}

export function onSaveMarkerMemo(ctx: AnalyticsViewContext, engineType: EngineType, markerId: string, value: string): void {
	const marker = ctx.plugin.dataManager.findMarker(engineType, markerId);
	if (!marker) return;
	marker.memo = setMemoContent(marker.memo, value);
	ctx.plugin.dataManager.markDirty();
}
```

- [ ] **Step 9: `src/analytics/views/modes/memoView/renderMemoEditor.ts`, `renderCodeSection.ts`, `renderFileSection.ts`, `renderMarkerCard.ts`, `exportMemoCSV.ts`, `exportMemoMarkdown.ts`** — accessors em todo lugar que lê.

- [ ] **Step 10: `src/core/baseCodingMenu.ts`, `detailMarkerRenderer.ts`, `codingPopover.ts`, `mergeModal.ts`, `mergePolicies.ts`** — accessors.

- [ ] **Step 11: rodar typecheck**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Expected: zero erros.

- [ ] **Step 12: rodar test suite completa**

```bash
npm run test
```

Expected: 2438 testes passando + os novos (memoHelpers, memoMigration). Total esperado: ~2453.

- [ ] **Step 13: commit do chunk inteiro**

```bash
~/.claude/scripts/commit.sh "refactor(memo): schema breaking memo: string → MemoRecord + accessors + migração legacy"
```

---

## Chunk 2: Helpers puros (frontmatter, conflict path, EntityRef serializers)

**Objetivo:** primitivas testáveis sem mexer em I/O. Isolar a lógica de formato e resolução de path antes de plug em vault listeners.

### Task 2.1: parseMemoNote / serializeMemoNote

**Files:**
- Create: `src/core/memoNoteFormat.ts`
- Create: `tests/core/memoNoteFormat.test.ts`

- [ ] **Step 1: tests primeiro**

```typescript
import { describe, it, expect } from 'vitest';
import { parseMemoNote, serializeMemoNote } from '../../src/core/memoNoteFormat';

describe('serializeMemoNote', () => {
	it('produces frontmatter + content', () => {
		const out = serializeMemoNote({ type: 'code', id: 'c1' }, 'Wellbeing', 'My analysis...');
		expect(out).toBe(
`---
qualiaMemoOf: code:c1
qualiaCodeName: Wellbeing
---

My analysis...`);
	});

	it('escapes quotes in codeName', () => {
		const out = serializeMemoNote({ type: 'code', id: 'c1' }, 'My "quoted" code', '');
		expect(out).toContain('qualiaCodeName: \'My "quoted" code\'');
	});

	it('handles empty content', () => {
		const out = serializeMemoNote({ type: 'code', id: 'c1' }, 'Wellbeing', '');
		expect(out).toBe(`---
qualiaMemoOf: code:c1
qualiaCodeName: Wellbeing
---

`);
	});
});

describe('parseMemoNote', () => {
	it('extracts ref and content', () => {
		const text = `---
qualiaMemoOf: code:c1
qualiaCodeName: Wellbeing
---

Body content here.`;
		const result = parseMemoNote(text);
		expect(result).toEqual({
			ref: { type: 'code', id: 'c1' },
			content: 'Body content here.',
		});
	});

	it('returns null when frontmatter missing qualiaMemoOf', () => {
		const text = `---
title: Foo
---
Body`;
		expect(parseMemoNote(text)).toBeNull();
	});

	it('returns null when no frontmatter', () => {
		expect(parseMemoNote('Just body')).toBeNull();
	});

	it('returns null when frontmatter is invalid YAML', () => {
		const text = `---
qualiaMemoOf: [broken
---
Body`;
		expect(parseMemoNote(text)).toBeNull();
	});

	it('preserves multi-line content with frontmatter-like content inside body', () => {
		const text = `---
qualiaMemoOf: code:c1
qualiaCodeName: X
---

Line 1
---
Line 2 (not frontmatter)`;
		const result = parseMemoNote(text);
		expect(result?.content).toBe('Line 1\n---\nLine 2 (not frontmatter)');
	});
});
```

- [ ] **Step 2: rodar test → falha**

- [ ] **Step 3: implementar**

```typescript
import type { EntityRef } from './memoTypes';
import { entityRefToString, entityRefFromString } from './memoTypes';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

export function serializeMemoNote(ref: EntityRef, displayName: string, content: string): string {
	const refStr = entityRefToString(ref);
	const safeName = needsQuotes(displayName) ? `'${displayName.replace(/'/g, "''")}'` : displayName;
	return `---\nqualiaMemoOf: ${refStr}\nqualiaCodeName: ${safeName}\n---\n\n${content}`;
}

export function parseMemoNote(text: string): { ref: EntityRef; content: string } | null {
	const match = FRONTMATTER_RE.exec(text);
	if (!match) return null;
	const fm = match[1];
	const refLine = fm.split('\n').find(l => l.startsWith('qualiaMemoOf:'));
	if (!refLine) return null;
	const refStr = refLine.slice('qualiaMemoOf:'.length).trim();
	const ref = entityRefFromString(refStr);
	if (!ref) return null;
	const content = text.slice(match[0].length);
	return { ref, content };
}

function needsQuotes(s: string): boolean {
	return /["':#\[\]{}|>!%@&*]/.test(s) || s !== s.trim();
}
```

- [ ] **Step 4: rodar test → passa**

- [ ] **Step 5: commit**

```bash
~/.claude/scripts/commit.sh "feat(memo): parse/serialize de memo notes (frontmatter + body)"
```

### Task 2.2: resolveConflictPath

**Files:**
- Create: `src/core/memoPathResolver.ts`
- Create: `tests/core/memoPathResolver.test.ts`

- [ ] **Step 1: test primeiro** (com vault.adapter.exists mockado)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { resolveConflictPath, sanitizeFilename } from '../../src/core/memoPathResolver';

describe('sanitizeFilename', () => {
	it('replaces invalid chars with underscore', () => {
		expect(sanitizeFilename('Code: name/with*invalid?chars')).toBe('Code_ name_with_invalid_chars');
	});
	it('keeps unicode', () => {
		expect(sanitizeFilename('Código análise')).toBe('Código análise');
	});
	it('trims trailing dots and spaces', () => {
		expect(sanitizeFilename('Name.. ')).toBe('Name');
	});
});

describe('resolveConflictPath', () => {
	const mkVault = (existing: Set<string>) => ({
		adapter: { exists: async (p: string) => existing.has(p) },
	} as any);

	it('returns base path when free', async () => {
		const out = await resolveConflictPath(mkVault(new Set()), 'A/Wellbeing.md');
		expect(out).toBe('A/Wellbeing.md');
	});

	it('appends (2) when base taken', async () => {
		const out = await resolveConflictPath(mkVault(new Set(['A/Wellbeing.md'])), 'A/Wellbeing.md');
		expect(out).toBe('A/Wellbeing (2).md');
	});

	it('appends (3) when base and (2) taken', async () => {
		const out = await resolveConflictPath(mkVault(new Set(['A/W.md', 'A/W (2).md'])), 'A/W.md');
		expect(out).toBe('A/W (3).md');
	});

	it('handles paths without folder', async () => {
		const out = await resolveConflictPath(mkVault(new Set(['X.md'])), 'X.md');
		expect(out).toBe('X (2).md');
	});
});
```

- [ ] **Step 2: rodar → falha**

- [ ] **Step 3: implementar**

```typescript
import type { Vault } from 'obsidian';

const INVALID_FS_RE = /[/\\:*?"<>|]/g;

export function sanitizeFilename(name: string): string {
	return name.replace(INVALID_FS_RE, '_').replace(/[\.\s]+$/, '');
}

/**
 * Resolve path com sufixo `(2)`, `(3)`... se base já existe no vault.
 */
export async function resolveConflictPath(vault: Vault, basePath: string): Promise<string> {
	if (!(await vault.adapter.exists(basePath))) return basePath;
	const dotIdx = basePath.lastIndexOf('.');
	const stem = dotIdx >= 0 ? basePath.slice(0, dotIdx) : basePath;
	const ext = dotIdx >= 0 ? basePath.slice(dotIdx) : '';
	let n = 2;
	while (await vault.adapter.exists(`${stem} (${n})${ext}`)) n++;
	return `${stem} (${n})${ext}`;
}
```

- [ ] **Step 4: rodar → passa**

- [ ] **Step 5: commit**

```bash
~/.claude/scripts/commit.sh "feat(memo): resolveConflictPath + sanitizeFilename"
```

---

## Chunk 3: Settings (memoFolders)

### Task 3.1: schema settings + defaults

**Files:**
- Modify: `src/core/types.ts` (`QualiaData.settings`)
- Modify: arquivo de defaults (provavelmente `src/core/defaults.ts` ou similar — descobrir via `grep -n "memoFolders\|defaultSettings" src/core/`)

- [ ] **Step 1: descobrir onde defaults vivem**

```bash
grep -rn "DEFAULT_SETTINGS\|defaultSettings" src/core/ | head
```

- [ ] **Step 2: adicionar ao Settings type**

```typescript
export interface MemoFolders {
	code: string;
	group: string;
	marker: string;
	relation: string;
}

// Em CodeMarkerSettings (ou settings type equivalente):
memoFolders: MemoFolders;
```

Defaults:

```typescript
const DEFAULT_MEMO_FOLDERS: MemoFolders = {
	code: 'Analytic Memos/Codes',
	group: 'Analytic Memos/Groups',
	marker: 'Analytic Memos/Markers',
	relation: 'Analytic Memos/Relations',
};
```

- [ ] **Step 3: typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

### Task 3.2: Settings tab UI

**Files:**
- Modify: arquivo do SettingsTab (descobrir via `grep -rn "PluginSettingTab\|class.*SettingTab" src/`)

@superpowers:obsidian-settings (não existe ainda como skill standalone — usar pattern do projeto, já tem outros settings tabs)

- [ ] **Step 1: adicionar bloco "Memo materialization" no Settings tab**

```typescript
containerEl.createEl('h3', { text: 'Memo materialization' });
containerEl.createEl('p', {
	text: 'Folders where memos materialize as .md notes. Phase 1: only Code memos. Other types (Group, Marker, Relation) are reserved for future extension.',
	cls: 'setting-item-description',
});

new Setting(containerEl)
	.setName('Code memo folder')
	.setDesc('Path inside vault where code memos save.')
	.addText(t => t.setValue(this.plugin.settings.memoFolders.code).onChange(async v => {
		this.plugin.settings.memoFolders.code = v.trim();
		await this.plugin.saveSettings();
	}));

// Idem pra group, marker, relation — disabled visualmente até Phase 2 estender:
new Setting(containerEl)
	.setName('Group memo folder')
	.setDesc('Reserved — not active in Phase 1.')
	.addText(t => t.setValue(this.plugin.settings.memoFolders.group).setDisabled(true));

// (idem marker, relation)
```

- [ ] **Step 2: smoke test no workbench** (build + abrir settings)

```bash
npm run build && cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

Abrir Obsidian no workbench vault, ir em Settings → Qualia Coding, conferir que bloco "Memo materialization" aparece com 4 inputs (1 ativo, 3 disabled).

- [ ] **Step 3: commit**

```bash
~/.claude/scripts/commit.sh "feat(memo): settings memoFolders (4 paths, code ativo Phase 1)"
```

---

## Chunk 4: Materializer core (sem listeners ainda)

### Task 4.1: memoMaterializer — convert / unmaterialize / syncToFile / syncFromFile

**Files:**
- Create: `src/core/memoMaterializer.ts`
- Create: `tests/core/memoMaterializer.test.ts`

- [ ] **Step 1: tests integrados com vault mockado**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { convertMemoToNote, unmaterialize, syncToFile, syncFromFile } from '../../src/core/memoMaterializer';
import { createTestPluginFactory } from '../helpers/pluginFactory'; // helper existente do projeto

describe('convertMemoToNote', () => {
	it('creates .md with frontmatter + content + populates materialized ref', async () => {
		const plugin = createTestPluginFactory();
		const code = plugin.registry.create('Wellbeing', '#fff');
		plugin.registry.update(code.id, { memo: 'My analysis' });

		const file = await convertMemoToNote(plugin, { type: 'code', id: code.id });
		expect(file.path).toBe('Analytic Memos/Codes/Wellbeing.md');

		const updated = plugin.registry.get(code.id);
		expect(updated?.memo?.materialized?.path).toBe(file.path);

		const fileContent = await plugin.app.vault.read(file);
		expect(fileContent).toContain('qualiaMemoOf: code:' + code.id);
		expect(fileContent).toContain('My analysis');
	});

	it('applies (2) suffix on conflict', async () => { /* ... */ });

	it('creates folder if missing', async () => { /* ... */ });

	it('opens file in new tab after creation', async () => { /* mock workspace.getLeaf().openFile */ });
});

describe('unmaterialize', () => {
	it('removes materialized ref but preserves content and file', async () => { /* ... */ });
});

describe('syncFromFile', () => {
	it('updates entity content when file modified', async () => { /* ... */ });

	it('clears materialized when frontmatter qualiaMemoOf is missing', async () => { /* ... */ });
});

describe('syncToFile', () => {
	it('writes new content to file preserving frontmatter', async () => { /* ... */ });
});
```

- [ ] **Step 2: implementar `memoMaterializer.ts`**

```typescript
import type { TFile, Vault, Workspace } from 'obsidian';
import type { EntityRef } from './memoTypes';
import type QualiaCodingPlugin from '../main'; // ajustar nome real
import { entityRefToString } from './memoTypes';
import { setMemoContent, getMemoContent } from './memoHelpers';
import { resolveConflictPath, sanitizeFilename } from './memoPathResolver';
import { serializeMemoNote, parseMemoNote } from './memoNoteFormat';

/**
 * Cria .md materializado pra entity, popula `materialized` no data.json, abre em nova aba.
 * Phase 1: só funciona pra ref.type === 'code'.
 */
export async function convertMemoToNote(plugin: QualiaCodingPlugin, ref: EntityRef): Promise<TFile> {
	if (ref.type !== 'code') throw new Error('Phase 1: only code refs supported');
	const def = plugin.registry.get(ref.id);
	if (!def) throw new Error(`Code not found: ${ref.id}`);

	const folder = plugin.settings.memoFolders.code;
	const filename = sanitizeFilename(def.name) + '.md';
	const basePath = `${folder}/${filename}`.replace(/\/+/g, '/');

	const finalPath = await resolveConflictPath(plugin.app.vault, basePath);

	// ensure folder exists
	const folderPath = finalPath.slice(0, finalPath.lastIndexOf('/'));
	if (folderPath && !(await plugin.app.vault.adapter.exists(folderPath))) {
		await plugin.app.vault.createFolder(folderPath);
	}

	const content = getMemoContent(def.memo);
	const text = serializeMemoNote(ref, def.name, content);

	plugin.memoSelfWriting.add(finalPath); // self-write tracking (criado em Chunk 5)
	const file = await plugin.app.vault.create(finalPath, text);
	queueMicrotask(() => plugin.memoSelfWriting.delete(finalPath));

	plugin.registry.update(ref.id, {
		memo: { content, materialized: { path: finalPath, mtime: file.stat.mtime } } as any,
	});

	plugin.memoReverseLookup.set(finalPath, ref);

	plugin.app.workspace.getLeaf('tab').openFile(file);

	return file;
}

export function unmaterialize(plugin: QualiaCodingPlugin, ref: EntityRef): void {
	if (ref.type !== 'code') throw new Error('Phase 1: only code refs');
	const def = plugin.registry.get(ref.id);
	if (!def?.memo?.materialized) return;

	plugin.memoReverseLookup.delete(def.memo.materialized.path);

	plugin.registry.update(ref.id, {
		memo: { content: def.memo.content } as any, // drop materialized
	});
}

/**
 * Escreve content no .md materializado (chamado por edits que vêm de UI interna,
 * fora do textarea). Phase 1 só usa em sync de re-render.
 */
export async function syncToFile(plugin: QualiaCodingPlugin, ref: EntityRef, content: string): Promise<void> {
	if (ref.type !== 'code') return;
	const def = plugin.registry.get(ref.id);
	if (!def?.memo?.materialized) return;

	const file = plugin.app.vault.getAbstractFileByPath(def.memo.materialized.path);
	if (!file || !('stat' in file)) return;

	const text = serializeMemoNote(ref, def.name, content);

	plugin.memoSelfWriting.add(def.memo.materialized.path);
	await plugin.app.vault.modify(file as TFile, text);
	queueMicrotask(() => plugin.memoSelfWriting.delete(def.memo!.materialized!.path));
}

/**
 * Lê .md modificado externamente, atualiza data.json. Chamado pelo modify listener.
 * Se frontmatter perdeu `qualiaMemoOf`, desfaz materialization (entidade volta a inline).
 */
export async function syncFromFile(plugin: QualiaCodingPlugin, file: TFile): Promise<void> {
	const ref = plugin.memoReverseLookup.get(file.path);
	if (!ref) return;
	if (ref.type !== 'code') return;

	const text = await plugin.app.vault.read(file);
	const parsed = parseMemoNote(text);

	if (!parsed) {
		// frontmatter quebrado/removido → desmaterializar
		unmaterialize(plugin, ref);
		return;
	}

	if (entityRefToString(parsed.ref) !== entityRefToString(ref)) {
		// user editou frontmatter pra apontar pra outra entidade — comportamento nulo (spec D7)
		console.warn('[qualia] memo frontmatter ref mismatch, ignoring change', { expected: ref, got: parsed.ref });
		return;
	}

	plugin.registry.update(ref.id, {
		memo: { content: parsed.content, materialized: { path: file.path, mtime: file.stat.mtime } } as any,
	});
}
```

- [ ] **Step 3: rodar tests → passa**

- [ ] **Step 4: commit**

```bash
~/.claude/scripts/commit.sh "feat(memo): memoMaterializer (convert, unmaterialize, syncToFile, syncFromFile)"
```

---

## Chunk 5: Listeners + reverse-lookup + self-write tracker

### Task 5.1: registerMemoListeners

**Files:**
- Create: `src/core/memoMaterializerListeners.ts`
- Modify: `src/main.ts` — adicionar `memoReverseLookup`, `memoSelfWriting`, chamar `registerMemoListeners` no `onload`, reconstruir map.

- [ ] **Step 1: implementar `memoMaterializerListeners.ts`**

```typescript
import type { TFile, TAbstractFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EntityRef } from './memoTypes';
import { syncFromFile } from './memoMaterializer';

export function registerMemoListeners(plugin: QualiaCodingPlugin): void {
	plugin.registerEvent(plugin.app.vault.on('modify', file => {
		if (!(file instanceof TFile)) return;
		if (plugin.memoSelfWriting.has(file.path)) return;
		if (!plugin.memoReverseLookup.has(file.path)) return;
		void syncFromFile(plugin, file);
	}));

	plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => {
		if (!(file instanceof TFile)) return;
		const ref = plugin.memoReverseLookup.get(oldPath);
		if (!ref) return;
		plugin.memoReverseLookup.delete(oldPath);
		plugin.memoReverseLookup.set(file.path, ref);

		if (ref.type === 'code') {
			const def = plugin.registry.get(ref.id);
			if (def?.memo?.materialized) {
				plugin.registry.update(ref.id, {
					memo: { ...def.memo, materialized: { path: file.path, mtime: file.stat.mtime } } as any,
				});
			}
		}
	}));

	plugin.registerEvent(plugin.app.vault.on('delete', file => {
		const ref = plugin.memoReverseLookup.get(file.path);
		if (!ref) return;
		plugin.memoReverseLookup.delete(file.path);
		if (ref.type === 'code') {
			const def = plugin.registry.get(ref.id);
			if (def?.memo) {
				plugin.registry.update(ref.id, {
					memo: { content: def.memo.content } as any, // drop materialized
				});
			}
		}
	}));
}

/**
 * Reconstrói o reverse-lookup map varrendo registry.
 * Chamado no onload e depois de migration/load.
 */
export function rebuildMemoReverseLookup(plugin: QualiaCodingPlugin): void {
	plugin.memoReverseLookup.clear();
	for (const def of Object.values(plugin.registry.getAll())) {
		if (def.memo?.materialized) {
			plugin.memoReverseLookup.set(def.memo.materialized.path, { type: 'code', id: def.id });
		}
	}
}
```

- [ ] **Step 2: modificar `src/main.ts`**

Adicionar campos no plugin class:

```typescript
memoReverseLookup: Map<string, EntityRef> = new Map();
memoSelfWriting: Set<string> = new Set();
```

No `onload`, depois do load do data e migrate:

```typescript
rebuildMemoReverseLookup(this);
registerMemoListeners(this);
```

No `onunload`:

```typescript
this.memoReverseLookup.clear();
this.memoSelfWriting.clear();
```

- [ ] **Step 3: typecheck + test suite**

```bash
npx tsc --noEmit && npm run test
```

- [ ] **Step 4: commit**

```bash
~/.claude/scripts/commit.sh "feat(memo): vault listeners (modify/rename/delete) + reverse-lookup map + self-write tracker"
```

---

## Chunk 6: UI — botão Convert + card materializado

### Task 6.1: render condicional em detailCodeRenderer

**Files:**
- Modify: `src/core/detailCodeRenderer.ts:353-367`

@superpowers:obsidian-design (CSS classes do plugin)

- [ ] **Step 1: extrair `renderMaterializedCard` (helper local)**

```typescript
function renderMaterializedCard(
	container: HTMLElement,
	def: CodeDefinition,
	plugin: QualiaCodingPlugin,
	onChange: () => void,
): void {
	const card = container.createDiv({ cls: 'qc-memo-materialized-card' });

	card.createEl('span', { text: '📄 Materialized at', cls: 'qc-memo-materialized-label' });
	card.createEl('div', { text: def.memo!.materialized!.path, cls: 'qc-memo-materialized-path' });

	const actions = card.createDiv({ cls: 'qc-memo-materialized-actions' });
	const openBtn = actions.createEl('button', { text: 'Open', cls: 'qc-memo-open-btn' });
	openBtn.addEventListener('click', () => {
		const file = plugin.app.vault.getAbstractFileByPath(def.memo!.materialized!.path);
		if (file instanceof TFile) plugin.app.workspace.getLeaf('tab').openFile(file);
	});

	const unBtn = actions.createEl('button', { text: 'Unmaterialize', cls: 'qc-memo-unmaterialize-btn' });
	unBtn.addEventListener('click', () => {
		unmaterialize(plugin, { type: 'code', id: def.id });
		onChange();
	});
}
```

- [ ] **Step 2: substituir trecho 353-367 por render condicional**

```typescript
const memoSection = container.createDiv({ cls: 'codemarker-detail-section' });
const memoHeader = memoSection.createDiv({ cls: 'codemarker-detail-section-header' });
memoHeader.createEl('h6', { text: 'Memo' });

if (def?.memo?.materialized) {
	renderMaterializedCard(memoSection, def, model.plugin, () => model.onChange());
} else {
	const convertBtn = memoHeader.createEl('button', { text: 'Convert to note', cls: 'qc-memo-convert-btn' });
	convertBtn.addEventListener('click', async () => {
		await convertMemoToNote(model.plugin, { type: 'code', id: def.id });
		model.onChange(); // refresh detail
	});

	const textarea = memoSection.createEl('textarea', {
		cls: 'codemarker-detail-memo',
		attr: { placeholder: 'Add a memo...', rows: '4' },
	});
	textarea.value = getMemoContent(def?.memo);
	let memoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	textarea.addEventListener('input', () => {
		if (memoSaveTimer) clearTimeout(memoSaveTimer);
		memoSaveTimer = setTimeout(() => {
			memoSaveTimer = null;
			const val = textarea.value;
			model.registry.update(def.id, { memo: val });
		}, 500);
	});
}
```

**Nota crítica:** o botão Convert é assíncrono e depois do await chama `model.onChange()` pra rebuildar o Code Detail. O re-render encontra `materialized` populado e renderiza o card no lugar do textarea — sem manipulação manual de DOM.

- [ ] **Step 3: CSS classes em `styles.css`**

```css
.qc-memo-materialized-card {
	padding: 12px;
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 6px;
	margin-top: 8px;
}
.qc-memo-materialized-label {
	font-size: 0.85em;
	color: var(--text-muted);
}
.qc-memo-materialized-path {
	font-family: var(--font-monospace);
	font-size: 0.9em;
	margin: 6px 0 12px;
	word-break: break-all;
}
.qc-memo-materialized-actions {
	display: flex;
	gap: 8px;
}
.qc-memo-convert-btn {
	margin-left: auto;
	font-size: 0.85em;
}
.codemarker-detail-section-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
}
```

- [ ] **Step 4: smoke test manual no workbench**

1. `npm run build && cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`
2. Abrir workbench vault no Obsidian.
3. Ir em código com memo. Conferir botão "Convert to note" no header da seção Memo.
4. Click → arquivo aparece no vault em `Analytic Memos/Codes/<Code Name>.md`. Tab abre com o arquivo.
5. Voltar pro Code Detail → seção Memo virou card com path + Open/Unmaterialize.
6. Editar `.md` → voltar → memoView e Code Detail (se reabrir) mostram o conteúdo novo.
7. Click Unmaterialize → textarea volta com content preservado.
8. Click Convert de novo → conflito → arquivo `(2)` criado.
9. Deletar `.md` no vault → Code Detail volta a textarea, content preservado.
10. Renomear `.md` no vault → Code Detail Open ainda funciona.

- [ ] **Step 5: commit**

```bash
~/.claude/scripts/commit.sh "feat(memo): UI Convert to note (botão + card materializado)"
```

---

## Chunk 7: Validação final e roundtrip QDPX

### Task 7.1: roundtrip QDPX com memo materializado

- [ ] **Step 1: smoke roundtrip script**

```bash
bash scripts/smoke-roundtrip.sh
```

- [ ] **Step 2: criar memo materializado em 1 code, exportar QDPX, reimportar em vault novo, conferir que `<MemoText>` saiu certo**

Plano de teste manual:

1. Em workbench, código X tem memo "Foo bar". Convert to note.
2. Editar `.md` adicionando "baz".
3. Esperar `modify` listener disparar (ver memoView pra confirmar conteúdo "Foo bar baz").
4. Export QDPX.
5. Em vault temp, importar QDPX.
6. Conferir que código X tem memo "Foo bar baz" (sem materialized — import fica inline, materialização é decisão do user no novo vault).

Expected: comportamento limpo. `materialized` não viaja no QDPX (fica só no `data.json` do vault de origem).

- [ ] **Step 3: rodar test suite completa**

```bash
npm run test
```

Expected: ~2453+ verde (2438 baseline + ~15 novos: memoHelpers + memoMigration + memoNoteFormat + memoPathResolver + memoMaterializer).

- [ ] **Step 4: rodar e2e**

```bash
npm run test:e2e
```

Expected: 66 verde mantido (não quebra UAT existente).

### Task 7.2: docs

- [ ] **Step 1: atualizar `docs/ROADMAP.md`** — riscar "Convert memo to note" do "Analytical Memos" + mover pra "Implementados" como `#33` com descrição curta + data.

- [ ] **Step 2: atualizar `docs/ARCHITECTURE.md`** — seção sobre memos passa a documentar materialização opcional.

- [ ] **Step 3: atualizar `docs/TECHNICAL-PATTERNS.md`** — pattern "self-write tracker pra vault listener loop prevention".

- [ ] **Step 4: atualizar `CLAUDE.md`** se a estrutura de arquivos mudou — sim, +6 arquivos novos em `src/core/`.

### Task 7.3: merge + cleanup

@superpowers:finishing-a-development-branch

CLAUDE.md memory `feedback_auto_post_task_cleanup.md` autoriza auto-merge sem perguntar.

- [ ] **Step 1: merge pra main + push + delete branch**

```bash
git checkout main
git merge --ff-only feat/convert-memo-to-note
git push origin main
git branch -d feat/convert-memo-to-note
git push origin --delete feat/convert-memo-to-note
```

- [ ] **Step 2: arquivar plan e spec**

CLAUDE.md regra de arquivamento: mover `docs/superpowers/plans/2026-04-30-convert-memo-to-note.md` e `docs/superpowers/specs/2026-04-30-convert-memo-to-note-design.md` pro path de archive do projeto (verificar `MEMORY.md` → `reference_plan_archive.md`).

---

## Critérios de aceite

- [ ] 4 entidades têm `memo: MemoRecord` no schema (BaseMarker, CodeDefinition, GroupDefinition, CodeRelation).
- [ ] `data.json` legacy migra automaticamente no load (string → `{ content }`).
- [ ] Settings tem 4 inputs `memoFolders.{code,group,marker,relation}` (Phase 1: só `code` ativo).
- [ ] Botão Convert no Code Detail materializa em 1 click + abre arquivo em nova aba.
- [ ] Edit no `.md` reflete em data.json automaticamente (modify listener).
- [ ] Rename do `.md` atualiza `materialized.path`.
- [ ] Delete do `.md` desmaterializa (content preservado, textarea volta).
- [ ] Frontmatter quebrado pelo user → desmaterialização graciosa, sem erro ruidoso.
- [ ] Conflito de path resolve com sufixo `(2)`.
- [ ] Round-trip QDPX export/import preserva content do memo materializado.
- [ ] Test suite verde: 2438 → ~2453+.
- [ ] e2e verde: 66.
- [ ] Smoke manual no workbench cobre os 10 cenários da Task 6.1 Step 4.

## Pós-spike (não faz parte deste plano)

Marlon usa por 2 semanas. Decisão:
- **Manter+polir** → estender pros 3 tipos restantes (Group, Marker, Relation) reusando `memoMaterializer`/`memoMaterializerListeners`. Mecânico.
- **Archive** → reverter via `git revert` da branch ou drop completo do `memoFolders` setting + 6 arquivos novos.
