import {
  openFile, waitForElement, assertDomState, checkComponent,
} from "obsidian-e2e-visual-test-kit";

describe("CSV grid view", () => {
  before(async () => {
    await openFile("Sample Data.csv");
    await waitForElement(".ag-root", 15000);
  });

  it("ag-grid renders with data", async () => {
    await assertDomState(".ag-root", {
      visible: true,
    });
  });

  it("shows column headers", async () => {
    const headers = await browser.$$(".ag-header-cell");
    expect(headers.length).toBeGreaterThanOrEqual(4);
  });

  it("shows data rows", async () => {
    const rows = await browser.$$(".ag-row");
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it("visual baseline — CSV grid with 5 rows", async () => {
    const mismatch = await checkComponent(".ag-root", "csv-grid-5rows");
    expect(mismatch).toBeLessThan(2);
  });
});
