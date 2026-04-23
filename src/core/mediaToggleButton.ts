import { FileView, TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { resolveToggleTarget, isMediaViewType, type MediaKind } from './viewToggleHelpers';

const INJECTED = new WeakSet<FileView>();

/**
 * Install a workspace listener that injects a "toggle coding view" action into
 * the header of any Image/Audio/Video/PDF view (native or coding) when it becomes
 * active, respecting each media's `showButton` setting.
 */
export function setupMediaToggleButton(plugin: QualiaCodingPlugin): void {
	const tryInject = (view: FileView) => {
		if (INJECTED.has(view)) return;
		const kind = isMediaViewType(view.getViewType());
		if (!kind) return;
		const settings = getSettingsForKind(plugin, kind);
		if (!settings.showButton) return;

		view.addAction('replace-all', tooltipFor(kind, view.getViewType()), () => {
			void performToggleCommand(plugin, view, kind);
		});
		INJECTED.add(view);
	};

	plugin.registerEvent(
		plugin.app.workspace.on('active-leaf-change', (leaf) => {
			if (!leaf || !(leaf.view instanceof FileView)) return;
			tryInject(leaf.view);
		}),
	);

	// Bootstrap: inject into already-open media views on plugin load
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		if (leaf.view instanceof FileView) tryInject(leaf.view);
	});
}

function getSettingsForKind(plugin: QualiaCodingPlugin, kind: MediaKind): { showButton: boolean; autoOpen: boolean } {
	switch (kind) {
		case 'image': return plugin.dataManager.section('image').settings;
		case 'audio': return plugin.dataManager.section('audio').settings;
		case 'video': return plugin.dataManager.section('video').settings;
		case 'pdf':   return plugin.dataManager.section('pdf').settings;
	}
}

function tooltipFor(kind: MediaKind, currentViewType: string): string {
	if (kind === 'pdf') return 'Toggle PDF coding';
	const label = kind.charAt(0).toUpperCase() + kind.slice(1);
	const isCodingView = currentViewType !== kind;
	return isCodingView ? `Switch to native ${kind} view` : `Switch to ${label} coding view`;
}

export async function performToggleCommand(plugin: QualiaCodingPlugin, view: FileView, kind: MediaKind): Promise<void> {
	const file = view.file;
	if (!(file instanceof TFile)) return;

	if (kind === 'pdf') {
		const settings = plugin.dataManager.section('pdf').settings;
		settings.autoOpen = !settings.autoOpen;
		plugin.dataManager.markDirty();
		plugin.togglePdfInstrumentation?.(view);
		return;
	}

	const target = resolveToggleTarget(view.getViewType(), kind);
	if (!target) return;

	const openInNewTab = plugin.dataManager.section('general').openToggleInNewTab;
	const leaf = openInNewTab ? plugin.app.workspace.getLeaf('tab') : view.leaf;
	await leaf.setViewState({ type: target, state: { file: file.path } });
	plugin.app.workspace.revealLeaf(leaf);
}
