# obsidian-plugin-e2e — Design Spec

## Goal

Reusable test harness for end-to-end visual and DOM testing of Obsidian plugins. Lives as an independent repo (`~/Desktop/obsidian-plugin-e2e/`), consumed by any plugin via path reference. Wraps `wdio-obsidian-service` with navigation helpers, screenshot comparison, and DOM state assertions.

## Problem

Vitest + jsdom covers pure logic (~80% of testable code), but cannot test:
- Visual rendering (Chart.js, Fabric.js, CM6 decorations, CSS)
- DOM structure in Obsidian context (sidebar positions, margin panels, highlights)
- Interaction states (hover, drag, selection)
- Multi-pane scenarios

The `wdio-obsidian-service` npm package (v2.4) handles Obsidian lifecycle (download, vault setup, plugin install), but each plugin must write boilerplate for navigation, screenshots, and DOM validation.

## Architecture

```
obsidian-plugin-e2e (independent repo)
├── Config Layer      — createConfig() generates wdio.conf with sensible defaults
├── Navigation Layer  — interact with Obsidian like a person
└── Assertion Layer   — screenshots + DOM state validation

Plugin repo (qualia-coding, mirror-notes, etc.)
├── wdio.conf.mts     — extends createConfig with plugin ID and vault path
├── test/vaults/       — test vault with known fixtures
├── test/specs/        — plugin-specific test scenarios
└── test/helpers/      — plugin-specific data injection and selectors
```

### Separation of concerns

| Responsibility | Where | Example |
|---|---|---|
| Open Obsidian, create vault, install plugin | `wdio-obsidian-service` (npm) | Already exists |
| Navigate Obsidian UI, take screenshots, assert DOM | `obsidian-plugin-e2e` (this repo) | `openFile()`, `checkElement()`, `assertDomState()` |
| Inject plugin data, define selectors, write scenarios | Plugin repo | `injectQualiaData()`, `.codemarker-margin-panel` |

## Config Layer

```typescript
// src/config.ts
export interface E2EConfigOptions {
  pluginId: string;
  pluginDir: string;            // path to plugin root (has manifest.json)
  vault: string;                // path to test vault
  specs: string[];              // glob patterns for spec files
  obsidianVersion?: string;     // default: 'latest'
  screenshotDir?: string;       // default: 'test/screenshots'
  timeout?: number;             // default: 60000 (ms)
  visualServiceOptions?: Record<string, unknown>; // pass-through to @wdio/visual-service
}

export function createConfig(opts: E2EConfigOptions): WebdriverIO.Config;
```

### Generated config shape

`createConfig` produces a complete wdio config matching the `wdio-obsidian-service` API:

```typescript
// What createConfig({ pluginId: 'qualia-coding', pluginDir: '.', vault: 'test/vaults/visual', specs: ['test/specs/**/*.e2e.ts'] }) generates:
{
  runner: 'local',
  framework: 'mocha',
  specs: ['test/specs/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [{
    browserName: 'obsidian',
    browserVersion: 'latest',
    'wdio:obsidianOptions': {
      installerVersion: 'earliest',
      plugins: ['.'],               // pluginDir
      vault: 'test/vaults/visual',  // vault path
    },
  }],
  services: [
    'obsidian',
    ['visual', {
      baselineFolder: path.join(process.cwd(), 'test/screenshots/baseline'),
      screenshotPath: path.join(process.cwd(), 'test/screenshots'),
      autoSaveBaseline: true,
      // ...opts.visualServiceOptions
    }],
  ],
  reporters: ['obsidian'],
  cacheDir: path.resolve('.obsidian-cache'),
  mochaOpts: { ui: 'bdd', timeout: 60000 },
  logLevel: 'warn',
}
```

## Navigation Layer

All helpers use `browser.execute()` for synchronous Obsidian API calls. Since `browser.execute()` is **synchronous only** (no async/await inside), helpers that trigger async rendering include a `browser.pause()` after execution to wait for Obsidian to settle.

**Pause contract:** Helpers that change UI state (openFile, openSidebar, etc.) include a built-in pause (default 2000ms). Helpers that only read state (getActiveFile, getPlugin) do not pause.

