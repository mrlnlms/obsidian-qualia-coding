
import { Menu } from "obsidian";
import type { Canvas, FabricObject } from "fabric";
import { isStickyNote, isSnapshotNode, isExcerptNode, isCodeCardNode, isKpiCardNode, isClusterFrame, setStickyColor, STICKY_COLORS } from "../board/boardNodes";
import { isArrow, removeArrowById } from "../board/boardArrows";
import { isArrowLineNode, isArrowHeadNode } from "../board/boardTypes";

/**
 * Shows the right-click context menu for board nodes.
 * Returns true if a menu was shown, false otherwise.
 */
export function showBoardContextMenu(
  e: MouseEvent,
  target: FabricObject,
  canvas: Canvas,
  scheduleSave: () => void,
): boolean {
  const isSticky = isStickyNote(target);
  const isSnapshot = isSnapshotNode(target);
  const isExcerpt = isExcerptNode(target);
  const isCodeCard = isCodeCardNode(target);
  const isKpi = isKpiCardNode(target);
  const isCluster = isClusterFrame(target);
  const isArrowObj = isArrow(target);
  if (!isSticky && !isSnapshot && !isExcerpt && !isCodeCard && !isKpi && !isCluster && !isArrowObj) return false;

  e.preventDefault();
  e.stopPropagation();

  const menu = new Menu();
  // Color submenu (sticky notes only)
  if (isSticky) {
    for (const [key, hex] of Object.entries(STICKY_COLORS)) {
      menu.addItem((item) => {
        item.setTitle(key.charAt(0).toUpperCase() + key.slice(1));
        item.onClick(() => {
          setStickyColor(target as import("fabric").Group, key);
          scheduleSave();
        });
      });
    }
    menu.addSeparator();
  }
  menu.addItem((item) => {
    item.setTitle("Delete");
    item.setIcon("trash-2");
    item.onClick(() => {
      if (isArrowLineNode(target)) {
        removeArrowById(canvas, target.boardId);
      } else if (isArrowHeadNode(target)) {
        removeArrowById(canvas, target.boardId);
      } else {
        canvas.remove(target);
      }
      canvas.requestRenderAll();
      scheduleSave();
    });
  });

  menu.showAtPosition({ x: e.pageX, y: e.pageY });
  return true;
}
