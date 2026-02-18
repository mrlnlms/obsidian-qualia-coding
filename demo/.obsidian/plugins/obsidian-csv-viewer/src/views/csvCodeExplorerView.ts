import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import { CodingModel, CsvMarker } from '../coding/codingModel';

export const CSV_CODE_EXPLORER_VIEW_TYPE = 'codemarker-csv-explorer';

interface CollapsibleNode {
	treeItem: HTMLElement;
	children: HTMLElement;
	collapsed: boolean;
}

export class CsvCodeExplorerView extends ItemView {
	private model: CodingModel;
	private codeNodes: CollapsibleNode[] = [];
	private fileNodes: CollapsibleNode[] = [];

	constructor(leaf: WorkspaceLeaf, model: CodingModel) {
		super(leaf);
		this.model = model;
	}

	getViewType(): string {
		return CSV_CODE_EXPLORER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'CSV Code Explorer';
	}

	getIcon(): string {
		return 'tags';
	}

	async onOpen() {
		this.contentEl.addClass('codemarker-explorer');
		this.registerEvent(
			this.app.workspace.on('codemarker-csv:model-changed' as any, () => this.render())
		);
		this.render();
	}

	async onClose() {
		this.contentEl.empty();
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
			(sum, fileMap) => sum + Array.from(fileMap.values()).reduce((s, arr) => s + arr.length, 0), 0
		);

		if (codeIndex.size === 0) {
			container.createEl('p', {
				text: 'No codes yet. Add codes to CSV cells to get started.',
				cls: 'pane-empty',
			});
			return;
		}

		// Toolbar
		const toolbar = container.createDiv({ cls: 'codemarker-explorer-toolbar' });

		this.collapseAllBtn = toolbar.createEl('button', { cls: 'clickable-icon', title: 'Collapse all' });
		setIcon(this.collapseAllBtn, 'chevrons-down-up');
		this.collapseAllBtn.addEventListener('click', () => {
			if (this.isAllCollapsed()) {
				this.expandAll();
			} else {
				this.collapseAll();
			}
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

		toolbar.createDiv({ cls: 'codemarker-explorer-toolbar-spacer' });

		const refreshBtn = toolbar.createEl('button', { cls: 'clickable-icon', title: 'Refresh' });
		setIcon(refreshBtn, 'refresh-cw');
		refreshBtn.addEventListener('click', () => this.render());

		const resultsEl = container.createDiv({ cls: 'search-results-container' });

		for (const [codeName, fileMap] of codeIndex) {
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
			for (const [fileId, markers] of fileMap) {
				const fileName = fileId.replace(/^.*\//, '').replace(/\.csv$/, '');

				const fileTreeItem = codeChildren.createDiv({ cls: 'tree-item search-result' });
				const fileSelf = fileTreeItem.createDiv({ cls: 'tree-item-self search-result-file-title is-clickable' });

				fileSelf.createDiv({ cls: 'tree-item-icon collapse-icon' }, (el) => setIcon(el, 'right-triangle'));
				fileSelf.createSpan({ cls: 'tree-item-inner', text: fileName });
				fileSelf.createSpan({ cls: 'tree-item-flair', text: String(markers.length) });

				const fileChildren = fileTreeItem.createDiv({ cls: 'search-result-file-matches' });

				for (const marker of markers) {
					const text = this.model.getMarkerText(marker);
					const label = this.model.getMarkerLabel(marker);
					const preview = text
						? (text.length > 50 ? text.substring(0, 50) + '...' : text)
						: label;

					const matchEl = fileChildren.createDiv({ cls: 'search-result-file-match' });
					matchEl.createSpan({ text: label, cls: 'codemarker-detail-marker-file' });
					matchEl.createSpan({ text: preview });
					matchEl.addEventListener('click', () => this.navigateToMarker(marker));
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
		footer.textContent = `${codeIndex.size} codes \u00b7 ${totalSegments} segments`;
	}

	private buildCodeIndex(): Map<string, Map<string, CsvMarker[]>> {
		const index = new Map<string, Map<string, CsvMarker[]>>();
		const allCodes = this.model.registry.getAll();

		for (const code of allCodes) {
			index.set(code.name, new Map());
		}

		for (const marker of this.model.getAllMarkers()) {
			for (const codeName of marker.codes) {
				if (!index.has(codeName)) {
					index.set(codeName, new Map());
				}
				const fileMap = index.get(codeName)!;
				if (!fileMap.has(marker.file)) {
					fileMap.set(marker.file, []);
				}
				fileMap.get(marker.file)!.push(marker);
			}
		}

		return index;
	}

	private async navigateToMarker(marker: CsvMarker) {
		// Open the file first (if not already open)
		const file = this.app.vault.getAbstractFileByPath(marker.file);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
		}
		// Then dispatch navigation
		this.app.workspace.trigger('codemarker-csv:navigate', {
			file: marker.file,
			row: marker.row,
			column: marker.column,
		});
	}
}
