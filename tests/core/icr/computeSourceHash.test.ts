import { describe, it, expect } from 'vitest';
import { computeSourceHash } from '../../../src/core/icr/computeSourceHash';

describe('computeSourceHash', () => {
	it('returns SHA-256 hex string for known input', async () => {
		const buffer = new TextEncoder().encode('hello world').buffer;
		const hash = await computeSourceHash(buffer);
		// SHA-256('hello world') canonical
		expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
	});

	it('returns 64-char lowercase hex', async () => {
		const buffer = new TextEncoder().encode('any').buffer;
		const hash = await computeSourceHash(buffer);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('different inputs produce different hashes', async () => {
		const a = await computeSourceHash(new TextEncoder().encode('a').buffer);
		const b = await computeSourceHash(new TextEncoder().encode('b').buffer);
		expect(a).not.toBe(b);
	});

	it('same input produces same hash (deterministic)', async () => {
		const buf = new TextEncoder().encode('repeat me').buffer;
		const h1 = await computeSourceHash(buf);
		const h2 = await computeSourceHash(buf);
		expect(h1).toBe(h2);
	});

	it('handles empty buffer', async () => {
		const empty = new ArrayBuffer(0);
		const hash = await computeSourceHash(empty);
		// SHA-256('') canonical
		expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
	});
});
