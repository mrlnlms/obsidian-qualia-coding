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
import { BaseMarker, GroupDefinition, SidebarModelInterface } from './types';
import { renderListShell, renderListContent } from './detailListRenderer';
import { renderCodeDetail } from './detailCodeRenderer';
import { renderMarkerDetail } from './detailMarkerRenderer';
import type { CodebookTreeState } from './codebookTreeRenderer';
import { createExpandedState, collectAllCodesUnderFolder, type ExpandedState } from './hierarchyHelpers';
import { showCodeContextMenu, showFolderContextMenu, type ContextMenuCallbacks } from './codebookContextMenu';
import { setupDragDrop } from './codebookDragDrop';
import { MergeModal, executeMerge } from './mergeModal';
import { PromptModal, ConfirmModal } from './dialogs';
import { getAddToGroupCandidates } from './codeGroupsAddPicker';

export abstract class BaseCodeDetailView extends ItemView {
	protected model: SidebarModelInterface;
	protected markerId: string | null = null;
	protected codeId: string | null = null;

	// Tree state for codebook panel
	protected expanded: ExpandedState = createExpandedState();
	protected treeDragMode: 'reorganize' | 'merge' = 'reorganize';
	protected selectedGroupId: string | null = null;

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

	constructor(leaf: WorkspaceLeaf, model: SidebarModelInterface) {
		super(leaf);
		this.model = model;
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
		};
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
			onCodeClick: (codeId: string) => {
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
