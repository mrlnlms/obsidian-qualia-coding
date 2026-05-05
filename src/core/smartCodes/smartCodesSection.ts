import { App, Menu, setIcon } from 'obsidian';
import type { SmartCodeDefinition } from './types';
import type { SmartCodeCache } from './cache';
import type { SmartCodeRegistry } from './smartCodeRegistryApi';
import { ConfirmModal, PromptModal } from '../dialogs';

export interface SmartCodesSectionState {
	collapsed: boolean;
	selectedSmartCodeId: string | null;
}

export interface SmartCodesSectionCallbacks {
	onToggleCollapsed(): void;
	onSmartCodeClick(smartCodeId: string): void;
	onNew(): void;
	onEditPredicate(smartCodeId: string): void;
}

/** Renderiza section "Smart Codes" no topo do Code Explorer/Detail. Non-virtual (assume <100 sc).
 *  Layout segue o mesmo da row do hub (swatch | eye | name | count | menu). */
export function renderSmartCodesSection(
	container: HTMLElement,
	smartCodes: SmartCodeDefinition[],
	cache: SmartCodeCache,
	registry: SmartCodeRegistry,
	app: App,
	state: SmartCodesSectionState,
	callbacks: SmartCodesSectionCallbacks,
): void {
	const sectionEl = container.createDiv({ cls: 'qc-smart-codes-section' });

	const totalCount = smartCodes.length;
	const visibleCount = smartCodes.filter(sc => !sc.hidden).length;
	const countLabel = totalCount > visibleCount ? `${visibleCount} / ${totalCount}` : `${visibleCount}`;

	const headerEl = sectionEl.createDiv({ cls: 'qc-smart-codes-section-header' });
	const chevron = headerEl.createSpan({ cls: 'qc-smart-codes-chevron' });
	chevron.setText(state.collapsed ? '▸' : '▾');
	headerEl.createSpan({ text: ' ⚡ Smart Codes ' });
	headerEl.createSpan({ text: `(${countLabel})`, cls: 'qc-smart-codes-count' });
	headerEl.style.cursor = 'pointer';
	headerEl.onclick = () => callbacks.onToggleCollapsed();

	if (state.collapsed) return;

	for (const sc of smartCodes) {
		const row = sectionEl.createDiv({ cls: 'qc-smart-code-row' });
		if (state.selectedSmartCodeId === sc.id) row.addClass('is-selected');
		if (sc.hidden) row.addClass('is-hidden');

		const swatch = row.createSpan({ cls: 'qc-smart-code-swatch' });
		swatch.style.backgroundColor = sc.color;

		const eyeBtn = row.createSpan({ cls: 'qc-smart-code-eye' });
		setIcon(eyeBtn, sc.hidden ? 'eye-off' : 'eye');
		eyeBtn.title = sc.hidden ? 'Show in markers' : 'Hide from markers';
		eyeBtn.onclick = (e) => {
			e.stopPropagation();
			registry.update(sc.id, { hidden: !sc.hidden });
		};

		row.createSpan({ text: sc.name, cls: 'qc-smart-code-name' });
		// getCount é sincrono e rapido — sempre chama, dropa o pattern "…" que ficava preso
		// quando ninguem externamente chamava getCount pra clear dirty.
		row.createSpan({ text: String(cache.getCount(sc.id)), cls: 'qc-smart-code-count' });

		const menuBtn = row.createSpan({ cls: 'qc-smart-code-menu' });
		setIcon(menuBtn, 'more-vertical');
		menuBtn.title = 'More actions';
		menuBtn.onclick = (e) => {
			e.stopPropagation();
			showRowMenu(sc, e, registry, app, () => callbacks.onEditPredicate(sc.id));
		};

		row.style.cursor = 'pointer';
		row.onclick = (e) => {
			const target = e.target as HTMLElement;
			if (target.closest('.qc-smart-code-eye') || target.closest('.qc-smart-code-menu')) return;
			callbacks.onSmartCodeClick(sc.id);
		};
		row.oncontextmenu = (e) => {
			e.preventDefault();
			showRowMenu(sc, e, registry, app, () => callbacks.onEditPredicate(sc.id));
		};
	}

	const newBtn = sectionEl.createEl('button', { text: '+ New smart code', cls: 'qc-smart-codes-new-btn' });
	newBtn.onclick = () => callbacks.onNew();
}

/** Context menu da row — mesma estrutura do hub modal. PromptModal/ConfirmModal (não window.*). */
function showRowMenu(
	sc: SmartCodeDefinition,
	event: MouseEvent,
	registry: SmartCodeRegistry,
	app: App,
	onEditPredicate: () => void,
): void {
	const menu = new Menu();
	menu.addItem((i) => i.setTitle('Edit query').setIcon('pencil').onClick(onEditPredicate));
	menu.addItem((i) => i.setTitle('Rename').setIcon('text-cursor').onClick(() => {
		new PromptModal({
			app,
			title: 'Rename smart code',
			initialValue: sc.name,
			placeholder: 'New name',
			onSubmit: (next) => {
				if (next !== sc.name) registry.update(sc.id, { name: next });
			},
		}).open();
	}));
	menu.addItem((i) => i
		.setTitle(sc.hidden ? 'Show' : 'Hide')
		.setIcon(sc.hidden ? 'eye' : 'eye-off')
		.onClick(() => registry.update(sc.id, { hidden: !sc.hidden }))
	);
	menu.addSeparator();
	menu.addItem((i) => i.setTitle('Delete').setIcon('trash').onClick(() => {
		new ConfirmModal({
			app,
			title: `Delete smart code "${sc.name}"?`,
			message: 'Audit log preserves the deletion event.',
			confirmLabel: 'Delete',
			destructive: true,
			onConfirm: () => registry.delete(sc.id),
		}).open();
	}));
	menu.showAtMouseEvent(event);
}
