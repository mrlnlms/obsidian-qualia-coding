import { describe, expect, it } from 'vitest';
import {
	assertQdpxExportAudit,
	createQdpxExportAudit,
	QdpxExportValidationError,
} from '../../src/export/qdpxExportAudit';

describe('QDPX export audit', () => {
	it('allows a complete snapshot', () => {
		const audit = createQdpxExportAudit();
		audit.activePdfSources = 1;
		audit.resolvedPdfMarkers = 2;
		audit.exportedLogicalSelections = 1;
		audit.exportedPdfFragments = 2;
		expect(() => assertQdpxExportAudit(audit)).not.toThrow();
	});

	it('throws a structured error instead of completing a partial package', () => {
		const audit = createQdpxExportAudit();
		audit.issues.push({ kind: 'projection', sourceId: 'paper.pdf', markerId: 'm1', message: 'invalid endpoint' });
		try {
			assertQdpxExportAudit(audit);
			throw new Error('expected validation error');
		} catch (error) {
			expect(error).toBeInstanceOf(QdpxExportValidationError);
			expect((error as QdpxExportValidationError).audit).toBe(audit);
			expect((error as Error).message).toContain('invalid endpoint');
		}
	});
});
