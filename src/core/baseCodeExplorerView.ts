/**
 * BaseCodeExplorerView — Abstract base for Code Explorer tree views.
 *
 * Shared across all engines: collapse logic, toolbar, search filter,
 * tree rendering (code → file → segment), footer, onChange auto-refresh.
 *
 * Engine subclasses implement 3 hooks:
 *   - getMarkerLabel(marker) — text preview / time range / page ref
 *   - navigateToMarker(marker) — scroll / seek / open file
 *   - shortenPath(fileId) — strip .md / .csv / etc.
 */

import { ItemView, WorkspaceLeaf, setIcon, SearchComponent, ExtraButtonComponent } from 'obsidian';
import { BaseMarker, SidebarModelInterface } from './types';

interface CollapsibleNode {
	treeItem: HTMLElement;
	children: HTMLElement;
	collapsed: boolean;
}

export abstract class BaseCodeExplorerView extends ItemView {
	protected model: SidebarModelInterface;
	private codeNodes: CollapsibleNode[] = [];
	private fileNodes: CollapsibleNode[] = [];
	private collapseAllBtn: HTMLElement | null = null;
	private collapseFilesBtn: HTMLElement | null = null;
	private searchQuery = '';
	private searchTimeout: ReturnType<typeof setTimeout> | null = null;
	private boundRenderTree = () => this.renderTree();
	private boundApplyHover = () => this.applyHoverToItems();

