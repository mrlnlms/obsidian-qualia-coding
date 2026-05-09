# ICR Slice 2 — Hash por source Implementation Plan

> **For agentic workers:** Execução inline (regra do projeto: SDD overkill, sem worktree). TDD por task. Smoke obrigatório no chunk final.

**Goal:** Entregar primitiva de hash por source (SHA-256) + 3 consumers iniciais (markerTextCache invalidation, vault rename/delete sync, QDPX import dedup), tornando a primitiva robusta pra extensões futuras (provenance audit, cross-vault remap, Smart Code cache, backup integrity — todos no `BACKLOG.md > 🧱 ICR — Hash consumers fora do Slice 2`).

**Architecture:** Hash computado lazy on first access via `SubtleCrypto.digest('SHA-256', ...)` sobre bytes do source. Storage em `QualiaData.sourceHashes: Record<fileId, { hash, computedAt, fileSize }>`. Registry stateful (mesmo padrão de `CoderRegistry` / `CodeDefinitionRegistry`) com `addOnMutate` + `toJSON`/`fromJSON`. Vault listeners (`modify`/`rename`/`delete`) mantêm registry consistente; `modify` dispara recompute → se hash mudou, invalida `markerTextCache`. QDPX import dedup busca hash match em registry antes de criar duplicata em `imports/<projectName>/`.

**Tech Stack:** TypeScript strict, `SubtleCrypto.digest` (built-in browser/Node, sem dep nova), Vitest + jsdom (testes — crypto.subtle disponível por default em jsdom 24+).

**Pré-requisitos:**
- Slice 1 ICR mergeado (motor κ texto funcional)
- Vault de teste em `obsidian-plugins-workbench/ICR-test/` com 5 arquivos seed

**Decisões cravadas:**
- Algoritmo: SHA-256 via `crypto.subtle.digest`
- Granularidade: arquivo inteiro
- Storage: `Record<fileId, { hash: string (hex), computedAt: number, fileSize: number }>` em QualiaData
- Trigger compute: lazy on first access via `getOrCompute(fileId)`
- Trigger invalidate: `vault.on('modify')` recomputa; se hash mudou, invalida consumers
- `fileSize` em entry pra debug/diagnostics (não usado pra short-circuit; rehash sempre em modify pra robustez)

**Out of scope (registrado em `BACKLOG.md`):**
- Smart Code cache hash-based invalidation
- Provenance audit field nos markers (snapshot do hash)
- Backup integrity validation
- Cross-vault remap (gateia Fase C)
- Pre-warm de hashes (varrer vault inteiro on plugin load) — otimização futura

---

## File Structure

```
src/core/icr/
  sourceHashTypes.ts           — SourceHashEntry, SourceHashRegistry types
  sourceHashRegistry.ts        — registry classe (compute + storage + listeners)
  computeSourceHash.ts         — função pura SHA-256 (testável independente)

tests/core/icr/
  computeSourceHash.test.ts
  sourceHashRegistry.test.ts
```

**Arquivos modificados:**

```
src/core/types.ts              — sourceHashes?: Record<fileId, SourceHashEntry> em QualiaData
src/main.ts                    — onload: instancia registry + 4 vault listeners
src/csv/csvCodingModel.ts      — invalidateMarkerTextCache(fileId) public method
src/import/qdpxImporter.ts     — extractSource: dedup via hash match
```

---

## Chunk 1 — Primitiva (compute + storage + listeners)

### Task 1: SourceHashEntry types + QualiaData storage

**Files:**
- Create: `src/core/icr/sourceHashTypes.ts`
- Modify: `src/core/types.ts` (add `sourceHashes?` em QualiaData)

- [ ] **Step 1: Write types**

```typescript
// src/core/icr/sourceHashTypes.ts

/** Hash entry per source — armazenado em QualiaData.sourceHashes. */
export interface SourceHashEntry {
	/** SHA-256 do conteúdo binário, hex lowercase. */
	hash: string;
	/** Timestamp ms de quando foi computado. */
	computedAt: number;
	/** Tamanho em bytes — pra debug/diagnostics. Não usado pra short-circuit. */
	fileSize: number;
}
```

