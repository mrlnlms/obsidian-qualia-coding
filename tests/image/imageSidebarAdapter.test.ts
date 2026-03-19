import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageSidebarAdapter } from '../../src/image/views/imageSidebarAdapter';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { ImageMarker } from '../../src/image/imageCodingTypes';

// ── Mock ImageCodingModel ──

function createMockModel() {
	const registry = new CodeDefinitionRegistry();
	const markers: ImageMarker[] = [];

	return {
		registry,
		onChange: vi.fn(),
		offChange: vi.fn(),
		onHoverChange: vi.fn(),
		offHoverChange: vi.fn(),
		setHoverState: vi.fn(),
		getHoverMarkerId: vi.fn(() => null),

		getAllMarkers: vi.fn(() => markers),
		getMarkersForFile: vi.fn((fileId: string) => markers.filter(m => m.fileId === fileId)),
		getAllFileIds: vi.fn(() => [...new Set(markers.map(m => m.fileId))]),
		findMarkerById: vi.fn((id: string) => markers.find(m => m.id === id)),
		removeCodeFromMarker: vi.fn((id: string, code: string) => {
			const m = markers.find(x => x.id === id);
			if (m) m.codes = m.codes.filter(c => c !== code);
		}),
		removeMarker: vi.fn((id: string) => {
			const idx = markers.findIndex(m => m.id === id);
			if (idx >= 0) { markers.splice(idx, 1); return true; }
			return false;
		}),

		saveMarkers: vi.fn(),
		notify: vi.fn(),

		getMarkerLabel: vi.fn((m: ImageMarker) => `${m.shape} region`),

		_markers: markers,
	};
}

type MockModel = ReturnType<typeof createMockModel>;

function mkMarker(overrides: Partial<ImageMarker> = {}): ImageMarker {
	return {
		id: 'img-1',
		fileId: 'photo.png',
		shape: 'rect',
		coords: { type: 'rect', x: 0.1, y: 0.2, w: 0.5, h: 0.3 },
		codes: ['Pattern'],
		createdAt: 1000,
		updatedAt: 1000,
		...overrides,
	};
}

let model: MockModel;
let adapter: ImageSidebarAdapter;

beforeEach(() => {
	model = createMockModel();
	adapter = new ImageSidebarAdapter(model as any);
});

// ── Constructor ──

describe('constructor', () => {
	it('sets registry from model', () => {
		expect(adapter.registry).toBe(model.registry);
	});
});

// ── getAllMarkers ──

describe('getAllMarkers', () => {
	it('returns empty array when no markers', () => {
		expect(adapter.getAllMarkers()).toEqual([]);
	});

	it('converts ImageMarker to ImageBaseMarker', () => {
		model._markers.push(mkMarker());
		const result = adapter.getAllMarkers();
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			markerType: 'image',
			id: 'img-1',
			fileId: 'photo.png',
			shape: 'rect',
			codes: ['Pattern'],
		});
	});

	it('includes shapeLabel from model.getMarkerLabel', () => {
		model._markers.push(mkMarker());
		const result = adapter.getAllMarkers();
		expect(result[0].shapeLabel).toBe('rect region');
	});

	it('handles ellipse shape', () => {
		model._markers.push(mkMarker({ id: 'e-1', shape: 'ellipse' }));
		(model.getMarkerLabel as ReturnType<typeof vi.fn>).mockReturnValueOnce('ellipse region');
		const result = adapter.getAllMarkers();
		expect(result[0].shape).toBe('ellipse');
	});

	it('handles polygon shape with polygon coords', () => {
		model._markers.push(mkMarker({
			id: 'p-1',
			shape: 'polygon',
			coords: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }] },
		}));
		const result = adapter.getAllMarkers();
		expect(result[0].shape).toBe('polygon');
	});

	it('preserves memo and colorOverride', () => {
		model._markers.push(mkMarker({ memo: 'annotation', colorOverride: '#123456' }));
		const result = adapter.getAllMarkers();
		expect(result[0].memo).toBe('annotation');
		expect(result[0].colorOverride).toBe('#123456');
	});

	it('maps multiple markers', () => {
		model._markers.push(mkMarker({ id: 'a' }));
		model._markers.push(mkMarker({ id: 'b' }));
		const result = adapter.getAllMarkers();
		expect(result).toHaveLength(2);
	});
});

// ── getMarkerById ──

describe('getMarkerById', () => {
	it('returns null when not found', () => {
		expect(adapter.getMarkerById('nope')).toBeNull();
	});

	it('finds marker by id and converts to ImageBaseMarker', () => {
		model._markers.push(mkMarker());
		const result = adapter.getMarkerById('img-1');
		expect(result).not.toBeNull();
		expect(result!.markerType).toBe('image');
		expect(result!.id).toBe('img-1');
	});
});

// ── getAllFileIds ──

describe('getAllFileIds', () => {
	it('delegates to model.getAllFileIds()', () => {
		model._markers.push(mkMarker({ fileId: 'a.png' }));
		model._markers.push(mkMarker({ id: 'img-2', fileId: 'b.jpg' }));
		const ids = adapter.getAllFileIds();
		expect(ids).toContain('a.png');
		expect(ids).toContain('b.jpg');
		expect(model.getAllFileIds).toHaveBeenCalledOnce();
	});
});

