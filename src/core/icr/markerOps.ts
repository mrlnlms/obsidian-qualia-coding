/**
 * IcrMarkerOps — façade per-engine usada por executeReconciliationDecision.
 *
 * Reconciliação opera cross-engine (markdown + pdf + csv + audio + video),
 * então a função orquestradora não pode depender de um model específico —
 * recebe este adapter que encapsula CRUD genérico de marker.
 *
 * Implementação concreta (IcrMarkerOpsImpl) vive no main.ts da plugin instance,
 * wrappando os 5 engine models (codeMarkerModel/pdfModel/csvModel/audioModel/videoModel).
 */

import type { CodeApplication } from '../types';
import type { CoderId } from './coderTypes';
import type { EngineId } from './reporter';
import type { ReconciliationBounds, MarkerSnapshot } from '../types';

export interface IcrMarkerOps {
	/** Cria marker novo na engine indicada. Retorna o markerId alocado. */
	createMarker(
		engine: EngineId,
		spec: { fileId: string; bounds: ReconciliationBounds; codeIds: string[]; codedBy: CoderId },
	): { markerId: string };

	/** Remove marker por id. No-op se não existir. */
	removeMarker(engine: EngineId, fileId: string, markerId: string): void;

	/** Update mutable fields. Re-aplicável (mesmo pattern do registry). */
	updateMarker(
		engine: EngineId,
		fileId: string,
		markerId: string,
		fields: { codes?: CodeApplication[] },
	): void;

	/** Snapshot serializável do marker pra revert. */
	serializeMarker(engine: EngineId, fileId: string, markerId: string): MarkerSnapshot;

	/** Restore marker via snapshot. Engine-specific:
	 *  - markdown re-insere; PDF re-attach; CSV reconstrói row anchor. */
	restoreMarker(snapshot: MarkerSnapshot): void;

	/** Encontra markers que sobrepõem uma região (usado pra coletar perdedores no overwrite-mode). */
	findMarkersInRegion(
		region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds },
	): { markerId: string; codedBy: CoderId; codes: CodeApplication[] }[];
}
