import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeDefinitionRegistry, DEFAULT_PALETTE } from '../../src/core/codeDefinitionRegistry';
import type { CodeDefinition } from '../../src/core/types';

let registry: CodeDefinitionRegistry;

beforeEach(() => {
  registry = new CodeDefinitionRegistry();
});

// ── create ───────────────────────────────────────────────────

describe('create', () => {
  it('creates a new code definition', () => {
    const def = registry.create('Theme A');
    expect(def.name).toBe('Theme A');
    expect(def.id).toBeTruthy();
    expect(def.color).toBe(DEFAULT_PALETTE[0]);
  });

  it('returns existing definition when name already exists', () => {
    const def1 = registry.create('Theme A');
    const def2 = registry.create('Theme A');
    expect(def1.id).toBe(def2.id);
  });

  it('auto-assigns sequential palette colors', () => {
    const d1 = registry.create('A');
    const d2 = registry.create('B');
    const d3 = registry.create('C');
    expect(d1.color).toBe(DEFAULT_PALETTE[0]);
    expect(d2.color).toBe(DEFAULT_PALETTE[1]);
    expect(d3.color).toBe(DEFAULT_PALETTE[2]);
  });

  it('uses provided color instead of palette', () => {
    const def = registry.create('Custom', '#FF0000');
    expect(def.color).toBe('#FF0000');
  });

  it('stores description when provided', () => {
    const def = registry.create('Desc', undefined, 'A description');
    expect(def.description).toBe('A description');
  });

  it('assigns correct paletteIndex for auto-color', () => {
    const def = registry.create('AutoColor');
    expect(def.paletteIndex).toBe(0);
    const def2 = registry.create('AutoColor2');
    expect(def2.paletteIndex).toBe(1);
  });

  it('assigns -1 paletteIndex for manual color', () => {
    const def = registry.create('ManualColor', '#FF0000');
    expect(def.paletteIndex).toBe(-1);
  });
});

// ── getById / getByName ──────────────────────────────────────

describe('getById', () => {
  it('returns definition by id', () => {
    const def = registry.create('X');
    expect(registry.getById(def.id)).toBe(def);
  });

  it('returns undefined for non-existing id', () => {
    expect(registry.getById('nope')).toBeUndefined();
  });
});

describe('getByName', () => {
  it('returns definition by name', () => {
    const def = registry.create('Y');
    expect(registry.getByName('Y')).toBe(def);
  });

  it('returns undefined for non-existing name', () => {
    expect(registry.getByName('nope')).toBeUndefined();
  });
});

// ── getAll ───────────────────────────────────────────────────

describe('getAll', () => {
  it('returns all definitions sorted by name', () => {
    registry.create('Zebra');
    registry.create('Alpha');
    registry.create('Middle');
    const all = registry.getAll();
    expect(all.map(d => d.name)).toEqual(['Alpha', 'Middle', 'Zebra']);
  });

  it('returns empty array when no definitions', () => {
    expect(registry.getAll()).toEqual([]);
  });
});

// ── update ───────────────────────────────────────────────────

describe('update', () => {
  it('updates name and maintains index consistency', () => {
    const def = registry.create('OldName');
    registry.update(def.id, { name: 'NewName' });
    expect(registry.getByName('NewName')).toBeDefined();
    expect(registry.getByName('OldName')).toBeUndefined();
    expect(registry.getById(def.id)!.name).toBe('NewName');
  });

  it('updates color', () => {
    const def = registry.create('Colored');
    registry.update(def.id, { color: '#00FF00' });
    expect(registry.getById(def.id)!.color).toBe('#00FF00');
  });

  it('updates description', () => {
    const def = registry.create('Described');
    registry.update(def.id, { description: 'New desc' });
    expect(registry.getById(def.id)!.description).toBe('New desc');
  });

  it('clears description when set to empty string', () => {
    const def = registry.create('Desc', undefined, 'Initial');
    registry.update(def.id, { description: '' });
    expect(registry.getById(def.id)!.description).toBeUndefined();
  });

  it('returns false for non-existing id', () => {
    expect(registry.update('nope', { name: 'X' })).toBe(false);
  });

  it('returns true on success', () => {
    const def = registry.create('Ok');
    expect(registry.update(def.id, { color: '#111' })).toBe(true);
  });

  it('rejects rename when target name already exists', () => {
    const a = registry.create('Emotion');
    const b = registry.create('Theme');
    const result = registry.update(a.id, { name: 'Theme' });
    expect(result).toBe(false);
    // Both definitions should remain unchanged
    expect(registry.getById(a.id)!.name).toBe('Emotion');
    expect(registry.getById(b.id)!.name).toBe('Theme');
    // nameIndex should still point to original
    expect(registry.getByName('Theme')!.id).toBe(b.id);
    expect(registry.getByName('Emotion')!.id).toBe(a.id);
  });

  it('does not fire onMutate when rename collides', () => {
    registry.create('Emotion');
    registry.create('Theme');
    const onMutate = vi.fn();
    registry.addOnMutate(onMutate);
    const emotion = registry.getByName('Emotion')!;
    registry.update(emotion.id, { name: 'Theme' });
    expect(onMutate).not.toHaveBeenCalled();
  });

  it('getAll returns correct count after rejected rename', () => {
    registry.create('A');
    registry.create('B');
    const a = registry.getByName('A')!;
    registry.update(a.id, { name: 'B' });
    expect(registry.getAll()).toHaveLength(2);
    expect(registry.getAll().map(d => d.name).sort()).toEqual(['A', 'B']);
  });
});

