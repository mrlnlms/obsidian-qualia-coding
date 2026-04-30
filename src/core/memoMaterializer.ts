import type { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EntityRef } from './memoTypes';
import { entityRefToString } from './memoTypes';
import { getMemoContent } from './memoHelpers';
import { resolveConflictPath, sanitizeFilename } from './memoPathResolver';
import { serializeMemoNote, parseMemoNote } from './memoNoteFormat';

/**
 * Cria .md materializado pra entity, popula `materialized` no data.json, abre em nova aba.
 * Phase 1: só funciona pra ref.type === 'code'.
 */
export async function convertMemoToNote(plugin: QualiaCodingPlugin, ref: EntityRef): Promise<TFile> {
	if (ref.type !== 'code') throw new Error('Phase 1: only code refs supported');
	const def = plugin.sharedRegistry.getById(ref.id);
	if (!def) throw new Error(`Code not found: ${ref.id}`);

	const folder = plugin.dataManager.section('general').memoFolders.code;
	const filename = sanitizeFilename(def.name) + '.md';
	const basePath = `${folder}/${filename}`.replace(/\/+/g, '/');

	const finalPath = await resolveConflictPath(plugin.app.vault, basePath);

	const folderPath = finalPath.slice(0, finalPath.lastIndexOf('/'));
	if (folderPath && !(await plugin.app.vault.adapter.exists(folderPath))) {
		await plugin.app.vault.createFolder(folderPath);
	}

	const content = getMemoContent(def.memo);
	const text = serializeMemoNote(ref, def.name, content);

	plugin.memoSelfWriting.add(finalPath);
	const file = await plugin.app.vault.create(finalPath, text);
	queueMicrotask(() => plugin.memoSelfWriting.delete(finalPath));

	plugin.sharedRegistry.update(ref.id, {
		memo: { content, materialized: { path: finalPath, mtime: file.stat.mtime } },
	});

	plugin.memoReverseLookup.set(finalPath, ref);

	plugin.app.workspace.getLeaf('tab').openFile(file);

	return file;
}

/**
 * Remove `materialized` da entidade. Conteúdo permanece preservado em `content` —
 * entidade volta automático pra modo inline. O .md órfão fica no vault; user decide.
 */
export function unmaterialize(plugin: QualiaCodingPlugin, ref: EntityRef): void {
	if (ref.type !== 'code') throw new Error('Phase 1: only code refs');
	const def = plugin.sharedRegistry.getById(ref.id);
	if (!def?.memo?.materialized) return;

	plugin.memoReverseLookup.delete(def.memo.materialized.path);

	plugin.sharedRegistry.update(ref.id, {
		memo: { content: def.memo.content },
	});
}

/**
 * Lê .md modificado externamente, atualiza data.json. Chamado pelo modify listener.
 * Frontmatter quebrado/removido → desfaz materialization graciosamente (entidade volta a inline).
 * Frontmatter aponta pra ref diferente → no-op com warning (spec D7).
 */
export async function syncFromFile(plugin: QualiaCodingPlugin, file: TFile): Promise<void> {
	const ref = plugin.memoReverseLookup.get(file.path);
	if (!ref) return;
	if (ref.type !== 'code') return;

	const text = await plugin.app.vault.read(file);
	const parsed = parseMemoNote(text);

	if (!parsed) {
		unmaterialize(plugin, ref);
		return;
	}

	if (entityRefToString(parsed.ref) !== entityRefToString(ref)) {
		console.warn('[qualia] memo frontmatter ref mismatch, ignoring change', { expected: ref, got: parsed.ref });
		return;
	}

	plugin.sharedRegistry.update(ref.id, {
		memo: { content: parsed.content, materialized: { path: file.path, mtime: file.stat.mtime } },
	});
}
