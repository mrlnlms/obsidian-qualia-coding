# Analytic Memo View — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar mode `"memo-view"` ao Analytics que agrega memos de codes/groups/relations/markers em uma view de leitura analítica com edição inline e export pra CSV/Markdown.

**Architecture:** Mesmo pattern declarativo do `codeMetadataMode` — função pura de agregação em `analytics/data/memoView.ts`, render DOM modular em `analytics/views/modes/memoView/`, registrado no `MODE_REGISTRY`. Lê raw via `readAllData(plugin.dataManager)` (não usa `ctx.data` consolidado, que perde memos). Persiste edits via `dataManager.findMarker` + mutação in-place + `markDirty()` (formaliza pattern já usado em menus).

**Tech Stack:** TypeScript strict, Vitest + jsdom, Obsidian Plugin API, sem libs externas novas.

**Spec:** `docs/superpowers/specs/2026-04-27-analytic-memo-view-design.md`

---

## File Structure

### Created files
| Path | Responsibility |
|---|---|
| `src/analytics/data/memoView.ts` | Função pura `aggregateMemos`, helper local `flattenMarkers`, helper local `applyMemoFilters` |
| `src/analytics/data/__tests__/memoView.test.ts` | Tests da função pura (~25) |
| `src/analytics/views/modes/memoView/memoViewMode.ts` | Orchestrator: registra render/options/exports |
| `src/analytics/views/modes/memoView/renderCoverageBanner.ts` | Banner topo |
| `src/analytics/views/modes/memoView/renderCodeSection.ts` | Render `CodeMemoSection` |
| `src/analytics/views/modes/memoView/renderFileSection.ts` | Render `FileMemoSection` (toggle by-file) |
| `src/analytics/views/modes/memoView/renderMarkerCard.ts` | Card de marker memo (excerpt + textarea + chip) |
| `src/analytics/views/modes/memoView/renderMemoEditor.ts` | Textarea editor com debounced save + suspend |
| `src/analytics/views/modes/memoView/memoViewOptions.ts` | Config panel (showTypes + groupBy + markerLimit + reuso de filtros) |
| `src/analytics/views/modes/memoView/exportMemoCSV.ts` | CSV export |
| `src/analytics/views/modes/memoView/exportMemoMarkdown.ts` | Markdown export |
| `src/analytics/views/modes/memoView/__tests__/memoViewMode.test.ts` | Tests UI render (~15) |
| `src/analytics/views/modes/memoView/__tests__/memoViewEdit.test.ts` | Tests edição inline (~12) |
| `src/analytics/views/modes/memoView/__tests__/exportMemoCSV.test.ts` | Tests CSV export (~6) |
| `src/analytics/views/modes/memoView/__tests__/exportMemoMarkdown.test.ts` | Tests Markdown export (~6) |
| `src/core/__tests__/dataManager.findMarker.test.ts` | Tests da nova API `findMarker` |
| `src/core/__tests__/codeApplicationHelpers.setApplicationRelationMemo.test.ts` | Tests do helper novo |

### Modified files
| Path | What changes |
|---|---|
| `src/analytics/data/dataTypes.ts` | Adiciona `MemoViewFilters`, `CoverageStats`, `MemoEntry`, `CodeMemoSection`, `FileMemoSection`, `MemoViewResult` |
| `src/analytics/views/analyticsViewContext.ts` | Adiciona `mvGroupBy`, `mvShowTypes`, `mvMarkerLimit`, `mvExpanded`, `suspendRefresh()`, `resumeRefresh()`; adiciona `"memo-view"` em `ViewMode` |
| `src/analytics/views/analyticsView.ts` | Adiciona `refreshSuspendedCount`, no-op em `scheduleUpdate` quando suspended, render do botão "Export Markdown" condicional, persistência dos novos campos do context |
| `src/analytics/views/modes/modeRegistry.ts` | Importa do `memoView/`, adiciona entry `"memo-view"`, estende `ModeEntry` com `exportMarkdown?` |
| `src/core/dataManager.ts` | Adiciona método `findMarker(engineType, markerId)` |
| `src/core/codeApplicationHelpers.ts` | Adiciona `setApplicationRelationMemo(codes, codeId, label, target, memo)` |
| `styles.css` | Adiciona seções `.memo-view-*` (banner, section, marker-card, editor, indentation) |

---

## Conventions for this plan

- **Commits:** sempre via `~/.claude/scripts/commit.sh "msg"`. Conventional commits PT-BR. Sem `--no-verify`, sem `git add -A`.
- **Tests:** `npm run test -- <pattern>` para subset; `npm run test` ao final de chunk.
- **Build:** `npm run build` ao final de cada chunk com mudança em `src/`.
- **Demo sync:** ao final do plan, `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`.
- **Smoke:** ao final de cada chunk, abrir vault `obsidian-plugins-workbench/` e validar cenário documentado.
- **Sem worktree** (CLAUDE.md project rule). Branch direto: `git checkout -b feat/analytic-memo-view`.

---

## Pre-flight

- [ ] **Step 0.1: Criar branch**

```bash
git checkout -b feat/analytic-memo-view
```

- [ ] **Step 0.2: Verificar estado limpo**

```bash
git status
npm run test -- --run 2>&1 | tail -5
```

Expected: branch limpa, todos tests passando (2307 conforme CLAUDE.md).

---

## Chunk 1: Tipos + função pura `aggregateMemos`

**Goal:** tipos novos em `dataTypes.ts` + módulo `data/memoView.ts` com função pura testada. Sem UI ainda.

### Task 1.1: Adicionar tipos em `dataTypes.ts`

**Files:**
- Modify: `src/analytics/data/dataTypes.ts` (final do arquivo)

- [ ] **Step 1.1.1: Acrescentar tipos no fim do arquivo**

```typescript
// ─── Memo View ──────────────────────────────────────────────────

export interface MemoViewFilters extends FilterConfig {
  showTypes: { code: boolean; group: boolean; relation: boolean; marker: boolean };
  groupBy: "code" | "file";
  markerLimit: 5 | 10 | 25 | "all"; // aggregate ignora; render usa
}

export interface CoverageStats {
  codesWithMemo: number;
  codesTotal: number;
  groupsWithMemo: number;
  groupsTotal: number;
  relationsWithMemo: number;
  relationsTotal: number;
  markersWithMemo: number;
  markersTotal: number;
}

export type MemoEntry =
  | {
      kind: "code";
      codeId: string;
      codeName: string;
      color: string;
      memo: string;
      depth: number;
    }
  | {
      kind: "group";
      groupId: string;
      groupName: string;
      color: string;
      memo: string;
    }
  | {
      kind: "relation";
      codeId: string;
      label: string;
      targetId: string;
      targetName: string;
      directed: boolean;
      memo: string;
      level: "code" | "application";
      markerId?: string;
    }
  | {
      kind: "marker";
      markerId: string;
      codeId: string;
      fileId: string;
      sourceType: EngineType;
      excerpt: string;
      memo: string;
      magnitude?: string | number;
    };

export interface CodeMemoSection {
  codeId: string;
  codeName: string;
  color: string;
  depth: number;
  groupIds: string[];
  codeMemo: string | null;
  groupMemos: MemoEntry[]; // kind="group"
  relationMemos: MemoEntry[]; // kind="relation"
  markerMemos: MemoEntry[]; // kind="marker"
  childIds: string[];
  hasAnyMemoInSubtree: boolean;
}

export interface FileMemoSection {
  fileId: string;
  sourceType: EngineType;
  fileName: string;
  markerMemos: MemoEntry[];
  codeIdsUsed: string[];
}

export interface MemoViewResult {
  groupBy: "code" | "file";
  byCode?: CodeMemoSection[];
  byFile?: FileMemoSection[];
  coverage: CoverageStats;
}
```

- [ ] **Step 1.1.2: Validar typecheck**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: zero erros (tipos isolados, sem referências quebradas).

### Task 1.2: Setup de fixtures + helpers de test

**Files:**
- Create: `src/analytics/data/__tests__/memoView.test.ts`

- [ ] **Step 1.2.1: Criar arquivo de teste com setup compartilhado**

```typescript
import { describe, it, expect } from "vitest";
import { aggregateMemos } from "../memoView";
import type { AllEngineData, MemoViewFilters } from "../dataTypes";
import { CodeDefinitionRegistry } from "../../../core/codeDefinitionRegistry";
import type { CodeApplication } from "../../../core/codeApplicationHelpers";

function makeRegistry(opts?: {
  codes?: Array<{ id: string; name: string; memo?: string; parentId?: string; relations?: Array<{ label: string; target: string; directed?: boolean; memo?: string }> }>;
  groups?: Array<{ id: string; name: string; memo?: string; codeIds?: string[] }>;
}): CodeDefinitionRegistry {
  const reg = new CodeDefinitionRegistry();
  for (const c of opts?.codes ?? []) {
    reg.create(c.name, { color: "#abc", description: "" });
    const def = reg.getByName(c.name)!;
    if (c.memo) reg.update(def.id, { memo: c.memo });
    if (c.parentId) reg.setParent(def.id, c.parentId);
    if (c.relations) {
      for (const r of c.relations) {
        reg.addRelation(def.id, r.label, r.target, r.directed ?? true);
        if (r.memo) reg.setRelationMemo(def.id, r.label, r.target, r.memo);
      }
    }
  }
  for (const g of opts?.groups ?? []) {
    reg.createGroup(g.name);
    const grp = reg.getGroupByName(g.name)!;
    if (g.memo) reg.setGroupMemo(grp.id, g.memo);
    for (const codeId of g.codeIds ?? []) reg.addCodeToGroup(codeId, grp.id);
  }
  return reg;
}

function makeAllData(opts?: { markdownMarkers?: any[]; pdfMarkers?: any[]; csvSegmentMarkers?: any[] }): AllEngineData {
  return {
    markdown: { markers: opts?.markdownMarkers ? { "P01.md": opts.markdownMarkers } : {}, settings: {} as any, codeDefinitions: {} },
    csv: { segmentMarkers: opts?.csvSegmentMarkers ?? [], rowMarkers: [], registry: { definitions: {} } },
    image: { markers: [], settings: {} as any, registry: { definitions: {} } },
    pdf: { markers: opts?.pdfMarkers ?? [], shapes: [], settings: {} as any, registry: { definitions: {} } },
    audio: { files: [], settings: {} as any, codeDefinitions: { definitions: {} } },
    video: { files: [], settings: {} as any, codeDefinitions: { definitions: {} } },
  };
}

const baseFilters: MemoViewFilters = {
  sources: ["markdown", "csv-segment", "csv-row", "image", "pdf", "audio", "video"],
  codes: [],
  excludeCodes: [],
  minFrequency: 0,
  showTypes: { code: true, group: true, relation: true, marker: true },
  groupBy: "code",
  markerLimit: "all",
};

// Tests below — added per task 1.3+
```

- [ ] **Step 1.2.2: Verificar que arquivo compila (sem aggregateMemos ainda)**

```bash
npx tsc --noEmit 2>&1 | grep memoView
```

Expected: erro `Cannot find module '../memoView'`. Esperado — implementação vem em 1.4.

### Task 1.3: Tests de coverage stats (TDD)

**Files:**
- Modify: `src/analytics/data/__tests__/memoView.test.ts`

- [ ] **Step 1.3.1: Escrever 4 tests de coverage**

```typescript
describe("aggregateMemos — coverage", () => {
  it("counts codes with memo", () => {
    const reg = makeRegistry({ codes: [
      { id: "1", name: "A", memo: "memo A" },
      { id: "2", name: "B" },
      { id: "3", name: "C", memo: "memo C" },
    ]});
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    expect(r.coverage.codesTotal).toBe(3);
    expect(r.coverage.codesWithMemo).toBe(2);
  });

  it("counts groups with memo", () => {
    const reg = makeRegistry({ groups: [
      { id: "g1", name: "G1", memo: "g memo" },
      { id: "g2", name: "G2" },
    ]});
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    expect(r.coverage.groupsTotal).toBe(2);
    expect(r.coverage.groupsWithMemo).toBe(1);
  });

  it("counts relations with memo (code-level + app-level)", () => {
    const reg = makeRegistry({ codes: [
      { name: "A", relations: [
        { label: "causes", target: "B", memo: "rel memo 1" },
        { label: "cooccurs", target: "B" },
      ]},
      { name: "B" },
    ]});
    const allData = makeAllData({
      markdownMarkers: [{ id: "m1", fileId: "P01.md", codes: [{ codeId: reg.getByName("A")!.id, relations: [{ label: "x", target: "B", directed: true, memo: "app rel memo" }] }] } as any],
    });
    const r = aggregateMemos(allData, reg, baseFilters);
    expect(r.coverage.relationsTotal).toBe(3);
    expect(r.coverage.relationsWithMemo).toBe(2);
  });

  it("markersTotal respects non-showTypes filters", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }] });
    const aId = reg.getByName("A")!.id;
    const allData = makeAllData({
      markdownMarkers: [{ id: "m1", fileId: "P01.md", codes: [{ codeId: aId }], memo: "x" } as any],
      pdfMarkers: [{ id: "m2", fileId: "P02.pdf", codes: [{ codeId: aId }], memo: "y" } as any],
    });
    const onlyMd: MemoViewFilters = { ...baseFilters, sources: ["markdown"] };
    const r = aggregateMemos(allData, reg, onlyMd);
    expect(r.coverage.markersTotal).toBe(1);
    expect(r.coverage.markersWithMemo).toBe(1);
  });
});
```

