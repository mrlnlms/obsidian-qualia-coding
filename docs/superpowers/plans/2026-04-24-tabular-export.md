# Tabular Export Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exportar dados codificados do projeto como zip de CSVs (segments, code_applications, codes, case_variables, relations opcional) + README.md, para consumo em R/Python/BI.

**Architecture:** Novo diretório `src/export/tabular/` com 7 módulos: orquestrador + 5 builders de tabela + csvWriter + readmeBuilder. Cada builder é função pura que recebe data e retorna `string[][]`. Orquestrador resolve dependências externas (leitura de CSV pra texto de segmentos) e empacota via `fflate.zipSync`. Integração mínima em 3 arquivos existentes: `exportModal.ts` (3ª opção no dropdown + 2 toggles), `exportCommands.ts` (nova command), `core/settingTab.ts` (botão).

**Tech Stack:** TypeScript strict, fflate (já bundled), PapaParse (já bundled, usado no CSV engine), Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-04-24-tabular-export-design.md`

---

## Chunk 1: Foundations (csvWriter + readmeBuilder)

### Task 1.1: csvWriter — escape e quoting de CSV

**Files:**
- Create: `src/export/tabular/csvWriter.ts`
- Test: `tests/export/tabular/csvWriter.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/export/tabular/csvWriter.test.ts
import { describe, it, expect } from 'vitest';
import { toCsv } from '../../../src/export/tabular/csvWriter';