// ── delete ───────────────────────────────────────────────────

describe('delete', () => {
  it('removes an existing definition', () => {
    const def = registry.create('ToDelete');
    expect(registry.delete(def.id)).toBe(true);
    expect(registry.getById(def.id)).toBeUndefined();
    expect(registry.getByName('ToDelete')).toBeUndefined();
  });

  it('returns false for non-existing id', () => {
    expect(registry.delete('nope')).toBe(false);
  });
});

// ── clear ────────────────────────────────────────────────────

describe('clear', () => {
  it('resets all definitions and palette index', () => {
    registry.create('A');
    registry.create('B');
    registry.clear();
    expect(registry.getAll()).toEqual([]);
    // After clear, next create should use palette index 0 again
    const def = registry.create('C');
    expect(def.color).toBe(DEFAULT_PALETTE[0]);
  });
});

// ── palette ──────────────────────────────────────────────────

describe('palette', () => {
  it('cycles through 12 palette colors', () => {
    for (let i = 0; i < 12; i++) {
      const def = registry.create(`Code${i}`);
      expect(def.color).toBe(DEFAULT_PALETTE[i]);
    }
  });

  it('wraps around after exhausting palette', () => {
    for (let i = 0; i < 12; i++) registry.create(`Code${i}`);
    const wrapped = registry.create('Code12');
    expect(wrapped.color).toBe(DEFAULT_PALETTE[0]);
  });

  it('peekNextPaletteColor does not consume the color', () => {
    const peeked = registry.peekNextPaletteColor();
    expect(peeked).toBe(DEFAULT_PALETTE[0]);
    const def = registry.create('AfterPeek');
    expect(def.color).toBe(DEFAULT_PALETTE[0]);
  });
});

// ── toJSON / fromJSON ────────────────────────────────────────

describe('toJSON / fromJSON', () => {
  it('round-trips all data', () => {
    registry.create('A', '#111', 'desc A');
    registry.create('B', '#222');
    const json = registry.toJSON();
    const restored = CodeDefinitionRegistry.fromJSON(json);
    const all = restored.getAll();
    expect(all.length).toBe(2);
    expect(all.map(d => d.name).sort()).toEqual(['A', 'B']);
    expect(restored.getByName('A')!.color).toBe('#111');
    expect(restored.getByName('A')!.description).toBe('desc A');
  });

  it('preserves nextPaletteIndex', () => {
    registry.create('X');
    registry.create('Y');
    const json = registry.toJSON();
    const restored = CodeDefinitionRegistry.fromJSON(json);
    // After restoring 2 definitions, next palette should be index 2
    expect(restored.peekNextPaletteColor()).toBe(DEFAULT_PALETTE[json.nextPaletteIndex % DEFAULT_PALETTE.length]);
  });

  it('handles empty data', () => {
    const restored = CodeDefinitionRegistry.fromJSON({});
    expect(restored.getAll()).toEqual([]);
  });

  it('handles null data', () => {
    const restored = CodeDefinitionRegistry.fromJSON(null);
    expect(restored.getAll()).toEqual([]);
  });
});

// ── importDefinition ─────────────────────────────────────────

describe('importDefinition', () => {
  it('imports a new definition', () => {
    const def: CodeDefinition = {
      id: 'ext-1',
      name: 'External',
      color: '#AAA',
      paletteIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      childrenOrder: [],
    };
    registry.importDefinition(def);
    expect(registry.getByName('External')).toBeDefined();
    expect(registry.getById('ext-1')!.color).toBe('#AAA');
  });

  it('skips duplicate name', () => {
    registry.create('Dup');
    const def: CodeDefinition = {
      id: 'ext-2',
      name: 'Dup',
      color: '#BBB',
      paletteIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      childrenOrder: [],
    };
    registry.importDefinition(def);
    // Should keep original, not import ext-2
    expect(registry.getById('ext-2')).toBeUndefined();
  });
});

