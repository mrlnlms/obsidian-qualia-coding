import {
  openFile, focusEditor, waitForElement, hoverElement, assertDomState,
} from "obsidian-plugin-e2e";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("hover interaction", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("hv1", 4, 0, 5, 50, ["Emotion"], "#6200EE"),
          mkMarker("hv2", 8, 0, 9, 40, ["Theme"], "#FF5722"),
        ],
      },
      codeDefinitions: [
        { name: "Emotion", color: "#6200EE" },
        { name: "Theme", color: "#FF5722" },
      ],
    });
    await openFile("Sample Coded.md");
    await focusEditor();
    await waitForElement(SELECTORS.marginPanel, 10000);
  });

  it("hovering a highlight adds hovered class to margin bar", async () => {
    await hoverElement(SELECTORS.highlight, 500);
    const bars = await browser.$$(`${SELECTORS.marginBar}, ${SELECTORS.marginLabel}, ${SELECTORS.marginDot}`);
    let hasHovered = false;
    for (const bar of bars) {
      const cls = await bar.getAttribute("class");
      if (cls?.includes("codemarker-margin-hovered")) {
        hasHovered = true;
        break;
      }
    }
    expect(hasHovered).toBe(true);
  });

  it("hovering margin bar highlights corresponding text", async () => {
    await hoverElement(SELECTORS.marginBar, 500);
    const highlights = await browser.$$(SELECTORS.highlight);
    expect(highlights.length).toBeGreaterThanOrEqual(1);
  });

  it("moving away clears hover state", async () => {
    await hoverElement(".inline-title", 500);
    await browser.pause(500);
    const hoveredBars = await browser.$$(".codemarker-margin-hovered");
    expect(hoveredBars.length).toBe(0);
  });
});
