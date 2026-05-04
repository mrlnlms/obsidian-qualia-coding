import { describe, it, expect } from 'vitest';
import {
	consolidate,
	consolidateMarkdown, consolidateCsv, consolidateImage,
	consolidatePdf, consolidateAudio, consolidateVideo, consolidateCodes,
} from '../../src/analytics/data/dataConsolidator';
import type { AllEngineData } from '../../src/analytics/data/dataReader';

/** Minimal fixture with data in every engine. */
function makeFixture(): AllEngineData {
	const defs = {
		'id-a': { id: 'id-a', name: 'Alpha', color: '#FF0000' },
		'id-b': { id: 'id-b', name: 'Beta', color: '#00FF00' },
	};
	return {
		markdown: {
			markers: {
				'note.md': [
					{ id: 'm1', codes: [{codeId: 'id-a'}, {codeId: 'id-b'}], range: { from: { line: 0, ch: 0 }, to: { line: 1, ch: 10 } }, fileId: 'note.md', createdAt: 1000 },
				],
			},
			settings: {} as any,
			codeDefinitions: defs,
		},
		csv: {
			segmentMarkers: [
				{ id: 'c1', codes: [{codeId: 'id-a'}], fileId: 'data.csv', sourceRowId:0, column: 'col1', from: 0, to: 5, createdAt: 2000 },
			],
			rowMarkers: [
				{ id: 'c2', codes: [{codeId: 'id-b'}], fileId: 'data.csv', sourceRowId:1, column: 'col2', createdAt: 3000 },
			],
			registry: { definitions: defs },
		},
		image: {
			markers: [
				{ id: 'i1', codes: [{codeId: 'id-a'}], fileId: 'img.png', shape: 'rect', coords: { type: 'rect', x: 0, y: 0, w: 100, h: 100 }, createdAt: 4000 },
			],
			settings: { autoOpen: false, fileStates: {} },
			registry: { definitions: defs },
		},
		pdf: {
			markers: [
				{ id: 'p1', codes: [{codeId: 'id-a'}], fileId: 'doc.pdf', page: 0, text: 'hello', createdAt: 5000 },
			],
			shapes: [
				{ id: 'p2', codes: [{codeId: 'id-b'}], fileId: 'doc.pdf', page: 1, shape: 'rect', createdAt: 6000 },
			],
			registry: { definitions: defs },
		},
		audio: {
			files: [
				{ path: 'clip.mp3', markers: [{ id: 'a1', codes: [{codeId: 'id-a'}], from: 0, to: 5, createdAt: 7000 }] },
			],
			settings: {},
			codeDefinitions: { definitions: defs },
		},
		video: {
			files: [
				{ path: 'clip.mp4', markers: [{ id: 'v1', codes: [{codeId: 'id-b'}], from: 0, to: 10, createdAt: 8000 }] },
			],
			settings: {},
			codeDefinitions: { definitions: defs },
		},
	};
}

describe('consolidator refactor — snapshot parity', () => {
	it('consolidate() output matches snapshot', () => {
		const fixture = makeFixture();
		const result = consolidate(
			fixture.markdown, fixture.csv, fixture.image,
			fixture.pdf, fixture.audio, fixture.video,
		);
		const { lastUpdated, ...stable } = result;
		expect(stable).toMatchSnapshot();
	});

	it('per-engine functions produce same markers as monolithic', () => {
		const fixture = makeFixture();
		const monolithic = consolidate(
			fixture.markdown, fixture.csv, fixture.image,
			fixture.pdf, fixture.audio, fixture.video,
		);

		const md = consolidateMarkdown(fixture.markdown);
		const csv = consolidateCsv(fixture.csv);
		const img = consolidateImage(fixture.image);
		const pdf = consolidatePdf(fixture.pdf);
		const aud = consolidateAudio(fixture.audio);
		const vid = consolidateVideo(fixture.video);
		const allMarkers = [...md.markers, ...csv.markers, ...img.markers, ...pdf.markers, ...aud.markers, ...vid.markers];

		expect(allMarkers).toEqual(monolithic.markers);

		const defs = fixture.markdown.codeDefinitions;
		const slices = [
			{ engine: 'markdown' as const, slice: md },
			{ engine: 'csv' as const, slice: csv },
			{ engine: 'image' as const, slice: img },
			{ engine: 'pdf' as const, slice: pdf },
			{ engine: 'audio' as const, slice: aud },
			{ engine: 'video' as const, slice: vid },
		];
		const activeEngines = slices.filter(s => s.slice.hasData).map(s => s.engine);
		const codes = consolidateCodes(allMarkers, defs, activeEngines);
		expect(codes).toEqual(monolithic.codes);

		expect(monolithic.sources.markdown).toBe(md.hasData);
		expect(monolithic.sources.csv).toBe(csv.hasData);
	});
});
