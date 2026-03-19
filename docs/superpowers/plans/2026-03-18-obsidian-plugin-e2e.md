# obsidian-plugin-e2e — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable e2e test harness for Obsidian plugins at `~/Desktop/obsidian-plugin-e2e/`, then integrate it with Qualia Coding as proof of concept.

**Architecture:** 3-layer package (config, navigation, assertions) wrapping `wdio-obsidian-service` + `@wdio/visual-service`. Each plugin consumes via `file:` reference and brings only its own specs, fixtures, and data injection helpers.

**Tech Stack:** TypeScript, WebdriverIO 9, wdio-obsidian-service 2.4, @wdio/visual-service 9, Mocha

---

## Arquivos

### Shared package (`~/Desktop/obsidian-plugin-e2e/`)

| Arquivo | Acao | Responsabilidade |
|---|---|---|
| `package.json` | Criar | Metadata, peer deps, build script |
| `tsconfig.json` | Criar | TypeScript config para library |
| `src/index.ts` | Criar | Barrel export |
| `src/types.ts` | Criar | E2EConfigOptions, DomExpectation, DomSnapshot |
| `src/config.ts` | Criar | createConfig() |
| `src/navigation.ts` | Criar | openFile, openSidebar, executeCommand, etc. |
| `src/assertions.ts` | Criar | checkComponent, assertDomState, captureDomState |

### Qualia Coding integration (`obsidian-qualia-coding/`)

| Arquivo | Acao | Responsabilidade |
|---|---|---|
| `wdio.conf.mts` | Criar | Plugin-specific wdio config |
| `test/e2e/vaults/visual/.obsidian/app.json` | Criar | Obsidian vault settings |
| `test/e2e/vaults/visual/.obsidian/community-plugins.json` | Criar | Enable qualia-coding plugin |
| `test/e2e/vaults/visual/Sample Coded.md` | Criar | Test fixture with known text |
| `test/e2e/helpers/qualia.ts` | Criar | injectQualiaData(), SELECTORS |
| `test/e2e/specs/smoke.e2e.ts` | Criar | Smoke test — plugin loads, file opens |
| `test/e2e/specs/margin-panel.e2e.ts` | Criar | Margin panel visual + DOM tests |
| `package.json` | Modificar | Add e2e deps + scripts |

---

## Chunk 1: Scaffold do repo + Config Layer

### Task 1: Criar repo e package.json

**Files:**
- Create: `~/Desktop/obsidian-plugin-e2e/package.json`
- Create: `~/Desktop/obsidian-plugin-e2e/tsconfig.json`

- [ ] **Step 1: Criar diretorio e inicializar package.json**

```bash
mkdir -p ~/Desktop/obsidian-plugin-e2e/src
```

```json
// ~/Desktop/obsidian-plugin-e2e/package.json
{
  "name": "obsidian-plugin-e2e",
  "version": "0.1.0",
  "description": "Reusable e2e test harness for Obsidian plugins",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "peerDependencies": {
    "webdriverio": "^9.18.0",
    "wdio-obsidian-service": "^2.4.0",
    "@wdio/visual-service": "^9.2.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "webdriverio": "^9.18.0",
    "@wdio/visual-service": "^9.2.0",
    "wdio-obsidian-service": "^2.4.0",
    "@wdio/types": "^9.0.0"
  }
}
```

```json
// ~/Desktop/obsidian-plugin-e2e/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["wdio-obsidian-service"]
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Instalar deps**

Run: `cd ~/Desktop/obsidian-plugin-e2e && npm install`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/obsidian-plugin-e2e
git init
git add package.json tsconfig.json package-lock.json
~/.claude/scripts/commit.sh "chore: scaffold obsidian-plugin-e2e com package.json e tsconfig"
```

### Task 2: Criar types.ts

**Files:**
- Create: `~/Desktop/obsidian-plugin-e2e/src/types.ts`

- [ ] **Step 1: Criar types.ts com todas as interfaces publicas**

