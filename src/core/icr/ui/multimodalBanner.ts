/**
 * Banner discreto + detecção de escopo multimodal — Camada 1 (B4, 2026-05-13).
 *
 * Quando o escopo cruza 2+ famílias de modalidade (text-like / temporal /
 * categorical / spatial-bbox), κ/α agregados perdem fundamento na literatura
 * (Krippendorff 2018; Artstein & Poesio 2008; Mathet et al. 2015 — cada UoA
 * exige sua própria δ; pool entre δ heterogêneas não é definido). Pesquisa
 * cravada em `obsidian-qualia-coding/Research/ICR Multimodal - Unidades Heterogeneas.md`.
 *
 * Família = grupo de engines com a mesma δ:
 *  - text-like: markdown, pdf, csvSegment (char-range)
 *  - temporal:  audio, video (segundos)
 *  - categorical: csvRow (linha tabular)
 *  - spatial-bbox: pdfShape, image (IoU)
 */

import type { EngineKappaInput, EngineId } from '../reporter';
import type { ComparisonScope } from './compareCodersTypes';
import type { EngineModelsForExtraction } from './scopeExtraction';
import type { CoderId } from '../coderTypes';

const TEXT_LIKE: EngineId[]    = ['markdown', 'pdf', 'csvSegment'];
const TEMPORAL: EngineId[]     = ['audio', 'video'];
const CATEGORICAL: EngineId[]  = ['csvRow'];

export type ModalityFamily = 'text-like' | 'temporal' | 'categorical' | 'spatial-bbox';

export function familyOf(engine: EngineId): ModalityFamily | undefined {
	if (TEXT_LIKE.includes(engine))   return 'text-like';
	if (TEMPORAL.includes(engine))    return 'temporal';
	if (CATEGORICAL.includes(engine)) return 'categorical';
	return undefined;
}

/** Retorna as famílias presentes — engines text/temporal/categorical lidas dos inputs;
 *  spatial-bbox passado como flag pelo caller (vem por canal separado em overviewMatrix). */
export function activeFamilies(inputs: EngineKappaInput[], hasBbox: boolean): Set<ModalityFamily> {
	const set = new Set<ModalityFamily>();
	for (const { engine } of inputs) {
		const f = familyOf(engine);
		if (f) set.add(f);
	}
	if (hasBbox) set.add('spatial-bbox');
	return set;
}

/** Família ativa varrendo direto os models — usado quando o caller não tem inputs
 *  já extraídos (overviewTable detecta antes de fazer extracts per-code). Aplica os
 *  mesmos filtros de scope (coderIds/codeIds/fileIds/engineIds). */
export function activeFamiliesFromModels(
	scope: ComparisonScope,
	models: EngineModelsForExtraction,
): Set<ModalityFamily> {
	const set = new Set<ModalityFamily>();
	const coderSet = new Set<CoderId>(scope.coderIds);
	const codeSet = scope.codeIds ? new Set(scope.codeIds) : null;
	const fileSet = scope.fileIds ? new Set(scope.fileIds) : null;
	const engineSet = scope.engineIds ? new Set(scope.engineIds) : null;

	const hasAny = (markers: { codedBy?: string; codes?: { codeId: string }[]; fileId?: string }[]): boolean => {
		for (const m of markers) {
			if (!m.codedBy || !coderSet.has(m.codedBy)) continue;
			if (fileSet && m.fileId && !fileSet.has(m.fileId)) continue;
			if (codeSet) {
				const codes = m.codes ?? [];
				if (!codes.some(c => codeSet.has(c.codeId))) continue;
			}
			return true;
		}
		return false;
	};

	const probe = (engine: EngineId, markers: { codedBy?: string; codes?: { codeId: string }[]; fileId?: string }[]) => {
		if (engineSet && !engineSet.has(engine)) return;
		if (!hasAny(markers)) return;
		const f = familyOf(engine);
		if (f) set.add(f);
		else if (engine === 'pdfShape' || engine === 'image') set.add('spatial-bbox');
	};

	if (models.markdown) probe('markdown', models.markdown.getAllMarkers() as never);
	if (models.pdf) {
		probe('pdf', models.pdf.getAllMarkers() as never);
		const shapes = (models.pdf as { getAllShapes?: () => unknown[] }).getAllShapes?.();
		if (shapes) probe('pdfShape', shapes as never);
	}
	if (models.csv) {
		const all = models.csv.getAllMarkers() as { codedBy?: string; codes?: { codeId: string }[]; fileId?: string; from?: number }[];
		// Discriminator: SegmentMarker tem `from` (char offset); RowMarker não tem.
		const segs = all.filter(m => typeof m.from === 'number');
		const rows = all.filter(m => typeof m.from !== 'number');
		if (segs.length > 0) probe('csvSegment', segs);
		if (rows.length > 0) probe('csvRow', rows);
	}
	if (models.audio) probe('audio', models.audio.getAllMarkers() as never);
	if (models.video) probe('video', models.video.getAllMarkers() as never);
	if (models.image) probe('image', models.image.getAllMarkers() as never);

	return set;
}

const FAMILY_LABEL: Record<ModalityFamily, string> = {
	'text-like':    'texto (char-range)',
	'temporal':     'temporal (segundos)',
	'categorical':  'categórica (linha tabular)',
	'spatial-bbox': 'espacial (bbox 2D)',
};

export function familyLabel(f: ModalityFamily): string {
	return FAMILY_LABEL[f];
}

/** Banner discreto. No-op quando families.size < 2. */
export function renderMultimodalBanner(
	container: HTMLElement,
	families: Set<ModalityFamily>,
): void {
	if (families.size < 2) return;
	const banner = container.createDiv({ cls: 'qc-cc-multimodal-banner' });
	banner.createSpan({ cls: 'qc-cc-multimodal-icon', text: '⚠' });
	const msg = banner.createSpan({ cls: 'qc-cc-multimodal-msg' });
	msg.appendText('κ/α são definidos sobre uma única modalidade — comparar valores entre modalidades requer cautela (δ heterogêneas).');
	const detail = banner.createSpan({ cls: 'qc-cc-multimodal-detail' });
	const list = [...families].map(familyLabel).join(' · ');
	detail.appendText(` Modalidades ativas no escopo: ${list}.`);
	banner.title = [
		'Cada modalidade tem sua própria função distância (δ) e seu próprio coeficiente.',
		'Pool entre δ heterogêneas não está definido na literatura.',
		'Krippendorff (2018); Artstein & Poesio (2008); Mathet et al. (2015).',
		'',
		'Detalhe em: obsidian-qualia-coding/Research/ICR Multimodal - Unidades Heterogeneas.md',
	].join('\n');
}
