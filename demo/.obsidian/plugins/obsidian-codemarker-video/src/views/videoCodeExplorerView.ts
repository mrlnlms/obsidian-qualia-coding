/**
 * Video Code Explorer — tree view with 3 levels: Code → File → Segment.
 * Adapted from pdfCodeExplorerView.ts.
 */

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type { VideoCodingModel } from '../coding/videoCodingModel';
import type { VideoMarker } from '../coding/videoCodingTypes';

export const VIDEO_CODE_EXPLORER_VIEW_TYPE = 'codemarker-video-explorer';

const VIDEO_EXTS = /\.(mp3|m4a|wav|ogg|flac|aac)$/i;

interface CollapsibleNode {
	treeItem: HTMLElement;
	children: HTMLElement;
	collapsed: boolean;
}

export class VideoCodeExplorerView extends ItemView {
	private model: VideoCodingModel;
	private plugin: any;
	private codeNodes: CollapsibleNode[] = [];
	private fileNodes: CollapsibleNode[] = [];
	private searchTerm: string = '';
	private changeListener: () => void;
	private hoverListener: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, model: VideoCodingModel, plugin: any) {
		super(leaf);
		this.model = model;
		this.plugin = plugin;
		this.changeListener = () => this.render();
	}

	getViewType(): string {
		return VIDEO_CODE_EXPLORER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Video Code Explorer';
	}

	getIcon(): string {
		return 'video';
	}

	async onOpen() {
		this.contentEl.addClass('codemarker-explorer');
		this.model.onChange(this.changeListener);

		this.hoverListener = () => {
			const markerId = this.model.getHoverMarkerId();
			this.applyHoverToItems(markerId);
		};
		this.model.onHoverChange(this.hoverListener);

		this.render();
	}

	async onClose() {
		this.model.offChange(this.changeListener);
		if (this.hoverListener) {
			this.model.offHoverChange(this.hoverListener);
			this.hoverListener = null;
		}
		this.contentEl.empty();
	}

	private applyHoverToItems(markerId: string | null) {
		const items = Array.from(this.contentEl.querySelectorAll<HTMLElement>('[data-marker-id]'));
		for (const el of items) {
			if (markerId && el.dataset.markerId === markerId) {
				el.addClass('is-hovered');
			} else {
				el.removeClass('is-hovered');
			}
		}
	}

	private collapseAllBtn: HTMLElement | null = null;
	private collapseFilesBtn: HTMLElement | null = null;

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

	private collapseAll() {
		for (const node of this.codeNodes) {
			if (!node.collapsed) this.toggleNode(node);
		}
	}

	private expandAll() {
		for (const node of this.codeNodes) {
			if (node.collapsed) this.toggleNode(node);
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

	render() {
		const container = this.contentEl;
		container.empty();
		this.codeNodes = [];
		this.fileNodes = [];

		const codeIndex = this.buildCodeIndex();
		const totalSegments = Array.from(codeIndex.values()).reduce(
			(sum, fileMap) => sum + Array.from(fileMap.values()).reduce((s, arr) => s + arr.length, 0), 0,
		);

		if (codeIndex.size === 0) {
			container.createEl('p', {
				text: 'No codes yet. Open a video file and drag to select a region.',
				cls: 'pane-empty',
			});
			return;
		}

		// Toolbar
		const toolbar = container.createDiv({ cls: 'codemarker-explorer-toolbar' });

		this.collapseAllBtn = toolbar.createEl('button', { cls: 'clickable-icon', title: 'Collapse all' });
		setIcon(this.collapseAllBtn, 'chevrons-down-up');
		this.collapseAllBtn.addEventListener('click', () => {
			if (this.isAllCollapsed()) this.expandAll(); else this.collapseAll();
			this.updateToolbarIcons();
		});

		this.collapseFilesBtn = toolbar.createEl('button', { cls: 'clickable-icon', title: 'Collapse files' });
		setIcon(this.collapseFilesBtn, 'list-chevrons-down-up');
		this.collapseFilesBtn.addEventListener('click', () => {
			if (this.isFilesCollapsed()) {
				if (this.isAllCollapsed()) this.expandAll();
				this.expandFiles();
			} else {
				if (this.isAllCollapsed()) this.expandAll();
				this.collapseFiles();
			}
			this.updateToolbarIcons();
		});

		// Search input
		const searchInput = toolbar.createEl('input', {
			cls: 'codemarker-video-search',
			attr: { type: 'text', placeholder: 'Filter codes...' },
		});
		searchInput.value = this.searchTerm;
		searchInput.addEventListener('input', () => {
			this.searchTerm = searchInput.value;
			this.render();
			// Re-focus after render
			const newInput = this.contentEl.querySelector<HTMLInputElement>('.codemarker-video-search');
			if (newInput) {
				newInput.focus();
				newInput.selectionStart = newInput.selectionEnd = newInput.value.length;
			}
		});

		toolbar.createDiv({ cls: 'codemarker-explorer-toolbar-spacer' });

		const refreshBtn = toolbar.createEl('button', { cls: 'clickable-icon', title: 'Refresh' });
		setIcon(refreshBtn, 'refresh-cw');
		refreshBtn.addEventListener('click', () => { this.searchTerm = ''; this.render(); });

		const resultsEl = container.createDiv({ cls: 'search-results-container' });

		// Filter by search term
		const lowerSearch = this.searchTerm.toLowerCase();

		for (const [codeName, fileMap] of codeIndex) {
			if (lowerSearch && !codeName.toLowerCase().includes(lowerSearch)) continue;
			const def = this.model.registry.getByName(codeName);
			const color = def?.color ?? '#888';
			const totalMarkers = Array.from(fileMap.values()).reduce((s, arr) => s + arr.length, 0);

			// Code group (level 1)
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

			// File groups (level 2)
			for (const [filePath, markers] of fileMap) {
				const fileName = this.shortenPath(filePath);

				const fileTreeItem = codeChildren.createDiv({ cls: 'tree-item search-result' });
				const fileSelf = fileTreeItem.createDiv({ cls: 'tree-item-self search-result-file-title is-clickable' });

				fileSelf.createDiv({ cls: 'tree-item-icon collapse-icon' }, (el) => setIcon(el, 'right-triangle'));
				const fileInner = fileSelf.createSpan({ cls: 'tree-item-inner', text: fileName });
				fileInner.title = filePath;
				fileSelf.createSpan({ cls: 'tree-item-flair', text: String(markers.length) });

				const fileChildren = fileTreeItem.createDiv({ cls: 'search-result-file-matches' });

				for (const marker of markers) {
					const label = this.model.getMarkerLabel(marker);

					const matchEl = fileChildren.createDiv({ cls: 'search-result-file-match' });
					matchEl.dataset.markerId = marker.id;
					matchEl.tabIndex = 0;
					matchEl.createSpan({ text: label });
					matchEl.addEventListener('click', () => this.navigateToMarker(marker, filePath));
					matchEl.addEventListener('keydown', (e: KeyboardEvent) => {
						if (e.key === 'Enter') this.navigateToMarker(marker, filePath);
						else if (e.key === 'ArrowDown') {
							e.preventDefault();
							(matchEl.nextElementSibling as HTMLElement)?.focus();
						} else if (e.key === 'ArrowUp') {
							e.preventDefault();
							(matchEl.previousElementSibling as HTMLElement)?.focus();
						}
					});
					matchEl.addEventListener('mouseenter', () => this.model.setHoverState(marker.id, codeName));
					matchEl.addEventListener('mouseleave', () => this.model.setHoverState(null, null));
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
		const footer = container.createDiv({ cls: 'codemarker-explorer-footer' });
		footer.textContent = `${codeIndex.size} codes · ${totalSegments} segments`;
	}

	private buildCodeIndex(): Map<string, Map<string, VideoMarker[]>> {
		const index = new Map<string, Map<string, VideoMarker[]>>();
		const allCodes = this.model.registry.getAll();

		for (const code of allCodes) {
			index.set(code.name, new Map());
		}

		for (const af of this.model.files) {
			for (const marker of af.markers) {
				for (const codeName of marker.codes) {
					if (!index.has(codeName)) {
						index.set(codeName, new Map());
					}
					const fileMap = index.get(codeName)!;
					if (!fileMap.has(af.path)) {
						fileMap.set(af.path, []);
					}
					fileMap.get(af.path)!.push(marker);
				}
			}
		}

		return index;
	}

	private shortenPath(filePath: string): string {
		const parts = filePath.split('/');
		return (parts[parts.length - 1] ?? filePath).replace(VIDEO_EXTS, '');
	}

	private navigateToMarker(marker: VideoMarker, filePath: string) {
		this.plugin.openVideoAndSeek(filePath, marker.from);
	}
}
