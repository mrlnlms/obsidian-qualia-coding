import { TextComponent, ToggleComponent, setIcon } from "obsidian";
import type { CodingModel } from "./codingModel";
import type { GridApi } from "ag-grid-community";

/**
 * Opens a coding popover menu anchored below `anchorEl`.
 * Shows input for new code, toggles for existing codes, and action buttons.
 * Closes on click-outside or Escape.
 */
export function openCodingPopover(
  anchorEl: HTMLElement,
  model: CodingModel,
  file: string,
  row: number,
  column: string,
  gridApi: GridApi,
  anchorRect?: DOMRect
): void {
  // Remove any existing popover
  document.querySelector(".codemarker-popover")?.remove();

  const container = document.createElement("div");
  container.className = "menu codemarker-popover";
  applyThemeColors(container);

  // Prevent clicks inside from bubbling
  container.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  const close = () => {
    container.remove();
    document.removeEventListener("mousedown", outsideHandler);
    document.removeEventListener("keydown", escHandler);
  };

  const refreshGrid = () => {
    gridApi.refreshCells({ force: true });
  };

  // Capture position once — survives grid refresh destroying the anchor element
  const savedRect = anchorRect ?? anchorEl.getBoundingClientRect();

  const rebuild = () => {
    close();
    openCodingPopover(anchorEl, model, file, row, column, gridApi, savedRect);
  };

  // ── TextComponent input ──
  const inputWrapper = document.createElement("div");
  inputWrapper.className = "menu-item menu-item-textfield";

  const textComponent = new TextComponent(inputWrapper);
  textComponent.setPlaceholder("New code name...");
  applyInputTheme(textComponent.inputEl);

  inputWrapper.addEventListener("click", (evt: MouseEvent) => {
    evt.stopPropagation();
    textComponent.inputEl.focus();
  });

  textComponent.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
    if (evt.key === "Enter") {
      evt.stopPropagation();
      evt.preventDefault();
      const name = textComponent.inputEl.value.trim();
      if (name) {
        const marker = model.findOrCreateRowMarker(file, row, column);
        model.addCodeToMarker(marker.id, name);
        refreshGrid();
        rebuild();
      }
    } else if (evt.key === "Escape") {
      close();
    }
  });

  container.appendChild(inputWrapper);

  // ── Toggle list for existing codes ──
  const allCodes = model.getAllCodes();
  const marker = model.getRowMarkersForCell(file, row, column)[0];
  const activeCodes = marker ? marker.codes : [];

  if (allCodes.length > 0) {
    container.appendChild(createSeparator());
  }

  for (const codeDef of allCodes) {
    const isActive = activeCodes.includes(codeDef.name);

    const itemEl = document.createElement("div");
    itemEl.className = "menu-item menu-item-toggle";

    // Color swatch
    const swatch = document.createElement("span");
    swatch.className = "codemarker-popover-swatch";
    swatch.style.backgroundColor = codeDef.color;
    itemEl.appendChild(swatch);

    const toggle = new ToggleComponent(itemEl);
    toggle.setValue(isActive);
    toggle.toggleEl.addEventListener("click", (evt) => {
      evt.stopPropagation();
    });
    toggle.onChange((value) => {
      const m = model.findOrCreateRowMarker(file, row, column);
      if (value) {
        model.addCodeToMarker(m.id, codeDef.name);
      } else {
        model.removeCodeFromMarker(m.id, codeDef.name, true);
      }
      refreshGrid();
    });

    const titleEl = document.createElement("span");
    titleEl.className = "menu-item-title";
    titleEl.textContent = codeDef.name;
    itemEl.appendChild(titleEl);

    itemEl.addEventListener("click", (evt: MouseEvent) => {
      evt.stopPropagation();
      const currentValue = toggle.getValue();
      toggle.setValue(!currentValue);
    });

    container.appendChild(itemEl);
  }

  // ── Action buttons ──
  container.appendChild(createSeparator());

  container.appendChild(
    createActionItem("Add New Code", "plus-circle", () => {
      const name = textComponent.inputEl.value.trim();
      if (name) {
        const m = model.findOrCreateRowMarker(file, row, column);
        model.addCodeToMarker(m.id, name);
        refreshGrid();
        rebuild();
      } else {
        textComponent.inputEl.focus();
      }
    })
  );

  container.appendChild(
    createActionItem("Remove All Codes", "trash", () => {
      const markers = model.getRowMarkersForCell(file, row, column);
      for (const m of markers) {
        for (const code of [...m.codes]) {
          model.removeCodeFromMarker(m.id, code);
        }
      }
      refreshGrid();
      rebuild();
    })
  );

  // ── Position and show ──
  document.body.appendChild(container);

  container.style.top = `${savedRect.bottom + 4}px`;
  container.style.left = `${savedRect.left}px`;

  // Clamp to viewport
  requestAnimationFrame(() => {
    const cr = container.getBoundingClientRect();
    if (cr.right > window.innerWidth) {
      container.style.left = `${window.innerWidth - cr.width - 8}px`;
    }
    if (cr.bottom > window.innerHeight) {
      container.style.top = `${savedRect.top - cr.height - 4}px`;
    }
  });

  // Auto-focus input
  setTimeout(() => textComponent.inputEl.focus(), 50);

  // ── Close handlers ──
  const outsideHandler = (e: MouseEvent) => {
    if (!container.contains(e.target as Node)) {
      close();
    }
  };

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
    }
  };

  // Delay registering outside click to avoid immediate close
  setTimeout(() => {
    document.addEventListener("mousedown", outsideHandler);
    document.addEventListener("keydown", escHandler);
  }, 10);
}

