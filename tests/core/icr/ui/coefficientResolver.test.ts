import { describe, it, expect } from 'vitest';
import { getCoefficientValue, isCoefficientApplicable } from '../../../../src/core/icr/ui/coefficientResolver';
import type { KappaReport, EngineId } from '../../../../src/core/icr/reporter';

const baseAggregate = {
	cohenKappa: { 'human:a|human:b': 0.5 },
	fleissKappa: 0.6,
	alphaNominal: 0.7,
	alphaBinary: 0.8,
	cuAlpha: 0.9,
};
const report: KappaReport = { byEngine: {}, aggregate: baseAggregate, weights: {}, aggregateWarnings: [] };

describe('getCoefficientValue', () => {
	it('Cohen κ por par (ordem normalizada a|b ou b|a)', () => {
		expect(getCoefficientValue(report, 'cohen', ['human:a', 'human:b'])).toBe(0.5);
		expect(getCoefficientValue(report, 'cohen', ['human:b', 'human:a'])).toBe(0.5);
	});

	it('Cohen sem par retorna undefined', () => {
		expect(getCoefficientValue(report, 'cohen')).toBeUndefined();
	});

	it('coeficientes scalar não usam pair', () => {
		expect(getCoefficientValue(report, 'fleiss')).toBe(0.6);
		expect(getCoefficientValue(report, 'alpha')).toBe(0.7);
		expect(getCoefficientValue(report, 'alpha-binary')).toBe(0.8);
		expect(getCoefficientValue(report, 'cu-alpha')).toBe(0.9);
	});

	it('Cohen pra par sem entry retorna undefined', () => {
		expect(getCoefficientValue(report, 'cohen', ['human:a', 'human:c'])).toBeUndefined();
	});
});

describe('isCoefficientApplicable', () => {
	const textEngines: EngineId[] = ['markdown', 'pdf'];
	const csvRowOnly: EngineId[] = ['csvRow'];

	it('Cohen pareado sempre aplicável', () => {
		expect(isCoefficientApplicable('cohen', 2, textEngines)).toBe(true);
		expect(isCoefficientApplicable('cohen', 5, textEngines)).toBe(true);
	});

	it('Fleiss requer 3+ coders', () => {
		expect(isCoefficientApplicable('fleiss', 2, textEngines)).toBe(false);
		expect(isCoefficientApplicable('fleiss', 3, textEngines)).toBe(true);
	});

	it('alpha-binary e cu-alpha n/a quando todas engines são csvRow', () => {
		expect(isCoefficientApplicable('alpha-binary', 3, csvRowOnly)).toBe(false);
		expect(isCoefficientApplicable('cu-alpha', 3, csvRowOnly)).toBe(false);
	});

	it('alpha-binary e cu-alpha aplicáveis quando há text-likes mesmo com csvRow', () => {
		expect(isCoefficientApplicable('alpha-binary', 3, ['csvRow', 'markdown'])).toBe(true);
	});

	it('alpha (nominal) sempre aplicável', () => {
		expect(isCoefficientApplicable('alpha', 2, csvRowOnly)).toBe(true);
		expect(isCoefficientApplicable('alpha', 5, textEngines)).toBe(true);
	});

	it('engines bbox (pdfShape/image) habilitam alpha-binary e cu-alpha', () => {
		expect(isCoefficientApplicable('alpha-binary', 2, ['pdfShape'])).toBe(true);
		expect(isCoefficientApplicable('cu-alpha', 2, ['image'])).toBe(true);
	});

	it('engines temporal (audio/video) habilitam alpha-binary e cu-alpha', () => {
		expect(isCoefficientApplicable('alpha-binary', 2, ['audio'])).toBe(true);
		expect(isCoefficientApplicable('cu-alpha', 2, ['video'])).toBe(true);
	});
});
