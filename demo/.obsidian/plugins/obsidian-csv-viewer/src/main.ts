import { Plugin } from "obsidian";
import { CsvView, CSV_VIEW_TYPE } from "./csvView";

export default class CsvViewerPlugin extends Plugin {
  async onload() {
    console.log('[obsidian-csv-viewer] v28.2 loaded — Info bar + column toggle + header tag button');
    this.registerView(CSV_VIEW_TYPE, (leaf) => new CsvView(leaf));
    this.registerExtensions(["csv"], CSV_VIEW_TYPE);
  }

  onunload() {}
}
