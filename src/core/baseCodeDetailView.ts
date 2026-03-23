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

import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { BaseMarker, SidebarModelInterface } from './types';
import { renderListShell, renderListContent } from './detailListRenderer';
import { renderCodeDetail } from './detailCodeRenderer';
import { renderMarkerDetail } from './detailMarkerRenderer';
import type { CodebookTreeState } from './codebookTreeRenderer';
import { showCodeContextMenu, showFolderContextMenu, type ContextMenuCallbacks } from './codebookContextMenu';
import { setupDragDrop } from './codebookDragDrop';
import { MergeModal, executeMerge } from './mergeModal';

export abstract class BaseCodeDetailView extends ItemView {
	protected model: SidebarModelInterface;
	protected markerId: string | null = null;
	protected codeId: string | null = null;

	// Tree state for codebook panel
	protected treeExpanded: Set<string> = new Set<string>();
	protected folderExpanded: Set<string> = new Set<string>();
	protected treeDragMode: 'reorganize' | 'merge' = 'reorganize';

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
		const merged = new Set<string>(this.treeExpanded);
		for (const fId of this.folderExpanded) {
			merged.add(`folder:${fId}`);
		}
		return {
			expanded: merged,
			searchQuery: this.searchQuery,
			dragMode: this.treeDragMode,
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
						if (newParentId) this.treeExpanded.add(newParentId);
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
						if (folderId) this.folderExpanded.add(folderId);
					},
					setDragMode: (mode) => {
						this.treeDragMode = mode;
					},
					refresh: () => {
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
				if (this.treeExpanded.has(codeId)) {
					this.treeExpanded.delete(codeId);
				} else {
					this.treeExpanded.add(codeId);
				}
				if (this.listContentZone) {
					renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
				}
			},
			onCodeRightClick: (codeId: string, event: MouseEvent) => {
				showCodeContextMenu(event, codeId, this.model.registry, this.contextMenuCallbacks());
			},
			onFolderToggleExpand: (folderId: string) => {
				if (this.folderExpanded.has(folderId)) {
					this.folderExpanded.delete(folderId);
				} else {
					this.folderExpanded.add(folderId);
				}
				if (this.listContentZone) {
					renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
				}
			},
			onFolderRightClick: (folderId: string, event: MouseEvent) => {
				showFolderContextMenu(event, folderId, this.model.registry, {
					promptRenameFolder: (id) => {
						const folder = this.model.registry.getFolderById(id);
						if (!folder) return;
						const newName = prompt('Rename folder:', folder.name);
						if (newName && newName.trim() && newName.trim() !== folder.name) {
							const ok = this.model.registry.renameFolder(id, newName.trim());
							if (ok) {
								this.model.saveMarkers();
							} else {
								new Notice('A folder with that name already exists.');
							}
						}
					},
					promptDeleteFolder: (id) => {
						const folder = this.model.registry.getFolderById(id);
						if (!folder) return;
						if (confirm(`Delete folder "${folder.name}"? Codes will be moved to root.`)) {
							this.model.registry.deleteFolder(id);
							this.model.saveMarkers();
						}
					},
				});
			},
			onDragModeChange: (mode: 'reorganize' | 'merge') => {
				this.treeDragMode = mode;
			},
		};
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
				const newName = prompt('Rename code:', def.name);
				if (newName && newName.trim() && newName.trim() !== def.name) {
					const ok = this.model.registry.update(codeId, { name: newName.trim() });
					if (ok) {
						this.model.saveMarkers();
					} else {
						new Notice('A code with that name already exists.');
					}
				}
			},
			promptAddChild: (parentId: string) => {
				const name = prompt('New child code name:');
				if (name && name.trim()) {
					this.model.registry.create(name.trim(), undefined, undefined, parentId);
					this.model.saveMarkers();
					this.treeExpanded.add(parentId);
				}
			},
			promptMoveTo: (codeId: string, folderId: string | undefined) => {
				this.model.registry.setCodeFolder(codeId, folderId);
				this.model.saveMarkers();
				if (folderId) this.folderExpanded.add(folderId);
			},
			promptDelete: (codeId: string) => {
				const def = this.model.registry.getById(codeId);
				if (!def) return;
				if (confirm(`Delete code "${def.name}"? Children will be promoted to top-level.`)) {
					this.model.deleteCode(codeId);
					this.showList();
				}
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
		});
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
		});
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
