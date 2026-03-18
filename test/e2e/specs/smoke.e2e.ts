import { openFile, waitForPlugin, waitForElement, getActiveFile } from "obsidian-e2e-visual-test-kit";

describe("smoke test", () => {
  it("Obsidian loads and plugin is available", async () => {
    await waitForPlugin("qualia-coding", 30000);
    const loaded = await browser.execute(() => {
      return !!(window as any).app.plugins.plugins["qualia-coding"];
    });
    expect(loaded).toBe(true);
  });

  it("can open a file", async () => {
    await openFile("Sample Coded.md");
    const active = await getActiveFile();
    expect(active).toBe("Sample Coded.md");
  });

  it("editor is visible", async () => {
    await waitForElement(".cm-editor", 5000);
    const editor = await browser.$(".cm-editor");
    expect(await editor.isDisplayed()).toBe(true);
  });
});
