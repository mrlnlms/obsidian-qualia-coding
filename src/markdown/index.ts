import { MarkdownView, Modal, Setting } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EngineRegistration } from '../core/types';
import { CodeMarkerModel } from './models/codeMarkerModel';
import { EditorView } from '@codemirror/view';
import { createMarkerStateField, updateFileMarkersEffect, setSelectionPreviewEffect } from './cm6/markerStateField';
import { createSelectionMenuField, showCodingMenuEffect } from './cm6/selectionMenuField';
import { createMarkerViewPlugin, SELECTION_EVENT, SelectionEventDetail } from './cm6/markerViewPlugin';
import { createHoverMenuExtension } from './cm6/hoverMenuExtension';
import { createMarginPanelExtension } from './cm6/marginPanelExtension';
import { createHoverBridge } from './cm6/hoverBridge';
import { MenuController } from './menu/menuController';
import { CODE_EXPLORER_VIEW_TYPE } from '../core/unifiedExplorerView';
import { CODE_DETAIL_VIEW_TYPE } from '../core/unifiedDetailView';
import { BaseCodeDetailView } from '../core/baseCodeDetailView';
import { registerFileRename } from '../core/fileInterceptor';

export interface MarkdownEngineModel {
	codeMarkerModel: CodeMarkerModel;
	updateFileMarkersEffect: typeof updateFileMarkersEffect;
}

