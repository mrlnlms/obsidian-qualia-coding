import { setIcon } from 'obsidian';
import type { SmartCodeDefinition, MarkerRef, PredicateNode, LeafNode } from './types';
import { isOpNode } from './types';
import type { SmartCodeApi } from './smartCodeRegistryApi';
import type { SmartCodeCache } from './cache';
import type { CodeDefinitionRegistry } from '../codeDefinitionRegistry';
import { getEntriesForSmartCode, renderEntryMarkdown } from '../auditLog';
import type { AuditEntry } from '../types';
import { ConfirmModal } from '../dialogs';

export interface SmartCodeDetailCallbacks {
	smartCode: SmartCodeDefinition;
	cache: SmartCodeCache;
	smartCodeApi: SmartCodeApi;
	registry: CodeDefinitionRegistry;
	auditLog: AuditEntry[];
	app: any;
	onEditPredicate: () => void;
	onNavigateToMarker: (ref: MarkerRef) => void;
	onShowList: () => void;
}

export function renderSmartCodeDetail(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	container.empty();
	container.addClass('qc-sc-detail');

	renderHeader(container, opts);
	renderMemo(container, opts);
	renderPredicateSection(container, opts);
	renderMatchesSection(container, opts);
	renderHistorySection(container, opts);
	renderDeleteAction(container, opts);
}

function renderHeader(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const headerEl = container.createDiv({ cls: 'qc-sc-detail-header' });
	const back = headerEl.createEl('button', { cls: 'qc-sc-back-btn' });
	setIcon(back, 'arrow-left');
	back.title = 'Back to list';
	back.onclick = () => opts.onShowList();
	headerEl.createSpan({ text: '⚡ ', cls: 'qc-sc-icon' });
	headerEl.createSpan({ text: opts.smartCode.name, cls: 'qc-sc-name' });
	const swatch = headerEl.createSpan({ cls: 'qc-sc-color-swatch' });
	swatch.style.backgroundColor = opts.smartCode.color;
}

function renderMemo(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const sectionEl = container.createDiv({ cls: 'qc-sc-memo-section' });
	sectionEl.createEl('h4', { text: 'Memo' });
	const textarea = sectionEl.createEl('textarea', { cls: 'qc-sc-memo-textarea' });
	textarea.value = opts.smartCode.memo ?? '';
	textarea.placeholder = 'Justificativa metodológica desta query…';
	let debounce: number | undefined;
	textarea.addEventListener('input', () => {
		if (debounce) window.clearTimeout(debounce);
		debounce = window.setTimeout(() => opts.smartCodeApi.setSmartCodeMemo(opts.smartCode.id, textarea.value), 500);
	});
}

function renderPredicateSection(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const sectionEl = container.createDiv({ cls: 'qc-sc-predicate-section' });
	sectionEl.createEl('h4', { text: 'Predicate' });
	const treeEl = sectionEl.createDiv({ cls: 'qc-sc-predicate-tree' });
	renderPredicateLine(treeEl, opts.smartCode.predicate, opts, 0);
	const editBtn = sectionEl.createEl('button', { text: 'Edit predicate', cls: 'qc-sc-edit-btn' });
	editBtn.onclick = opts.onEditPredicate;
}

function renderPredicateLine(parent: HTMLElement, node: PredicateNode, opts: SmartCodeDetailCallbacks, depth: number): void {
	const line = parent.createDiv({ cls: 'qc-sc-pred-line' });
	line.style.paddingLeft = `${depth * 16}px`;
	if (isOpNode(node)) {
		line.createSpan({ text: node.op, cls: 'qc-sc-pred-op' });
		if (node.op === 'NOT') renderPredicateLine(parent, node.child, opts, depth + 1);
		else for (const c of node.children) renderPredicateLine(parent, c, opts, depth + 1);
	} else {
		line.createSpan({ text: '• ' });
		line.createSpan({ text: formatLeaf(node, opts.registry, opts.cache, opts.smartCodeApi) });
	}
}

