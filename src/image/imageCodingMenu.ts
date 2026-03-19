/**
 * CodingMenu — lifecycle wrapper for opening the shared coding popover
 * on image regions. All UX logic lives in core/codingPopover.ts.
 */

import type { App } from 'obsidian';
import type { ImageCodingModel } from './imageCodingModel';
import {
	openCodingPopover,
	type CodingPopoverAdapter,
	type CodingPopoverOptions,
	type CodingPopoverHandle,
} from '../core/codingPopover';

export interface CodingMenuCallbacks {
	onCodesChanged: (markerId: string) => void;
	onRegionDeleted: (markerId: string) => void;
}

export class CodingMenu {
	private app: App;
	private model: ImageCodingModel;
	private callbacks: CodingMenuCallbacks;
	private handle: CodingPopoverHandle | null = null;

	constructor(app: App, model: ImageCodingModel, callbacks: CodingMenuCallbacks) {
		this.app = app;
		this.model = model;
		this.callbacks = callbacks;
	}

	isOpen(): boolean {
		return this.handle !== null;
	}

	open(markerId: string, x: number, y: number): void {
		const marker = this.model.findMarkerById(markerId);
		if (!marker) return;

		this.close();

		const adapter: CodingPopoverAdapter = {
			registry: this.model.registry,
			getActiveCodes: () => [...(this.model.findMarkerById(markerId)?.codes ?? [])],
			addCode: (name) => this.model.addCodeToMarker(markerId, name),
			removeCode: (name) => this.model.removeCodeFromMarker(markerId, name, true),
			getMemo: () => this.model.findMarkerById(markerId)?.memo ?? '',
			setMemo: (value) => {
				const m = this.model.findMarkerById(markerId);
				if (m) {
					m.memo = value || undefined;
					m.updatedAt = Date.now();
					this.model.saveMarkers();
				}
			},
			save: () => this.model.saveMarkers(),
			onRefresh: () => this.callbacks.onCodesChanged(markerId),
			onNavClick: (codeName, isActive) => {
				if (isActive) {
					document.dispatchEvent(new CustomEvent('codemarker:label-click', {
						detail: { markerId, codeName },
					}));
				} else {
					document.dispatchEvent(new CustomEvent('codemarker:code-click', {
						detail: { codeName },
					}));
				}
			},
		};

		const options: CodingPopoverOptions = {
			pos: { x, y },
			app: this.app,
			isHoverMode: true,
			className: 'codemarker-popover',
			deleteAction: {
				label: 'Remove Region',
				icon: 'trash-2',
				onDelete: () => {
					this.callbacks.onRegionDeleted(markerId);
				},
			},
			onClose: () => { this.handle = null; },
			onRebuild: () => this.open(markerId, x, y),
		};

		this.handle = openCodingPopover(adapter, options);
	}

	close(): void {
		if (this.handle) {
			this.handle.close();
			this.handle = null;
		}
	}

	destroy(): void {
		this.close();
	}
}
