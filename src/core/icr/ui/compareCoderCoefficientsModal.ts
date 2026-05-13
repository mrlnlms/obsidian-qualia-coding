/**
 * CompareCoderCoefficientsModal — "ver lado a lado".
 *
 * 2 estados toggle no header:
 * - 'all-pairs': 1 row aggregate por par (todos C(N,2))
 * - 'single-pair': 1 aggregate + N per-engine breakdown rows pro par dado
 *
 * 5 coeficientes em colunas (Cohen κ / Fleiss κ / α / α-binary / cu-α). n/a quando aplicável.
 *
 * Diagnóstico narrativo (caixa amarela) aparece quando padrão reconhecível dispara
 * em single-pair. Setting `icr.showNarrativeDiagnosis` controla visibilidade global.
 *
 * Footer: export markdown (clipboard) + fechar.
 *
 * Pattern espelha mergeModal (Modal Obsidian + onOpen sync, kickoff async em background).
 */

import { App, Modal, Notice } from 'obsidian';
import type { ComparisonScope } from './compareCodersTypes';
import type { CoderId } from '../coderTypes';
import type { DistanceName } from '../distances';
import type { CoderRegistry } from '../coderRegistry';
import { extractInputsFromScope, type EngineModelsForExtraction } from './scopeExtraction';
import { reportPairwise, type EngineId, type CoefficientReport } from '../reporter';
import { analyzeDiagnostic } from './narrativeDiagnostic';
import { applyConsensusExclusion, getConsensusCoderIdsInScope } from './coderInclusion';

export interface ModalCtx {
	models: EngineModelsForExtraction;
	app: App;
	showNarrative: boolean;
	coderRegistry: CoderRegistry;
}

export type ModalState = 'all-pairs' | 'single-pair';
export type PrePost = 'pre' | 'post';

export interface ModalOptions {
	initial: ModalState;
	pair?: [CoderId, CoderId];
}

interface ModalRow {
	pair: [CoderId, CoderId];
	engine: EngineId | 'aggregate';
	cohen?: number;
	fleiss?: number;
	alpha?: number;
	alphaBinary?: number;
	cuAlpha?: number;
}

export class CompareCoderCoefficientsModal extends Modal {
	private state: ModalState;
	/** Toggle κ pré (sem consensus) / pós (com consensus). E3b. Só visível quando há consensus no scope. */
	private prePost: PrePost = 'post';
	private rows: ModalRow[] = [];

	constructor(
		app: App,
		private compareScope: ComparisonScope,
		private ctx: ModalCtx,
		private options: ModalOptions,
		private distance: DistanceName = 'jaccard',
	) {
		super(app);
		// Sem par selecionado (botão direto do toolbar), force 'all-pairs' — toggle
		// 'par único' fica disabled ate user clicar em par na overview.
		this.state = options.pair ? options.initial : 'all-pairs';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('qc-cc-modal');
		this.renderHeader();
		await this.computeRows();
		this.renderTable();
		this.renderDiagnostic();
		this.renderFooter();
	}

	private hasConsensusInScope(): boolean {
		// Considera só consensus que TEM markers (caso contrário toggle pré/pós é no-op).
		const consensus = getConsensusCoderIdsInScope(this.compareScope, this.ctx.coderRegistry);
		if (consensus.length === 0) return false;
		// Verifica se algum consensus coder aparece em qualquer marker das engines no escopo.
		const models = this.ctx.models;
		const allMarkers = [
			...(models.markdown?.getAllMarkers?.() ?? []),
			...(models.pdf?.getAllMarkers?.() ?? []),
			...(models.csv?.getAllMarkers?.() ?? []),
			...(models.audio?.getAllMarkers?.() ?? []),
			...(models.video?.getAllMarkers?.() ?? []),
			...(models.image?.getAllMarkers?.() ?? []),
		];
		const consensusSet = new Set(consensus);
		return allMarkers.some((m: { codedBy?: string }) => m.codedBy !== undefined && consensusSet.has(m.codedBy));
	}

	private effectiveScope(): ComparisonScope {
		return this.prePost === 'pre'
			? applyConsensusExclusion(this.compareScope, this.ctx.coderRegistry, true)
			: this.compareScope;
	}

