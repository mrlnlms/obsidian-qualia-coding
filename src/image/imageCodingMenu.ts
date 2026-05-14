/**
 * CodingMenu — lifecycle wrapper for opening the shared coding popover
 * on image regions. All UX logic lives in core/codingPopover.ts.
 */

import type { App } from 'obsidian';
import type { ImageCodingModel } from './imageCodingModel';
import { findCodeApplication, setMagnitude } from '../core/codeApplicationHelpers';
import { getMemoContent, setMemoContent } from '../core/memoHelpers';
import {
	openCodingPopover,
	type AnchorSpec,
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
	private rebuildRafId: number | null = null;
	private isRebuilding = false;
	// True while CodeFormModal is open from "Add New Code". The popover closes to make
	// room for the modal, but the marker must survive (it still has zero codes until
	// the modal commits) — otherwise the just-drawn region vanishes mid-flow.
	private openingModal = false;

	constructor(app: App, model: ImageCodingModel, callbacks: CodingMenuCallbacks) {
		this.app = app;
		this.model = model;
		this.callbacks = callbacks;
	}

	isOpen(): boolean {
		return this.handle !== null;
	}

	private scheduleRebuild(markerId: string, anchor: AnchorSpec, isNew: boolean): void {
		if (this.rebuildRafId !== null) return;
		this.rebuildRafId = requestAnimationFrame(() => {
			this.rebuildRafId = null;
			this.open(markerId, anchor, isNew);
		});
	}

	open(markerId: string, anchor: AnchorSpec, isNew = false): void {
		const marker = this.model.findMarkerById(markerId);
		if (!marker) return;

		// Re-opening on top of an existing handle (rebuild after register-change, code created, etc).
		// onClose fires for the old handle but it's not a real user-driven close — skip auto-delete.
		this.isRebuilding = this.handle !== null;
		this.close();
		this.isRebuilding = false;

		const adapter: CodingPopoverAdapter = {
			registry: this.model.registry,
			getActiveCodes: () => {
				const m = this.model.findMarkerById(markerId);
				if (!m) return [];
				return m.codes
					.map(c => this.model.registry.getById(c.codeId)?.name)
					.filter((n): n is string => !!n);
			},
			addCode: (name) => {
				let def = this.model.registry.getByName(name);
				if (!def) def = this.model.registry.create(name);
				this.model.addCodeToMarker(markerId, def.id);
			},
			removeCode: (name) => {
				const def = this.model.registry.getByName(name);
				if (def) this.model.removeCodeFromMarker(markerId, def.id, true);
			},
			getMemo: () => getMemoContent(this.model.findMarkerById(markerId)?.memo),
			setMemo: (value) => {
				const m = this.model.findMarkerById(markerId);
				if (m) {
					m.memo = setMemoContent(m.memo, value);
					m.updatedAt = Date.now();
					this.model.saveMarkers();
				}
			},
			getMagnitudeForCode: (codeId) => {
				const m = this.model.findMarkerById(markerId);
				if (!m) return undefined;
				return findCodeApplication(m.codes, codeId)?.magnitude;
			},
			setMagnitudeForCode: (codeId, value) => {
				const m = this.model.findMarkerById(markerId);
				if (!m) return;
				m.codes = setMagnitude(m.codes, codeId, value);
				m.updatedAt = Date.now();
				this.model.saveMarkers();
			},
			getRelationsForCode: (codeId) => {
				const m = this.model.findMarkerById(markerId);
				return findCodeApplication(m?.codes ?? [], codeId)?.relations ?? [];
			},
			setRelationsForCode: (codeId, relations) => {
				const m = this.model.findMarkerById(markerId);
				if (!m) return;
				const ca = findCodeApplication(m.codes, codeId);
				if (ca) {
					ca.relations = relations.length > 0 ? relations : undefined;
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
			anchor,
			app: this.app,
			isHoverMode: true,
			// Image popovers always come from intentional clicks (shape-created or selection),
			// never passive hover, so force focus regardless of isHoverMode default.
			autoFocus: true,
			showMagnitudeSection: this.model.dataManager.section('general').showMagnitudeInPopover,
			showRelationsSection: this.model.dataManager.section('general').showRelationsInPopover,
			className: 'codemarker-popover',
			deleteAction: {
				label: 'Remove Region',
				icon: 'trash-2',
				onDelete: () => {
					this.callbacks.onRegionDeleted(markerId);
				},
			},
			onClose: () => {
				const skipVanish = this.isRebuilding || this.openingModal;
				this.handle = null;
				if (skipVanish) return;
				// A shape with zero codes is a ghost — user dismissed the popover without
				// committing to a code, so drop the region too.
				const m = this.model.findMarkerById(markerId);
				if (m && m.codes.length === 0) {
					this.callbacks.onRegionDeleted(markerId);
				}
			},
			onRebuild: () => this.scheduleRebuild(markerId, anchor, isNew),
			onBeforeModal: () => { this.openingModal = true; },
			onModalClose: () => {
				this.openingModal = false;
				// Reopen popover so user sees the new code already applied
				// (Add New Code calls adapter.addCode on submit before this fires).
				this.scheduleRebuild(markerId, anchor, isNew);
			},
		};

		this.handle = openCodingPopover(adapter, options);
	}

	close(): void {
		if (this.rebuildRafId !== null) {
			cancelAnimationFrame(this.rebuildRafId);
			this.rebuildRafId = null;
		}
		if (this.handle) {
			this.handle.close();
			this.handle = null;
		}
	}

	destroy(): void {
		this.close();
	}
}
