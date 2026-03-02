/**
 * CSV engine registration — called from main.ts.
 */

import { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EngineCleanup } from '../core/types';
import { registerFileRename } from '../core/fileInterceptor';
import { CsvCodingModel } from './codingModel';
import { CsvCodingView, CSV_CODING_VIEW_TYPE } from './csvCodingView';

export { CSV_CODING_VIEW_TYPE };

export function registerCsvEngine(plugin: QualiaCodingPlugin): EngineCleanup {
	const dm = plugin.dataManager;
	const registry = plugin.sharedRegistry;

	const model = new CsvCodingModel(dm, registry);
	(plugin as any).csvModel = model;

	// Register view type
	plugin.registerView(CSV_CODING_VIEW_TYPE, (leaf) =>
		new CsvCodingView(leaf, plugin, model),
	);

	// Register .csv and .parquet extensions
	plugin.registerExtensions(['csv', 'parquet'], CSV_CODING_VIEW_TYPE);

	// Command: open CSV in coding view
	plugin.addCommand({
		id: 'open-csv-coding',
		name: 'Open tabular file in coding view',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			const ext = file?.extension.toLowerCase();
			if (!file || (ext !== 'csv' && ext !== 'parquet')) return false;
			if (!checking) {
				openCsvCodingView(plugin, file);
			}
			return true;
		},
	});

	// File menu: "Open in CSV Coding"
	const fileMenuRef = plugin.app.workspace.on('file-menu', (menu, file) => {
		if (!(file instanceof TFile)) return;
		const ext = file.extension.toLowerCase();
		if (ext !== 'csv' && ext !== 'parquet') return;
		menu.addItem((item) => {
			item.setTitle('Open in Tabular Coding')
				.setIcon('table')
				.onClick(() => openCsvCodingView(plugin, file));
		});
	});
	plugin.registerEvent(fileMenuRef);

	// Navigation event from sidebar
	// @ts-ignore — custom workspace event
	const navRef = plugin.app.workspace.on('qualia-csv:navigate', (data: { file: string; row: number }) => {
		const file = plugin.app.vault.getAbstractFileByPath(data.file);
		if (!(file instanceof TFile)) return;

		const leaves = plugin.app.workspace.getLeavesOfType(CSV_CODING_VIEW_TYPE);
		const existingLeaf = leaves.find(l => (l.view as CsvCodingView).file?.path === data.file);

		if (existingLeaf) {
			plugin.app.workspace.setActiveLeaf(existingLeaf);
		} else {
			openCsvCodingView(plugin, file);
		}
	});
	plugin.registerEvent(navRef);

	// Detail event from cell renderer chips
	// @ts-ignore — custom workspace event
	const detailRef = plugin.app.workspace.on('qualia-csv:detail', (data: { markerId: string; codeName: string }) => {
		// Reveal the detail sidebar with this marker
		plugin.app.workspace.trigger('qualia:reveal-detail', data);
	});
	plugin.registerEvent(detailRef);

	// File rename tracking (centralized)
	registerFileRename({
		extensions: new Set(['csv', 'parquet']),
		onRename: (oldPath, newPath) => model.migrateFilePath(oldPath, newPath),
	});

	return () => {
		plugin.app.workspace.detachLeavesOfType(CSV_CODING_VIEW_TYPE);
	};
}

async function openCsvCodingView(plugin: QualiaCodingPlugin, file: TFile): Promise<CsvCodingView | null> {
	const leaves = plugin.app.workspace.getLeavesOfType(CSV_CODING_VIEW_TYPE);
	let leaf = leaves[0];

	if (!leaf) {
		leaf = plugin.app.workspace.getLeaf('tab');
	}

	await leaf.setViewState({
		type: CSV_CODING_VIEW_TYPE,
		state: { file: file.path },
	});

	plugin.app.workspace.revealLeaf(leaf);
	return leaf.view as CsvCodingView;
}