```typescript
// src/types.ts

import type { Options } from "@wdio/types";

export interface E2EConfigOptions {
  /** Plugin ID as registered in Obsidian (e.g. 'qualia-coding') */
  pluginId: string;
  /** Path to plugin root directory (has manifest.json). Usually '.' */
  pluginDir: string;
  /** Path to test vault directory */
  vault: string;
  /** Glob patterns for spec files */
  specs: string[];
  /** Obsidian version to test against. Default: 'latest' */
  obsidianVersion?: string;
  /** Directory for screenshots. Default: 'test/screenshots' */
  screenshotDir?: string;
  /** Mocha timeout in ms. Default: 60000 */
  timeout?: number;
  /** Extra options passed to @wdio/visual-service */
  visualServiceOptions?: Record<string, unknown>;
  /** Extra wdio config overrides (merged last) */
  overrides?: Partial<Options.Testrunner>;
}

export interface DomExpectation {
  /** Element is visible (offsetParent !== null) */
  visible?: boolean;
  /** Child element count */
  childCount?: { min?: number; max?: number; exact?: number };
  /** CSS class assertions */
  classList?: { contains?: string[]; notContains?: string[] };
  /** innerHTML content assertions */
  innerHTML?: { contains?: string[]; notContains?: string[] };
  /** data-* attribute assertions. String = exact match, object = partial match */
  dataAttributes?: Record<string, string | { contains: string }>;
}

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
```

- [ ] **Step 2: Rodar build**

Run: `cd ~/Desktop/obsidian-plugin-e2e && npx tsc --noEmit`
Expected: PASS (ou erros de `browser` global que resolveremos depois)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
~/.claude/scripts/commit.sh "feat: adiciona types publicas (E2EConfigOptions, DomExpectation, DomSnapshot)"
```

### Task 3: Criar config.ts

**Files:**
- Create: `~/Desktop/obsidian-plugin-e2e/src/config.ts`

- [ ] **Step 1: Criar config.ts com createConfig**

```typescript
// src/config.ts

import * as path from "node:path";
import type { Options } from "@wdio/types";
import type { E2EConfigOptions } from "./types.js";

export function createConfig(opts: E2EConfigOptions): Options.Testrunner {
  const screenshotDir = opts.screenshotDir ?? "test/screenshots";
  const timeout = opts.timeout ?? 60000;

  const base: Options.Testrunner = {
    runner: "local",
    framework: "mocha",
    specs: opts.specs,
    maxInstances: 1,
    capabilities: [
      {
        browserName: "obsidian",
        browserVersion: opts.obsidianVersion ?? "latest",
        "wdio:obsidianOptions": {
          installerVersion: "earliest",
          plugins: [opts.pluginDir],
          vault: opts.vault,
        },
      } as any,
    ],
    services: [
      "obsidian",
      [
        "visual",
        {
          baselineFolder: path.join(process.cwd(), screenshotDir, "baseline"),
          screenshotPath: path.join(process.cwd(), screenshotDir),
          autoSaveBaseline: true,
          ...opts.visualServiceOptions,
        },
      ],
    ],
    reporters: ["obsidian"],
    cacheDir: path.resolve(".obsidian-cache"),
    mochaOpts: {
      ui: "bdd",
      timeout,
    },
    logLevel: "warn",
  };

  if (opts.overrides) {
    return {
      ...base,
      ...opts.overrides,
      capabilities: opts.overrides.capabilities ?? base.capabilities,
      services: opts.overrides.services ?? base.services,
      mochaOpts: { ...base.mochaOpts, ...(opts.overrides as any).mochaOpts },
    };
  }

  return base;
}
```

- [ ] **Step 2: Rodar build**

Run: `cd ~/Desktop/obsidian-plugin-e2e && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
~/.claude/scripts/commit.sh "feat: adiciona createConfig() para gerar wdio.conf completo"
```

---

## Chunk 2: Navigation Layer

### Task 4: Criar navigation.ts

**Files:**
- Create: `~/Desktop/obsidian-plugin-e2e/src/navigation.ts`

- [ ] **Step 1: Criar navigation.ts com todos os helpers**

```typescript
// src/navigation.ts

const DEFAULT_PAUSE = 2000;

/** Open a file in the active leaf. Pauses for rendering. */
export async function openFile(filePath: string, pauseMs?: number): Promise<void> {
  await browser.execute((p: string) => {
    const file = (window as any).app.vault.getAbstractFileByPath(p);
    if (file) (window as any).app.workspace.getLeaf(false).openFile(file);
  }, filePath);
  await browser.pause(pauseMs ?? DEFAULT_PAUSE);
}

