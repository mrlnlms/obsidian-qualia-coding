import { Menu, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { IMAGE_CODING_VIEW_TYPE, ImageCodingView } from "./imageView";
import { ImageCodingModel } from "./coding/imageCodingModel";
import {
  IMAGE_CODE_EXPLORER_VIEW_TYPE,
  ImageCodeExplorerView,
} from "./views/imageCodeExplorerView";
import {
  IMAGE_CODE_DETAIL_VIEW_TYPE,
  ImageCodeDetailView,
} from "./views/imageCodeDetailView";

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "webp", "avif", "svg",
]);

export default class CodeMarkerImagePlugin extends Plugin {
  model!: ImageCodingModel;

  async onload(): Promise<void> {
    console.log('[codemarker-image] v34.3 loaded — Sidebar views Explorer + Detail');
    this.model = new ImageCodingModel(this);
    await this.model.load();

    // Main image view
    this.registerView(
      IMAGE_CODING_VIEW_TYPE,
      (leaf) => new ImageCodingView(leaf, this)
    );

    // Sidebar views
    this.registerView(
      IMAGE_CODE_EXPLORER_VIEW_TYPE,
      (leaf) => new ImageCodeExplorerView(leaf, this.model)
    );
    this.registerView(
      IMAGE_CODE_DETAIL_VIEW_TYPE,
      (leaf) => new ImageCodeDetailView(leaf, this.model)
    );

    // File menu
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

    // Commands
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

    this.addCommand({
      id: "open-image-code-explorer",
      name: "Open Image Code Explorer",
      callback: () => this.activateExplorer(),
    });

    this.addCommand({
      id: "open-image-code-list",
      name: "Open Image Code List",
      callback: () => this.activateDetailPanel(),
    });

    // Navigation event: sidebar → canvas
    this.registerEvent(
      (this.app.workspace as any).on("codemarker-image:navigate", (data: any) => {
        this.handleNavigation(data.file, data.markerId);
      })
    );
  }

  async openImageCoding(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: IMAGE_CODING_VIEW_TYPE,
      state: { file: file.path },
    });
    this.app.workspace.revealLeaf(leaf);
  }

  async activateExplorer(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(IMAGE_CODE_EXPLORER_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: IMAGE_CODE_EXPLORER_VIEW_TYPE });
    this.app.workspace.revealLeaf(leaf);
  }

  async activateDetailPanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(IMAGE_CODE_DETAIL_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: IMAGE_CODE_DETAIL_VIEW_TYPE });
    this.app.workspace.revealLeaf(leaf);
  }

  async revealDetailPanel(markerId: string, codeName: string): Promise<void> {
    let leaf: WorkspaceLeaf;
    const existing = this.app.workspace.getLeavesOfType(IMAGE_CODE_DETAIL_VIEW_TYPE);
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      const newLeaf = this.app.workspace.getRightLeaf(false);
      if (!newLeaf) return;
      leaf = newLeaf;
      await leaf.setViewState({ type: IMAGE_CODE_DETAIL_VIEW_TYPE });
    }
    const view = leaf.view as ImageCodeDetailView;
    view.setContext(markerId, codeName);
    // Don't revealLeaf on update — avoids focus steal
  }

  private async handleNavigation(file: string, markerId: string): Promise<void> {
    // Ensure the image is open in a coding view
    const imageLeavesOfType = this.app.workspace.getLeavesOfType(IMAGE_CODING_VIEW_TYPE);
    let imageLeaf = imageLeavesOfType.find((l) => {
      const state = l.getViewState();
      return state?.state?.file === file;
    });

    if (!imageLeaf) {
      const tfile = this.app.vault.getAbstractFileByPath(file);
      if (tfile instanceof TFile) {
        await this.openImageCoding(tfile);
        // Re-find the leaf
        const leaves = this.app.workspace.getLeavesOfType(IMAGE_CODING_VIEW_TYPE);
        imageLeaf = leaves.find((l) => l.getViewState()?.state?.file === file);
      }
    }

    if (imageLeaf) {
      this.app.workspace.revealLeaf(imageLeaf);
      const view = imageLeaf.view as ImageCodingView;
      view.highlightRegion(markerId);
    }
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(IMAGE_CODING_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(IMAGE_CODE_EXPLORER_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(IMAGE_CODE_DETAIL_VIEW_TYPE);
  }
}
