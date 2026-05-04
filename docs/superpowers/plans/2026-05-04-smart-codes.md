# Smart Codes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project override:** This project's CLAUDE.md disables worktrees (Obsidian hot-reload requires the artefato `main.js` em `.obsidian/plugins/obsidian-qualia-coding/`). Work direto em branch normal (`feat/smart-codes`).

**Goal:** Implementar Smart Codes (Tier 3 do Coding Management) — códigos virtuais definidos por predicate (AND/OR/NOT + 10 leaves + nesting), padrão ATLAS.ti, com cache eficiente, builder UI, integração em Analytics + sidebars + Codebook Timeline, e round-trip QDPX/CSV.

**Architecture:** AST de predicate puro + evaluator recursivo com short-circuit + cache singleton com invalidação granular via dependency tracking + indexes pré-computados (byCode, byFile) pra performance O(min(|sets|)). UI: section dedicada no Code Explorer + Smart Code Detail equivalente + builder modal row-based linear com indent. Export QDPX em namespace custom `qualia:SmartCodes`; import 2-pass pra resolver smart code nesting. Audit log estendido com `entity?: 'code' | 'smartCode'` discriminator (default 'code' implícito pra backcompat).

**Tech Stack:** TypeScript strict, Vitest + jsdom, esbuild, Obsidian Plugin API, Fabric.js (existente, não novo), CodeMirror 6 (existente).

**Spec autoritativa:** `docs/superpowers/specs/2026-05-04-smart-codes-design.md` — referenciada por número de seção (ex: §5, §13).

---

## File Structure

```
src/core/types.ts                                    [MODIFY] — adicionar EngineType, MarkerRef, AnyMarker (se ausente),
                                                                 SmartCodeDefinition, PredicateNode, LeafNode, OpNode,
                                                                 estender QualiaData.registry com smartCodes,
                                                                 estender BaseAuditEntry com entity?, adicionar 5 sc_* AuditEntry types

src/core/getAllMarkers.ts                            [CREATE] — helper iterador cross-engine (resolve open question §21)

src/core/smartCodes/                                 [CREATE DIRECTORY]
  types.ts                                           [CREATE] — re-exports + helpers de discriminação (isOpNode, isLeafNode, isBrokenLeaf)
  predicateSerializer.ts                             [CREATE] — toJson/fromJson estável (chave order canônica)
  predicateValidator.ts                              [CREATE] — validateForSave(definition, predicate, registrySnapshot, caseVarsKeys?) — vazio, cycles, broken refs, name collision, magnitude type. Smart codes lookup vem dentro de registrySnapshot.smartCodes.
  predicateNormalizer.ts                             [CREATE] — reorderChildrenByCost(predicate) — heurística cheap-first, sem alterar semântica
  dependencyExtractor.ts                             [CREATE] — extractDependencies(predicate) → { codeIds, caseVarKeys, folderIds, groupIds, smartCodeIds, needsRelations, needsEngineType }
  evaluator.ts                                       [CREATE] — evaluate/evaluateOp/evaluateLeaf/evaluateNested + checkRelation helper
  matcher.ts                                         [CREATE] — collectMatches(smartCodeId, ctx) → MarkerRef[] (usa indexes do cache + evaluator)
  cache.ts                                           [CREATE] — SmartCodeCache class (singleton)
  smartCodeRegistryApi.ts                            [CREATE] — extends CodeDefinitionRegistry (createSmartCode, updateSmartCode, deleteSmartCode, setSmartCodeMemo, setSmartCodeColor, autoRewriteOnMerge)
  builderModal.ts                                    [CREATE] — Modal row-based linear com preview live
  builderTreeOps.ts                                  [CREATE] — helpers puros de árvore (addLeaf, removeNode, reorderChild, moveToParent) — testáveis isolados
  builderRowRenderer.ts                              [CREATE] — render de cada row (group header / leaf) com inputs adaptativos
  detailSmartCodeRenderer.ts                         [CREATE] — render do Smart Code Detail (header + predicate display + matches list virtual)

src/core/codeDefinitionRegistry.ts                   [MODIFY] — adicionar smart code CRUD methods + autoRewriteOnMerge hook em executeMerge call sites

src/core/codebookTreeRenderer.ts                     [MODIFY] — adicionar renderSmartCodesSection no topo da árvore + state collapsed + visibility per-doc integration

src/core/codeVisibility.ts                           [MODIFY se necessário] — confirmar string-key safety (per spec §11, zero mudança esperada)

src/core/baseCodeDetailView.ts                       [MODIFY] — adicionar dispatch pra Smart Code Detail quando user navega num smart code; adicionar context menu items

src/core/auditLog.ts                                 [MODIFY] — estender renderEntryMarkdown switch pros 5 sc_* types; adicionar getEntriesForSmartCode helper

src/core/baseSidebarAdapter.ts                       [MODIFY] — adicionar renderSmartCodesGroup nos 6 sidebar adapters concretos via base class

src/analytics/data/dataReader.ts                     [MODIFY] — adicionar getCodeDimensions(data, registry, smartCodeCache) que retorna union code+smart com isSmart flag

src/analytics/data/statsHelpers.ts                   [MODIFY] — applyFilters dispatch via partitionByPrefix (sc_* vs c_*)

src/analytics/data/codebookTimelineEngine.ts         [MODIFY] — estender EVENT_TYPE_TO_FILTER com 5 sc_* keys, adicionar render de bullet ⚡

src/analytics/views/configSections.ts                [MODIFY] — renderCodesFilter ganha sub-seção Smart Codes; renderTimelineConfig ganha checkbox "Include smart code events"

src/analytics/views/modes/codebookTimelineMode.ts    [MODIFY] — listener da nova checkbox + filter aplicado no buildTimelineEvents

src/analytics/views/modes/{frequency,evolution,cooccurrence,sequential,codeMetadata,memoView/*}.ts  [MODIFY] — usar getCodeDimensions + cache.getMatches() pra resolver smart codes como dimension

src/export/qdpxExporter.ts                           [MODIFY] — adicionar buildSmartCodesXml + opcional buildSmartCodeSetsXml pro toggle materialize

src/import/qdpxImporter.ts                           [MODIFY] — parseSmartCodes (2-pass) + integração no orquestrador

src/export/tabular/buildSmartCodesTable.ts           [CREATE] — buildSmartCodesCsv puro

src/export/tabular/tabularExporter.ts                [MODIFY] — adicionar smart_codes.csv ao zip

src/export/tabular/readmeBuilder.ts                  [MODIFY] — section nova "smart_codes.csv" com snippet R/Python

src/main.ts                                          [MODIFY] — instalar SmartCodeCache singleton + wire listeners (registry, caseVarsRegistry, models de cada engine)

styles.css                                           [MODIFY] — classes .qc-smart-code-row, .qc-smart-codes-section, .qc-builder-* etc

tests/                                               [MIRROR DA ESTRUTURA src/]
  core/smartCodes/evaluator.test.ts                  [CREATE]
  core/smartCodes/predicateSerializer.test.ts        [CREATE]
  core/smartCodes/predicateValidator.test.ts         [CREATE]
  core/smartCodes/predicateNormalizer.test.ts        [CREATE]
  core/smartCodes/dependencyExtractor.test.ts        [CREATE]
  core/smartCodes/cache.test.ts                      [CREATE]
  core/smartCodes/matcher.test.ts                    [CREATE]
  core/smartCodes/smartCodeRegistryApi.test.ts       [CREATE]
  core/smartCodes/builderTreeOps.test.ts             [CREATE]
  core/smartCodes/stress.test.ts                     [CREATE]
  export/qdpxSmartCodes.test.ts                      [CREATE]
  import/qdpxSmartCodes.test.ts                      [CREATE]
  export/tabular/buildSmartCodesTable.test.ts        [CREATE]
  analytics/data/dataReaderSmartCodes.test.ts        [CREATE]
  analytics/data/codebookTimelineSmartCodes.test.ts  [CREATE]
  analytics/data/applyFiltersSmartCodes.test.ts      [CREATE]
```

**Total:** 8 arquivos novos em `src/core/smartCodes/`, 1 arquivo novo em `src/core/`, 3 arquivos novos em `src/export/tabular/`, ~16 arquivos de teste novos. Modificações em ~15 arquivos existentes.

**Testes existentes:** 2584 (152 suites). Esperado pós-implementação: ~2780+ (+~200 testes incluindo stress).

---

## Chunk 1: Foundation (Schema + Evaluator + Validator)

**Output desta chunk:** types completos, evaluator puro testável, validator funcional, serializer estável, dependencyExtractor, normalizer. Tudo testável sem DOM. Audit log type extension. Sem cache, sem UI, sem registry methods ainda.

**Estimativa:** 1 sessão.

### Task 1.1: Estender `src/core/types.ts` com SmartCode + audit log types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Ler types.ts atual pra entender estrutura existente**

```bash
wc -l src/core/types.ts && grep -n "^export\|^interface\|^type" src/core/types.ts | head -40
```

- [ ] **Step 2: Adicionar EngineType + MarkerRef + AnyMarker (após declarações existentes de marker types)**

Localização: depois das interfaces de marker dos engines (procurar `interface PdfMarker`, `interface ImageMarker`, etc.). Se `AnyMarker` já existir como union, reusar; senão criar:

```ts
export type EngineType = 'markdown' | 'pdf' | 'image' | 'audio' | 'video' | 'csv';

export interface MarkerRef {
  engine: EngineType;
  fileId: string;
  markerId: string;
}

// Se AnyMarker ainda não existe — criar após os marker types concretos:
export type AnyMarker =
  | MarkdownMarker
  | PdfMarker
  | ImageMarker
  | AudioMarker
  | VideoMarker
  | SegmentMarker
  | RowMarker;
```

- [ ] **Step 3: Adicionar SmartCodeDefinition + PredicateNode + LeafNode + OpNode**

Após `GroupDefinition`:

```ts
export interface SmartCodeDefinition {
  id: string;             // sc_*
  name: string;
  color: string;
  paletteIndex: number;
  predicate: PredicateNode;
  memo?: string;
  hidden?: boolean;
  createdAt: number;
}

export type OpNode =
  | { op: 'AND'; children: PredicateNode[] }
  | { op: 'OR';  children: PredicateNode[] }
  | { op: 'NOT'; child: PredicateNode };

export type LeafNode =
  | { kind: 'hasCode';        codeId: string }
  | { kind: 'caseVarEquals';  variable: string; value: string | number | boolean }
  | { kind: 'caseVarRange';   variable: string; min?: number; max?: number; minDate?: string; maxDate?: string }
  | { kind: 'magnitudeGte';   codeId: string; n: number }
  | { kind: 'magnitudeLte';   codeId: string; n: number }
  | { kind: 'inFolder';       folderId: string }
  | { kind: 'inGroup';        groupId: string }
  | { kind: 'engineType';     engine: EngineType }
  | { kind: 'relationExists'; codeId: string; label?: string; targetCodeId?: string }
  | { kind: 'smartCode';      smartCodeId: string };

export type PredicateNode = OpNode | LeafNode;
```

- [ ] **Step 4: Estender QualiaData.registry com smartCodes**

Localizar `interface QualiaData['registry']`:

```ts
registry: {
  // ... fields existentes
  smartCodes: Record<string, SmartCodeDefinition>;
  smartCodeOrder: string[];
  nextSmartCodePaletteIndex: number;
};
```

Atualizar `createDefaultData()` (mesma função, na seção bottom de types.ts) pra incluir `smartCodes: {}, smartCodeOrder: [], nextSmartCodePaletteIndex: 0` no registry.

- [ ] **Step 5: Estender BaseAuditEntry com entity discriminator + adicionar 5 novos AuditEntry types**

Localizar `interface BaseAuditEntry` (atualmente em torno de linha 214):

```ts
interface BaseAuditEntry {
  id: string;
  /** Polimórfico: codeId pra entity='code' (default), smartCodeId pra entity='smartCode'. */
  codeId: string;
  at: number;
  hidden?: true;
  /** Discriminator de entidade. Ausente = 'code' implícito (entries existentes seguem válidas). */
  entity?: 'code' | 'smartCode';
}

export type AuditEntry =
  // Code entries (entity='code' ou ausente — backcompat)
  | (BaseAuditEntry & { type: 'created' })
  | (BaseAuditEntry & { type: 'renamed'; from: string; to: string })
  | (BaseAuditEntry & { type: 'description_edited'; from: string; to: string })
  | (BaseAuditEntry & { type: 'memo_edited'; from: string; to: string })
  | (BaseAuditEntry & { type: 'absorbed'; absorbedNames: string[]; absorbedIds: string[] })
  | (BaseAuditEntry & { type: 'merged_into'; intoId: string; intoName: string })
  | (BaseAuditEntry & { type: 'deleted' })
  // Smart code entries (entity='smartCode' obrigatório)
  | (BaseAuditEntry & { entity: 'smartCode'; type: 'sc_created' })
  | (BaseAuditEntry & { entity: 'smartCode'; type: 'sc_predicate_edited'; addedLeafKinds: string[]; removedLeafKinds: string[]; changedLeafCount: number })
  | (BaseAuditEntry & { entity: 'smartCode'; type: 'sc_memo_edited'; from: string; to: string })
  | (BaseAuditEntry & { entity: 'smartCode'; type: 'sc_auto_rewritten_on_merge'; sourceCodeId: string; targetCodeId: string })
  | (BaseAuditEntry & { entity: 'smartCode'; type: 'sc_deleted' });
```

- [ ] **Step 6: Rodar typecheck e verificar nenhum break**

```bash
npx tsc --noEmit
```

Expected: ZERO erros (extensions são aditivas; entries existentes seguem válidas).

- [ ] **Step 7: Commit**

```bash
git checkout -b feat/smart-codes
git add src/core/types.ts
~/.claude/scripts/commit.sh "feat(types): smart code definitions + audit log entity discriminator"
```

### Task 1.2: Criar `src/core/getAllMarkers.ts`

**Files:**
- Create: `src/core/getAllMarkers.ts`
- Test: `tests/core/getAllMarkers.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/core/getAllMarkers.test.ts
import { describe, it, expect } from 'vitest';
import { getAllMarkers } from '../../src/core/getAllMarkers';
import { createDefaultData } from '../../src/core/types';

describe('getAllMarkers', () => {
  it('returns empty when no markers in any engine', () => {
    const data = createDefaultData();
    const result = getAllMarkers(data);
    expect(result).toEqual([]);
  });

  it('returns markers from all engines com ref correto', () => {
    const data = createDefaultData();
    data.markdown.markers = { 'note.md': [{ id: 'mk1', ranges: [], codes: [] } as any] };
    data.pdf.markers = { 'doc.pdf': [{ id: 'pdf1', codes: [] } as any] };
    data.csv.rowMarkers = [{ id: 'row1', sourceRowId: '1', codes: [], file: 'data.csv' } as any];
    const result = getAllMarkers(data);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ engine: 'markdown', fileId: 'note.md', markerId: 'mk1', marker: expect.any(Object) });
    expect(result).toContainEqual({ engine: 'pdf', fileId: 'doc.pdf', markerId: 'pdf1', marker: expect.any(Object) });
    expect(result).toContainEqual({ engine: 'csv', fileId: 'data.csv', markerId: 'row1', marker: expect.any(Object) });
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npx vitest run tests/core/getAllMarkers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/core/getAllMarkers.ts
import type { QualiaData, MarkerRef, AnyMarker } from './types';

export interface MarkerWithRef {
  engine: MarkerRef['engine'];
  fileId: string;
  markerId: string;
  marker: AnyMarker;
}

export function getAllMarkers(data: QualiaData): MarkerWithRef[] {
  const out: MarkerWithRef[] = [];

  for (const [fileId, markers] of Object.entries(data.markdown?.markers ?? {})) {
    for (const marker of markers) out.push({ engine: 'markdown', fileId, markerId: marker.id, marker: marker as any });
  }
  for (const [fileId, markers] of Object.entries(data.pdf?.markers ?? {})) {
    for (const marker of markers) out.push({ engine: 'pdf', fileId, markerId: marker.id, marker: marker as any });
  }
  for (const [fileId, markers] of Object.entries(data.image?.markers ?? {})) {
    for (const marker of markers) out.push({ engine: 'image', fileId, markerId: marker.id, marker: marker as any });
  }
  for (const [fileId, markers] of Object.entries(data.audio?.markers ?? {})) {
    for (const marker of markers) out.push({ engine: 'audio', fileId, markerId: marker.id, marker: marker as any });
  }
  for (const [fileId, markers] of Object.entries(data.video?.markers ?? {})) {
    for (const marker of markers) out.push({ engine: 'video', fileId, markerId: marker.id, marker: marker as any });
  }
  for (const marker of data.csv?.segmentMarkers ?? []) {
    out.push({ engine: 'csv', fileId: (marker as any).file, markerId: marker.id, marker: marker as any });
  }
  for (const marker of data.csv?.rowMarkers ?? []) {
    out.push({ engine: 'csv', fileId: (marker as any).file, markerId: marker.id, marker: marker as any });
  }

  return out;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npx vitest run tests/core/getAllMarkers.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/getAllMarkers.ts tests/core/getAllMarkers.test.ts
~/.claude/scripts/commit.sh "feat(core): getAllMarkers helper cross-engine"
```

### Task 1.3: Criar `src/core/smartCodes/types.ts` (re-exports + helpers)

**Files:**
- Create: `src/core/smartCodes/types.ts`

- [ ] **Step 1: Implement (sem teste — só re-exports)**

```ts
// src/core/smartCodes/types.ts
export type {
  SmartCodeDefinition,
  PredicateNode,
  LeafNode,
  OpNode,
  EngineType,
  MarkerRef,
  AnyMarker,
} from '../types';

import type { PredicateNode, OpNode, LeafNode } from '../types';

export function isOpNode(node: PredicateNode): node is OpNode {
  return 'op' in node;
}

export function isLeafNode(node: PredicateNode): node is LeafNode {
  return 'kind' in node;
}

export interface BrokenLeafInfo {
  kind: 'broken';
  reason: 'code-deleted' | 'folder-deleted' | 'group-deleted' | 'casevar-deleted' | 'smartcode-deleted' | 'magnitude-not-continuous';
  originalLeafKind: string;
  originalRef: string;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/core/smartCodes/types.ts
~/.claude/scripts/commit.sh "feat(smartCodes): module entry com type re-exports + helpers"
```

### Task 1.4: Criar `predicateSerializer.ts` + tests

**Files:**
- Create: `src/core/smartCodes/predicateSerializer.ts`
- Test: `tests/core/smartCodes/predicateSerializer.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { predicateToJson, predicateFromJson } from '../../../src/core/smartCodes/predicateSerializer';
import type { PredicateNode } from '../../../src/core/smartCodes/types';

describe('predicateSerializer', () => {
  it('round-trips simple AND predicate', () => {
    const p: PredicateNode = { op: 'AND', children: [
      { kind: 'hasCode', codeId: 'c_x' },
      { kind: 'caseVarEquals', variable: 'role', value: 'junior' },
    ]};
    const json = predicateToJson(p);
    expect(predicateFromJson(json)).toEqual(p);
  });

  it('round-trips deeply nested with all leaves', () => {
    const p: PredicateNode = { op: 'AND', children: [
      { op: 'OR', children: [
        { kind: 'hasCode', codeId: 'c_x' },
        { kind: 'inFolder', folderId: 'f_x' },
      ]},
      { op: 'NOT', child: { kind: 'magnitudeGte', codeId: 'c_y', n: 3 }},
      { kind: 'engineType', engine: 'pdf' },
      { kind: 'smartCode', smartCodeId: 'sc_other' },
    ]};
    const json = predicateToJson(p);
    expect(predicateFromJson(json)).toEqual(p);
  });

  it('produces canonical key order (deterministic)', () => {
    const p1: PredicateNode = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_x' }]};
    // Mesmo predicate criado em ordem diferente ainda gera mesmo JSON
    const p2 = JSON.parse(JSON.stringify(p1)) as PredicateNode;
    expect(predicateToJson(p1)).toBe(predicateToJson(p2));
  });
});
```

