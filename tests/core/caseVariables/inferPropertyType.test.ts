import { describe, it, expect } from 'vitest';
import { inferPropertyType } from '../../../src/core/caseVariables/inferPropertyType';

describe('inferPropertyType', () => {
  it('infers number from integer', () => {
    expect(inferPropertyType('30')).toBe('number');
    expect(inferPropertyType('-5')).toBe('number');
  });
  it('infers number from float', () => {
    expect(inferPropertyType('3.14')).toBe('number');
    expect(inferPropertyType('-0.5')).toBe('number');
  });
  it('infers checkbox from bool strings', () => {
    expect(inferPropertyType('true')).toBe('checkbox');
    expect(inferPropertyType('false')).toBe('checkbox');
    expect(inferPropertyType('TRUE')).toBe('checkbox');
  });
  it('infers date from YYYY-MM-DD', () => {
    expect(inferPropertyType('2024-03-15')).toBe('date');
  });
  it('infers datetime from ISO with time', () => {
    expect(inferPropertyType('2024-03-15T14:30')).toBe('datetime');
    expect(inferPropertyType('2024-03-15T14:30:00')).toBe('datetime');
  });
  it('defaults to text for arbitrary strings', () => {
    expect(inferPropertyType('controle')).toBe('text');
    expect(inferPropertyType('')).toBe('text');
  });
  it('infers number from pure digits, including leading zeros (01, 007 → number; user must use prefix like "P01" to preserve string)', () => {
    expect(inferPropertyType('01')).toBe('number');
    expect(inferPropertyType('007')).toBe('number');
    expect(inferPropertyType('P01')).toBe('text');
    expect(inferPropertyType('ID-007')).toBe('text');
  });
  it('does not infer multitext from single string (multitext via explicit user action)', () => {
    expect(inferPropertyType('a, b, c')).toBe('text');
  });
});
