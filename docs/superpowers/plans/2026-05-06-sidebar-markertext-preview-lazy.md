# Sidebar markerText preview pra arquivos lazy — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar/Code Explorer/Code Detail/Smart Codes/Memo View mostram preview de texto dos markers em arquivos lazy ainda não hidratados, sem mudar contrato síncrono dos consumers nem forçar IO no startup.

**Architecture:** Orchestrator stateful (`MarkerPreviewHydrator`) é a única autoridade que decide quando popular o `markerTextCache` em modo lazy. Consumers que renderizam markers cross-file chamam `requestHydration(fileId)` per-file. Re-render via `csvModel.notifyListenersOnly()` debounced via RAF. Status indicator é canal próprio (`onStatusChange`).

**Tech Stack:** TypeScript, Obsidian Plugin API, Vitest+jsdom, DuckDB-Wasm (via existing infra), OPFS, Fabric (não tocada nesse plan).

**Spec autoritativa:** `docs/superpowers/specs/20260506-sidebar-markertext-preview-lazy-design.md` (rev 3, 3 iterações de review).

**Constraints (CLAUDE.md project + memories):**
- Sem worktree neste projeto. Trabalhar em branch direta.
- Default execução inline (SDD overkill aqui).
- Auto-cleanup pós-task: merge pra main, push, sem perguntar.
- Smoke obrigatório a cada chunk em vault real (`/Users/mosx/Desktop/obsidian-plugins-workbench/`, parquet 297MB pra cold start cenário).
- Não criar helper single-call gambiarra (helper só se reusado 3+x ou encapsula complexidade não-trivial).
- Settings via `dataManager.section('csv').settings` — NÃO criar setting novo (`parquetSizeWarningMB`/`csvSizeWarningMB` já existem).

**File Structure (alto nível):**

```
src/csv/
├── markerPreviewHydrator.ts       (NOVO — orchestrator)
├── csvCodingModel.ts              (MODIFY — add getLazyProvider)
└── prepopulateMarkerCaches.ts     (MODIFY — chama markSeen após popular)

src/main.ts                        (MODIFY — instancia + dispose hydrator)

src/core/
├── baseCodeExplorerView.ts        (MODIFY — dispatch + status indicator)
└── detailCodeRenderer.ts          (MODIFY — dispatch on render markers byFile)

src/core/smartCodes/
├── smartCodeListModal.ts          (MODIFY — dispatch + status indicator)
└── detailSmartCodeRenderer.ts     (MODIFY — dispatch on groupedByFile iter)

src/analytics/views/modes/memoView/
├── memoViewMode.ts                (MODIFY — dispatch on byCode sections render)
└── renderMarkerCard.ts            (potential touch — confirm in Slice 3)

tests/csv/
└── markerPreviewHydrator.test.ts  (NOVO — unit tests)
```

---

## Chunk 1: MarkerPreviewHydrator standalone

Slice 1 do spec. Cria o orchestrator + getter no model + unit tests. Sem integração ainda — independente, valida lógica isolada.

### Task 1.1: Add `getLazyProvider` getter no `csvCodingModel`

**Files:**
- Modify: `src/csv/csvCodingModel.ts` (add getter público após `unregisterLazyProvider` — linha 487)
- Test: `tests/engine-models/csvCodingModel.test.ts` (add test pro getter)

- [ ] **Step 1: Write failing test pro getter**

Adicionar em `tests/engine-models/csvCodingModel.test.ts`, dentro do describe relevante de lazy providers (procurar bloco que testa `registerLazyProvider`):

```typescript
it('getLazyProvider returns registered provider; undefined when not registered', () => {
  const fakeProvider = {} as RowProvider;
  expect(model.getLazyProvider('fake.parquet')).toBeUndefined();
  model.registerLazyProvider('fake.parquet', fakeProvider);
  expect(model.getLazyProvider('fake.parquet')).toBe(fakeProvider);
  model.unregisterLazyProvider('fake.parquet');
  expect(model.getLazyProvider('fake.parquet')).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine-models/csvCodingModel.test.ts -t "getLazyProvider returns"
```
Expected: FAIL com `model.getLazyProvider is not a function`.

- [ ] **Step 3: Add getter no model**

Em `src/csv/csvCodingModel.ts`, após `unregisterLazyProvider` (linha 488):

```typescript
/**
 * Returns the live RowProvider for a file open in lazy mode, if any. The provider
 * is "borrow, not own" — caller must NOT dispose it. Invariant: csvCodingView.onClose
 * removes the entry from the Map BEFORE awaiting dispose (csvCodingView.ts:772),
 * so this getter never returns a disposed provider. Note: provider may transition to
 * disposed mid-batch if the user closes the tab — caller should treat thrown errors
 * from operations on returned provider as a normal error path (retry next time).
 */
getLazyProvider(fileId: string): RowProvider | undefined {
  return this.lazyProviders.get(fileId);
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run tests/engine-models/csvCodingModel.test.ts -t "getLazyProvider returns"
```
Expected: PASS.

- [ ] **Step 5: Run full suite — sanity check no regression**

```bash
npx vitest run
```
Expected: 2793+ passed (current baseline + 1 novo).

- [ ] **Step 6: Commit**

```bash
git add src/csv/csvCodingModel.ts tests/engine-models/csvCodingModel.test.ts
~/.claude/scripts/commit.sh "feat(csv): add getLazyProvider getter pro hydrator reusar provider ativo"
```

---

### Task 1.2: Criar `MarkerPreviewHydrator` com types + estrutura básica

