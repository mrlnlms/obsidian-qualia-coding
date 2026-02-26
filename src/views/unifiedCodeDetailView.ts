import { ItemView, WorkspaceLeaf, MarkdownView, TFile, setIcon } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { CodeMarkerModel, Marker } from '../models/codeMarkerModel';

export const UNIFIED_DETAIL_VIEW_TYPE = 'codemarker-detail';

// ─── Lightweight interfaces for the CSV model (separate plugin build) ───

interface CsvMarkerLike {
	id: string;
	file: string;
	row: number;
	column: string;
	codes: string[];
	from?: number;
	to?: number;
}

interface CsvModelLike {
	registry: { getAll(): { name: string; color: string; description?: string }[]; getByName(name: string): { name: string; color: string; description?: string } | undefined };
	findMarkerById(id: string): CsvMarkerLike | null;
	getAllMarkers(): CsvMarkerLike[];
	getMarkersForFile(file: string): CsvMarkerLike[];
	getMarkerText(marker: CsvMarkerLike): string | null;
	getMarkerLabel(marker: CsvMarkerLike): string;
}

type MarkerSource = 'markdown' | 'csv';

export class UnifiedCodeDetailView extends ItemView {
	private mdModel: CodeMarkerModel;
	private csvModel: CsvModelLike | null = null;
	private markerId: string | null = null;
	private codeName: string | null = null;
	private lastSource: MarkerSource | null = null;

	constructor(leaf: WorkspaceLeaf, mdModel: CodeMarkerModel) {
		super(leaf);
		this.mdModel = mdModel;
	}

	setCsvModel(csvModel: CsvModelLike | null) {
		this.csvModel = csvModel;
	}

	getViewType(): string {
		return UNIFIED_DETAIL_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (this.codeName) return this.codeName;
		return 'Code Detail';
	}

	getIcon(): string {
		return 'tag';
	}

	/** Navigate to the list of all codes */
	showList() {
		this.markerId = null;
		this.codeName = null;
		this.lastSource = null;
		(this.leaf as any).updateHeader?.();
		this.renderList();
	}

	/** Navigate to a code-focused detail (all markers for a code) */
	showCodeDetail(codeName: string) {
		this.markerId = null;
		this.codeName = codeName;
		this.lastSource = null;
		(this.leaf as any).updateHeader?.();
		this.renderCodeDetail();
	}

	/** Set context to a specific marker + code (marker-focused detail) */
	setContext(markerId: string, codeName: string) {
		this.markerId = markerId;
		this.codeName = codeName;
		// Detect source
		this.lastSource = this.detectSource(markerId);
		(this.leaf as any).updateHeader?.();
		this.renderMarkerDetail();
	}

	async onOpen() {
		this.contentEl.addClass('codemarker-detail-panel');
		// Listen for CSV model changes
		this.registerEvent(
			this.app.workspace.on('codemarker-csv:model-changed' as any, () => {
				this.refreshCurrentView();
			})
		);
		this.refreshCurrentView();
	}

	async onClose() {
		this.contentEl.empty();
	}

	private refreshCurrentView() {
		if (this.markerId && this.codeName) {
			this.renderMarkerDetail();
		} else if (this.codeName) {
			this.renderCodeDetail();
		} else {
			this.renderList();
		}
	}

	private detectSource(markerId: string): MarkerSource {
		if (this.mdModel.getMarkerById(markerId)) return 'markdown';
		if (this.csvModel?.findMarkerById(markerId)) return 'csv';
		return 'markdown'; // fallback
	}

	// ─── List Mode ───────────────────────────────────────────

	private renderList() {
		const container = this.contentEl;
		container.empty();

		// Merge codes from both registries (shared registry = same definitions)
		const codeMap = new Map<string, { name: string; color: string; description?: string }>();
		for (const def of this.mdModel.registry.getAll()) {
			codeMap.set(def.name, def);
		}
		if (this.csvModel) {
			for (const def of this.csvModel.registry.getAll()) {
				if (!codeMap.has(def.name)) codeMap.set(def.name, def);
			}
		}

		const codes = Array.from(codeMap.values());
		const counts = this.countSegmentsPerCodeMerged();

		// Header
		const header = container.createDiv({ cls: 'codemarker-explorer-header' });
		header.createSpan({ text: 'All Codes', cls: 'codemarker-explorer-title' });
		header.createSpan({ text: `${codes.length}`, cls: 'codemarker-explorer-count' });

		if (codes.length === 0) {
			container.createEl('p', { text: 'No codes yet.', cls: 'codemarker-detail-empty' });
			return;
		}

		// List
		const list = container.createDiv({ cls: 'codemarker-explorer-list' });
		for (const def of codes) {
			const count = counts.get(def.name) ?? 0;
			const row = list.createDiv({ cls: 'codemarker-explorer-row' });

			const swatch = row.createSpan({ cls: 'codemarker-detail-swatch' });
			swatch.style.backgroundColor = def.color;

			const info = row.createDiv({ cls: 'codemarker-explorer-row-info' });
			info.createSpan({ text: def.name, cls: 'codemarker-explorer-row-name' });
			if (def.description) {
				info.createSpan({ text: def.description, cls: 'codemarker-explorer-row-desc' });
			}

			row.createSpan({ text: `${count}`, cls: 'codemarker-explorer-row-count' });

			row.addEventListener('click', () => {
				this.showCodeDetail(def.name);
			});
		}
	}

