import { ItemView, WorkspaceLeaf, MarkdownView } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { CodeMarkerModel, Marker } from '../models/codeMarkerModel';

export const CODE_DETAIL_VIEW_TYPE = 'codemarker-code-detail';

export class CodeDetailView extends ItemView {
	private model: CodeMarkerModel;
	private markerId: string | null = null;
	private codeName: string | null = null;

	constructor(leaf: WorkspaceLeaf, model: CodeMarkerModel) {
		super(leaf);
		this.model = model;
	}

	getViewType(): string {
		return CODE_DETAIL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.codeName ?? 'Code Detail';
	}

	getIcon(): string {
		return 'tag';
	}

	setContext(markerId: string, codeName: string) {
		this.markerId = markerId;
		this.codeName = codeName;
		// Update leaf header title
		(this.leaf as any).updateHeader?.();
		this.render();
	}

	async onOpen() {
		this.contentEl.addClass('codemarker-detail-panel');
		if (this.markerId && this.codeName) {
			this.render();
		} else {
			this.contentEl.createEl('p', {
				text: 'Click a code label in the margin to view details.',
				cls: 'codemarker-detail-empty',
			});
		}
	}

	async onClose() {
		this.contentEl.empty();
	}

	private render() {
		const container = this.contentEl;
		container.empty();

		if (!this.markerId || !this.codeName) return;

		const marker = this.model.getMarkerById(this.markerId);
		if (!marker) {
			container.createEl('p', { text: 'Marker not found.', cls: 'codemarker-detail-empty' });
			return;
		}

		const def = this.model.registry.getByName(this.codeName);
		const color = def?.color ?? marker.color;

		// --- Header: swatch + code name ---
		const header = container.createDiv({ cls: 'codemarker-detail-header' });
		const swatch = header.createSpan({ cls: 'codemarker-detail-swatch' });
		swatch.style.backgroundColor = color;
		header.createSpan({ text: this.codeName, cls: 'codemarker-detail-title' });

		// --- Description ---
		const description = def?.description;
		if (description) {
			const descSection = container.createDiv({ cls: 'codemarker-detail-section' });
			descSection.createEl('h6', { text: 'Description' });
			descSection.createEl('p', { text: description, cls: 'codemarker-detail-description' });
		}

		// --- Text Segment ---
		const text = this.getMarkerText(marker);
		if (text) {
			const textSection = container.createDiv({ cls: 'codemarker-detail-section' });
			textSection.createEl('h6', { text: 'Text Segment' });
			const blockquote = textSection.createEl('blockquote', { cls: 'codemarker-detail-quote' });
			blockquote.createEl('p', { text });
		}

		// --- Other Codes on this marker ---
		const otherCodes = marker.codes.filter(c => c !== this.codeName);
		if (otherCodes.length > 0) {
			const codesSection = container.createDiv({ cls: 'codemarker-detail-section' });
			codesSection.createEl('h6', { text: 'Other Codes' });
			const list = codesSection.createDiv({ cls: 'codemarker-detail-chips' });
			for (const code of otherCodes) {
				const codeDef = this.model.registry.getByName(code);
				const codeColor = codeDef?.color ?? marker.color;
				const chip = list.createEl('span', { text: code, cls: 'codemarker-detail-chip' });
				chip.style.borderColor = codeColor;
				chip.style.color = codeColor;
				chip.addEventListener('click', () => {
					this.setContext(this.markerId!, code);
				});
			}
		}

		// --- Other Markers with the same code ---
		const otherMarkers = this.getOtherMarkersWithCode(marker, this.codeName);
		if (otherMarkers.length > 0) {
			const markersSection = container.createDiv({ cls: 'codemarker-detail-section' });
			markersSection.createEl('h6', { text: 'Other Markers' });
			const list = markersSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
			for (const other of otherMarkers) {
				const preview = this.getMarkerText(other);
				const li = list.createEl('li', { cls: 'codemarker-detail-marker-item' });
				li.createEl('span', {
					text: preview ? (preview.length > 60 ? preview.substring(0, 60) + '...' : preview) : `Line ${other.range.from.line + 1}`,
				});
				li.addEventListener('click', () => {
					this.setContext(other.id, this.codeName!);
					this.scrollToMarker(other);
				});
			}
		}
	}

	private getMarkerText(marker: Marker): string | null {
		const view = this.model.getViewForFile(marker.fileId);
		if (!view?.editor) return null;

		try {
			return view.editor.getRange(marker.range.from, marker.range.to);
		} catch {
			return null;
		}
	}

	private getOtherMarkersWithCode(current: Marker, codeName: string): Marker[] {
		const fileMarkers = this.model.getMarkersForFile(current.fileId);
		return fileMarkers.filter(m => m.id !== current.id && m.codes.includes(codeName));
	}

	private scrollToMarker(marker: Marker) {
		const view = this.model.getViewForFile(marker.fileId);
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
		} catch {
			// fallback: use Obsidian editor setCursor
			view.editor.setCursor(marker.range.from);
		}
	}
}
