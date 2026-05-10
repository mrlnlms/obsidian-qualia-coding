/**
 * Lado a lado chip — marker-by-marker da contribuição com locals sobrepondo.
 * Filter: todos / só sobrepondo / só novos. Accept (noop, navega next) / Skip (perMarkerSkip).
 * Navegação ←/→ via callback (view registra keyboard listener).
 *
 * filterCodeId opcional: quando setado (vindo do "Revisar 1-a-1 →" do chip Por código),
 * restringe markers àqueles que contenham esse codeId.
 */

import type { PendingContribution, SideBySideFilter } from './contributionViewTypes';
import { findOverlappingLocalMarkers, type EngineForOverlap } from './overlapHelper';

export interface SideBySideContext {
	/** Markers locais por fileId (resolvido após remap). View extrai do plugin. */
	localMarkersByFileId: Record<string, any[]>;
	/** Source text pra markdown overlap (opcional, view busca via vault). */
	sourceText?: string;
}

export interface SideBySideCallbacks {
	currentIndex: number;
	filter: SideBySideFilter;
	filterCodeId: string | null;
	onSkipMarker: (markerId: string) => void;
	onNavigate: (delta: number) => void;
	onFilterChange: (f: SideBySideFilter) => void;
	onClearCodeFilter: () => void;
}

interface FlatMarker {
	engine: EngineForOverlap;
	marker: any;
	fileId: string;
}

export function renderSideBySideChip(
	container: HTMLElement,
	contrib: PendingContribution,
	ctx: SideBySideContext,
	cb: SideBySideCallbacks,
): void {
	container.empty();

	// Filter chips toolbar
	const filterRow = container.createDiv({ cls: 'qc-icr-filter-row' });
	for (const f of ['all', 'overlapping', 'new'] as SideBySideFilter[]) {
		const chip = filterRow.createSpan({
			cls: `qc-icr-filter-chip ${f === cb.filter ? 'is-active' : ''}`,
			text: filterLabel(f),
		});
		chip.onclick = () => cb.onFilterChange(f);
	}
	if (cb.filterCodeId) {
		const pill = filterRow.createSpan({ cls: 'qc-icr-filter-pill', text: `code: ${cb.filterCodeId} ✕` });
		pill.onclick = () => cb.onClearCodeFilter();
	}

	// Flatten + filter
	const all = flattenMarkers(contrib);
	let filtered = filterMarkers(all, ctx, cb.filter);
	if (cb.filterCodeId) {
		filtered = filtered.filter(fm => (fm.marker.codes ?? []).some((c: any) => c.codeId === cb.filterCodeId));
	}

	if (filtered.length === 0) {
		const empty = container.createDiv({ cls: 'qc-icr-empty' });
		empty.setText('nenhum marker bate com esse filter');
		return;
	}

	const safeIdx = Math.min(Math.max(0, cb.currentIndex), filtered.length - 1);
	const current = filtered[safeIdx]!;

	const header = container.createDiv({ cls: 'qc-icr-marker-header' });
	header.setText(`marker ${safeIdx + 1}/${filtered.length} · ⌨ ←/→ navega · source ${current.fileId}`);

	const card = container.createDiv({ cls: 'qc-icr-marker-card' });
	const text = card.createDiv({ cls: 'qc-icr-marker-text' });
	text.setText(current.marker.text ?? '(sem texto preview)');

	const side = card.createDiv({ cls: 'qc-icr-marker-side' });

	const localCell = side.createDiv({ cls: 'qc-icr-marker-side-local' });
	localCell.createEl('h6', { text: 'Local (você)' });
	const localOverlapping = findOverlappingLocalMarkers(
		current.engine,
		current.marker,
		ctx.localMarkersByFileId[current.fileId] ?? [],
		ctx.sourceText,
	);
	if (localOverlapping.length === 0) {
		const empty = localCell.createSpan({ cls: 'qc-icr-code-tag absent' });
		empty.setText('— sem marker —');
	} else {
		for (const l of localOverlapping) {
			for (const c of (l as any).codes ?? []) {
				const tag = localCell.createSpan({ cls: 'qc-icr-code-tag' });
				tag.setText(resolveCodeName(c.codeId, contrib));
			}
		}
	}

	const incomingCell = side.createDiv({ cls: 'qc-icr-marker-side-incoming' });
	incomingCell.createEl('h6', { text: contrib.payload.coder.name });
	for (const c of (current.marker.codes ?? [])) {
		const tag = incomingCell.createSpan({ cls: 'qc-icr-code-tag theirs' });
		tag.setText(resolveCodeName(c.codeId, contrib));
	}
	if (current.marker.memo) {
		const memo = incomingCell.createDiv({ cls: 'qc-icr-marker-memo' });
		memo.setText(`memo: "${current.marker.memo}"`);
	}

	const actions = card.createDiv({ cls: 'qc-icr-marker-actions' });
	const accept = actions.createEl('button', { cls: 'qc-icr-button', text: `Accept (mantém ${contrib.payload.coder.name})` });
	accept.onclick = () => cb.onNavigate(+1);
	const skip = actions.createEl('button', { cls: 'qc-icr-button secondary', text: 'Skip (não importa esse)' });
	skip.onclick = () => {
		cb.onSkipMarker(current.marker.id);
		cb.onNavigate(+1);
	};
}

function flattenMarkers(contrib: PendingContribution): FlatMarker[] {
	const out: FlatMarker[] = [];
	for (const [fid, markers] of Object.entries(contrib.payload.markers.markdown)) {
		for (const m of markers) out.push({ engine: 'markdown', marker: m, fileId: fid });
	}
	for (const m of contrib.payload.markers.pdf) out.push({ engine: 'pdf', marker: m, fileId: m.fileId });
	for (const m of contrib.payload.markers.csvSegment) out.push({ engine: 'csvSegment', marker: m, fileId: m.fileId });
	return out;
}

function filterMarkers(all: FlatMarker[], ctx: SideBySideContext, filter: SideBySideFilter): FlatMarker[] {
	if (filter === 'all') return all;
	return all.filter(fm => {
		const overlapping = findOverlappingLocalMarkers(fm.engine, fm.marker, ctx.localMarkersByFileId[fm.fileId] ?? [], ctx.sourceText);
		const hasOverlap = overlapping.length > 0;
		return filter === 'overlapping' ? hasOverlap : !hasOverlap;
	});
}

function filterLabel(f: SideBySideFilter): string {
	return { all: 'todos', overlapping: 'só sobrepondo local', new: 'só novos' }[f];
}

function resolveCodeName(codeId: string, contrib: PendingContribution): string {
	return contrib.payload.codes.find(c => c.id === codeId)?.name ?? codeId;
}