- [ ] **Step 2: Add field em QualiaData**

```typescript
// src/core/types.ts (após coders?: ...)
import type { SourceHashEntry } from './icr/sourceHashTypes';

export interface QualiaData {
	// ... existing
	coders?: { coders: Coder[] };
	/** ICR Slice 2 — hash por source (SHA-256). Optional pra round-trip de data antigo. */
	sourceHashes?: Record<string, SourceHashEntry>;
	// visibilityOverrides, ...
}
```

- [ ] **Step 3: Build + test**

`npm run build && npm run test 2>&1 | tail -8`. Expected: build OK, todos testes verde (campo opcional não quebra).

- [ ] **Step 4: Commit**

`~/.claude/scripts/commit.sh "feat(icr): SourceHashEntry types + sourceHashes? em QualiaData"`

---

### Task 2: computeSourceHash função pura

**Files:**
- Create: `src/core/icr/computeSourceHash.ts`
- Test: `tests/core/icr/computeSourceHash.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/computeSourceHash.test.ts
import { describe, it, expect } from 'vitest';
import { computeSourceHash } from '../../../src/core/icr/computeSourceHash';

describe('computeSourceHash', () => {
	it('returns SHA-256 hex string', async () => {
		const buffer = new TextEncoder().encode('hello world').buffer;
		const hash = await computeSourceHash(buffer);
		// SHA-256('hello world') = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
		expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
	});

	it('returns 64-char lowercase hex', async () => {
		const buffer = new TextEncoder().encode('any').buffer;
		const hash = await computeSourceHash(buffer);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('different inputs produce different hashes', async () => {
		const a = await computeSourceHash(new TextEncoder().encode('a').buffer);
		const b = await computeSourceHash(new TextEncoder().encode('b').buffer);
		expect(a).not.toBe(b);
	});

	it('same input produces same hash (deterministic)', async () => {
		const buf = new TextEncoder().encode('repeat me').buffer;
		const h1 = await computeSourceHash(buf);
		const h2 = await computeSourceHash(buf);
		expect(h1).toBe(h2);
	});

	it('handles empty buffer', async () => {
		const empty = new ArrayBuffer(0);
		const hash = await computeSourceHash(empty);
		// SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
		expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
	});
});
```

- [ ] **Step 2: Run test (expect fail)**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/computeSourceHash.ts

/** Computa SHA-256 de um ArrayBuffer, retorna hex lowercase 64-char.
 *  Usa Web Crypto (crypto.subtle.digest) — built-in browser/Node, sem dep. */
export async function computeSourceHash(buffer: ArrayBuffer): Promise<string> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run tests** — expect 5 pass.

- [ ] **Step 5: Commit**

`~/.claude/scripts/commit.sh "feat(icr): computeSourceHash função pura SHA-256 via SubtleCrypto"`

---

### Task 3: SourceHashRegistry classe

**Files:**
- Create: `src/core/icr/sourceHashRegistry.ts`
- Test: `tests/core/icr/sourceHashRegistry.test.ts`

Registry pattern: `Map<fileId, SourceHashEntry>`, `addOnMutate(fn)`, `toJSON`/`fromJSON`. Recebe `vault: Vault` no construct pra resolver `getOrCompute(fileId)`. Métodos:
- `getOrCompute(fileId): Promise<string>` — retorna hash, computa se ausente
- `recompute(fileId): Promise<{ changed: boolean; oldHash?: string; newHash: string }>` — força recompute, retorna se mudou
- `getEntry(fileId): SourceHashEntry | null`
- `setEntry(fileId, entry)` — set direto (usado em rename pra mover entry)
- `removeEntry(fileId)` — usado em delete
- `renameEntry(oldPath, newPath)` — atomic rename
- `addOnMutate(fn: (event: { type: 'compute' | 'recompute' | 'remove' | 'rename'; fileId: string }) => void)`
- `toJSON()` / `static fromJSON(json, vault)`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/sourceHashRegistry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SourceHashRegistry } from '../../../src/core/icr/sourceHashRegistry';