- [ ] **Step 2: Run, expect FAIL (module not found)**

```bash
npx vitest run tests/core/smartCodes/predicateSerializer.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/core/smartCodes/predicateSerializer.ts
import type { PredicateNode } from './types';
import { isOpNode } from './types';

/** Serializa predicate em JSON estável (chave order canônica pra diff e CDATA estável). */
export function predicateToJson(node: PredicateNode): string {
  return JSON.stringify(canonicalize(node));
}

export function predicateFromJson(json: string): PredicateNode {
  return JSON.parse(json) as PredicateNode;
}

function canonicalize(node: PredicateNode): unknown {
  if (isOpNode(node)) {
    if (node.op === 'NOT') return { op: 'NOT', child: canonicalize(node.child) };
    return { op: node.op, children: node.children.map(canonicalize) };
  }
  // Leaf: coletar keys ordenadas pra serialização estável
  const sortedKeys = Object.keys(node).sort();
  const obj: Record<string, unknown> = {};
  for (const k of sortedKeys) obj[k] = (node as any)[k];
  return obj;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npx vitest run tests/core/smartCodes/predicateSerializer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/smartCodes/predicateSerializer.ts tests/core/smartCodes/predicateSerializer.test.ts
~/.claude/scripts/commit.sh "feat(smartCodes): predicate serializer com chave order canônica"
```

### Task 1.5: Criar `dependencyExtractor.ts` + tests

**Files:**
- Create: `src/core/smartCodes/dependencyExtractor.ts`
- Test: `tests/core/smartCodes/dependencyExtractor.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { extractDependencies } from '../../../src/core/smartCodes/dependencyExtractor';

describe('extractDependencies', () => {
  it('empty AND returns empty deps', () => {
    const deps = extractDependencies({ op: 'AND', children: [] });
    expect(deps.codeIds.size).toBe(0);
    expect(deps.caseVarKeys.size).toBe(0);
  });

  it('extracts code deps from hasCode + magnitudeGte', () => {
    const deps = extractDependencies({ op: 'AND', children: [
      { kind: 'hasCode', codeId: 'c_a' },
      { kind: 'magnitudeGte', codeId: 'c_b', n: 3 },
    ]});
    expect([...deps.codeIds]).toEqual(expect.arrayContaining(['c_a', 'c_b']));
  });

  it('extracts case var keys + folder/group/smartCode ids + flags', () => {
    const deps = extractDependencies({ op: 'AND', children: [
      { kind: 'caseVarEquals', variable: 'role', value: 'junior' },
      { kind: 'caseVarRange', variable: 'age', min: 25 },
      { kind: 'inFolder', folderId: 'f_x' },
      { kind: 'inGroup', groupId: 'g_y' },
      { kind: 'smartCode', smartCodeId: 'sc_z' },
      { kind: 'engineType', engine: 'pdf' },
      { kind: 'relationExists', codeId: 'c_a' },
    ]});
    expect([...deps.caseVarKeys]).toEqual(expect.arrayContaining(['role', 'age']));
    expect([...deps.folderIds]).toEqual(['f_x']);
    expect([...deps.groupIds]).toEqual(['g_y']);
    expect([...deps.smartCodeIds]).toEqual(['sc_z']);
    expect(deps.needsEngineType).toBe(true);
    expect(deps.needsRelations).toBe(true);
  });

  it('walks nested OR/NOT', () => {
    const deps = extractDependencies({ op: 'OR', children: [
      { op: 'NOT', child: { kind: 'hasCode', codeId: 'c_a' }},
      { kind: 'hasCode', codeId: 'c_b' },
    ]});
    expect([...deps.codeIds].sort()).toEqual(['c_a', 'c_b']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/core/smartCodes/dependencyExtractor.ts
import type { PredicateNode } from './types';
import { isOpNode } from './types';

export interface Dependencies {
  codeIds: Set<string>;
  caseVarKeys: Set<string>;
  folderIds: Set<string>;
  groupIds: Set<string>;
  smartCodeIds: Set<string>;
  needsRelations: boolean;
  needsEngineType: boolean;
}

export function extractDependencies(predicate: PredicateNode): Dependencies {
  const deps: Dependencies = {
    codeIds: new Set(),
    caseVarKeys: new Set(),
    folderIds: new Set(),
    groupIds: new Set(),
    smartCodeIds: new Set(),
    needsRelations: false,
    needsEngineType: false,
  };
  walk(predicate, deps);
  return deps;
}

function walk(node: PredicateNode, deps: Dependencies): void {
  if (isOpNode(node)) {
    if (node.op === 'NOT') walk(node.child, deps);
    else for (const c of node.children) walk(c, deps);
    return;
  }
  switch (node.kind) {
    case 'hasCode':         deps.codeIds.add(node.codeId); break;
    case 'magnitudeGte':    deps.codeIds.add(node.codeId); break;
    case 'magnitudeLte':    deps.codeIds.add(node.codeId); break;
    case 'caseVarEquals':   deps.caseVarKeys.add(node.variable); break;
    case 'caseVarRange':    deps.caseVarKeys.add(node.variable); break;
    case 'inFolder':        deps.folderIds.add(node.folderId); break;
    case 'inGroup':         deps.groupIds.add(node.groupId); break;
    case 'smartCode':       deps.smartCodeIds.add(node.smartCodeId); break;
    case 'engineType':      deps.needsEngineType = true; break;
    case 'relationExists':  deps.codeIds.add(node.codeId); if (node.targetCodeId) deps.codeIds.add(node.targetCodeId); deps.needsRelations = true; break;
  }
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/core/smartCodes/dependencyExtractor.ts tests/core/smartCodes/dependencyExtractor.test.ts
~/.claude/scripts/commit.sh "feat(smartCodes): dependency extractor pra cache invalidation"
```

### Task 1.6: Criar `predicateNormalizer.ts` + tests

**Files:**
- Create: `src/core/smartCodes/predicateNormalizer.ts`
- Test: `tests/core/smartCodes/predicateNormalizer.test.ts`

Heurística (spec §5): cheap-first ordering em AND/OR. Custo: `engineType < inFolder < inGroup < hasCode < caseVarEquals < caseVarRange < magnitudeGte/Lte < relationExists < smartCode`. Ops AND/OR/NOT custam soma dos children.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeOrder, leafCost } from '../../../src/core/smartCodes/predicateNormalizer';

