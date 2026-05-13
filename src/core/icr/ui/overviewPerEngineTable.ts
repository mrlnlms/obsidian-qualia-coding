/**
 * Tabela κ por engine × 5 coeficientes — apresentação primária no Mode A
 * quando escopo é multimodal (2+ famílias). Camada 1 (B4, 2026-05-13).
 *
 * Cada linha = engine real com markers no escopo. Coluna = coeficiente.
 * Cohen κ por linha = média dos C(N,2) pares (N=2 vira 1 par direto); demais
 * coeficientes são scalar over cohort (vêm direto do `report.byEngine[engine]`).
 *
 * Bbox aparece como linha "spatial-bbox" agregando pdfShape + image (modo unified)
 * ou linhas separadas (modo split, mesmo critério do heatmap).
 *
 * Esta tabela usa `report.byEngine` que o reportPairwise já calcula — não há
 * custo extra além do render. Não recalcula κ.
 */

import type { PairwiseReport, EngineId, CoefficientReport } from '../reporter';
import { kappaClass } from './overviewSharedRender';

const ENGINE_LABEL: Partial<Record<EngineId, string>> = {
	markdown:   'markdown',
	pdf:        'pdf',
	csvSegment: 'csv-seg',
	csvRow:     'csv-row',
	audio:      'audio',
	video:      'video',
};

const ORDERED_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment', 'csvRow', 'audio', 'video'];

/** α-binary e cu-α precisam de boundary (char-range / temporal / spatial). Em
 *  csvRow puro (categorical sem boundary), reporter retorna 1 como sentinel
 *  "não aplicável" — mostrar 1.00 verde sólido é enganoso. */
const BOUNDED_ENGINES = new Set<EngineId>(['markdown', 'pdf', 'csvSegment', 'audio', 'video', 'pdfShape', 'image']);

export interface BboxByPair {
	mode: 'unified' | 'split';
	valuesByPair: Map<string, { spatialBbox?: number; pdfShape?: number; image?: number }>;
}

interface Row {
	label: string;
	cohen?: number;
	fleiss?: number;
	alpha?: number;
	alphaBinary?: number;
	cuAlpha?: number;
}

export function renderPerEngineTable(
	container: HTMLElement,
	reports: PairwiseReport[],
	bboxByPair?: BboxByPair,
): void {
	const wrap = container.createDiv({ cls: 'qc-cc-per-engine-wrap' });
	wrap.createDiv({
		cls: 'qc-cc-per-engine-title',
		text: 'κ por modalidade (apresentação primária — fonte de verdade quando escopo é multimodal)',
	});

	const enginesPresent = new Set<EngineId>();
	for (const pr of reports) {
		for (const e of Object.keys(pr.report.byEngine) as EngineId[]) {
			if (pr.report.byEngine[e]) enginesPresent.add(e);
		}
	}

	const rows: Row[] = [];
	for (const engine of ORDERED_ENGINES) {
		if (!enginesPresent.has(engine)) continue;
		rows.push(buildRowFromByEngine(ENGINE_LABEL[engine] ?? engine, reports, engine, BOUNDED_ENGINES.has(engine)));
	}

	if (bboxByPair && bboxByPair.valuesByPair.size > 0) {
		if (bboxByPair.mode === 'unified') {
			const vals = collectFinite([...bboxByPair.valuesByPair.values()].map(v => v.spatialBbox));
			if (vals.length > 0) rows.push({ label: 'spatial-bbox', cohen: mean(vals) });
		} else {
			const pdfVals = collectFinite([...bboxByPair.valuesByPair.values()].map(v => v.pdfShape));
			const imgVals = collectFinite([...bboxByPair.valuesByPair.values()].map(v => v.image));
			if (pdfVals.length > 0) rows.push({ label: 'pdfShape', cohen: mean(pdfVals) });
			if (imgVals.length > 0) rows.push({ label: 'image', cohen: mean(imgVals) });
		}
	}

	if (rows.length === 0) {
		wrap.createDiv({ cls: 'qc-cc-empty', text: 'Sem dados por modalidade no escopo atual' });
		return;
	}

	const table = wrap.createEl('table', { cls: 'qc-cc-per-engine-table' });
	const thead = table.createEl('thead').createEl('tr');
	['modalidade', 'Cohen κ', 'Fleiss κ', 'α', 'α-binary', 'cu-α'].forEach(h => thead.createEl('th', { text: h }));
	const tbody = table.createEl('tbody');
	for (const r of rows) {
		const tr = tbody.createEl('tr');
		tr.createEl('td', { text: r.label, cls: 'col-modality' });
		appendCell(tr, r.cohen);
		appendCell(tr, r.fleiss);
		appendCell(tr, r.alpha);
		appendCell(tr, r.alphaBinary);
		appendCell(tr, r.cuAlpha);
	}
}

function buildRowFromByEngine(label: string, reports: PairwiseReport[], engine: EngineId, hasBoundary: boolean): Row {
	const cohens: number[] = [];
	const fleiss: number[] = [];
	const alpha: number[] = [];
	const alphaBin: number[] = [];
	const cuA: number[] = [];
	for (const pr of reports) {
		const ce: CoefficientReport | undefined = pr.report.byEngine[engine];
		if (!ce) continue;
		const [a, b] = pr.pair;
		const k = ce.cohenKappa[`${a}|${b}`] ?? ce.cohenKappa[`${b}|${a}`];
		if (k && Number.isFinite(k.value)) cohens.push(k.value);
		if (Number.isFinite(ce.fleissKappa)) fleiss.push(ce.fleissKappa);
		if (Number.isFinite(ce.alphaNominal)) alpha.push(ce.alphaNominal);
		if (Number.isFinite(ce.alphaBinary)) alphaBin.push(ce.alphaBinary);
		if (Number.isFinite(ce.cuAlpha)) cuA.push(ce.cuAlpha);
	}
	return {
		label,
		cohen:       cohens.length > 0 ? mean(cohens) : undefined,
		fleiss:      fleiss.length > 0 ? mean(fleiss) : undefined,
		alpha:       alpha.length > 0 ? mean(alpha) : undefined,
		// α-binary e cu-α só fazem sentido em engines com boundary; categorical (csvRow)
		// retorna 1 como sentinel "não aplicável" — apresentação correta é "—", não 1.00.
		alphaBinary: hasBoundary && alphaBin.length > 0 ? mean(alphaBin) : undefined,
		cuAlpha:     hasBoundary && cuA.length > 0 ? mean(cuA) : undefined,
	};
}

function collectFinite(xs: (number | undefined)[]): number[] {
	return xs.filter((x): x is number => x !== undefined && Number.isFinite(x));
}

function mean(xs: number[]): number {
	return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function appendCell(tr: HTMLElement, value: number | undefined): void {
	const td = tr.createEl('td');
	if (value === undefined || !Number.isFinite(value)) {
		td.textContent = '—';
		td.addClass('qc-kappa-na');
	} else {
		td.textContent = value.toFixed(4);
		td.addClass(kappaClass(value));
	}
}
