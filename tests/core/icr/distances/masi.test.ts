import { describe, expect, it } from 'vitest';
import { distanceMASI } from '../../../../src/core/icr/distances/masi';

describe('distanceMASI', () => {
  it('returns 0 for identical sets (M=1)', () => {
    expect(distanceMASI(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(0);
  });
  it('returns 0.555... for subset {a,b} vs {a,b,c} (M=2/3)', () => {
    const d = distanceMASI(new Set(['a', 'b']), new Set(['a', 'b', 'c']));
    expect(d).toBeCloseTo(5 / 9, 6);
  });
  it('returns 0.889 for lateral overlap {a,b} vs {a,c} (M=1/3)', () => {
    const d = distanceMASI(new Set(['a', 'b']), new Set(['a', 'c']));
    expect(d).toBeCloseTo(8 / 9, 6);
  });
  it('returns 1 for disjoint (M=0)', () => {
    expect(distanceMASI(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(1);
  });
  it('returns 0 for identical singletons (invariant w/ nominal)', () => {
    expect(distanceMASI(new Set(['a']), new Set(['a']))).toBe(0);
  });
  it('returns 1 for disjoint singletons (invariant w/ nominal)', () => {
    expect(distanceMASI(new Set(['a']), new Set(['b']))).toBe(1);
  });
  it('returns 0 for empty/empty', () => {
    expect(distanceMASI(new Set(), new Set())).toBe(0);
  });
  it('returns 1 for empty vs non-empty', () => {
    expect(distanceMASI(new Set(), new Set(['a']))).toBe(1);
  });
  it('handles subset where smaller set is on right (M=2/3 symmetric)', () => {
    const d = distanceMASI(new Set(['a', 'b', 'c']), new Set(['a', 'b']));
    expect(d).toBeCloseTo(5 / 9, 6);
  });
});
