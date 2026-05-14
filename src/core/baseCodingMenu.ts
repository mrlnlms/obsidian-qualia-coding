/**
 * Shared coding menu primitives — used by PDF, CSV, Image, Audio, Video menus.
 * Extracted from pdfCodingMenu.ts to avoid duplication across engines.
 */

import { ButtonComponent, ExtraButtonComponent, TextComponent, ToggleComponent, setIcon } from 'obsidian';
import type { CodeDefinition } from './types';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import { CodeBrowserModal } from './codeBrowserModal';
import type { App } from 'obsidian';

// ── Popover container ────────────────────────────────────────

export interface PopoverHandle {
	container: HTMLElement;
	close: () => void;
}

// Track active popover handles by class name to ensure proper cleanup
const activePopovers = new Map<string, PopoverHandle>();

/**
 * Creates a themed popover container attached to document.body.
 * Returns the container element and a close() function that removes it
 * and cleans up outside-click / Escape listeners.
 */
export function createPopover(className: string, onClose?: () => void): PopoverHandle {
	// Close previous popover properly (removes document listeners)
	activePopovers.get(className)?.close();

	const container = document.createElement('div');
	container.className = `menu ${className}`;
	applyThemeColors(container);

	container.addEventListener('mousedown', (e) => e.stopPropagation());

	let outsideHandler: ((e: MouseEvent) => void) | null = null;
	let escHandler: ((e: KeyboardEvent) => void) | null = null;
	let listenTimer: ReturnType<typeof setTimeout> | null = null;

	const close = () => {
		if (listenTimer) { clearTimeout(listenTimer); listenTimer = null; }
		onClose?.();
		container.remove();
		if (outsideHandler) document.removeEventListener('mousedown', outsideHandler);
		if (escHandler) document.removeEventListener('keydown', escHandler);
		activePopovers.delete(className);
	};

	outsideHandler = (e: MouseEvent) => {
		if (!container.contains(e.target as Node)) close();
	};
	escHandler = (e: KeyboardEvent) => {
		if (e.key === 'Escape') close();
	};

	document.body.appendChild(container);

	listenTimer = setTimeout(() => {
		listenTimer = null;
		document.addEventListener('mousedown', outsideHandler!);
		document.addEventListener('keydown', escHandler!);
	}, 10);

	const handle = { container, close };
	activePopovers.set(className, handle);
	return handle;
}

/** Close the active popover for a given class name (if any). */
export function closeActivePopover(className: string): void {
	activePopovers.get(className)?.close();
}

// ── Code input ───────────────────────────────────────────────

/**
 * Renders a TextComponent input inside a menu-item wrapper.
 * Returns the TextComponent for focus management.
 */
export function renderCodeInput(
	parent: HTMLElement,
	placeholder: string,
	onEnter: (name: string) => void,
	onEscape: () => void,
	onInput?: (value: string) => void,
): TextComponent {
	const inputWrapper = document.createElement('div');
	inputWrapper.className = 'menu-item menu-item-textfield';

	const textComponent = new TextComponent(inputWrapper);
	textComponent.setPlaceholder(placeholder);
	applyInputTheme(textComponent.inputEl);

	inputWrapper.addEventListener('click', (evt: MouseEvent) => {
		evt.stopPropagation();
		textComponent.inputEl.focus();
	});

	textComponent.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
		if (evt.key === 'Enter') {
			evt.stopPropagation();
			evt.preventDefault();
			const name = textComponent.inputEl.value.trim();
			if (name) onEnter(name);
		} else if (evt.key === 'Escape') {
			onEscape();
		}
	});

	if (onInput) {
		textComponent.inputEl.addEventListener('input', () => {
			onInput(textComponent.inputEl.value.trim());
		});
	}

	parent.appendChild(inputWrapper);
	return textComponent;
}

// ── Toggle list ──────────────────────────────────────────────

/**
 * Renders a toggle list of existing codes with swatches.
 */
