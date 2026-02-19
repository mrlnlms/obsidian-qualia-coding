/**
 * CodingMenu — floating popover for assigning/removing codes to a region.
 *
 * Shows:
 * - Toggle for each existing code (on/off per marker)
 * - "Add New Code" input
 * - "Remove Region" button
 */

import { setIcon } from "obsidian";
import type { ImageCodingModel } from "../coding/imageCodingModel";
import type { CodeDefinition } from "../coding/codeDefinitionRegistry";

export interface CodingMenuCallbacks {
  onCodesChanged: (markerId: string) => void;
  onRegionDeleted: (markerId: string) => void;
}

export class CodingMenu {
  private container: HTMLElement;
  private model: ImageCodingModel;
  private callbacks: CodingMenuCallbacks;
  private el: HTMLElement | null = null;
  private currentMarkerId: string | null = null;
  private onClickOutside: ((e: MouseEvent) => void) | null = null;

  constructor(
    container: HTMLElement,
    model: ImageCodingModel,
    callbacks: CodingMenuCallbacks
  ) {
    this.container = container;
    this.model = model;
    this.callbacks = callbacks;
  }

  isOpen(): boolean {
    return this.el !== null;
  }

  /** Show menu near a screen position (relative to container) */
  open(markerId: string, x: number, y: number): void {
    this.close();
    this.currentMarkerId = markerId;

    const marker = this.model.findMarkerById(markerId);
    if (!marker) return;

    this.el = document.createElement("div");
    this.el.className = "codemarker-coding-menu";
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;

    this.renderContent();

    this.container.appendChild(this.el);

    // Clamp to container bounds
    requestAnimationFrame(() => {
      if (!this.el) return;
      const menuRect = this.el.getBoundingClientRect();
      const contRect = this.container.getBoundingClientRect();

      if (menuRect.right > contRect.right - 8) {
        this.el.style.left = `${x - menuRect.width}px`;
      }
      if (menuRect.bottom > contRect.bottom - 8) {
        this.el.style.top = `${y - menuRect.height}px`;
      }
    });

    // Close on outside click (delayed to avoid immediate close)
    setTimeout(() => {
      this.onClickOutside = (e: MouseEvent) => {
        if (this.el && !this.el.contains(e.target as Node)) {
          this.close();
        }
      };
      document.addEventListener("mousedown", this.onClickOutside, true);
    }, 50);
  }

  close(): void {
    if (this.onClickOutside) {
      document.removeEventListener("mousedown", this.onClickOutside, true);
      this.onClickOutside = null;
    }
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
    this.currentMarkerId = null;
  }

  private renderContent(): void {
    if (!this.el || !this.currentMarkerId) return;
    this.el.empty();

    const marker = this.model.findMarkerById(this.currentMarkerId);
    if (!marker) { this.close(); return; }

    const allCodes = this.model.registry.getAll();
    const markerCodes = new Set(marker.codes);

    // ─── Header ───
    const header = this.el.createDiv({ cls: "codemarker-menu-header" });
    header.createSpan({ text: "Codes", cls: "codemarker-menu-title" });

    const closeBtn = header.createDiv({ cls: "codemarker-menu-close" });
    setIcon(closeBtn, "x");
    closeBtn.addEventListener("click", () => this.close());

    // ─── Code toggles ───
    if (allCodes.length > 0) {
      const toggleList = this.el.createDiv({ cls: "codemarker-menu-toggles" });
      for (const def of allCodes) {
        this.renderToggle(toggleList, def, markerCodes.has(def.name));
      }
    }

    // ─── Add new code ───
    const addRow = this.el.createDiv({ cls: "codemarker-menu-add-row" });
    const input = addRow.createEl("input", {
      type: "text",
      placeholder: "New code name...",
      cls: "codemarker-menu-input",
    });
    const addBtn = addRow.createDiv({ cls: "codemarker-menu-add-btn" });
    setIcon(addBtn, "plus");

    const addCode = () => {
      const name = input.value.trim();
      if (!name) return;
      this.model.addCodeToMarker(this.currentMarkerId!, name);
      this.callbacks.onCodesChanged(this.currentMarkerId!);
      this.renderContent(); // re-render with new toggle
    };

    addBtn.addEventListener("click", addCode);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addCode();
      e.stopPropagation(); // prevent toolbar shortcuts
    });

    // ─── Remove region ───
    const removeBtn = this.el.createDiv({ cls: "codemarker-menu-remove" });
    setIcon(removeBtn, "trash-2");
    removeBtn.createSpan({ text: "Remove Region" });
    removeBtn.addEventListener("click", () => {
      const id = this.currentMarkerId!;
      this.close();
      this.callbacks.onRegionDeleted(id);
    });
  }

  private renderToggle(parent: HTMLElement, def: CodeDefinition, isActive: boolean): void {
    const row = parent.createDiv({ cls: "codemarker-menu-toggle" });

    const swatch = row.createDiv({ cls: "codemarker-menu-swatch" });
    swatch.style.backgroundColor = def.color;

    row.createSpan({ text: def.name, cls: "codemarker-menu-code-name" });

    const toggle = row.createDiv({
      cls: `codemarker-menu-checkbox ${isActive ? "is-checked" : ""}`,
    });

    row.addEventListener("click", () => {
      if (!this.currentMarkerId) return;
      if (isActive) {
        this.model.removeCodeFromMarker(this.currentMarkerId, def.name, true);
      } else {
        this.model.addCodeToMarker(this.currentMarkerId, def.name);
      }
      this.callbacks.onCodesChanged(this.currentMarkerId!);
      this.renderContent();
    });
  }

  destroy(): void {
    this.close();
  }
}
