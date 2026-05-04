import { describe, it, expect } from 'vitest';
import { evaluate, type EvaluatorContext } from '../../../src/core/smartCodes/evaluator';
import type { MarkerRef, PredicateNode } from '../../../src/core/smartCodes/types';
import type { EngineType } from '../../../src/core/types';

const mkMarker = (codes: { codeId: string; magnitude?: string }[] = [], id = 'm1', fileId = 'f1'): any => ({
	id, fileId, codes, range: {},
});
const mkRef = (engine: EngineType, fileId: string, markerId: string): MarkerRef => ({ engine, fileId, markerId });

const baseCtx: EvaluatorContext = {
	caseVars: { get: () => undefined },
	codesInFolder: () => [],
	codesInGroup: () => [],
	smartCodes: {},
	evaluating: new Set(),
	evaluator: evaluate,
};

describe('evaluator', () => {
	it('hasCode true quando código presente', () => {
		const m = mkMarker([{ codeId: 'c_a' }]);
		expect(evaluate({ kind: 'hasCode', codeId: 'c_a' }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(true);
		expect(evaluate({ kind: 'hasCode', codeId: 'c_b' }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(false);
	});

	it('AND short-circuits no primeiro false', () => {
		const m = mkMarker([{ codeId: 'c_a' }]);
		let secondCalls = 0;
		const trueProxy = new Proxy({ kind: 'hasCode', codeId: 'c_a' } as PredicateNode, {
			get(t, p) { if (p === 'codeId') secondCalls++; return (t as any)[p]; }
		});
		evaluate({ op: 'AND', children: [
			{ kind: 'hasCode', codeId: 'c_x' },  // false → short-circuit
			trueProxy,
		]}, mkRef('pdf', 'f1', 'm1'), m, baseCtx);
		expect(secondCalls).toBe(0);
	});

	it('OR short-circuits no primeiro true', () => {
		const m = mkMarker([{ codeId: 'c_a' }]);
		const result = evaluate({ op: 'OR', children: [
			{ kind: 'hasCode', codeId: 'c_a' },
			{ kind: 'hasCode', codeId: 'c_b' },
		]}, mkRef('pdf', 'f1', 'm1'), m, baseCtx);
		expect(result).toBe(true);
	});

	it('NOT inverte', () => {
		const m = mkMarker([{ codeId: 'c_a' }]);
		expect(evaluate({ op: 'NOT', child: { kind: 'hasCode', codeId: 'c_a' }}, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(false);
		expect(evaluate({ op: 'NOT', child: { kind: 'hasCode', codeId: 'c_x' }}, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(true);
	});

	it('engineType usa MarkerRef.engine (não marker.markerType)', () => {
		const m = mkMarker();
		expect(evaluate({ kind: 'engineType', engine: 'pdf' }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(true);
		expect(evaluate({ kind: 'engineType', engine: 'csv' }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(false);
	});

	it('caseVarEquals chama ctx.caseVars.get(fileId, variable)', () => {
		const ctx = { ...baseCtx, caseVars: { get: (f: string, v: string) => f === 'f1' && v === 'role' ? 'junior' : undefined }};
		expect(evaluate({ kind: 'caseVarEquals', variable: 'role', value: 'junior' }, mkRef('pdf', 'f1', 'm1'), mkMarker(), ctx)).toBe(true);
		expect(evaluate({ kind: 'caseVarEquals', variable: 'role', value: 'senior' }, mkRef('pdf', 'f1', 'm1'), mkMarker(), ctx)).toBe(false);
	});

	it('caseVarRange numérico', () => {
		const ctx = { ...baseCtx, caseVars: { get: () => 30 }};
		expect(evaluate({ kind: 'caseVarRange', variable: 'age', min: 25, max: 35 }, mkRef('pdf', 'f1', 'm1'), mkMarker(), ctx)).toBe(true);
		expect(evaluate({ kind: 'caseVarRange', variable: 'age', min: 35 }, mkRef('pdf', 'f1', 'm1'), mkMarker(), ctx)).toBe(false);
	});

	it('magnitudeGte usa CodeApplication.magnitude (string parsed pra number)', () => {
		const m = mkMarker([{ codeId: 'c_a', magnitude: '5' }]);
		expect(evaluate({ kind: 'magnitudeGte', codeId: 'c_a', n: 3 }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(true);
		expect(evaluate({ kind: 'magnitudeGte', codeId: 'c_a', n: 7 }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(false);
	});

	it('magnitudeGte: marker sem magnitude defaulta 0 → false pra n>0', () => {
		const m = mkMarker([{ codeId: 'c_a' }]);
		expect(evaluate({ kind: 'magnitudeGte', codeId: 'c_a', n: 1 }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(false);
	});

	it('inFolder dispara via ctx.codesInFolder', () => {
		const ctx = { ...baseCtx, codesInFolder: (id: string) => id === 'f_x' ? ['c_a'] : [] };
		const m = mkMarker([{ codeId: 'c_a' }]);
		expect(evaluate({ kind: 'inFolder', folderId: 'f_x' }, mkRef('pdf', 'f1', 'm1'), m, ctx)).toBe(true);
		expect(evaluate({ kind: 'inFolder', folderId: 'f_z' }, mkRef('pdf', 'f1', 'm1'), m, ctx)).toBe(false);
	});

	it('inGroup dispara via ctx.codesInGroup', () => {
		const ctx = { ...baseCtx, codesInGroup: (id: string) => id === 'g_x' ? ['c_a'] : [] };
		const m = mkMarker([{ codeId: 'c_a' }]);
		expect(evaluate({ kind: 'inGroup', groupId: 'g_x' }, mkRef('pdf', 'f1', 'm1'), m, ctx)).toBe(true);
	});

	it('relationExists com label + targetCodeId', () => {
		const m = mkMarker([{ codeId: 'c_a' } as any]);
		(m.codes[0] as any).relations = [{ label: 'causes', target: 'c_b', directed: true }];
		expect(evaluate({ kind: 'relationExists', codeId: 'c_a', label: 'causes', targetCodeId: 'c_b' }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(true);
		expect(evaluate({ kind: 'relationExists', codeId: 'c_a', label: 'contradicts' }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(false);
	});

	it('smartCode nesting recursivo', () => {
		const target: any = { id: 'sc_b', predicate: { kind: 'hasCode', codeId: 'c_a' }};
		const ctx = { ...baseCtx, smartCodes: { 'sc_b': target }};
		const m = mkMarker([{ codeId: 'c_a' }]);
		expect(evaluate({ kind: 'smartCode', smartCodeId: 'sc_b' }, mkRef('pdf', 'f1', 'm1'), m, ctx)).toBe(true);
	});

	it('smartCode cycle returns false (sem stack overflow)', () => {
		const a: any = { id: 'sc_a', predicate: { kind: 'smartCode', smartCodeId: 'sc_b' }};
		const b: any = { id: 'sc_b', predicate: { kind: 'smartCode', smartCodeId: 'sc_a' }};
		const ctx = { ...baseCtx, smartCodes: { 'sc_a': a, 'sc_b': b }, evaluating: new Set(['sc_a']) };
		const m = mkMarker();
		expect(evaluate({ kind: 'smartCode', smartCodeId: 'sc_a' }, mkRef('pdf', 'f1', 'm1'), m, ctx)).toBe(false);
	});

	it('smartCode broken ref returns false', () => {
		const m = mkMarker();
		expect(evaluate({ kind: 'smartCode', smartCodeId: 'sc_missing' }, mkRef('pdf', 'f1', 'm1'), m, baseCtx)).toBe(false);
	});
});

// Marker shape coverage cross-engine
describe.each([
	['markdown' as EngineType, 'note.md'],
	['pdf' as EngineType, 'doc.pdf'],
	['image' as EngineType, 'pic.png'],
	['audio' as EngineType, 'rec.mp3'],
	['video' as EngineType, 'clip.mp4'],
	['csv' as EngineType, 'data.csv'],
])('evaluator on %s shape', (engine, fileId) => {
	it('hasCode true', () => {
		const m = mkMarker([{ codeId: 'c_a' }]);
		expect(evaluate({ kind: 'hasCode', codeId: 'c_a' }, mkRef(engine, fileId, 'x'), m, baseCtx)).toBe(true);
	});
	it('magnitudeGte usa CodeApplication.magnitude', () => {
		const m = mkMarker([{ codeId: 'c_a', magnitude: '5' }]);
		expect(evaluate({ kind: 'magnitudeGte', codeId: 'c_a', n: 3 }, mkRef(engine, fileId, 'x'), m, baseCtx)).toBe(true);
		expect(evaluate({ kind: 'magnitudeGte', codeId: 'c_a', n: 7 }, mkRef(engine, fileId, 'x'), m, baseCtx)).toBe(false);
	});
});