export function renderToggleList(
	parent: HTMLElement,
	codes: CodeDefinition[],
	activeCodes: string[],
	onToggle: (codeName: string, value: boolean) => void,
	options?: {
		onNavClick?: (codeName: string, isActive: boolean) => void;
		skipSeparator?: boolean;
	},
): void {
	if (codes.length === 0) return;
	if (!options?.skipSeparator) parent.appendChild(createSeparator());

	for (const codeDef of codes) {
		const isActive = activeCodes.includes(codeDef.name);
		let currentlyActive = isActive;

		const itemEl = document.createElement('div');
		itemEl.className = 'menu-item menu-item-toggle';

		const swatch = document.createElement('span');
		swatch.className = 'codemarker-popover-swatch';
		swatch.style.backgroundColor = codeDef.color;
		itemEl.appendChild(swatch);

		const toggle = new ToggleComponent(itemEl);
		toggle.setValue(isActive);
		toggle.toggleEl.addEventListener('click', (evt) => evt.stopPropagation());
		toggle.onChange((value) => {
			currentlyActive = value;
			onToggle(codeDef.name, value);
		});

		const titleEl = document.createElement('span');
		titleEl.className = 'menu-item-title';
		titleEl.textContent = codeDef.name;
		itemEl.appendChild(titleEl);

		if (options?.onNavClick) {
			const navBtn = document.createElement('span');
			navBtn.className = 'codemarker-tooltip-nav';
			setIcon(navBtn, 'arrow-up-right');
			navBtn.title = 'Open in sidebar';
			navBtn.addEventListener('click', (evt) => {
				evt.stopPropagation();
				options.onNavClick!(codeDef.name, currentlyActive);
			});
			itemEl.appendChild(navBtn);
		}

		itemEl.addEventListener('click', (evt: MouseEvent) => {
			evt.stopPropagation();
			toggle.setValue(!toggle.getValue());
		});

		parent.appendChild(itemEl);
	}
}

// ── Action item ──────────────────────────────────────────────

export function createActionItem(title: string, iconName: string, onClick: () => void): HTMLElement {
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

// ── Separator ────────────────────────────────────────────────

export function createSeparator(): HTMLElement {
	const sep = document.createElement('div');
	sep.className = 'menu-separator';
	return sep;
}

// ── Browse all codes ─────────────────────────────────────────

/**
 * Renders a "Browse all codes…" menu item that opens CodeBrowserModal.
 */
export function renderBrowseItem(
	parent: HTMLElement,
	app: App,
	registry: CodeDefinitionRegistry,
	onSelect: (codeName: string) => void,
	onClose?: () => void,
): void {
	const browseItem = document.createElement('div');
	browseItem.className = 'menu-item codemarker-tooltip-browse';

	const browseIcon = document.createElement('div');
	browseIcon.className = 'menu-item-icon';
	setIcon(browseIcon, 'tag');
	browseItem.appendChild(browseIcon);

	const browseTitle = document.createElement('span');
	browseTitle.className = 'menu-item-title';
	browseTitle.textContent = 'Browse all codes\u2026';
	browseItem.appendChild(browseTitle);

	browseItem.addEventListener('click', (evt) => {
		evt.stopPropagation();
		onClose?.();
		new CodeBrowserModal(app, registry, onSelect).open();
	});

	parent.appendChild(browseItem);
}

// ── Memo section ─────────────────────────────────────────────

export interface MemoHandle {
	wrapper: HTMLElement;
	separator: HTMLElement;
	textarea: HTMLTextAreaElement;
	updateVisibility: (show: boolean) => void;
}

/**
 * Renders a collapsible memo section with chevron header and textarea.
 */
export function renderMemoSection(
	parent: HTMLElement,
	getMemo: () => string,
	setMemo: (value: string) => void,
	visible: boolean,
	onEscape?: () => void,
): MemoHandle {
	const separator = createSeparator();
	const wrapper = document.createElement('div');
	wrapper.className = 'codemarker-tooltip-memo-wrapper';

	// Header
	const header = document.createElement('div');
	header.className = 'codemarker-tooltip-memo-header menu-item';
	const chevron = document.createElement('div');
	chevron.className = 'codemarker-tooltip-memo-chevron';
	setIcon(chevron, 'chevron-right');
	header.appendChild(chevron);
	const headerTitle = document.createElement('span');
	headerTitle.className = 'menu-item-title';
	headerTitle.textContent = 'Memo';
	header.appendChild(headerTitle);

	// Body
	const body = document.createElement('div');
	body.className = 'codemarker-tooltip-memo-body';

	const textarea = document.createElement('textarea');
	textarea.className = 'codemarker-tooltip-memo';
	textarea.placeholder = 'Write a memo...';
	textarea.rows = 2;
	applyInputTheme(textarea as unknown as HTMLInputElement);

	textarea.value = getMemo();
	textarea.addEventListener('input', () => {
		setMemo(textarea.value || '');
	});
	textarea.addEventListener('mousedown', (e) => e.stopPropagation());
	textarea.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && onEscape) onEscape();
		e.stopPropagation();
	});
	body.appendChild(textarea);

	// Expand/collapse
	const initMemo = getMemo().trim();
	let expanded = !!initMemo;
	body.style.display = expanded ? '' : 'none';
	if (expanded) wrapper.addClass('is-open');

	header.addEventListener('click', (e) => {
		e.stopPropagation();
		expanded = !expanded;
		body.style.display = expanded ? '' : 'none';
		wrapper.toggleClass('is-open', expanded);
		if (expanded) textarea.focus();
	});

	wrapper.appendChild(header);
	wrapper.appendChild(body);

	separator.style.display = visible ? '' : 'none';
	wrapper.style.display = visible ? '' : 'none';

	parent.appendChild(separator);
	parent.appendChild(wrapper);

	return {
		wrapper,
		separator,
		textarea,
		updateVisibility(show: boolean) {
			separator.style.display = show ? '' : 'none';
			wrapper.style.display = show ? '' : 'none';
			if (show && textarea.value !== getMemo()) {
				textarea.value = getMemo();
			}
		},
	};
}