	private countSegmentsPerCodeMerged(): Map<string, number> {
		const counts = new Map<string, number>();
		// Markdown markers
		for (const marker of this.mdModel.getAllMarkers()) {
			for (const code of marker.codes) {
				counts.set(code, (counts.get(code) ?? 0) + 1);
			}
		}
		// CSV markers
		if (this.csvModel) {
			for (const marker of this.csvModel.getAllMarkers()) {
				for (const code of marker.codes) {
					counts.set(code, (counts.get(code) ?? 0) + 1);
				}
			}
		}
		return counts;
	}

	// ─── Code-Focused Detail ─────────────────────────────────

	private renderCodeDetail() {
		const container = this.contentEl;
		container.empty();

		if (!this.codeName) return;

		this.renderBackButton(container);

		const def = this.mdModel.registry.getByName(this.codeName)
			?? this.csvModel?.registry.getByName(this.codeName);
		const color = def?.color ?? '#888';

		// Header: swatch + code name
		const header = container.createDiv({ cls: 'codemarker-detail-header' });
		const swatch = header.createSpan({ cls: 'codemarker-detail-swatch' });
		swatch.style.backgroundColor = color;
		header.createSpan({ text: this.codeName, cls: 'codemarker-detail-title' });

		// Description
		if (def?.description) {
			const descSection = container.createDiv({ cls: 'codemarker-detail-section' });
			descSection.createEl('h6', { text: 'Description' });
			descSection.createEl('p', { text: def.description, cls: 'codemarker-detail-description' });
		}

		// Markdown markers with this code
		const mdMarkers = this.mdModel.getAllMarkers()
			.filter(m => m.codes.includes(this.codeName!));

		// CSV markers with this code
		const csvMarkers = this.csvModel
			? this.csvModel.getAllMarkers().filter(m => m.codes.includes(this.codeName!))
			: [];

		const totalCount = mdMarkers.length + csvMarkers.length;

		if (totalCount === 0) {
			container.createEl('p', { text: 'No segments yet.', cls: 'codemarker-detail-empty' });
			return;
		}

		// Markdown segments
		if (mdMarkers.length > 0) {
			const segSection = container.createDiv({ cls: 'codemarker-detail-section' });
			segSection.createEl('h6', { text: `Markdown Segments (${mdMarkers.length})` });
			const list = segSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
			for (const marker of mdMarkers) {
				this.renderMdMarkerItem(list, marker);
			}
		}

		// CSV segments
		if (csvMarkers.length > 0) {
			const segSection = container.createDiv({ cls: 'codemarker-detail-section' });
			segSection.createEl('h6', { text: `CSV Segments (${csvMarkers.length})` });
			const list = segSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
			for (const marker of csvMarkers) {
				this.renderCsvMarkerItem(list, marker);
			}
		}
	}

	// ─── Marker-Focused Detail ──────────────────────────────

	private renderMarkerDetail() {
		const container = this.contentEl;
		container.empty();

		if (!this.markerId || !this.codeName) return;

		this.renderBackButton(container);

		if (this.lastSource === 'csv') {
			this.renderCsvMarkerDetail(container);
		} else {
			this.renderMdMarkerDetail(container);
		}
	}

