import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { CellValue } from './csvWriter';
import { getMemoContent } from '../../core/memoHelpers';

export const GROUPS_HEADER: string[] = ['id', 'name', 'color', 'description', 'memo'];

export function buildGroupsTable(registry: CodeDefinitionRegistry): CellValue[][] {
	const rows: CellValue[][] = [GROUPS_HEADER];
	for (const g of registry.getAllGroups()) {
		rows.push([g.id, g.name, g.color, g.description ?? '', getMemoContent(g.memo)]);
	}
	return rows;
}