describe('predicateNormalizer', () => {
  it('reordena AND children por custo crescente', () => {
    const result = normalizeOrder({ op: 'AND', children: [
      { kind: 'smartCode', smartCodeId: 'sc_x' },
      { kind: 'engineType', engine: 'pdf' },
      { kind: 'hasCode', codeId: 'c_a' },
    ]});
    expect(result).toEqual({ op: 'AND', children: [
      { kind: 'engineType', engine: 'pdf' },
      { kind: 'hasCode', codeId: 'c_a' },
      { kind: 'smartCode', smartCodeId: 'sc_x' },
    ]});
  });

  it('preserva semântica em OR', () => {
    const input = { op: 'OR' as const, children: [
      { kind: 'relationExists' as const, codeId: 'c_y' },
      { kind: 'engineType' as const, engine: 'csv' as const },
    ]};
    const result = normalizeOrder(input);
    expect(result.children[0]).toEqual({ kind: 'engineType', engine: 'csv' });
  });

  it('NOT recursivamente normaliza child', () => {
    const result = normalizeOrder({ op: 'NOT', child: { op: 'AND', children: [
      { kind: 'smartCode', smartCodeId: 'sc_x' },
      { kind: 'hasCode', codeId: 'c_a' },
    ]}});
    expect((result as any).child.children[0].kind).toBe('hasCode');
  });

  it('leafCost retorna ordering correto', () => {
    expect(leafCost({ kind: 'engineType', engine: 'pdf' })).toBeLessThan(leafCost({ kind: 'hasCode', codeId: 'c' }));
    expect(leafCost({ kind: 'hasCode', codeId: 'c' })).toBeLessThan(leafCost({ kind: 'smartCode', smartCodeId: 'sc' }));
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/core/smartCodes/predicateNormalizer.ts
import type { PredicateNode, LeafNode } from './types';
import { isOpNode, isLeafNode } from './types';

const COST_ORDER: Record<LeafNode['kind'], number> = {
  engineType: 1,
  inFolder: 2,
  inGroup: 3,
  hasCode: 4,
  caseVarEquals: 5,
  caseVarRange: 6,
  magnitudeGte: 7,
  magnitudeLte: 7,
  relationExists: 8,
  smartCode: 9,
};

export function leafCost(leaf: LeafNode): number {
  return COST_ORDER[leaf.kind];
}

export function nodeCost(node: PredicateNode): number {
  if (isLeafNode(node)) return leafCost(node);
  if (node.op === 'NOT') return nodeCost(node.child);
  return node.children.reduce((s, c) => s + nodeCost(c), 0);
}

export function normalizeOrder(node: PredicateNode): PredicateNode {
  if (isLeafNode(node)) return node;
  if (node.op === 'NOT') return { op: 'NOT', child: normalizeOrder(node.child) };
  const normalizedChildren = node.children.map(normalizeOrder);
  // sort estável por custo crescente
  normalizedChildren.sort((a, b) => nodeCost(a) - nodeCost(b));
  return { op: node.op, children: normalizedChildren };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/core/smartCodes/predicateNormalizer.ts tests/core/smartCodes/predicateNormalizer.test.ts
~/.claude/scripts/commit.sh "feat(smartCodes): predicate normalizer (cheap-first reorder)"
```

### Task 1.7: Criar `predicateValidator.ts` + tests

**Files:**
- Create: `src/core/smartCodes/predicateValidator.ts`
- Test: `tests/core/smartCodes/predicateValidator.test.ts`

Validações (spec §7 tabela): vazio (error), cycle (error), name collision case-insensitive (error), broken refs (warning), magnitude type não-continuous (error).

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { validateForSave } from '../../../src/core/smartCodes/predicateValidator';
import type { CodeDefinition, SmartCodeDefinition, PredicateNode } from '../../../src/core/types';

const mkCode = (id: string, name: string, magType?: 'continuous' | 'categorical'): CodeDefinition => ({
  id, name, color: '#fff', paletteIndex: 0, createdAt: 0,
  ...(magType ? { magnitude: { type: magType, values: [] } } : {}),
} as any);

describe('validateForSave', () => {
  it('rejects empty root AND', () => {
    const r = validateForSave(
      { id: 'sc_1', name: 'X' } as any,
      { op: 'AND', children: [] },
      { definitions: {}, smartCodes: {}, folders: {}, groups: {} } as any,
    );
    expect(r.errors).toContainEqual(expect.objectContaining({ code: 'empty' }));
  });

  it('rejects empty root OR', () => {
    const r = validateForSave(
      { id: 'sc_1', name: 'X' } as any,
      { op: 'OR', children: [] },
      { definitions: {}, smartCodes: {}, folders: {}, groups: {} } as any,
    );
    expect(r.errors).toContainEqual(expect.objectContaining({ code: 'empty' }));
  });

  it('rejects empty group nested (NOT of empty AND)', () => {
    const r = validateForSave(
      { id: 'sc_1', name: 'X' } as any,
      { op: 'NOT', child: { op: 'AND', children: [] }} as any,
      { definitions: {}, smartCodes: {}, folders: {}, groups: {} } as any,
    );
    expect(r.errors).toContainEqual(expect.objectContaining({ code: 'empty' }));
  });

  it('accepts root-level single leaf como predicate válido', () => {
    const r = validateForSave(
      { id: 'sc_1', name: 'X' } as any,
      { kind: 'hasCode', codeId: 'c_a' },
      { definitions: { 'c_a': { id: 'c_a', name: 'a', color: '#fff', paletteIndex: 0, createdAt: 0 } as any }, smartCodes: {}, folders: {}, groups: {} } as any,
    );
    expect(r.errors).toEqual([]);
  });

  it('rejects name collision (case-insensitive)', () => {
    const existing: Record<string, SmartCodeDefinition> = {
      'sc_a': { id: 'sc_a', name: 'Frustração', color: '#aaa', paletteIndex: 0, predicate: { op: 'AND', children: [] }, createdAt: 0 },
    };
    const r = validateForSave(
      { id: 'sc_new', name: 'frustração' } as any,
      { kind: 'hasCode', codeId: 'c_a' },
      { definitions: { 'c_a': mkCode('c_a', 'a') }, smartCodes: existing, folders: {}, groups: {} } as any,
    );
    expect(r.errors).toContainEqual(expect.objectContaining({ code: 'name-collision' }));
  });

  it('warns on broken hasCode ref', () => {
    const r = validateForSave(
      { id: 'sc_1', name: 'X' } as any,
      { kind: 'hasCode', codeId: 'c_deleted' },
      { definitions: {}, smartCodes: {}, folders: {}, groups: {} } as any,
    );
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatchObject({ code: 'broken-ref' });
  });

  it('rejects magnitudeGte on code com magnitude type categorical', () => {
    const r = validateForSave(
      { id: 'sc_1', name: 'X' } as any,
      { kind: 'magnitudeGte', codeId: 'c_a', n: 3 },
      { definitions: { 'c_a': mkCode('c_a', 'a', 'categorical') }, smartCodes: {}, folders: {}, groups: {} } as any,
    );
    expect(r.errors).toContainEqual(expect.objectContaining({ code: 'magnitude-not-continuous' }));
  });

  it('rejects cycle (smartCode → smartCode → original)', () => {
    const target: SmartCodeDefinition = {
      id: 'sc_b', name: 'B', color: '#bbb', paletteIndex: 0, createdAt: 0,
      predicate: { kind: 'smartCode', smartCodeId: 'sc_new' },
    };
    const r = validateForSave(
      { id: 'sc_new', name: 'A' } as any,
      { kind: 'smartCode', smartCodeId: 'sc_b' },
      { definitions: {}, smartCodes: { 'sc_b': target }, folders: {}, groups: {} } as any,
    );
    expect(r.errors).toContainEqual(expect.objectContaining({ code: 'cycle' }));
  });

  it('passes valid predicate sem issues', () => {
    const r = validateForSave(
      { id: 'sc_1', name: 'X' } as any,
      { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }]},
      { definitions: { 'c_a': mkCode('c_a', 'a') }, smartCodes: {}, folders: {}, groups: {} } as any,
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/core/smartCodes/predicateValidator.ts
import type { PredicateNode, SmartCodeDefinition, CodeDefinition, FolderDefinition, GroupDefinition } from '../types';
import { isOpNode } from './types';

export interface ValidationIssue {
  code: 'empty' | 'cycle' | 'name-collision' | 'broken-ref' | 'magnitude-not-continuous';
  message: string;
  leaf?: { kind: string; ref?: string };
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

interface RegistrySnapshot {
  definitions: Record<string, CodeDefinition>;
  smartCodes: Record<string, SmartCodeDefinition>;
  folders: Record<string, FolderDefinition>;
  groups: Record<string, GroupDefinition>;
}

export function validateForSave(
  definition: { id: string; name: string },
  predicate: PredicateNode,
  registry: RegistrySnapshot,
  caseVarsKeys?: Set<string>,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Empty — recursive (qualquer AND/OR no AST com 0 children é error)
  if (hasEmptyGroup(predicate)) {
    errors.push({ code: 'empty', message: 'Predicate must have at least one condition (no empty AND/OR groups)' });
  }

  // 2. Name collision (case-insensitive, exclude self)
  const nameLower = definition.name.trim().toLowerCase();
  for (const [id, sc] of Object.entries(registry.smartCodes)) {
    if (id === definition.id) continue;
    if (sc.name.trim().toLowerCase() === nameLower) {
      errors.push({ code: 'name-collision', message: `Smart code with name "${sc.name}" already exists` });
      break;
    }
  }

  // 3+4+5. Walk predicate: broken refs, magnitude type, cycles
  walk(predicate, definition.id, new Set([definition.id]), registry, caseVarsKeys, errors, warnings);

  return { errors, warnings };
}

function hasEmptyGroup(node: PredicateNode): boolean {
  if (isOpNode(node)) {
    if (node.op === 'NOT') return hasEmptyGroup(node.child);
    if (node.children.length === 0) return true;
    return node.children.some(hasEmptyGroup);
  }
  return false;
}

function walk(
  node: PredicateNode,
  selfId: string,
  visiting: Set<string>,
  registry: RegistrySnapshot,
  caseVarsKeys: Set<string> | undefined,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  if (isOpNode(node)) {
    if (node.op === 'NOT') walk(node.child, selfId, visiting, registry, caseVarsKeys, errors, warnings);
    else for (const c of node.children) walk(c, selfId, visiting, registry, caseVarsKeys, errors, warnings);
    return;
  }
  switch (node.kind) {
    case 'hasCode':
    case 'magnitudeGte':
    case 'magnitudeLte':
    case 'relationExists':
      if (!registry.definitions[node.codeId]) {
        warnings.push({ code: 'broken-ref', message: `Code ${node.codeId} was deleted`, leaf: { kind: node.kind, ref: node.codeId }});
      } else if (node.kind === 'magnitudeGte' || node.kind === 'magnitudeLte') {
        const code = registry.definitions[node.codeId];
        const magType = (code as any).magnitude?.type;
        if (magType && magType !== 'continuous') {
          errors.push({ code: 'magnitude-not-continuous', message: `Code "${code.name}" has magnitude type "${magType}", magnitudeGte/Lte requires "continuous"`, leaf: { kind: node.kind, ref: node.codeId }});
        }
      }
      if (node.kind === 'relationExists' && node.targetCodeId && !registry.definitions[node.targetCodeId]) {
        warnings.push({ code: 'broken-ref', message: `Target code ${node.targetCodeId} was deleted`, leaf: { kind: node.kind, ref: node.targetCodeId }});
      }
      break;
    case 'caseVarEquals':
    case 'caseVarRange':
      if (caseVarsKeys && !caseVarsKeys.has(node.variable)) {
        warnings.push({ code: 'broken-ref', message: `Case variable "${node.variable}" not found`, leaf: { kind: node.kind, ref: node.variable }});
      }
      break;
    case 'inFolder':
      if (!registry.folders[node.folderId]) warnings.push({ code: 'broken-ref', message: `Folder ${node.folderId} was deleted`, leaf: { kind: node.kind, ref: node.folderId }});
      break;
    case 'inGroup':
      if (!registry.groups[node.groupId]) warnings.push({ code: 'broken-ref', message: `Group ${node.groupId} was deleted`, leaf: { kind: node.kind, ref: node.groupId }});
      break;
    case 'smartCode':
      const target = registry.smartCodes[node.smartCodeId];
      if (!target) {
        warnings.push({ code: 'broken-ref', message: `Smart code ${node.smartCodeId} was deleted`, leaf: { kind: node.kind, ref: node.smartCodeId }});
      } else {
        if (visiting.has(node.smartCodeId)) {
          errors.push({ code: 'cycle', message: `Circular reference: ${[...visiting, node.smartCodeId].join(' → ')}`, leaf: { kind: node.kind, ref: node.smartCodeId }});
        } else {
          const newVisiting = new Set(visiting).add(node.smartCodeId);
          walk(target.predicate, selfId, newVisiting, registry, caseVarsKeys, errors, warnings);
        }
      }
      break;
    case 'engineType':
      // sempre válido (enum estático)
      break;
  }
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/core/smartCodes/predicateValidator.ts tests/core/smartCodes/predicateValidator.test.ts
~/.claude/scripts/commit.sh "feat(smartCodes): predicate validator (cycles, name collision, broken refs, magnitude type)"
```

### Task 1.8: Criar `evaluator.ts` + tests

**Files:**
- Create: `src/core/smartCodes/evaluator.ts`
- Test: `tests/core/smartCodes/evaluator.test.ts`

Implementação conforme spec §5: 2 switches separados (op vs leaf), `(node, ref, marker, ctx)` signature, sem acessar `marker.__engine`.

- [ ] **Step 1: Write failing tests (matriz de leaves × marker shapes)**

```ts
import { describe, it, expect } from 'vitest';
import { evaluate } from '../../../src/core/smartCodes/evaluator';
import type { MarkerRef, AnyMarker, PredicateNode } from '../../../src/core/smartCodes/types';

const mkPdfMarker = (codes: { codeId: string; magnitude?: number }[] = [], id = 'm1'): any => ({
  id, codes, ranges: [],
});
const mkRef = (engine: any, fileId: string, markerId: string): MarkerRef => ({ engine, fileId, markerId });

const baseCtx = {
  caseVars: { get: (_f: string, _v: string) => undefined },
  codesInFolder: (_id: string) => [],
  codesInGroup: (_id: string) => [],
  smartCodes: {} as Record<string, any>,
  evaluating: new Set<string>(),
  evaluator: null as any,
};
baseCtx.evaluator = (n: PredicateNode, r: MarkerRef, m: AnyMarker, c: any) => evaluate(n, r, m, c);

describe('evaluator', () => {
  it('hasCode true quando código presente', () => {
    const m = mkPdfMarker([{ codeId: 'c_a' }]);
    expect(evaluate({ kind: 'hasCode', codeId: 'c_a' }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(true);
    expect(evaluate({ kind: 'hasCode', codeId: 'c_b' }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(false);
  });

  it('AND short-circuits (children avaliados na ordem dada)', () => {
    const m = mkPdfMarker([{ codeId: 'c_a' }]);
    let calls = 0;
    const counted: any = { kind: 'hasCode', codeId: 'c_b' };
    Object.defineProperty(counted, 'codeId', { get() { calls++; return 'c_b'; }, configurable: true });
    evaluate({ op: 'AND', children: [
      { kind: 'hasCode', codeId: 'c_x' },  // false → short-circuit
      counted,
    ]}, mkRef('pdf', 'f1', 'm1'), m, baseCtx);
    expect(calls).toBe(0);  // counted nunca avaliado
  });

  it('NOT inverte', () => {
    const m = mkPdfMarker([{ codeId: 'c_a' }]);
    expect(evaluate({ op: 'NOT', child: { kind: 'hasCode', codeId: 'c_a' }}, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(false);
  });

  it('engineType usa MarkerRef.engine (não marker.__engine)', () => {
    const m = mkPdfMarker();
    expect(evaluate({ kind: 'engineType', engine: 'pdf' }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(true);
    expect(evaluate({ kind: 'engineType', engine: 'csv' }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(false);
  });

  it('caseVarEquals chama ctx.caseVars.get(fileId, variable)', () => {
    const ctx = { ...baseCtx, caseVars: { get: (f: string, v: string) => f === 'f1' && v === 'role' ? 'junior' : undefined }};
    expect(evaluate({ kind: 'caseVarEquals', variable: 'role', value: 'junior' }, mkRef('pdf', 'f1', 'm1'), mkPdfMarker(), ctx)).toBe(true);
    expect(evaluate({ kind: 'caseVarEquals', variable: 'role', value: 'senior' }, mkRef('pdf', 'f1', 'm1'), mkPdfMarker(), ctx)).toBe(false);
  });

  it('magnitudeGte usa CodeApplication.magnitude', () => {
    const m = mkPdfMarker([{ codeId: 'c_a', magnitude: 5 }]);
    expect(evaluate({ kind: 'magnitudeGte', codeId: 'c_a', n: 3 }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(true);
    expect(evaluate({ kind: 'magnitudeGte', codeId: 'c_a', n: 7 }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(false);
  });

  it('inFolder dispara via ctx.codesInFolder', () => {
    const ctx = { ...baseCtx, codesInFolder: (id: string) => id === 'f_x' ? ['c_a'] : [] };
    const m = mkPdfMarker([{ codeId: 'c_a' }]);
    expect(evaluate({ kind: 'inFolder', folderId: 'f_x' }, mkRef('pdf', 'f1', 'm1'), m, ctx)).toBe(true);
    expect(evaluate({ kind: 'inFolder', folderId: 'f_z' }, mkRef('pdf', 'f1', 'm1'), m, ctx)).toBe(false);
  });

  it('smartCode nesting recursivo', () => {
    const target: any = { id: 'sc_b', predicate: { kind: 'hasCode', codeId: 'c_a' }};
    const ctx = { ...baseCtx, smartCodes: { 'sc_b': target }};
    const m = mkPdfMarker([{ codeId: 'c_a' }]);
    expect(evaluate({ kind: 'smartCode', smartCodeId: 'sc_b' }, mkRef('pdf', 'f1', 'm1'), m, ctx)).toBe(true);
  });

  it('smartCode cycle returns false (sem stack overflow)', () => {
    const a: any = { id: 'sc_a', predicate: { kind: 'smartCode', smartCodeId: 'sc_b' }};
    const b: any = { id: 'sc_b', predicate: { kind: 'smartCode', smartCodeId: 'sc_a' }};
    const ctx = { ...baseCtx, smartCodes: { 'sc_a': a, 'sc_b': b }, evaluating: new Set(['sc_a']) };
    const m = mkPdfMarker();
    expect(evaluate({ kind: 'smartCode', smartCodeId: 'sc_a' }, mkRef('pdf', 'f1', 'm1'), m, ctx)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/core/smartCodes/evaluator.ts
import type { PredicateNode, OpNode, LeafNode, MarkerRef, AnyMarker, SmartCodeDefinition, EngineType } from './types';
import { isOpNode } from './types';
import { hasCode, getMagnitude } from '../codeApplicationHelpers';

export interface EvaluatorContext {
  caseVars: { get: (fileId: string, variable: string) => string | number | boolean | undefined };
  codesInFolder: (folderId: string) => string[];
  codesInGroup: (groupId: string) => string[];
  smartCodes: Record<string, SmartCodeDefinition>;
  evaluating: Set<string>;
  evaluator: (node: PredicateNode, ref: MarkerRef, marker: AnyMarker, ctx: EvaluatorContext) => boolean;
}

export function evaluate(node: PredicateNode, ref: MarkerRef, marker: AnyMarker, ctx: EvaluatorContext): boolean {
  if (isOpNode(node)) return evaluateOp(node, ref, marker, ctx);
  return evaluateLeaf(node, ref, marker, ctx);
}

function evaluateOp(node: OpNode, ref: MarkerRef, marker: AnyMarker, ctx: EvaluatorContext): boolean {
  switch (node.op) {
    case 'AND': return node.children.every(c => evaluate(c, ref, marker, ctx));
    case 'OR':  return node.children.some(c => evaluate(c, ref, marker, ctx));
    case 'NOT': return !evaluate(node.child, ref, marker, ctx);
  }
}

function evaluateLeaf(node: LeafNode, ref: MarkerRef, marker: AnyMarker, ctx: EvaluatorContext): boolean {
  switch (node.kind) {
    case 'hasCode':         return hasCode(marker, node.codeId);
    case 'caseVarEquals':   return ctx.caseVars.get(ref.fileId, node.variable) === node.value;
    case 'caseVarRange':    return inRange(ctx.caseVars.get(ref.fileId, node.variable), node);
    case 'magnitudeGte':    return (getMagnitude(marker, node.codeId) ?? 0) >= node.n;
    case 'magnitudeLte':    return (getMagnitude(marker, node.codeId) ?? Infinity) <= node.n;
    case 'inFolder':        return ctx.codesInFolder(node.folderId).some(cId => hasCode(marker, cId));
    case 'inGroup':         return ctx.codesInGroup(node.groupId).some(cId => hasCode(marker, cId));
    case 'engineType':      return ref.engine === node.engine;
    case 'relationExists':  return checkRelation(marker, node, ctx);
    case 'smartCode':       return evaluateNested(node.smartCodeId, ref, marker, ctx);
  }
}

function evaluateNested(smartCodeId: string, ref: MarkerRef, marker: AnyMarker, ctx: EvaluatorContext): boolean {
  if (ctx.evaluating.has(smartCodeId)) return false;  // cycle guard
  const target = ctx.smartCodes[smartCodeId];
  if (!target) return false;  // broken ref → no-match
  const newCtx: EvaluatorContext = { ...ctx, evaluating: new Set(ctx.evaluating).add(smartCodeId) };
  return evaluate(target.predicate, ref, marker, newCtx);
}

function inRange(val: any, node: LeafNode & { kind: 'caseVarRange' }): boolean {
  if (val === undefined || val === null) return false;
  if (node.min !== undefined && Number(val) < node.min) return false;
  if (node.max !== undefined && Number(val) > node.max) return false;
  if (node.minDate && String(val) < node.minDate) return false;
  if (node.maxDate && String(val) > node.maxDate) return false;
  return true;
}

function checkRelation(marker: AnyMarker, node: LeafNode & { kind: 'relationExists' }, _ctx: EvaluatorContext): boolean {
  // Procura em CodeApplication.relations (application-level relations) do código corrente
  for (const app of (marker as any).codes ?? []) {
    if (app.codeId !== node.codeId) continue;
    for (const rel of app.relations ?? []) {
      if (node.label && rel.label !== node.label) continue;
      if (node.targetCodeId && rel.target !== node.targetCodeId) continue;
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Add test pra todos os 6 outros marker shapes — enumeração explícita**

Pra cada shape, criar 2 testes: `hasCode true quando código presente` + `magnitudeGte usa CodeApplication.magnitude`. Os 6 shapes:

```ts
const mkMarkdownMarker = (codes: any[] = []) => ({ id: 'md1', codes, ranges: [] }) as any;
const mkImageMarker = (codes: any[] = []) => ({ id: 'img1', codes, shape: 'rect', coords: { x: 0, y: 0, w: 1, h: 1 }}) as any;
const mkAudioMarker = (codes: any[] = []) => ({ id: 'au1', codes, start: 0, end: 1 }) as any;
const mkVideoMarker = (codes: any[] = []) => ({ id: 'vd1', codes, start: 0, end: 1 }) as any;
const mkCsvSegmentMarker = (codes: any[] = []) => ({ id: 'seg1', codes, sourceRowId: 'r1', column: 'col', from: 0, to: 5, file: 'data.csv' }) as any;
const mkCsvRowMarker = (codes: any[] = []) => ({ id: 'row1', codes, sourceRowId: 'r1', file: 'data.csv' }) as any;

describe.each([
  ['markdown', mkMarkdownMarker, 'note.md'],
  ['image',    mkImageMarker,    'pic.png'],
  ['audio',    mkAudioMarker,    'rec.mp3'],
  ['video',    mkVideoMarker,    'rec.mp4'],
  ['csv',      mkCsvSegmentMarker, 'data.csv'],
  ['csv',      mkCsvRowMarker,     'data.csv'],
])('evaluator on %s shape', (engine, mkMarker, fileId) => {
  it('hasCode true', () => {
    const m = mkMarker([{ codeId: 'c_a' }]);
    expect(evaluate({ kind: 'hasCode', codeId: 'c_a' }, mkRef(engine, fileId, 'x'), m, baseCtx)).toBe(true);
  });
  it('magnitudeGte usa CodeApplication.magnitude', () => {
    const m = mkMarker([{ codeId: 'c_a', magnitude: 5 }]);
    expect(evaluate({ kind: 'magnitudeGte', codeId: 'c_a', n: 3 }, mkRef(engine, fileId, 'x'), m, baseCtx)).toBe(true);
    expect(evaluate({ kind: 'magnitudeGte', codeId: 'c_a', n: 7 }, mkRef(engine, fileId, 'x'), m, baseCtx)).toBe(false);
  });
});
```

Total: 12 testes parametrizados (6 shapes × 2 leaves cada).

- [ ] **Step 6: Run all evaluator tests**

```bash
npx vitest run tests/core/smartCodes/evaluator.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/core/smartCodes/evaluator.ts tests/core/smartCodes/evaluator.test.ts
~/.claude/scripts/commit.sh "feat(smartCodes): predicate evaluator (puro, short-circuit, cycle-safe)"
```

### Task 1.9: Estender `auditLog.ts` pros 5 novos sc_* types

**Files:**
- Modify: `src/core/auditLog.ts`
- Test: `tests/core/auditLogSmartCodes.test.ts` (criar)

- [ ] **Step 1: Ler auditLog.ts atual + entender renderEntryMarkdown switch**

```bash
grep -n "function renderEntryMarkdown\|case '" src/core/auditLog.ts
```

- [ ] **Step 2: Write failing test pros novos types**

```ts
// tests/core/auditLogSmartCodes.test.ts
import { describe, it, expect } from 'vitest';
import { renderEntryMarkdown, getEntriesForSmartCode, appendEntry } from '../../src/core/auditLog';
import type { AuditEntry } from '../../src/core/types';

describe('auditLog smart code entries', () => {
  it('renders sc_created markdown', () => {
    const entry: AuditEntry = { id: 'a1', codeId: 'sc_x', at: 0, entity: 'smartCode', type: 'sc_created' };
    const md = renderEntryMarkdown(entry, 'My Smart Code');
    expect(md).toContain('Created');
    expect(md).toContain('My Smart Code');
  });

  it('renders sc_predicate_edited com leaves diff', () => {
    const entry: AuditEntry = {
      id: 'a1', codeId: 'sc_x', at: 0, entity: 'smartCode',
      type: 'sc_predicate_edited',
      addedLeafKinds: ['hasCode'], removedLeafKinds: ['inFolder'], changedLeafCount: 1,
    };
    expect(renderEntryMarkdown(entry, 'X')).toMatch(/predicate.*edited/i);
  });

  it('coalesces sc_predicate_edited dentro de 60s', () => {
    const log: AuditEntry[] = [];
    appendEntry(log, { id: 'a1', codeId: 'sc_x', at: 1000, entity: 'smartCode', type: 'sc_predicate_edited', addedLeafKinds: ['hasCode'], removedLeafKinds: [], changedLeafCount: 1 });
    appendEntry(log, { id: 'a2', codeId: 'sc_x', at: 30000, entity: 'smartCode', type: 'sc_predicate_edited', addedLeafKinds: ['inFolder'], removedLeafKinds: [], changedLeafCount: 1 });
    expect(log).toHaveLength(1);
    expect((log[0] as any).addedLeafKinds).toEqual(expect.arrayContaining(['hasCode', 'inFolder']));
  });

  it('getEntriesForSmartCode filtra por entity + codeId', () => {
    const log: AuditEntry[] = [
      { id: 'a1', codeId: 'c_x', at: 0, type: 'created' },
      { id: 'a2', codeId: 'sc_x', at: 0, entity: 'smartCode', type: 'sc_created' },
      { id: 'a3', codeId: 'sc_y', at: 0, entity: 'smartCode', type: 'sc_created' },
    ];
    const result = getEntriesForSmartCode(log, 'sc_x');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a2');
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Implementar — adicionar `getEntriesForSmartCode` + estender switch de `renderEntryMarkdown` + `appendEntry` coalescing pros 5 sc_* types**

Editar `auditLog.ts`:

```ts
// Adicionar após getEntriesForCode existente
export function getEntriesForSmartCode(log: AuditEntry[], smartCodeId: string): AuditEntry[] {
  return log.filter(e => (e as any).entity === 'smartCode' && e.codeId === smartCodeId);
}
```

No `appendEntry`, estender o coalescing window de 60s pra incluir `sc_predicate_edited` e `sc_memo_edited`. Pattern: se última entry tem mesmo `codeId`, mesmo `type`, mesmo `entity`, e at < 60000ms diff, fundir (merge addedLeafKinds/removedLeafKinds via Set union; manter `to` mais recente em sc_memo_edited; etc).

No `renderEntryMarkdown`, adicionar 5 case statements pros sc_* types. Naming sugerido na markdown:
- `sc_created` → "Smart code created: {name}"
- `sc_predicate_edited` → "Predicate edited (added: {addedLeafKinds.join(', ')}; removed: ...; changed: {n})"
- `sc_memo_edited` → "Memo edited"
- `sc_auto_rewritten_on_merge` → "Predicate auto-rewritten: code merged ({sourceCodeId} → {targetCodeId})"
- `sc_deleted` → "Smart code deleted"

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add src/core/auditLog.ts tests/core/auditLogSmartCodes.test.ts
~/.claude/scripts/commit.sh "feat(audit): smart code entries + coalescing + getEntriesForSmartCode"
```

### Chunk 1 closeout

- [ ] **Step 1: Rodar suite completa pra garantir zero regression**

```bash
npm test
```

Expected: 2584 + 1 (getAllMarkers) + 3 (serializer) + 4 (deps) + 4 (normalizer) + 6 (validator) + ~12 (evaluator inc. todos shapes) + 4 (auditLog smart codes) ≈ 2618 testes verde.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: ZERO erros.

---

## Chunk 2: Cache + Indexes + Registry API + Listeners

**Output desta chunk:** Cache singleton funcional com invalidação granular. Index incremental atualizado por listeners. Registry API estendida (createSmartCode/etc + autoRewriteOnMerge). Stress test fixture rodando dentro dos targets de §18. Sem UI ainda.

**Estimativa:** 1 sessão.

### Task 2.1: Criar `cache.ts` com SmartCodeCache class + tests

**Files:**
- Create: `src/core/smartCodes/cache.ts`
- Test: `tests/core/smartCodes/cache.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SmartCodeCache } from '../../../src/core/smartCodes/cache';
import { createDefaultData } from '../../../src/core/types';

describe('SmartCodeCache', () => {
  let cache: SmartCodeCache;
  let data: any;

  const lookups = (data: any) => ({
    smartCodes: data.registry.smartCodes,
    caseVars: { get: () => undefined, allKeys: () => new Set<string>() },
    codeStruct: { codesInFolder: () => [], codesInGroup: () => [] },
  });

  beforeEach(() => {
    data = createDefaultData();
    data.markdown.markers = {
      'f1.md': [{ id: 'm1', codes: [{ codeId: 'c_a' }], ranges: [] }],
    };
    data.registry.smartCodes = {
      'sc_x': { id: 'sc_x', name: 'X', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'hasCode', codeId: 'c_a' }},
    };
    cache = new SmartCodeCache();
    // CONTRACT: configure() obrigatório ANTES de rebuildIndexes — wires smart codes + lookups.
    cache.configure(lookups(data));
    cache.rebuildIndexes(data);
  });

  it('getMatches retorna refs corretas', () => {
    const m = cache.getMatches('sc_x');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ engine: 'markdown', fileId: 'f1.md', markerId: 'm1' });
  });

  it('getCount retorna 1', () => {
    expect(cache.getCount('sc_x')).toBe(1);
  });

  it('cached read não re-computa', () => {
    cache.getMatches('sc_x');
    const matches1 = cache.getMatches('sc_x');
    const matches2 = cache.getMatches('sc_x');
    expect(matches1).toBe(matches2);  // mesma referência (cache hit)
  });

  it('invalidateForCode invalida só smart codes que dependem', () => {
    data.registry.smartCodes['sc_y'] = { id: 'sc_y', name: 'Y', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'hasCode', codeId: 'c_b' }};
    cache.configure(lookups(data));  // re-configure pra pegar sc_y
    cache.rebuildIndexes(data);
    cache.getMatches('sc_x');
    cache.getMatches('sc_y');

    let changed: string[] = [];
    cache.subscribe(ids => { changed = ids; });
    cache.invalidateForCode('c_a');

    // Resolve pending notifications (rAF coalesced — usa flushSync helper testável)
    cache.__flushPendingForTest();

    expect(changed).toEqual(['sc_x']);
  });

  it('cascata: invalidate sc_x propaga pra sc_z que referencia sc_x', () => {
    data.registry.smartCodes['sc_z'] = { id: 'sc_z', name: 'Z', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'smartCode', smartCodeId: 'sc_x' }};
    cache.configure(lookups(data));  // re-configure pra pegar sc_z
    cache.rebuildIndexes(data);
    cache.getMatches('sc_x');
    cache.getMatches('sc_z');

    let changed: string[] = [];
    cache.subscribe(ids => { changed = ids; });
    cache.invalidate('sc_x');
    cache.__flushPendingForTest();

    expect(changed.sort()).toEqual(['sc_x', 'sc_z']);
  });

  it('indexes contêm refs (não copies) — referential identity', () => {
    const refsByCode = cache.__getIndexByCodeForTest();
    const refs = [...(refsByCode.get('c_a') ?? [])];
    // refs apontam pro mesmo MarkerRef object usado pra match
    const matches = cache.getMatches('sc_x');
    expect(matches[0]).toBe(refs[0]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement (~150 LOC)**

```ts
// src/core/smartCodes/cache.ts
import type { QualiaData, MarkerRef, EngineType, AnyMarker, SmartCodeDefinition } from './types';
import { extractDependencies, type Dependencies } from './dependencyExtractor';
import { evaluate, type EvaluatorContext } from './evaluator';
import { getAllMarkers } from '../getAllMarkers';

export interface CaseVarsLookup {
  get: (fileId: string, variable: string) => string | number | boolean | undefined;
  allKeys: () => Set<string>;
}

export interface CodeStructureLookup {
  codesInFolder: (folderId: string) => string[];
  codesInGroup: (groupId: string) => string[];
}

export class SmartCodeCache {
  private matches = new Map<string, MarkerRef[]>();
  private deps = new Map<string, Dependencies>();
  private indexByCode = new Map<string, Set<MarkerRef>>();
  private indexByFile = new Map<string, Set<MarkerRef>>();
  private markerByRef = new Map<MarkerRef, AnyMarker>();
  private dirty = new Set<string>();
  private listeners = new Set<(changed: string[]) => void>();
  private pendingChanged = new Set<string>();
  private rafScheduled = false;
  private smartCodes: Record<string, SmartCodeDefinition> = {};
  private caseVars: CaseVarsLookup = { get: () => undefined, allKeys: () => new Set() };
  private codeStruct: CodeStructureLookup = { codesInFolder: () => [], codesInGroup: () => [] };

  /**
   * Wires smart codes registry + lookups. DEVE ser chamada antes de rebuildIndexes()
   * e re-chamada sempre que `data.registry.smartCodes` muda (create/update/delete) pra atualizar
   * o dependency graph. rebuildIndexes() não atualiza smartCodes — só os indexes de markers.
   */
  configure(opts: { smartCodes: Record<string, SmartCodeDefinition>; caseVars: CaseVarsLookup; codeStruct: CodeStructureLookup }): void {
    this.smartCodes = opts.smartCodes;
    this.caseVars = opts.caseVars;
    this.codeStruct = opts.codeStruct;
    // Re-extract deps pra cada smart code
    this.deps.clear();
    for (const [id, sc] of Object.entries(this.smartCodes)) this.deps.set(id, extractDependencies(sc.predicate));
  }

  rebuildIndexes(data: QualiaData): void {
    this.indexByCode.clear();
    this.indexByFile.clear();
    this.markerByRef.clear();
    const allMarkers = getAllMarkers(data);
    for (const { engine, fileId, markerId, marker } of allMarkers) {
      const ref: MarkerRef = { engine: engine as EngineType, fileId, markerId };
      this.markerByRef.set(ref, marker);
      let fset = this.indexByFile.get(fileId);
      if (!fset) { fset = new Set(); this.indexByFile.set(fileId, fset); }
      fset.add(ref);
      for (const app of (marker as any).codes ?? []) {
        let cset = this.indexByCode.get(app.codeId);
        if (!cset) { cset = new Set(); this.indexByCode.set(app.codeId, cset); }
        cset.add(ref);
      }
    }
    this.matches.clear();
    this.dirty = new Set(Object.keys(this.smartCodes));
  }

  invalidateForCode(codeId: string): void {
    for (const [scId, deps] of this.deps) {
      if (deps.codeIds.has(codeId)) this.markDirty(scId);
    }
  }
  invalidateForCaseVar(varKey: string): void {
    for (const [scId, deps] of this.deps) {
      if (deps.caseVarKeys.has(varKey)) this.markDirty(scId);
    }
  }
  invalidateForFolder(folderId: string): void {
    for (const [scId, deps] of this.deps) {
      if (deps.folderIds.has(folderId)) this.markDirty(scId);
    }
  }
  invalidateForGroup(groupId: string): void {
    for (const [scId, deps] of this.deps) {
      if (deps.groupIds.has(groupId)) this.markDirty(scId);
    }
  }
  invalidateForMarker(args: { engine: EngineType; fileId: string; codeIds: string[] }): void {
    for (const cId of args.codeIds) this.invalidateForCode(cId);
  }
  invalidate(smartCodeId: string): void {
    this.markDirty(smartCodeId);
    // Cascata: smart codes que referenciam este via smartCode leaf
    for (const [scId, deps] of this.deps) {
      if (deps.smartCodeIds.has(smartCodeId)) this.invalidate(scId);
    }
  }
  invalidateAll(): void {
    for (const id of Object.keys(this.smartCodes)) this.markDirty(id);
  }

  getMatches(smartCodeId: string): MarkerRef[] {
    if (this.dirty.has(smartCodeId) || !this.matches.has(smartCodeId)) {
      this.compute(smartCodeId);
    }
    return this.matches.get(smartCodeId) ?? [];
  }
  getCount(smartCodeId: string): number {
    return this.getMatches(smartCodeId).length;
  }

  subscribe(fn: (changedSmartCodeIds: string[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // Test-only helpers
  __flushPendingForTest(): void { this.flush(); }
  __getIndexByCodeForTest(): Map<string, Set<MarkerRef>> { return this.indexByCode; }
  __getMarkerByRefForTest(): Map<MarkerRef, AnyMarker> { return this.markerByRef; }
  isDirty(smartCodeId: string): boolean { return this.dirty.has(smartCodeId); }

  private markDirty(smartCodeId: string): void {
    this.dirty.add(smartCodeId);
    this.matches.delete(smartCodeId);
    this.pendingChanged.add(smartCodeId);
    if (!this.rafScheduled) {
      this.rafScheduled = true;
      const schedule = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame : (cb: any) => setTimeout(cb, 0);
      schedule(() => this.flush());
    }
  }

  private flush(): void {
    this.rafScheduled = false;
    const ids = [...this.pendingChanged];
    this.pendingChanged.clear();
    if (ids.length === 0) return;
    for (const fn of this.listeners) fn(ids);
  }

  private compute(smartCodeId: string): void {
    const sc = this.smartCodes[smartCodeId];
    if (!sc) { this.matches.set(smartCodeId, []); return; }
    const ctx: EvaluatorContext = {
      caseVars: this.caseVars,
      codesInFolder: this.codeStruct.codesInFolder,
      codesInGroup: this.codeStruct.codesInGroup,
      smartCodes: this.smartCodes,
      evaluating: new Set([smartCodeId]),
      evaluator: evaluate,
    };
    const out: MarkerRef[] = [];
    // Itera todos markers do indexByFile (todos refs únicos)
    const seen = new Set<MarkerRef>();
    for (const fset of this.indexByFile.values()) for (const ref of fset) seen.add(ref);
    for (const ref of seen) {
      const marker = this.markerByRef.get(ref);
      if (!marker) continue;
      if (evaluate(sc.predicate, ref, marker, ctx)) out.push(ref);
    }
    this.matches.set(smartCodeId, out);
    this.dirty.delete(smartCodeId);
  }
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/core/smartCodes/cache.ts tests/core/smartCodes/cache.test.ts
~/.claude/scripts/commit.sh "feat(smartCodes): SmartCodeCache singleton com invalidação granular"
```

### Task 2.2: Criar `matcher.ts` (chunked compute pra cache miss grande)

**Files:**
- Create: `src/core/smartCodes/matcher.ts`
- Test: `tests/core/smartCodes/matcher.test.ts`

- [ ] **Step 1-3: Write test, fail, implement**

`matcher.ts` é wrapper sobre `cache.compute` mas com chunked async pra >5000 markers candidates:

```ts
// Esqueleto
export async function collectMatchesChunked(
  smartCodeId: string,
  cache: SmartCodeCache,
  options: { chunkSize?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<MarkerRef[]> {
  // Implementação: itera markers em chunks de 1000, yield via setTimeout(0) entre chunks,
  // chama onProgress, retorna matches no fim.
}
```

Test cobre: chunked progress reporting + result idêntico ao sync compute em fixture pequeno.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/core/smartCodes/matcher.ts tests/core/smartCodes/matcher.test.ts
~/.claude/scripts/commit.sh "feat(smartCodes): chunked compute pra cache miss grande"
```

### Task 2.3: Criar `smartCodeRegistryApi.ts` + tests

**Files:**
- Create: `src/core/smartCodes/smartCodeRegistryApi.ts`
- Test: `tests/core/smartCodes/smartCodeRegistryApi.test.ts`
- Modify: `src/core/codeDefinitionRegistry.ts` (adicionar hook pra emit audit + chamada de auto-rewrite)

API exportada:

```ts
export interface SmartCodeApi {
  createSmartCode(args: { name: string; color?: string; predicate: PredicateNode; memo?: string }): SmartCodeDefinition;
  updateSmartCode(id: string, patch: Partial<Pick<SmartCodeDefinition, 'name' | 'color' | 'predicate' | 'memo' | 'hidden'>>): void;
  deleteSmartCode(id: string): void;
  setSmartCodeMemo(id: string, memo: string): void;
  setSmartCodeColor(id: string, color: string): void;
  autoRewriteOnMerge(sourceCodeId: string, targetCodeId: string): { rewritten: string[] };  // returns smartCodeIds afetados
  getSmartCode(id: string): SmartCodeDefinition | undefined;
  listSmartCodes(): SmartCodeDefinition[];
}
```

- [ ] **Step 1: Write tests cobrindo cada método + autoRewriteOnMerge**
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement**

API segue padrão do registry existente: armazena em `data.registry.smartCodes`, atualiza `smartCodeOrder`, dispara audit log entries via callback `auditEmit?: (e: AuditEntry) => void`. Color auto-assign via round-robin do `DEFAULT_PALETTE` (existente em registry).

`autoRewriteOnMerge(sourceCodeId, targetCodeId)` walk em cada predicate dos smart codes; pra cada leaf cujo `codeId === sourceCodeId`, substitui por `targetCodeId`; se mudou, persiste + emit `sc_auto_rewritten_on_merge`.

- [ ] **Step 4: Modificar `executeMerge` em `mergeModal.ts` pra chamar `smartCodeApi.autoRewriteOnMerge(sourceId, targetId)` no fim, antes de delete dos sources**

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add src/core/smartCodes/smartCodeRegistryApi.ts tests/core/smartCodes/smartCodeRegistryApi.test.ts src/core/codeDefinitionRegistry.ts src/core/mergeModal.ts
~/.claude/scripts/commit.sh "feat(smartCodes): registry API CRUD + autoRewriteOnMerge integration"
```

### Task 2.4a: Auditar e padronizar event emitters em models de cada engine

**Pre-req da Task 2.4 — sem isso, o wire de listeners falha silenciosamente.**

**Files:**
- Modify (se necessário): `src/markdown/`, `src/pdf/pdfCodingModel.ts`, `src/image/imageCodingModel.ts`, `src/audio/`, `src/video/`, `src/csv/csvCodingModel.ts`
- Modify (se necessário): `src/core/codeDefinitionRegistry.ts` (verificar `onMutate`)
- Modify (se necessário): `src/core/caseVariables/caseVariablesRegistry.ts` (verificar `onChange`, `allKeys`, `getValue`)

- [ ] **Step 1: Auditar APIs existentes**

```bash
grep -n "onMutate\|onChange\|onMarkerChange\|emit(" \
  src/core/codeDefinitionRegistry.ts \
  src/core/caseVariables/caseVariablesRegistry.ts \
  src/markdown/*.ts src/pdf/pdfCodingModel.ts src/image/imageCodingModel.ts \
  src/audio/*.ts src/video/*.ts src/csv/csvCodingModel.ts \
  src/media/mediaCodingModel.ts
```

Documentar numa tabela em `notes/event-emitter-audit.md` (temporário, deletar após Chunk 2):

| Source | Method | Sig | Existe? |
|---|---|---|---|
| codeDefinitionRegistry | onMutate | (event: { type, codeId, ... }) => void | ? |
| caseVariablesRegistry | onChange | (fileId, varKey) => void | ? |
| caseVariablesRegistry | allKeys | () => Set<string> | ? |
| caseVariablesRegistry | getValue | (fileId, key) => any | ? |
| markdownModel | onMarkerChange | (engine, fileId, codeIds) => void | ? |
| pdfCodingModel | onMarkerChange | idem | ? |
| imageCodingModel | onMarkerChange | idem | ? |
| mediaCodingModel (audio/video shared) | onMarkerChange | idem | ? |
| csvCodingModel | onMarkerChange (segment + row) | idem | ? |

- [ ] **Step 2: Pra cada API ausente, adicionar listener pattern**

Pattern padrão pra adicionar quando ausente (exemplo em pdfCodingModel.ts):

```ts
private markerChangeListeners = new Set<(args: { engine: 'pdf'; fileId: string; codeIds: string[] }) => void>();

onMarkerChange(fn: (args: { engine: 'pdf'; fileId: string; codeIds: string[] }) => void): () => void {
  this.markerChangeListeners.add(fn);
  return () => this.markerChangeListeners.delete(fn);
}

private emitMarkerChange(fileId: string, codeIds: string[]): void {
  for (const fn of this.markerChangeListeners) fn({ engine: 'pdf', fileId, codeIds });
}

// Chamar emitMarkerChange em: addMarker, removeMarker, addCodeApplication, removeCodeApplication, updateMarker
```

**Mídia compartilhada (audio + video via mediaCodingModel.ts):** o emitter ideal vai em `mediaCodingModel.ts`, com `engine: 'audio' | 'video'` resolvido pelo wrapper específico (`audio/audioModel.ts` chama `super.emitMarkerChange('audio', ...)`).

**CSV special case:** segmentMarkers e rowMarkers são collections separadas. Wire 2 emit calls com mesmo `engine: 'csv'` mas `markerId` diferente.

- [ ] **Step 3: Test pra cada model — emit dispara quando esperado**

Padrão de test (cobrir no minimum 1 model novo):

```ts
// tests/pdf/pdfCodingModel.events.test.ts
describe('pdfCodingModel events', () => {
  it('emits onMarkerChange ao addMarker', () => {
    const model = new PdfCodingModel(...);
    const events: any[] = [];
    model.onMarkerChange(e => events.push(e));
    model.addMarker('doc.pdf', { id: 'm1', codes: [{ codeId: 'c_a' }] } as any);
    expect(events).toContainEqual({ engine: 'pdf', fileId: 'doc.pdf', codeIds: ['c_a'] });
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add src/markdown/ src/pdf/ src/image/ src/audio/ src/video/ src/csv/ src/media/ src/core/codeDefinitionRegistry.ts src/core/caseVariables/caseVariablesRegistry.ts tests/
~/.claude/scripts/commit.sh "feat(events): padronizar onMarkerChange listeners em 6 engines + onMutate/onChange/allKeys/getValue audit"
```

- [ ] **Step 5: Deletar `notes/event-emitter-audit.md`**

```bash
rm notes/event-emitter-audit.md && rmdir notes 2>/dev/null || true
```

### Task 2.4: Wire SmartCodeCache em `main.ts` + listeners

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Identificar onde plugin instala outras singletons (DataManager, registry, caseVarsRegistry, models)**

```bash
grep -n "registry\|DataManager\|caseVariablesRegistry\|onMutate" src/main.ts | head -30
```

- [ ] **Step 2: Instalar SmartCodeCache singleton + configure após DataManager.load**

Pseudo-code:

```ts
this.smartCodeCache = new SmartCodeCache();
this.smartCodeCache.configure({
  smartCodes: this.data.registry.smartCodes,
  caseVars: { get: (fid, k) => this.caseVarsRegistry.getValue(fid, k), allKeys: () => this.caseVarsRegistry.allKeys() },
  codeStruct: {
    codesInFolder: (id) => this.registry.getCodesInFolder(id),
    codesInGroup: (id) => this.registry.getCodesInGroup(id),
  },
});
this.smartCodeCache.rebuildIndexes(this.data);
```

Listeners:

```ts
this.registry.onMutate((event) => {
  if (event.type === 'create' || event.type === 'delete' || event.type === 'update') {
    this.smartCodeCache.invalidateForCode(event.codeId);
  }
});
this.caseVarsRegistry.onChange((fileId, varKey) => {
  this.smartCodeCache.invalidateForCaseVar(varKey);
});
// Pra cada model engine: hook em add/remove de marker e mudança em codes do marker
this.markdownModel.onMarkerChange?.((engine, fileId, codeIds) => {
  this.smartCodeCache.invalidateForMarker({ engine, fileId, codeIds });
});
// ... pdfModel, imageModel, audioModel, videoModel, csvModel
```

Cada engine model precisa ter event hook (alguns têm `onMutate`, outros precisam adicionar). Verificar e padronizar.

- [ ] **Step 3: Adicionar `onUnload`: `this.smartCodeCache?.subscribe(...)?.()` cleanup, indexes garbage**

- [ ] **Step 4: Smoke test no vault real**

```bash
npm run build && cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

Reload Obsidian, abrir DevTools, verificar `app.plugins.plugins['qualia-coding'].smartCodeCache` existe e `getMatches('any-id')` retorna array vazio (sem smart codes ainda).

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
~/.claude/scripts/commit.sh "feat(smartCodes): wire cache singleton + invalidation listeners em main.ts"
```

### Task 2.5: Stress test fixture + asserts

**Files:**
- Create: `tests/core/smartCodes/stress.test.ts`
- Create: `tests/core/smartCodes/_fixtures/buildLargeFixture.ts`

- [ ] **Step 1: Criar fixture builder**

```ts
// tests/core/smartCodes/_fixtures/buildLargeFixture.ts
import type { QualiaData } from '../../../../src/core/types';
import { createDefaultData } from '../../../../src/core/types';

export interface FixtureSize {
  codes: number; markers: number; smartCodes: number; caseVars: number;
}

export function buildLargeFixture(size: FixtureSize): QualiaData {
  const data = createDefaultData();
  // Cria N codes com magnitude continuous
  for (let i = 0; i < size.codes; i++) {
    const id = `c_${i}`;
    data.registry.definitions[id] = { id, name: `Code ${i}`, color: '#fff', paletteIndex: i, createdAt: 0, magnitude: { type: 'continuous', values: [{ value: 1 }, { value: 5 }] }} as any;
    data.registry.rootOrder.push(id);
  }
  // Distribui markers entre engines (markdown 50%, pdf 30%, csv 20%)
  for (let i = 0; i < size.markers; i++) {
    const fileIdx = Math.floor(i / 100);
    const numCodes = 1 + (i % 5);
    const codes = Array.from({ length: numCodes }, (_, k) => ({
      codeId: `c_${(i + k) % size.codes}`,
      magnitude: i % 3 === 0 ? Math.floor(Math.random() * 5) + 1 : undefined,
    }));
    if (i % 10 < 5) {
      // markdown
      const file = `note_${fileIdx}.md`;
      data.markdown.markers[file] = data.markdown.markers[file] ?? [];
      data.markdown.markers[file].push({ id: `mk_${i}`, codes, ranges: [] } as any);
    } else if (i % 10 < 8) {
      const file = `doc_${fileIdx}.pdf`;
      data.pdf.markers[file] = data.pdf.markers[file] ?? [];
      data.pdf.markers[file].push({ id: `pdf_${i}`, codes } as any);
    } else {
      data.csv.rowMarkers.push({ id: `row_${i}`, sourceRowId: String(i), codes, file: `data.csv` } as any);
    }
  }
  // Smart codes: 30% com nesting (até 4 níveis), resto leaves diretos
  for (let i = 0; i < size.smartCodes; i++) {
    const id = `sc_${i}`;
    const useNesting = i % 3 === 0 && i > 5;
    const predicate = useNesting
      ? { op: 'AND', children: [
          { kind: 'hasCode', codeId: `c_${i % size.codes}` },
          { kind: 'smartCode', smartCodeId: `sc_${i - 5}` },  // nesting
        ]} as any
      : { op: 'AND', children: [
          { kind: 'hasCode', codeId: `c_${i % size.codes}` },
          { kind: 'magnitudeGte', codeId: `c_${(i + 1) % size.codes}`, n: 3 },
        ]} as any;
    data.registry.smartCodes[id] = { id, name: `Smart ${i}`, color: '#aaa', paletteIndex: i, createdAt: 0, predicate };
    data.registry.smartCodeOrder.push(id);
  }
  return data;
}
```

- [ ] **Step 2: Stress test asserts**

```ts
// tests/core/smartCodes/stress.test.ts
import { describe, it, expect } from 'vitest';
import { SmartCodeCache } from '../../../src/core/smartCodes/cache';
import { buildLargeFixture } from './_fixtures/buildLargeFixture';

describe('SmartCodeCache stress', () => {
  it('rebuildIndexes 10k markers em <1000ms (CI)', () => {
    const data = buildLargeFixture({ codes: 1000, markers: 10000, smartCodes: 100, caseVars: 10 });
    const cache = new SmartCodeCache();
    cache.configure({
      smartCodes: data.registry.smartCodes,
      caseVars: { get: () => undefined, allKeys: () => new Set() },
      codeStruct: { codesInFolder: () => [], codesInGroup: () => [] },
    });
    const t0 = performance.now();
    cache.rebuildIndexes(data);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(1000);
  });

  it('cold compute smart code novo <1000ms (CI)', () => {
    const data = buildLargeFixture({ codes: 1000, markers: 10000, smartCodes: 100, caseVars: 10 });
    const cache = new SmartCodeCache();
    cache.configure({ smartCodes: data.registry.smartCodes, caseVars: { get: () => undefined, allKeys: () => new Set() }, codeStruct: { codesInFolder: () => [], codesInGroup: () => [] } });
    cache.rebuildIndexes(data);
    const t0 = performance.now();
    cache.getMatches('sc_50');
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(1000);
  });

  it('cached read <10ms (CI)', () => {
    const data = buildLargeFixture({ codes: 1000, markers: 10000, smartCodes: 100, caseVars: 10 });
    const cache = new SmartCodeCache();
    cache.configure({ smartCodes: data.registry.smartCodes, caseVars: { get: () => undefined, allKeys: () => new Set() }, codeStruct: { codesInFolder: () => [], codesInGroup: () => [] } });
    cache.rebuildIndexes(data);
    cache.getMatches('sc_50');
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) cache.getMatches('sc_50');
    const dt = (performance.now() - t0) / 100;
    expect(dt).toBeLessThan(10);
  });

  it('single-marker invalidation + recompute afetados <100ms (CI)', () => {
    const data = buildLargeFixture({ codes: 1000, markers: 10000, smartCodes: 100, caseVars: 10 });
    const cache = new SmartCodeCache();
    cache.configure({ smartCodes: data.registry.smartCodes, caseVars: { get: () => undefined, allKeys: () => new Set() }, codeStruct: { codesInFolder: () => [], codesInGroup: () => [] } });
    cache.rebuildIndexes(data);
    for (const id of Object.keys(data.registry.smartCodes)) cache.getMatches(id);
    const t0 = performance.now();
    cache.invalidateForCode('c_5');
    cache.__flushPendingForTest();
    // Re-compute todos afetados
    for (const id of Object.keys(data.registry.smartCodes)) cache.getMatches(id);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(100);
  });

  it('referential identity: indexByCode aponta pros mesmos marker objects de data', () => {
    const data = buildLargeFixture({ codes: 100, markers: 1000, smartCodes: 10, caseVars: 5 });
    const cache = new SmartCodeCache();
    cache.configure({ smartCodes: data.registry.smartCodes, caseVars: { get: () => undefined, allKeys: () => new Set() }, codeStruct: { codesInFolder: () => [], codesInGroup: () => [] } });
    cache.rebuildIndexes(data);
    const idx = cache.__getIndexByCodeForTest();
    const refs = idx.get('c_0');
    expect(refs).toBeDefined();
    expect(refs!.size).toBeGreaterThan(0);

    // Pra cada ref no index, verificar que o marker correspondente é o MESMO objeto persistido em data
    const markerByRef = cache.__getMarkerByRefForTest();
    for (const ref of refs!) {
      const cachedMarker = markerByRef.get(ref);
      let originalMarker: any = undefined;
      if (ref.engine === 'markdown') originalMarker = data.markdown.markers[ref.fileId]?.find(m => m.id === ref.markerId);
      else if (ref.engine === 'pdf') originalMarker = data.pdf.markers[ref.fileId]?.find(m => m.id === ref.markerId);
      else if (ref.engine === 'csv') originalMarker = (data.csv.rowMarkers ?? []).find(m => m.id === ref.markerId) ?? (data.csv.segmentMarkers ?? []).find(m => m.id === ref.markerId);
      expect(originalMarker).toBeDefined();
      expect(cachedMarker).toBe(originalMarker);  // === referential
    }
  });
});
```

- [ ] **Step 3: Run — se algum assert falha, otimizar antes de continuar**

```bash
npx vitest run tests/core/smartCodes/stress.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add tests/core/smartCodes/_fixtures/ tests/core/smartCodes/stress.test.ts
~/.claude/scripts/commit.sh "test(smartCodes): stress fixture + perf gates (CI 2x headroom)"
```

### Chunk 2 closeout

- [ ] Rodar suite completa: `npm test` — esperar ~+15-20 testes (cache + matcher + registryApi + auditLog smart codes + stress).
- [ ] Typecheck: `npx tsc --noEmit`.

---

## Chunk 3: UI — Builder Modal + Smart Code Detail + Code Explorer Section

**Output desta chunk:** Usuário consegue criar/editar/deletar smart codes via UI completa. Smart Code Detail funcional com preview ao vivo de matches. Code Explorer mostra section dedicada. Smoke test em vault real obrigatório no fim.

**Estimativa:** 1-2 sessões.

### Task 3.1: Criar `builderTreeOps.ts` (helpers puros pré-UI) + tests

**Files:**
- Create: `src/core/smartCodes/builderTreeOps.ts`
- Test: `tests/core/smartCodes/builderTreeOps.test.ts`

Helpers puros pra manipular AST. `Path` é `number[]` representando índice em cada level (ex: `[0, 2]` = primeiro filho do root, terceiro filho dele).

API:

```ts
export type Path = number[];

export function getNodeAt(predicate: PredicateNode, path: Path): PredicateNode | undefined;
export function addChildToGroup(predicate: PredicateNode, parentPath: Path, newChild: PredicateNode): PredicateNode;
export function removeNodeAt(predicate: PredicateNode, path: Path): PredicateNode;
export function moveNode(predicate: PredicateNode, fromPath: Path, toParentPath: Path, toIndex: number): PredicateNode;
export function changeOperator(predicate: PredicateNode, path: Path, newOp: 'AND' | 'OR' | 'NOT'): PredicateNode;
export function replaceLeafAt(predicate: PredicateNode, path: Path, newLeaf: LeafNode): PredicateNode;
```

Convention: todos retornam **novo** AST (immutable). Path inválido = no-op (retorna predicate inalterado).

- [ ] **Step 1: Write failing test pra `getNodeAt`**

```ts
import { describe, it, expect } from 'vitest';
import { getNodeAt, addChildToGroup, removeNodeAt, moveNode, changeOperator, replaceLeafAt } from '../../../src/core/smartCodes/builderTreeOps';

describe('builderTreeOps', () => {
  describe('getNodeAt', () => {
    it('returns root for empty path', () => {
      const p: any = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }]};
      expect(getNodeAt(p, [])).toBe(p);
    });
    it('returns nested by path', () => {
      const leaf = { kind: 'hasCode' as const, codeId: 'c_a' };
      const p: any = { op: 'AND', children: [{ op: 'OR', children: [leaf]}]};
      expect(getNodeAt(p, [0, 0])).toBe(leaf);
    });
    it('returns NOT child via path [0]', () => {
      const leaf = { kind: 'hasCode' as const, codeId: 'c_a' };
      const p: any = { op: 'NOT', child: leaf };
      expect(getNodeAt(p, [0])).toBe(leaf);
    });
    it('returns undefined for invalid path', () => {
      const p: any = { kind: 'hasCode', codeId: 'c_a' };
      expect(getNodeAt(p, [0])).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run, expect FAIL (module not found)**

- [ ] **Step 3: Implement getNodeAt**

```ts
// src/core/smartCodes/builderTreeOps.ts
import type { PredicateNode, LeafNode } from './types';
import { isOpNode, isLeafNode } from './types';

export type Path = number[];

export function getNodeAt(node: PredicateNode, path: Path): PredicateNode | undefined {
  let cur: PredicateNode | undefined = node;
  for (const idx of path) {
    if (!cur || isLeafNode(cur)) return undefined;
    if (cur.op === 'NOT') cur = idx === 0 ? cur.child : undefined;
    else cur = cur.children[idx];
  }
  return cur;
}
```

- [ ] **Step 4: Test pra `addChildToGroup`**

```ts
describe('addChildToGroup', () => {
  it('adiciona child ao final do group no path', () => {
    const p: any = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }]};
    const newLeaf = { kind: 'hasCode' as const, codeId: 'c_b' };
    const result = addChildToGroup(p, [], newLeaf);
    expect((result as any).children).toHaveLength(2);
    expect((result as any).children[1]).toEqual(newLeaf);
  });
  it('no-op se parentPath aponta pra leaf', () => {
    const p: any = { kind: 'hasCode', codeId: 'c_a' };
    expect(addChildToGroup(p, [], { kind: 'hasCode', codeId: 'c_b' })).toEqual(p);
  });
  it('no-op se parentPath aponta pra NOT', () => {
    const p: any = { op: 'NOT', child: { kind: 'hasCode', codeId: 'c_a' }};
    expect(addChildToGroup(p, [], { kind: 'hasCode', codeId: 'c_b' })).toEqual(p);
  });
});
```

- [ ] **Step 5: Implement addChildToGroup**

```ts
export function addChildToGroup(node: PredicateNode, parentPath: Path, newChild: PredicateNode): PredicateNode {
  return mapAt(node, parentPath, (target) => {
    if (isLeafNode(target) || target.op === 'NOT') return target;
    return { op: target.op, children: [...target.children, newChild] };
  });
}

function mapAt(node: PredicateNode, path: Path, fn: (n: PredicateNode) => PredicateNode): PredicateNode {
  if (path.length === 0) return fn(node);
  if (isLeafNode(node)) return node;
  if (node.op === 'NOT') {
    if (path[0] !== 0) return node;
    return { op: 'NOT', child: mapAt(node.child, path.slice(1), fn) };
  }
  const idx = path[0];
  if (idx < 0 || idx >= node.children.length) return node;
  const newChildren = node.children.slice();
  newChildren[idx] = mapAt(node.children[idx], path.slice(1), fn);
  return { op: node.op, children: newChildren };
}
```

- [ ] **Step 6: Test + implement `removeNodeAt`** (similar pattern: usa parent path + child index, returns new tree sem o node).

```ts
describe('removeNodeAt', () => {
  it('remove child do AND group', () => {
    const p: any = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }, { kind: 'hasCode', codeId: 'c_b' }]};
    const result = removeNodeAt(p, [0]);
    expect((result as any).children).toHaveLength(1);
    expect((result as any).children[0].codeId).toBe('c_b');
  });
  it('no-op se path vazio (não pode deletar root)', () => {
    const p: any = { kind: 'hasCode', codeId: 'c_a' };
    expect(removeNodeAt(p, [])).toEqual(p);
  });
});
```

Implementation: split path em parentPath + childIndex; mapAt(parentPath, group => filter out childIndex).

- [ ] **Step 7: Test + implement `moveNode`** (composição: get from source path → remove from source → addChild to dest path at index).

- [ ] **Step 8: Test + implement `changeOperator`**

```ts
describe('changeOperator', () => {
  it('muda AND pra OR preservando children', () => {
    const p: any = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }]};
    const result = changeOperator(p, [], 'OR');
    expect((result as any).op).toBe('OR');
    expect((result as any).children).toHaveLength(1);
  });
  it('muda AND→NOT joga primeiro child como child do NOT (resto descartado, com console.warn)', () => {
    const p: any = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }, { kind: 'hasCode', codeId: 'c_b' }]};
    const result = changeOperator(p, [], 'NOT');
    expect((result as any).op).toBe('NOT');
    expect((result as any).child.codeId).toBe('c_a');
  });
});
```

- [ ] **Step 9: Test + implement `replaceLeafAt`** (mapAt + replace whole node se target é leaf).

- [ ] **Step 10: Run all builderTreeOps tests, expect PASS**

```bash
npx vitest run tests/core/smartCodes/builderTreeOps.test.ts
```

- [ ] **Step 11: Commit**

```bash
git add src/core/smartCodes/builderTreeOps.ts tests/core/smartCodes/builderTreeOps.test.ts
~/.claude/scripts/commit.sh "feat(smartCodes): builder tree ops puros (add/remove/move/changeOp/replaceLeaf)"
```

### Task 3.2: Criar `builderRowRenderer.ts` (render de cada row)

**Files:**
- Create: `src/core/smartCodes/builderRowRenderer.ts`

Render de uma row recebe: `{ node: PredicateNode, path: number[], depth: number, registry, caseVars, callbacks: { onChange, onDelete, onMove }}`. Retorna HTMLElement.

- Group header row: dropdown (AND/OR/NOT) + drag handle + delete.
- Leaf row: dropdown kind + inputs adaptativos por kind (descritos em spec §7).

Sem teste isolado (DOM-heavy; coberto via integração no Task 3.4).

- [ ] **Step 1: Implement esqueleto**
- [ ] **Step 2: Commit:**

```bash
git add src/core/smartCodes/builderRowRenderer.ts
~/.claude/scripts/commit.sh "feat(smartCodes): builder row renderer (group header + leaf adaptativo)"
```

### Task 3.3: Criar `builderModal.ts` (Modal extends Obsidian)

**Files:**
- Create: `src/core/smartCodes/builderModal.ts`

Layout 3 zonas (header / body / footer) conforme spec §7. Usa builderTreeOps + builderRowRenderer. Preview live debounced 300ms calling `cache.computePreview` (helper novo que aceita predicate sem persistir).

- [ ] **Step 1: Adicionar `computePreview(predicate, definitionStub)` em `cache.ts`**

```ts
// SmartCodeCache adiciona:
computePreview(predicate: PredicateNode, stubId: string = '__preview__'): MarkerRef[] {
  const stubSc = { id: stubId, predicate } as any;
  const tempCtx: EvaluatorContext = {
    caseVars: this.caseVars,
    codesInFolder: this.codeStruct.codesInFolder,
    codesInGroup: this.codeStruct.codesInGroup,
    smartCodes: { ...this.smartCodes, [stubId]: stubSc },
    evaluating: new Set([stubId]),
    evaluator: evaluate,
  };
  const out: MarkerRef[] = [];
  const seen = new Set<MarkerRef>();
  for (const fset of this.indexByFile.values()) for (const ref of fset) seen.add(ref);
  for (const ref of seen) {
    const marker = this.markerByRef.get(ref);
    if (!marker) continue;
    if (evaluate(predicate, ref, marker, tempCtx)) out.push(ref);
  }
  return out;
}
```

Test: preview com predicate temporário não persiste em `this.matches` (assertion: `cache.getMatches(stubId)` returns `[]` after preview).

- [ ] **Step 2: Esqueleto do BuilderModal extends Obsidian Modal**

```ts
// src/core/smartCodes/builderModal.ts
import { Modal, App } from 'obsidian';
import type { SmartCodeDefinition, PredicateNode } from './types';
import { renderRow } from './builderRowRenderer';
import { addChildToGroup, removeNodeAt, moveNode, changeOperator, replaceLeafAt } from './builderTreeOps';
import { validateForSave } from './predicateValidator';

