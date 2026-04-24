import type { DataManager } from '../../core/dataManager';
import type { CellValue } from './csvWriter';
import type { PropertyType } from '../../core/caseVariables/caseVariablesTypes';

export const CASE_VARS_HEADER: string[] = ['fileId', 'variable', 'value', 'type'];

const VALID_TYPES: readonly PropertyType[] = ['text', 'multitext', 'number', 'date', 'datetime', 'checkbox'];

export interface CaseVarsResult {
	rows: CellValue[][];
	warnings: string[];
}

export function buildCaseVariablesTable(dm: DataManager): CaseVarsResult {
	const rows: CellValue[][] = [CASE_VARS_HEADER];
	const warnings: string[] = [];
	const unknownTypeVars = new Set<string>();
	const section = dm.section('caseVariables');
	const values = section.values;
	const types = section.types;

	for (const [fileId, vars] of Object.entries(values)) {
		for (const [varName, rawValue] of Object.entries(vars as Record<string, unknown>)) {
			const declared = types[varName];
			let type: PropertyType | string;
			if (declared && (VALID_TYPES as readonly string[]).includes(declared)) {
				type = declared;
			} else {
				unknownTypeVars.add(varName);
				type = 'text';
			}
			rows.push([fileId, varName, serializeValue(rawValue, type), type]);
		}
	}

	// Emit one warning per unknown variable name (not per application) to avoid noise
	for (const varName of unknownTypeVars) {
		warnings.push(`Unknown type for variable "${varName}" — defaulting to "text"`);
	}

	return { rows, warnings };
}

function serializeValue(value: unknown, type: string): string {
	if (value === null || value === undefined) return '';
	if (type === 'multitext') return JSON.stringify(value);
	if (type === 'checkbox') return value ? 'true' : 'false';
	return String(value);
}
