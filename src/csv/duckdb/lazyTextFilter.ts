/**
 * LazyTextFilter — IFilter custom pra Infinite Row Model em modo lazy.
 *
 * Diferença vs `agTextColumnFilter` padrão: chama `gridApi.refreshInfiniteCache()`
 * em vez de `params.filterChangedCallback()`. `refreshInfiniteCache` mantém rows
 * antigas visíveis durante o re-fetch do datasource (vs `purgeInfiniteCache` que
 * limpa o viewport sync e causa flash branco). Pre-fetch da query DuckDB roda
 * antes pra que o getRows do datasource encontre o whereClause já em
 * `lazyState.currentFilter`.
 *
 * UI: paridade com agTextColumnFilter — 8 operadores (contains/notContains/
 * equals/notEqual/startsWith/endsWith/blank/notBlank) + AND/OR + 2 conditions.
 * Auto-apply via debounce (sem buttons Apply/Reset).
 *
 * Model schema é compatível com `buildWhereClause` (filterModelToSql.ts) — gera
 * `ISimpleFilterModel` ou `ICombinedSimpleModel`.
 */

import type {
	IFilter, IFilterParams, IDoesFilterPassParams, GridApi,
	ISimpleFilterModel, ICombinedSimpleModel,
} from "ag-grid-community";
import type { DuckDBRowProvider } from "./duckdbRowProvider";
import type { QualiaMarkersTable } from "./qualiaMarkersTable";
import type { CodeDefinitionRegistry } from "../../core/codeDefinitionRegistry";
import { buildWhereClause, type AgFilterModel } from "./filterModelToSql";
import { buildVirtualFilterClause, splitFilterModel, combineClauses } from "./virtualFilterResolver";

export interface LazyTextFilterContext {
	getProvider(): DuckDBRowProvider | null;
	getMarkersTable(): QualiaMarkersTable | null;
	getOriginalHeaders(): readonly string[];
	getRegistry(): CodeDefinitionRegistry;
	getCurrentFilterModel(): AgFilterModel | null;
	getTotalRows(): number;
	getGridApi(): GridApi | null;
	applyPrefetched(whereClause: string | undefined, filteredCount: number): void;
	scheduleDisplayMapRebuild(): void;
}

interface LazyTextFilterParams extends IFilterParams {
	context: LazyTextFilterContext;
}

type SimpleModel = ISimpleFilterModel & { filter?: string };
type CombinedModel = ICombinedSimpleModel<SimpleModel>;
type FilterModel = SimpleModel | CombinedModel;

const DEBOUNCE_MS = 300;

const OPERATORS: Array<{ value: string; label: string; needsInput: boolean }> = [
	{ value: "contains",     label: "Contains",      needsInput: true },
	{ value: "notContains",  label: "Not contains",  needsInput: true },
	{ value: "equals",       label: "Equals",        needsInput: true },
	{ value: "notEqual",     label: "Not equal",     needsInput: true },
	{ value: "startsWith",   label: "Starts with",   needsInput: true },
	{ value: "endsWith",     label: "Ends with",     needsInput: true },
	{ value: "blank",        label: "Blank",         needsInput: false },
	{ value: "notBlank",     label: "Not blank",     needsInput: false },
];

interface ConditionUI {
	root: HTMLDivElement;
	typeSelect: HTMLSelectElement;
	input: HTMLInputElement;
}

export class LazyTextFilter implements IFilter {
	private params!: LazyTextFilterParams;
	private context!: LazyTextFilterContext;
	private gui!: HTMLDivElement;
	private spinnerEl!: HTMLDivElement;
	private cond1!: ConditionUI;
	private cond2!: ConditionUI;
	private joinRow!: HTMLDivElement;
	private joinAndRadio!: HTMLInputElement;
	private joinOrRadio!: HTMLInputElement;
	private currentModel: FilterModel | null = null;
	private debounceTimer: number | null = null;
	private prefetchToken = 0;

