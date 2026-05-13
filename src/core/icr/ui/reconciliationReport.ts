/**
 * Export markdown estruturado do P3 — timeline de decisões + memos + κ pré/pós.
 *
 * Função pura: recebe audit log + escopo + relatórios κ; retorna string markdown.
 * Quem aciona (view) calcula κ pré (sem consensus) e κ pós (com consensus) e passa.
 */

import type { AuditEntry, ReconciliationBounds, ReconciliationDecision } from '../../types';
import type { CoderId } from '../coderTypes';
import type { EngineId } from '../reporter';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';
import type { CoderRegistry } from '../coderRegistry';
import type { ComparisonScope } from './compareCodersTypes';
import type { RegionsByStatus } from './regionDerivation';

export interface ReconciliationReportInput {
	scope: ComparisonScope;
	byStatus: RegionsByStatus;
	auditLog: AuditEntry[];
	coderRegistry: CoderRegistry;
	codeRegistry: CodeDefinitionRegistry;
	/** κ pré-reconciliação (sem consensus). undefined quando não aplicável (sem consensus no scope). */
	kappaPre?: { byPair: Record<string, number | undefined> };
	/** κ pós-reconciliação (com consensus). undefined quando não aplicável. */
	kappaPost?: { byPair: Record<string, number | undefined> };
}

