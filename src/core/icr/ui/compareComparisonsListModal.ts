import { App, Menu, Modal, setIcon } from 'obsidian';
import type { SavedComparison } from './compareCodersTypes';
import type { ComparisonRegistry } from '../comparisonRegistry';
import { ConfirmModal, PromptModal } from '../../dialogs';

export interface CompareComparisonsListConfig {
	app: App;
	registry: ComparisonRegistry;
	/** Abre a Compare Coders View com o saved configurado. Caller fecha o modal. */
	onOpenComparison: (comparisonId: string) => void;
	/** Cria saved via PromptModal de nome e abre a view com a config default carregada. */
	onCreateComparison: () => void;
}

/**
 * Hub modal pra Saved Comparisons (Slice E4). Espelha pattern do SmartCodeListModal,
 * sem detail interno (click → fecha modal + abre view configurada).
 */
export class CompareComparisonsListModal extends Modal {
	private unsubRegistry: (() => void) | null = null;

	constructor(private cfg: CompareComparisonsListConfig) {
		super(cfg.app);
	}

	onOpen() {
		this.modalEl.addClass('qc-cmp-list-modal');
		this.titleEl.setText('👥 Saved Comparisons');
		this.unsubRegistry = this.cfg.registry.addOnMutate(() => this.render());
		this.render();
	}

	onClose() {
		this.unsubRegistry?.();
		this.unsubRegistry = null;
	}

	private render(): void {
		this.contentEl.empty();
		const all = this.cfg.registry.getAll();
		if (all.length === 0) {
			this.contentEl.createDiv({ text: 'No saved comparisons yet.', cls: 'qc-cmp-list-empty' });
		} else {
			const listEl = this.contentEl.createDiv({ cls: 'qc-cmp-list' });
			for (const cmp of all) {
				const row = listEl.createDiv({ cls: 'qc-cmp-list-row' });

				const main = row.createDiv({ cls: 'qc-cmp-list-main' });
				main.createDiv({ text: cmp.name, cls: 'qc-cmp-list-name' });
				main.createDiv({ text: this.summarize(cmp), cls: 'qc-cmp-list-summary' });

				const ts = row.createDiv({ cls: 'qc-cmp-list-ts', text: this.formatTimestamp(cmp.updatedAt) });
				ts.title = new Date(cmp.updatedAt).toLocaleString();

				const menuBtn = row.createSpan({ cls: 'qc-cmp-list-menu' });
				setIcon(menuBtn, 'more-vertical');
				menuBtn.title = 'More actions';
				menuBtn.onclick = (e) => {
					e.stopPropagation();
					this.showRowContextMenu(cmp, e);
				};

				row.style.cursor = 'pointer';
				row.onclick = (e) => {
					const target = e.target as HTMLElement;
					if (target.closest('.qc-cmp-list-menu')) return;
					this.close();
					this.cfg.onOpenComparison(cmp.id);
				};
				row.oncontextmenu = (e) => {
					e.preventDefault();
					this.showRowContextMenu(cmp, e);
				};
			}
		}

		const newBtn = this.contentEl.createEl('button', { text: '+ Nova', cls: 'mod-cta qc-cmp-list-new-btn' });
		newBtn.onclick = () => {
			this.close();
			this.cfg.onCreateComparison();
		};
	}

	private showRowContextMenu(cmp: SavedComparison, event: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((i) => i.setTitle('Open').setIcon('arrow-right').onClick(() => {
			this.close();
			this.cfg.onOpenComparison(cmp.id);
		}));
		menu.addItem((i) => i.setTitle('Rename').setIcon('text-cursor').onClick(() => {
			new PromptModal({
				app: this.cfg.app,
				title: 'Rename comparison',
				initialValue: cmp.name,
				placeholder: 'New name',
				onSubmit: (next) => {
					if (next !== cmp.name) this.cfg.registry.rename(cmp.id, next);
				},
			}).open();
		}));
		menu.addItem((i) => i.setTitle('Duplicate').setIcon('copy').onClick(() => {
			this.cfg.registry.duplicate(cmp.id);
		}));
		menu.addSeparator();
		menu.addItem((i) => i.setTitle('Delete').setIcon('trash').onClick(() => {
			new ConfirmModal({
				app: this.cfg.app,
				title: `Delete comparison "${cmp.name}"?`,
				message: 'Saved comparisons são preferência de UX (sem audit log). Esta operação é irreversível.',
				confirmLabel: 'Delete',
				destructive: true,
				onConfirm: () => this.cfg.registry.delete(cmp.id),
			}).open();
		}));
		menu.showAtMouseEvent(event);
	}

	/** "marlon, joana · 12 codes · markdown only" — resumo cru do escopo. */
	private summarize(cmp: SavedComparison): string {
		const parts: string[] = [];
		const coderCount = cmp.scope.coderIds.length;
		parts.push(coderCount === 0 ? 'no coders' : `${coderCount} coder${coderCount === 1 ? '' : 's'}`);

		if (cmp.scope.codeIds?.length) parts.push(`${cmp.scope.codeIds.length} codes`);
		if (cmp.scope.engineIds?.length) {
			if (cmp.scope.engineIds.length === 1) parts.push(`${cmp.scope.engineIds[0]} only`);
			else parts.push(`${cmp.scope.engineIds.length} engines`);
		}
		if (cmp.scope.fileIds?.length) parts.push(`${cmp.scope.fileIds.length} files`);
		return parts.join(' · ');
	}

	/** Timestamp humanizado pra updatedAt — "5min", "2h", "3d", senão data curta. */
	private formatTimestamp(ms: number): string {
		const diff = Date.now() - ms;
		const sec = Math.floor(diff / 1000);
		if (sec < 60) return 'just now';
		const min = Math.floor(sec / 60);
		if (min < 60) return `${min}min`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}h`;
		const day = Math.floor(hr / 24);
		if (day < 7) return `${day}d`;
		return new Date(ms).toLocaleDateString();
	}
}
