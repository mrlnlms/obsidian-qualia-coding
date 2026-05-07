/**
 * Traduz `filterModel` AG Grid das virtual cols (cod-frow/cod-seg/comment)
 * pra SQL fragment que filtra `__source_row` contra a temp table de markers.
 *
 * Strategy:
 * - cod-frow / cod-seg: AG Grid Text Filter trabalha contra o LABEL textual da
 *   célula (ex: "violência;coerção"). Pra traduzir pra DuckDB, **JS-side
 *   pré-resolve** o pattern do user contra o nome dos códigos no registry,
 *   gera lista de code_ids matching, IN clause SQL. Vantagem: registry
 *   permanece JS-only (rename/recolor não invalida temp table).
 *
 * - comment: ILIKE direto sobre comment_text — não precisa code resolve.
 *
 * Pre-resolve de nomes de código retorna lista vazia → emite `1=0` (filtro
 * impossível, retorna 0 rows). Semantically correto: "Contains 'xyz' onde
 * nenhum code matcha 'xyz'" = vazio.
 *
 * Pattern matching ops alinha com `filterModelToSql.buildSimpleClause` (text
 * filter): contains/notContains/equals/notEqual/startsWith/endsWith/blank/
 * notBlank.
 */

import type { ISimpleFilterModel, ICombinedSimpleModel } from "ag-grid-community";
import type { CodeDefinitionRegistry } from "../../core/codeDefinitionRegistry";
import type { AgFilterModel } from "./filterModelToSql";

type AnySimpleModel = ISimpleFilterModel & {
	filter?: string | number | null;
	filterTo?: string | number | null;
};
type AnyCombinedModel = ICombinedSimpleModel<AnySimpleModel>;
type AnyFilterModel = AnySimpleModel | AnyCombinedModel;

export interface VirtualFilterContext {
	tableName: string;
	codeRegistry: CodeDefinitionRegistry;
	/** Status accepted-only por default. Toggle "include suggestions" vira plan da feature LLM. */
	statusFilter?: "accepted-only" | "all";
}

interface ParsedField {
	sourceColumn: string;
	suffix: "cod-frow" | "cod-seg" | "comment";
}

const VIRTUAL_FIELD_RE = /^(.+)_(cod-frow|cod-seg|comment)$/;

export function parseVirtualField(field: string): ParsedField | null {
	const m = field.match(VIRTUAL_FIELD_RE);
	if (!m) return null;
	return { sourceColumn: m[1]!, suffix: m[2] as ParsedField["suffix"] };
}

function quoteString(v: string): string {
	return `'${v.replace(/'/g, "''")}'`;
}

