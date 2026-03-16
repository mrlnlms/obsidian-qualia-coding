
import { Canvas, Path } from "fabric";
import type { StickyNoteData, SnapshotNodeData, ExcerptNodeData, CodeCardNodeData, KpiCardNodeData } from "./boardNodes";
import type { ArrowData } from "./boardArrows";
import type { FreePathData } from "./boardDrawing";
import { getStickyData, isStickyNote, getSnapshotData, isSnapshotNode, getExcerptData, isExcerptNode, getCodeCardData, isCodeCardNode, getKpiCardData, isKpiCardNode, getClusterFrameData, isClusterFrame, type ClusterFrameData } from "./boardNodes";
import { getArrowData, isArrowLine, isArrow } from "./boardArrows";
import { getPathData, isFreePath } from "./boardDrawing";

export interface BoardFileData {
  version: 1;
  nodes: StickyNoteData[];
  snapshots: SnapshotNodeData[];
  excerpts: ExcerptNodeData[];
  codeCards: CodeCardNodeData[];
  kpiCards: KpiCardNodeData[];
  clusterFrames: ClusterFrameData[];
  arrows: ArrowData[];
  paths: FreePathData[];
  viewport: { zoom: number; panX: number; panY: number };
}

export function emptyBoardData(): BoardFileData {
  return {
    version: 1,
    nodes: [],
    snapshots: [],
    excerpts: [],
    codeCards: [],
    kpiCards: [],
    clusterFrames: [],
    arrows: [],
    paths: [],
    viewport: { zoom: 1, panX: 0, panY: 0 },
  };
}

export function serializeBoard(canvas: Canvas): BoardFileData {
  const nodes: StickyNoteData[] = [];
  const snapshots: SnapshotNodeData[] = [];
  const excerpts: ExcerptNodeData[] = [];
  const codeCards: CodeCardNodeData[] = [];
  const kpiCards: KpiCardNodeData[] = [];
  const clusterFrames: ClusterFrameData[] = [];
  const arrows: ArrowData[] = [];
  const paths: FreePathData[] = [];

  for (const obj of canvas.getObjects()) {
    if (isStickyNote(obj)) {
      const d = getStickyData(obj);
      if (d) nodes.push(d);
    } else if (isSnapshotNode(obj)) {
      const d = getSnapshotData(obj);
      if (d) snapshots.push(d);
    } else if (isExcerptNode(obj)) {
      const d = getExcerptData(obj);
      if (d) excerpts.push(d);
    } else if (isCodeCardNode(obj)) {
      const d = getCodeCardData(obj);
      if (d) codeCards.push(d);
    } else if (isKpiCardNode(obj)) {
      const d = getKpiCardData(obj);
      if (d) kpiCards.push(d);
    } else if (isClusterFrame(obj)) {
      const d = getClusterFrameData(obj);
      if (d) clusterFrames.push(d);
    } else if (isArrowLine(obj)) {
      const d = getArrowData(obj);
      if (d) arrows.push(d);
    } else if (isArrow(obj)) {
      // arrow-head — skip, reconstructed from arrow-line data
    } else if (isFreePath(obj)) {
      const d = getPathData(obj);
      if (d) paths.push(d);
    }
  }

  const vt = canvas.viewportTransform!;
  return {
    version: 1,
    nodes,
    snapshots,
    excerpts,
    codeCards,
    kpiCards,
    clusterFrames,
    arrows,
    paths,
    viewport: {
      zoom: canvas.getZoom(),
      panX: vt[4],
      panY: vt[5],
    },
  };
}

export async function deserializeBoard(
  canvas: Canvas,
  data: BoardFileData,
  createStickyFn: (data: StickyNoteData) => void,
  createArrowFn: (data: ArrowData) => void,
  createSnapshotFn?: (data: SnapshotNodeData) => Promise<void>,
  createExcerptFn?: (data: ExcerptNodeData) => void,
  createCodeCardFn?: (data: CodeCardNodeData) => void,
  createKpiCardFn?: (data: KpiCardNodeData) => void,
  createClusterFrameFn?: (data: ClusterFrameData) => void,
): Promise<void> {
  // Clear canvas
  canvas.clear();

  // Restore nodes
  for (const node of data.nodes) {
    createStickyFn(node);
  }

  // Restore snapshots
  if (data.snapshots && createSnapshotFn) {
    for (const snap of data.snapshots) {
      await createSnapshotFn(snap);
    }
  }

  // Restore excerpts
  if (data.excerpts && createExcerptFn) {
    for (const exc of data.excerpts) {
      createExcerptFn(exc);
    }
  }

  // Restore code cards
  if (data.codeCards && createCodeCardFn) {
    for (const cc of data.codeCards) {
      createCodeCardFn(cc);
    }
  }

  // Restore KPI cards
  if (data.kpiCards && createKpiCardFn) {
    for (const kpi of data.kpiCards) {
      createKpiCardFn(kpi);
    }
  }

  // Restore cluster frames (behind cards)
  if (data.clusterFrames && createClusterFrameFn) {
    for (const cf of data.clusterFrames) {
      createClusterFrameFn(cf);
    }
  }

  // Restore arrows (need nodes to exist first)
  for (const arrow of data.arrows) {
    createArrowFn(arrow);
  }

  // Restore freeform paths
  for (const pathData of data.paths) {
    try {
      const pathArray = JSON.parse(pathData.path);
      const pathObj = new Path(pathArray, {
        stroke: pathData.color,
        strokeWidth: pathData.width,
        fill: "",
        selectable: true,
      });
      pathObj.boardType = "path";
      pathObj.boardId = pathData.id;
      canvas.add(pathObj);
    } catch {
      // Skip invalid paths
    }
  }

  // Restore viewport — use setViewportTransform to trigger coord recalculation
  if (data.viewport) {
    const vt: [number, number, number, number, number, number] = [
      data.viewport.zoom, 0, 0, data.viewport.zoom,
      data.viewport.panX, data.viewport.panY,
    ];
    canvas.setViewportTransform(vt);
  }

  // Force recalculate all object coordinates for hit-testing
  canvas.forEachObject((o) => o.setCoords());
  canvas.requestRenderAll();
}
