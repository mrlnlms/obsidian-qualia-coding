import {
  openFile, waitForElement, checkComponent,
} from "obsidian-plugin-e2e";

describe("image view", () => {
  before(async () => {
    await openFile("Sample.png");
    await browser.pause(4000); // Fabric.js canvas needs time to render
  });

  it("image view renders", async () => {
    const leaf = await browser.$(".workspace-leaf.mod-active .view-content");
    expect(await leaf.isExisting()).toBe(true);
    expect(await leaf.isDisplayed()).toBe(true);
  });

  it("canvas element exists", async () => {
    const canvases = await browser.$$(".workspace-leaf.mod-active canvas");
    expect(canvases.length).toBeGreaterThanOrEqual(1);
  });

  it("visual baseline — image view", async () => {
    const mismatch = await checkComponent(".workspace-leaf.mod-active .view-content", "image-view");
    expect(mismatch).toBeLessThan(5);
  });
});