// ── syncPaletteIndex ─────────────────────────────────────────

describe('syncPaletteIndex', () => {
  it('syncs to higher value', () => {
    registry.syncPaletteIndex(5);
    expect(registry.peekNextPaletteColor()).toBe(DEFAULT_PALETTE[5]);
  });

  it('ignores lower value', () => {
    registry.create('A'); // consumes index 0, now at 1
    registry.syncPaletteIndex(0);
    expect(registry.peekNextPaletteColor()).toBe(DEFAULT_PALETTE[1]);
  });
});

// ── onMutate ─────────────────────────────────────────────────

describe('onMutate', () => {
  it('calls callback on create', () => {
    const fn = vi.fn();
    registry.addOnMutate(fn);
    registry.create('A');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls callback on update', () => {
    const def = registry.create('A');
    const fn = vi.fn();
    registry.addOnMutate(fn);
    registry.update(def.id, { color: '#000' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls callback on delete', () => {
    const def = registry.create('A');
    const fn = vi.fn();
    registry.addOnMutate(fn);
    registry.delete(def.id);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not call callback when delete fails', () => {
    const fn = vi.fn();
    registry.addOnMutate(fn);
    registry.delete('nope');
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls callback on clear', () => {
    registry.create('A');
    registry.create('B');
    const fn = vi.fn();
    registry.addOnMutate(fn);
    registry.clear();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(registry.getAll()).toEqual([]);
  });
});

// ── getColorForCodes ─────────────────────────────────────────

describe('getColorForCodes', () => {
  it('returns color of first matching code', () => {
    registry.create('Red', '#F00');
    registry.create('Blue', '#00F');
    expect(registry.getColorForCodes(['Red', 'Blue'])).toBe('#F00');
  });

  it('returns second match if first is unknown', () => {
    registry.create('Blue', '#00F');
    expect(registry.getColorForCodes(['Unknown', 'Blue'])).toBe('#00F');
  });

  it('returns null when no codes match', () => {
    expect(registry.getColorForCodes(['X', 'Y'])).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(registry.getColorForCodes([])).toBeNull();
  });
});

describe('relations', () => {
	it('update() accepts relations field', () => {
		const reg = new CodeDefinitionRegistry();
		const code = reg.create('Alpha', '#ff0000');
		const ok = reg.update(code.id, {
			relations: [{ label: 'causes', target: 'fake-id', directed: true }],
		});
		expect(ok).toBe(true);
		expect(reg.getById(code.id)!.relations).toHaveLength(1);
	});

	it('update() clears relations with undefined', () => {
		const reg = new CodeDefinitionRegistry();
		const code = reg.create('Beta', '#00ff00');
		reg.update(code.id, { relations: [{ label: 'x', target: 'y', directed: false }] });
		reg.update(code.id, { relations: undefined });
		expect(reg.getById(code.id)!.relations).toBeUndefined();
	});

	it('toJSON/fromJSON round-trips relations', () => {
		const reg = new CodeDefinitionRegistry();
		const code = reg.create('Gamma', '#0000ff');
		reg.update(code.id, { relations: [{ label: 'enables', target: 'z', directed: true }] });
		const json = reg.toJSON();
		const restored = CodeDefinitionRegistry.fromJSON(json);
		expect(restored.getById(code.id)!.relations).toEqual([{ label: 'enables', target: 'z', directed: true }]);
	});
});

describe('update — magnitude', () => {
	it('sets magnitude config on a definition', () => {
		const reg = new CodeDefinitionRegistry();
		const def = reg.create('Frustration');
		const mag = { type: 'ordinal' as const, values: ['LOW', 'MED', 'HIGH'] };
		const ok = reg.update(def.id, { magnitude: mag });
		expect(ok).toBe(true);
		expect(reg.getById(def.id)!.magnitude).toEqual(mag);
	});

	it('clears magnitude config with undefined', () => {
		const reg = new CodeDefinitionRegistry();
		const def = reg.create('Frustration');
		reg.update(def.id, { magnitude: { type: 'nominal', values: ['A', 'B'] } });
		reg.update(def.id, { magnitude: undefined });
		expect(reg.getById(def.id)!.magnitude).toBeUndefined();
	});

	it('round-trips magnitude through toJSON/fromJSON', () => {
		const reg = new CodeDefinitionRegistry();
		const def = reg.create('Frustration');
		const mag = { type: 'continuous' as const, values: ['1', '2', '3'] };
		reg.update(def.id, { magnitude: mag });

		const restored = CodeDefinitionRegistry.fromJSON(reg.toJSON());
		expect(restored.getById(def.id)!.magnitude).toEqual(mag);
	});
});