```typescript
// src/navigation.ts

/** Open a file in the active leaf. Pauses for rendering. */
export async function openFile(path: string, pauseMs?: number): Promise<void> {
  await browser.execute((p: string) => {
    const file = (window as any).app.vault.getAbstractFileByPath(p);
    if (file) (window as any).app.workspace.getLeaf(false).openFile(file);
  }, path);
  await browser.pause(pauseMs ?? 2000);
}

/** Open left or right sidebar. Pauses for animation. */
export async function openSidebar(side: 'left' | 'right'): Promise<void>;

/** Switch to a specific sidebar tab by view type. Pauses for rendering. */
export async function switchSidebarTab(viewType: string): Promise<void>;

/** Execute an Obsidian command by ID via browser.executeObsidianCommand (provided by wdio-obsidian-service). */
export async function executeCommand(commandId: string): Promise<void> {
  await browser.executeObsidianCommand(commandId);
  await browser.pause(1000);
}

/** Focus the CM6 editor in the active leaf. */
export async function focusEditor(): Promise<void> {
  const content = await browser.$('.workspace-leaf.mod-active .cm-content');
  if (await content.isExisting()) {
    await content.click();
    await browser.pause(500);
  }
}

/** Scroll the active editor/view to bring an element into view. */
export async function scrollTo(selector: string): Promise<void>;

/** Wait for a DOM element to appear. No built-in pause — uses wdio waitForExist. */
export async function waitForElement(selector: string, timeout?: number): Promise<void> {
  const el = await browser.$(selector);
  await el.waitForExist({ timeout: timeout ?? 10000 });
}

/** Wait for a plugin to be loaded and enabled. */
export async function waitForPlugin(pluginId: string, timeout?: number): Promise<void> {
  await browser.waitUntil(async () => {
    return browser.execute((id: string) => {
      return !!(window as any).app?.plugins?.plugins?.[id];
    }, pluginId);
  }, { timeout: timeout ?? 15000, timeoutMsg: `Plugin ${pluginId} not loaded` });
}

/** Hover over an element with pause for tooltip/animation. */
export async function hoverElement(selector: string, pauseMs?: number): Promise<void>;

/** Get the path of the currently active file. No pause. */
export async function getActiveFile(): Promise<string | null> {
  return browser.execute(() => {
    return (window as any).app?.workspace?.getActiveFile()?.path ?? null;
  });
}

/** Reset vault to clean state (uses wdio-obsidian-service obsidianPage). */
export async function resetVault(vaultPath?: string): Promise<void>;
```

## Assertion Layer

### Visual (screenshot comparison)

Wraps `@wdio/visual-service` commands with consistent API:

```typescript
// src/assertions.ts

/**
 * Compare a specific element against its baseline screenshot.
 * Wraps browser.checkElement() from @wdio/visual-service.
 * Returns mismatch percentage.
 */
export async function checkComponent(
  selector: string,
  tag: string,
  options?: { misMatchPercentage?: number }
): Promise<number> {
  const el = await browser.$(selector);
  return browser.checkElement(el, tag, {
    misMatchPercentage: options?.misMatchPercentage ?? 0.5,
  });
}

/**
 * Compare full viewport against baseline.
 * Wraps browser.checkScreen() from @wdio/visual-service.
 */
export async function checkViewport(tag: string): Promise<number>;

/**
 * Save element screenshot without comparison (for creating baselines).
 * Wraps browser.saveElement().
 */
export async function saveComponent(selector: string, tag: string): Promise<void>;
```

Screenshots stored by `@wdio/visual-service` in the configured screenshotDir.
Update baselines with: `npx wdio run wdio.conf.mts -- --update-visual-baseline`

### DOM state validation

```typescript
/** Assert attributes and structure of a DOM element */
export async function assertDomState(
  selector: string,
  expected: DomExpectation
): Promise<void>;

export interface DomExpectation {
  visible?: boolean;
  childCount?: { min?: number; max?: number; exact?: number };
  classList?: { contains?: string[]; notContains?: string[] };
  innerHTML?: { contains?: string[]; notContains?: string[] };
  dataAttributes?: Record<string, string | { contains: string }>;
}

/** Capture full DOM state of matching elements for snapshot comparison */
export async function captureDomState(
  selector: string
): Promise<DomSnapshot[]>;

export interface DomSnapshot {
  selector: string;
  tagName: string;
  attributes: Record<string, string>;
  classList: string[];
  innerHTML: string;
  isConnected: boolean;
  boundingRect: { x: number; y: number; width: number; height: number };
  childCount: number;
}

/** Assert innerHTML contents of an element */
export async function assertInnerHTML(
  selector: string,
  expected: { contains?: string[]; notContains?: string[] }
): Promise<void>;
```

**Implementation note:** DOM assertions use `browser.execute()` to read element state synchronously, then assert in Node.js land. Example:

```typescript
export async function assertDomState(selector: string, expected: DomExpectation): Promise<void> {
  const state = await browser.execute((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return {
      visible: el.offsetParent !== null,
      childCount: el.children.length,
      classList: Array.from(el.classList),
      innerHTML: el.innerHTML,
      dataAttributes: Object.fromEntries(
        Array.from(el.attributes)
          .filter(a => a.name.startsWith('data-'))
          .map(a => [a.name, a.value])
      ),
    };
  }, selector);

  if (!state) throw new Error(`Element not found: ${selector}`);
  // ... assert each field of expected against state
}
```

## Plugin consumer structure

