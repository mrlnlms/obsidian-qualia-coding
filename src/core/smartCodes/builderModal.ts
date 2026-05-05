import { App, Modal, Notice, FuzzySuggestModal, setIcon } from 'obsidian';
import type { SmartCodeDefinition, PredicateNode, LeafNode, OpNode, EngineType } from './types';
import { isOpNode, isLeafNode } from './types';
import type { CodeDefinitionRegistry } from '../codeDefinitionRegistry';
import type { CaseVariablesRegistry } from '../caseVariables/caseVariablesRegistry';
import type { SmartCodeRegistry } from './smartCodeRegistryApi';
import type { SmartCodeCache } from './cache';
import { addChildToGroup, removeNodeAt, changeOperator, replaceLeafAt, type Path } from './builderTreeOps';
import { validateForSave } from './predicateValidator';
import type { CodeDefinition } from '../types';

export interface BuilderConfig {
	app: App;
	mode: 'create' | 'edit';
	initialDefinition?: SmartCodeDefinition;
	registry: CodeDefinitionRegistry;
	caseVarsRegistry: CaseVariablesRegistry;
	smartCodeRegistry: SmartCodeRegistry;
	smartCodeCache: SmartCodeCache;
	onSaved?: (saved: SmartCodeDefinition) => void;
}

const ENGINE_OPTIONS: EngineType[] = ['markdown', 'pdf', 'image', 'audio', 'video', 'csv'];

export class SmartCodeBuilderModal extends Modal {
	private name: string;
	private color: string;
	private memo: string;
	private predicate: PredicateNode;
	private previewEl: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;
	private bannerEl: HTMLElement | null = null;
	private debounceHandle: number | undefined;
	private saveBtn: HTMLButtonElement | null = null;

	constructor(private cfg: BuilderConfig) {
		super(cfg.app);
		this.name = cfg.initialDefinition?.name ?? '';
		this.color = cfg.initialDefinition?.color ?? '#888888';
		this.memo = cfg.initialDefinition?.memo ?? '';
		this.predicate = cfg.initialDefinition?.predicate ?? { op: 'AND', children: [] };
	}

	onOpen() {
		this.modalEl.addClass('qc-sc-builder');
		this.titleEl.setText(this.cfg.mode === 'create' ? 'New Smart Code' : `Edit "${this.cfg.initialDefinition?.name}"`);
		this.render();
	}

	private render(): void {
		this.contentEl.empty();
		this.renderHeader();
		this.renderBanner();
		this.renderBody();
		this.renderFooter();
		this.schedulePreview();
	}

	private renderHeader(): void {
		const headerEl = this.contentEl.createDiv({ cls: 'qc-sc-builder-header' });
		const nameLabel = headerEl.createEl('label', { text: 'Name: ', cls: 'qc-sc-field-label' });
		const nameInput = nameLabel.createEl('input', { type: 'text', value: this.name });
		nameInput.placeholder = 'e.g. Frustration of juniors';
		nameInput.addEventListener('input', () => { this.name = nameInput.value; this.updateSaveState(); });

		const colorLabel = headerEl.createEl('label', { text: ' Color: ', cls: 'qc-sc-field-label' });
		const colorInput = colorLabel.createEl('input', { type: 'color', value: this.color });
		colorInput.addEventListener('input', () => { this.color = colorInput.value; });

		const memoBtn = headerEl.createEl('button', { text: 'Memo…' });
		memoBtn.onclick = () => this.openMemoEditor();
	}

	private renderBanner(): void {
		this.bannerEl = this.contentEl.createDiv({ cls: 'qc-sc-builder-banner' });
		this.bannerEl.style.display = 'none';
	}

	private renderBody(): void {
		this.bodyEl = this.contentEl.createDiv({ cls: 'qc-sc-builder-body' });
		this.renderNode(this.bodyEl, this.predicate, []);
	}

	private renderNode(parent: HTMLElement, node: PredicateNode, path: Path): void {
		const rowEl = parent.createDiv({ cls: 'qc-sc-builder-row' });
		rowEl.style.paddingLeft = `${path.length * 16}px`;
		if (isOpNode(node)) this.renderGroupRow(rowEl, node, path);
		else this.renderLeafRow(rowEl, node, path);

		// Render children inline (recursive)
		if (isOpNode(node)) {
			if (node.op === 'NOT') this.renderNode(parent, node.child, [...path, 0]);
			else for (let i = 0; i < node.children.length; i++) this.renderNode(parent, node.children[i]!, [...path, i]);
		}
	}

