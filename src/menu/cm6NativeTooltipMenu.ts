import { Notice, TextComponent, ToggleComponent, setIcon } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';
import {
	addCodeAction,
	addCodeWithDetailsAction,
	removeCodeAction,
	removeAllCodesAction,
	getCodesAtSelection,
	addExistingCodeAction
} from './menuActions';
import { CodeFormModal } from './codeFormModal';

/**
 * Approach C: CM6 Tooltip + Obsidian Native Components.
 *
 * Combines the best of both worlds:
 * - CM6 tooltip → selection is never lost (no workaround needed)
 * - TextComponent / ToggleComponent → native Obsidian look, theme-aware
 *
 * Layout (faithful port of mqda's createEditorCodingMenu):
 *   [TextComponent: "Enter text..."]   ← Obsidian native input
 *   ☑ código-1  (ToggleComponent)      ← Obsidian native toggle
 *   ☐ código-2  (ToggleComponent)      ← click → stopPropagation + toggle
 *   ───────────── separator ──────────
 *   ⊕ Add New Code
 *   🏷 Add Existing Code
 *   🗑 Remove Code
 *   ⊖ Remove All Codes
 *
 * @param onClose   Closes the tooltip (dispatches showCodingMenuEffect.of(null))
 * @param onRecreate Closes then reopens the tooltip so new toggles appear
 */
export function buildNativeTooltipMenuDOM(
	view: EditorView,
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
	onClose: () => void,
	onRecreate: () => void
): HTMLElement {
	const container = document.createElement('div');
	container.className = 'menu codemarker-tooltip-menu';

	// Apply Obsidian theme colors directly (CSS vars don't cascade into CM6 tooltips)
	applyThemeColors(container);

	// Prevent clicks from propagating to CM6 (would clear selection)
	container.addEventListener('mousedown', (e) => {
		e.stopPropagation();
		e.preventDefault();
	});

	const allCodes = model.getAllCodes();
	const activeCodes = getCodesAtSelection(model, snapshot);

	// ── a) TextComponent at the top ──────────────────────────────────────
	const inputWrapper = document.createElement('div');
	inputWrapper.className = 'menu-item menu-item-textfield';

	const textComponent = new TextComponent(inputWrapper);
	textComponent.setPlaceholder('Enter text...');

	// Style input for current theme
	applyInputTheme(textComponent.inputEl);

	inputWrapper.addEventListener('click', (evt: MouseEvent) => {
		evt.stopPropagation();
		evt.preventDefault();
		textComponent.inputEl.focus();
	});

	// Enter → add code → recreate tooltip (new toggle appears)
	textComponent.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
		if (evt.key === 'Enter') {
			evt.stopPropagation();
			evt.preventDefault();
			const name = textComponent.inputEl.value.trim();
			if (name) {
				addCodeAction(model, snapshot, name);
				onRecreate();
			}
		} else if (evt.key === 'Escape') {
			onClose();
		}
	});

	container.appendChild(inputWrapper);

	// ── b) ToggleComponent for each existing code ────────────────────────
	if (allCodes.length > 0) {
		container.appendChild(createSeparator());
	}

	for (const codeItem of allCodes) {
		const isActive = activeCodes.includes(codeItem.name);

		const itemEl = document.createElement('div');
		itemEl.className = 'menu-item menu-item-toggle';

		const toggle = new ToggleComponent(itemEl);
		toggle.setValue(isActive);
		// Prevent double-toggle: ToggleComponent handles its own click internally,
		// so stop it from bubbling to itemEl's click handler which would toggle again.
		toggle.toggleEl.addEventListener('click', (evt) => {
			evt.stopPropagation();
		});
		toggle.onChange((value) => {
			if (value) {
				addCodeAction(model, snapshot, codeItem.name);
			} else {
				removeCodeAction(model, snapshot, codeItem.name);
			}
		});

		const titleEl = document.createElement('span');
		titleEl.className = 'menu-item-title';
		titleEl.textContent = codeItem.name;
		itemEl.appendChild(titleEl);

		// Click anywhere on item → stopPropagation (menu stays open) + toggle inverts
		itemEl.addEventListener('click', (evt: MouseEvent) => {
			evt.stopPropagation();
			const currentValue = toggle.getValue();
			toggle.setValue(!currentValue);
		});

		container.appendChild(itemEl);
	}

	// ── c) Separator after toggles ───────────────────────────────────────
	container.appendChild(createSeparator());

	// ── d) 4 action buttons ──────────────────────────────────────────────
	container.appendChild(
		createActionItem('Add New Code', 'plus-circle', () => {
			onClose();
			new CodeFormModal(
				model.plugin.app,
				model.getSettings().defaultColor,
				(name, color, description) => {
					addCodeWithDetailsAction(model, snapshot, name, color, description);
					onRecreate();
				}
			).open();
		})
	);

	container.appendChild(
		createActionItem('Add Existing Code', 'tag', () => {
			addExistingCodeAction(model, snapshot);
			onClose();
		})
	);

	container.appendChild(
		createActionItem('Remove Code', 'trash', () => {
			const codesAtSel = getCodesAtSelection(model, snapshot);
			if (codesAtSel.length > 0) {
				for (const code of codesAtSel) {
					removeCodeAction(model, snapshot, code);
				}
				new Notice('Codes removed from selection');
			} else {
				new Notice('No codes at selection');
			}
			onClose();
		})
	);

	container.appendChild(
		createActionItem('Remove All Codes', 'minus-circle', () => {
			removeAllCodesAction(model, snapshot);
			new Notice('All codes removed');
			onClose();
		})
	);

	// ── e) Auto-focus TextComponent (skip in hover mode — user is navigating) ──
	if (!snapshot.hoverMarkerId) {
		setTimeout(() => textComponent.inputEl.focus(), 50);
	}

	return container;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function createActionItem(title: string, iconName: string, onClick: () => void): HTMLElement {
	const item = document.createElement('div');
	item.className = 'menu-item';

	const iconEl = document.createElement('div');
	iconEl.className = 'menu-item-icon';
	setIcon(iconEl, iconName);

	const titleEl = document.createElement('div');
	titleEl.className = 'menu-item-title';
	titleEl.textContent = title;

	item.appendChild(iconEl);
	item.appendChild(titleEl);

	item.addEventListener('click', (e) => {
		e.stopPropagation();
		onClick();
	});

	return item;
}

