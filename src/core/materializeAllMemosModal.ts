import { Modal, Setting } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import {
	categorize,
	collectAllMemoRefs,
	materializeBatch,
	type BatchProgress,
	type BatchResult,
	type BatchSelection,
	type MemoKind,
} from './memoBatchMaterializer';

const KIND_LABELS: Record<MemoKind, string> = {
	'code': 'Codes',
	'group': 'Groups',
	'marker': 'Markers (segments)',
	'relation-code': 'Relations (code-level)',
	'relation-app': 'Relations (segment-level)',
	'smartCode': 'Smart Codes',
};

const ALL_KINDS: MemoKind[] = ['code', 'group', 'marker', 'relation-code', 'relation-app', 'smartCode'];

/**
 * Field name `selection` colide com algo no protótipo de Modal/Component do Obsidian
 * (atribuição no constructor é sobrescrita antes do onOpen rodar). Usar `batchOptions`.
 */
export class MaterializeAllMemosModal extends Modal {
	private batchOptions: BatchSelection;
	private all: ReturnType<typeof collectAllMemoRefs>;
	private previewEl!: HTMLElement;
	private warningEl!: HTMLElement;
	private materializeBtn!: HTMLButtonElement;

	constructor(private plugin: QualiaCodingPlugin) {
		super(plugin.app);
		this.batchOptions = {
			kinds: {
				'code': true,
				'group': true,
				'marker': true,
				'relation-code': true,
				'relation-app': true,
				'smartCode': true,
			},
			includeEmpty: false,
			overwriteExisting: false,
		};
		this.all = [];
	}

	onOpen(): void {
		this.modalEl.addClass('codemarker-dialog');
		this.modalEl.addClass('qualia-materialize-all-memos');
		this.all = collectAllMemoRefs(this.plugin);
		this.renderForm();
	}

	// ── Estado: formulário ──────────────────────────────
	private renderForm(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Materialize all memos' });
		contentEl.createEl('p', {
			text: 'Convert inline memos into .md notes in your vault. Re-run anytime to update or fill gaps.',
			cls: 'setting-item-description',
		});

		contentEl.createEl('h4', { text: 'Memo types' });
		const typesEl = contentEl.createDiv('qualia-materialize-types');
		for (const kind of ALL_KINDS) {
			new Setting(typesEl)
				.setName(KIND_LABELS[kind])
				.addToggle((t) => {
					t.setValue(this.batchOptions.kinds[kind]);
					t.onChange((v) => {
						this.batchOptions.kinds[kind] = v;
						this.refreshPreview();
					});
				});
		}

		contentEl.createEl('h4', { text: 'Options' });

		new Setting(contentEl)
			.setName('Include empty memos')
			.setDesc('Create .md notes even for memos with no content yet.')
			.addToggle((t) => {
				t.setValue(this.batchOptions.includeEmpty);
				t.onChange((v) => {
					this.batchOptions.includeEmpty = v;
					this.refreshPreview();
				});
			});

		new Setting(contentEl)
			.setName('Overwrite existing notes')
			.setDesc('Re-write notes that are already materialized. Replaces .md content with the current memo from data.json.')
			.addToggle((t) => {
				t.setValue(this.batchOptions.overwriteExisting);
				t.onChange((v) => {
					this.batchOptions.overwriteExisting = v;
					this.refreshPreview();
				});
			});

		contentEl.createEl('h4', { text: 'Preview' });
		this.previewEl = contentEl.createDiv('qualia-materialize-preview');

		this.warningEl = contentEl.createDiv('qualia-materialize-warning');

		const actions = contentEl.createDiv('cm-form-actions');
		actions.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		this.materializeBtn = actions.createEl('button', { cls: 'mod-cta' });
		this.materializeBtn.addEventListener('click', () => void this.runBatch());

		this.refreshPreview();
	}

