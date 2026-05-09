import { describe, it, expect } from 'vitest';
import { attachSourceHashSnapshot } from '../../../../src/core/icr/provenance/attachSourceHashSnapshot';
import { SourceHashRegistry } from '../../../../src/core/icr/sourceHashRegistry';

function makeMockVault(files: Record<string, string>) {
	return { adapter: { async readBinary(p: string) {
		const c = files[p];
		if (c === undefined) throw new Error('Not found: ' + p);
		return new TextEncoder().encode(c).buffer;
	} } } as any;
}

describe('attachSourceHashSnapshot', () => {
	it('mutates marker in-place adding sourceHashAtCoding', async () => {
		const reg = new SourceHashRegistry(makeMockVault({ 'f.md': 'content' }));
		const marker = { id: 'm1', fileId: 'f.md', codedBy: 'human:a' } as any;
		await attachSourceHashSnapshot(marker, reg);
		expect(marker.sourceHashAtCoding).toMatch(/^[0-9a-f]{64}$/);
	});

	it('idempotent — does NOT overwrite existing snapshot', async () => {
		const reg = new SourceHashRegistry(makeMockVault({ 'f.md': 'content' }));
		const marker = { id: 'm1', fileId: 'f.md', sourceHashAtCoding: 'existing-hash' } as any;
		await attachSourceHashSnapshot(marker, reg);
		expect(marker.sourceHashAtCoding).toBe('existing-hash');
	});

	it('returns void (mutation in-place)', async () => {
		const reg = new SourceHashRegistry(makeMockVault({ 'f.md': 'x' }));
		const marker = { id: 'm1', fileId: 'f.md' } as any;
		const result = await attachSourceHashSnapshot(marker, reg);
		expect(result).toBeUndefined();
	});

	it('swallows errors gracefully (file not found does not throw)', async () => {
		const reg = new SourceHashRegistry(makeMockVault({}));
		const marker = { id: 'm1', fileId: 'missing.md' } as any;
		await expect(attachSourceHashSnapshot(marker, reg)).resolves.toBeUndefined();
		expect(marker.sourceHashAtCoding).toBeUndefined();
	});

	it('uses cached hash on subsequent calls (lazy compute via registry)', async () => {
		const reg = new SourceHashRegistry(makeMockVault({ 'f.md': 'shared content' }));
		const m1 = { id: 'm1', fileId: 'f.md' } as any;
		const m2 = { id: 'm2', fileId: 'f.md' } as any;
		await attachSourceHashSnapshot(m1, reg);
		await attachSourceHashSnapshot(m2, reg);
		expect(m1.sourceHashAtCoding).toBe(m2.sourceHashAtCoding);
	});
});