// ── getMarkersForFile ──

describe('getMarkersForFile', () => {
	it('returns only markers for the given file', () => {
		model._markers.push(mkMarker({ fileId: 'photo.png' }));
		model._markers.push(mkMarker({ id: 'img-2', fileId: 'other.jpg' }));
		const result = adapter.getMarkersForFile('photo.png');
		expect(result).toHaveLength(1);
		expect(result[0].fileId).toBe('photo.png');
	});

	it('returns empty array when no match', () => {
		expect(adapter.getMarkersForFile('none.png')).toEqual([]);
	});
});

// ── saveMarkers ──

describe('saveMarkers', () => {
	it('delegates to model.saveMarkers()', () => {
		adapter.saveMarkers();
		expect(model.saveMarkers).toHaveBeenCalledOnce();
	});
});

// ── updateDecorations ──

describe('updateDecorations', () => {
	it('calls model.notify()', () => {
		adapter.updateDecorations('photo.png');
		expect(model.notify).toHaveBeenCalledOnce();
	});
});

// ── removeMarker ──

describe('removeMarker', () => {
	it('removes marker via model and returns true', () => {
		model._markers.push(mkMarker());
		const result = adapter.removeMarker('img-1');
		expect(result).toBe(true);
		expect(model.removeMarker).toHaveBeenCalledWith('img-1');
	});

	it('returns false when marker not found', () => {
		const result = adapter.removeMarker('nonexistent');
		expect(result).toBe(false);
	});
});

// ── updateMarkerFields (inherited, notifyAfterFieldUpdate → model.notify) ──

describe('updateMarkerFields', () => {
	it('updates memo on marker', () => {
		const m = mkMarker();
		model._markers.push(m);
		adapter.updateMarkerFields('img-1', { memo: 'updated' });
		expect(m.memo).toBe('updated');
	});

	it('updates colorOverride on marker', () => {
		const m = mkMarker();
		model._markers.push(m);
		adapter.updateMarkerFields('img-1', { colorOverride: '#abc' });
		expect(m.colorOverride).toBe('#abc');
	});

	it('sets updatedAt to current time', () => {
		const m = mkMarker({ updatedAt: 100 });
		model._markers.push(m);
		const before = Date.now();
		adapter.updateMarkerFields('img-1', { memo: 'x' });
		expect(m.updatedAt).toBeGreaterThanOrEqual(before);
	});

	it('calls notify after update', () => {
		model._markers.push(mkMarker());
		adapter.updateMarkerFields('img-1', { memo: 'x' });
		expect(model.notify).toHaveBeenCalledOnce();
	});

	it('is a no-op when marker not found', () => {
		adapter.updateMarkerFields('missing', { memo: 'x' });
		expect(model.notify).not.toHaveBeenCalled();
	});
});

// ── deleteCode (inherited from base) ──

describe('deleteCode', () => {
	it('removes code from markers that have it', () => {
		model._markers.push(mkMarker({ id: 'a', codes: ['X', 'Y'] }));
		model._markers.push(mkMarker({ id: 'b', codes: ['Y'] }));
		adapter.deleteCode('X');
		expect(model.removeCodeFromMarker).toHaveBeenCalledWith('a', 'X', true);
		expect(model.removeCodeFromMarker).not.toHaveBeenCalledWith('b', 'X', true);
	});

	it('deletes code definition from registry', () => {
		model.registry.create('ToDelete');
		adapter.deleteCode('ToDelete');
		expect(model.registry.getByName('ToDelete')).toBeUndefined();
	});

	it('calls saveMarkers after cleanup', () => {
		adapter.deleteCode('Z');
		expect(model.saveMarkers).toHaveBeenCalledOnce();
	});

	it('removes orphan markers with no remaining codes', () => {
		const m = mkMarker({ id: 'orphan', codes: ['Only'] });
		model._markers.push(m);
		// After removeCodeFromMarker mock removes the code, codes becomes empty
		// The base deleteCode iterates again and calls removeMarker on empty markers
		adapter.deleteCode('Only');
		expect(model.removeMarker).toHaveBeenCalledWith('orphan');
	});
});

// ── renameCode (inherited from base) ──

describe('renameCode', () => {
	it('renames code in markers', () => {
		const m = mkMarker({ codes: ['Old'] });
		model._markers.push(m);
		adapter.renameCode('Old', 'New');
		expect(m.codes).toContain('New');
		expect(m.codes).not.toContain('Old');
	});

	it('does not touch markers without the code', () => {
		const m = mkMarker({ codes: ['Other'] });
		model._markers.push(m);
		adapter.renameCode('Old', 'New');
		expect(m.codes).toEqual(['Other']);
	});

	it('calls save and notify', () => {
		adapter.renameCode('A', 'B');
		expect(model.saveMarkers).toHaveBeenCalledOnce();
		expect(model.notify).toHaveBeenCalledOnce();
	});
});
