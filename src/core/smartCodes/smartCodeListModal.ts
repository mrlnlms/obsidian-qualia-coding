import { App, Menu, Modal, setIcon } from 'obsidian';
import type { SmartCodeDefinition } from './types';
import type { SmartCodeRegistry } from './smartCodeRegistryApi';
import type { SmartCodeCache } from './cache';
import type { CodeDefinitionRegistry } from '../codeDefinitionRegistry';
import type { CaseVariablesRegistry } from '../caseVariables/caseVariablesRegistry';
import type { AuditEntry, BaseMarker } from '../types';
import type { CodeMarkerModel } from '../../markdown/models/codeMarkerModel';
import type { MemoMaterializerAccess } from '../baseCodeDetailView';
import { SmartCodeBuilderModal } from './builderModal';
import { renderSmartCodeDetail } from './detailSmartCodeRenderer';
import { navigateToMarker } from '../navigateToMarker';
import { ConfirmModal, PromptModal } from '../dialogs';
import { shortenPath as _shortenPath } from '../markerResolvers';

export interface SmartCodeListConfig {
	app: App;
	smartCodeRegistry: SmartCodeRegistry;
	smartCodeCache: SmartCodeCache;
	registry: CodeDefinitionRegistry;
	caseVarsRegistry: CaseVariablesRegistry;
	mdModel: CodeMarkerModel | null;
	/** Engine-rich label resolver — main.ts injeta usando csvModel/imageModel/etc. */
	getMarkerLabel: (marker: BaseMarker) => string;
	getAuditLog: () => AuditEntry[];
	/** Convert to note pra SC memo. Sem ele, memo fica só inline (não tem botão). */
	memoAccess?: MemoMaterializerAccess;
	/** Quando setado, abre direto no detail desse SC em vez da lista. */
	initialDetailId?: string | null;
}

/** Hub modal pra Smart Codes — lista + new + click abre detail. */
export class SmartCodeListModal extends Modal {
	private currentDetailId: string | null = null;
	private unsubCache: (() => void) | null = null;
	private unsubRegistry: (() => void) | null = null;

	constructor(private cfg: SmartCodeListConfig) {
		super(cfg.app);
		this.currentDetailId = cfg.initialDetailId ?? null;
	}

	onOpen() {
		this.modalEl.addClass('qc-sc-list-modal');
		this.titleEl.setText('⚡ Smart Codes');
		// Auto-refresh: cache (markers re-evaluados → counts) + registry (CRUD em outro fluxo).
		this.unsubCache = this.cfg.smartCodeCache.subscribe(() => this.render());
		this.unsubRegistry = this.cfg.smartCodeRegistry.addOnMutate(() => this.render());
		this.render();
	}

	onClose() {
		this.unsubCache?.();
		this.unsubRegistry?.();
		this.unsubCache = null;
		this.unsubRegistry = null;
	}

	private render(): void {
		this.contentEl.empty();
		if (this.currentDetailId) this.renderDetail(this.currentDetailId);
		else this.renderList();
	}

	private renderList(): void {
		const all = this.cfg.smartCodeRegistry.getAll();
		if (all.length === 0) {
			this.contentEl.createDiv({ text: 'No smart codes yet.', cls: 'qc-sc-list-empty' });
		} else {
			const listEl = this.contentEl.createDiv({ cls: 'qc-sc-list' });
			for (const sc of all) {
				const row = listEl.createDiv({ cls: 'qc-sc-list-row' });
				if (sc.hidden) row.addClass('is-hidden');

				// Layout segue codebookTreeRenderer: swatch | eye | name | count | menu
				const swatch = row.createSpan({ cls: 'qc-sc-list-swatch' });
				swatch.style.backgroundColor = sc.color;

				const eyeBtn = row.createSpan({ cls: 'qc-sc-list-eye' });
				setIcon(eyeBtn, sc.hidden ? 'eye-off' : 'eye');
				eyeBtn.title = sc.hidden ? 'Show in markers' : 'Hide from markers';
				eyeBtn.onclick = (e) => {
					e.stopPropagation();
					this.cfg.smartCodeRegistry.update(sc.id, { hidden: !sc.hidden });
				};

				row.createSpan({ text: sc.name, cls: 'qc-sc-list-name' });
				// getCount sincrono — dropa pattern "…" que ficava preso sem trigger de compute externo.
				row.createSpan({ text: String(this.cfg.smartCodeCache.getCount(sc.id)), cls: 'qc-sc-list-count' });

				const menuBtn = row.createSpan({ cls: 'qc-sc-list-menu' });
				setIcon(menuBtn, 'more-vertical');
				menuBtn.title = 'More actions';
				menuBtn.onclick = (e) => {
					e.stopPropagation();
					this.showRowContextMenu(sc, e);
				};

				row.style.cursor = 'pointer';
				row.onclick = (e) => {
					const target = e.target as HTMLElement;
					if (target.closest('.qc-sc-list-eye') || target.closest('.qc-sc-list-menu')) return;
					this.currentDetailId = sc.id;
					this.render();
				};
				// Right-click ainda funciona como atalho — mesmo padrão do codebookTreeRenderer.
				row.oncontextmenu = (e) => {
					e.preventDefault();
					this.showRowContextMenu(sc, e);
				};
			}
		}

		const newBtn = this.contentEl.createEl('button', { text: '+ New smart code', cls: 'mod-cta qc-sc-list-new-btn' });
		newBtn.onclick = () => this.openBuilder('create');
	}

