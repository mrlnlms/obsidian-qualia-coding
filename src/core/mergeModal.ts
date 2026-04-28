/**
 * mergeModal — Merge logic + modal UI for combining codes.
 *
 * executeMerge: reordered 10-step pipeline. Rename happens AFTER source delete to
 * free nameIndex. Returns { ok, reason } so callers can surface name-collision.
 *
 * MergeModal: reactive 4-section UI (Name, Color, Description, Memo) + rich preview
 * + pre-flight collision check. Tier 2 of Coding Management.
 */

import { Modal, type App, setIcon } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { BaseMarker, CodeDefinition } from './types';
import { hasCode, removeCodeApplication, addCodeApplication } from './codeApplicationHelpers';
import type { NameChoice, ColorChoice, TextPolicy } from './mergePolicies';
import { resolveName, resolveColor, applyTextPolicy } from './mergePolicies';

// ─── Merge Logic ─────────────────────────────────────────────

export interface MergeParams {
	destinationId: string;
	sourceIds: string[];
	registry: CodeDefinitionRegistry;
	markers: BaseMarker[];
	nameChoice: NameChoice;
	colorChoice: ColorChoice;
	descriptionPolicy: TextPolicy;
	memoPolicy: TextPolicy;
	/** `null` move pra root. `undefined` deixa intacto. */
	destinationParentId?: string | null;
}

export interface MergeResult {
	updatedMarkers: BaseMarker[];
	affectedCount: number;
	ok: boolean;
	reason?: 'name-collision';
}

export function executeMerge(params: MergeParams): MergeResult {
	const {
		destinationId, sourceIds, registry, markers,
		nameChoice, colorChoice, descriptionPolicy, memoPolicy,
		destinationParentId,
	} = params;

	const target = registry.getById(destinationId);
	if (!target) {
		return { updatedMarkers: markers, affectedCount: 0, ok: false };
	}
	const sources = sourceIds
		.map(id => registry.getById(id))
		.filter((d): d is CodeDefinition => d !== undefined);

	let affectedCount = 0;

	// 1. Reassign markers
	for (const marker of markers) {
		let touched = false;
		for (const srcId of sourceIds) {
			if (hasCode(marker.codes, srcId)) {
				marker.codes = removeCodeApplication(marker.codes, srcId);
				if (!hasCode(marker.codes, destinationId)) {
					marker.codes = addCodeApplication(marker.codes, destinationId);
				}
				touched = true;
			}
		}
		if (touched) affectedCount++;
	}

	// 2. Reparent children of sources to destination
	for (const srcId of sourceIds) {
		const srcDef = registry.getById(srcId);
		if (srcDef) {
			for (const childId of [...srcDef.childrenOrder]) {
				registry.setParent(childId, destinationId);
			}
		}
	}

	// 3. Apply COLOR (não auditado por design — registry.update só seta campo)
	const finalColor = resolveColor(colorChoice, target, sources);
	if (finalColor !== target.color) {
		registry.update(destinationId, { color: finalColor });
	}

	// 4. Apply DESCRIPTION (audit: description_edited automático se mudou)
	const finalDescription = applyTextPolicy(descriptionPolicy, target, sources, 'description');
	const currentDescription = target.description ?? '';
	const newDescription = finalDescription ?? '';
	if (newDescription !== currentDescription) {
		registry.update(destinationId, { description: newDescription });
	}

	// 5. Apply MEMO (audit: memo_edited automático se mudou)
	const finalMemo = applyTextPolicy(memoPolicy, target, sources, 'memo');
	const currentMemo = target.memo ?? '';
	const newMemo = finalMemo ?? '';
	if (newMemo !== currentMemo) {
		registry.update(destinationId, { memo: newMemo });
	}

	// 6. Record mergedFrom + união dos groups (snapshot enquanto srcDef ainda existe)
	const destDefStill = registry.getById(destinationId);
	if (destDefStill) {
		if (!destDefStill.mergedFrom) destDefStill.mergedFrom = [];
		destDefStill.mergedFrom.push(...sourceIds);
		destDefStill.updatedAt = Date.now();

		const unionGroups = new Set<string>(destDefStill.groups ?? []);
		for (const srcDef of sources) {
			if (srcDef.groups) {
				for (const gid of srcDef.groups) unionGroups.add(gid);
			}
		}
		if (unionGroups.size > 0) {
			destDefStill.groups = Array.from(unionGroups);
		}
	}

	// 7. Audit: emite `merged_into` em cada source + `absorbed` no target.
	//    Suprime o `deleted` automático do step 8.
	const finalDestName = registry.getById(destinationId)?.name ?? destinationId;
	const sourceSnapshot = sources.map(s => ({ id: s.id, name: s.name }));
	for (const src of sourceSnapshot) {
		registry.emitAuditExternal({ type: 'merged_into', codeId: src.id, intoId: destinationId, intoName: finalDestName });
		registry.suppressNextDelete(src.id);
	}
	registry.emitAuditExternal({
		type: 'absorbed',
		codeId: destinationId,
		absorbedNames: sourceSnapshot.map(s => s.name),
		absorbedIds: sourceSnapshot.map(s => s.id),
	});

	// 8. Delete sources (libera nameIndex pros nomes antigos)
	for (const srcId of sourceIds) registry.delete(srcId);

	// 9. Apply NAME (após delete sources — names dos sources já liberados em nameIndex).
	//    Pra `nameChoice = source|target`, garantidamente não colide. Pra `custom`, é o
	//    caller que pré-validou (modal). Se ainda colidir (race extrema), retorna ok:false.
	const finalName = resolveName(nameChoice, target, sources);
	if (finalName !== target.name) {
		const ok = registry.update(destinationId, { name: finalName });
		if (!ok) {
			return { updatedMarkers: markers, affectedCount, ok: false, reason: 'name-collision' };
		}
	}

	// 10. Apply destinationParentId (independente)
	if (destinationParentId !== undefined) {
		registry.setParent(destinationId, destinationParentId ?? undefined);
	}

	return { updatedMarkers: markers, affectedCount, ok: true };
}

