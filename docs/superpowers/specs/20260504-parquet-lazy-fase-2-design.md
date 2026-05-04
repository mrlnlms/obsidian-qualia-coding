# Parquet Lazy — Fase 2: DuckDB-Wasm Bootstrap (Spec)

> Spec implementável. Próximo passo após aprovação é execução inline (mesmo padrão usado na Fase 0). Fase 1 do design doc original foi diferida pra Fase 4 (decisão 2026-05-04).

**Goal:** Levar DuckDB-Wasm pra dentro do plugin `qualia-coding` real, com worker funcional bootando em Electron Obsidian. Entrega infraestrutura compartilhada (não específica de DuckDB) — pattern de Worker via Blob URL com shims é reutilizável pra LLM provider e Whisper futuros.

**Architecture:** Bootstrap factory pure (`createDuckDBRuntime()`) em `src/csv/duckdb/`. WASM bytes + worker source inline no `main.js` via esbuild (loader binary + plugin custom). Lifecycle gerenciado pelo plugin principal (lazy init, cleanup em `onunload`). Interface `RowProvider` esqueleto pra Fase 4 plugar implementação real. Sem consumidores ainda — código adicionado mas não chamado em fluxo do user.

**Tech Stack:** `@duckdb/duckdb-wasm` (~1.32), esbuild loaders, Vitest+jsdom mocks.

**Estimativa:** ~2 sessões.

---

## 1. Contexto autoritativo

Spec deriva de:
- `docs/parquet-lazy-design.md` §3 (stack), §4 (worker mechanics), §6.5 (hot-reload cleanup), §6.6 (mocks jsdom), §6.7 (sem precedente público), §7.4 (módulos novos), §8 Fase 2, §9 #6 (feature flag) + #9 (RowProvider mock strategy), **§14.5.1 (2 shims obrigatórios — descobertos no spike)**
- Spike encerrado: `qualia-spike-duckdb/` no workbench. Boot de WASM + query funcional confirmado em Electron Obsidian. Os 2 shims de §14.5.1 já validados em runtime.

Esta fase **não toca** consumidores existentes. Apenas adiciona código novo em `src/csv/duckdb/`. Comportamento atual do plugin 100% inalterado.

---

## 2. Architecture

### 2.1 Bootstrap factory

```ts
// src/csv/duckdb/duckdbBootstrap.ts
export interface DuckDBRuntime {
  db: AsyncDuckDB;
  conn: AsyncDuckDBConnection;
  worker: Worker;
  dispose: () => Promise<void>;
}

export async function createDuckDBRuntime(): Promise<DuckDBRuntime>;
```

Comportamento:
- Carrega WASM bytes embedded (esbuild loader binary)
- Carrega worker source embedded (custom esbuild plugin)
- Aplica os **2 shims §14.5.1** prepended ao worker source antes de `new Worker(blobUrl)`:
  1. `Object.defineProperty(self, 'process', { value: { type: 'renderer', versions: {}, env: {} } })` — derrota detecção Node falsa do `js-sha256`
  2. `Object.defineProperty(WebAssembly, 'instantiateStreaming', { value: undefined })` — força fallback XHR (Electron Worker sem `Request`/`fetch`)
- Instancia `AsyncDuckDB` + abre conexão
- Retorna runtime com `dispose()` que termina worker, fecha conexão, revoga Blob URLs

### 2.2 RowProvider interface (esqueleto)

```ts
// src/csv/duckdb/rowProvider.ts
export interface RowProvider {
  /** Fetch text content for a marker by sourceRowId + column. */
  getMarkerText(sourceRowId: number, column: string): Promise<string | null>;
  /** Batch fetch for multiple markers in same file (Fase 4 lazy mode). */
  batchGetMarkerText(refs: Array<{ sourceRowId: number; column: string }>): Promise<Map<string, string>>;
  /** Total rows in source. */
  getRowCount(): Promise<number>;
  /** Cleanup. */
  dispose(): Promise<void>;
}
```

Esta fase entrega:
- Interface `RowProvider` declarada
- `MockRowProvider` (in-memory, pra tests)
- ❌ **Não entrega** `DuckDBRowProvider` (impl real). Esse fica pra Fase 4 — onde tem consumer real (CSV grid lazy mode) que usa.

### 2.3 Plugin lifecycle hook

`src/main.ts` ganha:
- Field opcional `private duckdb: DuckDBRuntime | null = null`
- Método `getDuckDB(): Promise<DuckDBRuntime>` (lazy init, primeiro caller booto)
- `onunload()` chama `this.duckdb?.dispose()`

Esta fase **não chama `getDuckDB()` em nenhum fluxo de user** — apenas declara a infra.

### 2.4 Smoke command (gate de validação)

