/**
 * Categorical input shape pra cod row (CSV linha-categórica).
 *
 * Diferente de KappaInput (texto-likes/temporal): NÃO tem geometria de overlap.
 * Cada unit é uma identidade pré-definida (fileId + sourceRowId + column).
 * Coders dão decisões POR unit, não por char.
 *
 * Algoritmos: Cohen κ / Fleiss κ / Krippendorff α nominais sobre matriz de
 * confusão de unit-level decisions. Sem char explosion.
 */

import type { CoderId } from './coderTypes';
import type { RowMarker } from '../../csv/csvCodingTypes';

export interface CategoricalUnit {
	fileId: string;
	sourceRowId: number;
	column: string;
	codeIds: string[];
	coderId: CoderId;
}

export interface CategoricalKappaInput {
	units: CategoricalUnit[];
	coders: CoderId[];
}

/** Stable key (fileId, sourceRowId, column). */
export function makeCategoricalUnitKey(fileId: string, sourceRowId: number, column: string): string {
	return `${fileId}|row:${sourceRowId}|col:${column}`;
}

export function extractRowMarkerUnit(m: RowMarker): CategoricalUnit {
	return {
		fileId: m.fileId,
		sourceRowId: m.sourceRowId,
		column: m.column,
		codeIds: m.codes.map(ca => ca.codeId),
		coderId: m.codedBy ?? 'human:default',
	};
}
