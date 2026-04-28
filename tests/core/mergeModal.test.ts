import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { BaseMarker, CodeApplication } from '../../src/core/types';
import { executeMerge } from '../../src/core/mergeModal';

function makeMarker(id: string, codes: CodeApplication[]): BaseMarker {
	return { markerType: 'markdown', id, fileId: 'test.md', codes, createdAt: 0, updatedAt: 0 };
}

const defaultDecision = {
	nameChoice: { kind: 'target' as const },
	colorChoice: { kind: 'target' as const },
	descriptionPolicy: { kind: 'keep-target' as const },
	memoPolicy: { kind: 'keep-target' as const },
};

describe('executeMerge', () => {
	let registry: CodeDefinitionRegistry;
	beforeEach(() => { registry = new CodeDefinitionRegistry(); });

	it('reassigns markers from source codes to destination', () => {
		const dest = registry.create('Dest');
		const src1 = registry.create('Src1');
		const src2 = registry.create('Src2');
		const markers = [
			makeMarker('m1', [{ codeId: src1.id }]),
			makeMarker('m2', [{ codeId: src2.id }]),
			makeMarker('m3', [{ codeId: dest.id }]),
		];
		const result = executeMerge({ destinationId: dest.id, sourceIds: [src1.id, src2.id], registry, markers, ...defaultDecision });
		expect(result.updatedMarkers[0]!.codes[0]!.codeId).toBe(dest.id);
		expect(result.updatedMarkers[1]!.codes[0]!.codeId).toBe(dest.id);
		expect(result.affectedCount).toBe(2);
		expect(result.ok).toBe(true);
	});

	it('avoids duplicate codeId on same marker', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		const markers = [makeMarker('m1', [{ codeId: dest.id }, { codeId: src.id }])];
		const result = executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers, ...defaultDecision });
		expect(result.updatedMarkers[0]!.codes).toHaveLength(1);
		expect(result.updatedMarkers[0]!.codes[0]!.codeId).toBe(dest.id);
	});

	it('records mergedFrom on destination', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers: [], ...defaultDecision });
		expect(registry.getById(dest.id)!.mergedFrom).toContain(src.id);
	});

	it('deletes source codes from registry', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers: [], ...defaultDecision });
		expect(registry.getById(src.id)).toBeUndefined();
	});

	it('reparents children of source codes to destination', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		const child = registry.create('Child');
		registry.setParent(child.id, src.id);
		executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers: [], ...defaultDecision });
		expect(registry.getById(child.id)!.parentId).toBe(dest.id);
		expect(registry.getChildren(dest.id).map(d => d.name)).toContain('Child');
	});

	it('does not touch markers unrelated to source codes', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		const other = registry.create('Other');
		const markers = [makeMarker('m1', [{ codeId: other.id }])];
		const result = executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers, ...defaultDecision });
		expect(result.updatedMarkers[0]!.codes[0]!.codeId).toBe(other.id);
		expect(result.affectedCount).toBe(0);
	});

	it('updates destination name when nameChoice is custom', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			...defaultDecision,
			nameChoice: { kind: 'custom', value: 'NewName' },
		});
		expect(registry.getById(dest.id)!.name).toBe('NewName');
	});

	it('moves destination to new parent when destinationParentId is provided', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		const parent = registry.create('Parent');
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			...defaultDecision,
			destinationParentId: parent.id,
		});
		expect(registry.getById(dest.id)!.parentId).toBe(parent.id);
	});

	// ─── New tests — Tier 2 (policies + ordering + collision) ───

	it('applies color from source when colorChoice is source', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		registry.update(src.id, { color: '#bbbbbb' });
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			...defaultDecision,
			colorChoice: { kind: 'source', codeId: src.id },
		});
		expect(registry.getById(dest.id)!.color).toBe('#bbbbbb');
	});

	it('applies name from source after deletion (no collision)', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			...defaultDecision,
			nameChoice: { kind: 'source', codeId: src.id },
		});
		expect(registry.getById(dest.id)!.name).toBe('Src');
		expect(registry.getById(src.id)).toBeUndefined();
	});

	it('returns ok:false with reason when custom name collides with non-source code', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		registry.create('Other');
		const result = executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			...defaultDecision,
			nameChoice: { kind: 'custom', value: 'Other' },
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('name-collision');
		expect(registry.getById(src.id)).toBeUndefined();
	});

	it('concatenates memos with header per source', () => {
		const dest = registry.create('Dest');
		registry.update(dest.id, { memo: 'dest memo' });
		const src = registry.create('Src');
		registry.update(src.id, { memo: 'src memo' });
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			...defaultDecision,
			memoPolicy: { kind: 'concatenate' },
		});
		expect(registry.getById(dest.id)!.memo).toBe('dest memo\n\n--- From Src ---\nsrc memo');
	});

	it('discard memo policy clears destination memo', () => {
		const dest = registry.create('Dest');
		registry.update(dest.id, { memo: 'dest memo' });
		const src = registry.create('Src');
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			...defaultDecision,
			memoPolicy: { kind: 'discard' },
		});
		expect(registry.getById(dest.id)!.memo).toBeUndefined();
	});

	it('keep-only memo policy uses chosen entity (source)', () => {
		const dest = registry.create('Dest');
		registry.update(dest.id, { memo: 'dest memo' });
		const src = registry.create('Src');
		registry.update(src.id, { memo: 'src memo' });
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			...defaultDecision,
			memoPolicy: { kind: 'keep-only', codeId: src.id },
		});
		expect(registry.getById(dest.id)!.memo).toBe('src memo');
	});

	it('description concatenate works analogously to memo', () => {
		const dest = registry.create('Dest');
		registry.update(dest.id, { description: 'desc d' });
		const src = registry.create('Src');
		registry.update(src.id, { description: 'desc s' });
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			...defaultDecision,
			descriptionPolicy: { kind: 'concatenate' },
		});
		expect(registry.getById(dest.id)!.description).toBe('desc d\n\n--- From Src ---\ndesc s');
	});

	it('all-empty memos with concatenate leaves dest memo undefined', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		executeMerge({
			destinationId: dest.id, sourceIds: [src.id], registry, markers: [],
			...defaultDecision,
			memoPolicy: { kind: 'concatenate' },
		});
		expect(registry.getById(dest.id)!.memo).toBeUndefined();
	});
});
