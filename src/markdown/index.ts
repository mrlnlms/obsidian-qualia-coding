import { MarkdownView, Modal, Notice, Setting } from 'obsidian';
import { CodeBrowserModal } from '../core/codeBrowserModal';
import { addCodeAction } from './menu/menuActions';
import type QualiaCodingPlugin from '../main';
import type { EngineRegistration } from '../core/types';
import { CodeMarkerModel } from './models/codeMarkerModel';
import { EditorView } from '@codemirror/view';
import { createMarkerStateField, updateFileMarkersEffect, setFileIdEffect, setSelectionPreviewEffect } from './cm6/markerStateField';
import { createSelectionMenuField, showCodingMenuEffect } from './cm6/selectionMenuField';
import { createMarkerViewPlugin, SELECTION_EVENT, SelectionEventDetail } from './cm6/markerViewPlugin';
import { createHoverMenuExtension } from './cm6/hoverMenuExtension';
import { createMarginPanelExtension } from './cm6/marginPanelExtension';
import { createHoverBridge } from './cm6/hoverBridge';
import { MenuController } from './menu/menuController';
import { openMenuFromEditorSelection } from './menu/menuActions';
import { CODE_EXPLORER_VIEW_TYPE } from '../core/unifiedExplorerView';
import { CODE_DETAIL_VIEW_TYPE } from '../core/unifiedDetailView';
import { clearBoard } from '../analytics/views/boardPersistence';
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
	plugin.setFileIdEffect = setFileIdEffect;
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
		// Runtime check: leaf pode existir com view stale (workspace restore, plugin reload race)
		// onde view não é a instância esperada. Sem check, view.showList() throw em runtime
		// porque o cast `as BaseCodeDetailView` é só hint TS.
		if (existing && existing.view instanceof BaseCodeDetailView) {
			existing.view.showList();
			plugin.app.workspace.revealLeaf(existing);
		} else {
			const leaf = plugin.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: CODE_DETAIL_VIEW_TYPE, active: true });
				plugin.app.workspace.revealLeaf(leaf);
			}
		}
	}

	// revealCodeDetailForCode and revealCodeDetailPanel moved to main.ts
	// (cross-engine — serve all engines, not just markdown)

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

	// Label-click and code-click listeners moved to main.ts (cross-engine)

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
			openMenuFromEditorSelection(editorView, markdownView.file.path, selection, menuController);
		},
	});

	// ── Command: Quick Code (Fuzzy) ─────────────────────────────────────
	plugin.addCommand({
		id: 'quick-code',
		name: 'Quick Code — apply code to selection',
		editorCallback: (editor, markdownView) => {
			if (!(markdownView instanceof MarkdownView)) return;
			if (!markdownView.file) return;
			const selection = editor.getSelection();
			if (!selection?.trim()) {
				new Notice('Select text first.');
				return;
			}

			const fileId = markdownView.file.path;
			const from = editor.posToOffset(editor.getCursor('from'));
			const to = editor.posToOffset(editor.getCursor('to'));

			new CodeBrowserModal(plugin.app, registry, (codeName) => {
				addCodeAction(model, { from, to, text: selection, fileId }, codeName);
				new Notice(`Applied "${codeName}"`);
			}).open();
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
				text: 'This will permanently delete ALL markers, code definitions, smart codes, and the Research Board from all sources (markdown, CSV, image, PDF, audio, video).',
			});
			new Setting(modal.contentEl)
				.addButton(btn => btn.setButtonText('Cancel').onClick(() => modal.close()))
				.addButton(btn => btn
					.setButtonText('Delete All')
					.setWarning()
					.onClick(async () => {
						registry.clear();
						// SCs ficam órfãos sem regulars pra referenciar — predicates broken.
						// Clear all = wipe analítico completo, incluindo SC definitions.
						plugin.smartCodeRegistry?.clear();
						model.clearAllMarkers();
						plugin.pdfModel?.clearAll();
						plugin.csvModel?.clearAllMarkers();
						plugin.audioModel?.clearAll();
						plugin.videoModel?.clearAll();
						// Image uses DataManager getters — clearAllSections handles it
						await plugin.dataManager.clearAllSections();
						const boardCleared = await clearBoard(plugin.app.vault.adapter);
						// Notify open views to clear live state (board canvas, image regions)
						document.dispatchEvent(new Event('qualia:clear-all'));
						if (!boardCleared) {
							new Notice('Warning: Research Board file could not be deleted. It may reappear on next open.');
						}
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
						openMenuFromEditorSelection(editorView, markdownView.file!.path, selection, menuController);
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
		openMenuFromEditorSelection(editorView, markdownView.file.path, selection, menuController);
	});

	// File rename tracking (centralized)
	registerFileRename({
		extensions: new Set(['md']),
		onRename: (oldPath, newPath) => model.migrateFilePath(oldPath, newPath),
	});

	// Cleanup (label-click and code-click cleanup now in main.ts via this.register())
	return {
		cleanup: () => {
			document.removeEventListener(SELECTION_EVENT, onSelectionEvent);
			model.flushPendingSave();
		},
		model: {
			codeMarkerModel: model,
			updateFileMarkersEffect,
		},
	};
}
