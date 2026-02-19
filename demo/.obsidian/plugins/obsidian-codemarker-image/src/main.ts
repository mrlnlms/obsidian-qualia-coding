import { Menu, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { IMAGE_CODING_VIEW_TYPE, ImageCodingView } from "./imageView";
import { ImageCodingModel } from "./coding/imageCodingModel";

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "avif",
  "svg",
]);

export default class CodeMarkerImagePlugin extends Plugin {
  model!: ImageCodingModel;

  async onload(): Promise<void> {
    console.log('[CodeMarker Image] v34.2 loaded — Coding menu + region labels + hover glow');
    this.model = new ImageCodingModel(this);
    await this.model.load();

    this.registerView(
      IMAGE_CODING_VIEW_TYPE,
      (leaf) => new ImageCodingView(leaf, this)
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (!(file instanceof TFile)) return;
        if (!IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) return;

        menu.addItem((item) => {
          item
            .setTitle("Open in CodeMarker Image")
            .setIcon("image")
            .onClick(() => this.openImageCoding(file));
        });
      })
    );

    this.addCommand({
      id: "open-image-coding",
      name: "Open current image in CodeMarker Image",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !IMAGE_EXTENSIONS.has(file.extension.toLowerCase()))
          return false;
        if (!checking) this.openImageCoding(file);
        return true;
      },
    });
  }

  async openImageCoding(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");

    await leaf.setViewState({
      type: IMAGE_CODING_VIEW_TYPE,
      state: { file: file.path },
    });

    this.app.workspace.revealLeaf(leaf);
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(IMAGE_CODING_VIEW_TYPE);
  }
}
