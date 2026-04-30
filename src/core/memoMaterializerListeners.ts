import { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { syncFromFile } from './memoMaterializer';

export function registerMemoListeners(plugin: QualiaCodingPlugin): void {
	plugin.registerEvent(plugin.app.vault.on('modify', (file) => {
		if (!(file instanceof TFile)) return;
		if (plugin.memoSelfWriting.has(file.path)) return;
		if (!plugin.memoReverseLookup.has(file.path)) return;
		void syncFromFile(plugin, file);
	}));

	plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => {
		if (!(file instanceof TFile)) return;
		const ref = plugin.memoReverseLookup.get(oldPath);
		if (!ref) return;
		plugin.memoReverseLookup.delete(oldPath);
		plugin.memoReverseLookup.set(file.path, ref);

		if (ref.type === 'code') {
			const def = plugin.sharedRegistry.getById(ref.id);
			if (def?.memo?.materialized) {
				plugin.sharedRegistry.update(ref.id, {
					memo: {
						content: def.memo.content,
						materialized: { path: file.path, mtime: file.stat.mtime },
					},
				});
			}
		}
	}));

	plugin.registerEvent(plugin.app.vault.on('delete', (file) => {
		const ref = plugin.memoReverseLookup.get(file.path);
		if (!ref) return;
		plugin.memoReverseLookup.delete(file.path);
		if (ref.type === 'code') {
			const def = plugin.sharedRegistry.getById(ref.id);
			if (def?.memo) {
				plugin.sharedRegistry.update(ref.id, {
					memo: { content: def.memo.content },
				});
			}
		}
	}));
}

/**
 * Reconstrói o reverse-lookup map varrendo registry.
 * Chamado no onload depois da migration legacy.
 */
export function rebuildMemoReverseLookup(plugin: QualiaCodingPlugin): void {
	plugin.memoReverseLookup.clear();
	for (const def of plugin.sharedRegistry.getAll()) {
		if (def.memo?.materialized) {
			plugin.memoReverseLookup.set(def.memo.materialized.path, { type: 'code', id: def.id });
		}
	}
}
