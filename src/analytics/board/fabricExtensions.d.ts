/**
 * Fabric.js type extensions for Qualia Research Board.
 * Adds custom metadata properties used to track board node types.
 */

declare module 'fabric' {
  interface FabricObject {
    boardType?: 'sticky' | 'snapshot' | 'excerpt' | 'codeCard' | 'kpiCard' | 'cluster-frame' | 'arrow-line' | 'arrow-head' | 'path';
    boardId?: string;
    boardColor?: string;
    boardTitle?: string;
    boardText?: string;
    boardFile?: string;
    boardSource?: string;
    boardLocation?: string;
    boardCodes?: string[];
    boardCodeColors?: string[];
    boardCodeName?: string;
    boardCodeNames?: string[];
    boardDescription?: string;
    boardMarkerCount?: number;
    boardSources?: string[];
    boardValue?: string;
    boardLabel?: string;
    boardAccent?: string;
    boardFromId?: string;
    boardToId?: string;
    boardDataUrl?: string;
    boardViewMode?: string;
    boardCreatedAt?: number;
    boardWidth?: number;
    boardHeight?: number;
  }
}
