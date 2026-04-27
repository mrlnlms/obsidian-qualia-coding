import { describe, it, expect } from "vitest";
import { aggregateMemos } from "../../src/analytics/data/memoView";
import type { AllEngineData, MemoViewFilters } from "../../src/analytics/data/dataTypes";
import { CodeDefinitionRegistry } from "../../src/core/codeDefinitionRegistry";
import type { CodeApplication } from "../../src/core/types";
import type { CaseVariablesRegistry } from "../../src/core/caseVariables/caseVariablesRegistry";
import type { VariableValue } from "../../src/core/caseVariables/caseVariablesTypes";

/** Minimal stub satisfying the getVariables shape used by applyMemoFilters. */
function makeCVRegistry(store: Record<string, Record<string, VariableValue>>): Pick<CaseVariablesRegistry, "getVariables"> {
  return { getVariables: (fileId: string) => store[fileId] ?? {} };
}

// Helpers — APIs verificadas em `src/core/codeDefinitionRegistry.ts`:
//   create(name, color?, description?, parentId?) — POSICIONAL
//   getAll() — não getAllCodes
//   getById(id), update(id, partial), setParent(id, parentId)
//   createGroup(name) → GroupDefinition (capture id from return)
//   getGroup(id) — não getGroupById/getGroupByName
//   addCodeToGroup(codeId, groupId), setGroupMemo(id, memo), setRelationMemo(codeId, label, target, memo)
//   Code-level relations: registry.update(id, { relations: [{ label, target, directed }, ...] })
//     (não há addRelation no registry — relations vão direto via update)

function makeRegistry(opts?: {
  codes?: Array<{ name: string; memo?: string; parentName?: string; relations?: Array<{ label: string; target: string; directed?: boolean; memo?: string }> }>;
  groups?: Array<{ name: string; memo?: string; codeNames?: string[] }>;
}): CodeDefinitionRegistry {
  const reg = new CodeDefinitionRegistry();
  const ids = new Map<string, string>(); // name → id
  // Pass 1: cria todos códigos
  for (const c of opts?.codes ?? []) {
    const def = reg.create(c.name, "#abc", "");
    ids.set(c.name, def.id);
  }
  // Pass 2: parent + memo + relations (precisam dos ids prontos)
  for (const c of opts?.codes ?? []) {
    const id = ids.get(c.name)!;
    if (c.memo) reg.update(id, { memo: c.memo });
    if (c.parentName) reg.setParent(id, ids.get(c.parentName));
    if (c.relations && c.relations.length) {
      const rels = c.relations.map((r) => ({
        label: r.label,
        target: ids.get(r.target) ?? r.target,
        directed: r.directed ?? true,
        memo: r.memo,
      }));
      reg.update(id, { relations: rels });
    }
  }
  // Groups
  for (const g of opts?.groups ?? []) {
    const grp = reg.createGroup(g.name);
    if (g.memo) reg.setGroupMemo(grp.id, g.memo);
    for (const codeName of g.codeNames ?? []) {
      const codeId = ids.get(codeName);
      if (codeId) reg.addCodeToGroup(codeId, grp.id);
    }
  }
  return reg;
}

function getId(reg: CodeDefinitionRegistry, name: string): string {
  return reg.getAll().find((c) => c.name === name)!.id;
}

function makeAllData(opts?: { markdownMarkers?: any[]; pdfMarkers?: any[]; csvSegmentMarkers?: any[] }): AllEngineData {
  return {
    markdown: { markers: opts?.markdownMarkers ? { "P01.md": opts.markdownMarkers } : {}, settings: {} as any, codeDefinitions: {} },
    csv: { segmentMarkers: opts?.csvSegmentMarkers ?? [], rowMarkers: [], registry: { definitions: {} } },
    image: { markers: [], settings: {} as any, registry: { definitions: {} } },
    pdf: { markers: opts?.pdfMarkers ?? [], shapes: [], registry: { definitions: {} } },
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

// ─── Task 1.3: Coverage stats ────────────────────────────────────

describe("aggregateMemos — coverage", () => {
  it("counts codes with memo", () => {
    const reg = makeRegistry({ codes: [
      { name: "A", memo: "memo A" },
      { name: "B" },
      { name: "C", memo: "memo C" },
    ]});
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    expect(r.coverage.codesTotal).toBe(3);
    expect(r.coverage.codesWithMemo).toBe(2);
  });

  it("counts groups with memo", () => {
    const reg = makeRegistry({ groups: [
      { name: "G1", memo: "g memo" },
      { name: "G2" },
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
      markdownMarkers: [{ id: "m1", fileId: "P01.md", codes: [{ codeId: getId(reg, "A"), relations: [{ label: "x", target: "B", directed: true, memo: "app rel memo" }] }] } as any],
    });
    const r = aggregateMemos(allData, reg, baseFilters);
    expect(r.coverage.relationsTotal).toBe(3);
    expect(r.coverage.relationsWithMemo).toBe(2);
  });

  it("markersTotal respects non-showTypes filters", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }] });
    const aId = getId(reg, "A");
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

// ─── Task 1.5: By code pivot ─────────────────────────────────────

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
      groups: [{ name: "G1", memo: "g memo", codeNames: ["A"] }],
    });
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
    const aId = getId(reg, "A");
    const bId = getId(reg, "B");
    const allData = makeAllData({
      markdownMarkers: [{
        id: "m1", fileId: "P01.md",
        codes: [{ codeId: aId, relations: [{ label: "x", target: bId, directed: true, memo: "app memo" }] }],
      } as any],
    });
    const r = aggregateMemos(allData, reg, baseFilters);
    const rels = r.byCode![0]!.relationMemos;
    expect(rels.length).toBe(1);
    if (rels[0]!.kind === "relation") {
      expect(rels[0]!.level).toBe("application");
      expect(rels[0]!.markerId).toBe("m1");
      expect(rels[0]!.engineType).toBe("markdown");
    }
  });

  it("includes marker memos for code", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }] });
    const aId = getId(reg, "A");
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

