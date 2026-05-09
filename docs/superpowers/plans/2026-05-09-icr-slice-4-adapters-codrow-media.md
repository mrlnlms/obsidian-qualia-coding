# ICR Slice 4 — Adapters cod row + áudio/vídeo Implementation Plan

> **For agentic workers:** Execução inline. TDD por task. Smoke via vitest (sem UI).

**Goal:** Estender motor κ pra cobrir mais 3 engines: **CSV cod row** (categórico — Cohen κ sobre unidades pré-definidas), **áudio** e **vídeo** (overlap temporal em segundos, alinhado com ATLAS.ti 25). Reusa coeficientes existentes pra áudio/vídeo (mesmo algoritmo, espaço de coordenadas em segundos); coeficientes categóricos novos pra cod row (sem geometria).

**Architecture:** (a) Refactor pequeno: `totalChars → totalUnits` em `SourceMeta` (semântica fica certa pra todas engines). (b) Adapter `extractMediaRange` pra MediaMarker (audio/video) — `Math.floor(from)` / `Math.ceil(to)` arredonda pra segundos; reusa coeficientes existentes. (c) Adapter `extractRowMarkerUnit` pra RowMarker (CSV) — sem geometria, retorna unit categórico; novos coeficientes `cohenKappaCategorical`/`fleissKappaCategorical`/`krippendorffAlphaCategoricalNominal` operam sobre `Map<unitKey, Map<coderId, codeIds>>` direto (sem char explosion). (d) Reporter EngineId expandido pra `csvRow`/`audio`/`video` + warning explícito quando engines de unidades incomparáveis entram no aggregate.

**Tech Stack:** TypeScript strict, reusa SourceHashRegistry/CoderRegistry/computeSourceHash. Sem deps novas.

**Pré-requisitos:**
- Slice 1 (motor κ texto) ✅
- Slice 2 (hash) ✅
- Slice 3 (transport) ✅

**Decisões cravadas:**
- Resolução temporal áudio/vídeo: 1 segundo (Math.floor/Math.ceil — conservador, cobre todo segmento parcial)
- Alinhamento ATLAS.ti 25 pra áudio/vídeo
- Cod row: Cohen κ standard sobre matriz de confusão de unit-level decisions (não usa char explosion)
- Universe pra cod row: conjunto de `(fileId, sourceRowId, column)` que ALGUM coder marcou
- Source duration audio/video: caller passa `totalUnits` (= totalSeconds) — runtime usa `HTMLMediaElement.duration`, testes mockam
- Reporter aggregate: warning explícito quando engines de unidades incomparáveis (chars/segundos/categórico) entram juntos

**Out of scope (registrado em `BACKLOG.md > 🧱 ICR — Adapters fora do Slice 4`):**
- PDF shape + imagem (bbox IoU — terreno aberto, brainstorm metodológico precede)
- Resolução sub-segundo pra áudio/vídeo
- Pre-warm de durações de media files
- UI pra Compare Coders cobrir cod row + media (gated em UX brainstorm)

---

## File Structure

```
src/core/icr/
  kappaInput.ts                       — MODIFY: rename totalChars → totalUnits
  textRange.ts                        — extend: extractMediaRange + extractRowMarkerUnit
  categoricalKappaInput.ts            — NEW: input shape pra cod row (sem char explosion)
  coefficients/
    cohenKappa.ts                     — MODIFY: usa totalUnits no doc, lógica não muda
    cohenKappaCategorical.ts          — NEW: Cohen κ sobre unit-level decisions
    fleissKappaCategorical.ts         — NEW: Fleiss κ categórico
    krippendorffAlphaCategorical.ts   — NEW: α nominal categórico
  reporter.ts                         — MODIFY: EngineId expandido + warning aggregate cross-unit

tests/core/icr/
  textRange.test.ts                   — MODIFY: testes pra extractMediaRange + extractRowMarkerUnit
  categoricalKappaInput.test.ts       — NEW
  coefficients/
    cohenKappaCategorical.test.ts     — NEW
    fleissKappaCategorical.test.ts    — NEW
    krippendorffAlphaCategorical.test.ts — NEW
  reporter.test.ts                    — MODIFY: testes pra novos engines
```

