import { describe, expect, it } from 'vitest';
import { distanceJaccard } from '../../../../src/core/icr/distances/jaccard';

describe('distanceJaccard', () => {
  it('returns 0 for identical sets', () => {
    expect(distanceJaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(0);
  });
  it('returns 0.333... for subset relation {a,b} vs {a,b,c}', () => {
    const d = distanceJaccard(new Set(['a', 'b']), new Set(['a', 'b', 'c']));
    expect(d).toBeCloseTo(1 / 3, 6);
  });
  it('returns 0.667 for lateral overlap {a,b} vs {a,c}', () => {
    const d = distanceJaccard(new Set(['a', 'b']), new Set(['a', 'c']));
    expect(d).toBeCloseTo(2 / 3, 6);
  });
  it('returns 1 for disjoint sets', () => {
    expect(distanceJaccard(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(1);
  });
  it('returns 0 for identical singletons (invariant w/ nominal)', () => {
    expect(distanceJaccard(new Set(['a']), new Set(['a']))).toBe(0);
  });
  it('returns 1 for disjoint singletons (invariant w/ nominal)', () => {
    expect(distanceJaccard(new Set(['a']), new Set(['b']))).toBe(1);
  });
  it('returns 0 for empty/empty', () => {
    expect(distanceJaccard(new Set(), new Set())).toBe(0);
  });
  it('returns 1 for empty vs non-empty', () => {
    expect(distanceJaccard(new Set(), new Set(['a']))).toBe(1);
  });
});