Command palette: `Qualia: DuckDB hello query (smoke)` — disponível só em modo dev (CLAUDE.md: zero usuários). Boota DuckDB e roda `SELECT 42`. Confirma que tudo bootou no plugin real (não só no spike isolado).

Vou deixar comando registrado mesmo em prod — é dev-only de fato porque ninguém vai descobrir. Custo zero. Remove na Fase 6 se incomodar.

---

## 3. File structure

**Arquivos novos:** ~5 + 2 tests. ~400 LOC novo. **Modificações:** 2 arquivos (main.ts + esbuild config).

| Arquivo | LOC | Descrição |
|---|---|---|
| `src/csv/duckdb/duckdbBootstrap.ts` | ~80 | Factory `createDuckDBRuntime()` com 2 shims pre-pended ao worker source |
| `src/csv/duckdb/wasmAssets.ts` | ~10 | Re-exports tipados dos imports estáticos do WASM bytes + worker source |
| `src/csv/duckdb/rowProvider.ts` | ~30 | Interface `RowProvider` + `MockRowProvider` |
| `src/csv/duckdb/index.ts` | ~10 | Barrel re-export |
| `src/main.ts` | ~15 | Field `duckdb` + `getDuckDB()` lazy + `onunload` cleanup + command smoke |
| `esbuild.config.mjs` | ~30 | Adiciona `loader: { '.wasm': 'binary' }` + plugin custom pra inline `duckdb-browser-eh.worker.js` como string |
| `tests/setup.ts` | ~20 | Mock global de `@duckdb/duckdb-wasm` (vi.mock) — retorna stubs de `AsyncDuckDB`/`AsyncDuckDBConnection` |
| `tests/csv/duckdb/duckdbBootstrap.test.ts` | ~80 | Testes do factory: bootstrap retorna runtime válido, dispose limpa, double-dispose é noop |
| `tests/csv/duckdb/rowProvider.test.ts` | ~50 | Testes do `MockRowProvider`: get/batch/count/dispose |

---

## 4. Detalhes da implementação

### 4.1 esbuild config

```js
// esbuild.config.mjs (snippet)
import { readFile } from "node:fs/promises";

const duckdbWorkerInlinePlugin = {
  name: "duckdb-worker-inline",
  setup(build) {
    build.onLoad({ filter: /duckdb-browser-eh\.worker\.js$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      return { contents: `export default ${JSON.stringify(source)};`, loader: "js" };
    });
  },
};

// no build options:
loader: { ".wasm": "binary" },
plugins: [duckdbWorkerInlinePlugin],
```

Resultado: `main.js` cresce de 2.5 MB → ~9 MB (faixa Excalidraw, conforme §3.3 do design).

### 4.2 Bootstrap factory (esqueleto)

```ts
// src/csv/duckdb/duckdbBootstrap.ts
import * as duckdb from "@duckdb/duckdb-wasm";
import { wasmBytes, workerSource } from "./wasmAssets";

export interface DuckDBRuntime {
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
  worker: Worker;
  dispose: () => Promise<void>;
}

export async function createDuckDBRuntime(): Promise<DuckDBRuntime> {
  // §14.5.1 Shim 1+2: process fake + nuke instantiateStreaming
  const shim =
    `try { Object.defineProperty(self, 'process', { value: { type: 'renderer', versions: {}, env: {} }, writable: true, configurable: true }); } catch (e) { try { self.process = undefined; } catch (_) {} }\n` +
    `try { Object.defineProperty(WebAssembly, 'instantiateStreaming', { value: undefined, writable: true, configurable: true }); } catch (e) {}\n`;

  const shimmedSource = shim + workerSource;
  const workerBlob = new Blob([shimmedSource], { type: "text/javascript" });
  const workerUrl = URL.createObjectURL(workerBlob);
  const worker = new Worker(workerUrl);

  const wasmBlob = new Blob([wasmBytes], { type: "application/wasm" });
  const wasmUrl = URL.createObjectURL(wasmBlob);

  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(wasmUrl);
  const conn = await db.connect();

  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    try { await conn.close(); } catch (_) {}
    try { await db.terminate(); } catch (_) {}
    try { worker.terminate(); } catch (_) {}
    URL.revokeObjectURL(wasmUrl);
    URL.revokeObjectURL(workerUrl);
  };

  return { db, conn, worker, dispose };
}
```

### 4.3 Plugin lifecycle

```ts
// src/main.ts (snippet)
private duckdb: DuckDBRuntime | null = null;
private duckdbInitPromise: Promise<DuckDBRuntime> | null = null;

async getDuckDB(): Promise<DuckDBRuntime> {
  if (this.duckdb) return this.duckdb;
  if (this.duckdbInitPromise) return this.duckdbInitPromise;
  this.duckdbInitPromise = createDuckDBRuntime();
  this.duckdb = await this.duckdbInitPromise;
  this.duckdbInitPromise = null;
  return this.duckdb;
}

async onunload() {
  await this.duckdb?.dispose();
  this.duckdb = null;
  this.duckdbInitPromise = null;
  // ... resto do onunload existente
}
```

