import type { DataManager } from '../../core/dataManager';
import type { CellValue } from './csvWriter';
import type { PropertyType } from '../../core/caseVariables/caseVariablesTypes';
import { inferPropertyType } from '../../core/caseVariables/inferPropertyType';

export const CASE_VARS_HEADER: string[] = ['fileId', 'variable', 'value', 'type'];

const VALID_TYPES: readonly PropertyType[] = ['text', 'multitext', 'number', 'date', 'datetime', 'checkbox'];

export interface CaseVarsResult {
	rows: CellValue[][];
	warnings: string[];
}

export function buildCaseVariablesTable(dm: DataManager): CaseVarsResult {
	const rows: CellValue[][] = [CASE_VARS_HEADER];
	const warnings: string[] = [];
	const invalidTypeVars = new Set<string>();
	const section = dm.section('caseVariables');
	const values = section.values;
	const types = section.types;

	for (const [fileId, vars] of Object.entries(values)) {
		for (const [varName, rawValue] of Object.entries(vars as Record<string, unknown>)) {
			const declared = types[varName];
			let type: PropertyType;
			if (declared && (VALID_TYPES as readonly string[]).includes(declared)) {
				type = declared;
			} else if (declared) {
				// Registered but invalid type → warn (real data issue)
				invalidTypeVars.add(varName);
				type = 'text';
			} else {
				// Not registered (e.g., frontmatter property without explicit type) →
				// infer from value silently. Arrays get multitext; scalars use inferPropertyType.
				type = inferType(rawValue);
			}
			rows.push([fileId, varName, serializeValue(rawValue, type), type]);
		}
	}

	for (const varName of invalidTypeVars) {
		warnings.push(`Invalid type registered for variable "${varName}" — defaulting to "text"`);
	}

	return { rows, warnings };
}

function inferType(value: unknown): PropertyType {
	if (Array.isArray(value)) return 'multitext';
	if (typeof value === 'boolean') return 'checkbox';
	if (typeof value === 'number') return 'number';
	if (value === null || value === undefined) return 'text';
	return inferPropertyType(String(value));
}

function serializeValue(value: unknown, type: string): string {
	if (value === null || value === undefined) return '';
	if (type === 'multitext') return JSON.stringify(value);
	if (type === 'checkbox') return value ? 'true' : 'false';
	return String(value);
}
