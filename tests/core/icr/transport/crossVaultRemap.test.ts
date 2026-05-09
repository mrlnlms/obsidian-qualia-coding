import { describe, it, expect, beforeEach } from 'vitest';
import { crossVaultRemap } from '../../../../src/core/icr/transport/crossVaultRemap';
import { SourceHashRegistry } from '../../../../src/core/icr/sourceHashRegistry';

function makeMockVault(files: Record<string, string>) {
	return {
		adapter: {
			async readBinary(path: string): Promise<ArrayBuffer> {
				return new TextEncoder().encode(files[path] ?? '').buffer;
			},
		},
	} as any;
}

let registry: SourceHashRegistry;

beforeEach(async () => {
	const vault = makeMockVault({
		'local/path/A.md': 'content shared 1',
		'local/path/B.md': 'content shared 2',
	});
	registry = new SourceHashRegistry(vault);
	await registry.getOrCompute('local/path/A.md');
	await registry.getOrCompute('local/path/B.md');
});

describe('crossVaultRemap', () => {
	it('remaps payload fileId to local fileId when hash matches different path', () => {
		const aHash = registry.getEntry('local/path/A.md')!.hash;
		const payloadSources = { 'remote/path/A.md': { hash: aHash } };
		const result = crossVaultRemap(payloadSources, registry);
		expect(result.fileIdRemap['remote/path/A.md']).toBe('local/path/A.md');
	});

	it('keeps fileId when path identical and hash matches', () => {
		const aHash = registry.getEntry('local/path/A.md')!.hash;
		const payloadSources = { 'local/path/A.md': { hash: aHash } };
		const result = crossVaultRemap(payloadSources, registry);
		expect(result.fileIdRemap['local/path/A.md']).toBe('local/path/A.md');
		expect(result.conflicts.length).toBe(0);
	});

	it('emits source_hash_mismatch when same path but different hash', () => {
		const payloadSources = { 'local/path/A.md': { hash: 'deadbeef'.repeat(8) } };
		const result = crossVaultRemap(payloadSources, registry);
		expect(result.conflicts.some(c => c.kind === 'source_hash_mismatch')).toBe(true);
	});

	it('emits source_not_found when no hash match anywhere', () => {
		const payloadSources = { 'remote/unknown.md': { hash: 'deadbeef'.repeat(8) } };
		const result = crossVaultRemap(payloadSources, registry);
		expect(result.conflicts.some(c => c.kind === 'source_not_found')).toBe(true);
		expect(result.fileIdRemap['remote/unknown.md']).toBeUndefined();
	});

	it('picks first alphabetical when multiple local files have same hash', async () => {
		const vault = makeMockVault({
			'local/path/A.md': 'shared',
			'zzz/path/A.md': 'shared',
		});
		const reg = new SourceHashRegistry(vault);
		await reg.getOrCompute('local/path/A.md');
		await reg.getOrCompute('zzz/path/A.md');
		const sharedHash = reg.getEntry('local/path/A.md')!.hash;
		const result = crossVaultRemap({ 'remote/A.md': { hash: sharedHash } }, reg);
		expect(result.fileIdRemap['remote/A.md']).toBe('local/path/A.md');
		expect(result.conflicts.some(c => c.kind === 'multiple_hash_matches')).toBe(true);
	});

	it('handles multiple sources in one call', () => {
		const aHash = registry.getEntry('local/path/A.md')!.hash;
		const bHash = registry.getEntry('local/path/B.md')!.hash;
		const result = crossVaultRemap({
			'remote/X.md': { hash: aHash },
			'remote/Y.md': { hash: bHash },
		}, registry);
		expect(result.fileIdRemap['remote/X.md']).toBe('local/path/A.md');
		expect(result.fileIdRemap['remote/Y.md']).toBe('local/path/B.md');
	});
});
