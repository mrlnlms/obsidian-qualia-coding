import { EditorView } from '@codemirror/view';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';
import { showCodingMenuEffect } from '../cm6/selectionMenuField';
import { setSelectionPreviewEffect } from '../cm6/markerStateField';

/**
 * Menu controller — always uses CM6 native tooltip (Approach C).
 */
export class MenuController {
	private model: CodeMarkerModel;
	private isMenuOpen = false;

	constructor(model: CodeMarkerModel) {
		this.model = model;
	}

	closeMenu(editorView: EditorView) {
		editorView.dispatch({
			effects: [
				showCodingMenuEffect.of(null),
				setSelectionPreviewEffect.of(null),
			]
		});
	}

	openMenu(
		editorView: EditorView,
		snapshot: SelectionSnapshot,
		_position: { x: number; y: number }
	) {
		if (this.isMenuOpen) return;
		this.isMenuOpen = true;

		const effects: any[] = [
			showCodingMenuEffect.of({
				pos: snapshot.from,
				end: snapshot.to,
				snapshot
			}),
			setSelectionPreviewEffect.of({ from: snapshot.from, to: snapshot.to })
		];

		const dispatchSpec: any = { effects };
		// Restore CM6 selection for command-triggered menus
		if (!snapshot.hoverMarkerId) {
			dispatchSpec.selection = { anchor: snapshot.from, head: snapshot.to };
		}
		editorView.dispatch(dispatchSpec);
		this.isMenuOpen = false;
	}
}
