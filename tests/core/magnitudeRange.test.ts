import { describe, it, expect } from 'vitest';
import { generateContinuousRange } from '../../src/core/magnitudeRange';

describe('generateContinuousRange', () => {
    it('generates integer points with zero decimals when step has none', () => {
        expect(generateContinuousRange('0', '3', '1')).toEqual(['0', '1', '2', '3']);
    });

    it('preserves step precision across all points (avoids mixed "0", "0.5", "1")', () => {
        expect(generateContinuousRange('0', '2', '0.5')).toEqual(['0.0', '0.5', '1.0', '1.5', '2.0']);
    });

    it('handles fractional steps without float drift (0.1 accumulation)', () => {
        expect(generateContinuousRange('0', '1', '0.1')).toEqual([
            '0.0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1.0',
        ]);
    });

    it('follows step precision for hundredths', () => {
        expect(generateContinuousRange('0', '0.05', '0.01')).toEqual([
            '0.00', '0.01', '0.02', '0.03', '0.04', '0.05',
        ]);
    });

    it('returns null when min > max', () => {
        expect(generateContinuousRange('5', '1', '1')).toBeNull();
    });

    it('returns null for non-numeric input', () => {
        expect(generateContinuousRange('abc', '5', '1')).toBeNull();
        expect(generateContinuousRange('0', '', '1')).toBeNull();
    });

    it('returns null for zero or negative step', () => {
        expect(generateContinuousRange('0', '5', '0')).toBeNull();
        expect(generateContinuousRange('0', '5', '-1')).toBeNull();
    });

    it('returns null when the range would generate more than the safety cap', () => {
        expect(generateContinuousRange('0', '200', '1')).toBeNull();
    });

    it('respects a custom maxPoints option', () => {
        expect(generateContinuousRange('0', '5', '1', { maxPoints: 3 })).toBeNull();
        expect(generateContinuousRange('0', '5', '1', { maxPoints: 10 })).toEqual(['0', '1', '2', '3', '4', '5']);
    });
});
