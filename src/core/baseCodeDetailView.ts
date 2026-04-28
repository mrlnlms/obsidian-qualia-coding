/**
 * BaseCodeDetailView — Abstract base for Code Detail sidebar views.
 *
 * Shared across all engines: 3 navigation modes (list, code-focused, marker-focused),
 * search filter, back navigation, onChange auto-refresh.
 *
 * Engine subclasses implement hooks:
 *   - getMarkerLabel(marker) — truncated text / time range / page ref
 *   - getMarkerText(marker) — full text for blockquote (null if unavailable)
 *   - navigateToMarker(marker) — scroll / seek / open file
 *   - shortenPath(fileId) — strip .md / .csv / etc.
 *   - renderCustomSection(container, marker) — optional extra section (e.g. memo)
 */

import { FuzzySuggestModal, ItemView, Menu, Notice, WorkspaceLeaf } from 'obsidian';
import { BaseMarker, GroupDefinition, SidebarModelInterface, AuditEntry } from './types';

/**
 * Audit log accessor — passado pelo plugin pra views que querem renderizar a timeline.
 * Opcional: views construídas sem ele funcionam normal, só não mostram a seção History.
 */
export interface AuditAccess {
	getLog(): AuditEntry[];
	hideEntry(id: string): void;
	unhideEntry(id: string): void;
	exportCodeHistory(codeId: string, codeName: string): void;
}
import { renderListShell, renderListContent } from './detailListRenderer';
import { renderCodeDetail } from './detailCodeRenderer';
import { renderMarkerDetail } from './detailMarkerRenderer';
import type { CodebookTreeState } from './codebookTreeRenderer';
import { createExpandedState, collectAllCodesUnderFolder, buildFlatTree, type ExpandedState } from './hierarchyHelpers';
import { showCodeContextMenu, showFolderContextMenu, type ContextMenuCallbacks } from './codebookContextMenu';
import { setupDragDrop } from './codebookDragDrop';
import { MergeModal, executeMerge } from './mergeModal';
import { PromptModal, ConfirmModal } from './dialogs';
import { getAddToGroupCandidates } from './codeGroupsAddPicker';
import { BulkRenameModal } from './bulkRenameModal';

export abstract class BaseCodeDetailView extends ItemView {
	protected model: SidebarModelInterface;
	protected markerId: string | null = null;
	protected codeId: string | null = null;

	// Tree state for codebook panel
	protected expanded: ExpandedState = createExpandedState();
	protected treeDragMode: 'reorganize' | 'merge' = 'reorganize';
	protected selectedGroupId: string | null = null;
	// Multi-select state — Cmd/Ctrl toggle, Shift range from anchor.
	protected selectedCodeIds: Set<string> = new Set();
	protected selectionAnchor: string | null = null;

