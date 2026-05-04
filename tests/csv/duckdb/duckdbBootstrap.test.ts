import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the wasm assets — esbuild loaders aren't available in vitest.
vi.mock('../../../src/csv/duckdb/wasmAssets', () => ({
	getWasmBytes: () => new Uint8Array([0x00, 0x61, 0x73, 0x6d]), // dummy "asm" magic
	clearWasmBytesCache: () => {},
	workerSource: '/* dummy worker source */',
}));

// Mock the duckdb-wasm runtime — see strategy in parquet-lazy-design.md §9 #9.
// Vitest 4 requires mocked constructors to use `function` or `class` (arrow fns
// can't be `new`-called). Using class with shared spy fns gives us both
// constructibility and mockable behavior.
const mockTerminate = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockInstantiate = vi.fn().mockResolvedValue(undefined);
const mockConnect = vi.fn().mockResolvedValue({
	close: mockClose,
	query: vi.fn().mockResolvedValue({ toArray: () => [] }),
});

vi.mock('@duckdb/duckdb-wasm', () => {
	class MockAsyncDuckDB {
		instantiate = mockInstantiate;
		connect = mockConnect;
		terminate = mockTerminate;
	}
	class MockConsoleLogger {}
	return {
		AsyncDuckDB: MockAsyncDuckDB,
		ConsoleLogger: MockConsoleLogger,
		LogLevel: { WARNING: 1 },
		PACKAGE_VERSION: '1.29.0-mock',
	};
});

// jsdom provides Worker as a stub that throws on construction. Replace with a no-op
// mock so the bootstrap factory can construct it without hitting the real Worker API.
class MockWorker {
	terminate = vi.fn();
	postMessage = vi.fn();
	addEventListener = vi.fn();
	removeEventListener = vi.fn();
}
(globalThis as unknown as { Worker: typeof MockWorker }).Worker = MockWorker;

// URL.createObjectURL / revokeObjectURL aren't implemented in jsdom either.
const createObjectURL = vi.fn(() => 'blob:mock-url');
const revokeObjectURL = vi.fn();
(globalThis.URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
(globalThis.URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;

import { createDuckDBRuntime } from '../../../src/csv/duckdb/duckdbBootstrap';

describe('createDuckDBRuntime', () => {
	beforeEach(() => {
		mockTerminate.mockClear();
		mockClose.mockClear();
		mockInstantiate.mockClear();
		mockConnect.mockClear();
		createObjectURL.mockClear();
		revokeObjectURL.mockClear();
	});

	it('returns a runtime with db, conn, worker, dispose', async () => {
		const rt = await createDuckDBRuntime();
		expect(rt.db).toBeDefined();
		expect(rt.conn).toBeDefined();
		expect(rt.worker).toBeInstanceOf(MockWorker);
		expect(typeof rt.dispose).toBe('function');
		await rt.dispose();
	});

	it('creates two Blob URLs (worker + wasm) and revokes them on dispose', async () => {
		const rt = await createDuckDBRuntime();
		expect(createObjectURL).toHaveBeenCalledTimes(2);
		await rt.dispose();
		expect(revokeObjectURL).toHaveBeenCalledTimes(2);
	});

	it('dispose is idempotent — second call is a no-op', async () => {
		const rt = await createDuckDBRuntime();
		await rt.dispose();
		await rt.dispose();
		// terminate/close should still only have been called once each.
		expect(mockTerminate).toHaveBeenCalledTimes(1);
		expect(mockClose).toHaveBeenCalledTimes(1);
	});

	it('dispose tolerates errors from individual teardown steps', async () => {
		mockClose.mockRejectedValueOnce(new Error('conn.close boom'));
		mockTerminate.mockRejectedValueOnce(new Error('db.terminate boom'));
		const rt = await createDuckDBRuntime();
		// Should not throw despite errors inside.
		await expect(rt.dispose()).resolves.toBeUndefined();
		// And URLs are still revoked.
		expect(revokeObjectURL).toHaveBeenCalledTimes(2);
	});

	it('cleans up worker + URLs if instantiate fails', async () => {
		mockInstantiate.mockRejectedValueOnce(new Error('boom'));
		await expect(createDuckDBRuntime()).rejects.toThrow('boom');
		expect(revokeObjectURL).toHaveBeenCalledTimes(2);
	});

	it('worker is constructed (boot path reaches new Worker)', async () => {
		const rt = await createDuckDBRuntime();
		expect(rt.worker).toBeInstanceOf(MockWorker);
		await rt.dispose();
	});
});
