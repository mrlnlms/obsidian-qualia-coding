import * as duckdb from "@duckdb/duckdb-wasm";
import { getWasmBytes, workerSource } from "./wasmAssets";

export interface DuckDBRuntime {
	db: duckdb.AsyncDuckDB;
	conn: duckdb.AsyncDuckDBConnection;
	worker: Worker;
	dispose: () => Promise<void>;
}

/**
 * Two shims pre-pended to the worker source before it boots.
 * Both are required for DuckDB-Wasm to load inside an Obsidian (Electron renderer) Worker.
 *
 * 1) js-sha256 (transitive dep of duckdb-wasm) detects "Node.js mode" because `process`
 *    global exists and `process.type !== "renderer"` in workers. It then tries to use
 *    `Buffer` which doesn't exist in this context → "Cannot read properties of undefined
 *    (reading 'from')". Mutating `process.type` directly fails (read-only); we replace
 *    `self.process` entirely via `Object.defineProperty`.
 *
 * 2) DuckDB tries `new Request(url)` + `fetch(url)` inside `WebAssembly.instantiateStreaming`
 *    → `Request is not defined` in Electron renderer Workers. The source has an XHR
 *    fallback that activates when `WebAssembly.instantiateStreaming` is `undefined`.
 *
 * Both shims discovered + validated empirically in the qualia-spike-duckdb spike (2026-05-03).
 * See parquet-lazy-design.md §14.5.1.
 */
const WORKER_SHIM =
	`try { Object.defineProperty(self, 'process', { value: { type: 'renderer', versions: {}, env: {} }, writable: true, configurable: true }); } catch (e) { try { self.process = undefined; } catch (_) {} }\n` +
	`try { Object.defineProperty(WebAssembly, 'instantiateStreaming', { value: undefined, writable: true, configurable: true }); } catch (e) {}\n`;

/**
 * Creates a DuckDB-Wasm runtime instance. Caller is responsible for `dispose()` on teardown.
 *
 * Designed for lazy initialization: not called automatically by the plugin. The first
 * code path that needs DuckDB triggers this; subsequent calls return the same runtime
 * (cached at the call site, e.g. `QualiaCodingPlugin.getDuckDB()`).
 */
export async function createDuckDBRuntime(): Promise<DuckDBRuntime> {
	const shimmedSource = WORKER_SHIM + workerSource;
	const workerBlob = new Blob([shimmedSource], { type: "text/javascript" });
	const workerUrl = URL.createObjectURL(workerBlob);
	const worker = new Worker(workerUrl);

	// Lazy decompress: the WASM ships gzipped (esbuild plugin) and is gunzipped
	// here on first DuckDB boot. Subsequent boots reuse the cached Uint8Array.
	// `as BlobPart` cast: TS5 strict treats Uint8Array<ArrayBufferLike> as potentially
	// SharedArrayBuffer-backed, which doesn't satisfy BlobPart's ArrayBufferView<ArrayBuffer>.
	// At runtime this is a regular Uint8Array — Blob() accepts it.
	const wasmBytes = getWasmBytes();
	const wasmBlob = new Blob([wasmBytes as BlobPart], { type: "application/wasm" });
	const wasmUrl = URL.createObjectURL(wasmBlob);

	const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
	const db = new duckdb.AsyncDuckDB(logger, worker);

	try {
		await db.instantiate(wasmUrl);
	} catch (err) {
		// On failure, ensure all transient resources are released so the next attempt is clean.
		worker.terminate();
		URL.revokeObjectURL(workerUrl);
		URL.revokeObjectURL(wasmUrl);
		throw err;
	}

	const conn = await db.connect();

	let disposed = false;
	const dispose = async () => {
		if (disposed) return;
		disposed = true;
		// Errors during teardown are logged but never thrown — caller is already mid-cleanup.
		try { await conn.close(); } catch (e) { console.warn("[duckdb] conn.close failed", e); }
		try { await db.terminate(); } catch (e) { console.warn("[duckdb] db.terminate failed", e); }
		try { worker.terminate(); } catch (e) { console.warn("[duckdb] worker.terminate failed", e); }
		URL.revokeObjectURL(workerUrl);
		URL.revokeObjectURL(wasmUrl);
	};

	return { db, conn, worker, dispose };
}
