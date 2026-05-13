import { describe, it, expect, vi } from 'vitest';
import { CompositeSourceSize } from '../../../../src/core/icr/sourceSize/compositeSourceSize';
import type { SourceSizeProvider } from '../../../../src/core/icr/ui/scopeExtraction';
import type { EngineId } from '../../../../src/core/icr/reporter';

function provider(handlers: Record<string, number | null>): SourceSizeProvider {
	return {
		async getSourceSize(engine: EngineId, fileId: string) {
			const key = `${engine}|${fileId}`;
			return handlers[key] ?? null;
		},
	};
}

describe('CompositeSourceSize', () => {
	it('retorna primeiro non-null da cadeia', async () => {
		const composite = new CompositeSourceSize([
			provider({}),
			provider({ 'pdf|f.pdf': 42 }),
			provider({ 'pdf|f.pdf': 999 }),
		]);
		expect(await composite.getSourceSize('pdf', 'f.pdf', 'page:0', 1)).toBe(42);
	});

	it('retorna null se todos providers retornam null', async () => {
		const composite = new CompositeSourceSize([provider({}), provider({})]);
		expect(await composite.getSourceSize('pdf', 'f.pdf', 'page:0', 1)).toBe(null);
	});

	it('lista vazia retorna null', async () => {
		const composite = new CompositeSourceSize([]);
		expect(await composite.getSourceSize('audio', 'f.mp3', '', 1)).toBe(null);
	});

	it('para na primeira match — não consulta providers seguintes', async () => {
		const second = vi.fn(async () => null);
		const composite = new CompositeSourceSize([
			provider({ 'audio|f.mp3': 100 }),
			{ getSourceSize: second },
		]);
		await composite.getSourceSize('audio', 'f.mp3', '', 1);
		expect(second).not.toHaveBeenCalled();
	});
});
