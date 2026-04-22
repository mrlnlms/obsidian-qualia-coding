/**
 * Audio engine registration — called from main.ts.
 */

import { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EngineRegistration } from '../core/types';
import { registerFileIntercept, registerFileRename } from '../core/fileInterceptor';
import { AudioCodingModel } from './audioCodingModel';
import { AudioView, AUDIO_VIEW_TYPE } from './audioView';

const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'wma', 'aiff', 'opus', 'webm']);

export { AUDIO_VIEW_TYPE };

export function registerAudioEngine(plugin: QualiaCodingPlugin): EngineRegistration<AudioCodingModel> {
	const dm = plugin.dataManager;
	const registry = plugin.sharedRegistry;

	const model = new AudioCodingModel(dm, registry);
	plugin.audioModel = model;

	// Register view type
	plugin.registerView(AUDIO_VIEW_TYPE, (leaf) =>
		new AudioView(leaf, plugin, model),
	);

	// Intercept audio file opens (via unified interceptor).
	// Note: cannot use plugin.registerExtensions() — Obsidian throws on core-native
	// extensions (mp3, wav, etc. are handled by the native audio player).
	registerFileIntercept({
		extensions: AUDIO_EXTENSIONS,
		targetViewType: AUDIO_VIEW_TYPE,
	});

	// Context menu on audio files
	const fileMenuRef = plugin.app.workspace.on('file-menu', (menu, file) => {
		if (!(file instanceof TFile)) return;
		if (!AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) return;
		menu.addItem((item) => {
			item.setTitle('Open in Audio Coding')
				.setIcon('audio-lines')
				.onClick(() => openAudioView(plugin, model, file));
		});
	});
	plugin.registerEvent(fileMenuRef);

	// Command: open current audio file
	plugin.addCommand({
		id: 'open-audio-coding',
		name: 'Open current audio in Audio Coding',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) return false;
			if (!checking) openAudioView(plugin, model, file);
			return true;
		},
	});

	// Navigate event from sidebar → seek in audio view
	const navRef = plugin.app.workspace.on('qualia-audio:navigate', (data: { file: string; seekTo: number }) => {
		openAudioAndSeek(plugin, model, data.file, data.seekTo);
	});
	plugin.registerEvent(navRef);

	// File rename tracking (centralized)
	registerFileRename({
		extensions: AUDIO_EXTENSIONS,
		onRename: (oldPath, newPath) => model.migrateFilePath(oldPath, newPath),
	});

	return {
		cleanup: () => {
			plugin.app.workspace.detachLeavesOfType(AUDIO_VIEW_TYPE);
		},
		model,
	};
}

async function openAudioView(plugin: QualiaCodingPlugin, _model: AudioCodingModel, file: TFile): Promise<void> {
	const leaves = plugin.app.workspace.getLeavesOfType(AUDIO_VIEW_TYPE);
	let leaf = leaves[0];

	if (!leaf) {
		leaf = plugin.app.workspace.getLeaf('tab');
	}

	await leaf.setViewState({
		type: AUDIO_VIEW_TYPE,
		state: { file: file.path },
	});

	plugin.app.workspace.revealLeaf(leaf);
}

async function openAudioAndSeek(plugin: QualiaCodingPlugin, _model: AudioCodingModel, filePath: string, seekTo: number): Promise<void> {
	// Find existing AudioView with this file
	const leaves = plugin.app.workspace.getLeavesOfType(AUDIO_VIEW_TYPE);
	for (const leaf of leaves) {
		const view = leaf.view as AudioView;
		if (view.file?.path === filePath) {
			plugin.app.workspace.revealLeaf(leaf);
			await view.core.waitUntilReady();
			view.renderer.seekTo(seekTo);
			view.renderer.setScrollTime(seekTo);
			return;
		}
	}

	// No existing view — open new one
	const file = plugin.app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;

	const leaf = plugin.app.workspace.getLeaf('tab');
	await leaf.setViewState({
		type: AUDIO_VIEW_TYPE,
		state: { file: filePath },
	});
	plugin.app.workspace.revealLeaf(leaf);

	const view = leaf.view as AudioView;
	await view.core.waitUntilReady();
	view.renderer.seekTo(seekTo);
	view.renderer.setScrollTime(seekTo);
}
