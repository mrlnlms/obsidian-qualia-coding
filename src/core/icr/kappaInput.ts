/**
 * KappaInput shape — input universal pros coeficientes (Cohen, Fleiss, α, α-binary, cu-α).
 *
 * Per-char unit space:
 * - Cada char (fileId, locator, pos) é uma unit
 * - Universe of units = todos chars de todos sources (chars não codificados viram '__none__')
 *
 * Caller monta CodedMarker[] já normalizado (TextRange via adapters por engine).
 */

import type { CoderId } from './coderTypes';
import type { TextRange } from './textRange';

/** Marker normalizado pra input dos coeficientes. */
export interface CodedMarker {
	coderId: CoderId;
	range: TextRange;
	codeIds: string[];
}

/** Source com tamanho — necessário pra cu-α/α-binary cobrirem chars não codificados (chance agreement). */
export interface SourceMeta {
	fileId: string;
	locator: string;
	totalChars: number;
}

/** Input universal pros coeficientes. */
export interface KappaInput {
	markers: CodedMarker[];
	sources: SourceMeta[];
	coders: CoderId[];
}

/** Char-level explosion: para cada char (fileId, locator, pos), monta map coderId → set codeIds.
 *  Sparse: chars sem nenhum coder marcando NÃO entram no map (caller usa iterateAllCharKeys
 *  pra cobrir o universe completo via sources + lookup no map). */
export function explodeMarkersToCharLabels(
	markers: CodedMarker[],
): Map<string, Map<CoderId, Set<string>>> {
	const result = new Map<string, Map<CoderId, Set<string>>>();
	for (const m of markers) {
		for (let pos = m.range.from; pos < m.range.to; pos++) {
			const key = makeCharKey(m.range.fileId, m.range.locator, pos);
			let coderMap = result.get(key);
			if (!coderMap) {
				coderMap = new Map();
				result.set(key, coderMap);
			}
			let codeSet = coderMap.get(m.coderId);
			if (!codeSet) {
				codeSet = new Set();
				coderMap.set(m.coderId, codeSet);
			}
			for (const cid of m.codeIds) codeSet.add(cid);
		}
	}
	return result;
}

/** Itera todos chars (fileId, locator, pos) cobertos por sources. */
export function* iterateAllCharKeys(sources: SourceMeta[]): Generator<string> {
	for (const s of sources) {
		for (let pos = 0; pos < s.totalChars; pos++) {
			yield makeCharKey(s.fileId, s.locator, pos);
		}
	}
}

/** Char key serialization — `${fileId}:${locator}:${pos}`. Locator pode ser '' (markdown). */
export function makeCharKey(fileId: string, locator: string, pos: number): string {
	return `${fileId}:${locator}:${pos}`;
}