// ── Magnitude section ─────────────────────────────────────

export interface MagnitudeHandle {
	wrapper: HTMLElement;
	separator: HTMLElement;
	updateVisibility(show: boolean): void;
	refresh(activeCodeIds: string[]): void;
}

/**
 * Renders a collapsible magnitude section with a picker per active code
 * that has magnitude configured.
 */
export function renderMagnitudeSection(
	parent: HTMLElement,
	registry: CodeDefinitionRegistry,
	activeCodeIds: string[],
	getMagnitude: (codeId: string) => string | undefined,
	setMagnitude: (codeId: string, value: string | undefined) => void,
	visible: boolean,
): MagnitudeHandle {
	const separator = createSeparator();
	const wrapper = document.createElement('div');
	wrapper.className = 'codemarker-tooltip-magnitude-wrapper';

	// Header
	const header = document.createElement('div');
	header.className = 'codemarker-tooltip-memo-header menu-item';
	const chevron = document.createElement('div');
	chevron.className = 'codemarker-tooltip-memo-chevron';
	setIcon(chevron, 'chevron-right');
	header.appendChild(chevron);
	const headerTitle = document.createElement('span');
	headerTitle.className = 'menu-item-title';
	headerTitle.textContent = 'Magnitude';
	header.appendChild(headerTitle);

	// Body
	const body = document.createElement('div');
	body.className = 'codemarker-tooltip-magnitude-body';

	let expanded = false;
	body.style.display = 'none';

	const buildPickers = (codeIds: string[]) => {
		body.innerHTML = '';
		const codesWithMag = codeIds
			.map(id => ({ id, def: registry.getById(id) }))
			.filter(c => c.def?.magnitude && c.def.magnitude.values.length > 0);

		if (codesWithMag.length === 0) {
			// Hide entirely when no codes have magnitude — no confusing message
			separator.style.display = 'none';
			wrapper.style.display = 'none';
			return;
		}
		// Re-show if previously hidden
		if (codeIds.length > 0) {
			separator.style.display = '';
			wrapper.style.display = '';
		}

		for (const { id, def } of codesWithMag) {
			const row = document.createElement('div');
			row.className = 'codemarker-magnitude-row';

			const swatch = document.createElement('span');
			swatch.className = 'codemarker-popover-swatch';
			swatch.style.backgroundColor = def!.color;
			row.appendChild(swatch);

			const nameEl = document.createElement('span');
			nameEl.className = 'codemarker-magnitude-code-name';
			nameEl.textContent = def!.name;
			row.appendChild(nameEl);

			const chipContainer = document.createElement('div');
			chipContainer.className = 'codemarker-magnitude-chips';

			const currentValue = getMagnitude(id);
			for (const val of def!.magnitude!.values) {
				const chip = document.createElement('span');
				chip.className = 'codemarker-magnitude-chip';
				chip.textContent = val;
				if (val === currentValue) chip.addClass('is-selected');
				chip.addEventListener('click', (e) => {
					e.stopPropagation();
					if (val === getMagnitude(id)) {
						setMagnitude(id, undefined);
					} else {
						setMagnitude(id, val);
					}
					buildPickers(codeIds);
				});
				chipContainer.appendChild(chip);
			}

			row.appendChild(chipContainer);
			body.appendChild(row);
		}
	};

	header.addEventListener('click', (e) => {
		e.stopPropagation();
		expanded = !expanded;
		body.style.display = expanded ? '' : 'none';
		wrapper.toggleClass('is-open', expanded);
	});

	wrapper.appendChild(header);
	wrapper.appendChild(body);

	// Auto-expand if any active code already has a magnitude value set
	const hasAnyMagnitude = activeCodeIds.some(id => {
		const def = registry.getById(id);
		return def?.magnitude && def.magnitude.values.length > 0 && getMagnitude(id);
	});
	if (hasAnyMagnitude) {
		expanded = true;
		body.style.display = '';
		wrapper.addClass('is-open');
	}

	buildPickers(activeCodeIds);

	separator.style.display = visible ? '' : 'none';
	wrapper.style.display = visible ? '' : 'none';

	parent.appendChild(separator);
	parent.appendChild(wrapper);

	return {
		wrapper,
		separator,
		updateVisibility(show: boolean) {
			separator.style.display = show ? '' : 'none';
			wrapper.style.display = show ? '' : 'none';
		},
		refresh(codeIds: string[]) {
			buildPickers(codeIds);
		},
	};
}

