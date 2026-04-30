import type { DataManager } from '../../core/dataManager';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { CodeApplication } from '../../core/types';
import type { CellValue } from './csvWriter';
import { getMemoContent } from '../../core/memoHelpers';

export const RELATIONS_HEADER: string[] = [
	'scope', 'origin_code_id', 'origin_segment_id', 'target_code_id', 'label', 'directed', 'memo',
];

export interface RelationsResult {
	rows: CellValue[][];
	warnings: string[];
}

export function buildRelationsTable(dm: DataManager, registry: CodeDefinitionRegistry): RelationsResult {
	const rows: CellValue[][] = [RELATIONS_HEADER];
	const warnings: string[] = [];

	// Code-level
	for (const def of registry.getAll()) {
		for (const rel of def.relations ?? []) {
			rows.push(['code', def.id, '', rel.target, rel.label, String(rel.directed), getMemoContent(rel.memo)]);
		}
	}

	// Application-level — visit every marker type
	const visit = (segmentId: string, codes: CodeApplication[]) => {
		for (const app of codes) {
			for (const rel of app.relations ?? []) {
				rows.push(['application', app.codeId, segmentId, rel.target, rel.label, String(rel.directed), getMemoContent(rel.memo)]);
			}
		}
	};

	for (const markers of Object.values(dm.section('markdown').markers)) {
		for (const m of markers) visit(m.id, m.codes);
	}
	for (const m of dm.section('pdf').markers) visit(m.id, m.codes);
	for (const s of dm.section('pdf').shapes) visit(s.id, s.codes);
	for (const m of dm.section('image').markers) visit(m.id, m.codes);
	for (const f of dm.section('audio').files) for (const m of f.markers) visit(m.id, m.codes);
	for (const f of dm.section('video').files) for (const m of f.markers) visit(m.id, m.codes);
	for (const m of dm.section('csv').segmentMarkers) visit(m.id, m.codes);
	for (const m of dm.section('csv').rowMarkers) visit(m.id, m.codes);

	return { rows, warnings };
}
