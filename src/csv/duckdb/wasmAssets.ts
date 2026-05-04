// Static imports of DuckDB-Wasm assets, embedded into main.js by esbuild.
// `*.wasm` is loaded via `loader: { '.wasm': 'binary' }` + a custom esbuild
// plugin (`duckdbWasmGzipPlugin`) that gzips the bytes during the build. The
// raw WASM is ~34MB; gzipped it's ~9-10MB, dropping the bundle from 49MB to
// roughly 24MB (still big, but inside Community Plugins guidance).
//
// `duckdb-browser-eh.worker.js` is loaded via `duckdbWorkerInlinePlugin` that
// re-exports the file content as a string.

import { gunzipSync } from "fflate";

// @ts-expect-error — esbuild loader 'binary' returns Uint8Array at runtime.
import wasmBytesGzipped from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm";
// @ts-expect-error — custom esbuild plugin returns string at runtime.
import workerSourceImport from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js";

let wasmBytesCache: Uint8Array | null = null;

/**
 * Decompress the embedded WASM bytes. Cached after first call so repeated
 * runtime instantiation (e.g. plugin disable/enable cycles in dev) doesn't pay
 * the gunzip cost again. ~10-30ms one-shot on first DuckDB boot.
 */
export function getWasmBytes(): Uint8Array {
	if (wasmBytesCache) return wasmBytesCache;
	wasmBytesCache = gunzipSync(wasmBytesGzipped as Uint8Array);
	return wasmBytesCache;
}

/**
 * Reset the decompression cache. Hot-reload friendly — the plugin module may
 * survive across reloads (see `reference_hot_reload_module_persistence`); call
 * this in `onunload` to release the ~34MB Uint8Array between sessions.
 */
export function clearWasmBytesCache(): void {
	wasmBytesCache = null;
}

export const workerSource: string = workerSourceImport;