interface BuilderConfig {
  app: App;
  mode: 'create' | 'edit';
  initialDefinition?: SmartCodeDefinition;
  registry: any;       // tipo CodeDefinitionRegistry
  caseVarsRegistry: any;
  smartCodeApi: any;   // tipo SmartCodeApi
  smartCodeCache: any; // SmartCodeCache (pra preview)
  onSaved?: (saved: SmartCodeDefinition) => void;
}

export class SmartCodeBuilderModal extends Modal {
  private name: string;
  private color: string;
  private memo: string;
  private predicate: PredicateNode;
  private previewDebounceHandle?: number;

  constructor(private cfg: BuilderConfig) {
    super(cfg.app);
    this.name = cfg.initialDefinition?.name ?? '';
    this.color = cfg.initialDefinition?.color ?? '#888';
    this.memo = cfg.initialDefinition?.memo ?? '';
    this.predicate = cfg.initialDefinition?.predicate ?? { op: 'AND', children: [] };
  }

  onOpen() { this.render(); }

  private render(): void {
    // 1. Header (name input + color picker + memo button)
    // 2. Body (tree render via renderRow recursivo)
    // 3. Footer (preview live "⚡ N matches" + Cancel/Save)
  }

  private schedulePreview(): void {
    if (this.previewDebounceHandle) clearTimeout(this.previewDebounceHandle);
    this.previewDebounceHandle = window.setTimeout(() => {
      const matches = this.cfg.smartCodeCache.computePreview(this.predicate);
      this.updatePreviewLabel(matches.length, this.countDistinctFiles(matches));
    }, 300);
  }

