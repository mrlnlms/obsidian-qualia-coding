/**
 * mergeModal — Merge logic + modal UI for combining codes.
 *
 * executeMerge: reassigns markers from source codes to destination,
 * reparents children, records mergedFrom, deletes sources.
 *
 * MergeModal: Obsidian Modal with search, chips, impact preview.
 */

import { Modal, type App, setIcon } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { BaseMarker } from './types';
import { hasCode, removeCodeApplication, addCodeApplication } from './codeApplicationHelpers';

// ─── Merge Logic ─────────────────────────────────────────────

export interface MergeParams {
	destinationId: string;
	sourceIds: string[];
	registry: CodeDefinitionRegistry;
	markers: BaseMarker[];
	destinationName?: string;
	destinationParentId?: string;
}

export interface MergeResult {
	updatedMarkers: BaseMarker[];
	affectedCount: number;
}

export function executeMerge(params: MergeParams): MergeResult {
	const { destinationId, sourceIds, registry, markers, destinationName, destinationParentId } = params;
	let affectedCount = 0;

	// 1. Reassign markers
	for (const marker of markers) {
		let touched = false;
		for (const srcId of sourceIds) {
			if (hasCode(marker.codes, srcId)) {
				marker.codes = removeCodeApplication(marker.codes, srcId);
				if (!hasCode(marker.codes, destinationId)) {
					marker.codes = addCodeApplication(marker.codes, destinationId);
				}
				touched = true;
			}
		}
		if (touched) affectedCount++;
	}

	// 2. Reparent children of sources to destination
	for (const srcId of sourceIds) {
		const srcDef = registry.getById(srcId);
		if (srcDef) {
			for (const childId of [...srcDef.childrenOrder]) {
				registry.setParent(childId, destinationId);
			}
		}
	}

	// 3. Record mergedFrom + union dos groups (target + todos sources).
	//    Roda ANTES do step 5 (delete sources) — snapshot pego enquanto srcDef ainda existe.
	const destDef = registry.getById(destinationId);
	if (destDef) {
		if (!destDef.mergedFrom) destDef.mergedFrom = [];
		destDef.mergedFrom.push(...sourceIds);
		destDef.updatedAt = Date.now();

		const unionGroups = new Set<string>(destDef.groups ?? []);
		for (const srcId of sourceIds) {
			const srcDef = registry.getById(srcId);
			if (srcDef?.groups) {
				for (const gid of srcDef.groups) unionGroups.add(gid);
			}
		}
		if (unionGroups.size > 0) {
			destDef.groups = Array.from(unionGroups);
		}
	}

	// 4. Update destination name/parent if specified
	if (destinationName) registry.update(destinationId, { name: destinationName });
	if (destinationParentId !== undefined) registry.setParent(destinationId, destinationParentId || undefined);

	// 5. Delete source codes
	for (const srcId of sourceIds) registry.delete(srcId);

	return { updatedMarkers: markers, affectedCount };
}

// ─── Merge Modal UI ──────────────────────────────────────────

export interface MergeModalOptions {
	app: App;
	registry: CodeDefinitionRegistry;
	initialDestinationId: string;
	allMarkers: BaseMarker[];
	onConfirm: (destId: string, srcIds: string[], name?: string, parentId?: string) => void;
}

export class MergeModal extends Modal {
	private registry: CodeDefinitionRegistry;
	private destinationId: string;
	private allMarkers: BaseMarker[];
	private onConfirm: MergeModalOptions['onConfirm'];
	private sourceIds: Set<string> = new Set();

	constructor(options: MergeModalOptions) {
		super(options.app);
		this.registry = options.registry;
		this.destinationId = options.initialDestinationId;
		this.allMarkers = options.allMarkers;
		this.onConfirm = options.onConfirm;
	}

	/** Pre-add a source code before opening (used by drag-drop merge). */
	addSource(codeId: string): void {
		if (codeId !== this.destinationId) {
			this.sourceIds.add(codeId);
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('codebook-merge-modal');

		const destDef = this.registry.getById(this.destinationId);
		if (!destDef) { this.close(); return; }

		// Title
		contentEl.createEl('h3', { text: `Merge into "${destDef.name}"` });

		// Search for source codes
		contentEl.createEl('label', { text: 'Codes to merge:', cls: 'setting-item-name' });
		const searchInput = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Search codes...',
			cls: 'codebook-merge-name-input',
		});

		const chipContainer = contentEl.createDiv({ cls: 'codebook-merge-source-list' });
		const resultsContainer = contentEl.createDiv({ cls: 'codebook-merge-search-results' });

