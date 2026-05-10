/**
 * UnifiedIcrImportView — ItemView única que cobre todo o fluxo de import multi-coder
 * (Fase C P1). Layout: rail à esquerda (lista de contribuições pendentes + drop zone)
 * + main à direita (toolbar com chips + body que renderiza chip ativo).
 *
 * Reusa pattern qc-cc-mode-chip do unifiedCompareCodersView.ts.
 */

import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import type QualiaCodingPlugin from '../../../main';
import {
	createDefaultViewState,
	createEmptyOverrides,
	type IcrImportViewState,
	type PendingContribution,
} from './contributionViewTypes';
import { renderRailContent } from './rail';
import { parseContribution } from './contributionLoader';
import { mergeCoderContribution } from '../transport/mergeCoderContribution';

export const ICR_IMPORT_VIEW_TYPE = 'qc-icr-import';

export class UnifiedIcrImportView extends ItemView {
	private state: IcrImportViewState;

	private railEl!: HTMLElement;
	private mainEl!: HTMLElement;
	private toolbarEl!: HTMLElement;
	private bodyEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private plugin: QualiaCodingPlugin) {
		super(leaf);
		this.state = createDefaultViewState();
	}

	getViewType(): string { return ICR_IMPORT_VIEW_TYPE; }
	getDisplayText(): string { return 'ICR Import'; }
	getIcon(): string { return 'git-pull-request'; }

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('qc-icr-import-view');

		this.railEl = root.createDiv({ cls: 'qc-icr-import-rail' });
		this.mainEl = root.createDiv({ cls: 'qc-icr-import-main' });
		this.toolbarEl = this.mainEl.createDiv({ cls: 'qc-icr-import-toolbar' });
		this.bodyEl = this.mainEl.createDiv({ cls: 'qc-icr-import-body' });

		this.renderRail();
		this.renderMain();
		this.setupDropHandler();
	}

	private setupDropHandler(): void {
		const dropZone = this.railEl;

		this.registerDomEvent(dropZone, 'dragenter', (e: DragEvent) => {
			e.preventDefault();
			dropZone.addClass('is-drag-over');
		});
		this.registerDomEvent(dropZone, 'dragover', (e: DragEvent) => {
			e.preventDefault();
		});
		this.registerDomEvent(dropZone, 'dragleave', () => {
			dropZone.removeClass('is-drag-over');
		});
		this.registerDomEvent(dropZone, 'drop', async (e: DragEvent) => {
			e.preventDefault();
			dropZone.removeClass('is-drag-over');
			if (!e.dataTransfer) return;

			const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.json'));
			if (files.length === 0) {
				new Notice('ICR Import: só arquivos .json');
				return;
			}

			let lastValidId: string | null = null;
			for (const file of files) {
				const text = await file.text();
				const result = parseContribution(text);
				if (!result.payload) {
					new Notice(`${file.name}: ${result.errors.join('; ')}`);
					continue;
				}

				const overrides = createEmptyOverrides();
				const preview = await mergeCoderContribution(
					this.plugin.dataManager.getDataRef(),
					result.payload,
					this.plugin.sourceHashRegistry,
					{ dryRun: true, overrides },
				);

				const contrib: PendingContribution = {
					id: crypto.randomUUID(),
					payload: result.payload,
					sourcePath: file.name,
					mergePreview: preview,
					overrides,
				};
				this.addContribution(contrib);
				lastValidId = contrib.id;
			}

			if (lastValidId) {
				this.updateState({ activeId: lastValidId });
			}
		});
	}

	getViewState(): IcrImportViewState { return this.state; }

	updateState(partial: Partial<IcrImportViewState>): void {
		this.state = { ...this.state, ...partial };
		this.renderRail();
		this.renderMain();
	}

	addContribution(contrib: PendingContribution): void {
		this.state.pending = [...this.state.pending, contrib];
		if (!this.state.activeId) this.state.activeId = contrib.id;
		this.renderRail();
		this.renderMain();
	}

	private renderRail(): void {
		renderRailContent(
			this.railEl,
			this.state.pending,
			this.state.activeId,
			(id) => this.updateState({ activeId: id }),
		);
	}

	private renderMain(): void {
		this.toolbarEl.empty();
		this.bodyEl.empty();

		const active = this.state.pending.find(c => c.id === this.state.activeId);
		if (!active) {
			const empty = this.bodyEl.createDiv({ cls: 'qc-icr-empty' });
			empty.setText('selecione uma contribuição na lista');
			return;
		}

		// Stub — chips reais vêm em chunks 4-6
		const placeholder = this.bodyEl.createDiv();
		placeholder.setText(`active: ${this.state.activeId} · chip: ${this.state.activeChip}`);
	}
}