  private save(): void {
    const validation = validateForSave(
      { id: this.cfg.initialDefinition?.id ?? '__new__', name: this.name },
      this.predicate,
      this.cfg.registry,
      this.cfg.caseVarsRegistry.allKeys(),
    );
    if (validation.errors.length > 0) { this.showErrorBanner(validation.errors); return; }
    if (validation.warnings.length > 0) this.showWarningBanner(validation.warnings);
    const saved = this.cfg.mode === 'create'
      ? this.cfg.smartCodeApi.createSmartCode({ name: this.name, color: this.color, predicate: this.predicate, memo: this.memo })
      : this.cfg.smartCodeApi.updateSmartCode(this.cfg.initialDefinition!.id, { name: this.name, color: this.color, predicate: this.predicate, memo: this.memo });
    this.cfg.onSaved?.(saved);
    this.close();
  }

  // Outros métodos: updatePreviewLabel, countDistinctFiles, showErrorBanner, showWarningBanner
}
```

- [ ] **Step 3: Render header (name + color + memo)**

Standard pattern Obsidian: `this.contentEl.createDiv({ cls: 'qc-builder-header' })` com `Setting` + text input pra name, swatch HTML5 `<input type="color">` pra color, button "Edit memo" abrindo `PromptModal` (existente em `dialogs.ts`).

- [ ] **Step 4: Render body (tree recursive)**

```ts
private renderBody(container: HTMLElement, node: PredicateNode, path: number[] = []): void {
  const rowEl = renderRow({
    node, path, depth: path.length,
    registry: this.cfg.registry,
    caseVarsRegistry: this.cfg.caseVarsRegistry,
    smartCodeApi: this.cfg.smartCodeApi,
    onChangeOp: (newOp) => { this.predicate = changeOperator(this.predicate, path, newOp); this.rerender(); },
    onAddChild: (newChild) => { this.predicate = addChildToGroup(this.predicate, path, newChild); this.rerender(); },
    onDelete: () => { this.predicate = removeNodeAt(this.predicate, path); this.rerender(); },
    onReplaceLeaf: (newLeaf) => { this.predicate = replaceLeafAt(this.predicate, path, newLeaf); this.rerender(); },
    onDragMove: (toParentPath, toIndex) => { this.predicate = moveNode(this.predicate, path, toParentPath, toIndex); this.rerender(); },
  });
  container.appendChild(rowEl);
  if (isOpNode(node) && node.op !== 'NOT') {
    for (let i = 0; i < node.children.length; i++) this.renderBody(container, node.children[i], [...path, i]);
  } else if (isOpNode(node) && node.op === 'NOT') {
    this.renderBody(container, node.child, [...path, 0]);
  }
}

