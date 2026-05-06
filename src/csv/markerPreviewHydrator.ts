/**
 * MarkerPreviewHydrator — orchestrator stateful que popula `csvModel.markerTextCache`
 * em background pra arquivos lazy ainda não hidratados.
 *
 * Trigger: consumers (Code Explorer, Code Detail, Smart Code list/detail, Memo View)
 * chamam `requestHydration(fileId)` per-file durante render. Hydrator dedupe via
 * `seen: Set<fileId>` e `inflight: Map<fileId, Promise>`.
 *
 * Re-render: ao completar batch com `addedCount > 0`, chama
 * `csvModel.notifyListenersOnly()` debounced via RAF — pattern existente.
 *
 * Status indicator: canal próprio via `onStatusChange` (UI separada do markerText).
 *
 * Spec: docs/superpowers/specs/20260506-sidebar-markertext-preview-lazy-design.md
 */

import { TFile, FileSystemAdapter } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import type { CsvCodingModel } from './csvCodingModel';
import {
	DuckDBRowProvider,
	isOpfsCached,
	openOPFSFile,
	opfsKeyFor,
	copyVaultFileToOPFS,
	type TabularFileType,
} from './duckdb';

export interface HydrationOutcome {
	fileId: string;
	status: 'success' | 'error' | 'skipped';
	reason?: string;
	addedCount?: number;
}

export interface HydrationStatus {
	inflightCount: number;
	totalSeen: number;
	completedCount: number;
}

const DISPOSE_TIMEOUT_MS = 5000;

export class MarkerPreviewHydrator {
	private seen = new Set<string>();
	private inflight = new Map<string, Promise<HydrationOutcome>>();
	private errors = new Map<string, string>();
	private statusListeners = new Set<(s: HydrationStatus) => void>();
	private notifyScheduled: number | null = null;
	private disposed = false;

	constructor(
		private plugin: QualiaCodingPlugin,
		private csvModel: CsvCodingModel,
	) {}

	getStatus(): HydrationStatus {
		return {
			inflightCount: this.inflight.size,
			totalSeen: this.seen.size + this.inflight.size,
			completedCount: this.seen.size,
		};
	}

	onStatusChange(listener: (s: HydrationStatus) => void): () => void {
		this.statusListeners.add(listener);
		return () => { this.statusListeners.delete(listener); };
	}

	markSeen(fileId: string): void {
		this.seen.add(fileId);
		this.emitStatus();
	}

	reset(): void {
		this.seen.clear();
		this.errors.clear();
		this.emitStatus();
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		if (this.notifyScheduled !== null) {
			cancelAnimationFrame(this.notifyScheduled);
			this.notifyScheduled = null;
		}
		if (this.inflight.size > 0) {
			const all = Promise.all(this.inflight.values());
			const timeout = new Promise<void>(resolve => setTimeout(resolve, DISPOSE_TIMEOUT_MS));
			await Promise.race([all, timeout]);
			if (this.inflight.size > 0) {
				console.warn('[markerPreviewHydrator] dispose timed out — abandoning', this.inflight.size, 'inflight batches');
			}
		}
		this.statusListeners.clear();
	}

	requestHydration(fileId: string): Promise<HydrationOutcome> {
		console.log('[hyd] requestHydration', fileId, { disposed: this.disposed, seen: this.seen.has(fileId), inflight: this.inflight.has(fileId) });
		if (this.disposed) {
			return Promise.resolve({ fileId, status: 'skipped', reason: 'disposed' });
		}
		if (this.seen.has(fileId)) {
			return Promise.resolve({ fileId, status: 'skipped', reason: 'already seen' });
		}
		const existing = this.inflight.get(fileId);
		if (existing) return existing;

		// Wrapper IIFE garante que `inflight.set` ocorre ANTES de qualquer execução de
		// runBatch, e `inflight.delete` SÓ no finally do wrapper. Sem isso, eager path
		// (síncrono, sem await) deletava do inflight antes do set acontecer — fileId
		// ficava preso permanente no Map (causa do bug do indicador travado em "2/3").
		const promise = (async () => {
			let outcome: HydrationOutcome;
			try {
				outcome = await this.runBatch(fileId);
				if (outcome.status !== 'error') this.seen.add(fileId);
			} finally {
				this.inflight.delete(fileId);
				this.emitStatus();
			}
			console.log('[hyd] requestHydration outcome', fileId, outcome.status, outcome.reason, outcome.addedCount);
			if (outcome.status === 'success' && (outcome.addedCount ?? 0) > 0) {
				this.scheduleNotify();
			}
			return outcome;
		})();
		this.inflight.set(fileId, promise);
		this.emitStatus();
		return promise;
	}