function escapeLike(v: string): string {
	return v.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Resolve nome → ids contra o registry, retornando code_ids cujo `name` matcha o filter op + value. */
function resolveCodeIds(
	registry: CodeDefinitionRegistry,
	op: string,
	value: string,
): string[] {
	const all = registry.getAll();
	const v = value.toLowerCase();
	const ids: string[] = [];
	for (const def of all) {
		const name = (def.name ?? "").toLowerCase();
		let matches = false;
		switch (op) {
			case "contains": matches = name.includes(v); break;
			case "notContains": matches = !name.includes(v); break;
			case "equals": matches = name === v; break;
			case "notEqual": matches = name !== v; break;
			case "startsWith": matches = name.startsWith(v); break;
			case "endsWith": matches = name.endsWith(v); break;
			default: matches = false;
		}
		if (matches) ids.push(def.id);
	}
	return ids;
}

function buildCodeKindClause(
	parsed: ParsedField,
	model: AnySimpleModel,
	ctx: VirtualFilterContext,
): string | null {
	const type = model.type;
	if (!type || type === "empty") return null;

	const kind = parsed.suffix === "cod-frow" ? "frow" : "seg";
	const colCol = quoteString(parsed.sourceColumn);
	const statusClause = ctx.statusFilter === "all" ? "" : ` AND status = 'accepted'`;
	const baseSubquery = `SELECT source_row FROM ${ctx.tableName} WHERE kind = '${kind}' AND column_name = ${colCol}${statusClause}`;

	if (type === "blank") {
		// "Blank" pra cod-frow/cod-seg = rows sem nenhum code aplicado nesta col
		return `__source_row NOT IN (${baseSubquery})`;
	}
	if (type === "notBlank") {
		return `__source_row IN (${baseSubquery})`;
	}

	// Text filter ops — resolve nome pra ids
	const filterType = model.filterType ?? "text";
	if (filterType !== "text") return null;
	const raw = model.filter;
	if (raw == null || raw === "") return null;
	const value = String(raw);

	const matchedIds = resolveCodeIds(ctx.codeRegistry, type, value);
	if (matchedIds.length === 0) {
		// notContains/notEqual com zero matches significa "todos" — não "nenhum"
		if (type === "notContains" || type === "notEqual") {
			return `__source_row IN (${baseSubquery})`;
		}
		return "1=0";
	}

	const idList = matchedIds.map(quoteString).join(", ");
	return `__source_row IN (${baseSubquery} AND code_id IN (${idList}))`;
}

function buildCommentClause(
	parsed: ParsedField,
	model: AnySimpleModel,
	ctx: VirtualFilterContext,
): string | null {
	const type = model.type;
	if (!type || type === "empty") return null;

	const colCol = quoteString(parsed.sourceColumn);
	const statusClause = ctx.statusFilter === "all" ? "" : ` AND status = 'accepted'`;
	const base = `SELECT source_row FROM ${ctx.tableName} WHERE kind = 'comment' AND column_name = ${colCol}${statusClause}`;

	if (type === "blank") {
		return `__source_row NOT IN (${base} AND comment_text IS NOT NULL AND comment_text <> '')`;
	}
	if (type === "notBlank") {
		return `__source_row IN (${base} AND comment_text IS NOT NULL AND comment_text <> '')`;
	}

	const filterType = model.filterType ?? "text";
	if (filterType !== "text") return null;
	const raw = model.filter;
	if (raw == null || raw === "") return null;
	const value = String(raw);
	const escaped = escapeLike(value).replace(/'/g, "''");

	let predicate: string;
	switch (type) {
		case "contains":
			predicate = `comment_text ILIKE '%${escaped}%' ESCAPE '\\'`;
			break;
		case "notContains":
			return `(__source_row NOT IN (${base} AND comment_text ILIKE '%${escaped}%' ESCAPE '\\') OR __source_row IN (${base} AND (comment_text IS NULL OR comment_text = '')))`;
		case "equals":
			predicate = `comment_text = ${quoteString(value)}`;
			break;
		case "notEqual":
			return `(__source_row NOT IN (${base} AND comment_text = ${quoteString(value)}) OR __source_row IN (${base} AND comment_text IS NULL))`;
		case "startsWith":
			predicate = `comment_text ILIKE '${escaped}%' ESCAPE '\\'`;
			break;
		case "endsWith":
			predicate = `comment_text ILIKE '%${escaped}' ESCAPE '\\'`;
			break;
		default:
			return null;
	}

	return `__source_row IN (${base} AND ${predicate})`;
}

function isCombined(m: AnyFilterModel): m is AnyCombinedModel {
	return Array.isArray((m as AnyCombinedModel).conditions);
}

function buildVirtualColumnClause(
	field: string,
	model: AnyFilterModel,
	ctx: VirtualFilterContext,
): string | null {
	const parsed = parseVirtualField(field);
	if (!parsed) return null;

	const isCommentKind = parsed.suffix === "comment";

	if (isCombined(model)) {
		const op = model.operator === "OR" ? "OR" : "AND";
		const parts = model.conditions
			.map((c) => isCommentKind
				? buildCommentClause(parsed, c, ctx)
				: buildCodeKindClause(parsed, c, ctx))
			.filter((p): p is string => p !== null);
		if (parts.length === 0) return null;
		if (parts.length === 1) return parts[0]!;
		return `(${parts.join(` ${op} `)})`;
	}

	return isCommentKind
		? buildCommentClause(parsed, model, ctx)
		: buildCodeKindClause(parsed, model, ctx);
}

/**
 * Builds combined SQL fragment pra TODAS as virtual cols entries no model.
 * Multiple virtual cols → AND join (mesma semântica da AG Grid pra real cols).
 * Retorna null se vazio.
 */
export function buildVirtualFilterClause(
	virtualFilterModel: AgFilterModel | null | undefined,
	ctx: VirtualFilterContext,
): string | null {
	if (!virtualFilterModel) return null;
	const parts: string[] = [];
	for (const [field, model] of Object.entries(virtualFilterModel)) {
		const clause = buildVirtualColumnClause(field, model, ctx);
		if (clause) parts.push(clause);
	}
	if (parts.length === 0) return null;
	return parts.join(" AND ");
}

/**
 * Separa filterModel em duas partes: real cols (existem no parquet schema) vs
 * virtual cols (cod-frow/cod-seg/comment). Pattern matching: field termina em
 * suffix conhecido E source col tá em originalHeaders → virtual. Senão real.
 */
export function splitFilterModel(
	filterModel: AgFilterModel | null | undefined,
	originalHeaders: ReadonlyArray<string>,
): { real: AgFilterModel; virtual: AgFilterModel } {
	const real: AgFilterModel = {};
	const virtual: AgFilterModel = {};
	if (!filterModel) return { real, virtual };

	const headerSet = new Set(originalHeaders);
	for (const [field, model] of Object.entries(filterModel)) {
		const parsed = parseVirtualField(field);
		if (parsed && headerSet.has(parsed.sourceColumn)) {
			virtual[field] = model;
		} else {
			real[field] = model;
		}
	}
	return { real, virtual };
}

/** Combina N clauses não-null com AND. Retorna null se todas vazias. */
export function combineClauses(clauses: ReadonlyArray<string | null | undefined>): string | null {
	const filtered = clauses.filter((c): c is string => !!c);
	if (filtered.length === 0) return null;
	if (filtered.length === 1) return filtered[0]!;
	return filtered.map((c) => `(${c})`).join(" AND ");
}