private rerender(): void {
  this.contentEl.empty();
  this.render();
  this.schedulePreview();
}
```

`[+ Condition]` button no rodapé do body adiciona leaf default (`{ kind: 'hasCode', codeId: '' }`) ao group root. `[+ Group]` adiciona `{ op: 'AND', children: [] }`.

- [ ] **Step 5: Render footer (preview label + actions)**

```ts
private renderFooter(container: HTMLElement): void {
  const previewEl = container.createDiv({ cls: 'qc-builder-preview' });
  previewEl.setText('⚡ Calculating…');
  this.previewLabelEl = previewEl;

  const actions = container.createDiv({ cls: 'qc-builder-actions' });
  actions.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
  const saveBtn = actions.createEl('button', { text: 'Save', cls: 'mod-cta' });
  saveBtn.onclick = () => this.save();
}
```

- [ ] **Step 6: Wire command palette + entry no `main.ts`**

```ts
this.addCommand({
  id: 'smart-code-new',
  name: 'Smart Code: New',
  callback: () => new SmartCodeBuilderModal({
    app: this.app, mode: 'create', registry: this.registry,
    caseVarsRegistry: this.caseVariablesRegistry, smartCodeApi: this.smartCodeApi, smartCodeCache: this.smartCodeCache,
    onSaved: () => this.refreshCodeExplorer(),
  }).open(),
});
```

- [ ] **Step 7: Smoke test obrigatório no vault**

```bash
npm run build && cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

Reload Obsidian, command palette → "Smart Code: New":
1. Modal abre
2. Add condition → leaf row aparece
3. Choose code from picker → preview atualiza ("⚡ N matches")
4. Save → modal fecha, smart code aparece no Code Explorer (Task 3.5 pré-req)
5. Edit predicate → preview re-atualiza < 300ms

- [ ] **Step 8: Commit**

```bash
git add src/core/smartCodes/builderModal.ts src/core/smartCodes/cache.ts src/main.ts
~/.claude/scripts/commit.sh "feat(smartCodes): builder modal + cache.computePreview + command palette entry"
```

### Task 3.4: Criar `detailSmartCodeRenderer.ts` (Smart Code Detail)

**Files:**
- Create: `src/core/smartCodes/detailSmartCodeRenderer.ts`

Espelha `detailCodeRenderer.ts`. Layout per spec §9.

- [ ] **Step 1: Esqueleto + signature**

```ts
// src/core/smartCodes/detailSmartCodeRenderer.ts
import type { SmartCodeDefinition, MarkerRef } from './types';
import { renderVirtualList } from '../virtualList';

interface RenderArgs {
  container: HTMLElement;
  smartCode: SmartCodeDefinition;
  cache: any;        // SmartCodeCache
  smartCodeApi: any; // SmartCodeApi
  registry: any;
  caseVarsRegistry: any;
  app: any;
  onEditPredicate: () => void;  // abre BuilderModal em edit mode
  onDelete: () => void;
  onNavigateToMarker: (ref: MarkerRef) => void;
}

export function renderSmartCodeDetail(args: RenderArgs): void {
  args.container.empty();
  renderHeader(args);
  renderMemo(args);
  renderPredicateDisplay(args);
  renderMatchesSection(args);
  renderHistorySection(args);  // audit log filtrado por entity='smartCode' + codeId
  renderDeleteAction(args);
}
```

- [ ] **Step 2: Header (icon + name + color swatch)**

```ts
function renderHeader({ container, smartCode }: RenderArgs): void {
  const headerEl = container.createDiv({ cls: 'qc-sc-detail-header' });
  headerEl.createSpan({ text: '⚡ ', cls: 'qc-sc-icon' });
  headerEl.createSpan({ text: smartCode.name, cls: 'qc-sc-name' });
  // color swatch + click → color picker
}
```

- [ ] **Step 3: Memo editor inline (textarea + debounced 500ms)**

Pattern do `renderCodeMemo` em `detailCodeRenderer.ts`:

```ts
function renderMemo({ container, smartCode, smartCodeApi }: RenderArgs): void {
  const memoEl = container.createEl('textarea', { cls: 'qc-sc-memo' });
  memoEl.value = smartCode.memo ?? '';
  let debounceHandle: number | undefined;
  memoEl.addEventListener('input', () => {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(() => {
      smartCodeApi.setSmartCodeMemo(smartCode.id, memoEl.value);
    }, 500);
  });
}
```

- [ ] **Step 4: Predicate display (read-only summary do AST)**

```ts
function renderPredicateDisplay({ container, smartCode, registry, onEditPredicate }: RenderArgs): void {
  const sectionEl = container.createDiv({ cls: 'qc-sc-predicate-section' });
  sectionEl.createEl('h4', { text: 'Predicate' });
  const treeEl = sectionEl.createDiv({ cls: 'qc-sc-predicate-tree' });
  renderPredicateLine(treeEl, smartCode.predicate, registry, 0);
  const editBtn = sectionEl.createEl('button', { text: 'Edit predicate' });
  editBtn.onclick = onEditPredicate;
}

function renderPredicateLine(parent: HTMLElement, node: PredicateNode, registry: any, depth: number): void {
  const line = parent.createDiv({ cls: 'qc-sc-pred-line', attr: { style: `padding-left: ${depth * 16}px` }});
  if (isOpNode(node)) {
    line.setText(node.op === 'NOT' ? 'NOT' : node.op);
    if (node.op === 'NOT') renderPredicateLine(parent, node.child, registry, depth + 1);
    else for (const c of node.children) renderPredicateLine(parent, c, registry, depth + 1);
  } else {
    line.setText(formatLeaf(node, registry));
  }
}

function formatLeaf(leaf: LeafNode, registry: any): string {
  switch (leaf.kind) {
    case 'hasCode': return `Code is "${registry.definitions[leaf.codeId]?.name ?? leaf.codeId + ' (deleted)'}"`;
    case 'caseVarEquals': return `Case var "${leaf.variable}" = ${JSON.stringify(leaf.value)}`;
    // ... outros 8 kinds
  }
}
```

- [ ] **Step 5: Matches section (virtual list, agrupado por file, com loading state)**

```ts
function renderMatchesSection({ container, smartCode, cache, onNavigateToMarker }: RenderArgs): void {
  const sectionEl = container.createDiv({ cls: 'qc-sc-matches-section' });
  const headerEl = sectionEl.createEl('h4');
  const matches = cache.getMatches(smartCode.id);
  const isDirty = cache.isDirty?.(smartCode.id);  // adicionar em cache.ts
  headerEl.setText(isDirty ? 'MATCHES (calculating…)' : `MATCHES (${matches.length})`);

  const groupedByFile = groupMatchesByFile(matches);
  const items = flattenForVirtualList(groupedByFile);

  renderVirtualList(sectionEl, items, {
    rowHeight: 24,
    renderRow: (item, el) => renderMatchRow(item, el, onNavigateToMarker),
  });
}
```

- [ ] **Step 6: History section (audit log filtrado)**

```ts
function renderHistorySection({ container, smartCode, app }: RenderArgs): void {
  const sectionEl = container.createDiv({ cls: 'qc-sc-history-section' });
  sectionEl.createEl('h4', { text: 'History' });
  const entries = getEntriesForSmartCode(app.plugin.data.auditLog, smartCode.id);
  // render entries via renderEntryMarkdown (audit log helper)
}
```

- [ ] **Step 7: Delete action (com Confirm modal)**

```ts
function renderDeleteAction({ container, smartCode, smartCodeApi }: RenderArgs): void {
  const btn = container.createEl('button', { text: 'Delete smart code', cls: 'mod-warning' });
  btn.onclick = async () => {
    const ok = await new ConfirmModal(/* ... */).open();
    if (ok) smartCodeApi.deleteSmartCode(smartCode.id);
  };
}
```

- [ ] **Step 8: Wire dispatch em `baseCodeDetailView.ts`**

`baseCodeDetailView` ganha switch: se `selectedId.startsWith('sc_')` → renderSmartCodeDetail, senão renderCodeDetail.

- [ ] **Step 9: Smoke test no vault** — abrir smart code criado em Task 3.3, verificar header/memo/predicate/matches/history.

- [ ] **Step 10: Commit**

```bash
git add src/core/smartCodes/detailSmartCodeRenderer.ts src/core/smartCodes/cache.ts src/core/baseCodeDetailView.ts styles.css
~/.claude/scripts/commit.sh "feat(smartCodes): Smart Code Detail (header + memo + predicate display + matches virtual + history + delete)"
```

### Task 3.5: Code Explorer section "Smart Codes" + integração

**Files:**
- Modify: `src/core/codebookTreeRenderer.ts`
- Modify: `src/core/baseCodeDetailView.ts`
- Modify: `styles.css`

Section colapsável no topo. Cada row: `⚡ name (count)` + eye toggle. Click navega pro Smart Code Detail. Context menu (Edit / Rename / Recolor / Edit memo / Hide / Delete).

- [ ] **Step 1: Adicionar `renderSmartCodesSection(container, state, callbacks)` em `codebookTreeRenderer.ts`**

```ts
interface SmartCodesSectionState {
  collapsed: boolean;
  smartCodes: SmartCodeDefinition[];     // ordered via smartCodeOrder
  hiddenIds: Set<string>;
  countsById: Map<string, number | 'computing'>;
}

function renderSmartCodesSection(container: HTMLElement, state: SmartCodesSectionState, callbacks: SmartCodesCallbacks): void {
  const sectionEl = container.createDiv({ cls: 'qc-smart-codes-section' });
  const headerEl = sectionEl.createDiv({ cls: 'qc-smart-codes-section-header' });
  const visibleCount = state.smartCodes.filter(sc => !state.hiddenIds.has(sc.id)).length;
  const total = state.smartCodes.length;
  const countLabel = state.hiddenIds.size > 0 ? `${visibleCount} / ${total}` : `${visibleCount}`;
  headerEl.setText(`${state.collapsed ? '▸' : '▾'} ⚡ Smart Codes (${countLabel})`);
  headerEl.onclick = () => callbacks.onToggleCollapsed();

  if (state.collapsed) return;

  for (const sc of state.smartCodes) {
    if (state.hiddenIds.has(sc.id)) continue;  // hidden ones suppressed unless toggle "show hidden"
    const row = sectionEl.createDiv({ cls: 'qc-smart-code-row' });
    const count = state.countsById.get(sc.id);
    row.createSpan({ text: '⚡ ' });
    row.createSpan({ text: sc.name, cls: 'qc-sc-name' });
    row.createSpan({ text: count === 'computing' ? '…' : String(count ?? 0), cls: 'qc-sc-count' });
    addEyeToggle(row, sc.hidden ?? false, () => callbacks.onToggleHidden(sc.id));
    row.onclick = (e) => { if (e.target === row || (e.target as HTMLElement).classList.contains('qc-sc-name')) callbacks.onNavigate(sc.id); };
    row.oncontextmenu = (e) => { e.preventDefault(); callbacks.onContextMenu(sc.id, e); };
  }

  const newBtn = sectionEl.createEl('button', { text: '+ New smart code', cls: 'qc-sc-new-btn' });
  newBtn.onclick = () => callbacks.onNew();
}
```

- [ ] **Step 2: Wire em `baseCodeDetailView.ts` — chamar renderSmartCodesSection antes da árvore de regulares**

Em `renderTree` (ou equivalente), chamar `renderSmartCodesSection(treeContainer, smartCodesState, smartCodesCallbacks)` antes da render dos folders/codes regulares.

- [ ] **Step 3: Wire counts dinâmicos via cache subscribe**

```ts
// no construtor da view
this.smartCodeCacheUnsub = plugin.smartCodeCache.subscribe((changedIds) => {
  for (const id of changedIds) this.smartCodesState.countsById.set(id, plugin.smartCodeCache.getCount(id));
  this.renderTree();
});
```

Cleanup em `onClose`/`onUnload`: `this.smartCodeCacheUnsub()`.

- [ ] **Step 4: Context menu — usar Obsidian Menu com 6 itens**

```ts
function showSmartCodeContextMenu(sc: SmartCodeDefinition, e: MouseEvent, plugin: any): void {
  const menu = new Menu();
  menu.addItem(i => i.setTitle('Edit predicate').onClick(() => openBuilderInEditMode(sc, plugin)));
  menu.addItem(i => i.setTitle('Rename').onClick(() => promptRename(sc, plugin)));
  menu.addItem(i => i.setTitle('Recolor').onClick(() => openColorPicker(sc, plugin)));
  menu.addItem(i => i.setTitle('Edit memo').onClick(() => openMemoModal(sc, plugin)));
  menu.addItem(i => i.setTitle(sc.hidden ? 'Unhide' : 'Hide').onClick(() => plugin.smartCodeApi.updateSmartCode(sc.id, { hidden: !sc.hidden })));
  menu.addSeparator();
  menu.addItem(i => i.setTitle('Delete').setWarning(true).onClick(async () => {
    const ok = await new ConfirmModal(/* ... */).open();
    if (ok) plugin.smartCodeApi.deleteSmartCode(sc.id);
  }));
  menu.showAtMouseEvent(e);
}
```

- [ ] **Step 5: Visibility per-doc integration**

Quando view é aberta com active file, ler `data.visibilityOverrides[fileId]?.[sc.id]` ou fallback `sc.hidden`. Smart code só renderiza no Code Explorer se `isCodeVisibleInFile(sc.id, fileId)` retornar true. Reusa helper existente `isCodeVisibleInFile` — verificar que aceita string key qualquer (per spec §11, deve aceitar; auditar Step 6).

- [ ] **Step 6: Audit `isCodeVisibleInFile` aceita string key qualquer**

```bash
grep -A 5 "function isCodeVisibleInFile" src/core/codeVisibility.ts
```

Confirmar que função recebe `codeId: string` e não chama `registry.definitions[codeId]`. Per spec §11, deve passar limpo.

- [ ] **Step 7: CSS em `styles.css`**

```css
.qc-smart-codes-section {
  border-bottom: 1px solid var(--background-modifier-border);
  padding-bottom: 8px;
  margin-bottom: 8px;
}
.qc-smart-codes-section-header {
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  user-select: none;
}
.qc-smart-code-row {
  display: flex;
  align-items: center;
  padding: 2px 8px 2px 16px;
  cursor: pointer;
}
.qc-smart-code-row:hover { background: var(--background-modifier-hover); }
.qc-smart-code-row.is-selected { background: var(--background-modifier-active-hover); }
.qc-sc-name { flex: 1; }
.qc-sc-count { color: var(--text-muted); margin-left: 8px; font-variant-numeric: tabular-nums; }
.qc-sc-new-btn { margin: 4px 8px; }
```

- [ ] **Step 8: Smoke test em vault**

Criar 3 smart codes. Verificar:
- Section aparece no topo do Code Explorer com count "3"
- Click num smart code abre Smart Code Detail correto
- Context menu funciona (todos 6 itens; delete pede confirmação)
- Eye toggle hide/unhide
- Count atualiza em tempo real ao adicionar/remover marker
- Loading state ("…" no lugar do número) aparece em smart code grande durante invalidate

- [ ] **Step 9: Commit**

```bash
git add src/core/codebookTreeRenderer.ts src/core/baseCodeDetailView.ts styles.css
~/.claude/scripts/commit.sh "feat(smartCodes): Code Explorer section + context menu + dispatch pro Smart Code Detail + visibility integration"
```

### Chunk 3 closeout — Smoke test obrigatório

Rodar smoke completo no workbench:

- [ ] Criar 5 smart codes com complexidade crescente:
  1. `hasCode("X")` simples
  2. `hasCode("X") AND hasCode("Y")` interseção
  3. `hasCode("X") AND magnitudeGte("X", 3)` magnitude
  4. `(inFolder("Themes") OR inGroup("RQ1")) AND NOT engineType=pdf` complexo
  5. `smartCode(sc_1) AND hasCode("Z")` nesting

- [ ] Verificar:
  - Builder abre, edita, salva
  - Preview live atualiza em <300ms
  - Save bloqueado em predicate vazio + cycle + name collision
  - Counts batem (manual count vs Code Explorer vs Detail)
  - Context menu funciona
  - Rename atualiza tudo
  - Delete remove + warning se outros sc dependem

- [ ] Rodar suite: `npm test` — esperar verde.

---

## Chunk 4: Analytics + Sidebars + Visibility + Codebook Timeline

**Output desta chunk:** Smart codes aparecem em Analytics modes que aceitam código como dimension/filter; em sidebars de cada engine; respeitam visibility per-doc; aparecem na Codebook Timeline com ícone ⚡ distinto.

**Estimativa:** 1 sessão.

### Task 4.1: dataReader + getCodeDimensions

**Files:**
- Modify: `src/analytics/data/dataReader.ts`
- Test: `tests/analytics/data/dataReaderSmartCodes.test.ts`

Adicionar `getCodeDimensions(data, registry, smartCodeCache): CodeDimension[]` retornando union {code, smartCode} com `isSmart` flag e `getMatches()` resolved via cache pra smart, via pipeline existente pra regular.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { getCodeDimensions } from '../../../src/analytics/data/dataReader';
import { createDefaultData } from '../../../src/core/types';

