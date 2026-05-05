import type QualiaCodingPlugin from '../main';
import type { EntityRef, MemoRecord } from './memoTypes';
import { entityRefToString } from './memoTypes';
import { convertMemoToNote, refreshMemoNote } from './memoMaterializer';

export type MemoKind = 'code' | 'group' | 'marker' | 'relation-code' | 'relation-app' | 'smartCode';

export interface BatchSelection {
	kinds: Record<MemoKind, boolean>;
	includeEmpty: boolean;
	overwriteExisting: boolean;
}

export interface BatchPreview {
	toCreate: EntityRef[];
	toOverwrite: EntityRef[];
	alreadyUpToDate: number;
	emptySkipped: number;
}

export interface BatchProgress {
	current: number;
	total: number;
	label: string;
}

export interface BatchResult {
	created: number;
	overwritten: number;
	failed: { ref: EntityRef; error: string }[];
}

/**
 * Itera registry/markers/relations e coleta todos EntityRef com memo presente
 * (ignora quem nem tem campo memo).
 */
export function collectAllMemoRefs(plugin: QualiaCodingPlugin): { ref: EntityRef; memo: MemoRecord }[] {
	const out: { ref: EntityRef; memo: MemoRecord }[] = [];

	for (const def of plugin.sharedRegistry.getAll()) {
		if (def.memo) out.push({ ref: { type: 'code', id: def.id }, memo: def.memo });
		for (const rel of def.relations ?? []) {
			if (rel.memo) {
				out.push({
					ref: { type: 'relation-code', codeId: def.id, label: rel.label, target: rel.target },
					memo: rel.memo,
				});
			}
		}
	}

	for (const g of plugin.sharedRegistry.getAllGroups()) {
		if (g.memo) out.push({ ref: { type: 'group', id: g.id }, memo: g.memo });
	}

	const dm = plugin.dataManager;
	const visit = (
		engineType: 'markdown' | 'pdf' | 'csv' | 'image' | 'audio' | 'video',
		m: { id: string; memo?: MemoRecord; codes: { codeId: string; relations?: { label: string; target: string; memo?: MemoRecord }[] }[] },
	) => {
		if (m.memo) out.push({ ref: { type: 'marker', engineType, id: m.id }, memo: m.memo });
		for (const ca of m.codes ?? []) {
			for (const rel of ca.relations ?? []) {
				if (rel.memo) {
					out.push({
						ref: { type: 'relation-app', engineType, markerId: m.id, codeId: ca.codeId, label: rel.label, target: rel.target },
						memo: rel.memo,
					});
				}
			}
		}
	};
	for (const fileMarkers of Object.values(dm.section('markdown').markers)) {
		for (const m of fileMarkers) visit('markdown', m);
	}
	for (const m of dm.section('pdf').markers) visit('pdf', m);
	for (const s of dm.section('pdf').shapes) visit('pdf', s);
	for (const m of dm.section('image').markers) visit('image', m);
	for (const m of dm.section('csv').segmentMarkers) visit('csv', m);
	for (const m of dm.section('csv').rowMarkers) visit('csv', m);
	for (const f of dm.section('audio').files) {
		for (const m of f.markers) visit('audio', m);
	}
	for (const f of dm.section('video').files) {
		for (const m of f.markers) visit('video', m);
	}

	// Smart Codes
	for (const sc of plugin.smartCodeRegistry.getAll()) {
		if (sc.memo) out.push({ ref: { type: 'smartCode', id: sc.id }, memo: sc.memo });
	}

	return out;
}

/**
 * Aplica seleção e separa em buckets pra preview e execução. Cada ref vai pra exatamente
 * um bucket — toCreate (novo), toOverwrite (já materializado, será reescrito),
 * alreadyUpToDate (skip), emptySkipped (vazio + includeEmpty off).
 */
export function categorize(
	all: { ref: EntityRef; memo: MemoRecord }[],
	selection: BatchSelection,
): BatchPreview {
	const toCreate: EntityRef[] = [];
	const toOverwrite: EntityRef[] = [];
	let alreadyUpToDate = 0;
	let emptySkipped = 0;

	for (const { ref, memo } of all) {
		if (!selection.kinds[ref.type]) continue;

		const isEmpty = !memo.content?.trim();

		if (memo.materialized) {
			if (selection.overwriteExisting) toOverwrite.push(ref);
			else alreadyUpToDate++;
			continue;
		}

		if (isEmpty && !selection.includeEmpty) {
			emptySkipped++;
			continue;
		}

		toCreate.push(ref);
	}

	return { toCreate, toOverwrite, alreadyUpToDate, emptySkipped };
}

/** Resolve label legível pra exibir no progress (caller passa a função pra evitar circular). */
export function describeRef(plugin: QualiaCodingPlugin, ref: EntityRef): string {
	if (ref.type === 'code') {
		return plugin.sharedRegistry.getById(ref.id)?.name ?? ref.id;
	}
	if (ref.type === 'group') {
		return plugin.sharedRegistry.getGroup(ref.id)?.name ?? ref.id;
	}
	if (ref.type === 'marker') {
		return `${ref.engineType} marker`;
	}
	if (ref.type === 'smartCode') {
		return `⚡ ${plugin.smartCodeRegistry.getById(ref.id)?.name ?? ref.id}`;
	}
	if (ref.type === 'relation-code') {
		const src = plugin.sharedRegistry.getById(ref.codeId)?.name ?? ref.codeId;
		const tgt = plugin.sharedRegistry.getById(ref.target)?.name ?? ref.target;
		return `${src} → ${ref.label} → ${tgt}`;
	}
	const src = plugin.sharedRegistry.getById(ref.codeId)?.name ?? ref.codeId;
	const tgt = plugin.sharedRegistry.getById(ref.target)?.name ?? ref.target;
	return `${src} → ${ref.label} → ${tgt}`;
}

/**
 * Executa o batch: cria novos + sobrescreve existentes (se overwriteExisting=true).
 * Erros individuais são capturados — não param o resto. onProgress chamado antes de cada item.
 */
export async function materializeBatch(
	plugin: QualiaCodingPlugin,
	preview: BatchPreview,
	onProgress?: (p: BatchProgress) => void,
): Promise<BatchResult> {
	const result: BatchResult = { created: 0, overwritten: 0, failed: [] };
	const total = preview.toCreate.length + preview.toOverwrite.length;
	let current = 0;

	const run = async (ref: EntityRef, mode: 'create' | 'overwrite') => {
		current++;
		onProgress?.({ current, total, label: describeRef(plugin, ref) });
		try {
			if (mode === 'create') {
				await convertMemoToNote(plugin, ref, { openInTab: false });
				result.created++;
			} else {
				await refreshMemoNote(plugin, ref);
				result.overwritten++;
			}
		} catch (e) {
			result.failed.push({
				ref,
				error: e instanceof Error ? e.message : String(e),
			});
			console.warn('[qualia] materializeBatch failed for', entityRefToString(ref), e);
		}
	};

	for (const ref of preview.toCreate) await run(ref, 'create');
	for (const ref of preview.toOverwrite) await run(ref, 'overwrite');

	return result;
}
