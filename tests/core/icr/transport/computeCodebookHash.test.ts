import { describe, it, expect } from 'vitest';
import { computeCodebookHash } from '../../../../src/core/icr/transport/computeCodebookHash';
import type { CodeDefinition } from '../../../../src/core/types';

const c1: CodeDefinition = { id: 'c1', name: 'A', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
const c2: CodeDefinition = { id: 'c2', name: 'B', color: '#000', paletteIndex: 1, createdAt: 1, updatedAt: 1, childrenOrder: [] };

describe('computeCodebookHash', () => {
	it('returns 64-char SHA-256 hex', async () => {
		const hash = await computeCodebookHash({ codes: [c1], groups: [], smartCodes: [] });
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('order-independent (sort por id internamente)', async () => {
		const h1 = await computeCodebookHash({ codes: [c1, c2], groups: [], smartCodes: [] });
		const h2 = await computeCodebookHash({ codes: [c2, c1], groups: [], smartCodes: [] });
		expect(h1).toBe(h2);
	});

	it('different name → different hash', async () => {
		const c2alt: CodeDefinition = { ...c2, name: 'B-changed' };
		const h1 = await computeCodebookHash({ codes: [c1, c2], groups: [], smartCodes: [] });
		const h2 = await computeCodebookHash({ codes: [c1, c2alt], groups: [], smartCodes: [] });
		expect(h1).not.toBe(h2);
	});

	it('different color → different hash', async () => {
		const c2alt: CodeDefinition = { ...c2, color: '#ff0000' };
		const h1 = await computeCodebookHash({ codes: [c1, c2], groups: [], smartCodes: [] });
		const h2 = await computeCodebookHash({ codes: [c1, c2alt], groups: [], smartCodes: [] });
		expect(h1).not.toBe(h2);
	});

	it('volatile fields (createdAt/updatedAt) ignored', async () => {
		const c1now: CodeDefinition = { ...c1, createdAt: 999999, updatedAt: 999999 };
		const h1 = await computeCodebookHash({ codes: [c1], groups: [], smartCodes: [] });
		const h2 = await computeCodebookHash({ codes: [c1now], groups: [], smartCodes: [] });
		expect(h1).toBe(h2);
	});

	it('handles empty codebook', async () => {
		const hash = await computeCodebookHash({ codes: [], groups: [], smartCodes: [] });
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});
});
