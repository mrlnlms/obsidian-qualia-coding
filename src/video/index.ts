/**
 * Video engine registration — called from main.ts.
 */

import { TFile, FileView, Notice } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EngineRegistration } from '../core/types';
import { registerFileIntercept, registerFileRename } from '../core/fileInterceptor';
import { performToggleCommand } from '../core/mediaToggleButton';
import { VideoCodingModel } from './videoCodingModel';
import { VideoView, VIDEO_VIEW_TYPE, VIDEO_EXTENSIONS } from './videoView';

export { VIDEO_VIEW_TYPE };

export function registerVideoEngine(plugin: QualiaCodingPlugin): EngineRegistration<VideoCodingModel> {
	const dm = plugin.dataManager;
	const registry = plugin.sharedRegistry;

	const model = new VideoCodingModel(dm, registry);
	plugin.videoModel = model;

	// Register view type
	plugin.registerView(VIDEO_VIEW_TYPE, (leaf) =>
		new VideoView(leaf, plugin, model),
	);

	// Intercept video file opens (via unified interceptor)
	registerFileIntercept({
		extensions: VIDEO_EXTENSIONS,
		targetViewType: VIDEO_VIEW_TYPE,
		shouldIntercept: () => model.settings.autoOpen,
	});

	// Context menu on video files
	const fileMenuRef = plugin.app.workspace.on('file-menu', (menu, file) => {
		if (!(file instanceof TFile)) return;
		if (!VIDEO_EXTENSIONS.has(file.extension.toLowerCase())) return;
		menu.addItem((item) => {
			item.setTitle('Toggle video coding')
				.setIcon('video')
				.onClick(() => openVideoView(plugin, file));
		});
	});
	plugin.registerEvent(fileMenuRef);

	// Command: toggle video coding view (all open video files)
	plugin.addCommand({
		id: 'toggle-video-coding',
		name: 'Toggle video coding',
		callback: () => {
			const targets: FileView[] = [];
			plugin.app.workspace.iterateAllLeaves((leaf) => {
				const v = leaf.view;
				if (v instanceof FileView
					&& v.file instanceof TFile
					&& VIDEO_EXTENSIONS.has(v.file.extension.toLowerCase())) {
					targets.push(v);
				}
			});
			if (targets.length === 0) {
				new Notice('No video file open. Open one to toggle coding.');
				return;
			}
			for (const view of targets) void performToggleCommand(plugin, view, 'video');
		},
	});

	// Navigate event from sidebar → seek in video view
	const navRef = plugin.app.workspace.on('qualia-video:navigate', (data: { file: string; seekTo: number }) => {
		openVideoAndSeek(plugin, model, data.file, data.seekTo);
	});
	plugin.registerEvent(navRef);

	// File rename tracking (centralized)
	registerFileRename({
		extensions: VIDEO_EXTENSIONS,
		onRename: (oldPath, newPath) => model.migrateFilePath(oldPath, newPath),
	});

	return {
		cleanup: () => {
			plugin.app.workspace.detachLeavesOfType(VIDEO_VIEW_TYPE);
		},
		model,
	};
}

async function openVideoView(plugin: QualiaCodingPlugin, file: TFile): Promise<void> {
	const leaves = plugin.app.workspace.getLeavesOfType(VIDEO_VIEW_TYPE);
	let leaf = leaves[0];

	if (!leaf) {
		leaf = plugin.app.workspace.getLeaf('tab');
	}

	await leaf.setViewState({
		type: VIDEO_VIEW_TYPE,
		state: { file: file.path },
	});

	plugin.app.workspace.revealLeaf(leaf);
}

async function openVideoAndSeek(plugin: QualiaCodingPlugin, _model: VideoCodingModel, filePath: string, seekTo: number): Promise<void> {
	const leaves = plugin.app.workspace.getLeavesOfType(VIDEO_VIEW_TYPE);
	for (const leaf of leaves) {
		const view = leaf.view as VideoView;
		if (view.file?.path === filePath) {
			plugin.app.workspace.revealLeaf(leaf);
			await view.core.waitUntilReady();
			view.renderer.seekTo(seekTo);
			view.renderer.setScrollTime(seekTo);
			return;
		}
	}

	const file = plugin.app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;

	const leaf = plugin.app.workspace.getLeaf('tab');
	await leaf.setViewState({
		type: VIDEO_VIEW_TYPE,
		state: { file: filePath },
	});
	plugin.app.workspace.revealLeaf(leaf);

	const view = leaf.view as VideoView;
	await view.core.waitUntilReady();
	view.renderer.seekTo(seekTo);
	view.renderer.setScrollTime(seekTo);
}
