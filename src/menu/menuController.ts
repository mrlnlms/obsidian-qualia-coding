import { EditorView } from '@codemirror/view';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';
import { openObsidianMenu } from './obsidianMenu';
import { showCodingMenuEffect } from '../cm6/selectionMenuField';
import { setSelectionPreviewEffect } from '../cm6/markerStateField';

/**
 * Central orchestrator that decides which menu approach to open.
 *
 * - Approach A (obsidian-native): Uses Obsidian's Menu API with a
 *   selection preview decoration as a workaround for focus loss.
 * - Approach B (cm6-tooltip): Uses a CM6 tooltip that never steals focus.
 */
export class MenuController {
	private model: CodeMarkerModel;
	private isMenuOpen = false;

	constructor(model: CodeMarkerModel) {
		this.model = model;
	}

	openMenu(
		editorView: EditorView,
		snapshot: SelectionSnapshot,
		position: { x: number; y: number }
	) {
		if (this.isMenuOpen) return;
		this.isMenuOpen = true;

		const settings = this.model.getSettings();

		if (settings.menuMode === 'cm6-tooltip' || settings.menuMode === 'cm6-native-tooltip') {
			// Approaches B/C: CM6 Tooltip
			const effects: any[] = [
				showCodingMenuEffect.of({
					pos: snapshot.from,
					end: snapshot.to,
					snapshot
				})
			];
			// Approach C: also show selection preview decoration
			if (settings.menuMode === 'cm6-native-tooltip') {
				effects.push(setSelectionPreviewEffect.of({ from: snapshot.from, to: snapshot.to }));
			}
			editorView.dispatch({ effects });
			// Tooltip manages its own lifecycle via the StateField
			this.isMenuOpen = false;
		} else {
			// Approach A: Obsidian Native Menu with selection preview
			openObsidianMenu(this.model, snapshot, editorView, position);
			// Reset flag after menu interaction (menu.onHide handles cleanup)
			setTimeout(() => { this.isMenuOpen = false; }, 100);
		}
	}
}
