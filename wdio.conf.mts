import { createConfig } from "obsidian-e2e-visual-test-kit";

export const config = createConfig({
  pluginId: "qualia-coding",
  pluginDir: ".",
  // Pin CI to a release with a catalogued Linux installer. Using "latest" can
  // resolve a new app version before obsidian-launcher knows a compatible binary.
  obsidianVersion: "1.13.6",
  vault: "tests/e2e/vaults/visual",
  specs: ["tests/e2e/specs/**/*.e2e.ts"],
  screenshotDir: "tests/screenshots",
  timeout: 120_000,
  overrides: {
    specFileRetries: 2,
  },
});