**Files:**
- Create: `src/csv/markerPreviewHydrator.ts`
- Test: `tests/csv/markerPreviewHydrator.test.ts`

- [ ] **Step 1: Criar o test file com setup mínimo + um teste failing**

Criar `tests/csv/markerPreviewHydrator.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarkerPreviewHydrator } from '../../src/csv/markerPreviewHydrator';

// Mocks pra plugin + csvModel — só os methods que o hydrator usa.
function createMockPlugin(opts: { fileSize?: number; ext?: string } = {}) {
  const stat = { size: opts.fileSize ?? 200 * 1024 * 1024, mtime: 1 };
  const af: any = { extension: opts.ext ?? 'parquet', stat };
  return {
    app: {
      vault: {
        getAbstractFileByPath: vi.fn(() => af),
      },
    },
    dataManager: {
      section: vi.fn(() => ({ settings: { parquetSizeWarningMB: 50, csvSizeWarningMB: 100 } })),
    },
    getDuckDB: vi.fn(),
  } as any;
}

function createMockCsvModel() {
  return {
    getLazyProvider: vi.fn(),
    populateMissingMarkerTextsForFile: vi.fn().mockResolvedValue(0),
    notifyListenersOnly: vi.fn(),
  } as any;
}

// Stub TFile.instanceof pra mock funcionar em jsdom — já é pattern em outros tests
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<any>('obsidian');
  return { ...actual, TFile: class TFile { stat: any; extension: string } };
});

describe('MarkerPreviewHydrator construction', () => {
  it('starts with empty status', () => {
    const plugin = createMockPlugin();
    const csvModel = createMockCsvModel();
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);
    const status = hydrator.getStatus();
    expect(status).toEqual({ inflightCount: 0, totalSeen: 0, completedCount: 0 });
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
npx vitest run tests/csv/markerPreviewHydrator.test.ts
```
Expected: FAIL com `Cannot find module '../../src/csv/markerPreviewHydrator'`.

- [ ] **Step 3: Criar o módulo com skeleton mínimo pra test passar**

Criar `src/csv/markerPreviewHydrator.ts`:

