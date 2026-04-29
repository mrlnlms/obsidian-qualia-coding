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

function collectVideoTargets(plugin: QualiaCodingPlugin): { all: FileView[]; toCoding: FileView[]; toNative: FileView[] } {
	const all: FileView[] = [];
	const toCoding: FileView[] = [];
	const toNative: FileView[] = [];
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const v = leaf.view;
		if (v instanceof FileView
			&& v.file instanceof TFile
			&& VIDEO_EXTENSIONS.has(v.file.extension.toLowerCase())) {
			all.push(v);
			if (v.getViewType() === VIDEO_VIEW_TYPE) toNative.push(v);
			else toCoding.push(v);
		}
	});
	return { all, toCoding, toNative };
}

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

	// Commands: enable/disable coding for all open video files
	plugin.addCommand({
		id: 'enable-video-coding-all',
		name: 'Enable coding for all videos',
		callback: () => {
			const { all, toCoding } = collectVideoTargets(plugin);
			if (all.length === 0) { new Notice('No video file open.'); return; }
			if (toCoding.length === 0) { new Notice('All videos already in coding view.'); return; }
			plugin.dataManager.section('video').settings.autoOpen = true;
			plugin.dataManager.markDirty();
			for (const view of toCoding) void performToggleCommand(plugin, view, 'video');
		},
	});
	plugin.addCommand({
		id: 'disable-video-coding-all',
		name: 'Disable coding for all videos',
		callback: () => {
			const { all, toNative } = collectVideoTargets(plugin);
			if (all.length === 0) { new Notice('No video file open.'); return; }
			if (toNative.length === 0) { new Notice('All videos already in native view.'); return; }
			plugin.dataManager.section('video').settings.autoOpen = false;
			plugin.dataManager.markDirty();
			for (const view of toNative) void performToggleCommand(plugin, view, 'video');
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
