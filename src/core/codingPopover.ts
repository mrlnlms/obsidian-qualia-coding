/**
 * Shared coding popover — generic menu for assigning codes to any target
 * (text selection, PDF shape, image region, etc.).
 *
 * Engine-specific code builds a CodingPopoverAdapter + CodingPopoverOptions
 * and calls openCodingPopover(). All UX logic lives here:
 *   - Search/filter with live rebuildSuggestions()
 *   - Two-zone layout (suggestion + active) in hover mode
 *   - "Press Enter to create X" hint
 *   - Recent codes ranking (MAX_RECENT)
 *   - Conditional memo visibility
 *   - Nav arrows → sidebar events
 *   - "Add New Code" via CodeFormModal
 *   - Delete action (engine-provided)
 *   - Hover grace period (optional)
 *   - Auto-focus only in selection mode
 */

import type { App } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import { CodeFormModal } from './codeFormModal';
import {
	createPopover,
	renderCodeInput,
	renderToggleList,
	createActionItem,
	createSeparator,
	renderBrowseItem,
	renderMemoSection,
	renderMagnitudeSection,
	renderRelationsSection,
	renderEnterHint,
	placeFloating,
	placeFloatingNextFrame,
	applyThemeColors,
	type AnchorRect,
	type MemoHandle,
	type MagnitudeHandle,
	type RelationsHandle,
} from './baseCodingMenu';
import { collectAllLabels } from './relationHelpers';

const MAX_RECENT = 3;

// ── Adapter interface (engine-specific callbacks) ──

export interface CodingPopoverAdapter {
	/** Shared code definition registry */
	registry: CodeDefinitionRegistry;
	/** Current codes assigned to the target */
	getActiveCodes(): string[];
	/** Add a code to the target */
	addCode(codeName: string): void;
	/** Remove a code from the target */
	removeCode(codeName: string): void;
	/** Get memo/note text */
	getMemo(): string;
	/** Set memo/note text */
	setMemo(value: string): void;
	/** Persist changes */
	save(): void;
	/** Called after any toggle/add/remove to refresh visual state */
	onRefresh(): void;
	/** Nav arrow click — dispatches sidebar events */
	onNavClick?(codeName: string, isActive: boolean): void;
	/** Get magnitude value for a specific code on this marker */
	getMagnitudeForCode?(codeId: string): string | undefined;
	/** Set magnitude value for a specific code on this marker */
	setMagnitudeForCode?(codeId: string, value: string | undefined): void;
	/** Get segment-level relations for a specific code on this marker */
	getRelationsForCode?(codeId: string): Array<{ label: string; target: string; directed: boolean }>;
	/** Set segment-level relations for a specific code on this marker */
	setRelationsForCode?(codeId: string, relations: Array<{ label: string; target: string; directed: boolean }>): void;
}

/**
 * Anchor especifica onde o popover ancora — pode ser um ponto (cursor) ou rect
 * de conteúdo (char range, célula, shape). Tracker opcional re-posiciona o
 * popover em scroll do anchor (e fecha o popover se anchor sair de view).
 */
export interface AnchorSpec {
	/** Rect inicial (ou ponto: top===bottom, left===right) */
	rect: AnchorRect;
	/**
	 * Lado preferido pra ancorar. Default 'below'. Engines passam 'above' quando
	 * o cursor está no topo da seleção (seleção bottom-up) pra popover não cobrir.
	 * Se não cabe, placement faz flip 4-way.
	 */
	preferredSide?: 'below' | 'above' | 'right' | 'left';
	/** Tracker opt-in: re-position em scroll, fecha popover se computeRect retorna null */
	tracker?: {
		scrollEl: HTMLElement;
		computeRect: () => AnchorRect | null;
	};
}