/** Open left or right sidebar. Pauses for animation. */
export async function openSidebar(side: "left" | "right"): Promise<void> {
  await browser.execute((s: string) => {
    const ws = (window as any).app.workspace;
    if (s === "left") {
      ws.leftSplit?.expand();
    } else {
      ws.rightSplit?.expand();
    }
  }, side);
  await browser.pause(1000);
}

/** Switch to a specific sidebar tab by view type. Pauses for rendering. */
export async function switchSidebarTab(viewType: string): Promise<void> {
  await browser.execute((vt: string) => {
    const ws = (window as any).app.workspace;
    const leaf = ws.getLeavesOfType(vt)[0];
    if (leaf) ws.revealLeaf(leaf);
  }, viewType);
  await browser.pause(1000);
}

/** Execute an Obsidian command by ID. Uses wdio-obsidian-service's built-in command. */
export async function executeCommand(commandId: string): Promise<void> {
  await browser.executeObsidianCommand(commandId);
  await browser.pause(1000);
}

/** Focus the CM6 editor in the active leaf. */
export async function focusEditor(): Promise<void> {
  const content = await browser.$(".workspace-leaf.mod-active .cm-content");
  if (await content.isExisting()) {
    await content.click();
    await browser.pause(500);
  }
}

/** Scroll the active view to bring an element into view. */
export async function scrollTo(selector: string): Promise<void> {
  const el = await browser.$(selector);
  if (await el.isExisting()) {
    await el.scrollIntoView();
    await browser.pause(500);
  }
}

/** Wait for a DOM element to appear. Uses wdio waitForExist. */
export async function waitForElement(selector: string, timeout?: number): Promise<void> {
  const el = await browser.$(selector);
  await el.waitForExist({ timeout: timeout ?? 10000 });
}

/** Wait for a plugin to be loaded and enabled. */
export async function waitForPlugin(pluginId: string, timeout?: number): Promise<void> {
  await browser.waitUntil(
    async () => {
      return browser.execute((id: string) => {
        return !!(window as any).app?.plugins?.plugins?.[id];
      }, pluginId);
    },
    {
      timeout: timeout ?? 15000,
      timeoutMsg: `Plugin '${pluginId}' not loaded within timeout`,
    },
  );
}

/** Hover over an element with pause for tooltip/animation. */
export async function hoverElement(selector: string, pauseMs?: number): Promise<void> {
  const el = await browser.$(selector);
  if (await el.isExisting()) {
    await el.moveTo();
    await browser.pause(pauseMs ?? 800);
  }
}

/** Get the path of the currently active file. No pause. */
export async function getActiveFile(): Promise<string | null> {
  return browser.execute(() => {
    return (window as any).app?.workspace?.getActiveFile()?.path ?? null;
  });
}

/** Reset vault to clean state. Uses wdio-obsidian-service's reloadObsidian. */
export async function resetVault(vaultPath?: string): Promise<void> {
  await (browser as any).reloadObsidian(vaultPath ? { vault: vaultPath } : undefined);
  await browser.pause(3000);
}
```

- [ ] **Step 2: Rodar build**

Run: `cd ~/Desktop/obsidian-plugin-e2e && npx tsc --noEmit`
Expected: PASS (ou erros de `browser` global — wdio types resolvem isso)

- [ ] **Step 3: Commit**

```bash
git add src/navigation.ts
~/.claude/scripts/commit.sh "feat: adiciona navigation helpers (openFile, openSidebar, executeCommand, etc.)"
```

---

## Chunk 3: Assertion Layer

### Task 5: Criar assertions.ts

**Files:**
- Create: `~/Desktop/obsidian-plugin-e2e/src/assertions.ts`

- [ ] **Step 1: Criar assertions.ts com visual + DOM assertions**

```typescript
// src/assertions.ts

import type { DomExpectation, DomSnapshot } from "./types.js";

// ─── Visual (screenshot comparison) ──────────────────────────

/**
 * Compare a specific element against its baseline screenshot.
 * Wraps browser.checkElement() from @wdio/visual-service.
 * Returns mismatch percentage (0 = identical).
 */
