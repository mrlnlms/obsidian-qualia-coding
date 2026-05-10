import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type QualiaCodingPlugin from '../../../main';
import { type CompareCodersViewState, createDefaultViewState, type CurrentSelection } from './compareCodersTypes';
import { renderOverviewMatrix } from './overviewMatrix';
import { renderOverviewTable } from './overviewTable';
import { renderOverviewHeatmap } from './overviewHeatmap';
import { renderDrilldownSpatial } from './drilldownSpatial';
import { renderFilterChips } from './filterChips';
import { renderCoefficientPicker } from './coefficientPicker';
import { getCodersWithMarkersInScope } from './coderInclusion';
import { CompareCoderCoefficientsModal } from './compareCoderCoefficientsModal';
import type { EngineModelsForExtraction } from './scopeExtraction';
import type { EngineId } from '../reporter';

const ALL_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment', 'csvRow', 'audio', 'video', 'pdfShape', 'image'];

export const COMPARE_CODERS_VIEW_TYPE = 'qc-compare-coders';

export class UnifiedCompareCodersView extends ItemView {
	private state: CompareCodersViewState;

	private toolbarEl!: HTMLElement;
	private overviewEl!: HTMLElement;
	private drilldownEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private plugin: QualiaCodingPlugin) {
		super(leaf);
		const allCoderIds = plugin.coderRegistry.getAll().map(c => c.id);
		this.state = createDefaultViewState(allCoderIds);
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

		await this.renderOverview();
		await this.renderDrilldown();
	}

	/** Acessor pra estado central — `getState` é reservado em View do Obsidian. */
	getCompareState(): CompareCodersViewState { return this.state; }

	/** Mutate state + re-render. updateState chain é ok pra E1; E2 considera partial re-render. */
	updateState(partial: Partial<CompareCodersViewState>): void {
		this.state = { ...this.state, ...partial };
		this.renderToolbar();
		void this.renderOverview();
		void this.renderDrilldown();
	}

	private renderToolbar(): void {
		this.toolbarEl.empty();
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

	private async renderOverview(): Promise<void> {
		this.overviewEl.empty();
		const deps = {
			coderRegistry: this.plugin.coderRegistry,
			engineModels: this.engineModels(),
			app: this.plugin.app,
		};
		if (this.state.overviewMode === 'matrix') {
			await renderOverviewMatrix(this.overviewEl, this.state, deps, sel => this.setSelection(sel));
			return;
		}
		if (this.state.overviewMode === 'table') {
			await renderOverviewTable(
				this.overviewEl,
				this.state,
				{ ...deps, codeRegistry: this.plugin.sharedRegistry },
				sel => this.setSelection(sel),
			);
			return;
		}
		await renderOverviewHeatmap(
			this.overviewEl,
			this.state,
			{ ...deps, codeRegistry: this.plugin.sharedRegistry },
			sel => this.setSelection(sel),
		);
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
		if (this.state.drilldownMode !== 'spatial') {
			this.drilldownEl.createDiv({ text: 'Perspectiva disponível em E3', cls: 'qc-cc-stub' });
			return;
		}
		renderDrilldownSpatial(this.drilldownEl, this.state, {
			coderRegistry: this.plugin.coderRegistry,
			codeRegistry: this.plugin.sharedRegistry,
			engineModels: this.engineModels(),
			app: this.plugin.app,
		});
	}

	/** Selection change hook — chamado por overview ao clicar célula/linha. */
	setSelection(sel: CurrentSelection): void {
		this.updateState({ currentSelection: sel });
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
			},
			{
				initial: isPair ? 'single-pair' : 'all-pairs',
				pair: isPair ? sel.value : undefined,
			},
		).open();
	}
}