---

## Chunk 1 — Refactor: totalChars → totalUnits

### Task 1: rename em SourceMeta + callsites

**Files:**
- Modify: `src/core/icr/kappaInput.ts` (rename field + iterateAllCharKeys → iterateAllUnitKeys)
- Modify: `src/core/icr/coefficients/*.ts` (4 arquivos referenciando)
- Modify: `tests/core/icr/**/*.test.ts` (todos com `totalChars`)

- [ ] **Step 1: grep callsites**

`grep -rn "totalChars\|iterateAllCharKeys" src/ tests/ | head`

- [ ] **Step 2: Rename em kappaInput.ts**

```typescript
// src/core/icr/kappaInput.ts
export interface SourceMeta {
	fileId: string;
	locator: string;
	totalUnits: number;  // renamed from totalChars; pode ser chars (texto) ou segundos (audio/video)
}

// rename function
export function* iterateAllUnitKeys(sources: SourceMeta[]): Generator<string> {
	// ... mesmo loop, totalUnits em vez de totalChars
}

// Manter alias deprecated por 1 commit pra compile passar (vai sumir após callsites updateds):
export const iterateAllCharKeys = iterateAllUnitKeys;
```

- [ ] **Step 3: Update callsites (find/replace global)**

```bash
# Confirma que só esses arquivos referenciam:
grep -l "totalChars\|iterateAllCharKeys" src/ tests/ -r
```

Aplicar replace em cada um (geralmente 4 coeficientes + 1 cuAlpha + tests).

- [ ] **Step 4: Remove deprecated alias** após builds passar

```typescript
// src/core/icr/kappaInput.ts — remover linha:
// export const iterateAllCharKeys = iterateAllUnitKeys;
```

- [ ] **Step 5: Build + test**

`npm run build && npm run test 2>&1 | tail -8`. Expected: 2928+ verde.

- [ ] **Step 6: Commit**

`~/.claude/scripts/commit.sh "refactor(icr): rename totalChars → totalUnits em SourceMeta (prepara extensão pra áudio/vídeo onde unit = segundo)"`

---

## Chunk 2 — Adapter áudio/vídeo

### Task 2: extractMediaRange + reporter EngineId expansion

**Files:**
- Modify: `src/core/icr/textRange.ts` (adiciona extractMediaRange)
- Modify: `src/core/icr/reporter.ts` (EngineId += audio | video)

- [ ] **Step 1: Write failing test pra extractMediaRange**

```typescript
// tests/core/icr/textRange.test.ts (adicionar describe)
import { extractMediaRange } from '../../../src/core/icr/textRange';
import type { MediaMarker } from '../../../src/media/mediaTypes';

describe('extractMediaRange', () => {
	it('rounds from/to to integer seconds (floor/ceil)', () => {
		const m: MediaMarker = {
			markerType: 'audio', id: 'm1', fileId: 'audio.mp3',
			from: 12.3, to: 18.7,
			codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = extractMediaRange(m);
		expect(r.fileId).toBe('audio.mp3');
		expect(r.locator).toBe('audio');
		expect(r.from).toBe(12);  // floor
		expect(r.to).toBe(19);    // ceil
	});

	it('uses video locator pra video markers', () => {
		const m: MediaMarker = {
			markerType: 'video', id: 'm2', fileId: 'video.mp4',
			from: 5.0, to: 10.0, codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = extractMediaRange(m);
		expect(r.locator).toBe('video');
		expect(r.from).toBe(5);
		expect(r.to).toBe(10);
	});

	it('handles fractional both ends', () => {
		const m: MediaMarker = {
			markerType: 'audio', id: 'm3', fileId: 'a.mp3',
			from: 0.1, to: 0.9, codes: [], createdAt: 1, updatedAt: 1,
		};
		const r = extractMediaRange(m);
		expect(r.from).toBe(0);
		expect(r.to).toBe(1);
	});
});
```

- [ ] **Step 2: Implement extractMediaRange**

