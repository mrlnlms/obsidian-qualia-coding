/**
 * Shared media coding popover — used by both Audio and Video engines.
 * Delegates to the shared openCodingPopover() with a media-specific adapter.
 */

import type { App } from 'obsidian';
import type { MediaMarker } from './mediaTypes';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { DataManager } from '../core/dataManager';
import type { MediaRegionRenderer } from './regionRenderer';
import { getMemoContent, setMemoContent } from '../core/memoHelpers';
import { findCodeApplication, setMagnitude } from '../core/codeApplicationHelpers';
import {
	openCodingPopover,
	type CodingPopoverAdapter,
	type CodingPopoverOptions,
} from '../core/codingPopover';

/** Minimal model interface required by the media coding popover. */
export interface MediaMenuModel<M extends MediaMarker = MediaMarker> {
	registry: CodeDefinitionRegistry;
	readonly dm: DataManager;
	findExistingMarker(filePath: string, from: number, to: number): M | undefined;
	findOrCreateMarker(filePath: string, from: number, to: number): M;
	addCodeToMarker(markerId: string, codeId: string): void;
	removeCodeFromMarker(markerId: string, codeId: string, silent?: boolean): void;
	removeMarker(markerId: string): boolean;
	notify(): void;
	save(): void;
}

export function openMediaCodingPopover(
	mouseEvent: MouseEvent,
	model: MediaMenuModel,
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
		getActiveCodes: () => {
			if (!existingMarker) return [];
			return existingMarker.codes
				.map(c => model.registry.getById(c.codeId)?.name)
				.filter((n): n is string => !!n);
		},
		addCode: (name) => {
			let def = model.registry.getByName(name);
			if (!def) def = model.registry.create(name);
			const m = getMarker();
			model.addCodeToMarker(m.id, def.id);
			regionRenderer.refreshRegion(m.id);
		},
		removeCode: (name) => {
			const def = model.registry.getByName(name);
			if (!def) return;
			const m = getMarker();
			model.removeCodeFromMarker(m.id, def.id, true);
			regionRenderer.refreshRegion(m.id);
		},
		getMemo: () => {
			const m = model.findExistingMarker(filePath, regionStart, regionEnd);
			return getMemoContent(m?.memo);
		},
		setMemo: (value) => {
			const m = getMarker();
			m.memo = setMemoContent(m.memo, value);
			m.updatedAt = Date.now();
			model.save();
		},
		getMagnitudeForCode: (codeId) => {
			const m = model.findExistingMarker(filePath, regionStart, regionEnd);
			if (!m) return undefined;
			return findCodeApplication(m.codes, codeId)?.magnitude;
		},
		setMagnitudeForCode: (codeId, value) => {
			const m = getMarker();
			m.codes = setMagnitude(m.codes, codeId, value);
			m.updatedAt = Date.now();
			model.save();
		},
		getRelationsForCode: (codeId) => {
			const m = model.findExistingMarker(filePath, regionStart, regionEnd);
			return findCodeApplication(m?.codes ?? [], codeId)?.relations ?? [];
		},
		setRelationsForCode: (codeId, relations) => {
			const m = model.findExistingMarker(filePath, regionStart, regionEnd);
			if (!m) return;
			const ca = findCodeApplication(m.codes, codeId);
			if (ca) {
				ca.relations = relations.length > 0 ? relations : undefined;
				m.updatedAt = Date.now();
				model.save();
			}
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
		showMagnitudeSection: model.dm.section('general').showMagnitudeInPopover,
		showRelationsSection: model.dm.section('general').showRelationsInPopover,
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
			openMediaCodingPopover(mouseEvent, model, filePath, regionStart, regionEnd, regionRenderer, onDismissEmpty, app, pos);
		},
		deleteAction: isHoverMode ? {
			label: 'Remove Region',
			icon: 'trash',
			onDelete: () => {
				if (existingMarker) {
					for (const ca of [...existingMarker.codes]) {
						model.removeCodeFromMarker(existingMarker.id, ca.codeId);
					}
					regionRenderer.removeRegion(existingMarker.id);
				}
			},
		} : undefined,
	};

	openCodingPopover(adapter, options);
}
