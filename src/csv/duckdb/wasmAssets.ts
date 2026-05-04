// Static imports of DuckDB-Wasm assets, embedded into main.js by esbuild.
// `*.wasm` is loaded via `loader: { '.wasm': 'binary' }` → Uint8Array.
// `duckdb-browser-eh.worker.js` is loaded via custom esbuild plugin
// (see esbuild.config.mjs) that re-exports the file content as a string.

// @ts-expect-error — esbuild loader 'binary' returns Uint8Array at runtime.
import wasmBytesImport from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm";
// @ts-expect-error — custom esbuild plugin returns string at runtime.
import workerSourceImport from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js";

export const wasmBytes: Uint8Array = wasmBytesImport;
export const workerSource: string = workerSourceImport;
