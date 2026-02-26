import { ItemView, WorkspaceLeaf, MarkdownView, setIcon } from 'obsidian';
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
		if (this.codeName) return this.codeName;
		return 'Code Explorer';
	}

	getIcon(): string {
		return 'tag';
	}

	/** Navigate to the list of all codes */
	showList() {
		this.markerId = null;
		this.codeName = null;
		(this.leaf as any).updateHeader?.();
		this.renderList();
	}

	/** Navigate to a code-focused detail (all markers for a code) */
	showCodeDetail(codeName: string) {
		this.markerId = null;
		this.codeName = codeName;
		(this.leaf as any).updateHeader?.();
		this.renderCodeDetail();
	}

	/** Set context to a specific marker + code (marker-focused detail) */
	setContext(markerId: string, codeName: string) {
		this.markerId = markerId;
		this.codeName = codeName;
		(this.leaf as any).updateHeader?.();
		this.render();
	}

	async onOpen() {
		this.contentEl.addClass('codemarker-detail-panel');
		if (this.markerId && this.codeName) {
			this.render();
		} else if (this.codeName) {
			this.renderCodeDetail();
		} else {
			this.renderList();
		}
	}

	async onClose() {
		this.contentEl.empty();
	}

	// ─── List Mode ───────────────────────────────────────────

	private renderList() {
		const container = this.contentEl;
		container.empty();

		const codes = this.model.registry.getAll();
		const counts = this.countSegmentsPerCode();

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

		// Back button
		this.renderBackButton(container);

		const def = this.model.registry.getByName(this.codeName);
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

		// All markers with this code (across all files)
		const allMarkers = this.model.getAllMarkers()
			.filter(m => m.codes.includes(this.codeName!));

		if (allMarkers.length === 0) {
			container.createEl('p', { text: 'No segments yet.', cls: 'codemarker-detail-empty' });
			return;
		}

		const segSection = container.createDiv({ cls: 'codemarker-detail-section' });
		segSection.createEl('h6', { text: `Segments (${allMarkers.length})` });

		const list = segSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
		for (const marker of allMarkers) {
			const text = this.getMarkerText(marker);
			const preview = text
				? (text.length > 60 ? text.substring(0, 60) + '...' : text)
				: `Line ${marker.range.from.line + 1}`;

			const li = list.createEl('li', { cls: 'codemarker-detail-marker-item' });

			// File reference
			const fileRef = li.createSpan({ cls: 'codemarker-detail-marker-file' });
			fileRef.textContent = this.shortenPath(marker.fileId);

			// Text preview
			li.createEl('span', { text: preview });

			li.addEventListener('click', () => {
				this.scrollToMarker(marker);
			});
		}
	}

	// ─── Marker-Focused Detail (existing behavior) ──────────

	private render() {
		const container = this.contentEl;
		container.empty();

		if (!this.markerId || !this.codeName) return;

		// Back button
		this.renderBackButton(container);

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
			const chipList = codesSection.createDiv({ cls: 'codemarker-detail-chips' });
			for (const code of otherCodes) {
				const codeDef = this.model.registry.getByName(code);
				const codeColor = codeDef?.color ?? marker.color;
				const chip = chipList.createEl('span', { text: code, cls: 'codemarker-detail-chip' });
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
			const markerList = markersSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
			for (const other of otherMarkers) {
				const preview = this.getMarkerText(other);
				const li = markerList.createEl('li', { cls: 'codemarker-detail-marker-item' });
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
		return (parts[parts.length - 1] ?? fileId).replace('.md', '');
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
			view.editor.setCursor(marker.range.from);
			this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
		} catch {
			view.editor.setCursor(marker.range.from);
		}
	}
}
