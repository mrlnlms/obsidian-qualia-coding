import type { DataManager } from '../../core/dataManager';
import type { CellValue } from './csvWriter';

export const CODERS_HEADER: string[] = ['id', 'name', 'type', 'createdAt'];

export function buildCodersTable(dm: DataManager): CellValue[][] {
	const rows: CellValue[][] = [CODERS_HEADER];
	const coders = dm.section('coders')?.coders ?? [];
	for (const c of coders) {
		rows.push([
			c.id,
			c.name,
			c.type,
			isoOrEmpty(c.createdAt),
		]);
	}
	return rows;
}

function isoOrEmpty(ms: number): string {
	if (!Number.isFinite(ms)) return '';
	try { return new Date(ms).toISOString(); } catch { return ''; }
}