export interface CodingPopoverOptions {
	/** Where to anchor the popover (point or rect, with optional scroll tracker) */
	anchor: AnchorSpec;
	/** Obsidian App instance (needed for CodeFormModal, Browse) */
	app?: App;
	/** Hover mode (existing target) vs selection mode (new target) */
	isHoverMode: boolean;
	/** Optional badge text at top (e.g. "Selection spans 3 pages", "Rectangle") */
	badge?: string;
	/** CSS class for the popover container */
	className?: string;
	/** Delete/remove action at the bottom */
	deleteAction?: {
		label: string;
		icon: string;
		onDelete: () => void;
	};
	/** Called when popover closes */
	onClose?: () => void;
	/** Called when popover needs full rebuild (after creating a new code) */
	onRebuild: () => void;
	/** Hover grace period hooks (optional — PDF uses, Image may not) */
	hoverGrace?: {
		cancel: () => void;
		start: (close: () => void) => void;
	};
	/** Override auto-focus behavior (defaults: true for selection, false for hover) */
	autoFocus?: boolean;
	/** Called before opening CodeFormModal (e.g. dispatch selection preview effect) */
	onBeforeModal?: () => void;
	/** Override default color for CodeFormModal (defaults to registry.peekNextPaletteColor()) */
	modalDefaultColor?: string;
	/** Called when CodeFormModal closes (e.g. rebuild/recreate menu) */
	onModalClose?: () => void;
	/** Whether to show the magnitude section (from settings) */
	showMagnitudeSection?: boolean;
	/** Whether to show the relations section (from settings) */
	showRelationsSection?: boolean;
}

export interface CodingPopoverHandle {
	/** Close the popover and clean up all listeners */
	close: () => void;
	/** Container DOM element (engines may attach mouseenter/mouseleave handlers for hover grace) */
	container: HTMLElement;
}

// ── Main function ──