export async function checkComponent(
  selector: string,
  tag: string,
  options?: { misMatchPercentage?: number },
): Promise<number> {
  const el = await browser.$(selector);
  await el.waitForExist({ timeout: 5000 });
  return (browser as any).checkElement(el, tag, {
    misMatchPercentage: options?.misMatchPercentage ?? 0.5,
  });
}

/**
 * Compare full viewport against baseline.
 * Wraps browser.checkScreen() from @wdio/visual-service.
 */
export async function checkViewport(tag: string): Promise<number> {
  return (browser as any).checkScreen(tag);
}

/**
 * Save element screenshot without comparison (for creating baselines).
 * Wraps browser.saveElement() from @wdio/visual-service.
 */
export async function saveComponent(selector: string, tag: string): Promise<void> {
  const el = await browser.$(selector);
  await el.waitForExist({ timeout: 5000 });
  await (browser as any).saveElement(el, tag);
}

// ─── DOM state validation ────────────────────────────────────

/** Read DOM state of an element synchronously via browser.execute. */
async function readDomState(selector: string) {
  return browser.execute((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const htmlEl = el as HTMLElement;
    const rect = htmlEl.getBoundingClientRect();
    return {
      visible: htmlEl.offsetParent !== null || htmlEl.style.display !== "none",
      childCount: el.children.length,
      classList: Array.from(el.classList),
      innerHTML: el.innerHTML,
      tagName: el.tagName.toLowerCase(),
      isConnected: el.isConnected,
      boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      attributes: Object.fromEntries(
        Array.from(el.attributes).map((a) => [a.name, a.value]),
      ),
      dataAttributes: Object.fromEntries(
        Array.from(el.attributes)
          .filter((a) => a.name.startsWith("data-"))
          .map((a) => [a.name, a.value]),
      ),
    };
  }, selector);
}

/** Assert attributes and structure of a DOM element. */
export async function assertDomState(
  selector: string,
  expected: DomExpectation,
): Promise<void> {
  const state = await readDomState(selector);
  if (!state) {
    throw new Error(`assertDomState: element not found: ${selector}`);
  }

  if (expected.visible !== undefined && state.visible !== expected.visible) {
    throw new Error(
      `assertDomState: expected visible=${expected.visible}, got ${state.visible}`,
    );
  }

  if (expected.childCount) {
    const { min, max, exact } = expected.childCount;
    if (exact !== undefined && state.childCount !== exact) {
      throw new Error(
        `assertDomState: expected childCount=${exact}, got ${state.childCount}`,
      );
    }
    if (min !== undefined && state.childCount < min) {
      throw new Error(
        `assertDomState: expected childCount>=${min}, got ${state.childCount}`,
      );
    }
    if (max !== undefined && state.childCount > max) {
      throw new Error(
        `assertDomState: expected childCount<=${max}, got ${state.childCount}`,
      );
    }
  }

  if (expected.classList) {
    for (const cls of expected.classList.contains ?? []) {
      if (!state.classList.includes(cls)) {
        throw new Error(
          `assertDomState: expected classList to contain '${cls}', got [${state.classList.join(", ")}]`,
        );
      }
    }
    for (const cls of expected.classList.notContains ?? []) {
      if (state.classList.includes(cls)) {
        throw new Error(
          `assertDomState: expected classList NOT to contain '${cls}'`,
        );
      }
    }
  }

  if (expected.innerHTML) {
    for (const str of expected.innerHTML.contains ?? []) {
      if (!state.innerHTML.includes(str)) {
        throw new Error(
          `assertDomState: expected innerHTML to contain '${str}'`,
        );
      }
    }
    for (const str of expected.innerHTML.notContains ?? []) {
      if (state.innerHTML.includes(str)) {
        throw new Error(
          `assertDomState: expected innerHTML NOT to contain '${str}'`,
        );
      }
    }
  }

  if (expected.dataAttributes) {
    for (const [attr, expectedVal] of Object.entries(expected.dataAttributes)) {
      const actual = state.dataAttributes[attr];
      if (actual === undefined) {
        throw new Error(
          `assertDomState: expected data attribute '${attr}' not found`,
        );
      }
      if (typeof expectedVal === "string") {
        if (actual !== expectedVal) {
          throw new Error(
            `assertDomState: expected ${attr}='${expectedVal}', got '${actual}'`,
          );
        }
      } else if (expectedVal.contains && !actual.includes(expectedVal.contains)) {
        throw new Error(
          `assertDomState: expected ${attr} to contain '${expectedVal.contains}', got '${actual}'`,
        );
      }
    }
  }
}

