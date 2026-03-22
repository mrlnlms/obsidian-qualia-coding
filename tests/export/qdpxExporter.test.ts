import { describe, it, expect } from 'vitest';
import { ensureGuid, isValidUuid } from '../../src/export/qdpxExporter';

describe('isValidUuid', () => {
  it('accepts valid UUID v4', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
  it('rejects non-UUID strings', () => {
    expect(isValidUuid('abc123')).toBe(false);
    expect(isValidUuid('')).toBe(false);
  });
});

describe('ensureGuid', () => {
  it('returns original id if valid UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const map = new Map<string, string>();
    expect(ensureGuid(uuid, map)).toBe(uuid);
  });
  it('generates and caches UUID for non-UUID ids', () => {
    const map = new Map<string, string>();
    const g1 = ensureGuid('custom-id', map);
    expect(isValidUuid(g1)).toBe(true);
    expect(ensureGuid('custom-id', map)).toBe(g1);
  });
  it('generates different GUIDs for different ids', () => {
    const map = new Map<string, string>();
    expect(ensureGuid('a', map)).not.toBe(ensureGuid('b', map));
  });
});
