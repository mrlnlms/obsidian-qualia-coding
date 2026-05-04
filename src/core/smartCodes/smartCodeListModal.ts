import { App, Modal, setIcon } from 'obsidian';
import type { SmartCodeDefinition } from './types';
import type { SmartCodeApi } from './smartCodeRegistryApi';
import type { SmartCodeCache } from './cache';
import type { CodeDefinitionRegistry } from '../codeDefinitionRegistry';
import type { CaseVariablesRegistry } from '../caseVariables/caseVariablesRegistry';
import type { AuditEntry } from '../types';
import { SmartCodeBuilderModal } from './builderModal';
import { renderSmartCodeDetail } from './detailSmartCodeRenderer';

export interface SmartCodeListConfig {
	app: App;
	smartCodeApi: SmartCodeApi;
	smartCodeCache: SmartCodeCache;
	registry: CodeDefinitionRegistry;
	caseVarsRegistry: CaseVariablesRegistry;
	getAuditLog: () => AuditEntry[];
}

/** Hub modal pra Smart Codes — lista + new + click abre detail. */
export class SmartCodeListModal extends Modal {
	private currentDetailId: string | null = null;

	constructor(private cfg: SmartCodeListConfig) {
		super(cfg.app);
	}

	onOpen() {
		this.modalEl.addClass('qc-sc-list-modal');
		this.titleEl.setText('⚡ Smart Codes');
		this.render();
	}

	private render(): void {
		this.contentEl.empty();
		if (this.currentDetailId) this.renderDetail(this.currentDetailId);
		else this.renderList();
	}

	private renderList(): void {
		const all = this.cfg.smartCodeApi.listSmartCodes();
		if (all.length === 0) {
			this.contentEl.createDiv({ text: 'No smart codes yet.', cls: 'qc-sc-list-empty' });
		} else {
			const listEl = this.contentEl.createDiv({ cls: 'qc-sc-list' });
			for (const sc of all) {
				const row = listEl.createDiv({ cls: 'qc-sc-list-row' });
				const swatch = row.createSpan({ cls: 'qc-sc-list-swatch' });
				swatch.style.backgroundColor = sc.color;
				row.createSpan({ text: '⚡ ', cls: 'qc-sc-icon' });
				row.createSpan({ text: sc.name, cls: 'qc-sc-list-name' });
				const isDirty = this.cfg.smartCodeCache.isDirty(sc.id);
				const count = isDirty ? '…' : String(this.cfg.smartCodeCache.getCount(sc.id));
				row.createSpan({ text: count, cls: 'qc-sc-list-count' });
				if (sc.hidden) {
					const hiddenBadge = row.createSpan({ cls: 'qc-sc-list-hidden-badge' });
					setIcon(hiddenBadge, 'eye-off');
					hiddenBadge.title = 'Hidden';
				}
				row.style.cursor = 'pointer';
				row.onclick = () => { this.currentDetailId = sc.id; this.render(); };
			}
		}

		const newBtn = this.contentEl.createEl('button', { text: '+ New smart code', cls: 'mod-cta qc-sc-list-new-btn' });
		newBtn.onclick = () => this.openBuilder('create');
	}

	private renderDetail(id: string): void {
		const sc = this.cfg.smartCodeApi.getSmartCode(id);
		if (!sc) { this.currentDetailId = null; this.render(); return; }
		renderSmartCodeDetail(this.contentEl, {
			smartCode: sc,
			cache: this.cfg.smartCodeCache,
			smartCodeApi: this.cfg.smartCodeApi,
			registry: this.cfg.registry,
			auditLog: this.cfg.getAuditLog(),
			app: this.cfg.app,
			onEditPredicate: () => this.openBuilder('edit', sc),
			onNavigateToMarker: (ref) => {
				// TODO Phase 2: jump pro marker no engine
				console.log('[smart-codes] navigate to', ref);
			},
			onShowList: () => { this.currentDetailId = null; this.render(); },
		});
	}

	private openBuilder(mode: 'create' | 'edit', initial?: SmartCodeDefinition): void {
		new SmartCodeBuilderModal({
			app: this.cfg.app,
			mode,
			initialDefinition: initial,
			registry: this.cfg.registry,
			caseVarsRegistry: this.cfg.caseVarsRegistry,
			smartCodeApi: this.cfg.smartCodeApi,
			smartCodeCache: this.cfg.smartCodeCache,
			onSaved: (saved) => {
				this.currentDetailId = saved.id;
				this.render();
			},
		}).open();
	}
}