- [ ] **Step 1.3.2: Rodar tests pra verificar falha esperada**

```bash
npm run test -- --run memoView.test 2>&1 | tail -20
```

Expected: `Cannot find module '../memoView'` ou tests fail because aggregateMemos doesn't exist.

### Task 1.4: Implementar `aggregateMemos` mínimo (coverage só)

**Files:**
- Create: `src/analytics/data/memoView.ts`

- [ ] **Step 1.4.1: Criar `memoView.ts` com coverage só (suporta tests do 1.3)**

```typescript
import type { CodeDefinitionRegistry } from "../../core/codeDefinitionRegistry";
import type { BaseMarker } from "../../core/types";
import type { CodeApplication } from "../../core/codeApplicationHelpers";
import type { AllEngineData } from "./dataReader";
import type {
  CodeMemoSection,
  CoverageStats,
  EngineType,
  FileMemoSection,
  MemoEntry,
  MemoViewFilters,
  MemoViewResult,
  SourceType,
} from "./dataTypes";

interface FlatMarker {
  marker: BaseMarker;
  engineType: EngineType;
  source: SourceType;
  fileId: string;
}

/** Flat list of all markers across all engines, with engineType anotado. */
function flattenMarkers(allData: AllEngineData): FlatMarker[] {
  const out: FlatMarker[] = [];
  for (const [fileId, markers] of Object.entries(allData.markdown.markers)) {
    for (const m of markers) out.push({ marker: m as any, engineType: "markdown", source: "markdown", fileId });
  }
  for (const m of allData.pdf.markers) out.push({ marker: m as any, engineType: "pdf", source: "pdf", fileId: (m as any).fileId });
  for (const m of allData.image.markers) out.push({ marker: m as any, engineType: "image", source: "image", fileId: (m as any).fileId });
  for (const m of allData.csv.segmentMarkers) out.push({ marker: m as any, engineType: "csv", source: "csv-segment", fileId: (m as any).fileId });
  for (const m of allData.csv.rowMarkers) out.push({ marker: m as any, engineType: "csv", source: "csv-row", fileId: (m as any).fileId });
  for (const f of allData.audio.files) {
    for (const m of f.markers) out.push({ marker: m as any, engineType: "audio", source: "audio", fileId: f.fileId });
  }
  for (const f of allData.video.files) {
    for (const m of f.markers) out.push({ marker: m as any, engineType: "video", source: "video", fileId: f.fileId });
  }
  return out;
}

/** Local filter helper — paralelo a applyFilters mas opera em FlatMarker (preserva memo + relations completas). */
function applyMemoFilters(
  flat: FlatMarker[],
  filters: MemoViewFilters,
): FlatMarker[] {
  const groupMemberSet = filters.groupFilter ? new Set(filters.groupFilter.memberCodeIds) : null;
  return flat.filter(({ marker, source, fileId }) => {
    if (!filters.sources.includes(source)) return false;
    const codeIds = marker.codes.map((c: CodeApplication) => c.codeId);
    if (filters.codes.length > 0 && !codeIds.some((id) => filters.codes.includes(id))) return false;
    if (filters.excludeCodes.length > 0 && codeIds.every((id) => filters.excludeCodes.includes(id))) return false;
    if (groupMemberSet && !codeIds.some((id) => groupMemberSet.has(id))) return false;
    // caseVariableFilter: sem registry aqui, só validar shape (sem registry = sem variable check)
    return true;
  });
}

function nonEmpty(s: string | undefined | null): boolean {
  return !!s && s.trim().length > 0;
}

function computeCoverage(
  allData: AllEngineData,
  registry: CodeDefinitionRegistry,
  filteredFlat: FlatMarker[],
): CoverageStats {
  const allCodes = registry.getAllCodes();
  const allGroups = registry.getAllGroups();

  let relationsTotal = 0;
  let relationsWithMemo = 0;
  for (const c of allCodes) {
    for (const r of c.relations ?? []) {
      relationsTotal++;
      if (nonEmpty(r.memo)) relationsWithMemo++;
    }
  }
  for (const { marker } of filteredFlat) {
    for (const ca of marker.codes ?? []) {
      for (const r of ca.relations ?? []) {
        relationsTotal++;
        if (nonEmpty(r.memo)) relationsWithMemo++;
      }
    }
  }

  return {
    codesTotal: allCodes.length,
    codesWithMemo: allCodes.filter((c) => nonEmpty(c.memo)).length,
    groupsTotal: allGroups.length,
    groupsWithMemo: allGroups.filter((g) => nonEmpty(g.memo)).length,
    relationsTotal,
    relationsWithMemo,
    markersTotal: filteredFlat.length,
    markersWithMemo: filteredFlat.filter(({ marker }) => nonEmpty(marker.memo)).length,
  };
}

export function aggregateMemos(
  allData: AllEngineData,
  registry: CodeDefinitionRegistry,
  filters: MemoViewFilters,
): MemoViewResult {
  const flat = flattenMarkers(allData);
  const filtered = applyMemoFilters(flat, filters);
  const coverage = computeCoverage(allData, registry, filtered);

  return {
    groupBy: filters.groupBy,
    coverage,
    byCode: filters.groupBy === "code" ? [] : undefined,
    byFile: filters.groupBy === "file" ? [] : undefined,
  };
}
```

- [ ] **Step 1.4.2: Rodar tests de coverage**

```bash
npm run test -- --run memoView.test 2>&1 | tail -20
```

Expected: 4 tests pass.

- [ ] **Step 1.4.3: Commit**

```bash
git add src/analytics/data/memoView.ts src/analytics/data/dataTypes.ts src/analytics/data/__tests__/memoView.test.ts
~/.claude/scripts/commit.sh "feat(analytics): tipos memoView + aggregateMemos coverage stats"
```

### Task 1.5: Tests + impl by-code pivot

**Files:**
- Modify: `src/analytics/data/__tests__/memoView.test.ts`
- Modify: `src/analytics/data/memoView.ts`

- [ ] **Step 1.5.1: Adicionar tests de by-code pivot**

```typescript
describe("aggregateMemos — by code", () => {
  it("returns CodeMemoSection per code with memo", () => {
    const reg = makeRegistry({ codes: [
      { name: "A", memo: "memo A" },
      { name: "B" },
    ]});
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    expect(r.byCode).toBeDefined();
    expect(r.byCode!.length).toBe(1); // só A tem memo, B não tem
    expect(r.byCode![0]!.codeName).toBe("A");
    expect(r.byCode![0]!.codeMemo).toBe("memo A");
    expect(r.byCode![0]!.depth).toBe(0);
  });

  it("includes group memos for code's groups", () => {
    const reg = makeRegistry({
      codes: [{ name: "A", memo: "x" }],
      groups: [{ id: "g1", name: "G1", memo: "g memo", codeIds: [] }],
    });
    reg.addCodeToGroup(reg.getByName("A")!.id, reg.getGroupByName("G1")!.id);
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    expect(r.byCode![0]!.groupMemos.length).toBe(1);
    const gm = r.byCode![0]!.groupMemos[0]!;
    expect(gm.kind).toBe("group");
    if (gm.kind === "group") expect(gm.memo).toBe("g memo");
  });

  it("includes code-level relation memos", () => {
    const reg = makeRegistry({ codes: [
      { name: "A", relations: [{ label: "causes", target: "B", memo: "rel memo" }] },
      { name: "B" },
    ]});
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    expect(r.byCode![0]!.relationMemos.length).toBe(1);
    const rm = r.byCode![0]!.relationMemos[0]!;
    if (rm.kind === "relation") {
      expect(rm.level).toBe("code");
      expect(rm.memo).toBe("rel memo");
    }
  });

  it("includes app-level relation memos via marker", () => {
    const reg = makeRegistry({ codes: [{ name: "A", memo: "x" }, { name: "B" }] });
    const aId = reg.getByName("A")!.id;
    const allData = makeAllData({
      markdownMarkers: [{
        id: "m1", fileId: "P01.md",
        codes: [{ codeId: aId, relations: [{ label: "x", target: "B", directed: true, memo: "app memo" }] }],
      } as any],
    });
    const r = aggregateMemos(allData, reg, baseFilters);
    const rels = r.byCode![0]!.relationMemos;
    expect(rels.length).toBe(1);
    if (rels[0]!.kind === "relation") {
      expect(rels[0]!.level).toBe("application");
      expect(rels[0]!.markerId).toBe("m1");
    }
  });

  it("includes marker memos for code", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }] });
    const aId = reg.getByName("A")!.id;
    const allData = makeAllData({
      markdownMarkers: [
        { id: "m1", fileId: "P01.md", codes: [{ codeId: aId }], memo: "marker 1" } as any,
        { id: "m2", fileId: "P01.md", codes: [{ codeId: aId }] } as any, // no memo
      ],
    });
    const r = aggregateMemos(allData, reg, baseFilters);
    expect(r.byCode!.length).toBe(1);
    expect(r.byCode![0]!.markerMemos.length).toBe(1);
    if (r.byCode![0]!.markerMemos[0]!.kind === "marker") {
      expect(r.byCode![0]!.markerMemos[0]!.memo).toBe("marker 1");
    }
  });
});
```

- [ ] **Step 1.5.2: Rodar tests pra ver falhas**

```bash
npm run test -- --run memoView.test 2>&1 | tail -20
```

Expected: novos tests fail (byCode = [] no impl atual).

- [ ] **Step 1.5.3: Implementar by-code pivot em `memoView.ts`**

Substitui o `byCode: filters.groupBy === "code" ? [] : undefined,` no return de `aggregateMemos` por chamada a um helper novo:

```typescript
// Adiciona helper antes de aggregateMemos:

function buildByCode(
  registry: CodeDefinitionRegistry,
  filtered: FlatMarker[],
  filters: MemoViewFilters,
): CodeMemoSection[] {
  const sections: CodeMemoSection[] = [];
  // Ordem flat via buildFlatTree (todos expandidos pra Memo View)
  const allCodes = registry.getAllCodes();
  const allFolders = registry.getAllFolders ? registry.getAllFolders() : [];
  const expanded = {
    codes: new Set(allCodes.map((c) => c.id)),
    folders: new Set(allFolders.map((f) => f.id)),
  };
  // Import lazy pra não criar circular dep
  const { buildFlatTree } = require("../../core/hierarchyHelpers");
  const flatNodes = buildFlatTree(registry, expanded);

  for (const node of flatNodes) {
    if (node.type !== "code") continue;
    const def = node.def;
    const groupsForCode = registry.getGroupsForCode(def.id);
    const groupIds = groupsForCode.map((g) => g.id);

    const codeMemo = nonEmpty(def.memo) ? def.memo!.trim() : null;

    const groupMemos: MemoEntry[] = groupsForCode
      .filter((g) => nonEmpty(g.memo))
      .map((g) => ({ kind: "group" as const, groupId: g.id, groupName: g.name, color: g.color, memo: g.memo!.trim() }));

    const relationMemos: MemoEntry[] = [];
    for (const r of def.relations ?? []) {
      if (nonEmpty(r.memo)) {
        const target = registry.getById(r.target);
        relationMemos.push({
          kind: "relation",
          codeId: def.id,
          label: r.label,
          targetId: r.target,
          targetName: target?.name ?? r.target,
          directed: r.directed ?? true,
          memo: r.memo!.trim(),
          level: "code",
        });
      }
    }

    // Decisão (iv): marker aparece sob primeira entry de marker.codes que sobrevive ao filtro
    const acceptCode = (id: string) => filters.codes.length === 0 || filters.codes.includes(id);
    const markersForThisCode = filtered.filter(({ marker }) => {
      const surviving = marker.codes.find((c: CodeApplication) => acceptCode(c.codeId));
      return surviving?.codeId === def.id;
    });

    // App-level relations: dos markers desse código, pra cada CodeApplication.relations[] com memo
    for (const fm of markersForThisCode) {
      for (const ca of fm.marker.codes) {
        if (ca.codeId !== def.id) continue;
        for (const r of ca.relations ?? []) {
          if (nonEmpty(r.memo)) {
            const target = registry.getById(r.target);
            relationMemos.push({
              kind: "relation",
              codeId: def.id,
              label: r.label,
              targetId: r.target,
              targetName: target?.name ?? r.target,
              directed: r.directed ?? true,
              memo: r.memo!.trim(),
              level: "application",
              markerId: fm.marker.id,
            });
          }
        }
      }
    }

    const markerMemos: MemoEntry[] = markersForThisCode
      .filter(({ marker }) => nonEmpty(marker.memo))
      .map(({ marker, source, fileId }) => {
        const ca = marker.codes.find((c: CodeApplication) => c.codeId === def.id)!;
        return {
          kind: "marker" as const,
          markerId: marker.id,
          codeId: def.id,
          fileId,
          sourceType: source.startsWith("csv") ? "csv" : (source as EngineType),
          excerpt: extractExcerpt(marker, source),
          memo: marker.memo!.trim(),
          magnitude: ca.magnitude,
        };
      });

    // Aplicar showTypes
    const cm = filters.showTypes.code ? codeMemo : null;
    const gms = filters.showTypes.group ? groupMemos : [];
    const rms = filters.showTypes.relation ? relationMemos : [];
    const mms = filters.showTypes.marker ? markerMemos : [];

    const hasOwnMemo = !!cm || gms.length > 0 || rms.length > 0 || mms.length > 0;
    if (!hasOwnMemo) continue; // hasAnyMemoInSubtree é tratado em Task 1.6 (hierarchy)

    sections.push({
      codeId: def.id,
      codeName: def.name,
      color: def.color,
      depth: node.depth,
      groupIds,
      codeMemo: cm,
      groupMemos: gms,
      relationMemos: rms,
      markerMemos: mms,
      childIds: [],
      hasAnyMemoInSubtree: hasOwnMemo,
    });
  }

  return sections;
}

function extractExcerpt(marker: BaseMarker, source: SourceType): string {
  // Por engine: marker tem campos diferentes pra excerpt textual.
  // Generic fallback: tenta `text`, depois `excerpt`, senão "(no excerpt)".
  const m = marker as any;
  return m.text ?? m.excerpt ?? m.commentText ?? "(no excerpt)";
}
```

