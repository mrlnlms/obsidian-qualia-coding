import { Plugin, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { PdfCodingModel } from './coding/pdfCodingModel';
import { capturePdfSelection, detectCrossPageSelection, captureCrossPageSelection, type PdfSelectionResult } from './pdf/selectionCapture';
import { getPdfViewerChild } from './pdf/pdfViewerAccess';
import { PdfPageObserver } from './pdf/pageObserver';
import { openPdfCodingPopover } from './menu/pdfCodingMenu';
import { PdfCodeExplorerView, PDF_CODE_EXPLORER_VIEW_TYPE } from './views/pdfCodeExplorerView';
import { PdfCodeDetailView, PDF_CODE_DETAIL_VIEW_TYPE } from './views/pdfCodeDetailView';
import type { PDFViewerChild } from './pdfTypings';
import type { PdfMarker } from './coding/pdfCodingTypes';

export default class CodeMarkerPdfPlugin extends Plugin {
	model!: PdfCodingModel;
	private instrumentedViewers = new WeakSet<PDFViewerChild>();
	private observers = new Map<PDFViewerChild, PdfPageObserver>();

	async onload() {
		console.log('[codemarker-pdf] v35.5 loaded — Popover replaces sidebar + hover trigger');
		this.model = new PdfCodingModel(this);
		await this.model.load();

		// Register sidebar views
		this.registerView(PDF_CODE_EXPLORER_VIEW_TYPE, (leaf) => new PdfCodeExplorerView(leaf, this.model));
		this.registerView(PDF_CODE_DETAIL_VIEW_TYPE, (leaf) => new PdfCodeDetailView(leaf, this.model));

		// Commands
		this.addCommand({
			id: 'open-pdf-code-explorer',
			name: 'Open PDF Code Explorer',
			callback: () => this.revealPdfCodeExplorer(),
		});

		this.addCommand({
			id: 'open-pdf-code-detail',
			name: 'Open PDF Code Detail',
			callback: () => this.revealPdfCodeExplorer(),
		});

		this.addCommand({
			id: 'undo-pdf-coding',
			name: 'Undo last coding action',
			callback: () => {
				if (!this.model.undo()) {
					new Notice('Nothing to undo.');
				}
			},
		});

		// Ribbon icon
		this.addRibbonIcon('highlighter', 'PDF Code Explorer', () => {
			this.revealPdfCodeExplorer();
		});

		// Listen for PDF views
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (!leaf) return;
				const view = leaf.view as any;
				if (view?.getViewType?.() === 'pdf' && view.viewer) {
					this.instrumentPdfView(view);
				}
			})
		);

		// Also instrument already-open PDF views on plugin load
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view as any;
			if (view?.getViewType?.() === 'pdf' && view.viewer) {
				this.instrumentPdfView(view);
			}
		});

		// Clean up observers when leaves close
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.cleanupOrphanedObservers();
			})
		);

		// Track file renames — update marker.file when a PDF is moved/renamed
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && file.extension === 'pdf') {
					this.model.migrateFilePath(oldPath, file.path);
				}
			})
		);
	}

	async onunload() {
		// Stop all observers
		for (const [, observer] of this.observers) {
			observer.stop();
		}
		this.observers.clear();
	}

	private instrumentPdfView(view: any) {
		const component = view.viewer as any;
		if (!component) return;

		// Use .then() to wait for child to be ready
		component.then((child: PDFViewerChild) => {
			if (this.instrumentedViewers.has(child)) return;
			this.instrumentedViewers.add(child);

			const refreshObserver = () => {
				const obs = this.observers.get(child);
				if (obs) obs.refreshAll();
			};

			// Create page observer for highlights
			const observer = new PdfPageObserver(child, this.model, {
				onMarkerClick: (markerId, codeName) => {
					this.revealPdfCodeDetailPanel(markerId, codeName);
				},
				onMarkerHoverPopover: (marker: PdfMarker, anchorEl: HTMLElement) => {
					this.openPopoverForMarkerAtElement(marker, anchorEl, refreshObserver);
				},
			});
			observer.start();
			this.observers.set(child, observer);

			// Listen for mouseup to capture text selection
			const container = child.containerEl;
			const mouseupHandler = (evt: MouseEvent) => {
				// Ignore if child was unloaded
				if (child.unloaded) {
					container.removeEventListener('mouseup', mouseupHandler);
					return;
				}
				// Small delay to let the browser finalize the selection
				setTimeout(() => {
					const filePath = child.file?.path;
					if (!filePath) return;

					// Try cross-page selection first
					if (detectCrossPageSelection()) {
						const crossResults = captureCrossPageSelection(filePath, child);
						if (!crossResults) return;

						openPdfCodingPopover(
							evt,
							this.model,
							crossResults,
							refreshObserver,
							undefined,
							this.app,
						);
						return;
					}

					// Single-page selection
					const result = capturePdfSelection(filePath);
					if (!result) return;

					openPdfCodingPopover(
						evt,
						this.model,
						result,
						refreshObserver,
						undefined,
						this.app,
					);
				}, 50);
			};
			container.addEventListener('mouseup', mouseupHandler);
		});
	}

	/** Open coding popover for an existing marker (hover on highlight). */
	private openPopoverForMarkerAtElement(marker: PdfMarker, anchorEl: HTMLElement, onRefresh: () => void) {
		const selectionResult: PdfSelectionResult = {
			file: marker.file,
			page: marker.page,
			beginIndex: marker.beginIndex,
			beginOffset: marker.beginOffset,
			endIndex: marker.endIndex,
			endOffset: marker.endOffset,
			text: marker.text,
		};
		// Position popover relative to the anchor element (highlight rect)
		const rect = anchorEl.getBoundingClientRect();
		const pos = { x: rect.left, y: rect.bottom };
		openPdfCodingPopover(null, this.model, selectionResult, onRefresh, pos, this.app);
	}

	private cleanupOrphanedObservers() {
		for (const [child, observer] of this.observers) {
			if (child.unloaded) {
				observer.stop();
				this.observers.delete(child);
			}
		}
	}

	async revealPdfCodeExplorer() {
		const existing = this.app.workspace.getLeavesOfType(PDF_CODE_EXPLORER_VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: PDF_CODE_EXPLORER_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async revealPdfCodeDetailPanel(markerId: string, codeName: string) {
		let leaf: WorkspaceLeaf | null = null;
		const existing = this.app.workspace.getLeavesOfType(PDF_CODE_DETAIL_VIEW_TYPE);

		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: PDF_CODE_DETAIL_VIEW_TYPE, active: true });
			}
		}

		if (leaf) {
			// Always reveal — ensures sidebar opens even if hidden or behind another tab
			this.app.workspace.revealLeaf(leaf);
			const view = leaf.view as PdfCodeDetailView;
			if (view.setContext) {
				view.setContext(markerId, codeName);
			}
		}
	}
}
