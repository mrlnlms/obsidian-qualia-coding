/**
 * Parse + valida arquivo .json como PayloadV1 (Slice 3 P0).
 *
 * Validação shallow: confirma version, presença dos campos required.
 * Não valida tipos profundos (assume payload bem-formado se shape bate).
 */

import type { PayloadV1 } from '../transport/payloadTypes';

export interface ParseResult {
	payload: PayloadV1 | null;
	errors: string[];
}

const REQUIRED_TOP_LEVEL = ['version', 'codebookVersion', 'coder', 'sources', 'codes', 'markers', 'exportedAt'] as const;
const REQUIRED_MARKERS = ['markdown', 'pdf', 'csvSegment'] as const;

export function parseContribution(jsonString: string): ParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(jsonString);
	} catch (e) {
		return { payload: null, errors: [`parse: ${(e as Error).message}`] };
	}

	if (typeof raw !== 'object' || raw === null) {
		return { payload: null, errors: ['parse: top-level deve ser objeto'] };
	}

	const obj = raw as Record<string, unknown>;
	const errors: string[] = [];

	for (const field of REQUIRED_TOP_LEVEL) {
		if (!(field in obj)) errors.push(`falta campo "${field}"`);
	}

	if ('version' in obj && obj.version !== '1.0') {
		errors.push(`version "${obj.version}" não suportada (esperado "1.0")`);
	}

	if (obj.markers && typeof obj.markers === 'object') {
		const markers = obj.markers as Record<string, unknown>;
		for (const sub of REQUIRED_MARKERS) {
			if (!(sub in markers)) errors.push(`falta campo "markers.${sub}"`);
		}
	}

	if (errors.length > 0) {
		return { payload: null, errors };
	}

	return { payload: obj as unknown as PayloadV1, errors: [] };
}
