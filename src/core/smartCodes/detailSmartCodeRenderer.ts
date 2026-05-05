import { App, setIcon } from 'obsidian';
import type { SmartCodeDefinition, MarkerRef, PredicateNode, LeafNode } from './types';
import { isOpNode } from './types';
import type { SmartCodeRegistry } from './smartCodeRegistryApi';
import type { SmartCodeCache } from './cache';
import type { CodeDefinitionRegistry } from '../codeDefinitionRegistry';
import { getEntriesForSmartCode, renderEntryMarkdown } from '../auditLog';
import type { AuditEntry, BaseMarker } from '../types';
import { ConfirmModal } from '../dialogs';
import { renderBackButton } from '../detailCodeRenderer';

export interface SmartCodeDetailCallbacks {
	smartCode: SmartCodeDefinition;
	cache: SmartCodeCache;
	smartCodeRegistry: SmartCodeRegistry;
	registry: CodeDefinitionRegistry;
	auditLog: AuditEntry[];
	app: App;
	onEditPredicate: () => void;
	onShowList: () => void;
	/** Caller fecha o modal e navega pro marker (engine-aware). */
	onNavigateToMarker: (ref: MarkerRef) => void;
	/** Engine-aware label do marker (excerpt/timecode/page). Mesmo helper do code detail. */
	getMarkerLabel(marker: BaseMarker): string;
	/** Strip extensão / encurta file path pra display. Mesmo helper do code detail. */
	shortenPath(fileId: string): string;
	/** Suspend/resume auto-refresh enquanto user edita memo (mesmo padrão do code detail). Optional. */
	suspendRefresh?: () => void;
	resumeRefresh?: () => void;
}

export function renderSmartCodeDetail(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	container.empty();

	renderBackButton(container, 'All Codes', () => opts.onShowList());
	renderHeader(container, opts);
	renderMemo(container, opts);
	renderQuerySection(container, opts);
	renderMatchesSection(container, opts);
	renderHistorySection(container, opts);
	renderDeleteAction(container, opts);
}

function renderHeader(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const header = container.createDiv({ cls: 'codemarker-detail-header' });
	const swatch = header.createSpan({ cls: 'codemarker-detail-swatch' });
	swatch.style.backgroundColor = opts.smartCode.color;
	header.createSpan({ text: '⚡ ', cls: 'qc-sc-detail-bolt' });
	header.createSpan({ text: opts.smartCode.name, cls: 'codemarker-detail-title' });
}

function renderMemo(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const section = container.createDiv({ cls: 'codemarker-detail-section' });
	const header = section.createDiv({ cls: 'codemarker-detail-section-header' });
	header.createEl('h6', { text: 'Memo' });

	const textarea = section.createEl('textarea', {
		cls: 'codemarker-detail-memo',
		attr: { placeholder: 'Justificativa metodológica desta query…', rows: '3' },
	});
	textarea.value = opts.smartCode.memo ?? '';
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	textarea.addEventListener('input', () => {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveTimer = null;
			opts.smartCodeRegistry.setMemo(opts.smartCode.id, textarea.value);
		}, 500);
	});
	// Mesmo pattern do code memo: suspend auto-refresh enquanto focado pra textarea não sumir.
	textarea.addEventListener('focus', () => opts.suspendRefresh?.());
	textarea.addEventListener('blur', () => opts.resumeRefresh?.());
}

function renderQuerySection(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const section = container.createDiv({ cls: 'codemarker-detail-section' });
	const header = section.createDiv({ cls: 'codemarker-detail-section-header' });
	header.createEl('h6', { text: 'Query' });
	const editBtn = header.createEl('button', { text: 'Edit query', cls: 'qc-sc-edit-btn' });
	editBtn.onclick = opts.onEditPredicate;

	const treeEl = section.createDiv({ cls: 'qc-sc-predicate-tree' });
	renderPredicateLine(treeEl, opts.smartCode.predicate, opts, 0);
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
		line.createSpan({ text: formatLeaf(node, opts.registry, opts.smartCodeRegistry) });
	}
}

