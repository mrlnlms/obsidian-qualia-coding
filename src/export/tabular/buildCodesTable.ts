import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { CellValue } from './csvWriter';

export const CODES_HEADER: string[] = [
	'id', 'name', 'color', 'parent_id', 'description', 'magnitude_config',
];

export function buildCodesTable(registry: CodeDefinitionRegistry): CellValue[][] {
	const rows: CellValue[][] = [CODES_HEADER];
	for (const def of registry.getAll()) {
		rows.push([
			def.id,
			def.name,
			def.color,
			def.parentId ?? '',
			def.description ?? '',
			def.magnitude ? JSON.stringify(def.magnitude) : '',
		]);
	}
	return rows;
}
