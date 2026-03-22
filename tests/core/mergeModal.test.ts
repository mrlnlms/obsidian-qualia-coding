import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { BaseMarker, CodeApplication } from '../../src/core/types';
import { executeMerge } from '../../src/core/mergeModal';

function makeMarker(id: string, codes: CodeApplication[]): BaseMarker {
	return { markerType: 'markdown', id, fileId: 'test.md', codes, createdAt: 0, updatedAt: 0 };
}

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
		const result = executeMerge({ destinationId: dest.id, sourceIds: [src1.id, src2.id], registry, markers });
		expect(result.updatedMarkers[0]!.codes[0]!.codeId).toBe(dest.id);
		expect(result.updatedMarkers[1]!.codes[0]!.codeId).toBe(dest.id);
		expect(result.affectedCount).toBe(2);
	});

	it('avoids duplicate codeId on same marker', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		const markers = [makeMarker('m1', [{ codeId: dest.id }, { codeId: src.id }])];
		const result = executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers });
		expect(result.updatedMarkers[0]!.codes).toHaveLength(1);
		expect(result.updatedMarkers[0]!.codes[0]!.codeId).toBe(dest.id);
	});

	it('records mergedFrom on destination', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers: [] });
		expect(registry.getById(dest.id)!.mergedFrom).toContain(src.id);
	});

	it('deletes source codes from registry', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers: [] });
		expect(registry.getById(src.id)).toBeUndefined();
	});

	it('reparents children of source codes to destination', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		const child = registry.create('Child');
		registry.setParent(child.id, src.id);
		executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers: [] });
		expect(registry.getById(child.id)!.parentId).toBe(dest.id);
		expect(registry.getChildren(dest.id).map(d => d.name)).toContain('Child');
	});

	it('does not touch markers unrelated to source codes', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		const other = registry.create('Other');
		const markers = [makeMarker('m1', [{ codeId: other.id }])];
		const result = executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers });
		expect(result.updatedMarkers[0]!.codes[0]!.codeId).toBe(other.id);
		expect(result.affectedCount).toBe(0);
	});

	it('updates destination name when destinationName is provided', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers: [], destinationName: 'NewName' });
		expect(registry.getById(dest.id)!.name).toBe('NewName');
	});

	it('moves destination to new parent when destinationParentId is provided', () => {
		const dest = registry.create('Dest');
		const src = registry.create('Src');
		const parent = registry.create('Parent');
		executeMerge({ destinationId: dest.id, sourceIds: [src.id], registry, markers: [], destinationParentId: parent.id });
		expect(registry.getById(dest.id)!.parentId).toBe(parent.id);
	});
});
