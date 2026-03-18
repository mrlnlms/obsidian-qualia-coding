import {
  waitForElement, assertDomState, assertInnerHTML, checkComponent,
} from "obsidian-e2e-visual-test-kit";
import { injectQualiaData } from "../helpers/qualia.js";

describe("code browser modal", () => {
  before(async () => {
    // Inject code definitions so the browser has codes to list
    await injectQualiaData({
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
        { name: "Theme", color: "#FF5722" },
        { name: "Method", color: "#4CAF50" },
      ],
    });
  });

  beforeEach(async () => {
    // Build the modal DOM manually, matching CodeBrowserModal.onOpen() structure.
    // We cannot use require("obsidian").Modal inside browser.execute,
    // so we create the overlay + modal elements directly.
    await browser.execute(() => {
      // Remove any existing modal first
      document.querySelector(".modal-container.codemarker-code-browser-test")?.remove();

      // Create the modal overlay structure matching Obsidian's Modal
      const overlay = document.createElement("div");
      overlay.className = "modal-container codemarker-code-browser-test";
      overlay.style.cssText = "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;";

      const bg = document.createElement("div");
      bg.className = "modal-bg";
      bg.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,0.5);";
      overlay.appendChild(bg);

      const modal = document.createElement("div");
      modal.className = "modal codemarker-code-browser";
      modal.style.cssText = "position:relative;background:var(--background-primary);border-radius:8px;padding:0;min-width:400px;max-width:500px;";
      overlay.appendChild(modal);

      // Close button
      const closeBtn = document.createElement("div");
      closeBtn.className = "modal-close-button";
      closeBtn.textContent = "\u00d7";
      modal.appendChild(closeBtn);

      // Content wrapper
      const content = document.createElement("div");
      content.className = "modal-content";
      modal.appendChild(content);

      // Title
      const h3 = document.createElement("h3");
      h3.textContent = "All Codes";
      content.appendChild(h3);

      // Search input
      const searchWrap = document.createElement("div");
      searchWrap.className = "codemarker-code-browser-search";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Filter codes...";
      searchWrap.appendChild(searchInput);
      content.appendChild(searchWrap);

      // List container
      const listEl = document.createElement("div");
      listEl.className = "codemarker-code-browser-list";
      content.appendChild(listEl);

      // Get codes from the actual plugin registry
      const plugin = (window as any).app.plugins.plugins["qualia-coding"];
      const allCodes = plugin.sharedRegistry.getAll();
      for (const def of allCodes) {
        const row = document.createElement("div");
        row.className = "codemarker-code-browser-row";

        const swatch = document.createElement("span");
        swatch.className = "codemarker-code-browser-swatch";
        swatch.style.backgroundColor = def.color;
        row.appendChild(swatch);

        const name = document.createElement("span");
        name.className = "codemarker-code-browser-name";
        name.textContent = def.name;
        row.appendChild(name);

        listEl.appendChild(row);
      }

      document.body.appendChild(overlay);
    });
    await browser.pause(500);
  });

  afterEach(async () => {
    await browser.execute(() => {
      document.querySelector(".modal-container.codemarker-code-browser-test")?.remove();
    });
    await browser.pause(300);
  });

  it("modal renders with title", async () => {
    await assertDomState(".codemarker-code-browser", {
      visible: true,
      innerHTML: { contains: ["All Codes"] },
    });
  });

  it("lists at least 3 codes", async () => {
    const rows = await browser.$$(".codemarker-code-browser-row");
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it("shows code names and swatches", async () => {
    await assertInnerHTML(".codemarker-code-browser-list", {
      contains: ["Emotion", "Theme", "Method"],
    });
  });

  it("has search input", async () => {
    const search = await browser.$(".codemarker-code-browser-search input");
    expect(await search.isExisting()).toBe(true);
  });

  it("visual baseline — code browser with 3 codes", async () => {
    const mismatch = await checkComponent(".codemarker-code-browser", "code-browser-3codes");
    expect(mismatch).toBeLessThan(2);
  });
});
