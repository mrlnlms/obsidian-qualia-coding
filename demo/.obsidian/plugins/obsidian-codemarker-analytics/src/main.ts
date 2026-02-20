import { Plugin } from "obsidian";
import { ANALYTICS_VIEW_TYPE, AnalyticsView } from "./views/analyticsView";
import { readMarkdownData, readCsvData, readImageData, readPdfData, readAudioData, readVideoData } from "./data/dataReader";
import { consolidate } from "./data/dataConsolidator";
import type { ConsolidatedData } from "./data/dataTypes";

export default class CodeMarkerAnalyticsPlugin extends Plugin {
  data: ConsolidatedData | null = null;

  async onload(): Promise<void> {
    console.log('[codemarker-analytics] v38.7 loaded — Jaccard + Text Stats + Dendro + Lag Seq');
    this.registerView(
      ANALYTICS_VIEW_TYPE,
      (leaf) => new AnalyticsView(leaf, this)
    );

    this.addCommand({
      id: "open-analytics",
      name: "Open CodeMarker Analytics",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "refresh-analytics",
      name: "Refresh Analytics Data",
      callback: () => this.refreshData(),
    });
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(ANALYTICS_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: ANALYTICS_VIEW_TYPE });
    this.app.workspace.revealLeaf(leaf);
  }

  async loadConsolidatedData(): Promise<ConsolidatedData> {
    const [md, csv, img, pdf, audio, video] = await Promise.all([
      readMarkdownData(this.app.vault),
      readCsvData(this.app.vault),
      readImageData(this.app.vault),
      readPdfData(this.app.vault),
      readAudioData(this.app.vault),
      readVideoData(this.app.vault),
    ]);
    this.data = consolidate(md, csv, img, pdf, audio, video);
    return this.data;
  }

  private async refreshData(): Promise<void> {
    await this.loadConsolidatedData();
    // Notify open views
    const leaves = this.app.workspace.getLeavesOfType(ANALYTICS_VIEW_TYPE);
    for (const leaf of leaves) {
      (leaf.view as AnalyticsView).onDataRefreshed();
    }
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(ANALYTICS_VIEW_TYPE);
  }
}