/** Assert innerHTML contents of an element. */
export async function assertInnerHTML(
  selector: string,
  expected: { contains?: string[]; notContains?: string[] },
): Promise<void> {
  await assertDomState(selector, { innerHTML: expected });
}

/** Capture full DOM state of all matching elements. */
export async function captureDomState(selector: string): Promise<DomSnapshot[]> {
  return browser.execute((sel: string) => {
    const elements = document.querySelectorAll(sel);
    return Array.from(elements).map((el) => {
      const htmlEl = el as HTMLElement;
      const rect = htmlEl.getBoundingClientRect();
      return {
        selector: sel,
        tagName: el.tagName.toLowerCase(),
        attributes: Object.fromEntries(
          Array.from(el.attributes).map((a) => [a.name, a.value]),
        ),
        classList: Array.from(el.classList),
        innerHTML: el.innerHTML,
        isConnected: el.isConnected,
        boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        childCount: el.children.length,
      };
    });
  }, selector);
}
```

- [ ] **Step 2: Rodar build**

Run: `cd ~/Desktop/obsidian-plugin-e2e && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/assertions.ts
~/.claude/scripts/commit.sh "feat: adiciona assertion layer (checkComponent, assertDomState, captureDomState)"
```

### Task 6: Criar barrel export e build

**Files:**
- Create: `~/Desktop/obsidian-plugin-e2e/src/index.ts`

- [ ] **Step 1: Criar index.ts**

```typescript
// src/index.ts

export { createConfig } from "./config.js";
export type { E2EConfigOptions, DomExpectation, DomSnapshot } from "./types.js";

export {
  openFile,
  openSidebar,
  switchSidebarTab,
  executeCommand,
  focusEditor,
  scrollTo,
  waitForElement,
  waitForPlugin,
  hoverElement,
  getActiveFile,
  resetVault,
} from "./navigation.js";

export {
  checkComponent,
  checkViewport,
  saveComponent,
  assertDomState,
  assertInnerHTML,
  captureDomState,
} from "./assertions.js";
```

- [ ] **Step 2: Build completo**

Run: `cd ~/Desktop/obsidian-plugin-e2e && npm run build`
Expected: dist/ gerado com .js + .d.ts

- [ ] **Step 3: Commit**

```bash
git add src/index.ts dist/
~/.claude/scripts/commit.sh "feat: barrel export + build funcional do obsidian-plugin-e2e"
```

**Nota:** Se `dist/` for grande demais pra commitar, adicionar ao `.gitignore` e documentar que o consumer precisa rodar `npm run build` apos clonar. Decisao na hora da implementacao.

---

## Chunk 4: Integracao com Qualia Coding (proof of concept)

### Task 7: Instalar deps no Qualia Coding

**Files:**
- Modify: `obsidian-qualia-coding/package.json`

- [ ] **Step 0: Build obsidian-plugin-e2e (precisa de dist/ antes de instalar via file:)**

Run: `cd ~/Desktop/obsidian-plugin-e2e && npm run build`
Expected: dist/ gerado com .js + .d.ts

- [ ] **Step 1: Instalar obsidian-plugin-e2e + wdio deps**

Run:
```bash
cd /Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding
npm install --save-dev \
  obsidian-plugin-e2e@file:../../../../obsidian-plugin-e2e \
  wdio-obsidian-service @wdio/visual-service \
  @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter \
  wdio-obsidian-reporter @types/mocha
