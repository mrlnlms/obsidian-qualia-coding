import {
  openFile,
  focusEditor,
  waitForElement,
  checkComponent,
  assertDomState,
  hoverElement,
} from "obsidian-e2e-visual-test-kit";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("margin panel", () => {
  before(async () => {
    const markers = {
      "Sample Coded.md": [
        mkMarker("m1", 4, 0, 5, 50, ["Emotion"], "#6200EE"),
        mkMarker("m2", 8, 0, 9, 40, ["Theme"], "#FF5722"),
      ],
    };
    const codeDefinitions = [
      { name: "Emotion", color: "#6200EE", description: "" },
      { name: "Theme", color: "#FF5722", description: "" },
    ];
    await injectQualiaData({ markers, codeDefinitions });
    await openFile("Sample Coded.md");
    await focusEditor();
    await waitForElement(SELECTORS.marginPanel, 10000);
  });

  it("renders margin bars for coded segments", async () => {
    await assertDomState(SELECTORS.marginPanel, {
      visible: true,
      childCount: { min: 2 },
    });
  });

  it("margin bars have correct CSS classes", async () => {
    await assertDomState(SELECTORS.marginBar, {
      classList: { contains: ["codemarker-margin-line"] },
    });
  });

  it("visual baseline — margin panel with 2 markers", async () => {
    const mismatch = await checkComponent(
      SELECTORS.marginPanel,
      "margin-2markers",
    );
    expect(mismatch).toBeLessThan(1);
  });

  it("hover highlights bar", async () => {
    await hoverElement(SELECTORS.marginBar);
    const mismatch = await checkComponent(
      SELECTORS.marginPanel,
      "margin-hover",
    );
    expect(mismatch).toBeLessThan(2);
  });
});