	private renderGroupRow(rowEl: HTMLElement, node: OpNode, path: Path): void {
		// Operator dropdown
		const opSelect = rowEl.createEl('select', { cls: 'qc-sc-op-select' });
		for (const op of ['AND', 'OR', 'NOT'] as const) {
			const opt = opSelect.createEl('option', { text: op, value: op });
			if (node.op === op) opt.selected = true;
		}
		opSelect.addEventListener('change', () => {
			this.predicate = changeOperator(this.predicate, path, opSelect.value as 'AND' | 'OR' | 'NOT');
			this.rerender();
		});

		// Add condition + add group buttons (não em NOT, que tem child único)
		if (node.op !== 'NOT') {
			const addCondBtn = rowEl.createEl('button', { text: '+ Condition', cls: 'qc-sc-add-btn' });
			addCondBtn.onclick = () => {
				this.predicate = addChildToGroup(this.predicate, path, { kind: 'hasCode', codeId: '' });
				this.rerender();
			};
			const addGroupBtn = rowEl.createEl('button', { text: '+ Group', cls: 'qc-sc-add-btn' });
			addGroupBtn.onclick = () => {
				this.predicate = addChildToGroup(this.predicate, path, { op: 'AND', children: [] });
				this.rerender();
			};
		}

		// Delete button (não no root)
		if (path.length > 0) {
			const delBtn = rowEl.createEl('button', { cls: 'qc-sc-del-btn' });
			setIcon(delBtn, 'x');
			delBtn.title = 'Remove';
			delBtn.onclick = () => {
				this.predicate = removeNodeAt(this.predicate, path);
				this.rerender();
			};
		}
	}

	private renderLeafRow(rowEl: HTMLElement, leaf: LeafNode, path: Path): void {
		// Kind dropdown
		const kindSelect = rowEl.createEl('select', { cls: 'qc-sc-kind-select' });
		const kinds: Array<{ kind: LeafNode['kind']; label: string }> = [
			{ kind: 'hasCode', label: 'Code is' },
			{ kind: 'caseVarEquals', label: 'Case var =' },
			{ kind: 'magnitudeGte', label: 'Magnitude ≥' },
			{ kind: 'magnitudeLte', label: 'Magnitude ≤' },
			{ kind: 'inFolder', label: 'In folder' },
			{ kind: 'inGroup', label: 'In group' },
			{ kind: 'engineType', label: 'Engine =' },
			{ kind: 'smartCode', label: '⚡ Smart code' },
		];
		for (const k of kinds) {
			const opt = kindSelect.createEl('option', { text: k.label, value: k.kind });
			if (leaf.kind === k.kind) opt.selected = true;
		}
		kindSelect.addEventListener('change', () => {
			const newKind = kindSelect.value as LeafNode['kind'];
			const newLeaf = makeDefaultLeaf(newKind);
			this.predicate = replaceLeafAt(this.predicate, path, newLeaf);
			this.rerender();
		});

		// Inputs adaptativos por kind
		this.renderLeafInputs(rowEl, leaf, path);

		// Delete button
		const delBtn = rowEl.createEl('button', { cls: 'qc-sc-del-btn' });
		setIcon(delBtn, 'x');
		delBtn.title = 'Remove';
		delBtn.onclick = () => {
			this.predicate = removeNodeAt(this.predicate, path);
			this.rerender();
		};
	}

