import { App, MarkdownView, TFile } from 'obsidian';
import { isPdfMarker, isImageMarker, isCsvMarker, isAudioMarker, isVideoMarker } from './markerResolvers';
import type { BaseMarker } from './types';
import type { CodeMarkerModel, Marker } from '../markdown/models/codeMarkerModel';

/** Espera mínima após openFile pra editor montar antes de setCursor/scrollIntoView. Mesma latência
 *  usada em textRetrievalMode (analytics) — caminho validado em runtime. */
const EDITOR_READY_MS = 200;

/** Duração do flash hover pós-navigate ("encontrei aqui"). Reusa o canal hover do model
 *  → CM6 hoverBridge dispara o mesmo decoration de hover real, sem abrir menu. */
const NAVIGATE_FLASH_MS = 1500;

/**
 * Navigation engine-aware: dispara workspace event pra engines binárias (PDF/Image/CSV/Audio/Video)
 * — cada engine listener faz seek/scroll/page. Pra markdown, abre o file (se necessário) e usa
 * Obsidian Editor API (setCursor + scrollIntoView) pra posicionar.
 *
 * Compartilhada entre UnifiedCodeExplorerView, UnifiedCodeDetailView e SmartCodeListModal.
 */
export async function navigateToMarker(
	app: App,
	marker: BaseMarker,
	mdModel: CodeMarkerModel | null,
): Promise<void> {
	if (isPdfMarker(marker)) {
		app.workspace.trigger('qualia-pdf:navigate', {
			file: marker.fileId,
			page: marker.page,
		});
		return;
	}
	if (isImageMarker(marker)) {
		app.workspace.trigger('qualia-image:navigate', {
			file: marker.fileId,
			markerId: marker.id,
		});
		return;
	}
	if (isCsvMarker(marker)) {
		app.workspace.trigger('qualia-csv:navigate', {
			file: marker.fileId,
			row: marker.rowIndex,
			column: marker.columnId,
		});
		return;
	}
	if (isAudioMarker(marker)) {
		app.workspace.trigger('qualia-audio:navigate', {
			file: marker.fileId,
			seekTo: marker.startTime,
		});
		return;
	}
	if (isVideoMarker(marker)) {
		app.workspace.trigger('qualia-video:navigate', {
			file: marker.fileId,
			seekTo: marker.startTime,
		});
		return;
	}
	// Markdown
	const md = marker as Marker;
	if (!mdModel) return;

	const existingView = mdModel.getViewForFile(md.fileId);
	const fileAlreadyOpen = !!existingView?.editor;

	let view: MarkdownView | null = existingView ?? null;
	if (!fileAlreadyOpen) {
		const file = app.vault.getAbstractFileByPath(md.fileId);
		if (!(file instanceof TFile)) return;
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(file);
		view = leaf.view instanceof MarkdownView ? leaf.view : null;
	}
	if (!view?.editor) return;

	const target = view;
	const apply = () => {
		if (!target.editor) return;
		target.editor.setCursor(md.range.from);
		target.editor.scrollIntoView({ from: md.range.from, to: md.range.to }, true);
		app.workspace.setActiveLeaf(target.leaf, { focus: true });
		// Flash hover pra sinalizar visualmente o segmento — reusa o canal de hover real
		// (hoverBridge dispatch → setHoverEffect StateField → decoration). Sem menu.
		mdModel.setHoverState(md.id, null, [md.id]);
		setTimeout(() => {
			if (mdModel.getHoverMarkerId() === md.id) mdModel.setHoverState(null, null, []);
		}, NAVIGATE_FLASH_MS);
	};

	if (fileAlreadyOpen) apply();
	else setTimeout(apply, EDITOR_READY_MS);
}
