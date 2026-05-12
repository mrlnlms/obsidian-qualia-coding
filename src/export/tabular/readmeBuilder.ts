export interface ReadmeOptions {
	pluginVersion: string;
	includeRelations: boolean;
	includeShapeCoords: boolean;
	warnings: string[];
	includeSmartCodes?: boolean;
}

export function buildReadme(opts: ReadmeOptions): string {
	const sections: string[] = [];
	sections.push(header(opts));
	sections.push(schemaSegments(opts));
	sections.push(schemaCodeApplications());
	sections.push(schemaCodes());
	sections.push(schemaGroups());
	sections.push(schemaCoders());
	sections.push(schemaCaseVariables());
	if (opts.includeRelations) sections.push(schemaRelations());
	if (opts.includeSmartCodes) sections.push(schemaSmartCodes());
	sections.push(exampleR(opts));
	sections.push(examplePython(opts));
	sections.push(exampleKappa());
	if (opts.warnings.length > 0) sections.push(warningsSection(opts.warnings));
	return sections.join('\n\n') + '\n';
}

function schemaSmartCodes(): string {
	return [
		'## smart_codes.csv',
		'',
		'Saved queries (Tier 3) — virtual codes definidos por predicate sobre markers + case vars.',
		'',
		'| Column | Type | Description |',
		'|---|---|---|',
		'| id | string | Smart code id (sc_*) |',
		'| name | string | Display name |',
		'| color | string | Hex color (#rrggbb) |',
		'| predicate_json | string | AST do predicate como JSON. Parse via fromJSON/json.loads |',
		'| memo | string | Justificativa metodológica (opcional) |',
		'| matches_at_export | number | Snapshot de quantos markers matchavam no momento do export |',
	].join('\n');
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
		'| `coder` | → `coders.id` (empty for legacy markers pre-multi-coder) |',
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
		'| `groups` | `;`-separated group names. Empty when not a member. Join with `groups.csv` via name |',
	].join('\n');
}

function schemaGroups(): string {
	return [
		'## `groups.csv`',
		'',
		'Code Groups (Tier 1.5 — flat N:N membership, orthogonal to hierarchy).',
		'',
		'| Column | Notes |',
		'|---|---|',
		'| `id` | |',
		'| `name` | |',
		'| `color` | hex (8 pastel colors from GROUP_PALETTE, or custom) |',
		'| `description` | optional |',
		'',
		'Join with `codes.csv` via the `groups` column (semicolon-separated names). See R / Python snippets below.',
	].join('\n');
}