	private renderHeader(): void {
		const header = this.contentEl.createDiv({ cls: 'qc-cc-modal-header' });
		header.createEl('h3', { text: 'Coeficientes ICR · ver lado a lado' });
		const toggle = header.createDiv({ cls: 'qc-cc-modal-toggle' });
		for (const s of ['single-pair', 'all-pairs'] as ModalState[]) {
			const isDisabled = s === 'single-pair' && !this.options.pair;
			const chip = toggle.createSpan({
				cls: `qc-cc-mode-chip ${this.state === s ? 'is-active' : ''}${isDisabled ? ' is-disabled' : ''}`,
				text: s === 'single-pair' ? 'par único' : 'todos os pares',
			});
			if (isDisabled) {
				chip.title = 'Selecione um par na matriz Mode A primeiro pra ativar este modo';
			} else {
				chip.onclick = () => {
					this.state = s;
					void this.refresh();
				};
			}
		}

		// E3b: toggle pré/pós reconciliação — só aparece quando há consensus no scope.
		if (this.hasConsensusInScope()) {
			const ppToggle = header.createDiv({ cls: 'qc-cc-modal-toggle qc-cc-modal-prepost' });
			ppToggle.createSpan({ cls: 'qc-cc-modal-toggle-label', text: 'reconciliação:' });
			for (const pp of ['pre', 'post'] as PrePost[]) {
				const chip = ppToggle.createSpan({
					cls: `qc-cc-mode-chip ${this.prePost === pp ? 'is-active' : ''}`,
					text: pp === 'pre' ? 'pré (sem consensus)' : 'pós (com consensus)',
				});
				chip.title = pp === 'pre'
					? 'κ baseline humano-humano, ignorando consensus'
					: 'κ com consensus incluído como coder adicional';
				chip.onclick = () => {
					this.prePost = pp;
					void this.refresh();
				};
			}
		}
	}

	private async refresh(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('qc-cc-modal');
		this.renderHeader();
		await this.computeRows();
		this.renderTable();
		this.renderDiagnostic();
		this.renderFooter();
	}

	private async computeRows(): Promise<void> {
		this.rows = [];
		const scope = this.effectiveScope();
		const pairs = this.state === 'single-pair' && this.options.pair
			? [this.options.pair].filter(p => scope.coderIds.includes(p[0]) && scope.coderIds.includes(p[1])) as [CoderId, CoderId][]
			: this.allPairsFromScope(scope);
		if (pairs.length === 0) return;
		const inputs = await extractInputsFromScope(scope, { models: this.ctx.models, app: this.ctx.app });
		if (inputs.length === 0) return;
		const reports = reportPairwise(inputs, pairs, undefined, undefined, this.distance);
		for (const r of reports) {
			const cohenK = r.report.aggregate.cohenKappa[`${r.pair[0]}|${r.pair[1]}`]
				?? r.report.aggregate.cohenKappa[`${r.pair[1]}|${r.pair[0]}`];
			this.rows.push({
				pair: r.pair, engine: 'aggregate',
				cohen: cohenK?.value,
				fleiss: r.report.aggregate.fleissKappa,
				alpha: r.report.aggregate.alphaNominal,
				alphaBinary: r.report.aggregate.alphaBinary,
				cuAlpha: r.report.aggregate.cuAlpha,
			});
			if (this.state === 'single-pair') {
				for (const [engineKey, coef] of Object.entries(r.report.byEngine)) {
					if (!coef) continue;
					const c = coef as CoefficientReport;
					const ck = c.cohenKappa[`${r.pair[0]}|${r.pair[1]}`] ?? c.cohenKappa[`${r.pair[1]}|${r.pair[0]}`];
					this.rows.push({
						pair: r.pair, engine: engineKey as EngineId,
						cohen: ck?.value,
						fleiss: c.fleissKappa,
						alpha: c.alphaNominal,
						alphaBinary: c.alphaBinary,
						cuAlpha: c.cuAlpha,
					});
				}
			}
		}
	}

	private allPairsFromScope(scope: ComparisonScope): [CoderId, CoderId][] {
		const pairs: [CoderId, CoderId][] = [];
		const ids = scope.coderIds;
		for (let i = 0; i < ids.length; i++)
			for (let j = i + 1; j < ids.length; j++)
				pairs.push([ids[i]!, ids[j]!]);
		return pairs;
	}