describe('csvWriter.toCsv', () => {
  it('joins cells with comma and rows with LF', () => {
    const out = toCsv([['a', 'b'], ['c', 'd']]);
    expect(out).toBe('﻿a,b\nc,d\n');
  });

  it('escapes cells with comma by wrapping in double quotes', () => {
    const out = toCsv([['a,b', 'c']]);
    expect(out).toBe('﻿"a,b",c\n');
  });

  it('escapes cells with double quote by doubling the quote', () => {
    const out = toCsv([['he said "hi"']]);
    expect(out).toBe('﻿"he said ""hi"""\n');
  });

  it('escapes cells with newline by wrapping in double quotes', () => {
    const out = toCsv([['line1\nline2']]);
    expect(out).toBe('﻿"line1\nline2"\n');
  });

  it('emits empty string for null/undefined', () => {
    const out = toCsv([['a', null, undefined, 'b']]);
    expect(out).toBe('﻿a,,,b\n');
  });

  it('coerces numbers to string without quoting', () => {
    const out = toCsv([[1, 2.5, 0]]);
    expect(out).toBe('﻿1,2.5,0\n');
  });

  it('prepends UTF-8 BOM so Excel detects encoding', () => {
    const out = toCsv([['a']]);
    expect(out.charCodeAt(0)).toBe(0xFEFF);
  });

  it('preserves unicode (emoji, accents)', () => {
    const out = toCsv([['café 😀']]);
    expect(out).toBe('﻿café 😀\n');
  });

  it('returns empty string for empty input', () => {
    expect(toCsv([])).toBe('﻿');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/export/tabular/csvWriter.test.ts`
Expected: FAIL (module doesn't exist yet)

- [ ] **Step 3: Implement**

```typescript
// src/export/tabular/csvWriter.ts

/**
 * Convert a 2D array of cells to a CSV string. Handles escape of comma,
 * double quote, and newline per RFC 4180. UTF-8 BOM prepended so Excel
 * detects encoding correctly.
 *
 * Null/undefined → empty cell. Numbers/booleans coerced via String().
 */
export type CellValue = string | number | boolean | null | undefined;

const BOM = '﻿';

export function toCsv(rows: CellValue[][]): string {
	if (rows.length === 0) return BOM;
	return BOM + rows.map(rowToCsv).join('\n') + '\n';
}

function rowToCsv(row: CellValue[]): string {
	return row.map(cellToCsv).join(',');
}

function cellToCsv(cell: CellValue): string {
	if (cell === null || cell === undefined) return '';
	const s = String(cell);
	if (needsQuoting(s)) {
		return '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

function needsQuoting(s: string): boolean {
	return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/export/tabular/csvWriter.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/export/tabular/csvWriter.ts tests/export/tabular/csvWriter.test.ts
~/.claude/scripts/commit.sh "feat(export/tabular): csvWriter com escape RFC 4180 + UTF-8 BOM"
```

### Task 1.2: readmeBuilder — gera README.md embutido no zip

**Files:**
- Create: `src/export/tabular/readmeBuilder.ts`
- Test: `tests/export/tabular/readmeBuilder.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/export/tabular/readmeBuilder.test.ts
import { describe, it, expect } from 'vitest';
import { buildReadme } from '../../../src/export/tabular/readmeBuilder';

describe('buildReadme', () => {
  const baseOpts = {
    pluginVersion: '0.1.0',
    includeRelations: true,
    includeShapeCoords: true,
    warnings: [] as string[],
  };

  it('includes header with timestamp and plugin version', () => {
    const md = buildReadme(baseOpts);
    expect(md).toContain('# Qualia Coding — Tabular Export');
    expect(md).toContain('0.1.0');
    expect(md).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO 8601
  });

  it('includes table schema for all 4 mandatory files', () => {
    const md = buildReadme(baseOpts);
    expect(md).toContain('segments.csv');
    expect(md).toContain('code_applications.csv');
    expect(md).toContain('codes.csv');
    expect(md).toContain('case_variables.csv');
  });

  it('includes relations.csv schema only when includeRelations=true', () => {
    expect(buildReadme({ ...baseOpts, includeRelations: true })).toContain('relations.csv');
    expect(buildReadme({ ...baseOpts, includeRelations: false })).not.toContain('relations.csv');
  });

  it('mentions shape_coords columns only when includeShapeCoords=true', () => {
    expect(buildReadme({ ...baseOpts, includeShapeCoords: true })).toContain('shape_coords');
    expect(buildReadme({ ...baseOpts, includeShapeCoords: false })).not.toContain('shape_coords');
  });

  it('includes R and Python code snippets', () => {
    const md = buildReadme(baseOpts);
    expect(md).toMatch(/```r/);
    expect(md).toContain('library(tidyverse)');
    expect(md).toMatch(/```python/);
    expect(md).toContain('import pandas');
  });

  it('appends Warnings section when warnings provided', () => {
    const md = buildReadme({ ...baseOpts, warnings: ['W1', 'W2'] });
    expect(md).toContain('## Warnings (2)');
    expect(md).toContain('- W1');
    expect(md).toContain('- W2');
  });

  it('omits Warnings section when list is empty', () => {
    const md = buildReadme({ ...baseOpts, warnings: [] });
    expect(md).not.toContain('## Warnings');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/export/tabular/readmeBuilder.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/export/tabular/readmeBuilder.ts

export interface ReadmeOptions {
	pluginVersion: string;
	includeRelations: boolean;
	includeShapeCoords: boolean;
	warnings: string[];
}

export function buildReadme(opts: ReadmeOptions): string {
	const sections: string[] = [];
	sections.push(header(opts));
	sections.push(schemaSegments(opts));
	sections.push(schemaCodeApplications());
	sections.push(schemaCodes());
	sections.push(schemaCaseVariables());
	if (opts.includeRelations) sections.push(schemaRelations());
	sections.push(exampleR());
	sections.push(examplePython());
	if (opts.warnings.length > 0) sections.push(warningsSection(opts.warnings));
	return sections.join('\n\n') + '\n';
}

function header(opts: ReadmeOptions): string {
	const ts = new Date().toISOString();
	return [
		'# Qualia Coding — Tabular Export',
		'',
		`- Generated: ${ts}`,
		`- Plugin version: ${opts.pluginVersion}`,
		'',
		'This zip contains your coding data in flat relational CSVs for external analysis in R, Python, or BI tools.',
		'',
		'Use `readr::read_csv` (R, tidyverse) or `pd.read_csv` (Python, pandas) — they handle quoting and the UTF-8 BOM correctly. Base R `read.csv` may have edge cases with multi-line quoted text.',
	].join('\n');
}

function schemaSegments(opts: ReadmeOptions): string {
	const shape = opts.includeShapeCoords
		? '| `shape_type` | `rect` / `ellipse` / `polygon` |\n| `shape_coords` | JSON of coords. PDF scale 0-100, image scale 0-1 |\n'
		: '';
	return [
		'## `segments.csv`',
		'',
		'One row per coded segment. Columns beyond the common header vary by `sourceType` (empty when not applicable).',
		'',
		'| Column | Notes |',
		'|---|---|',
		'| `id` | internal id |',
		'| `fileId` | path in the vault |',
		'| `engine` | `markdown` / `pdf` / `image` / `audio` / `video` / `csv` |',
		'| `sourceType` | `markdown` / `pdf_text` / `pdf_shape` / `image` / `audio` / `video` / `csv_segment` / `csv_row` |',
		'| `text` | full text when available (empty for shapes/media) |',
		'| `memo` | |',
		'| `createdAt`, `updatedAt` | ISO 8601 |',
		'| `page` | PDF only (1-based) |',
		'| `begin_index`, `begin_offset`, `end_index`, `end_offset` | PDF text only |',
		'| `line_from`, `ch_from`, `line_to`, `ch_to` | Markdown only |',
		'| `row`, `column`, `cell_from`, `cell_to` | CSV only |',
		'| `time_from`, `time_to` | Audio/Video, milliseconds |',
		shape,
	].filter(Boolean).join('\n');
}

function schemaCodeApplications(): string {
	return [
		'## `code_applications.csv`',
		'',
		'One row per `(segment, code)` pair. A segment with N codes yields N rows.',
		'',
		'| Column | Notes |',
		'|---|---|',
		'| `segment_id` | → `segments.id` |',
		'| `code_id` | → `codes.id` |',
		'| `magnitude` | nullable |',
	].join('\n');
}

function schemaCodes(): string {
	return [
		'## `codes.csv`',
		'',
		'Codebook denormalized. Folders (visual organization) are not exported.',
		'',
		'| Column | Notes |',
		'|---|---|',
		'| `id` | |',
		'| `name` | |',
		'| `color` | hex |',
		'| `parent_id` | nullable, → `codes.id` |',
		'| `description` | |',
		'| `magnitude_config` | nullable, JSON of `{type, values}` |',
	].join('\n');
}

function schemaCaseVariables(): string {
	return [
		'## `case_variables.csv`',
		'',
		'Long format. Each row is a `(fileId, variable)` pair. `null` values emit an empty cell but the row is kept.',
		'',
		'| Column | Notes |',
		'|---|---|',
		'| `fileId` | → `segments.fileId` |',
		'| `variable` | property name |',
		'| `value` | coerced to string; multitext serialized as JSON array |',
		'| `type` | `text` / `multitext` / `number` / `date` / `datetime` / `checkbox` |',
	].join('\n');
}

function schemaRelations(): string {
	return [
		'## `relations.csv`',
		'',
		'Only present when "Include relations" is enabled. Both code-level (from the codebook) and application-level (from specific segment codings) relations share this table via a `scope` column.',
		'',
		'| Column | Notes |',
		'|---|---|',
		'| `scope` | `code` / `application` |',
		'| `origin_code_id` | always present |',
		'| `origin_segment_id` | nullable (empty when `scope=code`) |',
		'| `target_code_id` | |',
		'| `label` | free text (e.g. "parent-of", "contradicts") |',
		'| `directed` | `true` / `false` |',
	].join('\n');
}

function exampleR(): string {
	return [
		'## Example — R (tidyverse)',
		'',
		'```r',
		'library(tidyverse)',
		'segments <- read_csv("segments.csv")',
		'apps <- read_csv("code_applications.csv")',
		'codes <- read_csv("codes.csv")',
		'',
		'# Frequency per code (name resolved)',
		'apps %>%',
		'  inner_join(codes, by = c("code_id" = "id")) %>%',
		'  count(name, sort = TRUE)',
		'```',
	].join('\n');
}

function examplePython(): string {
	return [
		'## Example — Python (pandas)',
		'',
		'```python',
		'import pandas as pd',
		'segments = pd.read_csv("segments.csv")',
		'apps = pd.read_csv("code_applications.csv")',
		'codes = pd.read_csv("codes.csv")',
		'',
		'# Frequency per code',
		'apps.merge(codes, left_on="code_id", right_on="id")["name"].value_counts()',
		'```',
	].join('\n');
}

function warningsSection(warnings: string[]): string {
	return [
		`## Warnings (${warnings.length})`,
		'',
		...warnings.map(w => `- ${w}`),
	].join('\n');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/export/tabular/readmeBuilder.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/export/tabular/readmeBuilder.ts tests/export/tabular/readmeBuilder.test.ts
~/.claude/scripts/commit.sh "feat(export/tabular): readmeBuilder com schema de todas as tabelas + snippets R/Python"
```

---

## Chunk 2: Builders — tabelas simples (codes, code_applications, case_variables, relations)

### Task 2.1: buildCodesTable

**Files:**
- Create: `src/export/tabular/buildCodesTable.ts`
- Test: `tests/export/tabular/buildCodesTable.test.ts`

**IMPORTANT API notes (verified against source):**
- `registry.create(name, color?, description?, parentId?)` — positional args, id auto-generated. Returns `CodeDefinition` with `.id`.
- `registry.update(id, { magnitude?, relations?, ... })` — use this for magnitude and relations.
- `registry.getAll()` — NOT `list()`.
- Test assertions use the returned `def.id`, never a hardcoded id literal.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/export/tabular/buildCodesTable.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../../src/core/codeDefinitionRegistry';
import { buildCodesTable, CODES_HEADER } from '../../../src/export/tabular/buildCodesTable';

let reg: CodeDefinitionRegistry;

beforeEach(() => {
	reg = new CodeDefinitionRegistry();
});

describe('buildCodesTable', () => {
	it('returns header + empty body when no codes', () => {
		const rows = buildCodesTable(reg);
		expect(rows[0]).toEqual(CODES_HEADER);
		expect(rows).toHaveLength(1);
	});

	it('emits one row per code with id, name, color, description', () => {
		const def = reg.create('C1', '#ff0000', 'first');
		const rows = buildCodesTable(reg);
		expect(rows).toHaveLength(2);
		expect(rows[1]).toEqual([def.id, 'C1', '#ff0000', '', 'first', '']);
	});

	it('fills parent_id when code has a parent', () => {
		const parent = reg.create('Parent', '#000');
		const child = reg.create('Child', '#111', undefined, parent.id);
		const rows = buildCodesTable(reg);
		const row = rows.find(r => r[0] === child.id)!;
		expect(row[3]).toBe(parent.id);
	});

	it('serializes magnitude_config as JSON', () => {
		const def = reg.create('M', '#000');
		reg.update(def.id, { magnitude: { type: 'continuous', values: ['1', '2', '3'] } });
		const rows = buildCodesTable(reg);
		const r = rows.find(row => row[0] === def.id)!;
		expect(JSON.parse(r[5] as string)).toEqual({ type: 'continuous', values: ['1', '2', '3'] });
	});

	it('leaves magnitude_config empty when code has no magnitude', () => {
		reg.create('Plain', '#000');
		const rows = buildCodesTable(reg);
		expect(rows[1]![5]).toBe('');
	});
});
```

- [ ] **Step 2: Verify fail**

Run: `npx vitest run tests/export/tabular/buildCodesTable.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/export/tabular/buildCodesTable.ts
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { CellValue } from './csvWriter';

export const CODES_HEADER: string[] = [
	'id', 'name', 'color', 'parent_id', 'description', 'magnitude_config',
];

export function buildCodesTable(registry: CodeDefinitionRegistry): CellValue[][] {
	const rows: CellValue[][] = [CODES_HEADER];
	for (const def of registry.getAll()) {
		rows.push([
			def.id,
			def.name,
			def.color,
			def.parentId ?? '',
			def.description ?? '',
			def.magnitude ? JSON.stringify(def.magnitude) : '',
		]);
	}
	return rows;
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run tests/export/tabular/buildCodesTable.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/export/tabular/buildCodesTable.ts tests/export/tabular/buildCodesTable.test.ts
~/.claude/scripts/commit.sh "feat(export/tabular): buildCodesTable"
```

### Task 2.2: buildCodeApplicationsTable

**Files:**
- Create: `src/export/tabular/buildCodeApplicationsTable.ts`
- Test: `tests/export/tabular/buildCodeApplicationsTable.test.ts`

**IMPORTANT (verified):**
- `dm.section('markdown').markers` is `Record<string, Marker[]>` (keyed by fileId), NOT a flat array. Iterate via `Object.entries()`/`Object.values()`. Test fixtures: `section.markers['file.md'] = [marker, ...]` (not `.push`).
- `registry.getAll()` (never `list()`).
- Import `CodeApplication` from `src/core/types`.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/export/tabular/buildCodeApplicationsTable.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataManager } from '../../../src/core/dataManager';
import { CodeDefinitionRegistry } from '../../../src/core/codeDefinitionRegistry';
import { buildCodeApplicationsTable, CODE_APPS_HEADER } from '../../../src/export/tabular/buildCodeApplicationsTable';
import type { Plugin } from 'obsidian';

function mockPlugin(): Plugin {
	let stored: any = null;
	return { loadData: vi.fn(async () => stored), saveData: vi.fn(async (d) => { stored = d; }) } as unknown as Plugin;
}

let dm: DataManager;
let reg: CodeDefinitionRegistry;
let c1Id: string;
let c2Id: string;

beforeEach(async () => {
	dm = new DataManager(mockPlugin());
	await dm.load();
	reg = new CodeDefinitionRegistry();
	c1Id = reg.create('Code 1', '#f00').id;
	c2Id = reg.create('Code 2', '#0f0').id;
});

describe('buildCodeApplicationsTable', () => {
	it('returns header + empty body when no markers', () => {
		const { rows, warnings } = buildCodeApplicationsTable(dm, reg);
		expect(rows[0]).toEqual(CODE_APPS_HEADER);
		expect(rows).toHaveLength(1);
		expect(warnings).toEqual([]);
	});

	it('emits one row per (segment, code) pair', () => {
		const section = dm.section('markdown');
		section.markers['note.md'] = [{
			markerType: 'markdown',
			id: 's1', fileId: 'note.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#f00',
			codes: [{ codeId: c1Id }, { codeId: c2Id }],
			createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', section);

		const { rows } = buildCodeApplicationsTable(dm, reg);
		expect(rows).toHaveLength(3); // header + 2 apps
		expect(rows[1]).toEqual(['s1', c1Id, '']);
		expect(rows[2]).toEqual(['s1', c2Id, '']);
	});

	it('fills magnitude when present', () => {
		const section = dm.section('markdown');
		section.markers['note.md'] = [{
			markerType: 'markdown',
			id: 's1', fileId: 'note.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#f00',
			codes: [{ codeId: c1Id, magnitude: 'high' }],
			createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', section);

		const { rows } = buildCodeApplicationsTable(dm, reg);
		expect(rows[1]).toEqual(['s1', c1Id, 'high']);
	});

	it('skips orphan codeId + emits warning', () => {
		const section = dm.section('markdown');
		section.markers['note.md'] = [{
			markerType: 'markdown',
			id: 's1', fileId: 'note.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#f00',
			codes: [{ codeId: 'ghost' }, { codeId: c1Id }],
			createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', section);

		const { rows, warnings } = buildCodeApplicationsTable(dm, reg);
		expect(rows).toHaveLength(2); // header + c1 only
		expect(rows[1]).toEqual(['s1', c1Id, '']);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(/orphan/i);
		expect(warnings[0]).toContain('ghost');
	});

	it('visits markers across all 8 sourceTypes', () => {
		const md = dm.section('markdown');
		md.markers['x.md'] = [{
			markerType: 'markdown', id: 'md1', fileId: 'x.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 } },
			color: '#000', codes: [{ codeId: c1Id }], createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', md);

		const pdf = dm.section('pdf');
		pdf.markers.push({ id: 'pdf1', fileId: 'x.pdf', page: 1, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 1, text: 'a', codes: [{ codeId: c1Id }], createdAt: 0, updatedAt: 0 });
		pdf.shapes.push({ id: 'shp1', fileId: 'x.pdf', page: 1, shape: 'rect', coords: { type: 'rect', x: 0, y: 0, w: 10, h: 10 }, codes: [{ codeId: c2Id }], createdAt: 0, updatedAt: 0 });
		dm.setSection('pdf', pdf);

		const img = dm.section('image');
		img.markers.push({ id: 'img1', fileId: 'x.png', shape: 'rect', coords: { type: 'rect', x: 0, y: 0, w: 0.5, h: 0.5 }, codes: [{ codeId: c1Id }], createdAt: 0, updatedAt: 0 });
		dm.setSection('image', img);

		const audio = dm.section('audio');
		audio.files = [{ path: 'x.mp3', markers: [{ id: 'au1', fileId: 'x.mp3', from: 0, to: 1, codes: [{ codeId: c2Id }], createdAt: 0, updatedAt: 0 }] }];
		dm.setSection('audio', audio);

		const video = dm.section('video');
		video.files = [{ path: 'x.mp4', markers: [{ id: 'vd1', fileId: 'x.mp4', from: 0, to: 1, codes: [{ codeId: c1Id }], createdAt: 0, updatedAt: 0 }] }];
		dm.setSection('video', video);

		const csv = dm.section('csv');
		csv.segmentMarkers.push({ id: 'sg1', fileId: 'x.csv', row: 0, column: 'a', from: 0, to: 1, codes: [{ codeId: c1Id }], createdAt: 0, updatedAt: 0 });
		csv.rowMarkers.push({ id: 'rw1', fileId: 'x.csv', row: 0, column: 'a', codes: [{ codeId: c2Id }], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);

		const { rows } = buildCodeApplicationsTable(dm, reg);
		const segIds = rows.slice(1).map(r => r[0]);
		expect(segIds).toEqual(expect.arrayContaining(['md1', 'pdf1', 'shp1', 'img1', 'au1', 'vd1', 'sg1', 'rw1']));
		expect(segIds).toHaveLength(8);
	});
});
```

- [ ] **Step 2: Verify fail**

Run: `npx vitest run tests/export/tabular/buildCodeApplicationsTable.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/export/tabular/buildCodeApplicationsTable.ts
import type { DataManager } from '../../core/dataManager';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { CodeApplication } from '../../core/types';
import type { CellValue } from './csvWriter';

export const CODE_APPS_HEADER: string[] = ['segment_id', 'code_id', 'magnitude'];

export interface CodeAppsResult {
	rows: CellValue[][];
	warnings: string[];
}

export function buildCodeApplicationsTable(
	dm: DataManager,
	registry: CodeDefinitionRegistry,
): CodeAppsResult {
	const rows: CellValue[][] = [CODE_APPS_HEADER];
	const warnings: string[] = [];
	const validCodeIds = new Set(registry.getAll().map(d => d.id));

	const emit = (segmentId: string, codes: CodeApplication[]) => {
		for (const app of codes) {
			if (!validCodeIds.has(app.codeId)) {
				warnings.push(`Orphan code_id on segment ${segmentId}: ${app.codeId}`);
				continue;
			}
			rows.push([segmentId, app.codeId, app.magnitude ?? '']);
		}
	};

	// markdown.markers is Record<fileId, Marker[]> — iterate values
	for (const markers of Object.values(dm.section('markdown').markers)) {
		for (const m of markers) emit(m.id, m.codes);
	}
	for (const m of dm.section('pdf').markers) emit(m.id, m.codes);
	for (const s of dm.section('pdf').shapes) emit(s.id, s.codes);
	for (const m of dm.section('image').markers) emit(m.id, m.codes);
	for (const f of dm.section('audio').files) for (const m of f.markers) emit(m.id, m.codes);
	for (const f of dm.section('video').files) for (const m of f.markers) emit(m.id, m.codes);
	for (const m of dm.section('csv').segmentMarkers) emit(m.id, m.codes);
	for (const m of dm.section('csv').rowMarkers) emit(m.id, m.codes);

	return { rows, warnings };
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run tests/export/tabular/buildCodeApplicationsTable.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/export/tabular/buildCodeApplicationsTable.ts tests/export/tabular/buildCodeApplicationsTable.test.ts
~/.claude/scripts/commit.sh "feat(export/tabular): buildCodeApplicationsTable (visita todos engines + orphan warnings)"
```

### Task 2.3: buildCaseVariablesTable

**Files:**
- Create: `src/export/tabular/buildCaseVariablesTable.ts`
- Test: `tests/export/tabular/buildCaseVariablesTable.test.ts`

**Design decision (verified against source):** `CaseVariablesRegistry` does NOT expose `getAllValues()`/`getAllTypes()` — its API is per-fileId (`getVariables(fileId)`, `getAllVariableNames()`, `getType(name)`). To avoid adding a new accessor just for export, read directly from the persisted section: `dm.section('caseVariables')` returns `{ values: Record<string, Record<string, VariableValue>>, types: Record<string, PropertyType> }`. The registry always mirrors this section; reading from DataManager is equivalent and cleaner here.

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataManager } from '../../../src/core/dataManager';
import { buildCaseVariablesTable, CASE_VARS_HEADER } from '../../../src/export/tabular/buildCaseVariablesTable';
import type { Plugin } from 'obsidian';

function mockPlugin(): Plugin {
	let stored: any = null;
	return { loadData: vi.fn(async () => stored), saveData: vi.fn(async (d) => { stored = d; }) } as unknown as Plugin;
}

async function setupDm(values: Record<string, Record<string, any>>, types: Record<string, string>): Promise<DataManager> {
	const dm = new DataManager(mockPlugin());
	await dm.load();
	dm.setSection('caseVariables', { values, types } as any);
	return dm;
}

describe('buildCaseVariablesTable', () => {
	it('returns header + empty body when no vars', async () => {
		const dm = await setupDm({}, {});
		const { rows } = buildCaseVariablesTable(dm);
		expect(rows[0]).toEqual(CASE_VARS_HEADER);
		expect(rows).toHaveLength(1);
	});

	it('emits one row per (fileId, variable) pair', async () => {
		const dm = await setupDm({ 'a.md': { age: 30, group: 'A' } }, { age: 'number', group: 'text' });
		const { rows } = buildCaseVariablesTable(dm);
		expect(rows).toHaveLength(3);
	});

	it('serializes multitext as JSON array', async () => {
		const dm = await setupDm({ 'a.md': { tags: ['x', 'y'] } }, { tags: 'multitext' });
		const { rows } = buildCaseVariablesTable(dm);
		expect(JSON.parse(rows[1]![2] as string)).toEqual(['x', 'y']);
		expect(rows[1]![3]).toBe('multitext');
	});

	it('serializes checkbox false as "false" (not empty)', async () => {
		const dm = await setupDm({ 'a.md': { consent: false } }, { consent: 'checkbox' });
		const { rows } = buildCaseVariablesTable(dm);
		expect(rows[1]![2]).toBe('false');
	});

	it('emits empty string for null, keeps row', async () => {
		const dm = await setupDm({ 'a.md': { age: null } }, { age: 'number' });
		const { rows } = buildCaseVariablesTable(dm);
		expect(rows).toHaveLength(2);
		expect(rows[1]![2]).toBe('');
	});

	it('falls back to text with warning for unknown type', async () => {
		const dm = await setupDm({ 'a.md': { weird: 'x' } }, { weird: 'unknown_type' });
		const { rows, warnings } = buildCaseVariablesTable(dm);
		expect(rows[1]![3]).toBe('text');
		expect(warnings.some(w => /unknown.*type/i.test(w))).toBe(true);
	});
});
```

- [ ] **Step 2: Verify fail**

Run: `npx vitest run tests/export/tabular/buildCaseVariablesTable.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/export/tabular/buildCaseVariablesTable.ts
import type { DataManager } from '../../core/dataManager';
import type { CellValue } from './csvWriter';

export const CASE_VARS_HEADER: string[] = ['fileId', 'variable', 'value', 'type'];

const VALID_TYPES = ['text', 'multitext', 'number', 'date', 'datetime', 'checkbox'] as const;

export interface CaseVarsResult {
	rows: CellValue[][];
	warnings: string[];
}

export function buildCaseVariablesTable(dm: DataManager): CaseVarsResult {
	const rows: CellValue[][] = [CASE_VARS_HEADER];
	const warnings: string[] = [];
	const section = dm.section('caseVariables');
	const values = section.values;
	const types = section.types;

	for (const [fileId, vars] of Object.entries(values)) {
		for (const [varName, rawValue] of Object.entries(vars as Record<string, unknown>)) {
			const declared = types[varName];
			let type: string;
			if (declared && (VALID_TYPES as readonly string[]).includes(declared)) {
				type = declared;
			} else {
				warnings.push(`Unknown type for variable "${varName}" — defaulting to "text"`);
				type = 'text';
			}
			rows.push([fileId, varName, serializeValue(rawValue, type), type]);
		}
	}

	return { rows, warnings };
}

function serializeValue(value: unknown, type: string): string {
	if (value === null || value === undefined) return '';
	if (type === 'multitext') return JSON.stringify(value);
	if (type === 'checkbox') return value ? 'true' : 'false';
	return String(value);
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run tests/export/tabular/buildCaseVariablesTable.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/export/tabular/buildCaseVariablesTable.ts tests/export/tabular/buildCaseVariablesTable.test.ts
~/.claude/scripts/commit.sh "feat(export/tabular): buildCaseVariablesTable (long format + multitext JSON + null handling, reads via DataManager)"
```

### Task 2.4: buildRelationsTable

**Files:**
- Create: `src/export/tabular/buildRelationsTable.ts`
- Test: `tests/export/tabular/buildRelationsTable.test.ts`

**IMPORTANT (verified):**
- Relations on codes are set via `registry.update(id, { relations })`, NOT via `create()`.
- `CodeRelation.directed` is a required `boolean` (not optional). Tests don't need to cover undefined — TS forbids it.
- Markdown iteration: `Object.values(dm.section('markdown').markers)` then flatten.

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataManager } from '../../../src/core/dataManager';
import { CodeDefinitionRegistry } from '../../../src/core/codeDefinitionRegistry';
import { buildRelationsTable, RELATIONS_HEADER } from '../../../src/export/tabular/buildRelationsTable';
import type { Plugin } from 'obsidian';

function mockPlugin(): Plugin {
	let stored: any = null;
	return { loadData: vi.fn(async () => stored), saveData: vi.fn(async (d) => { stored = d; }) } as unknown as Plugin;
}

let dm: DataManager;
let reg: CodeDefinitionRegistry;

beforeEach(async () => {
	dm = new DataManager(mockPlugin());
	await dm.load();
	reg = new CodeDefinitionRegistry();
});

describe('buildRelationsTable', () => {
	it('returns header + empty body when no relations', () => {
		const { rows } = buildRelationsTable(dm, reg);
		expect(rows[0]).toEqual(RELATIONS_HEADER);
		expect(rows).toHaveLength(1);
	});

	it('emits code-level relations with scope=code and empty origin_segment_id', () => {
		const c1 = reg.create('C1', '#000');
		const c2 = reg.create('C2', '#000');
		reg.update(c1.id, { relations: [{ label: 'parent-of', target: c2.id, directed: true }] });

		const { rows } = buildRelationsTable(dm, reg);
		expect(rows).toHaveLength(2);
		expect(rows[1]).toEqual(['code', c1.id, '', c2.id, 'parent-of', 'true']);
	});

	it('emits application-level relations with scope=application', () => {
		const c1 = reg.create('C1', '#000');
		const c2 = reg.create('C2', '#000');
		const section = dm.section('markdown');
		section.markers['x.md'] = [{
			markerType: 'markdown', id: 's1', fileId: 'x.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 } },
			color: '#000',
			codes: [{ codeId: c1.id, relations: [{ label: 'contradicts', target: c2.id, directed: false }] }],
			createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', section);

		const { rows } = buildRelationsTable(dm, reg);
		expect(rows).toHaveLength(2);
		expect(rows[1]).toEqual(['application', c1.id, 's1', c2.id, 'contradicts', 'false']);
	});

	it('returns no warnings (pure projection)', () => {
		const c1 = reg.create('C1', '#000');
		const c2 = reg.create('C2', '#000');
		reg.update(c1.id, { relations: [{ label: 'x', target: c2.id, directed: true }] });
		const { warnings } = buildRelationsTable(dm, reg);
		expect(warnings).toEqual([]);
	});
});
```

- [ ] **Step 2: Verify fail**

Run: `npx vitest run tests/export/tabular/buildRelationsTable.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/export/tabular/buildRelationsTable.ts
import type { DataManager } from '../../core/dataManager';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { CodeApplication } from '../../core/types';
import type { CellValue } from './csvWriter';

export const RELATIONS_HEADER: string[] = [
	'scope', 'origin_code_id', 'origin_segment_id', 'target_code_id', 'label', 'directed',
];

export interface RelationsResult {
	rows: CellValue[][];
	warnings: string[];
}

export function buildRelationsTable(dm: DataManager, registry: CodeDefinitionRegistry): RelationsResult {
	const rows: CellValue[][] = [RELATIONS_HEADER];
	const warnings: string[] = [];

	// Code-level
	for (const def of registry.getAll()) {
		for (const rel of def.relations ?? []) {
			rows.push(['code', def.id, '', rel.target, rel.label, String(rel.directed)]);
		}
	}

	// Application-level — visit every marker type
	const visit = (segmentId: string, codes: CodeApplication[]) => {
		for (const app of codes) {
			for (const rel of app.relations ?? []) {
				rows.push(['application', app.codeId, segmentId, rel.target, rel.label, String(rel.directed)]);
			}
		}
	};

	// markdown.markers is Record<fileId, Marker[]>
	for (const markers of Object.values(dm.section('markdown').markers)) {
		for (const m of markers) visit(m.id, m.codes);
	}
	for (const m of dm.section('pdf').markers) visit(m.id, m.codes);
	for (const s of dm.section('pdf').shapes) visit(s.id, s.codes);
	for (const m of dm.section('image').markers) visit(m.id, m.codes);
	for (const f of dm.section('audio').files) for (const m of f.markers) visit(m.id, m.codes);
	for (const f of dm.section('video').files) for (const m of f.markers) visit(m.id, m.codes);
	for (const m of dm.section('csv').segmentMarkers) visit(m.id, m.codes);
	for (const m of dm.section('csv').rowMarkers) visit(m.id, m.codes);

	return { rows, warnings };
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run tests/export/tabular/buildRelationsTable.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/export/tabular/buildRelationsTable.ts tests/export/tabular/buildRelationsTable.test.ts
~/.claude/scripts/commit.sh "feat(export/tabular): buildRelationsTable (code + application scopes, colunas separadas)"
```

---

## Chunk 3: buildSegmentsTable (o mais complexo — 8 sourceTypes)

### Task 3.1: buildSegmentsTable

**Files:**
- Create: `src/export/tabular/buildSegmentsTable.ts`
- Test: `tests/export/tabular/buildSegmentsTable.test.ts`

Este é o builder de maior complexidade — consolida 6 `MarkerType`s persistidos em 8 `sourceType`s. Função pura: recebe `DataManager` + `Map<markerId, string>` (textos de CSV pré-resolvidos pelo orchestrator) + flag `includeShapeCoords`.

**IMPORTANT (verified):**
- `dm.section('markdown').markers` is `Record<string, Marker[]>` (keyed by fileId). Iterate `Object.values(...)` then each array. Test fixtures assign via `s.markers['file.md'] = [...]`, not `.push`.
- Other engines: PDF/image/csv use arrays; audio/video use `section.files[].markers[]`.
- For performance, cache column indices once after building header: `const IDX = { id: header.indexOf('id'), ... }` — avoid linear scan per cell. Optional optimization; keep `idx(col)` helper if simpler for now.

- [ ] **Step 1: Definir header de `segments.csv`**

Todas as colunas possíveis (nulláveis por tipo):

```
id, fileId, engine, sourceType, text, memo, createdAt, updatedAt,
page, begin_index, begin_offset, end_index, end_offset,
line_from, ch_from, line_to, ch_to,
row, column, cell_from, cell_to,
time_from, time_to,
shape_type, shape_coords    ← dinamicamente adicionados só se includeShapeCoords=true
```

- [ ] **Step 2: Write failing tests — fixture por sourceType**

Cada teste monta um marker de um tipo, chama o builder, e valida as colunas preenchidas vs vazias. Mínimo 8 tests (1 por sourceType) + testes para:
- Header dinâmico (com/sem shape_coords)
- Timestamp em ISO 8601
- Text vazio pra shape/media
- Text resolvido via `csvTexts` Map pra csv_segment e csv_row
- Media `from/to` em segundos convertido pra ms inteiro
- NaN em `from/to` → emit empty cells + warning (não skip segment)
- Shape coords malformado → emit sem `shape_type`/`shape_coords` + warning
- Timestamp inválido → ISO string vazia, warning

Exemplos dos casos principais:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataManager } from '../../../src/core/dataManager';
import { buildSegmentsTable } from '../../../src/export/tabular/buildSegmentsTable';
import type { Plugin } from 'obsidian';

function mockPlugin(): Plugin {
	let stored: any = null;
	return { loadData: vi.fn(async () => stored), saveData: vi.fn(async (d) => { stored = d; }) } as unknown as Plugin;
}

let dm: DataManager;
beforeEach(async () => {
	dm = new DataManager(mockPlugin());
	await dm.load();
});

describe('buildSegmentsTable', () => {
	it('header has shape columns when includeShapeCoords=true', () => {
		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		expect(rows[0]).toContain('shape_type');
		expect(rows[0]).toContain('shape_coords');
	});

	it('header omits shape columns when includeShapeCoords=false', () => {
		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: false });
		expect(rows[0]).not.toContain('shape_type');
		expect(rows[0]).not.toContain('shape_coords');
	});

	it('markdown marker: engine=markdown, sourceType=markdown, line/ch filled', () => {
		const s = dm.section('markdown');
		s.markers['x.md'] = [{
			markerType: 'markdown', id: 'md1', fileId: 'x.md',
			range: { from: { line: 3, ch: 4 }, to: { line: 5, ch: 6 } },
			color: '#000', codes: [], text: 'hello', memo: '',
			createdAt: 1700000000000, updatedAt: 1700000001000,
		}];
		dm.setSection('markdown', s);

		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		const row = rows[1]!;
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(row[i('engine')]).toBe('markdown');
		expect(row[i('sourceType')]).toBe('markdown');
		expect(row[i('text')]).toBe('hello');
		expect(row[i('line_from')]).toBe(3);
		expect(row[i('ch_from')]).toBe(4);
		expect(row[i('line_to')]).toBe(5);
		expect(row[i('ch_to')]).toBe(6);
		expect(row[i('page')]).toBe('');
		expect(row[i('createdAt')]).toBe('2023-11-14T22:13:20.000Z');
	});

	it('csv_segment marker: text resolved from csvTexts map', () => {
		const csv = dm.section('csv');
		csv.segmentMarkers.push({ id: 'sg1', fileId: 'x.csv', row: 0, column: 'col', from: 10, to: 20, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);
		const texts = new Map([['sg1', 'hello world']]);
		const { rows } = buildSegmentsTable(dm, texts, { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('text')]).toBe('hello world');
		expect(rows[1]![i('sourceType')]).toBe('csv_segment');
	});

	it('csv_row marker: text resolved from csvTexts map (full cell)', () => {
		const csv = dm.section('csv');
		csv.rowMarkers.push({ id: 'rw1', fileId: 'x.csv', row: 0, column: 'col', codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);
		const texts = new Map([['rw1', 'Maria Silva']]);
		const { rows } = buildSegmentsTable(dm, texts, { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('text')]).toBe('Maria Silva');
		expect(rows[1]![i('sourceType')]).toBe('csv_row');
	});

	it('media marker: from/to in seconds converted to ms (int)', () => {
		const audio = dm.section('audio');
		audio.files = [{ path: 'x.mp3', markers: [{ id: 'au1', fileId: 'x.mp3', from: 1.5, to: 3.25, codes: [], createdAt: 0, updatedAt: 0 }] }];
		dm.setSection('audio', audio);
		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('time_from')]).toBe(1500);
		expect(rows[1]![i('time_to')]).toBe(3250);
	});

	it('media marker with NaN time: empty cells + warning, segment emitted', () => {
		const audio = dm.section('audio');
		audio.files = [{ path: 'x.mp3', markers: [{ id: 'au1', fileId: 'x.mp3', from: NaN, to: 2, codes: [], createdAt: 0, updatedAt: 0 }] }];
		dm.setSection('audio', audio);
		const { rows, warnings } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		expect(rows).toHaveLength(2); // segment emitted
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('time_from')]).toBe('');
		expect(rows[1]![i('time_to')]).toBe('');
		expect(warnings.some(w => /NaN/i.test(w))).toBe(true);
	});

	it('pdf_shape marker: shape_coords as JSON when includeShapeCoords=true', () => {
		const pdf = dm.section('pdf');
		pdf.shapes.push({ id: 'sh1', fileId: 'x.pdf', page: 1, shape: 'rect', coords: { type: 'rect', x: 10, y: 20, w: 30, h: 40 }, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('pdf', pdf);
		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: true });
		const i = (col: string) => rows[0]!.indexOf(col);
		expect(rows[1]![i('shape_type')]).toBe('rect');
		expect(JSON.parse(rows[1]![i('shape_coords')] as string)).toEqual({ type: 'rect', x: 10, y: 20, w: 30, h: 40 });
	});

	it('pdf_shape marker: shape columns absent when includeShapeCoords=false', () => {
		const pdf = dm.section('pdf');
		pdf.shapes.push({ id: 'sh1', fileId: 'x.pdf', page: 1, shape: 'rect', coords: { type: 'rect', x: 10, y: 20, w: 30, h: 40 }, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('pdf', pdf);
		const { rows } = buildSegmentsTable(dm, new Map(), { includeShapeCoords: false });
		expect(rows[0]).not.toContain('shape_type');
		// segment still emitted
		expect(rows).toHaveLength(2);
	});

	// + tests for pdf_text, image, video, csv_row
});
```

- [ ] **Step 3: Verify fail**

Run: `npx vitest run tests/export/tabular/buildSegmentsTable.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement**

Estrutura sugerida — colunas como um enum de constantes, uma função por engine que produz row no shape do header:

```typescript
// src/export/tabular/buildSegmentsTable.ts
import type { DataManager } from '../../core/dataManager';
import type { CellValue } from './csvWriter';

export interface SegmentsOptions {
	includeShapeCoords: boolean;
}

export interface SegmentsResult {
	rows: CellValue[][];
	warnings: string[];
}

const BASE_COLS = [
	'id', 'fileId', 'engine', 'sourceType', 'text', 'memo',
	'createdAt', 'updatedAt',
	'page',
	'begin_index', 'begin_offset', 'end_index', 'end_offset',
	'line_from', 'ch_from', 'line_to', 'ch_to',
	'row', 'column', 'cell_from', 'cell_to',
	'time_from', 'time_to',
];
const SHAPE_COLS = ['shape_type', 'shape_coords'];

export function buildSegmentsTable(
	dm: DataManager,
	csvTexts: Map<string, string>,
	opts: SegmentsOptions,
): SegmentsResult {
	const header = opts.includeShapeCoords ? [...BASE_COLS, ...SHAPE_COLS] : [...BASE_COLS];
	const rows: CellValue[][] = [header];
	const warnings: string[] = [];
	const idx = (col: string) => header.indexOf(col);

	const newRow = (): CellValue[] => header.map(() => '');

	const setCommon = (row: CellValue[], id: string, fileId: string, engine: string, sourceType: string, text: string, memo: string, createdAt: number, updatedAt: number) => {
		row[idx('id')] = id;
		row[idx('fileId')] = fileId;
		row[idx('engine')] = engine;
		row[idx('sourceType')] = sourceType;
		row[idx('text')] = text;
		row[idx('memo')] = memo;
		row[idx('createdAt')] = isoOrWarn(createdAt, id, warnings);
		row[idx('updatedAt')] = isoOrWarn(updatedAt, id, warnings);
	};

	// markdown — markers is Record<fileId, Marker[]>
	for (const markers of Object.values(dm.section('markdown').markers)) {
		for (const m of markers) {
			const row = newRow();
			setCommon(row, m.id, m.fileId, 'markdown', 'markdown', m.text ?? '', m.memo ?? '', m.createdAt, m.updatedAt);
			row[idx('line_from')] = m.range.from.line;
			row[idx('ch_from')] = m.range.from.ch;
			row[idx('line_to')] = m.range.to.line;
			row[idx('ch_to')] = m.range.to.ch;
			rows.push(row);
		}
	}

	// pdf text
	for (const m of dm.section('pdf').markers) {
		const row = newRow();
		setCommon(row, m.id, m.fileId, 'pdf', 'pdf_text', m.text, m.memo ?? '', m.createdAt, m.updatedAt);
		row[idx('page')] = m.page;
		row[idx('begin_index')] = m.beginIndex;
		row[idx('begin_offset')] = m.beginOffset;
		row[idx('end_index')] = m.endIndex;
		row[idx('end_offset')] = m.endOffset;
		rows.push(row);
	}

	// pdf shape
	for (const s of dm.section('pdf').shapes) {
		const row = newRow();
		setCommon(row, s.id, s.fileId, 'pdf', 'pdf_shape', '', s.memo ?? '', s.createdAt, s.updatedAt);
		row[idx('page')] = s.page;
		fillShape(row, s.shape, s.coords, header, opts.includeShapeCoords, s.id, warnings);
		rows.push(row);
	}

	// image
	for (const m of dm.section('image').markers) {
		const row = newRow();
		setCommon(row, m.id, m.fileId, 'image', 'image', '', m.memo ?? '', m.createdAt, m.updatedAt);
		fillShape(row, m.shape, m.coords, header, opts.includeShapeCoords, m.id, warnings);
		rows.push(row);
	}

	// audio / video
	for (const sourceType of ['audio', 'video'] as const) {
		for (const f of dm.section(sourceType).files) {
			for (const m of f.markers) {
				const row = newRow();
				setCommon(row, m.id, m.fileId, sourceType, sourceType, '', m.memo ?? '', m.createdAt, m.updatedAt);
				row[idx('time_from')] = secondsToMs(m.from, m.id, 'from', warnings);
				row[idx('time_to')] = secondsToMs(m.to, m.id, 'to', warnings);
				rows.push(row);
			}
		}
	}

	// csv
	for (const m of dm.section('csv').segmentMarkers) {
		const row = newRow();
		setCommon(row, m.id, m.fileId, 'csv', 'csv_segment', csvTexts.get(m.id) ?? '', m.memo ?? '', m.createdAt, m.updatedAt);
		row[idx('row')] = m.row;
		row[idx('column')] = m.column;
		row[idx('cell_from')] = m.from;
		row[idx('cell_to')] = m.to;
		rows.push(row);
	}
	for (const m of dm.section('csv').rowMarkers) {
		const row = newRow();
		setCommon(row, m.id, m.fileId, 'csv', 'csv_row', csvTexts.get(m.id) ?? '', m.memo ?? '', m.createdAt, m.updatedAt);
		row[idx('row')] = m.row;
		row[idx('column')] = m.column;
		rows.push(row);
	}

	return { rows, warnings };
}

function secondsToMs(sec: number, id: string, label: string, warnings: string[]): CellValue {
	if (!Number.isFinite(sec)) {
		warnings.push(`Media marker ${id} has NaN ${label} time — emitted empty`);
		return '';
	}
	return Math.round(sec * 1000);
}

function fillShape(row: CellValue[], shape: string, coords: any, header: string[], include: boolean, id: string, warnings: string[]): void {
	if (!include) return;
	const idx = (col: string) => header.indexOf(col);
	if (!coords || typeof coords !== 'object' || !coords.type) {
		warnings.push(`Shape marker ${id} has malformed coords — omitted`);
		return;
	}
	row[idx('shape_type')] = shape;
	try {
		row[idx('shape_coords')] = JSON.stringify(coords);
	} catch {
		warnings.push(`Shape marker ${id} coords not JSON-serializable — omitted`);
	}
}

function isoOrWarn(ms: number, id: string, warnings: string[]): string {
	if (!Number.isFinite(ms)) {
		warnings.push(`Segment ${id} has non-finite timestamp — emitted empty`);
		return '';
	}
	try {
		return new Date(ms).toISOString();
	} catch {
		warnings.push(`Segment ${id} timestamp invalid — emitted empty`);
		return '';
	}
}
```

- [ ] **Step 5: Verify pass**

Run: `npx vitest run tests/export/tabular/buildSegmentsTable.test.ts`
Expected: PASS (all fixtures)

- [ ] **Step 6: Commit**

```bash
git add src/export/tabular/buildSegmentsTable.ts tests/export/tabular/buildSegmentsTable.test.ts
~/.claude/scripts/commit.sh "feat(export/tabular): buildSegmentsTable (8 sourceTypes + shape coords opcional + ms conversion)"
```

---

## Chunk 4: Orchestrator (tabularExporter)

### Task 4.1: tabularExporter — empacota tudo

**Files:**
- Create: `src/export/tabular/tabularExporter.ts`
- Test: `tests/export/tabular/tabularExporter.test.ts`

Orquestrador: resolve textos de CSV via PapaParse, roda os 5 builders, concatena warnings, gera README, monta zip via fflate.

**IMPORTANT patterns (verified against codebase):**
- **fflate realm-safety wrapper:** `qdpxExporter.ts:437-440` uses `toU8(buf)` that wraps with `new Uint8Array(buf)` to ensure the buffer is in the current JS realm — fflate's `instanceof Uint8Array` check fails in Obsidian/Electron otherwise. Copy the same helper; don't pass raw `strToU8(...)` results into `files`.
- **CSV read via TFile, not path:** `csvCodingView.ts:26` uses `vault.read(file)` (expects `TFile`). Resolve path → TFile first via `app.vault.getAbstractFileByPath(fileId)` and instanceof check.
- **Papa.parse import:** prefer `import Papa from 'papaparse'` (default import) — matches `textExtractor.ts`, simpler than namespace form.
- **Papa.parse error tolerance:** csv engine tolerates errors when `parsed.data.length > 0`. Only skip text resolution entirely when `data` is empty.

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { DataManager } from '../../../src/core/dataManager';
import { CodeDefinitionRegistry } from '../../../src/core/codeDefinitionRegistry';
import { exportTabular } from '../../../src/export/tabular/tabularExporter';
import type { App, Plugin, TFile } from 'obsidian';

function mockPlugin(): Plugin {
	let stored: any = null;
	return { loadData: vi.fn(async () => stored), saveData: vi.fn(async (d) => { stored = d; }) } as unknown as Plugin;
}

// Returns an App whose vault resolves paths via the provided content map.
// Missing path → getAbstractFileByPath returns null → orchestrator warns.
function mockApp(files: Record<string, string> = {}): App {
	return {
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => {
				if (!(path in files)) return null;
				return { path, extension: path.split('.').pop() } as unknown as TFile;
			}),
			read: vi.fn(async (file: TFile) => files[file.path] ?? ''),
		},
	} as unknown as App;
}

let dm: DataManager;
let reg: CodeDefinitionRegistry;

beforeEach(async () => {
	dm = new DataManager(mockPlugin());
	await dm.load();
	reg = new CodeDefinitionRegistry();
});

describe('exportTabular', () => {
	it('empty project yields zip with 4 CSVs + README (relations off)', async () => {
		const result = await exportTabular(mockApp(), dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		const files = unzipSync(result.data);
		expect(Object.keys(files).sort()).toEqual([
			'README.md', 'case_variables.csv', 'code_applications.csv', 'codes.csv', 'segments.csv',
		]);
	});

	it('relations on → 5 CSVs + README', async () => {
		const result = await exportTabular(mockApp(), dm, reg, {
			fileName: 'out.zip', includeRelations: true, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		expect(Object.keys(unzipSync(result.data))).toContain('relations.csv');
	});

	it('warnings bubble into README', async () => {
		reg.create('C1', '#000');
		const s = dm.section('markdown');
		s.markers['x.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'x.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 } },
			color: '#000', codes: [{ codeId: 'ghost' }], createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', s);

		const result = await exportTabular(mockApp(), dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		const readme = strFromU8(unzipSync(result.data)['README.md']!);
		expect(readme).toContain('Warnings');
		expect(readme).toContain('ghost');
	});

	it('CSV source missing → warning, segments[csv] emitted with empty text', async () => {
		const csv = dm.section('csv');
		csv.segmentMarkers.push({ id: 'sg1', fileId: 'missing.csv', row: 0, column: 'a', from: 0, to: 1, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);

		const result = await exportTabular(mockApp(/* no files */), dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		expect(result.warnings.some(w => /cannot read/i.test(w))).toBe(true);
		const segments = strFromU8(unzipSync(result.data)['segments.csv']!);
		expect(segments).toContain('sg1'); // segment still there
	});

	it('CSV source readable → text resolved from the cell', async () => {
		const csv = dm.section('csv');
		csv.segmentMarkers.push({ id: 'sg1', fileId: 'x.csv', row: 0, column: 'col', from: 0, to: 5, codes: [], createdAt: 0, updatedAt: 0 });
		dm.setSection('csv', csv);
		const app = mockApp({ 'x.csv': 'col\nhello world' });

		const result = await exportTabular(app, dm, reg, {
			fileName: 'out.zip', includeRelations: false, includeShapeCoords: true, pluginVersion: '0.0.1',
		});
		const segments = strFromU8(unzipSync(result.data)['segments.csv']!);
		expect(segments).toContain('hello');
	});
});
```

- [ ] **Step 2: Verify fail**

Run: `npx vitest run tests/export/tabular/tabularExporter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/export/tabular/tabularExporter.ts
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { zipSync, strToU8 } from 'fflate';
import Papa from 'papaparse';
import type { DataManager } from '../../core/dataManager';
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import { toCsv } from './csvWriter';
import { buildSegmentsTable } from './buildSegmentsTable';
import { buildCodeApplicationsTable } from './buildCodeApplicationsTable';
import { buildCodesTable } from './buildCodesTable';
import { buildCaseVariablesTable } from './buildCaseVariablesTable';
import { buildRelationsTable } from './buildRelationsTable';
import { buildReadme } from './readmeBuilder';

export interface TabularExportOptions {
	fileName: string;
	includeRelations: boolean;
	includeShapeCoords: boolean;
	pluginVersion: string;
}

export interface TabularExportResult {
	fileName: string;
	data: Uint8Array;
	warnings: string[];
}

/** Realm-safe wrapper — fflate's `instanceof Uint8Array` check fails across
 *  realms in Electron/Obsidian. Matches the pattern in `qdpxExporter.ts:437`. */
const toU8 = (buf: Uint8Array): Uint8Array => new Uint8Array(buf);

export async function exportTabular(
	app: App,
	dm: DataManager,
	registry: CodeDefinitionRegistry,
	opts: TabularExportOptions,
): Promise<TabularExportResult> {
	const warnings: string[] = [];

	// Pre-resolve CSV segment/row texts
	const csvTexts = await resolveCsvTexts(app, dm, warnings);

	const segments = buildSegmentsTable(dm, csvTexts, { includeShapeCoords: opts.includeShapeCoords });
	warnings.push(...segments.warnings);

	const apps = buildCodeApplicationsTable(dm, registry);
	warnings.push(...apps.warnings);

	const codesRows = buildCodesTable(registry);

	const caseVars = buildCaseVariablesTable(dm);
	warnings.push(...caseVars.warnings);

	const files: Record<string, Uint8Array> = {
		'segments.csv': toU8(strToU8(toCsv(segments.rows))),
		'code_applications.csv': toU8(strToU8(toCsv(apps.rows))),
		'codes.csv': toU8(strToU8(toCsv(codesRows))),
		'case_variables.csv': toU8(strToU8(toCsv(caseVars.rows))),
	};

	if (opts.includeRelations) {
		const rel = buildRelationsTable(dm, registry);
		warnings.push(...rel.warnings);
		files['relations.csv'] = toU8(strToU8(toCsv(rel.rows)));
	}

	files['README.md'] = toU8(strToU8(buildReadme({
		pluginVersion: opts.pluginVersion,
		includeRelations: opts.includeRelations,
		includeShapeCoords: opts.includeShapeCoords,
		warnings,
	})));

	return {
		fileName: opts.fileName,
		data: zipSync(files),
		warnings,
	};
}

async function resolveCsvTexts(app: App, dm: DataManager, warnings: string[]): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	const csv = dm.section('csv');
	const fileIds = new Set<string>();
	for (const m of csv.segmentMarkers) fileIds.add(m.fileId);
	for (const m of csv.rowMarkers) fileIds.add(m.fileId);

	for (const fileId of fileIds) {
		const abstractFile = app.vault.getAbstractFileByPath(fileId);
		if (!(abstractFile instanceof TFile)) {
			warnings.push(`CSV ${fileId}: cannot read source for text resolution (file not found)`);
			continue;
		}
		let content: string;
		try {
			content = await app.vault.read(abstractFile);
		} catch (err) {
			warnings.push(`CSV ${fileId}: cannot read source for text resolution (${(err as Error).message})`);
			continue;
		}
		const parsed = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true });
		// Tolerate partial parse errors as long as some rows came through
		if (parsed.data.length === 0 && parsed.errors.length > 0) {
			warnings.push(`CSV ${fileId}: parse failed (${parsed.errors[0]!.message}) — skipping text resolution`);
			continue;
		}
		for (const m of csv.segmentMarkers) {
			if (m.fileId !== fileId) continue;
			const cell = parsed.data[m.row]?.[m.column] ?? '';
			result.set(m.id, cell.slice(m.from, m.to));
		}
		for (const m of csv.rowMarkers) {
			if (m.fileId !== fileId) continue;
			const cell = parsed.data[m.row]?.[m.column] ?? '';
			result.set(m.id, cell);
		}
	}

	return result;
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run tests/export/tabular/tabularExporter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/export/tabular/tabularExporter.ts tests/export/tabular/tabularExporter.test.ts
~/.claude/scripts/commit.sh "feat(export/tabular): tabularExporter orchestrator (CSV text resolution via TFile, zip via fflate com toU8 wrapper, warnings bubble)"
```

---

## Chunk 5: UI integration

### Task 5.1: Extend ExportModal with 'tabular' format

**Files:**
- Modify: `src/export/exportModal.ts`

- [ ] **Step 1: Extend format union**

Change `format: 'qdc' | 'qdpx'` → `format: 'qdc' | 'qdpx' | 'tabular'`.

- [ ] **Step 2: Add third dropdown option**

In the dropdown setup (inside `onOpen`):

```typescript
dd.addOption('qdpx', 'QDPX (full project)');
dd.addOption('qdc', 'QDC (codebook only)');
dd.addOption('tabular', 'Tabular (CSV zip, for R/Python)');  // ← novo
```

- [ ] **Step 3: Adjust fileName extension logic (both constructor AND onChange)**

Extract a helper:
```typescript
private extensionFor(format: 'qdc' | 'qdpx' | 'tabular'): string {
	return format === 'tabular' ? 'zip' : format;
}
```

In the constructor (line ~33), replace:
```typescript
this.fileName = `qualia-project.${defaultFormat}`;
```
with:
```typescript
this.fileName = `qualia-project.${this.extensionFor(defaultFormat)}`;
```

In `onChange` (line ~48), replace:
```typescript
this.fileName = this.fileName.replace(/\.\w+$/, `.${this.format}`);
```
with:
```typescript
this.fileName = this.fileName.replace(/\.\w+$/, `.${this.extensionFor(this.format)}`);
```

This way, opening the modal pré-selected com `defaultFormat='tabular'` (do command palette ou settings button) já produz `qualia-project.zip` de saída.

- [ ] **Step 4: Render dynamic toggles for tabular**

In `renderDynamicSections`:
```typescript
if (this.format === 'tabular') {
	new Setting(this.dynamicEl)
		.setName('Include relations')
		.setDesc('Adds relations.csv with code-level and application-level relations.')
		.addToggle(t => t.setValue(this.includeRelations).onChange(v => this.includeRelations = v));

	new Setting(this.dynamicEl)
		.setName('Include shape coords')
		.setDesc('Adds shape_type and shape_coords columns for PDF/image shapes.')
		.addToggle(t => t.setValue(this.includeShapeCoords).onChange(v => this.includeShapeCoords = v));
	return;
}
```

Initialize fields at class level:
```typescript
private includeRelations = true;
private includeShapeCoords = true;
```

- [ ] **Step 5: Branch doExport**

In `doExport()`, branch before the existing `exportProject` call. Note: `exportTabular` reads case variables direct from DataManager — NÃO precisa passar `caseVariablesRegistry`:

```typescript
if (this.format === 'tabular') {
	const result = await exportTabular(this.app, this.dataManager, this.registry, {
		fileName: this.fileName,
		includeRelations: this.includeRelations,
		includeShapeCoords: this.includeShapeCoords,
		pluginVersion: this.pluginVersion,
	});
	await this.app.vault.createBinary(result.fileName, result.data.buffer as ArrayBuffer);
	this.notifyResult(result.warnings, result.fileName);
	this.close();
	return;
}
// existing qdpx/qdc path
```

Factor the notice logic into a helper (reuses the 3-preview + 12000ms timeout pattern at line 107):

```typescript
private notifyResult(warnings: string[], fileName: string): void {
	if (warnings.length > 0) {
		const preview = warnings.slice(0, 3).join('\n');
		const extra = warnings.length > 3 ? `\n…and ${warnings.length - 3} more` : '';
		new Notice(`Export complete: ${fileName}\n\n${warnings.length} warning(s):\n${preview}${extra}`, 12000);
	} else {
		new Notice(`Export complete: ${fileName}`);
	}
}
```

Update the existing qdpx/qdc notice block to use this same helper (DRY).

- [ ] **Step 6: Run existing tests**

Run: `npx vitest run` — should all still pass (no test file for exportModal exists, we're just verifying we didn't break qdpx/qdc path).

- [ ] **Step 7: Commit**

```bash
git add src/export/exportModal.ts
~/.claude/scripts/commit.sh "feat(export): ExportModal — 3ª opção 'tabular' no dropdown + toggles dinâmicos + routing pra exportTabular"
```

### Task 5.2: New command + openExportModal factory accepts 'tabular'

**Files:**
- Modify: `src/export/exportCommands.ts`

- [ ] **Step 1: Extend openExportModal type**

Change factory signature `defaultFormat: 'qdc' | 'qdpx' = 'qdpx'` → include `'tabular'`.

- [ ] **Step 2: Add new command**

```typescript
plugin.addCommand({
	id: 'export-tabular',
	name: 'Export codes as tabular data (for R/Python)',
	callback: () => {
		new ExportModal(
			plugin.app, plugin.dataManager, plugin.sharedRegistry,
			'tabular', plugin.manifest.version, plugin.caseVariablesRegistry,
		).open();
	},
});
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: tsc passes

- [ ] **Step 4: Commit**

```bash
git add src/export/exportCommands.ts
~/.claude/scripts/commit.sh "feat(export): command palette 'Export codes as tabular data' + openExportModal aceita 'tabular'"
```

### Task 5.3: Settings tab button

**Files:**
- Modify: `src/core/settingTab.ts`

**IMPORTANT (verified):** `settingTab.ts` JÁ tem uma seção `// ── Export ──` com `h2: 'Export'` e dois `new Setting(...)` (QDPX, QDC) por volta da linha 175-194. **NÃO criar novo h2**. Apenas adicionar terceiro `Setting` ao final dessa seção existente.

- [ ] **Step 1: Add button to existing Export section**

Localize o bloco `// ── Export ──` (em torno da linha 175). Após os dois `Setting` existentes (QDPX e QDC), adicionar:

```typescript
new Setting(containerEl)
	.setName('Tabular export for external analysis')
	.setDesc('Export codes, segments, and case variables as a zip of CSVs for use in R, Python, or BI tools.')
	.addButton(btn => btn
		.setButtonText('Open export dialog')
		.onClick(() => openExportModal(this.plugin, 'tabular')));
```

Import `openExportModal` no topo do arquivo se ainda não estiver importado.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/settingTab.ts
~/.claude/scripts/commit.sh "feat(settings): botão 'Open export dialog' abre ExportModal com tabular pré-selecionado"
```

---

## Chunk 6: Docs + end-to-end validation

### Task 6.1: Update docs

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `docs/TECHNICAL-PATTERNS.md`, `docs/ROADMAP.md`, `CLAUDE.md`

- [ ] **Step 1: ARCHITECTURE §5 Export — adicionar subseção tabular**

Após a seção de QDPX, adicionar parágrafo descrevendo o novo formato tabular, o fluxo do orchestrator e a resolução de texto via PapaParse.

- [ ] **Step 2: TECHNICAL-PATTERNS — se houver gotcha digno de registro**

Candidato a registrar: "CSV export UTF-8 BOM pra Excel; use `read_csv` (tidyverse) não `read.csv` (base R) pra quoting multi-linha". Só se não duplicar algo já existente.

- [ ] **Step 3: ROADMAP §2 — marcar tabular export como feito**

Riscar a linha "Tabular export pra análise externa" e anotar FEITO 2026-04-24.

- [ ] **Step 4: Run test suite to get final count**

Run: `npm run test`
Expected: PASS. Note the final count.

- [ ] **Step 5: CLAUDE.md — atualizar estrutura de arquivos + contagem de testes**

Adicionar bloco `src/export/tabular/` na árvore de diretórios. Atualizar contagem de testes com o número real do Step 4.

- [ ] **Step 6: Commit**

```bash
git add docs/ARCHITECTURE.md docs/TECHNICAL-PATTERNS.md docs/ROADMAP.md CLAUDE.md
~/.claude/scripts/commit.sh "docs: tabular export — ARCHITECTURE §5, ROADMAP §2 feito, CLAUDE.md estrutura + contagem testes"
```

### Task 6.2: Smoke test manual

- [ ] **Step 1: Rebuild and reinstall on workbench**

Run: `npm run build`. Main.js path (`.obsidian/plugins/obsidian-qualia-coding/main.js`) é o mesmo path dentro do vault workbench — hot-reload pega sozinho. Fazer `Cmd+R` no Obsidian se necessário.

- [ ] **Step 2: Export via command palette**

Abrir workbench vault. Cmd+P → "Qualia Coding: Export codes as tabular data (for R/Python)". Modal abre com Tabular selecionado. Confirmar ambos toggles visíveis e marcados por default.

- [ ] **Step 3: Export com ambos toggles on**

Clicar Export. Confirmar que `qualia-project.zip` é criado na raiz do vault.

- [ ] **Step 4: Inspect zip**

```bash
cd /tmp && mkdir tabular-smoke && cd tabular-smoke
unzip ~/Desktop/obsidian-plugins-workbench/qualia-project.zip
ls
# expect: README.md, case_variables.csv, code_applications.csv, codes.csv, relations.csv, segments.csv
head segments.csv
```

Verificar que o header tem `engine`, `sourceType`, `shape_type`, `shape_coords`. Abrir README.md no editor — confirmar que tem seções das 5 tabelas + R/Python snippets.

- [ ] **Step 5: Export com shape coords off**

Voltar ao modal, desmarcar "Include shape coords", re-exportar. Confirmar que `segments.csv` agora NÃO tem colunas shape_*. Confirmar que README.md NÃO menciona shape_coords.

- [ ] **Step 6: Export com relations off**

Desmarcar "Include relations", re-exportar. Confirmar que o zip NÃO contém `relations.csv`.

- [ ] **Step 7: Settings button**

Abrir Settings > Qualia Coding. Scroll até Export section. Clicar "Open export dialog" → modal abre com Tabular pré-selecionado.

- [ ] **Step 8: Sanity check no R (opcional)**

Se o usuário tem R disponível, rodar:
```r
library(tidyverse)
segments <- read_csv("segments.csv")
dim(segments)
unique(segments$engine)
```

Esperado: lê sem erro, engines corretos aparecem.

---

**Fim do plano.** Contagem estimada: 7 novos arquivos em `src/export/tabular/`, 3 modificados (`exportModal.ts`, `exportCommands.ts`, `core/settingTab.ts`), 7 suites de teste novas em `tests/export/tabular/`, ~40-50 testes novos. Sem dependências novas.