function formatLeaf(leaf: LeafNode, registry: CodeDefinitionRegistry, cache: SmartCodeCache, smartCodeApi: SmartCodeApi): string {
	switch (leaf.kind) {
		case 'hasCode': {
			const c = registry.getById(leaf.codeId);
			return `Code is "${c?.name ?? leaf.codeId + ' (deleted)'}"`;
		}
		case 'caseVarEquals': return `Case var "${leaf.variable}" = ${JSON.stringify(leaf.value)}`;
		case 'caseVarRange': {
			const parts: string[] = [];
			if (leaf.min !== undefined) parts.push(`≥ ${leaf.min}`);
			if (leaf.max !== undefined) parts.push(`≤ ${leaf.max}`);
			if (leaf.minDate) parts.push(`≥ ${leaf.minDate}`);
			if (leaf.maxDate) parts.push(`≤ ${leaf.maxDate}`);
			return `Case var "${leaf.variable}" ${parts.join(' and ') || '(empty range)'}`;
		}
		case 'magnitudeGte': {
			const c = registry.getById(leaf.codeId);
			return `Magnitude of "${c?.name ?? leaf.codeId}" ≥ ${leaf.n}`;
		}
		case 'magnitudeLte': {
			const c = registry.getById(leaf.codeId);
			return `Magnitude of "${c?.name ?? leaf.codeId}" ≤ ${leaf.n}`;
		}
		case 'inFolder': return `In folder ${leaf.folderId}`;
		case 'inGroup': return `In group ${leaf.groupId}`;
		case 'engineType': return `Engine = ${leaf.engine}`;
		case 'relationExists': {
			const c = registry.getById(leaf.codeId);
			const t = leaf.targetCodeId ? registry.getById(leaf.targetCodeId)?.name : '(any)';
			return `Relation: "${c?.name ?? leaf.codeId}" ${leaf.label ? `[${leaf.label}]` : ''} → ${t ?? '(any)'}`;
		}
		case 'smartCode': {
			const sc = smartCodeApi.getSmartCode(leaf.smartCodeId);
			return `⚡ Smart code "${sc?.name ?? leaf.smartCodeId + ' (deleted)'}"`;
		}
	}
}

function renderMatchesSection(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const sectionEl = container.createDiv({ cls: 'qc-sc-matches-section' });
	const headerEl = sectionEl.createEl('h4');
	const isDirty = opts.cache.isDirty(opts.smartCode.id);
	const matches = opts.cache.getMatches(opts.smartCode.id);
	headerEl.setText(isDirty ? 'MATCHES (calculating…)' : `MATCHES (${matches.length})`);

	if (matches.length === 0) {
		sectionEl.createDiv({ text: 'No matches.', cls: 'qc-sc-matches-empty' });
		return;
	}

	const groupedByFile = new Map<string, MarkerRef[]>();
	for (const ref of matches) {
		const list = groupedByFile.get(ref.fileId) ?? [];
		list.push(ref);
		groupedByFile.set(ref.fileId, list);
	}

	const listEl = sectionEl.createDiv({ cls: 'qc-sc-matches-list' });
	for (const [fileId, refs] of groupedByFile) {
		const fileEl = listEl.createDiv({ cls: 'qc-sc-matches-file' });
		const fileHeader = fileEl.createDiv({ cls: 'qc-sc-matches-file-header' });
		fileHeader.createSpan({ text: '📄 ' });
		fileHeader.createSpan({ text: fileId, cls: 'qc-sc-matches-file-name' });
		fileHeader.createSpan({ text: ` (${refs.length})`, cls: 'qc-sc-matches-file-count' });

		for (const ref of refs.slice(0, 5)) {
			const row = fileEl.createDiv({ cls: 'qc-sc-match-row' });
			row.createSpan({ text: `  › ${ref.markerId}`, cls: 'qc-sc-match-label' });
			row.style.cursor = 'pointer';
			row.onclick = () => opts.onNavigateToMarker(ref);
		}
		if (refs.length > 5) fileEl.createDiv({ text: `  … +${refs.length - 5} more`, cls: 'qc-sc-matches-more' });
	}
}

function renderHistorySection(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const sectionEl = container.createDiv({ cls: 'qc-sc-history-section' });
	sectionEl.createEl('h4', { text: 'History' });
	const entries = getEntriesForSmartCode(opts.auditLog, opts.smartCode.id);
	if (entries.length === 0) {
		sectionEl.createDiv({ text: 'No history yet.', cls: 'qc-sc-history-empty' });
		return;
	}
	for (const entry of entries) {
		const line = sectionEl.createDiv({ cls: 'qc-sc-history-entry' });
		line.setText(renderEntryMarkdown(entry).replace(/^- /, ''));
	}
}

function renderDeleteAction(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const btn = container.createEl('button', { text: 'Delete smart code', cls: 'qc-sc-delete-btn mod-warning' });
	btn.onclick = () => {
		new ConfirmModal({
			app: opts.app,
			title: `Delete smart code "${opts.smartCode.name}"?`,
			message: 'This is reversible only via undo (Cmd+Z) within the session. Audit log preserves the deletion event.',
			confirmLabel: 'Delete',
			destructive: true,
			onConfirm: () => {
				opts.smartCodeApi.deleteSmartCode(opts.smartCode.id);
				opts.onShowList();
			},
		}).open();
	};
}