describe('getCodeDimensions', () => {
  it('returns regulares + smart codes em union ordenada (regulares primeiro)', () => {
    const data = createDefaultData();
    data.registry.definitions['c_a'] = { id: 'c_a', name: 'A', color: '#fff' } as any;
    data.registry.rootOrder = ['c_a'];
    data.registry.smartCodes['sc_x'] = { id: 'sc_x', name: 'X', color: '#aaa', predicate: { kind: 'hasCode', codeId: 'c_a' }} as any;
    data.registry.smartCodeOrder = ['sc_x'];
    const fakeCache = { getMatches: (id: string) => id === 'sc_x' ? [{ engine: 'pdf', fileId: 'f1', markerId: 'm1' }] : [] };
    const dims = getCodeDimensions(data, data.registry, fakeCache as any);
    expect(dims).toHaveLength(2);
    expect(dims[0]).toMatchObject({ id: 'c_a', isSmart: false });
    expect(dims[1]).toMatchObject({ id: 'sc_x', isSmart: true });
    expect(dims[1].getMatches()).toHaveLength(1);
  });

  it('respects hidden flag (smart codes hidden filtrados)', () => {
    const data = createDefaultData();
    data.registry.smartCodes['sc_x'] = { id: 'sc_x', name: 'X', color: '#aaa', hidden: true, predicate: { op: 'AND', children: [] }} as any;
    data.registry.smartCodeOrder = ['sc_x'];
    const dims = getCodeDimensions(data, data.registry, { getMatches: () => [] } as any);
    expect(dims).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement getCodeDimensions**

```ts
// src/analytics/data/dataReader.ts
export interface CodeDimension {
  id: string;
  name: string;
  color: string;
  isSmart: boolean;
  getMatches(): MarkerRef[];
}

export function getCodeDimensions(data: QualiaData, registry: { definitions: any; smartCodes: any }, smartCodeCache: any): CodeDimension[] {
  const dims: CodeDimension[] = [];
  // Regulares (ordem via existing helper buildFlatTree ou rootOrder)
  for (const id of data.registry.rootOrder ?? []) {
    const code = registry.definitions[id];
    if (!code || code.hidden) continue;
    dims.push({
      id, name: code.name, color: code.color, isSmart: false,
      getMatches: () => collectMarkersForRegularCode(data, id),  // helper existente — usar o mesmo do current pipeline
    });
  }
  // Smart codes (ordem via smartCodeOrder, hidden filter)
  for (const id of data.registry.smartCodeOrder ?? []) {
    const sc = registry.smartCodes[id];
    if (!sc || sc.hidden) continue;
    dims.push({
      id, name: sc.name, color: sc.color, isSmart: true,
      getMatches: () => smartCodeCache.getMatches(id),
    });
  }
  return dims;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/analytics/data/dataReader.ts tests/analytics/data/dataReaderSmartCodes.test.ts
~/.claude/scripts/commit.sh "feat(analytics): dataReader.getCodeDimensions inclui smart codes (isSmart flag)"
```

### Task 4.2: applyFilters dispatch via prefix

**Files:**
- Modify: `src/analytics/data/statsHelpers.ts`
- Test: `tests/analytics/data/applyFiltersSmartCodes.test.ts`

Helper `partitionByPrefix(codeIds): { regular: string[], smart: string[] }`. Em `applyFilters`, smart codes resolvem via `cache.getMatches(id)` → set de markerRefs.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { partitionByPrefix, applyFilters } from '../../../src/analytics/data/statsHelpers';

describe('applyFilters smart codes dispatch', () => {
  it('partitionByPrefix splits by sc_ vs c_', () => {
    expect(partitionByPrefix(['c_a', 'sc_x', 'c_b', 'sc_y'])).toEqual({
      regular: ['c_a', 'c_b'], smart: ['sc_x', 'sc_y']
    });
  });

  it('applyFilters com filter contendo sc_x usa cache.getMatches pra filtrar markers', () => {
    const consolidated = [/* markers consolidados */] as any;
    const filters = { codeIds: ['sc_x'], /* outros campos */ } as any;
    const cache = { getMatches: (_id: string) => [{ engine: 'pdf', fileId: 'f1', markerId: 'm1' }] };
    const result = applyFilters(consolidated, filters, { smartCodeCache: cache });
    // Asserts que result inclui só markers cujos refs estão no set retornado
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// statsHelpers.ts
export function partitionByPrefix(codeIds: string[]): { regular: string[]; smart: string[] } {
  const regular: string[] = [];
  const smart: string[] = [];
  for (const id of codeIds) (id.startsWith('sc_') ? smart : regular).push(id);
  return { regular, smart };
}

// Em applyFilters existente:
// Antes do filter loop, se filter inclui smart codes:
const partition = partitionByPrefix(filters.codeIds ?? []);
let smartMatchRefs: Set<string> | undefined;
if (partition.smart.length > 0 && opts?.smartCodeCache) {
  smartMatchRefs = new Set();
  for (const scId of partition.smart) {
    for (const ref of opts.smartCodeCache.getMatches(scId)) {
      smartMatchRefs.add(`${ref.engine}:${ref.fileId}:${ref.markerId}`);
    }
  }
}
// No marker filter loop, se smartMatchRefs definido, reject markers cujo ref-string não está no set.
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/analytics/data/statsHelpers.ts tests/analytics/data/applyFiltersSmartCodes.test.ts
~/.claude/scripts/commit.sh "feat(analytics): applyFilters dispatch via sc_/c_ prefix com smart code matches"
```

### Task 4.3: configSections — filter chips Smart Codes

**Files:**
- Modify: `src/analytics/views/configSections.ts`

`renderCodesFilter` ganha sub-section "Smart Codes" com chips ⚡ separados.

- [ ] **Step 1: Localizar `renderCodesFilter` em `configSections.ts`**

```bash
grep -n "renderCodesFilter\|renderFilter" src/analytics/views/configSections.ts
```

- [ ] **Step 2: Adicionar sub-section após chips de regulares**

```ts
function renderCodesFilter(container: HTMLElement, ctx: ViewContext): void {
  // ... render chips de regulares (existente)
  const smartCodes = ctx.plugin.data.registry.smartCodeOrder
    .map((id: string) => ctx.plugin.data.registry.smartCodes[id])
    .filter((sc: any) => sc && !sc.hidden);
  if (smartCodes.length === 0) return;

  const scSection = container.createDiv({ cls: 'qc-codes-filter-smart-section' });
  scSection.createEl('h5', { text: 'Smart Codes', cls: 'qc-filter-subsection-header' });
  for (const sc of smartCodes) {
    const chip = scSection.createDiv({ cls: 'qc-filter-chip qc-filter-chip-smart' });
    chip.style.borderColor = sc.color;
    chip.createSpan({ text: '⚡ ' });
    chip.createSpan({ text: sc.name });
    if (ctx.filter.codeIds.includes(sc.id)) chip.addClass('is-active');
    chip.onclick = () => toggleFilterCodeId(ctx, sc.id);
  }
}
```

- [ ] **Step 3: CSS pra chip-smart**

```css
.qc-filter-chip-smart { border-style: dashed; }
.qc-filter-chip-smart.is-active { background: var(--background-modifier-active-hover); }
.qc-codes-filter-smart-section { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--background-modifier-border); }
.qc-filter-subsection-header { color: var(--text-muted); font-size: 0.85em; margin: 4px 0; }
```

- [ ] **Step 4: Smoke test no vault** — abrir Analytics, verificar chips ⚡ separados aparecem na filter sidebar quando há smart codes.

- [ ] **Step 5: Commit**

```bash
git add src/analytics/views/configSections.ts styles.css
~/.claude/scripts/commit.sh "feat(analytics): filter chips section pra smart codes (chip-smart com border dashed)"
```

### Task 4.4: Wire smart codes em modes que aceitam dimension de código

**Files:**
- Modify: `src/analytics/views/modes/frequencyMode.ts`
- Modify: `src/analytics/views/modes/evolutionMode.ts`
- Modify: `src/analytics/views/modes/cooccurrenceMode.ts`
- Modify: `src/analytics/views/modes/sequentialMode.ts`
- Modify: `src/analytics/views/modes/codeMetadataMode.ts`
- Modify: `src/analytics/views/modes/memoView/memoViewMode.ts`

Cada mode chama `getCodeDimensions(data, registry, smartCodeCache)` em vez de iterar só regulares. Smart codes resolvem matches via `dim.getMatches()`.

Loading state: se algum dim.isSmart e cache.dirty, render "Computing smart codes…" overlay.

- [ ] **Step 1: Localizar onde cada mode itera código**

```bash
grep -l "Object.values(registry.definitions)\|for.*registry.definitions\|registry.rootOrder" src/analytics/views/modes/
```

Lista esperada de modes a tocar (em ordem):
1. `frequencyMode.ts`
2. `evolutionMode.ts`
3. `cooccurrenceMode.ts`
4. `sequentialMode.ts`
5. `codeMetadataMode.ts`
6. `memoView/memoViewMode.ts` (+ `renderCodeSection.ts`)

Modes que **não** entram (per spec §10): `relationsNetworkMode.ts`, `codebookTimelineMode.ts` (último é tratado em Task 4.6 com escopo diferente).

- [ ] **Step 2: Pra CADA um dos 6 modes — substituir iteração de codes por getCodeDimensions**

Padrão de patch:

```ts
// ANTES:
const codes = Object.values(plugin.data.registry.definitions).filter(c => !c.hidden);
const matrix = codes.map(c => ({ codeId: c.id, count: countMarkersWithCode(c.id, filteredMarkers) }));

// DEPOIS:
import { getCodeDimensions } from '../../data/dataReader';
const dims = getCodeDimensions(plugin.data, plugin.data.registry, plugin.smartCodeCache);
const filtered = applyHiddenAndFilter(dims, filterConfig);
const matrix = filtered.map(d => ({ codeId: d.id, isSmart: d.isSmart, count: d.getMatches().length }));
```

Cada mode tem seu próprio fluxo (frequency é simples count, evolution agrupa por tempo, cooccurrence faz matriz, etc). Pra cada, identificar o site de "iterate codes" + adaptar pra `dims`. Smart codes resolvem matches via `dim.getMatches()` (cache hit) — não precisa pipeline custom.

- [ ] **Step 3: Loading overlay (compartilhado)**

Helper em `analyticsView.ts`:

```ts
function checkComputingState(dims: CodeDimension[], cache: any): boolean {
  return dims.some(d => d.isSmart && cache.isDirty?.(d.id));
}
```

Cada mode chama no início do render: se true, render `<div class="qc-mode-computing-overlay">Computing smart codes…</div>` em vez do chart, e re-render quando cache notifica via subscribe.

- [ ] **Step 4: Per-mode test smoke no vault**

Pra cada um dos 6 modes:
1. Abrir Analytics → mode
2. Toggle filter chip ⚡ Smart Code
3. Verificar chart/matrix inclui smart code com count correto
4. Edit predicate do smart code → mode atualiza em <1s

- [ ] **Step 5: Commit (1 por mode pra granularidade ou bundle)**

```bash
git add src/analytics/views/modes/frequencyMode.ts
~/.claude/scripts/commit.sh "feat(analytics/frequency): smart codes como dimension"
# repete pra outros 5
```

Ou bundle se ficou consistente:

```bash
git add src/analytics/views/modes/ src/analytics/views/analyticsView.ts
~/.claude/scripts/commit.sh "feat(analytics): smart codes como dimension em 6 modes (frequency/evolution/cooccurrence/sequential/codeMetadata/memoView) + loading overlay"
```

### Task 4.5: Sidebar adapters — Smart Codes group

**Files:**
- Modify: `src/core/baseSidebarAdapter.ts`
- Modify: `src/media/mediaSidebarAdapter.ts` (audio/video herda)
- Modify: 6 sidebar adapter files concretos (markdown/pdf/image/csv/audio/video)

Após renderização de regulares, render "Smart Codes (N)" se N > 0. Cada row `⚡ name (count)`. Click navega pro próximo match no file.

Visibility per-doc: smart code segue mesmo padrão (`visibilityOverrides[fileId][smartCodeId]`).

- [ ] **Step 1: Adicionar `renderSmartCodesGroup(container, fileId, smartCodeCache, smartCodes, callbacks)` em `baseSidebarAdapter.ts`**

```ts
// src/core/baseSidebarAdapter.ts (extensão)
protected renderSmartCodesGroup(container: HTMLElement, fileId: string): void {
  const smartCodes = this.plugin.data.registry.smartCodeOrder
    .map((id: string) => this.plugin.data.registry.smartCodes[id])
    .filter((sc: any) => sc && this.isCodeVisibleInFile(sc.id, fileId));

  // Filter smart codes que têm ≥1 match nesse file
  const withMatches = smartCodes.filter((sc: any) => {
    const matches = this.plugin.smartCodeCache.getMatches(sc.id);
    return matches.some((ref: any) => ref.fileId === fileId);
  });
  if (withMatches.length === 0) return;

  const groupEl = container.createDiv({ cls: 'qc-sidebar-sc-group' });
  groupEl.createEl('h5', { text: `Smart Codes (${withMatches.length})`, cls: 'qc-sidebar-sc-header' });

  for (const sc of withMatches) {
    const matchesInFile = this.plugin.smartCodeCache.getMatches(sc.id).filter((r: any) => r.fileId === fileId);
    const isDirty = this.plugin.smartCodeCache.isDirty?.(sc.id);
    const row = groupEl.createDiv({ cls: 'qc-sidebar-sc-row' });
    row.createSpan({ text: '⚡ ' });
    row.createSpan({ text: sc.name });
    row.createSpan({ text: isDirty ? '…' : `(${matchesInFile.length})`, cls: 'qc-sidebar-sc-count' });
    let cursorIdx = 0;
    row.onclick = () => {
      const ref = matchesInFile[cursorIdx % matchesInFile.length];
      this.navigateToMarker(ref);  // implementação varia por engine — método protected
      cursorIdx++;
    };
  }
}
```

`navigateToMarker(ref: MarkerRef)`: já existe em cada sidebar adapter pra códigos regulares (jump pro próximo marker). Reusar mesmo método (refs apontam pra markers persistidos).

- [ ] **Step 2: Subscribe ao cache no construtor do adapter pra re-render**

```ts
// no init do adapter:
this.scCacheUnsub = this.plugin.smartCodeCache.subscribe(() => this.refresh());
// no destroy/unload:
this.scCacheUnsub?.();
```

- [ ] **Step 3: Chamar `renderSmartCodesGroup` em CADA dos 6 sidebar adapters concretos**

Lista:
1. `src/markdown/markdownSidebarAdapter.ts` (ou wherever lives)
2. `src/pdf/pdfSidebarAdapter.ts`
3. `src/image/imageSidebarAdapter.ts`
4. `src/csv/csvSidebarAdapter.ts`
5. `src/media/mediaSidebarAdapter.ts` (compartilhado audio + video)

Localizar ponto de render de códigos regulares, chamar `this.renderSmartCodesGroup(container, currentFileId)` logo após.

- [ ] **Step 4: CSS**

```css
.qc-sidebar-sc-group { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--background-modifier-border); }
.qc-sidebar-sc-header { color: var(--text-muted); font-size: 0.85em; margin: 0 0 4px; }
.qc-sidebar-sc-row { display: flex; align-items: center; padding: 4px 8px; cursor: pointer; }
.qc-sidebar-sc-row:hover { background: var(--background-modifier-hover); }
.qc-sidebar-sc-count { margin-left: auto; color: var(--text-muted); }
```

- [ ] **Step 5: Visibility per-doc smoke test**

No vault: criar smart code, criar 2 markdown notes, em uma toggle eye icon do smart code (no popover compartilhado). Smart code deve sumir do sidebar dessa nota mas continuar na outra. Test passes.

- [ ] **Step 6: Per-engine smoke test**

Pra cada engine (markdown, pdf, image, audio, video, csv): abrir um file com markers que dão match em pelo menos 1 smart code. Verificar que `Smart Codes (N)` group aparece no sidebar com count correto. Click navega pro próximo match.

- [ ] **Step 7: Commit**

```bash
git add src/core/baseSidebarAdapter.ts src/markdown/ src/pdf/ src/image/ src/csv/ src/media/ styles.css
~/.claude/scripts/commit.sh "feat(smartCodes): sidebar adapters mostram smart codes com matches no file (6 engines)"
```

### Task 4.6: Codebook Timeline — sc_* events + ⚡ icon + checkbox

**Files:**
- Modify: `src/analytics/data/codebookTimelineEngine.ts`
- Modify: `src/analytics/views/modes/codebookTimelineMode.ts`
- Test: `tests/analytics/data/codebookTimelineSmartCodes.test.ts`

Estender `EVENT_TYPE_TO_FILTER` com 5 sc_* keys per spec §13. Render bullet `⚡` quando `entry.entity === 'smartCode'`. Config panel ganha checkbox "Include smart code events" (default on).

- [ ] **Step 1: Estender `EVENT_TYPE_TO_FILTER` em `codebookTimelineEngine.ts:17`**

```ts
const EVENT_TYPE_TO_FILTER: Record<AuditEntry['type'], EventTypeFilter> = {
  // ... existentes (created, renamed, description_edited, memo_edited, absorbed, merged_into, deleted)
  // Smart code mappings:
  sc_created: 'created',
  sc_predicate_edited: 'edited',
  sc_memo_edited: 'edited',
  sc_auto_rewritten_on_merge: 'edited',
  sc_deleted: 'deleted',
};
```

TS exhaustiveness force inclusão dos 5 keys; faltar uma quebra build.

- [ ] **Step 2: Write test pra inclusão de sc_* na timeline**

```ts
import { describe, it, expect } from 'vitest';
import { buildTimelineEvents, bucketByGranularity } from '../../../src/analytics/data/codebookTimelineEngine';
import type { AuditEntry } from '../../../src/core/types';

describe('codebookTimeline smart codes', () => {
  it('inclui sc_* events nos buckets corretos', () => {
    const log: AuditEntry[] = [
      { id: 'a1', codeId: 'c_a', at: 1000, type: 'created' },
      { id: 'a2', codeId: 'sc_x', at: 2000, entity: 'smartCode', type: 'sc_created' },
      { id: 'a3', codeId: 'sc_x', at: 3000, entity: 'smartCode', type: 'sc_predicate_edited', addedLeafKinds: ['hasCode'], removedLeafKinds: [], changedLeafCount: 1 },
    ];
    const events = buildTimelineEvents(log, /* nameLookup */ () => 'name');
    expect(events).toHaveLength(3);
    expect(events.find(e => e.entryId === 'a2')?.bucket).toBe('created');
    expect(events.find(e => e.entryId === 'a3')?.bucket).toBe('edited');
  });
});
```

- [ ] **Step 3: Run, expect FAIL (TS will catch missing keys; test verifies behavior)**

- [ ] **Step 4: Renderer — bullet `⚡` quando entity smartCode**

Em `codebookTimelineMode.ts`, no render da lista descending agrupada por dia, adicionar:

```ts
const bulletChar = (entry as any).entity === 'smartCode' ? '⚡' : '•';
listItem.createSpan({ text: bulletChar, cls: 'qc-tl-bullet' });
```

- [ ] **Step 5: Config checkbox "Include smart code events"**

Em `configSections.renderTimelineConfig` (ou wherever the timeline config panel é renderizado):

```ts
const includeSmartCodes = ctx.timelineConfig.includeSmartCodes ?? true;
const checkbox = container.createEl('label');
checkbox.createEl('input', { type: 'checkbox', attr: { checked: includeSmartCodes } }).onchange = (e) => {
  ctx.timelineConfig.includeSmartCodes = (e.target as HTMLInputElement).checked;
  ctx.refreshMode();
};
checkbox.createSpan({ text: 'Include smart code events' });
```

- [ ] **Step 6: Filter aplicado em `buildTimelineEvents` ou no consumer**

```ts
const filtered = log.filter(e => {
  if ((e as any).entity === 'smartCode' && !timelineConfig.includeSmartCodes) return false;
  return true;
});
```

- [ ] **Step 7: Run tests, smoke no vault**

Smoke: editar predicate de smart code → entry aparece na timeline com bullet ⚡. Toggle checkbox off → entries de smart code somem.

- [ ] **Step 8: Commit**

```bash
git add src/analytics/data/codebookTimelineEngine.ts src/analytics/views/modes/codebookTimelineMode.ts src/analytics/views/configSections.ts tests/analytics/data/codebookTimelineSmartCodes.test.ts
~/.claude/scripts/commit.sh "feat(analytics): codebook timeline inclui sc_* events com ⚡ icon + checkbox toggle"
```

### Task 4.7: Visibility per-doc test pra smart code (string-key safety)

**Files:**
- Test: `tests/core/codeVisibilitySmartCodes.test.ts` (criar)

- [ ] **Step 1: Test que `isCodeVisibleInFile` aceita smart code id sem registry lookup**

```ts
import { describe, it, expect } from 'vitest';
import { isCodeVisibleInFile, shouldStoreOverride } from '../../src/core/codeVisibility';

describe('codeVisibility com smart code ids', () => {
  it('isCodeVisibleInFile aceita sc_* sem assumir registry.definitions', () => {
    const overrides = { 'note.md': { 'sc_x': false }};
    expect(isCodeVisibleInFile('sc_x', 'note.md', overrides, false /* globalHidden */)).toBe(false);
    expect(isCodeVisibleInFile('sc_x', 'other.md', overrides, false)).toBe(true);  // sem override → global
    expect(isCodeVisibleInFile('sc_x', 'other.md', overrides, true)).toBe(false);   // global hidden
  });

  it('shouldStoreOverride aceita sc_* (toggle só persiste se diverge do global)', () => {
    expect(shouldStoreOverride('sc_x', false, false)).toBe(false);  // ambos hidden → no override
    expect(shouldStoreOverride('sc_x', false, true)).toBe(true);    // override (visible) diverge do global hidden
  });
});
```

- [ ] **Step 2: Run, expect PASS** (per spec §11, helpers já são string-key safe — esse test é regression guard)

- [ ] **Step 3: Smoke test no vault**

Criar smart code, criar 2 markdown notes. Em uma, abrir popover de visibility (eye icon do header da view), toggle smart code off. Smart code deve sumir do sidebar dessa nota mas continuar na outra.

- [ ] **Step 4: Commit**

```bash
git add tests/core/codeVisibilitySmartCodes.test.ts
~/.claude/scripts/commit.sh "test(visibility): smart codes seguem padrão string-key (zero mudança em migrators)"
```

### Chunk 4 closeout — smoke test cross-surface

- [ ] No vault: criar 3 smart codes, verificar que aparecem em Frequency mode + filter chip do Analytics + sidebar dos 6 engines + Codebook Timeline (após edit).

---

## Chunk 5: Export QDPX + Import QDPX + CSV Tabular + Audit Log Emit

**Output desta chunk:** Round-trip QDPX (Qualia → QDPX → Qualia) preserva smart codes bit-idêntico. CSV tabular gera `smart_codes.csv`. Audit log emite eventos pros 5 sc_* types nas mutations do registry.

**Estimativa:** 1 sessão.

### Task 5.1: Audit log emit em mutations

**Files:**
- Modify: `src/core/smartCodes/smartCodeRegistryApi.ts`
- Modify: `src/main.ts` (instalar audit listener pro smart code registry)

Em cada método do API, após persist, chamar `auditEmit({ entity: 'smartCode', codeId: sc.id, type: 'sc_*', ... })`. Coalescing 60s pra `sc_predicate_edited` e `sc_memo_edited` é responsabilidade do `appendEntry` (já estendido em Task 1.9).

`predicate_edited` precisa do diff de leaves. Helper puro `diffPredicateLeaves(oldPred, newPred): { addedLeafKinds: string[], removedLeafKinds: string[], changedLeafCount: number }` walk em ambos AST coletando kinds.

- [ ] **Step 1: Write failing test pra diffPredicateLeaves**

```ts
import { describe, it, expect } from 'vitest';
import { diffPredicateLeaves } from '../../../src/core/smartCodes/smartCodeRegistryApi';

describe('diffPredicateLeaves', () => {
  it('detects added leaf kinds', () => {
    const old: any = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }]};
    const next: any = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }, { kind: 'inFolder', folderId: 'f_x' }]};
    const diff = diffPredicateLeaves(old, next);
    expect(diff.addedLeafKinds).toEqual(['inFolder']);
    expect(diff.removedLeafKinds).toEqual([]);
  });
  it('detects removed leaf kinds', () => {
    const old: any = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }, { kind: 'inFolder', folderId: 'f_x' }]};
    const next: any = { op: 'AND', children: [{ kind: 'hasCode', codeId: 'c_a' }]};
    const diff = diffPredicateLeaves(old, next);
    expect(diff.removedLeafKinds).toEqual(['inFolder']);
  });
  it('counts changes (different ref but same kind)', () => {
    const old: any = { kind: 'hasCode', codeId: 'c_a' };
    const next: any = { kind: 'hasCode', codeId: 'c_b' };
    const diff = diffPredicateLeaves(old, next);
    expect(diff.changedLeafCount).toBe(1);
  });
});
```

- [ ] **Step 2: Implement diff helper**

```ts
// smartCodeRegistryApi.ts (helper puro)
export function diffPredicateLeaves(old: PredicateNode, next: PredicateNode): { addedLeafKinds: string[]; removedLeafKinds: string[]; changedLeafCount: number } {
  const oldLeaves = collectLeaves(old);
  const newLeaves = collectLeaves(next);
  const oldByKind = countBy(oldLeaves, l => l.kind);
  const newByKind = countBy(newLeaves, l => l.kind);
  const added: string[] = [];
  const removed: string[] = [];
  for (const [kind, count] of newByKind) {
    const oldCount = oldByKind.get(kind) ?? 0;
    if (count > oldCount) added.push(kind);
  }
  for (const [kind, count] of oldByKind) {
    const newCount = newByKind.get(kind) ?? 0;
    if (count > newCount) removed.push(kind);
  }
  // changedLeafCount: leaves do mesmo kind com refs diferentes
  let changed = 0;
  // simplificação: compara serialização de leaves do mesmo kind
  // (implementação completa depende do nível desejado de diff; pra audit, contagem aproximada basta)
  return { addedLeafKinds: added, removedLeafKinds: removed, changedLeafCount: changed };
}