// ─── Merge Modal UI ──────────────────────────────────────────

export interface MergeDecision {
	destinationId: string;
	sourceIds: string[];
	nameChoice: NameChoice;
	colorChoice: ColorChoice;
	descriptionPolicy: TextPolicy;
	memoPolicy: TextPolicy;
	destinationParentId?: string | null;
}

export interface MergeModalOptions {
	app: App;
	registry: CodeDefinitionRegistry;
	initialDestinationId: string;
	allMarkers: BaseMarker[];
	onConfirm: (decision: MergeDecision) => void;
}

export class MergeModal extends Modal {
	private registry: CodeDefinitionRegistry;
	private destinationId: string;
	private allMarkers: BaseMarker[];
	private onConfirm: MergeModalOptions['onConfirm'];
	private sourceIds: Set<string> = new Set();

	private nameChoice: NameChoice = { kind: 'target' };
	private colorChoice: ColorChoice = { kind: 'target' };
	private descriptionPolicy: TextPolicy = { kind: 'keep-target' };
	private memoPolicy: TextPolicy = { kind: 'concatenate' };
	private customName = '';

	private chipContainer!: HTMLElement;
	private resultsContainer!: HTMLElement;
	private nameSection!: HTMLElement;
	private colorSection!: HTMLElement;
	private descriptionSection!: HTMLElement;
	private memoSection!: HTMLElement;
	private previewSection!: HTMLElement;
	private nameError!: HTMLElement;
	private mergeBtn!: HTMLButtonElement;
	private searchInput!: HTMLInputElement;

	constructor(options: MergeModalOptions) {
		super(options.app);
		this.registry = options.registry;
		this.destinationId = options.initialDestinationId;
		this.allMarkers = options.allMarkers;
		this.onConfirm = options.onConfirm;
	}

