import { describe, it, expect } from "vitest";
import { buildMemoCSV } from "../../src/analytics/views/modes/memoView/exportMemoCSV";
import { buildMemoMarkdown } from "../../src/analytics/views/modes/memoView/exportMemoMarkdown";
import type { MemoViewResult } from "../../src/analytics/data/dataTypes";

function emptyCoverage() {
	return { codesTotal: 0, codesWithMemo: 0, groupsTotal: 0, groupsWithMemo: 0, relationsTotal: 0, relationsWithMemo: 0, markersTotal: 0, markersWithMemo: 0 };
}

describe("buildMemoCSV", () => {
	it("includes header + 1 row per memo", () => {
		const result: MemoViewResult = {
			groupBy: "code",
			coverage: emptyCoverage(),
			byCode: [{
				codeId: "c1", codeName: "A", color: "#abc", depth: 0, groupIds: [],
				codeMemo: "memo c1", groupMemos: [], relationMemos: [], markerMemos: [],
				childIds: [], hasAnyMemoInSubtree: true,
			}],
		};
		const csv = buildMemoCSV(result);
		const lines = csv.trim().split("\n");
		expect(lines[0]).toContain("entity_type");
		expect(lines.length).toBe(2);
		expect(lines[1]).toContain("code");
		expect(lines[1]).toContain("memo c1");
	});

	it("escapes double quotes in memo", () => {
		const result: MemoViewResult = {
			groupBy: "code", coverage: emptyCoverage(),
			byCode: [{ codeId: "c1", codeName: "A", color: "#abc", depth: 0, groupIds: [], codeMemo: 'has "quotes"', groupMemos: [], relationMemos: [], markerMemos: [], childIds: [], hasAnyMemoInSubtree: true }],
		};
		const csv = buildMemoCSV(result);
		expect(csv).toContain('"has ""quotes"""');
	});

	it("preserves newlines inside memo cell (quoted)", () => {
		const result: MemoViewResult = {
			groupBy: "code", coverage: emptyCoverage(),
			byCode: [{ codeId: "c1", codeName: "A", color: "#abc", depth: 0, groupIds: [], codeMemo: "line1\nline2", groupMemos: [], relationMemos: [], markerMemos: [], childIds: [], hasAnyMemoInSubtree: true }],
		};
		const csv = buildMemoCSV(result);
		expect(csv).toContain('"line1\nline2"');
	});

	it("emits 'application' level on app-level relation rows", () => {
		const result: MemoViewResult = {
			groupBy: "code", coverage: emptyCoverage(),
			byCode: [{
				codeId: "c1", codeName: "A", color: "#abc", depth: 0, groupIds: [], codeMemo: null, groupMemos: [],
				relationMemos: [{ kind: "relation", codeId: "c1", label: "L", targetId: "c2", targetName: "B", directed: true, memo: "r", level: "application", markerId: "m1", engineType: "markdown" }],
				markerMemos: [], childIds: [], hasAnyMemoInSubtree: true,
			}],
		};
		const csv = buildMemoCSV(result);
		expect(csv).toContain("application");
	});

	it("dedups group memos when group appears in multiple codes", () => {
		const result: MemoViewResult = {
			groupBy: "code", coverage: emptyCoverage(),
			byCode: [
				{ codeId: "c1", codeName: "A", color: "#abc", depth: 0, groupIds: ["g1"], codeMemo: null, groupMemos: [{ kind: "group", groupId: "g1", groupName: "G", color: "#abc", memo: "g memo" }], relationMemos: [], markerMemos: [], childIds: [], hasAnyMemoInSubtree: true },
				{ codeId: "c2", codeName: "B", color: "#abc", depth: 0, groupIds: ["g1"], codeMemo: null, groupMemos: [{ kind: "group", groupId: "g1", groupName: "G", color: "#abc", memo: "g memo" }], relationMemos: [], markerMemos: [], childIds: [], hasAnyMemoInSubtree: true },
			],
		};
		const csv = buildMemoCSV(result);
		const groupRows = csv.split("\n").filter((l) => l.startsWith("group,"));
		expect(groupRows.length).toBe(1);
	});

	it("returns header-only when no memos", () => {
		const result: MemoViewResult = { groupBy: "code", coverage: emptyCoverage(), byCode: [] };
		const csv = buildMemoCSV(result);
		expect(csv.trim().split("\n").length).toBe(1);
	});
});

