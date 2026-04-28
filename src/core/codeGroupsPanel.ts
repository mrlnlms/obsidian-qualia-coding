/**
 * codeGroupsPanel — Renders the "Groups" collapsible panel above the codebook tree.
 *
 * Chips show name + count + color dot. Click toggles selection; right-click opens menu.
 * [+] button delegates to onCreateGroup callback (caller opens PromptModal).
 */

import { setIcon } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

export interface CodeGroupsPanelCallbacks {
	selectedGroupId: string | null;
	onSelectGroup(groupId: string | null): void;
	onCreateGroup(): void;
	onChipContextMenu(groupId: string, event: MouseEvent): void;
	onEditDescription(groupId: string): void;
	onEditMemo(groupId: string): void;
	/** Optional. Drop a code (dragged from the codebook tree) onto a group chip → add to group. */
	onDropCodeOnGroup?(codeId: string, groupId: string): void;
}

export function renderCodeGroupsPanel(
	container: HTMLElement,
	registry: CodeDefinitionRegistry,
	callbacks: CodeGroupsPanelCallbacks,
): { cleanup: () => void } {
	// Preserva painel existente pra permitir re-render incremental sem recriar container
	let panel = container.querySelector('.codebook-groups-panel') as HTMLElement | null;
	if (!panel) {
		panel = container.createDiv({ cls: 'codebook-groups-panel' });
	} else {
		panel.empty();
	}

	const groups = registry.getAllGroups();
	const hasGroups = groups.length > 0;

	// Header: título + [+] botão
	const header = panel.createDiv({ cls: 'codebook-groups-header' });
	header.createSpan({ cls: 'codebook-groups-title', text: 'Groups' });
	const addBtn = header.createEl('button', {
		cls: 'codebook-groups-add-btn',
		attr: { 'aria-label': 'Create group', title: 'Create group' },
	});
	setIcon(addBtn, 'plus');
	addBtn.addEventListener('click', () => callbacks.onCreateGroup());

	// Collapsed quando vazio (só mostra header + [+], sem chips container)
	if (!hasGroups) {
		panel.addClass('is-empty');
		return { cleanup: () => {} };
	}
	panel.removeClass('is-empty');

	// Chips container
	const chipsWrap = panel.createDiv({ cls: 'codebook-groups-chips' });
	for (const g of groups) {
		const chip = chipsWrap.createEl('button', { cls: 'codebook-group-chip' });
		if (callbacks.selectedGroupId === g.id) chip.addClass('is-selected');
		if (g.description) chip.title = `${g.name}\n\n${g.description}`;

		const dot = chip.createSpan({ cls: 'codebook-group-chip-dot' });
		dot.style.backgroundColor = g.color;

		chip.createSpan({ cls: 'codebook-group-chip-name', text: g.name });

		const count = registry.getGroupMemberCount(g.id);
		chip.createSpan({ cls: 'codebook-group-chip-count', text: String(count) });

		chip.addEventListener('click', () => {
			if (callbacks.selectedGroupId === g.id) callbacks.onSelectGroup(null);
			else callbacks.onSelectGroup(g.id);
		});

		chip.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			callbacks.onChipContextMenu(g.id, e);
		});

		// Drop target: chip aceita um code arrastado da árvore. Visual feedback via .is-drop-target.
		// dropEffect='move' bate com effectAllowed='move' setado no dragstart do tree;
		// 'link' ou 'copy' fariam o navegador cancelar o drop silenciosamente.
		if (callbacks.onDropCodeOnGroup) {
			chip.addEventListener('dragover', (e) => {
				if (!e.dataTransfer) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
				chip.classList.add('is-drop-target');
			});
			chip.addEventListener('dragleave', () => {
				chip.classList.remove('is-drop-target');
			});
			chip.addEventListener('drop', (e) => {
				e.preventDefault();
				e.stopPropagation();
				chip.classList.remove('is-drop-target');
				const codeId = e.dataTransfer?.getData('text/plain');
				if (codeId) callbacks.onDropCodeOnGroup?.(codeId, g.id);
			});
		}
	}

	// Description do group selected, sempre visível quando há filter ativo.
	// Click abre o editor inline (mesmo flow do "Edit description" do menu).
	const selected = callbacks.selectedGroupId
		? registry.getGroup(callbacks.selectedGroupId)
		: null;
	if (selected) {
		const desc = panel.createDiv({ cls: 'codebook-groups-description' });
		desc.title = 'Click to edit';
		if (selected.description) {
			desc.createSpan({ text: selected.description });
		} else {
			desc.addClass('is-placeholder');
			desc.createSpan({ text: 'Add description...' });
		}
		desc.addEventListener('click', () => callbacks.onEditDescription(selected.id));

		const memo = panel.createDiv({ cls: 'codebook-groups-memo' });
		memo.title = 'Click to edit memo';
		if (selected.memo) {
			memo.createSpan({ text: selected.memo });
		} else {
			memo.addClass('is-placeholder');
			memo.createSpan({ text: 'Add memo...' });
		}
		memo.addEventListener('click', () => callbacks.onEditMemo(selected.id));
	}

	return { cleanup: () => {} };
}
