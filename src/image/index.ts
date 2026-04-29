/**
 * Image engine registration — called from main.ts.
 */

import { TFile, FileView, Notice } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EngineRegistration } from '../core/types';
import { registerFileIntercept, registerFileRename } from '../core/fileInterceptor';
import { performToggleCommand } from '../core/mediaToggleButton';
import { ImageCodingModel } from './imageCodingModel';
import { ImageCodingView, IMAGE_CODING_VIEW_TYPE, IMAGE_EXTENSIONS } from './views/imageView';

function collectImageTargets(plugin: QualiaCodingPlugin): { all: FileView[]; toCoding: FileView[]; toNative: FileView[] } {
	const all: FileView[] = [];
	const toCoding: FileView[] = [];
	const toNative: FileView[] = [];
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const v = leaf.view;
		if (v instanceof FileView
			&& v.file instanceof TFile
			&& IMAGE_EXTENSIONS.has(v.file.extension.toLowerCase())) {
			all.push(v);
			if (v.getViewType() === IMAGE_CODING_VIEW_TYPE) toNative.push(v);
			else toCoding.push(v);
		}
	});
	return { all, toCoding, toNative };
}

export { IMAGE_CODING_VIEW_TYPE };

export function registerImageEngine(plugin: QualiaCodingPlugin): EngineRegistration<ImageCodingModel> {
	const dm = plugin.dataManager;

	// Use shared registry from plugin (single instance for all engines)
	const registry = plugin.sharedRegistry;

	// Create model
	const model = new ImageCodingModel(dm, registry);

	// Expose on plugin instance for other modules
	plugin.imageModel = model;

	// Register view type
	plugin.registerView(IMAGE_CODING_VIEW_TYPE, (leaf) =>
		new ImageCodingView(leaf, plugin, model),
	);

	// Commands: enable/disable coding for all open image files
	plugin.addCommand({
		id: 'enable-image-coding-all',
		name: 'Enable coding for all images',
		callback: () => {
			const { all, toCoding } = collectImageTargets(plugin);
			if (all.length === 0) { new Notice('No image file open.'); return; }
			if (toCoding.length === 0) { new Notice('All images already in coding view.'); return; }
			for (const view of toCoding) void performToggleCommand(plugin, view, 'image');
		},
	});
	plugin.addCommand({
		id: 'disable-image-coding-all',
		name: 'Disable coding for all images',
		callback: () => {
			const { all, toNative } = collectImageTargets(plugin);
			if (all.length === 0) { new Notice('No image file open.'); return; }
			if (toNative.length === 0) { new Notice('All images already in native view.'); return; }
			for (const view of toNative) void performToggleCommand(plugin, view, 'image');
		},
	});


	const fileMenuRef = plugin.app.workspace.on('file-menu', (menu, file) => {
		if (!(file instanceof TFile)) return;
		if (!IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) return;
		menu.addItem((item) => {
			item.setTitle('Toggle image coding')
				.setIcon('image')
				.onClick(() => openImageCodingView(plugin, file));
		});
	});
	plugin.registerEvent(fileMenuRef);

	// Auto-open images in coding view (via unified interceptor)
	registerFileIntercept({
		extensions: IMAGE_EXTENSIONS,
		targetViewType: IMAGE_CODING_VIEW_TYPE,
		sourceViewType: 'image',
		shouldIntercept: () => model.settings.autoOpen,
	});

	// File rename tracking (centralized)
	registerFileRename({
		extensions: IMAGE_EXTENSIONS,
		onRename: (oldPath, newPath) => model.migrateFilePath(oldPath, newPath),
	});

	// Navigation event from sidebar
	const navRef = plugin.app.workspace.on('qualia-image:navigate', (data: { file: string; markerId: string }) => {
		const file = plugin.app.vault.getAbstractFileByPath(data.file);
		if (!(file instanceof TFile)) return;

		// Find or open the image coding view
		const leaves = plugin.app.workspace.getLeavesOfType(IMAGE_CODING_VIEW_TYPE);
		const existingLeaf = leaves.find(l => (l.view as ImageCodingView).file?.path === data.file);

		if (existingLeaf) {
			plugin.app.workspace.setActiveLeaf(existingLeaf);
			(existingLeaf.view as ImageCodingView).highlightRegion(data.markerId);
		} else {
			openImageCodingView(plugin, file).then(async (view) => {
				if (view) {
					await view.waitUntilReady();
					view.highlightRegion(data.markerId);
				}
			});
		}
	});
	plugin.registerEvent(navRef);

	return {
		cleanup: () => {
			plugin.app.workspace.detachLeavesOfType(IMAGE_CODING_VIEW_TYPE);
		},
		model,
	};
}

async function openImageCodingView(plugin: QualiaCodingPlugin, file: TFile): Promise<ImageCodingView | null> {
	// Try to reuse existing leaf
	const leaves = plugin.app.workspace.getLeavesOfType(IMAGE_CODING_VIEW_TYPE);
	let leaf = leaves[0];

	if (!leaf) {
		leaf = plugin.app.workspace.getLeaf('tab');
	}

	await leaf.setViewState({
		type: IMAGE_CODING_VIEW_TYPE,
		state: { file: file.path },
	});

	plugin.app.workspace.revealLeaf(leaf);
	return leaf.view as ImageCodingView;
}
