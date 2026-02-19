/**
 * ImageCodeDetailView — 3 modes: list, code-focused, region-focused.
 * Follows the same pattern as CsvCodeDetailView.
 */

import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type { ImageCodingModel } from "../coding/imageCodingModel";
import type { ImageMarker } from "../coding/imageCodingTypes";

export const IMAGE_CODE_DETAIL_VIEW_TYPE = "codemarker-image-detail";

export class ImageCodeDetailView extends ItemView {
  private model: ImageCodingModel;
  private markerId: string | null = null;
  private codeName: string | null = null;
  private changeListener: () => void;

  constructor(leaf: WorkspaceLeaf, model: ImageCodingModel) {
    super(leaf);
    this.model = model;
    this.changeListener = () => this.refreshCurrentMode();
  }

  getViewType(): string {
    return IMAGE_CODE_DETAIL_VIEW_TYPE;
  }

  getDisplayText(): string {
    if (this.codeName) return this.codeName;
    return "Image Code Detail";
  }

  getIcon(): string {
    return "tag";
  }

  async onOpen(): Promise<void> {
    this.model.onChange(this.changeListener);
    this.showList();
  }

  async onClose(): Promise<void> {
    this.model.offChange(this.changeListener);
    this.contentEl.empty();
  }

  // ─── Mode switching ───

  showList(): void {
    this.markerId = null;
    this.codeName = null;
    (this.leaf as any).updateHeader?.();
    this.renderList();
  }

  showCodeDetail(codeName: string): void {
    this.codeName = codeName;
    this.markerId = null;
    (this.leaf as any).updateHeader?.();
    this.renderCodeDetail();
  }

  setContext(markerId: string, codeName: string): void {
    this.markerId = markerId;
    this.codeName = codeName;
    (this.leaf as any).updateHeader?.();
    this.renderMarkerDetail();
  }

  private refreshCurrentMode(): void {
    if (this.markerId && this.codeName) {
      this.renderMarkerDetail();
    } else if (this.codeName) {
      this.renderCodeDetail();
    } else {
      this.renderList();
    }
  }

  // ─── Mode 1: List ───

  private renderList(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("codemarker-detail-view");

    const header = contentEl.createDiv({ cls: "codemarker-detail-header" });
    header.createEl("h4", { text: "All Codes" });

    const allCodes = this.model.registry.getAll();
    const counts = this.countRegionsPerCode();

    if (allCodes.length === 0) {
      contentEl.createDiv({ cls: "codemarker-detail-empty", text: "No codes yet." });
      return;
    }

    const list = contentEl.createDiv({ cls: "codemarker-detail-list" });

    for (const def of allCodes) {
      const row = list.createDiv({ cls: "codemarker-detail-row" });

      const swatch = row.createDiv({ cls: "codemarker-detail-swatch" });
      swatch.style.backgroundColor = def.color;

      const info = row.createDiv({ cls: "codemarker-detail-info" });
      info.createDiv({ cls: "codemarker-detail-name", text: def.name });
      if (def.description) {
        info.createDiv({ cls: "codemarker-detail-desc", text: def.description });
      }

      const count = counts.get(def.name) ?? 0;
      row.createDiv({ cls: "codemarker-detail-count", text: `${count}` });

      row.addEventListener("click", () => this.showCodeDetail(def.name));
    }
  }

  // ─── Mode 2: Code-focused ───

  private renderCodeDetail(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("codemarker-detail-view");

    if (!this.codeName) return;

    const def = this.model.registry.getByName(this.codeName);

    // Back button
    this.renderBackButton(contentEl);

    // Header
    const header = contentEl.createDiv({ cls: "codemarker-detail-header" });
    if (def) {
      const swatch = header.createDiv({ cls: "codemarker-detail-swatch-lg" });
      swatch.style.backgroundColor = def.color;
    }
    header.createEl("h4", { text: this.codeName });
    if (def?.description) {
      header.createDiv({ cls: "codemarker-detail-desc", text: def.description });
    }

    // All markers with this code
    const markers = this.model.getAllMarkers().filter(
      (m) => m.codes.includes(this.codeName!)
    );

    if (markers.length === 0) {
      contentEl.createDiv({ cls: "codemarker-detail-empty", text: "No regions yet." });
      return;
    }

    // Group by file
    const byFile = new Map<string, ImageMarker[]>();
    for (const m of markers) {
      let arr = byFile.get(m.file);
      if (!arr) { arr = []; byFile.set(m.file, arr); }
      arr.push(m);
    }

    const list = contentEl.createDiv({ cls: "codemarker-detail-list" });

    for (const [file, fileMarkers] of byFile) {
      const fileName = file.split("/").pop() ?? file;
      list.createDiv({ cls: "codemarker-detail-file-label", text: fileName });

      for (const marker of fileMarkers) {
        const row = list.createDiv({ cls: "codemarker-detail-row codemarker-detail-marker-row" });
        const shapeLabel = marker.shape.charAt(0).toUpperCase() + marker.shape.slice(1);
        row.createSpan({ text: shapeLabel, cls: "codemarker-detail-shape" });
        row.createSpan({
          text: marker.codes.join(", "),
          cls: "codemarker-detail-codes-preview",
        });

        row.addEventListener("click", () => {
          this.setContext(marker.id, this.codeName!);
          this.navigateToRegion(marker);
        });
      }
    }
  }

