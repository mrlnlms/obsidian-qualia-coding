import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── In-memory OPFS mock ───────────────────────────────────────────────
// Models the FileSystemDirectoryHandle / FileSystemFileHandle / FileSystemWritable*
// surface tightly enough for opfs.ts to operate on. Swap in `mockOpfsRoot` per test
// for isolation.

interface MockFile {
	contents: Uint8Array;
}

class MockWritable {
	private buf: Uint8Array[] = [];
	constructor(private readonly file: MockFile) {}
	async write(chunk: Uint8Array | string): Promise<void> {
		const u8 = typeof chunk === 'string'
			? new TextEncoder().encode(chunk)
			: new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
		this.buf.push(u8);
	}
	async close(): Promise<void> {
		const total = this.buf.reduce((acc, c) => acc + c.length, 0);
		const out = new Uint8Array(total);
		let off = 0;
		for (const c of this.buf) { out.set(c, off); off += c.length; }
		this.file.contents = out;
	}
}

class MockFileHandle {
	constructor(public readonly name: string, public readonly file: MockFile) {}
	async getFile(): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }> {
		const bytes = this.file.contents;
		return {
			text: async () => new TextDecoder().decode(bytes),
			arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		};
	}
	async createWritable(): Promise<MockWritable> {
		return new MockWritable(this.file);
	}
}

class MockDirHandle {
	private store = new Map<string, MockDirHandle | MockFileHandle>();
	constructor(public readonly name: string) {}

	async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<MockDirHandle> {
		const existing = this.store.get(name);
		if (existing instanceof MockDirHandle) return existing;
		if (existing) throw new Error(`${name} is a file, not a directory`);
		if (!opts?.create) {
			const e = new Error(`No directory named ${name}`);
			(e as { name: string }).name = 'NotFoundError';
			throw e;
		}
		const dir = new MockDirHandle(name);
		this.store.set(name, dir);
		return dir;
	}

	async getFileHandle(name: string, opts?: { create?: boolean }): Promise<MockFileHandle> {
		const existing = this.store.get(name);
		if (existing instanceof MockFileHandle) return existing;
		if (existing) throw new Error(`${name} is a directory, not a file`);
		if (!opts?.create) {
			const e = new Error(`No file named ${name}`);
			(e as { name: string }).name = 'NotFoundError';
			throw e;
		}
		const handle = new MockFileHandle(name, { contents: new Uint8Array() });
		this.store.set(name, handle);
		return handle;
	}

	async removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void> {
		if (!this.store.has(name)) {
			const e = new Error(`No entry ${name}`);
			(e as { name: string }).name = 'NotFoundError';
			throw e;
		}
		// recursive: true would drop nested entries too. Our mock entries don't
		// nest beyond a single level so simple delete suffices.
		void opts;
		this.store.delete(name);
	}

	entries_iter() {
		return this.store.entries();
	}

	async *entries(): AsyncIterable<[string, MockDirHandle | MockFileHandle]> {
		for (const [name, handle] of this.store) {
			yield [name, handle];
		}
	}

	hasEntry(name: string): boolean { return this.store.has(name); }
}

// ── Set up globals before importing the module ─────────────────────────
let mockRoot: MockDirHandle;

vi.mock('node:fs', () => {
	const filesByPath = new Map<string, Uint8Array>();
	return {
		statSync: vi.fn((path: string) => ({
			size: filesByPath.get(path)?.byteLength ?? 0,
		})),
		createReadStream: vi.fn((path: string, opts?: { highWaterMark?: number }) => {
			const data = filesByPath.get(path);
			if (!data) throw new Error(`mock fs: no file at ${path}`);
			const chunkSize = opts?.highWaterMark ?? data.length;
			return {
				async *[Symbol.asyncIterator]() {
					for (let off = 0; off < data.length; off += chunkSize) {
						yield Buffer.from(data.slice(off, off + chunkSize));
					}
				},
			};
		}),
		// Test setup helper.
		__setMockFile(path: string, content: Uint8Array | string) {
			filesByPath.set(path, typeof content === 'string' ? new TextEncoder().encode(content) : content);
		},
		__clearMockFiles() { filesByPath.clear(); },
	};
});

import * as fsMod from 'node:fs';
const setMockFile = (fsMod as unknown as { __setMockFile: (p: string, c: Uint8Array | string) => void }).__setMockFile;
const clearMockFiles = (fsMod as unknown as { __clearMockFiles: () => void }).__clearMockFiles;

// Now import the SUT — mocks are in place.
import { opfsKeyFor, copyVaultFileToOPFS, openOPFSFile, removeOPFSFile, clearOPFSCache } from '../../../src/csv/duckdb/opfs';

beforeEach(() => {
	mockRoot = new MockDirHandle('root');
	(globalThis as unknown as { navigator: Navigator }).navigator = {
		storage: {
			getDirectory: vi.fn(async () => mockRoot),
		},
	} as unknown as Navigator;
	clearMockFiles();
});

