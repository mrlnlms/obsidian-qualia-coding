/**
 * detailRelationRenderer — Renders the relation-focused detail view for BaseCodeDetailView.
 *
 * Mostra detail de uma relation (code-level OU app-level): header com chips source/target,
 * memo (com Convert/card), evidence list (markers que aplicam essa relation, só pra code-level),
 * delete button.
 *
 * Surface única pros 2 tipos — banner contextual no topo distingue.
 */

import { App, setIcon } from 'obsidian';
import type { BaseMarker, CodeDefinition, CodeRelation, SidebarModelInterface } from './types';
import type { MemoMaterializerAccess } from './baseCodeDetailView';
import type { EntityRef } from './memoTypes';
import { getMemoContent } from './memoHelpers';
import { renderBackButton } from './detailCodeRenderer';
import { createVirtualList } from './virtualList';

const EVIDENCE_ROW_HEIGHT = 30;
const EVIDENCE_LIST_MAX_VH = 50;

export type RelationContext =
	| { kind: 'code-level'; sourceCodeId: string; label: string; target: string }
	| { kind: 'app-level'; engineType: BaseMarker['markerType']; markerId: string; sourceCodeId: string; label: string; target: string };

export interface RelationRendererCallbacks {
	showCodeDetail(codeId: string): void;
	showRelationDetail(ctx: RelationContext): void;
	setContext(markerId: string, codeId: string): void;
	memoAccess?: MemoMaterializerAccess;
	suspendRefresh(): void;
	resumeRefresh(): void;
	shortenPath(fileId: string): string;
	getMarkerLabel(marker: BaseMarker): string;
	/** Save memo content (string). Renderer não conhece registry/dataManager — caller faz routing. */
	onSaveMemo(ref: EntityRef, content: string): void;
}

export function renderRelationDetail(
	container: HTMLElement,
	ctx: RelationContext,
	model: SidebarModelInterface,
	callbacks: RelationRendererCallbacks,
	app: App,
): void {
	const sourceDef = model.registry.getById(ctx.sourceCodeId);
	const targetDef = model.registry.getById(ctx.target);

	// Back button — volta pro Code Detail (source) em ambos os casos
	renderBackButton(container, sourceDef?.name ?? 'Code', () => callbacks.showCodeDetail(ctx.sourceCodeId));

	// Resolver a relation atual
	const rel = resolveRelation(ctx, model);
	if (!rel) {
		container.createEl('p', { text: 'Relation not found.', cls: 'codemarker-detail-empty' });
		return;
	}

	// Header — chips source / label / target
	renderRelationHeader(container, sourceDef, rel, targetDef, callbacks);

	// Banner contextual (code-level vs app-level)
	renderContextBanner(container, ctx, model, callbacks);

	// Direction (read-only — display only)
	renderDirectionRow(container, rel);

	// Memo (com Convert/card)
	renderRelationMemo(container, ctx, rel, callbacks);

	// Evidence list — só code-level
	if (ctx.kind === 'code-level') {
		renderEvidenceList(container, ctx, model, callbacks);
	}

	// Delete relation
	renderDeleteRelationButton(container, ctx, rel, model, callbacks);
}

// ─── Sub-renderers ──────────────────────────────────────

function resolveRelation(ctx: RelationContext, model: SidebarModelInterface): CodeRelation | undefined {
	if (ctx.kind === 'code-level') {
		const def = model.registry.getById(ctx.sourceCodeId);
		return def?.relations?.find(r => r.label === ctx.label && r.target === ctx.target);
	}
	const marker = model.getMarkerById(ctx.markerId);
	const ca = marker?.codes.find(c => c.codeId === ctx.sourceCodeId);
	return ca?.relations?.find(r => r.label === ctx.label && r.target === ctx.target);
}

