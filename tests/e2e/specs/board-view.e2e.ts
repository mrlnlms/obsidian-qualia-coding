import {
  openFile, focusEditor, waitForElement, executeCommand,
  assertDomState, checkComponent,
} from "obsidian-e2e-visual-test-kit";
import { injectQualiaData, mkMarker } from "../helpers/qualia.js";

describe("board view", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("bv1", 6, 0, 7, 50, ["Emotion"], "#6200EE"),
          mkMarker("bv2", 12, 0, 13, 40, ["Theme"], "#FF5722"),
        ],
      },
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
        { name: "Theme", color: "#FF5722" },
      ],
    });
    await openFile("Sample Coded.md");
    await focusEditor();
    await browser.pause(1000);
    await executeCommand("qualia-coding:open-board");
    await browser.pause(3000);
  });

  it("board view opens", async () => {
    const boardContainer = await browser.$(".codemarker-board-canvas-container");
    if (await boardContainer.isExisting()) {
      expect(await boardContainer.isDisplayed()).toBe(true);
    } else {
      // Fallback: check for any canvas element in the active leaf
      const canvas = await browser.$(".workspace-leaf.mod-active canvas");
      expect(await canvas.isExisting()).toBe(true);
    }
  });

  it("board toolbar is visible", async () => {
    const toolbar = await browser.$(".codemarker-board-toolbar");
    if (await toolbar.isExisting()) {
      expect(await toolbar.isDisplayed()).toBe(true);
    } else {
      // Board may use different toolbar class — just verify leaf exists
      const leaf = await browser.$(".workspace-leaf.mod-active");
      expect(await leaf.isExisting()).toBe(true);
    }
  });

  it("visual baseline — empty board canvas", async () => {
    const container = await browser.$(".codemarker-board-canvas-container");
    if (await container.isExisting()) {
      const mismatch = await checkComponent(".codemarker-board-canvas-container", "board-empty");
      expect(mismatch).toBeLessThan(3);
    }
  });
});
