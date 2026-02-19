import { StateField, StateEffect, Extension } from "@codemirror/state";
import { showTooltip, Tooltip, EditorView } from "@codemirror/view";
import { CodeMarkerModel } from "../models/codeMarkerModel";
import { SelectionSnapshot } from "../menu/menuTypes";
import { buildTooltipMenuDOM } from "../menu/cm6TooltipMenu";
import { buildNativeTooltipMenuDOM } from "../menu/cm6NativeTooltipMenu";
import { setSelectionPreviewEffect } from "./markerStateField";

/**
 * Effect to show/hide the CM6 coding tooltip menu (Approaches B & C).
 */
export const showCodingMenuEffect = StateEffect.define<{
	pos: number;
	end: number;
	snapshot: SelectionSnapshot;
} | null>();

/**
 * Internal state for the tooltip field.
 * Tracks both the CM6 Tooltip object and the snapshot that opened it,
 * so we can distinguish hover mode from selection mode.
 */
interface TooltipFieldState {
	tooltip: Tooltip;
	snapshot: SelectionSnapshot;
}

/**
 * Creates the StateField + a cleanup listener for Approach C's selection preview.
 * Returns an array of extensions to be spread into registerEditorExtension.
 */
export const createSelectionMenuField = (model: CodeMarkerModel): Extension => {
	const tooltipField = StateField.define<TooltipFieldState | null>({
		create() {
			return null;
		},

		update(value, tr) {
			for (const effect of tr.effects) {
				if (effect.is(showCodingMenuEffect)) {
					const data = effect.value;
					if (!data) return null;

					return {
						snapshot: data.snapshot,
						tooltip: {
							pos: data.pos,
							end: data.end,
							above: true,
							create(view: EditorView) {
								const settings = model.getSettings();
								const isApproachC = settings.menuMode === 'cm6-native-tooltip';

								const close = () => {
									const effects: any[] = [showCodingMenuEffect.of(null)];
									if (isApproachC) {
										effects.push(setSelectionPreviewEffect.of(null));
									}
									view.dispatch({ effects });
								};

								let dom: HTMLElement;

								if (isApproachC) {
									const recreate = () => {
										view.dispatch({
											effects: [
												showCodingMenuEffect.of(null),
												setSelectionPreviewEffect.of(null)
											]
										});
										setTimeout(() => {
											view.dispatch({
												effects: [
													showCodingMenuEffect.of({
														pos: data.pos,
														end: data.end,
														snapshot: data.snapshot
													}),
													setSelectionPreviewEffect.of({
														from: data.snapshot.from,
														to: data.snapshot.to
													})
												]
											});
										}, 50);
									};
									dom = buildNativeTooltipMenuDOM(view, model, data.snapshot, close, recreate);
								} else {
									dom = buildTooltipMenuDOM(view, model, data.snapshot, close);
								}

								// Emit custom events for hover-intelligent close behavior
								dom.addEventListener('mouseenter', () => {
									document.dispatchEvent(new CustomEvent('codemarker-tooltip-mouseenter'));
								});
								dom.addEventListener('mouseleave', () => {
									document.dispatchEvent(new CustomEvent('codemarker-tooltip-mouseleave'));
								});

								return { dom };
							}
						}
					};
				}
			}

			// Auto-close if selection becomes empty — but NOT for hover-mode menus
			if (value && tr.selection && !value.snapshot.hoverMarkerId) {
				const sel = tr.state.selection.main;
				if (sel.from === sel.to) return null;
			}

			return value;
		},

		provide: field => showTooltip.from(field, state => state?.tooltip ?? null)
	});

	// Cleanup listener: when tooltip transitions from open → null,
	// clear the selection preview decoration (Approach C).
	const previewCleanup = EditorView.updateListener.of((update) => {
		if (model.getSettings().menuMode !== 'cm6-native-tooltip') return;

		const before = update.startState.field(tooltipField, false);
		const after = update.state.field(tooltipField, false);

		// Tooltip just closed (was open, now null) — clean up preview + empty markers
		if (before?.tooltip && !after?.tooltip) {
			// Clean up empty marker left by deferred deletion in hover mode
			if (before.snapshot.hoverMarkerId) {
				model.cleanupEmptyMarker(before.snapshot.hoverMarkerId);
			}

			// Check if preview was already cleared by an explicit close()
			// by looking for setSelectionPreviewEffect in this transaction
			const alreadyCleared = update.transactions.some(tr =>
				tr.effects.some(e => e.is(setSelectionPreviewEffect) && e.value === null)
			);
			if (!alreadyCleared) {
				requestAnimationFrame(() => {
					update.view.dispatch({
						effects: setSelectionPreviewEffect.of(null)
					});
				});
			}
		}
	});

	return [tooltipField, previewCleanup];
};
