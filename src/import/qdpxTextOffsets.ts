/** REFI-QDA text positions count Unicode codepoints; JavaScript strings use UTF-16 code units. */
export function qdpxCodepointLength(value: string): number {
	return Array.from(value).length;
}

export function qdpxCodepointToCodeUnit(value: string, position: number): number | null {
	if (!Number.isInteger(position) || position < 0) return null;
	let codepoints = 0;
	let codeUnits = 0;
	while (codepoints < position && codeUnits < value.length) {
		const current = value.codePointAt(codeUnits);
		if (current === undefined) return null;
		codeUnits += current > 0xffff ? 2 : 1;
		codepoints++;
	}
	return codepoints === position ? codeUnits : null;
}

export function sliceQdpxCodepoints(value: string, start: number, end: number): string | null {
	if (start < 0 || start >= end) return null;
	const startCodeUnit = qdpxCodepointToCodeUnit(value, start);
	const endCodeUnit = qdpxCodepointToCodeUnit(value, end);
	return startCodeUnit === null || endCodeUnit === null
		? null
		: value.slice(startCodeUnit, endCodeUnit);
}

export function advanceQdpxCodepoints(value: string, codeUnitStart: number, count: number): number | null {
	if (codeUnitStart < 0 || codeUnitStart > value.length || count < 0) return null;
	const suffix = value.slice(codeUnitStart);
	const relativeEnd = qdpxCodepointToCodeUnit(suffix, count);
	return relativeEnd === null ? null : codeUnitStart + relativeEnd;
}