export function registerMarkdownEngine(plugin: QualiaCodingPlugin): EngineRegistration<MarkdownEngineModel> {
	// Use shared registry from plugin (single instance for all engines)
	const registry = plugin.sharedRegistry;

	// Create model
	const model = new CodeMarkerModel(plugin, registry);
	model.loadMarkers();

	// Expose model + effect on plugin for settings tab and cross-engine access
	plugin.updateFileMarkersEffect = updateFileMarkersEffect;
	plugin.markdownModel = model;

	// Create menu controller
	const menuController = new MenuController(model);

	// Register CM6 extensions
	// markerViewPlugin handles fileId detection (replaces the old fileIdSync listener)
	plugin.registerEditorExtension([
		createMarkerStateField(model),
		createSelectionMenuField(model),
		createMarkerViewPlugin(model),
		createHoverMenuExtension(model),
		createMarginPanelExtension(model),
		createHoverBridge(model),
	]);

	// ── Reveal functions ────────────────────────────────────────────────
	// Views are registered in main.ts (unified across all engines)

	async function activateCodeExplorer() {
		const leaves = plugin.app.workspace.getLeavesOfType(CODE_EXPLORER_VIEW_TYPE);
		const existing = leaves[0];
		if (existing) {
			plugin.app.workspace.revealLeaf(existing);
			return;
		}
		const leaf = plugin.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: CODE_EXPLORER_VIEW_TYPE, active: true });
			plugin.app.workspace.revealLeaf(leaf);
		}
	}

	async function revealCodeExplorer() {
		const leaves = plugin.app.workspace.getLeavesOfType(CODE_DETAIL_VIEW_TYPE);
		const existing = leaves[0];
		if (existing) {
			const view = existing.view as BaseCodeDetailView;
			view.showList();
			plugin.app.workspace.revealLeaf(existing);
		} else {
			const leaf = plugin.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: CODE_DETAIL_VIEW_TYPE, active: true });
				plugin.app.workspace.revealLeaf(leaf);
			}
		}
	}

	async function revealCodeDetailForCode(codeName: string) {
		const leaves = plugin.app.workspace.getLeavesOfType(CODE_DETAIL_VIEW_TYPE);
		const existing = leaves[0];
		if (existing) {
			const view = existing.view as BaseCodeDetailView;
			view.showCodeDetail(codeName);
			plugin.app.workspace.revealLeaf(existing);
		} else {
			const leaf = plugin.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: CODE_DETAIL_VIEW_TYPE, active: true });
				const view = leaf.view as BaseCodeDetailView;
				view.showCodeDetail(codeName);
				plugin.app.workspace.revealLeaf(leaf);
			}
		}
	}

	async function revealCodeDetailPanel(markerId: string, codeName: string) {
		const leaves = plugin.app.workspace.getLeavesOfType(CODE_DETAIL_VIEW_TYPE);
		const existing = leaves[0];
		if (existing) {
			const view = existing.view as BaseCodeDetailView;
			view.setContext(markerId, codeName);
			plugin.app.workspace.revealLeaf(existing);
		} else {
			const leaf = plugin.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: CODE_DETAIL_VIEW_TYPE, active: true });
				const view = leaf.view as BaseCodeDetailView;
				view.setContext(markerId, codeName);
				plugin.app.workspace.revealLeaf(leaf);
			}
		}
	}

	// ── SELECTION_EVENT listener: auto-open menu on text selection ────────
	const onSelectionEvent = (evt: Event) => {
		const detail = (evt as CustomEvent<SelectionEventDetail>).detail;
		if (!detail) return;

		const { from, to, text, fileId, editorView, mouseX, mouseY } = detail;

		const snapshot = {
			from,
			to,
			text,
			fileId,
		};

		// Dispatch selection preview
		editorView.dispatch({
			effects: setSelectionPreviewEffect.of({ from, to })
		});

		menuController.openMenu(editorView, snapshot, {
			x: mouseX,
			y: mouseY,
		});
	};
	document.addEventListener(SELECTION_EVENT, onSelectionEvent);

	// ── Label-click listener: margin panel → Code Detail sidebar ─────────
	const onLabelClick = (evt: Event) => {
		const detail = (evt as CustomEvent<{ markerId: string; codeName: string }>).detail;
		if (!detail?.markerId || !detail?.codeName) return;
		revealCodeDetailPanel(detail.markerId, detail.codeName);
	};
	document.addEventListener('codemarker:label-click', onLabelClick);

	// ── Code-click listener: hover menu → Code Detail sidebar (code-focused) ──
	const onCodeClick = (evt: Event) => {
		const detail = (evt as CustomEvent<{ codeName: string }>).detail;
		if (!detail?.codeName) return;
		revealCodeDetailForCode(detail.codeName);
	};
	document.addEventListener('codemarker:code-click', onCodeClick);

	// ── Command: Code Selection (Cmd+Shift+C) ────────────────────────────
	plugin.addCommand({
		id: 'create-code-marker',
		name: 'Code Selection',
		editorCallback: (editor, markdownView) => {
			if (!(markdownView instanceof MarkdownView)) return;
			if (!markdownView.file) return;

			const selection = editor.getSelection();
			if (!selection?.trim()) return;

			const editorView = editor.cm;
			if (!editorView) return;

			const sel = editorView.state.selection.main;
			const snapshot = {
				from: sel.from,
				to: sel.to,
				text: selection,
				fileId: markdownView.file.path,
			};

			// Dispatch selection preview before opening menu
			editorView.dispatch({
				effects: setSelectionPreviewEffect.of({ from: sel.from, to: sel.to })
			});

			const coords = editorView.coordsAtPos(sel.from);
			menuController.openMenu(editorView, snapshot, {
				x: coords?.left ?? 0,
				y: coords?.top ?? 0,
			});
		},
	});

	// ── Command: Open Code Explorer ─────────────────────────────────────
	plugin.addCommand({
		id: 'open-code-explorer',
		name: 'Open Code Explorer',
		callback: () => activateCodeExplorer(),
	});

	// ── Command: Open Code Detail ──────────────────────────────────────
	plugin.addCommand({
		id: 'open-code-detail',
		name: 'Open Code Detail',
		callback: () => revealCodeExplorer(),
	});

	// ── Command: Clear All Markers ──────────────────────────────────────
	plugin.addCommand({
		id: 'clear-all-markers',
		name: 'Clear All Markers',
		callback: () => {
			const modal = new Modal(plugin.app);
			modal.titleEl.setText('Clear All Markers');
			modal.contentEl.createEl('p', {
				text: 'This will permanently delete ALL markers and code definitions from all sources (markdown, CSV, image, PDF, audio, video).',
			});
			new Setting(modal.contentEl)
				.addButton(btn => btn.setButtonText('Cancel').onClick(() => modal.close()))
				.addButton(btn => btn
					.setButtonText('Delete All')
					.setWarning()
					.onClick(async () => {
						registry.clear();
						model.clearAllMarkers();
						await plugin.dataManager.clearAllSections();
						modal.close();
					}));
			modal.open();
		},
	});

	// ── Right-click context menu ─────────────────────────────────────────
	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, editor, markdownView) => {
			if (!model.getSettings().showMenuOnRightClick) return;
			if (!(markdownView instanceof MarkdownView)) return;
			if (!markdownView.file) return;

			const selection = editor.getSelection();
			if (!selection?.trim()) return;

			menu.addItem((item) => {
				item.setTitle('Code Selection')
					.setIcon('code')
					.onClick(() => {
						const editorView = editor.cm;
						if (!editorView) return;

						const sel = editorView.state.selection.main;
						const snapshot = {
							from: sel.from,
							to: sel.to,
							text: selection,
							fileId: markdownView.file!.path,
						};

						editorView.dispatch({
							effects: setSelectionPreviewEffect.of({ from: sel.from, to: sel.to })
						});

						const coords = editorView.coordsAtPos(sel.from);
						menuController.openMenu(editorView, snapshot, {
							x: coords?.left ?? 0,
							y: coords?.top ?? 0,
						});
					});
			});
		})
	);

	// ── Ribbon button ────────────────────────────────────────────────────
	plugin.addRibbonIcon('highlighter', 'Code Selection', () => {
		if (!model.getSettings().showRibbonButton) return;
		const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView?.file) return;

		const editor = markdownView.editor;
		const selection = editor.getSelection();
		if (!selection?.trim()) return;

		const editorView = editor.cm;
		if (!editorView) return;

		const sel = editorView.state.selection.main;
		const snapshot = {
			from: sel.from,
			to: sel.to,
			text: selection,
			fileId: markdownView.file.path,
		};

		editorView.dispatch({
			effects: setSelectionPreviewEffect.of({ from: sel.from, to: sel.to })
		});

		const coords = editorView.coordsAtPos(sel.from);
		menuController.openMenu(editorView, snapshot, {
			x: coords?.left ?? 0,
			y: coords?.top ?? 0,
		});
	});

	// File rename tracking (centralized)
	registerFileRename({
		extensions: new Set(['md']),
		onRename: (oldPath, newPath) => model.migrateFilePath(oldPath, newPath),
	});

	// Cleanup
	return {
		cleanup: () => {
			document.removeEventListener(SELECTION_EVENT, onSelectionEvent);
			document.removeEventListener('codemarker:label-click', onLabelClick);
			document.removeEventListener('codemarker:code-click', onCodeClick);
			model.flushPendingSave();
		},
		model: {
			codeMarkerModel: model,
			updateFileMarkersEffect,
		},
	};
}
