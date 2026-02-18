import { FileView, TFile, WorkspaceLeaf } from "obsidian";
import { AllCommunityModule, ModuleRegistry, createGrid, GridApi, themeQuartz } from "ag-grid-community";
import * as Papa from "papaparse";

ModuleRegistry.registerModules([AllCommunityModule]);

export const CSV_VIEW_TYPE = "csv-viewer";

export class CsvView extends FileView {
  private gridApi: GridApi | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return CSV_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.name ?? "CSV Viewer";
  }

  getIcon(): string {
    return "table";
  }

  canAcceptExtension(extension: string): boolean {
    return extension === "csv";
  }

  async onLoadFile(file: TFile): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    const raw = await this.app.vault.read(file);
    const parsed = Papa.parse<Record<string, string>>(raw, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      const err = contentEl.createEl("p");
      err.textContent = `Error parsing CSV: ${parsed.errors[0].message}`;
      return;
    }

    const headers = parsed.meta.fields;
    if (!headers || headers.length === 0) {
      const err = contentEl.createEl("p");
      err.textContent = "No columns found in CSV file.";
      return;
    }

    // Info bar
    const info = contentEl.createEl("p");
    info.textContent = `${parsed.data.length.toLocaleString()} rows × ${headers.length} columns`;
    info.style.margin = "8px 12px";
    info.style.fontSize = "12px";
    info.style.color = "var(--text-muted)";

    // Grid div — simple inline height
    const wrapper = contentEl.createEl("div");
    wrapper.style.height = "calc(100% - 40px)";
    wrapper.style.width = "100%";

    // Pass CSS var() references so AG Grid inherits Obsidian theme reactively
    const theme = themeQuartz.withParams({
      backgroundColor: "var(--background-primary)",
      foregroundColor: "var(--text-normal)",
      headerBackgroundColor: "var(--background-secondary)",
      headerTextColor: "var(--text-normal)",
      borderColor: "var(--background-modifier-border)",
      rowHoverColor: "var(--background-modifier-hover)",
      selectedRowBackgroundColor: "var(--background-modifier-hover)",
      accentColor: "var(--interactive-accent)",
      oddRowBackgroundColor: "var(--background-primary)",
      fontFamily: "var(--font-text)",
      fontSize: 14,
    });

    this.gridApi = createGrid(wrapper, {
      theme,
      columnDefs: headers.map((h: string) => ({ field: h, headerName: h })),
      defaultColDef: { sortable: true, filter: true, resizable: true },
      rowData: parsed.data,
      enableCellTextSelection: true,
      domLayout: "normal",
    });
  }

  async onUnloadFile(): Promise<void> {
    if (this.gridApi) {
      this.gridApi.destroy();
      this.gridApi = null;
    }
    this.contentEl.empty();
  }
}
