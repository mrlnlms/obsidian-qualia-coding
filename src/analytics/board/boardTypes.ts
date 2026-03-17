/**
 * Discriminated union types for board node types.
 *
 * Each board node has a `boardType` discriminant and non-optional custom properties.
 * Type guards narrow FabricObject to specific types.
 */

import type { FabricObject, Group, Line, Triangle, Path } from "fabric";

// ── Sticky Note ──

export interface StickyNode extends Group {
  boardType: "sticky";
  boardId: string;
  boardColor: string;
}

export function isStickyNode(obj: FabricObject): obj is StickyNode {
  return obj.boardType === "sticky";
}

// ── Snapshot Node ──

export interface SnapshotNode extends Group {
  boardType: "snapshot";
  boardId: string;
  boardTitle: string;
  boardDataUrl: string;
  boardViewMode: string;
  boardCreatedAt: number;
  boardWidth: number;
  boardHeight: number;
}

export function isSnapshotNode(obj: FabricObject): obj is SnapshotNode {
  return obj.boardType === "snapshot";
}

// ── Excerpt Node ──

export interface ExcerptNode extends Group {
  boardType: "excerpt";
  boardId: string;
  boardText: string;
  boardFile: string;
  boardSource: string;
  boardLocation: string;
  boardCodes: string[];
  boardCodeColors: string[];
  boardCreatedAt: number;
  boardWidth: number;
}

export function isExcerptNode(obj: FabricObject): obj is ExcerptNode {
  return obj.boardType === "excerpt";
}

// ── Code Card Node ──

export interface CodeCardNode extends Group {
  boardType: "codeCard";
  boardId: string;
  boardCodeName: string;
  boardColor: string;
  boardDescription: string;
  boardMarkerCount: number;
  boardSources: string[];
  boardCreatedAt: number;
}

export function isCodeCardNode(obj: FabricObject): obj is CodeCardNode {
  return obj.boardType === "codeCard";
}

// ── KPI Card Node ──

export interface KpiCardNode extends Group {
  boardType: "kpiCard";
  boardId: string;
  boardValue: string;
  boardLabel: string;
  boardAccent: string;
  boardCreatedAt: number;
}

export function isKpiCardNode(obj: FabricObject): obj is KpiCardNode {
  return obj.boardType === "kpiCard";
}

// ── Cluster Frame Node ──

export interface ClusterFrameNode extends Group {
  boardType: "cluster-frame";
  boardId: string;
  boardLabel: string;
  boardColor: string;
  boardCodeNames: string[];
  boardWidth: number;
  boardHeight: number;
}

export function isClusterFrameNode(obj: FabricObject): obj is ClusterFrameNode {
  return obj.boardType === "cluster-frame";
}

// ── Arrow Line ──

export interface ArrowLineNode extends Line {
  boardType: "arrow-line";
  boardId: string;
  boardFromId: string;
  boardToId: string;
  boardColor: string;
  boardLabel: string;
}

export function isArrowLineNode(obj: FabricObject): obj is ArrowLineNode {
  return obj.boardType === "arrow-line";
}

// ── Arrow Head ──

export interface ArrowHeadNode extends Triangle {
  boardType: "arrow-head";
  boardId: string;
}

export function isArrowHeadNode(obj: FabricObject): obj is ArrowHeadNode {
  return obj.boardType === "arrow-head";
}

// ── Path Node ──

export interface PathNode extends Path {
  boardType: "path";
  boardId: string;
}

export function isPathNode(obj: FabricObject): obj is PathNode {
  return obj.boardType === "path";
}

// ── Union type for any board node ──

export type BoardNode =
  | StickyNode
  | SnapshotNode
  | ExcerptNode
  | CodeCardNode
  | KpiCardNode
  | ClusterFrameNode
  | ArrowLineNode
  | ArrowHeadNode
  | PathNode;

/** Check if an object has a boardId (any board node type) */
export function isBoardNode(obj: FabricObject): obj is BoardNode {
  return obj.boardType !== undefined;
}
