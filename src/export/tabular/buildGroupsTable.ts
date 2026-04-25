import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { CellValue } from './csvWriter';

export const GROUPS_HEADER: string[] = ['id', 'name', 'color', 'description'];

export function buildGroupsTable(registry: CodeDefinitionRegistry): CellValue[][] {
	const rows: CellValue[][] = [GROUPS_HEADER];
	for (const g of registry.getAllGroups()) {
		rows.push([g.id, g.name, g.color, g.description ?? '']);
	}
	return rows;
}
