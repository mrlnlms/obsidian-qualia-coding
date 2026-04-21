import {
  openFile, focusEditor, waitForElement, executeCommand,
  assertDomState, assertInnerHTML, checkComponent,
} from "obsidian-e2e-visual-test-kit";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("analytics — dashboard mode", () => {
  before(async () => {
    await injectQualiaData({
      markers: {
        "Sample Coded.md": [
          mkMarker("db1", 6, 0, 7, 50, ["Emotion"], "#6200EE"),
          mkMarker("db2", 12, 0, 13, 40, ["Theme"], "#FF5722"),
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
    await executeCommand("qualia-coding:open-analytics");
    await waitForElement(SELECTORS.analyticsView, 15000);

    // Switch to dashboard mode via toolbar button
    await browser.execute(() => {
      const btns = document.querySelectorAll(".codemarker-analytics-toolbar-btn");
      for (const btn of btns) {
        if (btn.getAttribute("aria-label")?.toLowerCase().includes("dashboard")) {
          (btn as HTMLElement).click();
          break;
        }
      }
    });
    await browser.pause(2000);
  });

  it("dashboard renders KPI cards", async () => {
    const kpis = await browser.$$(".codemarker-kpi-card");
    expect(kpis.length).toBeGreaterThanOrEqual(1);
  });

  it("KPI shows marker count", async () => {
    await assertInnerHTML(SELECTORS.analyticsChart, {
      contains: ["2"],
    });
  });

  it("visual baseline — dashboard with KPIs", async () => {
    const mismatch = await checkComponent(SELECTORS.analyticsView, "analytics-dashboard");
    expect(mismatch).toBeLessThan(5);
  });
});