function createSeparator(): HTMLElement {
	const sep = document.createElement('div');
	sep.className = 'menu-separator';
	return sep;
}

/**
 * Read computed CSS variable values from document.body and apply
 * them as inline styles on the container. This ensures the tooltip
 * respects Obsidian's current theme even inside CM6's tooltip DOM.
 */
function applyThemeColors(container: HTMLElement) {
	const s = getComputedStyle(document.body);
	const get = (v: string) => s.getPropertyValue(v).trim();

	container.style.backgroundColor = get('--background-secondary');
	container.style.borderColor = get('--background-modifier-border');
	container.style.color = get('--text-normal');

	// Copy key CSS variables onto the container so children can use them
	const vars = [
		'--background-primary', '--background-secondary',
		'--background-modifier-border', '--background-modifier-hover',
		'--background-modifier-border-hover',
		'--text-normal', '--text-muted',
		'--interactive-accent', '--interactive-accent-rgb',
		'--font-ui-small',
		'--size-2-1', '--size-4-1', '--size-4-2',
		'--radius-s', '--radius-m',
		'--shadow-s',
		'--toggle-border-width', '--toggle-width', '--toggle-radius',
		'--toggle-thumb-color-off', '--toggle-thumb-color-on',
		'--toggle-background-off', '--toggle-background-on',
	];
	for (const v of vars) {
		const val = get(v);
		if (val) container.style.setProperty(v, val);
	}
}

function applyInputTheme(input: HTMLInputElement) {
	const s = getComputedStyle(document.body);
	input.style.backgroundColor = s.getPropertyValue('--background-primary').trim();
	input.style.color = s.getPropertyValue('--text-normal').trim();
	input.style.borderColor = s.getPropertyValue('--background-modifier-border').trim();
}
