import { createConfig } from "obsidian-e2e-visual-test-kit";

export const config = createConfig({
  pluginId: "qualia-coding",
  pluginDir: ".",
  vault: "test/e2e/vaults/visual",
  specs: ["test/e2e/specs/**/*.e2e.ts"],
});
