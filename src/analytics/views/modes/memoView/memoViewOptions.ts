import type { AnalyticsViewContext } from "../../analyticsViewContext";

export function renderMemoViewOptions(ctx: AnalyticsViewContext): void {
	const panel = ctx.configPanelEl;
	if (!panel) return;
	const section = panel.createDiv({ cls: "codemarker-config-section" });
	section.createDiv({ cls: "codemarker-config-section-title", text: "Memo View" });

	// ─── Group by (radio) ───
	section.createDiv({ cls: "codemarker-config-sublabel", text: "Group by" });
	for (const [val, label] of [["code", "Code (with hierarchy)"], ["file", "File"]] as const) {
		const row = section.createDiv({ cls: "codemarker-config-row" });
		const radio = row.createEl("input", { type: "radio" });
		radio.name = "mvGroupBy";
		radio.value = val;
		radio.checked = ctx.mvGroupBy === val;
		row.createSpan({ text: label });
		const handler = () => {
			ctx.mvGroupBy = val;
			ctx.mvExpanded.clear();
			ctx.scheduleUpdate();
			ctx.renderConfigPanel();
		};
		radio.addEventListener("change", handler);
		row.addEventListener("click", (ev) => {
			if (ev.target !== radio) {
				radio.checked = true;
				handler();
			}
		});
	}

	// ─── Show memo types (4 checkboxes) ───
	section.createDiv({ cls: "codemarker-config-sublabel", text: "Show memo types" });
	const types = ["code", "group", "relation", "marker"] as const;
	const labels: Record<string, string> = { code: "Code memos", group: "Group memos", relation: "Relation memos", marker: "Marker memos" };
	for (const t of types) {
		const row = section.createDiv({ cls: "codemarker-config-row" });
		const check = row.createEl("input", { type: "checkbox" });
		check.checked = ctx.mvShowTypes[t];
		row.createSpan({ text: labels[t]! });
		const handler = () => {
			ctx.mvShowTypes = { ...ctx.mvShowTypes, [t]: check.checked };
			ctx.scheduleUpdate();
		};
		check.addEventListener("change", handler);
		row.addEventListener("click", (ev) => {
			if (ev.target !== check) {
				check.checked = !check.checked;
				handler();
			}
		});
	}

	// ─── Marker limit (dropdown, só quando groupBy=code) ───
	if (ctx.mvGroupBy === "code") {
		section.createDiv({ cls: "codemarker-config-sublabel", text: "Marker limit per code" });
		const row = section.createDiv({ cls: "codemarker-config-row" });
		const select = row.createEl("select");
		for (const v of [5, 10, 25, "all"] as const) {
			const opt = select.createEl("option", { value: String(v), text: String(v) });
			if (ctx.mvMarkerLimit === v) opt.selected = true;
		}
		select.addEventListener("change", () => {
			const raw = select.value;
			ctx.mvMarkerLimit = (raw === "all" ? "all" : (parseInt(raw, 10) as 5 | 10 | 25));
			ctx.mvExpanded.clear();
			ctx.scheduleUpdate();
		});
	}
}
