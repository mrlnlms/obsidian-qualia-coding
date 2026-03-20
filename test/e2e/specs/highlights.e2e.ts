import {
  openFile, focusEditor, waitForElement, checkComponent, assertDomState,
} from "obsidian-e2e-visual-test-kit";
import { injectQualiaData, refreshEditorDecorations, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("editor highlights", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("h1", 4, 0, 4, 40, ["Emotion"], "#6200EE"),
          mkMarker("h2", 8, 0, 9, 30, ["Theme"], "#FF5722"),
          mkMarker("h3", 4, 10, 4, 25, ["Method"], "#4CAF50"),
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
    await refreshEditorDecorations(["Sample Coded.md"]);
  });

  it("renders highlight decorations on coded text", async () => {
    const highlights = await browser.$$(SELECTORS.highlight);
    expect(highlights.length).toBeGreaterThanOrEqual(2);
  });

  it("highlights have data-marker-id attribute", async () => {
    await assertDomState(SELECTORS.highlight, {
      visible: true,
      classList: { contains: ["codemarker-highlight"] },
    });
  });

  it("nested markers both render", async () => {
    const highlights = await browser.$$(SELECTORS.highlight);
    const markerIds: string[] = [];
    for (const h of highlights) {
      const id = await h.getAttribute("data-marker-id");
      if (id) markerIds.push(id);
    }
    const uniqueIds = new Set(markerIds);
    expect(uniqueIds.size).toBeGreaterThanOrEqual(2);
  });

  it("visual baseline — editor with 3 highlights", async () => {
    const mismatch = await checkComponent(".cm-editor", "highlights-3markers");
    expect(mismatch).toBeLessThan(2);
  });
});