	init(params: LazyTextFilterParams): void {
		this.params = params;
		this.context = params.context;

		this.gui = document.createElement("div");
		this.gui.className = "lazy-text-filter";

		// Header com spinner discreto
		const header = document.createElement("div");
		header.className = "lazy-text-filter-header";
		const title = document.createElement("span");
		title.textContent = "Filter";
		header.appendChild(title);
		this.spinnerEl = document.createElement("div");
		this.spinnerEl.className = "lazy-text-filter-spinner";
		this.spinnerEl.style.visibility = "hidden";
		header.appendChild(this.spinnerEl);
		this.gui.appendChild(header);

		// 1ª condition
		this.cond1 = this.buildCondition();
		this.gui.appendChild(this.cond1.root);

		// AND/OR (entre as 2 conditions)
		this.joinRow = document.createElement("div");
		this.joinRow.className = "lazy-text-filter-join";
		this.joinAndRadio = this.buildRadio("AND", true);
		this.joinOrRadio  = this.buildRadio("OR", false);
		this.joinRow.appendChild(this.joinAndRadio.parentElement!);
		this.joinRow.appendChild(this.joinOrRadio.parentElement!);
		this.gui.appendChild(this.joinRow);

		// 2ª condition
		this.cond2 = this.buildCondition();
		this.gui.appendChild(this.cond2.root);
	}

	private buildCondition(): ConditionUI {
		const root = document.createElement("div");
		root.className = "lazy-text-filter-condition";

		// Wrapper pro caret pseudo-element (não dá pra usar ::after direto em <select>).
		const selectWrapper = document.createElement("div");
		selectWrapper.className = "lazy-text-filter-select-wrapper";
		const select = document.createElement("select");
		select.className = "lazy-text-filter-select";
		for (const op of OPERATORS) {
			const opt = document.createElement("option");
			opt.value = op.value;
			opt.textContent = op.label;
			select.appendChild(opt);
		}
		select.addEventListener("change", () => {
			this.refreshConditionVisibility();
			this.scheduleApply();
		});
		selectWrapper.appendChild(select);
		root.appendChild(selectWrapper);

		const input = document.createElement("input");
		input.type = "text";
		input.className = "lazy-text-filter-input";
		input.placeholder = "Filter…";
		input.addEventListener("input", () => this.scheduleApply());
		root.appendChild(input);

		return { root, typeSelect: select, input };
	}

	private buildRadio(value: string, checked: boolean): HTMLInputElement {
		const wrapper = document.createElement("label");
		wrapper.className = "lazy-text-filter-radio";
		const radio = document.createElement("input");
		radio.type = "radio";
		radio.name = `lazy-text-filter-join-${this.params?.column?.getColId() ?? Math.random()}`;
		radio.value = value;
		radio.checked = checked;
		radio.addEventListener("change", () => this.scheduleApply());
		wrapper.appendChild(radio);
		const labelText = document.createElement("span");
		labelText.textContent = value;
		wrapper.appendChild(labelText);
		return radio;
	}

	private refreshConditionVisibility(): void {
		// Esconde input quando operador é blank/notBlank.
		for (const c of [this.cond1, this.cond2]) {
			const op = OPERATORS.find(o => o.value === c.typeSelect.value);
			c.input.style.display = op?.needsInput === false ? "none" : "";
		}
		// Mostra cond2 + join apenas se cond1 está "active".
		const c1Active = this.isConditionActive(this.cond1);
		this.joinRow.style.display = c1Active ? "" : "none";
		this.cond2.root.style.display = c1Active ? "" : "none";
	}

	private isConditionActive(c: ConditionUI): boolean {
		const op = OPERATORS.find(o => o.value === c.typeSelect.value);
		if (!op) return false;
		if (!op.needsInput) return true; // blank/notBlank sempre ativo
		return c.input.value.trim().length > 0;
	}

	private readCondition(c: ConditionUI): SimpleModel | null {
		const type = c.typeSelect.value;
		const op = OPERATORS.find(o => o.value === type);
		if (!op) return null;
		if (!op.needsInput) {
			return { filterType: "text", type, filter: "" } as SimpleModel;
		}
		const value = c.input.value.trim();
		if (!value) return null;
		return { filterType: "text", type, filter: value } as SimpleModel;
	}

	private buildModel(): FilterModel | null {
		const m1 = this.readCondition(this.cond1);
		const m2 = this.readCondition(this.cond2);
		if (m1 && m2) {
			const operator = this.joinOrRadio.checked ? "OR" : "AND";
			return {
				filterType: "text",
				operator,
				conditions: [m1, m2],
			} as CombinedModel;
		}
		return m1 ?? m2 ?? null;
	}

	private scheduleApply(): void {
		this.refreshConditionVisibility();
		if (this.debounceTimer != null) window.clearTimeout(this.debounceTimer);
		this.debounceTimer = window.setTimeout(() => {
			this.debounceTimer = null;
			void this.applyFilter();
		}, DEBOUNCE_MS);
	}

