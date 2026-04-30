import type { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EntityRef, MaterializedRef, MemoRecord } from './memoTypes';
import { entityRefToString } from './memoTypes';
import { getMemoContent } from './memoHelpers';
import { resolveConflictPath, sanitizeFilename } from './memoPathResolver';
import { serializeMemoNote, parseMemoNote } from './memoNoteFormat';

/**
 * Resolve a entidade-alvo da ref pra obter `name` (filename) + `content` atual do memo.
 * Phase 1+2: code, group. Phase futuro: marker, relation-code, relation-app.
 */
function resolveEntity(plugin: QualiaCodingPlugin, ref: EntityRef): { name: string; content: string } {
	if (ref.type === 'code') {
		const def = plugin.sharedRegistry.getById(ref.id);
		if (!def) throw new Error(`Code not found: ${ref.id}`);
		return { name: def.name, content: getMemoContent(def.memo) };
	}
	if (ref.type === 'group') {
		const g = plugin.sharedRegistry.getGroup(ref.id);
		if (!g) throw new Error(`Group not found: ${ref.id}`);
		return { name: g.name, content: getMemoContent(g.memo) };
	}
	throw new Error(`Phase 2: ref type '${ref.type}' not yet supported`);
}

/** Folder configurado em settings, por tipo. */
function resolveFolder(plugin: QualiaCodingPlugin, ref: EntityRef): string {
	const folders = plugin.dataManager.section('general').memoFolders;
	if (ref.type === 'code') return folders.code;
	if (ref.type === 'group') return folders.group;
	throw new Error(`Phase 2: ref type '${ref.type}' not yet supported`);
}

/** Read current MemoRecord from registry, agnostic to entity type. */
function readMemoRecord(plugin: QualiaCodingPlugin, ref: EntityRef): MemoRecord | undefined {
	if (ref.type === 'code') return plugin.sharedRegistry.getById(ref.id)?.memo;
	if (ref.type === 'group') return plugin.sharedRegistry.getGroup(ref.id)?.memo;
	throw new Error(`Phase 2: ref type '${ref.type}' not yet supported`);
}

/** Persiste o memo atualizado (com ou sem materialized) no registry, agnostic to entity type. */
function writeMemo(plugin: QualiaCodingPlugin, ref: EntityRef, content: string, materialized?: MaterializedRef): void {
	const memo: MemoRecord = materialized ? { content, materialized } : { content };
	if (ref.type === 'code') {
		plugin.sharedRegistry.update(ref.id, { memo });
		return;
	}
	if (ref.type === 'group') {
		plugin.sharedRegistry.setGroupMemo(ref.id, memo);
		return;
	}
	throw new Error(`Phase 2: ref type '${ref.type}' not yet supported`);
}

/**
 * Cria .md materializado pra entity, popula `materialized` no data.json, abre em nova aba.
 * Phase 1+2: code, group.
 */
export async function convertMemoToNote(plugin: QualiaCodingPlugin, ref: EntityRef): Promise<TFile> {
	const { name, content } = resolveEntity(plugin, ref);
	const folder = resolveFolder(plugin, ref);
	const filename = sanitizeFilename(name) + '.md';
	const basePath = `${folder}/${filename}`.replace(/\/+/g, '/');

	const finalPath = await resolveConflictPath(plugin.app.vault, basePath);

	const folderPath = finalPath.slice(0, finalPath.lastIndexOf('/'));
	if (folderPath && !(await plugin.app.vault.adapter.exists(folderPath))) {
		await plugin.app.vault.createFolder(folderPath);
	}

	const text = serializeMemoNote(ref, name, content);

	plugin.memoSelfWriting.add(finalPath);
	const file = await plugin.app.vault.create(finalPath, text);
	queueMicrotask(() => plugin.memoSelfWriting.delete(finalPath));

	writeMemo(plugin, ref, content, { path: finalPath, mtime: file.stat.mtime });

	plugin.memoReverseLookup.set(finalPath, ref);

	plugin.app.workspace.getLeaf('tab').openFile(file);

	return file;
}

/**
 * Remove `materialized` da entidade. Conteúdo permanece preservado em `content` —
 * entidade volta automático pra modo inline. O .md órfão fica no vault; user decide.
 */
export function unmaterialize(plugin: QualiaCodingPlugin, ref: EntityRef): void {
	const memo = readMemoRecord(plugin, ref);
	if (!memo?.materialized) return;

	plugin.memoReverseLookup.delete(memo.materialized.path);

	writeMemo(plugin, ref, memo.content);
}

/**
 * Lê .md modificado externamente, atualiza data.json. Chamado pelo modify listener.
 * Frontmatter quebrado/removido → desfaz materialization graciosamente (entidade volta a inline).
 * Frontmatter aponta pra ref diferente → no-op com warning (spec D7).
 */
export async function syncFromFile(plugin: QualiaCodingPlugin, file: TFile): Promise<void> {
	const ref = plugin.memoReverseLookup.get(file.path);
	if (!ref) return;

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

	writeMemo(plugin, ref, parsed.content, { path: file.path, mtime: file.stat.mtime });
}
