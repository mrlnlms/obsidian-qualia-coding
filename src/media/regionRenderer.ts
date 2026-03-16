import type { WaveformRenderer } from './waveformRenderer';
import type { MediaMarker, MediaCodingModelLike } from './mediaTypes';
import { formatTime } from './formatTime';

export class MediaRegionRenderer {
	private renderer: WaveformRenderer;
	private model: MediaCodingModelLike;
	private markerToRegion: Map<string, any> = new Map();
	private regionToMarker: Map<string, string> = new Map();
	private onNavigate: ((markerId: string, codeName: string) => void) | null = null;
	private hoverListener: (() => void) | null = null;

	constructor(renderer: WaveformRenderer, model: MediaCodingModelLike) {
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
		this.applyLanes(markers);
		this.renderMinimapMarkers(markers);
	}

	renderMarkerRegion(marker: MediaMarker): void {
		this.removeRegion(marker.id);

		const baseColor = marker.colorOverride ?? this.model.registry.getColorForCodes(marker.codes);
		const alpha = Math.round(this.model.settings.regionOpacity * 255).toString(16).padStart(2, '0');
		const fallbackAlpha = Math.round(this.model.settings.regionOpacity * 0.6 * 255).toString(16).padStart(2, '0');
		const fallback = this.renderer.readAccentHex() + fallbackAlpha;
		const color = baseColor ? baseColor + alpha : fallback;

		let content: HTMLElement | undefined;
		if (this.model.settings.showLabelsOnRegions && marker.codes.length > 0) {
			content = document.createElement('div');
			content.className = 'codemarker-media-region-label';
			content.title = marker.codes.join(', ') + '\n' + formatTime(marker.from) + ' – ' + formatTime(marker.to);

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
						this.model.setHoverState(mid, codeName);
						chip.style.color = 'var(--text-accent)';
						chip.style.textDecoration = 'underline';
					});
					chip.addEventListener('mouseleave', () => {
						this.model.setHoverState(null, null);
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

	subscribeToHover(): void {
		this.hoverListener = () => this.applyHoverToRegions(this.model.getHoverMarkerId());
		this.model.onHoverChange(this.hoverListener);
	}

	unsubscribeFromHover(): void {
		if (this.hoverListener) {
			this.model.offHoverChange(this.hoverListener);
			this.hoverListener = null;
		}
	}

	private applyHoverToRegions(markerId: string | null): void {
		for (const [mid, region] of this.markerToRegion) {
			const el: HTMLElement | undefined = region.element;
			if (!el) continue;
			el.classList.toggle('codemarker-media-region-hovered', markerId === mid);
		}
	}

	getMarkerIdForRegion(regionId: string): string | undefined {
		return this.regionToMarker.get(regionId);
	}

	getRegionForMarker(markerId: string): any | undefined {
		return this.markerToRegion.get(markerId);
	}

	private renderMinimapMarkers(markers: MediaMarker[]): void {
		const overlay = this.renderer.getMinimapOverlay();
		if (!overlay) return;
		overlay.empty();

		const duration = this.renderer.getDuration();
		if (duration <= 0 || markers.length === 0) return;

		for (const marker of markers) {
			const baseColor = marker.colorOverride ?? this.model.registry.getColorForCodes(marker.codes);
			const color = baseColor ?? this.renderer.readAccentHex();
			const left = (marker.from / duration) * 100;
			const width = ((marker.to - marker.from) / duration) * 100;

			const bar = document.createElement('div');
			bar.className = 'codemarker-media-minimap-marker';
			bar.style.left = `${left}%`;
			bar.style.width = `${Math.max(width, 0.3)}%`;
			bar.style.backgroundColor = color;
			bar.title = marker.codes.join(', ') + ' · ' + formatTime(marker.from) + ' – ' + formatTime(marker.to);
			overlay.appendChild(bar);
		}
	}

	private applyLanes(markers: MediaMarker[]): void {
		if (markers.length <= 1) return;

		const sorted = [...markers].sort((a, b) =>
			a.from !== b.from ? a.from - b.from : (b.to - b.from) - (a.to - a.from)
		);

		const laneEnds: number[] = [];
		const laneMap = new Map<string, number>();

		for (const m of sorted) {
			let assigned = -1;
			for (let i = 0; i < laneEnds.length; i++) {
				if (laneEnds[i]! <= m.from) {
					assigned = i;
					laneEnds[i] = m.to;
					break;
				}
			}
			if (assigned < 0) {
				assigned = laneEnds.length;
				laneEnds.push(m.to);
			}
			laneMap.set(m.id, assigned);
		}

		const totalLanes = laneEnds.length;
		if (totalLanes <= 1) return;

		for (const [mid, lane] of laneMap) {
			const region = this.markerToRegion.get(mid);
			const el: HTMLElement | undefined = region?.element;
			if (!el) continue;
			const pct = 100 / totalLanes;
			el.style.top = `${lane * pct}%`;
			el.style.height = `${pct}%`;
		}
	}
}
