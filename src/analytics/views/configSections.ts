
import type { SourceType } from "../data/dataTypes";
import type { AnalyticsViewContext, ViewMode } from "./analyticsViewContext";
import { MODE_REGISTRY } from "./modes/modeRegistry";
import type { CaseVariablesRegistry } from "../../core/caseVariables/caseVariablesRegistry";

export function renderSourcesSection(ctx: AnalyticsViewContext): void {
  if (!ctx.configPanelEl || !ctx.data) return;

  const section = ctx.configPanelEl.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Sources" });

  const sources: Array<{ label: string; keys: SourceType[]; active: boolean }> = [
    { label: "Markdown", keys: ["markdown"], active: ctx.data.sources.markdown },
    { label: "CSV", keys: ["csv-segment", "csv-row"], active: ctx.data.sources.csv },
    { label: "Image", keys: ["image"], active: ctx.data.sources.image },
    { label: "PDF", keys: ["pdf"], active: ctx.data.sources.pdf },
    { label: "Audio", keys: ["audio"], active: ctx.data.sources.audio },
    { label: "Video", keys: ["video"], active: ctx.data.sources.video },
  ];

  for (const src of sources) {
    const row = section.createDiv({
      cls: "codemarker-config-row" + (!src.active ? " is-disabled" : ""),
    });
    const cb = row.createEl("input", { type: "checkbox" });
    cb.checked = src.keys.every((k) => ctx.enabledSources.has(k));
    cb.disabled = !src.active;
    row.createSpan({ text: src.label });

    // Count
    if (src.active) {
      const count = ctx.data.markers.filter((m) => src.keys.includes(m.source)).length;
      row.createSpan({ cls: "codemarker-config-count", text: `(${count})` });
    }

    cb.addEventListener("change", () => {
      for (const k of src.keys) {
        if (cb.checked) ctx.enabledSources.add(k);
        else ctx.enabledSources.delete(k);
      }
      ctx.scheduleUpdate();
    });
    row.addEventListener("click", (e) => {
      if (e.target !== cb && src.active) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      }
    });
  }
}

export function renderViewModeSection(ctx: AnalyticsViewContext): void {
  if (!ctx.configPanelEl) return;

  const section = ctx.configPanelEl.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "View" });

  for (const [value, entry] of Object.entries(MODE_REGISTRY) as [ViewMode, typeof MODE_REGISTRY[ViewMode]][]) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "viewMode";
    radio.value = value;
    radio.checked = ctx.viewMode === value;
    row.createSpan({ text: entry.label });

    radio.addEventListener("change", () => {
      ctx.viewMode = value;
      ctx.trMarkerFilter = null;
      ctx.renderConfigPanel();
      ctx.scheduleUpdate();
    });
    row.addEventListener("click", (e) => {
      if (e.target !== radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change"));
      }
    });
  }
}

export function renderCodesSection(ctx: AnalyticsViewContext): void {
  if (!ctx.configPanelEl || !ctx.data) return;

  const section = ctx.configPanelEl.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Codes" });

  // Select all / Deselect all
  const actions = section.createDiv({ cls: "codemarker-config-actions" });
  const selectAll = actions.createSpan({ cls: "codemarker-config-action", text: "Select All" });
  const deselectAll = actions.createSpan({ cls: "codemarker-config-action", text: "Deselect All" });

  selectAll.addEventListener("click", () => {
    ctx.enabledCodes = new Set((ctx.data?.codes ?? []).map((c) => c.name));
    ctx.disabledCodes.clear();
    renderCodesSection(ctx);
    ctx.scheduleUpdate();
  });
  deselectAll.addEventListener("click", () => {
    for (const name of ctx.enabledCodes) ctx.disabledCodes.add(name);
    ctx.enabledCodes.clear();
    renderCodesSection(ctx);
    ctx.scheduleUpdate();
  });

  // Search
  const search = section.createEl("input", {
    cls: "codemarker-config-search",
    attr: { type: "text", placeholder: "Search codes..." },
  });
  search.value = ctx.codeSearch;
  search.addEventListener("input", () => {
    ctx.codeSearch = search.value;
    renderCodesList(ctx, codesList);
  });

  const codesList = section.createDiv({ cls: "codemarker-config-codes-list" });
  renderCodesList(ctx, codesList);
}