// Mock vault — readBinary returns deterministic buffers per path
function makeMockVault(files: Record<string, string>) {
	return {
		adapter: {
			async readBinary(path: string): Promise<ArrayBuffer> {
				const content = files[path];
				if (content === undefined) throw new Error(`File not found: ${path}`);
				return new TextEncoder().encode(content).buffer;
			},
		},
	} as any;
}

let vault: any;
let registry: SourceHashRegistry;

beforeEach(() => {
	vault = makeMockVault({
		'a.md': 'content A',
		'b.md': 'content B',
		'c.md': 'content A', // same content as a.md → same hash
	});
	registry = new SourceHashRegistry(vault);
});

describe('SourceHashRegistry', () => {
	it('getOrCompute calculates and caches hash on first call', async () => {
		const hash = await registry.getOrCompute('a.md');
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(registry.getEntry('a.md')?.hash).toBe(hash);
	});

	it('getOrCompute returns cached value on subsequent calls', async () => {
		const h1 = await registry.getOrCompute('a.md');
		const t1 = registry.getEntry('a.md')?.computedAt;
		await new Promise(r => setTimeout(r, 5));
		const h2 = await registry.getOrCompute('a.md');
		const t2 = registry.getEntry('a.md')?.computedAt;
		expect(h1).toBe(h2);
		expect(t1).toBe(t2); // not recomputed
	});

	it('different content → different hash', async () => {
		const ha = await registry.getOrCompute('a.md');
		const hb = await registry.getOrCompute('b.md');
		expect(ha).not.toBe(hb);
	});

	it('same content → same hash (different path)', async () => {
		const ha = await registry.getOrCompute('a.md');
		const hc = await registry.getOrCompute('c.md');
		expect(ha).toBe(hc);
	});

	it('recompute forces re-read and reports changed', async () => {
		await registry.getOrCompute('a.md');
		// simulate file change
		vault.adapter.files = { ...vault.adapter.files, 'a.md': 'NEW content' };
		const beforeHash = registry.getEntry('a.md')!.hash;
		// override readBinary to return new content
		const orig = vault.adapter.readBinary;
		vault.adapter.readBinary = async (p: string) => p === 'a.md' ? new TextEncoder().encode('NEW content').buffer : orig(p);
		const result = await registry.recompute('a.md');
		expect(result.changed).toBe(true);
		expect(result.oldHash).toBe(beforeHash);
		expect(result.newHash).not.toBe(beforeHash);
	});

	it('renameEntry moves entry from old path to new path', async () => {
		await registry.getOrCompute('a.md');
		const hash = registry.getEntry('a.md')!.hash;
		registry.renameEntry('a.md', 'a-renamed.md');
		expect(registry.getEntry('a.md')).toBeNull();
		expect(registry.getEntry('a-renamed.md')?.hash).toBe(hash);
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
		const restored = SourceHashRegistry.fromJSON(json, vault);
		expect(restored.getEntry('a.md')?.hash).toBe(registry.getEntry('a.md')?.hash);
		expect(restored.getEntry('b.md')?.hash).toBe(registry.getEntry('b.md')?.hash);
	});

	it('findByHash returns all fileIds with matching hash', async () => {
		await registry.getOrCompute('a.md');
		await registry.getOrCompute('c.md'); // same content
		const ha = registry.getEntry('a.md')!.hash;
		const matches = registry.findByHash(ha);
		expect(matches.sort()).toEqual(['a.md', 'c.md']);
	});

	it('addOnMutate fires on compute/recompute/remove/rename', async () => {
		const events: Array<{ type: string; fileId: string }> = [];
		registry.addOnMutate(e => events.push({ type: e.type, fileId: e.fileId }));
		await registry.getOrCompute('a.md');
		await registry.recompute('a.md');
		registry.renameEntry('a.md', 'a2.md');
		registry.removeEntry('a2.md');
		expect(events.map(e => e.type)).toEqual(['compute', 'recompute', 'rename', 'remove']);
	});
});
```

- [ ] **Step 2: Run test (expect fail)**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/sourceHashRegistry.ts
import type { SourceHashEntry } from './sourceHashTypes';
import { computeSourceHash } from './computeSourceHash';

interface VaultLike {
	adapter: {
		readBinary(path: string): Promise<ArrayBuffer>;
	};
}

export type SourceHashMutationEvent =
	| { type: 'compute'; fileId: string }
	| { type: 'recompute'; fileId: string; oldHash: string; newHash: string }
	| { type: 'remove'; fileId: string }
	| { type: 'rename'; fileId: string; oldFileId: string };

export class SourceHashRegistry {
	private entries: Map<string, SourceHashEntry> = new Map();
	private mutateListeners: Set<(e: SourceHashMutationEvent) => void> = new Set();
	private vault: VaultLike;

	constructor(vault: VaultLike) {
		this.vault = vault;
	}

	private emit(event: SourceHashMutationEvent): void {
		for (const fn of this.mutateListeners) fn(event);
	}

	addOnMutate(fn: (e: SourceHashMutationEvent) => void): void {
		this.mutateListeners.add(fn);
	}

	removeOnMutate(fn: (e: SourceHashMutationEvent) => void): void {
		this.mutateListeners.delete(fn);
	}

	/** Get cached hash, or compute if absent. */
	async getOrCompute(fileId: string): Promise<string> {
		const existing = this.entries.get(fileId);
		if (existing) return existing.hash;
		const buffer = await this.vault.adapter.readBinary(fileId);
		const hash = await computeSourceHash(buffer);
		const entry: SourceHashEntry = { hash, computedAt: Date.now(), fileSize: buffer.byteLength };
		this.entries.set(fileId, entry);
		this.emit({ type: 'compute', fileId });
		return hash;
	}

	/** Force recompute. Returns whether hash changed. */
	async recompute(fileId: string): Promise<{ changed: boolean; oldHash?: string; newHash: string }> {
		const old = this.entries.get(fileId);
		const buffer = await this.vault.adapter.readBinary(fileId);
		const newHash = await computeSourceHash(buffer);
		const newEntry: SourceHashEntry = { hash: newHash, computedAt: Date.now(), fileSize: buffer.byteLength };
		this.entries.set(fileId, newEntry);
		const changed = !old || old.hash !== newHash;
		if (changed && old) {
			this.emit({ type: 'recompute', fileId, oldHash: old.hash, newHash });
		} else if (!old) {
			this.emit({ type: 'compute', fileId });
		}
		return { changed, oldHash: old?.hash, newHash };
	}

	getEntry(fileId: string): SourceHashEntry | null {
		return this.entries.get(fileId) ?? null;
	}

	setEntry(fileId: string, entry: SourceHashEntry): void {
		this.entries.set(fileId, entry);
	}

	removeEntry(fileId: string): void {
		if (this.entries.delete(fileId)) {
			this.emit({ type: 'remove', fileId });
		}
	}

	renameEntry(oldFileId: string, newFileId: string): void {
		const entry = this.entries.get(oldFileId);
		if (!entry) return;
		this.entries.delete(oldFileId);
		this.entries.set(newFileId, entry);
		this.emit({ type: 'rename', fileId: newFileId, oldFileId });
	}

	/** Returns all fileIds with the given hash (used pra dedup). */
	findByHash(hash: string): string[] {
		const result: string[] = [];
		for (const [fileId, entry] of this.entries) {
			if (entry.hash === hash) result.push(fileId);
		}
		return result;
	}

	getAllFileIds(): string[] {
		return Array.from(this.entries.keys());
	}

	toJSON(): Record<string, SourceHashEntry> {
		const obj: Record<string, SourceHashEntry> = {};
		for (const [fileId, entry] of this.entries) obj[fileId] = entry;
		return obj;
	}

	static fromJSON(json: Record<string, SourceHashEntry> | null | undefined, vault: VaultLike): SourceHashRegistry {
		const r = new SourceHashRegistry(vault);
		if (!json) return r;
		for (const [fileId, entry] of Object.entries(json)) {
			r.entries.set(fileId, entry);
		}
		return r;
	}
}
```

