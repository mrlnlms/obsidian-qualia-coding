/**
 * auditLog — helpers puros pro log central de eventos analíticos do codebook.
 *
 * Decisões registradas (2026-04-28):
 * - Storage central em `QualiaData.auditLog` pra preservar histórico de códigos deletados/merged.
 * - Soft delete via `hidden: true` (Opção C — curadoria visual mantendo verdade no JSON).
 * - Coalescing pra description/memo: edições da mesma sessão (< COALESCE_WINDOW_MS atrás)
 *   atualizam a entry anterior em vez de criar nova. "Sessão de edição = um event".
 */

import type { AuditEntry } from './types';

/** Janela em ms pra coalescer edições contínuas de description/memo numa única entry. */
export const COALESCE_WINDOW_MS = 60_000;

let _idCounter = 0;
function makeId(): string {
	// Concatenamos timestamp + counter pra evitar colisão dentro da mesma ms.
	return `audit_${Date.now().toString(36)}_${(_idCounter++).toString(36)}`;
}

/**
 * Adiciona uma entry no log. Pra `description_edited` e `memo_edited`, faz coalescing:
 * se a última entry do mesmo type+codeId é < COALESCE_WINDOW_MS atrás e não está hidden,
 * atualiza ela (mantém `from` original, atualiza `to` + `at`) em vez de criar nova.
 *
 * Mutates `log` in-place e retorna o array (pra encadeamento). Idempotente em hidden flag.
 */
export function appendEntry(log: AuditEntry[], entry: Omit<AuditEntry, 'id'> & { id?: string }): AuditEntry[] {
	const isCoalescableTextEdit = entry.type === 'description_edited' || entry.type === 'memo_edited' || entry.type === 'sc_memo_edited';
	const isCoalescablePredicateEdit = entry.type === 'sc_predicate_edited';

	if (isCoalescableTextEdit) {
		// Procura última entry visível do mesmo type+codeId+entity
		for (let i = log.length - 1; i >= 0; i--) {
			const e = log[i]!;
			if (e.codeId !== entry.codeId) continue;
			if (e.type !== entry.type) continue;
			if (e.entity !== entry.entity) continue;
			if (e.hidden) continue;
			if (entry.at - e.at > COALESCE_WINDOW_MS) break;
			// Coalesce: mantém from, atualiza to e at. Narrow pra variants que têm `to` field.
			type WithTo = Extract<AuditEntry, { to: string }>;
			(e as WithTo).to = (entry as WithTo).to;
			e.at = entry.at;
			return log;
		}
	}

	if (isCoalescablePredicateEdit) {
		// Coalesce sc_predicate_edited via Set union dos addedLeafKinds + removedLeafKinds + soma changedLeafCount
		for (let i = log.length - 1; i >= 0; i--) {
			const e = log[i]!;
			if (e.codeId !== entry.codeId) continue;
			if (e.type !== 'sc_predicate_edited') continue;
			if (e.entity !== 'smartCode') continue;
			if (e.hidden) continue;
			if (entry.at - e.at > COALESCE_WINDOW_MS) break;
			const existing = e as Extract<AuditEntry, { type: 'sc_predicate_edited' }>;
			const incoming = entry as Extract<AuditEntry, { type: 'sc_predicate_edited' }>;
			existing.addedLeafKinds = [...new Set([...existing.addedLeafKinds, ...incoming.addedLeafKinds])];
			existing.removedLeafKinds = [...new Set([...existing.removedLeafKinds, ...incoming.removedLeafKinds])];
			existing.changedLeafCount += incoming.changedLeafCount;
			e.at = entry.at;
			return log;
		}
	}

	const finalId = entry.id ?? makeId();
	log.push({ ...entry, id: finalId } as AuditEntry);
	return log;
}

/** Marca uma entry como hidden (soft delete). Idempotente. */
export function hideEntry(log: AuditEntry[], entryId: string): AuditEntry[] {
	const e = log.find(x => x.id === entryId);
	if (e) e.hidden = true;
	return log;
}

/** Remove a flag hidden (restore). Idempotente. */
export function unhideEntry(log: AuditEntry[], entryId: string): AuditEntry[] {
	const e = log.find(x => x.id === entryId);
	if (e) delete e.hidden;
	return log;
}

/**
 * Retorna entries de um código específico ordenadas por `at` ascendente.
 * Por default exclui hidden; passe `includeHidden=true` pra ver tudo (toggle "Show hidden").
 */
export function getEntriesForCode(
	log: AuditEntry[],
	codeId: string,
	includeHidden = false,
): AuditEntry[] {
	const filtered = log.filter(e => {
		const entity = e.entity ?? 'code';
		// 'code' (default) e 'reconciliation' compartilham o Code Stability Timeline.
		// Anchor codeId decide em qual timeline a reconciliation entry aparece.
		if (entity !== 'code' && entity !== 'reconciliation') return false;
		if (e.codeId !== codeId) return false;
		return includeHidden || !e.hidden;
	});
	return filtered.sort((a, b) => a.at - b.at);
}