	private refreshPreview(): void {
		const preview = categorize(this.all, this.batchOptions);
		this.previewEl.empty();

		const stats = this.previewEl.createEl('ul');
		const addLine = (n: number, label: string, muted = false) => {
			if (n === 0) return;
			stats.createEl('li', {
				text: `${n} ${label}`,
				cls: muted ? 'qualia-materialize-preview-muted' : '',
			});
		};

		addLine(preview.toCreate.length, preview.toCreate.length === 1 ? 'note will be created' : 'notes will be created');
		addLine(preview.toOverwrite.length, preview.toOverwrite.length === 1 ? 'note will be overwritten' : 'notes will be overwritten');
		addLine(preview.alreadyUpToDate, 'already materialized (skipped)', true);
		addLine(preview.emptySkipped, 'empty (skipped)', true);

		if (preview.toCreate.length + preview.toOverwrite.length === 0) {
			stats.createEl('li', { text: 'Nothing to do with the current selection.', cls: 'qualia-materialize-preview-muted' });
		}

		this.warningEl.empty();
		if (preview.toOverwrite.length > 0) {
			this.warningEl.setText(`⚠ Overwriting will replace the content of ${preview.toOverwrite.length} existing note${preview.toOverwrite.length === 1 ? '' : 's'} with the memo currently stored in data.json.`);
		}

		const total = preview.toCreate.length + preview.toOverwrite.length;
		this.materializeBtn.disabled = total === 0;
		const verb = preview.toOverwrite.length > 0 && preview.toCreate.length === 0 ? 'Overwrite' : 'Materialize';
		this.materializeBtn.setText(total > 0 ? `${verb} ${total}` : 'Materialize');
	}

	// ── Estado: progresso ───────────────────────────────
	private async runBatch(): Promise<void> {
		const preview = categorize(this.all, this.batchOptions);
		const total = preview.toCreate.length + preview.toOverwrite.length;
		if (total === 0) return;

		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: 'Materializing memos…' });

		const status = contentEl.createDiv('qualia-materialize-progress-status');
		const bar = contentEl.createDiv('qualia-materialize-progress-bar');
		const fill = bar.createDiv('qualia-materialize-progress-fill');
		const counter = contentEl.createDiv('qualia-materialize-progress-counter');

		const onProgress = (p: BatchProgress) => {
			status.setText(p.label);
			counter.setText(`${p.current} / ${p.total}`);
			fill.style.width = `${(p.current / p.total) * 100}%`;
		};

		const result = await materializeBatch(this.plugin, preview, onProgress);
		this.renderResults(result, preview.alreadyUpToDate, preview.emptySkipped);
	}

	// ── Estado: resultados ──────────────────────────────
	private renderResults(result: BatchResult, alreadyUpToDate: number, emptySkipped: number): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Done' });

		const list = contentEl.createEl('ul', { cls: 'qualia-materialize-results' });
		const line = (icon: string, text: string, cls = '') => {
			const li = list.createEl('li', { cls });
			li.createSpan({ text: icon, cls: 'qualia-materialize-results-icon' });
			li.createSpan({ text });
		};

		if (result.created > 0) line('✓', `${result.created} note${result.created === 1 ? '' : 's'} created`);
		if (result.overwritten > 0) line('↻', `${result.overwritten} note${result.overwritten === 1 ? '' : 's'} overwritten`);
		if (alreadyUpToDate > 0) line('•', `${alreadyUpToDate} already materialized`, 'qualia-materialize-preview-muted');
		if (emptySkipped > 0) line('•', `${emptySkipped} empty (skipped)`, 'qualia-materialize-preview-muted');
		if (result.failed.length > 0) line('✗', `${result.failed.length} failed`, 'qualia-materialize-results-failed');

		if (result.failed.length > 0) {
			const details = contentEl.createEl('details', { cls: 'qualia-materialize-results-details' });
			details.createEl('summary', { text: 'Show failures' });
			const errList = details.createEl('ul');
			for (const f of result.failed) {
				errList.createEl('li', { text: f.error });
			}
		}

		const actions = contentEl.createDiv('cm-form-actions');
		actions.createEl('button', { text: 'Close', cls: 'mod-cta' })
			.addEventListener('click', () => this.close());
	}
}
