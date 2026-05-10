import { describe, it, expect } from 'vitest';
import { computeBreakdown } from '../../../../src/core/icr/contributions/divergenceResolver';
import { createEmptyOverrides } from '../../../../src/core/icr/contributions/contributionViewTypes';
import type { MergeResult, PayloadV1 } from '../../../../src/core/icr/transport/payloadTypes';

function makeMergeResult(pendingMarkers: number, addedMarkers: number): MergeResult {
	return {
		added: { markers: addedMarkers, codes: 0, groups: 0, coder: false },
		conflicts: [],
		warnings: [],
		fileIdRemap: {},
		pendingMarkers,
	};
}

function makePayload(markers: { markdown?: Record<string, any[]>; pdf?: any[]; csvSegment?: any[] }): PayloadV1 {
	return {
		version: '1.0',
		codebookVersion: '',
		coder: { id: 'h:1', name: 'X', type: 'human', createdAt: 0 },
		sources: {},
		codes: [],
		markers: { markdown: markers.markdown ?? {}, pdf: markers.pdf ?? [], csvSegment: markers.csvSegment ?? [] },
		exportedAt: 0,
	};
}

describe('computeBreakdown', () => {
	it('sem overrides: N_in = todos markers do payload', () => {
		const merge = makeMergeResult(0, 5);
		const payload = makePayload({ markdown: { 'src_a': [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }, { id: 'm4' }, { id: 'm5' }] } });
		const overrides = createEmptyOverrides();

		const r = computeBreakdown(merge, overrides, payload);
		expect(r.N_in).toBe(5);
		expect(r.N_out).toBe(0);
	});

	it('skipSource conta markers desse source em breakdown.skipSource', () => {
		const merge = makeMergeResult(3, 0); // motor já marcou pending pq skip-source
		const payload = makePayload({ markdown: { 'src_a': [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] } });
		const overrides = createEmptyOverrides();
		overrides.sourceOverrides.set('src_a', 'skip-source');

		const r = computeBreakdown(merge, overrides, payload);
		expect(r.breakdown.skipSource).toBe(3);
		expect(r.N_out).toBe(3);
	});

	it('precedência: marker em perMarkerSkip E source em skipSource conta APENAS em skipSource', () => {
		const merge = makeMergeResult(2, 0);
		const payload = makePayload({ markdown: { 'src_a': [{ id: 'm1', codes: [] }, { id: 'm2', codes: [] }] } });
		const overrides = createEmptyOverrides();
		overrides.sourceOverrides.set('src_a', 'skip-source');
		overrides.perMarkerSkip.add('m1');

		const r = computeBreakdown(merge, overrides, payload);
		expect(r.breakdown.skipSource).toBe(2);
		expect(r.breakdown.skipMarker).toBe(0);
		expect(r.N_out).toBe(2);
	});

	it('precedência: skipCode > skipMarker', () => {
		const merge = makeMergeResult(2, 0);
		const payload = makePayload({ markdown: { 'src_a': [{ id: 'm1', codes: [{ codeId: 'c1' }] }, { id: 'm2', codes: [{ codeId: 'c1' }] }] } });
		const overrides = createEmptyOverrides();
		overrides.perCodeSkip.add('c1');
		overrides.perMarkerSkip.add('m1');

		const r = computeBreakdown(merge, overrides, payload);
		expect(r.breakdown.skipCode).toBe(2);
		expect(r.breakdown.skipMarker).toBe(0);
	});

	it('idempotente: rodar 2x retorna mesmo resultado', () => {
		const merge = makeMergeResult(1, 4);
		const payload = makePayload({ markdown: { 'src_a': [
			{ id: 'm1', codes: [] }, { id: 'm2', codes: [] }, { id: 'm3', codes: [] }, { id: 'm4', codes: [] }, { id: 'm5', codes: [] },
		] } });
		const overrides = createEmptyOverrides();
		overrides.perMarkerSkip.add('m3');

		const r1 = computeBreakdown(merge, overrides, payload);
		const r2 = computeBreakdown(merge, overrides, payload);
		expect(r1).toEqual(r2);
	});
});