- [ ] **Step 4: Run tests** — expect all pass.

- [ ] **Step 5: Commit**

`~/.claude/scripts/commit.sh "feat(icr): SourceHashRegistry — getOrCompute lazy + recompute + rename/remove + findByHash + addOnMutate + toJSON"`

---

### Task 4: Plugin onload integration

**Files:**
- Modify: `src/main.ts` (instanciar registry + listeners + persistir on mutate)

- [ ] **Step 1: Add field + import**

```typescript
// src/main.ts
import { SourceHashRegistry } from './core/icr/sourceHashRegistry';

export default class QualiaCodingPlugin extends Plugin {
	// ... existing
	coderRegistry!: CoderRegistry;
	sourceHashRegistry!: SourceHashRegistry;
	// ...
```

- [ ] **Step 2: Instantiate em onload (após coderRegistry)**

```typescript
// src/main.ts onload, depois do bloco "ICR Coder registry"
// ─── ICR Source Hash registry (Slice 2) ──────────────────
this.sourceHashRegistry = SourceHashRegistry.fromJSON(
	this.dataManager.getDataRef().sourceHashes ?? null,
	this.app.vault,
);
this.sourceHashRegistry.addOnMutate(() => {
	this.dataManager.setSection('sourceHashes', this.sourceHashRegistry.toJSON());
});
```

