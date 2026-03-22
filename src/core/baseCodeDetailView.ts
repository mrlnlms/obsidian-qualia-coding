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

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { BaseMarker, SidebarModelInterface } from './types';
import { renderListShell, renderListContent } from './detailListRenderer';
import { renderCodeDetail } from './detailCodeRenderer';
import { renderMarkerDetail } from './detailMarkerRenderer';
import type { CodebookTreeState } from './codebookTreeRenderer';

export abstract class BaseCodeDetailView extends ItemView {
	protected model: SidebarModelInterface;
	protected markerId: string | null = null;
	protected codeId: string | null = null;

	// Tree state for codebook panel
	protected treeExpanded: Set<string> = new Set<string>();
	protected treeDragMode: 'reorganize' | 'merge' = 'reorganize';

	/** Whether clicking a segment also navigates to the marker in the document. */
	protected get autoRevealOnSegmentClick(): boolean {
		return this.model.getAutoRevealOnSegmentClick?.() ?? true;
	}
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
			expanded: this.treeExpanded,
			searchQuery: this.searchQuery,
			dragMode: this.treeDragMode,
		};
	}

	private renderList() {
		this.listMode = true;
		const result = renderListShell(this.contentEl, this.model, this.listCallbacks());
		this.listSearchWrap = result.listSearchWrap;
		this.listContentZone = result.listContentZone;
		this.listShellCleanup = result.cleanup;
		if (this.listContentZone) {
			renderListContent(this.listContentZone, this.model, this.getTreeState(), this.listCallbacks());
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
			onCodeRightClick: (_codeId: string, _event: MouseEvent) => {
				// Placeholder for Phase B context menu
			},
			onDragModeChange: (mode: 'reorganize' | 'merge') => {
				this.treeDragMode = mode;
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
			autoRevealOnSegmentClick: this.autoRevealOnSegmentClick,
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