// ─── Task 1.6: Hierarquia ─────────────────────────────────────────

describe("aggregateMemos — hierarquia", () => {
  it("parent without memo + child with memo: parent appears as context", () => {
    const reg = makeRegistry({ codes: [
      { name: "P" },
      { name: "C", parentName: "P", memo: "child memo" },
    ]});
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    const names = r.byCode!.map((s) => s.codeName);
    expect(names).toContain("P"); // pai aparece
    expect(names).toContain("C");
    const pSection = r.byCode!.find((s) => s.codeName === "P")!;
    expect(pSection.codeMemo).toBeNull();
    expect(pSection.hasAnyMemoInSubtree).toBe(true);
  });

  it("parent without memo + child without memo: neither appears", () => {
    const reg = makeRegistry({ codes: [{ name: "P" }, { name: "C", parentName: "P" }] });
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    expect(r.byCode!.length).toBe(0);
  });

  it("childIds populated correctly", () => {
    const reg = makeRegistry({ codes: [
      { name: "P", memo: "p" },
      { name: "C1", parentName: "P", memo: "c1" },
      { name: "C2", parentName: "P", memo: "c2" },
    ]});
    const r = aggregateMemos(makeAllData(), reg, baseFilters);
    const pSection = r.byCode!.find((s) => s.codeName === "P")!;
    expect(pSection.childIds).toEqual([getId(reg, "C1"), getId(reg, "C2")]);
  });
});

// ─── Task 1.7: By file pivot ──────────────────────────────────────

describe("aggregateMemos — by file", () => {
  it("groups markers by fileId", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }] });
    const aId = getId(reg, "A");
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
    const aId = getId(reg, "A");
    const bId = getId(reg, "B");
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
    const aId = getId(reg, "A");
    const allData = makeAllData({
      markdownMarkers: [
        { id: "m1", fileId: "P01.md", codes: [{ codeId: aId }] /* no memo */ } as any,
      ],
    });
    const r = aggregateMemos(allData, reg, { ...baseFilters, groupBy: "file" });
    expect(r.byFile!.length).toBe(0);
  });
});

// ─── Task 1.8: Decisão iv + showTypes ────────────────────────────

describe("aggregateMemos — decisão iv (marker em múltiplos códigos)", () => {
  it("marker appears once under first surviving code in array order", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }, { name: "B", memo: "b memo" }] });
    const aId = getId(reg, "A");
    const bId = getId(reg, "B");
    const allData = makeAllData({
      markdownMarkers: [
        { id: "m1", fileId: "P01.md", codes: [{ codeId: aId }, { codeId: bId }], memo: "x" } as any,
      ],
    });
    // No code filter: aId is first surviving — marker goes to A, not B
    const r1 = aggregateMemos(allData, reg, baseFilters);
    const aSec = r1.byCode!.find((s) => s.codeId === aId);
    const bSec = r1.byCode!.find((s) => s.codeId === bId);
    expect(aSec?.markerMemos.length).toBe(1);
    // B has its own code memo so it appears — but marker went to A, not B
    expect(bSec).toBeDefined();
    expect(bSec!.markerMemos.length).toBe(0);
  });

  it("with code filter excluding A, marker goes to B", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }, { name: "B" }] });
    const aId = getId(reg, "A");
    const bId = getId(reg, "B");
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

// ─── Important #2: caseVariableFilter ────────────────────────────

describe("aggregateMemos — caseVariableFilter", () => {
  it("filters markers to only files matching the case variable value when registry provided", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }] });
    const aId = getId(reg, "A");
    // Use PDF markers — they carry their own fileId field (not grouped under map key like markdown)
    const allData = makeAllData({
      pdfMarkers: [
        { id: "m1", fileId: "P01.pdf", codes: [{ codeId: aId }], memo: "included" } as any,
        { id: "m2", fileId: "P02.pdf", codes: [{ codeId: aId }], memo: "excluded" } as any,
      ],
    });
    const cvReg = makeCVRegistry({
      "P01.pdf": { group: "A" },
      "P02.pdf": { group: "B" },
    });
    const filters: MemoViewFilters = { ...baseFilters, caseVariableFilter: { name: "group", value: "A" } };
    const r = aggregateMemos(allData, reg, filters, cvReg as CaseVariablesRegistry);
    expect(r.coverage.markersTotal).toBe(1);
    expect(r.coverage.markersWithMemo).toBe(1);
    const sec = r.byCode!.find((s) => s.codeId === aId);
    expect(sec?.markerMemos.length).toBe(1);
    if (sec?.markerMemos[0]?.kind === "marker") {
      expect(sec.markerMemos[0].fileId).toBe("P01.pdf");
    }
  });

  it("caseVariableFilter is no-op when registry is omitted", () => {
    const reg = makeRegistry({ codes: [{ name: "A" }] });
    const aId = getId(reg, "A");
    const allData = makeAllData({
      pdfMarkers: [
        { id: "m1", fileId: "P01.pdf", codes: [{ codeId: aId }], memo: "x" } as any,
        { id: "m2", fileId: "P02.pdf", codes: [{ codeId: aId }], memo: "y" } as any,
      ],
    });
    const filters: MemoViewFilters = { ...baseFilters, caseVariableFilter: { name: "group", value: "A" } };
    // No caseVariablesRegistry passed — filter must be silently skipped
    const r = aggregateMemos(allData, reg, filters);
    expect(r.coverage.markersTotal).toBe(2);
  });
});
