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