E atualiza o return:

```typescript
  return {
    groupBy: filters.groupBy,
    coverage,
    byCode: filters.groupBy === "code" ? buildByCode(registry, filtered, filters) : undefined,
    byFile: filters.groupBy === "file" ? [] : undefined, // task 1.7
  };
```

- [ ] **Step 1.5.4: Rodar tests**

```bash
npm run test -- --run memoView.test 2>&1 | tail -30
```

Expected: tests de by-code passam (5 novos). Caso buildFlatTree não aceite signature `(registry, expanded)` — verificar e ajustar import.

- [ ] **Step 1.5.5: Commit**

```bash
git add src/analytics/data/memoView.ts src/analytics/data/__tests__/memoView.test.ts
~/.claude/scripts/commit.sh "feat(analytics): aggregateMemos byCode pivot (code/group/relation/marker memos)"
```

### Task 1.6: Tests + impl hierarquia (hasAnyMemoInSubtree, childIds)

**Files:**
- Modify: `src/analytics/data/__tests__/memoView.test.ts`
- Modify: `src/analytics/data/memoView.ts`

- [ ] **Step 1.6.1: Tests de hierarquia**

```typescript
describe("aggregateMemos — hierarquia", () => {
  it("parent without memo + child with memo: parent appears as context", () => {
    const reg = makeRegistry({ codes: [
      { name: "P" },
      { name: "C", parentId: "P", memo: "child memo" },
    ]});
    // setParent precisa do id real, ajustar:
    reg.setParent(reg.getByName("C")!.id, reg.getByName("P")!.id);
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    const names = r.byCode!.map((s) => s.codeName);
    expect(names).toContain("P"); // pai aparece
    expect(names).toContain("C");
    const pSection = r.byCode!.find((s) => s.codeName === "P")!;
    expect(pSection.codeMemo).toBeNull();
    expect(pSection.hasAnyMemoInSubtree).toBe(true);
  });

  it("parent without memo + child without memo: neither appears", () => {
    const reg = makeRegistry({ codes: [{ name: "P" }, { name: "C" }] });
    reg.setParent(reg.getByName("C")!.id, reg.getByName("P")!.id);
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    expect(r.byCode!.length).toBe(0);
  });

  it("childIds populated correctly", () => {
    const reg = makeRegistry({ codes: [
      { name: "P", memo: "p" },
      { name: "C1", memo: "c1" },
      { name: "C2", memo: "c2" },
    ]});
    reg.setParent(reg.getByName("C1")!.id, reg.getByName("P")!.id);
    reg.setParent(reg.getByName("C2")!.id, reg.getByName("P")!.id);
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    const pSection = r.byCode!.find((s) => s.codeName === "P")!;
    expect(pSection.childIds).toEqual([reg.getByName("C1")!.id, reg.getByName("C2")!.id]);
  });
});
```

- [ ] **Step 1.6.2: Rodar tests**

Expected: 3 fails — atual impl não popula `childIds` nem inclui parents sem memo.

- [ ] **Step 1.6.3: Implementar hierarquia**

Modifica `buildByCode`:

```typescript
function buildByCode(
  registry: CodeDefinitionRegistry,
  filtered: FlatMarker[],
  filters: MemoViewFilters,
): CodeMemoSection[] {
  // ... (mesmo setup de antes até chegar no loop)

  // Primeira passada: monta sections "candidatas" (sem filtrar empty), e mapa de childIds direto da hierarquia
  const candidates = new Map<string, CodeMemoSection>();
  const childMap = new Map<string, string[]>(); // parentId → childIds

  for (const node of flatNodes) {
    if (node.type !== "code") continue;
    const def = node.def;
    if (def.parentId) {
      const arr = childMap.get(def.parentId) ?? [];
      arr.push(def.id);
      childMap.set(def.parentId, arr);
    }
    // ... (build groupIds, codeMemo, groupMemos, relationMemos, markerMemos, hasOwnMemo iguais)
    candidates.set(def.id, {
      codeId: def.id,
      codeName: def.name,
      color: def.color,
      depth: node.depth,
      groupIds,
      codeMemo: cm,
      groupMemos: gms,
      relationMemos: rms,
      markerMemos: mms,
      childIds: [],
      hasAnyMemoInSubtree: hasOwnMemo,
    });
  }

  // Popular childIds e calcular hasAnyMemoInSubtree (DFS bottom-up)
  for (const [parentId, kids] of childMap) {
    if (candidates.has(parentId)) {
      candidates.get(parentId)!.childIds = kids;
    }
  }

  // DFS bottom-up via ordem flatNodes reverse
  const reverseOrder = flatNodes.filter((n: any) => n.type === "code").reverse();
  for (const node of reverseOrder) {
    const sec = candidates.get(node.def.id)!;
    for (const childId of sec.childIds) {
      const childSec = candidates.get(childId);
      if (childSec?.hasAnyMemoInSubtree) {
        sec.hasAnyMemoInSubtree = true;
      }
    }
  }

  // Filtrar: section incluída se tem memo próprio OU subtree tem memo
  const result: CodeMemoSection[] = [];
  for (const node of flatNodes) {
    if (node.type !== "code") continue;
    const sec = candidates.get(node.def.id)!;
    const hasOwnMemo = !!sec.codeMemo || sec.groupMemos.length || sec.relationMemos.length || sec.markerMemos.length;
    if (hasOwnMemo || sec.hasAnyMemoInSubtree) {
      result.push(sec);
    }
  }
  return result;
}
```

NOTA: rejeitar a versão "antiga" do filtro `if (!hasOwnMemo) continue;` — passa a usar a passada com candidates.

- [ ] **Step 1.6.4: Rodar tests**

```bash
npm run test -- --run memoView.test 2>&1 | tail -20
```

Expected: 3 tests de hierarquia passam.

- [ ] **Step 1.6.5: Commit**

```bash
git add src/analytics/data/memoView.ts src/analytics/data/__tests__/memoView.test.ts
~/.claude/scripts/commit.sh "feat(analytics): hierarquia em aggregateMemos (hasAnyMemoInSubtree + childIds)"
```

### Task 1.7: Tests + impl by-file pivot

**Files:**
- Modify: `src/analytics/data/__tests__/memoView.test.ts`
- Modify: `src/analytics/data/memoView.ts`

- [ ] **Step 1.7.1: Tests de by-file**

```typescript
describe("aggregateMemos — by file", () => {
  it("groups markers by fileId", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }] });
    const aId = reg.getByName("A")!.id;
    const allData = makeAllData({
      markdownMarkers: [
        { id: "m1", fileId: "P01.md", codes: [{ codeId: aId }], memo: "x" } as any,
      ],
      pdfMarkers: [
        { id: "m2", fileId: "P02.pdf", codes: [{ codeId: aId }], memo: "y" } as any,
      ],
    });
    const r = aggregateMemos(allData, reg, { ...baseFilters, groupBy: "file" });
    expect(r.byFile).toBeDefined();
    expect(r.byFile!.length).toBe(2);
    const fileIds = r.byFile!.map((f) => f.fileId).sort();
    expect(fileIds).toEqual(["P01.md", "P02.pdf"]);
  });

  it("codeIdsUsed reúne todos os surviving codes", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }, { name: "B" }] });
    const aId = reg.getByName("A")!.id;
    const bId = reg.getByName("B")!.id;
    const allData = makeAllData({
      markdownMarkers: [
        { id: "m1", fileId: "P01.md", codes: [{ codeId: aId }, { codeId: bId }], memo: "x" } as any,
      ],
    });
    const r = aggregateMemos(allData, reg, { ...baseFilters, groupBy: "file" });
    expect(r.byFile![0]!.codeIdsUsed.sort()).toEqual([aId, bId].sort());
  });

  it("filters out files without marker memos", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }] });
    const aId = reg.getByName("A")!.id;
    const allData = makeAllData({
      markdownMarkers: [
        { id: "m1", fileId: "P01.md", codes: [{ codeId: aId }] /* no memo */ } as any,
      ],
    });
    const r = aggregateMemos(allData, reg, { ...baseFilters, groupBy: "file" });
    expect(r.byFile!.length).toBe(0);
  });
});
```

- [ ] **Step 1.7.2: Rodar — falhas esperadas**

```bash
npm run test -- --run memoView.test 2>&1 | tail -20
```

- [ ] **Step 1.7.3: Implementar by-file**

```typescript
function buildByFile(
  filtered: FlatMarker[],
  filters: MemoViewFilters,
): FileMemoSection[] {
  if (!filters.showTypes.marker) return [];
  const byFile = new Map<string, FlatMarker[]>();
  for (const fm of filtered) {
    const arr = byFile.get(fm.fileId) ?? [];
    arr.push(fm);
    byFile.set(fm.fileId, arr);
  }
  const sections: FileMemoSection[] = [];
  for (const [fileId, fms] of byFile) {
    const withMemo = fms.filter(({ marker }) => nonEmpty(marker.memo));
    if (withMemo.length === 0) continue;
    const codeIdsUsed = Array.from(new Set(fms.flatMap((fm) => fm.marker.codes.map((c: CodeApplication) => c.codeId))));
    sections.push({
      fileId,
      sourceType: fms[0]!.engineType,
      fileName: fileId, // displayName resolution fica pro render
      codeIdsUsed,
      markerMemos: withMemo.map(({ marker, source, fileId: fid }) => {
        const ca = marker.codes[0]!;
        return {
          kind: "marker" as const,
          markerId: marker.id,
          codeId: ca.codeId,
          fileId: fid,
          sourceType: source.startsWith("csv") ? "csv" : (source as EngineType),
          excerpt: extractExcerpt(marker, source),
          memo: marker.memo!.trim(),
          magnitude: ca.magnitude,
        };
      }),
    });
  }
  sections.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return sections;
}
```

E no return de `aggregateMemos`:

```typescript
    byFile: filters.groupBy === "file" ? buildByFile(filtered, filters) : undefined,
```

- [ ] **Step 1.7.4: Rodar tests**

```bash
npm run test -- --run memoView.test 2>&1 | tail -20
```

Expected: 3 tests de by-file passam.

- [ ] **Step 1.7.5: Commit**

```bash
git add src/analytics/data/memoView.ts src/analytics/data/__tests__/memoView.test.ts
~/.claude/scripts/commit.sh "feat(analytics): aggregateMemos byFile pivot"
```

### Task 1.8: Tests + decisão (iv) marker em múltiplos códigos + showTypes

**Files:**
- Modify: `src/analytics/data/__tests__/memoView.test.ts`

- [ ] **Step 1.8.1: Tests adicionais (decisão iv + showTypes)**