	private renderLeafInputs(rowEl: HTMLElement, leaf: LeafNode, path: Path): void {
		switch (leaf.kind) {
			case 'hasCode':
			case 'magnitudeGte':
			case 'magnitudeLte': {
				const codeBtn = rowEl.createEl('button', { cls: 'qc-sc-picker-btn' });
				const c = this.cfg.registry.getById(leaf.codeId);
				codeBtn.setText(c?.name ?? 'Pick code…');
				codeBtn.onclick = () => this.openCodePicker((codeId) => {
					this.predicate = replaceLeafAt(this.predicate, path, { ...leaf, codeId } as any);
					this.rerender();
				});
				if (leaf.kind !== 'hasCode') {
					const nInput = rowEl.createEl('input', { type: 'number', value: String(leaf.n), cls: 'qc-sc-num-input' });
					nInput.addEventListener('input', () => {
						const n = Number(nInput.value);
						if (!Number.isNaN(n)) {
							this.predicate = replaceLeafAt(this.predicate, path, { ...leaf, n } as any);
							this.schedulePreview();
						}
					});
				}
				return;
			}
			case 'caseVarEquals': {
				const varInput = rowEl.createEl('input', { type: 'text', value: leaf.variable, placeholder: 'variable name', cls: 'qc-sc-text-input' });
				varInput.addEventListener('input', () => {
					this.predicate = replaceLeafAt(this.predicate, path, { ...leaf, variable: varInput.value });
					this.schedulePreview();
				});
				const valInput = rowEl.createEl('input', { type: 'text', value: String(leaf.value ?? ''), placeholder: 'value', cls: 'qc-sc-text-input' });
				valInput.addEventListener('input', () => {
					this.predicate = replaceLeafAt(this.predicate, path, { ...leaf, value: valInput.value });
					this.schedulePreview();
				});
				return;
			}
			case 'inFolder': {
				const folderInput = rowEl.createEl('input', { type: 'text', value: leaf.folderId, placeholder: 'folder id', cls: 'qc-sc-text-input' });
				folderInput.addEventListener('input', () => {
					this.predicate = replaceLeafAt(this.predicate, path, { ...leaf, folderId: folderInput.value });
					this.schedulePreview();
				});
				return;
			}
			case 'inGroup': {
				const groupInput = rowEl.createEl('input', { type: 'text', value: leaf.groupId, placeholder: 'group id', cls: 'qc-sc-text-input' });
				groupInput.addEventListener('input', () => {
					this.predicate = replaceLeafAt(this.predicate, path, { ...leaf, groupId: groupInput.value });
					this.schedulePreview();
				});
				return;
			}
			case 'engineType': {
				const select = rowEl.createEl('select', { cls: 'qc-sc-engine-select' });
				for (const e of ENGINE_OPTIONS) {
					const opt = select.createEl('option', { text: e, value: e });
					if (leaf.engine === e) opt.selected = true;
				}
				select.addEventListener('change', () => {
					this.predicate = replaceLeafAt(this.predicate, path, { kind: 'engineType', engine: select.value as EngineType });
					this.schedulePreview();
				});
				return;
			}
			case 'smartCode': {
				const scBtn = rowEl.createEl('button', { cls: 'qc-sc-picker-btn' });
				const sc = this.cfg.smartCodeRegistry.getById(leaf.smartCodeId);
				scBtn.setText(sc?.name ?? 'Pick smart code…');
				scBtn.onclick = () => this.openSmartCodePicker((smartCodeId) => {
					this.predicate = replaceLeafAt(this.predicate, path, { kind: 'smartCode', smartCodeId });
					this.rerender();
				});
				return;
			}
			case 'caseVarRange':
			case 'relationExists':
				rowEl.createSpan({ text: '(advanced — edit JSON manually)', cls: 'qc-sc-todo' });
				return;
		}
	}

	private renderFooter(): void {
		const footer = this.contentEl.createDiv({ cls: 'qc-sc-builder-footer' });
		this.previewEl = footer.createDiv({ cls: 'qc-sc-preview' });
		this.previewEl.setText('⚡ —');

		const actions = footer.createDiv({ cls: 'qc-sc-builder-actions' });
		const cancelBtn = actions.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();
		this.saveBtn = actions.createEl('button', { text: 'Save', cls: 'mod-cta' });
		this.saveBtn.onclick = () => this.save();
		this.updateSaveState();
	}

	private schedulePreview(): void {
		if (this.debounceHandle) window.clearTimeout(this.debounceHandle);
		this.debounceHandle = window.setTimeout(() => this.runPreview(), 300);
	}

	private runPreview(): void {
		if (!this.previewEl) return;
		try {
			const matches = this.cfg.smartCodeCache.computePreview(this.predicate);
			const fileCount = new Set(matches.map(r => r.fileId)).size;
			this.previewEl.setText(`⚡ ${matches.length} matches across ${fileCount} files`);
		} catch (err) {
			this.previewEl.setText('⚡ (error in predicate)');
		}
		this.updateSaveState();
	}

	private updateSaveState(): void {
		if (!this.saveBtn) return;
		const validation = validateForSave(
			{ id: this.cfg.initialDefinition?.id ?? '__new__', name: this.name },
			this.predicate,
			this.buildValidatorRegistrySnapshot(),
			new Set(this.collectCaseVarsKeys()),
		);
		this.saveBtn.disabled = !validation.valid || this.name.trim().length === 0;
		if (this.bannerEl) {
			// Estado inicial (predicate ainda vazio + sem nome) é "rascunho fresh", não erro.
			// Suprime banner enquanto user ainda não começou — só mostra quando há rascunho parcial inválido.
			const isPristine = this.predicate && 'op' in this.predicate
				&& this.predicate.op !== 'NOT'
				&& (this.predicate as any).children?.length === 0
				&& this.name.trim().length === 0;
			if (isPristine) {
				this.bannerEl.style.display = 'none';
			} else if (validation.errors.length > 0) {
				this.bannerEl.style.display = 'block';
				this.bannerEl.setText(validation.errors[0]!.message);
				this.bannerEl.className = 'qc-sc-builder-banner qc-banner-error';
			} else if (validation.warnings.length > 0) {
				this.bannerEl.style.display = 'block';
				this.bannerEl.setText(validation.warnings[0]!.message);
				this.bannerEl.className = 'qc-sc-builder-banner qc-banner-warning';
			} else {
				this.bannerEl.style.display = 'none';
			}
		}
	}

