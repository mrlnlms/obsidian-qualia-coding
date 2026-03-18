import {
  openFile, focusEditor, waitForElement, executeCommand,
  assertDomState, checkComponent,
} from "obsidian-e2e-visual-test-kit";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("analytics — frequency mode", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("af1", 4, 0, 5, 50, ["Emotion"], "#6200EE"),
          mkMarker("af2", 6, 0, 7, 30, ["Emotion"], "#6200EE"),
          mkMarker("af3", 8, 0, 9, 40, ["Theme"], "#FF5722"),
          mkMarker("af4", 10, 0, 11, 20, ["Method"], "#4CAF50"),
        ],
      },
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
        { name: "Theme", color: "#FF5722" },
        { name: "Method", color: "#4CAF50" },
      ],
    });
    await openFile("Sample Coded.md");
    await focusEditor();
    await browser.pause(1000);
    await executeCommand("qualia-coding:open-analytics");
    await waitForElement(SELECTORS.analyticsView, 15000);
  });

  it("analytics view renders", async () => {
    await assertDomState(SELECTORS.analyticsView, {
      visible: true,
    });
  });

  it("toolbar is visible with mode buttons", async () => {
    await assertDomState(SELECTORS.analyticsToolbar, {
      visible: true,
      childCount: { min: 3 },
    });
  });

  it("visual baseline — frequency chart with 3 codes", async () => {
    await browser.pause(2000);
    const mismatch = await checkComponent(SELECTORS.analyticsView, "analytics-frequency-3codes");
    expect(mismatch).toBeLessThan(3);
  });
});