// ── Relations section ─────────────────────────────────────

export interface RelationsHandle {
	wrapper: HTMLElement;
	separator: HTMLElement;
	updateVisibility(show: boolean): void;
	refresh(activeCodeIds: string[]): void;
}

export function renderRelationsSection(
	parent: HTMLElement,
	registry: CodeDefinitionRegistry,
	activeCodeIds: string[],
	getRelations: (codeId: string) => Array<{ label: string; target: string; directed: boolean }>,
	setRelations: (codeId: string, relations: Array<{ label: string; target: string; directed: boolean }>) => void,
	visible: boolean,
	allLabels: string[],
): RelationsHandle {
	const separator = createSeparator();
	const wrapper = document.createElement('div');
	wrapper.className = 'codemarker-tooltip-relations-wrapper';

	const header = document.createElement('div');
	header.className = 'codemarker-tooltip-memo-header menu-item';
	const chevron = document.createElement('div');
	chevron.className = 'codemarker-tooltip-memo-chevron';
	setIcon(chevron, 'chevron-right');
	header.appendChild(chevron);
	const headerTitle = document.createElement('span');
	headerTitle.className = 'menu-item-title';
	headerTitle.textContent = 'Relations';
	header.appendChild(headerTitle);

	const body = document.createElement('div');
	body.className = 'codemarker-tooltip-relations-body';

	let expanded = false;
	body.style.display = 'none';

	const buildContent = (codeIds: string[]) => {
		body.innerHTML = '';
		if (codeIds.length === 0) {
			separator.style.display = 'none';
			wrapper.style.display = 'none';
			return;
		}
		if (codeIds.length > 0) {
			separator.style.display = visible ? '' : 'none';
			wrapper.style.display = visible ? '' : 'none';
		}

		for (const codeId of codeIds) {
			const def = registry.getById(codeId);
			if (!def) continue;

			const rels = getRelations(codeId);
			const codeGroup = document.createElement('div');
			codeGroup.className = 'codemarker-tooltip-relations-code-group';

			const codeHeader = document.createElement('div');
			codeHeader.className = 'codemarker-magnitude-row';
			const swatch = document.createElement('span');
			swatch.className = 'codemarker-popover-swatch';
			swatch.style.backgroundColor = def.color;
			codeHeader.appendChild(swatch);
			const nameEl = document.createElement('span');
			nameEl.className = 'codemarker-magnitude-code-name';
			nameEl.textContent = def.name;
			codeHeader.appendChild(nameEl);
			codeGroup.appendChild(codeHeader);

			for (const rel of rels) {
				const row = document.createElement('div');
				row.className = 'codemarker-tooltip-relation-row';

				const dirEl = document.createElement('span');
				dirEl.className = 'codemarker-tooltip-relation-dir';
				setIcon(dirEl, rel.directed ? 'arrow-right' : 'minus');
				row.appendChild(dirEl);

				const labelEl = document.createElement('span');
				labelEl.className = 'codemarker-tooltip-relation-label';
				labelEl.textContent = rel.label;
				row.appendChild(labelEl);

				const targetDef = registry.getById(rel.target);
				const targetEl = document.createElement('span');
				targetEl.className = 'codemarker-tooltip-relation-target';
				targetEl.textContent = targetDef?.name ?? '(deleted)';
				row.appendChild(targetEl);

				const removeBtn = document.createElement('span');
				removeBtn.className = 'codemarker-tooltip-relation-remove';
				setIcon(removeBtn, 'x');
				removeBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					const updated = rels.filter(r => !(r.label === rel.label && r.target === rel.target));
					setRelations(codeId, updated);
					buildContent(codeIds);
				});
				row.appendChild(removeBtn);

				codeGroup.appendChild(row);
			}

			// Compact add row
			const addRow = document.createElement('div');
			addRow.className = 'codemarker-tooltip-relation-add';

			const labelComp = new TextComponent(addRow);
			labelComp.setPlaceholder('Label...');
			labelComp.inputEl.classList.add('codemarker-tooltip-relation-input');
			applyInputTheme(labelComp.inputEl);

			const targetComp = new TextComponent(addRow);
			targetComp.setPlaceholder('Target...');
			targetComp.inputEl.classList.add('codemarker-tooltip-relation-input');
			applyInputTheme(targetComp.inputEl);

			let directed = true;
			const dirComp = new ExtraButtonComponent(addRow)
				.setIcon('arrow-right')
				.onClick(() => {
					directed = !directed;
					dirComp.setIcon(directed ? 'arrow-right' : 'minus');
				});
			dirComp.extraSettingsEl.classList.add('codemarker-tooltip-relation-dir-btn');

			const submit = () => {
				const label = labelComp.inputEl.value.trim();
				const targetName = targetComp.inputEl.value.trim();
				if (!label || !targetName) return;
				let targetDef = registry.getByName(targetName);
				if (!targetDef) {
					targetDef = registry.create(targetName, registry.peekNextPaletteColor());
				}
				const dup = rels.some(r => r.label === label && r.target === targetDef!.id && r.directed === directed);
				if (dup) return;
				setRelations(codeId, [...rels, { label, target: targetDef.id, directed }]);
				buildContent(codeIds);
			};

			const addComp = new ButtonComponent(addRow)
				.setButtonText('+')
				.onClick(submit);
			addComp.buttonEl.classList.add('codemarker-tooltip-relation-add-btn');

			for (const inp of [labelComp.inputEl, targetComp.inputEl]) {
				inp.addEventListener('mousedown', (e) => e.stopPropagation());
				inp.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') { e.preventDefault(); submit(); }
					e.stopPropagation();
				});
			}

			codeGroup.appendChild(addRow);
			body.appendChild(codeGroup);
		}
	};

	header.addEventListener('click', (e) => {
		e.stopPropagation();
		expanded = !expanded;
		body.style.display = expanded ? '' : 'none';
		wrapper.toggleClass('is-open', expanded);
	});

	wrapper.appendChild(header);
	wrapper.appendChild(body);

	const hasAnyRelations = activeCodeIds.some(id => getRelations(id).length > 0);
	if (hasAnyRelations) {
		expanded = true;
		body.style.display = '';
		wrapper.addClass('is-open');
	}

	buildContent(activeCodeIds);

	separator.style.display = visible ? '' : 'none';
	wrapper.style.display = visible ? '' : 'none';

	parent.appendChild(separator);
	parent.appendChild(wrapper);

	return {
		wrapper,
		separator,
		updateVisibility(show: boolean) {
			separator.style.display = show ? '' : 'none';
			wrapper.style.display = show ? '' : 'none';
		},
		refresh(codeIds: string[]) {
			buildContent(codeIds);
		},
	};
}