- [ ] **Step 3: Wire vault listeners** (no mesmo bloco onload, depois do registry):

```typescript
// vault.on('rename') — sync registry
this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
	this.sourceHashRegistry.renameEntry(oldPath, file.path);
}));

// vault.on('delete') — remove entry
this.registerEvent(this.app.vault.on('delete', (file) => {
	this.sourceHashRegistry.removeEntry(file.path);
}));

// vault.on('modify') — recompute + invalidate consumers (Tasks 5-6 wire específicos)
this.registerEvent(this.app.vault.on('modify', async (file) => {
	if (!this.sourceHashRegistry.getEntry(file.path)) return; // não tracked → no-op
	const result = await this.sourceHashRegistry.recompute(file.path);
	if (result.changed) {
		// Invalidate consumers — wired em Tasks 5-6
		this.csvModel?.invalidateMarkerTextCacheForFile(file.path);
	}
}));
```

- [ ] **Step 4: Build + test**

`npm run build && npm run test 2>&1 | tail -8`

- [ ] **Step 5: Commit**

`~/.claude/scripts/commit.sh "feat(icr): integra SourceHashRegistry no plugin onload + 3 vault listeners (rename/delete/modify)"`

---

## Chunk 2 — Consumer 1: markerTextCache invalidation

### Task 5: csvModel.invalidateMarkerTextCacheForFile(fileId)

**Files:**
- Modify: `src/csv/csvCodingModel.ts` (adicionar método público)

Hoje `markerTextCache` invalida só por marker delete. Sem mecanismo pra invalidar quando source muda. Adicionar público método chamado pelo listener `vault.on('modify')` quando hash muda.

- [ ] **Step 1: Localize markerTextCache em csvCodingModel.ts** — `grep -n "markerTextCache" src/csv/csvCodingModel.ts`. Confirma campo Map<markerId, text>.

- [ ] **Step 2: Add public method**

```typescript
// src/csv/csvCodingModel.ts (próximo aos outros métodos de cache)
/** Invalidate cached preview text pra todos markers de um fileId. Chamado por
 *  vault.on('modify') quando hash do source muda — preview pode estar stale.
 *  Markers individuais re-hydratarão lazy on next access. */
public invalidateMarkerTextCacheForFile(fileId: string): void {
	const markers = this.getMarkersForFile(fileId);
	for (const m of markers) {
		this.markerTextCache.delete(m.id);
	}
}
```

- [ ] **Step 3: Verify wire em main.ts** — Task 4 já wirea a chamada `this.csvModel?.invalidateMarkerTextCacheForFile(file.path)` no listener modify.

- [ ] **Step 4: Build + test**

`npm run build && npm run test 2>&1 | tail -8`

- [ ] **Step 5: Manual test** — popular hash entry pra arquivo CSV, modificar arquivo externo, verificar que cache foi invalidado:

(Ficará no Task 8 smoke — não cabe automated test pq exige edição external de arquivo)

- [ ] **Step 6: Commit**

