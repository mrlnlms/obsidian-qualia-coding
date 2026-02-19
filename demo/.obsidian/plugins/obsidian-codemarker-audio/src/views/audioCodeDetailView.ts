/**
 * Audio Code Detail View — sidebar with 3 modes: list, code-focused, marker-focused.
 * Adapted from pdfCodeDetailView.ts.
 */

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type { AudioCodingModel } from '../coding/audioCodingModel';
import type { AudioMarker } from '../coding/audioCodingTypes';
import { formatTime } from '../utils/formatTime';

export const AUDIO_CODE_DETAIL_VIEW_TYPE = 'codemarker-audio-detail';

const AUDIO_EXTS = /\.(mp3|m4a|wav|ogg|flac|aac)$/i;

export class AudioCodeDetailView extends ItemView {
	private model: AudioCodingModel;
	private plugin: any;
	private markerId: string | null = null;
	private codeName: string | null = null;
	private searchTerm: string = '';
	private changeListener: () => void;
	private hoverListener: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, model: AudioCodingModel, plugin: any) {
		super(leaf);
		this.model = model;
		this.plugin = plugin;
		this.changeListener = () => this.refreshCurrentMode();
	}

	getViewType(): string {
		return AUDIO_CODE_DETAIL_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (this.codeName) return this.codeName;
		return 'Audio Code Detail';
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

		this.hoverListener = () => {
			const markerId = this.model.getHoverMarkerId();
			this.applyHoverToItems(markerId);
		};
		this.model.onHoverChange(this.hoverListener);

		this.refreshCurrentMode();
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

		// Search input
		const searchInput = container.createEl('input', {
			cls: 'codemarker-audio-search',
			attr: { type: 'text', placeholder: 'Filter codes...' },
		});
		searchInput.value = this.searchTerm;
		searchInput.addEventListener('input', () => {
			this.searchTerm = searchInput.value;
			this.renderList();
			const newInput = this.contentEl.querySelector<HTMLInputElement>('.codemarker-audio-search');
			if (newInput) {
				newInput.focus();
				newInput.selectionStart = newInput.selectionEnd = newInput.value.length;
			}
		});

		const lowerSearch = this.searchTerm.toLowerCase();
		const filtered = lowerSearch ? codes.filter(d => d.name.toLowerCase().includes(lowerSearch)) : codes;

		const list = container.createDiv({ cls: 'codemarker-explorer-list' });
		for (const def of filtered) {
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

		const allMarkers: { marker: AudioMarker; filePath: string }[] = [];
		for (const af of this.model.files) {
			for (const m of af.markers) {
				if (m.codes.includes(this.codeName!)) {
					allMarkers.push({ marker: m, filePath: af.path });
				}
			}
		}

		if (allMarkers.length === 0) {
			container.createEl('p', { text: 'No segments yet.', cls: 'codemarker-detail-empty' });
			return;
		}

		const segSection = container.createDiv({ cls: 'codemarker-detail-section' });
		segSection.createEl('h6', { text: `Segments (${allMarkers.length})` });

		const listEl = segSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
		for (const { marker, filePath } of allMarkers) {
			const label = this.model.getMarkerLabel(marker);

			const li = listEl.createEl('li', { cls: 'codemarker-detail-marker-item' });
			li.dataset.markerId = marker.id;
			li.createSpan({ cls: 'codemarker-detail-marker-file', text: this.shortenPath(filePath) });
			li.createEl('span', { text: label });

			li.addEventListener('click', () => {
				this.navigateToMarker(marker, filePath);
			});
			li.addEventListener('mouseenter', () => this.model.setHoverState(marker.id, this.codeName));
			li.addEventListener('mouseleave', () => this.model.setHoverState(null, null));
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

		const filePath = this.model.getFileForMarker(this.markerId);
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

		// Time range section
		const timeSection = container.createDiv({ cls: 'codemarker-detail-section' });
		timeSection.createEl('h6', { text: 'Time Range' });
		const blockquote = timeSection.createEl('blockquote', { cls: 'codemarker-detail-quote' });
		const duration = marker.to - marker.from;
		blockquote.createEl('p', {
			text: `${formatTime(marker.from)} – ${formatTime(marker.to)}  (${duration.toFixed(1)}s)`,
		});

		// Memo
		if (marker.memo) {
			const memoSection = container.createDiv({ cls: 'codemarker-detail-section' });
			memoSection.createEl('h6', { text: 'Memo' });
			memoSection.createEl('p', { text: marker.memo, cls: 'codemarker-detail-description' });
		}

		// Location info
		if (filePath) {
			const locSection = container.createDiv({ cls: 'codemarker-detail-section' });
			locSection.createEl('h6', { text: 'Location' });
			locSection.createEl('p', {
				text: this.model.getMarkerLabel(marker) + ' · ' + this.shortenPath(filePath),
				cls: 'codemarker-detail-description',
			});
		}

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
		const otherMarkers: { marker: AudioMarker; filePath: string }[] = [];
		for (const af of this.model.files) {
			for (const m of af.markers) {
				if (m.id !== marker.id && m.codes.includes(this.codeName!)) {
					otherMarkers.push({ marker: m, filePath: af.path });
				}
			}
		}

		if (otherMarkers.length > 0) {
			const markersSection = container.createDiv({ cls: 'codemarker-detail-section' });
			markersSection.createEl('h6', { text: 'Other Markers' });
			const markerList = markersSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
			for (const { marker: other, filePath: otherPath } of otherMarkers) {
				const label = this.model.getMarkerLabel(other);
				const li = markerList.createEl('li', { cls: 'codemarker-detail-marker-item' });
				li.dataset.markerId = other.id;
				li.createSpan({ cls: 'codemarker-detail-marker-file', text: this.shortenPath(otherPath) });
				li.createEl('span', { text: label });
				li.addEventListener('click', () => {
					this.setContext(other.id, this.codeName!);
					this.navigateToMarker(other, otherPath);
				});
				li.addEventListener('mouseenter', () => this.model.setHoverState(other.id, this.codeName));
				li.addEventListener('mouseleave', () => this.model.setHoverState(null, null));
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

	private shortenPath(filePath: string): string {
		const parts = filePath.split('/');
		return (parts[parts.length - 1] ?? filePath).replace(AUDIO_EXTS, '');
	}

	private navigateToMarker(marker: AudioMarker, filePath: string) {
		this.plugin.openAudioAndSeek(filePath, marker.from);
	}
}