```typescript
describe("aggregateMemos — decisão iv (marker em múltiplos códigos)", () => {
  it("marker appears once under first surviving code in array order", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }, { name: "B" }] });
    const aId = reg.getByName("A")!.id;
    const bId = reg.getByName("B")!.id;
    const allData = makeAllData({
      markdownMarkers: [
        { id: "m1", fileId: "P01.md", codes: [{ codeId: aId }, { codeId: bId }], memo: "x" } as any,
      ],
    });
    // No code filter: aId is first surviving
    const r1 = aggregateMemos(allData, reg, baseFilters);
    const aSec = r1.byCode!.find((s) => s.codeId === aId);
    const bSec = r1.byCode!.find((s) => s.codeId === bId);
    expect(aSec?.markerMemos.length).toBe(1);
    expect(bSec).toBeUndefined(); // B não aparece pq m1 vai pra A
  });

  it("with code filter excluding A, marker goes to B", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }, { name: "B" }] });
    const aId = reg.getByName("A")!.id;
    const bId = reg.getByName("B")!.id;
    const allData = makeAllData({
      markdownMarkers: [
        { id: "m1", fileId: "P01.md", codes: [{ codeId: aId }, { codeId: bId }], memo: "x" } as any,
      ],
    });
    const filtered = { ...baseFilters, codes: [bId] };
    const r = aggregateMemos(allData, reg, filtered);
    const bSec = r.byCode!.find((s) => s.codeId === bId);
    expect(bSec?.markerMemos.length).toBe(1);
  });
});

describe("aggregateMemos — showTypes filter", () => {
  it("showTypes.code=false zeros code memos", () => {
    const reg = makeRegistry({ codes: [{ name: "A", memo: "x" }] });
    const r = aggregateMemos(makeAllData(), reg, { ...baseFilters, showTypes: { code: false, group: true, relation: true, marker: true } });
    expect(r.byCode!.length).toBe(0); // sem outras memos = section sai
  });

  it("showTypes preserves coverage stats (totals absolute)", () => {
    const reg = makeRegistry({ codes: [{ name: "A", memo: "x" }] });
    const r = aggregateMemos(makeAllData(), reg, { ...baseFilters, showTypes: { code: false, group: false, relation: false, marker: false } });
    expect(r.coverage.codesTotal).toBe(1);
    expect(r.coverage.codesWithMemo).toBe(1);
  });
});
```

- [ ] **Step 1.8.2: Rodar tests** (já implementado em 1.5+1.7; deve passar)

```bash
npm run test -- --run memoView.test 2>&1 | tail -20
```

Expected: todos passam. Se algum falhar, ajustar `buildByCode` (decisão iv pode estar incorreta).

- [ ] **Step 1.8.3: Commit (smoke da chunk 1)**

```bash
git add src/analytics/data/__tests__/memoView.test.ts
~/.claude/scripts/commit.sh "test(analytics): cobre decisão iv + showTypes em aggregateMemos"

npm run test -- --run 2>&1 | tail -5
```

Expected: total tests = 2307 + ~20 (~2327). Sem regressão. tsc clean: `npx tsc --noEmit`.

---

## Chunk 2: MODE_REGISTRY hookup + render mínimo

**Goal:** mode `"memo-view"` aparece no dropdown do Analytics; abrir mostra coverage banner ainda sem memos. Não tem edição, hierarquia, filtros — só shell.

### Task 2.1: Adicionar `"memo-view"` em `ViewMode` e estado novo no context

**Files:**
- Modify: `src/analytics/views/analyticsViewContext.ts`

- [ ] **Step 2.1.1: Atualizar `ViewMode` e adicionar fields**

Em `analyticsViewContext.ts`:
- Adiciona `"memo-view"` no fim do union `ViewMode` (line ~10).
- Adiciona após o bloco `// Code × Metadata state`:

```typescript
  // Memo View state
  mvGroupBy: "code" | "file";
  mvShowTypes: { code: boolean; group: boolean; relation: boolean; marker: boolean };
  mvMarkerLimit: 5 | 10 | 25 | "all";
  mvExpanded: Set<string>; // codeIds com markers expandidos além do limit (volátil, por sessão)

  // Refresh suspend (5a)
  suspendRefresh(): void;
  resumeRefresh(): void;
```

- [ ] **Step 2.1.2: Verificar typecheck**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: erros nas implementações que ainda não populam esses campos. Vamos consertar em 2.2.

### Task 2.2: Inicializar fields no `analyticsView.ts` + suspend counter

**Files:**
- Modify: `src/analytics/views/analyticsView.ts`

- [ ] **Step 2.2.1: Adicionar fields private + métodos**

Em `analyticsView.ts`, dentro da classe `AnalyticsView`:

1. Adicionar campos private (perto dos outros estados):

```typescript
  private mvGroupBy: "code" | "file" = "code";
  private mvShowTypes = { code: true, group: true, relation: true, marker: true };
  private mvMarkerLimit: 5 | 10 | 25 | "all" = 10;
  private mvExpanded: Set<string> = new Set();
  private refreshSuspendedCount = 0;
```

2. Onde o context é construído (procurar pelo objeto literal que satisfaz `AnalyticsViewContext`), adicionar:

```typescript
    mvGroupBy: this.mvGroupBy,
    mvShowTypes: this.mvShowTypes,
    mvMarkerLimit: this.mvMarkerLimit,
    mvExpanded: this.mvExpanded,
    suspendRefresh: () => { this.refreshSuspendedCount++; },
    resumeRefresh: () => { this.refreshSuspendedCount = Math.max(0, this.refreshSuspendedCount - 1); },
```

3. Em `scheduleUpdate` (ou método análogo), adicionar guarda no início:

```typescript
    if (this.refreshSuspendedCount > 0) return;
```

Localização: procurar pela função que dispara re-render (`scheduleUpdate`, `requestUpdate`, etc.). Provavelmente já existe como parte do context. Ler o método inteiro antes de editar.

- [ ] **Step 2.2.2: Persistir mvGroupBy/mvShowTypes/mvMarkerLimit**

Procurar onde outros campos são persistidos (`saveData`/`loadData` do plugin via settings; provavelmente `cmDisplay`, `cmVariable`, etc. são salvos). Adicionar os 3 novos campos no mesmo lugar (mvExpanded NÃO persiste — volátil).

- [ ] **Step 2.2.3: tsc + tests**

```bash
npx tsc --noEmit 2>&1 | head -10
npm run test -- --run 2>&1 | tail -5
```

Expected: typecheck limpo, tests passam.

### Task 2.3: Criar `memoViewMode.ts` mínimo + scaffold dos arquivos

**Files:**
- Create: `src/analytics/views/modes/memoView/memoViewMode.ts`
- Create: `src/analytics/views/modes/memoView/renderCoverageBanner.ts`

- [ ] **Step 2.3.1: Coverage banner scaffold**

```typescript
// renderCoverageBanner.ts
import type { CoverageStats } from "../../../data/dataTypes";

export function renderCoverageBanner(parent: HTMLElement, coverage: CoverageStats): void {
  const banner = parent.createDiv({ cls: "memo-view-coverage-banner" });
  banner.createSpan({ text: `${coverage.codesWithMemo}/${coverage.codesTotal} codes` });
  banner.createSpan({ text: " · " });
  banner.createSpan({ text: `${coverage.groupsWithMemo}/${coverage.groupsTotal} groups` });
  banner.createSpan({ text: " · " });
  banner.createSpan({ text: `${coverage.relationsWithMemo}/${coverage.relationsTotal} relations` });
  banner.createSpan({ text: " · " });
  banner.createSpan({ text: `${coverage.markersWithMemo}/${coverage.markersTotal} markers` });
}
```

- [ ] **Step 2.3.2: memoViewMode mínimo**

```typescript
// memoViewMode.ts
import type { AnalyticsViewContext } from "../../analyticsViewContext";
import type { FilterConfig, MemoViewFilters } from "../../../data/dataTypes";
import { aggregateMemos } from "../../../data/memoView";
import { readAllData } from "../../../data/dataReader";
import { renderCoverageBanner } from "./renderCoverageBanner";

export function renderMemoView(ctx: AnalyticsViewContext, filters: FilterConfig): void {
  const container = ctx.chartContainer;
  if (!container) return;
  container.empty();

  const allData = readAllData(ctx.plugin.dataManager);
  const memoFilters: MemoViewFilters = {
    ...filters,
    showTypes: ctx.mvShowTypes,
    groupBy: ctx.mvGroupBy,
    markerLimit: ctx.mvMarkerLimit,
  };
  const result = aggregateMemos(allData, ctx.plugin.registry, memoFilters);

  const wrapper = container.createDiv({ cls: "memo-view-wrapper" });
  renderCoverageBanner(wrapper, result.coverage);

  // Empty state mínimo
  const total = result.coverage.codesWithMemo + result.coverage.groupsWithMemo +
                result.coverage.relationsWithMemo + result.coverage.markersWithMemo;
  if (total === 0) {
    wrapper.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
      text: "No memos yet. Add memos in Code Detail, Group panel, or marker context to see them here.",
    });
    return;
  }

  // Sections render — placeholder. Próxima chunk popula.
  if (result.byCode) {
    for (const sec of result.byCode) {
      const sectionEl = wrapper.createDiv({ cls: "memo-view-code-section" });
      sectionEl.createEl("h3", { text: sec.codeName });
    }
  }
}

export function renderMemoViewOptions(_ctx: AnalyticsViewContext): void {
  // Próxima chunk
}
```

- [ ] **Step 2.3.3: Garantir que `ctx.plugin.dataManager` está exposto em `AnalyticsPluginAPI`**

```bash
grep -n "dataManager" /Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding/src/analytics/index.ts
```

Se não existir: adicionar `dataManager: DataManager` ao tipo `AnalyticsPluginAPI` e ao objeto exposto. (Provavelmente já existe via outras views — verificar.)

### Task 2.4: Registrar mode no `MODE_REGISTRY`

**Files:**
- Modify: `src/analytics/views/modes/modeRegistry.ts`

- [ ] **Step 2.4.1: Adicionar import + entry**

Topo do arquivo (junto dos outros imports):

```typescript
import { renderMemoView, renderMemoViewOptions } from "./memoView/memoViewMode";
```

Final do `MODE_REGISTRY`:

```typescript
  "memo-view": {
    label: "Memo View",
    render: renderMemoView,
    renderOptions: renderMemoViewOptions,
    canExport: false, // exports vêm em chunks 8 e 9
  },
```

- [ ] **Step 2.4.2: Build + smoke**

```bash
npm run build 2>&1 | tail -10
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

Expected: build limpo. Abrir vault `obsidian-plugins-workbench/` no Obsidian, abrir Analytics → no dropdown deve aparecer "Memo View". Click → empty state ou mostra coverage banner zerado.

- [ ] **Step 2.4.3: Commit**

```bash
git add -p src/analytics/views/analyticsViewContext.ts src/analytics/views/analyticsView.ts \
        src/analytics/views/modes/memoView/ src/analytics/views/modes/modeRegistry.ts
git status
~/.claude/scripts/commit.sh "feat(analytics): registra mode memo-view + coverage banner mínimo"
```

---

## Chunk 3: Render full read-only (code/group/relation/marker memos)

**Goal:** render completo das 4 entidades sem hierarquia/edição. Smoke: vault com memos mostra tudo.

### Task 3.1: `renderMarkerCard.ts`

**Files:**
- Create: `src/analytics/views/modes/memoView/renderMarkerCard.ts`

- [ ] **Step 3.1.1: Implementar card read-only**

```typescript
import type { App } from "obsidian";
import type { MemoEntry } from "../../../data/dataTypes";

export interface MarkerCardOptions {
  app: App;
  onSourceClick?: (markerId: string, fileId: string) => void;
}

export function renderMarkerCard(parent: HTMLElement, entry: MemoEntry, opts: MarkerCardOptions): void {
  if (entry.kind !== "marker") return;
  const card = parent.createDiv({ cls: "memo-view-marker-card" });

  const header = card.createDiv({ cls: "memo-view-marker-header" });
  const sourceChip = header.createSpan({ cls: "memo-view-source-chip" });
  sourceChip.createSpan({ text: `(${entry.fileId} · ${entry.sourceType})` });
  if (opts.onSourceClick) {
    sourceChip.style.cursor = "pointer";
    sourceChip.addEventListener("click", () => opts.onSourceClick?.(entry.markerId, entry.fileId));
  }

  const excerpt = entry.excerpt.length > 500 ? entry.excerpt.slice(0, 500) + " …" : entry.excerpt;
  const excerptEl = card.createDiv({ cls: "memo-view-excerpt" });
  if (excerpt === "(no excerpt)" || excerpt.trim() === "") {
    excerptEl.createEl("em", { text: "(empty excerpt)", cls: "memo-view-excerpt-empty" });
  } else {
    excerptEl.createEl("blockquote", { text: excerpt });
  }

  const memoEl = card.createDiv({ cls: "memo-view-marker-memo" });
  memoEl.createEl("p", { text: entry.memo });
}
```

### Task 3.2: `renderCodeSection.ts`

**Files:**
- Create: `src/analytics/views/modes/memoView/renderCodeSection.ts`

- [ ] **Step 3.2.1: Implementar render seção code**

```typescript
import type { App } from "obsidian";
import type { CodeMemoSection, MemoEntry } from "../../../data/dataTypes";
import { renderMarkerCard } from "./renderMarkerCard";

export interface CodeSectionOptions {
  app: App;
  markerLimit: 5 | 10 | 25 | "all";
  expanded: Set<string>;
  onToggleExpand: (codeId: string) => void;
}

