import type { EngineType } from './dataTypes';
import type { ConsolidatedData, UnifiedMarker, UnifiedCode } from './dataTypes';
import type { AllEngineData } from './dataReader';
import {
	consolidateMarkdown, consolidateCsv, consolidateImage,
	consolidatePdf, consolidateAudio, consolidateVideo,
	consolidateCodes, findDefinitions,
	type EngineSlice,
} from './dataConsolidator';

const ALL_ENGINES: EngineType[] = ['markdown', 'csv', 'image', 'pdf', 'audio', 'video'];

const ENGINE_FNS: Record<EngineType, (data: AllEngineData) => EngineSlice> = {
	markdown: (d) => consolidateMarkdown(d.markdown),
	csv: (d) => consolidateCsv(d.csv),
	image: (d) => consolidateImage(d.image),
	pdf: (d) => consolidatePdf(d.pdf),
	audio: (d) => consolidateAudio(d.audio),
	video: (d) => consolidateVideo(d.video),
};

export class ConsolidationCache {
	private cachedData: ConsolidatedData | null = null;
	private dirtyEngines = new Set<EngineType>();
	private registryDirty = false;
	private engineSlices = new Map<EngineType, EngineSlice>();

	invalidateEngine(engine: EngineType): void {
		this.dirtyEngines.add(engine);
	}

	invalidateRegistry(): void {
		this.registryDirty = true;
	}

	invalidateAll(): void {
		for (const e of ALL_ENGINES) this.dirtyEngines.add(e);
		this.registryDirty = true;
	}

	async getData(readFn: () => AllEngineData): Promise<ConsolidatedData> {
		if (this.cachedData && this.dirtyEngines.size === 0 && !this.registryDirty) {
			return this.cachedData;
		}

		const isFirstCall = this.cachedData === null;
		if (isFirstCall) {
			for (const e of ALL_ENGINES) this.dirtyEngines.add(e);
			this.registryDirty = true;
		}

		const raw = readFn();

		for (const engine of this.dirtyEngines) {
			this.engineSlices.set(engine, ENGINE_FNS[engine](raw));
		}

		const markers: UnifiedMarker[] = [];
		for (const engine of ALL_ENGINES) {
			const slice = this.engineSlices.get(engine);
			if (slice) markers.push(...slice.markers);
		}

		// codes[] always rebuilds when anything is dirty — codes depend on both
		// registry definitions and codes discovered in markers (see spec §Merge parcial item 5)
		const defs = findDefinitions(raw);
		const activeEngines: EngineType[] = [];
		for (const engine of ALL_ENGINES) {
			if (this.engineSlices.get(engine)?.hasData) activeEngines.push(engine);
		}
		const codes = consolidateCodes(markers, defs, activeEngines);

		const sources = {
			markdown: this.engineSlices.get('markdown')?.hasData ?? false,
			csv: this.engineSlices.get('csv')?.hasData ?? false,
			image: this.engineSlices.get('image')?.hasData ?? false,
			pdf: this.engineSlices.get('pdf')?.hasData ?? false,
			audio: this.engineSlices.get('audio')?.hasData ?? false,
			video: this.engineSlices.get('video')?.hasData ?? false,
		};

		this.dirtyEngines.clear();
		this.registryDirty = false;

		this.cachedData = { markers, codes, sources, lastUpdated: Date.now() };
		return this.cachedData;
	}
}