```

Expected: PASS — deps instaladas

- [ ] **Step 2: Adicionar npm scripts**

No `package.json`, adicionar ao `scripts`:
```json
"test:e2e": "wdio run wdio.conf.mts",
"test:visual": "wdio run wdio.conf.mts --spec test/e2e/specs/visual*.e2e.ts",
"test:visual:update": "npx wdio run wdio.conf.mts -- --update-visual-baseline"
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
~/.claude/scripts/commit.sh "chore: adiciona deps de e2e testing (wdio + obsidian-plugin-e2e)"
```

### Task 8: Criar wdio.conf.mts + test vault

**Files:**
- Create: `obsidian-qualia-coding/wdio.conf.mts`
- Create: `obsidian-qualia-coding/test/e2e/vaults/visual/.obsidian/app.json`
- Create: `obsidian-qualia-coding/test/e2e/vaults/visual/.obsidian/community-plugins.json`
- Create: `obsidian-qualia-coding/test/e2e/vaults/visual/Sample Coded.md`

- [ ] **Step 1: Criar wdio.conf.mts**

```typescript
// wdio.conf.mts
import { createConfig } from "obsidian-plugin-e2e";

export const config = createConfig({
  pluginId: "qualia-coding",
  pluginDir: ".",
  vault: "test/e2e/vaults/visual",
  specs: ["test/e2e/specs/**/*.e2e.ts"],
});
```

- [ ] **Step 2: Criar vault de teste**

```json
// test/e2e/vaults/visual/.obsidian/app.json
{
  "showInlineTitle": true,
  "showLineNumber": false
}
```

```json
// test/e2e/vaults/visual/.obsidian/community-plugins.json
["qualia-coding"]
```

```markdown
// test/e2e/vaults/visual/Sample Coded.md
# Sample Document for Visual Testing

This is a sample document used for end-to-end visual testing of the Qualia Coding plugin.

## Section One

The quick brown fox jumps over the lazy dog. This paragraph contains enough text
to create meaningful code markers spanning multiple lines. Qualitative data analysis
requires careful reading and interpretation of textual data.

## Section Two

Another section with different content. Researchers often code passages that reveal
themes, patterns, or categories in their data. This process of coding is central
to qualitative research methodology.

## Section Three

A final section for testing scroll behavior and multi-section markers. The margin
panel should display coded segments alongside the text, with colored bars indicating
which codes have been applied to each passage.
```

- [ ] **Step 3: Commit**

```bash
git add wdio.conf.mts test/e2e/vaults/
~/.claude/scripts/commit.sh "feat: adiciona wdio.conf.mts e vault de teste para e2e visual"
```

### Task 9: Criar helper e smoke test

**Files:**
- Create: `obsidian-qualia-coding/test/e2e/helpers/qualia.ts`
- Create: `obsidian-qualia-coding/test/e2e/specs/smoke.e2e.ts`

- [ ] **Step 1: Criar helper de injecao**

```typescript
// test/e2e/helpers/qualia.ts
import { waitForPlugin } from "obsidian-plugin-e2e";

export async function injectQualiaData(data: Record<string, unknown>): Promise<void> {
  await waitForPlugin("qualia-coding");
  await browser.execute((d: Record<string, unknown>) => {
    const plugin = (window as any).app.plugins.plugins["qualia-coding"];
    plugin.saveData({ ...plugin.settings, ...d });
    plugin.markdownModel?.loadMarkers();
  }, data);
  await browser.pause(2000);
}

