import { describe, it, expect } from "vitest";
import { setApplicationRelationMemo } from "../../src/core/codeApplicationHelpers";
import type { CodeApplication } from "../../src/core/types";

describe("setApplicationRelationMemo", () => {
	it("updates memo by tuple match (codeId, label, target)", () => {
		const codes: CodeApplication[] = [
			{ codeId: "c1", relations: [{ label: "x", target: "c2", directed: true }] },
		];
		const ok = setApplicationRelationMemo(codes, "c1", "x", "c2", "new memo");
		expect(ok).toBe(true);
		expect(codes[0]!.relations![0]!.memo).toEqual({ content: "new memo" });
	});

	it("returns false when no match (different codeId)", () => {
		const codes: CodeApplication[] = [{ codeId: "c1", relations: [{ label: "x", target: "c2", directed: true }] }];
		expect(setApplicationRelationMemo(codes, "c2", "x", "c2", "m")).toBe(false);
	});

	it("returns false when relation absent", () => {
		const codes: CodeApplication[] = [{ codeId: "c1", relations: [] }];
		expect(setApplicationRelationMemo(codes, "c1", "x", "y", "m")).toBe(false);
	});

	it("with duplicate tuple, updates only the FIRST (documented limit)", () => {
		const codes: CodeApplication[] = [{
			codeId: "c1",
			relations: [
				{ label: "x", target: "c2", directed: true, memo: { content: "old1" } },
				{ label: "x", target: "c2", directed: true, memo: { content: "old2" } },
			],
		}];
		setApplicationRelationMemo(codes, "c1", "x", "c2", "new");
		expect(codes[0]!.relations![0]!.memo).toEqual({ content: "new" });
		expect(codes[0]!.relations![1]!.memo).toEqual({ content: "old2" });
	});

	it("handles missing relations array (undefined)", () => {
		const codes: CodeApplication[] = [{ codeId: "c1" }];
		expect(setApplicationRelationMemo(codes, "c1", "x", "y", "m")).toBe(false);
	});
});
