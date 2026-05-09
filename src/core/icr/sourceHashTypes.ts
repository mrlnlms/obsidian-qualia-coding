/**
 * ICR Slice 2 — Hash por source (SHA-256).
 *
 * Storage em QualiaData.sourceHashes: Record<fileId, SourceHashEntry>.
 * Computed lazy on first access via SourceHashRegistry.getOrCompute().
 */

export interface SourceHashEntry {
	/** SHA-256 do conteúdo binário, hex lowercase 64 chars. */
	hash: string;
	/** Timestamp ms de quando foi computado. */
	computedAt: number;
	/** Tamanho em bytes — pra debug/diagnostics. Não usado pra short-circuit. */
	fileSize: number;
}
