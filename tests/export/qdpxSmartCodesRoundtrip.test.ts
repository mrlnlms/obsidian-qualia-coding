import { describe, it, expect } from 'vitest';
import { buildSmartCodesXml } from '../../src/export/qdpxExporter';
import { parseSmartCodes, type GuidResolver } from '../../src/import/qdpxImporter';
import type { SmartCodeDefinition, PredicateNode } from '../../src/core/types';

/** Round-trip: build XML → re-parse → predicate canonical e refs preservados (com remap codeId). */
describe('SmartCodes QDPX round-trip', () => {
	const wrapInProject = (xml: string) => `<Project>${xml}</Project>`;

	const mkResolver = (codes: Record<string, string> = {}): GuidResolver => ({
		codes: new Map(Object.entries(codes)),
		sources: new Map(),
		selections: new Map(),
		smartCodes: new Map(),
	});

	const mkSc = (over: Partial<SmartCodeDefinition> = {}): SmartCodeDefinition => ({
		id: 'sc_a', name: 'Frustration jr', color: '#abc', paletteIndex: 0, createdAt: 0,
		predicate: { kind: 'hasCode', codeId: 'c_x' },
		memo: { content: 'methodological note' },
		...over,
	});

	it('predicate simples sobrevive round-trip (codeId remapped)', () => {
		const original = mkSc();
		const xml = wrapInProject(buildSmartCodesXml([original]));
		const result = parseSmartCodes(xml, mkResolver({ 'c_x': 'c_NEW' }));
		expect(result.smartCodes).toHaveLength(1);
		const reparsed = result.smartCodes[0]!;
		expect(reparsed.name).toBe(original.name);
		expect(reparsed.color).toBe(original.color);
		expect(reparsed.memo?.content).toBe(original.memo?.content);
		expect((reparsed.predicate as any).kind).toBe('hasCode');
		expect((reparsed.predicate as any).codeId).toBe('c_NEW');
	});

	it('predicate composto AND/OR/NOT preserva estrutura', () => {
		const predicate: PredicateNode = {
			op: 'AND',
			children: [
				{ kind: 'hasCode', codeId: 'c_x' },
				{
					op: 'OR',
					children: [
						{ kind: 'magnitudeGte', codeId: 'c_y', n: 3 },
						{ op: 'NOT', child: { kind: 'engineType', engine: 'pdf' }},
					],
				},
			],
		};
		const original = mkSc({ predicate });
		const xml = wrapInProject(buildSmartCodesXml([original]));
		const result = parseSmartCodes(xml, mkResolver({ 'c_x': 'c_NEW_X', 'c_y': 'c_NEW_Y' }));
		const reparsed = result.smartCodes[0]!.predicate as any;
		expect(reparsed.op).toBe('AND');
		expect(reparsed.children).toHaveLength(2);
		expect(reparsed.children[0].codeId).toBe('c_NEW_X');
		expect(reparsed.children[1].op).toBe('OR');
		expect(reparsed.children[1].children[0].codeId).toBe('c_NEW_Y');
		expect(reparsed.children[1].children[0].n).toBe(3);
		expect(reparsed.children[1].children[1].op).toBe('NOT');
		expect(reparsed.children[1].children[1].child.kind).toBe('engineType');
		expect(reparsed.children[1].children[1].child.engine).toBe('pdf');
	});

	it('relationExists preserva codeId E targetCodeId (ambos remapped)', () => {
		const original = mkSc({
			predicate: { kind: 'relationExists', codeId: 'c_a', targetCodeId: 'c_b', label: 'causes' },
		});
		const xml = wrapInProject(buildSmartCodesXml([original]));
		const result = parseSmartCodes(xml, mkResolver({ 'c_a': 'c_NEW_A', 'c_b': 'c_NEW_B' }));
		const reparsed = result.smartCodes[0]!.predicate as any;
		expect(reparsed.codeId).toBe('c_NEW_A');
		expect(reparsed.targetCodeId).toBe('c_NEW_B');
		expect(reparsed.label).toBe('causes');
	});

	it('caracteres especiais em name/memo (& " < >) sobrevivem ida-volta', () => {
		const original = mkSc({ name: 'A & B "test"', memo: { content: 'foo<bar> & baz' } });
		const xml = wrapInProject(buildSmartCodesXml([original]));
		const result = parseSmartCodes(xml, mkResolver({ 'c_x': 'c_NEW' }));
		expect(result.smartCodes[0]!.name).toBe('A & B "test"');
		expect(result.smartCodes[0]!.memo?.content).toBe('foo<bar> & baz');
	});

	it('2 smart codes com nesting (sc_2 referencia sc_1) sobrevive round-trip', () => {
		const sc1 = mkSc({ id: 'sc_1', name: 'A' });
		const sc2 = mkSc({ id: 'sc_2', name: 'B', predicate: { kind: 'smartCode', smartCodeId: 'sc_1' }, memo: undefined });
		const xml = wrapInProject(buildSmartCodesXml([sc1, sc2]));
		const result = parseSmartCodes(xml, mkResolver({ 'c_x': 'c_NEW' }));
		expect(result.smartCodes).toHaveLength(2);
		const reA = result.smartCodes.find(s => s.name === 'A')!;
		const reB = result.smartCodes.find(s => s.name === 'B')!;
		// sc_2 predicate.smartCodeId remapped pra sc_1's NEW id (resolver maps GUID → new id)
		expect((reB.predicate as any).smartCodeId).toBe(reA.id);
	});
});
