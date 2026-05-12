import {
  openFile, waitForElement,
} from "obsidian-e2e-visual-test-kit";
import { enableMediaAutoOpen } from "../helpers/qualia.js";

describe("image view", () => {
  before(async () => {
    await enableMediaAutoOpen();
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

});