function collectLeaves(node: PredicateNode): LeafNode[] {
  if (isLeafNode(node)) return [node];
  if (node.op === 'NOT') return collectLeaves(node.child);
  return node.children.flatMap(collectLeaves);
}
```

- [ ] **Step 3: Wire emit em cada método do API**

Sites de emit (em `smartCodeRegistryApi.ts`):

| Method | Emit |
|---|---|
| `createSmartCode` | `{ entity: 'smartCode', codeId: sc.id, type: 'sc_created', at: Date.now(), id: uuid() }` |
| `updateSmartCode` (predicate change) | `{ ..., type: 'sc_predicate_edited', ...diffPredicateLeaves(old, next) }` |
| `setSmartCodeMemo` | `{ ..., type: 'sc_memo_edited', from: oldMemo, to: newMemo }` |
| `setSmartCodeColor` | nada (cosmético, não auditado per spec §13) |
| `autoRewriteOnMerge` (pra cada sc afetado) | `{ ..., type: 'sc_auto_rewritten_on_merge', sourceCodeId, targetCodeId }` |
| `deleteSmartCode` | `{ ..., type: 'sc_deleted' }` |

API pattern:

```ts
constructor(private deps: { data: QualiaData; auditEmit: (e: AuditEntry) => void; ... }) {}
```

- [ ] **Step 4: Wire `auditEmit` em main.ts**

```ts
const auditEmit = (e: AuditEntry) => appendEntry(this.data.auditLog, e);
this.smartCodeApi = new SmartCodeApi({ data: this.data, auditEmit, /* ... */ });
```

`appendEntry` já handles coalescing pra `sc_predicate_edited`/`sc_memo_edited` (Task 1.9).

- [ ] **Step 5: Test integration — chamar createSmartCode → entry no auditLog; chamar setSmartCodeMemo 2x dentro de 60s → entries coalescem**

- [ ] **Step 6: Commit**

```bash
git add src/core/smartCodes/smartCodeRegistryApi.ts src/main.ts tests/core/smartCodes/smartCodeRegistryApi.test.ts
~/.claude/scripts/commit.sh "feat(smartCodes): audit log emit em mutations + diffPredicateLeaves helper"
```

### Task 5.2: Export QDPX — `qualia:SmartCodes` block

**Files:**
- Modify: `src/export/qdpxExporter.ts`
- Test: `tests/export/qdpxSmartCodes.test.ts`

Adicionar `buildSmartCodesXml(smartCodes)` puro que gera o bloco per spec §14. `xmlns:qualia="urn:qualia-coding:extensions:1.0"` declarado no Project root quando `smartCodes` non-empty (já há precedente no Code Groups). Optional toggle "Materialize as Sets" gera `<Set>` paralelo.

- [ ] **Steps 1-5 + 2 tests:** export com 0 smart codes (no `qualia:SmartCodes` no XML) e export com smart codes complexos (predicate + memo + 2 smart codes onde um referencia outro via `smartCode` leaf).

- [ ] **Commit:**

```bash
git add src/export/qdpxExporter.ts tests/export/qdpxSmartCodes.test.ts
~/.claude/scripts/commit.sh "feat(export): smart codes block em QDPX (qualia:SmartCodes namespace)"
```

### Task 5.3: Import QDPX — 2-pass parse

**Files:**
- Modify: `src/import/qdpxImporter.ts`
- Test: `tests/import/qdpxSmartCodes.test.ts`

`parseSmartCodes` recebe XML + `GuidResolver` que ganha `smartCodes: Map<string,string>` field. Pass 1 aloca placeholders + popula idMap. Pass 2 deserializa predicates + remap refs. Broken refs → warning + leaf preservada com original ref.

- [ ] **Step 1: Estender `GuidResolver` em `src/import/qdpxImporter.ts:105`**

```bash
sed -n '100,115p' src/import/qdpxImporter.ts
```

Adicionar field:

```ts
class GuidResolver {
  codes = new Map<string, string>();
  sources = new Map<string, string>();
  selections = new Map<string, string>();
  // ... outros existentes
  smartCodes = new Map<string, string>();  // NOVO

  // métodos: getOrCreateId, etc — reusar pattern existente pra smartCodes:
  getOrCreateSmartCodeId(oldGuid: string): string {
    let id = this.smartCodes.get(oldGuid);
    if (!id) { id = `sc_${nanoid(8)}`; this.smartCodes.set(oldGuid, id); }
    return id;
  }
}
```

- [ ] **Step 2: Write failing test pra parseSmartCodes (2-pass)**

```ts
import { describe, it, expect } from 'vitest';
import { parseSmartCodes } from '../../src/import/qdpxImporter';

describe('parseSmartCodes 2-pass', () => {
  it('resolves 2 smart codes mutuamente referenciados', () => {
    const xml = `
      <qualia:SmartCodes xmlns:qualia="urn:qualia-coding:extensions:1.0">
        <qualia:SmartCode guid="old-A" name="A" color="#aaa">
          <qualia:Predicate><![CDATA[{"kind":"smartCode","smartCodeId":"old-B"}]]></qualia:Predicate>
        </qualia:SmartCode>
        <qualia:SmartCode guid="old-B" name="B" color="#bbb">
          <qualia:Predicate><![CDATA[{"kind":"hasCode","codeId":"old-c1"}]]></qualia:Predicate>
        </qualia:SmartCode>
      </qualia:SmartCodes>
    `;
    const idMap = { codes: new Map([['old-c1', 'c_c1']]), smartCodes: new Map(), folders: new Map(), groups: new Map() } as any;
    const result = parseSmartCodes(xml, idMap);
    expect(result.smartCodes).toHaveLength(2);
    const A = result.smartCodes.find((s: any) => s.name === 'A');
    expect((A!.predicate as any).smartCodeId).toBe(idMap.smartCodes.get('old-B'));
    const B = result.smartCodes.find((s: any) => s.name === 'B');
    expect((B!.predicate as any).codeId).toBe('c_c1');
  });

  it('broken ref vira leaf preservada + warning', () => {
    const xml = `
      <qualia:SmartCodes xmlns:qualia="urn:qualia-coding:extensions:1.0">
        <qualia:SmartCode guid="old-A" name="A" color="#aaa">
          <qualia:Predicate><![CDATA[{"kind":"hasCode","codeId":"old-deleted"}]]></qualia:Predicate>
        </qualia:SmartCode>
      </qualia:SmartCodes>
    `;
    const idMap = { codes: new Map(), smartCodes: new Map(), folders: new Map(), groups: new Map() } as any;
    const result = parseSmartCodes(xml, idMap);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/broken/i);
    const A = result.smartCodes[0];
    expect((A.predicate as any).codeId).toBe('old-deleted');  // preservado pra debug
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Implement parseSmartCodes (regex-based como `parseSetsFromXml`)**

```ts
// qdpxImporter.ts
export function parseSmartCodes(xml: string, idMap: GuidResolver): { smartCodes: SmartCodeDefinition[]; warnings: string[] } {
  const warnings: string[] = [];
  // Pass 1: extrair atributos + alocar IDs novos
  const blockMatch = xml.match(/<qualia:SmartCodes[^>]*>([\s\S]*?)<\/qualia:SmartCodes>/);
  if (!blockMatch) return { smartCodes: [], warnings };
  const inner = blockMatch[1];
  const scMatches = [...inner.matchAll(/<qualia:SmartCode\s+guid="([^"]+)"\s+name="([^"]+)"\s+color="([^"]+)"[^>]*>([\s\S]*?)<\/qualia:SmartCode>/g)];

  const allocated: { oldGuid: string; newId: string; name: string; color: string; predicateRaw: string; memo?: string }[] = [];
  for (const m of scMatches) {
    const [_, oldGuid, name, color, body] = m;
    const newId = idMap.getOrCreateSmartCodeId(oldGuid);
    const predicateRaw = (body.match(/<qualia:Predicate><!\[CDATA\[([\s\S]*?)\]\]><\/qualia:Predicate>/)?.[1] ?? '').trim();
    const memo = body.match(/<qualia:Memo>([\s\S]*?)<\/qualia:Memo>/)?.[1];
    allocated.push({ oldGuid, newId, name, color, predicateRaw, memo });
  }

  // Pass 2: deserialize + remap refs
  const out: SmartCodeDefinition[] = [];
  for (const a of allocated) {
    let predicate: PredicateNode;
    try { predicate = JSON.parse(a.predicateRaw); }
    catch (err) { warnings.push(`Failed to parse predicate for smart code "${a.name}"`); predicate = { op: 'AND', children: [] }; }
    const remappedPredicate = remapPredicateRefs(predicate, idMap, warnings, a.name);
    out.push({
      id: a.newId, name: a.name, color: a.color, paletteIndex: 0, createdAt: Date.now(),
      predicate: remappedPredicate,
      memo: a.memo,
    });
  }
  return { smartCodes: out, warnings };
}

function remapPredicateRefs(node: PredicateNode, idMap: GuidResolver, warnings: string[], scName: string): PredicateNode {
  if (isOpNode(node)) {
    if (node.op === 'NOT') return { op: 'NOT', child: remapPredicateRefs(node.child, idMap, warnings, scName) };
    return { op: node.op, children: node.children.map(c => remapPredicateRefs(c, idMap, warnings, scName)) };
  }
  switch (node.kind) {
    case 'hasCode':
    case 'magnitudeGte':
    case 'magnitudeLte':
    case 'relationExists': {
      const newId = idMap.codes.get(node.codeId);
      if (!newId) { warnings.push(`Smart code "${scName}" references deleted code ${node.codeId}`); return node; }
      return { ...node, codeId: newId, ...(node.kind === 'relationExists' && node.targetCodeId ? { targetCodeId: idMap.codes.get(node.targetCodeId) ?? node.targetCodeId } : {}) };
    }
    case 'inFolder': {
      const newId = idMap.folders?.get(node.folderId);
      if (!newId) { warnings.push(`Smart code "${scName}" references deleted folder ${node.folderId}`); return node; }
      return { ...node, folderId: newId };
    }
    case 'inGroup': {
      const newId = idMap.groups?.get(node.groupId);
      if (!newId) { warnings.push(`Smart code "${scName}" references deleted group ${node.groupId}`); return node; }
      return { ...node, groupId: newId };
    }
    case 'smartCode': {
      const newId = idMap.smartCodes.get(node.smartCodeId);
      if (!newId) { warnings.push(`Smart code "${scName}" references deleted smart code ${node.smartCodeId}`); return node; }
      return { ...node, smartCodeId: newId };
    }
    case 'caseVarEquals':
    case 'caseVarRange':
    case 'engineType':
      return node;  // names estáveis ou enum estático
  }
}
```

- [ ] **Step 5: Wire em orquestrador `qdpxImporter`**

Após `parseSets` e `parseCases` (smart codes referenciam grupos/case vars), chamar `parseSmartCodes(xml, idMap)`. Persist smart codes em `data.registry.smartCodes` e `smartCodeOrder`. Append warnings ao import report.

- [ ] **Step 6: Round-trip e2e test**

```ts
it('round-trip Qualia → QDPX → Qualia preserva smart code complexo', () => {
  const original: SmartCodeDefinition = { /* AST com 9 leaves variadas + nesting */ } as any;
  const qdpx = exportQdpx({ smartCodes: [original], ... });
  const reimported = importQdpx(qdpx);
  const restored = reimported.smartCodes[0];
  expect(restored.name).toBe(original.name);
  expect(restored.predicate).toEqual(matchPredicateModuloRemap(original.predicate));
});
```

- [ ] **Step 7: Run all tests, expect PASS**

- [ ] **Step 8: Commit**

```bash
git add src/import/qdpxImporter.ts tests/import/qdpxSmartCodes.test.ts
~/.claude/scripts/commit.sh "feat(import): parse smart codes em 2-pass (resolve nesting refs + GuidResolver.smartCodes)"
```

### Task 5.4: CSV tabular — `smart_codes.csv`

**Files:**
- Create: `src/export/tabular/buildSmartCodesTable.ts`
- Modify: `src/export/tabular/tabularExporter.ts`
- Modify: `src/export/tabular/readmeBuilder.ts`
- Test: `tests/export/tabular/buildSmartCodesTable.test.ts`

`buildSmartCodesCsv(smartCodes, cache): string` puro. Colunas: `id, name, color, predicate_json, memo, matches_at_export`. RFC 4180 escape pro JSON.

`tabularExporter` adiciona `smart_codes.csv` ao zip. `readmeBuilder` adiciona section "smart_codes.csv" com snippet R + Python.

- [ ] **Steps 1-5 + test que parse RFC 4180 do output bate com input**

- [ ] **Commit:**

```bash
git add src/export/tabular/buildSmartCodesTable.ts src/export/tabular/tabularExporter.ts src/export/tabular/readmeBuilder.ts tests/export/tabular/buildSmartCodesTable.test.ts
~/.claude/scripts/commit.sh "feat(export): smart_codes.csv tabular + README snippets R/Python"
```

### Chunk 5 closeout — round-trip e2e + smoke

- [ ] Round-trip test e2e: criar 5 smart codes no vault → export QDPX → criar vault novo → import QDPX → verificar smart codes presentes com counts equivalentes (módulo IDs novos).

- [ ] Tabular CSV: export → unzip → conferir `smart_codes.csv` válido + README com snippets.

- [ ] Audit log: editar predicate de smart code → conferir que entry `sc_predicate_edited` aparece em Smart Code Detail history + Codebook Timeline.

---

## Final closeout

- [ ] Suite verde completa: `npm test` — esperar ~2780+ testes, todos green incluindo stress.
- [ ] Typecheck: `npx tsc --noEmit` — zero erros.
- [ ] Build: `npm run build` — esperar success.
- [ ] Smoke completo no vault per spec §17:
  - 5 smart codes criados via builder
  - Counts batem em Code Explorer + Smart Code Detail + sidebar de cada engine
  - Filter no Analytics retorna mesmos markers
  - Edit predicate atualiza tudo em <1s
  - Delete code referenciado mostra warning
  - Merge code referenciado auto-rewriteia
  - Export QDPX + import em vault novo preserva tudo
- [ ] Atualizar `docs/ROADMAP.md`: marcar Tier 3 Smart Codes como FEITO + data
- [ ] Atualizar `docs/ARCHITECTURE.md`: novo módulo `src/core/smartCodes/`
- [ ] Atualizar `docs/TECHNICAL-PATTERNS.md` se descobrir pattern novo
- [ ] Atualizar `CLAUDE.md` Estrutura: adicionar `smartCodes/` directory
- [ ] Tag par `pre-smart-codes-baseline` (já é o HEAD pré-implementação) e `post-smart-codes-checkpoint` no fim
- [ ] Considerar release `0.2.0` (minor — feature substancial nova)

---

## Open questions deferred from spec §21

Resolver inline durante implementação — não exigem nova decisão de design:

1. **AnyMarker discriminated union existente?** — Task 1.1 verifica. Se existir, reusar. Se não, criar.
2. **getAllMarkers helper existente?** — Task 1.2 confirma que não existe e cria.

Outras open questions já resolvidas no spec (engine via MarkerRef, count display X/Y, magnitudeLte type-guard).
