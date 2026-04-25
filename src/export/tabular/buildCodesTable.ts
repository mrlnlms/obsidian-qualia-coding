import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { CellValue } from './csvWriter';

export const CODES_HEADER: string[] = [
	'id', 'name', 'color', 'parent_id', 'description', 'magnitude_config', 'groups',
];

export function buildCodesTable(registry: CodeDefinitionRegistry): CellValue[][] {
	const rows: CellValue[][] = [CODES_HEADER];
	for (const def of registry.getAll()) {
		const groupNames = (def.groups ?? [])
			.map(gid => registry.getGroup(gid)?.name)
			.filter((n): n is string => !!n)
			.join(';');
		rows.push([
			def.id,
			def.name,
			def.color,
			def.parentId ?? '',
			def.description ?? '',
			def.magnitude ? JSON.stringify(def.magnitude) : '',
			groupNames,
		]);
	}
	return rows;
}