export function generateReconciliationReport(input: ReconciliationReportInput): string {
	const lines: string[] = [];
	const ts = new Date().toISOString();
	const coderNames = input.scope.coderIds.map(id => input.coderRegistry.getById(id)?.name ?? id).join(', ');

	lines.push('# Relatório de reconciliação ICR');
	lines.push('');
	lines.push(`**Data:** ${ts}`);
	lines.push(`**Coders no escopo:** ${coderNames}`);
	if (input.scope.codeIds && input.scope.codeIds.length > 0) {
		const codeNames = input.scope.codeIds.map(id => input.codeRegistry.getById(id)?.name ?? id).join(', ');
		lines.push(`**Códigos:** ${codeNames}`);
	}
	if (input.scope.fileIds && input.scope.fileIds.length > 0) {
		lines.push(`**Arquivos:** ${input.scope.fileIds.join(', ')}`);
	}
	lines.push('');

	lines.push('## Resumo');
	lines.push('');
	lines.push(`- 🔥 Abertos: ${input.byStatus.open.length}`);
	lines.push(`- 💬 Em discussão: ${input.byStatus.inDiscussion.length}`);
	lines.push(`- ✓ Resolvidos: ${input.byStatus.resolved.length}`);
	lines.push(`- ◇ Divergência aceita: ${input.byStatus.divergenceAccepted.length}`);
	lines.push('');

	if (input.kappaPre || input.kappaPost) {
		lines.push('## κ pré vs pós reconciliação');
		lines.push('');
		const pairs = collectPairKeys(input.kappaPre, input.kappaPost);
		if (pairs.length > 0) {
			lines.push('| par | κ pré (humanos) | κ pós (c/ consensus) |');
			lines.push('|---|---|---|');
			for (const pair of pairs) {
				const pre = input.kappaPre?.byPair[pair];
				const post = input.kappaPost?.byPair[pair];
				lines.push(`| ${humanizePair(pair, input.coderRegistry)} | ${fmtNum(pre)} | ${fmtNum(post)} |`);
			}
			lines.push('');
		}
	}

	if (input.byStatus.resolved.length + input.byStatus.divergenceAccepted.length > 0) {
		lines.push('## Decisões aplicadas');
		lines.push('');
		const decided: { region: typeof input.byStatus.resolved[number]; entry: Extract<AuditEntry, { type: 'reconciliation_decided' }> }[] = [];
		for (const region of [...input.byStatus.resolved, ...input.byStatus.divergenceAccepted]) {
			const entry = findLatestActiveDecisionLocal(region, input.auditLog);
			if (entry) decided.push({ region, entry });
		}
		decided.sort((a, b) => a.entry.at - b.entry.at);
		for (const { region, entry } of decided) {
			lines.push(`### ${region.fileId} · ${region.engine} · ${region.displayLabel}`);
			lines.push('');
			lines.push(`- **Tipo de divergência:** ${region.divergenceKind}`);
			lines.push(`- **Coders envolvidos:** ${region.coderIds.map(id => input.coderRegistry.getById(id)?.name ?? id).join(', ')}`);
			lines.push(`- **Decisão:** ${formatDecision(entry.decision, input.codeRegistry)}`);
			lines.push(`- **Quando:** ${new Date(entry.at).toISOString()}`);
			if (entry.memoOfReconciliation) {
				lines.push('- **Memo:**');
				lines.push('');
				for (const memoLine of entry.memoOfReconciliation.split('\n')) {
					lines.push(`  > ${memoLine}`);
				}
			}
			lines.push('');
		}
	}

	if (input.byStatus.inDiscussion.length > 0) {
		lines.push('## Em discussão (marcadas pra revisão)');
		lines.push('');
		for (const region of input.byStatus.inDiscussion) {
			lines.push(`- ${region.fileId} · ${region.engine} · ${region.displayLabel} — ${region.coderIds.length} coders`);
		}
		lines.push('');
	}

	if (input.byStatus.open.length > 0) {
		lines.push('## Abertos (pendentes)');
		lines.push('');
		for (const region of input.byStatus.open) {
			lines.push(`- ${region.fileId} · ${region.engine} · ${region.displayLabel} — ${region.divergenceKind} (${region.coderIds.length} coders)`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

function formatDecision(decision: ReconciliationDecision, codeRegistry: CodeDefinitionRegistry): string {
	if (decision.kind === 'adopt') {
		const code = codeRegistry.getById(decision.codeId);
		const modeLabel = decision.mode === 'overwrite-originals' ? ' (overwrite originais)' : ' (consensus marker)';
		return `adopt ${code?.name ?? decision.codeId}${modeLabel}`;
	}
	if (decision.kind === 'split') {
		const code = codeRegistry.getById(decision.newCodeId);
		return `split em ${code?.name ?? decision.newCodeId}`;
	}
	if (decision.kind === 'accept-divergence') return 'manter divergência';
	return 'rejeitada';
}

function fmtNum(v: number | undefined): string {
	return v !== undefined && !isNaN(v) ? v.toFixed(2) : '—';
}

function collectPairKeys(
	pre?: { byPair: Record<string, number | undefined> },
	post?: { byPair: Record<string, number | undefined> },
): string[] {
	const keys = new Set<string>();
	if (pre) for (const k of Object.keys(pre.byPair)) keys.add(k);
	if (post) for (const k of Object.keys(post.byPair)) keys.add(k);
	return Array.from(keys).sort();
}

function humanizePair(pairKey: string, coderRegistry: CoderRegistry): string {
	const [a, b] = pairKey.split('|') as [CoderId, CoderId];
	const nameA = coderRegistry.getById(a)?.name ?? a;
	const nameB = coderRegistry.getById(b)?.name ?? b;
	return `${nameA} ↔ ${nameB}`;
}

function findLatestActiveDecisionLocal(
	region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds },
	log: AuditEntry[],
): Extract<AuditEntry, { type: 'reconciliation_decided' }> | null {
	const decisions: Extract<AuditEntry, { type: 'reconciliation_decided' }>[] = [];
	for (const e of log) {
		if (e.entity !== 'reconciliation') continue;
		if (e.type !== 'reconciliation_decided') continue;
		if (e.region.fileId !== region.fileId) continue;
		if (e.region.engine !== region.engine) continue;
		if (!sameBoundsLocal(e.region.bounds, region.bounds)) continue;
		decisions.push(e);
	}
	for (let i = decisions.length - 1; i >= 0; i--) {
		const d = decisions[i]!;
		const reverted = log.some(e =>
			e.entity === 'reconciliation' && e.type === 'reconciliation_reverted' && e.originalEntryId === d.id,
		);
		if (!reverted) return d;
	}
	return null;
}

function sameBoundsLocal(a: ReconciliationBounds, b: ReconciliationBounds): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'text' && b.kind === 'text') return a.from === b.from && a.to === b.to;
	if (a.kind === 'csvRow' && b.kind === 'csvRow') return a.rowIndex === b.rowIndex && (a.column ?? '') === (b.column ?? '');
	if (a.kind === 'csvSegment' && b.kind === 'csvSegment') return a.rowIndex === b.rowIndex && a.column === b.column && a.from === b.from && a.to === b.to;
	if (a.kind === 'pdfText' && b.kind === 'pdfText') return a.page === b.page && a.from === b.from && a.to === b.to;
	if (a.kind === 'temporal' && b.kind === 'temporal') return a.from === b.from && a.to === b.to;
	if (a.kind === 'bbox' && b.kind === 'bbox') return (a.page ?? -1) === (b.page ?? -1) && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
	return false;
}