	private async runBatch(fileId: string): Promise<HydrationOutcome> {
		try {
			if (!this.isLazyFile(fileId)) {
				console.log('[hyd] runBatch eager-skip', fileId);
				return { fileId, status: 'skipped', reason: 'eager mode' };
			}
			console.log('[hyd] runBatch lazy-start', fileId);
			return await this.runLazyBatch(fileId);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn('[hyd] runBatch THREW', fileId, msg);
			this.errors.set(fileId, msg);
			return { fileId, status: 'error', reason: msg };
		}
	}

	private async runLazyBatch(fileId: string): Promise<HydrationOutcome> {
		const existing = this.csvModel.getLazyProvider(fileId);
		console.log('[hyd] runLazyBatch provider-check', fileId, { existingProvider: !!existing });
		if (existing) {
			const added = await this.csvModel.populateMissingMarkerTextsForFile(fileId, existing);
			console.log('[hyd] runLazyBatch reused-provider populated', fileId, { added });
			return {
				fileId,
				status: added > 0 ? 'success' : 'skipped',
				reason: added === 0 ? 'no rows matched markers' : undefined,
				addedCount: added,
			};
		}

		// Hydrator-owned provider path.
		const af = this.plugin.app.vault.getAbstractFileByPath(fileId);
		if (!(af instanceof TFile)) {
			console.log('[hyd] runLazyBatch file-missing', fileId);
			return { fileId, status: 'skipped', reason: 'file missing' };
		}
		const ext = af.extension;
		if (ext !== 'csv' && ext !== 'parquet') {
			return { fileId, status: 'skipped', reason: 'not tabular' };
		}
		const adapter = this.plugin.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			return { fileId, status: 'skipped', reason: 'no FileSystemAdapter (mobile or virtual vault)' };
		}
		const absPath = adapter.getFullPath(fileId);
		const vaultId = (this.plugin.app.vault as unknown as { getName: () => string }).getName?.() ?? 'default';
		const opfsKey = opfsKeyFor(vaultId, fileId);

		const cached = await isOpfsCached(opfsKey, af.stat.mtime).catch(() => false);
		console.log('[hyd] runLazyBatch opfs-check', fileId, { cached, sizeBytes: af.stat.size });
		const t0 = performance.now();
		const handle = cached
			? await openOPFSFile(opfsKey)
			: await copyVaultFileToOPFS(absPath, opfsKey, af.stat.mtime);
		console.log('[hyd] runLazyBatch opfs-handle-ready', fileId, { ms: (performance.now() - t0).toFixed(0) });

		const t1 = performance.now();
		const runtime = await this.plugin.getDuckDB();
		console.log('[hyd] runLazyBatch duckdb-ready', fileId, { ms: (performance.now() - t1).toFixed(0) });

		const fileType: TabularFileType = ext === 'parquet' ? 'parquet' : 'csv';
		const t2 = performance.now();
		const provider = await DuckDBRowProvider.create({ runtime, fileHandle: handle, fileType });
		console.log('[hyd] runLazyBatch provider-created', fileId, { ms: (performance.now() - t2).toFixed(0) });
		try {
			const t3 = performance.now();
			const added = await this.csvModel.populateMissingMarkerTextsForFile(fileId, provider);
			console.log('[hyd] runLazyBatch populated', fileId, { added, ms: (performance.now() - t3).toFixed(0) });
			return {
				fileId,
				status: added > 0 ? 'success' : 'skipped',
				reason: added === 0 ? 'no rows matched markers' : undefined,
				addedCount: added,
			};
		} finally {
			await provider.dispose().catch(() => undefined);
		}
	}

	private isLazyFile(fileId: string): boolean {
		const af = this.plugin.app.vault.getAbstractFileByPath(fileId);
		if (!(af instanceof TFile)) return false;
		const ext = af.extension;
		if (ext !== 'csv' && ext !== 'parquet') return false;
		const settings = (this.plugin.dataManager.section('csv') as { settings?: { parquetSizeWarningMB?: number; csvSizeWarningMB?: number } }).settings ?? {};
		const thresholdMB = ext === 'parquet'
			? (settings.parquetSizeWarningMB ?? 50)
			: (settings.csvSizeWarningMB ?? 100);
		return af.stat.size > thresholdMB * 1024 * 1024;
	}

	private scheduleNotify(): void {
		if (this.notifyScheduled !== null) return;
		this.notifyScheduled = requestAnimationFrame(() => {
			this.notifyScheduled = null;
			if (!this.disposed) this.csvModel.notifyListenersOnly();
		});
	}

	private emitStatus(): void {
		const status = this.getStatus();
		for (const listener of this.statusListeners) listener(status);
	}
}