describe("buildMemoMarkdown", () => {
	it("uses H2 for root code, H3 for depth=1, capped at H6", () => {
		const result: MemoViewResult = {
			groupBy: "code", coverage: emptyCoverage(),
			byCode: [
				{ codeId: "p", codeName: "Parent", color: "#abc", depth: 0, groupIds: [], codeMemo: "p memo", groupMemos: [], relationMemos: [], markerMemos: [], childIds: ["c"], hasAnyMemoInSubtree: true },
				{ codeId: "c", codeName: "Child", color: "#abc", depth: 1, groupIds: [], codeMemo: "c memo", groupMemos: [], relationMemos: [], markerMemos: [], childIds: [], hasAnyMemoInSubtree: true },
				{ codeId: "deep", codeName: "Deep", color: "#abc", depth: 5, groupIds: [], codeMemo: "d memo", groupMemos: [], relationMemos: [], markerMemos: [], childIds: [], hasAnyMemoInSubtree: true },
			],
		};
		const md = buildMemoMarkdown(result, { date: "2026-04-27", resolveGroupName: () => "" });
		expect(md).toMatch(/^# Analytic Memos · 2026-04-27/);
		expect(md).toContain("\n## Parent\n");
		expect(md).toContain("\n### Child\n");
		expect(md).toContain("\n###### Deep\n"); // depth 5 → ###### (cap em H6)
	});

	it("emits blockquote for excerpts", () => {
		const result: MemoViewResult = {
			groupBy: "code", coverage: emptyCoverage(),
			byCode: [{ codeId: "c1", codeName: "A", color: "#abc", depth: 0, groupIds: [], codeMemo: null, groupMemos: [], relationMemos: [],
				markerMemos: [{ kind: "marker", markerId: "m1", codeId: "c1", fileId: "P01.md", sourceType: "markdown", excerpt: "trecho", memo: "marker memo" }],
				childIds: [], hasAnyMemoInSubtree: true }],
		};
		const md = buildMemoMarkdown(result, { date: "2026-04-27", resolveGroupName: () => "" });
		expect(md).toContain("  > trecho");
	});

	it("emits group chips when groupIds present", () => {
		const result: MemoViewResult = {
			groupBy: "code", coverage: emptyCoverage(),
			byCode: [{ codeId: "c1", codeName: "A", color: "#abc", depth: 0, groupIds: ["g1", "g2"], codeMemo: "x", groupMemos: [], relationMemos: [], markerMemos: [], childIds: [], hasAnyMemoInSubtree: true }],
		};
		const md = buildMemoMarkdown(result, { date: "2026-04-27", resolveGroupName: (id) => id === "g1" ? "G1" : "G2" });
		expect(md).toContain("**Groups:** G1, G2");
	});

	it("emits wikilink for marker file", () => {
		const result: MemoViewResult = {
			groupBy: "code", coverage: emptyCoverage(),
			byCode: [{ codeId: "c1", codeName: "A", color: "#abc", depth: 0, groupIds: [], codeMemo: null, groupMemos: [], relationMemos: [],
				markerMemos: [{ kind: "marker", markerId: "m1", codeId: "c1", fileId: "P01.md", sourceType: "markdown", excerpt: "x", memo: "y" }],
				childIds: [], hasAnyMemoInSubtree: true }],
		};
		const md = buildMemoMarkdown(result, { date: "2026-04-27", resolveGroupName: () => "" });
		expect(md).toContain("[[P01.md]]");
	});

	it("emits coverage block at top with 4 stats", () => {
		const cov = { ...emptyCoverage(), codesTotal: 5, codesWithMemo: 2, markersTotal: 30, markersWithMemo: 6 };
		const result: MemoViewResult = { groupBy: "code", coverage: cov, byCode: [] };
		const md = buildMemoMarkdown(result, { date: "2026-04-27", resolveGroupName: () => "" });
		expect(md).toContain("**Coverage:** 2/5 codes");
		expect(md).toContain("6/30 markers");
	});

	it("relation app-level emits markerId wikilink", () => {
		const result: MemoViewResult = {
			groupBy: "code", coverage: emptyCoverage(),
			byCode: [{ codeId: "c1", codeName: "A", color: "#abc", depth: 0, groupIds: [], codeMemo: null, groupMemos: [],
				relationMemos: [{ kind: "relation", codeId: "c1", label: "causes", targetId: "c2", targetName: "B", directed: true, memo: "rel memo", level: "application", markerId: "m1", engineType: "markdown" }],
				markerMemos: [], childIds: [], hasAnyMemoInSubtree: true }],
		};
		const md = buildMemoMarkdown(result, { date: "2026-04-27", resolveGroupName: () => "" });
		expect(md).toContain("[[m1]]");
		expect(md).toContain("application-level");
	});
});
