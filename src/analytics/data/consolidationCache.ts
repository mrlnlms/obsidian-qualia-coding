import type { EngineType } from './dataTypes';
import type { ConsolidatedData, UnifiedMarker, UnifiedCode } from './dataTypes';
import type { AllEngineData } from './dataReader';
import {
	consolidateMarkdown, consolidateCsv, consolidateImage,
	consolidatePdf, consolidateAudio, consolidateVideo,
	consolidateCodes,
	type EngineSlice,
} from './dataConsolidator';

const ALL_ENGINES: EngineType[] = ['markdown', 'csv', 'image', 'pdf', 'audio', 'video'];

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

		const engineFns: Record<EngineType, (data: AllEngineData) => EngineSlice> = {
			markdown: (d) => consolidateMarkdown(d.markdown),
			csv: (d) => consolidateCsv(d.csv),
			image: (d) => consolidateImage(d.image),
			pdf: (d) => consolidatePdf(d.pdf),
			audio: (d) => consolidateAudio(d.audio),
			video: (d) => consolidateVideo(d.video),
		};

		for (const engine of this.dirtyEngines) {
			this.engineSlices.set(engine, engineFns[engine](raw));
		}

		const markers: UnifiedMarker[] = [];
		for (const engine of ALL_ENGINES) {
			const slice = this.engineSlices.get(engine);
			if (slice) markers.push(...slice.markers);
		}

		let codes: UnifiedCode[];
		if (this.registryDirty || this.dirtyEngines.size > 0) {
			const defs = raw.markdown?.codeDefinitions
				?? raw.csv?.registry?.definitions
				?? raw.image?.registry?.definitions
				?? raw.pdf?.registry?.definitions
				?? raw.audio?.codeDefinitions?.definitions
				?? raw.video?.codeDefinitions?.definitions
				?? {};
			const activeEngines: EngineType[] = [];
			for (const engine of ALL_ENGINES) {
				if (this.engineSlices.get(engine)?.hasData) activeEngines.push(engine);
			}
			codes = consolidateCodes(markers, defs, activeEngines);
		} else {
			codes = this.cachedData!.codes;
		}

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
