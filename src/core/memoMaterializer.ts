import type { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { EntityRef, MaterializedRef, MemoRecord } from './memoTypes';
import { entityRefToString } from './memoTypes';
import { getMemoContent } from './memoHelpers';
import { resolveConflictPath, sanitizeFilename } from './memoPathResolver';
import { serializeMemoNote, parseMemoNote } from './memoNoteFormat';
import { buildMarkerFilename } from './memoMarkerNaming';

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
	if (ref.type === 'marker') {
		const m = plugin.dataManager.findMarker(ref.engineType, ref.id);
		if (!m) throw new Error(`Marker not found: ${ref.engineType}:${ref.id}`);
		return { name: buildMarkerFilename(plugin, ref), content: getMemoContent(m.memo) };
	}
	throw new Error(`Phase 2: ref type '${ref.type}' not yet supported`);
}

/** Folder configurado em settings, por tipo. */
function resolveFolder(plugin: QualiaCodingPlugin, ref: EntityRef): string {
	const folders = plugin.dataManager.section('general').memoFolders;
	if (ref.type === 'code') return folders.code;
	if (ref.type === 'group') return folders.group;
	if (ref.type === 'marker') return folders.marker;
	throw new Error(`Phase 2: ref type '${ref.type}' not yet supported`);
}

/** Read current MemoRecord from registry, agnostic to entity type. */
function readMemoRecord(plugin: QualiaCodingPlugin, ref: EntityRef): MemoRecord | undefined {
	if (ref.type === 'code') return plugin.sharedRegistry.getById(ref.id)?.memo;
	if (ref.type === 'group') return plugin.sharedRegistry.getGroup(ref.id)?.memo;
	if (ref.type === 'marker') return plugin.dataManager.findMarker(ref.engineType, ref.id)?.memo;
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
	if (ref.type === 'marker') {
		const marker = plugin.dataManager.findMarker(ref.engineType, ref.id);
		if (!marker) return;
		// Assign explícito — caller decide se inclui materialized. Não delegar pra setMemoContent
		// porque ele preserva materialized do estado atual (preserva no caso de edição inline,
		// mas writeMemo é caller-driven: se chamou sem materialized, é unmaterialize → drop).
		if (content || materialized) {
			marker.memo = materialized ? { content, materialized } : { content };
		} else {
			marker.memo = undefined;
		}
		marker.updatedAt = Date.now();
		plugin.dataManager.markDirty();
		notifyMarkerOwner(plugin, ref.engineType);
		// Notifica views (BaseCodeDetailView, memoView) que o marker mudou — code/group fluem via
		// registry.onMutate, mas marker não passa pelo registry, então emit explícito.
		document.dispatchEvent(new Event('qualia:registry-changed'));
		return;
	}
	throw new Error(`Phase 2: ref type '${ref.type}' not yet supported`);
}

/**
 * Notifica o model dono do engine — invalida cache do `UnifiedModelAdapter` (que cacheia
 * snapshots de markers; engines como pdf/image/csv/media fazem cópia em vez de retornar
 * referência direta, então mutação via dataManager não atualiza o cache sozinha).
 */
function notifyMarkerOwner(plugin: QualiaCodingPlugin, engineType: 'markdown' | 'pdf' | 'csv' | 'image' | 'audio' | 'video'): void {
	switch (engineType) {
		case 'markdown': plugin.markdownModel?.notifyChange(); return;
		case 'pdf': plugin.pdfModel?.notify(); return;
		case 'image': plugin.imageModel?.notify(); return;
		case 'csv': plugin.csvModel?.notify(); return;
		case 'audio': plugin.audioModel?.notify(); return;
		case 'video': plugin.videoModel?.notify(); return;
	}
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
