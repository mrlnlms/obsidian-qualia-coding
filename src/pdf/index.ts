import { TFile, Notice } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EngineRegistration } from '../core/types';
import { registerFileRename } from '../core/fileInterceptor';
import { PdfCodingModel } from './pdfCodingModel';
import { capturePdfSelection, detectCrossPageSelection, captureCrossPageSelection, type PdfSelectionResult } from './selectionCapture';
import { PdfPageObserver } from './pageObserver';
import { DrawInteraction } from './drawInteraction';
import { DrawToolbar } from './drawToolbar';
import { openPdfCodingPopover, openShapeCodingPopover } from './pdfCodingMenu';
import { renderSelectionPreview } from './highlightRenderer';
import { closeActivePopover } from '../core/baseCodingMenu';
import type { PDFViewerChild } from './pdfTypings';
import type { PdfMarker, PdfShapeMarker } from './pdfCodingTypes';
import { getPdfViewState, destroyPdfViewState, type PdfViewState } from './pdfViewState';

export function registerPdfEngine(plugin: QualiaCodingPlugin): EngineRegistration<PdfCodingModel> {
	// Use shared registry from plugin (single instance for all engines)
	const registry = plugin.sharedRegistry;

	// Create model
	const model = new PdfCodingModel(plugin.dataManager, registry);
	model.load();

	// Expose model on plugin for cross-engine access
	plugin.pdfModel = model;

	// State tracking
	const instrumentedViewers = new WeakSet<PDFViewerChild>();
	const observers = new Map<PDFViewerChild, PdfPageObserver>();
	const drawInteractions = new Map<PDFViewerChild, DrawInteraction>();
	const drawToolbars = new Map<PDFViewerChild, DrawToolbar>();
	const childListeners = new Map<PDFViewerChild, Array<{ el: HTMLElement; type: string; fn: EventListener }>>();

	// ── Helper functions ──

	function openPopoverForMarkerAtElement(marker: PdfMarker, anchorEl: HTMLElement, onRefresh: () => void, state?: PdfViewState) {
		const selectionResult: PdfSelectionResult = {
			file: marker.fileId,
			page: marker.page,
			beginIndex: marker.beginIndex,
			beginOffset: marker.beginOffset,
			endIndex: marker.endIndex,
			endOffset: marker.endOffset,
			text: marker.text,
		};
		const rect = anchorEl.getBoundingClientRect();
		const pos = { x: rect.left, y: rect.bottom };
		openPdfCodingPopover(null, model, selectionResult, onRefresh, pos, plugin.app, marker.id, undefined, state);
	}

	function cleanupOrphanedObservers() {
		for (const [child, observer] of observers) {
			if (child.unloaded) {
				observer.stop();
				observers.delete(child);

				const interaction = drawInteractions.get(child);
				if (interaction) {
					interaction.stop();
					drawInteractions.delete(child);
				}

				const toolbar = drawToolbars.get(child);
				if (toolbar) {
					toolbar.unmount();
					drawToolbars.delete(child);
				}

				// Clean up DOM event listeners to prevent leaks
				const entries = childListeners.get(child);
				if (entries) {
					for (const { el, type, fn } of entries) {
						el.removeEventListener(type, fn);
					}
					childListeners.delete(child);
				}

				// Destroy PdfViewState (cancel pending hover/shape timers)
				destroyPdfViewState(child.containerEl);
			}
		}
	}

	function instrumentPdfView(view: any) {
		const component = view.viewer as any;
		if (!component) return;

		component.then((child: PDFViewerChild) => {
			if (instrumentedViewers.has(child)) return;
			instrumentedViewers.add(child);

			const refreshObserver = () => {
				const obs = observers.get(child);
				if (obs) obs.refreshAll();
			};

			// Create page observer for highlights + shapes
			const pdfState = getPdfViewState(child.containerEl);
			const observer = new PdfPageObserver(child, model, {
				onMarkerClick: (markerId, codeName) => {
					document.dispatchEvent(new CustomEvent('codemarker:label-click', {
					detail: { markerId, codeName },
				}));
				},
				onClosePopover: () => closeActivePopover('codemarker-popover'),
				onMarkerHoverPopover: (marker: PdfMarker, anchorEl: HTMLElement) => {
					openPopoverForMarkerAtElement(marker, anchorEl, refreshObserver, pdfState);
				},
				onShapeClick: (shapeId, codeName) => {
					document.dispatchEvent(new CustomEvent('codemarker:label-click', {
						detail: { markerId: shapeId, codeName },
					}));
				},
				onShapeDoubleClick: (shape: PdfShapeMarker, anchorEl: SVGElement) => {
					const rect = anchorEl.getBoundingClientRect();
					openShapeCodingPopover(
						{ x: rect.left, y: rect.bottom },
						model,
						shape.id,
						refreshObserver,
						plugin.app,
						pdfState,
					);
				},
				onShapeHoverPopover: (shape: PdfShapeMarker, anchorEl: SVGElement) => {
					const rect = anchorEl.getBoundingClientRect();
					openShapeCodingPopover(
						{ x: rect.left, y: rect.bottom },
						model,
						shape.id,
						refreshObserver,
						plugin.app,
						pdfState,
					);
				},
			}, pdfState);
			observer.start();
			observers.set(child, observer);

			// Track last mouse position for popover placement after shape creation
			let lastMousePos = { x: 0, y: 0 };
			const trackMouse = (e: MouseEvent) => { lastMousePos = { x: e.clientX, y: e.clientY }; };
			child.containerEl.addEventListener('mousemove', trackMouse);
			child.containerEl.addEventListener('mouseup', trackMouse);
			const listeners: Array<{ el: HTMLElement; type: string; fn: EventListener }> = [
				{ el: child.containerEl, type: 'mousemove', fn: trackMouse as EventListener },
				{ el: child.containerEl, type: 'mouseup', fn: trackMouse as EventListener },
			];

			// Create draw interaction and toolbar
			const drawInteraction = new DrawInteraction(child, model, {
				onShapeCreated: (file, page, coords) => {
					const shape = model.createShape(file, page, coords);
					const shapeEls = child.containerEl.querySelectorAll(`[data-shape-id="${shape.id}"]`);
					const anchorEl = shapeEls[0] as SVGElement | undefined;
					const pos = anchorEl
						? { x: anchorEl.getBoundingClientRect().left, y: anchorEl.getBoundingClientRect().bottom }
						: lastMousePos;

					openShapeCodingPopover(
						pos,
						model,
						shape.id,
						refreshObserver,
						plugin.app,
					);
				},
				onShapeSelected: (_shapeId) => {
					// Could update sidebar, for now just visual
				},
				onShapeMoved: (shapeId, coords) => {
					model.updateShapeCoords(shapeId, coords);
				},
			});
			drawInteraction.start();
			drawInteractions.set(child, drawInteraction);

			const toolbar = new DrawToolbar(drawInteraction);
			toolbar.mount(child.containerEl);
			drawToolbars.set(child, toolbar);

			// Listen for mouseup to capture text selection
			const container = child.containerEl;
			const mouseupHandler = (evt: MouseEvent) => {
				if (child.unloaded) {
					container.removeEventListener('mouseup', mouseupHandler);
					return;
				}
				const di = drawInteractions.get(child);
				if (di && di.getMode() !== 'select') return;

				setTimeout(() => {
					const filePath = child.file?.path;
					if (!filePath) return;

					if (detectCrossPageSelection()) {
						const crossResults = captureCrossPageSelection(filePath, child);
						if (!crossResults) return;

						// Render selection preview on each page before popover steals focus
						const cleanups: (() => void)[] = [];
						for (const r of crossResults) {
							try {
								const pv = child.getPage(r.page);
								if (pv) {
									const cleanup = renderSelectionPreview(pv, r.beginIndex, r.beginOffset, r.endIndex, r.endOffset);
									if (cleanup) cleanups.push(cleanup);
								}
							} catch { /* skip */ }
						}

						openPdfCodingPopover(
							evt,
							model,
							crossResults,
							refreshObserver,
							undefined,
							plugin.app,
							undefined,
							() => { cleanups.forEach(fn => fn()); if (pdfState) pdfState.selectionPreviewCleanup = null; },
							pdfState,
						);
						if (pdfState && cleanups.length > 0) pdfState.selectionPreviewCleanup = () => cleanups.forEach(fn => fn());
						return;
					}

					const result = capturePdfSelection(filePath);
					if (!result) return;

					// Render selection preview before popover steals focus
					let previewCleanup: (() => void) | null = null;
					try {
						const pv = child.getPage(result.page);
						if (pv) {
							previewCleanup = renderSelectionPreview(pv, result.beginIndex, result.beginOffset, result.endIndex, result.endOffset);
						}
					} catch { /* skip */ }

					openPdfCodingPopover(
						evt,
						model,
						result,
						refreshObserver,
						undefined,
						plugin.app,
						undefined,
						previewCleanup ? () => { previewCleanup!(); if (pdfState) pdfState.selectionPreviewCleanup = null; } : undefined,
						pdfState,
					);
					if (pdfState && previewCleanup) pdfState.selectionPreviewCleanup = previewCleanup;
				}, 50);
			};
			container.addEventListener('mouseup', mouseupHandler);
			listeners.push({ el: container, type: 'mouseup', fn: mouseupHandler as EventListener });
			childListeners.set(child, listeners);
		});
	}

	// ── Commands ──
	// Nav arrow events (codemarker:label-click, codemarker:code-click) are handled
	// by the unified listeners in markdown/index.ts — no duplicate handlers needed.

	plugin.addCommand({
		id: 'undo-pdf-coding',
		name: 'Undo last PDF coding action',
		callback: () => {
			if (!model.undo()) {
				new Notice('Nothing to undo.');
			}
		},
	});

	// ── Listen for PDF views ──

	plugin.registerEvent(
		plugin.app.workspace.on('active-leaf-change', (leaf) => {
			if (!leaf) return;
			const view = leaf.view as any;
			if (view?.getViewType?.() === 'pdf' && view.viewer) {
				instrumentPdfView(view);
			}
		})
	);

	// Instrument already-open PDF views
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const view = leaf.view as any;
		if (view?.getViewType?.() === 'pdf' && view.viewer) {
			instrumentPdfView(view);
		}
	});

	// Clean up observers when leaves close
	plugin.registerEvent(
		plugin.app.workspace.on('layout-change', () => {
			cleanupOrphanedObservers();
		})
	);

	// Safety net: clean up orphaned selection preview rects when tab regains visibility
	// Only clean if no popover is open (if popover is still visible, preview should stay)
	const visibilityHandler = () => {
		if (!document.hidden && !document.querySelector('.codemarker-popover')) {
			document.querySelectorAll('.codemarker-pdf-selection-preview').forEach(el => el.remove());
		}
	};
	document.addEventListener('visibilitychange', visibilityHandler);

	// Navigate event from analytics/sidebar → open PDF and go to page
	plugin.registerEvent(
		plugin.app.workspace.on('qualia-pdf:navigate', (data: { file: string; page: number }) => {
			const tfile = plugin.app.vault.getAbstractFileByPath(data.file);
			if (!(tfile instanceof TFile)) return;

			// Reuse existing PDF leaf or open in new tab
			const pdfLeaf = plugin.app.workspace.getLeavesOfType('pdf')
				.find(l => (l.view as any).file?.path === data.file);

			if (pdfLeaf) {
				// PDF already open — scroll directly via page element instead of openFile
				// (openFile re-processes eState subpath and causes scroll overshoot on repeated clicks)
				plugin.app.workspace.setActiveLeaf(pdfLeaf, { focus: true });
				const view = pdfLeaf.view as any;
				const child = view?.viewer?.child;
				if (child) {
					try {
						const pageView = child.getPage(data.page);
						if (pageView?.div) {
							pageView.div.scrollIntoView({ block: 'start' });
						}
					} catch { /* fallback: do nothing, page is already visible */ }
					instrumentPdfView(view);
					for (const [, obs] of observers) obs.refreshAll();
				}
			} else {
				// PDF not open — open in new tab with page subpath
				const leaf = plugin.app.workspace.getLeaf('tab');
				leaf.openFile(tfile, {
					eState: { subpath: `#page=${data.page}` },
				});

				// Re-instrument and refresh after navigation — poll until viewer is ready
				let attempts = 0;
				const tryRefresh = () => {
					const view = leaf.view as any;
					if (view?.getViewType?.() === 'pdf' && view.viewer) {
						instrumentPdfView(view);
						for (const [, obs] of observers) obs.refreshAll();
					} else if (++attempts < 50) {
						setTimeout(tryRefresh, 100);
					}
				};
				setTimeout(tryRefresh, 100);
			}
		})
	);

	// File rename tracking (centralized)
	registerFileRename({
		extensions: new Set(['pdf']),
		onRename: (oldPath, newPath) => model.migrateFilePath(oldPath, newPath),
	});

	// ── Return cleanup function ──

	return {
		cleanup: () => {
			document.removeEventListener('visibilitychange', visibilityHandler);

			for (const [, observer] of observers) {
				observer.stop();
			}
			observers.clear();

			for (const [, interaction] of drawInteractions) {
				interaction.stop();
			}
			drawInteractions.clear();

			for (const [, toolbar] of drawToolbars) {
				toolbar.unmount();
			}
			drawToolbars.clear();

			for (const [child, entries] of childListeners) {
				for (const { el, type, fn } of entries) {
					el.removeEventListener(type, fn);
				}
				destroyPdfViewState(child.containerEl);
			}
			childListeners.clear();
		},
		model,
	};
}
