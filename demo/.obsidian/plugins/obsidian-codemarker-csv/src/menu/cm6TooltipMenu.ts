import { EditorView } from '@codemirror/view';
import { Notice } from 'obsidian';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';
import { addCodeAction, removeCodeAction, removeAllCodesAction, getCodesAtSelection } from './menuActions';

/**
 * Approach B: CM6 Tooltip menu.
 *
 * Builds an HTML menu that looks like Obsidian's native menu using
 * Obsidian's CSS classes (.menu, .menu-item, .menu-separator) and CSS
 * variables. Rendered inside a CM6 tooltip so the selection is never lost.
 *
 * @param onClose Callback to close the tooltip (dispatches the close effect)
 */
export function buildTooltipMenuDOM(
	view: EditorView,
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
	onClose: () => void
): HTMLElement {
	const container = document.createElement('div');
	container.className = 'menu codemarker-tooltip-menu';

	// Prevent clicks from propagating to CM6 (which would clear selection)
	container.addEventListener('mousedown', (e) => {
		e.stopPropagation();
		e.preventDefault();
	});

	const allCodes = model.getAllCodes();
	const activeCodes = getCodesAtSelection(model, snapshot);

	// Text input for new code name
	const inputWrapper = document.createElement('div');
	inputWrapper.className = 'menu-item codemarker-tooltip-input-wrapper';

	const input = document.createElement('input');
	input.type = 'text';
	input.placeholder = 'Enter code name...';
	input.className = 'codemarker-tooltip-input';

	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.stopPropagation();
			e.preventDefault();
			const name = input.value.trim();
			if (name) {
				addCodeAction(model, snapshot, name);
				new Notice(`Code "${name}" added`);
				onClose();
			}
		} else if (e.key === 'Escape') {
			onClose();
		}
	});

	inputWrapper.appendChild(input);
	container.appendChild(inputWrapper);

	// Separator
	if (allCodes.length > 0) {
		container.appendChild(createSeparator());
	}

	// Existing codes as toggle items
	for (const codeItem of allCodes) {
		const isActive = activeCodes.includes(codeItem.name);
		const item = createMenuItem(
			codeItem.name,
			isActive ? checkCircleIcon() : circleIcon(),
			() => {
				if (isActive) {
					removeCodeAction(model, snapshot, codeItem.name);
					new Notice(`Code "${codeItem.name}" removed`);
				} else {
					addCodeAction(model, snapshot, codeItem.name);
					new Notice(`Code "${codeItem.name}" added`);
				}
				onClose();
			}
		);
		container.appendChild(item);
	}

	// Separator + Remove All Codes
	container.appendChild(createSeparator());

	const removeAllItem = createMenuItem(
		'Remove All Codes',
		trashIcon(),
		() => {
			removeAllCodesAction(model, snapshot);
			new Notice('All codes removed');
			onClose();
		}
	);
	container.appendChild(removeAllItem);

	// Auto-focus input
	setTimeout(() => input.focus(), 50);

	return container;
}

function createMenuItem(title: string, iconSvg: string, onClick: () => void): HTMLElement {
	const item = document.createElement('div');
	item.className = 'menu-item';

	const icon = document.createElement('div');
	icon.className = 'menu-item-icon';
	icon.innerHTML = iconSvg;

	const titleEl = document.createElement('div');
	titleEl.className = 'menu-item-title';
	titleEl.textContent = title;

	item.appendChild(icon);
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

function checkCircleIcon(): string {
	return '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
}

function circleIcon(): string {
	return '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';
}

function trashIcon(): string {
	return '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
}
