import { FileView, TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { resolveToggleTarget, isMediaViewType, type MediaKind } from './viewToggleHelpers';
import { markLeafHandled } from './fileInterceptor';

let INJECTED_ACTIONS = new WeakMap<FileView, HTMLElement>();
const TRACKED_VIEWS = new Set<FileView>();

function tryInject(plugin: QualiaCodingPlugin, view: FileView): void {
	if (INJECTED_ACTIONS.has(view)) return;
	const kind = isMediaViewType(view.getViewType());
	if (!kind) return;
	const settings = getSettingsForKind(plugin, kind);
	if (!settings.showButton) return;

	const action = view.addAction('replace-all', tooltipFor(kind, view.getViewType()), () => {
		void performToggleCommand(plugin, view, kind);
	});
	INJECTED_ACTIONS.set(view, action);
	TRACKED_VIEWS.add(view);
}

function tryRemove(view: FileView): void {
	const action = INJECTED_ACTIONS.get(view);
	if (!action) return;
	action.detach();
	INJECTED_ACTIONS.delete(view);
	TRACKED_VIEWS.delete(view);
}

/**
 * Install a workspace listener that injects a "toggle coding view" action into
 * the header of any Image/Audio/Video/PDF view (native or coding) when it becomes
 * active, respecting each media's `showButton` setting.
 */
export function setupMediaToggleButton(plugin: QualiaCodingPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('active-leaf-change', (leaf) => {
			if (!leaf || !(leaf.view instanceof FileView)) return;
			tryInject(plugin, leaf.view);
		}),
	);

	// Bootstrap: inject into already-open media views on plugin load
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		if (leaf.view instanceof FileView) tryInject(plugin, leaf.view);
	});
}

/**
 * Re-evaluate the showButton setting for all open media views, injecting or
 * removing the toggle action as needed. Call from the settings tab when the
 * user flips `showButton` for any media kind.
 */
export function refreshMediaToggleButtons(plugin: QualiaCodingPlugin): void {
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const view = leaf.view;
		if (!(view instanceof FileView)) return;
		const kind = isMediaViewType(view.getViewType());
		if (!kind) return;
		const settings = getSettingsForKind(plugin, kind);
		if (settings.showButton) tryInject(plugin, view);
		else tryRemove(view);
	});
}

/**
 * Tear down all injected toggle actions and reset module state. Call from
 * `plugin.onunload()` — without this, hot-reload leaves stale entries in the
 * module-scope WeakMap, and the re-enabled plugin skips re-injection because
 * `has(view)` is still true for views that Obsidian cleared from the DOM.
 */
export function teardownMediaToggleButtons(): void {
	for (const view of TRACKED_VIEWS) {
		const action = INJECTED_ACTIONS.get(view);
		action?.detach();
	}
	TRACKED_VIEWS.clear();
	INJECTED_ACTIONS = new WeakMap<FileView, HTMLElement>();
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
	// Pin this (leaf, file) so the intercept respects the manual swap. The pin
	// auto-releases if the user opens a different file in the same leaf.
	markLeafHandled(leaf, file.path);
	await leaf.setViewState({ type: target, state: { file: file.path } });
	plugin.app.workspace.revealLeaf(leaf);
}