	// Persistent DOM zones (survive across data refreshes)
	private toolbarEl: HTMLElement | null = null;
	private treeZone: HTMLElement | null = null;
	private footerEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, model: SidebarModelInterface) {
		super(leaf);
		this.model = model;
	}

	// ─── Abstract hooks (engine implements) ──────────────────

	abstract getMarkerLabel(marker: BaseMarker): string;
	abstract navigateToMarker(marker: BaseMarker): void;
	abstract shortenPath(fileId: string): string;

	// ─── ItemView lifecycle ──────────────────────────────────

	getIcon(): string {
		return 'tags';
	}

	async onOpen() {
		this.contentEl.addClass('codemarker-explorer');
		this.model.onChange(this.boundRenderTree);
		this.model.onHoverChange(this.boundApplyHover);
		this.renderShell();
		this.renderTree();
	}

	async onClose() {
		this.model.offChange(this.boundRenderTree);
		this.model.offHoverChange(this.boundApplyHover);
		this.contentEl.empty();
	}

	// ─── Collapse logic ─────────────────────────────────────

	private toggleNode(node: CollapsibleNode) {
		node.collapsed = !node.collapsed;
		node.children.style.display = node.collapsed ? 'none' : '';
		node.treeItem.toggleClass('is-collapsed', node.collapsed);
	}

	private isAllCollapsed(): boolean {
		return this.codeNodes.length > 0 && this.codeNodes.every(n => n.collapsed);
	}

	private isFilesCollapsed(): boolean {
		return this.fileNodes.length > 0 && this.fileNodes.every(n => n.collapsed);
	}

	private updateToolbarIcons() {
		if (this.collapseAllBtn) {
			setIcon(this.collapseAllBtn, this.isAllCollapsed() ? 'chevrons-up-down' : 'chevrons-down-up');
		}
		if (this.collapseFilesBtn) {
			setIcon(this.collapseFilesBtn, this.isFilesCollapsed() ? 'list-chevrons-up-down' : 'list-chevrons-down-up');
		}
	}

	private expandAll() {
		for (const node of this.codeNodes) {
			if (node.collapsed) this.toggleNode(node);
		}
	}

	private collapseAll() {
		for (const node of this.codeNodes) {
			if (!node.collapsed) this.toggleNode(node);
		}
	}

	private expandFiles() {
		for (const node of this.fileNodes) {
			if (node.collapsed) this.toggleNode(node);
		}
	}

	private collapseFiles() {
		for (const node of this.fileNodes) {
			if (!node.collapsed) this.toggleNode(node);
		}
	}

	// ─── Index building ─────────────────────────────────────

	private buildCodeIndex(): Map<string, Map<string, BaseMarker[]>> {
		const index = new Map<string, Map<string, BaseMarker[]>>();

		for (const code of this.model.registry.getAll()) {
			index.set(code.name, new Map());
		}

		for (const fileId of this.model.getAllFileIds()) {
			const markers = this.model.getMarkersForFile(fileId);
			for (const marker of markers) {
				for (const codeName of marker.codes) {
					if (!index.has(codeName)) {
						index.set(codeName, new Map());
					}
					const fileMap = index.get(codeName)!;
					if (!fileMap.has(fileId)) {
						fileMap.set(fileId, []);
					}
					fileMap.get(fileId)!.push(marker);
				}
			}
		}

		return index;
	}

	// ─── Search filter ──────────────────────────────────────

	private filterCodeIndex(
		index: Map<string, Map<string, BaseMarker[]>>
	): Map<string, Map<string, BaseMarker[]>> {
		if (!this.searchQuery) return index;
		const q = this.searchQuery.toLowerCase();
		const filtered = new Map<string, Map<string, BaseMarker[]>>();
		for (const [codeName, fileMap] of index) {
			if (codeName.toLowerCase().includes(q)) {
				filtered.set(codeName, fileMap);
			}
		}
		return filtered;
	}

	// ─── Shell (toolbar + search — created once) ────────────

	private renderShell() {
		const container = this.contentEl;
		container.empty();

		// Toolbar (persistent — never destroyed on data refresh)
		this.toolbarEl = container.createDiv({ cls: 'codemarker-explorer-toolbar' });

		this.collapseAllBtn = new ExtraButtonComponent(this.toolbarEl)
			.setIcon('chevrons-down-up')
			.setTooltip('Collapse all')
			.onClick(() => {
				if (this.isAllCollapsed()) {
					this.expandAll();
				} else {
					this.collapseAll();
				}
				this.updateToolbarIcons();
			}).extraSettingsEl;

		this.collapseFilesBtn = new ExtraButtonComponent(this.toolbarEl)
			.setIcon('list-chevrons-down-up')
			.setTooltip('Collapse files')
			.onClick(() => {
				if (this.isFilesCollapsed()) {
					if (this.isAllCollapsed()) this.expandAll();
					this.expandFiles();
				} else {
					if (this.isAllCollapsed()) this.expandAll();
					this.collapseFiles();
				}
				this.updateToolbarIcons();
			}).extraSettingsEl;

		// Search input (persistent — focus is never lost)
		const searchContainer = this.toolbarEl.createDiv({ cls: 'codemarker-explorer-search-wrap' });
		new SearchComponent(searchContainer)
			.setPlaceholder('Filter codes...')
			.onChange((value: string) => {
				if (this.searchTimeout) clearTimeout(this.searchTimeout);
				this.searchTimeout = setTimeout(() => {
					this.searchQuery = value;
					this.renderTree();
				}, 150);
			});

		new ExtraButtonComponent(this.toolbarEl)
			.setIcon('refresh-cw')
			.setTooltip('Refresh')
			.onClick(() => this.renderTree());

		// Tree zone (replaced on each data refresh)
		this.treeZone = container.createDiv();

		// Footer (replaced on each data refresh)
		this.footerEl = container.createDiv({ cls: 'codemarker-explorer-footer' });
	}

	// ─── Tree (rebuilt on data change / search) ─────────────

	private renderTree() {
		if (!this.treeZone || !this.footerEl) return;

		this.treeZone.empty();
		this.footerEl.empty();
		this.codeNodes = [];
		this.fileNodes = [];

		const fullIndex = this.buildCodeIndex();
		const totalSegments = Array.from(fullIndex.values()).reduce(
			(sum, fileMap) => sum + Array.from(fileMap.values()).reduce((s, arr) => s + arr.length, 0), 0
		);

		if (fullIndex.size === 0) {
			this.treeZone.createEl('p', {
				text: 'No codes yet. Select text and add codes to get started.',
				cls: 'pane-empty',
			});
			return;
		}

		const codeIndex = this.filterCodeIndex(fullIndex);

		const resultsEl = this.treeZone.createDiv({ cls: 'search-results-container' });

		for (const [codeName, fileMap] of codeIndex) {
			const def = this.model.registry.getByName(codeName);
			const color = def?.color ?? '#888';
			const totalMarkers = Array.from(fileMap.values()).reduce((s, arr) => s + arr.length, 0);

			// --- Code group (level 1) ---
			const codeTreeItem = resultsEl.createDiv({ cls: 'tree-item search-result' });
			const codeSelf = codeTreeItem.createDiv({ cls: 'tree-item-self search-result-file-title is-clickable' });

			codeSelf.createDiv({ cls: 'tree-item-icon collapse-icon' }, (el) => setIcon(el, 'right-triangle'));

			const swatch = codeSelf.createSpan({ cls: 'codemarker-explorer-swatch' });
			swatch.style.backgroundColor = color;

			codeSelf.createSpan({ cls: 'tree-item-inner', text: codeName });
			codeSelf.createSpan({ cls: 'tree-item-flair', text: String(totalMarkers) });

			const codeChildren = codeTreeItem.createDiv({ cls: 'tree-item-children' });

			const codeNode: CollapsibleNode = { treeItem: codeTreeItem, children: codeChildren, collapsed: false };
			this.codeNodes.push(codeNode);
			codeSelf.addEventListener('click', () => {
				this.toggleNode(codeNode);
				this.updateToolbarIcons();
			});

			// --- File groups (level 2) ---
			for (const [fileId, markers] of fileMap) {
				const fileName = this.shortenPath(fileId);

				const fileTreeItem = codeChildren.createDiv({ cls: 'tree-item search-result' });
				const fileSelf = fileTreeItem.createDiv({ cls: 'tree-item-self search-result-file-title is-clickable' });

				fileSelf.createDiv({ cls: 'tree-item-icon collapse-icon' }, (el) => setIcon(el, 'right-triangle'));
				fileSelf.createSpan({ cls: 'tree-item-inner', text: fileName });
				fileSelf.createSpan({ cls: 'tree-item-flair', text: String(markers.length) });

				const fileChildren = fileTreeItem.createDiv({ cls: 'search-result-file-matches' });

				for (const marker of markers) {
					const label = this.getMarkerLabel(marker);
					const matchEl = fileChildren.createDiv({ cls: 'search-result-file-match' });
					matchEl.dataset.markerId = marker.id;
					matchEl.textContent = label;
					matchEl.addEventListener('click', () => this.navigateToMarker(marker));
					matchEl.addEventListener('mouseenter', () => {
						this.model.setHoverState(marker.id, marker.codes[0] ?? null);
					});
					matchEl.addEventListener('mouseleave', () => {
						this.model.setHoverState(null, null);
					});
				}

				const fileNode: CollapsibleNode = { treeItem: fileTreeItem, children: fileChildren, collapsed: false };
				this.fileNodes.push(fileNode);
				fileSelf.addEventListener('click', () => {
					this.toggleNode(fileNode);
					this.updateToolbarIcons();
				});
			}
		}

		// Footer
		this.footerEl.textContent = `${codeIndex.size} codes \u00b7 ${totalSegments} segments`;

		// Apply current hover state to newly created items
		this.applyHoverToItems();
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