	getGui(): HTMLElement {
		return this.gui;
	}

	isFilterActive(): boolean {
		return this.currentModel !== null;
	}

	doesFilterPass(_params: IDoesFilterPassParams): boolean {
		// Não chamado em Infinite Row Model (server-side).
		return true;
	}

	getModel(): FilterModel | null {
		return this.currentModel;
	}

	setModel(model: FilterModel | null): void {
		this.currentModel = model;
		if (!model) {
			// Reset
			this.cond1.typeSelect.value = "contains";
			this.cond1.input.value = "";
			this.cond2.typeSelect.value = "contains";
			this.cond2.input.value = "";
			this.joinAndRadio.checked = true;
			this.joinOrRadio.checked = false;
			this.refreshConditionVisibility();
			return;
		}
		if ("conditions" in model && Array.isArray(model.conditions)) {
			const [a, b] = model.conditions;
			if (a) {
				this.cond1.typeSelect.value = a.type ?? "contains";
				this.cond1.input.value = a.filter ?? "";
			}
			if (b) {
				this.cond2.typeSelect.value = b.type ?? "contains";
				this.cond2.input.value = b.filter ?? "";
			}
			this.joinAndRadio.checked = model.operator !== "OR";
			this.joinOrRadio.checked = model.operator === "OR";
		} else {
			const m = model as SimpleModel;
			this.cond1.typeSelect.value = m.type ?? "contains";
			this.cond1.input.value = m.filter ?? "";
			this.cond2.typeSelect.value = "contains";
			this.cond2.input.value = "";
		}
		this.refreshConditionVisibility();
	}

	afterGuiAttached(): void {
		this.refreshConditionVisibility();
		this.cond1?.input.focus();
	}

	destroy(): void {
		if (this.debounceTimer != null) {
			window.clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
	}

	private async applyFilter(): Promise<void> {
		const provider = this.context.getProvider();
		if (!provider) return;

		const newModel = this.buildModel();

		const colId = this.params.column.getColId();
		const others = this.context.getCurrentFilterModel() ?? {};
		const fullModel: AgFilterModel = { ...others };
		if (newModel) (fullModel as Record<string, unknown>)[colId] = newModel;
		else delete (fullModel as Record<string, unknown>)[colId];

		const { real, virtual } = splitFilterModel(fullModel, this.context.getOriginalHeaders());
		const realClause = buildWhereClause(real);
		const markersTable = this.context.getMarkersTable();
		const virtualClause = markersTable
			? buildVirtualFilterClause(virtual, {
					tableName: markersTable.tableName,
					codeRegistry: this.context.getRegistry(),
				})
			: null;
		const whereClause = combineClauses([realClause, virtualClause]) ?? undefined;

		this.showSpinner(true);
		const token = ++this.prefetchToken;

		try {
			const filteredCount = whereClause
				? await provider.getRowCount(whereClause)
				: this.context.getTotalRows();
			if (token !== this.prefetchToken) return;

			const gridApi = this.context.getGridApi();
			if (!gridApi) return;

			this.context.applyPrefetched(whereClause, filteredCount);
			this.currentModel = newModel;

			gridApi.setRowCount(filteredCount, true);
			if (filteredCount > 0) gridApi.ensureIndexVisible(0);

			// Listener one-shot em `modelUpdated` (dispara quando refreshInfiniteCache
			// commits os blocos novos no cache). Força re-render via refreshCells —
			// virtual cols (cod-seg/cod-frow/comment) têm `field` apontando pra coluna
			// inexistente no parquet, então AG Grid não detecta change automaticamente
			// e cells ficam stale exibindo dado da row anterior. refreshCells({force:true})
			// dispara cellRenderer com params.data atual.
			const onUpdate = (): void => {
				const api = this.context.getGridApi();
				if (!api) return;
				api.refreshCells({ force: true });
				api.removeEventListener("modelUpdated", onUpdate);
			};
			gridApi.addEventListener("modelUpdated", onUpdate);

			gridApi.refreshInfiniteCache();
			this.context.scheduleDisplayMapRebuild();
		} catch (err) {
			console.warn("[lazy-text-filter] prefetch failed", err);
		} finally {
			if (token === this.prefetchToken) this.showSpinner(false);
		}
	}

	private showSpinner(visible: boolean): void {
		this.spinnerEl.style.visibility = visible ? "visible" : "hidden";
	}
}
