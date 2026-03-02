import type { App } from "obsidian";
import type QualiaCodingPlugin from "../main";
import { ANALYTICS_VIEW_TYPE, AnalyticsView } from "./views/analyticsView";
import { BOARD_VIEW_TYPE, BoardView } from "./views/boardView";
import { readAllData } from "./data/dataReader";
import { consolidate } from "./data/dataConsolidator";
import type { ConsolidatedData } from "./data/dataTypes";

/**
 * Interface the analytics views use to access plugin functionality.
 * Avoids circular imports by keeping views decoupled from the plugin class.
 */
export interface AnalyticsPluginAPI {
  app: App;
  data: ConsolidatedData | null;
  loadConsolidatedData(): Promise<ConsolidatedData>;
  addChartToBoard(title: string, dataUrl: string, viewMode: string): Promise<void>;
  addKpiCardToBoard(value: string, label: string, accent: string): Promise<void>;
  addCodeCardToBoard(codeName: string, color: string, description: string, markerCount: number, sources: string[]): Promise<void>;
  addExcerptToBoard(text: string, file: string, source: string, location: string, codes: string[], codeColors: string[]): Promise<void>;
}

export function registerAnalyticsEngine(plugin: QualiaCodingPlugin): () => void {
  const api: AnalyticsPluginAPI = {
    app: plugin.app,
    data: null,

    async loadConsolidatedData(): Promise<ConsolidatedData> {
      const raw = readAllData(plugin.dataManager);
      api.data = consolidate(
        raw.markdown,
        raw.csv,
        raw.image,
        raw.pdf,
        raw.audio,
        raw.video,
      );
      return api.data;
    },

    async addChartToBoard(title: string, dataUrl: string, viewMode: string): Promise<void> {
      await activateBoard();
      await new Promise((r) => setTimeout(r, 100));
      const leaves = plugin.app.workspace.getLeavesOfType(BOARD_VIEW_TYPE);
      if (leaves.length > 0) {
        const boardView = leaves[0]!.view as BoardView;
        await boardView.addSnapshot(title, dataUrl, viewMode);
      }
    },

    async addKpiCardToBoard(value: string, label: string, accent: string): Promise<void> {
      await activateBoard();
      await new Promise((r) => setTimeout(r, 100));
      const leaves = plugin.app.workspace.getLeavesOfType(BOARD_VIEW_TYPE);
      if (leaves.length > 0) {
        (leaves[0]!.view as BoardView).addKpiCard(value, label, accent);
      }
    },

    async addCodeCardToBoard(codeName: string, color: string, description: string, markerCount: number, sources: string[]): Promise<void> {
      await activateBoard();
      await new Promise((r) => setTimeout(r, 100));
      const leaves = plugin.app.workspace.getLeavesOfType(BOARD_VIEW_TYPE);
      if (leaves.length > 0) {
        (leaves[0]!.view as BoardView).addCodeCard(codeName, color, description, markerCount, sources);
      }
    },

    async addExcerptToBoard(text: string, file: string, source: string, location: string, codes: string[], codeColors: string[]): Promise<void> {
      await activateBoard();
      await new Promise((r) => setTimeout(r, 100));
      const leaves = plugin.app.workspace.getLeavesOfType(BOARD_VIEW_TYPE);
      if (leaves.length > 0) {
        (leaves[0]!.view as BoardView).addExcerpt(text, file, source, location, codes, codeColors);
      }
    },
  };

  // Register views
  plugin.registerView(
    ANALYTICS_VIEW_TYPE,
    (leaf) => new AnalyticsView(leaf, api),
  );
  plugin.registerView(
    BOARD_VIEW_TYPE,
    (leaf) => new BoardView(leaf, api),
  );

  // Commands
  plugin.addCommand({
    id: "open-analytics",
    name: "Open Analytics",
    callback: () => activateView(),
  });
  plugin.addCommand({
    id: "refresh-analytics",
    name: "Refresh Analytics Data",
    callback: () => refreshData(),
  });
  plugin.addCommand({
    id: "open-board",
    name: "Open Research Board",
    callback: () => activateBoard(),
  });

  async function activateView(): Promise<void> {
    const existing = plugin.app.workspace.getLeavesOfType(ANALYTICS_VIEW_TYPE);
    if (existing.length > 0) {
      plugin.app.workspace.revealLeaf(existing[0]!);
      return;
    }
    const leaf = plugin.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: ANALYTICS_VIEW_TYPE });
    plugin.app.workspace.revealLeaf(leaf);
  }

  async function activateBoard(): Promise<void> {
    const existing = plugin.app.workspace.getLeavesOfType(BOARD_VIEW_TYPE);
    if (existing.length > 0) {
      plugin.app.workspace.revealLeaf(existing[0]!);
      return;
    }
    const leaf = plugin.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: BOARD_VIEW_TYPE });
    plugin.app.workspace.revealLeaf(leaf);
  }

  async function refreshData(): Promise<void> {
    await api.loadConsolidatedData();
    const leaves = plugin.app.workspace.getLeavesOfType(ANALYTICS_VIEW_TYPE);
    for (const leaf of leaves) {
      (leaf.view as AnalyticsView).onDataRefreshed();
    }
  }

  // Cleanup
  return () => {
    plugin.app.workspace.detachLeavesOfType(ANALYTICS_VIEW_TYPE);
    plugin.app.workspace.detachLeavesOfType(BOARD_VIEW_TYPE);
  };
}
