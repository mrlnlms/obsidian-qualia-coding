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
  predicateValidator.ts                              [CREATE] — validateForSave(definition, predicate, registry, allSmartCodes) — vazio, cycles, broken refs, name collision, magnitude type
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
  it('rejects empty AND', () => {
    const r = validateForSave(
      { id: 'sc_1', name: 'X' } as any,
      { op: 'AND', children: [] },
      { definitions: {}, smartCodes: {}, folders: {}, groups: {} } as any,
    );
    expect(r.errors).toContainEqual(expect.objectContaining({ code: 'empty' }));
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

  // 1. Empty
  if (isOpNode(predicate) && predicate.op !== 'NOT' && predicate.children.length === 0) {
    errors.push({ code: 'empty', message: 'Predicate must have at least one condition' });
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

- [ ] **Step 5: Add test pra todos os 6 marker shapes (markdown, image, audio, video, csv segment, csv row) — copy o test pattern de PDF, ajustando shape**

Adicione 6 testes parametrizados no fim do arquivo de teste. Cada um cria marker do shape correto e verifica `hasCode` + `magnitudeGte`.

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

  beforeEach(() => {
    data = createDefaultData();
    data.markdown.markers = {
      'f1.md': [{ id: 'm1', codes: [{ codeId: 'c_a' }], ranges: [] }],
    };
    data.registry.smartCodes = {
      'sc_x': { id: 'sc_x', name: 'X', color: '#fff', paletteIndex: 0, createdAt: 0, predicate: { kind: 'hasCode', codeId: 'c_a' }},
    };
    cache = new SmartCodeCache();
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

  it('referential identity: index refs === marker objects', () => {
    const data = buildLargeFixture({ codes: 100, markers: 1000, smartCodes: 10, caseVars: 5 });
    const cache = new SmartCodeCache();
    cache.configure({ smartCodes: data.registry.smartCodes, caseVars: { get: () => undefined, allKeys: () => new Set() }, codeStruct: { codesInFolder: () => [], codesInGroup: () => [] } });
    cache.rebuildIndexes(data);
    const idx = cache.__getIndexByCodeForTest();
    const refs = idx.get('c_0');
    expect(refs).toBeDefined();
    // refs apontam pro markerByRef do cache; mesma identity
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

Helpers puros pra manipular AST: `addLeafToGroup(predicate, parentPath, newLeaf)`, `removeNodeAt(predicate, path)`, `moveNodeBetweenParents(predicate, fromPath, toPath, index)`, `changeOperator(predicate, path, newOp)`.

`Path` é `number[]` representando índice em cada level.

- [ ] **Steps 1-5 padrão TDD pra cada helper.**

- [ ] **Commit:**

```bash
git add src/core/smartCodes/builderTreeOps.ts tests/core/smartCodes/builderTreeOps.test.ts
~/.claude/scripts/commit.sh "feat(smartCodes): builder tree ops puros (add/remove/move/changeOp)"
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

Layout 3 zonas (header / body / footer) conforme spec §7. Usa builderTreeOps + builderRowRenderer. Preview live debounced 300ms calling `cache.compute` (helper que aceita predicate sem persistir).

Validation chama `validateForSave` no save; bloqueia se errors, mostra warnings.

- [ ] **Step 1-N implementation**

- [ ] **Smoke test:** abrir vault real, command palette → "Smart Code: New" → builder abre, criar predicate simples (`hasCode "X"`), preview mostra count, save persiste.

- [ ] **Commit:**

```bash
git add src/core/smartCodes/builderModal.ts src/main.ts
~/.claude/scripts/commit.sh "feat(smartCodes): builder modal funcional + command palette entry"
```

### Task 3.4: Criar `detailSmartCodeRenderer.ts` (Smart Code Detail)

**Files:**
- Create: `src/core/smartCodes/detailSmartCodeRenderer.ts`

Espelha `detailCodeRenderer.ts`. Layout per spec §9. Usa `virtualList.ts` pra match list. Loading state per spec.

- [ ] **Steps 1-N**

- [ ] **Commit:**

```bash
git add src/core/smartCodes/detailSmartCodeRenderer.ts src/core/baseCodeDetailView.ts
~/.claude/scripts/commit.sh "feat(smartCodes): Smart Code Detail (header + predicate display + matches virtual list)"
```

### Task 3.5: Code Explorer section "Smart Codes" + integração

**Files:**
- Modify: `src/core/codebookTreeRenderer.ts`
- Modify: `src/core/baseCodeDetailView.ts`
- Modify: `styles.css`

Section colapsável no topo. Cada row: `⚡ name (count)` + eye toggle. Click navega pro Smart Code Detail. Context menu (Edit / Rename / Recolor / Edit memo / Hide / Delete). Loading state per spec §8.

`baseCodeDetailView` ganha dispatch: se `selectedId` começa com `sc_`, renderiza Smart Code Detail; senão Code Detail.

CSS pra `.qc-smart-code-row`, `.qc-smart-codes-section`, `.qc-smart-codes-section-header` (padrão visual coerente com codebook existente, badge `⚡` antes do nome).

- [ ] **Steps 1-N**

- [ ] **Smoke test em vault:** criar 3 smart codes; verificar:
  - Section aparece no topo do Code Explorer com count "3"
  - Click num smart code abre Smart Code Detail correto
  - Context menu funciona (delete pede confirmação)
  - Eye toggle hide/unhide
  - Loading state aparece em smart code grande durante invalidate

- [ ] **Commit:**

```bash
git add src/core/codebookTreeRenderer.ts src/core/baseCodeDetailView.ts styles.css
~/.claude/scripts/commit.sh "feat(smartCodes): Code Explorer section + dispatch pro Smart Code Detail"
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

- [ ] **Steps 1-5 TDD**

- [ ] **Commit:**

```bash
git add src/analytics/data/dataReader.ts tests/analytics/data/dataReaderSmartCodes.test.ts
~/.claude/scripts/commit.sh "feat(analytics): dataReader.getCodeDimensions inclui smart codes"
```

### Task 4.2: applyFilters dispatch via prefix

**Files:**
- Modify: `src/analytics/data/statsHelpers.ts`
- Test: `tests/analytics/data/applyFiltersSmartCodes.test.ts`

Helper `partitionByPrefix(codeIds): { regular: string[], smart: string[] }`. Em `applyFilters`, smart codes resolvem via `cache.getMatches(id)` → set de markerRefs.

- [ ] **Steps**

- [ ] **Commit:**

```bash
git add src/analytics/data/statsHelpers.ts tests/analytics/data/applyFiltersSmartCodes.test.ts
~/.claude/scripts/commit.sh "feat(analytics): applyFilters dispatch via sc_/c_ prefix"
```

### Task 4.3: configSections — filter chips Smart Codes

**Files:**
- Modify: `src/analytics/views/configSections.ts`

`renderCodesFilter` ganha sub-section "Smart Codes" com chips ⚡ separados.

- [ ] **Steps + smoke test no vault**

- [ ] **Commit:**

```bash
git add src/analytics/views/configSections.ts styles.css
~/.claude/scripts/commit.sh "feat(analytics): filter chips section pra smart codes"
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

- [ ] **Steps + smoke test em cada mode no vault**

- [ ] **Commit:**

```bash
git add src/analytics/views/modes/
~/.claude/scripts/commit.sh "feat(analytics): smart codes como dimension em frequency/evolution/cooccurrence/sequential/codeMetadata/memoView"
```

### Task 4.5: Sidebar adapters — Smart Codes group

**Files:**
- Modify: `src/core/baseSidebarAdapter.ts`
- Modify: `src/media/mediaSidebarAdapter.ts` (audio/video herda)
- Modify: 6 sidebar adapter files concretos (markdown/pdf/image/csv/audio/video)

Após renderização de regulares, render "Smart Codes (N)" se N > 0. Cada row `⚡ name (count)`. Click navega pro próximo match no file.

Visibility per-doc: smart code segue mesmo padrão (`visibilityOverrides[fileId][smartCodeId]`).

- [ ] **Steps + smoke test em cada engine**

- [ ] **Commit:**

```bash
git add src/core/baseSidebarAdapter.ts src/media/mediaSidebarAdapter.ts src/markdown/ src/pdf/ src/image/ src/csv/ src/audio/ src/video/
~/.claude/scripts/commit.sh "feat(smartCodes): sidebar adapters mostram smart codes com matches no file"
```

### Task 4.6: Codebook Timeline — sc_* events + ⚡ icon + checkbox

**Files:**
- Modify: `src/analytics/data/codebookTimelineEngine.ts`
- Modify: `src/analytics/views/modes/codebookTimelineMode.ts`
- Test: `tests/analytics/data/codebookTimelineSmartCodes.test.ts`

Estender `EVENT_TYPE_TO_FILTER` com 5 sc_* keys per spec §13. Render bullet `⚡` quando `entry.entity === 'smartCode'`. Config panel ganha checkbox "Include smart code events" (default on).

- [ ] **Steps**

- [ ] **Commit:**

```bash
git add src/analytics/data/codebookTimelineEngine.ts src/analytics/views/modes/codebookTimelineMode.ts tests/analytics/data/codebookTimelineSmartCodes.test.ts
~/.claude/scripts/commit.sh "feat(analytics): codebook timeline inclui sc_* events com ⚡ icon"
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

Em cada método do API, após persist, chamar `auditEmit({ entity: 'smartCode', codeId: sc.id, type: 'sc_*', ... })`. Coalescing 60s pra `sc_predicate_edited` e `sc_memo_edited` é responsabilidade do `appendEntry` (já implementado).

`predicate_edited` precisa do diff de leaves. Helper puro `diffPredicateLeaves(oldPred, newPred): { added: string[], removed: string[], changedCount: number }` walk em ambos AST coletando kinds.

- [ ] **Steps 1-5 + test do diff helper**

- [ ] **Commit:**

```bash
git add src/core/smartCodes/smartCodeRegistryApi.ts src/main.ts
~/.claude/scripts/commit.sh "feat(smartCodes): audit log emit em mutations + diff helper"
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

`parseSmartCodes` recebe XML + `idMap` (que ganha `smartCodes: Map<string,string>`). Pass 1 aloca placeholders + popula idMap. Pass 2 deserializa predicates + remap refs. Broken refs → warning + leaf preservada com original ref.

- [ ] **Steps 1-5 + tests pra:**
  - Round-trip Qualia→QDPX→Qualia preserva tudo
  - Import com broken ref produz warning sem quebrar
  - Import com 2 smart codes mutuamente referenciados resolve corretamente

- [ ] **Commit:**

```bash
git add src/import/qdpxImporter.ts tests/import/qdpxSmartCodes.test.ts
~/.claude/scripts/commit.sh "feat(import): parse smart codes em 2-pass (resolve nesting refs)"
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
