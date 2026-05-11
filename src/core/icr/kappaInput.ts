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

/** Source com tamanho — necessário pra cu-α/α-binary cobrirem unidades não codificadas (chance agreement).
 *  `totalUnits` é genérico: chars (texto-likes) ou segundos (audio/video). */
export interface SourceMeta {
	fileId: string;
	locator: string;
	totalUnits: number;
}

/** Input universal pros coeficientes. */
export interface KappaInput {
	markers: CodedMarker[];
	sources: SourceMeta[];
	coders: CoderId[];
}

/** Char-level explosion: para cada char (fileId, locator, pos), monta map coderId → set codeIds.
 *  Sparse: chars sem nenhum coder marcando NÃO entram no map (caller usa iterateAllCharKeys
 *  pra cobrir o universe completo via sources + lookup no map).
 *
 *  Memoizado por identidade do `markers` array (WeakMap). Os 5 coeficientes que chamam isso
 *  (cohen, fleiss, alpha, alphaBinary, cuAlpha) recebem o MESMO array dentro de um único
 *  `computeAll`, então só a primeira chamada paga o custo de O(N markers × N chars). */
const explodeCache = new WeakMap<CodedMarker[], Map<string, Map<CoderId, Set<string>>>>();

export function explodeMarkersToCharLabels(
	markers: CodedMarker[],
): Map<string, Map<CoderId, Set<string>>> {
	const cached = explodeCache.get(markers);
	if (cached) return cached;

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
	explodeCache.set(markers, result);
	return result;
}

/** Itera todas units (fileId, locator, pos) cobertas por sources.
 *  Unit pode ser char (texto) ou segundo (audio/video) — função é agnóstica. */
export function* iterateAllUnitKeys(sources: SourceMeta[]): Generator<string> {
	for (const s of sources) {
		for (let pos = 0; pos < s.totalUnits; pos++) {
			yield makeCharKey(s.fileId, s.locator, pos);
		}
	}
}

/** Char key serialization — `${fileId}:${locator}:${pos}`. Locator pode ser '' (markdown). */
export function makeCharKey(fileId: string, locator: string, pos: number): string {
	return `${fileId}:${locator}:${pos}`;
}
