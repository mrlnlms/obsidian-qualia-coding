/**
 * MediaSourceSize — descobre duração total de audio/video via HTMLMediaElement metadata.
 *
 * Pattern: cria elemento `<audio>` ou `<video>` com `preload="metadata"`, espera
 * `loadedmetadata` event, lê `el.duration` (segundos). Detached do DOM — sem render.
 *
 * Cache per-fileId (one-shot): metadata é estático per file, raro mudar entre sessões.
 * Cache em memória (não persiste) — preço de re-load por sessão aceito; alternativa
 * (persistir em data.json) adicionaria invalidation complexity sem ganho mensurável.
 */

import type { App, TFile } from 'obsidian';
import type { SourceSizeProvider } from '../ui/scopeExtraction';
import type { EngineId } from '../reporter';

const METADATA_LOAD_TIMEOUT_MS = 5000;

export class MediaSourceSize implements SourceSizeProvider {
	private cache = new Map<string, number>();

	constructor(private app: App) {}

	async getSourceSize(
		engine: EngineId,
		fileId: string,
		_locator: string,
		temporalResolution: number,
	): Promise<number | null> {
		if (engine !== 'audio' && engine !== 'video') return null;
		const durationSec = await this.getDuration(fileId, engine);
		if (durationSec === null) return null;
		return Math.ceil(durationSec / temporalResolution);
	}

	private async getDuration(fileId: string, engine: 'audio' | 'video'): Promise<number | null> {
		const cached = this.cache.get(fileId);
		if (cached !== undefined) return cached;

		const file = this.app.vault.getAbstractFileByPath(fileId) as TFile | null;
		if (!file || !('extension' in file)) return null;
		const src = this.app.vault.getResourcePath(file);

		const duration = await loadMediaDuration(src, engine);
		if (duration !== null) this.cache.set(fileId, duration);
		return duration;
	}

	/** Invalida cache pra um fileId (útil pós file change). */
	invalidate(fileId: string): void {
		this.cache.delete(fileId);
	}

	/** Invalida todo o cache. */
	clear(): void {
		this.cache.clear();
	}
}

function loadMediaDuration(src: string, engine: 'audio' | 'video'): Promise<number | null> {
	return new Promise<number | null>(resolve => {
		const el = document.createElement(engine) as HTMLMediaElement;
		el.preload = 'metadata';
		let settled = false;
		const cleanup = () => {
			el.removeAttribute('src');
			el.load();
		};
		const finish = (value: number | null) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(value);
		};
		const timer = setTimeout(() => finish(null), METADATA_LOAD_TIMEOUT_MS);
		el.addEventListener('loadedmetadata', () => {
			clearTimeout(timer);
			const dur = el.duration;
			finish(isFinite(dur) && dur > 0 ? dur : null);
		}, { once: true });
		el.addEventListener('error', () => {
			clearTimeout(timer);
			finish(null);
		}, { once: true });
		el.src = src;
	});
}
