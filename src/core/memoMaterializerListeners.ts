import { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EntityRef, MemoRecord } from './memoTypes';
import { syncFromFile } from './memoMaterializer';

/** Read MemoRecord regardless of entity type. Returns undefined if entity gone. */
function readMemo(plugin: QualiaCodingPlugin, ref: EntityRef): MemoRecord | undefined {
	if (ref.type === 'code') return plugin.sharedRegistry.getById(ref.id)?.memo;
	if (ref.type === 'group') return plugin.sharedRegistry.getGroup(ref.id)?.memo;
	return undefined;
}

/** Write memo back to registry. Used by rename/delete handlers to update materialized.path or drop it. */
function writeMemo(plugin: QualiaCodingPlugin, ref: EntityRef, memo: MemoRecord): void {
	if (ref.type === 'code') {
		plugin.sharedRegistry.update(ref.id, { memo });
		return;
	}
	if (ref.type === 'group') {
		plugin.sharedRegistry.setGroupMemo(ref.id, memo);
		return;
	}
}

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

		const memo = readMemo(plugin, ref);
		if (memo?.materialized) {
			writeMemo(plugin, ref, {
				content: memo.content,
				materialized: { path: file.path, mtime: file.stat.mtime },
			});
		}
	}));

	plugin.registerEvent(plugin.app.vault.on('delete', (file) => {
		const ref = plugin.memoReverseLookup.get(file.path);
		if (!ref) return;
		plugin.memoReverseLookup.delete(file.path);
		const memo = readMemo(plugin, ref);
		if (memo) {
			// Drop materialized; preserve content (entity volta a inline)
			writeMemo(plugin, ref, { content: memo.content });
		}
	}));
}

/**
 * Reconstrói o reverse-lookup map varrendo registry. Chamado no onload depois da migration legacy.
 * Phase 1+2: codes + groups.
 */
export function rebuildMemoReverseLookup(plugin: QualiaCodingPlugin): void {
	plugin.memoReverseLookup.clear();
	for (const def of plugin.sharedRegistry.getAll()) {
		if (def.memo?.materialized) {
			plugin.memoReverseLookup.set(def.memo.materialized.path, { type: 'code', id: def.id });
		}
	}
	for (const g of plugin.sharedRegistry.getAllGroups()) {
		if (g.memo?.materialized) {
			plugin.memoReverseLookup.set(g.memo.materialized.path, { type: 'group', id: g.id });
		}
	}
}
