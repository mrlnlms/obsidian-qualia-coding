/**
 * Historical settings-tab E2E reference — intentionally excluded from CI.
 *
 * Obsidian 1.13 moved Settings out of the old in-window DOM. The original test
 * below depended on `.vertical-tab-nav-item` and `.vertical-tab-content`, and
 * its unscoped assertions could pass against Obsidian's own settings even when
 * the Qualia Coding tab had not opened.
 *
 * Keep this artifact for the future design-system work. A replacement test
 * should first switch WebdriverIO to the Settings window, then locate Qualia
 * Coding semantically and assert Qualia-owned controls instead of Obsidian's
 * private layout classes.
 *
 * This file lives outside `tests/e2e/specs/**/*.e2e.ts`, so it is documentation,
 * not an executable CI spec.
 */

describe("settings tab", () => {
  before(async () => {
    // Open Obsidian settings
    await browser.execute(() => {
      (window as any).app.commands.executeCommandById("app:open-settings");
    });
    await browser.pause(2000);

    // Navigate to Qualia Coding settings tab
    await browser.execute(() => {
      const settingTabs = document.querySelectorAll(".vertical-tab-nav-item");
      for (const tab of settingTabs) {
        if (tab.textContent?.includes("Qualia")) {
          (tab as HTMLElement).click();
          break;
        }
      }
    });
    await browser.pause(1000);
  });

  after(async () => {
    // Close settings modal via JS click (button may be obscured by content)
    await browser.execute(() => {
      const btn = document.querySelector(".modal-close-button") as HTMLElement | null;
      btn?.click();
    });
    await browser.pause(500);
  });

  it("settings tab renders", async () => {
    const settingItems = await browser.$$(".setting-item");
    expect(settingItems.length).toBeGreaterThanOrEqual(3);
  });

  it("has color picker setting", async () => {
    const container = await browser.$(".vertical-tab-content");
    const html = await container.getHTML();
    expect(html).toContain("color");
  });

  it("has toggle switches", async () => {
    const toggles = await browser.$$(".checkbox-container");
    expect(toggles.length).toBeGreaterThanOrEqual(1);
  });
});