describe('opfsKeyFor', () => {
	it('produces stable 16-hex-char keys', () => {
		const key = opfsKeyFor('vault-id', 'path/to/file.csv');
		expect(key).toMatch(/^[a-f0-9]{16}$/);
	});

	it('same inputs produce same key', () => {
		const a = opfsKeyFor('v1', 'p1');
		const b = opfsKeyFor('v1', 'p1');
		expect(a).toBe(b);
	});

	it('different inputs produce different keys', () => {
		const a = opfsKeyFor('v1', 'p1');
		const b = opfsKeyFor('v1', 'p2');
		const c = opfsKeyFor('v2', 'p1');
		expect(a).not.toBe(b);
		expect(a).not.toBe(c);
	});
});

describe('copyVaultFileToOPFS', () => {
	it('copies a file via streaming and writes meta.json', async () => {
		setMockFile('/abs/data.csv', 'header\nrow1\nrow2\n');
		const handle = await copyVaultFileToOPFS('/abs/data.csv', 'key1', 1234);
		expect(handle).toBeDefined();
		// Verify meta + data ended up under the namespace
		const qualiaDir = await mockRoot.getDirectoryHandle('qualia-coding');
		const entryDir = await qualiaDir.getDirectoryHandle('key1');
		expect(entryDir.hasEntry('data.bin')).toBe(true);
		expect(entryDir.hasEntry('meta.json')).toBe(true);
	});

	it('skips re-copy when mtime matches', async () => {
		setMockFile('/abs/data.csv', 'content');
		await copyVaultFileToOPFS('/abs/data.csv', 'key1', 1234);
		// Replace file but keep mtime — a real re-copy would propagate the new bytes.
		setMockFile('/abs/data.csv', 'NEW CONTENT');
		await copyVaultFileToOPFS('/abs/data.csv', 'key1', 1234);
		// Original content preserved → skip path was taken.
		const handle = await openOPFSFile('key1');
		const file = await handle.getFile();
		const text = await file.text();
		expect(text).toBe('content');
	});

	it('overwrites when mtime changes', async () => {
		setMockFile('/abs/data.csv', 'old');
		await copyVaultFileToOPFS('/abs/data.csv', 'key1', 1000);
		setMockFile('/abs/data.csv', 'new');
		await copyVaultFileToOPFS('/abs/data.csv', 'key1', 2000);
		const handle = await openOPFSFile('key1');
		const file = await handle.getFile();
		const text = await file.text();
		expect(text).toBe('new');
	});

	it('streams in chunks (no full buffer materialization)', async () => {
		// A 5 MB file forces multiple chunks at the 1 MB highWaterMark.
		const big = new Uint8Array(5 * 1024 * 1024);
		for (let i = 0; i < big.length; i++) big[i] = i & 0xff;
		setMockFile('/abs/big.bin', big);

		const progressCalls: Array<[number, number]> = [];
		await copyVaultFileToOPFS('/abs/big.bin', 'big', 1, (w, t) => progressCalls.push([w, t]));

		// Multiple progress events confirm chunking.
		expect(progressCalls.length).toBeGreaterThan(1);
		expect(progressCalls.at(-1)?.[0]).toBe(big.length);
		expect(progressCalls.at(-1)?.[1]).toBe(big.length);
	});
});

describe('openOPFSFile', () => {
	it('returns the handle when present', async () => {
		setMockFile('/abs/x.csv', 'content');
		await copyVaultFileToOPFS('/abs/x.csv', 'k', 1);
		const handle = await openOPFSFile('k');
		expect(handle).toBeDefined();
	});

	it('throws when missing', async () => {
		await expect(openOPFSFile('missing-key')).rejects.toThrow();
	});
});

describe('removeOPFSFile', () => {
	it('removes an existing entry', async () => {
		setMockFile('/abs/x.csv', 'content');
		await copyVaultFileToOPFS('/abs/x.csv', 'rm-test', 1);
		await removeOPFSFile('rm-test');
		await expect(openOPFSFile('rm-test')).rejects.toThrow();
	});

	it('is a no-op for missing entries', async () => {
		await expect(removeOPFSFile('does-not-exist')).resolves.toBeUndefined();
	});
});

describe('clearOPFSCache', () => {
	it('removes all entries and reports count', async () => {
		setMockFile('/abs/a.csv', 'a');
		setMockFile('/abs/b.csv', 'b');
		await copyVaultFileToOPFS('/abs/a.csv', 'a', 1);
		await copyVaultFileToOPFS('/abs/b.csv', 'b', 1);
		const result = await clearOPFSCache();
		expect(result.removed).toBe(2);
		await expect(openOPFSFile('a')).rejects.toThrow();
		await expect(openOPFSFile('b')).rejects.toThrow();
	});

	it('is a no-op when namespace does not exist', async () => {
		const result = await clearOPFSCache();
		expect(result.removed).toBe(0);
	});

	it('reports 0 when OPFS API itself is absent', async () => {
		(globalThis as unknown as { navigator: Navigator }).navigator = {} as Navigator;
		const result = await clearOPFSCache();
		expect(result.removed).toBe(0);
	});
});

describe('error handling', () => {
	it('copy throws when navigator.storage is unavailable', async () => {
		(globalThis as unknown as { navigator: Navigator }).navigator = {} as Navigator;
		setMockFile('/abs/x.csv', 'content');
		await expect(copyVaultFileToOPFS('/abs/x.csv', 'k', 1)).rejects.toThrow(/OPFS API/);
	});
});