function schemaCoders(): string {
	return [
		'## `coders.csv`',
		'',
		'Coders registry. Used as foreign key in `segments.coder`. Lets you compute inter-coder reliability when 2+ coders coded overlapping segments.',
		'',
		'| Column | Notes |',
		'|---|---|',
		'| `id` | stable id (`human:<slug>` or `llm:<slug>` or `consensus:<slug>`) |',
		'| `name` | display name |',
		'| `type` | `human` / `llm` / `consensus` |',
		'| `createdAt` | ISO 8601 |',
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

function exampleR(opts: ReadmeOptions): string {
	const lines = [
		'## Example — R (tidyverse)',
		'',
		'```r',
		'library(tidyverse)',
		'segments <- read_csv("segments.csv")',
		'apps <- read_csv("code_applications.csv")',
		'codes <- read_csv("codes.csv")',
		'groups <- read_csv("groups.csv")',
		'',
		'# Frequency per code (name resolved)',
		'apps %>%',
		'  inner_join(codes, by = c("code_id" = "id")) %>%',
		'  count(name, sort = TRUE)',
		'',
		'# Expand groups (semicolon-separated) and join with groups.csv',
		'codes_groups_long <- codes %>%',
		'  separate_rows(groups, sep = ";") %>%',
		'  rename(group_name = groups) %>%',
		'  left_join(groups, by = c("group_name" = "name"))',
	];
	if (opts.includeSmartCodes) {
		lines.push(
			'',
			'# Smart codes — predicate como JSON',
			'library(jsonlite)',
			'sc <- read_csv("smart_codes.csv")',
			'sc$predicate <- lapply(sc$predicate_json, fromJSON)',
		);
	}
	lines.push('```');
	return lines.join('\n');
}

function examplePython(opts: ReadmeOptions): string {
	const lines = [
		'## Example — Python (pandas)',
		'',
		'```python',
		'import pandas as pd',
		'segments = pd.read_csv("segments.csv")',
		'apps = pd.read_csv("code_applications.csv")',
		'codes = pd.read_csv("codes.csv")',
		'groups = pd.read_csv("groups.csv")',
		'',
		'# Frequency per code',
		'apps.merge(codes, left_on="code_id", right_on="id")["name"].value_counts()',
		'',
		'# Expand groups column (semicolon-separated) and join groups.csv',
		'codes_exp = codes.assign(groups=codes["groups"].str.split(";")).explode("groups")',
		'merged = codes_exp.merge(groups, left_on="groups", right_on="name", how="left")',
	];
	if (opts.includeSmartCodes) {
		lines.push(
			'',
			'# Smart codes — predicate como JSON',
			'import json',
			'sc = pd.read_csv("smart_codes.csv")',
			'sc["predicate"] = sc["predicate_json"].apply(json.loads)',
		);
	}
	lines.push('```');
	return lines.join('\n');
}

function exampleKappa(): string {
	return [
		'## Inter-coder reliability (Cohen κ)',
		'',
		'When 2+ coders coded overlapping segments, you can compute Cohen κ per code. The recipe:',
		'',
		'1. Pick a granularity (file, marker id, or character offset). Per-marker is simplest.',
		'2. Pivot `code_applications` × `segments.coder` into a matrix: row = unit, col = coder, cell = code applied (or `none`).',
		'3. Run κ on each pair of coder columns.',
		'',
		'```r',
		'library(tidyverse)',
		'library(irr)  # install.packages("irr")',
		'segments <- read_csv("segments.csv")',
		'apps <- read_csv("code_applications.csv")',
		'',
		'# 1 row per (segment, code), keep coder',
		'long <- apps %>%',
		'  inner_join(segments %>% select(id, coder, fileId), by = c("segment_id" = "id")) %>%',
		'  filter(!is.na(coder) & coder != "")',
		'',
		'# Pivot wide: row = (fileId, code_id), col = coder, value = 1 (applied)',
		'wide <- long %>%',
		'  distinct(fileId, code_id, coder) %>%',
		'  mutate(applied = 1) %>%',
		'  pivot_wider(names_from = coder, values_from = applied, values_fill = 0)',
		'',
		'# Cohen κ entre 2 coders específicos (ex: human:carla vs human:joana)',
		'kappa2(wide[, c("human:carla", "human:joana")])',
		'```',
		'',
		'```python',
		'import pandas as pd',
		'from sklearn.metrics import cohen_kappa_score',
		'',
		'segments = pd.read_csv("segments.csv")',
		'apps = pd.read_csv("code_applications.csv")',
		'',
		'long = apps.merge(segments[["id", "coder", "fileId"]], left_on="segment_id", right_on="id")',
		'long = long[long["coder"].notna() & (long["coder"] != "")]',
		'',
		'wide = (long[["fileId", "code_id", "coder"]]',
		'        .drop_duplicates()',
		'        .assign(applied=1)',
		'        .pivot_table(index=["fileId", "code_id"], columns="coder", values="applied", fill_value=0))',
		'',
		'# Cohen κ entre carla e joana',
		'cohen_kappa_score(wide["human:carla"], wide["human:joana"])',
		'```',
		'',
		'For Krippendorff α (3+ coders) or weighted κ, see `irr::kripp.alpha` (R) or `krippendorff` package (Python).',
	].join('\n');
}

function warningsSection(warnings: string[]): string {
	return [
		`## Warnings (${warnings.length})`,
		'',
		...warnings.map(w => `- ${w}`),
	].join('\n');
}
