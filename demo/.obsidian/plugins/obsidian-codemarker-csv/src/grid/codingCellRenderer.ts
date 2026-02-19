import { setIcon } from "obsidian";
import type { CodingModel } from "../coding/codingModel";
import type { GridApi } from "ag-grid-community";
import type CsvCodingPlugin from "../main";
import type { CsvCodingView } from "../csvCodingView";
import { openCodingPopover } from "../coding/codingMenu";

/** Cell renderer for cod-seg and cod-frow columns — tag chips + action button */
export function codingCellRenderer(params: any): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "csv-cod-seg-cell";

  const field: string = params.colDef.field;
  const row: number = params.node?.rowIndex ?? params.rowIndex ?? 0;
  const model: CodingModel | undefined = params.model;
  const gridApi: GridApi | undefined = params.gridApi;
  const file: string = params.file ?? "";
  const plugin: CsvCodingPlugin | undefined = params.plugin;
  const isFrow = field.endsWith("_cod-frow");
  const isSeg = field.endsWith("_cod-seg");

  // Extract source column name from field (e.g. "colA_cod-frow" → "colA")
  const sourceColumn = isFrow
    ? field.replace(/_cod-frow$/, "")
    : isSeg
      ? field.replace(/_cod-seg$/, "")
      : field;

  // Tag chips area
  const tagsArea = document.createElement("span");
  tagsArea.className = "csv-tag-area";

  if (model) {
    const codes = isFrow
      ? model.getCodesForCell(file, row, sourceColumn, "row")
      : model.getCodesForCell(file, row, sourceColumn, "segment");

    for (const codeName of codes) {
      const def = model.registry.getByName(codeName);
      const color = def?.color ?? "#888";

      const chip = document.createElement("span");
      chip.className = "csv-tag-chip";
      chip.style.backgroundColor = hexToRgba(color, 0.18);
      chip.style.color = color;
      chip.style.border = `1px solid ${hexToRgba(color, 0.35)}`;
      chip.style.cursor = "pointer";

      const label = document.createElement("span");
      label.textContent = codeName;
      chip.appendChild(label);

      // Click chip → open sidebar with marker details
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!plugin || !model) return;

        // Find the marker that has this code
        const markers = isFrow
          ? model.getRowMarkersForCell(file, row, sourceColumn)
          : model.getSegmentMarkersForCell(file, row, sourceColumn);
        const marker = markers.find(m => m.codes.includes(codeName));
        if (marker) {
          plugin.revealCsvCodeDetailPanel(marker.id, codeName);
        }
      });

      // × remove button (only for cod-frow — cod-seg managed in CM6 panel)
      if (isFrow && model && gridApi) {
        const xBtn = document.createElement("span");
        xBtn.className = "csv-tag-chip-x";
        xBtn.textContent = "×";
        xBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const markers = model.getRowMarkersForCell(file, row, sourceColumn);
          for (const m of markers) {
            if (m.codes.includes(codeName)) {
              model.removeCodeFromMarker(m.id, codeName);
            }
          }
          gridApi.refreshCells({ force: true });
        });
        chip.appendChild(xBtn);
      }

      tagsArea.appendChild(chip);
    }
  }

  wrapper.appendChild(tagsArea);

  // Tag button for cod-frow cells
  if (isFrow) {
    const btn = document.createElement("span");
    btn.className = "csv-cod-seg-btn";
    setIcon(btn, "tag");
    const svg = btn.querySelector("svg");
    if (svg) { svg.style.width = "14px"; svg.style.height = "14px"; svg.style.strokeWidth = "3"; svg.style.color = "var(--text-normal)"; }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (model && gridApi) {
        openCodingPopover(btn, model, file, row, sourceColumn, gridApi);
      }
    });
    wrapper.appendChild(btn);
  }

  return wrapper;
}

/** Renderer for source column when cod-seg is active: text + tag button */
export function sourceTagBtnRenderer(params: any): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "csv-cod-seg-cell";

  const text = document.createElement("span");
  text.className = "csv-cod-seg-text";
  text.style.flex = "1";
  text.textContent = params.value ?? "";

  const btn = document.createElement("span");
  btn.className = "csv-cod-seg-btn";
  setIcon(btn, "tag");
  const svg = btn.querySelector("svg");
  if (svg) { svg.style.width = "14px"; svg.style.height = "14px"; svg.style.strokeWidth = "3"; svg.style.color = "var(--text-normal)"; }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const segField: string = params.codSegField;
    const row = params.node?.rowIndex ?? params.rowIndex ?? 0;
    const file: string = params.file ?? "";
    const csvView: CsvCodingView | undefined = params.csvView;
    const cellText: string = params.value ?? "";

    if (csvView) {
      const sourceColumn = segField.replace(/_cod-seg$/, "");
      csvView.openSegmentEditor(file, row, sourceColumn, cellText);
    }
  });

  wrapper.appendChild(text);
  wrapper.appendChild(btn);
  return wrapper;
}

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
