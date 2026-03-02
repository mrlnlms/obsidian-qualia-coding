/**
 * Image engine registration — called from main.ts.
 */

import { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EngineCleanup } from '../core/types';
import { registerFileIntercept, registerFileRename } from '../core/fileInterceptor';
import { ImageCodingModel } from './models/codingModel';
import { ImageCodingView, IMAGE_CODING_VIEW_TYPE } from './views/imageView';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'avif', 'svg']);

export { IMAGE_CODING_VIEW_TYPE };

export function registerImageEngine(plugin: QualiaCodingPlugin): EngineCleanup {
	const dm = plugin.dataManager;

	// Use shared registry from plugin (single instance for all engines)
	const registry = plugin.sharedRegistry;

	// Create model
	const model = new ImageCodingModel(dm, registry);

	// Expose on plugin instance for other modules
	(plugin as any).imageModel = model;

	// Register view type
	plugin.registerView(IMAGE_CODING_VIEW_TYPE, (leaf) =>
		new ImageCodingView(leaf, plugin, model),
	);

	// Command: open image in coding view
	plugin.addCommand({
		id: 'open-image-coding',
		name: 'Open image in coding view',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) return false;
			if (!checking) {
				openImageCodingView(plugin, file);
			}
			return true;
		},
	});

	// File menu: "Open in Image Coding"
	const fileMenuRef = plugin.app.workspace.on('file-menu', (menu, file) => {
		if (!(file instanceof TFile)) return;
		if (!IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) return;
		menu.addItem((item) => {
			item.setTitle('Open in Image Coding')
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
		shouldIntercept: () => model.settings.autoOpenImages,
	});

	// File rename tracking (centralized)
	registerFileRename({
		extensions: IMAGE_EXTENSIONS,
		onRename: (oldPath, newPath) => model.migrateFilePath(oldPath, newPath),
	});

	// Navigation event from sidebar
	// @ts-ignore — custom workspace event
	const navRef = plugin.app.workspace.on('qualia-image:navigate', (data: { file: string; markerId: string }) => {
		const file = plugin.app.vault.getAbstractFileByPath(data.file);
		if (!(file instanceof TFile)) return;

		// Find or open the image coding view
		const leaves = plugin.app.workspace.getLeavesOfType(IMAGE_CODING_VIEW_TYPE);
		const existingLeaf = leaves.find(l => (l.view as ImageCodingView).getState().file === data.file);

		if (existingLeaf) {
			plugin.app.workspace.setActiveLeaf(existingLeaf);
			(existingLeaf.view as ImageCodingView).highlightRegion(data.markerId);
		} else {
			openImageCodingView(plugin, file).then((view) => {
				if (view) {
					setTimeout(() => view.highlightRegion(data.markerId), 200);
				}
			});
		}
	});
	plugin.registerEvent(navRef);

	return () => {
		plugin.app.workspace.detachLeavesOfType(IMAGE_CODING_VIEW_TYPE);
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
