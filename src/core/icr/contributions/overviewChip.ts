/**
 * Visão geral chip — seções inline (codebook + sources + ok) + footer Apply.
 *
 * Seções aparecem condicionalmente (sem conflito = sem seção). Footer computa
 * N_in/N_out via divergenceResolver. Apply chama callback (a view decide se
 * executa merge real e remove da rail).
 */

import type { PendingContribution } from './contributionViewTypes';
import { cloneOverrides, type ResolutionOverrides } from './contributionViewTypes';
import type { ConflictRecord } from '../transport/payloadTypes';
import { computeBreakdown } from './divergenceResolver';

export interface OverviewChipCallbacks {
	onApply: () => void;
	onDiscard: () => void;
	onOverridesChange: (overrides: ResolutionOverrides) => void;
	/** A3: caller abre suggest modal pra escolher fileId local; resolve com selected ou null. */
	onRequestRemap?: (payloadFileId: string) => void;
}

type CodeOverwrittenConflict = Extract<ConflictRecord, { kind: 'code_overwritten' }>;
type SourceConflict = Extract<ConflictRecord, { kind: 'source_hash_mismatch' | 'source_not_found' | 'multiple_hash_matches' }>;

export function renderOverviewChip(
	container: HTMLElement,
	contrib: PendingContribution,
	cb: OverviewChipCallbacks,
): void {
	container.empty();

	// Seção 1 — Codebook divergiu (motor só emite name/color hoje; description/memo/memo_overwritten
	// são schema-ready, ver spec §1.1)
	const codeOverwrittens = contrib.mergePreview.conflicts.filter(
		(c): c is CodeOverwrittenConflict => c.kind === 'code_overwritten',
	);
	if (codeOverwrittens.length > 0) {
		renderCodebookSection(container, contrib, codeOverwrittens, cb);
	}

	// Seção 2 — Sources com problemas
	const sourceConflicts = contrib.mergePreview.conflicts.filter(
		(c): c is SourceConflict =>
			c.kind === 'source_hash_mismatch' || c.kind === 'source_not_found' || c.kind === 'multiple_hash_matches',
	);
	if (sourceConflicts.length > 0) {
		renderSourcesSection(container, contrib, sourceConflicts, cb);
	}

	// Seção 3 — OK (sempre visível)
	renderOkSection(container, contrib);

	// Footer Apply / Discard
	renderFooter(container, contrib, cb);
}

function renderCodebookSection(
	container: HTMLElement,
	contrib: PendingContribution,
	conflicts: CodeOverwrittenConflict[],
	cb: OverviewChipCallbacks,
): void {
	const section = container.createDiv({ cls: 'qc-icr-section qc-icr-section-codebook qc-icr-section-warn' });
	const head = section.createDiv({ cls: 'qc-icr-section-head' });
	head.createEl('h4', { text: '⚠ Codebook divergiu desde o export' });
	const meta = head.createSpan({ cls: 'qc-icr-section-meta' });
	meta.setText(`${conflicts.length} codes afetados`);

	const body = section.createDiv({ cls: 'qc-icr-section-body' });
	const coderName = contrib.payload.coder.name;

	for (const conf of conflicts) {
		const row = body.createDiv({ cls: 'qc-icr-diff-row' });
		const local = row.createDiv({ cls: 'qc-icr-diff-cell local' });
		local.setText(`${conf.codeId} · ${conf.field}: ${formatVal(conf.from)}`);
		const theirs = row.createDiv({ cls: 'qc-icr-diff-cell theirs' });
		theirs.setText(`${conf.codeId} · ${conf.field}: ${formatVal(conf.to)}`);

		const actions = body.createDiv({ cls: 'qc-icr-diff-actions' });
		const localBtn = actions.createEl('button', { cls: 'qc-icr-button outline', text: 'Manter local' });
		localBtn.onclick = () => {
			const o = cloneOverrides(contrib.overrides);
			o.codebookOverrides.set(conf.codeId, 'local');
			cb.onOverridesChange(o);
		};
		const incomingBtn = actions.createEl('button', { cls: 'qc-icr-button', text: `Aceitar ${coderName} (default)` });
		incomingBtn.onclick = () => {
			const o = cloneOverrides(contrib.overrides);
			o.codebookOverrides.set(conf.codeId, 'incoming');
			cb.onOverridesChange(o);
		};
	}
}

