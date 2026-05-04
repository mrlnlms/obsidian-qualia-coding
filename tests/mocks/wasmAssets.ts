// Vitest stub for src/csv/duckdb/wasmAssets — the real file relies on esbuild
// loaders (`.wasm` → binary, `.worker.js` → custom plugin) which vitest doesn't
// run. Aliased via `vitest.config.ts` so any test that transitively imports
// the duckdb stack (e.g. via the export pipeline) doesn't crash on the .wasm
// extension.
export function getWasmBytes(): Uint8Array {
	return new Uint8Array(0);
}
export function clearWasmBytesCache(): void { /* no-op */ }
export const workerSource = '';