	private collectCaseVarsKeys(): string[] {
		// CaseVariablesRegistry não expõe listAllKeys. Por isso warning de broken-ref pra case var fica off
		// até o registry expor a API. Retornar Set vazio significa: validator não checa case var refs.
		return [];
	}

	/** Snapshot do registry no shape que validateForSave espera. Reusada por updateSaveState e save. */
	private buildValidatorRegistrySnapshot() {
		const codeDefs = this.cfg.registry.getAll().reduce(
			(acc, c) => { acc[c.id] = c; return acc; },
			{} as Record<string, CodeDefinition>,
		);
		const scDefs = this.cfg.smartCodeRegistry.getAll().reduce(
			(acc, sc) => { acc[sc.id] = sc; return acc; },
			{} as Record<string, SmartCodeDefinition>,
		);
		return {
			definitions: codeDefs,
			smartCodes: scDefs,
			folders: {},
			groups: {},
		};
	}

	private rerender(): void {
		this.render();
	}

	private save(): void {
		this.runPreview();
		const validation = validateForSave(
			{ id: this.cfg.initialDefinition?.id ?? '__new__', name: this.name },
			this.predicate,
			this.buildValidatorRegistrySnapshot(),
			new Set(this.collectCaseVarsKeys()),
		);
		if (!validation.valid) {
			new Notice('Cannot save: ' + validation.errors[0]!.message);
			return;
		}
		const saved = this.cfg.mode === 'create'
			? this.cfg.smartCodeRegistry.create({ name: this.name, color: this.color, predicate: this.predicate, memo: this.memo })
			: this.cfg.smartCodeRegistry.update(this.cfg.initialDefinition!.id, { name: this.name, color: this.color, predicate: this.predicate, memo: this.memo })!;
		this.cfg.onSaved?.(saved);
		this.close();
	}

	private openMemoEditor(): void {
		const modal = new Modal(this.cfg.app);
		modal.titleEl.setText('Edit memo');
		const ta = modal.contentEl.createEl('textarea', { cls: 'qc-sc-memo-edit' });
		ta.value = this.memo;
		ta.style.width = '100%';
		ta.style.height = '200px';
		const actions = modal.contentEl.createDiv({ cls: 'qc-sc-memo-actions' });
		actions.createEl('button', { text: 'Cancel' }).onclick = () => modal.close();
		const ok = actions.createEl('button', { text: 'OK', cls: 'mod-cta' });
		ok.onclick = () => { this.memo = ta.value; modal.close(); };
		modal.open();
	}

	private openCodePicker(onPick: (codeId: string) => void): void {
		new CodePickerModal(this.cfg.app, this.cfg.registry.getAll(), onPick).open();
	}

	private openSmartCodePicker(onPick: (smartCodeId: string) => void): void {
		const all = this.cfg.smartCodeRegistry.getAll().filter(sc => sc.id !== this.cfg.initialDefinition?.id);
		new SmartCodePickerModal(this.cfg.app, all, onPick).open();
	}
}

class CodePickerModal extends FuzzySuggestModal<CodeDefinition> {
	constructor(app: App, private codes: CodeDefinition[], private onPick: (codeId: string) => void) {
		super(app);
		this.setPlaceholder('Pick a code…');
	}
	getItems(): CodeDefinition[] { return this.codes; }
	getItemText(item: CodeDefinition): string { return item.name; }
	onChooseItem(item: CodeDefinition): void { this.onPick(item.id); }
}

class SmartCodePickerModal extends FuzzySuggestModal<SmartCodeDefinition> {
	constructor(app: App, private items: SmartCodeDefinition[], private onPick: (smartCodeId: string) => void) {
		super(app);
		this.setPlaceholder('Pick a smart code…');
	}
	getItems(): SmartCodeDefinition[] { return this.items; }
	getItemText(item: SmartCodeDefinition): string { return item.name; }
	onChooseItem(item: SmartCodeDefinition): void { this.onPick(item.id); }
}

function makeDefaultLeaf(kind: LeafNode['kind']): LeafNode {
	switch (kind) {
		case 'hasCode': return { kind: 'hasCode', codeId: '' };
		case 'caseVarEquals': return { kind: 'caseVarEquals', variable: '', value: '' };
		case 'caseVarRange': return { kind: 'caseVarRange', variable: '' };
		case 'magnitudeGte': return { kind: 'magnitudeGte', codeId: '', n: 1 };
		case 'magnitudeLte': return { kind: 'magnitudeLte', codeId: '', n: 5 };
		case 'inFolder': return { kind: 'inFolder', folderId: '' };
		case 'inGroup': return { kind: 'inGroup', groupId: '' };
		case 'engineType': return { kind: 'engineType', engine: 'markdown' };
		case 'relationExists': return { kind: 'relationExists', codeId: '' };
		case 'smartCode': return { kind: 'smartCode', smartCodeId: '' };
	}
}