function renderSourcesSection(
	container: HTMLElement,
	contrib: PendingContribution,
	conflicts: SourceConflict[],
	cb: OverviewChipCallbacks,
): void {
	const section = container.createDiv({ cls: 'qc-icr-section qc-icr-section-sources qc-icr-section-error' });
	const head = section.createDiv({ cls: 'qc-icr-section-head' });
	head.createEl('h4', { text: '⚠ Sources com problemas' });
	head.createSpan({ cls: 'qc-icr-section-meta', text: `${conflicts.length} issues` });

	const body = section.createDiv({ cls: 'qc-icr-section-body' });

	for (const conf of conflicts) {
		const fileId = (conf as any).fileId ?? (conf as any).payloadFileId;
		const row = body.createDiv({ cls: 'qc-icr-source-row' });

		const currentOverride = contrib.overrides.sourceOverrides.get(fileId);
		const mapManual = currentOverride && typeof currentOverride === 'object' && currentOverride.kind === 'map-manual'
			? currentOverride.localFileId
			: null;

		const desc = row.createDiv({ cls: 'qc-icr-source-desc' });
		if (conf.kind === 'source_hash_mismatch') {
			desc.setText(`${fileId} — hash mismatch (você editou esse arquivo depois)`);
		} else if (conf.kind === 'source_not_found') {
			desc.setText(`${fileId} — not found (arquivo não existe local)`);
		} else {
			desc.setText(`${fileId} — multiple hash matches (lookup ambíguo)`);
		}
		if (mapManual) {
			desc.createDiv({ cls: 'qc-icr-source-remap', text: `→ remapped pra ${mapManual}` });
		}

		const actions = row.createDiv({ cls: 'qc-icr-source-actions' });

		if (conf.kind === 'source_hash_mismatch') {
			const trust = actions.createEl('button', { cls: 'qc-icr-button outline', text: 'Trust local (offsets podem desalinhar)' });
			trust.onclick = () => {
				const o = cloneOverrides(contrib.overrides);
				o.sourceOverrides.set(fileId, 'trust-local');
				cb.onOverridesChange(o);
			};
		}

		if (cb.onRequestRemap) {
			const mapBtn = actions.createEl('button', {
				cls: 'qc-icr-button outline',
				text: mapManual ? 'Trocar destino' : 'Mapear → arquivo local',
			});
			mapBtn.onclick = () => cb.onRequestRemap!(fileId);
		}

		const skip = actions.createEl('button', { cls: 'qc-icr-button secondary', text: 'Skip source' });
		skip.onclick = () => {
			const o = cloneOverrides(contrib.overrides);
			o.sourceOverrides.set(fileId, 'skip-source');
			cb.onOverridesChange(o);
		};
	}
}

function renderOkSection(container: HTMLElement, contrib: PendingContribution): void {
	const section = container.createDiv({ cls: 'qc-icr-section qc-icr-section-ok' });
	const head = section.createDiv({ cls: 'qc-icr-section-head' });
	head.createEl('h4', { text: '✓ Pronto pra importar' });
	head.createSpan({
		cls: 'qc-icr-section-meta',
		text: `${contrib.mergePreview.added.markers} markers · ${contrib.mergePreview.added.codes} codes · 0 conflitos`,
	});
}

function renderFooter(container: HTMLElement, contrib: PendingContribution, cb: OverviewChipCallbacks): void {
	const footer = container.createDiv({ cls: 'qc-icr-overview-footer' });
	const breakdown = computeBreakdown(contrib.mergePreview, contrib.overrides, contrib.payload);

	const apply = footer.createEl('button', { cls: 'qc-icr-button' });
	apply.setText(
		breakdown.N_out === 0
			? `Apply (${breakdown.N_in})`
			: `Apply (${breakdown.N_in} markers — ${breakdown.N_out} ficam fora)`,
	);
	apply.onclick = cb.onApply;

	const discard = footer.createEl('button', { cls: 'qc-icr-button secondary', text: 'Discard contribution' });
	discard.onclick = cb.onDiscard;

	if (breakdown.N_out > 0) {
		const sub = footer.createDiv({ cls: 'qc-icr-overview-footer-sub' });
		sub.setText(`resolva os ${breakdown.N_out} pendentes acima ou pula eles`);
	}
}

function formatVal(v: string): string {
	return v.length > 30 ? `${v.slice(0, 27)}…` : v;
}