```
qualia-coding/
  wdio.conf.mts                    — ~10 lines, extends createConfig
  test/
    vaults/visual/                  — minimal vault with known fixtures
      .obsidian/app.json
      .obsidian/community-plugins.json
      Sample Coded.md
    specs/
      margin-panel.e2e.ts
      analytics-modes.e2e.ts
    helpers/
      qualia.ts                     — injectQualiaData(), CSS selectors map

mirror-notes/
  wdio.conf.mts                    — ~10 lines, extends createConfig
  test/
    vaults/visual/
      .obsidian/app.json
      Template.md
      Test Note.md
    specs/
      injection-positions.e2e.ts
      multi-pane.e2e.ts
    helpers/
      mirror.ts                     — injectMirrorConfig(), position selectors
```

## Plugin-specific helpers (NOT in the shared package)

Each plugin provides its own data injection and selectors. Data injection uses synchronous `browser.execute()` — `saveData()` is called synchronously (Obsidian's `saveData` writes to disk but returns a promise that's safe to fire-and-forget in this context), then `browser.pause()` waits for Obsidian to settle.

```typescript
// qualia-coding/test/helpers/qualia.ts
import { waitForPlugin } from 'obsidian-plugin-e2e';

export async function injectQualiaData(data: Record<string, unknown>): Promise<void> {
  await waitForPlugin('qualia-coding');
  await browser.execute((d: Record<string, unknown>) => {
    const plugin = (window as any).app.plugins.plugins['qualia-coding'];
    // saveData is fire-and-forget here — disk write happens async but
    // loadMarkers reads from the in-memory state that saveData updates
    plugin.saveData({ ...plugin.settings, ...d });
    plugin.markdownModel?.loadMarkers();
  }, data);
  await browser.pause(2000);
}

export const SELECTORS = {
  marginPanel: '.codemarker-margin-panel',
  marginBar: '.codemarker-margin-line',
  marginLabel: '.codemarker-margin-label',
  highlight: '.codemarker-highlight',
  handleOverlay: '.codemarker-handle-overlay',
  explorer: '.codemarker-explorer',
} as const;
```

```typescript
// mirror-notes/test/helpers/mirror.ts
import { waitForPlugin } from 'obsidian-plugin-e2e';

export async function injectMirrorConfig(config: Record<string, unknown>): Promise<void> {
  await waitForPlugin('obsidian-mirror-notes');
  await browser.execute((c: Record<string, unknown>) => {
    const plugin = (window as any).app.plugins.plugins['obsidian-mirror-notes'];
    plugin.saveData({ ...plugin.settings, ...c });
    plugin.refresh();
  }, config);
  await browser.pause(2000);
}

export const SELECTORS = {
  injection: '.mirror-dom-injection',
  aboveTitle: '[data-position="above-title"]',
  belowProperties: '[data-position="below-properties"]',
} as const;
```

## Repo structure

```
~/Desktop/obsidian-plugin-e2e/
  package.json              — name: "obsidian-plugin-e2e"
  tsconfig.json
  src/
    index.ts                — barrel export
    config.ts               — createConfig()
    navigation.ts           — openFile, openSidebar, executeCommand, etc.
    assertions.ts           — checkComponent, assertDomState, captureDomState
    types.ts                — E2EConfigOptions, DomExpectation, DomSnapshot
  README.md
```

## Dependencies

**Package deps (peer — consumer must install):**
- `webdriverio` ^9.18
- `wdio-obsidian-service` ^2.4
- `@wdio/visual-service` ^9.2

**Plugin consumer installs:**
```bash
npm install --save-dev obsidian-plugin-e2e@file:../../obsidian-plugin-e2e \
  wdio-obsidian-service @wdio/visual-service \
  @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter \
  wdio-obsidian-reporter @types/mocha
```

## npm scripts (plugin side)

```json
{
  "test": "vitest run",
  "test:e2e": "wdio run wdio.conf.mts",
  "test:visual": "wdio run wdio.conf.mts --spec test/specs/visual*.e2e.ts",
  "test:visual:update": "npx wdio run wdio.conf.mts -- --update-visual-baseline"
}
```

## Limitations and constraints

- Obsidian must be downloadable on the machine (wdio-obsidian-service handles this, caches in `.obsidian-cache/`)
- Screenshots are resolution-dependent — same machine for baseline and comparison
- First run downloads Obsidian (~200MB), cached after
- iOS not supported by wdio-obsidian-service
- `browser.execute()` is synchronous only — no async/await inside. Use fire-and-forget for async Obsidian APIs, then `browser.pause()` to wait
- Margin panel and CM6 decorations render async — navigation helpers include built-in pauses
- Node 18+ required (20+ recommended)
- `maxInstances: 1` recommended (Obsidian is a desktop app, parallel instances can conflict)

## Success criteria

1. Qualia Coding: `npm run test:e2e` → opens Obsidian, runs margin panel + analytics specs, produces screenshots
2. Mirror Notes: same flow with injection position specs
3. Adding a new visual test for either plugin takes <20 lines of spec code
4. No Obsidian/wdio boilerplate duplicated between plugins
