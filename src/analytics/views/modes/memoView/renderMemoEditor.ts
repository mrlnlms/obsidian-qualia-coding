import type { AnalyticsViewContext } from "../../analyticsViewContext";

/**
 * Inline textarea editor with debounced save (500ms) + suspendRefresh during typing.
 * Pattern shared by all 5 memo kinds (code, group, relation code-level, relation app-level, marker).
 */
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
