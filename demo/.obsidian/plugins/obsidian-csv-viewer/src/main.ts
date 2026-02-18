import { Plugin } from "obsidian";
import { CsvView, CSV_VIEW_TYPE } from "./csvView";
import { CodingModel } from "./coding/codingModel";
import { CsvCodeExplorerView, CSV_CODE_EXPLORER_VIEW_TYPE } from "./views/csvCodeExplorerView";

export default class CsvViewerPlugin extends Plugin {
  model: CodingModel;

  async onload() {
    console.log('[obsidian-csv-viewer] v28.5 loaded — Comment column + clickable chips + fix rowIndex');
    // Initialize coding model
    this.model = new CodingModel(this);
    await this.model.load();

    // CSV file view
    this.registerView(CSV_VIEW_TYPE, (leaf) => new CsvView(leaf, this));
    this.registerExtensions(["csv"], CSV_VIEW_TYPE);

    // Side panel views
    this.registerView(CSV_CODE_EXPLORER_VIEW_TYPE, (leaf) => new CsvCodeExplorerView(leaf, this.model));

    // Ribbon icon
    this.addRibbonIcon('tags', 'CSV Code Explorer', () => {
      this.activateCodeExplorer();
    });

    // Commands
    this.addCommand({
      id: 'open-csv-code-explorer',
      name: 'Open Code Explorer',
      callback: () => this.activateCodeExplorer(),
    });

    this.addCommand({
      id: 'open-csv-code-list',
      name: 'Open Code List',
      callback: () => this.revealCodeExplorer(),
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(CSV_CODE_EXPLORER_VIEW_TYPE);
  }

  async activateCodeExplorer() {
    const leaves = this.app.workspace.getLeavesOfType(CSV_CODE_EXPLORER_VIEW_TYPE);
    const existing = leaves[0];
    if (existing) {
      this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: CSV_CODE_EXPLORER_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async revealCodeExplorer(): Promise<void> {
    const cmPlugin = (this.app as any).plugins?.plugins?.['obsidian-codemarker-v2'];
    if (cmPlugin?.revealCodeExplorer) {
      await cmPlugin.revealCodeExplorer();
    }
  }

  async revealCodeDetailPanel(markerId: string, codeName: string): Promise<void> {
    const cmPlugin = (this.app as any).plugins?.plugins?.['obsidian-codemarker-v2'];
    if (cmPlugin?.revealCodeDetailPanel) {
      await cmPlugin.revealCodeDetailPanel(markerId, codeName);
    }
  }
}