export function mkMarker(
  id: string,
  fromLine: number,
  fromCh: number,
  toLine: number,
  toCh: number,
  codes: string[],
  color = "#6200EE",
) {
  return {
    markerType: "markdown",
    id,
    fileId: "Sample Coded.md",
    range: { from: { line: fromLine, ch: fromCh }, to: { line: toLine, ch: toCh } },
    color,
    codes,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const SELECTORS = {
  marginPanel: ".codemarker-margin-panel",
  marginBar: ".codemarker-margin-line",
  marginLabel: ".codemarker-margin-label",
  marginDot: ".codemarker-margin-dot",
  highlight: ".codemarker-highlight",
  handleOverlay: ".codemarker-handle-overlay",
  handleSvg: ".codemarker-handle-svg",
  explorer: ".codemarker-explorer",
} as const;
```

- [ ] **Step 2: Criar smoke test**

```typescript
// test/e2e/specs/smoke.e2e.ts
import { openFile, waitForPlugin, waitForElement, getActiveFile } from "obsidian-plugin-e2e";

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
```

- [ ] **Step 3: Rodar smoke test**

Run: `cd /Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding && npm run test:e2e -- --spec test/e2e/specs/smoke.e2e.ts`

Expected: Obsidian abre, plugin carrega, arquivo abre, testes passam.

**Nota:** Se o primeiro run falhar, ler o erro e ajustar. Problemas comuns: path do vault errado, plugin nao instalado, timeout curto. Iterar ate passar.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/
~/.claude/scripts/commit.sh "test: adiciona smoke test e2e — plugin carrega, arquivo abre"
```

### Task 10: Criar margin panel visual test

**Files:**
- Create: `obsidian-qualia-coding/test/e2e/specs/margin-panel.e2e.ts`

- [ ] **Step 1: Criar spec do margin panel**

```typescript
// test/e2e/specs/margin-panel.e2e.ts
import {
  openFile,
  focusEditor,
  waitForElement,
  checkComponent,
  assertDomState,
  hoverElement,
} from "obsidian-plugin-e2e";
import { injectQualiaData, mkMarker, SELECTORS } from "../helpers/qualia.js";

describe("margin panel", () => {
  before(async () => {
    const markers = {
      "Sample Coded.md": [
        mkMarker("m1", 4, 0, 5, 50, ["Emotion"], "#6200EE"),
        mkMarker("m2", 8, 0, 9, 40, ["Theme"], "#FF5722"),
      ],
    };
    const codeDefinitions = [
      { name: "Emotion", color: "#6200EE", description: "" },
      { name: "Theme", color: "#FF5722", description: "" },
    ];
    await injectQualiaData({ markers, codeDefinitions });
    await openFile("Sample Coded.md");
    await focusEditor();
    await waitForElement(SELECTORS.marginPanel, 10000);
  });

  it("renders margin bars for coded segments", async () => {
    await assertDomState(SELECTORS.marginPanel, {
      visible: true,
      childCount: { min: 2 },
    });
  });

  it("margin bars have correct CSS classes", async () => {
    await assertDomState(SELECTORS.marginBar, {
      classList: { contains: ["codemarker-margin-line"] },
    });
  });

  it("visual baseline — margin panel with 2 markers", async () => {
    const mismatch = await checkComponent(
      SELECTORS.marginPanel,
      "margin-2markers",
    );
    expect(mismatch).toBeLessThan(1);
  });

  it("hover highlights bar", async () => {
    await hoverElement(SELECTORS.marginBar);
    const mismatch = await checkComponent(
      SELECTORS.marginPanel,
      "margin-hover",
    );
    expect(mismatch).toBeLessThan(2);
  });
});
```

- [ ] **Step 2: Rodar test**

Run: `npm run test:e2e -- --spec test/e2e/specs/margin-panel.e2e.ts`

Expected: Primeiro run cria baselines (autoSaveBaseline: true). Segundo run compara.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/specs/margin-panel.e2e.ts
~/.claude/scripts/commit.sh "test: adiciona visual tests do margin panel (baseline + hover)"
```

---

## Verificacao final

- `~/Desktop/obsidian-plugin-e2e/`: repo independente com 5 source files, build funcional
- `obsidian-qualia-coding/`: wdio.conf.mts + vault + helper + 2 spec files
- `npm run test:e2e` no qualia-coding abre Obsidian, roda smoke + margin panel specs
- Screenshots em `test/e2e/screenshots/` (baseline + actual)
- Nenhum boilerplate duplicado — tudo via `obsidian-plugin-e2e`

## Notas importantes

- O primeiro `npm run test:e2e` baixa Obsidian (~200MB) e leva ~2min. Runs subsequentes sao mais rapidos (~30-60s)
- Screenshots sao resolution-dependent — rodar baseline e comparison na mesma maquina
- O `wdio-obsidian-service` cria vault sandbox — nao afeta o vault real
- `browser.execute()` nao suporta async/await — tudo sincrono + `browser.pause()`
- Se tsc reclamar de `browser` global, adicionar `"types": ["wdio-obsidian-service"]` no tsconfig dos specs
- O `dist/` do obsidian-plugin-e2e precisa estar buildado antes de rodar os testes do consumer. Workflow: `cd obsidian-plugin-e2e && npm run build`, depois `cd qualia-coding && npm run test:e2e`
- Para Mirror Notes: mesmo pattern — criar `wdio.conf.mts`, vault, helper, specs. O pacote compartilhado ja esta pronto.