	/** Pre-add a source code before opening (used by drag-drop merge). */
	addSource(codeId: string): void {
		if (codeId !== this.destinationId) {
			this.sourceIds.add(codeId);
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('codebook-merge-modal');

		const destDef = this.registry.getById(this.destinationId);
		if (!destDef) { this.close(); return; }

		contentEl.createEl('h3', { text: `Merge into "${destDef.name}"` });

		// Sources section
		const sourcesSection = contentEl.createDiv({ cls: 'codebook-merge-section' });
		sourcesSection.createEl('label', { text: 'Sources to merge:', cls: 'setting-item-name' });
		this.chipContainer = sourcesSection.createDiv({ cls: 'codebook-merge-source-list' });
		this.searchInput = sourcesSection.createEl('input', {
			type: 'text',
			placeholder: 'Search codes...',
			cls: 'codebook-merge-name-input',
		});
		this.resultsContainer = sourcesSection.createDiv({ cls: 'codebook-merge-search-results' });
		this.searchInput.addEventListener('input', () => this.renderSearchResults(this.searchInput.value));

		this.nameSection = contentEl.createDiv({ cls: 'codebook-merge-section' });
		this.nameError = contentEl.createDiv({ cls: 'codebook-merge-name-error' });
		this.nameError.style.display = 'none';
		this.colorSection = contentEl.createDiv({ cls: 'codebook-merge-section' });
		this.descriptionSection = contentEl.createDiv({ cls: 'codebook-merge-section' });
		this.memoSection = contentEl.createDiv({ cls: 'codebook-merge-section' });
		this.previewSection = contentEl.createDiv({ cls: 'codebook-merge-section codebook-merge-preview-list' });

		const actionsEl = contentEl.createDiv({ cls: 'codebook-merge-actions' });
		const cancelBtn = actionsEl.createEl('button', { text: 'Cancel' });
		this.mergeBtn = actionsEl.createEl('button', { text: 'Merge', cls: 'mod-cta' });
		cancelBtn.addEventListener('click', () => this.close());
		this.mergeBtn.addEventListener('click', () => this.handleConfirm());

		this.rerenderAll();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private rerenderAll(): void {
		this.renderChips();
		this.renderNameSection();
		this.renderColorSection();
		this.renderDescriptionSection();
		this.renderMemoSection();
		this.renderPreview();
		this.updateMergeButton();
	}

	private getParticipants(): { target: CodeDefinition; sources: CodeDefinition[] } {
		const target = this.registry.getById(this.destinationId)!;
		const sources = Array.from(this.sourceIds)
			.map(id => this.registry.getById(id))
			.filter((d): d is CodeDefinition => !!d);
		return { target, sources };
	}

	private renderChips(): void {
		this.chipContainer.empty();
		for (const srcId of this.sourceIds) {
			const srcDef = this.registry.getById(srcId);
			if (!srcDef) continue;
			const chip = this.chipContainer.createDiv({ cls: 'codebook-merge-chip' });
			chip.createSpan({ text: srcDef.name });
			const count = this.allMarkers.filter(m => hasCode(m.codes, srcId)).length;
			if (count > 0) chip.createSpan({ text: `(${count})`, cls: 'codebook-merge-chip-count' });
			const removeBtn = chip.createSpan({ cls: 'codebook-merge-chip-remove' });
			setIcon(removeBtn, 'x');
			removeBtn.addEventListener('click', () => {
				this.sourceIds.delete(srcId);
				if (this.nameChoice.kind === 'source' && this.nameChoice.codeId === srcId) this.nameChoice = { kind: 'target' };
				if (this.colorChoice.kind === 'source' && this.colorChoice.codeId === srcId) this.colorChoice = { kind: 'target' };
				if (this.descriptionPolicy.kind === 'keep-only' && this.descriptionPolicy.codeId === srcId) this.descriptionPolicy = { kind: 'keep-target' };
				if (this.memoPolicy.kind === 'keep-only' && this.memoPolicy.codeId === srcId) this.memoPolicy = { kind: 'concatenate' };
				this.rerenderAll();
			});
		}
	}

	private renderSearchResults(query: string): void {
		this.resultsContainer.empty();
		if (!query.trim()) return;
		const lowerQuery = query.toLowerCase();
		const filtered = this.registry.getAll().filter(d =>
			d.id !== this.destinationId &&
			!this.sourceIds.has(d.id) &&
			d.name.toLowerCase().includes(lowerQuery),
		);
		for (const codeDef of filtered.slice(0, 20)) {
			const item = this.resultsContainer.createDiv({ cls: 'codebook-merge-search-item' });
			const swatch = item.createSpan({ cls: 'codebook-merge-radio-row-swatch' });
			swatch.style.backgroundColor = codeDef.color;
			item.createSpan({ text: codeDef.name });
			const count = this.allMarkers.filter(m => hasCode(m.codes, codeDef.id)).length;
			if (count > 0) item.createSpan({ text: `(${count})`, cls: 'codebook-merge-chip-count' });
			item.addEventListener('click', () => {
				this.sourceIds.add(codeDef.id);
				this.searchInput.value = '';
				this.resultsContainer.empty();
				this.rerenderAll();
			});
		}
	}

	private renderNameSection(): void {
		this.nameSection.empty();
		if (this.sourceIds.size === 0) return;

		const { target, sources } = this.getParticipants();
		this.nameSection.createEl('label', { text: 'Keep name from:', cls: 'setting-item-name' });

		type Entry = { value: string; choice: NameChoice; def: CodeDefinition | null; label: string };
		const entries: Entry[] = [
			{ value: 'target', choice: { kind: 'target' }, def: target, label: target.name },
			...sources.map<Entry>(s => ({ value: `src:${s.id}`, choice: { kind: 'source', codeId: s.id }, def: s, label: s.name })),
			{ value: 'custom', choice: { kind: 'custom', value: this.customName }, def: null, label: 'Custom:' },
		];

		const currentValue = this.nameChoice.kind === 'target' ? 'target'
			: this.nameChoice.kind === 'source' ? `src:${this.nameChoice.codeId}`
			: 'custom';

		for (const r of entries) {
			const row = this.nameSection.createDiv({ cls: 'codebook-merge-radio-row' });
			const radio = row.createEl('input', { type: 'radio', attr: { name: 'name-choice' } });
			radio.checked = currentValue === r.value;
			radio.addEventListener('change', () => {
				this.nameChoice = r.choice;
				this.renderNameSection();
				this.renderPreview();
				this.updateMergeButton();
			});
			if (r.def) {
				const swatch = row.createSpan({ cls: 'codebook-merge-radio-row-swatch' });
				swatch.style.backgroundColor = r.def.color;
			}
			row.createSpan({ text: r.label });
			if (r.value === 'custom') {
				const input = row.createEl('input', { type: 'text', cls: 'codebook-merge-name-input' });
				input.value = this.customName;
				input.placeholder = 'New name…';
				input.addEventListener('input', () => {
					this.customName = input.value;
					if (this.nameChoice.kind === 'custom') {
						this.nameChoice = { kind: 'custom', value: this.customName };
						this.updateMergeButton();
					}
				});
				input.addEventListener('focus', () => {
					this.nameChoice = { kind: 'custom', value: this.customName };
					this.renderNameSection();
					this.renderPreview();
					this.updateMergeButton();
				});
			}
		}
	}

	private renderColorSection(): void {
		this.colorSection.empty();
		if (this.sourceIds.size === 0) return;

		const { target, sources } = this.getParticipants();
		this.colorSection.createEl('label', { text: 'Keep color from:', cls: 'setting-item-name' });

		type Entry = { value: string; choice: ColorChoice; def: CodeDefinition; label: string };
		const opts: Entry[] = [
			{ value: 'target', choice: { kind: 'target' }, def: target, label: target.name },
			...sources.map<Entry>(s => ({ value: `src:${s.id}`, choice: { kind: 'source', codeId: s.id }, def: s, label: s.name })),
		];

		const currentValue = this.colorChoice.kind === 'target' ? 'target' : `src:${this.colorChoice.codeId}`;

		for (const o of opts) {
			const row = this.colorSection.createDiv({ cls: 'codebook-merge-radio-row' });
			const radio = row.createEl('input', { type: 'radio', attr: { name: 'color-choice' } });
			radio.checked = currentValue === o.value;
			radio.addEventListener('change', () => {
				this.colorChoice = o.choice;
				this.renderColorSection();
			});
			const swatch = row.createSpan({ cls: 'codebook-merge-radio-row-swatch' });
			swatch.style.backgroundColor = o.def.color;
			row.createSpan({ text: o.label });
		}
	}

	private renderTextPolicySection(opts: {
		container: HTMLElement;
		label: string;
		field: 'description' | 'memo';
		current: TextPolicy;
		onChange: (p: TextPolicy) => void;
	}): void {
		opts.container.empty();
		if (this.sourceIds.size === 0) return;

		const { target, sources } = this.getParticipants();
		const allParticipants = [target, ...sources];
		const withContent = allParticipants.filter(p => (p[opts.field] ?? '').trim().length > 0);

		// Decisão #8: nenhum participante com conteúdo → seção inteira somem
		if (withContent.length === 0) return;

		opts.container.createEl('label', { text: opts.label, cls: 'setting-item-name' });

		type Entry = { value: string; policy: TextPolicy; label: string; show: boolean };
		const radios: Entry[] = ([
			{ value: 'keep-target', policy: { kind: 'keep-target' as const }, label: 'keep target', show: true },
			{ value: 'concatenate', policy: { kind: 'concatenate' as const }, label: 'concatenate', show: withContent.length >= 2 },
			{
				value: 'keep-only',
				policy: opts.current.kind === 'keep-only' ? opts.current : { kind: 'keep-only', codeId: withContent[0]!.id },
				label: 'keep only…',
				show: withContent.length >= 2,
			},
			{ value: 'discard', policy: { kind: 'discard' as const }, label: 'discard', show: true },
		] satisfies Entry[]).filter(r => r.show);

		const currentValue = opts.current.kind;

		for (const r of radios) {
			const row = opts.container.createDiv({ cls: 'codebook-merge-radio-row' });
			const radio = row.createEl('input', { type: 'radio', attr: { name: `policy-${opts.field}` } });
			radio.checked = currentValue === r.value;
			radio.addEventListener('change', () => {
				opts.onChange(r.policy);
				this.renderTextPolicySection(opts);
			});
			row.createSpan({ text: r.label });

			if (r.value === 'keep-only' && currentValue === 'keep-only') {
				const select = row.createEl('select');
				for (const p of withContent) {
					const optEl = select.createEl('option', { value: p.id, text: p.id === target.id ? `${p.name} (target)` : p.name });
					if ((opts.current as { kind: 'keep-only'; codeId: string }).codeId === p.id) optEl.selected = true;
				}
				select.addEventListener('change', () => {
					opts.onChange({ kind: 'keep-only', codeId: select.value });
				});
			}
		}
	}

	private renderDescriptionSection(): void {
		this.renderTextPolicySection({
			container: this.descriptionSection,
			label: 'Description:',
			field: 'description',
			current: this.descriptionPolicy,
			onChange: (p) => { this.descriptionPolicy = p; },
		});
	}

	private renderMemoSection(): void {
		this.renderTextPolicySection({
			container: this.memoSection,
			label: 'Memos:',
			field: 'memo',
			current: this.memoPolicy,
			onChange: (p) => { this.memoPolicy = p; },
		});
	}

	private renderPreview(): void {
		this.previewSection.empty();
		if (this.sourceIds.size === 0) {
			this.previewSection.createEl('div', { text: 'Add sources to see impact.', cls: 'codebook-merge-impact' });
			return;
		}

		const { target, sources } = this.getParticipants();
		this.previewSection.createEl('label', { text: 'Preview', cls: 'setting-item-name' });
		const list = this.previewSection.createEl('ul');

		const srcArr = Array.from(this.sourceIds);
		const affected = this.allMarkers.filter(m =>
			srcArr.some(sid => hasCode(m.codes, sid)),
		).length;
		list.createEl('li', { text: `${affected} marker${affected !== 1 ? 's' : ''} will be reassigned` });

		const childrenCount = sources.reduce((acc, s) => acc + s.childrenOrder.length, 0);
		if (childrenCount > 0) {
			const finalName = resolveName(
				this.nameChoice.kind === 'custom' ? { kind: 'custom', value: this.customName } : this.nameChoice,
				target,
				sources,
			);
			list.createEl('li', { text: `${childrenCount} child code${childrenCount !== 1 ? 's' : ''} will be reparented to "${finalName}"` });
		}

		const targetGroups = new Set(target.groups ?? []);
		const sourceGroupsAll = new Set(sources.flatMap(s => s.groups ?? []));
		const newGroups = [...sourceGroupsAll].filter(g => !targetGroups.has(g));
		if (newGroups.length > 0) {
			const groupNames = newGroups.map(gid => this.registry.groups.get(gid)?.name ?? gid).join(', ');
			list.createEl('li', { text: `Groups unioned: ${groupNames}` });
		}

		const sourceNames = sources.map(s => s.name).join(', ');
		list.createEl('li', { text: `${sources.length} code${sources.length !== 1 ? 's' : ''} will be deleted: ${sourceNames}` });
	}

	private updateMergeButton(): void {
		this.nameError.style.display = 'none';
		this.nameError.empty();

		if (this.sourceIds.size === 0) {
			this.mergeBtn.disabled = true;
			return;
		}

		const { target, sources } = this.getParticipants();

		if (this.nameChoice.kind === 'custom' && this.customName.trim() === '') {
			this.mergeBtn.disabled = true;
			return;
		}

		const nameChoiceForCheck = this.nameChoice.kind === 'custom'
			? { kind: 'custom' as const, value: this.customName }
			: this.nameChoice;
		const finalName = resolveName(nameChoiceForCheck, target, sources);
		if (finalName !== target.name) {
			const collision = this.registry.getAll().find(c =>
				c.id !== target.id &&
				!this.sourceIds.has(c.id) &&
				c.name === finalName,
			);
			if (collision) {
				this.nameError.style.display = '';
				this.nameError.setText(`Name "${finalName}" is already used by another code.`);
				this.mergeBtn.disabled = true;
				return;
			}
		}

		this.mergeBtn.disabled = false;
	}

	private handleConfirm(): void {
		if (this.sourceIds.size === 0) return;
		const nameChoice: NameChoice = this.nameChoice.kind === 'custom'
			? { kind: 'custom', value: this.customName }
			: this.nameChoice;
		this.onConfirm({
			destinationId: this.destinationId,
			sourceIds: Array.from(this.sourceIds),
			nameChoice,
			colorChoice: this.colorChoice,
			descriptionPolicy: this.descriptionPolicy,
			memoPolicy: this.memoPolicy,
		});
		this.close();
	}
}