export function openCodingPopover(
	adapter: CodingPopoverAdapter,
	options: CodingPopoverOptions,
): CodingPopoverHandle {
	let teardownTracker: () => void = () => {};

	// onClose roda em qualquer caminho de fechamento (ESC, click-outside, replace)
	const popover = createPopover(
		options.className ?? 'codemarker-popover',
		() => {
			teardownTracker();
			options.onClose?.();
		},
	);
	const container = popover.container;
	const rawClose = popover.close;

	const close = () => {
		rawClose();
	};

	// Hover grace period
	if (options.hoverGrace) {
		container.addEventListener('mouseenter', () => options.hoverGrace!.cancel());
		container.addEventListener('mouseleave', () => options.hoverGrace!.start(close));
	}

	// Badge
	if (options.badge) {
		const badge = document.createElement('div');
		badge.className = 'menu-item codemarker-popover-badge';
		badge.textContent = options.badge;
		container.appendChild(badge);
	}

	// Local active codes tracking
	const activeCodes = adapter.getActiveCodes();
	const allCodes = adapter.registry.getAll();
	const { isHoverMode } = options;

	// ── Nav arrow callback ──
	const onNavClick = adapter.onNavClick
		? (codeName: string, isActive: boolean) => adapter.onNavClick!(codeName, isActive)
		: undefined;

	// ── Toggle callback ──
	const onToggle = (codeName: string, value: boolean) => {
		if (value) {
			adapter.addCode(codeName);
			if (!activeCodes.includes(codeName)) activeCodes.push(codeName);
		} else {
			adapter.removeCode(codeName);
			const idx = activeCodes.indexOf(codeName);
			if (idx >= 0) activeCodes.splice(idx, 1);
		}
		adapter.onRefresh();
		memo?.updateVisibility(activeCodes.length > 0);
		if (magnitudeHandle) {
			magnitudeHandle.updateVisibility(activeCodes.length > 0);
			const updatedIds = activeCodes
				.map(name => adapter.registry.getByName(name)?.id)
				.filter((id): id is string => !!id);
			magnitudeHandle.refresh(updatedIds);
		}
		if (relationsHandle) {
			relationsHandle.updateVisibility(activeCodes.length > 0);
			const updatedIds = activeCodes
				.map(name => adapter.registry.getByName(name)?.id)
				.filter((id): id is string => !!id);
			relationsHandle.refresh(updatedIds);
		}
	};

	// ── a) Search/create input ──
	const textComponent = renderCodeInput(
		container,
		'Search or create code...',
		(name) => {
			const existingCode = allCodes.find(c => c.name.toLowerCase() === name.toLowerCase());
			if (existingCode) {
				adapter.addCode(existingCode.name);
				if (!activeCodes.includes(existingCode.name)) activeCodes.push(existingCode.name);
				textComponent.inputEl.value = '';
				adapter.onRefresh();
				memo?.updateVisibility(activeCodes.length > 0);
				rebuildSuggestions();
			} else {
				adapter.addCode(name);
				adapter.onRefresh();
				options.onRebuild();
			}
		},
		() => close(),
		(filter) => rebuildSuggestions(filter),
	);

	// ── b) Suggestion zone ──
	container.appendChild(createSeparator());

	const suggestionZone = document.createElement('div');
	suggestionZone.className = 'codemarker-tooltip-toggle-zone';
	container.appendChild(suggestionZone);

	const browseCallback = options.app ? (codeName: string) => {
		adapter.addCode(codeName);
		adapter.onRefresh();
		options.onRebuild();
	} : undefined;

	function rebuildSuggestions(filter?: string) {
		suggestionZone.empty();
		const q = (filter ?? '').toLowerCase();

		if (!isHoverMode && !q) {
			// Selection mode: active first, then recent inactive
			const active = allCodes.filter(c => activeCodes.includes(c.name));
			const inactive = allCodes
				.filter(c => !activeCodes.includes(c.name))
				.sort((a, b) => b.createdAt - a.createdAt)
				.slice(0, MAX_RECENT);
			const combined = [...active, ...inactive];
			if (combined.length > 0) {
				renderToggleList(suggestionZone, combined, activeCodes, onToggle, { onNavClick, skipSeparator: true });
			}
			if (options.app) renderBrowseItem(suggestionZone, options.app, adapter.registry, browseCallback!, close);
			return;
		}

		if (!isHoverMode && q) {
			// Selection mode with filter
			const matching = allCodes.filter(c => c.name.toLowerCase().includes(q));
			if (matching.length > 0) {
				renderToggleList(suggestionZone, matching, activeCodes, onToggle, { onNavClick, skipSeparator: true });
			} else {
				renderEnterHint(suggestionZone, filter!);
			}
			if (options.app) renderBrowseItem(suggestionZone, options.app, adapter.registry, browseCallback!, close);
			return;
		}

		// Hover mode: only inactive codes
		let inactiveCodes;
		if (q) {
			inactiveCodes = allCodes.filter(
				c => !activeCodes.includes(c.name) && c.name.toLowerCase().includes(q),
			);
		} else {
			inactiveCodes = allCodes
				.filter(c => !activeCodes.includes(c.name))
				.sort((a, b) => b.createdAt - a.createdAt)
				.slice(0, MAX_RECENT);
		}

		if (inactiveCodes.length > 0) {
			renderToggleList(suggestionZone, inactiveCodes, activeCodes, onToggle, { onNavClick, skipSeparator: true });
		} else if (q) {
			renderEnterHint(suggestionZone, filter!);
		}

		if (options.app) renderBrowseItem(suggestionZone, options.app, adapter.registry, browseCallback!, close);
	}

	rebuildSuggestions();

	// ── c) Active codes zone (hover mode only) ──
	if (isHoverMode && activeCodes.length > 0) {
		container.appendChild(createSeparator());

		const activeZone = document.createElement('div');
		activeZone.className = 'codemarker-tooltip-toggle-zone';

		const activeCodeDefs = allCodes.filter(c => activeCodes.includes(c.name));
		if (activeCodeDefs.length > 0) {
			renderToggleList(activeZone, activeCodeDefs, activeCodes, onToggle, { onNavClick, skipSeparator: true });
		}

		container.appendChild(activeZone);
	}

	// ── d) Memo section ──
	const memo: MemoHandle = renderMemoSection(
		container,
		() => adapter.getMemo(),
		(value) => adapter.setMemo(value),
		activeCodes.length > 0,
		() => close(),
	);

	// ── d2) Magnitude section ──
	let magnitudeHandle: MagnitudeHandle | null = null;
	const showMag = options.showMagnitudeSection !== false
		&& adapter.getMagnitudeForCode
		&& adapter.setMagnitudeForCode;

	if (showMag) {
		const activeCodeIds = activeCodes
			.map(name => adapter.registry.getByName(name)?.id)
			.filter((id): id is string => !!id);

		magnitudeHandle = renderMagnitudeSection(
			container,
			adapter.registry,
			activeCodeIds,
			(codeId) => adapter.getMagnitudeForCode!(codeId),
			(codeId, value) => {
				adapter.setMagnitudeForCode!(codeId, value);
				adapter.save();
			},
			activeCodes.length > 0,
		);
	}

	// ── d3) Relations section ──
	let relationsHandle: RelationsHandle | null = null;
	const showRel = options.showRelationsSection !== false
		&& adapter.getRelationsForCode
		&& adapter.setRelationsForCode;

	if (showRel) {
		const activeCodeIds = activeCodes
			.map(name => adapter.registry.getByName(name)?.id)
			.filter((id): id is string => !!id);

		const allLabels = collectAllLabels(adapter.registry.getAll(), []);

		relationsHandle = renderRelationsSection(
			container,
			adapter.registry,
			activeCodeIds,
			(codeId) => adapter.getRelationsForCode!(codeId),
			(codeId, relations) => {
				adapter.setRelationsForCode!(codeId, relations);
				adapter.save();
			},
			activeCodes.length > 0,
			allLabels,
		);
	}

	// ── e) Action buttons ──
	container.appendChild(createSeparator());

	if (options.app) {
		const app = options.app;
		const defaultColor = options.modalDefaultColor ?? adapter.registry.peekNextPaletteColor();
		container.appendChild(
			createActionItem('Add New Code', 'plus-circle', () => {
				// Fire onBeforeModal BEFORE close() so engines can set state (e.g. image
				// flags "modal opening — don't auto-delete the zero-code marker") before
				// onClose runs. Reversed order silently deleted just-drawn image regions.
				options.onBeforeModal?.();
				close();
				new CodeFormModal(app, defaultColor, (name, color, description) => {
					adapter.registry.create(name, color, description);
					adapter.addCode(name);
					adapter.onRefresh();
				}, options.onModalClose).open();
			}),
		);
	}

	if (options.deleteAction) {
		const { label, icon, onDelete } = options.deleteAction;
		container.appendChild(
			createActionItem(label, icon, () => {
				onDelete();
				close();
			}),
		);
	}

	// ── Position + scroll tracker ──
	placeFloatingNextFrame(container, options.anchor.rect, 8, options.anchor.preferredSide);

	if (options.anchor.tracker) {
		const { scrollEl, computeRect } = options.anchor.tracker;
		let rafId: number | null = null;
		const onScroll = () => {
			if (rafId !== null) return;
			rafId = requestAnimationFrame(() => {
				rafId = null;
				const newRect = computeRect();
				if (!newRect) {
					// Anchor saiu de view (linha rolada pra fora, célula desmontada, etc.)
					close();
					return;
				}
				placeFloating(container, newRect, 8, options.anchor.preferredSide);
			});
		};
		scrollEl.addEventListener('scroll', onScroll, { passive: true });
		// Captura scroll de ancestrais também (nested scroll containers)
		window.addEventListener('scroll', onScroll, { passive: true, capture: true });
		window.addEventListener('resize', onScroll, { passive: true });

		teardownTracker = () => {
			scrollEl.removeEventListener('scroll', onScroll);
			window.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', onScroll);
			if (rafId !== null) cancelAnimationFrame(rafId);
		};
	}

	// Auto-focus (selection mode by default, overridable)
	const shouldFocus = options.autoFocus ?? !isHoverMode;
	if (shouldFocus) {
		setTimeout(() => textComponent.inputEl.focus(), 50);
	}

	return { close, container };
}
