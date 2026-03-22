
import { setIcon } from 'obsidian';
import { EditorView, drawSelection, tooltips } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { createMarkerStateField, updateFileMarkersEffect, setFileIdEffect } from '../markdown/cm6/markerStateField';
import { createMarkerViewPlugin } from '../markdown/cm6/markerViewPlugin';
import { createSelectionMenuField } from '../markdown/cm6/selectionMenuField';
import { createHoverMenuExtension } from '../markdown/cm6/hoverMenuExtension';
import { createMarginPanelExtension } from '../markdown/cm6/marginPanelExtension';
import { registerStandaloneEditor, unregisterStandaloneEditor } from '../markdown/cm6/utils/viewLookupUtils';
import type { Marker, CodeMarkerModel } from '../markdown/models/codeMarkerModel';
import type { SegmentMarker } from './csvCodingTypes';
import type { CsvCodingModel } from './csvCodingModel';
import type { GridApi } from 'ag-grid-community';
import { getCodeIds } from '../core/codeApplicationHelpers';

export interface SegmentEditorContext {
	file: string;
	row: number;
	column: string;
}

// Getter-based — CsvCodingView implements this directly (passes `this`)
export interface SegmentEditorHost {
	get contentEl(): HTMLElement;
	get gridWrapper(): HTMLElement | null;
	get gridApi(): GridApi | null;
	readonly csvModel: CsvCodingModel;
	readonly markdownModel: CodeMarkerModel;
}

export class SegmentEditor {
	private editorPanel: HTMLElement | null = null;
	private editorView: EditorView | null = null;
	private editorContext: SegmentEditorContext | null = null;
	private labelObserver: MutationObserver | null = null;

	constructor(private host: SegmentEditorHost) {}

	get context(): SegmentEditorContext | null { return this.editorContext; }
	get isOpen(): boolean { return this.editorView !== null; }

	open(file: string, row: number, column: string, cellText: string): void {
		if (
			this.editorContext &&
			this.editorContext.file === file &&
			this.editorContext.row === row &&
			this.editorContext.column === column
		) {
			this.close();
			return;
		}

		this.close();
		this.editorContext = { file, row, column };

		const virtualFileId = `csv:${file}:${row}:${column}`;

		if (this.host.gridWrapper) {
			this.host.gridWrapper.style.height = 'calc(60% - 40px)';
		}

		this.editorPanel = this.host.contentEl.createEl('div');
		this.editorPanel.className = 'csv-segment-editor-panel';
		this.editorPanel.style.height = '40%';
		this.editorPanel.style.borderTop = '2px solid var(--background-modifier-border)';
		this.editorPanel.style.display = 'flex';
		this.editorPanel.style.flexDirection = 'column';

		const header = this.editorPanel.createEl('div');
		header.className = 'csv-segment-editor-header';
		header.style.display = 'flex';
		header.style.alignItems = 'center';
		header.style.justifyContent = 'space-between';
		header.style.padding = '4px 12px';
		header.style.fontSize = '12px';
		header.style.color = 'var(--text-muted)';
		header.style.backgroundColor = 'var(--background-secondary)';
		header.style.flexShrink = '0';

		header.createSpan({ text: `Row ${row + 1} \u00b7 ${column}` });

		const closeBtn = header.createSpan();
		closeBtn.style.cursor = 'pointer';
		closeBtn.style.display = 'flex';
		setIcon(closeBtn, 'x');
		const svg = closeBtn.querySelector('svg');
		if (svg) { svg.style.width = '16px'; svg.style.height = '16px'; }
		closeBtn.addEventListener('click', () => this.close());

		const editorContainer = this.editorPanel.createEl('div');
		editorContainer.style.flex = '1';
		editorContainer.style.overflow = 'auto';

		const mdModel = this.host.markdownModel;

		// Sync code definitions from shared registry so colors resolve in CM6
		for (const def of this.host.csvModel.registry.getAll()) {
			if (!mdModel.registry.getByName(def.name)) {
				mdModel.registry.importDefinition(def);
			}
		}

		const segmentMarkers = this.host.csvModel.getSegmentMarkersForCell(file, row, column);
		this.populateMarkersFromSegments(virtualFileId, segmentMarkers, cellText);

		this.editorView = new EditorView({
			state: EditorState.create({
				doc: cellText,
				extensions: [
					EditorView.editable.of(false),
					EditorState.readOnly.of(true),
					drawSelection(),
					tooltips({ parent: document.body }),
					createMarkerStateField(mdModel),
					createMarkerViewPlugin(mdModel),
					createSelectionMenuField(mdModel),
					createHoverMenuExtension(mdModel),
					createMarginPanelExtension(mdModel),
					EditorView.theme({
						'&': {
							backgroundColor: 'var(--background-secondary)',
							color: 'var(--text-normal)',
							height: '100%',
						},
						'.cm-content': {
							fontFamily: "Georgia, 'Times New Roman', serif",
							fontSize: '28px',
							padding: '8px 0',
						},
						'.cm-activeLine': {
							backgroundColor: 'transparent',
						},
						'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
							backgroundColor: 'rgba(var(--interactive-accent-rgb, 66, 133, 244), 0.25) !important',
						},
					}),
				],
			}),
			parent: editorContainer,
		});

