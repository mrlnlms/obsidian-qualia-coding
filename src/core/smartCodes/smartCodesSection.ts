import { Menu, setIcon } from 'obsidian';
import type { SmartCodeDefinition } from './types';
import type { SmartCodeCache } from './cache';
import type { SmartCodeRegistry } from './smartCodeRegistryApi';

export interface SmartCodesSectionState {
	collapsed: boolean;
	selectedSmartCodeId: string | null;
}

export interface SmartCodesSectionCallbacks {
	onToggleCollapsed(): void;
	onSmartCodeClick(smartCodeId: string): void;
	onSmartCodeRightClick(smartCodeId: string, event: MouseEvent): void;
	onNew(): void;
	onToggleHidden(smartCodeId: string): void;
}

/** Renderiza section "Smart Codes" no topo do Code Explorer. Non-virtual (assume <100 sc). */
export function renderSmartCodesSection(
	container: HTMLElement,
	smartCodes: SmartCodeDefinition[],
	cache: SmartCodeCache,
	state: SmartCodesSectionState,
	callbacks: SmartCodesSectionCallbacks,
): void {
	const sectionEl = container.createDiv({ cls: 'qc-smart-codes-section' });

	const totalCount = smartCodes.length;
	const visible = smartCodes.filter(sc => !sc.hidden);
	const visibleCount = visible.length;
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
		if (sc.hidden) continue;  // hidden ones suppressed
		const row = sectionEl.createDiv({ cls: 'qc-smart-code-row' });
		if (state.selectedSmartCodeId === sc.id) row.addClass('is-selected');

		const swatch = row.createSpan({ cls: 'qc-sc-swatch' });
		swatch.style.backgroundColor = sc.color;

		row.createSpan({ text: '⚡ ', cls: 'qc-sc-icon' });
		row.createSpan({ text: sc.name, cls: 'qc-sc-name' });

		const isDirty = cache.isDirty(sc.id);
		const count = isDirty ? '…' : String(cache.getCount(sc.id));
		row.createSpan({ text: count, cls: 'qc-sc-count' });

		const eyeBtn = row.createSpan({ cls: 'qc-sc-eye' });
		setIcon(eyeBtn, sc.hidden ? 'eye-off' : 'eye');
		eyeBtn.title = sc.hidden ? 'Unhide' : 'Hide';
		eyeBtn.onclick = (e) => { e.stopPropagation(); callbacks.onToggleHidden(sc.id); };

		row.style.cursor = 'pointer';
		row.onclick = (e) => {
			if (e.target === eyeBtn || (e.target as HTMLElement).closest('.qc-sc-eye')) return;
			callbacks.onSmartCodeClick(sc.id);
		};
		row.oncontextmenu = (e) => { e.preventDefault(); callbacks.onSmartCodeRightClick(sc.id, e); };
	}

	const newBtn = sectionEl.createEl('button', { text: '+ New smart code', cls: 'qc-sc-new-btn' });
	newBtn.onclick = () => callbacks.onNew();
}

/** Helper pra construir o context menu de uma smart code row. */
export function showSmartCodeContextMenu(
	sc: SmartCodeDefinition,
	event: MouseEvent,
	smartCodeRegistry: SmartCodeRegistry,
	onEdit: () => void,
	onAfterMutation: () => void,
): void {
	const menu = new Menu();
	menu.addItem((i) => i.setTitle('Edit predicate').setIcon('pencil').onClick(() => onEdit()));
	menu.addItem((i) => i.setTitle('Rename').setIcon('text-cursor').onClick(() => {
		// TODO: trocar window.prompt por PromptModal (dialogs.ts) quando wirar a section.
		const next = window.prompt('New name:', sc.name);
		if (next && next.trim() !== sc.name) {
			smartCodeRegistry.update(sc.id, { name: next.trim() });
			onAfterMutation();
		}
	}));
	menu.addItem((i) => i.setTitle(sc.hidden ? 'Unhide' : 'Hide').setIcon(sc.hidden ? 'eye' : 'eye-off').onClick(() => {
		smartCodeRegistry.update(sc.id, { hidden: !sc.hidden });
		onAfterMutation();
	}));
	menu.addSeparator();
	menu.addItem((i) => i.setTitle('Delete').setIcon('trash').onClick(() => {
		// TODO: trocar window.confirm por ConfirmModal (dialogs.ts) quando wirar a section.
		if (window.confirm(`Delete smart code "${sc.name}"?`)) {
			smartCodeRegistry.delete(sc.id);
			onAfterMutation();
		}
	}));
	menu.showAtMouseEvent(event);
}
