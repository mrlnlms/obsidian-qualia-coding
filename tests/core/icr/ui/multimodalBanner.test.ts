import { describe, it, expect } from 'vitest';
import { activeFamilies, activeFamiliesFromModels, familyOf } from '../../../../src/core/icr/ui/multimodalBanner';
import type { EngineKappaInput } from '../../../../src/core/icr/reporter';

const stubKappaInput = { markers: [], sources: {}, coders: [] as string[] };

function input(engine: Parameters<typeof familyOf>[0]): EngineKappaInput {
	return { engine, kappaInput: stubKappaInput as never };
}

describe('familyOf', () => {
	it('text-like: markdown, pdf, csvSegment', () => {
		expect(familyOf('markdown')).toBe('text-like');
		expect(familyOf('pdf')).toBe('text-like');
		expect(familyOf('csvSegment')).toBe('text-like');
	});
	it('temporal: audio, video', () => {
		expect(familyOf('audio')).toBe('temporal');
		expect(familyOf('video')).toBe('temporal');
	});
	it('categorical: csvRow', () => {
		expect(familyOf('csvRow')).toBe('categorical');
	});
	it('spatial-bbox engines retornam undefined em familyOf (tratado via hasBbox flag)', () => {
		expect(familyOf('pdfShape')).toBeUndefined();
		expect(familyOf('image')).toBeUndefined();
	});
});

describe('activeFamilies', () => {
	it('vazio = Set vazio', () => {
		expect(activeFamilies([], false).size).toBe(0);
	});

	it('só markdown + sem bbox = {text-like}', () => {
		const f = activeFamilies([input('markdown')], false);
		expect([...f]).toEqual(['text-like']);
	});

	it('markdown + pdf + csvSegment = 1 família (text-like)', () => {
		const f = activeFamilies([input('markdown'), input('pdf'), input('csvSegment')], false);
		expect(f.size).toBe(1);
		expect(f.has('text-like')).toBe(true);
	});

	it('markdown + audio = {text-like, temporal} → multimodal', () => {
		const f = activeFamilies([input('markdown'), input('audio')], false);
		expect(f.size).toBe(2);
		expect(f.has('text-like')).toBe(true);
		expect(f.has('temporal')).toBe(true);
	});

	it('csvRow + audio = {categorical, temporal} → multimodal', () => {
		const f = activeFamilies([input('csvRow'), input('audio')], false);
		expect(f.size).toBe(2);
	});

	it('bbox flag + markdown = {text-like, spatial-bbox}', () => {
		const f = activeFamilies([input('markdown')], true);
		expect(f.size).toBe(2);
		expect(f.has('spatial-bbox')).toBe(true);
	});

	it('bbox flag isolado = {spatial-bbox}', () => {
		const f = activeFamilies([], true);
		expect([...f]).toEqual(['spatial-bbox']);
	});
});

describe('activeFamiliesFromModels — varredura sobre models', () => {
	const baseMarker = (codedBy: string, codeId: string, fileId = 'f1.md') => ({
		codedBy, codes: [{ codeId }], fileId,
	});

	const scope = { coderIds: ['c1', 'c2'] };

	it('models vazios = Set vazio', () => {
		expect(activeFamiliesFromModels(scope, {}).size).toBe(0);
	});

	it('markdown só = {text-like}', () => {
		const models = {
			markdown: { getAllMarkers: () => [baseMarker('c1', 'X')] },
		} as never;
		const f = activeFamiliesFromModels(scope, models);
		expect([...f]).toEqual(['text-like']);
	});

	it('markdown + audio = multimodal {text-like, temporal}', () => {
		const models = {
			markdown: { getAllMarkers: () => [baseMarker('c1', 'X')] },
			audio:    { getAllMarkers: () => [baseMarker('c1', 'X', 'a1.mp3')] },
		} as never;
		const f = activeFamiliesFromModels(scope, models);
		expect(f.size).toBe(2);
		expect(f.has('text-like')).toBe(true);
		expect(f.has('temporal')).toBe(true);
	});

	it('pdf shapes detectados como spatial-bbox', () => {
		const models = {
			pdf: {
				getAllMarkers: () => [] as never[],
				getAllShapes: () => [baseMarker('c1', 'X', 'doc.pdf')],
			},
		} as never;
		const f = activeFamiliesFromModels(scope, models);
		expect([...f]).toEqual(['spatial-bbox']);
	});

	it('csv com SegmentMarker (com from) vs RowMarker (sem from) → famílias diferentes', () => {
		const seg = { ...baseMarker('c1', 'X', 'data.csv'), from: 0, to: 5 };
		const row = baseMarker('c1', 'X', 'data.csv'); // sem from
		const models = {
			csv: { getAllMarkers: () => [seg, row] },
		} as never;
		const f = activeFamiliesFromModels(scope, models);
		expect(f.size).toBe(2);
		expect(f.has('text-like')).toBe(true);     // csvSegment
		expect(f.has('categorical')).toBe(true);   // csvRow
	});

	it('coder fora do scope NÃO conta', () => {
		const models = {
			markdown: { getAllMarkers: () => [baseMarker('outsider', 'X')] },
		} as never;
		const f = activeFamiliesFromModels(scope, models);
		expect(f.size).toBe(0);
	});

	it('codeIds filter: só markers com codes no scope contam', () => {
		const models = {
			markdown: { getAllMarkers: () => [baseMarker('c1', 'OUT')] },
			audio:    { getAllMarkers: () => [baseMarker('c1', 'IN', 'a.mp3')] },
		} as never;
		const f = activeFamiliesFromModels({ ...scope, codeIds: ['IN'] }, models);
		expect([...f]).toEqual(['temporal']);
	});

	it('engineIds filter: respeitado', () => {
		const models = {
			markdown: { getAllMarkers: () => [baseMarker('c1', 'X')] },
			audio:    { getAllMarkers: () => [baseMarker('c1', 'X', 'a.mp3')] },
		} as never;
		const f = activeFamiliesFromModels({ ...scope, engineIds: ['markdown'] }, models);
		expect([...f]).toEqual(['text-like']);
	});
});
