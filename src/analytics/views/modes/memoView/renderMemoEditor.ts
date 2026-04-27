import type { AnalyticsViewContext } from "../../analyticsViewContext";

/**
 * Click-to-edit memo display. Renders as plain `<p>` until clicked, then promotes
 * to `<textarea>` with debounced save (500ms) + suspendRefresh during typing.
 * Blur reverts back to plain `<p>`. Pattern reduces DOM weight massively when
 * many memos are visible (Notion/Linear/Atlas.ti style).
 */
export function renderMemoEditor(
	parent: HTMLElement,
	initial: string,
	onSave: (value: string) => void,
	ctx: AnalyticsViewContext,
): HTMLElement {
	const wrap = parent.createDiv({ cls: "memo-view-editor-wrap" });
	let currentValue = initial;

	const renderDisplay = (): void => {
		wrap.empty();
		const p = wrap.createEl("p", { cls: "memo-view-editor-display", text: currentValue });
		p.setAttribute("role", "textbox");
		p.setAttribute("tabindex", "0");
		p.setAttribute("title", "Click to edit");
		p.addEventListener("click", () => promoteToEditor());
		p.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter" || ev.key === " ") {
				ev.preventDefault();
				promoteToEditor();
			}
		});
	};

	const promoteToEditor = (): void => {
		wrap.empty();
		const textarea = wrap.createEl("textarea", { cls: "memo-view-editor" });
		textarea.value = currentValue;
		textarea.rows = Math.min(Math.max(2, currentValue.split("\n").length + 1), 10);

		let timeout: number | null = null;
		let suspended = false;

		const fireSave = (): void => {
			if (textarea.value !== currentValue) {
				currentValue = textarea.value;
				onSave(currentValue);
			}
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
			} else if (suspended) {
				ctx.resumeRefresh();
				suspended = false;
			}
			renderDisplay();
		});

		textarea.focus();
		// Posiciona cursor no fim
		textarea.setSelectionRange(textarea.value.length, textarea.value.length);
	};

	renderDisplay();
	return wrap;
}
