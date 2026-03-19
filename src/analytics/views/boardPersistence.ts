
import type { Canvas } from "fabric";
import type { DataAdapter } from "obsidian";
import { serializeBoard, deserializeBoard, type BoardFileData } from "../board/boardData";
import { createStickyNote, createSnapshotNode, createExcerptNode, createCodeCardNode, createKpiCardNode, createClusterFrame, type StickyNoteData, type SnapshotNodeData, type ExcerptNodeData, type CodeCardNodeData, type KpiCardNodeData, type ClusterFrameData } from "../board/boardNodes";
import { createArrow, type ArrowData } from "../board/boardArrows";
import { isBoardNode } from "../board/boardTypes";

const BOARD_FILE = ".obsidian/plugins/qualia-coding/board.json";

export async function saveBoard(canvas: Canvas, adapter: DataAdapter): Promise<void> {
  const data = serializeBoard(canvas);
  const json = JSON.stringify(data, null, 2);
  try {
    await adapter.write(BOARD_FILE, json);
  } catch {
    // Directory might not exist yet, try creating
    try {
      await adapter.write(BOARD_FILE, json);
    } catch {
      console.warn("Failed to save board");
    }
  }
}

/** Delete board.json — used by Clear All Markers to wipe board data alongside data.json. Returns false on failure. */
export async function clearBoard(adapter: DataAdapter): Promise<boolean> {
  try {
    if (await adapter.exists(BOARD_FILE)) {
      await adapter.remove(BOARD_FILE);
    }
    return true;
  } catch (e) {
    console.warn("Failed to clear board:", e);
    return false;
  }
}

export async function loadBoard(canvas: Canvas, adapter: DataAdapter): Promise<void> {
  try {
    const raw = await adapter.read(BOARD_FILE);
    const data: BoardFileData = JSON.parse(raw);
    if (data.version !== 1) return;

    await deserializeBoard(
      canvas,
      data,
      (nodeData: StickyNoteData) => {
        createStickyNote(canvas, nodeData);
      },
      (arrowData: ArrowData) => {
        // Find from/to nodes
        const objects = canvas.getObjects();
        const fromObj = objects.find((o) => isBoardNode(o) && o.boardId === arrowData.fromNodeId);
        const toObj = objects.find((o) => isBoardNode(o) && o.boardId === arrowData.toNodeId);
        if (fromObj && toObj) {
          createArrow(canvas, fromObj, toObj, arrowData);
        }
      },
      async (snapData: SnapshotNodeData) => {
        await createSnapshotNode(canvas, snapData);
      },
      (excData: ExcerptNodeData) => {
        createExcerptNode(canvas, excData);
      },
      (ccData: CodeCardNodeData) => {
        createCodeCardNode(canvas, ccData);
      },
      (kpiData: KpiCardNodeData) => {
        createKpiCardNode(canvas, kpiData);
      },
      (cfData: ClusterFrameData) => {
        createClusterFrame(canvas, cfData);
      },
    );
  } catch {
    // No saved board — start fresh
  }
}