function renderRelationHeader(
	container: HTMLElement,
	sourceDef: CodeDefinition | undefined,
	rel: CodeRelation,
	targetDef: CodeDefinition | undefined,
	callbacks: RelationRendererCallbacks,
): void {
	const header = container.createDiv({ cls: 'codemarker-detail-relation-header' });

	// Source chip (clickable → navigate)
	if (sourceDef) {
		const sourceChip = header.createSpan({ cls: 'codemarker-detail-chip codemarker-detail-relation-chip' });
		const dot = sourceChip.createSpan({ cls: 'codemarker-detail-chip-dot' });
		dot.style.backgroundColor = sourceDef.color;
		sourceChip.createSpan({ text: sourceDef.name });
		sourceChip.title = `Open ${sourceDef.name}`;
		sourceChip.addEventListener('click', () => callbacks.showCodeDetail(sourceDef.id));
	}

	// Direction icon + label
	const dirIcon = header.createSpan({ cls: 'codemarker-detail-relation-dir' });
	setIcon(dirIcon, rel.directed ? 'arrow-right' : 'minus');

	header.createSpan({ cls: 'codemarker-detail-relation-label-large', text: rel.label });

	const dirIcon2 = header.createSpan({ cls: 'codemarker-detail-relation-dir' });
	setIcon(dirIcon2, rel.directed ? 'arrow-right' : 'minus');

	// Target chip (clickable → navigate)
	if (targetDef) {
		const targetChip = header.createSpan({ cls: 'codemarker-detail-chip codemarker-detail-relation-chip' });
		const dot = targetChip.createSpan({ cls: 'codemarker-detail-chip-dot' });
		dot.style.backgroundColor = targetDef.color;
		targetChip.createSpan({ text: targetDef.name });
		targetChip.title = `Open ${targetDef.name}`;
		targetChip.addEventListener('click', () => callbacks.showCodeDetail(targetDef.id));
	} else {
		header.createSpan({ cls: 'codemarker-detail-relation-target-missing', text: '(deleted)' });
	}
}

function renderContextBanner(
	container: HTMLElement,
	ctx: RelationContext,
	model: SidebarModelInterface,
	callbacks: RelationRendererCallbacks,
): void {
	const banner = container.createDiv({ cls: 'codemarker-detail-relation-banner' });

	if (ctx.kind === 'code-level') {
		// Conta markers que aplicam essa relation
		let count = 0;
		for (const m of model.getAllMarkers()) {
			for (const ca of m.codes) {
				if (ca.codeId !== ctx.sourceCodeId) continue;
				if (ca.relations?.some(r => r.label === ctx.label && r.target === ctx.target)) count++;
			}
		}
		banner.createSpan({ text: 'Defined in codebook · ' });
		banner.createSpan({ cls: 'codemarker-detail-relation-banner-count', text: `applied in ${count} marker${count === 1 ? '' : 's'}` });
	} else {
		// app-level
		const marker = model.getMarkerById(ctx.markerId);
		const fileLabel = marker ? callbacks.shortenPath(marker.fileId) : '(deleted)';
		banner.createSpan({ text: 'From segment in ' });
		banner.createSpan({ cls: 'codemarker-detail-relation-banner-file', text: fileLabel });
		banner.createSpan({ text: ' · code-level: ' });
		const link = banner.createSpan({ cls: 'codemarker-detail-relation-banner-link', text: `Open code-level "${ctx.label}"` });
		link.addEventListener('click', () => callbacks.showRelationDetail({
			kind: 'code-level',
			sourceCodeId: ctx.sourceCodeId,
			label: ctx.label,
			target: ctx.target,
		}));
	}
}

function renderDirectionRow(container: HTMLElement, rel: CodeRelation): void {
	const row = container.createDiv({ cls: 'codemarker-detail-section codemarker-detail-relation-direction' });
	row.createEl('h6', { text: 'Direction' });
	row.createSpan({
		cls: 'codemarker-detail-relation-direction-text',
		text: rel.directed ? 'Directed (source → target)' : 'Symmetric (source ↔ target)',
	});
}

function renderRelationMemo(
	container: HTMLElement,
	ctx: RelationContext,
	rel: CodeRelation,
	callbacks: RelationRendererCallbacks,
): void {
	const section = container.createDiv({ cls: 'codemarker-detail-section' });
	const header = section.createDiv({ cls: 'codemarker-detail-section-header' });
	header.createEl('h6', { text: 'Memo' });

	const ref: EntityRef = ctx.kind === 'code-level'
		? { type: 'relation-code', codeId: ctx.sourceCodeId, label: ctx.label, target: ctx.target }
		: { type: 'relation-app', engineType: ctx.engineType, markerId: ctx.markerId, codeId: ctx.sourceCodeId, label: ctx.label, target: ctx.target };

	if (rel.memo?.materialized && callbacks.memoAccess) {
		renderMaterializedCard(section, rel.memo.materialized.path, callbacks.memoAccess, ref);
		return;
	}

	if (callbacks.memoAccess) {
		const convertBtn = header.createEl('button', {
			cls: 'qc-memo-convert-btn',
			text: 'Convert to note',
			attr: { title: 'Materialize relation memo as a markdown note' },
		});
		convertBtn.addEventListener('click', async () => {
			await callbacks.memoAccess!.convertMemo(ref);
		});
	}

	const textarea = section.createEl('textarea', {
		cls: 'codemarker-detail-memo',
		attr: { placeholder: 'Reflexão sobre essa relação…', rows: '4' },
	});
	textarea.value = getMemoContent(rel.memo);
	let memoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	textarea.addEventListener('input', () => {
		if (memoSaveTimer) clearTimeout(memoSaveTimer);
		memoSaveTimer = setTimeout(() => {
			memoSaveTimer = null;
			callbacks.onSaveMemo(ref, textarea.value.trim());
		}, 500);
	});
	textarea.addEventListener('focus', () => callbacks.suspendRefresh());
	textarea.addEventListener('blur', () => callbacks.resumeRefresh());
}

