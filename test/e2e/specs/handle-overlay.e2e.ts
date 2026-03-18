import {
  openFile, focusEditor, waitForElement, hoverElement, assertDomState, checkComponent,
} from "obsidian-e2e-visual-test-kit";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("handle overlay", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("d1", 4, 0, 5, 50, ["Emotion"], "#6200EE"),
        ],
      },
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
      ],
    });
    await openFile("Sample Coded.md");
    await focusEditor();
    await waitForElement(SELECTORS.marginPanel, 10000);
  });

  it("handle overlay container exists", async () => {
    await assertDomState(SELECTORS.handleOverlay, {
      visible: true,
    });
  });

  it("hovering margin bar shows handle SVGs", async () => {
    await hoverElement(SELECTORS.marginBar, 1000);
    const handles = await browser.$$(SELECTORS.handleSvg);
    expect(handles.length).toBeGreaterThanOrEqual(2);
  });

  it("visual baseline — handles on hover", async () => {
    await hoverElement(SELECTORS.marginBar, 1000);
    const mismatch = await checkComponent(".cm-editor", "handles-hover");
    expect(mismatch).toBeLessThan(2);
  });
});
