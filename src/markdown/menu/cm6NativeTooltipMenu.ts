import { Notice, TextComponent, ToggleComponent, setIcon } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';
import {
	addCodeAction,
	addCodeWithDetailsAction,
	removeCodeAction,
	removeAllCodesAction,
	getCodesAtSelection
} from './menuActions';
import { CodeFormModal } from '../../core/codeFormModal';
import { CodeBrowserModal } from '../../core/codeBrowserModal';
import { setSelectionPreviewEffect } from '../cm6/markerStateField';
import { createActionItem, createSeparator, applyThemeColors, applyInputTheme } from '../../core/baseCodingMenu';

/**
 * Approach C: CM6 Tooltip + Obsidian Native Components.
 *
 * Selection layout (new marker):
 *   [Search / create input]
 *   ☐ recent codes (toggles)
 *   Browse all codes…
 *   ─────────────
 *   ⊕ Add New Code
 *
 * Hover layout (existing marker):
 *   [Search / create input]
 *   ☐ recent inactive codes (suggestions)
 *   Browse all codes…
 *   ─────────────
 *   ☑ active codes on marker
 *   ─────────────
 *   Memo (collapsible)
 *   ─────────────
 *   ⊕ Add New Code
 *   🗑 Delete Marker
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
	const MAX_RECENT = 3;

	// ── a) Search / create input at the top ─────────────────────────────
	const inputWrapper = document.createElement('div');
	inputWrapper.className = 'menu-item menu-item-textfield';

	const textComponent = new TextComponent(inputWrapper);
	textComponent.setPlaceholder('Search or create code...');

	applyInputTheme(textComponent.inputEl);

	inputWrapper.addEventListener('click', (evt: MouseEvent) => {
		evt.stopPropagation();
		evt.preventDefault();
		textComponent.inputEl.focus();
	});

	// Enter → toggle existing code ON or create new code
	textComponent.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
		if (evt.key === 'Enter') {
			evt.stopPropagation();
			evt.preventDefault();
			const name = textComponent.inputEl.value.trim();
			if (!name) return;
			const existingCode = allCodes.find(c => c.name.toLowerCase() === name.toLowerCase());
			if (existingCode) {
				// Toggle ON existing code
				addCodeAction(model, snapshot, existingCode.name);
				textComponent.inputEl.value = '';
				rebuildSuggestions();
			} else {
				// Create new code
				addCodeAction(model, snapshot, name);
				onRecreate();
			}
		} else if (evt.key === 'Escape') {
			onClose();
		}
	});

	// Live filter on input
	textComponent.inputEl.addEventListener('input', () => {
		rebuildSuggestions(textComponent.inputEl.value.trim());
	});

	container.appendChild(inputWrapper);

	// Find existing marker
	const existingMarker = snapshot.hoverMarkerId
		? model.getMarkerById(snapshot.hoverMarkerId)
		: model.findMarkerAtExactRange(snapshot);

	const isHoverMode = !!snapshot.hoverMarkerId && !!existingMarker;

	// ── Shared: render a toggle item ────────────────────────────────────
	function createToggleItem(
		codeItem: { name: string; color: string },
		isActive: boolean,
		zone: HTMLElement
	) {
		let currentlyActive = isActive;

		const itemEl = document.createElement('div');
		itemEl.className = 'menu-item menu-item-toggle';

		const swatch = document.createElement('span');
		swatch.className = 'codemarker-tooltip-swatch';
		swatch.style.backgroundColor = codeItem.color;
		itemEl.appendChild(swatch);

		const toggle = new ToggleComponent(itemEl);
		toggle.setValue(isActive);
		toggle.toggleEl.addEventListener('click', (evt) => evt.stopPropagation());

		const titleEl = document.createElement('span');
		titleEl.className = 'menu-item-title';
		titleEl.textContent = codeItem.name;
		itemEl.appendChild(titleEl);

		// Navigation arrow — always visible
		const navBtn = document.createElement('span');
		navBtn.className = 'codemarker-tooltip-nav';
		setIcon(navBtn, 'arrow-up-right');
		navBtn.title = 'Open in sidebar';
		navBtn.addEventListener('click', (evt) => {
			evt.stopPropagation();
			const marker = snapshot.hoverMarkerId
				? model.getMarkerById(snapshot.hoverMarkerId)
				: model.findMarkerAtExactRange(snapshot);
			if (currentlyActive && marker) {
				// Active code with marker → open marker-focused detail
				document.dispatchEvent(new CustomEvent('codemarker:label-click', {
					detail: { markerId: marker.id, codeName: codeItem.name }
				}));
			} else {
				// Inactive code → open code-focused detail
				document.dispatchEvent(new CustomEvent('codemarker:code-click', {
					detail: { codeName: codeItem.name }
				}));
			}
		});
		itemEl.appendChild(navBtn);

		toggle.onChange((value) => {
			currentlyActive = value;
			if (value) {
				addCodeAction(model, snapshot, codeItem.name);
				activeCodes.push(codeItem.name);
			} else {
				removeCodeAction(model, snapshot, codeItem.name);
				const idx = activeCodes.indexOf(codeItem.name);
				if (idx >= 0) activeCodes.splice(idx, 1);
			}
			updateMemoVisibility();
		});

		itemEl.addEventListener('click', (evt: MouseEvent) => {
			evt.stopPropagation();
			toggle.setValue(!toggle.getValue());
		});

		zone.appendChild(itemEl);
	}

	// ── Shared: "Browse all codes…" item ────────────────────────────────
	function appendBrowseItem(zone: HTMLElement) {
		const browseItem = document.createElement('div');
		browseItem.className = 'menu-item codemarker-tooltip-browse';
		const browseIcon = document.createElement('div');
		browseIcon.className = 'menu-item-icon';
		setIcon(browseIcon, 'tag');
		browseItem.appendChild(browseIcon);
		const browseTitle = document.createElement('span');
		browseTitle.className = 'menu-item-title';
		browseTitle.textContent = 'Browse all codes…';
		browseItem.appendChild(browseTitle);
		browseItem.addEventListener('click', (evt) => {
			evt.stopPropagation();
			onClose();
			new CodeBrowserModal(
				model.plugin.app,
				model.registry,
				(codeName) => { addCodeAction(model, snapshot, codeName); }
			).open();
		});
		zone.appendChild(browseItem);
	}

	// ── b) Suggestion zone (inactive codes for adding) ──────────────────
	container.appendChild(createSeparator());

	const suggestionZone = document.createElement('div');
	suggestionZone.className = 'codemarker-tooltip-toggle-zone';
	container.appendChild(suggestionZone);

	function rebuildSuggestions(filter?: string) {
		suggestionZone.empty();
		const q = (filter ?? '').toLowerCase();

		let inactiveCodes: typeof allCodes;
		if (q) {
			// Filter: show all inactive matching codes
			inactiveCodes = allCodes.filter(
				c => !activeCodes.includes(c.name) && c.name.toLowerCase().includes(q)
			);
		} else {
			// Default: up to 5 most recent inactive
			inactiveCodes = allCodes
				.filter(c => !activeCodes.includes(c.name))
				.sort((a, b) => b.createdAt - a.createdAt)
				.slice(0, MAX_RECENT);
		}

		if (!isHoverMode && !q) {
			// Selection mode without filter: show ALL codes (active + inactive)
			const active = allCodes.filter(c => activeCodes.includes(c.name));
			const inactive = allCodes
				.filter(c => !activeCodes.includes(c.name))
				.sort((a, b) => b.createdAt - a.createdAt)
				.slice(0, MAX_RECENT);
			for (const c of [...active, ...inactive]) {
				createToggleItem(c, activeCodes.includes(c.name), suggestionZone);
			}
			appendBrowseItem(suggestionZone);
			return;
		}

		if (!isHoverMode && q) {
			// Selection mode with filter: show all matching
			const matching = allCodes.filter(c => c.name.toLowerCase().includes(q));
			for (const c of matching) {
				createToggleItem(c, activeCodes.includes(c.name), suggestionZone);
			}
			if (matching.length === 0) {
				const hint = document.createElement('div');
				hint.className = 'menu-item codemarker-tooltip-hint';
				hint.textContent = `Press Enter to create "${filter}"`;
				suggestionZone.appendChild(hint);
			}
			appendBrowseItem(suggestionZone);
			return;
		}

		// Hover mode: only inactive codes as suggestions
		for (const c of inactiveCodes) {
			createToggleItem(c, false, suggestionZone);
		}

		if (inactiveCodes.length === 0 && q) {
			const hint = document.createElement('div');
			hint.className = 'menu-item codemarker-tooltip-hint';
			hint.textContent = `Press Enter to create "${filter}"`;
			suggestionZone.appendChild(hint);
		}

		appendBrowseItem(suggestionZone);
	}

	rebuildSuggestions();

	// ── c) Active codes zone (only in hover mode) ───────────────────────
	if (isHoverMode && activeCodes.length > 0) {
		container.appendChild(createSeparator());

		const activeZone = document.createElement('div');
		activeZone.className = 'codemarker-tooltip-toggle-zone';

		for (const codeName of activeCodes) {
			const codeItem = allCodes.find(c => c.name === codeName);
			if (codeItem) {
				createToggleItem(codeItem, true, activeZone);
			}
		}

		container.appendChild(activeZone);
	}

	// ── d) Memo collapsible (shown when marker has codes) ───────────────
	const memoSep = createSeparator();
	const memoWrapper = document.createElement('div');
	memoWrapper.className = 'codemarker-tooltip-memo-wrapper';

	const memoHeader = document.createElement('div');
	memoHeader.className = 'codemarker-tooltip-memo-header menu-item';
	const chevron = document.createElement('div');
	chevron.className = 'codemarker-tooltip-memo-chevron';
	setIcon(chevron, 'chevron-right');
	memoHeader.appendChild(chevron);
	const headerTitle = document.createElement('span');
	headerTitle.className = 'menu-item-title';
	headerTitle.textContent = 'Memo';
	memoHeader.appendChild(headerTitle);

	const memoBody = document.createElement('div');
	memoBody.className = 'codemarker-tooltip-memo-body';

	const memoArea = document.createElement('textarea');
	memoArea.className = 'codemarker-tooltip-memo';
	memoArea.placeholder = 'Write a memo...';
	memoArea.rows = 2;
	applyInputTheme(memoArea as unknown as HTMLInputElement);
	memoArea.addEventListener('input', () => {
		const marker = snapshot.hoverMarkerId
			? model.getMarkerById(snapshot.hoverMarkerId)
			: model.findMarkerAtExactRange(snapshot);
		if (!marker) return;
		marker.memo = memoArea.value || undefined;
		marker.updatedAt = Date.now();
		model.saveMarkers();
	});
	memoArea.addEventListener('mousedown', (e) => e.stopPropagation());
	memoArea.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') onClose();
		e.stopPropagation();
	});
	memoBody.appendChild(memoArea);

	// Initial memo state
	const initMarkerMemo = existingMarker?.memo?.trim() ?? '';
	memoArea.value = existingMarker?.memo ?? '';
	let memoExpanded = !!initMarkerMemo;
	memoBody.style.display = memoExpanded ? '' : 'none';
	if (memoExpanded) memoWrapper.addClass('is-open');

	memoHeader.addEventListener('click', (e) => {
		e.stopPropagation();
		memoExpanded = !memoExpanded;
		memoBody.style.display = memoExpanded ? '' : 'none';
		memoWrapper.toggleClass('is-open', memoExpanded);
		if (memoExpanded) memoArea.focus();
	});

	memoWrapper.appendChild(memoHeader);
	memoWrapper.appendChild(memoBody);
	container.appendChild(memoSep);
	container.appendChild(memoWrapper);

	// Show/hide memo based on whether any codes are active
	const hasCodes = activeCodes.length > 0;
	memoSep.style.display = hasCodes ? '' : 'none';
	memoWrapper.style.display = hasCodes ? '' : 'none';

	/** Call after activeCodes changes to show/hide memo section */
	function updateMemoVisibility() {
		const visible = activeCodes.length > 0;
		memoSep.style.display = visible ? '' : 'none';
		memoWrapper.style.display = visible ? '' : 'none';
		// Sync textarea value when becoming visible (marker may have been created)
		if (visible) {
			const marker = snapshot.hoverMarkerId
				? model.getMarkerById(snapshot.hoverMarkerId)
				: model.findMarkerAtExactRange(snapshot);
			if (marker && memoArea.value !== (marker.memo ?? '')) {
				memoArea.value = marker.memo ?? '';
			}
		}
	}

	// ── e) Action buttons ───────────────────────────────────────────────
	container.appendChild(createSeparator());

	container.appendChild(
		createActionItem('Add New Code', 'plus-circle', () => {
			onClose();
			view.dispatch({
				effects: setSelectionPreviewEffect.of({ from: snapshot.from, to: snapshot.to })
			});
			new CodeFormModal(
				model.plugin.app,
				model.getSettings().defaultColor,
				(name, color, description) => {
					addCodeWithDetailsAction(model, snapshot, name, color, description);
				},
				() => onRecreate()
			).open();
		})
	);

	if (isHoverMode) {
		container.appendChild(
			createActionItem('Delete Marker', 'trash', () => {
				removeAllCodesAction(model, snapshot);
				new Notice('Codes removed');
				onClose();
			})
		);
	}

	// ── f) Auto-focus (selection mode only) ─────────────────────────────
	if (!snapshot.hoverMarkerId) {
		setTimeout(() => textComponent.inputEl.focus(), 50);
	}

	return container;
}

