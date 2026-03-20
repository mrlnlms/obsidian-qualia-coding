import { waitForPlugin } from "obsidian-e2e-visual-test-kit";

/**
 * Inject markers and code definitions into the Qualia Coding plugin.
 * Writes directly to dataManager sections, then reloads the markdown model.
 */
export async function injectQualiaData(opts: {
  markers?: Record<string, unknown[]>;
  codeDefinitions?: Array<{ name: string; color: string; description?: string }>;
}): Promise<void> {
  await waitForPlugin("qualia-coding");
  await browser.execute((o: typeof opts) => {
    const plugin = (window as any).app.plugins.plugins["qualia-coding"];
    const dm = plugin.dataManager;

    // Clear existing data to prevent accumulation between runs
    plugin.sharedRegistry.clear();
    dm.setSection("markdown", { markers: {} });

    // Inject code definitions into registry
    if (o.codeDefinitions) {
      for (const def of o.codeDefinitions) {
        plugin.sharedRegistry.create(def.name, def.color, def.description ?? "");
      }
    }

    // Inject markers into markdown section
    if (o.markers) {
      const mdData = dm.section("markdown");
      mdData.markers = o.markers;
      dm.setSection("markdown", mdData);
    }

    // Reload markdown model to pick up new markers
    plugin.markdownModel?.loadMarkers();
  }, opts);
  await browser.pause(1000);
}

/**
 * Force CM6 to rebuild decorations for all injected marker files.
 * Call AFTER openFile + focusEditor — dispatches setFileIdEffect + updateFileMarkersEffect
 * directly to the EditorView, bypassing the ViewPlugin's async identification.
 */
export async function refreshEditorDecorations(fileIds: string[]): Promise<void> {
  await browser.execute((ids: string[]) => {
    const plugin = (window as any).app.plugins.plugins["qualia-coding"];

    for (const fileId of ids) {
      const leaves = plugin.app.workspace.getLeavesOfType("markdown");
      for (const leaf of leaves) {
        const view = leaf.view as any;
        if (view.file?.path === fileId && view.editor?.cm) {
          const editorView = view.editor.cm;
          const effects: any[] = [];
          if (plugin.setFileIdEffect) {
            effects.push(plugin.setFileIdEffect.of({ fileId }));
          }
          if (plugin.updateFileMarkersEffect) {
            effects.push(plugin.updateFileMarkersEffect.of({ fileId }));
          }
          if (effects.length > 0) {
            editorView.dispatch({ effects });
          }
          break;
        }
      }
    }
  }, fileIds);
  await browser.pause(1000);
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
  hoverTooltip: ".cm-tooltip",
  codingMenu: ".codemarker-coding-menu",
  analyticsView: ".codemarker-analytics-view",
  analyticsToolbar: ".codemarker-analytics-toolbar",
  analyticsChart: ".codemarker-chart-container",
  configPanel: ".codemarker-config-panel",
  codeExplorer: ".codemarker-code-explorer",
  codeDetail: ".codemarker-detail-panel",
  treeItem: ".tree-item-self",
} as const;
