import { describe, it, expect } from 'vitest';
import { formatTime } from '../../src/media/formatTime';

describe('formatTime', () => {
  it('formats 0 seconds as "0:00.0"', () => {
    expect(formatTime(0)).toBe('0:00.0');
  });

  it('formats 65.4 seconds as "1:05.4"', () => {
    expect(formatTime(65.4)).toBe('1:05.4');
  });

  it('formats 3661 seconds as "61:01.0"', () => {
    expect(formatTime(3661)).toBe('61:01.0');
  });

  it('formats sub-second values correctly', () => {
    expect(formatTime(0.5)).toBe('0:00.5');
  });

  it('formats exactly 60 seconds as "1:00.0"', () => {
    expect(formatTime(60)).toBe('1:00.0');
  });

  it('formats 5.123 seconds (rounding to 1 decimal)', () => {
    expect(formatTime(5.123)).toBe('0:05.1');
  });

  it('formats very large values (36000 = 600 minutes)', () => {
    expect(formatTime(36000)).toBe('600:00.0');
  });

  it('returns "0:00.0" for NaN', () => {
    expect(formatTime(NaN)).toBe('0:00.0');
  });

  it('returns "0:00.0" for Infinity', () => {
    expect(formatTime(Infinity)).toBe('0:00.0');
  });

  it('returns "0:00.0" for negative values', () => {
    expect(formatTime(-10)).toBe('0:00.0');
  });

  it('returns "0:00.0" for -Infinity', () => {
    expect(formatTime(-Infinity)).toBe('0:00.0');
  });
});
