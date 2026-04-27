import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig } from "../../data/dataTypes";

export function renderCodeMetadataView(ctx: AnalyticsViewContext, _filters: FilterConfig): void {
  const container = ctx.chartContainer;
  if (!container) return;
  container.empty();
  container.createDiv({ cls: "codemarker-analytics-empty" }).createEl("p", {
    text: "Code × Metadata — render WIP",
  });
}

export function renderCodeMetadataOptionsSection(ctx: AnalyticsViewContext): void {
  const panel = ctx.configPanelEl;
  if (!panel) return;
  const section = panel.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Code × Metadata" });

  // ─── Variable dropdown ───
  const registry = ctx.plugin.caseVariablesRegistry;
  const allNames = registry.getAllVariableNames();
  const validNames = allNames.filter((n) => registry.getValuesForVariable(n).length > 0);

  const varRow = section.createDiv({ cls: "codemarker-config-row" });
  varRow.createDiv({ cls: "codemarker-config-sublabel", text: "Variable" });
  const varSelect = varRow.createEl("select");
  varSelect.createEl("option", { value: "", text: "— Select —" });
  for (const name of validNames) {
    const opt = varSelect.createEl("option", { value: name, text: name });
    if (ctx.cmVariable === name) opt.selected = true;
  }
  varSelect.addEventListener("change", () => {
    ctx.cmVariable = varSelect.value || null;
    ctx.scheduleUpdate();
  });

  // ─── Display radios ───
  section.createDiv({ cls: "codemarker-config-sublabel", text: "Display" });
  for (const [val, label] of [
    ["count", "Count"],
    ["pct-row", "% by row (code)"],
    ["pct-col", "% by column (value)"],
  ] as const) {
    const row = section.createDiv({ cls: "codemarker-config-row" });
    const radio = row.createEl("input", { type: "radio" });
    radio.name = "cmDisplay";
    radio.value = val;
    radio.checked = ctx.cmDisplay === val;
    row.createSpan({ text: label });
    const setDisplay = () => {
      ctx.cmDisplay = val;
      ctx.scheduleUpdate();
    };
    radio.addEventListener("change", setDisplay);
    row.addEventListener("click", (ev) => {
      if (ev.target !== radio) {
        radio.checked = true;
        setDisplay();
      }
    });
  }

  // ─── Hide missing checkbox ───
  const missingRow = section.createDiv({ cls: "codemarker-config-row" });
  const missingCheck = missingRow.createEl("input", { type: "checkbox" });
  missingCheck.checked = ctx.cmHideMissing;
  missingRow.createSpan({ text: "Hide (missing) column" });
  const setMissing = () => {
    ctx.cmHideMissing = missingCheck.checked;
    ctx.scheduleUpdate();
  };
  missingCheck.addEventListener("change", setMissing);
  missingRow.addEventListener("click", (ev) => {
    if (ev.target !== missingCheck) {
      missingCheck.checked = !missingCheck.checked;
      setMissing();
    }
  });
}

export function exportCodeMetadataCSV(_ctx: AnalyticsViewContext, _date: string): void {
  // WIP — implementado no Chunk 4
}