`getDuckDB()` é lazy — primeiro caller boota. Sem caller (= esta fase), DuckDB nunca instancia. Custo zero em runtime pro user até Fase 4 chegar.

### 4.4 Mocks jsdom (test/setup.ts)

```ts
// tests/setup.ts (adição)
vi.mock("@duckdb/duckdb-wasm", () => ({
  AsyncDuckDB: vi.fn().mockImplementation(() => ({
    instantiate: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ toArray: () => [] }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  })),
  ConsoleLogger: vi.fn(),
  LogLevel: { WARNING: 1 },
  PACKAGE_VERSION: "1.32.0-mock",
}));
```

Estratégia da decisão #9 do §9: jsdom NÃO instancia DuckDB real. Tests usam mock. Suite de integração com DuckDB real ficará pra Fase 6.

---

## 5. Acceptance criteria

- [ ] `npm run build` passa
- [ ] `npm run test` passa (2490+ verde, +N novos da Fase 2)
- [ ] Build artifact (`main.js`) cresce pra ~8-10 MB (compatível com Excalidraw)
- [ ] Em vault workbench, command `Qualia: DuckDB hello query (smoke)` rodando boot do worker + query `SELECT 42 AS answer` retorna sucesso (Notice no Obsidian) — confirma que os 2 shims funcionam dentro do plugin real, não só no spike
- [ ] `onunload` (desabilitar plugin no Settings) limpa worker + revoga URLs (validado por DevTools memory snapshot — opcional, manual)
- [ ] Hot-reload do plugin não vaza (recarregar 3x e verificar tasks no DevTools — opcional, manual)
- [ ] Audit grep: `WebAssembly.instantiateStreaming` em src/ aparece **só** em `duckdbBootstrap.ts` (no shim)

---

## 6. Behavioral guarantees (o que NÃO muda)

- ✅ Comportamento atual do plugin 100% inalterado
- ✅ Nenhum fluxo de user toca DuckDB nesta fase
- ✅ Performance idle (plugin habilitado, sem usar CSV) idêntica — DuckDB é lazy
- ✅ Build dev (watch) não tem regressão notável (esbuild loader binary é instantâneo)
- ✅ Tests existentes (2490) continuam verdes — mock global cobre

---

## 7. Out-of-scope (não tocar nesta fase)

- `DuckDBRowProvider` impl real — Fase 4 (RowProvider lendo de DuckDB)
- OPFS (cópia, leitura partial, namespace hash) — Fase 3
- Integração com `csvCodingView`/Model — Fase 4
- AG Grid Infinite Row Model — Fase 4
- Threshold + feature flag — Fase 4
- Async refactor de `getMarkerText` (era Fase 1) — absorvido na Fase 4 (decisão 2026-05-04)
- Batch coding modal SQL — Fase 5
- QDPX streaming + UI Manage Cache — Fase 6
- Mocks DuckDB-Wasm de integração (suite separado) — Fase 6 (decisão #9 do §9)

---

## 8. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Bundle size (9 MB) impacta load time inicial | Baixo | Baixo | Excalidraw é 8.4 MB, nenhuma reclamação. WASM em cache do disco do Obsidian. |
| Hot-reload memory leak (worker não termina) | Baixo | Baixo | `dispose()` em `onunload`. Spike validou pattern. |
| esbuild loader binary não infla bundle previsivelmente | Baixo | Baixo | Spike confirmou ~33MB de WASM bytes embedded pro spike (sem tree-shake). Plugin usa só EH bundle, fica menor. |
| Imports `*.wasm` quebram tsc | Médio | Baixo | `// @ts-expect-error` ou declaração ambient `*.wasm` em `src/obsidian-internals.d.ts`. |
| Algum teste existente quebra com mock de duckdb-wasm | Baixo | Baixo | Mock só ativa onde duckdb é importado (= zero arquivos hoje). |

---

## 9. Backout strategy

Se algo der ruim:
1. Tudo é arquivo novo em `src/csv/duckdb/` — `git revert` do commit deleta a pasta
2. esbuild config volta ao state anterior
3. main.ts perde 15 LOC do field+lifecycle
4. Bundle volta pra 2.5 MB
5. Comportamento do plugin idêntico ao pré-Fase-2

Sem migração de dados, sem mudança de schema, sem refactor de assinaturas. Backout trivial.

---

## 10. Próximo passo após esta fase

Fase 3: OPFS streaming layer (cópia chunked via Node `fs.createReadStream`, namespace via hash, mtime check). Pré-validado no spike (Premise C — heap Δ = 0 MB, throughput 328 MB/s). Será concentrada em `src/csv/duckdb/opfs.ts` ou similar.