	private renderMdMarkerDetail(container: HTMLElement) {
		const marker = this.mdModel.getMarkerById(this.markerId!);
		if (!marker) {
			container.createEl('p', { text: 'Marker not found.', cls: 'codemarker-detail-empty' });
			return;
		}

		const def = this.mdModel.registry.getByName(this.codeName!);
		const color = def?.color ?? marker.color;

		// Header: swatch + code name
		const header = container.createDiv({ cls: 'codemarker-detail-header' });
		const swatch = header.createSpan({ cls: 'codemarker-detail-swatch' });
		swatch.style.backgroundColor = color;
		header.createSpan({ text: this.codeName!, cls: 'codemarker-detail-title' });

		// Description
		if (def?.description) {
			const descSection = container.createDiv({ cls: 'codemarker-detail-section' });
			descSection.createEl('h6', { text: 'Description' });
			descSection.createEl('p', { text: def.description, cls: 'codemarker-detail-description' });
		}

		// Text Segment
		const text = this.getMdMarkerText(marker);
		if (text) {
			const textSection = container.createDiv({ cls: 'codemarker-detail-section' });
			textSection.createEl('h6', { text: 'Text Segment' });
			const blockquote = textSection.createEl('blockquote', { cls: 'codemarker-detail-quote' });
			blockquote.createEl('p', { text });
		}

		// Other Codes on this marker
		this.renderOtherCodes(container, marker.codes);

		// Other Markers with the same code (same file)
		const otherMarkers = this.mdModel.getMarkersForFile(marker.fileId)
			.filter(m => m.id !== marker.id && m.codes.includes(this.codeName!));
		if (otherMarkers.length > 0) {
			const markersSection = container.createDiv({ cls: 'codemarker-detail-section' });
			markersSection.createEl('h6', { text: 'Other Markers' });
			const markerList = markersSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
			for (const other of otherMarkers) {
				const preview = this.getMdMarkerText(other);
				const li = markerList.createEl('li', { cls: 'codemarker-detail-marker-item' });
				li.createEl('span', {
					text: preview ? (preview.length > 60 ? preview.substring(0, 60) + '...' : preview) : `Line ${other.range.from.line + 1}`,
				});
				li.addEventListener('click', () => {
					this.setContext(other.id, this.codeName!);
					this.scrollToMdMarker(other);
				});
			}
		}
	}

	private renderCsvMarkerDetail(container: HTMLElement) {
		if (!this.csvModel) {
			container.createEl('p', { text: 'CSV model not available.', cls: 'codemarker-detail-empty' });
			return;
		}

		const marker = this.csvModel.findMarkerById(this.markerId!);
		if (!marker) {
			container.createEl('p', { text: 'Marker not found.', cls: 'codemarker-detail-empty' });
			return;
		}

		const def = this.csvModel.registry.getByName(this.codeName!)
			?? this.mdModel.registry.getByName(this.codeName!);
		const color = def?.color ?? '#888';

		// Header: swatch + code name
		const header = container.createDiv({ cls: 'codemarker-detail-header' });
		const swatch = header.createSpan({ cls: 'codemarker-detail-swatch' });
		swatch.style.backgroundColor = color;
		header.createSpan({ text: this.codeName!, cls: 'codemarker-detail-title' });

		// Description
		if (def?.description) {
			const descSection = container.createDiv({ cls: 'codemarker-detail-section' });
			descSection.createEl('h6', { text: 'Description' });
			descSection.createEl('p', { text: def.description, cls: 'codemarker-detail-description' });
		}

		// Text Segment
		const text = this.csvModel.getMarkerText(marker);
		if (text) {
			const textSection = container.createDiv({ cls: 'codemarker-detail-section' });
			textSection.createEl('h6', { text: 'Text Segment' });
			const blockquote = textSection.createEl('blockquote', { cls: 'codemarker-detail-quote' });
			blockquote.createEl('p', { text });
		}

		// Location info
		const locSection = container.createDiv({ cls: 'codemarker-detail-section' });
		locSection.createEl('h6', { text: 'Location' });
		locSection.createEl('p', {
			text: `${this.shortenPath(marker.file, '.csv')} — ${this.csvModel.getMarkerLabel(marker)}`,
			cls: 'codemarker-detail-description',
		});

		// Other Codes on this marker
		this.renderOtherCodes(container, marker.codes);

		// Other CSV Markers with the same code (same file)
		const otherMarkers = this.csvModel.getMarkersForFile(marker.file)
			.filter(m => m.id !== marker.id && m.codes.includes(this.codeName!));
		if (otherMarkers.length > 0) {
			const markersSection = container.createDiv({ cls: 'codemarker-detail-section' });
			markersSection.createEl('h6', { text: 'Other Markers' });
			const markerList = markersSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
			for (const other of otherMarkers) {
				const preview = this.csvModel.getMarkerText(other);
				const label = this.csvModel.getMarkerLabel(other);
				const li = markerList.createEl('li', { cls: 'codemarker-detail-marker-item' });
				li.createEl('span', {
					text: preview ? (preview.length > 60 ? preview.substring(0, 60) + '...' : preview) : label,
				});
				li.addEventListener('click', () => {
					this.setContext(other.id, this.codeName!);
					this.navigateToCsvMarker(other);
				});
			}
		}
	}