function renderCodesList(ctx: AnalyticsViewContext, container: HTMLElement): void {
  container.empty();

  // Count frequency for display (respecting enabled sources)
  const freq = new Map<string, number>();
  if (ctx.data) {
    for (const m of ctx.data.markers) {
      if (!ctx.enabledSources.has(m.source)) continue;
      for (const c of m.codes) {
        freq.set(c, (freq.get(c) ?? 0) + 1);
      }
    }
  }

  const filtered = (ctx.data?.codes ?? []).filter(
    (c) => !ctx.codeSearch || c.name.toLowerCase().includes(ctx.codeSearch.toLowerCase())
  );

  for (const code of filtered) {
    const row = container.createDiv({ cls: "codemarker-config-row" });
    const cb = row.createEl("input", { type: "checkbox" });
    cb.checked = ctx.enabledCodes.has(code.name);

    const swatch = row.createDiv({ cls: "codemarker-config-swatch" });
    swatch.style.backgroundColor = code.color;

    row.createSpan({ text: code.name });
    row.createSpan({
      cls: "codemarker-config-count",
      text: `(${freq.get(code.name) ?? 0})`,
    });

    cb.addEventListener("change", () => {
      if (cb.checked) {
        ctx.enabledCodes.add(code.name);
        ctx.disabledCodes.delete(code.name);
      } else {
        ctx.enabledCodes.delete(code.name);
        ctx.disabledCodes.add(code.name);
      }
      ctx.scheduleUpdate();
    });
    row.addEventListener("click", (e) => {
      if (e.target !== cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      }
    });
  }
}

export function renderMinFreqSection(ctx: AnalyticsViewContext): void {
  if (!ctx.configPanelEl) return;

  const section = ctx.configPanelEl.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Min frequency" });

  const row = section.createDiv({ cls: "codemarker-config-row" });
  const input = row.createEl("input", {
    cls: "codemarker-config-number",
    attr: { type: "number", min: "1", value: String(ctx.minFrequency) },
  });
  input.addEventListener("input", () => {
    const val = parseInt(input.value);
    if (!isNaN(val) && val >= 1) {
      ctx.minFrequency = val;
      ctx.scheduleUpdate();
    }
  });
}

export function renderCaseVariablesFilter(
  container: HTMLElement,
  registry: CaseVariablesRegistry,
  state: { filter: { name: string; value: string } | null },
  onChange: (filter: { name: string; value: string } | null) => void,
): void {
  const varNames = registry.getAllVariableNames();
  if (varNames.length === 0) return;

  const section = container.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Filter by case variable" });

  const nameSelect = section.createEl("select", { cls: "codemarker-config-select" });
  nameSelect.appendChild(new Option("— none —", ""));
  for (const name of varNames) {
    nameSelect.appendChild(new Option(name, name));
  }

  const valueSelect = section.createEl("select", { cls: "codemarker-config-select" });
  valueSelect.appendChild(new Option("— any —", ""));

  const updateValueOptions = (varName: string) => {
    valueSelect.innerHTML = "";
    valueSelect.appendChild(new Option("— any —", ""));
    if (varName) {
      for (const v of registry.getValuesForVariable(varName)) {
        const s = String(v);
        valueSelect.appendChild(new Option(s, s));
      }
    }
  };

  const emit = () => {
    const name = nameSelect.value;
    const value = valueSelect.value;
    if (name && value) onChange({ name, value });
    else onChange(null);
  };

  nameSelect.addEventListener("change", () => {
    updateValueOptions(nameSelect.value);
    emit();
  });
  valueSelect.addEventListener("change", emit);

  // Initial state
  if (state.filter) {
    nameSelect.value = state.filter.name;
    updateValueOptions(state.filter.name);
    valueSelect.value = state.filter.value;
  }
}
