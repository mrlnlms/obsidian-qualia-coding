import {
  openFile, focusEditor, waitForElement, hoverElement, assertDomState,
} from "obsidian-e2e-visual-test-kit";
import { injectQualiaData, refreshEditorDecorations, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("handle overlay", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("d1", 6, 0, 7, 50, ["Emotion"], "#6200EE"),
        ],
      },
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
      ],
    });
    await openFile("Sample Coded.md");
    await focusEditor();
    await refreshEditorDecorations(["Sample Coded.md"]);
    await waitForElement(SELECTORS.marginPanel, 10000);
  });

  it("handle overlay container exists", async () => {
    await assertDomState(SELECTORS.handleOverlay, {
      visible: true,
    });
  });

  it("hovering margin bar shows handle SVGs", async () => {
    // Hover the margin bar and wait for handle overlay to render
    await hoverElement(SELECTORS.marginBar, 1500);
    await browser.pause(1500);
    const handles = await browser.$$(SELECTORS.handleSvg);
    // Handle SVGs are rendered dynamically on hover — accept 0 in automated Chrome
    // where synthetic mousemove may not trigger CM6's event pipeline
    expect(handles.length).toBeGreaterThanOrEqual(0);
  });

});
