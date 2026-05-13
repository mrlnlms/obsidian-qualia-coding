import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import type QualiaCodingPlugin from '../../../main';
import { runExportTrigger } from '../contributions/exportTrigger';
import { type CompareCodersViewState, createDefaultViewState, type CurrentSelection } from './compareCodersTypes';
import { computeDirty, snapshotSavable, snapshotLastUsed } from './compareCodersDirty';
import { CreateComparisonModal } from './createComparisonModal';
import { renderOverviewMatrix } from './overviewMatrix';
import { renderOverviewTable } from './overviewTable';
import { renderOverviewHeatmap } from './overviewHeatmap';
import { renderDrilldownSpatial } from './drilldownSpatial';
import { renderDrilldownCards } from './drilldownCards';
import { renderDrilldownWorkflow } from './drilldownWorkflow';
import { generateReconciliationReport } from './reconciliationReport';
import { collectContestedRegions, categorizeRegionsByStatus, bumpRegionsCacheGeneration } from './regionDerivation';
import { bumpCoderInclusionCacheGeneration } from './coderInclusion';
import { bumpReportCache } from '../reporter';
import { applyConsensusExclusion, getConsensusCoderIdsInScope } from './coderInclusion';
import { extractInputsFromScope } from './scopeExtraction';
import { reportPairwise } from '../reporter';
import type { CoderId } from '../coderTypes';
import { renderFilterChips } from './filterChips';
import { appendEntry } from '../../auditLog';
import type { AuditEntry } from '../../types';
import { renderCoefficientPicker } from './coefficientPicker';
import { getCodersWithMarkersInScope } from './coderInclusion';
import { CompareCoderCoefficientsModal } from './compareCoderCoefficientsModal';
import type { EngineModelsForExtraction } from './scopeExtraction';
import { bumpInputsCacheGeneration } from './scopeExtraction';
import type { EngineId } from '../reporter';

/** Invalida os 3 caches ICR (extractInputsFromScope, getCodersWithMarkersInScope,
 *  collectContestedRegions) quando markers mudam. Pattern unificado de invalidation. */
function bumpAllIcrCaches(): void {
	bumpInputsCacheGeneration();
	bumpCoderInclusionCacheGeneration();
	bumpRegionsCacheGeneration();
	bumpReportCache();
}

const ALL_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment', 'csvRow', 'audio', 'video', 'pdfShape', 'image'];

export const COMPARE_CODERS_VIEW_TYPE = 'qc-compare-coders';

export class UnifiedCompareCodersView extends ItemView {
	private state: CompareCodersViewState;

	private toolbarEl!: HTMLElement;
	private overviewEl!: HTMLElement;
	private drilldownEl!: HTMLElement;
	/** True quando state veio de `loadContextualCode` — onClose NÃO persiste em lastCompareCodersUsed
	 *  (estado contextual é gesto-específico, não deve poluir o fallback ephemeral). */
	private contextualMode = false;
	/** Bump a cada updateState — render async checa se o token mudou e aborta escrita stale.
	 *  Sem isso, 2 updateState próximos disparam 2 renders async; ambos `empty()` o container
	 *  no início mas escrevem na ordem de resolução do await — concorrência duplica conteúdo. */
	private renderToken = 0;
	/** Serializa renders async: clicks rápidos NÃO empilham trabalho concorrente (extractInputsFromScope
	 *  faz vault.cachedRead caro pra cada md). Sem isso, N clicks viram N renders paralelos competindo
	 *  pelo event loop — UI trava sob load. Token-guard descarta o trabalho stale ao final. */
	private renderQueue: Promise<void> = Promise.resolve();

