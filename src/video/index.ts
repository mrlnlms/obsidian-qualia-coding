/**
 * Video engine registration — called from main.ts.
 */

import { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EngineRegistration } from '../core/types';
import { registerFileIntercept, registerFileRename } from '../core/fileInterceptor';
import { VideoCodingModel } from './videoCodingModel';
import { VideoView, VIDEO_VIEW_TYPE } from './videoView';

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv']);

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
	});

	// Context menu on video files
	const fileMenuRef = plugin.app.workspace.on('file-menu', (menu, file) => {
		if (!(file instanceof TFile)) return;
		if (!VIDEO_EXTENSIONS.has(file.extension.toLowerCase())) return;
		menu.addItem((item) => {
			item.setTitle('Open in Video Coding')
				.setIcon('video')
				.onClick(() => openVideoView(plugin, file));
		});
	});
	plugin.registerEvent(fileMenuRef);

	// Command: open current video file
	plugin.addCommand({
		id: 'open-video-coding',
		name: 'Open current video in Video Coding',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !VIDEO_EXTENSIONS.has(file.extension.toLowerCase())) return false;
			if (!checking) openVideoView(plugin, file);
			return true;
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
		const state = view.getState();
		if (state.file === filePath) {
			plugin.app.workspace.revealLeaf(leaf);
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
	view.renderer.on('ready', () => {
		view.renderer.seekTo(seekTo);
		view.renderer.setScrollTime(seekTo);
	});
}
