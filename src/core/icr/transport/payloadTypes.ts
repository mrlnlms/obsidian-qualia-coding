/**
 * Payload format pra transport multi-coder remoto (Fase C P0).
 *
 * Versionado (`version: '1.0'`) — futuras versions adicionam campos sem quebrar.
 * Inclui codebookVersion (hash do codebook) + sources com hash (cross-vault remap)
 * + codes referenciados pelos markers (auto-resolução quando codebook divergente).
 */

import type { CodeDefinition, GroupDefinition, FolderDefinition } from '../../types';
import type { Coder } from '../coderTypes';
import type { Marker } from '../../../markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../../pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../../csv/csvCodingTypes';
import type { MemoRecord } from '../../memoTypes';

export interface PayloadV1 {
	version: '1.0';
	/** SHA-256 do codebook (codes + groups + smartCodes ids canonical) ao momento do export. */
	codebookVersion: string;
	/** Coder full entry — incluído pra registry caso não exista local. */
	coder: Coder;
	/** Map fileId → hash + fileSize. Pro cross-vault remap. */
	sources: Record<string, { hash: string; fileSize?: number }>;
	/** Codes referenciados pelos markers — incluídos pra resolução local. */
	codes: CodeDefinition[];
	/** Groups referenciados — opcional. */
	groups?: GroupDefinition[];
	/** Folders referenciados — opcional. */
	folders?: FolderDefinition[];
	/** Markers do coder, agrupados por engine text-like (Slice 3 P0). */
	markers: {
		markdown: Record<string, Marker[]>;
		pdf: PdfMarker[];
		csvSegment: SegmentMarker[];
	};
	/** Memos editados pelo coder (Slice 3 P0: opt-in pra futuras extensões). */
	memos?: {
		codes?: Record<string, MemoRecord>;
		groups?: Record<string, MemoRecord>;
	};
	exportedAt: number;
}

export type Payload = PayloadV1;

/** Conflict record — emitido por mergeCoderContribution pra caller (UX layer) resolver. */
export type ConflictRecord =
	| { kind: 'codebook_diverged'; localHash: string; payloadHash: string }
	| { kind: 'source_hash_mismatch'; fileId: string; localHash: string; payloadHash: string }
	| { kind: 'source_not_found'; fileId: string; payloadHash: string }
	| { kind: 'multiple_hash_matches'; payloadFileId: string; localFileIds: string[]; chosenFileId: string }
	| { kind: 'code_overwritten'; codeId: string; field: 'name' | 'color' | 'description' | 'memo'; from: string; to: string }
	| { kind: 'memo_overwritten'; entityType: 'code' | 'group'; entityId: string; from: string; to: string }
	| { kind: 'marker_already_exists'; markerId: string; engine: 'markdown' | 'pdf' | 'csvSegment'; fileId: string };

export interface ExtractResult {
	payload: Payload;
	warnings: string[];
}

export interface MergeResult {
	added: { markers: number; codes: number; groups: number; coder: boolean };
	conflicts: ConflictRecord[];
	warnings: string[];
	/** Map payloadFileId → localFileId após cross-vault remap. */
	fileIdRemap: Record<string, string>;
	/** Markers que ficaram sem source local (pending — não inseridos). */
	pendingMarkers: number;
}