function renderMaterializedCard(
	container: HTMLElement,
	path: string,
	memoAccess: MemoMaterializerAccess,
	ref: EntityRef,
): void {
	const card = container.createDiv({ cls: 'qc-memo-materialized-card' });
	const labelRow = card.createDiv({ cls: 'qc-memo-materialized-label-row' });
	const iconSpan = labelRow.createSpan({ cls: 'qc-memo-materialized-icon' });
	setIcon(iconSpan, 'file-text');
	labelRow.createSpan({ text: 'Materialized at', cls: 'qc-memo-materialized-label' });

	card.createEl('div', { text: path, cls: 'qc-memo-materialized-path' });

	const actions = card.createDiv({ cls: 'qc-memo-materialized-actions' });
	const openBtn = actions.createEl('button', { text: 'Open', cls: 'qc-memo-open-btn' });
	openBtn.addEventListener('click', () => memoAccess.openMaterializedFile(path));

	const unBtn = actions.createEl('button', { text: 'Unmaterialize', cls: 'qc-memo-unmaterialize-btn' });
	unBtn.addEventListener('click', () => memoAccess.unmaterializeMemo(ref));
}

function renderEvidenceList(
	container: HTMLElement,
	ctx: Extract<RelationContext, { kind: 'code-level' }>,
	model: SidebarModelInterface,
	callbacks: RelationRendererCallbacks,
): void {
	const matchingMarkers = model.getAllMarkers().filter(m => {
		const ca = m.codes.find(c => c.codeId === ctx.sourceCodeId);
		return ca?.relations?.some(r => r.label === ctx.label && r.target === ctx.target) ?? false;
	});

	if (matchingMarkers.length === 0) return;

	const section = container.createDiv({ cls: 'codemarker-detail-section' });
	section.createEl('h6', { text: `Evidence (${matchingMarkers.length})` });

	const scrollEl = section.createDiv();
	scrollEl.style.maxHeight = `${EVIDENCE_LIST_MAX_VH}vh`;
	scrollEl.style.overflowY = 'auto';
	scrollEl.style.position = 'relative';

	const list = createVirtualList<BaseMarker>({
		container: scrollEl,
		rowHeight: EVIDENCE_ROW_HEIGHT,
		renderRow: (m) => {
			const row = document.createElement('div');
			row.className = 'codemarker-detail-relation-evidence-row';
			row.createSpan({ cls: 'codemarker-detail-relation-evidence-file', text: callbacks.shortenPath(m.fileId) });
			row.createSpan({ cls: 'codemarker-detail-seg-sep', text: ' · ' });
			row.createSpan({ cls: 'codemarker-detail-relation-evidence-label', text: callbacks.getMarkerLabel(m) });
			row.addEventListener('click', () => callbacks.setContext(m.id, ctx.sourceCodeId));
			row.title = 'Open marker';
			return row;
		},
	});
	list.setItems(matchingMarkers);
}

function renderDeleteRelationButton(
	container: HTMLElement,
	ctx: RelationContext,
	rel: CodeRelation,
	model: SidebarModelInterface,
	callbacks: RelationRendererCallbacks,
): void {
	const section = container.createDiv({ cls: 'codemarker-detail-danger-zone' });
	const btn = section.createEl('button', { cls: 'codemarker-detail-delete-btn' });
	const iconSpan = btn.createSpan({ cls: 'codemarker-detail-delete-icon' });
	setIcon(iconSpan, 'trash-2');
	btn.createSpan({ text: 'Delete relation' });
	btn.addEventListener('click', () => {
		if (ctx.kind === 'code-level') {
			const def = model.registry.getById(ctx.sourceCodeId);
			if (!def?.relations) return;
			def.relations = def.relations.filter(r => !(r.label === ctx.label && r.target === ctx.target));
			model.saveMarkers();
		} else {
			const marker = model.getMarkerById(ctx.markerId);
			const ca = marker?.codes.find(c => c.codeId === ctx.sourceCodeId);
			if (ca?.relations) {
				ca.relations = ca.relations.filter(r => !(r.label === ctx.label && r.target === ctx.target));
				if (marker) marker.updatedAt = Date.now();
				model.saveMarkers();
			}
		}
		callbacks.showCodeDetail(ctx.sourceCodeId);
	});
	void rel;
}