```typescript
// src/core/icr/textRange.ts (adicionar)
import type { MediaMarker } from '../../media/mediaTypes';

/** Áudio/vídeo — overlap temporal em segundos. Math.floor/ceil arredonda
 *  pra inteiros (resolução 1s, alinhado com ATLAS.ti 25). */
export function extractMediaRange(m: MediaMarker): TextRange {
	return {
		fileId: m.fileId,
		locator: m.markerType,  // 'audio' | 'video'
		from: Math.floor(m.from),
		to: Math.ceil(m.to),
	};
}
```

- [ ] **Step 3: Run tests** — expect pass.

- [ ] **Step 4: Update EngineId em reporter**

```typescript
// src/core/icr/reporter.ts
export type EngineId = 'markdown' | 'pdf' | 'csvSegment' | 'csvRow' | 'audio' | 'video';
```

(csvRow será usado em Task 3-5; audio/video já podem ser usados via reporter agora — reusa coeficientes existentes.)

- [ ] **Step 5: Build + test**

- [ ] **Step 6: Commit**

`~/.claude/scripts/commit.sh "feat(icr): extractMediaRange adapter (audio/video em segundos arredondados) + EngineId expandido"`

---

### Task 3: Reporter aggregate warning cross-unit

**Files:**
- Modify: `src/core/icr/reporter.ts`

Quando reporter agrega entre engines com unidades incomparáveis (chars/segundos/categórico), adicionar warning explícito no result.

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/reporter.test.ts (adicionar)
it('emits warning when aggregating engines with incomparable units', () => {
	const inputs: EngineKappaInput[] = [
		{ engine: 'markdown', kappaInput: { /* texto, chars */ markers: [], sources: [{ fileId: 'a.md', locator: '', totalUnits: 100 }], coders: ['a'] } },
		{ engine: 'audio', kappaInput: { /* segundos */ markers: [], sources: [{ fileId: 'a.mp3', locator: 'audio', totalUnits: 60 }], coders: ['a'] } },
	];
	const r = reportKappa(inputs);
	expect(r.aggregateWarnings ?? []).toContain('Aggregate combines engines with incomparable units (chars vs seconds vs categorical) — use per-engine values for analytical comparison');
});
```

- [ ] **Step 2: Implement warning + KappaReport.aggregateWarnings field**

```typescript
// src/core/icr/reporter.ts
export interface KappaReport {
	byEngine: Partial<Record<EngineId, CoefficientReport>>;
	aggregate: CoefficientReport;
	weights: Partial<Record<EngineId, number>>;
	aggregateWarnings: string[];  // NEW
}

const TEXT_LIKE_ENGINES: EngineId[] = ['markdown', 'pdf', 'csvSegment'];
const TEMPORAL_ENGINES: EngineId[] = ['audio', 'video'];
const CATEGORICAL_ENGINES: EngineId[] = ['csvRow'];

export function reportKappa(inputs: EngineKappaInput[]): KappaReport {
	// ... existing logic
	const engines = Object.keys(byEngine) as EngineId[];

	const unitFamilies = new Set<string>();
	for (const e of engines) {
		if (TEXT_LIKE_ENGINES.includes(e)) unitFamilies.add('chars');
		if (TEMPORAL_ENGINES.includes(e)) unitFamilies.add('seconds');
		if (CATEGORICAL_ENGINES.includes(e)) unitFamilies.add('categorical');
	}

	const aggregateWarnings: string[] = [];
	if (unitFamilies.size > 1) {
		aggregateWarnings.push('Aggregate combines engines with incomparable units (chars vs seconds vs categorical) — use per-engine values for analytical comparison');
	}

	return { byEngine, aggregate, weights, aggregateWarnings };
}
```

- [ ] **Step 3: Run tests** — expect pass.

- [ ] **Step 4: Commit**

`~/.claude/scripts/commit.sh "feat(icr): reporter emite aggregateWarnings quando engines de unidades incomparáveis entram (chars vs seconds vs categorical)"`

---

## Chunk 3 — Cod row adapter + categorical coefficients

### Task 4: Categorical input shape + extractRowMarkerUnit adapter

**Files:**
- Create: `src/core/icr/categoricalKappaInput.ts`
- Modify: `src/core/icr/textRange.ts` (adiciona extractRowMarkerUnit)
- Test: `tests/core/icr/categoricalKappaInput.test.ts`

- [ ] **Step 1: Write types + failing test**

```typescript
// tests/core/icr/categoricalKappaInput.test.ts
import { describe, it, expect } from 'vitest';
import {
	extractRowMarkerUnit,
	makeCategoricalUnitKey,
	type CategoricalUnit,
	type CategoricalKappaInput,
} from '../../../src/core/icr/categoricalKappaInput';
import type { RowMarker } from '../../../src/csv/csvCodingTypes';

