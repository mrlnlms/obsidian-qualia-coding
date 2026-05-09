# ICR Slice 5 — Provenance audit (snapshot hash nos markers) Implementation Plan

> **For agentic workers:** Execução inline. TDD por task. Smoke via vitest + 1 callsite real (markdown piloto).

**Goal:** Adicionar `sourceHashAtCoding?: string` em todos marker types + helper público `attachSourceHashSnapshot(marker, hashRegistry)` + wiring em **1 creation path piloto** (markdown) + função pura `detectStaleMarkers(data, hashRegistry): StaleReport` que detecta markers cujo source mudou desde o snapshot. Outros engines (PDF / CSV / image / audio / video) ficam pra slice futuro com mesmo padrão (helper já pronto). **Sem UI** — função consultável via console/script.

**Architecture:** Schema additive — campo opcional. Markers sem `sourceHashAtCoding` ficam classificados como `'inconclusive'` no report (sem snapshot pra comparar). Markers com snapshot e hash atual igual = `'fresh'`. Diferentes = `'stale'`. Helper público `attachSourceHashSnapshot` chama `hashRegistry.getOrCompute(fileId)` e popula o campo. Wired em markdown marker creation pra exercitar end-to-end.

**Tech Stack:** TypeScript strict. Reusa SourceHashRegistry. Sem deps novas.

**Pré-requisitos:**
- Slice 1 ICR ✅
- Slice 2 hash ✅
- Slice 3 transport ✅
- Slice 4 adapters ✅

**Decisões cravadas:**
- Field name: `sourceHashAtCoding?: string` (opcional)
- Padrão: schema additive em BaseMarker → todos engine markers herdam via interface extension. PdfShapeMarker, MediaMarker, ImageMarker, SegmentMarker, RowMarker, Marker (markdown) recebem explicitamente
- Helper `attachSourceHashSnapshot(marker, hashRegistry)`: muta marker in-place adicionando `sourceHashAtCoding` baseado em `getOrCompute(marker.fileId)`. Idempotente — não sobrescreve se já populado
- Detection report: `{ fresh: number; stale: StaleEntry[]; inconclusive: number }` onde `StaleEntry = { markerId, fileId, snapshotHash, currentHash }`
- Piloto: markdown marker creation (1 callsite); outros engines ficam com TODO claro no BACKLOG
- API plugin: `plugin.icrTransport.detectStaleMarkers()` exposto pra console

**Out of scope (vai pro BACKLOG):**
- Wiring em PDF / CSV cod segment / CSV cod row / image / audio / video creation paths (slice de extensão futuro — mesmo padrão)
- UI pra mostrar stale markers (gated em UX brainstorm Fase C P1)
- Auto-recompute snapshot quando source muda (decisão de produto: snapshot é HISTÓRICO, não atual; user decide quando re-snapshot)
- Migração ativa de markers existentes (deixar inconclusive — coverage cresce ao longo do tempo)

---

## File Structure

```
src/core/icr/provenance/
  attachSourceHashSnapshot.ts    — helper público
  detectStaleMarkers.ts          — função pura

tests/core/icr/provenance/
  attachSourceHashSnapshot.test.ts
  detectStaleMarkers.test.ts
```

**Arquivos modificados:**

```
src/core/types.ts                — sourceHashAtCoding?: string em BaseMarker
src/markdown/models/codeMarkerModel.ts  — Marker.sourceHashAtCoding (já herda via codedBy pattern)
src/csv/csvCodingTypes.ts        — SegmentMarker + RowMarker
src/pdf/pdfCodingTypes.ts        — PdfMarker + PdfShapeMarker
src/media/mediaTypes.ts          — MediaMarker
src/image/imageCodingTypes.ts    — ImageMarker
src/markdown/models/codeMarkerModel.ts  — wire attachSourceHashSnapshot em createMarker (PILOTO)
src/main.ts                      — expor detectStaleMarkers via icrTransport
```

---

## Chunk 1 — Schema + helper público

### Task 1: Adicionar `sourceHashAtCoding?: string` em todos marker types

