import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import { CodingModel, type CsvMarker } from '../coding/codingModel';

export const CSV_CODE_DETAIL_VIEW_TYPE = 'codemarker-csv-detail';

export class CsvCodeDetailView extends ItemView {
	private model: CodingModel;
	private markerId: string | null = null;
	private codeName: string | null = null;
	private changeListener: () => void;

	constructor(leaf: WorkspaceLeaf, model: CodingModel) {
		super(leaf);
		this.model = model;
		this.changeListener = () => this.refreshCurrentMode();
	}

	getViewType(): string {
		return CSV_CODE_DETAIL_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (this.codeName) return this.codeName;
		return 'CSV Code Explorer';
	}

	getIcon(): string {
		return 'tag';
	}

	showList() {
		this.markerId = null;
		this.codeName = null;
		(this.leaf as any).updateHeader?.();
		this.renderList();
	}

	showCodeDetail(codeName: string) {
		this.markerId = null;
		this.codeName = codeName;
		(this.leaf as any).updateHeader?.();
		this.renderCodeDetail();
	}

	setContext(markerId: string, codeName: string) {
		this.markerId = markerId;
		this.codeName = codeName;
		(this.leaf as any).updateHeader?.();
		this.renderMarkerDetail();
	}

	async onOpen() {
		this.contentEl.addClass('codemarker-detail-panel');
		this.model.onChange(this.changeListener);
		this.refreshCurrentMode();
	}

	async onClose() {
		this.model.offChange(this.changeListener);
		this.contentEl.empty();
	}

	private refreshCurrentMode() {
		if (this.markerId && this.codeName) {
			this.renderMarkerDetail();
		} else if (this.codeName) {
			this.renderCodeDetail();
		} else {
			this.renderList();
		}
	}

	// ─── List Mode ───────────────────────────────────────────

