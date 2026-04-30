import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderMemoEditor } from "../../src/analytics/views/modes/memoView/renderMemoEditor";
import {
	onSaveCodeMemo,
	onSaveGroupMemo,
	onSaveCodeRelationMemo,
	onSaveMarkerMemo,
	onSaveAppRelationMemo,
} from "../../src/analytics/views/modes/memoView/onSaveHandlers";

describe("renderMemoEditor (click-to-edit)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	function getDisplay(wrap: HTMLElement): HTMLElement {
		return wrap.querySelector(".memo-view-editor-display") as HTMLElement;
	}
	function getTextarea(wrap: HTMLElement): HTMLTextAreaElement | null {
		return wrap.querySelector("textarea");
	}

	it("renders as <p> display by default (no textarea in DOM)", () => {
		const onSave = vi.fn();
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const wrap = renderMemoEditor(document.body, "initial value", onSave, ctx);
		expect(getDisplay(wrap)).toBeTruthy();
		expect(getDisplay(wrap).textContent).toBe("initial value");
		expect(getTextarea(wrap)).toBeNull();
	});

	it("click on display promotes to textarea + focuses it", () => {
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const wrap = renderMemoEditor(document.body, "x", vi.fn(), ctx);
		getDisplay(wrap).click();
		const ta = getTextarea(wrap);
		expect(ta).not.toBeNull();
		expect(ta!.value).toBe("x");
	});

	it("Enter/Space on display promotes (a11y)", () => {
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const wrap = renderMemoEditor(document.body, "x", vi.fn(), ctx);
		getDisplay(wrap).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(getTextarea(wrap)).not.toBeNull();
	});

	it("debounces save 500ms after input (after promote)", () => {
		const onSave = vi.fn();
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const wrap = renderMemoEditor(document.body, "init", onSave, ctx);
		getDisplay(wrap).click();
		const ta = getTextarea(wrap)!;
		ta.value = "new";
		ta.dispatchEvent(new Event("input"));
		expect(onSave).not.toHaveBeenCalled();
		expect(ctx.suspendRefresh).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(501);
		expect(onSave).toHaveBeenCalledWith("new");
		expect(ctx.resumeRefresh).toHaveBeenCalledTimes(1);
	});

	it("blur with pending timeout forces immediate save + reverts to display", () => {
		const onSave = vi.fn();
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const wrap = renderMemoEditor(document.body, "x", onSave, ctx);
		getDisplay(wrap).click();
		const ta = getTextarea(wrap)!;
		ta.value = "y";
		ta.dispatchEvent(new Event("input"));
		ta.dispatchEvent(new Event("blur"));
		expect(onSave).toHaveBeenCalledWith("y");
		expect(ctx.resumeRefresh).toHaveBeenCalledTimes(1);
		// After blur, textarea is gone, display is back with new value
		expect(getTextarea(wrap)).toBeNull();
		expect(getDisplay(wrap).textContent).toBe("y");
	});

	it("blur without changing value does not save", () => {
		const onSave = vi.fn();
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const wrap = renderMemoEditor(document.body, "x", onSave, ctx);
		getDisplay(wrap).click();
		const ta = getTextarea(wrap)!;
		ta.dispatchEvent(new Event("blur"));
		expect(onSave).not.toHaveBeenCalled();
		expect(getTextarea(wrap)).toBeNull();
	});

	it("multiple rapid inputs only save once after final 500ms", () => {
		const onSave = vi.fn();
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const wrap = renderMemoEditor(document.body, "", onSave, ctx);
		getDisplay(wrap).click();
		const ta = getTextarea(wrap)!;
		ta.value = "a"; ta.dispatchEvent(new Event("input"));
		vi.advanceTimersByTime(200);
		ta.value = "ab"; ta.dispatchEvent(new Event("input"));
		vi.advanceTimersByTime(200);
		ta.value = "abc"; ta.dispatchEvent(new Event("input"));
		vi.advanceTimersByTime(500);
		expect(onSave).toHaveBeenCalledTimes(1);
		expect(onSave).toHaveBeenCalledWith("abc");
	});

	it("after blur+save, click again uses NEW value (not stale initial)", () => {
		const onSave = vi.fn();
		const ctx = { suspendRefresh: vi.fn(), resumeRefresh: vi.fn() } as any;
		const wrap = renderMemoEditor(document.body, "first", onSave, ctx);
		getDisplay(wrap).click();
		let ta = getTextarea(wrap)!;
		ta.value = "second";
		ta.dispatchEvent(new Event("input"));
		ta.dispatchEvent(new Event("blur"));
		// Re-click should now show "second" (not "first")
		getDisplay(wrap).click();
		ta = getTextarea(wrap)!;
		expect(ta.value).toBe("second");
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
		const marker = { id: "m1", memo: { content: "old" } };
		const findMarker = vi.fn().mockReturnValue(marker);
		const markDirty = vi.fn();
		const ctx = { plugin: { dataManager: { findMarker, markDirty } } } as any;
		onSaveMarkerMemo(ctx, "markdown", "m1", "new");
		expect(findMarker).toHaveBeenCalledWith("markdown", "m1");
		expect(marker.memo).toEqual({ content: "new" });
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
		const marker = { id: "m1", codes: [{ codeId: "c1", relations: [{ label: "x", target: "c2", directed: true, memo: { content: "old" } }] }] };
		const findMarker = vi.fn().mockReturnValue(marker);
		const markDirty = vi.fn();
		const ctx = { plugin: { dataManager: { findMarker, markDirty } } } as any;
		onSaveAppRelationMemo(ctx, "markdown", "m1", "c1", "x", "c2", "new");
		expect(marker.codes[0]!.relations![0]!.memo).toEqual({ content: "new" });
		expect(markDirty).toHaveBeenCalled();
	});
});
