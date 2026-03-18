import {
  openFile, checkComponent,
} from "obsidian-plugin-e2e";

describe("audio view", () => {
  before(async () => {
    await openFile("Sample.mp3");
    await browser.pause(8000); // WaveSurfer needs time to decode + render
  });

  it("audio view renders", async () => {
    const leaf = await browser.$(".workspace-leaf.mod-active .view-content");
    expect(await leaf.isExisting()).toBe(true);
    expect(await leaf.isDisplayed()).toBe(true);
  });

  it("waveform container exists", async () => {
    const waveform = await browser.$(".workspace-leaf.mod-active .codemarker-audio-waveform");
    expect(await waveform.isExisting()).toBe(true);
    expect(await waveform.isDisplayed()).toBe(true);
    // WaveSurfer renders children (shadow DOM or direct divs) inside the container
    const children = await browser.execute(() => {
      const el = document.querySelector(".workspace-leaf.mod-active .codemarker-audio-waveform");
      if (!el) return 0;
      // Count direct children — WaveSurfer creates wrapper divs and/or shadow roots
      return el.children.length;
    });
    expect(children).toBeGreaterThanOrEqual(1);
  });

  it("visual baseline — audio view", async () => {
    const mismatch = await checkComponent(".workspace-leaf.mod-active .view-content", "audio-view");
    expect(mismatch).toBeLessThan(5);
  });
});
