/**
 * α-binary — two-level: "existe quotation aqui?" (boundary detection ignorando qual código).
 *
 * Collapse: substitui todos codeIds por '__present__'. Reusa Krippendorff α nominal sobre
 * universe binário {present, __none__}. ATLAS.ti pattern.
 */

import type { KappaInput, CodedMarker } from '../kappaInput';
import { krippendorffAlphaNominal } from './krippendorffAlpha';

export function alphaBinary(input: KappaInput): number {
	const collapsedMarkers: CodedMarker[] = input.markers.map(m => ({
		...m,
		codeIds: ['__present__'],
	}));
	return krippendorffAlphaNominal({
		...input,
		markers: collapsedMarkers,
	});
}