function formatLeaf(leaf: LeafNode, registry: CodeDefinitionRegistry, smartCodeRegistry: SmartCodeRegistry): string {
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
		case 'inFolder': {
			const f = registry.getFolderById(leaf.folderId);
			return `In folder "${f?.name ?? leaf.folderId + ' (deleted)'}"`;
		}
		case 'inGroup': {
			const g = registry.getAllGroups().find(x => x.id === leaf.groupId);
			return `In group "${g?.name ?? leaf.groupId + ' (deleted)'}"`;
		}
		case 'engineType': return `Engine = ${leaf.engine}`;
		case 'relationExists': {
			const c = registry.getById(leaf.codeId);
			const t = leaf.targetCodeId ? registry.getById(leaf.targetCodeId)?.name : '(any)';
			return `Relation: "${c?.name ?? leaf.codeId}" ${leaf.label ? `[${leaf.label}]` : ''} → ${t ?? '(any)'}`;
		}
		case 'smartCode': {
			const sc = smartCodeRegistry.getById(leaf.smartCodeId);
			return `⚡ Smart code "${sc?.name ?? leaf.smartCodeId + ' (deleted)'}"`;
		}
	}
}

function renderMatchesSection(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const section = container.createDiv({ cls: 'codemarker-detail-section' });
	const header = section.createDiv({ cls: 'codemarker-detail-section-header' });
	const matches = opts.cache.getMatches(opts.smartCode.id);
	header.createEl('h6', { text: `Matches (${matches.length})` });

	if (matches.length === 0) {
		section.createDiv({ text: 'No matches.', cls: 'codemarker-detail-empty' });
		return;
	}

	const groupedByFile = new Map<string, MarkerRef[]>();
	for (const ref of matches) {
		const list = groupedByFile.get(ref.fileId) ?? [];
		list.push(ref);
		groupedByFile.set(ref.fileId, list);
	}

	const listEl = section.createDiv({ cls: 'qc-sc-matches-list' });
	for (const [fileId, refs] of groupedByFile) {
		const fileEl = listEl.createDiv({ cls: 'qc-sc-matches-file' });
		const fileHeader = fileEl.createDiv({ cls: 'qc-sc-matches-file-header' });
		fileHeader.createSpan({ text: '📄 ' });
		const fileLink = fileHeader.createSpan({ text: opts.shortenPath(fileId), cls: 'qc-sc-matches-file-name' });
		fileHeader.createSpan({ text: ` (${refs.length})`, cls: 'qc-sc-matches-file-count' });
		fileLink.style.cursor = 'pointer';
		fileLink.onclick = () => opts.onNavigateToMarker(refs[0]!);

		for (const ref of refs.slice(0, 5)) {
			const row = fileEl.createDiv({ cls: 'qc-sc-match-row' });
			const marker = opts.cache.getMarkerByRef(ref);
			const label = marker ? opts.getMarkerLabel(marker as BaseMarker) : ref.markerId;
			row.createSpan({ text: `  › ${label}`, cls: 'qc-sc-match-label' });
			row.style.cursor = 'pointer';
			row.onclick = () => opts.onNavigateToMarker(ref);
		}
		if (refs.length > 5) fileEl.createDiv({ text: `  … +${refs.length - 5} more`, cls: 'qc-sc-matches-more' });
	}
}

function renderHistorySection(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const section = container.createDiv({ cls: 'codemarker-detail-section codemarker-history-section' });
	const header = section.createDiv({ cls: 'codemarker-detail-section-header' });
	header.createEl('h6', { text: 'History' });

	const entries = getEntriesForSmartCode(opts.auditLog, opts.smartCode.id);
	if (entries.length === 0) {
		section.createDiv({ text: 'No history yet.', cls: 'codemarker-detail-empty' });
		return;
	}
	for (const entry of entries) {
		const line = section.createDiv({ cls: 'codemarker-history-entry' });
		const md = renderEntryMarkdown(entry);
		line.setText(md.startsWith('- ') ? md.slice(2) : md);
	}
}

function renderDeleteAction(container: HTMLElement, opts: SmartCodeDetailCallbacks): void {
	const section = container.createDiv({ cls: 'codemarker-detail-danger-zone' });
	const btn = section.createEl('button', { cls: 'codemarker-detail-delete-btn' });
	const iconSpan = btn.createSpan({ cls: 'codemarker-detail-delete-icon' });
	setIcon(iconSpan, 'trash-2');
	btn.createSpan({ text: `Delete "${opts.smartCode.name}"` });
	btn.addEventListener('click', () => {
		new ConfirmModal({
			app: opts.app,
			title: `Delete smart code "${opts.smartCode.name}"?`,
			message: 'Audit log preserves the deletion event. Reversible only via undo (Cmd+Z) within the session.',
			confirmLabel: 'Delete',
			destructive: true,
			onConfirm: () => {
				opts.smartCodeRegistry.delete(opts.smartCode.id);
				opts.onShowList();
			},
		}).open();
	});
}