export function renderCodeSection(
  parent: HTMLElement,
  section: CodeMemoSection,
  opts: CodeSectionOptions,
): void {
  const sec = parent.createDiv({ cls: "memo-view-code-section" });
  sec.style.paddingLeft = `${Math.min(section.depth * 16, 80)}px`;

  // Header
  const header = sec.createDiv({ cls: "memo-view-code-header" });
  const colorDot = header.createSpan({ cls: "memo-view-color-dot" });
  colorDot.style.background = section.color;
  colorDot.style.display = "inline-block";
  colorDot.style.width = "10px";
  colorDot.style.height = "10px";
  colorDot.style.borderRadius = "50%";
  colorDot.style.marginRight = "6px";
  header.createSpan({ cls: "memo-view-code-name", text: section.codeName });

  if (section.groupIds.length > 0) {
    const chips = header.createDiv({ cls: "memo-view-group-chips" });
    for (const gid of section.groupIds) {
      chips.createSpan({ cls: "memo-view-group-chip", text: gid }); // gid placeholder; resolveremos via registry no contexto se necessário
    }
  }

  // Code memo
  if (section.codeMemo) {
    const codeMemoBlock = sec.createDiv({ cls: "memo-view-code-memo" });
    codeMemoBlock.createEl("strong", { text: "Code memo:" });
    codeMemoBlock.createEl("p", { text: section.codeMemo });
  }

  // Group memos
  if (section.groupMemos.length > 0) {
    const block = sec.createDiv({ cls: "memo-view-group-memos" });
    block.createEl("strong", { text: "Group memos:" });
    for (const gm of section.groupMemos) {
      if (gm.kind !== "group") continue;
      const row = block.createDiv({ cls: "memo-view-group-memo-row" });
      row.createSpan({ cls: "memo-view-group-memo-name", text: gm.groupName + ": " });
      row.createSpan({ text: gm.memo });
    }
  }

  // Relation memos
  if (section.relationMemos.length > 0) {
    const block = sec.createDiv({ cls: "memo-view-relation-memos" });
    block.createEl("strong", { text: "Relations:" });
    for (const rm of section.relationMemos) {
      if (rm.kind !== "relation") continue;
      const row = block.createDiv({ cls: "memo-view-relation-row" });
      const arrow = rm.directed ? "→" : "↔";
      const levelTag = rm.level === "code" ? "(code-level)" : `(app-level, ${rm.markerId})`;
      row.createSpan({ text: `${arrow} ${rm.label} "${rm.targetName}" ${levelTag}: ${rm.memo}` });
    }
  }

  // Marker memos
  if (section.markerMemos.length > 0) {
    const block = sec.createDiv({ cls: "memo-view-marker-memos" });
    const isExpanded = opts.expanded.has(section.codeId) || opts.markerLimit === "all";
    const limit = isExpanded ? section.markerMemos.length : (typeof opts.markerLimit === "number" ? opts.markerLimit : section.markerMemos.length);
    const visible = section.markerMemos.slice(0, limit);
    const remaining = section.markerMemos.length - limit;

    block.createEl("strong", { text: `Marker memos (${section.markerMemos.length}):` });
    for (const mm of visible) {
      renderMarkerCard(block, mm, { app: opts.app });
    }
    if (remaining > 0) {
      const btn = block.createEl("button", { text: `Show ${remaining} more`, cls: "memo-view-show-more" });
      btn.addEventListener("click", () => opts.onToggleExpand(section.codeId));
    }
  }
}
```

### Task 3.3: Atualizar `memoViewMode.ts` pra usar `renderCodeSection`

**Files:**
- Modify: `src/analytics/views/modes/memoView/memoViewMode.ts`

- [ ] **Step 3.3.1: Substituir o placeholder**

```typescript
import { renderCodeSection } from "./renderCodeSection";
// ...

  if (result.byCode) {
    for (const sec of result.byCode) {
      renderCodeSection(wrapper, sec, {
        app: ctx.plugin.app,
        markerLimit: ctx.mvMarkerLimit,
        expanded: ctx.mvExpanded,
        onToggleExpand: (codeId) => {
          if (ctx.mvExpanded.has(codeId)) ctx.mvExpanded.delete(codeId);
          else ctx.mvExpanded.add(codeId);
          ctx.scheduleUpdate();
        },
      });
    }
  }
```

NOTA: `ctx.plugin.app` precisa existir em `AnalyticsPluginAPI`. Verificar e adicionar se faltar.

### Task 3.4: Resolução de `groupName` no chip + CSS básico

**Files:**
- Modify: `src/analytics/views/modes/memoView/renderCodeSection.ts`
- Modify: `styles.css`

- [ ] **Step 3.4.1: Atualizar `CodeSectionOptions` pra receber resolver de groupName**

```typescript
export interface CodeSectionOptions {
  app: App;
  markerLimit: 5 | 10 | 25 | "all";
  expanded: Set<string>;
  onToggleExpand: (codeId: string) => void;
  resolveGroupName: (groupId: string) => string;
}
```

E na renderização do chip:
```typescript
chips.createSpan({ cls: "memo-view-group-chip", text: opts.resolveGroupName(gid) });
```

E em `memoViewMode.ts`:
```typescript
resolveGroupName: (gid) => ctx.plugin.registry.getGroupById(gid)?.name ?? gid,
```

- [ ] **Step 3.4.2: CSS scaffold em `styles.css`**

Adiciona no fim do `styles.css`:

```css
/* ─── Memo View ─── */
.memo-view-wrapper { padding: 12px; max-width: 900px; margin: 0 auto; }
.memo-view-coverage-banner {
  padding: 8px 12px; background: var(--background-secondary);
  border-radius: 4px; margin-bottom: 16px; font-size: 13px;
  color: var(--text-muted);
}
.memo-view-code-section {
  padding: 12px 0; border-bottom: 1px solid var(--background-modifier-border);
}
.memo-view-code-header { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.memo-view-code-name { font-weight: 600; }
.memo-view-group-chips { display: flex; gap: 4px; }
.memo-view-group-chip {
  padding: 2px 6px; background: var(--background-modifier-hover);
  border-radius: 3px; font-size: 11px;
}
.memo-view-code-memo, .memo-view-group-memos, .memo-view-relation-memos, .memo-view-marker-memos {
  margin: 8px 0;
}
.memo-view-marker-card {
  padding: 8px; margin: 8px 0; background: var(--background-secondary);
  border-radius: 4px; border-left: 3px solid var(--text-accent);
}
.memo-view-source-chip { color: var(--text-muted); font-size: 12px; }
.memo-view-excerpt blockquote { margin: 4px 0; font-size: 12px; color: var(--text-muted); }
.memo-view-excerpt-empty { font-size: 11px; color: var(--text-faint); }
.memo-view-show-more {
  margin: 4px 0; padding: 4px 8px; cursor: pointer;
  background: var(--interactive-normal); border: 1px solid var(--background-modifier-border);
  border-radius: 3px;
}
```

- [ ] **Step 3.4.3: Build + smoke**

```bash
npm run build 2>&1 | tail -5
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

Vault `obsidian-plugins-workbench/`: criar 1 code com memo, 1 group com memo + atribuir code, 1 relation com memo no code, 1 marker com memo. Abrir Analytics → Memo View. Validar: 4 elementos visíveis.

- [ ] **Step 3.4.4: Commit**

```bash
~/.claude/scripts/commit.sh "feat(analytics): render memo view read-only (4 entidades)"
```

---

## Chunk 4: Hierarquia indentada + collapse "Show N more"

**Goal:** códigos filhos indentam, parent sem memo aparece como contexto, "Show N more" funciona.

### Task 4.1: Tests UI de hierarquia + collapse

**Files:**
- Create: `src/analytics/views/modes/memoView/__tests__/memoViewMode.test.ts`

- [ ] **Step 4.1.1: Setup mínimo de DOM test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderMemoView } from "../memoViewMode";
import type { AnalyticsViewContext } from "../../../analyticsViewContext";

function makeCtx(overrides?: Partial<AnalyticsViewContext>): AnalyticsViewContext {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const ctx = {
    plugin: {
      app: {} as any,
      registry: { /* ...resolver getGroupById */ } as any,
      caseVariablesRegistry: {} as any,
      dataManager: { getAll: () => ({}), section: () => ({}) } as any,
    } as any,
    chartContainer: container,
    configPanelEl: null,
    footerEl: null,
    mvGroupBy: "code",
    mvShowTypes: { code: true, group: true, relation: true, marker: true },
    mvMarkerLimit: 10 as const,
    mvExpanded: new Set<string>(),
    suspendRefresh: vi.fn(),
    resumeRefresh: vi.fn(),
    scheduleUpdate: vi.fn(),
    buildFilterConfig: () => ({ sources: ["markdown","csv-segment","csv-row","image","pdf","audio","video"], codes: [], excludeCodes: [], minFrequency: 0 }),
    isRenderCurrent: () => true,
    renderConfigPanel: vi.fn(),
    ...overrides,
  } as any;
  return ctx;
}

describe("renderMemoView — UI", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("renders empty state when no memos", () => {
    const ctx = makeCtx();
    // mock readAllData / aggregateMemos to return zeros
    // ... (implementação completa: spyOn(...).mockReturnValue(...))
  });
});
```

NOTA: pra essa chunk, foco maior em smoke manual. Tests UI vão crescendo conforme features. Manter o arquivo mínimo agora.

### Task 4.2: Implementar hierarquia visual

A `renderCodeSection` já aplica `padding-left` por depth. O que falta é:
- Pais sem memo aparecerem com header colapsado.

- [ ] **Step 4.2.1: Tratar pai sem memo no `renderCodeSection.ts`**

No início da função:

```typescript
const isHollowContext = !section.codeMemo && section.groupMemos.length === 0
  && section.relationMemos.length === 0 && section.markerMemos.length === 0
  && section.hasAnyMemoInSubtree;

const sec = parent.createDiv({ cls: isHollowContext ? "memo-view-code-section memo-view-hollow" : "memo-view-code-section" });
```

E pra hollow, só renderiza header (early return após o header).

- [ ] **Step 4.2.2: CSS pra hollow**

```css
.memo-view-hollow { opacity: 0.6; padding: 4px 0; }
.memo-view-hollow .memo-view-code-header { font-size: 12px; }
```

- [ ] **Step 4.2.3: Smoke + commit**

```bash
npm run build 2>&1 | tail -5
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

Vault: criar pai sem memo + filho com memo. Validar: pai aparece em hollow style, filho indentado abaixo.

```bash
~/.claude/scripts/commit.sh "feat(analytics): hierarquia indentada + hollow context pra parents sem memo"
```

### Task 4.3: Validar "Show N more" via smoke manual

- [ ] **Step 4.3.1: Smoke**

Vault: criar code com 15 markers (memos diferentes). markerLimit default = 10. Abrir Memo View → ver 10 markers + botão "Show 5 more". Click → expande.

```bash
npm run test -- --run 2>&1 | tail -5
```

Expected: tests passam (regressão).

---

## Chunk 5a: Infra de edição (suspendRefresh + DataManager.findMarker + setApplicationRelationMemo)

**Goal:** APIs prontas pra UI usar em 5b. Sem mudança visual. Tests unitários nas 3 novas APIs.

### Task 5a.1: `DataManager.findMarker`

**Files:**
- Modify: `src/core/dataManager.ts`
- Create: `src/core/__tests__/dataManager.findMarker.test.ts`

- [ ] **Step 5a.1.1: Test failing pra findMarker**