/** Entries de smart code, filtradas por entity + smartCodeId. Default exclui hidden. */
export function getEntriesForSmartCode(
	log: AuditEntry[],
	smartCodeId: string,
	includeHidden = false,
): AuditEntry[] {
	const filtered = log.filter(e => e.entity === 'smartCode' && e.codeId === smartCodeId && (includeHidden || !e.hidden));
	return filtered.sort((a, b) => a.at - b.at);
}

/**
 * Renderiza UMA entry como linha de markdown pra export. Ignora `hidden` — caller filtra antes.
 * Formato: "- 2026-04-28 14:32  Renamed: from "X" to "Y""
 */
export function renderEntryMarkdown(entry: AuditEntry): string {
	const date = new Date(entry.at);
	const stamp = date.toISOString().slice(0, 16).replace('T', ' ');
	switch (entry.type) {
		case 'created':
			return `- ${stamp}  Created`;
		case 'renamed':
			return `- ${stamp}  Renamed: "${entry.from}" → "${entry.to}"`;
		case 'description_edited':
			return `- ${stamp}  Description edited`;
		case 'memo_edited':
			return `- ${stamp}  Memo edited`;
		case 'absorbed':
			return `- ${stamp}  Absorbed: ${entry.absorbedNames.map(n => `"${n}"`).join(', ')}`;
		case 'merged_into':
			return `- ${stamp}  Merged into: "${entry.intoName}"`;
		case 'deleted':
			return `- ${stamp}  Deleted`;
		case 'sc_created':
			return `- ${stamp}  Smart code created`;
		case 'sc_predicate_edited':
			return `- ${stamp}  Query edited (added: ${entry.addedLeafKinds.join(', ') || '—'}; removed: ${entry.removedLeafKinds.join(', ') || '—'}; changed: ${entry.changedLeafCount})`;
		case 'sc_memo_edited':
			return `- ${stamp}  Memo edited`;
		case 'sc_auto_rewritten_on_merge':
			return `- ${stamp}  Query auto-rewritten: code merged (${entry.sourceCodeId} → ${entry.targetCodeId})`;
		case 'sc_deleted':
			return `- ${stamp}  Smart code deleted`;
		case 'reconciliation_opened': {
			const trecho = formatBoundsShort(entry.region.bounds);
			return `- ${stamp}  Reconciliation opened: ${entry.coderIds.length} coders on ${trecho}`;
		}
		case 'reconciliation_decided': {
			const d = entry.decision;
			if (d.kind === 'adopt') {
				const modeLabel = d.mode === 'overwrite-originals' ? 'overwrite originals' : 'consensus marker';
				return `- ${stamp}  Reconciliation decided: adopted code ${d.codeId} (${modeLabel})`;
			}
			if (d.kind === 'split') {
				const modeLabel = d.mode === 'overwrite-originals' ? 'overwrite originals' : 'consensus marker';
				return `- ${stamp}  Reconciliation decided: split into new code ${d.newCodeId} (${modeLabel})`;
			}
			if (d.kind === 'accept-divergence') {
				return `- ${stamp}  Reconciliation decided: accept divergence`;
			}
			return `- ${stamp}  Reconciliation decided: rejected`;
		}
		case 'reconciliation_reverted':
			return `- ${stamp}  Reconciliation reverted (entry ${entry.originalEntryId}; restored ${entry.restoredMarkerIds.length} markers)`;
	}
}

/** Format bounds em snippet curto pra display em audit timeline (markdown line). */
function formatBoundsShort(bounds: import('./types').ReconciliationBounds): string {
	switch (bounds.kind) {
		case 'text':
			return `chars ${bounds.from}–${bounds.to}`;
		case 'csvRow':
			return bounds.column ? `row ${bounds.rowIndex} · ${bounds.column}` : `row ${bounds.rowIndex}`;
		case 'csvSegment':
			return `row ${bounds.rowIndex} · ${bounds.column} · chars ${bounds.from}–${bounds.to}`;
		case 'pdfText':
			return `page ${bounds.page} · chars ${bounds.from}–${bounds.to}`;
		case 'temporal':
			return `${bounds.from.toFixed(1)}s–${bounds.to.toFixed(1)}s`;
		case 'bbox': {
			const pct = (v: number) => (v * 100).toFixed(1);
			const prefix = bounds.page !== undefined ? `p${bounds.page} ` : '';
			return `${prefix}bbox ${pct(bounds.x)},${pct(bounds.y)}+${pct(bounds.w)}×${pct(bounds.h)}%`;
		}
	}
}

/**
 * Markdown completo pra um código: header + lista de TODAS as entries (incluindo hidden),
 * ordenadas. Decisão (2026-04-28): export ignora a flag hidden — hide é só curadoria
 * visual da timeline; o .md exportado vira documento editável pelo pesquisador.
 */
export function renderCodeHistoryMarkdown(
	log: AuditEntry[],
	codeId: string,
	codeName: string,
): string {
	const entries = getEntriesForCode(log, codeId, true);
	const lines = [`# History — ${codeName}`, ''];
	if (entries.length === 0) {
		lines.push('_No history recorded yet._');
	} else {
		for (const e of entries) lines.push(renderEntryMarkdown(e));
	}
	return lines.join('\n') + '\n';
}