	private showRowContextMenu(sc: SmartCodeDefinition, event: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((i) => i.setTitle('Open').setIcon('arrow-right').onClick(() => {
			this.currentDetailId = sc.id;
			this.render();
		}));
		menu.addItem((i) => i.setTitle('Edit query').setIcon('pencil').onClick(() => this.openBuilder('edit', sc)));
		menu.addItem((i) => i.setTitle('Rename').setIcon('text-cursor').onClick(() => {
			new PromptModal({
				app: this.cfg.app,
				title: `Rename smart code`,
				initialValue: sc.name,
				placeholder: 'New name',
				onSubmit: (next) => {
					if (next !== sc.name) this.cfg.smartCodeRegistry.update(sc.id, { name: next });
				},
			}).open();
		}));
		menu.addItem((i) => i
			.setTitle(sc.hidden ? 'Unhide' : 'Hide')
			.setIcon(sc.hidden ? 'eye' : 'eye-off')
			.onClick(() => this.cfg.smartCodeRegistry.update(sc.id, { hidden: !sc.hidden }))
		);
		menu.addSeparator();
		menu.addItem((i) => i.setTitle('Delete').setIcon('trash').onClick(() => {
			new ConfirmModal({
				app: this.cfg.app,
				title: `Delete smart code "${sc.name}"?`,
				message: 'Audit log preserves the deletion event. Reversible only via undo (Cmd+Z) within the session.',
				confirmLabel: 'Delete',
				destructive: true,
				onConfirm: () => this.cfg.smartCodeRegistry.delete(sc.id),
			}).open();
		}));
		menu.showAtMouseEvent(event);
	}

	private renderDetail(id: string): void {
		const sc = this.cfg.smartCodeRegistry.getById(id);
		if (!sc) { this.currentDetailId = null; this.render(); return; }
		renderSmartCodeDetail(this.contentEl, {
			smartCode: sc,
			cache: this.cfg.smartCodeCache,
			smartCodeRegistry: this.cfg.smartCodeRegistry,
			registry: this.cfg.registry,
			auditLog: this.cfg.getAuditLog(),
			app: this.cfg.app,
			onEditPredicate: () => this.openBuilder('edit', sc),
			onShowList: () => { this.currentDetailId = null; this.render(); },
			onNavigateToMarker: (ref) => {
				const marker = this.cfg.smartCodeCache.getMarkerByRef(ref);
				if (!marker) return;
				this.close();
				void navigateToMarker(this.cfg.app, marker as BaseMarker, this.cfg.mdModel);
			},
			getMarkerLabel: (m) => this.cfg.getMarkerLabel(m),
			shortenPath: (f) => _shortenPath(f),
			// Suspend auto-refresh enquanto memo focado — re-render destruiria a textarea.
			suspendRefresh: () => { this.unsubRegistry?.(); this.unsubRegistry = null; },
			resumeRefresh: () => {
				if (!this.unsubRegistry) {
					this.unsubRegistry = this.cfg.smartCodeRegistry.addOnMutate(() => this.render());
				}
			},
			memoAccess: this.cfg.memoAccess,
		});
	}

	private openBuilder(mode: 'create' | 'edit', initial?: SmartCodeDefinition): void {
		new SmartCodeBuilderModal({
			app: this.cfg.app,
			mode,
			initialDefinition: initial,
			registry: this.cfg.registry,
			caseVarsRegistry: this.cfg.caseVarsRegistry,
			smartCodeRegistry: this.cfg.smartCodeRegistry,
			smartCodeCache: this.cfg.smartCodeCache,
			onSaved: (saved) => {
				this.currentDetailId = saved.id;
				this.render();
			},
		}).open();
	}
}
