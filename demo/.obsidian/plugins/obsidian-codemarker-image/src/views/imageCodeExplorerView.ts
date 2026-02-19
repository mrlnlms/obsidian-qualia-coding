/**
 * ImageCodeExplorerView — 3-level tree: Code → File → Region
 * Follows the same pattern as CsvCodeExplorerView.
 */

import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type { ImageCodingModel } from "../coding/imageCodingModel";
import type { ImageMarker } from "../coding/imageCodingTypes";

export const IMAGE_CODE_EXPLORER_VIEW_TYPE = "codemarker-image-explorer";

interface CollapsibleNode {
  treeItem: HTMLElement;
  children: HTMLElement;
  collapsed: boolean;
}

export class ImageCodeExplorerView extends ItemView {
  private model: ImageCodingModel;
  private codeNodes: CollapsibleNode[] = [];
  private fileNodes: CollapsibleNode[] = [];
  private changeListener: () => void;

  constructor(leaf: WorkspaceLeaf, model: ImageCodingModel) {
    super(leaf);
    this.model = model;
    this.changeListener = () => this.render();
  }

  getViewType(): string {
    return IMAGE_CODE_EXPLORER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Image Code Explorer";
  }

  getIcon(): string {
    return "tags";
  }

  async onOpen(): Promise<void> {
    this.model.onChange(this.changeListener);
    this.render();
  }

  async onClose(): Promise<void> {
    this.model.offChange(this.changeListener);
    this.contentEl.empty();
  }

  /** Build index: codeName → fileId → ImageMarker[] */
  private buildCodeIndex(): Map<string, Map<string, ImageMarker[]>> {
    const index = new Map<string, Map<string, ImageMarker[]>>();
    const allMarkers = this.model.getAllMarkers();

    for (const marker of allMarkers) {
      for (const codeName of marker.codes) {
        let fileMap = index.get(codeName);
        if (!fileMap) {
          fileMap = new Map();
          index.set(codeName, fileMap);
        }
        let markers = fileMap.get(marker.file);
        if (!markers) {
          markers = [];
          fileMap.set(marker.file, markers);
        }
        markers.push(marker);
      }
    }

    return index;
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("codemarker-image-explorer");
    this.codeNodes = [];
    this.fileNodes = [];

    const codeIndex = this.buildCodeIndex();

    // Toolbar
    const toolbar = contentEl.createDiv({ cls: "codemarker-explorer-toolbar" });

    const allBtn = toolbar.createDiv({
      cls: "codemarker-toolbar-btn",
      attr: { "aria-label": "Expand/Collapse All", title: "Expand/Collapse All" },
    });
    setIcon(allBtn, "chevrons-down-up");
    let allExpanded = true;
    allBtn.addEventListener("click", () => {
      if (allExpanded) {
        this.collapseAll();
      } else {
        this.expandAll();
      }
      allExpanded = !allExpanded;
    });

    const filesBtn = toolbar.createDiv({
      cls: "codemarker-toolbar-btn",
      attr: { "aria-label": "Expand/Collapse Files", title: "Expand/Collapse Files" },
    });
    setIcon(filesBtn, "folder");
    let filesExpanded = true;
    filesBtn.addEventListener("click", () => {
      if (filesExpanded) {
        this.collapseFiles();
      } else {
        // Auto-expand codes if collapsed
        for (const node of this.codeNodes) {
          if (node.collapsed) this.toggleNode(node);
        }
        this.expandFiles();
      }
      filesExpanded = !filesExpanded;
    });

    const refreshBtn = toolbar.createDiv({
      cls: "codemarker-toolbar-btn",
      attr: { "aria-label": "Refresh", title: "Refresh" },
    });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.render());

    // Tree
    const tree = contentEl.createDiv({ cls: "codemarker-explorer-tree" });

    if (codeIndex.size === 0) {
      tree.createDiv({ cls: "codemarker-explorer-empty", text: "No coded regions yet." });
      return;
    }

    // Sort codes alphabetically
    const sortedCodes = Array.from(codeIndex.keys()).sort((a, b) => a.localeCompare(b));