	private searchQuery = '';
	private rafId: number | null = null;
	private scheduleRefresh = () => {
		if (this.rafId !== null) return;
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this.refreshCurrentMode();
		});
	};
	private boundApplyHover = () => this.applyHoverToItems();

	// Persistent DOM for list mode (search survives refreshes)
	private listSearchWrap: HTMLElement | null = null;
	private listContentZone: HTMLElement | null = null;
	private listShellCleanup: (() => void) | null = null;
	private dragDropCleanup: (() => void) | null = null;
	private listMode = false;

	protected auditAccess?: AuditAccess;

	constructor(leaf: WorkspaceLeaf, model: SidebarModelInterface, auditAccess?: AuditAccess) {
		super(leaf);
		this.model = model;
		this.auditAccess = auditAccess;
	}

	// ─── Abstract hooks (engine implements) ──────────────────

	abstract getMarkerLabel(marker: BaseMarker): string;
	abstract getMarkerText(marker: BaseMarker): string | null;
	abstract navigateToMarker(marker: BaseMarker): void;
	abstract shortenPath(fileId: string): string;

	/** Optional hook — override to add engine-specific sections (e.g. memo textarea). */
	protected renderCustomSection(_container: HTMLElement, _marker: BaseMarker): void {}

	// ─── ItemView lifecycle ──────────────────────────────────

	getIcon(): string {
		return 'tag';
	}

	async onOpen() {
		this.contentEl.addClass('codemarker-detail-panel');
		// tabindex=-1 permite que contentEl receba keyboard events sem aparecer no tab order
		if (!this.contentEl.hasAttribute('tabindex')) this.contentEl.setAttribute('tabindex', '-1');
		this.model.onChange(this.scheduleRefresh);
		this.model.onHoverChange(this.boundApplyHover);
		document.addEventListener('qualia:registry-changed', this.scheduleRefresh);

		const onVisibilityChange = () => {
			if (this.listContentZone) {
				renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
			}
		};
		this.model.registry.addVisibilityListener(onVisibilityChange);
		this.register(() => this.model.registry.removeVisibilityListener(onVisibilityChange));

		// Keyboard: Esc limpa seleção, Delete/Backspace dispara bulk delete (se há seleção).
		// Skip quando foco em input/textarea pra não consumir typing no search ou em edits inline.
		const onKeyDown = (e: KeyboardEvent) => {
			const active = document.activeElement;
			if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
			if (e.key === 'Escape' && this.selectedCodeIds.size > 0) {
				e.preventDefault();
				this.clearCodeSelection();
				return;
			}
			if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedCodeIds.size > 0) {
				e.preventDefault();
				this.bulkDeleteSelected();
			}
		};
		this.contentEl.addEventListener('keydown', onKeyDown);
		this.register(() => this.contentEl.removeEventListener('keydown', onKeyDown));

		// Click em zona vazia (fora de row de código, folder, ou painel Groups) limpa seleção.
		const onContentClick = (e: MouseEvent) => {
			if (!(e.target instanceof HTMLElement)) return;
			if (e.target.closest('[data-code-id]')) return;
			if (e.target.closest('[data-folder-id]')) return;
			if (e.target.closest('.codebook-groups-panel')) return;
			if (this.selectedCodeIds.size > 0) this.clearCodeSelection();
		};
		this.contentEl.addEventListener('click', onContentClick);
		this.register(() => this.contentEl.removeEventListener('click', onContentClick));

		this.refreshCurrentMode();
	}

	async onClose() {
		this.model.offChange(this.scheduleRefresh);
		this.model.offHoverChange(this.boundApplyHover);
		document.removeEventListener('qualia:registry-changed', this.scheduleRefresh);
		if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
		if (this.listShellCleanup) { this.listShellCleanup(); this.listShellCleanup = null; }
		if (this.dragDropCleanup) { this.dragDropCleanup(); this.dragDropCleanup = null; }
		this.contentEl.empty();
	}

	// ─── Navigation API ─────────────────────────────────────

	/** Navigate to the list of all codes */
	showList() {
		this.markerId = null;
		this.codeId = null;
		this.leaf.updateHeader?.();
		this.renderList();
	}

	/** Navigate to a code-focused detail (all markers for a code) */
	showCodeDetail(codeId: string) {
		this.markerId = null;
		this.codeId = codeId;
		this.leaf.updateHeader?.();
		this.doRenderCodeDetail();
	}

	/** Set context to a specific marker + code (marker-focused detail) */
	setContext(markerId: string, codeId: string) {
		this.markerId = markerId;
		this.codeId = codeId;
		this.leaf.updateHeader?.();
		this.doRenderMarkerDetail();
	}

	getDisplayText(): string {
		if (this.codeId) {
			return this.model.registry.getById(this.codeId)?.name ?? 'Code Detail';
		}
		return 'Code Detail';
	}

	// ─── Refresh routing ────────────────────────────────────

	protected refreshCurrentMode() {
		if (this.markerId && this.codeId) {
			this.doRenderMarkerDetail();
		} else if (this.codeId) {
			this.doRenderCodeDetail();
		} else {
			// In list mode, only rebuild the list content (preserve search input)
			if (this.listMode && this.listContentZone) {
				renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
			} else {
				this.renderList();
			}
		}
	}

	// ─── List Mode ──────────────────────────────────────────

	protected getTreeState(): CodebookTreeState {
		return {
			expanded: this.expanded,
			searchQuery: this.searchQuery,
			dragMode: this.treeDragMode,
			selectedGroupId: this.selectedGroupId,
			selectedCodeIds: this.selectedCodeIds,
		};
	}

	// ─── Multi-select helpers ───────────────────────────────

	private toggleCodeSelection(codeId: string): void {
		if (this.selectedCodeIds.has(codeId)) {
			this.selectedCodeIds.delete(codeId);
		} else {
			this.selectedCodeIds.add(codeId);
		}
		this.selectionAnchor = codeId;
	}

	/**
	 * Shift+click: range entre o anchor (última row clicada com bare/Cmd) e o target,
	 * inclusive. Range respeita a árvore VISÍVEL (mesma flat tree do renderer, com
	 * mesmas regras de search e expanded). Folders no range são ignorados — só códigos
	 * entram na seleção. Sem anchor, comporta como toggle (seta anchor + adiciona).
	 */
	private selectCodeRange(targetId: string): void {
		if (!this.selectionAnchor) {
			this.selectedCodeIds.add(targetId);
			this.selectionAnchor = targetId;
			return;
		}
		const flat = buildFlatTree(this.model.registry, this.expanded, this.searchQuery);
		const anchorIdx = flat.findIndex(n => n.type === 'code' && n.def.id === this.selectionAnchor);
		const targetIdx = flat.findIndex(n => n.type === 'code' && n.def.id === targetId);
		if (anchorIdx === -1 || targetIdx === -1) {
			this.selectedCodeIds.add(targetId);
			return;
		}
		const [from, to] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
		// Range REPLACE: descarta seleção anterior, vai do anchor ao target inclusive
		this.selectedCodeIds.clear();
		for (let i = from; i <= to; i++) {
			const node = flat[i];
			if (node?.type === 'code') this.selectedCodeIds.add(node.def.id);
		}
		// Anchor preserved pra permitir extensão sequencial de range
	}

	private clearCodeSelection(): void {
		if (this.selectedCodeIds.size === 0 && this.selectionAnchor === null) return;
		this.selectedCodeIds.clear();
		this.selectionAnchor = null;
		this.refreshListContent();
	}

	/**
	 * Bulk delete dos códigos atualmente selecionados. Mostra ConfirmModal com count
	 * e preview dos primeiros nomes; após confirmação, chama registry.delete() em loop.
	 * Markers que referenciam esses códigos perdem a referência (registry.delete já cuida).
	 */
	private showBulkContextMenu(event: MouseEvent): void {
		const count = this.selectedCodeIds.size;
		const menu = new Menu();
		menu.addItem(item => item
			.setTitle(`Rename ${count} codes...`)
			.setIcon('pencil')
			.onClick(() => this.bulkRenameSelected()));
		menu.addItem(item => item
			.setTitle(`Change color of ${count} codes`)
			.setIcon('palette')
			.onClick(() => this.bulkRecolorSelected()));
		menu.addItem(item => item
			.setTitle(`Move ${count} codes to folder...`)
			.setIcon('folder')
			.onClick(() => this.bulkMoveSelectedToFolder()));
		menu.addItem(item => item
			.setTitle(`Add ${count} codes to group...`)
			.setIcon('tag')
			.onClick(() => this.bulkAddSelectedToGroup()));
		menu.addSeparator();
		menu.addItem(item => item
			.setTitle(`Delete ${count} codes`)
			.setIcon('trash')
			.setWarning(true)
			.onClick(() => this.bulkDeleteSelected()));
		menu.addSeparator();
		menu.addItem(item => item
			.setTitle('Clear selection')
			.setIcon('x')
			.onClick(() => this.clearCodeSelection()));
		menu.showAtMouseEvent(event);
	}

	private bulkRenameSelected(): void {
		const ids = Array.from(this.selectedCodeIds);
		if (ids.length === 0) return;
		const names = ids.map(id => this.model.registry.getById(id)?.name).filter((n): n is string => Boolean(n));
		new BulkRenameModal({
			app: this.app,
			currentNames: names,
			onSubmit: (prefix, suffix) => {
				let renamed = 0;
				let skipped = 0;
				for (const id of ids) {
					const def = this.model.registry.getById(id);
					if (!def) { skipped++; continue; }
					const newName = `${prefix}${def.name}${suffix}`;
					if (newName === def.name) { skipped++; continue; }
					const ok = this.model.registry.update(id, { name: newName });
					if (ok) renamed++;
					else skipped++;
				}
				this.model.saveMarkers();
				this.refreshCurrentMode();
				const msg = skipped > 0
					? `Renamed ${renamed} code${renamed === 1 ? '' : 's'} (${skipped} skipped — name conflicts).`
					: `Renamed ${renamed} code${renamed === 1 ? '' : 's'}.`;
				new Notice(msg);
			},
		}).open();
	}

	private bulkRecolorSelected(): void {
		const ids = Array.from(this.selectedCodeIds);
		if (ids.length === 0) return;
		// Input HTML5 type=color invisível clicado programaticamente. 'change' (não 'input')
		// pra aplicar UMA vez quando user fecha o picker — evita N updates por tick durante drag.
		const input = document.createElement('input');
		input.type = 'color';
		// Default: cor do primeiro selecionado (heurística — user vê a cor "atual" como ponto de partida)
		const firstColor = this.model.registry.getById(ids[0]!)?.color ?? '#888888';
		input.value = firstColor;
		input.style.position = 'absolute';
		input.style.opacity = '0';
		input.style.pointerEvents = 'none';
		document.body.appendChild(input);
		input.addEventListener('change', () => {
			for (const id of ids) {
				this.model.registry.update(id, { color: input.value });
			}
			this.model.saveMarkers();
			this.refreshCurrentMode();
			input.remove();
			new Notice(`Recolored ${ids.length} code${ids.length === 1 ? '' : 's'}.`);
		});
		// Se user fecha sem mudar, change não dispara — cleanup via blur fallback
		input.addEventListener('blur', () => setTimeout(() => { if (input.isConnected) input.remove(); }, 200));
		input.click();
	}

	private bulkMoveSelectedToFolder(): void {
		const ids = Array.from(this.selectedCodeIds);
		if (ids.length === 0) return;
		const folders = this.model.registry.getAllFolders();
		const view = this;

		type Choice =
			| { kind: 'folder'; id: string; name: string }
			| { kind: 'root' }
			| { kind: 'new' };

		class FolderPicker extends FuzzySuggestModal<Choice> {
			getItems(): Choice[] {
				const items: Choice[] = [{ kind: 'root' }];
				for (const f of folders) items.push({ kind: 'folder', id: f.id, name: f.name });
				items.push({ kind: 'new' });
				return items;
			}
			getItemText(item: Choice): string {
				if (item.kind === 'root') return '— Move out of folder —';
				if (item.kind === 'new') return '+ New folder...';
				return item.name;
			}
			onChooseItem(item: Choice): void {
				if (item.kind === 'new') {
					new PromptModal({
						app: view.app,
						title: 'New folder',
						placeholder: 'Folder name',
						onSubmit: (name) => {
							const trimmed = name.trim();
							if (!trimmed) return;
							const folder = view.model.registry.createFolder(trimmed);
							for (const id of ids) view.model.registry.setCodeFolder(id, folder.id);
							view.model.saveMarkers();
							view.expanded.folders.add(folder.id);
							view.refreshCurrentMode();
							new Notice(`Moved ${ids.length} code${ids.length === 1 ? '' : 's'} to "${trimmed}".`);
						},
					}).open();
					return;
				}
				const folderId = item.kind === 'root' ? undefined : item.id;
				for (const id of ids) view.model.registry.setCodeFolder(id, folderId);
				view.model.saveMarkers();
				if (folderId) view.expanded.folders.add(folderId);
				view.refreshCurrentMode();
				const target = item.kind === 'root' ? 'root' : `"${item.name}"`;
				new Notice(`Moved ${ids.length} code${ids.length === 1 ? '' : 's'} to ${target}.`);
			}
		}
		new FolderPicker(this.app).open();
	}

	private bulkAddSelectedToGroup(): void {
		const ids = Array.from(this.selectedCodeIds);
		if (ids.length === 0) return;
		const allGroups = this.model.registry.getAllGroups();
		const view = this;

		type Choice = { kind: 'group'; id: string; name: string } | { kind: 'new' };

		class GroupPicker extends FuzzySuggestModal<Choice> {
			getItems(): Choice[] {
				const items: Choice[] = allGroups.map(g => ({ kind: 'group' as const, id: g.id, name: g.name }));
				items.push({ kind: 'new' });
				return items;
			}
			getItemText(item: Choice): string {
				return item.kind === 'new' ? '+ New group...' : item.name;
			}
			onChooseItem(item: Choice): void {
				if (item.kind === 'new') {
					new PromptModal({
						app: view.app,
						title: 'New group',
						placeholder: 'Group name',
						onSubmit: (name) => {
							const trimmed = name.trim();
							if (!trimmed) {
								new Notice('Group name cannot be empty.');
								return;
							}
							const g = view.model.registry.createGroup(trimmed);
							for (const id of ids) view.model.registry.addCodeToGroup(id, g.id);
							view.model.saveMarkers();
							view.refreshCurrentMode();
							new Notice(`Added ${ids.length} code${ids.length === 1 ? '' : 's'} to "${trimmed}".`);
						},
					}).open();
					return;
				}
				for (const id of ids) view.model.registry.addCodeToGroup(id, item.id);
				view.model.saveMarkers();
				view.refreshCurrentMode();
				new Notice(`Added ${ids.length} code${ids.length === 1 ? '' : 's'} to "${item.name}".`);
			}
		}
		new GroupPicker(this.app).open();
	}

	private bulkDeleteSelected(): void {
		const ids = Array.from(this.selectedCodeIds);
		if (ids.length === 0) return;
		const names = ids
			.map(id => this.model.registry.getById(id)?.name)
			.filter((n): n is string => Boolean(n));
		const preview = names.slice(0, 5).join(', ');
		const more = names.length > 5 ? ` and ${names.length - 5} more` : '';
		const message =
			`Delete ${ids.length} code${ids.length === 1 ? '' : 's'}?\n\n` +
			`${preview}${more}\n\n` +
			`Markers referencing these codes will lose the reference.`;
		new ConfirmModal({
			app: this.app,
			title: `Delete ${ids.length} code${ids.length === 1 ? '' : 's'}`,
			message,
			confirmLabel: 'Delete',
			destructive: true,
			onConfirm: () => {
				for (const id of ids) this.model.registry.delete(id);
				this.model.saveMarkers();
				this.selectedCodeIds.clear();
				this.selectionAnchor = null;
				this.refreshCurrentMode();
				new Notice(`Deleted ${ids.length} code${ids.length === 1 ? '' : 's'}.`);
			},
		}).open();
	}

	private refreshListContent(): void {
		if (this.listContentZone) {
			renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
		}
	}

	private renderList() {
		this.listMode = true;
		if (this.dragDropCleanup) { this.dragDropCleanup(); this.dragDropCleanup = null; }
		const result = renderListShell(this.contentEl, this.model, this.listCallbacks());
		this.listSearchWrap = result.listSearchWrap;
		this.listContentZone = result.listContentZone;
		this.listShellCleanup = result.cleanup;
		if (this.listContentZone) {
			renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
			this.dragDropCleanup = setupDragDrop(
				this.listContentZone,
				this.model.registry,
				() => this.treeDragMode,
				{
					onReparent: (codeId, newParentId, insertBefore) => {
						this.model.registry.setParent(codeId, newParentId, insertBefore);
						// Promoting to root also removes from folder
						if (!newParentId) {
							this.model.registry.setCodeFolder(codeId, undefined);
						}
						this.model.saveMarkers();
						if (newParentId) this.expanded.codes.add(newParentId);
					},
					onMergeDrop: (sourceId, targetId) => {
						const modal = new MergeModal({
							app: this.app,
							registry: this.model.registry,
							initialDestinationId: targetId,
							allMarkers: this.model.getAllMarkers(),
							onConfirm: (destId, srcIds, name, parentId) => {
								executeMerge({
									destinationId: destId,
									sourceIds: srcIds,
									registry: this.model.registry,
									markers: this.model.getAllMarkers(),
									destinationName: name,
									destinationParentId: parentId,
								});
								this.model.saveMarkers();
								this.showList();
							},
						});
						modal.addSource(sourceId);
						modal.open();
					},
					onMoveToFolder: (codeId, folderId) => {
						this.model.registry.setCodeFolder(codeId, folderId);
						this.model.saveMarkers();
						if (folderId) this.expanded.folders.add(folderId);
					},
					onDropOnEmptySpace: (codeId) => {
						// Drop em zona vazia da árvore só faz sentido se há um group filtrado:
						// remove o código do group ativo. Sem filter ativo, é no-op (gesto natural).
						if (!this.selectedGroupId) return;
						this.model.registry.removeCodeFromGroup(codeId, this.selectedGroupId);
						this.model.saveMarkers();
					},
					setDragMode: (mode) => {
						this.treeDragMode = mode;
					},
					refresh: () => {
						if (this.listContentZone) {
							renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
						}
					},
					onFolderHoverExpand: (folderId) => {
						if (this.expanded.folders.has(folderId)) return;
						this.expanded.folders.add(folderId);
						if (this.listContentZone) {
							renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
						}
					},
				},
			);
		}
	}

	private listCallbacks() {
		return {
			onCodeClick: (codeId: string, event: MouseEvent) => {
				const isToggle = event.metaKey || event.ctrlKey;
				const isRange = event.shiftKey && !isToggle;
				if (isToggle) {
					this.toggleCodeSelection(codeId);
					this.refreshListContent();
					return;
				}
				if (isRange) {
					this.selectCodeRange(codeId);
					this.refreshListContent();
					return;
				}
				// Click puro com seleção ativa = modo seleção, não navega:
				// - clicou na selected → tira da seleção
				// - clicou numa NÃO selected → limpa tudo (sem selecionar a nova, sem navegar)
				if (this.selectedCodeIds.size > 0) {
					if (this.selectedCodeIds.has(codeId)) {
						this.toggleCodeSelection(codeId);
						this.refreshListContent();
					} else {
						this.clearCodeSelection();
					}
					return;
				}
				// Sem seleção ativa: comportamento original (navegar pro detail)
				this.searchQuery = '';
				this.showCodeDetail(codeId);
			},
			onSearchChange: (query: string) => {
				this.searchQuery = query;
				if (this.listContentZone) {
					renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
				}
			},
			onToggleExpand: (codeId: string) => {
				if (this.expanded.codes.has(codeId)) {
					this.expanded.codes.delete(codeId);
				} else {
					this.expanded.codes.add(codeId);
				}
				if (this.listContentZone) {
					renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
				}
			},
			onCodeRightClick: (codeId: string, event: MouseEvent) => {
				// Se há seleção e o código clicado faz parte dela, mostra menu bulk com Delete N
				if (this.selectedCodeIds.size > 1 && this.selectedCodeIds.has(codeId)) {
					this.showBulkContextMenu(event);
					return;
				}
				showCodeContextMenu(event, codeId, this.model.registry, this.contextMenuCallbacks());
			},
			onFolderToggleExpand: (folderId: string) => {
				if (this.expanded.folders.has(folderId)) {
					this.expanded.folders.delete(folderId);
				} else {
					this.expanded.folders.add(folderId);
				}
				if (this.listContentZone) {
					renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
				}
			},
			onFolderRightClick: (folderId: string, event: MouseEvent) => {
				showFolderContextMenu(event, folderId, this.model.registry, {
					promptCreateSubfolder: (parentFolderId) => {
						new PromptModal({
							app: this.app,
							title: 'New subfolder',
							initialValue: '',
							confirmLabel: 'Create',
							onSubmit: (name) => {
								const trimmed = name.trim();
								if (!trimmed) return;
								this.model.registry.createFolder(trimmed, parentFolderId);
								this.model.saveMarkers();
							},
						}).open();
					},
					promptRenameFolder: (id) => {
						const folder = this.model.registry.getFolderById(id);
						if (!folder) return;
						new PromptModal({
							app: this.app,
							title: 'Rename folder',
							initialValue: folder.name,
							confirmLabel: 'Rename',
							onSubmit: (newName) => {
								if (newName === folder.name) return;
								const ok = this.model.registry.renameFolder(id, newName);
								if (ok) {
									this.model.saveMarkers();
								} else {
									new Notice('A folder with that name already exists.');
								}
							},
						}).open();
					},
					promptDeleteFolder: (id) => {
						const folder = this.model.registry.getFolderById(id);
						if (!folder) return;
						const subfolders = this.model.registry.getFolderDescendants(id);
						const codes = collectAllCodesUnderFolder(this.model.registry, id);

						let message = `Delete folder "${folder.name}"?`;
						if (subfolders.length > 0 || codes.length > 0) {
							message += `\n\nThis will permanently delete:`;
							if (subfolders.length > 0) {
								message += `\n  • ${subfolders.length} subfolder${subfolders.length === 1 ? '' : 's'}`;
							}
							if (codes.length > 0) {
								message += `\n  • ${codes.length} code${codes.length === 1 ? '' : 's'}`;
							}
							message += `\n\nMarkers using these codes will become orphans.`;
						}

						new ConfirmModal({
							app: this.app,
							title: 'Delete folder',
							message,
							confirmLabel: 'Delete',
							destructive: true,
							onConfirm: () => {
								this.model.registry.deleteFolder(id);
								this.model.saveMarkers();
							},
						}).open();
					},
				});
			},
			onDragModeChange: (mode: 'reorganize' | 'merge') => {
				this.treeDragMode = mode;
			},
			onToggleVisibility: (codeId: string) => {
				const def = this.model.registry.getById(codeId);
				if (!def) return;
				const currentlyHidden = def.hidden === true;
				this.model.registry.setGlobalHidden(codeId, !currentlyHidden);
				if (this.listContentZone) {
					renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
				}
			},
			onSelectGroup: (groupId: string | null) => {
				this.selectedGroupId = groupId;
				this.refreshCurrentMode();
			},
			onCreateGroup: () => {
				new PromptModal({
					app: this.app,
					title: 'New group',
					placeholder: 'Group name',
					onSubmit: (name) => {
						const trimmed = name.trim();
						if (!trimmed) {
							new Notice('Group name cannot be empty.');
							return;
						}
						this.model.registry.createGroup(trimmed);
						this.model.saveMarkers();
						this.refreshCurrentMode();
					},
				}).open();
			},
			onGroupChipContextMenu: (groupId: string, evt: MouseEvent) => {
				this.openGroupChipMenu(groupId, evt);
			},
			onEditGroupDescription: (groupId: string) => {
				this.editGroupDescription(groupId);
			},
			onEditGroupMemo: (groupId: string) => {
				this.editGroupMemo(groupId);
			},
			onDropCodeOnGroup: (codeId: string, groupId: string) => {
				this.model.registry.addCodeToGroup(codeId, groupId);
				this.model.saveMarkers();
				this.refreshCurrentMode();
			},
		};
	}

	// ─── Group chip context menu ───────────────────────────

	private openGroupChipMenu(groupId: string, evt: MouseEvent): void {
		const g = this.model.registry.getGroup(groupId);
		if (!g) return;

		const menu = new Menu();

		menu.addItem((item) => item
			.setTitle('Rename')
			.setIcon('pencil')
			.onClick(() => {
				new PromptModal({
					app: this.app,
					title: 'Rename group',
					initialValue: g.name,
					onSubmit: (newName) => {
						const trimmed = newName.trim();
						if (!trimmed) {
							new Notice('Group name cannot be empty.');
							return;
						}
						this.model.registry.renameGroup(groupId, trimmed);
						this.model.saveMarkers();
						this.refreshCurrentMode();
					},
				}).open();
			}),
		);

		menu.addItem((item) => item
			.setTitle('Edit color')
			.setIcon('palette')
			.onClick(() => {
				const input = document.createElement('input');
				input.type = 'color';
				input.value = g.color;
				input.style.position = 'fixed';
				input.style.left = '-9999px';
				document.body.appendChild(input);
				input.addEventListener('change', () => {
					this.model.registry.setGroupColor(groupId, input.value);
					input.remove();
					this.model.saveMarkers();
					this.refreshCurrentMode();
				}, { once: true });
				input.addEventListener('blur', () => {
					setTimeout(() => input.remove(), 100);
				}, { once: true });
				input.click();
			}),
		);

		menu.addItem((item) => item
			.setTitle('Edit description')
			.setIcon('file-text')
			.onClick(() => this.editGroupDescription(groupId)),
		);

		if (g.description) {
			menu.addItem((item) => item
				.setTitle('Clear description')
				.setIcon('x')
				.onClick(() => {
					this.model.registry.setGroupDescription(groupId, undefined);
					this.model.saveMarkers();
					this.refreshCurrentMode();
				}),
			);
		}

		menu.addItem((item) => item
			.setTitle('Edit memo')
			.setIcon('book-open')
			.onClick(() => this.editGroupMemo(groupId)),
		);

		if (g.memo) {
			menu.addItem((item) => item
				.setTitle('Clear memo')
				.setIcon('x')
				.onClick(() => {
					this.model.registry.setGroupMemo(groupId, undefined);
					this.model.saveMarkers();
					this.refreshCurrentMode();
				}),
			);
		}

		menu.addSeparator();

		menu.addItem((item) => item
			.setTitle('Delete')
			.setIcon('trash')
			.setWarning(true)
			.onClick(() => {
				const memberCount = this.model.registry.getGroupMemberCount(groupId);
				new ConfirmModal({
					app: this.app,
					title: 'Delete group',
					message: `Delete group "${g.name}"? ${memberCount} code(s) will lose this membership.`,
					confirmLabel: 'Delete',
					destructive: true,
					onConfirm: () => {
						this.model.registry.deleteGroup(groupId);
						if (this.selectedGroupId === groupId) this.selectedGroupId = null;
						this.model.saveMarkers();
						this.refreshCurrentMode();
					},
				}).open();
			}),
		);

		menu.showAtMouseEvent(evt);
	}

	private editGroupDescription(groupId: string): void {
		const g = this.model.registry.getGroup(groupId);
		if (!g) return;
		new PromptModal({
			app: this.app,
			title: 'Edit description',
			initialValue: g.description ?? '',
			placeholder: 'Short description (optional)',
			onSubmit: (desc) => {
				const trimmed = desc.trim();
				this.model.registry.setGroupDescription(groupId, trimmed || undefined);
				this.model.saveMarkers();
				this.refreshCurrentMode();
			},
		}).open();
	}

	private editGroupMemo(groupId: string): void {
		const g = this.model.registry.getGroup(groupId);
		if (!g) return;
		new PromptModal({
			app: this.app,
			title: 'Edit memo',
			initialValue: g.memo ?? '',
			placeholder: 'Reflexão analítica (opcional)',
			onSubmit: (memo) => {
				const trimmed = memo.trim();
				this.model.registry.setGroupMemo(groupId, trimmed || undefined);
				this.model.saveMarkers();
				this.refreshCurrentMode();
			},
		}).open();
	}

	private openAddToGroupPicker(codeId: string): void {
		const candidates = getAddToGroupCandidates(codeId, this.model.registry);
		const view = this;

		type Choice = GroupDefinition | { id: '__new__'; name: string; isNew: true };

		class AddGroupModal extends FuzzySuggestModal<Choice> {
			getItems(): Choice[] {
				const items: Choice[] = [...candidates];
				items.push({ id: '__new__', name: '+ New group...', isNew: true });
				return items;
			}
			getItemText(item: Choice): string {
				return item.name;
			}
			onChooseItem(item: Choice): void {
				if ('isNew' in item) {
					new PromptModal({
						app: view.app,
						title: 'New group',
						placeholder: 'Group name',
						onSubmit: (name) => {
							const trimmed = name.trim();
							if (!trimmed) {
								new Notice('Group name cannot be empty.');
								return;
							}
							const g = view.model.registry.createGroup(trimmed);
							view.model.registry.addCodeToGroup(codeId, g.id);
							view.model.saveMarkers();
							view.refreshCurrentMode();
						},
					}).open();
				} else {
					view.model.registry.addCodeToGroup(codeId, item.id);
					view.model.saveMarkers();
					view.refreshCurrentMode();
				}
			}
		}

		new AddGroupModal(this.app).open();
	}

	// ─── Context Menu ──────────────────────────────────────

	private contextMenuCallbacks(): ContextMenuCallbacks {
		return {
			showCodeDetail: (codeId: string) => this.showCodeDetail(codeId),
			openMergeModal: (codeId: string) => {
				new MergeModal({
					app: this.app,
					registry: this.model.registry,
					initialDestinationId: codeId,
					allMarkers: this.model.getAllMarkers(),
					onConfirm: (destId, srcIds, name, parentId) => {
						executeMerge({
							destinationId: destId,
							sourceIds: srcIds,
							registry: this.model.registry,
							markers: this.model.getAllMarkers(),
							destinationName: name,
							destinationParentId: parentId,
						});
						this.model.saveMarkers();
						this.showList();
					},
				}).open();
			},
			promptRename: (codeId: string) => {
				const def = this.model.registry.getById(codeId);
				if (!def) return;
				new PromptModal({
					app: this.app,
					title: 'Rename code',
					initialValue: def.name,
					confirmLabel: 'Rename',
					onSubmit: (newName) => {
						if (newName === def.name) return;
						const ok = this.model.registry.update(codeId, { name: newName });
						if (ok) {
							this.model.saveMarkers();
						} else {
							new Notice('A code with that name already exists.');
						}
					},
				}).open();
			},
			promptAddChild: (parentId: string) => {
				new PromptModal({
					app: this.app,
					title: 'New child code',
					placeholder: 'Code name',
					confirmLabel: 'Create',
					onSubmit: (name) => {
						this.model.registry.create(name, undefined, undefined, parentId);
						this.model.saveMarkers();
						this.expanded.codes.add(parentId);
					},
				}).open();
			},
			promptMoveTo: (codeId: string, folderId: string | undefined) => {
				this.model.registry.setCodeFolder(codeId, folderId);
				this.model.saveMarkers();
				if (folderId) this.expanded.folders.add(folderId);
			},
			promptDelete: (codeId: string) => {
				const def = this.model.registry.getById(codeId);
				if (!def) return;
				new ConfirmModal({
					app: this.app,
					title: 'Delete code',
					message: `Delete code "${def.name}"? Children will be promoted to top-level.`,
					confirmLabel: 'Delete',
					destructive: true,
					onConfirm: () => {
						this.model.deleteCode(codeId);
						this.showList();
					},
				}).open();
			},
			promptColor: (codeId: string) => {
				const def = this.model.registry.getById(codeId);
				if (!def) return;
				const input = document.createElement('input');
				input.type = 'color';
				input.value = def.color;
				input.style.position = 'absolute';
				input.style.opacity = '0';
				input.style.pointerEvents = 'none';
				document.body.appendChild(input);
				input.addEventListener('input', () => {
					this.model.registry.update(codeId, { color: input.value });
					this.model.saveMarkers();
				});
				input.addEventListener('change', () => {
					input.remove();
				});
				input.click();
			},
			promptDescription: (codeId: string) => {
				this.showCodeDetail(codeId);
			},
			setParent: (codeId: string, parentId: string | undefined) => {
				this.model.registry.setParent(codeId, parentId);
				this.model.saveMarkers();
			},
			promptAddToGroup: (codeId: string) => this.openAddToGroupPicker(codeId),
		};
	}

	// ─── Code-Focused Detail ────────────────────────────────

	private doRenderCodeDetail() {
		const container = this.contentEl;
		container.empty();
		this.listMode = false;
		this.listSearchWrap = null;
		this.listContentZone = null;
		if (this.listShellCleanup) { this.listShellCleanup(); this.listShellCleanup = null; }

		if (!this.codeId) return;

		renderCodeDetail(container, this.codeId, this.model, {
			getMarkerLabel: (m) => this.getMarkerLabel(m),
			navigateToMarker: (m) => this.navigateToMarker(m),
			shortenPath: (f) => this.shortenPath(f),
			showList: () => this.showList(),
			showCodeDetail: (c) => this.showCodeDetail(c),
			setContext: (mid, c) => this.setContext(mid, c),
			suspendRefresh: () => this.model.offChange(this.scheduleRefresh),
			resumeRefresh: () => this.model.onChange(this.scheduleRefresh),
			onAddToGroup: (codeId) => this.openAddToGroupPicker(codeId),
			onRemoveFromGroup: (codeId, groupId) => {
				this.model.registry.removeCodeFromGroup(codeId, groupId);
				this.model.saveMarkers();
				this.refreshCurrentMode();
			},
			// Audit log — degrada gracioso se auditAccess não foi injetado
			getAuditLog: () => this.auditAccess?.getLog() ?? [],
			onHideAuditEntry: (id) => this.auditAccess?.hideEntry(id),
			onUnhideAuditEntry: (id) => this.auditAccess?.unhideEntry(id),
			onExportCodeHistory: (codeId) => {
				const name = this.model.registry.getById(codeId)?.name ?? codeId;
				this.auditAccess?.exportCodeHistory(codeId, name);
			},
		}, this.app);
	}

	// ─── Marker-Focused Detail ──────────────────────────────

	private doRenderMarkerDetail() {
		const container = this.contentEl;
		container.empty();
		this.listMode = false;
		this.listSearchWrap = null;
		this.listContentZone = null;
		if (this.listShellCleanup) { this.listShellCleanup(); this.listShellCleanup = null; }

		if (!this.markerId || !this.codeId) return;

		renderMarkerDetail(container, this.markerId, this.codeId, this.model, {
			getMarkerText: (m) => this.getMarkerText(m),
			navigateToMarker: (m) => this.navigateToMarker(m),
			shortenPath: (f) => this.shortenPath(f),
			showList: () => this.showList(),
			showCodeDetail: (c) => this.showCodeDetail(c),
			renderCustomSection: (el, m) => this.renderCustomSection(el, m),
			suspendRefresh: () => this.model.offChange(this.scheduleRefresh),
			resumeRefresh: () => this.model.onChange(this.scheduleRefresh),
		}, this.app);
	}

	// ─── Hover sync (model → sidebar) ───────────────────────

	private applyHoverToItems() {
		const hoveredIds = this.model.getHoverMarkerIds();
		const items = Array.from(this.contentEl.querySelectorAll<HTMLElement>('[data-marker-id]'));
		for (const el of items) {
			el.toggleClass('is-hovered', hoveredIds.includes(el.dataset.markerId!));
		}
	}
}
