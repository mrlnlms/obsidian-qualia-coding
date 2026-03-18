
// ─── Barrel re-export for board node types ───
// Each node type lives in its own file under nodes/.
// Consumers (boardData.ts, boardView.ts) continue importing from here.

export { isStickyNode as isStickyNote, isSnapshotNode, isExcerptNode, isCodeCardNode, isKpiCardNode, isClusterFrameNode as isClusterFrame } from "./boardTypes";

export { type StickyNoteData, STICKY_COLORS, DEFAULT_STICKY_COLOR, nextNoteId, createStickyNote, getStickyData, setStickyColor, enableStickyEditing } from "./nodes/stickyNode";
export { type SnapshotNodeData, nextSnapshotId, createSnapshotNode, getSnapshotData } from "./nodes/snapshotNode";
export { type ExcerptNodeData, nextExcerptId, createExcerptNode, getExcerptData } from "./nodes/excerptNode";
export { type CodeCardNodeData, nextCodeCardId, createCodeCardNode, getCodeCardData } from "./nodes/codeCardNode";
export { type KpiCardNodeData, nextKpiCardId, createKpiCardNode, getKpiCardData } from "./nodes/kpiCardNode";
export { type ClusterFrameData, nextClusterFrameId, createClusterFrame, getClusterFrameData } from "./nodes/clusterFrameNode";
