import { describe, it, expect } from 'vitest';
import { buildLinksXml } from '../../src/export/qdpxExporter';
import type { CodeDefinition, BaseMarker } from '../../src/core/types';

function makeDef(id: string, name: string, relations?: CodeDefinition['relations']): CodeDefinition {
	return { id, name, color: '#f00', paletteIndex: 0, createdAt: 0, updatedAt: 0, childrenOrder: [], relations };
}

function makeMarker(id: string, codes: BaseMarker['codes']): BaseMarker {
	return { markerType: 'markdown', id, fileId: 'f1', codes, createdAt: 0, updatedAt: 0 };
}

describe('buildLinksXml', () => {
	it('generates Link for code-level directed relation', () => {
		const defs = [
			makeDef('c1', 'A', [{ label: 'causes', target: 'c2', directed: true }]),
			makeDef('c2', 'B'),
		];
		const guidMap = new Map<string, string>();
		const xml = buildLinksXml(defs, [], guidMap);
		expect(xml).toContain('<Link');
		expect(xml).toContain('name="causes"');
		expect(xml).toContain('direction="OneWay"');
	});

	it('generates Associative for undirected relation', () => {
		const defs = [
			makeDef('c1', 'A', [{ label: 'relates', target: 'c2', directed: false }]),
			makeDef('c2', 'B'),
		];
		const guidMap = new Map<string, string>();
		const xml = buildLinksXml(defs, [], guidMap);
		expect(xml).toContain('direction="Associative"');
	});

	it('generates Link for segment-level relation', () => {
		const defs = [makeDef('c1', 'A'), makeDef('c2', 'B')];
		const markers = [
			makeMarker('m1', [{ codeId: 'c1', relations: [{ label: 'supports', target: 'c2', directed: true }] }]),
		];
		const guidMap = new Map<string, string>();
		const xml = buildLinksXml(defs, markers, guidMap);
		expect(xml).toContain('name="supports"');
		expect(xml).toContain('direction="OneWay"');
	});

	it('returns empty string when no relations', () => {
		const defs = [makeDef('c1', 'A'), makeDef('c2', 'B')];
		const guidMap = new Map<string, string>();
		const xml = buildLinksXml(defs, [], guidMap);
		expect(xml).toBe('');
	});
});
