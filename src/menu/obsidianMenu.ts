import { Menu, Notice } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';
import { setSelectionPreviewEffect } from '../cm6/markerStateField';
import { addCodeAction, removeCodeAction, removeAllCodesAction, getCodesAtSelection } from './menuActions';

/**
 * Approach A: Obsidian Native Menu with selection preview workaround.
 *
 * Before opening the menu, dispatches setSelectionPreviewEffect to create a
 * Decoration.mark that visually mimics the native selection. This keeps the
 * selected text highlighted while CM6 loses real focus to the menu.
 *
 * On menu close, removes the preview and restores the real CM6 selection.
 */
export function openObsidianMenu(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
	editorView: EditorView,
	position: { x: number; y: number }
) {
	// Show selection preview decoration
	editorView.dispatch({
		effects: setSelectionPreviewEffect.of({ from: snapshot.from, to: snapshot.to })
	});

	const menu = new Menu();
	const allCodes = model.getAllCodes();
	const activeCodes = getCodesAtSelection(model, snapshot);

	// Text input for new code name
	menu.addItem((item) => {
		item.setTitle('New code...')
			.setIcon('plus');

		const dom = (item as any).dom as HTMLElement;
		dom.empty();

		const input = document.createElement('input');
		input.type = 'text';
		input.placeholder = 'Enter code name...';
		input.className = 'codemarker-menu-input';

		input.addEventListener('click', (e) => {
			e.stopPropagation();
			e.preventDefault();
		});

		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.stopPropagation();
				e.preventDefault();
				const name = input.value.trim();
				if (name) {
					addCodeAction(model, snapshot, name);
					new Notice(`Code "${name}" added`);
					menu.hide();
				}
			}
		});

		dom.appendChild(input);
		setTimeout(() => input.focus(), 50);
	});

	menu.addSeparator();

	// Existing codes as toggle items
	for (const codeItem of allCodes) {
		const isActive = activeCodes.includes(codeItem.name);
		menu.addItem((item) => {
			item.setTitle(codeItem.name)
				.setIcon(isActive ? 'check-circle' : 'circle')
				.onClick(() => {
					if (isActive) {
						removeCodeAction(model, snapshot, codeItem.name);
						new Notice(`Code "${codeItem.name}" removed`);
					} else {
						addCodeAction(model, snapshot, codeItem.name);
						new Notice(`Code "${codeItem.name}" added`);
					}
				});
		});
	}

	if (allCodes.length > 0) {
		menu.addSeparator();
	}

	// Remove All Codes
	menu.addItem((item) => {
		item.setTitle('Remove All Codes')
			.setIcon('trash-2')
			.onClick(() => {
				removeAllCodesAction(model, snapshot);
				new Notice('All codes removed');
			});
	});

	// Cleanup on hide: remove preview, restore selection
	menu.onHide(() => {
		try {
			editorView.dispatch({
				effects: setSelectionPreviewEffect.of(null)
			});
			editorView.dispatch({
				selection: { anchor: snapshot.from, head: snapshot.to }
			});
			editorView.focus();
		} catch {
			// View may have been destroyed
		}
	});

	menu.showAtPosition(position);
}