	// ─── Shared Render Helpers ──────────────────────────────

	private renderBackButton(container: HTMLElement) {
		const back = container.createDiv({ cls: 'codemarker-detail-back' });
		const icon = back.createSpan();
		setIcon(icon, 'arrow-left');
		back.createSpan({ text: 'All Codes' });
		back.addEventListener('click', () => {
			this.showList();
		});
	}

	private renderOtherCodes(container: HTMLElement, codes: string[]) {
		const otherCodes = codes.filter(c => c !== this.codeName);
		if (otherCodes.length === 0) return;

		const codesSection = container.createDiv({ cls: 'codemarker-detail-section' });
		codesSection.createEl('h6', { text: 'Other Codes' });
		const chipList = codesSection.createDiv({ cls: 'codemarker-detail-chips' });
		for (const code of otherCodes) {
			const codeDef = this.mdModel.registry.getByName(code)
				?? this.csvModel?.registry.getByName(code);
			const codeColor = codeDef?.color ?? '#888';
			const chip = chipList.createEl('span', { text: code, cls: 'codemarker-detail-chip' });
			chip.style.borderColor = codeColor;
			chip.style.color = codeColor;
			chip.addEventListener('click', () => {
				this.setContext(this.markerId!, code);
			});
		}
	}

	private renderMdMarkerItem(list: HTMLElement, marker: Marker) {
		const text = this.getMdMarkerText(marker);
		const preview = text
			? (text.length > 60 ? text.substring(0, 60) + '...' : text)
			: `Line ${marker.range.from.line + 1}`;

		const li = list.createEl('li', { cls: 'codemarker-detail-marker-item' });

		const fileRef = li.createSpan({ cls: 'codemarker-detail-marker-file' });
		fileRef.textContent = this.shortenPath(marker.fileId, '.md');

		li.createEl('span', { text: preview });

		li.addEventListener('click', () => {
			this.scrollToMdMarker(marker);
		});
	}

	private renderCsvMarkerItem(list: HTMLElement, marker: CsvMarkerLike) {
		if (!this.csvModel) return;

		const text = this.csvModel.getMarkerText(marker);
		const label = this.csvModel.getMarkerLabel(marker);
		const preview = text
			? (text.length > 60 ? text.substring(0, 60) + '...' : text)
			: label;

		const li = list.createEl('li', { cls: 'codemarker-detail-marker-item' });

		const fileRef = li.createSpan({ cls: 'codemarker-detail-marker-file' });
		fileRef.textContent = this.shortenPath(marker.file, '.csv') + ' — ' + label;

		li.createEl('span', { text: preview });

		li.addEventListener('click', () => {
			this.navigateToCsvMarker(marker);
		});
	}

	// ─── Navigation Helpers ─────────────────────────────────

	private getMdMarkerText(marker: Marker): string | null {
		const view = this.mdModel.getViewForFile(marker.fileId);
		if (!view?.editor) return null;

		try {
			return view.editor.getRange(marker.range.from, marker.range.to);
		} catch {
			return null;
		}
	}

	private scrollToMdMarker(marker: Marker) {
		const view = this.mdModel.getViewForFile(marker.fileId);
		if (!view?.editor) return;

		try {
			// @ts-ignore
			const offset = view.editor.posToOffset(marker.range.from);
			// @ts-ignore
			const editorView: EditorView = view.editor.cm;
			if (editorView) {
				editorView.dispatch({
					effects: EditorView.scrollIntoView(offset, { y: 'center' }),
				});
			}
			view.editor.setCursor(marker.range.from);
			this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
		} catch {
			view.editor.setCursor(marker.range.from);
		}
	}

	private async navigateToCsvMarker(marker: CsvMarkerLike) {
		// Open the file first (if not already open)
		const file = this.app.vault.getAbstractFileByPath(marker.file);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
		}
		// Dispatch navigation event for CSV grid
		this.app.workspace.trigger('codemarker-csv:navigate', {
			file: marker.file,
			row: marker.row,
			column: marker.column,
		});
	}

	private shortenPath(fileId: string, ext: string): string {
		const parts = fileId.split('/');
		return (parts[parts.length - 1] ?? fileId).replace(ext, '');
	}
}
