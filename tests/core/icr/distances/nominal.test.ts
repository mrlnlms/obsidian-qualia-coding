import { describe, expect, it } from 'vitest';
import { distanceNominal } from '../../../../src/core/icr/distances/nominal';

describe('distanceNominal', () => {
  it('returns 0 for identical singletons', () => {
    expect(distanceNominal(new Set(['a']), new Set(['a']))).toBe(0);
  });
  it('returns 1 for disjoint singletons', () => {
    expect(distanceNominal(new Set(['a']), new Set(['b']))).toBe(1);
  });
  it('returns 0 for empty/empty', () => {
    expect(distanceNominal(new Set(), new Set())).toBe(0);
  });
  it('returns 1 for empty vs non-empty', () => {
    expect(distanceNominal(new Set(), new Set(['a']))).toBe(1);
  });
  it('returns 0 for multi-label sets that share alphabetic-first code', () => {
    expect(distanceNominal(new Set(['a', 'b']), new Set(['a', 'c']))).toBe(0);
  });
  it('returns 1 for multi-label sets with disjoint alphabetic-first codes', () => {
    expect(distanceNominal(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(1);
  });
});
