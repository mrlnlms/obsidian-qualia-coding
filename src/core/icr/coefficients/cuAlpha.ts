/**
 * cu-α — code agreement only over chars marked by ALL coders (interseção de boundaries).
 *
 * Filtra char universe pros chars compartilhados; reusa αNominal sobre o subset.
 * ATLAS.ti pattern: complementa α-binary — separa boundary disagreement de code disagreement.
 *
 * Edge cases:
 * - Sem chars compartilhados → 1 (vacuous, convenção).
 */

import type { KappaInput, SourceMeta, CodedMarker } from '../kappaInput';
import { explodeMarkersToCharLabels } from '../kappaInput';
import { krippendorffAlphaNominal, type KrippendorffAlphaOptions } from './krippendorffAlpha';

export function cuAlpha(input: KappaInput, options: KrippendorffAlphaOptions = {}): number {
	const charMap = explodeMarkersToCharLabels(input.markers);
	// Set de (sourceKey → set of pos string) onde TODOS coders marcaram
	const sharedChars = new Map<string, Set<number>>();

	for (const [key, coderMap] of charMap) {
		if (coderMap.size === input.coders.length) {
			// All coders present
			const lastColon = key.lastIndexOf(':');
			const sourceKey = key.slice(0, lastColon);
			const pos = parseInt(key.slice(lastColon + 1), 10);
			let set = sharedChars.get(sourceKey);
			if (!set) {
				set = new Set();
				sharedChars.set(sourceKey, set);
			}
			set.add(pos);
		}
	}

	if (sharedChars.size === 0) return 1;

	// Filter markers — só ranges contíguos sobre shared positions
	const filteredMarkers: CodedMarker[] = input.markers.flatMap(m => {
		const sourceKey = `${m.range.fileId}:${m.range.locator}`;
		const sharedSet = sharedChars.get(sourceKey);
		if (!sharedSet) return [];
		const ranges: CodedMarker[] = [];
		let curFrom: number | null = null;
		for (let pos = m.range.from; pos < m.range.to; pos++) {
			if (sharedSet.has(pos)) {
				if (curFrom === null) curFrom = pos;
			} else {
				if (curFrom !== null) {
					ranges.push({ ...m, range: { ...m.range, from: curFrom, to: pos } });
					curFrom = null;
				}
			}
		}
		if (curFrom !== null) {
			ranges.push({ ...m, range: { ...m.range, from: curFrom, to: m.range.to } });
		}
		return ranges;
	});

	// Build sources truncados: each source totalUnits = max shared pos + 1
	const newSources: SourceMeta[] = [];
	for (const s of input.sources) {
		const key = `${s.fileId}:${s.locator}`;
		const set = sharedChars.get(key);
		if (!set || set.size === 0) continue;
		const maxPos = Math.max(...set);
		newSources.push({ ...s, totalUnits: maxPos + 1 });
	}

	if (newSources.length === 0) return 1;

	return krippendorffAlphaNominal({
		markers: filteredMarkers,
		sources: newSources,
		coders: input.coders,
	}, options);
}
