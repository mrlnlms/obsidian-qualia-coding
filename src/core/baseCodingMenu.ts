/**
 * Shared coding menu primitives — used by PDF, CSV, Image, Audio, Video menus.
 * Extracted from pdfCodingMenu.ts to avoid duplication across engines.
 */

import { TextComponent, ToggleComponent, setIcon } from 'obsidian';
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
export function createPopover(className: string): PopoverHandle {
	// Close previous popover properly (removes document listeners)
	activePopovers.get(className)?.close();

	const container = document.createElement('div');
	container.className = `menu ${className}`;
	applyThemeColors(container);

	container.addEventListener('mousedown', (e) => e.stopPropagation());

	let outsideHandler: ((e: MouseEvent) => void) | null = null;
	let escHandler: ((e: KeyboardEvent) => void) | null = null;

	const close = () => {
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

	setTimeout(() => {
		document.addEventListener('mousedown', outsideHandler!);
		document.addEventListener('keydown', escHandler!);
	}, 10);

	const handle = { container, close };
	activePopovers.set(className, handle);
	return handle;
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

// ── Position & clamp ─────────────────────────────────────────

/**
 * Positions a popover container near (x, y), clamping to viewport edges.
 */
export function positionAndClamp(container: HTMLElement, x: number, y: number): void {
	container.style.top = `${y + 4}px`;
	container.style.left = `${x}px`;

	requestAnimationFrame(() => {
		const cr = container.getBoundingClientRect();
		if (cr.right > window.innerWidth) {
			container.style.left = `${window.innerWidth - cr.width - 8}px`;
		}
		if (cr.bottom > window.innerHeight) {
			container.style.top = `${y - cr.height - 4}px`;
		}
	});
}