`~/.claude/scripts/commit.sh "feat(icr): csvModel.invalidateMarkerTextCacheForFile(fileId) — chamado por vault.on('modify') quando hash muda"`

---

## Chunk 3 — Consumer 2: vault listeners já wired no Task 4

(Tasks 4 e 5 já entregaram os 3 listeners + a integração com markerTextCache. Não há Task 6 separada — o escopo do Consumer 2 — sync de sourceHashes em rename/delete — é coberto pelos 2 listeners do Task 4 step 3.)

> **Nota:** o plano original tinha Task 6 separada pra "rename detection". Após análise, sync via `renameEntry` + `removeEntry` cobre o caso. **Detect rename "manual"** (delete + create externo via filesystem) é caso edge fora do escopo Slice 2 — entry no registry é removida em delete, próximo create vai compute hash novo sem associar ao antigo. Vai pro `BACKLOG.md` se virar problema real.

---

## Chunk 4 — Consumer 3: QDPX import dedup

### Task 6: extractSource — dedup via hash match

**Files:**
- Modify: `src/import/qdpxImporter.ts` (função extractSource)

Hoje `extractSource` cria arquivo em `imports/${projectName}/<filename>`. Adicionar: antes de criar, calcular hash do source no QDPX (lendo bytes do zip entry), buscar match no `sourceHashRegistry.findByHash(hash)`. Se encontrar fileId existente no vault → usar esse path em vez de criar duplicata.

- [ ] **Step 1: Localize extractSource** — `grep -n "function extractSource\|async function extractSource" src/import/qdpxImporter.ts`

- [ ] **Step 2: Read function signature pra entender input**

`sed -n '<lineN>,<lineN+50>p' src/import/qdpxImporter.ts` (substituir lineN pelo número achado).

- [ ] **Step 3: Modify extractSource pra dedup**

Pseudo (adapt pra signature real):

```typescript
async function extractSource(
	src: SourceXml, files: ZipFiles, vault: Vault, importDir: string, keepOriginal: boolean,
	sourceHashRegistry?: SourceHashRegistry, // NEW param
): Promise<string | null> {
	const zipEntry = files[src.path];
	if (!zipEntry) return null;
	const buffer = await zipEntry.async('arraybuffer');

	// Dedup: check if any tracked source has same hash
	if (sourceHashRegistry) {
		const incomingHash = await computeSourceHash(buffer);
		const matches = sourceHashRegistry.findByHash(incomingHash);
		if (matches.length > 0) {
			// Reuse existing source — return first match path
			return matches[0]!;
		}
	}

	// ... existing path: create file in importDir
	const targetPath = `${importDir}/${src.name}`;
	await vault.adapter.writeBinary(targetPath, buffer);
	// Register hash pro novo source (se registry passed)
	if (sourceHashRegistry) {
		await sourceHashRegistry.getOrCompute(targetPath);
	}
	return targetPath;
}
```

- [ ] **Step 4: Pass registry from caller** — encontrar callsite de `extractSource` em `importQdpx`/`previewQdpx`, passar `plugin.sourceHashRegistry`.

- [ ] **Step 5: Build + test**

`npm run build && npm run test 2>&1 | tail -8`

- [ ] **Step 6: Commit**

`~/.claude/scripts/commit.sh "feat(icr): QDPX import dedup — extractSource reusa source existente quando hash bate (em vez de criar duplicata em imports/)"`

---

## Chunk 5 — Smoke + closing

### Task 7: Tests integration + smoke real

**Files:** none new

- [ ] **Step 1: Run full test suite** — `npm run test 2>&1 | tail -8`. Expected: 2876+ verde (com novos testes de hash).

- [ ] **Step 2: Build production** — `npm run build`. Expected: OK.

- [ ] **Step 3: Reload Obsidian no vault `obsidian-plugins-workbench`**

Verificações:
- Console limpo (sem erros)
- `plugin.sourceHashRegistry.getAllFileIds()` no console DevTools