describe('extractRowMarkerUnit', () => {
	it('returns unit with fileId + sourceRowId + column + codeIds + coderId', () => {
		const m: RowMarker = {
			markerType: 'csv', id: 'm1', fileId: 'data.csv',
			sourceRowId: 5, column: 'response',
			codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		};
		const unit = extractRowMarkerUnit(m);
		expect(unit.fileId).toBe('data.csv');
		expect(unit.sourceRowId).toBe(5);
		expect(unit.column).toBe('response');
		expect(unit.codeIds).toEqual(['c1']);
		expect(unit.coderId).toBe('human:carla');
	});
});

describe('makeCategoricalUnitKey', () => {
	it('creates stable key from fileId + sourceRowId + column', () => {
		const key = makeCategoricalUnitKey('data.csv', 5, 'response');
		expect(key).toBe('data.csv|row:5|col:response');
	});
});
```

- [ ] **Step 2: Implement**

```typescript
// src/core/icr/categoricalKappaInput.ts
import type { CoderId } from './coderTypes';
import type { RowMarker } from '../../csv/csvCodingTypes';

/** Unit categórico — sem geometria, identidade pré-definida (file + row + column). */
export interface CategoricalUnit {
	fileId: string;
	sourceRowId: number;
	column: string;
	codeIds: string[];
	coderId: CoderId;
}

/** Input pros coeficientes categóricos. */
export interface CategoricalKappaInput {
	units: CategoricalUnit[];
	coders: CoderId[];
}

export function makeCategoricalUnitKey(fileId: string, sourceRowId: number, column: string): string {
	return `${fileId}|row:${sourceRowId}|col:${column}`;
}

export function extractRowMarkerUnit(m: RowMarker): CategoricalUnit {
	return {
		fileId: m.fileId,
		sourceRowId: m.sourceRowId,
		column: m.column,
		codeIds: m.codes.map(ca => ca.codeId),
		coderId: m.codedBy ?? 'human:default',
	};
}
```

- [ ] **Step 3: Run tests** — expect pass.

- [ ] **Step 4: Commit**

`~/.claude/scripts/commit.sh "feat(icr): CategoricalKappaInput shape + extractRowMarkerUnit adapter (cod row sem geometria)"`

---

### Task 5: cohenKappaCategorical

**Files:**
- Create: `src/core/icr/coefficients/cohenKappaCategorical.ts`
- Test: `tests/core/icr/coefficients/cohenKappaCategorical.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/icr/coefficients/cohenKappaCategorical.test.ts
import { describe, it, expect } from 'vitest';
import { cohenKappaCategorical } from '../../../../src/core/icr/coefficients/cohenKappaCategorical';
import type { CategoricalKappaInput } from '../../../../src/core/icr/categoricalKappaInput';

