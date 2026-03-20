import {
  openFile, focusEditor, waitForElement, executeCommand,
  assertDomState, checkComponent,
} from "obsidian-e2e-visual-test-kit";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("code explorer sidebar", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("ex1", 4, 0, 5, 50, ["Emotion"], "#6200EE"),
          mkMarker("ex2", 8, 0, 9, 40, ["Emotion"], "#6200EE"),
          mkMarker("ex3", 12, 0, 13, 30, ["Theme"], "#FF5722"),
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
    await executeCommand("qualia-coding:open-code-explorer");
    await browser.pause(2000);
    await waitForElement(SELECTORS.explorer, 10000);
  });

  it("explorer view renders", async () => {
    await assertDomState(SELECTORS.explorer, {
      visible: true,
    });
  });

  it("shows code entries as tree items", async () => {
    const items = await browser.$$(SELECTORS.treeItem);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it("displays code names", async () => {
    await assertDomState(SELECTORS.explorer, {
      innerHTML: { contains: ["Emotion", "Theme"] },
    });
  });

  it("visual baseline — explorer with 2 codes", async () => {
    const mismatch = await checkComponent(SELECTORS.explorer, "explorer-2codes");
    expect(mismatch).toBeLessThan(20);
  });
});
