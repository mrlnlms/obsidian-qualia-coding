import { App, Modal, Setting, TextComponent } from 'obsidian';
import type { ComparisonRegistry } from '../comparisonRegistry';
import type { CoderRegistry } from '../coderRegistry';
import type {
	ComparisonScope,
	ComparisonFilters,
	SavedComparisonView,
	SavedComparison,
} from './compareCodersTypes';
import { createDefaultViewState } from './compareCodersTypes';

export interface CreateComparisonOptions {
	app: App;
	registry: ComparisonRegistry;
	coderRegistry: CoderRegistry;
	/** Estado inicial pra pré-preencher (Chunk 3: "Salvar como nova" do view).
	 *  Quando undefined, usa defaults (all coders + matrix/spatial/cohen + filters default). */
	initialState?: {
		scope: ComparisonScope;
		view: SavedComparisonView;
		filters: ComparisonFilters;
	};
	/** Chamado após create. Caller decide o que fazer (geralmente openCompareCodersView com id). */
	onCreated: (cmp: SavedComparison) => void;
}

/**
 * Modal pra criar saved comparison (Slice E4). V1 minimalista: input de nome + create
 * com defaults (ou initialState quando "Salvar como nova" passa o estado da view).
 *
 * Scope picker rico (4 chips multiselect — coders/codes/engines/files) fica em backlog —
 * a UX final passa por ajustar filtros dentro da própria view depois do create.
 */
export class CreateComparisonModal extends Modal {
	private name = '';
	private opts: CreateComparisonOptions;

	constructor(opts: CreateComparisonOptions) {
		super(opts.app);
		this.opts = opts;
	}

	onOpen() {
		this.modalEl.addClass('qc-cmp-create-modal');
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Nova comparison' });
		contentEl.createDiv({
			cls: 'qc-cmp-create-hint',
			text: 'Dá um nome. Você ajusta filtros e modes na view depois.',
		});

		let input: TextComponent;
		new Setting(contentEl)
			.setName('Nome')
			.addText(t => {
				input = t;
				t.setPlaceholder('Ex.: Piloto 2026')
					.onChange(v => { this.name = v; });
				t.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.submit();
					}
				});
			});

		const actions = contentEl.createDiv('cm-form-actions');
		actions.createEl('button', { text: 'Cancel' })
			.addEventListener('click', () => this.close());
		actions.createEl('button', { text: 'Create', cls: 'mod-cta' })
			.addEventListener('click', () => this.submit());

		setTimeout(() => {
			input!.inputEl.focus();
			input!.inputEl.select();
		}, 50);
	}

	private submit() {
		const trimmed = this.name.trim();
		if (!trimmed) return;

		const seed = this.opts.initialState ?? this.defaultSeed();
		const cmp = this.opts.registry.create({
			name: trimmed,
			scope: seed.scope,
			view: seed.view,
			filters: seed.filters,
		});
		this.close();
		this.opts.onCreated(cmp);
	}

	private defaultSeed(): { scope: ComparisonScope; view: SavedComparisonView; filters: ComparisonFilters } {
		const allCoderIds = this.opts.coderRegistry.getAll().map(c => c.id);
		const defaults = createDefaultViewState(allCoderIds);
		return {
			scope: defaults.scope,
			view: {
				overviewMode: defaults.overviewMode,
				drilldownMode: defaults.drilldownMode,
				primaryCoefficient: defaults.primaryCoefficient,
			},
			filters: defaults.filters,
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}