```typescript
/**
 * MarkerPreviewHydrator — orchestrator stateful que popula `csvModel.markerTextCache`
 * em background pra arquivos lazy ainda não hidratados.
 *
 * Trigger: consumers (Code Explorer, Code Detail, Smart Code list/detail, Memo View)
 * chamam `requestHydration(fileId)` per-file durante render. Hydrator dedupe via
 * `seen: Set<fileId>` e `inflight: Map<fileId, Promise>`.
 *
 * Re-render: ao completar batch com `addedCount > 0`, chama
 * `csvModel.notifyListenersOnly()` debounced via RAF — pattern existente.
 *
 * Status indicator: canal próprio via `onStatusChange` (UI separada do markerText).
 *
 * Spec: docs/superpowers/specs/20260506-sidebar-markertext-preview-lazy-design.md
 */

import { TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { CsvCodingModel } from './csvCodingModel';
import { DuckDBRowProvider, isOpfsCached, openOPFSFile, opfsKeyFor, type TabularFileType } from './duckdb';

export interface HydrationOutcome {
  fileId: string;
  status: 'success' | 'error' | 'skipped';
  reason?: string;
  addedCount?: number;
}

export interface HydrationStatus {
  inflightCount: number;
  totalSeen: number;
  completedCount: number;
}

const DISPOSE_TIMEOUT_MS = 5000;

export class MarkerPreviewHydrator {
  private seen = new Set<string>();
  private inflight = new Map<string, Promise<HydrationOutcome>>();
  private errors = new Map<string, string>();
  private statusListeners = new Set<(s: HydrationStatus) => void>();
  private notifyScheduled: number | null = null;
  private disposed = false;

  constructor(
    private plugin: QualiaCodingPlugin,
    private csvModel: CsvCodingModel,
  ) {}

  getStatus(): HydrationStatus {
    return {
      inflightCount: this.inflight.size,
      totalSeen: this.seen.size + this.inflight.size,
      completedCount: this.seen.size,
    };
  }

  onStatusChange(listener: (s: HydrationStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  markSeen(fileId: string): void {
    this.seen.add(fileId);
    this.emitStatus();
  }

  reset(): void {
    this.seen.clear();
    this.errors.clear();
    this.emitStatus();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.notifyScheduled !== null) {
      cancelAnimationFrame(this.notifyScheduled);
      this.notifyScheduled = null;
    }
    if (this.inflight.size > 0) {
      const all = Promise.all(this.inflight.values());
      const timeout = new Promise<void>(resolve => setTimeout(resolve, DISPOSE_TIMEOUT_MS));
      await Promise.race([all, timeout]);
      if (this.inflight.size > 0) {
        console.warn('[markerPreviewHydrator] dispose timed out — abandoning', this.inflight.size, 'inflight batches');
      }
    }
    this.statusListeners.clear();
  }

  requestHydration(fileId: string): Promise<HydrationOutcome> {
    if (this.disposed) {
      return Promise.resolve({ fileId, status: 'skipped', reason: 'disposed' });
    }
    if (this.seen.has(fileId)) {
      return Promise.resolve({ fileId, status: 'skipped', reason: 'already seen' });
    }
    const existing = this.inflight.get(fileId);
    if (existing) return existing;

    const promise = this.runBatch(fileId);
    this.inflight.set(fileId, promise);
    this.emitStatus();
    return promise;
  }

  private async runBatch(fileId: string): Promise<HydrationOutcome> {
    let outcome: HydrationOutcome;
    try {
      if (!this.isLazyFile(fileId)) {
        outcome = { fileId, status: 'skipped', reason: 'eager mode' };
        this.seen.add(fileId);
      } else {
        outcome = await this.runLazyBatch(fileId);
        if (outcome.status !== 'error') this.seen.add(fileId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errors.set(fileId, msg);
      outcome = { fileId, status: 'error', reason: msg };
    } finally {
      this.inflight.delete(fileId);
      this.emitStatus();
    }
    if (outcome.status === 'success' && (outcome.addedCount ?? 0) > 0) {
      this.scheduleNotify();
    }
    return outcome;
  }

  private async runLazyBatch(fileId: string): Promise<HydrationOutcome> {
    // Provider reuse — encurtar janela entre getLazyProvider e populate.
    const existing = this.csvModel.getLazyProvider(fileId);
    if (existing) {
      const added = await this.csvModel.populateMissingMarkerTextsForFile(fileId, existing);
      return { fileId, status: added > 0 ? 'success' : 'skipped', reason: added === 0 ? 'no rows matched markers' : undefined, addedCount: added };
    }

    // Hydrator-owned provider path.
    const af = this.plugin.app.vault.getAbstractFileByPath(fileId);
    if (!(af instanceof TFile)) {
      return { fileId, status: 'skipped', reason: 'file missing' };
    }
    const ext = af.extension;
    if (ext !== 'csv' && ext !== 'parquet') {
      return { fileId, status: 'skipped', reason: 'not tabular' };
    }
    const vaultId = (this.plugin.app.vault as unknown as { getName: () => string }).getName?.() ?? 'default';
    const opfsKey = opfsKeyFor(vaultId, fileId);
    const cached = await isOpfsCached(opfsKey, af.stat.mtime).catch(() => false);
    let handle: FileSystemFileHandle;
    if (cached) {
      handle = await openOPFSFile(opfsKey);
    } else {
      // Fora do prepopulate semantic: download forçado quando hydrator é triggered
      // por consumer real (não startup). Aceitável — user já está vendo placeholder
      // de coordenada, espera preview chegar.
      handle = await openOPFSFile(opfsKey); // openOPFSFile lida com download se não cached — verificar se isso bate com a impl atual; senão, ajustar
    }
    const runtime = await this.plugin.getDuckDB();
    const fileType: TabularFileType = ext === 'parquet' ? 'parquet' : 'csv';
    const provider = await DuckDBRowProvider.create({ runtime, fileHandle: handle, fileType });
    try {
      const added = await this.csvModel.populateMissingMarkerTextsForFile(fileId, provider);
      return { fileId, status: added > 0 ? 'success' : 'skipped', reason: added === 0 ? 'no rows matched markers' : undefined, addedCount: added };
    } finally {
      await provider.dispose().catch(() => undefined);
    }
  }

  private isLazyFile(fileId: string): boolean {
    const af = this.plugin.app.vault.getAbstractFileByPath(fileId);
    if (!(af instanceof TFile)) return false;
    const ext = af.extension;
    if (ext !== 'csv' && ext !== 'parquet') return false;
    const settings = (this.plugin.dataManager.section('csv') as { settings?: { parquetSizeWarningMB?: number; csvSizeWarningMB?: number } }).settings ?? {};
    const thresholdMB = ext === 'parquet'
      ? (settings.parquetSizeWarningMB ?? 50)
      : (settings.csvSizeWarningMB ?? 100);
    return af.stat.size > thresholdMB * 1024 * 1024;
  }

  private scheduleNotify(): void {
    if (this.notifyScheduled !== null) return;
    this.notifyScheduled = requestAnimationFrame(() => {
      this.notifyScheduled = null;
      if (!this.disposed) this.csvModel.notifyListenersOnly();
    });
  }

  private emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.statusListeners) listener(status);
  }
}
```

⚠️ **Importante:** verificar `openOPFSFile(opfsKey)` semantic — se não existe download path automático, ler `src/csv/duckdb/` pra entender API correta de "abrir handle baixando se preciso". Spec assume cold path baixa quando hydrator dispara; ajustar o código acima conforme API real.

- [ ] **Step 4: Run test — verify PASS**