		// Destination name
		contentEl.createEl('label', { text: 'Destination name:', cls: 'setting-item-name' });
		const nameInput = contentEl.createEl('input', {
			type: 'text',
			value: destDef.name,
			cls: 'codebook-merge-name-input',
		});
		nameInput.value = destDef.name;

		// Top-level checkbox
		const checkWrap = contentEl.createDiv({ cls: 'setting-item' });
		const checkLabel = checkWrap.createEl('label', { cls: 'setting-item-name' });
		const topLevelCheck = checkLabel.createEl('input', { type: 'checkbox' });
		checkLabel.appendText(' Move to top-level');
		topLevelCheck.checked = !destDef.parentId;

		// Impact text
		const impactEl = contentEl.createDiv({ cls: 'codebook-merge-impact' });

		// Action buttons
		const actionsEl = contentEl.createDiv({ cls: 'codebook-merge-actions' });
		const cancelBtn = actionsEl.createEl('button', { text: 'Cancel' });
		const mergeBtn = actionsEl.createEl('button', { text: 'Merge', cls: 'mod-cta' });

		// Helpers
		const updateChips = () => {
			chipContainer.empty();
			for (const srcId of this.sourceIds) {
				const srcDef = this.registry.getById(srcId);
				if (!srcDef) continue;
				const chip = chipContainer.createDiv({ cls: 'codebook-merge-chip' });
				chip.createSpan({ text: srcDef.name });

				const count = this.allMarkers.filter(m => hasCode(m.codes, srcId)).length;
				if (count > 0) {
					chip.createSpan({ text: `(${count})`, cls: 'codebook-merge-chip-count' });
				}

				const removeBtn = chip.createSpan({ cls: 'codebook-merge-chip-remove' });
				setIcon(removeBtn, 'x');
				removeBtn.addEventListener('click', () => {
					this.sourceIds.delete(srcId);
					updateChips();
					updateResults(searchInput.value);
					updateImpact();
				});
			}
		};

		const updateResults = (query: string) => {
			resultsContainer.empty();
			if (!query.trim()) return;

			const lowerQuery = query.toLowerCase();
			const allCodes = this.registry.getAll();
			const filtered = allCodes.filter(d =>
				d.id !== this.destinationId &&
				!this.sourceIds.has(d.id) &&
				d.name.toLowerCase().includes(lowerQuery),
			);

			for (const codeDef of filtered.slice(0, 20)) {
				const item = resultsContainer.createDiv({ cls: 'codebook-merge-search-item' });
				const swatch = item.createSpan();
				swatch.style.width = '12px';
				swatch.style.height = '12px';
				swatch.style.borderRadius = '50%';
				swatch.style.backgroundColor = codeDef.color;
				swatch.style.flexShrink = '0';
				item.createSpan({ text: codeDef.name });

				const count = this.allMarkers.filter(m => hasCode(m.codes, codeDef.id)).length;
				if (count > 0) {
					item.createSpan({ text: `(${count})`, cls: 'codebook-merge-chip-count' });
				}

				item.addEventListener('click', () => {
					this.sourceIds.add(codeDef.id);
					searchInput.value = '';
					resultsContainer.empty();
					updateChips();
					updateImpact();
				});
			}
		};

		const updateImpact = () => {
			if (this.sourceIds.size === 0) {
				impactEl.textContent = 'Select codes to merge.';
				mergeBtn.disabled = true;
				return;
			}

			const srcArr = Array.from(this.sourceIds);
			let affected = 0;
			for (const m of this.allMarkers) {
				if (srcArr.some(sid => hasCode(m.codes, sid))) affected++;
			}
			impactEl.textContent = `${affected} segment${affected !== 1 ? 's' : ''} will be reassigned.`;
			mergeBtn.disabled = false;
		};

		// Events
		searchInput.addEventListener('input', () => updateResults(searchInput.value));

		cancelBtn.addEventListener('click', () => this.close());
		mergeBtn.addEventListener('click', () => {
			if (this.sourceIds.size === 0) return;
			const newName = nameInput.value.trim() !== destDef.name ? nameInput.value.trim() : undefined;
			const parentId = topLevelCheck.checked ? '' : undefined;
			this.onConfirm(
				this.destinationId,
				Array.from(this.sourceIds),
				newName || undefined,
				parentId,
			);
			this.close();
		});

		// Initial state (render pre-added sources from addSource())
		updateChips();
		updateImpact();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
