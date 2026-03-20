/**
 * hoverBridge — Syncs hover state between CodeMarkerModel and CM6 setHoverEffect.
 *
 * Direction 1 (sidebar → editor): model.onHoverChange → dispatch setHoverEffect
 * Direction 2 (editor → sidebar): setHoverEffect transaction → model.setHoverState
 */

import { ViewPlugin, EditorView, PluginValue, ViewUpdate } from '@codemirror/view';
import { setHoverEffect } from './markerStateField';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { findFileIdForEditorView } from './utils/viewLookupUtils';

export const createHoverBridge = (model: CodeMarkerModel) => {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			private view: EditorView;
			private boundModelToEditor: () => void;
			private suppressModelSync = false;

			constructor(view: EditorView) {
				this.view = view;
				this.boundModelToEditor = () => this.onModelHoverChange();
				model.onHoverChange(this.boundModelToEditor);
			}

			/** Direction 1: model hover changed (from sidebar) → dispatch to CM6 */
			private onModelHoverChange() {
				if (this.suppressModelSync) return;

				const markerId = model.getHoverMarkerId();
				const hoveredIds = model.getHoverMarkerIds();
				this.view.dispatch({
					effects: setHoverEffect.of({
						markerId,
						hoveredIds: hoveredIds.length > 0 ? hoveredIds : undefined
					})
				});
			}

			/** Direction 2: CM6 hover changed (from editor/margin) → sync to model */
			update(update: ViewUpdate) {
				for (const tr of update.transactions) {
					for (const effect of tr.effects) {
						if (effect.is(setHoverEffect)) {
							const { markerId, hoveredIds } = effect.value;
							const ids = hoveredIds ?? (markerId ? [markerId] : []);

							// Avoid feedback loop: if model already matches, skip
							const modelIds = model.getHoverMarkerIds();
							if (model.getHoverMarkerId() === markerId
								&& modelIds.length === ids.length
								&& modelIds.every((id, i) => id === ids[i])) continue;

							// Find the code name for the primary marker
							let codeName: string | null = null;
							if (markerId) {
								const marker = model.getMarkerById(markerId);
								codeName = marker?.codes[0] ?? null;
							}

							// Suppress to prevent onModelHoverChange from re-dispatching
							this.suppressModelSync = true;
							model.setHoverState(markerId, codeName, ids);
							this.suppressModelSync = false;
						}
					}
				}
			}

			destroy() {
				model.offHoverChange(this.boundModelToEditor);
			}
		}
	);
};
