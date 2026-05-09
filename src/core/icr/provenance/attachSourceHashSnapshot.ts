/**
 * attachSourceHashSnapshot — popula `sourceHashAtCoding` no marker (Slice 5).
 *
 * Idempotente: NÃO sobrescreve se já populado (snapshot é histórico, não atual).
 * Erros (file not found, etc) são swallowed silenciosamente — marker fica sem
 * snapshot e detectStaleMarkers vai classificar como `inconclusive`.
 *
 * Uso: chamado por marker creation paths fire-and-forget após criar marker.
 * Slice 5 pilota em markdown; outros engines em slice de extensão futuro.
 */

import type { SourceHashRegistry } from '../sourceHashRegistry';

export async function attachSourceHashSnapshot(
	marker: { fileId: string; sourceHashAtCoding?: string },
	hashRegistry: SourceHashRegistry,
): Promise<void> {
	if (marker.sourceHashAtCoding) return;
	try {
		const hash = await hashRegistry.getOrCompute(marker.fileId);
		marker.sourceHashAtCoding = hash;
	} catch {
		// Source não acessível — ignora silenciosamente
	}
}
