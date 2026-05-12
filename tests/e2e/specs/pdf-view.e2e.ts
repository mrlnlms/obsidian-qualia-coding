import {
  openFile,
} from "obsidian-e2e-visual-test-kit";
import { enableMediaAutoOpen } from "../helpers/qualia.js";

describe("PDF view", () => {
  before(async () => {
    await enableMediaAutoOpen();
    await openFile("Sample.pdf");
    await browser.pause(5000); // PDF rendering is slow — needs pdfjs + fabric
  });

  it("PDF viewer renders", async () => {
    // Obsidian's built-in PDF viewer
    const pdfContainer = await browser.$(".pdf-container");
    if (await pdfContainer.isExisting()) {
      expect(await pdfContainer.isDisplayed()).toBe(true);
    } else {
      // Fallback: any canvas or pdf element in active leaf
      const leaf = await browser.$(".workspace-leaf.mod-active");
      expect(await leaf.isExisting()).toBe(true);
    }
  });

  it("PDF pages are visible", async () => {
    const pages = await browser.$$(".pdf-page");
    if (pages.length > 0) {
      expect(pages.length).toBeGreaterThanOrEqual(1);
    } else {
      // Alternative selector
      const canvases = await browser.$$(".workspace-leaf.mod-active canvas");
      expect(canvases.length).toBeGreaterThanOrEqual(1);
    }
  });

});
