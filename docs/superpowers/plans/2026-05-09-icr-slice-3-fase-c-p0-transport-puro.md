# ICR Slice 3 — Fase C P0 (transport puro multi-coder) Implementation Plan

> **For agentic workers:** Execução inline (regra do projeto: SDD overkill, sem worktree). TDD por task. Smoke obrigatório no chunk final via script (sem UI).

**Goal:** Entregar **funções puras** de transport multi-coder remoto: `extractCoderContribution(data, coderId)` exporta payload JSON com markers + memos + codes referenciados + sources com hash + codebook hash. `mergeCoderContribution(localData, payload, hashRegistry)` aplica payload no vault local com **cross-vault remap embutido** (lookup hash de cada source → remapeia fileId quando paths divergem). Sem UI — testável via script `test-cross-vault-merge.mjs`.

**Architecture:** Payload format JSON versionado (`version: '1.0'`). Codebook hash via canonical serialization (sort determinístico de codes/groups/smartCodes). `extract` filtra markers por `codedBy` em todos engines text-likes (markdown + PDF text + CSV cod segment), inclui codes referenciados + sources com hash + memos do coder + entry do coder. `merge` faz: (a) verifica codebook divergence, emite warning se hash diverge; (b) registra coder se não existir local; (c) faz cross-vault remap por hash dos sources; (d) cria codes faltantes; (e) insere markers; (f) merge memos com policy "incoming wins + warning". Política de colisão: caller decide via `conflicts: ConflictRecord[]`.

**Tech Stack:** TypeScript strict, sem deps novas (reusa `computeSourceHash`, `SourceHashRegistry`, `CoderRegistry`, `MemoRecord`). Node script pra smoke (não exige Obsidian aberto).

**Pré-requisitos:**
- Slice 1 (motor κ + CoderRegistry + codedBy schema) ✅
- Slice 2 (SourceHashRegistry) ✅

**Decisões cravadas:**
- Engines cobertos: text-likes apenas (markdown + PDF text + CSV cod segment) — alinhado com Slice 1
- Payload format: JSON `version: '1.0'` com schema versionado
- Codebook hash: SHA-256 sobre serialização canônica (sort por id) de `{ codes, groups, smartCodes }`
- Cross-vault remap: match único → silencioso; múltiplos matches → primeiro path por sort + warning; zero matches → marker "pending source" + warning
- Codebook divergence: warning estruturado, **não bloqueia** merge (UX layer decide)
- Code-level merge: codebook **assumido shared by design** (premissa do design ICR). Se incoming code não existe local, cria com mesmo id+name. Se existe com mesmo id mas conteúdo diferente, **incoming wins + warning** (caller decide se rebaja)
- Memo merge: incoming memo wins se diferente do local + warning (caller decide)
- Coder: se incoming coder não existe local registry, cria com display name do payload

**Out of scope (Fase C P1, registrado em `BACKLOG.md > 🧱 ICR — Fase C P1 (UX layer, fora do Slice 3)`):**
- Comando/menu pra exportar
- Modal preview de import
- Side-by-side compare + cherry-pick
- Conflict resolution UX
- Multi-import staging
- Codebook divergence resolution UX
- Source divergente alert (hash não bate)
- Engines não-texto (audio, video, image, pdf shape, csv row) — slice de extensão

---

## File Structure

```
src/core/icr/transport/
  payloadTypes.ts                — Payload, PayloadV1, ConflictRecord, ExtractResult, MergeResult types
  computeCodebookHash.ts         — função pura — SHA-256 sobre canonical serialization
  extractCoderContribution.ts    — função pura — data + coderId → Payload
  mergeCoderContribution.ts      — função pura — localData + payload + hashRegistry → MergeResult
  crossVaultRemap.ts             — função pura — markers + payloadSources + localRegistry → remappedMarkers + warnings

tests/core/icr/transport/
  computeCodebookHash.test.ts
  extractCoderContribution.test.ts
  crossVaultRemap.test.ts
  mergeCoderContribution.test.ts

scripts/
  test-cross-vault-merge.mjs     — smoke script: cria 2 vaults sintéticos, exporta de A, importa em B, verifica
```

**Arquivos modificados:**

```
src/main.ts                      — expõe plugin.icrTransport = { extract, merge } pra console/script (chamável)
```

---

## Chunk 1 — Payload format + codebook hash

### Task 1: Payload types

**Files:**
- Create: `src/core/icr/transport/payloadTypes.ts`

- [ ] **Step 1: Write types**

```typescript
// src/core/icr/transport/payloadTypes.ts
import type { CodeDefinition, GroupDefinition, FolderDefinition } from '../../types';
import type { Coder } from '../coderTypes';
import type { Marker } from '../../../markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../../pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../../csv/csvCodingTypes';
import type { MemoRecord } from '../../memoTypes';

/** Payload version 1.0 — first draft Fase C P0. */
export interface PayloadV1 {
	version: '1.0';
	/** SHA-256 do codebook (codes + groups + smartCodes ids) ao momento do export. */
	codebookVersion: string;
	/** Coder full entry — incluído pra registry caso não exista local. */
	coder: Coder;
	/** Map fileId → hash + fileSize. Pro cross-vault remap. */
	sources: Record<string, { hash: string; fileSize?: number }>;
	/** Codes referenciados pelos markers — incluídos pra resolução local. */
	codes: CodeDefinition[];
	/** Groups referenciados — opcional, incluído pra completude. */
	groups?: GroupDefinition[];
	/** Folders referenciados — opcional. */
	folders?: FolderDefinition[];
	/** Markers do coder, agrupados por engine text-like. */
	markers: {
		markdown: Record<string, Marker[]>;
		pdf: PdfMarker[];
		csvSegment: SegmentMarker[];
	};
	/** Memos editados pelo coder — opcional. Memos em codes/groups/markers/relations. */
	memos?: {
		codes?: Record<string, MemoRecord>;
		groups?: Record<string, MemoRecord>;
	};
	exportedAt: number;
}

export type Payload = PayloadV1;

/** Conflict record — emitido por mergeCoderContribution pra caller resolver. */
export type ConflictRecord =
	| { kind: 'codebook_diverged'; localHash: string; payloadHash: string }
	| { kind: 'source_hash_mismatch'; fileId: string; localHash: string; payloadHash: string }
	| { kind: 'source_not_found'; fileId: string; payloadHash: string }
	| { kind: 'multiple_hash_matches'; payloadFileId: string; localFileIds: string[]; chosenFileId: string }
	| { kind: 'code_overwritten'; codeId: string; field: 'name' | 'color' | 'description' | 'memo'; from: string; to: string }
	| { kind: 'memo_overwritten'; entityType: 'code' | 'group'; entityId: string; from: string; to: string };

/** Result types. */
export interface ExtractResult {
	payload: Payload;
	warnings: string[];
}

export interface MergeResult {
	added: { markers: number; codes: number; groups: number; coder: boolean };
	conflicts: ConflictRecord[];
	warnings: string[];
	/** Map payloadFileId → localFileId após cross-vault remap. */
	fileIdRemap: Record<string, string>;
	/** Markers que ficaram sem source local (pending). */
	pendingMarkers: number;
}
```