	private renderList() {
		const container = this.contentEl;
		container.empty();

		const codes = this.model.registry.getAll();
		const counts = this.countSegmentsPerCode();

		const header = container.createDiv({ cls: 'codemarker-explorer-header' });
		header.createSpan({ text: 'All Codes', cls: 'codemarker-explorer-title' });
		header.createSpan({ text: `${codes.length}`, cls: 'codemarker-explorer-count' });

		if (codes.length === 0) {
			container.createEl('p', { text: 'No codes yet.', cls: 'codemarker-detail-empty' });
			return;
		}

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

	private countSegmentsPerCode(): Map<string, number> {
		const counts = new Map<string, number>();
		for (const marker of this.model.getAllMarkers()) {
			for (const code of marker.codes) {
				counts.set(code, (counts.get(code) ?? 0) + 1);
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

		const def = this.model.registry.getByName(this.codeName);
		const color = def?.color ?? '#888';

		const header = container.createDiv({ cls: 'codemarker-detail-header' });
		const swatch = header.createSpan({ cls: 'codemarker-detail-swatch' });
		swatch.style.backgroundColor = color;
		header.createSpan({ text: this.codeName, cls: 'codemarker-detail-title' });

		if (def?.description) {
			const descSection = container.createDiv({ cls: 'codemarker-detail-section' });
			descSection.createEl('h6', { text: 'Description' });
			descSection.createEl('p', { text: def.description, cls: 'codemarker-detail-description' });
		}

		const allMarkers = this.model.getAllMarkers()
			.filter(m => m.codes.includes(this.codeName!));

		if (allMarkers.length === 0) {
			container.createEl('p', { text: 'No segments yet.', cls: 'codemarker-detail-empty' });
			return;
		}

		const segSection = container.createDiv({ cls: 'codemarker-detail-section' });
		segSection.createEl('h6', { text: `Segments (${allMarkers.length})` });

		const listEl = segSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
		for (const marker of allMarkers) {
			const text = this.model.getMarkerText(marker);
			const label = this.model.getMarkerLabel(marker);
			const preview = text
				? (text.length > 60 ? text.substring(0, 60) + '...' : text)
				: label;

			const li = listEl.createEl('li', { cls: 'codemarker-detail-marker-item' });
			li.createSpan({ cls: 'codemarker-detail-marker-file', text: this.shortenPath(marker.file) });
			li.createEl('span', { text: preview });

			li.addEventListener('click', () => {
				this.navigateToMarker(marker);
			});
		}
	}

	// ─── Marker-Focused Detail ──────────────────────────────

	private renderMarkerDetail() {
		const container = this.contentEl;
		container.empty();

		if (!this.markerId || !this.codeName) return;

		this.renderBackButton(container);

		const marker = this.model.findMarkerById(this.markerId);
		if (!marker) {
			container.createEl('p', { text: 'Marker not found.', cls: 'codemarker-detail-empty' });
			return;
		}

		const def = this.model.registry.getByName(this.codeName);
		const color = def?.color ?? '#888';

		const header = container.createDiv({ cls: 'codemarker-detail-header' });
		const swatch = header.createSpan({ cls: 'codemarker-detail-swatch' });
		swatch.style.backgroundColor = color;
		header.createSpan({ text: this.codeName, cls: 'codemarker-detail-title' });

		if (def?.description) {
			const descSection = container.createDiv({ cls: 'codemarker-detail-section' });
			descSection.createEl('h6', { text: 'Description' });
			descSection.createEl('p', { text: def.description, cls: 'codemarker-detail-description' });
		}

		const text = this.model.getMarkerText(marker);
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
			text: this.model.getMarkerLabel(marker) + ' · ' + this.shortenPath(marker.file),
			cls: 'codemarker-detail-description',
		});

		// Other codes on this marker
		const otherCodes = marker.codes.filter(c => c !== this.codeName);
		if (otherCodes.length > 0) {
			const codesSection = container.createDiv({ cls: 'codemarker-detail-section' });
			codesSection.createEl('h6', { text: 'Other Codes' });
			const chipList = codesSection.createDiv({ cls: 'codemarker-detail-chips' });
			for (const code of otherCodes) {
				const codeDef = this.model.registry.getByName(code);
				const codeColor = codeDef?.color ?? '#888';
				const chip = chipList.createEl('span', { text: code, cls: 'codemarker-detail-chip' });
				chip.style.borderColor = codeColor;
				chip.style.color = codeColor;
				chip.addEventListener('click', () => {
					this.setContext(this.markerId!, code);
				});
			}
		}

		// Other markers with same code
		const otherMarkers = this.model.getAllMarkers()
			.filter(m => m.id !== marker.id && m.codes.includes(this.codeName!));
		if (otherMarkers.length > 0) {
			const markersSection = container.createDiv({ cls: 'codemarker-detail-section' });
			markersSection.createEl('h6', { text: 'Other Markers' });
			const markerList = markersSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
			for (const other of otherMarkers) {
				const preview = this.model.getMarkerText(other);
				const label = this.model.getMarkerLabel(other);
				const li = markerList.createEl('li', { cls: 'codemarker-detail-marker-item' });
				li.createSpan({ cls: 'codemarker-detail-marker-file', text: this.shortenPath(other.file) });
				li.createEl('span', {
					text: preview ? (preview.length > 60 ? preview.substring(0, 60) + '...' : preview) : label,
				});
				li.addEventListener('click', () => {
					this.setContext(other.id, this.codeName!);
					this.navigateToMarker(other);
				});
			}
		}
	}

	// ─── Shared Helpers ─────────────────────────────────────

	private renderBackButton(container: HTMLElement) {
		const back = container.createDiv({ cls: 'codemarker-detail-back' });
		const icon = back.createSpan();
		setIcon(icon, 'arrow-left');
		back.createSpan({ text: 'All Codes' });
		back.addEventListener('click', () => {
			this.showList();
		});
	}

	private shortenPath(fileId: string): string {
		const parts = fileId.split('/');
		return (parts[parts.length - 1] ?? fileId).replace('.csv', '');
	}

	private async navigateToMarker(marker: CsvMarker) {
		// Open the file first (if not already open)
		const file = this.app.vault.getAbstractFileByPath(marker.file);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
		}
		// Dispatch navigation event for the grid view to handle
		this.app.workspace.trigger('codemarker-csv:navigate' as any, {
			file: marker.file,
			row: marker.row,
			column: marker.column,
		});
	}
}
