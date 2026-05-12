/**
 * UnifiedIcrImportView — ItemView única que cobre todo o fluxo de import multi-coder
 * (Fase C P1). Layout: rail à esquerda (lista de contribuições pendentes + drop zone)
 * + main à direita (toolbar com chips + body que renderiza chip ativo).
 *
 * Reusa pattern qc-cc-mode-chip do unifiedCompareCodersView.ts.
 */

import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import type QualiaCodingPlugin from '../../../main';
import {
	createDefaultViewState,
	createEmptyOverrides,
	type IcrImportViewState,
	type PendingContribution,
	type ResolutionOverrides,
} from './contributionViewTypes';
import {
	cloneOverrides,
} from './contributionViewTypes';
import { renderRailContent } from './rail';
import { renderToolbarContent } from './importToolbar';
import { renderOverviewChip } from './overviewChip';
import { renderSideBySideChip } from './sideBySideChip';
import { renderByCodeChip, type ByCodeContext } from './byCodeChip';
import { parseContribution } from './contributionLoader';
import { mergeCoderContribution } from '../transport/mergeCoderContribution';
import { findOverlappingLocalMarkers, type EngineForOverlap } from './overlapHelper';

export const ICR_IMPORT_VIEW_TYPE = 'qc-icr-import';

export class UnifiedIcrImportView extends ItemView {
	private state: IcrImportViewState;