```typescript
// dataManager.findMarker.test.ts
import { describe, it, expect, vi } from "vitest";
import { DataManager } from "../dataManager";

function makeDataManager(initialData: any): DataManager {
  const plugin = { loadData: vi.fn().mockResolvedValue(initialData), saveData: vi.fn().mockResolvedValue(undefined) } as any;
  const dm = new DataManager(plugin);
  // hack pra setar dado direto (pula load):
  (dm as any).data = initialData;
  return dm;
}

describe("DataManager.findMarker", () => {
  it("finds marker in markdown", () => {
    const dm = makeDataManager({
      markdown: { markers: { "P01.md": [{ id: "m1", memo: "x" }] }, settings: {} },
      csv: { segmentMarkers: [], rowMarkers: [] },
      image: { markers: [], settings: {} },
      pdf: { markers: [], shapes: [], settings: {} },
      audio: { files: [], settings: {} },
      video: { files: [], settings: {} },
      registry: {},
      caseVariables: {},
      general: {},
    });
    const m = dm.findMarker("markdown", "m1");
    expect(m?.id).toBe("m1");
  });

  it("finds marker in csv segmentMarkers", () => {
    const dm = makeDataManager({
      markdown: { markers: {}, settings: {} },
      csv: { segmentMarkers: [{ id: "s1" }], rowMarkers: [] },
      image: { markers: [], settings: {} },
      pdf: { markers: [], shapes: [], settings: {} },
      audio: { files: [], settings: {} },
      video: { files: [], settings: {} },
      registry: {}, caseVariables: {}, general: {},
    });
    expect(dm.findMarker("csv", "s1")?.id).toBe("s1");
  });

  it("finds marker in csv rowMarkers", () => {
    const dm = makeDataManager({
      markdown: { markers: {}, settings: {} },
      csv: { segmentMarkers: [], rowMarkers: [{ id: "r1" }] },
      image: { markers: [], settings: {} },
      pdf: { markers: [], shapes: [], settings: {} },
      audio: { files: [], settings: {} },
      video: { files: [], settings: {} },
      registry: {}, caseVariables: {}, general: {},
    });
    expect(dm.findMarker("csv", "r1")?.id).toBe("r1");
  });

  it("finds marker in pdf", () => {
    const dm = makeDataManager({
      markdown: { markers: {}, settings: {} },
      csv: { segmentMarkers: [], rowMarkers: [] },
      image: { markers: [], settings: {} },
      pdf: { markers: [{ id: "p1" }], shapes: [], settings: {} },
      audio: { files: [], settings: {} },
      video: { files: [], settings: {} },
      registry: {}, caseVariables: {}, general: {},
    });
    expect(dm.findMarker("pdf", "p1")?.id).toBe("p1");
  });

  it("finds marker in audio file.markers", () => {
    const dm = makeDataManager({
      markdown: { markers: {}, settings: {} },
      csv: { segmentMarkers: [], rowMarkers: [] },
      image: { markers: [], settings: {} },
      pdf: { markers: [], shapes: [], settings: {} },
      audio: { files: [{ fileId: "f1", markers: [{ id: "a1" }] }], settings: {} },
      video: { files: [], settings: {} },
      registry: {}, caseVariables: {}, general: {},
    });
    expect(dm.findMarker("audio", "a1")?.id).toBe("a1");
  });

  it("returns null when not found", () => {
    const dm = makeDataManager({
      markdown: { markers: {}, settings: {} },
      csv: { segmentMarkers: [], rowMarkers: [] },
      image: { markers: [], settings: {} },
      pdf: { markers: [], shapes: [], settings: {} },
      audio: { files: [], settings: {} },
      video: { files: [], settings: {} },
      registry: {}, caseVariables: {}, general: {},
    });
    expect(dm.findMarker("markdown", "nope")).toBeNull();
  });

  it("returned reference allows in-place mutation", () => {
    const initial = {
      markdown: { markers: { "P01.md": [{ id: "m1", memo: "old" }] }, settings: {} },
      csv: { segmentMarkers: [], rowMarkers: [] },
      image: { markers: [], settings: {} },
      pdf: { markers: [], shapes: [], settings: {} },
      audio: { files: [], settings: {} },
      video: { files: [], settings: {} },
      registry: {}, caseVariables: {}, general: {},
    };
    const dm = makeDataManager(initial);
    const m = dm.findMarker("markdown", "m1") as any;
    m.memo = "new";
    expect((dm as any).data.markdown.markers["P01.md"][0].memo).toBe("new");
  });
});
```

- [ ] **Step 5a.1.2: Implementar `findMarker`**

Em `src/core/dataManager.ts`, adicionar import dos tipos no topo:

```typescript
import type { EngineType } from "../analytics/data/dataTypes";
import type { BaseMarker } from "./types";
```

E método na classe (após `clearAllSections`):

```typescript
  findMarker(engineType: EngineType, markerId: string): BaseMarker | null {
    const d = this.data as any;
    if (engineType === "markdown") {
      for (const fileId of Object.keys(d.markdown.markers)) {
        const found = d.markdown.markers[fileId].find((m: BaseMarker) => m.id === markerId);
        if (found) return found;
      }
      return null;
    }
    if (engineType === "csv") {
      const s = d.csv.segmentMarkers.find((m: BaseMarker) => m.id === markerId);
      if (s) return s;
      const r = d.csv.rowMarkers.find((m: BaseMarker) => m.id === markerId);
      return r ?? null;
    }
    if (engineType === "image") {
      return d.image.markers.find((m: BaseMarker) => m.id === markerId) ?? null;
    }
    if (engineType === "pdf") {
      return d.pdf.markers.find((m: BaseMarker) => m.id === markerId) ?? null;
    }
    if (engineType === "audio" || engineType === "video") {
      const collection = engineType === "audio" ? d.audio.files : d.video.files;
      for (const f of collection) {
        const m = (f.markers as BaseMarker[]).find((mk) => mk.id === markerId);
        if (m) return m;
      }
      return null;
    }
    return null;
  }
```

- [ ] **Step 5a.1.3: Tests**

```bash
npm run test -- --run dataManager.findMarker 2>&1 | tail -15
```

Expected: 7 tests pass.

- [ ] **Step 5a.1.4: Commit**

```bash
git add src/core/dataManager.ts src/core/__tests__/dataManager.findMarker.test.ts
~/.claude/scripts/commit.sh "feat(core): DataManager.findMarker pra acesso central a markers por engine"
```

### Task 5a.2: `setApplicationRelationMemo`

**Files:**
- Modify: `src/core/codeApplicationHelpers.ts`
- Create: `src/core/__tests__/codeApplicationHelpers.setApplicationRelationMemo.test.ts`

- [ ] **Step 5a.2.1: Test**

```typescript
import { describe, it, expect } from "vitest";
import { setApplicationRelationMemo } from "../codeApplicationHelpers";
import type { CodeApplication } from "../codeApplicationHelpers";

describe("setApplicationRelationMemo", () => {
  it("updates memo by tuple match", () => {
    const codes: CodeApplication[] = [
      { codeId: "c1", relations: [{ label: "x", target: "c2", directed: true }] },
    ];
    const ok = setApplicationRelationMemo(codes, "c1", "x", "c2", "new memo");
    expect(ok).toBe(true);
    expect(codes[0]!.relations![0]!.memo).toBe("new memo");
  });

  it("returns false if no match", () => {
    const codes: CodeApplication[] = [{ codeId: "c1", relations: [] }];
    expect(setApplicationRelationMemo(codes, "c1", "x", "y", "m")).toBe(false);
  });

  it("updates only first match (tuple duplicada)", () => {
    const codes: CodeApplication[] = [
      { codeId: "c1", relations: [
        { label: "x", target: "c2", directed: true, memo: "old1" },
        { label: "x", target: "c2", directed: true, memo: "old2" },
      ] },
    ];
    setApplicationRelationMemo(codes, "c1", "x", "c2", "new");
    expect(codes[0]!.relations![0]!.memo).toBe("new");
    expect(codes[0]!.relations![1]!.memo).toBe("old2");
  });
});
```

- [ ] **Step 5a.2.2: Impl em `codeApplicationHelpers.ts`**

```typescript
export function setApplicationRelationMemo(
  codes: CodeApplication[],
  codeId: string,
  label: string,
  target: string,
  memo: string,
): boolean {
  for (const ca of codes) {
    if (ca.codeId !== codeId) continue;
    for (const r of ca.relations ?? []) {
      if (r.label === label && r.target === target) {
        r.memo = memo;
        return true;
      }
    }
  }
  return false;
}
```

- [ ] **Step 5a.2.3: Tests + commit**

```bash
npm run test -- --run setApplicationRelationMemo 2>&1 | tail -10
git add src/core/codeApplicationHelpers.ts src/core/__tests__/codeApplicationHelpers.setApplicationRelationMemo.test.ts
~/.claude/scripts/commit.sh "feat(core): setApplicationRelationMemo helper pra app-level relation memo"
```

### Task 5a.3: suspendRefresh — verificar que já está in place + escrever teste

**Files:**
- Verify: `src/analytics/views/analyticsView.ts` + `analyticsViewContext.ts` (já feito em chunk 2)
- Create: test isolado se a implementação atual não tem cobertura

- [ ] **Step 5a.3.1: Test funcional do suspend counter**

Pode ser feito em `memoViewEdit.test.ts` mais tarde — verificar que `suspendRefresh()` incrementa counter e `scheduleUpdate()` é no-op enquanto > 0. Pra esta task, validar via smoke manual: criar mock no analyticsView e chamar.

- [ ] **Step 5a.3.2: Verificação manual**

Inspect `analyticsView.ts:scheduleUpdate` — confirma o early return.

- [ ] **Step 5a.3.3: Commit (se ajuste necessário)**

Se nada mudou: pular. Se ajustou: commit msg análoga.

```bash
npm run test -- --run 2>&1 | tail -3
```

Expected: 2307 + ~30 (tests acumulados das chunks 1+5a).

---

## Chunk 5b: Edição inline UI

**Goal:** textareas editáveis em todos os 4 (5 incluindo app-level relation) tipos de memo. Save debounced, suspendRefresh segura re-render durante typing.

### Task 5b.1: `renderMemoEditor.ts`

**Files:**
- Create: `src/analytics/views/modes/memoView/renderMemoEditor.ts`

- [ ] **Step 5b.1.1: Implementação**

```typescript
import type { AnalyticsViewContext } from "../../analyticsViewContext";

export function renderMemoEditor(
  parent: HTMLElement,
  initial: string,
  onSave: (value: string) => void,
  ctx: AnalyticsViewContext,
): HTMLTextAreaElement {
  const textarea = parent.createEl("textarea", { cls: "memo-view-editor" });
  textarea.value = initial;
  textarea.rows = Math.min(Math.max(2, initial.split("\n").length + 1), 10);

  let timeout: number | null = null;
  let suspended = false;

  const fireSave = () => {
    onSave(textarea.value);
    if (suspended) {
      ctx.resumeRefresh();
      suspended = false;
    }
    timeout = null;
  };

  textarea.addEventListener("input", () => {
    if (timeout) window.clearTimeout(timeout);
    if (!suspended) {
      ctx.suspendRefresh();
      suspended = true;
    }
    timeout = window.setTimeout(fireSave, 500);
  });

  textarea.addEventListener("blur", () => {
    if (timeout) {
      window.clearTimeout(timeout);
      fireSave();
    }
  });

  return textarea;
}
```

### Task 5b.2: onSave handlers (todos os 5 kinds)

**Files:**
- Create: `src/analytics/views/modes/memoView/onSaveHandlers.ts`

- [ ] **Step 5b.2.1: Implementar handlers**

```typescript
import type { AnalyticsViewContext } from "../../analyticsViewContext";
import type { EngineType } from "../../../data/dataTypes";
import { setApplicationRelationMemo } from "../../../../core/codeApplicationHelpers";

export function onSaveCodeMemo(ctx: AnalyticsViewContext, codeId: string, value: string): void {
  ctx.plugin.registry.update(codeId, { memo: value });
}

export function onSaveGroupMemo(ctx: AnalyticsViewContext, groupId: string, value: string): void {
  ctx.plugin.registry.setGroupMemo(groupId, value);
}

export function onSaveCodeRelationMemo(
  ctx: AnalyticsViewContext, codeId: string, label: string, target: string, value: string,
): void {
  ctx.plugin.registry.setRelationMemo(codeId, label, target, value);
}

export function onSaveMarkerMemo(
  ctx: AnalyticsViewContext, engineType: EngineType, markerId: string, value: string,
): void {
  const marker = ctx.plugin.dataManager.findMarker(engineType, markerId);
  if (!marker) return;
  marker.memo = value;
  ctx.plugin.dataManager.markDirty();
}

export function onSaveAppRelationMemo(
  ctx: AnalyticsViewContext, engineType: EngineType, markerId: string,
  codeId: string, label: string, target: string, value: string,
): void {
  const marker = ctx.plugin.dataManager.findMarker(engineType, markerId);
  if (!marker) return;
  setApplicationRelationMemo(marker.codes, codeId, label, target, value);
  ctx.plugin.dataManager.markDirty();
}
```

### Task 5b.3: Substituir `<p>` por editor em `renderCodeSection.ts`

**Files:**
- Modify: `src/analytics/views/modes/memoView/renderCodeSection.ts`
- Modify: `src/analytics/views/modes/memoView/renderMarkerCard.ts`

- [ ] **Step 5b.3.1: Adicionar `ctx` em `CodeSectionOptions`**

```typescript
export interface CodeSectionOptions {
  app: App;
  ctx: AnalyticsViewContext;
  markerLimit: 5 | 10 | 25 | "all";
  expanded: Set<string>;
  onToggleExpand: (codeId: string) => void;
  resolveGroupName: (groupId: string) => string;
}
```

- [ ] **Step 5b.3.2: Trocar `<p>` por `renderMemoEditor`**

Code memo:
```typescript
import { renderMemoEditor } from "./renderMemoEditor";
import { onSaveCodeMemo, onSaveGroupMemo, onSaveCodeRelationMemo, onSaveAppRelationMemo } from "./onSaveHandlers";

// substitui codeMemoBlock.createEl("p", { text: section.codeMemo });
renderMemoEditor(codeMemoBlock, section.codeMemo!, (v) => onSaveCodeMemo(opts.ctx, section.codeId, v), opts.ctx);
```

Group memos: cada row vira editor.
Relation memos: cada row vira editor.
- Code-level: `onSaveCodeRelationMemo(opts.ctx, rm.codeId, rm.label, rm.targetId, v)`
- App-level: `onSaveAppRelationMemo(opts.ctx, /* engineType from marker lookup */, rm.markerId!, rm.codeId, rm.label, rm.targetId, v)`. Pra obter engineType: passar via `MemoEntry` quando relation app-level (já tem `markerId` mas não tem `engineType` nem `sourceType`). Ajustar tipo `MemoEntry` ou enriquecer aggregator pra incluir `engineType` em relation app-level.

→ **Sub-task ajustar tipo:** adicionar `engineType?: EngineType` no kind="relation" quando `level="application"`. Atualizar aggregator pra preencher.

- [ ] **Step 5b.3.3: Marker memo via editor**