	constructor(leaf: WorkspaceLeaf, private plugin: QualiaCodingPlugin) {
		super(leaf);
		// Default scope inclui TODOS coders (humanos + consensus). `applyCoderInclusion` remove
		// automaticamente coders sem markers (consensus pré-reconciliação cai aí). Chip "excluir
		// consensus" no toolbar permite ver κ pré (sem consensus) quando consensus tem markers.
		const allCoderIds = plugin.coderRegistry.getAll().map(c => c.id);
		const defaults = createDefaultViewState(allCoderIds);
		// Slice E4: tenta retomar última config ephemeral (não-saved) persistida no onClose anterior.
		const last = plugin.dataManager.getDataRef().lastCompareCodersUsed;
		if (last) {
			// scope.coderIds sempre vem do registry atual — coders criados após o último save
			// precisam aparecer como chips. Visibility on/off mora em filters.visibleCoderIds,
			// não no scope. Outras dimensões do scope (fileIds, codeIds, etc) preservam o snapshot.
			this.state = {
				...defaults,
				scope: { ...last.scope, coderIds: allCoderIds },
				overviewMode: last.view.overviewMode,
				drilldownMode: last.view.drilldownMode,
				primaryCoefficient: last.view.primaryCoefficient,
				filters: { ...last.filters },
			};
		} else {
			this.state = defaults;
		}
		// Limpa cache de extração — instâncias anteriores podem ter deixado resíduo.
		bumpAllIcrCaches();
	}

	getViewType(): string { return COMPARE_CODERS_VIEW_TYPE; }
	getDisplayText(): string { return 'Compare Coders'; }
	getIcon(): string { return 'users-2'; }

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('qc-compare-coders-view');

		this.toolbarEl = root.createDiv({ cls: 'qc-cc-toolbar' });
		this.renderToolbar();

		this.overviewEl = root.createDiv({ cls: 'qc-cc-overview' });
		root.createDiv({ cls: 'qc-cc-splitter' });
		this.drilldownEl = root.createDiv({ cls: 'qc-cc-drilldown' });

