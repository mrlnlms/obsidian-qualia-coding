import {
  openFile, checkComponent,
} from "obsidian-e2e-visual-test-kit";

describe("video view", () => {
  before(async () => {
    await openFile("Sample.mp4");
    await browser.pause(5000); // Video + WaveSurfer timeline needs time
  });

  it("video view renders", async () => {
    const leaf = await browser.$(".workspace-leaf.mod-active .view-content");
    expect(await leaf.isExisting()).toBe(true);
    expect(await leaf.isDisplayed()).toBe(true);
  });

  it("video element or canvas exists", async () => {
    const videos = await browser.$$(".workspace-leaf.mod-active video");
    const canvases = await browser.$$(".workspace-leaf.mod-active canvas");
    expect(videos.length + canvases.length).toBeGreaterThanOrEqual(1);
  });

  it("visual baseline — video view", async () => {
    const mismatch = await checkComponent(".workspace-leaf.mod-active .view-content", "video-view");
    expect(mismatch).toBeLessThan(5);
  });
});