**Files:**
- Modify: `src/core/types.ts` (BaseMarker)
- Modify: `src/markdown/models/codeMarkerModel.ts` (Marker)
- Modify: `src/csv/csvCodingTypes.ts` (SegmentMarker + RowMarker)
- Modify: `src/pdf/pdfCodingTypes.ts` (PdfMarker + PdfShapeMarker)
- Modify: `src/media/mediaTypes.ts` (MediaMarker)
- Modify: `src/image/imageCodingTypes.ts` (ImageMarker)

Mecânico: adicionar `sourceHashAtCoding?: string;` próximo ao `codedBy?: CoderId;` existente.

- [ ] **Step 1: Build + test após cada arquivo** (campo opcional não quebra)

- [ ] **Step 2: Commit**

`~/.claude/scripts/commit.sh "feat(icr): sourceHashAtCoding?: string em todos marker types (schema additive pra provenance audit)"`

---

### Task 2: Helper `attachSourceHashSnapshot`

**Files:**
- Create: `src/core/icr/provenance/attachSourceHashSnapshot.ts`
- Test: `tests/core/icr/provenance/attachSourceHashSnapshot.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/provenance/attachSourceHashSnapshot.test.ts
import { describe, it, expect } from 'vitest';
import { attachSourceHashSnapshot } from '../../../../src/core/icr/provenance/attachSourceHashSnapshot';
import { SourceHashRegistry } from '../../../../src/core/icr/sourceHashRegistry';

function makeMockVault(files: Record<string, string>) {
	return { adapter: { async readBinary(p: string) { return new TextEncoder().encode(files[p] ?? '').buffer; } } } as any;
}

describe('attachSourceHashSnapshot', () => {
	it('mutates marker in-place adding sourceHashAtCoding', async () => {
		const reg = new SourceHashRegistry(makeMockVault({ 'f.md': 'content' }));
		const marker = { id: 'm1', fileId: 'f.md', codedBy: 'human:a' } as any;
		await attachSourceHashSnapshot(marker, reg);
		expect(marker.sourceHashAtCoding).toMatch(/^[0-9a-f]{64}$/);
	});

	it('idempotent — does NOT overwrite existing snapshot', async () => {
		const reg = new SourceHashRegistry(makeMockVault({ 'f.md': 'content' }));
		const marker = { id: 'm1', fileId: 'f.md', sourceHashAtCoding: 'existing-hash' } as any;
		await attachSourceHashSnapshot(marker, reg);
		expect(marker.sourceHashAtCoding).toBe('existing-hash');
	});

	it('returns void (mutation in-place)', async () => {
		const reg = new SourceHashRegistry(makeMockVault({ 'f.md': 'x' }));
		const marker = { id: 'm1', fileId: 'f.md' } as any;
		const result = await attachSourceHashSnapshot(marker, reg);
		expect(result).toBeUndefined();
	});

	it('swallows errors gracefully (file not found does not throw)', async () => {
		const reg = new SourceHashRegistry(makeMockVault({}));
		const marker = { id: 'm1', fileId: 'missing.md' } as any;
		// Should not throw
		await expect(attachSourceHashSnapshot(marker, reg)).resolves.toBeUndefined();
		// snapshot stays undefined
		expect(marker.sourceHashAtCoding).toBeUndefined();
	});
});
```

- [ ] **Step 2: Implement**

```typescript
// src/core/icr/provenance/attachSourceHashSnapshot.ts
import type { SourceHashRegistry } from '../sourceHashRegistry';
import type { BaseMarker } from '../../types';

/** Popula `sourceHashAtCoding` com hash atual do source. Idempotente —
 *  não sobrescreve se já populado (snapshot é histórico, não atual). */
export async function attachSourceHashSnapshot(
	marker: { fileId: string; sourceHashAtCoding?: string },
	hashRegistry: SourceHashRegistry,
): Promise<void> {
	if (marker.sourceHashAtCoding) return;
	try {
		const hash = await hashRegistry.getOrCompute(marker.fileId);
		marker.sourceHashAtCoding = hash;
	} catch {
		// Source não acessível (deletado entre creation + snapshot, etc) — ignora silenciosamente
	}
}
```