- [ ] **Step 2: Build + test**

`npm run build && npm run test 2>&1 | tail -8`. Expected: build OK.

- [ ] **Step 3: Commit**

`~/.claude/scripts/commit.sh "feat(icr): payload types pra transport multi-coder (PayloadV1, ConflictRecord, MergeResult)"`

---

### Task 2: computeCodebookHash função pura

**Files:**
- Create: `src/core/icr/transport/computeCodebookHash.ts`
- Test: `tests/core/icr/transport/computeCodebookHash.test.ts`

Canonical serialization: sort por id, JSON com chaves ordenadas, hash SHA-256.

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/transport/computeCodebookHash.test.ts
import { describe, it, expect } from 'vitest';
import { computeCodebookHash } from '../../../../src/core/icr/transport/computeCodebookHash';
import type { CodeDefinition, GroupDefinition, SmartCodeDefinition } from '../../../../src/core/types';

const c1: CodeDefinition = { id: 'c1', name: 'A', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
const c2: CodeDefinition = { id: 'c2', name: 'B', color: '#000', paletteIndex: 1, createdAt: 1, updatedAt: 1, childrenOrder: [] };

describe('computeCodebookHash', () => {
	it('returns 64-char SHA-256 hex', async () => {
		const hash = await computeCodebookHash({ codes: [c1], groups: [], smartCodes: [] });
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('order-independent (sort por id internamente)', async () => {
		const h1 = await computeCodebookHash({ codes: [c1, c2], groups: [], smartCodes: [] });
		const h2 = await computeCodebookHash({ codes: [c2, c1], groups: [], smartCodes: [] });
		expect(h1).toBe(h2);
	});

	it('different content → different hash', async () => {
		const c2alt: CodeDefinition = { ...c2, name: 'B-changed' };
		const h1 = await computeCodebookHash({ codes: [c1, c2], groups: [], smartCodes: [] });
		const h2 = await computeCodebookHash({ codes: [c1, c2alt], groups: [], smartCodes: [] });
		expect(h1).not.toBe(h2);
	});

	it('handles empty codebook', async () => {
		const hash = await computeCodebookHash({ codes: [], groups: [], smartCodes: [] });
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});
});
```

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/transport/computeCodebookHash.ts
import type { CodeDefinition, GroupDefinition, SmartCodeDefinition } from '../../types';
import { computeSourceHash } from '../computeSourceHash';

interface CodebookSnapshot {
	codes: CodeDefinition[];
	groups: GroupDefinition[];
	smartCodes: SmartCodeDefinition[];
}

/** Hash determinístico do codebook — sort por id, JSON canonical, SHA-256.
 *  NÃO inclui campos voláteis (createdAt/updatedAt) pra estabilidade entre vaults. */
export async function computeCodebookHash(snapshot: CodebookSnapshot): Promise<string> {
	const canonical = {
		codes: snapshot.codes
			.map(c => ({ id: c.id, name: c.name, color: c.color, parentId: c.parentId, groups: c.groups }))
			.sort((a, b) => a.id.localeCompare(b.id)),
		groups: snapshot.groups
			.map(g => ({ id: g.id, name: g.name, color: g.color }))
			.sort((a, b) => a.id.localeCompare(b.id)),
		smartCodes: snapshot.smartCodes
			.map(sc => ({ id: sc.id, name: sc.name, predicate: sc.predicate }))
			.sort((a, b) => a.id.localeCompare(b.id)),
	};
	const json = JSON.stringify(canonical);
	const buffer = new TextEncoder().encode(json).buffer;
	return computeSourceHash(buffer);
}
```

- [ ] **Step 4: Run tests** — expect 4 pass.

- [ ] **Step 5: Commit**

`~/.claude/scripts/commit.sh "feat(icr): computeCodebookHash determinístico (sort por id + canonical JSON + SHA-256)"`

---

## Chunk 2 — extractCoderContribution

### Task 3: extractCoderContribution função pura

**Files:**
- Create: `src/core/icr/transport/extractCoderContribution.ts`
- Test: `tests/core/icr/transport/extractCoderContribution.test.ts`

Recebe `(data: QualiaData, coderId: CoderId, sourceHashRegistry?)`. Retorna `ExtractResult` com payload populado.

Steps internos:
1. Filtra markers por `codedBy === coderId` em md/pdf/csvSegment
2. Coleta codeIds referenciados → busca CodeDefinition em data.registry
3. Coleta groups referenciados pelos codes → busca GroupDefinition
4. Coleta sources referenciados pelos markers (fileIds únicos)
5. Pra cada source, lookup hash em sourceHashRegistry — se ausente, warning (cross-vault remap não vai funcionar pra esse source no merge)
6. Coleta memos do coder (Slice 3 P0: só memos em codes/groups; markers têm memos próprios já incluídos no marker)
7. Computa codebookVersion hash
8. Busca coder full entry do registry (Coder type)

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/transport/extractCoderContribution.test.ts
import { describe, it, expect } from 'vitest';
import { extractCoderContribution } from '../../../../src/core/icr/transport/extractCoderContribution';
import type { QualiaData } from '../../../../src/core/types';

function makeMockData(): QualiaData {
	return {
		registry: {
			definitions: {
				'c1': { id: 'c1', name: 'Frustração', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] },
				'c2': { id: 'c2', name: 'Confiança', color: '#000', paletteIndex: 1, createdAt: 1, updatedAt: 1, childrenOrder: [] },
			},
			nextPaletteIndex: 2,
			folders: {}, folderOrder: [], rootOrder: ['c1', 'c2'],
			groups: {}, groupOrder: [], nextGroupPaletteIndex: 0,
		},
		smartCodes: { definitions: {}, order: [], nextPaletteIndex: 0 },
		general: {} as any,
		markdown: {
			markers: {
				'f1.md': [
					{ markerType: 'markdown', id: 'm1', fileId: 'f1.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
					{ markerType: 'markdown', id: 'm2', fileId: 'f1.md', range: { from: { line: 1, ch: 0 }, to: { line: 1, ch: 5 } }, color: '#fff', codes: [{ codeId: 'c2' }], codedBy: 'human:joana', createdAt: 1, updatedAt: 1 },
				],
			},
			settings: {} as any,
		},
		csv: { segmentMarkers: [], rowMarkers: [], settings: {} as any },
		image: { markers: [], settings: {} as any },
		pdf: { markers: [], shapes: [], settings: {} as any },
		audio: { files: [], settings: {} as any },
		video: { files: [], settings: {} as any },
		caseVariables: { values: {}, types: {} },
		coders: {
			coders: [
				{ id: 'human:carla', name: 'Carla', type: 'human', createdAt: 1 },
				{ id: 'human:joana', name: 'Joana', type: 'human', createdAt: 1 },
			],
		},
		visibilityOverrides: {},
		auditLog: [],
	};
}

describe('extractCoderContribution', () => {
	it('extracts only markers with matching coderId', async () => {
		const data = makeMockData();
		const { payload } = await extractCoderContribution(data, 'human:carla');
		const allMarkers = Object.values(payload.markers.markdown).flat();
		expect(allMarkers.length).toBe(1);
		expect(allMarkers[0]!.id).toBe('m1');
		expect(allMarkers[0]!.codedBy).toBe('human:carla');
	});

	it('includes only codes referenced by extracted markers', async () => {
		const data = makeMockData();
		const { payload } = await extractCoderContribution(data, 'human:carla');
		expect(payload.codes.map(c => c.id)).toEqual(['c1']);
	});

	it('includes coder entry from registry', async () => {
		const data = makeMockData();
		const { payload } = await extractCoderContribution(data, 'human:carla');
		expect(payload.coder.id).toBe('human:carla');
		expect(payload.coder.name).toBe('Carla');
	});

	it('emits warning when source has no hash in registry', async () => {
		const data = makeMockData();
		const { warnings } = await extractCoderContribution(data, 'human:carla'); // no sourceHashRegistry passed
		expect(warnings.some(w => w.includes('f1.md'))).toBe(true);
	});

	it('payload includes codebookVersion hash', async () => {
		const data = makeMockData();
		const { payload } = await extractCoderContribution(data, 'human:carla');
		expect(payload.codebookVersion).toMatch(/^[0-9a-f]{64}$/);
	});

	it('returns empty markers when no markers match coderId', async () => {
		const data = makeMockData();
		const { payload } = await extractCoderContribution(data, 'human:nonexistent');
		expect(Object.values(payload.markers.markdown).flat().length).toBe(0);
		expect(payload.codes.length).toBe(0);
	});
});
```

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/transport/extractCoderContribution.ts
import type { QualiaData, CodeDefinition, GroupDefinition } from '../../types';
import type { CoderId, Coder } from '../coderTypes';
import type { Marker } from '../../../markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../../pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../../csv/csvCodingTypes';
import type { Payload, ExtractResult } from './payloadTypes';
import type { SourceHashRegistry } from '../sourceHashRegistry';
import { computeCodebookHash } from './computeCodebookHash';

export async function extractCoderContribution(
	data: QualiaData,
	coderId: CoderId,
	sourceHashRegistry?: SourceHashRegistry,
): Promise<ExtractResult> {
	const warnings: string[] = [];

	// 1. Filter markers per engine
	const mdMarkers: Record<string, Marker[]> = {};
	for (const [fileId, markers] of Object.entries(data.markdown.markers ?? {})) {
		const filtered = markers.filter(m => m.codedBy === coderId);
		if (filtered.length > 0) mdMarkers[fileId] = filtered;
	}
	const pdfMarkers: PdfMarker[] = (data.pdf.markers ?? []).filter(m => m.codedBy === coderId);
	const csvSegmentMarkers: SegmentMarker[] = (data.csv.segmentMarkers ?? []).filter(m => m.codedBy === coderId);

	// 2. Collect referenced codeIds
	const codeIds = new Set<string>();
	for (const ms of Object.values(mdMarkers)) for (const m of ms) for (const ca of m.codes) codeIds.add(ca.codeId);
	for (const m of pdfMarkers) for (const ca of m.codes) codeIds.add(ca.codeId);
	for (const m of csvSegmentMarkers) for (const ca of m.codes) codeIds.add(ca.codeId);

	const codes: CodeDefinition[] = [];
	for (const cid of codeIds) {
		const def = data.registry.definitions[cid];
		if (def) codes.push(def);
		else warnings.push(`Code ${cid} referenced by marker but not in registry`);
	}

	// 3. Collect referenced groups (subset of code.groups[] union)
	const groupIds = new Set<string>();
	for (const c of codes) for (const gid of c.groups ?? []) groupIds.add(gid);
	const groups: GroupDefinition[] = [];
	for (const gid of groupIds) {
		const g = data.registry.groups[gid];
		if (g) groups.push(g);
	}

	// 4. Collect source fileIds and hashes
	const fileIds = new Set<string>();
	for (const fileId of Object.keys(mdMarkers)) fileIds.add(fileId);
	for (const m of pdfMarkers) fileIds.add(m.fileId);
	for (const m of csvSegmentMarkers) fileIds.add(m.fileId);

	const sources: Record<string, { hash: string; fileSize?: number }> = {};
	for (const fileId of fileIds) {
		if (sourceHashRegistry) {
			const entry = sourceHashRegistry.getEntry(fileId);
			if (entry) {
				sources[fileId] = { hash: entry.hash, fileSize: entry.fileSize };
				continue;
			}
		}
		warnings.push(`Source ${fileId} has no hash in registry — cross-vault remap won't work for this source`);
	}

	// 5. Memos do coder (Slice 3 P0: só codes/groups; markers têm memo próprio embutido)
	// Skip pra Slice 3 — memos in codes/groups são compartilhados (não per-coder). Decisão de produto futura.

	// 6. Codebook hash
	const codebookVersion = await computeCodebookHash({
		codes: Object.values(data.registry.definitions),
		groups: Object.values(data.registry.groups),
		smartCodes: Object.values(data.smartCodes?.definitions ?? {}),
	});

	// 7. Coder entry
	const coderEntry = data.coders?.coders.find(c => c.id === coderId);
	const coder: Coder = coderEntry ?? { id: coderId, name: coderId, type: coderId.startsWith('llm:') ? 'llm' : 'human', createdAt: Date.now() };
	if (!coderEntry) warnings.push(`Coder ${coderId} not in registry — minimal stub created in payload`);

	const payload: Payload = {
		version: '1.0',
		codebookVersion,
		coder,
		sources,
		codes,
		groups: groups.length > 0 ? groups : undefined,
		markers: { markdown: mdMarkers, pdf: pdfMarkers, csvSegment: csvSegmentMarkers },
		exportedAt: Date.now(),
	};

	return { payload, warnings };
}
```

- [ ] **Step 4: Run tests** — expect all pass.

- [ ] **Step 5: Commit**

`~/.claude/scripts/commit.sh "feat(icr): extractCoderContribution puro — filtra markers por coderId, coleta codes/groups/sources/coder, computa codebookVersion"`

---

## Chunk 3 — Cross-vault remap + mergeCoderContribution

### Task 4: crossVaultRemap função pura

**Files:**
- Create: `src/core/icr/transport/crossVaultRemap.ts`
- Test: `tests/core/icr/transport/crossVaultRemap.test.ts`

Recebe payload sources + sourceHashRegistry local. Retorna mapping `payloadFileId → localFileId` baseado em hash match. Se hash bate em path local diferente → remapeia. Se hash bate em path local idêntico → mantém. Se múltiplos matches → escolhe primeiro alfabético + warning. Se zero matches → warning + entrada em "pending".

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/transport/crossVaultRemap.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { crossVaultRemap } from '../../../../src/core/icr/transport/crossVaultRemap';
import { SourceHashRegistry } from '../../../../src/core/icr/sourceHashRegistry';

function makeMockVault(files: Record<string, string>) {
	return {
		adapter: {
			async readBinary(path: string): Promise<ArrayBuffer> {
				return new TextEncoder().encode(files[path] ?? '').buffer;
			},
		},
	} as any;
}

let registry: SourceHashRegistry;

beforeEach(async () => {
	const vault = makeMockVault({
		'local/path/A.md': 'content shared 1',
		'local/path/B.md': 'content shared 2',
	});
	registry = new SourceHashRegistry(vault);
	await registry.getOrCompute('local/path/A.md');
	await registry.getOrCompute('local/path/B.md');
});

describe('crossVaultRemap', () => {
	it('remaps payload fileId to local fileId when hash matches different path', async () => {
		const aHash = registry.getEntry('local/path/A.md')!.hash;
		const payloadSources = { 'remote/path/A.md': { hash: aHash } };
		const result = crossVaultRemap(payloadSources, registry);
		expect(result.fileIdRemap['remote/path/A.md']).toBe('local/path/A.md');
	});

	it('keeps fileId when path identical and hash matches', async () => {
		const aHash = registry.getEntry('local/path/A.md')!.hash;
		const payloadSources = { 'local/path/A.md': { hash: aHash } };
		const result = crossVaultRemap(payloadSources, registry);
		expect(result.fileIdRemap['local/path/A.md']).toBe('local/path/A.md');
		expect(result.conflicts.length).toBe(0);
	});

	it('emits source_hash_mismatch when same path but different hash', async () => {
		const payloadSources = { 'local/path/A.md': { hash: 'deadbeef' } };
		const result = crossVaultRemap(payloadSources, registry);
		expect(result.conflicts.some(c => c.kind === 'source_hash_mismatch')).toBe(true);
	});

	it('emits source_not_found when no hash match anywhere', async () => {
		const payloadSources = { 'remote/unknown.md': { hash: 'deadbeef' } };
		const result = crossVaultRemap(payloadSources, registry);
		expect(result.conflicts.some(c => c.kind === 'source_not_found')).toBe(true);
		expect(result.fileIdRemap['remote/unknown.md']).toBeUndefined();
	});

	it('picks first alphabetical when multiple local files have same hash', async () => {
		// Add c.md with same content as A.md
		const vault = makeMockVault({
			'local/path/A.md': 'shared',
			'zzz/path/A.md': 'shared',
		});
		const reg = new SourceHashRegistry(vault);
		await reg.getOrCompute('local/path/A.md');
		await reg.getOrCompute('zzz/path/A.md');
		const sharedHash = reg.getEntry('local/path/A.md')!.hash;
		const result = crossVaultRemap({ 'remote/A.md': { hash: sharedHash } }, reg);
		expect(result.fileIdRemap['remote/A.md']).toBe('local/path/A.md'); // alphabetical first
		expect(result.conflicts.some(c => c.kind === 'multiple_hash_matches')).toBe(true);
	});
});
```

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/transport/crossVaultRemap.ts
import type { SourceHashRegistry } from '../sourceHashRegistry';
import type { ConflictRecord } from './payloadTypes';

export interface RemapResult {
	fileIdRemap: Record<string, string>;
	conflicts: ConflictRecord[];
}

/** Pure: dado payload sources + local hash registry, remapeia fileIds via hash match.
 *  Não bloqueia em divergências — emite ConflictRecord pra caller decidir. */
export function crossVaultRemap(
	payloadSources: Record<string, { hash: string; fileSize?: number }>,
	localRegistry: SourceHashRegistry,
): RemapResult {
	const fileIdRemap: Record<string, string> = {};
	const conflicts: ConflictRecord[] = [];

	for (const [payloadFileId, src] of Object.entries(payloadSources)) {
		// 1. Path identical + hash same → keep
		const localEntry = localRegistry.getEntry(payloadFileId);
		if (localEntry) {
			if (localEntry.hash === src.hash) {
				fileIdRemap[payloadFileId] = payloadFileId;
				continue;
			} else {
				conflicts.push({
					kind: 'source_hash_mismatch',
					fileId: payloadFileId,
					localHash: localEntry.hash,
					payloadHash: src.hash,
				});
				// Continue checking findByHash — maybe content existe noutro path
			}
		}

		// 2. Hash match em outro path
		const matches = localRegistry.findByHash(src.hash);
		if (matches.length === 1) {
			fileIdRemap[payloadFileId] = matches[0]!;
		} else if (matches.length > 1) {
			const sorted = [...matches].sort();
			fileIdRemap[payloadFileId] = sorted[0]!;
			conflicts.push({
				kind: 'multiple_hash_matches',
				payloadFileId,
				localFileIds: matches,
				chosenFileId: sorted[0]!,
			});
		} else if (!localEntry) {
			// 3. No match anywhere
			conflicts.push({
				kind: 'source_not_found',
				fileId: payloadFileId,
				payloadHash: src.hash,
			});
		}
	}

	return { fileIdRemap, conflicts };
}
```

- [ ] **Step 4: Run tests** — expect all pass.

- [ ] **Step 5: Commit**

`~/.claude/scripts/commit.sh "feat(icr): crossVaultRemap puro — match único / múltiplos / zero (warnings estruturados)"`

---

### Task 5: mergeCoderContribution função pura

**Files:**
- Create: `src/core/icr/transport/mergeCoderContribution.ts`
- Test: `tests/core/icr/transport/mergeCoderContribution.test.ts`

Recebe `(localData, payload, sourceHashRegistry)`. Aplica payload no `localData` (mutação direta — é o método autoritativo de absorção). Retorna `MergeResult`.

Steps:
1. **Codebook divergence:** computa codebookHash local atual; compara com `payload.codebookVersion`. Se diferente → emite `codebook_diverged` conflict (não bloqueia)
2. **Coder registration:** se `payload.coder.id` não existe em local registry → adiciona
3. **Cross-vault remap:** chama `crossVaultRemap(payload.sources, registry)` → recebe `fileIdRemap + conflicts`. Conflicts merge pro result
4. **Code merge:** pra cada code em `payload.codes`:
   - Se code.id existe local com mesmo content → skip
   - Se code.id existe local com content diferente → incoming wins + emite `code_overwritten` conflict
   - Se code.id não existe local → adiciona
5. **Group merge:** mesmo padrão pra `payload.groups`
6. **Marker insertion:** pra cada engine:
   - Aplica `fileIdRemap` no `marker.fileId`
   - Se fileId não foi remapped (source_not_found) → marker fica em "pending" (não inserido), conta em `pendingMarkers`
   - Senão → push pro array do engine local

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/transport/mergeCoderContribution.test.ts
import { describe, it, expect } from 'vitest';
import { mergeCoderContribution } from '../../../../src/core/icr/transport/mergeCoderContribution';
import { SourceHashRegistry } from '../../../../src/core/icr/sourceHashRegistry';
import { extractCoderContribution } from '../../../../src/core/icr/transport/extractCoderContribution';
import type { QualiaData } from '../../../../src/core/types';

// helper: cria QualiaData mínimo
function makeData(): QualiaData {
	return {
		registry: { definitions: {}, nextPaletteIndex: 0, folders: {}, folderOrder: [], rootOrder: [], groups: {}, groupOrder: [], nextGroupPaletteIndex: 0 },
		smartCodes: { definitions: {}, order: [], nextPaletteIndex: 0 },
		general: {} as any,
		markdown: { markers: {}, settings: {} as any },
		csv: { segmentMarkers: [], rowMarkers: [], settings: {} as any },
		image: { markers: [], settings: {} as any },
		pdf: { markers: [], shapes: [], settings: {} as any },
		audio: { files: [], settings: {} as any },
		video: { files: [], settings: {} as any },
		caseVariables: { values: {}, types: {} },
		coders: { coders: [{ id: 'human:default', name: 'Default', type: 'human', createdAt: 1 }] },
		visibilityOverrides: {},
		auditLog: [],
	};
}

function makeMockVault(files: Record<string, string>) {
	return { adapter: { async readBinary(p: string) { return new TextEncoder().encode(files[p] ?? '').buffer; } } } as any;
}

describe('mergeCoderContribution', () => {
	it('adds coder to local registry if not present', async () => {
		const sourceData = makeData();
		const targetData = makeData();
		// Source vault has Carla + 1 marker + 1 code
		sourceData.coders!.coders.push({ id: 'human:carla', name: 'Carla', type: 'human', createdAt: 1 });
		sourceData.registry.definitions['c1'] = { id: 'c1', name: 'Frustração', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
		sourceData.markdown.markers['shared.md'] = [
			{ markerType: 'markdown', id: 'm1', fileId: 'shared.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
		];
		// Source registry has hash for shared.md
		const sourceVault = makeMockVault({ 'shared.md': 'shared content' });
		const sourceReg = new SourceHashRegistry(sourceVault);
		await sourceReg.getOrCompute('shared.md');

		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);

		// Target vault has same content but different path
		const targetVault = makeMockVault({ 'local/shared.md': 'shared content' });
		const targetReg = new SourceHashRegistry(targetVault);
		await targetReg.getOrCompute('local/shared.md');

		const result = await mergeCoderContribution(targetData, payload, targetReg);

		expect(result.added.coder).toBe(true);
		expect(targetData.coders!.coders.find(c => c.id === 'human:carla')).toBeTruthy();
	});

	it('cross-vault remaps marker fileId by hash', async () => {
		const sourceData = makeData();
		const targetData = makeData();
		sourceData.coders!.coders.push({ id: 'human:carla', name: 'Carla', type: 'human', createdAt: 1 });
		sourceData.registry.definitions['c1'] = { id: 'c1', name: 'F', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
		sourceData.markdown.markers['remote/shared.md'] = [
			{ markerType: 'markdown', id: 'm1', fileId: 'remote/shared.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
		];
		const sourceVault = makeMockVault({ 'remote/shared.md': 'shared content' });
		const sourceReg = new SourceHashRegistry(sourceVault);
		await sourceReg.getOrCompute('remote/shared.md');

		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);

		const targetVault = makeMockVault({ 'local/different/shared.md': 'shared content' });
		const targetReg = new SourceHashRegistry(targetVault);
		await targetReg.getOrCompute('local/different/shared.md');

		const result = await mergeCoderContribution(targetData, payload, targetReg);

		expect(result.fileIdRemap['remote/shared.md']).toBe('local/different/shared.md');
		const merged = targetData.markdown.markers['local/different/shared.md'];
		expect(merged).toBeDefined();
		expect(merged!.length).toBe(1);
		expect(merged![0]!.fileId).toBe('local/different/shared.md');
		expect(merged![0]!.codedBy).toBe('human:carla');
	});

	it('emits codebook_diverged when local codebook hash differs', async () => {
		const sourceData = makeData();
		const targetData = makeData();
		sourceData.coders!.coders.push({ id: 'human:carla', name: 'Carla', type: 'human', createdAt: 1 });
		sourceData.registry.definitions['c1'] = { id: 'c1', name: 'F', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
		// Target has DIFFERENT codebook
		targetData.registry.definitions['c1'] = { id: 'c1', name: 'F-changed', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
		sourceData.markdown.markers['shared.md'] = [
			{ markerType: 'markdown', id: 'm1', fileId: 'shared.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
		];
		const sourceVault = makeMockVault({ 'shared.md': 'x' });
		const sourceReg = new SourceHashRegistry(sourceVault);
		await sourceReg.getOrCompute('shared.md');

		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);

		const targetVault = makeMockVault({ 'shared.md': 'x' });
		const targetReg = new SourceHashRegistry(targetVault);
		await targetReg.getOrCompute('shared.md');

		const result = await mergeCoderContribution(targetData, payload, targetReg);

		expect(result.conflicts.some(c => c.kind === 'codebook_diverged')).toBe(true);
		// Code overwritten quando incoming wins
		expect(result.conflicts.some(c => c.kind === 'code_overwritten')).toBe(true);
		expect(targetData.registry.definitions['c1']!.name).toBe('F'); // incoming wins
	});

	it('counts pending markers when source not found', async () => {
		const sourceData = makeData();
		const targetData = makeData();
		sourceData.coders!.coders.push({ id: 'human:carla', name: 'Carla', type: 'human', createdAt: 1 });
		sourceData.registry.definitions['c1'] = { id: 'c1', name: 'F', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
		sourceData.markdown.markers['unknown.md'] = [
			{ markerType: 'markdown', id: 'm1', fileId: 'unknown.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
		];
		const sourceVault = makeMockVault({ 'unknown.md': 'unknown content' });
		const sourceReg = new SourceHashRegistry(sourceVault);
		await sourceReg.getOrCompute('unknown.md');

		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);

		// Target vault NÃO tem o source
		const targetVault = makeMockVault({});
		const targetReg = new SourceHashRegistry(targetVault);

		const result = await mergeCoderContribution(targetData, payload, targetReg);

		expect(result.pendingMarkers).toBe(1);
		expect(result.conflicts.some(c => c.kind === 'source_not_found')).toBe(true);
		// Marker NOT added
		expect(Object.keys(targetData.markdown.markers).length).toBe(0);
	});
});
```

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement**

```typescript
// src/core/icr/transport/mergeCoderContribution.ts
import type { QualiaData } from '../../types';
import type { Payload, MergeResult, ConflictRecord } from './payloadTypes';
import type { SourceHashRegistry } from '../sourceHashRegistry';
import { computeCodebookHash } from './computeCodebookHash';
import { crossVaultRemap } from './crossVaultRemap';

export async function mergeCoderContribution(
	localData: QualiaData,
	payload: Payload,
	localHashRegistry: SourceHashRegistry,
): Promise<MergeResult> {
	const conflicts: ConflictRecord[] = [];
	const warnings: string[] = [];
	const added = { markers: 0, codes: 0, groups: 0, coder: false };
	let pendingMarkers = 0;

	// 1. Codebook divergence
	const localCodebookHash = await computeCodebookHash({
		codes: Object.values(localData.registry.definitions),
		groups: Object.values(localData.registry.groups),
		smartCodes: Object.values(localData.smartCodes?.definitions ?? {}),
	});
	if (localCodebookHash !== payload.codebookVersion) {
		conflicts.push({
			kind: 'codebook_diverged',
			localHash: localCodebookHash,
			payloadHash: payload.codebookVersion,
		});
	}

	// 2. Coder registration
	if (!localData.coders) localData.coders = { coders: [] };
	if (!localData.coders.coders.find(c => c.id === payload.coder.id)) {
		localData.coders.coders.push(payload.coder);
		added.coder = true;
	}

	// 3. Cross-vault remap
	const remap = crossVaultRemap(payload.sources, localHashRegistry);
	conflicts.push(...remap.conflicts);

	// 4. Code merge
	for (const code of payload.codes) {
		const existing = localData.registry.definitions[code.id];
		if (!existing) {
			localData.registry.definitions[code.id] = code;
			if (!localData.registry.rootOrder.includes(code.id)) {
				localData.registry.rootOrder.push(code.id);
			}
			added.codes++;
		} else {
			// Incoming wins on diff
			if (existing.name !== code.name) {
				conflicts.push({ kind: 'code_overwritten', codeId: code.id, field: 'name', from: existing.name, to: code.name });
				existing.name = code.name;
			}
			if (existing.color !== code.color) {
				conflicts.push({ kind: 'code_overwritten', codeId: code.id, field: 'color', from: existing.color, to: code.color });
				existing.color = code.color;
			}
		}
	}

	// 5. Group merge
	if (payload.groups) {
		for (const group of payload.groups) {
			if (!localData.registry.groups[group.id]) {
				localData.registry.groups[group.id] = group;
				if (!localData.registry.groupOrder.includes(group.id)) {
					localData.registry.groupOrder.push(group.id);
				}
				added.groups++;
			}
		}
	}

	// 6. Marker insertion (markdown)
	for (const [payloadFileId, markers] of Object.entries(payload.markers.markdown)) {
		const localFileId = remap.fileIdRemap[payloadFileId];
		if (!localFileId) {
			pendingMarkers += markers.length;
			continue;
		}
		if (!localData.markdown.markers[localFileId]) localData.markdown.markers[localFileId] = [];
		for (const m of markers) {
			localData.markdown.markers[localFileId]!.push({ ...m, fileId: localFileId });
			added.markers++;
		}
	}

	// PDF
	for (const m of payload.markers.pdf) {
		const localFileId = remap.fileIdRemap[m.fileId];
		if (!localFileId) {
			pendingMarkers++;
			continue;
		}
		localData.pdf.markers.push({ ...m, fileId: localFileId });
		added.markers++;
	}

	// CSV segment
	for (const m of payload.markers.csvSegment) {
		const localFileId = remap.fileIdRemap[m.fileId];
		if (!localFileId) {
			pendingMarkers++;
			continue;
		}
		localData.csv.segmentMarkers.push({ ...m, fileId: localFileId });
		added.markers++;
	}

	return {
		added,
		conflicts,
		warnings,
		fileIdRemap: remap.fileIdRemap,
		pendingMarkers,
	};
}
```

- [ ] **Step 4: Run tests** — expect all pass.

- [ ] **Step 5: Commit**

`~/.claude/scripts/commit.sh "feat(icr): mergeCoderContribution puro — codebook divergence + coder reg + cross-vault remap + code/group merge + marker insertion"`

---

## Chunk 4 — Plugin API + smoke script

### Task 6: Plugin expõe icrTransport pra console/script

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add field + import + instantiate**

```typescript
// src/main.ts
import { extractCoderContribution } from './core/icr/transport/extractCoderContribution';
import { mergeCoderContribution } from './core/icr/transport/mergeCoderContribution';

// dentro da classe QualiaCodingPlugin:
icrTransport!: {
	extract: (coderId: string) => Promise<import('./core/icr/transport/payloadTypes').ExtractResult>;
	merge: (payload: import('./core/icr/transport/payloadTypes').Payload) => Promise<import('./core/icr/transport/payloadTypes').MergeResult>;
};

// no onload, depois do sourceHashRegistry:
this.icrTransport = {
	extract: (coderId: string) => extractCoderContribution(
		this.dataManager.getDataRef(),
		coderId,
		this.sourceHashRegistry,
	),
	merge: async (payload) => {
		const result = await mergeCoderContribution(
			this.dataManager.getDataRef(),
			payload,
			this.sourceHashRegistry,
		);
		this.dataManager.markDirty();
		return result;
	},
};
```

- [ ] **Step 2: Build**

`npm run build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

`~/.claude/scripts/commit.sh "feat(icr): plugin.icrTransport API exposed pra console/script (extract + merge)"`

---

### Task 7: Smoke script

**Files:**
- Create: `scripts/test-cross-vault-merge.mjs`

Script Node puro: cria 2 QualiaData sintéticos, executa extract + merge, valida resultado. Roda fora do Obsidian.

- [ ] **Step 1: Implement script**

```javascript
#!/usr/bin/env node
// scripts/test-cross-vault-merge.mjs
//
// Smoke pra Slice 3 P0 — cross-vault merge sem Obsidian.
// Cria 2 vaults sintéticos com paths divergentes mesmos sources,
// exporta de A, importa em B, verifica remap e contagens.

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repo = process.cwd();
const tsxBin = path.join(repo, 'node_modules', '.bin', 'tsx');

const inlineScript = `
import { extractCoderContribution } from '../src/core/icr/transport/extractCoderContribution.ts';
import { mergeCoderContribution } from '../src/core/icr/transport/mergeCoderContribution.ts';
import { SourceHashRegistry } from '../src/core/icr/sourceHashRegistry.ts';

function makeData() {
	return {
		registry: { definitions: {}, nextPaletteIndex: 0, folders: {}, folderOrder: [], rootOrder: [], groups: {}, groupOrder: [], nextGroupPaletteIndex: 0 },
		smartCodes: { definitions: {}, order: [], nextPaletteIndex: 0 },
		general: {}, markdown: { markers: {}, settings: {} },
		csv: { segmentMarkers: [], rowMarkers: [], settings: {} },
		image: { markers: [], settings: {} },
		pdf: { markers: [], shapes: [], settings: {} },
		audio: { files: [], settings: {} },
		video: { files: [], settings: {} },
		caseVariables: { values: {}, types: {} },
		coders: { coders: [{ id: 'human:default', name: 'Default', type: 'human', createdAt: 1 }] },
		visibilityOverrides: {}, auditLog: [],
	};
}

function makeVault(files) {
	return { adapter: { async readBinary(p) { return new TextEncoder().encode(files[p] ?? '').buffer; } } };
}

const sourceData = makeData();
const targetData = makeData();

// Source: Carla coda em vault path 'remote/...'
sourceData.coders.coders.push({ id: 'human:carla', name: 'Carla', type: 'human', createdAt: Date.now() });
sourceData.registry.definitions['c1'] = { id: 'c1', name: 'Frustração', color: '#6200EE', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
sourceData.registry.rootOrder.push('c1');
sourceData.markdown.markers['remote/path/E1.md'] = [
	{ markerType: 'markdown', id: 'm_carla1', fileId: 'remote/path/E1.md', range: { from: { line: 5, ch: 0 }, to: { line: 5, ch: 80 } }, color: '#6200EE', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
];

const sourceVault = makeVault({ 'remote/path/E1.md': 'shared interview content' });
const sourceReg = new SourceHashRegistry(sourceVault);
await sourceReg.getOrCompute('remote/path/E1.md');

const { payload, warnings: extractWarnings } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);

console.log('=== EXTRACT ===');
console.log('Coder:', payload.coder.id);
console.log('Codes:', payload.codes.map(c => c.id));
console.log('Sources:', Object.keys(payload.sources));
console.log('Markers (md):', Object.values(payload.markers.markdown).flat().length);
console.log('Warnings:', extractWarnings);

// Target: vault diferente, mesmo conteúdo, path diferente
const targetVault = makeVault({ 'local/projects/qda/E1.md': 'shared interview content' });
const targetReg = new SourceHashRegistry(targetVault);
await targetReg.getOrCompute('local/projects/qda/E1.md');

const result = await mergeCoderContribution(targetData, payload, targetReg);

console.log('');
console.log('=== MERGE ===');
console.log('Added:', result.added);
console.log('FileId remap:', result.fileIdRemap);
console.log('Conflicts:', result.conflicts);
console.log('Pending markers:', result.pendingMarkers);

console.log('');
console.log('=== TARGET STATE ===');
console.log('Coders:', targetData.coders.coders.map(c => c.id));
console.log('Codes:', Object.keys(targetData.registry.definitions));
console.log('Markdown markers:', Object.entries(targetData.markdown.markers).map(([f, ms]) => f + ': ' + ms.length));

const success = (
	result.added.coder === true &&
	result.added.codes === 1 &&
	result.added.markers === 1 &&
	result.fileIdRemap['remote/path/E1.md'] === 'local/projects/qda/E1.md' &&
	result.pendingMarkers === 0 &&
	targetData.markdown.markers['local/projects/qda/E1.md']?.length === 1
);

console.log('');
console.log(success ? '✅ SMOKE PASSOU' : '❌ SMOKE FALHOU');
process.exit(success ? 0 : 1);
`;

const result = spawnSync(tsxBin, ['-e', inlineScript], { cwd: repo, stdio: 'inherit' });
process.exit(result.status ?? 1);
```

- [ ] **Step 2: Verify tsx available** — `ls node_modules/.bin/tsx 2>/dev/null` ou `npm run --silent test:e2e:dry 2>&1 | head` (qualquer cmd que use tsx).

  Se tsx não estiver disponível: usar `npm i -D tsx` ou alternativa. Mas vitest já usa esbuild — pode rodar diretamente.

  **Alternativa simples: rodar via vitest.** Cria um test em `tests/core/icr/transport/smoke.test.ts` que faz o mesmo cenário e roda como vitest test (já tem toolchain).

- [ ] **Step 3: Decidir alternativa**

Verifica se `tsx` está em `node_modules/.bin`. Se sim, mantém script. Se não, transforma em test vitest:

```typescript
// tests/core/icr/transport/smoke.test.ts
// (mesmo conteúdo do script, encapsulado em it.skip se não quiser rodar como teste regular,
//  ou it.concurrent pra rodar em isolamento. Default: it() regular.)
```

- [ ] **Step 4: Run smoke** — `node scripts/test-cross-vault-merge.mjs` (ou `npm run test -- tests/core/icr/transport/smoke.test.ts`)

Expected: `✅ SMOKE PASSOU`

- [ ] **Step 5: Commit**

`~/.claude/scripts/commit.sh "test(icr): smoke script Fase C P0 — cross-vault merge end-to-end (paths divergentes, single coder)"`

---

### Task 8: CHANGELOG + final close

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update changelog** com parágrafo Slice 3:

```
**ICR Slice 3 — Fase C P0 transport puro (2026-05-09)** — branch `feat/icr-slice-3-fase-c-p0-transport-puro`. Funções puras de transport multi-coder remoto: extractCoderContribution + mergeCoderContribution + crossVaultRemap + computeCodebookHash. Payload format JSON v1.0 com codebookVersion + coder + sources hashes + codes referenciados + markers per engine text-like (markdown + PDF text + CSV cod segment) + groups opcional. Cross-vault remap embutido: lookup hash no SourceHashRegistry local → remapeia fileId quando paths divergem. Codebook divergence detection emite warning sem bloquear. Plugin expõe `icrTransport.extract(coderId) / merge(payload)` via console. Smoke script `scripts/test-cross-vault-merge.mjs` exercita end-to-end (paths divergentes, single coder, sem Obsidian aberto). N testes ICR transport novos (2900 → ?). UX layer (modal preview / cherry-pick / staging / conflict resolution) registrada em BACKLOG.md como Fase C P1, gated em UX brainstorm.
```

- [ ] **Step 2: Final test sweep + build**

`npm run test 2>&1 | tail -8 && npm run build 2>&1 | tail -3`. Expected: tudo verde.

- [ ] **Step 3: Final commit**

`~/.claude/scripts/commit.sh "docs(changelog): registra Slice 3 Fase C P0 transport puro"`

- [ ] **Step 4: Tag + merge + push (regra do projeto)**

```bash
git checkout main
git tag pre-icr-slice-3-baseline df58327 -m "Estado antes do Slice 3 ICR Fase C P0"
git merge feat/icr-slice-3-fase-c-p0-transport-puro --ff-only
git tag post-icr-slice-3-checkpoint HEAD -m "Slice 3 ICR Fase C P0 transport puro completo"
git push origin main pre-icr-slice-3-baseline post-icr-slice-3-checkpoint
git branch -d feat/icr-slice-3-fase-c-p0-transport-puro
```

---

## Success Criteria

Slice 3 está done quando:

1. ✅ `computeCodebookHash` determinístico (sort por id, canonical JSON)
2. ✅ `extractCoderContribution` filtra markers + coleta codes/groups/sources/coder + computa codebookVersion
3. ✅ `crossVaultRemap` casos cobertos: match único / múltiplos / zero / hash mismatch
4. ✅ `mergeCoderContribution` aplica payload no localData com codebook divergence + remap + code merge + marker insertion
5. ✅ `npm run test` verde (2900+ testes)
6. ✅ `npm run build` OK
7. ✅ Smoke script: SMOKE PASSOU em cross-vault scenario (paths divergentes resolved via hash)
8. ✅ Plugin expõe `icrTransport.extract(coderId)` e `icrTransport.merge(payload)` chamável via console DevTools

## Não-objetivos (Slice 3 P0)

Já registrados em `BACKLOG.md > 🧱 ICR — Fase C P1 (UX layer, fora do Slice 3)`:
- Comando/menu pra exportar contribuição
- Modal preview de import
- Side-by-side compare + cherry-pick
- Conflict resolution UX
- Multi-import staging
- Codebook divergence resolution UX
- Source divergente alert UX
- Engines não-texto (audio, video, image, pdf shape, csv row)

## Próximo passo após Slice 3

- Brainstorm UX da Fase C P1 (gates a UI completa) — depende de você
- Adapter cod row (categórico, simples) — extensão sobre motor existente
- Adapter áudio/vídeo (overlap temporal ms) — extensão, caminho conhecido
- Slice 2 extensions (Smart Code cache hash, provenance audit, backup integrity)