	private renderTable(): void {
		if (this.rows.length === 0) {
			const empty = this.contentEl.createDiv({ cls: 'qc-cc-empty' });
			if (this.prePost === 'pre' && this.state === 'single-pair' && this.options.pair) {
				const involvesConsensus = this.options.pair.some(id =>
					this.ctx.coderRegistry.getById(id)?.type === 'consensus',
				);
				if (involvesConsensus) {
					empty.setText('Par envolve consensus — alterne pra "pós" pra ver κ com consensus.');
					return;
				}
			}
			empty.setText('Sem markers no escopo pra comparar');
			return;
		}
		const banner = this.hasConsensusInScope()
			? this.contentEl.createDiv({ cls: 'qc-cc-modal-prepost-banner' })
			: null;
		if (banner) {
			banner.setText(this.prePost === 'pre'
				? 'visão pré-reconciliação — consensus excluído do κ (baseline humano-humano)'
				: 'visão pós-reconciliação — consensus incluído como coder adicional');
		}
		const table = this.contentEl.createEl('table', { cls: 'qc-cc-modal-table' });
		const thead = table.createEl('thead').createEl('tr');
		['par / engine', 'Cohen κ', 'Fleiss κ', 'α', 'α-binary', 'cu-α'].forEach(h => thead.createEl('th', { text: h }));
		const tbody = table.createEl('tbody');
		for (const r of this.rows) {
			const tr = tbody.createEl('tr');
			const label = r.engine === 'aggregate'
				? `${r.pair[0]} ↔ ${r.pair[1]}`
				: `↳ ${r.engine}`;
			tr.createEl('td', { text: label });
			[r.cohen, r.fleiss, r.alpha, r.alphaBinary, r.cuAlpha].forEach(v => {
				tr.createEl('td', { text: v !== undefined && !isNaN(v) ? v.toFixed(2) : '—' });
			});
		}
	}

	private renderDiagnostic(): void {
		if (!this.ctx.showNarrative) return;
		if (this.state !== 'single-pair') return;
		const aggregate = this.rows.find(r => r.engine === 'aggregate');
		if (!aggregate) return;
		const msgs = analyzeDiagnostic({
			cohen: aggregate.cohen,
			alphaBinary: aggregate.alphaBinary,
			cuAlpha: aggregate.cuAlpha,
		});
		if (msgs.length === 0) return;
		const box = this.contentEl.createDiv({ cls: 'qc-cc-modal-diagnostic' });
		msgs.forEach(m => box.createDiv({ text: m }));
	}

	private renderFooter(): void {
		const footer = this.contentEl.createDiv({ cls: 'qc-cc-modal-footer' });
		const exportBtn = footer.createEl('button', { text: '↧ exportar markdown' });
		exportBtn.onclick = () => {
			const md = this.exportMarkdown();
			if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
				void navigator.clipboard.writeText(md);
				new Notice('Markdown copiado pra clipboard');
			}
		};
		const closeBtn = footer.createEl('button', { text: 'Fechar' });
		closeBtn.onclick = () => this.close();
	}

	exportMarkdown(): string {
		const lines: string[] = [];
		const scope = this.effectiveScope();
		const view = this.hasConsensusInScope()
			? ` · visão ${this.prePost === 'pre' ? 'pré (sem consensus)' : 'pós (com consensus)'}`
			: '';
		lines.push(`# Coeficientes ICR · escopo ${scope.coderIds.join(', ')}${view}`);
		lines.push('');
		lines.push(`**Data:** ${new Date().toISOString()}`);
		lines.push('');
		lines.push('| par / engine | Cohen κ | Fleiss κ | α | α-binary | cu-α |');
		lines.push('|---|---|---|---|---|---|');
		for (const r of this.rows) {
			const label = r.engine === 'aggregate' ? `${r.pair[0]} ↔ ${r.pair[1]}` : `↳ ${r.engine}`;
			const fmt = (v: number | undefined) => v !== undefined && !isNaN(v) ? v.toFixed(2) : '—';
			lines.push(`| ${label} | ${fmt(r.cohen)} | ${fmt(r.fleiss)} | ${fmt(r.alpha)} | ${fmt(r.alphaBinary)} | ${fmt(r.cuAlpha)} |`);
		}
		return lines.join('\n');
	}
}
