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

export abstract class BaseCodeDetailView extends ItemView {
	protected model: SidebarModelInterface;
	protected markerId: string | null = null;
	protected codeName: string | null = null;

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
	private boundRenameHandler = (e: Event) => {
		const { oldName, newName } = (e as CustomEvent<{ oldName: string; newName: string }>).detail;
		if (this.codeName === oldName) {
			this.codeName = newName;
			this.leaf.updateHeader?.();
		}
	};

	// Persistent DOM for list mode (search survives refreshes)
	private listSearchWrap: HTMLElement | null = null;
	private listContentZone: HTMLElement | null = null;
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
		document.addEventListener('qualia:code-renamed', this.boundRenameHandler);
		this.refreshCurrentMode();
	}

	async onClose() {
		this.model.offChange(this.scheduleRefresh);
		this.model.offHoverChange(this.boundApplyHover);
		document.removeEventListener('qualia:registry-changed', this.scheduleRefresh);
		document.removeEventListener('qualia:code-renamed', this.boundRenameHandler);
		if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
		this.contentEl.empty();
	}

	// ─── Navigation API ─────────────────────────────────────

	/** Navigate to the list of all codes */
	showList() {
		this.markerId = null;
		this.codeName = null;
		this.leaf.updateHeader?.();
		this.renderList();
	}

	/** Navigate to a code-focused detail (all markers for a code) */
	showCodeDetail(codeName: string) {
		this.markerId = null;
		this.codeName = codeName;
		this.leaf.updateHeader?.();
		this.doRenderCodeDetail();
	}

	/** Set context to a specific marker + code (marker-focused detail) */
	setContext(markerId: string, codeName: string) {
		this.markerId = markerId;
		this.codeName = codeName;
		this.leaf.updateHeader?.();
		this.doRenderMarkerDetail();
	}

	getDisplayText(): string {
		if (this.codeName) return this.codeName;
		return 'Code Detail';
	}

	// ─── Refresh routing ────────────────────────────────────

	protected refreshCurrentMode() {
		if (this.markerId && this.codeName) {
			this.doRenderMarkerDetail();
		} else if (this.codeName) {
			this.doRenderCodeDetail();
		} else {
			// In list mode, only rebuild the list content (preserve search input)
			if (this.listMode && this.listContentZone) {
				renderListContent(this.listContentZone, this.model, this.searchQuery, this.listCallbacks());
			} else {
				this.renderList();
			}
		}
	}

	// ─── List Mode ──────────────────────────────────────────

	private renderList() {
		this.listMode = true;
		const result = renderListShell(this.contentEl, this.model, this.listCallbacks());
		this.listSearchWrap = result.listSearchWrap;
		this.listContentZone = result.listContentZone;
		if (this.listContentZone) {
			renderListContent(this.listContentZone, this.model, this.searchQuery, this.listCallbacks());
		}
	}

	private listCallbacks() {
		return {
			onCodeClick: (codeName: string) => {
				this.searchQuery = '';
				this.showCodeDetail(codeName);
			},
			onSearchChange: (query: string) => {
				this.searchQuery = query;
				if (this.listContentZone) {
					renderListContent(this.listContentZone, this.model, this.searchQuery, this.listCallbacks());
				}
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

		if (!this.codeName) return;

		renderCodeDetail(container, this.codeName, this.model, {
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

		if (!this.markerId || !this.codeName) return;

		renderMarkerDetail(container, this.markerId, this.codeName, this.model, {
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