// ── "Press Enter" hint ───────────────────────────────────────

export function renderEnterHint(parent: HTMLElement, filterText: string): void {
	const hint = document.createElement('div');
	hint.className = 'menu-item codemarker-tooltip-hint';
	hint.textContent = `Press Enter to create \u201c${filterText}\u201d`;
	parent.appendChild(hint);
}

// ── Theme ────────────────────────────────────────────────────

export function applyThemeColors(container: HTMLElement): void {
	const s = getComputedStyle(document.body);
	const get = (v: string) => s.getPropertyValue(v).trim();

	container.style.backgroundColor = get('--background-secondary');
	container.style.borderColor = get('--background-modifier-border');
	container.style.color = get('--text-normal');

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

export function applyInputTheme(input: HTMLInputElement): void {
	const s = getComputedStyle(document.body);
	input.style.backgroundColor = s.getPropertyValue('--background-primary').trim();
	input.style.color = s.getPropertyValue('--text-normal').trim();
	input.style.borderColor = s.getPropertyValue('--background-modifier-border').trim();
}

// ── Placement engine ─────────────────────────────────────────

export interface AnchorRect {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

const VIEWPORT_MARGIN = 8;

/**
 * Positions a floating element relative to an anchor rect.
 * 4-way flip: below → above → right → left. Escolhe o lado onde cabe; se
 * nenhum cabe, escolhe o lado com mais espaço e clamp pro viewport. Nunca
 * cobre o anchor a não ser que viewport seja menor que o popover.
 *
 * Comportamento idêntico cross-engine — markdown, pdf, csv, image, media.
 */
export type PlacementSide = 'below' | 'above' | 'right' | 'left';

export function placeFloating(
	container: HTMLElement,
	anchor: AnchorRect,
	offset = 8,
	preferredSide: PlacementSide = 'below',
): void {
	const cr = container.getBoundingClientRect();
	const vw = window.innerWidth;
	const vh = window.innerHeight;

	const space = {
		below: vh - anchor.bottom - offset - VIEWPORT_MARGIN,
		above: anchor.top - offset - VIEWPORT_MARGIN,
		right: vw - anchor.right - offset - VIEWPORT_MARGIN,
		left: anchor.left - offset - VIEWPORT_MARGIN,
	};

	// Ordem de fallback: preferred → oposto vertical/horizontal → outros lados.
	const oppositeOf: Record<PlacementSide, PlacementSide> = {
		below: 'above', above: 'below', right: 'left', left: 'right',
	};
	const otherAxis: Record<PlacementSide, PlacementSide[]> = {
		below: ['right', 'left'], above: ['right', 'left'],
		right: ['below', 'above'], left: ['below', 'above'],
	};
	const fallbackOrder: PlacementSide[] = [
		preferredSide,
		oppositeOf[preferredSide],
		...otherAxis[preferredSide],
	];

	const needed = (s: PlacementSide) => (s === 'below' || s === 'above') ? cr.height : cr.width;

	let side: PlacementSide | null = null;
	for (const candidate of fallbackOrder) {
		if (space[candidate] >= needed(candidate)) { side = candidate; break; }
	}
	if (!side) {
		// Nada cabe — escolhe o lado com mais espaço relativo ao tamanho do popover.
		const fitRatio: Array<[PlacementSide, number]> = [
			['below', space.below / cr.height],
			['above', space.above / cr.height],
			['right', space.right / cr.width],
			['left', space.left / cr.width],
		];
		fitRatio.sort((a, b) => b[1] - a[1]);
		side = fitRatio[0]![0];
	}

	let top: number;
	let left: number;
	if (side === 'below') {
		top = anchor.bottom + offset;
		left = anchor.left;
	} else if (side === 'above') {
		top = anchor.top - cr.height - offset;
		left = anchor.left;
	} else if (side === 'right') {
		top = anchor.top;
		left = anchor.right + offset;
	} else {
		top = anchor.top;
		left = anchor.left - cr.width - offset;
	}

	// Clamp ao viewport — direção cross-axis tem mais flexibilidade
	// (popover pode deslizar lateralmente quando ancorado below/above).
	if (left + cr.width > vw - VIEWPORT_MARGIN) left = vw - cr.width - VIEWPORT_MARGIN;
	if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
	if (top + cr.height > vh - VIEWPORT_MARGIN) top = vh - cr.height - VIEWPORT_MARGIN;
	if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;

	container.style.top = `${top}px`;
	container.style.left = `${left}px`;
}

/**
 * Wraps placeFloating in requestAnimationFrame — use right after appendChild
 * when the container's height isn't known yet.
 */
export function placeFloatingNextFrame(
	container: HTMLElement,
	anchor: AnchorRect,
	offset = 8,
	preferredSide: PlacementSide = 'below',
): void {
	// Placement inicial fora-da-tela enquanto mede (evita flash em posição errada).
	container.style.top = '-9999px';
	container.style.left = '-9999px';
	requestAnimationFrame(() => placeFloating(container, anchor, offset, preferredSide));
}
