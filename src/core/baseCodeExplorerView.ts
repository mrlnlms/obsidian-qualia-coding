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
import { BaseMarker, CodeDefinition, SidebarModelInterface } from './types';
import { createVirtualList } from './virtualList';
import type { SmartCodesAccess } from './baseCodeDetailView';
import type { SmartCodeDefinition } from './smartCodes/types';
import type { MarkerRef } from './smartCodes/types';

export type { SmartCodesAccess } from './baseCodeDetailView';

const EXPLORER_ROW_HEIGHT = 26;
const EXPLORER_LIST_MAX_VH = 50;

interface CollapsibleNode {
	treeItem: HTMLElement;
	children: HTMLElement;
	collapsed: boolean;
}

export abstract class BaseCodeExplorerView extends ItemView {
	protected model: SidebarModelInterface;
	protected smartCodeAccess?: SmartCodesAccess;
	private codeNodes: CollapsibleNode[] = [];
	private fileNodes: CollapsibleNode[] = [];
	private smartCodeNodes: CollapsibleNode[] = [];
	private smartCodeFileNodes: CollapsibleNode[] = [];
	private smartCodesGroupCollapsed = false;
	private unsubSmartCodes: (() => void) | null = null;
	private collapseAllBtn: HTMLElement | null = null;
	private collapseFilesBtn: HTMLElement | null = null;
	private searchQuery = '';
	private searchTimeout: ReturnType<typeof setTimeout> | null = null;
	private rafId: number | null = null;
	private scheduleRefresh = () => {
		if (this.rafId !== null) return;
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this.renderTree();
		});
	};
	private boundApplyHover = () => this.applyHoverToItems();

	// Persistent DOM zones (survive across data refreshes)
	private toolbarEl: HTMLElement | null = null;
	private treeZone: HTMLElement | null = null;
	private footerEl: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		model: SidebarModelInterface,
		smartCodeAccess?: SmartCodesAccess,
	) {
		super(leaf);
		this.model = model;
		this.smartCodeAccess = smartCodeAccess;
	}

	/** Mirror do attachSmartCodeListeners do BaseCodeDetailView (linha 120-135). Cache subscribe pra
	 *  invalidação granular, registry addOnMutate pra create/rename/delete, model.onChange pra
	 *  workaround SC3 (re-index cache quando markers mudam — qualia:markers-changed ainda não
	 *  emite granular). */
	private attachSmartCodeListeners(): void {
		this.unsubSmartCodes?.();
		if (!this.smartCodeAccess) { this.unsubSmartCodes = null; return; }
		const access = this.smartCodeAccess;
		const unsubCache = access.cache.subscribe(this.scheduleRefresh);
		const unsubRegistry = access.registry.addOnMutate(this.scheduleRefresh);
		const onMarkersMutated = () => access.refreshFromMarkers();
		this.model.onChange(onMarkersMutated);
		this.unsubSmartCodes = () => {
			unsubCache();
			unsubRegistry();
			this.model.offChange(onMarkersMutated);
		};
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
		this.model.onChange(this.scheduleRefresh);
		this.model.onHoverChange(this.boundApplyHover);
		document.addEventListener('qualia:registry-changed', this.scheduleRefresh);
		if (this.smartCodeAccess) this.attachSmartCodeListeners();
		this.renderShell();
		this.renderTree();
	}

	async onClose() {
		this.model.offChange(this.scheduleRefresh);
		this.model.offHoverChange(this.boundApplyHover);
		document.removeEventListener('qualia:registry-changed', this.scheduleRefresh);
		this.unsubSmartCodes?.();
		this.unsubSmartCodes = null;
		if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
		if (this.searchTimeout) { clearTimeout(this.searchTimeout); this.searchTimeout = null; }
		this.contentEl.empty();
	}

	// ─── Collapse logic ─────────────────────────────────────

	private toggleNode(node: CollapsibleNode) {
		node.collapsed = !node.collapsed;
		node.children.style.display = node.collapsed ? 'none' : '';
		node.treeItem.toggleClass('is-collapsed', node.collapsed);
	}

	private isAllCollapsed(): boolean {
		const all = [...this.codeNodes, ...this.smartCodeNodes];
		return all.length > 0 && all.every(n => n.collapsed);
	}

	private isFilesCollapsed(): boolean {
		const all = [...this.fileNodes, ...this.smartCodeFileNodes];
		return all.length > 0 && all.every(n => n.collapsed);
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
		for (const node of [...this.codeNodes, ...this.smartCodeNodes]) {
			if (node.collapsed) this.toggleNode(node);
		}
	}

	private collapseAll() {
		for (const node of [...this.codeNodes, ...this.smartCodeNodes]) {
			if (!node.collapsed) this.toggleNode(node);
		}
	}

	private expandFiles() {
		for (const node of [...this.fileNodes, ...this.smartCodeFileNodes]) {
			if (node.collapsed) this.toggleNode(node);
		}
	}

	private collapseFiles() {
		for (const node of [...this.fileNodes, ...this.smartCodeFileNodes]) {
			if (!node.collapsed) this.toggleNode(node);
		}
	}

	// ─── Index building ─────────────────────────────────────

	private buildCodeIndex(): Map<string, Map<string, BaseMarker[]>> {
		const index = new Map<string, Map<string, BaseMarker[]>>();

		// Build in hierarchy order (roots first, then children recursively)
		const addCode = (def: CodeDefinition) => {
			index.set(def.name, new Map());
			for (const child of this.model.registry.getChildren(def.id)) {
				addCode(child);
			}
		};
		for (const root of this.model.registry.getRootCodes()) {
			addCode(root);
		}

		for (const fileId of this.model.getAllFileIds()) {
			const markers = this.model.getMarkersForFile(fileId);
			for (const marker of markers) {
				for (const ca of marker.codes) {
					const codeName = this.model.registry.getById(ca.codeId)?.name ?? ca.codeId;
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

		// Collect matching code names + ancestor names (to preserve hierarchy context)
		const visibleNames = new Set<string>();
		for (const [codeName] of index) {
			if (codeName.toLowerCase().includes(q)) {
				visibleNames.add(codeName);
				const def = this.model.registry.getByName(codeName);
				if (def) {
					for (const ancestor of this.model.registry.getAncestors(def.id)) {
						visibleNames.add(ancestor.name);
					}
				}
			}
		}

		const filtered = new Map<string, Map<string, BaseMarker[]>>();
		for (const [codeName, fileMap] of index) {
			if (visibleNames.has(codeName)) {
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
		this.smartCodeNodes = [];
		this.smartCodeFileNodes = [];

		const fullIndex = this.buildCodeIndex();
		const allSmartCodes = this.smartCodeAccess?.registry.getAll() ?? [];
		const visibleSmartCodes = this.filterSmartCodes(allSmartCodes);

		// Empty state: zero regular codes + zero smart codes (independente de search).
		if (fullIndex.size === 0 && allSmartCodes.length === 0) {
			this.treeZone.createEl('p', {
				text: 'No codes yet. Select text and add codes to get started.',
				cls: 'pane-empty',
			});
			return;
		}

		const codeIndex = this.filterCodeIndex(fullIndex);
		const totalSegments = Array.from(codeIndex.values()).reduce(
			(sum, fileMap) => sum + Array.from(fileMap.values()).reduce((s, arr) => s + arr.length, 0), 0
		);

		const resultsEl = this.treeZone.createDiv({ cls: 'search-results-container' });

		// Smart Codes section: top placement espelha smartCodesSection no Detail list mode.
		if (visibleSmartCodes.length > 0) {
			this.renderSmartCodesGroup(resultsEl, visibleSmartCodes);
		}

		for (const [codeName, fileMap] of codeIndex) {
			const def = this.model.registry.getByName(codeName);
			const color = def?.color ?? '#888';
			const totalMarkers = Array.from(fileMap.values()).reduce((s, arr) => s + arr.length, 0);

			// --- Code group (level 1) ---
			const depth = def ? this.model.registry.getDepth(def.id) : 0;
			const codeTreeItem = resultsEl.createDiv({ cls: 'tree-item search-result' });
			const codeSelf = codeTreeItem.createDiv({ cls: 'tree-item-self search-result-file-title is-clickable' });
			codeSelf.style.paddingLeft = `${depth * 18 + 4}px`;

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
				// Constrained height + virtual scroll. Files with thousands of
				// markers (e.g. batch-coded parquet rows) would otherwise mount
				// each match in the DOM and freeze the UI thread.
				const naturalHeight = markers.length * EXPLORER_ROW_HEIGHT;
				const maxByVh = Math.floor(window.innerHeight * (EXPLORER_LIST_MAX_VH / 100));
				fileChildren.style.height = `${Math.min(naturalHeight, maxByVh)}px`;
				if (naturalHeight > maxByVh) fileChildren.style.overflowY = 'auto';
				fileChildren.style.position = 'relative';

				const list = createVirtualList<BaseMarker>({
					container: fileChildren,
					rowHeight: EXPLORER_ROW_HEIGHT,
					renderRow: (marker) => {
						const matchEl = document.createElement('div');
						matchEl.className = 'search-result-file-match';
						matchEl.dataset.markerId = marker.id;
						matchEl.textContent = this.getMarkerLabel(marker);
						matchEl.addEventListener('click', () => this.navigateToMarker(marker));
						matchEl.addEventListener('mouseenter', () => {
							const firstCodeName = marker.codes[0]
								? (this.model.registry.getById(marker.codes[0].codeId)?.name ?? null)
								: null;
							this.model.setHoverState(marker.id, firstCodeName);
						});
						matchEl.addEventListener('mouseleave', () => {
							this.model.setHoverState(null, null);
						});
						return matchEl;
					},
				});
				list.setItems(markers);

				const fileNode: CollapsibleNode = { treeItem: fileTreeItem, children: fileChildren, collapsed: false };
				this.fileNodes.push(fileNode);
				fileSelf.addEventListener('click', () => {
					this.toggleNode(fileNode);
					this.updateToolbarIcons();
				});
			}
		}

		// Footer
		const scSuffix = visibleSmartCodes.length > 0 ? ` \u00b7 ${visibleSmartCodes.length} smart codes` : '';
		this.footerEl.textContent = `${codeIndex.size} codes \u00b7 ${totalSegments} segments${scSuffix}`;

		// Apply current hover state to newly created items
		this.applyHoverToItems();
	}

	// \u2500\u2500\u2500 Smart Codes group \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

	/** Filtra hidden + search query. Aplicado tanto no render do group quanto no footer counter. */
	private filterSmartCodes(all: SmartCodeDefinition[]): SmartCodeDefinition[] {
		const q = this.searchQuery.toLowerCase();
		return all.filter(sc => {
			if (sc.hidden) return false;
			if (q && !sc.name.toLowerCase().includes(q)) return false;
			return true;
		});
	}

	/** Render section "\u26a1 Smart Codes" como grupo top-level no tree. Estrutura espelha o tree
	 *  de regulares: smartCode \u2192 file \u2192 marker. Click em marker navega via this.navigateToMarker
	 *  (subclass dispara workspace event cross-engine). Hover sync usa data-marker-id (mesmo
	 *  applyHoverToItems pega regulares e SC matches). */
	private renderSmartCodesGroup(container: HTMLElement, smartCodes: SmartCodeDefinition[]): void {
		if (!this.smartCodeAccess) return;
		const access = this.smartCodeAccess;

		const sectionEl = container.createDiv({ cls: 'qc-explorer-sc-section' });

		// Section header \u2014 toggle do grupo inteiro (collapse separado dos smart code nodes individuais).
		const headerEl = sectionEl.createDiv({ cls: 'qc-explorer-sc-section-header is-clickable' });
		headerEl.createSpan({ cls: 'qc-explorer-sc-chevron', text: this.smartCodesGroupCollapsed ? '\u25b8' : '\u25be' });
		headerEl.createSpan({ text: ' \u26a1 Smart Codes ' });
		headerEl.createSpan({ text: `(${smartCodes.length})`, cls: 'qc-explorer-sc-count' });
		headerEl.addEventListener('click', () => {
			this.smartCodesGroupCollapsed = !this.smartCodesGroupCollapsed;
			this.scheduleRefresh();
		});

		if (this.smartCodesGroupCollapsed) return;

		const bodyEl = sectionEl.createDiv({ cls: 'qc-explorer-sc-body' });

		for (const sc of smartCodes) {
			const matches = access.cache.getMatches(sc.id);

			// Smart code row (level 1) \u2014 mirror estrutura de tree-item code regular.
			const scTreeItem = bodyEl.createDiv({ cls: 'tree-item search-result is-smart-code' });
			const scSelf = scTreeItem.createDiv({ cls: 'tree-item-self search-result-file-title is-clickable' });
			scSelf.style.paddingLeft = '4px';

			scSelf.createDiv({ cls: 'tree-item-icon collapse-icon' }, (el) => setIcon(el, 'right-triangle'));

			const swatch = scSelf.createSpan({ cls: 'codemarker-explorer-swatch' });
			swatch.style.backgroundColor = sc.color;

			scSelf.createSpan({ cls: 'tree-item-inner', text: `\u26a1 ${sc.name}` });
			scSelf.createSpan({ cls: 'tree-item-flair', text: String(matches.length) });

			const scChildren = scTreeItem.createDiv({ cls: 'tree-item-children' });

			const scNode: CollapsibleNode = { treeItem: scTreeItem, children: scChildren, collapsed: false };
			this.smartCodeNodes.push(scNode);
			scSelf.addEventListener('click', () => {
				this.toggleNode(scNode);
				this.updateToolbarIcons();
			});

			// Bucket matches por fileId mantendo ordem de inser\u00e7\u00e3o (cache retorna refs em ordem
			// de itera\u00e7\u00e3o de markerByRef \u2014 est\u00e1vel dentro de uma sess\u00e3o).
			const byFile = new Map<string, MarkerRef[]>();
			for (const ref of matches) {
				let bucket = byFile.get(ref.fileId);
				if (!bucket) { bucket = []; byFile.set(ref.fileId, bucket); }
				bucket.push(ref);
			}

			for (const [fileId, fileRefs] of byFile) {
				const fileName = this.shortenPath(fileId);

				const fileTreeItem = scChildren.createDiv({ cls: 'tree-item search-result' });
				const fileSelf = fileTreeItem.createDiv({ cls: 'tree-item-self search-result-file-title is-clickable' });

				fileSelf.createDiv({ cls: 'tree-item-icon collapse-icon' }, (el) => setIcon(el, 'right-triangle'));
				fileSelf.createSpan({ cls: 'tree-item-inner', text: fileName });
				fileSelf.createSpan({ cls: 'tree-item-flair', text: String(fileRefs.length) });

				const fileChildren = fileTreeItem.createDiv({ cls: 'search-result-file-matches' });
				// Virtual scroll id\u00eantico ao caminho regular \u2014 files com 100s de matches em parquet
				// n\u00e3o montam DOM linear.
				const naturalHeight = fileRefs.length * EXPLORER_ROW_HEIGHT;
				const maxByVh = Math.floor(window.innerHeight * (EXPLORER_LIST_MAX_VH / 100));
				fileChildren.style.height = `${Math.min(naturalHeight, maxByVh)}px`;
				if (naturalHeight > maxByVh) fileChildren.style.overflowY = 'auto';
				fileChildren.style.position = 'relative';

				const list = createVirtualList<MarkerRef>({
					container: fileChildren,
					rowHeight: EXPLORER_ROW_HEIGHT,
					renderRow: (ref) => {
						const matchEl = document.createElement('div');
						matchEl.className = 'search-result-file-match';
						const marker = access.cache.getMarkerByRef(ref);
						if (!marker) {
							// Marker foi deletado entre cache rebuild e render. Pr\u00f3ximo refresh pega.
							matchEl.textContent = '(removed)';
							matchEl.classList.add('is-stale');
							return matchEl;
						}
						matchEl.dataset.markerId = marker.id;
						matchEl.textContent = access.getMarkerLabel(marker);
						matchEl.addEventListener('click', () => this.navigateToMarker(marker));
						matchEl.addEventListener('mouseenter', () => {
							const firstCodeName = marker.codes[0]
								? (this.model.registry.getById(marker.codes[0].codeId)?.name ?? null)
								: null;
							this.model.setHoverState(marker.id, firstCodeName);
						});
						matchEl.addEventListener('mouseleave', () => {
							this.model.setHoverState(null, null);
						});
						return matchEl;
					},
				});
				list.setItems(fileRefs);

				const fileNode: CollapsibleNode = { treeItem: fileTreeItem, children: fileChildren, collapsed: false };
				this.smartCodeFileNodes.push(fileNode);
				fileSelf.addEventListener('click', () => {
					this.toggleNode(fileNode);
					this.updateToolbarIcons();
				});
			}
		}
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
