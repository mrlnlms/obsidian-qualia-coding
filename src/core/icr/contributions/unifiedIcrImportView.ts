/**
 * UnifiedIcrImportView — ItemView única que cobre todo o fluxo de import multi-coder
 * (Fase C P1). Layout: rail à esquerda (lista de contribuições pendentes + drop zone)
 * + main à direita (toolbar com chips + body que renderiza chip ativo).
 *
 * Reusa pattern qc-cc-mode-chip do unifiedCompareCodersView.ts.
 */

import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type QualiaCodingPlugin from '../../../main';
import {
	createDefaultViewState,
	type IcrImportViewState,
	type PendingContribution,
} from './contributionViewTypes';
import { renderRailContent } from './rail';

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
