import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderMemoEditor } from "../../src/analytics/views/modes/memoView/renderMemoEditor";
import {
	onSaveCodeMemo,
	onSaveGroupMemo,
	onSaveCodeRelationMemo,
	onSaveMarkerMemo,
	onSaveAppRelationMemo,
} from "../../src/analytics/views/modes/memoView/onSaveHandlers";

describe("renderMemoEditor", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("debounces save 500ms after input", () => {
		const onSave = vi.fn();
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const ta = renderMemoEditor(document.body, "init", onSave, ctx);
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

	it("blur with pending timeout forces immediate save", () => {
		const onSave = vi.fn();
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const ta = renderMemoEditor(document.body, "x", onSave, ctx);
		ta.value = "y";
		ta.dispatchEvent(new Event("input"));
		ta.dispatchEvent(new Event("blur"));
		expect(onSave).toHaveBeenCalledWith("y");
		expect(ctx.resumeRefresh).toHaveBeenCalledTimes(1);
	});

	it("blur without prior input does not save", () => {
		const onSave = vi.fn();
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const ta = renderMemoEditor(document.body, "x", onSave, ctx);
		ta.dispatchEvent(new Event("blur"));
		expect(onSave).not.toHaveBeenCalled();
	});

	it("multiple rapid inputs only save once after final 500ms", () => {
		const onSave = vi.fn();
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const ta = renderMemoEditor(document.body, "", onSave, ctx);
		ta.value = "a"; ta.dispatchEvent(new Event("input"));
		vi.advanceTimersByTime(200);
		ta.value = "ab"; ta.dispatchEvent(new Event("input"));
		vi.advanceTimersByTime(200);
		ta.value = "abc"; ta.dispatchEvent(new Event("input"));
		vi.advanceTimersByTime(500);
		expect(onSave).toHaveBeenCalledTimes(1);
		expect(onSave).toHaveBeenCalledWith("abc");
		expect(ctx.suspendRefresh).toHaveBeenCalledTimes(1);
		expect(ctx.resumeRefresh).toHaveBeenCalledTimes(1);
	});
});

describe("onSaveHandlers", () => {
	it("onSaveCodeMemo calls registry.update with { memo: value }", () => {
		const update = vi.fn();
		const ctx = { plugin: { registry: { update } } } as any;
		onSaveCodeMemo(ctx, "c1", "memo");
		expect(update).toHaveBeenCalledWith("c1", { memo: "memo" });
	});

	it("onSaveGroupMemo calls registry.setGroupMemo", () => {
		const setGroupMemo = vi.fn();
		const ctx = { plugin: { registry: { setGroupMemo } } } as any;
		onSaveGroupMemo(ctx, "g1", "m");
		expect(setGroupMemo).toHaveBeenCalledWith("g1", "m");
	});

	it("onSaveCodeRelationMemo calls registry.setRelationMemo with tuple", () => {
		const setRelationMemo = vi.fn();
		const ctx = { plugin: { registry: { setRelationMemo } } } as any;
		onSaveCodeRelationMemo(ctx, "c1", "x", "c2", "m");
		expect(setRelationMemo).toHaveBeenCalledWith("c1", "x", "c2", "m");
	});

	it("onSaveMarkerMemo: findMarker + mutates marker.memo + markDirty", () => {
		const marker = { id: "m1", memo: "old" };
		const findMarker = vi.fn().mockReturnValue(marker);
		const markDirty = vi.fn();
		const ctx = { plugin: { dataManager: { findMarker, markDirty } } } as any;
		onSaveMarkerMemo(ctx, "markdown", "m1", "new");
		expect(findMarker).toHaveBeenCalledWith("markdown", "m1");
		expect(marker.memo).toBe("new");
		expect(markDirty).toHaveBeenCalled();
	});

	it("onSaveMarkerMemo: when findMarker returns null, no-op (no markDirty)", () => {
		const findMarker = vi.fn().mockReturnValue(null);
		const markDirty = vi.fn();
		const ctx = { plugin: { dataManager: { findMarker, markDirty } } } as any;
		onSaveMarkerMemo(ctx, "markdown", "missing", "new");
		expect(markDirty).not.toHaveBeenCalled();
	});

	it("onSaveAppRelationMemo: findMarker + setApplicationRelationMemo + markDirty", () => {
		const marker = { id: "m1", codes: [{ codeId: "c1", relations: [{ label: "x", target: "c2", directed: true, memo: "old" }] }] };
		const findMarker = vi.fn().mockReturnValue(marker);
		const markDirty = vi.fn();
		const ctx = { plugin: { dataManager: { findMarker, markDirty } } } as any;
		onSaveAppRelationMemo(ctx, "markdown", "m1", "c1", "x", "c2", "new");
		expect(marker.codes[0]!.relations![0]!.memo).toBe("new");
		expect(markDirty).toHaveBeenCalled();
	});
});