		registerStandaloneEditor(this.editorView, virtualFileId);
		mdModel.registerStandaloneEditor(virtualFileId, this.editorView);

		this.editorView.dispatch({
			effects: [
				setFileIdEffect.of({ fileId: virtualFileId }),
				updateFileMarkersEffect.of({ fileId: virtualFileId }),
			]
		});

		this.alignMarginLabels();

		// Suppress hover/handles for 500ms after creation
		this.editorView.dom.style.pointerEvents = 'none';
		const ev = this.editorView;
		setTimeout(() => {
			if (ev.dom) ev.dom.style.pointerEvents = '';
		}, 500);

		if (this.host.gridApi) {
			const gridApi = this.host.gridApi;
			setTimeout(() => gridApi?.setGridOption('domLayout', 'normal'), 50);
		}
	}

	close(): void {
		if (this.labelObserver) {
			this.labelObserver.disconnect();
			this.labelObserver = null;
		}
		if (this.editorView && this.editorContext) {
			const { file, row, column } = this.editorContext;
			const virtualFileId = `csv:${file}:${row}:${column}`;

			this.syncMarkersBackToCsvModel(virtualFileId, file, row, column);

			const mdModel = this.host.markdownModel;
			unregisterStandaloneEditor(this.editorView);
			mdModel.unregisterStandaloneEditor(virtualFileId);
			mdModel.clearMarkersForFile(virtualFileId);

			this.editorView.destroy();
			this.editorView = null;
		} else if (this.editorView) {
			this.editorView.destroy();
			this.editorView = null;
		}
		if (this.editorPanel) {
			this.editorPanel.remove();
			this.editorPanel = null;
		}
		this.editorContext = null;

		if (this.host.gridWrapper) {
			this.host.gridWrapper.style.height = 'calc(100% - 40px)';
		}
		if (this.host.gridApi) {
			const gridApi = this.host.gridApi;
			setTimeout(() => gridApi?.setGridOption('domLayout', 'normal'), 50);
		}
		if (this.host.gridApi) {
			const gridApi = this.host.gridApi;
			setTimeout(() => gridApi?.refreshCells({ force: true }), 100);
		}
	}

	refresh(): void {
		if (this.editorView && this.editorContext) {
			const { file, row, column } = this.editorContext;
			const virtualFileId = `csv:${file}:${row}:${column}`;
			this.editorView.dispatch({
				effects: updateFileMarkersEffect.of({ fileId: virtualFileId }),
			});
		}
	}

	private alignMarginLabels(): void {
		if (!this.editorView) return;
		const panel = this.editorView.scrollDOM.querySelector('.codemarker-margin-panel');
		if (!panel) return;

		const ORIGINAL_LABEL_HEIGHT = 16;
		const editorView = this.editorView;

		const patchLabels = () => {
			if (!editorView?.dom) return;

			const lineH = editorView.defaultLineHeight;
			const contentPaddingTop = parseFloat(getComputedStyle(editorView.contentDOM).paddingTop) || 0;

			const labels = panel.querySelectorAll<HTMLElement>('.codemarker-margin-label');
			if (labels.length === 0) return;

			const heightShift = (lineH - ORIGINAL_LABEL_HEIGHT) / 2;
			if (Math.abs(contentPaddingTop) < 0.5 && Math.abs(heightShift) < 0.5) return;

			const allPositioned = panel.querySelectorAll<HTMLElement>('[style*="top"]');
			for (const el of Array.from(allPositioned)) {
				const origTop = parseFloat(el.style.top);
				if (isNaN(origTop)) continue;

				if (el.classList.contains('codemarker-margin-label')) {
					const labelShift = (lineH - ORIGINAL_LABEL_HEIGHT) / 2;
					el.style.top = `${origTop + contentPaddingTop - labelShift}px`;
					el.style.lineHeight = `${lineH}px`;
				} else {
					el.style.top = `${origTop + contentPaddingTop}px`;
				}
			}
		};

		this.labelObserver = new MutationObserver(() => {
			requestAnimationFrame(patchLabels);
		});
		this.labelObserver.observe(panel, { childList: true });
	}

	private populateMarkersFromSegments(virtualFileId: string, segments: SegmentMarker[], cellText: string): void {
		const mdModel = this.host.markdownModel;
		mdModel.clearMarkersForFile(virtualFileId);

		const lines = cellText.split('\n');
		const lineStarts: number[] = [0];
		for (let i = 0; i < lines.length - 1; i++) {
			lineStarts.push(lineStarts[i]! + lines[i]!.length + 1);
		}

		const offsetToPos = (offset: number): { line: number; ch: number } => {
			for (let i = lineStarts.length - 1; i >= 0; i--) {
				if (offset >= lineStarts[i]!) {
					return { line: i, ch: offset - lineStarts[i]! };
				}
			}
			return { line: 0, ch: 0 };
		};

		for (const seg of segments) {
			if (seg.codes.length === 0) continue;
			const marker: Marker = {
				markerType: 'markdown',
				id: seg.id,
				fileId: virtualFileId,
				range: {
					from: offsetToPos(seg.from),
					to: offsetToPos(seg.to),
				},
				color: this.host.csvModel.registry.getColorForCodeIds(getCodeIds(seg.codes)) ?? '#6200EE',
				codes: [...seg.codes],
				createdAt: seg.createdAt,
				updatedAt: seg.updatedAt,
			};
			mdModel.addMarkerDirect(virtualFileId, marker);
		}
	}

	private syncMarkersBackToCsvModel(virtualFileId: string, file: string, row: number, column: string): void {
		const mdModel = this.host.markdownModel;
		const mdMarkers = mdModel.getMarkersForFile(virtualFileId);

		if (!this.editorView) return;
		const doc = this.editorView.state.doc;

		this.host.csvModel.deleteSegmentMarkersForCell(file, row, column);

		for (const marker of mdMarkers) {
			if (marker.codes.length === 0) continue;
			try {
				const fromOffset = doc.line(marker.range.from.line + 1).from + marker.range.from.ch;
				const toOffset = doc.line(marker.range.to.line + 1).from + marker.range.to.ch;

				const snapshot = { fileId: file, row, column, from: fromOffset, to: toOffset, text: '' };
				const segMarker = this.host.csvModel.findOrCreateSegmentMarker(snapshot);
				segMarker.codes = [...marker.codes];
				segMarker.updatedAt = marker.updatedAt;
			} catch (e) {
				console.warn('[Qualia CSV] Error syncing marker back:', e);
			}
		}

		this.host.csvModel.notifyAndSave();
	}
}