describe('cohenKappaCategorical', () => {
	it('returns 1.0 on perfect agreement', () => {
		const input: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'b' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c2'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c2'], coderId: 'b' },
			],
			coders: ['a', 'b'],
		};
		expect(cohenKappaCategorical(input, 'a', 'b')).toBeCloseTo(1.0, 3);
	});

	it('returns < 1 with disagreement', () => {
		const input: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c2'], coderId: 'b' },
			],
			coders: ['a', 'b'],
		};
		const k = cohenKappaCategorical(input, 'a', 'b');
		expect(k).toBeLessThanOrEqual(0);
	});

	it('handles unit only marked by one coder (other = __none__)', () => {
		const input: CategoricalKappaInput = {
			units: [
				{ fileId: 'd.csv', sourceRowId: 0, column: 'r', codeIds: ['c1'], coderId: 'a' },
				// b nunca codou row 0
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c1'], coderId: 'a' },
				{ fileId: 'd.csv', sourceRowId: 1, column: 'r', codeIds: ['c1'], coderId: 'b' },
			],
			coders: ['a', 'b'],
		};
		const k = cohenKappaCategorical(input, 'a', 'b');
		expect(k).toBeGreaterThan(0);
		expect(k).toBeLessThan(1);
	});

	it('returns 1 for empty input', () => {
		const input: CategoricalKappaInput = { units: [], coders: ['a', 'b'] };
		expect(cohenKappaCategorical(input, 'a', 'b')).toBe(1);
	});
});
```

- [ ] **Step 2: Implement**

```typescript
// src/core/icr/coefficients/cohenKappaCategorical.ts
import type { CategoricalKappaInput } from '../categoricalKappaInput';
import { makeCategoricalUnitKey } from '../categoricalKappaInput';
import type { CoderId } from '../coderTypes';

const NONE = '__none__';

/** Cohen κ pareado sobre unit-level decisions (cod row).
 *  Universe = todas units distintas onde algum coder marcou. */
export function cohenKappaCategorical(input: CategoricalKappaInput, coderA: CoderId, coderB: CoderId): number {
	// Build map: unitKey → { coderId → first codeId }
	const unitMap = new Map<string, Map<CoderId, string>>();
	for (const u of input.units) {
		const key = makeCategoricalUnitKey(u.fileId, u.sourceRowId, u.column);
		let coderMap = unitMap.get(key);
		if (!coderMap) { coderMap = new Map(); unitMap.set(key, coderMap); }
		const code = u.codeIds.length > 0 ? [...u.codeIds].sort()[0]! : NONE;
		coderMap.set(u.coderId, code);
	}

	if (unitMap.size === 0) return 1;

	const matrix = new Map<string, number>();
	const marginalsA = new Map<string, number>();
	const marginalsB = new Map<string, number>();
	let total = 0;

	for (const coderMap of unitMap.values()) {
		const rA = coderMap.get(coderA) ?? NONE;
		const rB = coderMap.get(coderB) ?? NONE;
		const cellKey = `${rA}|${rB}`;
		matrix.set(cellKey, (matrix.get(cellKey) ?? 0) + 1);
		marginalsA.set(rA, (marginalsA.get(rA) ?? 0) + 1);
		marginalsB.set(rB, (marginalsB.get(rB) ?? 0) + 1);
		total++;
	}

	let po = 0;
	const allCats = new Set([...marginalsA.keys(), ...marginalsB.keys()]);
	for (const r of allCats) po += matrix.get(`${r}|${r}`) ?? 0;
	po /= total;

	let pe = 0;
	for (const r of allCats) {
		const pA = (marginalsA.get(r) ?? 0) / total;
		const pB = (marginalsB.get(r) ?? 0) / total;
		pe += pA * pB;
	}

	if (pe === 1) return 1;
	return (po - pe) / (1 - pe);
}
```

- [ ] **Step 3: Run tests** — expect pass.

- [ ] **Step 4: Commit**

`~/.claude/scripts/commit.sh "feat(icr): cohenKappaCategorical pareado sobre unit-level decisions (cod row)"`

---

### Task 6: fleissKappaCategorical + krippendorffAlphaCategoricalNominal

**Files:**
- Create: `src/core/icr/coefficients/fleissKappaCategorical.ts`
- Create: `src/core/icr/coefficients/krippendorffAlphaCategorical.ts`
- Tests: ambos

Análogo aos existentes mas operando sobre unit-level decisions.

- [ ] **Step 1: Implement fleissKappaCategorical seguindo pattern do fleissKappa.ts** — itera unitMap em vez de iterateAllUnitKeys, conta categorias por unit.

- [ ] **Step 2: Implement krippendorffAlphaCategoricalNominal seguindo pattern do krippendorffAlpha.ts** — coincidence matrix sobre unitMap em vez de char keys.

- [ ] **Step 3: Tests análogos a cohenKappaCategorical (perfect / disagreement / single coder / empty).**

- [ ] **Step 4: Run + commit**

`~/.claude/scripts/commit.sh "feat(icr): fleissKappaCategorical + krippendorffAlphaCategoricalNominal pra cod row"`

---

## Chunk 4 — Reporter integration

### Task 7: csvRow + audio + video no reporter

**Files:**
- Modify: `src/core/icr/reporter.ts`

Reporter `computeAll` precisa lidar com 2 inputs diferentes: `KappaInput` (texto-likes + audio/video) e `CategoricalKappaInput` (cod row).

- [ ] **Step 1: Refactor reporter pra aceitar union de inputs**

```typescript
// src/core/icr/reporter.ts
export interface EngineKappaInput {
	engine: EngineId;
	kappaInput: KappaInput | CategoricalKappaInput;
}

