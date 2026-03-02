/**
 * Video coding popover — thin wrapper around the shared openCodingPopover().
 */

import type { App } from 'obsidian';
import type { VideoCodingModel } from './videoCodingModel';
import type { MediaRegionRenderer } from '../media/regionRenderer';
import {
	openCodingPopover,
	type CodingPopoverAdapter,
	type CodingPopoverOptions,
} from '../core/codingPopover';

export function openVideoCodingPopover(
	mouseEvent: MouseEvent,
	model: VideoCodingModel,
	filePath: string,
	regionStart: number,
	regionEnd: number,
	regionRenderer: MediaRegionRenderer,
	onDismissEmpty: () => void,
	app: App,
	savedPos?: { x: number; y: number },
): void {
	const pos = savedPos ?? { x: mouseEvent.clientX, y: mouseEvent.clientY };

	const getMarker = () => model.findOrCreateMarker(filePath, regionStart, regionEnd);
	const existingMarker = model.findExistingMarker(filePath, regionStart, regionEnd);
	const isHoverMode = !!existingMarker;

	const adapter: CodingPopoverAdapter = {
		registry: model.registry,
		getActiveCodes: () => existingMarker ? [...existingMarker.codes] : [],
		addCode: (name) => {
			const m = getMarker();
			model.addCodeToMarker(m.id, name);
			regionRenderer.refreshRegion(m.id);
		},
		removeCode: (name) => {
			const m = getMarker();
			model.removeCodeFromMarker(m.id, name, true);
			regionRenderer.refreshRegion(m.id);
		},
		getMemo: () => {
			const m = model.findExistingMarker(filePath, regionStart, regionEnd);
			return m?.memo ?? '';
		},
		setMemo: (value) => {
			const m = getMarker();
			m.memo = value || undefined;
			m.updatedAt = Date.now();
			model.notify();
		},
		save: () => model.save(),
		onRefresh: () => {
			const m = model.findExistingMarker(filePath, regionStart, regionEnd);
			if (m) regionRenderer.refreshRegion(m.id);
		},
		onNavClick: (codeName, isActive) => {
			if (isActive && existingMarker) {
				document.dispatchEvent(new CustomEvent('codemarker:label-click', {
					detail: { markerId: existingMarker.id, codeName },
				}));
			} else {
				document.dispatchEvent(new CustomEvent('codemarker:code-click', {
					detail: { codeName },
				}));
			}
		},
	};

	const options: CodingPopoverOptions = {
		pos,
		app,
		isHoverMode,
		className: 'codemarker-popover',
		onClose: () => {
			const marker = model.findExistingMarker(filePath, regionStart, regionEnd);
			if (marker && marker.codes.length === 0) {
				model.removeMarker(marker.id);
				regionRenderer.removeRegion(marker.id);
				onDismissEmpty();
			} else if (!marker) {
				onDismissEmpty();
			}
		},
		onRebuild: () => {
			openVideoCodingPopover(mouseEvent, model, filePath, regionStart, regionEnd, regionRenderer, onDismissEmpty, app, pos);
		},
		deleteAction: isHoverMode ? {
			label: 'Remove Region',
			icon: 'trash',
			onDelete: () => {
				if (existingMarker) {
					for (const code of [...existingMarker.codes]) {
						model.removeCodeFromMarker(existingMarker.id, code);
					}
					regionRenderer.removeRegion(existingMarker.id);
				}
			},
		} : undefined,
	};

	openCodingPopover(adapter, options);
}