/**
 * Opens a batch coding popover for a cod-frow header button.
 * Applies/removes codes to ALL visible (filtered) rows at once.
 */
export function openBatchCodingPopover(
  anchorEl: HTMLElement,
  model: CodingModel,
  file: string,
  column: string,
  gridApi: GridApi,
  anchorRect?: DOMRect
): void {
  // Remove any existing popover
  document.querySelector(".codemarker-popover")?.remove();

  const container = document.createElement("div");
  container.className = "menu codemarker-popover";
  applyThemeColors(container);

  container.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  const close = () => {
    container.remove();
    document.removeEventListener("mousedown", outsideHandler);
    document.removeEventListener("keydown", escHandler);
  };

  const refreshGrid = () => {
    gridApi.refreshCells({ force: true });
  };

  const savedRect = anchorRect ?? anchorEl.getBoundingClientRect();

  const rebuild = () => {
    close();
    openBatchCodingPopover(anchorEl, model, file, column, gridApi, savedRect);
  };

  // Collect visible (filtered) row indices
  const filteredRows: number[] = [];
  gridApi.forEachNodeAfterFilterAndSort(node => {
    if (node.rowIndex != null) filteredRows.push(node.rowIndex);
  });

  // ── Info text ──
  const infoEl = document.createElement("div");
  infoEl.className = "menu-item";
  infoEl.style.fontSize = "11px";
  infoEl.style.color = "var(--text-muted)";
  infoEl.style.pointerEvents = "none";
  infoEl.textContent = `Apply to ${filteredRows.length} visible row${filteredRows.length !== 1 ? "s" : ""}`;
  container.appendChild(infoEl);

  // ── TextComponent input ──
  const inputWrapper = document.createElement("div");
  inputWrapper.className = "menu-item menu-item-textfield";

  const textComponent = new TextComponent(inputWrapper);
  textComponent.setPlaceholder("New code name...");
  applyInputTheme(textComponent.inputEl);

  inputWrapper.addEventListener("click", (evt: MouseEvent) => {
    evt.stopPropagation();
    textComponent.inputEl.focus();
  });

  textComponent.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
    if (evt.key === "Enter") {
      evt.stopPropagation();
      evt.preventDefault();
      const name = textComponent.inputEl.value.trim();
      if (name) {
        for (const row of filteredRows) {
          const marker = model.findOrCreateRowMarker(file, row, column);
          model.addCodeToMarker(marker.id, name);
        }
        refreshGrid();
        rebuild();
      }
    } else if (evt.key === "Escape") {
      close();
    }
  });

  container.appendChild(inputWrapper);

  // ── Toggle list for existing codes ──
  const allCodes = model.getAllCodes();

  if (allCodes.length > 0) {
    container.appendChild(createSeparator());
  }

  for (const codeDef of allCodes) {
    // Calculate cross-row toggle state
    let count = 0;
    for (const row of filteredRows) {
      if (model.getRowMarkersForCell(file, row, column).some(m => m.codes.includes(codeDef.name))) {
        count++;
      }
    }
    const isAllOn = count === filteredRows.length;
    const isPartial = count > 0 && !isAllOn;

    const itemEl = document.createElement("div");
    itemEl.className = "menu-item menu-item-toggle";

    const swatch = document.createElement("span");
    swatch.className = "codemarker-popover-swatch";
    swatch.style.backgroundColor = codeDef.color;
    itemEl.appendChild(swatch);

    const toggle = new ToggleComponent(itemEl);
    toggle.setValue(isAllOn);
    toggle.toggleEl.addEventListener("click", (evt) => {
      evt.stopPropagation();
    });
    toggle.onChange((value) => {
      for (const row of filteredRows) {
        const m = model.findOrCreateRowMarker(file, row, column);
        if (value) {
          model.addCodeToMarker(m.id, codeDef.name);
        } else {
          model.removeCodeFromMarker(m.id, codeDef.name, true);
        }
      }
      refreshGrid();
    });

    const titleEl = document.createElement("span");
    titleEl.className = "menu-item-title";
    titleEl.textContent = codeDef.name + (isPartial ? " (partial)" : "");
    itemEl.appendChild(titleEl);

    itemEl.addEventListener("click", (evt: MouseEvent) => {
      evt.stopPropagation();
      const currentValue = toggle.getValue();
      toggle.setValue(!currentValue);
    });

    container.appendChild(itemEl);
  }

  // ── Action buttons ──
  container.appendChild(createSeparator());

  container.appendChild(
    createActionItem("Add New Code", "plus-circle", () => {
      const name = textComponent.inputEl.value.trim();
      if (name) {
        for (const row of filteredRows) {
          const m = model.findOrCreateRowMarker(file, row, column);
          model.addCodeToMarker(m.id, name);
        }
        refreshGrid();
        rebuild();
      } else {
        textComponent.inputEl.focus();
      }
    })
  );

  container.appendChild(
    createActionItem("Remove All Codes", "trash", () => {
      for (const row of filteredRows) {
        const markers = model.getRowMarkersForCell(file, row, column);
        for (const m of markers) {
          for (const code of [...m.codes]) {
            model.removeCodeFromMarker(m.id, code);
          }
        }
      }
      refreshGrid();
      rebuild();
    })
  );

  // ── Position and show ──
  document.body.appendChild(container);

  container.style.top = `${savedRect.bottom + 4}px`;
  container.style.left = `${savedRect.left}px`;

  requestAnimationFrame(() => {
    const cr = container.getBoundingClientRect();
    if (cr.right > window.innerWidth) {
      container.style.left = `${window.innerWidth - cr.width - 8}px`;
    }
    if (cr.bottom > window.innerHeight) {
      container.style.top = `${savedRect.top - cr.height - 4}px`;
    }
  });

  setTimeout(() => textComponent.inputEl.focus(), 50);

  // ── Close handlers ──
  const outsideHandler = (e: MouseEvent) => {
    if (!container.contains(e.target as Node)) {
      close();
    }
  };

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
    }
  };

  setTimeout(() => {
    document.addEventListener("mousedown", outsideHandler);
    document.addEventListener("keydown", escHandler);
  }, 10);
}