function computeAll(input: KappaInput | CategoricalKappaInput): CoefficientReport {
	if ('units' in input) {
		// CategoricalKappaInput — cod row
		const cohen: Record<string, number> = {};
		for (let i = 0; i < input.coders.length; i++) {
			for (let j = i + 1; j < input.coders.length; j++) {
				const key = `${input.coders[i]}|${input.coders[j]}`;
				cohen[key] = cohenKappaCategorical(input, input.coders[i]!, input.coders[j]!);
			}
		}
		return {
			cohenKappa: cohen,
			fleissKappa: fleissKappaCategorical(input),
			alphaNominal: krippendorffAlphaCategoricalNominal(input),
			alphaBinary: 1,  // categorical não tem boundary disagreement
			cuAlpha: 1,      // categorical não tem code-within-boundary
		};
	}
	// existing path: KappaInput
	// ... (como já estava)
}
```

- [ ] **Step 2: Add tests pro fluxo categorical no reporter**

- [ ] **Step 3: Run tests + commit**

`~/.claude/scripts/commit.sh "feat(icr): reporter aceita CategoricalKappaInput (csvRow) — alphaBinary/cuAlpha=1 (não-aplicáveis pra categorical)"`

---

## Chunk 5 — Smoke + closing

### Task 8: Smoke test multi-engine

**Files:**
- Create: `tests/core/icr/transport/multiEngineSmoke.test.ts` ou expandir smoke.test.ts existente

Cenário: 2 coders codificam (markdown + audio + csvRow) sobre conjunto realista, reporter gera per-engine + aggregate, warning de unidades incomparáveis aparece.

- [ ] **Step 1-2:** test + run.

- [ ] **Step 3: Commit**

`~/.claude/scripts/commit.sh "test(icr): smoke multi-engine (text + audio + csvRow) — reporter gera per-engine + aggregate com unit warning"`

---

### Task 9: CHANGELOG + final close

- [ ] **Step 1: CHANGELOG entry** com parágrafo Slice 4.

- [ ] **Step 2: Final test + build**

- [ ] **Step 3: Tag + merge + push**

```bash
git checkout main
git tag pre-icr-slice-4-baseline a3b2c06 -m "Estado antes do Slice 4 ICR adapters"
git merge feat/icr-slice-4-adapters-codrow-media --ff-only
git tag post-icr-slice-4-checkpoint HEAD
git push origin main pre-icr-slice-4-baseline post-icr-slice-4-checkpoint
git branch -d feat/icr-slice-4-adapters-codrow-media
```

---

## Success Criteria

1. ✅ `totalChars → totalUnits` rename concluído sem regressão
2. ✅ `extractMediaRange` arredonda from/to pra inteiros de segundo
3. ✅ `extractRowMarkerUnit` retorna unit categórico
4. ✅ 3 coeficientes categóricos verde (cohen + fleiss + α)
5. ✅ Reporter aceita ambos input shapes (KappaInput + CategoricalKappaInput)
6. ✅ Reporter emite `aggregateWarnings` quando engines de unidades incomparáveis entram juntos
7. ✅ Smoke multi-engine: text + audio + csvRow verde
8. ✅ `npm run test` verde (2928+)

## Não-objetivos

Já em `BACKLOG.md > 🧱 ICR — Adapters fora do Slice 4`:
- PDF shape + imagem (terreno aberto)
- Sub-segundo
- Pre-warm durações
- UI Compare Coders pra novos engines (gated em UX brainstorm)
