import type { DataManager } from '../../core/dataManager';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { CodeApplication } from '../../core/types';
import type { CellValue } from './csvWriter';

export const CODE_APPS_HEADER: string[] = ['segment_id', 'code_id', 'magnitude'];

export interface CodeAppsResult {
	rows: CellValue[][];
	warnings: string[];
}

export function buildCodeApplicationsTable(
	dm: DataManager,
	registry: CodeDefinitionRegistry,
): CodeAppsResult {
	const rows: CellValue[][] = [CODE_APPS_HEADER];
	const warnings: string[] = [];
	const validCodeIds = new Set(registry.getAll().map(d => d.id));

	const emit = (segmentId: string, codes: CodeApplication[]) => {
		for (const app of codes) {
			if (!validCodeIds.has(app.codeId)) {
				warnings.push(`Orphan code_id on segment ${segmentId}: ${app.codeId}`);
				continue;
			}
			rows.push([segmentId, app.codeId, app.magnitude ?? '']);
		}
	};

	for (const markers of Object.values(dm.section('markdown').markers)) {
		for (const m of markers) emit(m.id, m.codes);
	}
	for (const m of dm.section('pdf').markers) emit(m.id, m.codes);
	for (const s of dm.section('pdf').shapes) emit(s.id, s.codes);
	for (const m of dm.section('image').markers) emit(m.id, m.codes);
	for (const f of dm.section('audio').files) for (const m of f.markers) emit(m.id, m.codes);
	for (const f of dm.section('video').files) for (const m of f.markers) emit(m.id, m.codes);
	for (const m of dm.section('csv').segmentMarkers) emit(m.id, m.codes);
	for (const m of dm.section('csv').rowMarkers) emit(m.id, m.codes);

	return { rows, warnings };
}
