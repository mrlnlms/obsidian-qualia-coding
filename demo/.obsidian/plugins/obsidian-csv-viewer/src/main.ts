import { Plugin } from "obsidian";
import { CsvView, CSV_VIEW_TYPE } from "./csvView";

export default class CsvViewerPlugin extends Plugin {
  async onload() {
    console.log('[CSV Viewer] v28.1 loaded — Initial CSV Viewer with AG Grid');
    this.registerView(CSV_VIEW_TYPE, (leaf) => new CsvView(leaf));
    this.registerExtensions(["csv"], CSV_VIEW_TYPE);
  }

  onunload() {}
}
