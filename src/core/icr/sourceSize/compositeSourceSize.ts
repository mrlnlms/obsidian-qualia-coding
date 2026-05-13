/**
 * CompositeSourceSize — delega por engine entre providers concretos.
 *
 * Cada provider concreto (Media, PDF, CSV segment) responde a um conjunto de engines;
 * pra engines fora desse conjunto, retorna `null` direto. Composite consulta em
 * cadeia e retorna o primeiro non-null. Wired em `UnifiedCompareCodersView` no lugar
 * dos providers individuais.
 *
 * Não tem cache próprio — cada provider concreto cacheia internamente.
 */

import type { SourceSizeProvider } from '../ui/scopeExtraction';
import type { EngineId } from '../reporter';

export class CompositeSourceSize implements SourceSizeProvider {
	constructor(private providers: SourceSizeProvider[]) {}

	async getSourceSize(
		engine: EngineId,
		fileId: string,
		locator: string,
		temporalResolution: number,
	): Promise<number | null> {
		for (const provider of this.providers) {
			const result = await provider.getSourceSize(engine, fileId, locator, temporalResolution);
			if (result !== null) return result;
		}
		return null;
	}
}
