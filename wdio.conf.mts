import type { Options } from "@wdio/types";

export const config: Options.Testrunner = {
	// ── Test files ──────────────────────────────────────────────
	specs: ["./test/specs/**/*.e2e.ts"],
	exclude: [],

	// ── Runner ──────────────────────────────────────────────────
	runner: "local",
	maxInstances: 1,

	// ── Capabilities ────────────────────────────────────────────
	capabilities: [
		{
			browserName: "obsidian",
			browserVersion: "latest",
			"wdio:obsidianOptions": {
				plugins: ["."],
				vault: "test/vaults/visual-test",
			},
		} as any,
	],

	// ── Framework ───────────────────────────────────────────────
	framework: "mocha",
	mochaOpts: {
		ui: "bdd",
		timeout: 90_000,
	},

	// ── Services ────────────────────────────────────────────────
	services: [
		"obsidian",
		[
			"visual",
			{
				baselineFolder: "test/screenshots/baseline",
				formatImageName: "{tag}-{logName}-{width}x{height}",
				screenshotPath: "test/screenshots/actual",
				diffFolder: "test/screenshots/diff",
				savePerInstance: true,
				misMatchPercentage: 0.5,
			},
		],
	],

	// ── Reporters ───────────────────────────────────────────────
	reporters: ["spec", "obsidian"],

	// ── Logging ─────────────────────────────────────────────────
	logLevel: "warn",
	waitforTimeout: 10_000,
	waitforInterval: 300,
};
