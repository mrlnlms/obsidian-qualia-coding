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
		if (this.disposed) {
			return Promise.resolve({ fileId, status: 'skipped', reason: 'disposed' });
		}
		if (this.seen.has(fileId)) {
			return Promise.resolve({ fileId, status: 'skipped', reason: 'already seen' });
		}
		const existing = this.inflight.get(fileId);
		if (existing) return existing;

		const promise = this.runBatch(fileId);
		this.inflight.set(fileId, promise);
		this.emitStatus();
		return promise;
	}

	private async runBatch(fileId: string): Promise<HydrationOutcome> {
		let outcome: HydrationOutcome;
		try {
			if (!this.isLazyFile(fileId)) {
				outcome = { fileId, status: 'skipped', reason: 'eager mode' };
				this.seen.add(fileId);
			} else {
				outcome = await this.runLazyBatch(fileId);
				if (outcome.status !== 'error') this.seen.add(fileId);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.errors.set(fileId, msg);
			outcome = { fileId, status: 'error', reason: msg };
		} finally {
			this.inflight.delete(fileId);
			this.emitStatus();
		}
		if (outcome.status === 'success' && (outcome.addedCount ?? 0) > 0) {
			this.scheduleNotify();
		}
		return outcome;
	}

	private async runLazyBatch(fileId: string): Promise<HydrationOutcome> {
		// Provider reuse — encurtar janela entre getLazyProvider e populate.
		// Invariant: csvCodingView.onClose unregistra provider do Map ANTES de await dispose()
		// (csvCodingView.ts:772 → unregisterLazyProvider sync precede await rowProvider.dispose()).
		// Logo, getLazyProvider nunca retorna provider já-disposed. Race possível:
		// hydrator obtém ref → user fecha tab → csvCodingView dispose → provider.disposed=true
		// → trackedQuery.guard() throw. Tratado no catch genérico de runBatch como error path
		// (NÃO marca seen, retry próxima).
		const existing = this.csvModel.getLazyProvider(fileId);
		if (existing) {
			const added = await this.csvModel.populateMissingMarkerTextsForFile(fileId, existing);
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

		// Mesmo pattern de csvCodingView.setupLazyMode (linha 287-303): se OPFS já tem cópia
		// fresca, openOPFSFile retorna handle direto; senão copyVaultFileToOPFS baixa em
		// chunks de 1MB e retorna handle. Cold path (cenário primário) cai aqui.
		const cached = await isOpfsCached(opfsKey, af.stat.mtime).catch(() => false);
		const handle = cached
			? await openOPFSFile(opfsKey)
			: await copyVaultFileToOPFS(absPath, opfsKey, af.stat.mtime);

		const runtime = await this.plugin.getDuckDB();
		const fileType: TabularFileType = ext === 'parquet' ? 'parquet' : 'csv';
		const provider = await DuckDBRowProvider.create({ runtime, fileHandle: handle, fileType });
		try {
			const added = await this.csvModel.populateMissingMarkerTextsForFile(fileId, provider);
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
