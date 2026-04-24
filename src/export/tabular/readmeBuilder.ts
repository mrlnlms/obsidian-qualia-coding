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