  // ─── Mode 3: Marker-focused ───

  private renderMarkerDetail(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("codemarker-detail-view");

    if (!this.markerId || !this.codeName) return;

    const marker = this.model.findMarkerById(this.markerId);
    const def = this.model.registry.getByName(this.codeName);

    this.renderBackButton(contentEl);

    if (!marker) {
      contentEl.createDiv({ cls: "codemarker-detail-empty", text: "Region not found." });
      return;
    }

    // Header
    const header = contentEl.createDiv({ cls: "codemarker-detail-header" });
    if (def) {
      const swatch = header.createDiv({ cls: "codemarker-detail-swatch-lg" });
      swatch.style.backgroundColor = def.color;
    }
    header.createEl("h4", { text: this.codeName });

    // Region info
    const info = contentEl.createDiv({ cls: "codemarker-detail-section" });
    info.createEl("h5", { text: "Region" });
    const shapeLabel = marker.shape.charAt(0).toUpperCase() + marker.shape.slice(1);
    info.createDiv({ text: `Shape: ${shapeLabel}` });
    info.createDiv({ text: `File: ${marker.file.split("/").pop()}` });

    // Other codes on this marker
    if (marker.codes.length > 1) {
      const codesSection = contentEl.createDiv({ cls: "codemarker-detail-section" });
      codesSection.createEl("h5", { text: "Other Codes" });
      const chips = codesSection.createDiv({ cls: "codemarker-detail-chips" });

      for (const code of marker.codes) {
        if (code === this.codeName) continue;
        const codeDef = this.model.registry.getByName(code);
        const chip = chips.createDiv({ cls: "codemarker-detail-chip" });
        const chipSwatch = chip.createDiv({ cls: "codemarker-detail-chip-swatch" });
        chipSwatch.style.backgroundColor = codeDef?.color ?? "#6200EE";
        chip.createSpan({ text: code });

        chip.addEventListener("click", () => {
          this.setContext(this.markerId!, code);
        });
      }
    }

    // Other markers with same code
    const otherMarkers = this.model.getAllMarkers().filter(
      (m) => m.id !== this.markerId && m.codes.includes(this.codeName!)
    );

    if (otherMarkers.length > 0) {
      const othersSection = contentEl.createDiv({ cls: "codemarker-detail-section" });
      othersSection.createEl("h5", { text: "Other Regions" });
      const list = othersSection.createDiv({ cls: "codemarker-detail-list" });

      for (const other of otherMarkers) {
        const row = list.createDiv({ cls: "codemarker-detail-row codemarker-detail-marker-row" });
        const shape = other.shape.charAt(0).toUpperCase() + other.shape.slice(1);
        row.createSpan({ text: shape, cls: "codemarker-detail-shape" });
        row.createSpan({ text: other.file.split("/").pop() ?? "", cls: "codemarker-detail-file-ref" });

        row.addEventListener("click", () => {
          this.setContext(other.id, this.codeName!);
          this.navigateToRegion(other);
        });
      }
    }

    // Navigate button
    const navBtn = contentEl.createDiv({ cls: "codemarker-detail-nav-btn" });
    setIcon(navBtn, "locate");
    navBtn.createSpan({ text: "Show on canvas" });
    navBtn.addEventListener("click", () => this.navigateToRegion(marker));
  }

  // ─── Helpers ───

  private renderBackButton(container: HTMLElement): void {
    const btn = container.createDiv({ cls: "codemarker-detail-back" });
    setIcon(btn, "arrow-left");
    btn.createSpan({ text: "All Codes" });
    btn.addEventListener("click", () => this.showList());
  }

  private navigateToRegion(marker: ImageMarker): void {
    this.app.workspace.trigger("codemarker-image:navigate", {
      file: marker.file,
      markerId: marker.id,
    });
  }

  private countRegionsPerCode(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const marker of this.model.getAllMarkers()) {
      for (const code of marker.codes) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
    return counts;
  }
}
