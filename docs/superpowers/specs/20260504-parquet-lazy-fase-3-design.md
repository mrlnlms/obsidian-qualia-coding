# Parquet Lazy — Fase 3: OPFS Streaming Layer (Spec)

> Spec curta. Premise C do spike (2026-05-03) já validou empiricamente: heap Δ = 0 MB durante cópia de 387.5 MB, throughput 328 MB/s, `BROWSER_FSACCESS` lendo do OPFS funcional em Electron Obsidian Worker.

**Goal:** Adicionar layer que copia arquivos do vault pro OPFS via streaming chunked (Node `fs.createReadStream` → `FileSystemWritableFileStream`) sem materializar o arquivo na heap. Concentra a complexidade de OPFS num módulo isolado pra Fase 4 consumir.

**Architecture:** Módulo `src/csv/duckdb/opfs.ts` com 4 funções puras + testes. Sem consumer nesta fase — apenas adiciona infraestrutura. Em Fase 4, o `RowProvider` real chama `copyVaultFileToOPFS()` antes de `registerFileHandle()` no DuckDB.

**Estimativa:** ~1.5 sessões (menos que os 2 previstos no design original — o spike já fez o trabalho de descoberta).

---

## 1. Contexto autoritativo

- `docs/parquet-lazy-design.md` §4 (OPFS sync mechanics), §6.3 (cleanup heurístico), §6.9 (cold start memory peak), §14.4 (spike findings empíricos), §7.4 (módulos novos)
- Spike: cópia de CSV 387.5 MB validou pico de RAM = 0 MB delta; ~1.18s; 328 MB/s.

---

## 2. API contract

```ts
// src/csv/duckdb/opfs.ts

/** Build a stable OPFS namespace for a vault file (resolves Windows long-path > 260 chars). */
export function opfsKeyFor(vaultId: string, filePath: string): string;

/**
 * Copy `vault → OPFS` in 1 MB chunks via Node fs streaming. Idempotent — if the
 * OPFS file already exists with matching mtime, returns immediately.
 *
 * @param absVaultPath  Absolute filesystem path (use FileSystemAdapter.getFullPath)
 * @param opfsKey       Result of opfsKeyFor()
 * @param mtime         File modification time. If the OPFS copy carries the same
 *                      mtime in its metadata, copy is skipped.
 * @param onProgress    Optional progress callback (bytesWritten, bytesTotal).
 * @returns FileSystemFileHandle ready for DuckDB BROWSER_FSACCESS registration.
 */
export async function copyVaultFileToOPFS(
  absVaultPath: string,
  opfsKey: string,
  mtime: number,
  onProgress?: (bytesWritten: number, bytesTotal: number) => void,
): Promise<FileSystemFileHandle>;

/**
 * Get the OPFS handle for an already-copied file. Throws if not present.
 * Use this when the caller knows the file was copied earlier in the session.
 */
export async function openOPFSFile(opfsKey: string): Promise<FileSystemFileHandle>;

/**
 * Remove a single OPFS-cached file by key. No-op if missing.
 * Used when a vault file is deleted or renamed.
 */
export async function removeOPFSFile(opfsKey: string): Promise<void>;

/**
 * Wipe the entire qualia OPFS namespace. Used on plugin disable (heuristic
 * detection in `onunload`) and via a manual command "Clear lazy cache".
 */
export async function clearOPFSCache(): Promise<{ removed: number }>;
```

### 2.1 OPFS layout

```
navigator.storage root
└── qualia-coding/
    ├── <hash1>/
    │   ├── data.bin          ← actual file content
    │   └── meta.json         ← { mtime: number, originalPath: string }
    └── <hash2>/...
```

Hash = SHA-1 truncated to 16 hex chars of `${vaultId}::${filePath}`. Avoids long-path issues on Windows; collision probability negligible at this scale.

### 2.2 mtime invalidation

`copyVaultFileToOPFS()` reads `meta.json`. If `meta.mtime === requested mtime`, skip copy and return existing handle. Else, overwrite both `data.bin` and `meta.json`. Caller passes the vault file's `stat.mtime` (from `TFile.stat.mtime` or `fs.statSync()`).

---

## 3. File structure

| Arquivo | LOC | Descrição |
|---|---|---|
| `src/csv/duckdb/opfs.ts` | ~150 | 4 funções públicas + helpers privados (sha1 hash, OPFS dir traversal) |
| `tests/csv/duckdb/opfs.test.ts` | ~150 | Mock `navigator.storage` + Node `fs` streams; cobre copy, mtime skip, remove, clear, namespace stability |

**Modificações:** zero. Sem consumer ainda.

---

## 4. Behavioral guarantees

- ✅ Zero impacto em fluxos existentes (módulo isolado, sem caller)
- ✅ Plugin onload/onunload inalterado nesta fase (cleanup hook entra na Fase 6 quando flag default ON)
- ✅ Bundle size: +~5 KB de código, sem impact em main.js (já em 49 MB)
- ✅ Tests existentes (2506) seguem verdes — mock OPFS adicional não interfere

---

## 5. Acceptance criteria

- [ ] `npm run build` passa
- [ ] `npm run test` passa (2506+ verdes; +N novos da Fase 3)
- [ ] Audit: nenhum import de `opfs.ts` fora de `src/csv/duckdb/` ou tests
- [ ] sha1 hashing determinístico (mesmos inputs → mesmo key)
- [ ] mtime skip funciona (segunda call com mesmo mtime não escreve)
- [ ] Memory regression: pico de heap durante test de cópia simulada bounded ao chunk size

---

## 6. Out-of-scope

- Integração com `RowProvider` real / DuckDB `registerFileHandle` — Fase 4
- Detecção automática de plugin disable + clear cache — Fase 6 (UI Manage Cache)
- Progress bar UI integration — Fase 6
- Quota exceeded handling com user prompt — Fase 6
- Multi-vault simultâneo — fora do design (ZERO USUÁRIOS, single vault)

---

## 7. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `navigator.storage.getDirectory` indisponível em alguns Electron versions | Baixo | Alto | Spike validou em Obsidian atual. Fallback: `throw` com mensagem clara — caller decide. |
| Node `fs.createReadStream` em Electron renderer bloqueia em alguma future Obsidian release | Baixo | Médio | Documentar dependência. Re-validar no upgrade de Obsidian. |
| Hash colisão em 16 hex chars (~64 bits) | Negligível | Médio | Single user, ~10-100 files. P(colisão) < 10⁻¹⁵. |
| Cópia parcial corrompida (crash mid-write) | Médio | Médio | `meta.json` escrito DEPOIS de `data.bin` close. Crash → meta.json não existe → próxima abertura re-copia. |

---

## 8. Backout

Tudo é arquivo novo em `src/csv/duckdb/opfs.ts` + test. `git revert` deleta. Sem consumer = sem impact.
