import {
  openFile, waitForElement, assertDomState, checkComponent,
} from "obsidian-plugin-e2e";

describe("column toggle modal (CSV)", () => {
  before(async () => {
    await openFile("Sample Data.csv");
    await waitForElement(".ag-root", 15000);
  });

  it("opens column toggle modal via gear icon", async () => {
    // Find and click the gear icon in the CSV info bar
    await browser.execute(() => {
      // The gear icon is a span with setIcon('settings') inside the info bar
      const icons = document.querySelectorAll(".workspace-leaf.mod-active .view-content span");
      for (const icon of icons) {
        const svg = icon.querySelector("svg.svg-icon");
        if (svg && icon.style.cursor === "pointer") {
          // Click the last cursor:pointer span (gear icon is after the row count)
          (icon as HTMLElement).click();
        }
      }
    });
    await browser.pause(1000);

    // Modal should be open
    const modal = await browser.$(".modal-container");
    expect(await modal.isExisting()).toBe(true);
  });

  it("modal has settings items for columns", async () => {
    const settings = await browser.$$(".modal-container .setting-item");
    expect(settings.length).toBeGreaterThanOrEqual(1);
  });

  it("visual baseline — column toggle modal", async () => {
    const modal = await browser.$(".modal-container");
    if (await modal.isExisting()) {
      const mismatch = await checkComponent(".modal-container", "column-toggle-modal");
      expect(mismatch).toBeLessThan(3);
    }
  });

  after(async () => {
    // Close modal
    await browser.execute(() => {
      const closeBtn = document.querySelector(".modal-close-button");
      if (closeBtn) (closeBtn as HTMLElement).click();
    });
    await browser.pause(500);
  });
});