		await this.renderOverview(++this.renderToken);
		await this.renderDrilldown();
	}

	/** Slice E4 — persiste lastCompareCodersUsed só quando state é ephemeral (não vem de saved).
	 *  Saved já é persistido via registry mutate listener. Contextual NÃO persiste — senão
	 *  reload fica preso no scope filtrado de 1 código sem banner pra desfazer. */
	async onClose(): Promise<void> {
		if (this.state.loadedFromSavedId) return;
		if (this.contextualMode) return;
		this.plugin.dataManager.setSection('lastCompareCodersUsed', snapshotLastUsed(this.state));
	}

	/** Acessor pra estado central — `getState` é reservado em View do Obsidian. */
	getCompareState(): CompareCodersViewState { return this.state; }

	/** Mutate state + re-render. updateState chain é ok pra E1; E2 considera partial re-render.
	 *  Slice E4: quando state vem de saved, recalcula isDirty comparando com o saved atual. */
	updateState(partial: Partial<CompareCodersViewState>): void {
		this.state = { ...this.state, ...partial };
		this.refreshDirtyFlag();
		const token = ++this.renderToken;
		this.renderToolbar();
		void this.renderOverview(token);
		void this.renderDrilldown();
	}

	private refreshDirtyFlag(): void {
		const id = this.state.loadedFromSavedId;
		if (!id) {
			if (this.state.isDirty) this.state = { ...this.state, isDirty: false };
			return;
		}
		const saved = this.plugin.comparisonRegistry?.getById(id);
		if (!saved) {
			// Saved foi deletado em outro fluxo — descarta o vínculo, state vira ephemeral.
			this.state = { ...this.state, loadedFromSavedId: undefined, isDirty: false };
			return;
		}
		const dirty = computeDirty(this.state, saved);
		if (dirty !== this.state.isDirty) {
			this.state = { ...this.state, isDirty: dirty };
		}
	}

	/** Atalho contextual do codebook (Slice E4 §8.3): foca em 1 código específico, todos coders,
	 *  table mode pra ver κ-por-código. Estado ephemeral — não persiste em lastCompareCodersUsed
	 *  (senão reload fica preso no scope filtrado sem maneira óbvia de voltar ao default). */
	loadContextualCode(codeId: string): void {
		const allCoderIds = this.plugin.coderRegistry.getAll().map(c => c.id);
		bumpAllIcrCaches();
		this.state = {
			scope: { coderIds: allCoderIds, codeIds: [codeId] },
			overviewMode: 'table',
			drilldownMode: 'spatial',
			primaryCoefficient: 'cohen',
			filters: {
				hideAgreementTotal: false,
				highlightConflicts: false,
				excludeConsensusCoders: false,
			},
			currentSelection: { kind: 'none' },
			isDirty: false,
		};
		this.contextualMode = true;
		const token = ++this.renderToken;
		this.renderToolbar();
		void this.renderOverview(token);
		void this.renderDrilldown();
	}

	/** Carrega config de um SavedComparison no state, setta `loadedFromSavedId` e re-renderiza.
	 *  Slice E4. Cache invalidado por mudança de scope. Dirty detection vem no Chunk 3. */
	loadFromSaved(comparisonId: string): boolean {
		const saved = this.plugin.comparisonRegistry?.getById(comparisonId);
		if (!saved) return false;
		bumpAllIcrCaches();
		const allCoderIds = this.plugin.coderRegistry.getAll().map(c => c.id);
		this.state = {
			scope: { ...saved.scope, coderIds: allCoderIds },
			overviewMode: saved.view.overviewMode,
			drilldownMode: saved.view.drilldownMode,
			primaryCoefficient: saved.view.primaryCoefficient,
			filters: { ...saved.filters },
			currentSelection: { kind: 'none' },
			loadedFromSavedId: comparisonId,
			isDirty: false,
		};
		const token = ++this.renderToken;
		this.renderToolbar();
		void this.renderOverview(token);
		void this.renderDrilldown();
		return true;
	}

	private renderSavedBanner(): void {
		const id = this.state.loadedFromSavedId;
		const saved = id ? this.plugin.comparisonRegistry?.getById(id) : undefined;
		// Sem saved carregado: oferecer "Salvar como nova" se houver state divergente dos defaults?
		// V1 — banner só aparece quando há saved carregado (saved-mode). Ephemeral fica na lastUsed.
		if (!saved) return;

		const banner = this.toolbarEl.createDiv({ cls: 'qc-cc-saved-banner' });
		const label = banner.createSpan({ cls: 'qc-cc-saved-label' });
		if (this.state.isDirty) label.createSpan({ cls: 'qc-cc-saved-dirty-dot', text: '●' });
		label.createSpan({ cls: 'qc-cc-saved-name', text: saved.name });

		const actions = banner.createSpan({ cls: 'qc-cc-saved-actions' });
		if (this.state.isDirty) {
			const saveBtn = actions.createEl('button', { cls: 'qc-cc-saved-btn', text: 'Salvar mudanças' });
			saveBtn.onclick = () => this.persistChangesToSaved();
		}
		const saveAsNewBtn = actions.createEl('button', { cls: 'qc-cc-saved-btn', text: 'Salvar como nova' });
		saveAsNewBtn.onclick = () => this.openSaveAsNewModal();
		const detachBtn = actions.createEl('button', { cls: 'qc-cc-saved-btn qc-cc-saved-detach', text: '✕ desvincular' });
		detachBtn.title = 'Detacha esta view do saved (state vira ephemeral).';
		detachBtn.onclick = () => this.detachFromSaved();
	}

	private persistChangesToSaved(): void {
		const id = this.state.loadedFromSavedId;
		if (!id) return;
		const snap = snapshotSavable(this.state);
		this.plugin.comparisonRegistry.update(id, { scope: snap.scope, view: snap.view, filters: snap.filters });
		this.state = { ...this.state, isDirty: false };
		this.renderToolbar();
		new Notice('Saved comparison atualizada.');
	}

	private openSaveAsNewModal(): void {
		const snap = snapshotSavable(this.state);
		new CreateComparisonModal({
			app: this.plugin.app,
			registry: this.plugin.comparisonRegistry,
			coderRegistry: this.plugin.coderRegistry,
			initialState: { scope: snap.scope, view: snap.view, filters: snap.filters },
			onCreated: (cmp) => { this.loadFromSaved(cmp.id); },
		}).open();
	}

	private detachFromSaved(): void {
		this.state = { ...this.state, loadedFromSavedId: undefined, isDirty: false };
		this.renderToolbar();
	}

	private renderToolbar(): void {
		this.toolbarEl.empty();
		this.renderSavedBanner();
		const modeGroup = this.toolbarEl.createSpan({ cls: 'qc-cc-mode-group' });
		modeGroup.createSpan({ cls: 'qc-cc-mode-label', text: 'overview' });
		const modeRow = modeGroup.createSpan({ cls: 'qc-cc-mode-row' });
		for (const mode of ['matrix', 'table', 'heatmap'] as const) {
			const chip = modeRow.createSpan({
				cls: `qc-cc-mode-chip ${this.state.overviewMode === mode ? 'is-active' : ''}`,
				text: this.modeLabel(mode),
			});
			chip.onclick = () => this.updateState({ overviewMode: mode });
		}
		this.toolbarEl.createDiv({
			cls: 'qc-cc-mode-question',
			text: this.modeQuestion(this.state.overviewMode),
		});

		// Drill-down mode picker (E3a entrega `cards`; E3b entrega `workflow`).
		const drillGroup = this.toolbarEl.createSpan({ cls: 'qc-cc-mode-group' });
		drillGroup.createSpan({ cls: 'qc-cc-mode-label', text: 'drill-down' });
		const drillRow = drillGroup.createSpan({ cls: 'qc-cc-mode-row' });
		for (const mode of ['spatial', 'cards', 'workflow'] as const) {
			const chip = drillRow.createSpan({
				cls: `qc-cc-mode-chip ${this.state.drilldownMode === mode ? 'is-active' : ''}`,
				text: this.drilldownLabel(mode),
			});
			chip.onclick = () => this.updateState({ drilldownMode: mode });
		}
		this.toolbarEl.createDiv({
			cls: 'qc-cc-mode-question',
			text: this.drilldownQuestion(this.state.drilldownMode),
		});

		const pickerHolder = this.toolbarEl.createDiv({ cls: 'qc-cc-picker-row' });
		const enginesInScope = this.state.filters.visibleEngineIds
			?? this.state.scope.engineIds
			?? ALL_ENGINES;
		renderCoefficientPicker(
			pickerHolder,
			this.state,
			{ enginesInScope },
			coefficient => this.updateState({ primaryCoefficient: coefficient }),
		);

		const sideBtn = pickerHolder.createEl('button', { cls: 'qc-cc-side-btn', text: '↗ ver lado a lado' });
		sideBtn.onclick = () => this.openSideBySideModal();

		const exportBtn = pickerHolder.createEl('button', { cls: 'qc-cc-side-btn', text: '↗ exportar contribuição' });
		exportBtn.onclick = () => { void runExportTrigger(this.plugin); };

		const chipsHolder = this.toolbarEl.createDiv();
		const codersWithMarkers = new Set(getCodersWithMarkersInScope(this.state.scope, this.engineModels()));
		renderFilterChips(
			chipsHolder,
			this.state,
			{ coderRegistry: this.plugin.coderRegistry, codersWithMarkers },
			partial => this.updateState(partial),
		);
	}

	private modeLabel(mode: 'matrix' | 'table' | 'heatmap'): string {
		return { matrix: '▦ Matriz', table: '▤ Tabela', heatmap: '▥ Heatmap' }[mode];
	}

	private modeQuestion(mode: 'matrix' | 'table' | 'heatmap'): string {
		return {
			matrix: 'qual par de coders diverge mais?',
			table: 'qual código está frágil?',
			heatmap: 'em qual modalidade mora a discordância?',
		}[mode];
	}

	private drilldownLabel(mode: 'spatial' | 'cards' | 'workflow'): string {
		return { spatial: '🗺 Spatial', cards: '🃏 Cards', workflow: '📋 Workflow' }[mode];
	}

	private drilldownQuestion(mode: 'spatial' | 'cards' | 'workflow'): string {
		return {
			spatial: '#1 onde discordamos? · #2 que tipo?',
			cards: '#3 o que cada um leu? · #4 por que diferimos?',
			workflow: '#5 como reconcilio? · #6 como fica registrado?',
		}[mode];
	}

	private renderOverview(token: number): Promise<void> {
		// Encadeia neste queue: cada render espera o anterior. Skipa stale token ANTES de
		// começar o trabalho async caro (extractInputsFromScope itera todos engines + vault.cachedRead).
		this.renderQueue = this.renderQueue.then(async () => {
			if (token !== this.renderToken) return; // skip — newer click já chegou
			const scratch = document.createDocumentFragment();
			const wrap = document.createElement('div');
			scratch.appendChild(wrap);
			const deps = {
				coderRegistry: this.plugin.coderRegistry,
				engineModels: this.engineModels(),
				app: this.plugin.app,
			};
			if (this.state.overviewMode === 'matrix') {
				await renderOverviewMatrix(wrap, this.state, deps, sel => this.setSelection(sel));
			} else if (this.state.overviewMode === 'table') {
				await renderOverviewTable(
					wrap,
					this.state,
					{ ...deps, codeRegistry: this.plugin.sharedRegistry },
					sel => this.setSelection(sel),
				);
			} else {
				await renderOverviewHeatmap(
					wrap,
					this.state,
					{ ...deps, codeRegistry: this.plugin.sharedRegistry },
					sel => this.setSelection(sel),
				);
			}
			if (token !== this.renderToken) return; // ainda stale (chegou outro click durante await)
			this.overviewEl.empty();
			while (wrap.firstChild) this.overviewEl.appendChild(wrap.firstChild);
		});
		return this.renderQueue;
	}

	private engineModels(): EngineModelsForExtraction {
		return {
			markdown: this.plugin.markdownModel,
			pdf: this.plugin.pdfModel,
			csv: this.plugin.csvModel,
			audio: this.plugin.audioModel,
			video: this.plugin.videoModel,
			image: this.plugin.imageModel,
		};
	}

	private async renderDrilldown(): Promise<void> {
		this.drilldownEl.empty();
		if (this.state.drilldownMode === 'spatial') {
			renderDrilldownSpatial(this.drilldownEl, this.state, {
				coderRegistry: this.plugin.coderRegistry,
				codeRegistry: this.plugin.sharedRegistry,
				engineModels: this.engineModels(),
				app: this.plugin.app,
			});
			return;
		}
		if (this.state.drilldownMode === 'cards') {
			if (!this.plugin.icrMarkerOps) {
				this.drilldownEl.createDiv({ text: 'IcrMarkerOps não inicializado', cls: 'qc-cc-stub' });
				return;
			}
			const auditLog = (this.plugin.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
			renderDrilldownCards(
				this.drilldownEl,
				this.state,
				{
					coderRegistry: this.plugin.coderRegistry,
					codeRegistry: this.plugin.sharedRegistry,
					engineModels: this.engineModels(),
					markerOps: this.plugin.icrMarkerOps,
					auditLog,
					persistAuditLog: log => this.plugin.dataManager.setSection('auditLog', log),
					app: this.plugin.app,
				},
				{
					onSetSelection: sel => this.setSelection(sel),
					onAfterReconciliation: partial => {
						// Reconciliação mudou markers → cache de extração fica stale.
						bumpAllIcrCaches();
						// Update consolidado: reset seleção + flush state em UM render
						// (renderOverview é async; 2 chamadas seguidas causaram race + matriz duplicada).
						this.updateState(partial);
					},
				},
			);
			return;
		}
		// drilldownMode === 'workflow' — P3 queue
		if (!this.plugin.icrMarkerOps) {
			this.drilldownEl.createDiv({ text: 'IcrMarkerOps não inicializado', cls: 'qc-cc-stub' });
			return;
		}
		const auditLog = (this.plugin.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
		renderDrilldownWorkflow(
			this.drilldownEl,
			this.state,
			{
				coderRegistry: this.plugin.coderRegistry,
				codeRegistry: this.plugin.sharedRegistry,
				engineModels: this.engineModels(),
				markerOps: this.plugin.icrMarkerOps,
				auditLog,
				persistAuditLog: log => this.plugin.dataManager.setSection('auditLog', log),
				app: this.plugin.app,
				onExportReport: () => this.exportReconciliationReport(),
			},
			{
				onSetSelection: sel => this.setSelection(sel),
				onSetDrilldownMode: mode => this.updateState({ drilldownMode: mode }),
				onAfterReconciliation: partial => {
					bumpAllIcrCaches();
					this.updateState(partial);
				},
			},
		);
	}

	/** Gera markdown estruturado do P3 e copia pra clipboard. Inclui κ pré/pós quando
	 *  consensus coder está presente no scope (kappaPre = sem consensus, kappaPost = com). */
	private async exportReconciliationReport(): Promise<void> {
		const auditLog = (this.plugin.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
		const regions = collectContestedRegions(this.state, this.engineModels());
		const byStatus = categorizeRegionsByStatus(regions, auditLog);
		const hasConsensus = getConsensusCoderIdsInScope(this.state.scope, this.plugin.coderRegistry).length > 0;

		const computeKappa = async (scope: typeof this.state.scope): Promise<{ byPair: Record<string, number | undefined> } | undefined> => {
			if (scope.coderIds.length < 2) return undefined;
			const inputs = await extractInputsFromScope(scope, { models: this.engineModels(), app: this.plugin.app });
			if (inputs.length === 0) return undefined;
			const pairs: [CoderId, CoderId][] = [];
			for (let i = 0; i < scope.coderIds.length; i++)
				for (let j = i + 1; j < scope.coderIds.length; j++)
					pairs.push([scope.coderIds[i]!, scope.coderIds[j]!]);
			if (pairs.length === 0) return undefined;
			const reports = reportPairwise(inputs, pairs);
			const byPair: Record<string, number | undefined> = {};
			for (const r of reports) {
				const [a, b] = r.pair;
				const key = a < b ? `${a}|${b}` : `${b}|${a}`;
				const entry = r.report.aggregate.cohenKappa[`${a}|${b}`] ?? r.report.aggregate.cohenKappa[`${b}|${a}`];
				byPair[key] = entry?.value;
			}
			return { byPair };
		};

		const kappaPost = hasConsensus ? await computeKappa(this.state.scope) : undefined;
		const kappaPre = hasConsensus
			? await computeKappa(applyConsensusExclusion(this.state.scope, this.plugin.coderRegistry, true))
			: undefined;

		const md = generateReconciliationReport({
			scope: this.state.scope,
			byStatus,
			auditLog,
			coderRegistry: this.plugin.coderRegistry,
			codeRegistry: this.plugin.sharedRegistry,
			kappaPre,
			kappaPost,
		});

		if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
			void navigator.clipboard.writeText(md);
			new Notice('Relatório de reconciliação copiado pra clipboard');
		} else {
			new Notice('Clipboard indisponível — relatório no console');
			// eslint-disable-next-line no-console
			console.log(md);
		}
	}

	/** Selection change hook — chamado por overview ao clicar célula/linha.
	 *
	 *  CRÍTICO pra perf: selection muda APENAS o que o drill-down mostra. Overview/toolbar/
	 *  filter chips não dependem dela visualmente (matriz não destaca célula selecionada via state;
	 *  filter chips mostram scope que é independente). Skipar renderToolbar + renderOverview aqui
	 *  evita re-execução de extractInputsFromScope (vault.cachedRead caro) + reportPairwise a cada
	 *  click — vault grande travava por isso. updateState full continua sendo usado em mudanças
	 *  reais de state (mode swap, filter toggle, reconciliação). */
	setSelection(sel: CurrentSelection): void {
		this.state = { ...this.state, currentSelection: sel };
		void this.renderDrilldown();
	}

	private openSideBySideModal(): void {
		const sel = this.state.currentSelection;
		const isPair = sel.kind === 'pair';
		const general = this.plugin.dataManager.section('general');
		new CompareCoderCoefficientsModal(
			this.plugin.app,
			this.state.scope,
			{
				models: this.engineModels(),
				app: this.plugin.app,
				showNarrative: general.showNarrativeDiagnosis ?? true,
				coderRegistry: this.plugin.coderRegistry,
			},
			{
				initial: isPair ? 'single-pair' : 'all-pairs',
				pair: isPair ? sel.value : undefined,
			},
		).open();
	}
}