- [ ] **Step 3: Run tests + commit**

`~/.claude/scripts/commit.sh "feat(icr): attachSourceHashSnapshot helper — mutation in-place + idempotente + swallow errors"`

---

## Chunk 2 — Função de detecção

### Task 3: detectStaleMarkers função pura

**Files:**
- Create: `src/core/icr/provenance/detectStaleMarkers.ts`
- Test: `tests/core/icr/provenance/detectStaleMarkers.test.ts`

Recebe `(data: QualiaData, hashRegistry: SourceHashRegistry)`. Itera markers de TODOS engines (markdown / pdf / csv segment+row / image / audio / video). Pra cada marker:
- Sem `sourceHashAtCoding` → conta em `inconclusive`
- Com snapshot + hash atual igual → conta em `fresh`
- Com snapshot + hash atual diferente → adiciona em `stale[]`

Hash atual via `hashRegistry.getOrCompute(fileId)` (lazy). Se source não acessível → conta em `inconclusive`.

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/provenance/detectStaleMarkers.test.ts
import { describe, it, expect } from 'vitest';
import { detectStaleMarkers } from '../../../../src/core/icr/provenance/detectStaleMarkers';
import { SourceHashRegistry } from '../../../../src/core/icr/sourceHashRegistry';
import type { QualiaData } from '../../../../src/core/types';

function makeMockVault(files: Record<string, string>) {
	return { adapter: { async readBinary(p: string) { return new TextEncoder().encode(files[p] ?? '').buffer; } } } as any;
}

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
		visibilityOverrides: {}, auditLog: [],
	};
}