	private railEl!: HTMLElement;
	private mainEl!: HTMLElement;
	private toolbarEl!: HTMLElement;
	private bodyEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private plugin: QualiaCodingPlugin) {
		super(leaf);
		this.state = createDefaultViewState();
	}

	getViewType(): string { return ICR_IMPORT_VIEW_TYPE; }
	getDisplayText(): string { return 'ICR Import'; }
	getIcon(): string { return 'git-pull-request'; }

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('qc-icr-import-view');

		this.railEl = root.createDiv({ cls: 'qc-icr-import-rail' });
		this.mainEl = root.createDiv({ cls: 'qc-icr-import-main' });
		this.toolbarEl = this.mainEl.createDiv({ cls: 'qc-icr-import-toolbar' });
		this.bodyEl = this.mainEl.createDiv({ cls: 'qc-icr-import-body' });

		this.renderRail();
		this.renderMain();
		this.setupDropHandler();
		this.setupKeyboardNavigation();
	}

	private setupKeyboardNavigation(): void {
		this.registerDomEvent(this.contentEl, 'keydown', (e: KeyboardEvent) => {
			if (this.state.activeChip !== 'side-by-side') return;
			if (e.key === 'ArrowLeft') {
				this.updateState({ sideBySideIndex: Math.max(0, this.state.sideBySideIndex - 1) });
				e.preventDefault();
			} else if (e.key === 'ArrowRight') {
				this.updateState({ sideBySideIndex: this.state.sideBySideIndex + 1 });
				e.preventDefault();
			}
		});
	}

	private setupDropHandler(): void {
		const dropZone = this.railEl;

		this.registerDomEvent(dropZone, 'dragenter', (e: DragEvent) => {
			e.preventDefault();
			dropZone.addClass('is-drag-over');
		});
		this.registerDomEvent(dropZone, 'dragover', (e: DragEvent) => {
			e.preventDefault();
		});
		this.registerDomEvent(dropZone, 'dragleave', () => {
			dropZone.removeClass('is-drag-over');
		});
		this.registerDomEvent(dropZone, 'drop', async (e: DragEvent) => {
			e.preventDefault();
			dropZone.removeClass('is-drag-over');
			if (!e.dataTransfer) return;

			const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.json'));
			if (files.length === 0) {
				new Notice('ICR Import: só arquivos .json');
				return;
			}

			let lastValidId: string | null = null;
			for (const file of files) {
				const text = await file.text();
				const result = parseContribution(text);
				if (!result.payload) {
					new Notice(`${file.name}: ${result.errors.join('; ')}`);
					continue;
				}

				const overrides = createEmptyOverrides();
				const preview = await mergeCoderContribution(
					this.plugin.dataManager.getDataRef(),
					result.payload,
					this.plugin.sourceHashRegistry,
					{ dryRun: true, overrides },
				);

				const contrib: PendingContribution = {
					id: crypto.randomUUID(),
					payload: result.payload,
					sourcePath: file.name,
					mergePreview: preview,
					overrides,
				};
				this.addContribution(contrib);
				lastValidId = contrib.id;
			}

			if (lastValidId) {
				this.updateState({ activeId: lastValidId });
			}
		});
	}

	getViewState(): IcrImportViewState { return this.state; }

	updateState(partial: Partial<IcrImportViewState>): void {
		const prevActiveId = this.state.activeId;
		this.state = { ...this.state, ...partial };
		this.renderRail();
		this.renderMain();
		if (partial.activeId !== undefined && partial.activeId !== prevActiveId) {
			const active = this.state.pending.find(c => c.id === this.state.activeId);
			if (active) void this.prefetchSourceTexts(active);
		}
	}

	addContribution(contrib: PendingContribution): void {
		this.state.pending = [...this.state.pending, contrib];
		const becameActive = !this.state.activeId;
		if (becameActive) this.state.activeId = contrib.id;
		this.renderRail();
		this.renderMain();
		if (becameActive) void this.prefetchSourceTexts(contrib);
	}

	/**
	 * Pré-busca sourceText via vault.cachedRead pra arquivos markdown referenciados
	 * pela contribuição ativa. Popula `state.sourceTextByFileId` e re-renderiza.
	 * Markdown overlap (chips Lado a lado + Por código) usa esse cache; sem ele
	 * markdown markers caem em modo degraded (overlap retorna 0).
	 */
	private async prefetchSourceTexts(active: PendingContribution): Promise<void> {
		const map = new Map<string, string>();
		for (const [payloadFid, localFid] of Object.entries(active.mergePreview.fileIdRemap)) {
			const file = this.plugin.app.vault.getAbstractFileByPath(localFid);
			if (file && 'extension' in file && (file as { extension: string }).extension === 'md') {
				try {
					const text = await this.plugin.app.vault.cachedRead(file as Parameters<typeof this.plugin.app.vault.cachedRead>[0]);
					map.set(payloadFid, text);
				} catch {
					// File inacessível — pula silenciosamente (markdown overlap fica degraded só pra esse fileId)
				}
			}
		}
		if (this.state.activeId === active.id) {
			this.updateState({ sourceTextByFileId: map });
		}
	}

	private renderRail(): void {
		renderRailContent(
			this.railEl,
			this.state.pending,
			this.state.activeId,
			(id) => this.updateState({ activeId: id }),
		);
	}

	private renderMain(): void {
		this.toolbarEl.empty();
		this.bodyEl.empty();

		const active = this.state.pending.find(c => c.id === this.state.activeId);
		if (!active) {
			const empty = this.bodyEl.createDiv({ cls: 'qc-icr-empty' });
			empty.setText('selecione uma contribuição na lista');
			return;
		}

		renderToolbarContent(this.toolbarEl, active, this.state.activeChip, (chip) => {
			this.updateState({ activeChip: chip });
		});

		if (this.state.activeChip === 'overview') {
			renderOverviewChip(this.bodyEl, active, {
				onApply: () => { void this.applyContribution(active); },
				onDiscard: () => this.discardContribution(active.id),
				onOverridesChange: (overrides) => { void this.updateOverrides(active.id, overrides); },
			});
		} else if (this.state.activeChip === 'side-by-side') {
			const localMarkersByFileId = this.collectLocalMarkers(active);
			renderSideBySideChip(this.bodyEl, active, { localMarkersByFileId, sourceTextByFileId: this.state.sourceTextByFileId }, {
				currentIndex: this.state.sideBySideIndex,
				filter: this.state.sideBySideFilter,
				filterCodeId: this.state.sideBySideFilterCodeId,
				onSkipMarker: (markerId) => {
					const o = cloneOverrides(active.overrides);
					o.perMarkerSkip.add(markerId);
					void this.updateOverrides(active.id, o);
				},
				onNavigate: (delta) => {
					this.updateState({ sideBySideIndex: Math.max(0, this.state.sideBySideIndex + delta) });
				},
				onFilterChange: (f) => {
					this.updateState({ sideBySideFilter: f, sideBySideIndex: 0 });
				},
				onClearCodeFilter: () => {
					this.updateState({ sideBySideFilterCodeId: null, sideBySideIndex: 0 });
				},
			});
		} else if (this.state.activeChip === 'by-code') {
			const ctx = this.collectByCodeContext(active);
			renderByCodeChip(this.bodyEl, active, ctx, {
				onAcceptAllCode: (codeId) => {
					const o = cloneOverrides(active.overrides);
					o.perCodeSkip.delete(codeId);
					o.codebookOverrides.delete(codeId);
					void this.updateOverrides(active.id, o);
				},
				onSkipAllCode: (codeId) => {
					const o = cloneOverrides(active.overrides);
					o.perCodeSkip.add(codeId);
					// Spec §6: se code é novo (não existe local), também skipa do codebook
					const isNew = (ctx.localCountByCode[codeId] ?? 0) === 0;
					if (isNew) {
						o.codebookOverrides.set(codeId, 'skip');
					}
					void this.updateOverrides(active.id, o);
				},
				onRevise: (codeId) => {
					this.updateState({
						activeChip: 'side-by-side',
						sideBySideIndex: 0,
						sideBySideFilterCodeId: codeId,
					});
				},
			});
		}
	}

	private collectByCodeContext(contrib: PendingContribution): ByCodeContext {
		const localCountByCode: Record<string, number> = {};
		const overlapCountByCode: Record<string, number> = {};

		const data = this.plugin.dataManager.getDataRef();
		const allLocal = [
			...Object.values(data.markdown.markers).flat(),
			...data.pdf.markers,
			...data.csv.segmentMarkers,
		];

		for (const m of allLocal) {
			for (const c of (m as any).codes ?? []) {
				localCountByCode[c.codeId] = (localCountByCode[c.codeId] ?? 0) + 1;
			}
		}

		// Overlap real: pra cada incoming marker per fileId, conta 1 por codeId quando há
		// pelo menos um local com mesmo code sobrepondo espacialmente (extract*Range + computeOverlap).
		// Markdown depende de sourceTextByFileId pré-buscado; sem ele, markdown overlap = 0 (transitório).
		const localMarkersByFileId = this.collectLocalMarkers(contrib);
		for (const im of flattenIncomingMarkers(contrib)) {
			const overlapping = findOverlappingLocalMarkers(
				im.engine,
				im.marker,
				localMarkersByFileId[im.fileId] ?? [],
				this.state.sourceTextByFileId.get(im.fileId),
			);
			for (const c of (im.marker.codes ?? [])) {
				const codeId = c.codeId;
				const hasLocalOverlap = overlapping.some(l => ((l as any).codes ?? []).some((lc: any) => lc.codeId === codeId));
				if (hasLocalOverlap) {
					overlapCountByCode[codeId] = (overlapCountByCode[codeId] ?? 0) + 1;
				}
			}
		}

		return { localCountByCode, overlapCountByCode };
	}

	private collectLocalMarkers(contrib: PendingContribution): Record<string, any[]> {
		// Pega markers locais (de TODOS coders) por payloadFileId após remap.
		// Markdown overlap consome `state.sourceTextByFileId` (pré-fetched via prefetchSourceTexts).
		const out: Record<string, any[]> = {};
		const data = this.plugin.dataManager.getDataRef();
		for (const [payloadFid, localFid] of Object.entries(contrib.mergePreview.fileIdRemap)) {
			out[payloadFid] = [];
			const mdMarkers = data.markdown.markers[localFid] ?? [];
			out[payloadFid].push(...mdMarkers);
			out[payloadFid].push(...data.pdf.markers.filter((m: any) => m.fileId === localFid));
			out[payloadFid].push(...data.csv.segmentMarkers.filter((m: any) => m.fileId === localFid));
		}
		return out;
	}

	private async updateOverrides(contribId: string, overrides: ResolutionOverrides): Promise<void> {
		const idx = this.state.pending.findIndex(c => c.id === contribId);
		if (idx === -1) return;
		const contrib = this.state.pending[idx]!;

		const newPreview = await mergeCoderContribution(
			this.plugin.dataManager.getDataRef(),
			contrib.payload,
			this.plugin.sourceHashRegistry,
			{ dryRun: true, overrides },
		);

		const updated: PendingContribution = { ...contrib, overrides, mergePreview: newPreview };
		this.state.pending = this.state.pending.map((c, i) => i === idx ? updated : c);
		this.renderRail();
		this.renderMain();
	}

	private async applyContribution(contrib: PendingContribution): Promise<void> {
		const result = await mergeCoderContribution(
			this.plugin.dataManager.getDataRef(),
			contrib.payload,
			this.plugin.sourceHashRegistry,
			{ overrides: contrib.overrides },
		);

		this.plugin.dataManager.markDirty();

		new Notice(`ICR Import: ${result.added.markers} markers aplicados, ${result.pendingMarkers} skipped`);

		this.state.pending = this.state.pending.filter(c => c.id !== contrib.id);
		if (this.state.activeId === contrib.id) {
			this.state.activeId = this.state.pending[0]?.id ?? null;
		}

		// Recompute previews das restantes (cada uma vê o efeito da just-applied)
		for (const remaining of this.state.pending) {
			remaining.mergePreview = await mergeCoderContribution(
				this.plugin.dataManager.getDataRef(),
				remaining.payload,
				this.plugin.sourceHashRegistry,
				{ dryRun: true, overrides: remaining.overrides },
			);
		}

		this.renderRail();
		this.renderMain();
	}

	private discardContribution(id: string): void {
		this.state.pending = this.state.pending.filter(c => c.id !== id);
		if (this.state.activeId === id) {
			this.state.activeId = this.state.pending[0]?.id ?? null;
		}
		this.renderRail();
		this.renderMain();
	}
}

interface FlatIncomingMarker {
	engine: EngineForOverlap;
	marker: any;
	fileId: string;
}

function flattenIncomingMarkers(contrib: PendingContribution): FlatIncomingMarker[] {
	const out: FlatIncomingMarker[] = [];
	for (const [fid, markers] of Object.entries(contrib.payload.markers.markdown)) {
		for (const m of markers) out.push({ engine: 'markdown', marker: m, fileId: fid });
	}
	for (const m of contrib.payload.markers.pdf) out.push({ engine: 'pdf', marker: m, fileId: (m as any).fileId });
	for (const m of contrib.payload.markers.csvSegment) out.push({ engine: 'csvSegment', marker: m, fileId: (m as any).fileId });
	return out;
}
