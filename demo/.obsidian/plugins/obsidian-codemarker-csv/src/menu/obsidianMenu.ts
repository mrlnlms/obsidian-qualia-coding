import { Menu, Notice, TextComponent, ToggleComponent } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';
import { setSelectionPreviewEffect } from '../cm6/markerStateField';
import {
	addCodeAction,
	removeCodeAction,
	removeAllCodesAction,
	getCodesAtSelection,
	addNewCodeAction,
	addExistingCodeAction
} from './menuActions';

/**
 * Approach A: Obsidian Native Menu — faithful port of mqda's createEditorCodingMenu.
 *
 * Layout:
 *   [TextComponent: "Enter text..."]   ← input at the top
 *   ☑ código-1  (ToggleComponent)      ← one per existing code
 *   ☑ código-2  (ToggleComponent)
 *   ───────────── separator ──────────
 *   ⊕ Add New Code
 *   🏷 Add Existing Code
 *   🗑 Remove Code
 *   ⊖ Remove All Codes
 *
 * Before opening, dispatches setSelectionPreviewEffect to keep the
 * selected text highlighted while CM6 loses real focus to the menu.
 * On menu close, removes the preview and restores the real CM6 selection.
 */

const cleanupCallbacks: (() => void)[] = [];
const focusCallbacks: (() => void)[] = [];

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

	// ── a) TextComponent — input at the top (ported from customMenus.ts:512-561) ──
	menu.addItem((item) => {
		const dom = (item as any).dom as HTMLElement;
		const textComponent = new TextComponent(dom);
		textComponent.setPlaceholder('Enter text...');
		dom.classList.add('menu-item-textfield');
		item.setTitle('').setIcon('tag');

		dom.addEventListener('click', (evt: MouseEvent) => {
			evt.stopPropagation();
			evt.preventDefault();
			textComponent.inputEl.focus();
		});

		// Enter → add code → close → RECREATE menu at same position
		const handleEnterKey = (evt: KeyboardEvent) => {
			if (evt.key === 'Enter') {
				evt.stopPropagation();
				evt.preventDefault();
				const name = textComponent.inputEl.value.trim();
				if (name) {
					addCodeAction(model, snapshot, name);
					menu.hide();
					// Recreate menu at the same position with the new toggle
					openObsidianMenu(model, snapshot, editorView, position);
				}
			}
		};

		window.addEventListener('keydown', handleEnterKey, true);
		cleanupCallbacks.push(() => window.removeEventListener('keydown', handleEnterKey, true));

		focusCallbacks.push(() => {
			textComponent.inputEl.focus();
		});
	});

	// ── b) ToggleComponent for each existing code (ported from customMenus.ts:487-510) ──
	for (const codeItem of allCodes) {
		const isActive = activeCodes.includes(codeItem.name);
		menu.addItem((item) => {
			const dom = (item as any).dom as HTMLElement;
			const toggle = new ToggleComponent(dom);
			toggle.setValue(isActive);
			toggle.onChange((value) => {
				if (value) {
					addCodeAction(model, snapshot, codeItem.name);
				} else {
					removeCodeAction(model, snapshot, codeItem.name);
				}
			});
			item.setTitle(codeItem.name).setIcon('tag');
			dom.classList.add('menu-item-toggle');

			// Click → stopPropagation (menu stays open), toggle inverts
			dom.addEventListener('click', (evt: MouseEvent) => {
				evt.stopPropagation();
				const currentValue = toggle.getValue();
				toggle.setValue(!currentValue);
			});
		});
	}

	// ── c) Separator after last toggle ──
	menu.addSeparator();

	// ── d) 4 action buttons (ported from mqda/main.ts:26-32) ──
	menu.addItem((item) => {
		item.setTitle('Add New Code')
			.setIcon('plus-circle')
			.onClick(() => {
				addNewCodeAction(model, snapshot, '');
				menu.hide();
			});
	});

	menu.addItem((item) => {
		item.setTitle('Add Existing Code')
			.setIcon('tag')
			.onClick(() => {
				addExistingCodeAction(model, snapshot);
				menu.hide();
			});
	});

	menu.addItem((item) => {
		item.setTitle('Remove Code')
			.setIcon('trash')
			.onClick(() => {
				// Remove code at selection — if there are active codes, remove the first one
				// In the original mqda this opened a RemoveCodeModal
				const codesAtSel = getCodesAtSelection(model, snapshot);
				if (codesAtSel.length > 0) {
					for (const code of codesAtSel) {
						removeCodeAction(model, snapshot, code);
					}
					new Notice('Codes removed from selection');
				} else {
					new Notice('No codes at selection');
				}
				menu.hide();
			});
	});

	menu.addItem((item) => {
		item.setTitle('Remove All Codes')
			.setIcon('minus-circle')
			.onClick(() => {
				removeAllCodesAction(model, snapshot);
				new Notice('All codes removed');
				menu.hide();
			});
	});

	// ── e) Cleanup on hide (ported from customMenus.ts:574-589) ──
	menu.onHide(() => {
		// Run all cleanup callbacks (e.g. remove keydown listeners)
		for (const cb of cleanupCallbacks) {
			try { cb(); } catch { /* noop */ }
		}
		cleanupCallbacks.length = 0;
		focusCallbacks.length = 0;

		// Remove selection preview and restore real CM6 selection
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

	// Auto-focus the TextComponent after menu is shown
	for (const cb of focusCallbacks) {
		try { cb(); } catch { /* noop */ }
	}
	focusCallbacks.length = 0;
}