Em `renderMarkerCard.ts`:
```typescript
import { renderMemoEditor } from "./renderMemoEditor";
import { onSaveMarkerMemo } from "./onSaveHandlers";

// substitui memoEl.createEl("p", { text: entry.memo });
renderMemoEditor(memoEl, entry.memo, (v) => onSaveMarkerMemo(opts.ctx, entry.sourceType, entry.markerId, v), opts.ctx);
```

Adicionar `ctx` em `MarkerCardOptions`.

### Task 5b.4: Tests de edição

**Files:**
- Create: `src/analytics/views/modes/memoView/__tests__/memoViewEdit.test.ts`

- [ ] **Step 5b.4.1: Tests fundamentais**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderMemoEditor } from "../renderMemoEditor";

describe("renderMemoEditor", () => {
  beforeEach(() => { document.body.innerHTML = ""; vi.useFakeTimers(); });

  it("saves debounced after 500ms", () => {
    const onSave = vi.fn();
    const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
    const parent = document.body;
    const ta = renderMemoEditor(parent, "init", onSave, ctx);
    ta.value = "new";
    ta.dispatchEvent(new Event("input"));
    expect(onSave).not.toHaveBeenCalled();
    expect(ctx.suspendRefresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(499);
    expect(onSave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onSave).toHaveBeenCalledWith("new");
    expect(ctx.resumeRefresh).toHaveBeenCalledTimes(1);
  });

  it("blur with pending timeout forces save", () => {
    const onSave = vi.fn();
    const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
    const ta = renderMemoEditor(document.body, "x", onSave, ctx);
    ta.value = "y";
    ta.dispatchEvent(new Event("input"));
    ta.dispatchEvent(new Event("blur"));
    expect(onSave).toHaveBeenCalledWith("y");
  });

  it("blur without input does not save", () => {
    const onSave = vi.fn();
    const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
    const ta = renderMemoEditor(document.body, "x", onSave, ctx);
    ta.dispatchEvent(new Event("blur"));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("onSaveHandlers", () => {
  it("onSaveCodeMemo calls registry.update", async () => {
    const { onSaveCodeMemo } = await import("../onSaveHandlers");
    const update = vi.fn();
    const ctx = { plugin: { registry: { update } } } as any;
    onSaveCodeMemo(ctx, "c1", "memo");
    expect(update).toHaveBeenCalledWith("c1", { memo: "memo" });
  });

  it("onSaveGroupMemo calls registry.setGroupMemo", async () => {
    const { onSaveGroupMemo } = await import("../onSaveHandlers");
    const setGroupMemo = vi.fn();
    const ctx = { plugin: { registry: { setGroupMemo } } } as any;
    onSaveGroupMemo(ctx, "g1", "m");
    expect(setGroupMemo).toHaveBeenCalledWith("g1", "m");
  });

  it("onSaveCodeRelationMemo calls registry.setRelationMemo", async () => {
    const { onSaveCodeRelationMemo } = await import("../onSaveHandlers");
    const setRelationMemo = vi.fn();
    const ctx = { plugin: { registry: { setRelationMemo } } } as any;
    onSaveCodeRelationMemo(ctx, "c1", "x", "c2", "m");
    expect(setRelationMemo).toHaveBeenCalledWith("c1", "x", "c2", "m");
  });

  it("onSaveMarkerMemo: findMarker + mutates + markDirty", async () => {
    const { onSaveMarkerMemo } = await import("../onSaveHandlers");
    const marker = { id: "m1", memo: "old" };
    const findMarker = vi.fn().mockReturnValue(marker);
    const markDirty = vi.fn();
    const ctx = { plugin: { dataManager: { findMarker, markDirty } } } as any;
    onSaveMarkerMemo(ctx, "markdown", "m1", "new");
    expect(marker.memo).toBe("new");
    expect(markDirty).toHaveBeenCalled();
  });

  it("onSaveAppRelationMemo: findMarker + setApplicationRelationMemo + markDirty", async () => {
    const { onSaveAppRelationMemo } = await import("../onSaveHandlers");
    const marker = { id: "m1", codes: [{ codeId: "c1", relations: [{ label: "x", target: "c2", directed: true, memo: "old" }] }] };
    const findMarker = vi.fn().mockReturnValue(marker);
    const markDirty = vi.fn();
    const ctx = { plugin: { dataManager: { findMarker, markDirty } } } as any;
    onSaveAppRelationMemo(ctx, "markdown", "m1", "c1", "x", "c2", "new");
    expect(marker.codes[0]!.relations![0]!.memo).toBe("new");
    expect(markDirty).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5b.4.2: Rodar tests**

```bash
npm run test -- --run memoViewEdit 2>&1 | tail -20
```

Expected: 8 tests passam.

### Task 5b.5: Smoke + commit

- [ ] **Step 5b.5.1: Build + smoke**

```bash
npm run build 2>&1 | tail -5
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

Vault: editar code memo inline → blur → re-abrir Code Detail → validar persistência.
Repetir pra group, relation code-level, marker.

- [ ] **Step 5b.5.2: Commit**

```bash
git add src/analytics/views/modes/memoView/ src/analytics/data/dataTypes.ts src/analytics/data/memoView.ts
~/.claude/scripts/commit.sh "feat(analytics): edição inline em memo view (5 kinds via debounced save)"

npm run test -- --run 2>&1 | tail -3
```

---

## Chunk 6: Toggle by-file

**Goal:** botão "Group by file" muda pivô; render usa `byFile`.

### Task 6.1: Render `FileMemoSection`

**Files:**
- Create: `src/analytics/views/modes/memoView/renderFileSection.ts`

- [ ] **Step 6.1.1: Implementar**

```typescript
import type { App } from "obsidian";
import type { FileMemoSection } from "../../../data/dataTypes";
import { renderMarkerCard } from "./renderMarkerCard";
import type { AnalyticsViewContext } from "../../analyticsViewContext";

export interface FileSectionOptions {
  app: App;
  ctx: AnalyticsViewContext;
  resolveCodeName: (id: string) => string;
}

export function renderFileSection(parent: HTMLElement, section: FileMemoSection, opts: FileSectionOptions): void {
  const sec = parent.createDiv({ cls: "memo-view-file-section" });
  const header = sec.createDiv({ cls: "memo-view-file-header" });
  header.createEl("strong", { text: section.fileName });
  header.createSpan({ cls: "memo-view-source-chip", text: ` · ${section.sourceType}` });

  if (section.codeIdsUsed.length > 0) {
    const chips = sec.createDiv({ cls: "memo-view-code-chips" });
    chips.createSpan({ text: "Codes used: " });
    for (const id of section.codeIdsUsed) {
      chips.createSpan({ cls: "memo-view-code-chip", text: opts.resolveCodeName(id) });
    }
  }

  for (const mm of section.markerMemos) {
    renderMarkerCard(sec, mm, { app: opts.app, ctx: opts.ctx } as any);
  }
}
```

### Task 6.2: Atualizar `memoViewMode.ts`

- [ ] **Step 6.2.1: Branch render por groupBy**

```typescript
if (result.byCode) {
  for (const sec of result.byCode) {
    renderCodeSection(wrapper, sec, { app: ctx.plugin.app, ctx, /* ... */ });
  }
}
if (result.byFile) {
  for (const sec of result.byFile) {
    renderFileSection(wrapper, sec, {
      app: ctx.plugin.app,
      ctx,
      resolveCodeName: (id) => ctx.plugin.registry.getById(id)?.name ?? id,
    });
  }
}
```

### Task 6.3: Build + smoke + commit

- [ ] **Step 6.3.1: Smoke**

Toggle (que vem em chunk 7) ainda não existe — pra smoke nesta chunk, mudar `mvGroupBy` direto no `data.json` pra "file" e validar render. Reverter depois.

- [ ] **Step 6.3.2: Commit**

```bash
~/.claude/scripts/commit.sh "feat(analytics): byFile pivot render (toggle ainda em chunk 7)"
```

---

## Chunk 7: Filtros (config panel)

**Goal:** options panel completo com showTypes checkboxes, groupBy radio, markerLimit dropdown + reuso de filtros existentes.

### Task 7.1: `memoViewOptions.ts`

**Files:**
- Create: `src/analytics/views/modes/memoView/memoViewOptions.ts`

- [ ] **Step 7.1.1: Skeleton com 3 controles novos**

```typescript
import type { AnalyticsViewContext } from "../../analyticsViewContext";

export function renderMemoViewOptions(ctx: AnalyticsViewContext): void {
  const panel = ctx.configPanelEl;
  if (!panel) return;
  const section = panel.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Memo View" });

  // Group by radio
  section.createDiv({ cls: "codemarker-config-sublabel", text: "Group by" });
  for (const [val, label] of [["code","Code"], ["file","File"]] as const) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "mvGroupBy";
    radio.value = val;
    radio.checked = ctx.mvGroupBy === val;
    row.createSpan({ text: label });
    const handler = () => { ctx.mvGroupBy = val; ctx.scheduleUpdate(); ctx.renderConfigPanel(); };
    radio.addEventListener("change", handler);
    row.addEventListener("click", (ev) => { if (ev.target !== radio) { radio.checked = true; handler(); } });
  }

  // Show types checkboxes
  section.createDiv({ cls: "codemarker-config-sublabel", text: "Show memo types" });
  const types: Array<keyof typeof ctx.mvShowTypes> = ["code", "group", "relation", "marker"];
  const labels: Record<string, string> = { code: "Code", group: "Group", relation: "Relation", marker: "Marker" };
  for (const t of types) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const check = row.createEl("input", { type: "checkbox" });
    check.checked = ctx.mvShowTypes[t];
    row.createSpan({ text: labels[t]! });
    const handler = () => { ctx.mvShowTypes = { ...ctx.mvShowTypes, [t]: check.checked }; ctx.scheduleUpdate(); };
    check.addEventListener("change", handler);
    row.addEventListener("click", (ev) => { if (ev.target !== check) { check.checked = !check.checked; handler(); } });
  }

  // Marker limit dropdown — só se groupBy="code"
  if (ctx.mvGroupBy === "code") {
    section.createDiv({ cls: "codemarker-config-sublabel", text: "Marker limit per code" });
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const select = row.createEl("select");
    for (const v of [5, 10, 25, "all"] as const) {
      const opt = select.createEl("option", { value: String(v), text: String(v) });
      if (ctx.mvMarkerLimit === v) opt.selected = true;
    }
    select.addEventListener("change", () => {
      const raw = select.value;
      ctx.mvMarkerLimit = (raw === "all" ? "all" : (parseInt(raw, 10) as 5 | 10 | 25));
      ctx.mvExpanded.clear();
      ctx.scheduleUpdate();
    });
  }

  // Reuso dos filtros existentes — chamar helpers compartilhados se existirem
  // (procurar por renderSourcesSection, renderGroupFilterSection, renderCodeFilterSection, renderCaseVariableFilterSection)
  // Por ora: deixar comentário pra retomar se algum deles for compartilhado
}
```

- [ ] **Step 7.1.2: Conectar ao registry**

Em `memoViewMode.ts` — substituir `renderMemoViewOptions` import. Se já está no MODE_REGISTRY apontando pra função do `memoViewMode.ts`, ajustar pra apontar pra `memoViewOptions.ts`.

- [ ] **Step 7.1.3: Reusar filtros**

Procurar como Code×Metadata expõe filtros adicionais. Em `analyticsView.ts`, geralmente os filtros (sources, code group, code, case variable) são renderizados sempre — independente do mode. Confirmar via leitura do método que constrói o config panel. Se já são sempre renderizados: nada a fazer aqui. Se mode-specific: copiar pattern do `codeMetadataMode`.

- [ ] **Step 7.1.4: Smoke + commit**

```bash
npm run build 2>&1 | tail -5
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

Validar: panel mostra controles. Toggle each. Cada filter aplica.

```bash
~/.claude/scripts/commit.sh "feat(analytics): config panel completo da Memo View (groupBy + showTypes + markerLimit + filtros)"
```

---

## Chunk 8: Export CSV

**Goal:** botão "Export CSV" (já parte da toolbar do Analytics) gera CSV com colunas declaradas em §7.1 da spec.

### Task 8.1: `exportMemoCSV.ts`

**Files:**
- Create: `src/analytics/views/modes/memoView/exportMemoCSV.ts`

- [ ] **Step 8.1.1: Impl**

```typescript
import { Notice } from "obsidian";
import type { AnalyticsViewContext } from "../../analyticsViewContext";
import type { MemoViewFilters } from "../../../data/dataTypes";
import { aggregateMemos } from "../../../data/memoView";
import { readAllData } from "../../../data/dataReader";
import { buildCsv } from "../../shared/chartHelpers";

export function exportMemoCSV(ctx: AnalyticsViewContext, date: string): void {
  const allData = readAllData(ctx.plugin.dataManager);
  const filters: MemoViewFilters = {
    ...ctx.buildFilterConfig(),
    showTypes: ctx.mvShowTypes,
    groupBy: ctx.mvGroupBy,
    markerLimit: "all",
  };
  const result = aggregateMemos(allData, ctx.plugin.registry, filters);

  const header = ["entity_type", "entity_id", "code_id", "code_name", "file_id", "source_type", "level", "memo"];
  const rows: string[][] = [header];

  if (result.byCode) {
    for (const sec of result.byCode) {
      if (sec.codeMemo) {
        rows.push(["code", sec.codeId, sec.codeId, sec.codeName, "", "", "", sec.codeMemo]);
      }
      for (const gm of sec.groupMemos) {
        if (gm.kind === "group") rows.push(["group", gm.groupId, "", "", "", "", "", gm.memo]);
      }
      for (const rm of sec.relationMemos) {
        if (rm.kind === "relation") {
          rows.push(["relation", "", rm.codeId, sec.codeName, rm.markerId ?? "", rm.markerId ? "" : "", rm.level, rm.memo]);
        }
      }
      for (const mm of sec.markerMemos) {
        if (mm.kind === "marker") rows.push(["marker", mm.markerId, mm.codeId, sec.codeName, mm.fileId, mm.sourceType, "", mm.memo]);
      }
    }
  }
  if (result.byFile) {
    for (const sec of result.byFile) {
      for (const mm of sec.markerMemos) {
        if (mm.kind === "marker") rows.push(["marker", mm.markerId, mm.codeId, "", mm.fileId, mm.sourceType, "", mm.memo]);
      }
    }
  }

  const csv = buildCsv(rows);
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.download = `memo-view-${date}.csv`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
  new Notice(`Exported ${rows.length - 1} memos`);
}
```

### Task 8.2: Tests

**Files:**
- Create: `src/analytics/views/modes/memoView/__tests__/exportMemoCSV.test.ts`

- [ ] **Step 8.2.1: Tests core**

```typescript
import { describe, it, expect, vi } from "vitest";
// Tests focam em geração de rows. Mockar URL.createObjectURL etc.

describe("exportMemoCSV", () => {
  it("gera header + 1 row por memo", () => {
    // Use makeAllData + makeRegistry helpers (dup minimal)
    // Stub createObjectURL e link.click; capturar Blob.text()
    // ... (ver memoView.test.ts pra setup)
  });
  // ... 5 outros testes (escape, newlines, empty result, filtros, encoding)
});
```

NOTA: setup de DOM blob+URL stub é trivial; reusar pattern de outros export tests no projeto se houver.

### Task 8.3: Registrar em `MODE_REGISTRY`

- [ ] **Step 8.3.1: Atualizar entry**

```typescript
"memo-view": {
  label: "Memo View",
  render: renderMemoView,
  renderOptions: renderMemoViewOptions,
  exportCSV: exportMemoCSV,
},
```

(remove `canExport: false`).

- [ ] **Step 8.3.2: Smoke + commit**

Validar: botão "Export CSV" funciona, abre CSV no Excel/numbers.

```bash
~/.claude/scripts/commit.sh "feat(analytics): export CSV da Memo View"
```

---

## Chunk 9: Export Markdown

**Goal:** botão "Export Markdown" cria `.md` em `Analytic Memos/YYYY-MM-DD.md` e abre.

### Task 9.1: Estender `ModeEntry`

**Files:**
- Modify: `src/analytics/views/modes/modeRegistry.ts`

- [ ] **Step 9.1.1: Adicionar campo opcional**

```typescript
export type ModeEntry = {
  // ...
  exportMarkdown?: (ctx: AnalyticsViewContext, date: string) => Promise<void> | void;
  // ...
};
```

### Task 9.2: `exportMemoMarkdown.ts`

**Files:**
- Create: `src/analytics/views/modes/memoView/exportMemoMarkdown.ts`

- [ ] **Step 9.2.1: Impl**

```typescript
import { Notice, TFile, normalizePath } from "obsidian";
import type { AnalyticsViewContext } from "../../analyticsViewContext";
import type { MemoViewFilters, CodeMemoSection } from "../../../data/dataTypes";
import { aggregateMemos } from "../../../data/memoView";
import { readAllData } from "../../../data/dataReader";

export async function exportMemoMarkdown(ctx: AnalyticsViewContext, date: string): Promise<void> {
  const allData = readAllData(ctx.plugin.dataManager);
  const filters: MemoViewFilters = {
    ...ctx.buildFilterConfig(),
    showTypes: ctx.mvShowTypes,
    groupBy: ctx.mvGroupBy,
    markerLimit: "all",
  };
  const result = aggregateMemos(allData, ctx.plugin.registry, filters);

  const lines: string[] = [];
  lines.push(`# Analytic Memos · ${date}`);
  lines.push("");

  // Coverage
  const cov = result.coverage;
  lines.push(`> **Coverage:** ${cov.codesWithMemo}/${cov.codesTotal} codes · ${cov.markersWithMemo}/${cov.markersTotal} markers · ${cov.groupsWithMemo}/${cov.groupsTotal} groups · ${cov.relationsWithMemo}/${cov.relationsTotal} relations`);
  lines.push("");
  lines.push("---");
  lines.push("");

  if (result.byCode) {
    for (const sec of result.byCode) {
      const heading = "#".repeat(Math.min(sec.depth + 2, 6));
      lines.push(`${heading} ${sec.codeName}`);
      if (sec.groupIds.length > 0) {
        const names = sec.groupIds.map((id) => ctx.plugin.registry.getGroupById(id)?.name ?? id).join(", ");
        lines.push(`**Groups:** ${names}`);
      }
      lines.push("");
      if (sec.codeMemo) {
        lines.push(`**Code memo:**`);
        lines.push(`> ${sec.codeMemo.replace(/\n/g, "\n> ")}`);
        lines.push("");
      }
      if (sec.groupMemos.length) {
        lines.push("**Group memos:**");
        for (const gm of sec.groupMemos) {
          if (gm.kind === "group") lines.push(`- *${gm.groupName}:* ${gm.memo}`);
        }
        lines.push("");
      }
      if (sec.relationMemos.length) {
        lines.push("**Relations:**");
        for (const rm of sec.relationMemos) {
          if (rm.kind === "relation") {
            const arrow = rm.directed ? "→" : "↔";
            const tag = rm.level === "code" ? "(code-level)" : `(application-level, [[${rm.markerId}]])`;
            lines.push(`- ${arrow} ${rm.label} "${rm.targetName}" *${tag}*: ${rm.memo}`);
          }
        }
        lines.push("");
      }
      if (sec.markerMemos.length) {
        lines.push(`**Marker memos (${sec.markerMemos.length}):**`);
        lines.push("");
        for (const mm of sec.markerMemos) {
          if (mm.kind !== "marker") continue;
          lines.push(`- **[[${mm.fileId}]]** · ${mm.sourceType}`);
          const excerptLines = mm.excerpt.split("\n").map((l) => `  > ${l}`).join("\n");
          lines.push(excerptLines);
          lines.push("");
          lines.push(`  *Marker memo:* ${mm.memo}`);
          lines.push("");
        }
      }
      lines.push("---");
      lines.push("");
    }
  }

  // Folder + path
  const folder = "Analytic Memos";
  const vault = ctx.plugin.app.vault;
  if (!await vault.adapter.exists(folder)) {
    await vault.createFolder(folder);
  }
  let path = normalizePath(`${folder}/${date}.md`);
  if (await vault.adapter.exists(path)) {
    const ts = new Date().toISOString().slice(11, 16).replace(":", "");
    path = normalizePath(`${folder}/${date}-${ts}.md`);
  }
  const file = await vault.create(path, lines.join("\n"));
  await ctx.plugin.app.workspace.getLeaf(true).openFile(file as TFile);
  new Notice(`Exported memos to ${path}`);
}
```

### Task 9.3: Toolbar — botão "Export Markdown" condicional

**Files:**
- Modify: `src/analytics/views/analyticsView.ts`

- [ ] **Step 9.3.1: Adicionar botão**

Procurar onde "Export CSV" é renderizado no toolbar. Após:

```typescript
const entry = MODE_REGISTRY[this.viewMode];
if (entry.exportMarkdown) {
  const btn = toolbar.createEl("button", { text: "Export Markdown" });
  btn.addEventListener("click", async () => {
    const date = new Date().toISOString().slice(0, 10);
    await entry.exportMarkdown!(this.ctx, date);
  });
}
```

### Task 9.4: Tests

**Files:**
- Create: `src/analytics/views/modes/memoView/__tests__/exportMemoMarkdown.test.ts`

- [ ] **Step 9.4.1: 6 tests**

(Mockar vault, capturar `vault.create` argumento, validar string output.)

### Task 9.5: Smoke + commit

```bash
npm run build && cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

Validar: botão funciona, arquivo aparece em `Analytic Memos/`, abre em nova leaf.

```bash
~/.claude/scripts/commit.sh "feat(analytics): export Markdown da Memo View (cria nota no vault)"
```

---

## Chunk 10: Edge cases + final smoke + docs

**Goal:** validar 11 cenários do §9.2 da spec; fechar pendências; atualizar docs.

### Task 10.1: Smoke completo

- [ ] **Step 10.1.1: Setup vault**

Vault `obsidian-plugins-workbench/`:
- ≥ 5 codes (com/sem memo)
- ≥ 2 groups com memo
- ≥ 3 relations code-level com memo
- ≥ 10 markers em PDF/markdown/csv com memos

- [ ] **Step 10.1.2: Cenários**

Executar os 11 cenários de §9.2 (spec). Documentar resultado em comment do PR ou commit final.

### Task 10.2: Documentação

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TECHNICAL-PATTERNS.md`
- Modify: `docs/BACKLOG.md`
- Modify: `CLAUDE.md`

- [ ] **Step 10.2.1: ROADMAP**

Riscar "Analytic Memo View" no §3 + adicionar data 2026-04-XX.

- [ ] **Step 10.2.2: ARCHITECTURE**

Adicionar seção sobre:
- `analytics/data/memoView.ts` (função pura)
- `analytics/views/modes/memoView/` (orchestrator + 8 sub-arquivos)
- `dataManager.findMarker` (nova API central)
- `setApplicationRelationMemo` em `codeApplicationHelpers.ts`

- [ ] **Step 10.2.3: TECHNICAL-PATTERNS**

Adicionar pattern:
- `renderMemoEditor` (debounced + suspendRefresh) como template pra editores futuros em outros modes
- ModeEntry com `exportMarkdown` opcional

- [ ] **Step 10.2.4: BACKLOG**

Adicionar item: "Render strategy C (virtual scroll) pra Memo View se ≥500 marker memos virar dor — substituir `renderCodeSection` por virtual implementation espelhando `codebookTreeRenderer`".

- [ ] **Step 10.2.5: CLAUDE.md**

- Atualizar count de testes
- Adicionar paths novos na estrutura `src/analytics/data/memoView.ts`, `src/analytics/views/modes/memoView/...`

### Task 10.3: Final commit + merge

- [ ] **Step 10.3.1: tsc + tests + build**

```bash
npx tsc --noEmit 2>&1 | tail -5
npm run test -- --run 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: zero erros, ~2371 tests, build limpo.

- [ ] **Step 10.3.2: Sync demo**

```bash
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
git add demo/.obsidian/plugins/qualia-coding/
~/.claude/scripts/commit.sh "chore(demo): build pos analytic memo view"
```

- [ ] **Step 10.3.3: Docs commit**

```bash
git add docs/ CLAUDE.md
~/.claude/scripts/commit.sh "docs: registra analytic memo view em ARCHITECTURE/TECHNICAL-PATTERNS/ROADMAP/BACKLOG/CLAUDE"
```

- [ ] **Step 10.3.4: Merge pra main**

```bash
git checkout main
git merge --no-ff feat/analytic-memo-view -m "feat: analytic memo view (consumer #25)"
git push
```

- [ ] **Step 10.3.5: Arquivar plan e spec**

Sugerir mover `docs/superpowers/specs/2026-04-27-analytic-memo-view-design.md` e `docs/superpowers/plans/2026-04-27-analytic-memo-view.md` pra `obsidian-qualia-coding/plugin-docs/archive/claude_sources/specs/` e `.../plans/`. (User decide; não move automaticamente.)

---

## Done criteria

- [ ] Mode `"memo-view"` aparece no dropdown do Analytics.
- [ ] Coverage banner mostra 4 stats.
- [ ] By-code render: hierarquia indentada + chips de groups + 4 tipos de memo + "Show N more".
- [ ] By-file render: agrupa por arquivo + chips de codes used.
- [ ] Edição inline funciona em todos os 5 kinds (code/group/relation code/relation app/marker), persiste após reload.
- [ ] suspendRefresh segura re-render durante typing; resume volta o flow.
- [ ] Filtros: source, code, group, case variable + showTypes + groupBy + markerLimit.
- [ ] Export CSV abre em Excel/numbers com encoding correto.
- [ ] Export Markdown cria arquivo formatado em `Analytic Memos/` e abre.
- [ ] Empty states funcionam (sem memos / filtros zeram).
- [ ] tsc limpo, ~2371 tests passando, build limpo, demo synced.
- [ ] Docs atualizados (ROADMAP, ARCHITECTURE, TECHNICAL-PATTERNS, BACKLOG, CLAUDE).
