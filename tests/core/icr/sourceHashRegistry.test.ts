import { describe, it, expect, beforeEach } from 'vitest';
import { SourceHashRegistry } from '../../../src/core/icr/sourceHashRegistry';

function makeMockVault(files: Record<string, string>) {
	const state = { files: { ...files } };
	return {
		state,
		adapter: {
			async readBinary(path: string): Promise<ArrayBuffer> {
				const content = state.files[path];
				if (content === undefined) throw new Error(`File not found: ${path}`);
				return new TextEncoder().encode(content).buffer;
			},
		},
	} as any;
}

let vaultMock: any;
let registry: SourceHashRegistry;

beforeEach(() => {
	vaultMock = makeMockVault({
		'a.md': 'content A',
		'b.md': 'content B',
		'c.md': 'content A', // same as a.md → same hash
	});
	registry = new SourceHashRegistry(vaultMock);
});

describe('SourceHashRegistry', () => {
	it('getOrCompute calculates and caches hash on first call', async () => {
		const hash = await registry.getOrCompute('a.md');
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(registry.getEntry('a.md')?.hash).toBe(hash);
	});

	it('getOrCompute returns cached value on subsequent calls (no recompute)', async () => {
		await registry.getOrCompute('a.md');
		const t1 = registry.getEntry('a.md')!.computedAt;
		await new Promise(r => setTimeout(r, 5));
		await registry.getOrCompute('a.md');
		const t2 = registry.getEntry('a.md')!.computedAt;
		expect(t1).toBe(t2);
	});

	it('different content → different hash', async () => {
		const ha = await registry.getOrCompute('a.md');
		const hb = await registry.getOrCompute('b.md');
		expect(ha).not.toBe(hb);
	});

	it('same content (different paths) → same hash', async () => {
		const ha = await registry.getOrCompute('a.md');
		const hc = await registry.getOrCompute('c.md');
		expect(ha).toBe(hc);
	});

	it('recompute forces re-read and reports changed', async () => {
		await registry.getOrCompute('a.md');
		const beforeHash = registry.getEntry('a.md')!.hash;
		vaultMock.state.files['a.md'] = 'NEW content';
		const result = await registry.recompute('a.md');
		expect(result.changed).toBe(true);
		expect(result.oldHash).toBe(beforeHash);
		expect(result.newHash).not.toBe(beforeHash);
	});

	it('recompute reports unchanged when content same', async () => {
		await registry.getOrCompute('a.md');
		const result = await registry.recompute('a.md');
		expect(result.changed).toBe(false);
		expect(result.oldHash).toBe(result.newHash);
	});

	it('renameEntry moves entry from old to new path', async () => {
		await registry.getOrCompute('a.md');
		const hash = registry.getEntry('a.md')!.hash;
		registry.renameEntry('a.md', 'a-renamed.md');
		expect(registry.getEntry('a.md')).toBeNull();
		expect(registry.getEntry('a-renamed.md')?.hash).toBe(hash);
	});

	it('renameEntry no-op when source path not tracked', async () => {
		registry.renameEntry('untracked.md', 'whatever.md');
		expect(registry.getEntry('whatever.md')).toBeNull();
	});

	it('removeEntry deletes entry', async () => {
		await registry.getOrCompute('a.md');
		registry.removeEntry('a.md');
		expect(registry.getEntry('a.md')).toBeNull();
	});

	it('toJSON / fromJSON round-trip preserves entries', async () => {
		await registry.getOrCompute('a.md');
		await registry.getOrCompute('b.md');
		const json = registry.toJSON();
		const restored = SourceHashRegistry.fromJSON(json, vaultMock);
		expect(restored.getEntry('a.md')?.hash).toBe(registry.getEntry('a.md')?.hash);
		expect(restored.getEntry('b.md')?.hash).toBe(registry.getEntry('b.md')?.hash);
	});

	it('fromJSON with null returns empty registry', () => {
		const r = SourceHashRegistry.fromJSON(null, vaultMock);
		expect(r.getAllFileIds()).toEqual([]);
	});

	it('findByHash returns all fileIds with matching hash', async () => {
		await registry.getOrCompute('a.md');
		await registry.getOrCompute('c.md');
		const ha = registry.getEntry('a.md')!.hash;
		const matches = registry.findByHash(ha);
		expect(matches.sort()).toEqual(['a.md', 'c.md']);
	});

	it('findByHash returns empty for unknown hash', () => {
		expect(registry.findByHash('deadbeef')).toEqual([]);
	});

	it('addOnMutate fires on compute event', async () => {
		const events: string[] = [];
		registry.addOnMutate(e => events.push(e.type));
		await registry.getOrCompute('a.md');
		expect(events).toEqual(['compute']);
	});

	it('addOnMutate fires on recompute when changed', async () => {
		await registry.getOrCompute('a.md');
		const events: string[] = [];
		registry.addOnMutate(e => events.push(e.type));
		vaultMock.state.files['a.md'] = 'NEW content';
		await registry.recompute('a.md');
		expect(events).toEqual(['recompute']);
	});

	it('addOnMutate does NOT fire on recompute when unchanged', async () => {
		await registry.getOrCompute('a.md');
		const events: string[] = [];
		registry.addOnMutate(e => events.push(e.type));
		await registry.recompute('a.md');
		expect(events).toEqual([]);
	});

	it('addOnMutate fires on rename', async () => {
		await registry.getOrCompute('a.md');
		const events: string[] = [];
		registry.addOnMutate(e => events.push(e.type));
		registry.renameEntry('a.md', 'a2.md');
		expect(events).toEqual(['rename']);
	});

	it('addOnMutate fires on remove', async () => {
		await registry.getOrCompute('a.md');
		const events: string[] = [];
		registry.addOnMutate(e => events.push(e.type));
		registry.removeEntry('a.md');
		expect(events).toEqual(['remove']);
	});

	it('removeOnMutate stops listener', async () => {
		const fn = () => fail('should not fire');
		registry.addOnMutate(fn);
		registry.removeOnMutate(fn);
		await registry.getOrCompute('a.md');
	});
});
