import { describe, it, expect } from 'vitest';
import type { CodeApplication } from '../../src/core/types';

describe('CodeApplication', () => {
	it('should accept minimal shape (codeId only)', () => {
		const app: CodeApplication = { codeId: 'code_test' };
		expect(app.codeId).toBe('code_test');
		expect(app.magnitude).toBeUndefined();
	});

	it('should accept full shape with magnitude', () => {
		const app: CodeApplication = { codeId: 'code_test', magnitude: 'ALTA' };
		expect(app.magnitude).toBe('ALTA');
	});
});
