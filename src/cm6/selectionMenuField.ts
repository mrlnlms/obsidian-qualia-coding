import { StateField, StateEffect } from "@codemirror/state";
import { showTooltip, Tooltip, EditorView } from "@codemirror/view";
import { CodeMarkerModel } from "../models/codeMarkerModel";
import { SelectionSnapshot } from "../menu/menuTypes";
import { buildTooltipMenuDOM } from "../menu/cm6TooltipMenu";

/**
 * Effect to show/hide the CM6 coding tooltip menu (Approach B).
 */
export const showCodingMenuEffect = StateEffect.define<{
	pos: number;
	end: number;
	snapshot: SelectionSnapshot;
} | null>();

/**
 * StateField that provides a Tooltip to CM6's showTooltip facet.
 * The tooltip is positioned at the selection and contains the coding menu.
 * Selection is never lost because the tooltip lives within CM6's DOM.
 */
export const createSelectionMenuField = (model: CodeMarkerModel) => {
	return StateField.define<Tooltip | null>({
		create() {
			return null;
		},

		update(value, tr) {
			for (const effect of tr.effects) {
				if (effect.is(showCodingMenuEffect)) {
					const data = effect.value;
					if (!data) return null;

					return {
						pos: data.pos,
						end: data.end,
						above: true,
						create(view: EditorView) {
							const close = () => {
								view.dispatch({
									effects: showCodingMenuEffect.of(null)
								});
							};
							const dom = buildTooltipMenuDOM(view, model, data.snapshot, close);
							return { dom };
						}
					};
				}
			}

			// Auto-close if selection becomes empty
			if (value && tr.selection) {
				const sel = tr.state.selection.main;
				if (sel.from === sel.to) return null;
			}

			return value;
		},

		provide: field => showTooltip.from(field)
	});
};