// ── Helpers ──

function createActionItem(title: string, iconName: string, onClick: () => void): HTMLElement {
  const item = document.createElement("div");
  item.className = "menu-item";

  const iconEl = document.createElement("div");
  iconEl.className = "menu-item-icon";
  setIcon(iconEl, iconName);

  const titleEl = document.createElement("div");
  titleEl.className = "menu-item-title";
  titleEl.textContent = title;

  item.appendChild(iconEl);
  item.appendChild(titleEl);

  item.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });

  return item;
}

function createSeparator(): HTMLElement {
  const sep = document.createElement("div");
  sep.className = "menu-separator";
  return sep;
}

function applyThemeColors(container: HTMLElement) {
  const s = getComputedStyle(document.body);
  const get = (v: string) => s.getPropertyValue(v).trim();

  container.style.backgroundColor = get("--background-secondary");
  container.style.borderColor = get("--background-modifier-border");
  container.style.color = get("--text-normal");

  const vars = [
    "--background-primary", "--background-secondary",
    "--background-modifier-border", "--background-modifier-hover",
    "--text-normal", "--text-muted",
    "--interactive-accent",
    "--font-ui-small",
    "--size-2-1", "--size-4-1", "--size-4-2",
    "--radius-s", "--radius-m",
    "--shadow-s",
    "--toggle-border-width", "--toggle-width", "--toggle-radius",
    "--toggle-thumb-color-off", "--toggle-thumb-color-on",
    "--toggle-background-off", "--toggle-background-on",
  ];
  for (const v of vars) {
    const val = get(v);
    if (val) container.style.setProperty(v, val);
  }
}

function applyInputTheme(input: HTMLInputElement) {
  const s = getComputedStyle(document.body);
  input.style.backgroundColor = s.getPropertyValue("--background-primary").trim();
  input.style.color = s.getPropertyValue("--text-normal").trim();
  input.style.borderColor = s.getPropertyValue("--background-modifier-border").trim();
}

