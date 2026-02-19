import { App, TextComponent, ToggleComponent, setIcon } from 'obsidian';
import type { AudioCodingModel } from '../coding/audioCodingModel';
import type { AudioRegionRenderer } from '../audio/regionRenderer';
import { CodeFormModal } from './audioCodeFormModal';

export function openAudioCodingPopover(
	mouseEvent: MouseEvent,
	model: AudioCodingModel,
	filePath: string,
	regionStart: number,
	regionEnd: number,
	regionRenderer: AudioRegionRenderer,
	onDismissEmpty: () => void,
	app: App,
	onNavigate?: (markerId: string, codeName: string) => void,
	savedPos?: { x: number; y: number },
): void {
	// Remove any existing popover
	document.querySelector('.codemarker-audio-popover')?.remove();

	const container = document.createElement('div');
	container.className = 'menu codemarker-audio-popover';

	container.addEventListener('mousedown', (e) => {
		e.stopPropagation();
	});

	const close = () => {
		container.remove();
		document.removeEventListener('mousedown', outsideHandler);
		document.removeEventListener('keydown', escHandler);

		// If marker exists but has no codes, clean up
		const existing = model.findExistingMarker(filePath, regionStart, regionEnd);
		if (existing && existing.codes.length === 0) {
			model.removeMarker(existing.id);
			regionRenderer.removeRegion(existing.id);
			onDismissEmpty();
		} else if (!existing) {
			onDismissEmpty();
		}
	};

	const pos = savedPos ?? { x: mouseEvent.clientX, y: mouseEvent.clientY };

	const rebuild = () => {
		close();
		openAudioCodingPopover(mouseEvent, model, filePath, regionStart, regionEnd, regionRenderer, onDismissEmpty, app, onNavigate, pos);
	};

	const getMarker = () => model.findOrCreateMarker(filePath, regionStart, regionEnd);

	// ── TextComponent input ──
	const inputWrapper = document.createElement('div');
	inputWrapper.className = 'menu-item menu-item-textfield';

	const textComponent = new TextComponent(inputWrapper);
	textComponent.setPlaceholder('New code name...');

	inputWrapper.addEventListener('click', (evt: MouseEvent) => {
		evt.stopPropagation();
		textComponent.inputEl.focus();
	});

	textComponent.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
		if (evt.key === 'Enter') {
			evt.stopPropagation();
			evt.preventDefault();
			const name = textComponent.inputEl.value.trim();
			if (name) {
				const marker = getMarker();
				model.addCodeToMarker(marker.id, name);
				regionRenderer.refreshRegion(marker.id);
				rebuild();
			}
		} else if (evt.key === 'Escape') {
			close();
		}
	});

	container.appendChild(inputWrapper);

	// ── Toggle list for existing codes ──
	const allCodes = model.getAllCodes();
	const existingMarker = model.findExistingMarker(filePath, regionStart, regionEnd);
	const activeCodes = existingMarker ? existingMarker.codes : [];

	if (allCodes.length > 0) {
		container.appendChild(createSeparator());
	}

	for (const codeDef of allCodes) {
		const isActive = activeCodes.includes(codeDef.name);

		const itemEl = document.createElement('div');
		itemEl.className = 'menu-item menu-item-toggle';

		const swatch = document.createElement('span');
		swatch.className = 'codemarker-audio-popover-swatch';
		swatch.style.backgroundColor = codeDef.color;
		itemEl.appendChild(swatch);

		const toggle = new ToggleComponent(itemEl);
		toggle.setValue(isActive);
		toggle.toggleEl.addEventListener('click', (evt) => {
			evt.stopPropagation();
		});
		toggle.onChange((value) => {
			const m = getMarker();
			if (value) {
				model.addCodeToMarker(m.id, codeDef.name);
			} else {
				model.removeCodeFromMarker(m.id, codeDef.name, true);
			}
			regionRenderer.refreshRegion(m.id);
		});

		const titleEl = document.createElement('span');
		titleEl.className = 'menu-item-title';
		titleEl.textContent = codeDef.name;
		itemEl.appendChild(titleEl);

		// Navigate arrow — only for active codes
		if (isActive && onNavigate && existingMarker) {
			const navBtn = document.createElement('span');
			navBtn.className = 'codemarker-audio-popover-nav';
			setIcon(navBtn, 'arrow-up-right');
			navBtn.title = 'Open in sidebar';
			navBtn.addEventListener('click', (evt) => {
				evt.stopPropagation();
				close();
				onNavigate(existingMarker.id, codeDef.name);
			});
			itemEl.appendChild(navBtn);
		}

		itemEl.addEventListener('click', (evt: MouseEvent) => {
			evt.stopPropagation();
			const currentValue = toggle.getValue();
			toggle.setValue(!currentValue);
		});

		container.appendChild(itemEl);
	}

	// ── Memo textarea ──
	if (existingMarker && existingMarker.codes.length > 0) {
		container.appendChild(createSeparator());
		const memoWrapper = document.createElement('div');
		memoWrapper.className = 'codemarker-audio-memo-wrapper';
		const memoArea = document.createElement('textarea');
		memoArea.className = 'codemarker-audio-memo';
		memoArea.placeholder = 'Memo...';
		memoArea.rows = 2;
		memoArea.value = existingMarker.memo ?? '';
		memoArea.addEventListener('input', () => {
			existingMarker.memo = memoArea.value || undefined;
			model.notify();
		});
		memoArea.addEventListener('mousedown', (e) => e.stopPropagation());
		memoArea.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') close();
			e.stopPropagation();
		});
		memoWrapper.appendChild(memoArea);
		container.appendChild(memoWrapper);
	}

	// ── Action buttons ──
	container.appendChild(createSeparator());

	container.appendChild(
		createActionItem('Add New Code', 'plus-circle', () => {
			const name = textComponent.inputEl.value.trim();
			if (name) {
				const m = getMarker();
				model.addCodeToMarker(m.id, name);
				regionRenderer.refreshRegion(m.id);
				rebuild();
			} else {
				textComponent.inputEl.focus();
			}
		}),
	);

	container.appendChild(
		createActionItem('New Code...', 'palette', () => {
			// Remove popover but don't run close cleanup
			container.remove();
			document.removeEventListener('mousedown', outsideHandler);
			document.removeEventListener('keydown', escHandler);

			new CodeFormModal(app, model.registry, (name, color, description) => {
				model.registry.create(name, color, description);
				const m = getMarker();
				model.addCodeToMarker(m.id, name);
				regionRenderer.refreshRegion(m.id);
			}).open();
		}),
	);

	if (existingMarker) {
		container.appendChild(
			createActionItem('Remove All Codes', 'trash', () => {
				const marker = model.findMarkerById(existingMarker.id);
				if (marker) {
					for (const code of [...marker.codes]) {
						model.removeCodeFromMarker(marker.id, code);
					}
				}
				regionRenderer.removeRegion(existingMarker.id);
				rebuild();
			}),
		);
	}

	// ── Position and show ──
	document.body.appendChild(container);

	container.style.top = `${pos.y + 4}px`;
	container.style.left = `${pos.x}px`;

	requestAnimationFrame(() => {
		const cr = container.getBoundingClientRect();
		if (cr.right > window.innerWidth) {
			container.style.left = `${window.innerWidth - cr.width - 8}px`;
		}
		if (cr.bottom > window.innerHeight) {
			container.style.top = `${pos.y - cr.height - 4}px`;
		}
	});

	setTimeout(() => textComponent.inputEl.focus(), 50);

	// ── Close handlers ──
	const outsideHandler = (e: MouseEvent) => {
		if (!container.contains(e.target as Node)) {
			close();
		}
	};

	const escHandler = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			close();
		}
	};

	setTimeout(() => {
		document.addEventListener('mousedown', outsideHandler);
		document.addEventListener('keydown', escHandler);
	}, 10);
}

// ── Helpers ──

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