```js
const plugin = app.plugins.plugins['qualia-coding'];
console.log('Source hashes:', plugin.sourceHashRegistry.getAllFileIds());

// Open ICR-test/ICR-survey.csv (já tem markers seeded), trigger lazy compute:
const file = app.vault.getAbstractFileByPath('ICR-test/ICR-survey.csv');
plugin.sourceHashRegistry.getOrCompute('ICR-test/ICR-survey.csv').then(h => console.log('CSV hash:', h));

// Wait ~1s, then:
console.log('Entry:', plugin.sourceHashRegistry.getEntry('ICR-test/ICR-survey.csv'));
```

- [ ] **Step 4: Smoke test rename**

No Obsidian: rename `ICR-test/ICR-survey.csv` → `ICR-test/ICR-survey-renamed.csv`. Console deve mostrar:

```js
console.log('Old path entry:', plugin.sourceHashRegistry.getEntry('ICR-test/ICR-survey.csv')); // null
console.log('New path entry:', plugin.sourceHashRegistry.getEntry('ICR-test/ICR-survey-renamed.csv')); // entry presente, mesmo hash
```

Renomear de volta pra preservar seed.

- [ ] **Step 5: Smoke test modify**

Editar `ICR-test/ICR-entrevista-1.md` (adicionar 1 char), salvar. Console deve mostrar entry recomputed (computedAt mais recente, hash diferente). markerTextCache pros markers desse arquivo deve ter sido invalidado (verificar via `plugin.csvModel` se aplicar — markdown não tem markerTextCache; teste real é com CSV).

- [ ] **Step 6: Update CHANGELOG.md**

Adicionar parágrafo sob ICR Slice 1:

```
**ICR Slice 2 — Hash por source (2026-05-09)** — branch `feat/icr-slice-2-hash-source`. Primitiva SHA-256 via SubtleCrypto + SourceHashRegistry com getOrCompute lazy + recompute + findByHash + addOnMutate. 3 vault listeners (rename/delete/modify) mantêm registry consistente. Consumer 1: markerTextCache invalidation when source hash changes externally. Consumer 2: rename detection sincroniza fileId. Consumer 3: QDPX import dedup reusa source existente (não cria duplicata em imports/<projectName>/) quando hash match. Out of scope (registrado em BACKLOG.md): Smart Code cache, provenance audit, backup integrity, cross-vault remap.
```

- [ ] **Step 7: Final commit + merge**

```bash
~/.claude/scripts/commit.sh "test(icr): slice 2 hash por source smoke-testado em vault real"
git checkout main
git tag pre-icr-slice-2-baseline <previous-main-HEAD>
git merge feat/icr-slice-2-hash-source --ff-only
git tag post-icr-slice-2-checkpoint HEAD
git push origin main pre-icr-slice-2-baseline post-icr-slice-2-checkpoint
git branch -d feat/icr-slice-2-hash-source
```

---

## Success Criteria

Slice 2 está done quando:

1. ✅ `computeSourceHash` retorna SHA-256 hex correto (test vector `'hello world'` bate com b94d...)
2. ✅ `SourceHashRegistry` lazy compute + recompute + rename/remove + findByHash + toJSON round-trip
3. ✅ Plugin onload instancia registry + 3 listeners
4. ✅ `npm run test` verde (2876+)
5. ✅ `npm run build` OK
6. ✅ Smoke real:
   - Console mostra `sourceHashRegistry` populado on demand
   - Rename arquivo no Obsidian → entry move pro novo path
   - Modify arquivo → entry recomputed + markerTextCache invalidated
   - QDPX import com source repetido → reusa em vez de duplicar (testar manualmente)

## Não-objetivos (Slice 2)

Já registrados em `BACKLOG.md > 🧱 ICR — Hash consumers fora do Slice 2`:
- Smart Code cache hash invalidation
- Provenance audit field nos markers
- Backup integrity validation
- Cross-vault remap (gateia Fase C)
- Pre-warm de hashes (varrer vault inteiro on plugin load)

## Próximo passo após Slice 2

Decisão de produto:
- Brainstorm UX View Compare Coders + Reconciliação (gates of slices subsequentes Fase B)
- Adapter cod row (categórico, simples)
- Adapter áudio/vídeo (overlap temporal ms — caminho conhecido)
- Adapter PDF shape + imagem (terreno aberto, brainstorm metodológico precede)
- Cross-vault remap (gateia Fase C)