describe('detectStaleMarkers', () => {
	it('classifies marker as fresh when snapshot matches current hash', async () => {
		const vault = makeMockVault({ 'f.md': 'content' });
		const reg = new SourceHashRegistry(vault);
		const currentHash = await reg.getOrCompute('f.md');

		const data = makeData();
		data.markdown.markers['f.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'f.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [],
			sourceHashAtCoding: currentHash,
			createdAt: 1, updatedAt: 1,
		}];

		const report = await detectStaleMarkers(data, reg);
		expect(report.fresh).toBe(1);
		expect(report.stale.length).toBe(0);
		expect(report.inconclusive).toBe(0);
	});

	it('classifies marker as stale when snapshot diverges from current hash', async () => {
		const vault = makeMockVault({ 'f.md': 'NEW content' });
		const reg = new SourceHashRegistry(vault);
		await reg.getOrCompute('f.md'); // Hash do "NEW content"

		const data = makeData();
		data.markdown.markers['f.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'f.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [],
			sourceHashAtCoding: 'old-hash-from-different-content',
			createdAt: 1, updatedAt: 1,
		}];

		const report = await detectStaleMarkers(data, reg);
		expect(report.stale.length).toBe(1);
		expect(report.stale[0]!.markerId).toBe('m1');
		expect(report.stale[0]!.snapshotHash).toBe('old-hash-from-different-content');
		expect(report.stale[0]!.currentHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('classifies marker as inconclusive when no snapshot', async () => {
		const reg = new SourceHashRegistry(makeMockVault({ 'f.md': 'x' }));

		const data = makeData();
		data.markdown.markers['f.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'f.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [],
			// sem sourceHashAtCoding
			createdAt: 1, updatedAt: 1,
		}];

		const report = await detectStaleMarkers(data, reg);
		expect(report.inconclusive).toBe(1);
		expect(report.fresh).toBe(0);
		expect(report.stale.length).toBe(0);
	});

	it('iterates all engines (md + pdf + csv + audio + video + image)', async () => {
		const vault = makeMockVault({});
		const reg = new SourceHashRegistry(vault);
		const data = makeData();
		// 1 marker per engine sem snapshot → 6 inconclusive
		data.markdown.markers['md.md'] = [{ markerType: 'markdown', id: 'm1', fileId: 'md.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } }, color: '#fff', codes: [], createdAt: 1, updatedAt: 1 }];
		data.pdf.markers.push({ markerType: 'pdf', id: 'p1', fileId: 'p.pdf', page: 1, beginIndex: 0, beginOffset: 0, endIndex: 5, endOffset: 0, text: '...', codes: [], createdAt: 1, updatedAt: 1 });
		data.csv.segmentMarkers.push({ markerType: 'csv', id: 's1', fileId: 'd.csv', sourceRowId: 0, column: 'r', from: 0, to: 5, codes: [], createdAt: 1, updatedAt: 1 });
		data.csv.rowMarkers.push({ markerType: 'csv', id: 'r1', fileId: 'd.csv', sourceRowId: 0, column: 'r', codes: [], createdAt: 1, updatedAt: 1 });
		data.image.markers.push({ markerType: 'image', id: 'i1', fileId: 'i.png' } as any);
		data.audio.files.push({ path: 'a.mp3', markers: [{ markerType: 'audio', id: 'a1', fileId: 'a.mp3', from: 0, to: 5, codes: [], createdAt: 1, updatedAt: 1 }] });

		const report = await detectStaleMarkers(data, reg);
		expect(report.inconclusive).toBe(6);
	});
});
```

- [ ] **Step 2: Implement**

```typescript
// src/core/icr/provenance/detectStaleMarkers.ts
import type { QualiaData, BaseMarker } from '../../types';
import type { SourceHashRegistry } from '../sourceHashRegistry';

export interface StaleEntry {
	markerId: string;
	fileId: string;
	engine: 'markdown' | 'pdf' | 'csvSegment' | 'csvRow' | 'image' | 'audio' | 'video';
	snapshotHash: string;
	currentHash: string;
}

export interface StaleReport {
	fresh: number;
	stale: StaleEntry[];
	inconclusive: number;
}

interface MarkerWithSnapshot {
	id: string;
	fileId: string;
	sourceHashAtCoding?: string;
}

async function classify(
	marker: MarkerWithSnapshot,
	engine: StaleEntry['engine'],
	hashRegistry: SourceHashRegistry,
	report: StaleReport,
): Promise<void> {
	if (!marker.sourceHashAtCoding) {
		report.inconclusive++;
		return;
	}
	let currentHash: string;
	try {
		currentHash = await hashRegistry.getOrCompute(marker.fileId);
	} catch {
		report.inconclusive++;
		return;
	}
	if (currentHash === marker.sourceHashAtCoding) {
		report.fresh++;
	} else {
		report.stale.push({
			markerId: marker.id,
			fileId: marker.fileId,
			engine,
			snapshotHash: marker.sourceHashAtCoding,
			currentHash,
		});
	}
}

export async function detectStaleMarkers(
	data: QualiaData,
	hashRegistry: SourceHashRegistry,
): Promise<StaleReport> {
	const report: StaleReport = { fresh: 0, stale: [], inconclusive: 0 };

	for (const markers of Object.values(data.markdown.markers ?? {})) {
		for (const m of markers) await classify(m, 'markdown', hashRegistry, report);
	}
	for (const m of data.pdf.markers ?? []) await classify(m, 'pdf', hashRegistry, report);
	for (const s of data.pdf.shapes ?? []) await classify(s, 'pdf', hashRegistry, report);
	for (const m of data.csv.segmentMarkers ?? []) await classify(m, 'csvSegment', hashRegistry, report);
	for (const m of data.csv.rowMarkers ?? []) await classify(m, 'csvRow', hashRegistry, report);
	for (const m of data.image.markers ?? []) await classify(m, 'image', hashRegistry, report);
	for (const f of data.audio.files ?? []) {
		for (const m of f.markers) await classify(m, 'audio', hashRegistry, report);
	}
	for (const f of data.video.files ?? []) {
		for (const m of f.markers) await classify(m, 'video', hashRegistry, report);
	}

	return report;
}
```

- [ ] **Step 3: Run tests + commit**

`~/.claude/scripts/commit.sh "feat(icr): detectStaleMarkers puro — itera 6 engines + classifica fresh/stale/inconclusive"`

---

## Chunk 3 — Wire piloto markdown + plugin API

### Task 4: Wire `attachSourceHashSnapshot` em markdown marker creation

**Files:**
- Modify: `src/markdown/models/codeMarkerModel.ts` (callsite após criar Marker)

Localizar onde Marker é criado em `codeMarkerModel.ts`. Adicionar callsite `attachSourceHashSnapshot(marker, plugin.sourceHashRegistry)` após a criação. Fire-and-forget (async, não bloqueia UI).

- [ ] **Step 1: Locate marker creation** — `grep -n "createdAt: Date.now\|new.*Marker\|markerType: 'markdown'" src/markdown/models/codeMarkerModel.ts`

- [ ] **Step 2: Add callsite (após push em this.markers)**

Pseudo (adapt pro path real):

```typescript
// src/markdown/models/codeMarkerModel.ts
import { attachSourceHashSnapshot } from '../../core/icr/provenance/attachSourceHashSnapshot';

// ... dentro do método de criação de marker:
const marker: Marker = { ... /* campos como antes */ };
this.markers.set(fileId, [...]);
// Fire-and-forget — não bloqueia UI
void attachSourceHashSnapshot(marker, this.plugin.sourceHashRegistry).then(() => {
  this.markDirty();
});
```

- [ ] **Step 3: Build + test**

- [ ] **Step 4: Commit**

`~/.claude/scripts/commit.sh "feat(icr): wire attachSourceHashSnapshot em markdown marker creation (piloto — outros engines em slice futuro)"`

---

### Task 5: Plugin API expose detectStaleMarkers

**Files:**
- Modify: `src/main.ts` (icrTransport ganha detectStaleMarkers)

- [ ] **Step 1: Add to icrTransport API**

```typescript
// src/main.ts
import { detectStaleMarkers } from './core/icr/provenance/detectStaleMarkers';

// dentro icrTransport setup:
this.icrTransport = {
	extract: ...,
	merge: ...,
	detectStaleMarkers: () => detectStaleMarkers(
		this.dataManager.getDataRef(),
		this.sourceHashRegistry,
	),
};
```

- [ ] **Step 2: Update type interface in main.ts**

- [ ] **Step 3: Build + test**

- [ ] **Step 4: Commit**

`~/.claude/scripts/commit.sh "feat(icr): plugin.icrTransport.detectStaleMarkers exposed pra console"`

---

## Chunk 4 — Smoke + closing

### Task 6: Smoke test multi-engine

**Files:**
- Create: `tests/core/icr/provenance/staleSmoke.test.ts`

Cenário: 3 markers em engines diferentes, 1 fresh, 1 stale, 1 inconclusive.

- [ ] **Step 1-2:** test + run.

- [ ] **Step 3: Commit**

---

### Task 7: CHANGELOG + close

- [ ] **Step 1:** CHANGELOG entry.

- [ ] **Step 2:** Final test + build.

- [ ] **Step 3: Tag + merge + push**

```bash
git checkout main
git tag pre-icr-slice-5-baseline 8a4bea6
git merge feat/icr-slice-5-provenance-audit --ff-only
git tag post-icr-slice-5-checkpoint HEAD
git push origin main pre-icr-slice-5-baseline post-icr-slice-5-checkpoint
git branch -d feat/icr-slice-5-provenance-audit
```

---

## Success Criteria

1. ✅ `sourceHashAtCoding?: string` em todos marker types
2. ✅ `attachSourceHashSnapshot` helper testado (idempotente, swallow errors)
3. ✅ `detectStaleMarkers` itera 6 engines + classifica corretamente
4. ✅ Markdown creation populates snapshot (piloto)
5. ✅ `plugin.icrTransport.detectStaleMarkers()` chamável via console
6. ✅ Smoke verde
7. ✅ Tests verde (2951+)

## Não-objetivos

Já em `BACKLOG.md`:
- Wiring em outros engines (PDF / CSV / image / audio / video) — slice de extensão
- UI pra mostrar stale markers (Fase C P1)
- Auto-recompute snapshot
- Migração ativa de markers existentes
