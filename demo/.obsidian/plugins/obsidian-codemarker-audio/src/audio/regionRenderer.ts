import type { WaveformRenderer } from './waveformRenderer';
import type { AudioCodingModel } from '../coding/audioCodingModel';
import type { AudioMarker } from '../coding/audioCodingTypes';
import { formatTime } from '../utils/formatTime';

export class AudioRegionRenderer {
	private renderer: WaveformRenderer;
	private model: AudioCodingModel;
	private markerToRegion: Map<string, any> = new Map();
	private regionToMarker: Map<string, string> = new Map();
	private onNavigate: ((markerId: string, codeName: string) => void) | null = null;

	constructor(renderer: WaveformRenderer, model: AudioCodingModel) {
		this.renderer = renderer;
		this.model = model;
	}

	setNavigateCallback(fn: (markerId: string, codeName: string) => void): void {
		this.onNavigate = fn;
	}

	restoreRegions(filePath: string): void {
		this.clear();
		const markers = this.model.getMarkersForFile(filePath);
		for (const marker of markers) {
			this.renderMarkerRegion(marker);
		}
	}

	renderMarkerRegion(marker: AudioMarker): void {
		// Remove existing region for this marker if any
		this.removeRegion(marker.id);

		const baseColor = this.model.registry.getColorForCodes(marker.codes);
		const fallback = this.renderer.readAccentHex() + '26';
		const color = baseColor ? baseColor + '40' : fallback;

		let content: HTMLElement | undefined;
		if (this.model.settings.showLabelsOnRegions && marker.codes.length > 0) {
			content = document.createElement('div');
			content.className = 'codemarker-audio-region-label';
			content.title = marker.codes.join(', ') + '\n' + formatTime(marker.from) + ' – ' + formatTime(marker.to);

			// Container inline styles — override WaveSurfer internals
			const cs = content.style;
			cs.display = 'flex';
			cs.flexDirection = 'column';
			cs.gap = '1px';
			cs.padding = '2px 4px';
			cs.overflow = 'visible';
			cs.position = 'relative';
			cs.zIndex = '10';
			cs.width = 'max-content';

			for (const codeName of marker.codes) {
				const chip = document.createElement('span');
				chip.textContent = codeName;
				chip.style.fontSize = '12px';
				chip.style.whiteSpace = 'nowrap';
				chip.style.textShadow = '0 0 3px var(--background-primary), 0 0 3px var(--background-primary)';

				if (this.onNavigate) {
					chip.style.pointerEvents = 'auto';
					chip.style.cursor = 'pointer';
					const nav = this.onNavigate;
					const mid = marker.id;
					chip.addEventListener('click', (e) => {
						e.stopPropagation();
						nav(mid, codeName);
					});
					chip.addEventListener('mouseenter', () => {
						chip.style.color = 'var(--text-accent)';
						chip.style.textDecoration = 'underline';
					});
					chip.addEventListener('mouseleave', () => {
						chip.style.color = '';
						chip.style.textDecoration = '';
					});
				} else {
					chip.style.pointerEvents = 'none';
				}

				content.appendChild(chip);
			}
		}

		const region = this.renderer.addRegion({
			id: marker.id,
			start: marker.from,
			end: marker.to,
			color,
			content,
		});

		if (region) {
			this.markerToRegion.set(marker.id, region);
			this.regionToMarker.set(marker.id, marker.id);
		}
	}

	refreshRegion(markerId: string): void {
		const marker = this.model.findMarkerById(markerId);
		if (!marker) return;
		this.renderMarkerRegion(marker);
	}

	removeRegion(markerId: string): void {
		const region = this.markerToRegion.get(markerId);
		if (region) {
			region.remove();
			this.markerToRegion.delete(markerId);
			this.regionToMarker.delete(markerId);
		}
	}

	clear(): void {
		this.renderer.clearRegions();
		this.markerToRegion.clear();
		this.regionToMarker.clear();
	}

	getMarkerIdForRegion(regionId: string): string | undefined {
		return this.regionToMarker.get(regionId);
	}

	getRegionForMarker(markerId: string): any | undefined {
		return this.markerToRegion.get(markerId);
	}
}