```bash
npx vitest run tests/csv/markerPreviewHydrator.test.ts
```
Expected: PASS (`starts with empty status`).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/csv/markerPreviewHydrator.ts tests/csv/markerPreviewHydrator.test.ts
~/.claude/scripts/commit.sh "feat(csv): MarkerPreviewHydrator skeleton — types + status getters + dispose"
```

---

### Task 1.3: Test idempotência + dedup inflight

**Files:**
- Modify: `tests/csv/markerPreviewHydrator.test.ts`

- [ ] **Step 1: Add failing tests pra idempotência**

Adicionar ao test file:

```typescript
describe('MarkerPreviewHydrator.requestHydration idempotência', () => {
  it('chamadas concorrentes pra mesmo fileId produzem 1 batch', async () => {
    const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
    const csvModel = createMockCsvModel();
    csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(3);
    csvModel.getLazyProvider.mockReturnValue({} as any); // file aberto, reusa
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

    const [r1, r2, r3] = await Promise.all([
      hydrator.requestHydration('a.parquet'),
      hydrator.requestHydration('a.parquet'),
      hydrator.requestHydration('a.parquet'),
    ]);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(csvModel.populateMissingMarkerTextsForFile).toHaveBeenCalledTimes(1);
  });

  it('após sucesso, marca seen e próxima chamada retorna skipped', async () => {
    const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
    const csvModel = createMockCsvModel();
    csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(2);
    csvModel.getLazyProvider.mockReturnValue({} as any);
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

    const first = await hydrator.requestHydration('a.parquet');
    expect(first.status).toBe('success');

    const second = await hydrator.requestHydration('a.parquet');
    expect(second.status).toBe('skipped');
    expect(second.reason).toBe('already seen');
    expect(csvModel.populateMissingMarkerTextsForFile).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — verify PASS** (skeleton já cobre essa lógica)

```bash
npx vitest run tests/csv/markerPreviewHydrator.test.ts -t "idempotência"
```
Expected: ambos PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/csv/markerPreviewHydrator.test.ts
~/.claude/scripts/commit.sh "test(csv): hydrator dedup inflight + seen marca após success"
```

---

### Task 1.4: Test skip eager + skip empty + error retry

**Files:**
- Modify: `tests/csv/markerPreviewHydrator.test.ts`

- [ ] **Step 1: Add failing tests**

```typescript
describe('MarkerPreviewHydrator skip + error', () => {
  it('skipa eager mode (file < threshold)', async () => {
    const plugin = createMockPlugin({ fileSize: 10 * 1024 * 1024 }); // 10MB < 50MB threshold
    const csvModel = createMockCsvModel();
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

    const result = await hydrator.requestHydration('small.parquet');
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('eager mode');
    expect(csvModel.populateMissingMarkerTextsForFile).not.toHaveBeenCalled();
  });

  it('skipa quando addedCount === 0 (parquet sem matches)', async () => {
    const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
    const csvModel = createMockCsvModel();
    csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(0);
    csvModel.getLazyProvider.mockReturnValue({} as any);
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

    const result = await hydrator.requestHydration('empty.parquet');
    expect(result.status).toBe('skipped');
    expect(result.addedCount).toBe(0);

    // Marca seen (não retenta)
    const second = await hydrator.requestHydration('empty.parquet');
    expect(second.reason).toBe('already seen');
  });

  it('error NÃO marca seen — próxima retenta', async () => {
    const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
    const csvModel = createMockCsvModel();
    csvModel.populateMissingMarkerTextsForFile.mockRejectedValueOnce(new Error('parse failed'));
    csvModel.getLazyProvider.mockReturnValue({} as any);
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

    const first = await hydrator.requestHydration('bad.parquet');
    expect(first.status).toBe('error');
    expect(first.reason).toContain('parse failed');

    // Próxima retenta — desta vez succeeds
    csvModel.populateMissingMarkerTextsForFile.mockResolvedValueOnce(2);
    const second = await hydrator.requestHydration('bad.parquet');
    expect(second.status).toBe('success');
    expect(csvModel.populateMissingMarkerTextsForFile).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run — PASS**

```bash
npx vitest run tests/csv/markerPreviewHydrator.test.ts
```
Expected: todos passam.

- [ ] **Step 3: Commit**

```bash
git add tests/csv/markerPreviewHydrator.test.ts
~/.claude/scripts/commit.sh "test(csv): hydrator skip eager/empty + error retry"
```

---

### Task 1.5: Test provider reuse — não cria nem dispose quando file aberto

**Files:**
- Modify: `tests/csv/markerPreviewHydrator.test.ts`

- [ ] **Step 1: Add failing test**

```typescript
describe('MarkerPreviewHydrator provider reuse', () => {
  it('reusa provider de getLazyProvider, não cria, não chama dispose', async () => {
    const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
    const csvModel = createMockCsvModel();
    const existingProvider = { dispose: vi.fn() };
    csvModel.getLazyProvider.mockReturnValue(existingProvider);
    csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(2);
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

    const result = await hydrator.requestHydration('open.parquet');
    expect(result.status).toBe('success');
    expect(csvModel.populateMissingMarkerTextsForFile).toHaveBeenCalledWith('open.parquet', existingProvider);
    expect(existingProvider.dispose).not.toHaveBeenCalled();
    expect(plugin.getDuckDB).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — PASS**

```bash
npx vitest run tests/csv/markerPreviewHydrator.test.ts -t "reusa provider"
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/csv/markerPreviewHydrator.test.ts
~/.claude/scripts/commit.sh "test(csv): hydrator reusa provider ativo sem disposar"
```

---

### Task 1.6: Test status listeners + RAF coalescing

**Files:**
- Modify: `tests/csv/markerPreviewHydrator.test.ts`

- [ ] **Step 1: Add failing tests + RAF mock**

Adicionar no início do file (após imports):

```typescript
// RAF mock — testa coalescing sem timer real
let rafCallback: FrameRequestCallback | null = null;
beforeEach(() => {
  rafCallback = null;
  global.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    rafCallback = cb;
    return 1;
  });
  global.cancelAnimationFrame = vi.fn();
});

function flushRaf() {
  if (rafCallback) {
    const cb = rafCallback;
    rafCallback = null;
    cb(0);
  }
}
```

E adicionar testes:

```typescript
describe('MarkerPreviewHydrator status + notify coalescing', () => {
  it('dispara onStatusChange a cada inflight start/complete', async () => {
    const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
    const csvModel = createMockCsvModel();
    csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(1);
    csvModel.getLazyProvider.mockReturnValue({} as any);
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

    const statuses: any[] = [];
    hydrator.onStatusChange(s => statuses.push({ ...s }));

    await hydrator.requestHydration('a.parquet');
    expect(statuses.length).toBeGreaterThanOrEqual(2);
    expect(statuses[0].inflightCount).toBe(1);
    expect(statuses[statuses.length - 1].inflightCount).toBe(0);
  });

  it('coalesce 3 batches concorrentes em 1 notifyListenersOnly via RAF', async () => {
    const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
    const csvModel = createMockCsvModel();
    csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(2);
    csvModel.getLazyProvider.mockReturnValue({} as any);
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

    await Promise.all([
      hydrator.requestHydration('a.parquet'),
      hydrator.requestHydration('b.parquet'),
      hydrator.requestHydration('c.parquet'),
    ]);
    // Não chamou notify direto — RAF agendou
    expect(csvModel.notifyListenersOnly).not.toHaveBeenCalled();

    flushRaf();
    expect(csvModel.notifyListenersOnly).toHaveBeenCalledTimes(1);
  });

  it('markSeen pula batch e dispara status', () => {
    const plugin = createMockPlugin();
    const csvModel = createMockCsvModel();
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);
    const statuses: any[] = [];
    hydrator.onStatusChange(s => statuses.push({ ...s }));

    hydrator.markSeen('pre.parquet');
    expect(hydrator.getStatus().completedCount).toBe(1);
    expect(statuses).toContainEqual(expect.objectContaining({ completedCount: 1 }));
  });
});
```

- [ ] **Step 2: Run — PASS**

```bash
npx vitest run tests/csv/markerPreviewHydrator.test.ts
```
Expected: todos passam.

- [ ] **Step 3: Commit**

```bash
git add tests/csv/markerPreviewHydrator.test.ts
~/.claude/scripts/commit.sh "test(csv): hydrator onStatusChange + RAF coalescing + markSeen"
```

---

### Task 1.7: Test dispose timeout + RAF cleanup

**Files:**
- Modify: `tests/csv/markerPreviewHydrator.test.ts`

- [ ] **Step 1: Add failing test pra dispose**

```typescript
describe('MarkerPreviewHydrator dispose', () => {
  it('cancela RAF pending', async () => {
    const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
    const csvModel = createMockCsvModel();
    csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(2);
    csvModel.getLazyProvider.mockReturnValue({} as any);
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

    await hydrator.requestHydration('a.parquet');
    // Notify agendado mas não flushed
    expect(csvModel.notifyListenersOnly).not.toHaveBeenCalled();

    await hydrator.dispose();
    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('rejeita novas requests após disposed', async () => {
    const plugin = createMockPlugin();
    const csvModel = createMockCsvModel();
    const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

    await hydrator.dispose();
    const result = await hydrator.requestHydration('a.parquet');
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('disposed');
  });
});
```

- [ ] **Step 2: Run — PASS**

```bash
npx vitest run tests/csv/markerPreviewHydrator.test.ts
```
Expected: todos passam.

- [ ] **Step 3: Run full suite — sanity**

```bash
npx vitest run
```
Expected: 2793+ passed (baseline + novos).

- [ ] **Step 4: Typecheck final**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add tests/csv/markerPreviewHydrator.test.ts
~/.claude/scripts/commit.sh "test(csv): hydrator dispose cancela RAF + rejeita novas requests"
```

---

### Task 1.8: Build + dispatch plan-document-reviewer (chunk 1 review)

- [ ] **Step 1: Build production**

```bash
npm run build
```
Expected: tsc + esbuild sem erros.

- [ ] **Step 2: Plan-reviewer pra Chunk 1**

Dispatchar `general-purpose` agent com prompt:
> Review do Chunk 1 do plan em `docs/superpowers/plans/2026-05-06-sidebar-markertext-preview-lazy.md`. Spec autoritativa em `docs/superpowers/specs/20260506-sidebar-markertext-preview-lazy-design.md`. Verifique: (a) tasks são bite-sized e independentes; (b) cada task tem write-test → fail → impl → pass → commit; (c) tests cobrem decisões do spec (idempotência, skip eager/empty, error retry, provider reuse, RAF coalescing, dispose); (d) caminho do `openOPFSFile` está correto contra `src/csv/duckdb/` real; (e) não há helper single-call gambiarra introduzido. Reporta blockers/suggestions.

- [ ] **Step 3: Resolver feedback do reviewer**

Edits + re-dispatch até approved.

---

## Chunk 2: Integração no BaseCodeExplorerView

Slice 2 do spec. Primeiro consumer integrado, validação do cenário primário (cold start).

### Task 2.1: Instanciar hydrator no `Plugin.onload` + dispose no `onunload`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Adicionar import + field**

Em `src/main.ts`, after csv imports, importar:
```typescript
import { MarkerPreviewHydrator } from './csv/markerPreviewHydrator';
```

Adicionar field na classe (próximo dos outros models):
```typescript
markerPreviewHydrator!: MarkerPreviewHydrator;
```

- [ ] **Step 2: Instanciar no `onload` após csvModel + dataManager**

Procurar local onde `csvModel` é instanciado. Após:
```typescript
this.markerPreviewHydrator = new MarkerPreviewHydrator(this, this.csvModel);
```

- [ ] **Step 3: Dispose no `onunload` ANTES do duckdb dispose**

Em `src/main.ts:823+`, antes do `this.duckdb?.dispose()` (linha 826):
```typescript
await this.markerPreviewHydrator?.dispose();
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```
Expected: pass.

- [ ] **Step 6: Build**

```bash
npm run build
```
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
~/.claude/scripts/commit.sh "feat(main): instancia MarkerPreviewHydrator no onload + dispose no onunload"
```

---

### Task 2.2: Dispatch `requestHydration` no `BaseCodeExplorerView.buildCodeIndex`

**Files:**
- Modify: `src/core/baseCodeExplorerView.ts`

- [ ] **Step 1: Identificar plugin reference no view**

Verificar como `BaseCodeExplorerView` acessa o plugin. Provavelmente via `this.plugin` ou via `this.app` + cast. Olhar:
```bash
grep -n "this.plugin\|plugin:\|Plugin" src/core/baseCodeExplorerView.ts | head -5
```

Se já existe `this.plugin: QualiaCodingPlugin`, OK. Se não, precisa receber via constructor (mudança maior — abordar com cuidado, conferir que callsites todos passam).

- [ ] **Step 2: Adicionar dispatch dentro de `buildCodeIndex`**

Em `src/core/baseCodeExplorerView.ts:184` (dentro do for loop), antes de iterar markers:

```typescript
for (const fileId of this.model.getAllFileIds()) {
  // Dispatch hidratação per-file (idempotente — hydrator dedupe via seen + inflight)
  this.plugin.markerPreviewHydrator?.requestHydration(fileId);

  const markers = this.model.getMarkersForFile(fileId);
  // ... resto
}
```

(`?.` pra defensive em caso de shutdown — pode tirar se o field for `!:`.)

⚠️ Confirmar com grep se `this.plugin` está disponível ou se precisa pegar via `this.model.dataManager.plugin` (cast). Se o último, ajustar.

- [ ] **Step 3: Smoke test no Obsidian — cold start**

⚠️ **STOP — smoke obrigatório a cada chunk** (CLAUDE.md TOP PRIORITY). Sem smoke, chunk não fecha.

1. Build: `npm run build`
2. Reload Obsidian (vault `/Users/mosx/Desktop/obsidian-plugins-workbench/`)
3. Pré-condição: parquet 297MB com markers (já existe no vault de teste). Limpar `markerTextCache` rodando script:
```bash
# Pra limpar cache em memória, basta reload — markerTextCache vive na sessão
```
Se OPFS já tem cópia fresca, prepopulate vai popular antes de Code Explorer abrir. Pra testar cold path real: deletar OPFS via DevTools (Application → Storage → Origin Private File System → clear) ANTES do reload.

4. Abrir Obsidian. Esperar onLayoutReady passar (prepopulate roda).
5. Abrir Code Explorer (sidebar do plugin).
6. Validar:
   - Code Explorer abre instantâneo.
   - Console log mostra hydrator dispatch (adicionar log temporário se necessário).
   - Markers do parquet 297MB aparecem com placeholder de coordenada (`Row N · column`).
   - Aguardar 5-30s — placeholder vira texto inline (sem refresh manual).

- [ ] **Step 4: Capturar evidência do smoke**

Screenshot ou descrição em comment do commit. **Se o preview NÃO atualiza**, debugar antes de seguir — pode ser que `notifyListenersOnly` não dispara onChange dos consumers, ou `markerToBase` não é re-chamado.

- [ ] **Step 5: Commit**

```bash
git add src/core/baseCodeExplorerView.ts
~/.claude/scripts/commit.sh "feat(core): BaseCodeExplorerView dispara requestHydration per-file na render"
```

---

### Task 2.3: Status indicator no header do Code Explorer

**Files:**
- Modify: `src/core/baseCodeExplorerView.ts`
- Modify: `styles.css`

- [ ] **Step 1: Adicionar field + setup no `onOpen`**

Em `BaseCodeExplorerView.onOpen` (linha 96), adicionar subscribe:

```typescript
// Status indicator do hydrator
this.hydratorStatusEl = this.contentEl.createDiv({ cls: 'qc-hydration-status' });
this.hydratorStatusEl.style.display = 'none';
this.hydratorUnsubscribe = this.plugin.markerPreviewHydrator?.onStatusChange((s) => {
  if (s.inflightCount === 0) {
    this.hydratorStatusEl.style.display = 'none';
    return;
  }
  this.hydratorStatusEl.style.display = '';
  this.hydratorStatusEl.setText(`Hidratando previews… ${s.completedCount}/${s.totalSeen}`);
});
this.register(() => this.hydratorUnsubscribe?.());
```

Field declarations no topo da classe:
```typescript
private hydratorStatusEl!: HTMLElement;
private hydratorUnsubscribe?: () => void;
```

⚠️ Posicionamento do `hydratorStatusEl` no DOM — pode precisar reorganizar pra ficar no header e não no fim do contentEl. Confirmar layout existente do view.

- [ ] **Step 2: CSS**

Em `styles.css` (procurar zona de Code Explorer):

```css
.qc-hydration-status {
  font-size: 0.85em;
  color: var(--text-muted);
  padding: 4px 8px;
  font-style: italic;
}
```

- [ ] **Step 3: Smoke**

1. Build + reload.
2. Cold start cenário (mesmo de 2.2).
3. Validar:
   - Indicator aparece com "Hidratando previews… X/Y".
   - Number atualiza conforme batches completam.
   - Indicator some quando inflightCount === 0.

- [ ] **Step 4: Commit**

```bash
git add src/core/baseCodeExplorerView.ts styles.css
~/.claude/scripts/commit.sh "feat(core): status indicator hidratação no Code Explorer header"
```

---

### Task 2.4: `prepopulateMarkerCaches` chama `markSeen` após popular

**Files:**
- Modify: `src/csv/prepopulateMarkerCaches.ts`

- [ ] **Step 1: Add markSeen calls**

Em `src/csv/prepopulateMarkerCaches.ts`:

Eager path (linha ~78, após o for loop que cacheia markers de um file eager):
```typescript
plugin.markerPreviewHydrator?.markSeen(fileId);
```

Lazy path (linha ~99, após `populateMissingMarkerTextsForFile`):
```typescript
if (added > 0) plugin.markerPreviewHydrator?.markSeen(fileId);
```

(Nota: pra eager o markSeen também faz sentido — se cache populated, não precisa hydrator rodar batch.)

- [ ] **Step 2: Test (já é integration — smoke valida)**

- [ ] **Step 3: Smoke (validação combinada)**

1. Build + reload com OPFS já tendo o parquet (não cold).
2. prepopulate roda no startup, popula cache, chama markSeen.
3. Abrir Code Explorer.
4. Validar:
   - `requestHydration` é chamado mas retorna `skipped: 'already seen'`.
   - Sidebar mostra texto direto (cache populated, sem batch novo).
   - Console NÃO mostra novo boot DuckDB.

- [ ] **Step 4: Commit**

```bash
git add src/csv/prepopulateMarkerCaches.ts
~/.claude/scripts/commit.sh "feat(csv): prepopulateMarkerCaches marca seen no hydrator pós-populate"
```

---

### Task 2.5: Plan-reviewer pra Chunk 2

- [ ] **Step 1: Dispatch reviewer**

Mesma estrutura do 1.8. Foco: integração entry points corretos, smoke-checkpoints presentes, race condition no hot reload.

- [ ] **Step 2: Resolver feedback**

---

## Chunk 3: Outros consumers

Slice 3 do spec. Estende pra Code Detail, Smart Codes, Memo View.

### Task 3.1: Dispatch no `detailCodeRenderer.ts`

**Files:**
- Modify: `src/core/detailCodeRenderer.ts`

- [ ] **Step 1: Adicionar callback no `Callbacks` interface**

Em `src/core/detailCodeRenderer.ts:316` (onde itera `for (const [fileId, markers] of byFile)`), antes do loop:

Estender `Callbacks` (linha ~25-30) com:
```typescript
onFileRendered?: (fileId: string) => void;
```

E dentro do for loop:
```typescript
for (const [fileId, markers] of byFile) {
  callbacks.onFileRendered?.(fileId);
  // ... resto existente
}
```

- [ ] **Step 2: Wire callback no `BaseCodeDetailView`**

Em `BaseCodeDetailView` onde `renderCodeDetail` é invocado (linha 1197+):
```typescript
renderCodeDetail(container, this.codeId, this.model, {
  // ... callbacks existentes
  onFileRendered: (fileId) => this.plugin.markerPreviewHydrator?.requestHydration(fileId),
});
```

Aplicar idem em `renderRelationDetail` (1262) — `detailRelationRenderer` precisa do mesmo callback.

- [ ] **Step 3: Espelhar no `detailRelationRenderer`**

Em `src/core/detailRelationRenderer.ts:274` (onde itera evidence rows com `m.fileId`), adicionar `onFileRendered` callback similar e wire no callsite.

⚠️ Confirmar que `detailRelationRenderer` itera por fileId único OU por marker individual. Se é per-marker (não agrupado), agregar fileIds em Set local antes de chamar callback (1x por fileId, não N).

- [ ] **Step 4: Test (integration via callsite mock)**

Adicionar test em `tests/core/detailCodeRenderer.test.ts` (criar se não existe):
```typescript
it('chama onFileRendered uma vez por fileId único', () => {
  const onFileRendered = vi.fn();
  // ... setup com markers em 3 files
  renderCodeDetail(container, codeId, model, { ..., onFileRendered });
  expect(onFileRendered).toHaveBeenCalledTimes(3);
});
```

- [ ] **Step 5: Smoke**

1. Build + reload.
2. Cold start (OPFS limpo).
3. Abrir Code Detail clicando num code com markers em parquet lazy.
4. Validar: previews aparecem progressivamente; status indicator visível também no Code Detail header.

- [ ] **Step 6: Commit**

```bash
git add src/core/detailCodeRenderer.ts src/core/detailRelationRenderer.ts src/core/baseCodeDetailView.ts tests/core/detailCodeRenderer.test.ts
~/.claude/scripts/commit.sh "feat(core): Code Detail dispara hydration via onFileRendered callback"
```

---

### Task 3.2: Dispatch no `detailSmartCodeRenderer`

**Files:**
- Modify: `src/core/smartCodes/detailSmartCodeRenderer.ts`

- [ ] **Step 1: Adicionar callback + dispatch**

Em linha 205 (`for (const [fileId, refs] of groupedByFile)`), aplicar mesmo pattern de Task 3.1:

Estender `opts` interface com `onFileRendered?: (fileId: string) => void` e:
```typescript
for (const [fileId, refs] of groupedByFile) {
  opts.onFileRendered?.(fileId);
  // ... existente
}
```

Wire em `renderSmartCodeDetail` callsite no `BaseCodeDetailView:1289`.

- [ ] **Step 2: Smoke**

1. Build + reload.
2. Cold start, abrir Smart Code que matcha markers em parquet lazy.
3. Validar previews + indicator.

- [ ] **Step 3: Commit**

```bash
git add src/core/smartCodes/detailSmartCodeRenderer.ts src/core/baseCodeDetailView.ts
~/.claude/scripts/commit.sh "feat(smartcodes): detailSmartCodeRenderer dispara hydration por fileId"
```

---

### Task 3.3: Dispatch no `smartCodeListModal`

**Files:**
- Modify: `src/core/smartCodes/smartCodeListModal.ts`

- [ ] **Step 1: Identificar entry point**

```bash
grep -n "fileId\|getMarkersForFile\|onOpen\|render" src/core/smartCodes/smartCodeListModal.ts | head -10
```

Localizar onde modal renderiza listagem de smart codes / matches. Adicionar dispatch per-fileId quando modal expande matches.

- [ ] **Step 2: Plug no plugin field**

Modal já recebe deps via cfg — pode adicionar `markerPreviewHydrator` ao `SmartCodeListModalConfig`.

- [ ] **Step 3: Smoke + commit**

```bash
git add src/core/smartCodes/smartCodeListModal.ts src/main.ts
~/.claude/scripts/commit.sh "feat(smartcodes): SmartCodeListModal dispara hydration por fileId"
```

---

### Task 3.4: Dispatch no Memo View by-code mode

**Files:**
- Modify: `src/analytics/views/modes/memoView/memoViewMode.ts` (ou `renderMarkerCard.ts`)

- [ ] **Step 1: Identificar onde markers são renderizados em by-code mode**

```bash
grep -n "byCode\|markerMemos\|fileId" src/analytics/views/modes/memoView/memoViewMode.ts | head -10
```

`memoViewMode.ts:60` itera `byCode` sections com markers. `renderMarkerCard.ts:19` cada marker tem `entry.fileId`.

Estratégia: agregar fileIds únicos das sections num Set, despachar 1x cada.

- [ ] **Step 2: Implementar dispatch agregado**

Adicionar no `memoViewMode.ts` (provável local de orchestration):
```typescript
const fileIdsSeen = new Set<string>();
for (const sec of result.byCode ?? []) {
  for (const mm of sec.markerMemos) {
    if (fileIdsSeen.has(mm.fileId)) continue;
    fileIdsSeen.add(mm.fileId);
    plugin.markerPreviewHydrator?.requestHydration(mm.fileId);
  }
}
```

⚠️ Confirmar que plugin é acessível nesse mode. Se não, propagar via context (`AnalyticsViewContext`).

- [ ] **Step 3: Smoke**

1. Build + reload.
2. Cold start, abrir Analytics → Memo View → by-code mode com markers em parquet lazy.
3. Validar previews preenchem.

- [ ] **Step 4: Commit**

```bash
git add src/analytics/views/modes/memoView/memoViewMode.ts
~/.claude/scripts/commit.sh "feat(analytics): Memo View by-code dispara hydration por fileId"
```

---

### Task 3.5: Plan-reviewer + smoke combinado

- [ ] **Step 1: Smoke matriz completa**

Validar cada cenário do spec §"Smoke checkpoints":
1. Cold start (já validado em chunks anteriores) ✓
2. QDPX import no meio da sessão (importer dispara `csvModel.reload` → onChange → re-render → hydrator)
3. Provider reuse (file aberto + Code Explorer)
4. Eager file (smoke negativo — confirma que hydrator skipa)
5. Falha por arquivo corrompido
6. Cmd+R hot reload no meio do batch

- [ ] **Step 2: Dispatch reviewer**

Foco: cobertura completa dos consumers (sem deixar buraco), wire de plugin field consistente, callbacks naming não-conflitante.

- [ ] **Step 3: Resolver feedback**

---

## Chunk 4: Command "Rebuild marker preview cache" (opcional)

Slice 4 do spec. Decidir após Chunk 3 smoke se vale. Se nenhum smoke revelar caso edge precisando de retry manual, **pular**.

### Task 4.1: Add command palette

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Adicionar command no `addCommands` (ou similar)**

```typescript
this.addCommand({
  id: 'rebuild-marker-preview-cache',
  name: 'Rebuild marker preview cache',
  callback: () => {
    this.markerPreviewHydrator?.reset();
    new Notice('Marker preview cache reset — previews vão re-hidratar conforme você navegar.');
  },
});
```

- [ ] **Step 2: Smoke**

Manual test: cmd+P → "Rebuild marker preview cache" → confirma notice + previews ficam vazios → re-aparecem ao re-render.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
~/.claude/scripts/commit.sh "feat(main): command palette pra rebuild marker preview cache"
```

---

## Final wrap-up

- [ ] **Smoke matriz completa** validada (Chunk 3 Task 3.5).
- [ ] **Documentação atualizada:**
  - `docs/BACKLOG.md` — marcar `Coding em modo lazy: ... Sidebar markerText preview pendente` como ✅ FEITO 2026-05-06.
  - `docs/ARCHITECTURE.md` — adicionar §"MarkerPreviewHydrator" na seção CSV/parquet lazy.
  - `docs/TECHNICAL-PATTERNS.md` — adicionar §"Lazy hydration via render-trigger" com pattern documentado.
  - `CLAUDE.md` — adicionar `markerPreviewHydrator` na lista de identifiers.
  - `CHANGELOG.md` — entrada `[Unreleased] §Added: Sidebar markerText preview lazy`.

- [ ] **Tag de fase** opcional pra rollback rápido se algo passar batido em smoke:
  ```bash
  git tag pre-hydrator-baseline <last-commit-before-feat>
  git tag post-hydrator-checkpoint HEAD
  git push origin pre-hydrator-baseline post-hydrator-checkpoint
  ```

- [ ] **Push final pra main:**
  ```bash
  git push origin main
  ```

- [ ] **Arquivar plan + spec** após user confirmar:
  - Mover `docs/superpowers/specs/20260506-...` e `docs/superpowers/plans/2026-05-06-...` pra `plugin-docs/archive/claude_sources/{specs,plans}/` (workspace externo).
  - `git rm` dos originais + commit `chore: arquiva spec/plan da hydration feature`.