    for (const codeName of sortedCodes) {
      const fileMap = codeIndex.get(codeName)!;
      const def = this.model.registry.getByName(codeName);
      const totalCount = Array.from(fileMap.values()).reduce((sum, m) => sum + m.length, 0);

      // Code node (level 1)
      const codeItem = tree.createDiv({ cls: "codemarker-tree-item codemarker-tree-code" });
      const codeHeader = codeItem.createDiv({ cls: "codemarker-tree-header" });

      const codeChevron = codeHeader.createDiv({ cls: "codemarker-tree-chevron" });
      setIcon(codeChevron, "chevron-down");

      const swatch = codeHeader.createDiv({ cls: "codemarker-tree-swatch" });
      swatch.style.backgroundColor = def?.color ?? "#6200EE";

      codeHeader.createSpan({ text: codeName, cls: "codemarker-tree-label" });
      codeHeader.createSpan({ text: `${totalCount}`, cls: "codemarker-tree-count" });

      const codeChildren = codeItem.createDiv({ cls: "codemarker-tree-children" });
      const codeNode: CollapsibleNode = { treeItem: codeItem, children: codeChildren, collapsed: false };
      this.codeNodes.push(codeNode);

      codeHeader.addEventListener("click", () => this.toggleNode(codeNode));

      // File nodes (level 2)
      const sortedFiles = Array.from(fileMap.keys()).sort();

      for (const fileId of sortedFiles) {
        const markers = fileMap.get(fileId)!;
        const fileName = fileId.split("/").pop() ?? fileId;

        const fileItem = codeChildren.createDiv({ cls: "codemarker-tree-item codemarker-tree-file" });
        const fileHeader = fileItem.createDiv({ cls: "codemarker-tree-header" });

        const fileChevron = fileHeader.createDiv({ cls: "codemarker-tree-chevron" });
        setIcon(fileChevron, "chevron-down");

        setIcon(fileHeader.createDiv({ cls: "codemarker-tree-file-icon" }), "image");
        fileHeader.createSpan({ text: fileName, cls: "codemarker-tree-label" });
        fileHeader.createSpan({ text: `${markers.length}`, cls: "codemarker-tree-count" });

        const fileChildren = fileItem.createDiv({ cls: "codemarker-tree-children" });
        const fileNode: CollapsibleNode = { treeItem: fileItem, children: fileChildren, collapsed: false };
        this.fileNodes.push(fileNode);

        fileHeader.addEventListener("click", () => this.toggleNode(fileNode));

        // Marker nodes (level 3)
        for (const marker of markers) {
          const markerEl = fileChildren.createDiv({ cls: "codemarker-tree-item codemarker-tree-marker" });
          const shapeLabel = marker.shape.charAt(0).toUpperCase() + marker.shape.slice(1);
          const codesText = marker.codes.join(", ");
          markerEl.createSpan({ text: `${shapeLabel}`, cls: "codemarker-tree-shape" });
          markerEl.createSpan({ text: codesText, cls: "codemarker-tree-codes-preview" });

          markerEl.addEventListener("click", () => {
            this.navigateToRegion(marker);
          });
        }
      }
    }
  }

  private navigateToRegion(marker: ImageMarker): void {
    this.app.workspace.trigger("codemarker-image:navigate", {
      file: marker.file,
      markerId: marker.id,
    });
  }

  private toggleNode(node: CollapsibleNode): void {
    node.collapsed = !node.collapsed;
    node.children.style.display = node.collapsed ? "none" : "";
    const chevron = node.treeItem.querySelector(".codemarker-tree-chevron");
    if (chevron) {
      chevron.empty();
      setIcon(chevron as HTMLElement, node.collapsed ? "chevron-right" : "chevron-down");
    }
  }

  private expandAll(): void {
    for (const node of this.codeNodes) {
      if (node.collapsed) this.toggleNode(node);
    }
  }

  private collapseAll(): void {
    for (const node of this.codeNodes) {
      if (!node.collapsed) this.toggleNode(node);
    }
  }

  private expandFiles(): void {
    for (const node of this.fileNodes) {
      if (node.collapsed) this.toggleNode(node);
    }
  }

  private collapseFiles(): void {
    for (const node of this.fileNodes) {
      if (!node.collapsed) this.toggleNode(node);
    }
  }
}
