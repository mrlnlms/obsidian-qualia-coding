/**
 * Coalesce mutation events do `model.onMarkerMutation` em rAF batches e aplica
 * na temp table DuckDB via `QualiaMarkersTable.applyBatch`.
 *
 * Modo único (não tem incremental vs full rebuild). Pra mutations human-pace
 * (1-3 events em janelas de segundos) cada batch tem 1 event — overhead
 * irrelevante. Pra batches LLM (5k events em microsegundos) coalescem em 1
 * SQL bulk — DuckDB ingere milissegundos.
 *
 * Recovery: se applyBatch falhar mid-batch, dispose+rebuild a tabela inteira
 * a partir do data.json (source de verdade). Cheap e idempotente.
 *
 * Lifecycle alinhado ao QualiaMarkersTable: criado após table.build() succeed,
 * disposed antes de table.dispose(). Subscribe ao `model.onMarkerMutation`
 * via handler ref pra unsubscribe correto via `model.offMarkerMutation`.
 */

import type { CsvCodingModel } from "../csvCodingModel";
import type { MarkerMutationEvent } from "../../core/types";
import type { QualiaMarkersTable } from "./qualiaMarkersTable";

export class BatchedMutationApplier {
	private queue: MarkerMutationEvent[] = [];
	private rafHandle: number | null = null;
	private disposed = false;
	private handler: (event: MarkerMutationEvent) => void;

	constructor(
		private table: QualiaMarkersTable,
		private model: CsvCodingModel,
		private fileId: string,
		/** Optional: notification callback após drain. View usa pra refresh do grid (purgeInfiniteCache). */
		private onAfterDrain?: () => void,
	) {
		this.handler = (event) => this.enqueue(event);
		this.model.onMarkerMutation(this.handler);
	}

	private enqueue(event: MarkerMutationEvent): void {
		if (this.disposed) return;
		if (event.fileId !== this.fileId) return;
		this.queue.push(event);
		if (this.rafHandle === null) {
			this.rafHandle = requestAnimationFrame(() => void this.drain());
		}
	}

	private async drain(): Promise<void> {
		this.rafHandle = null;
		if (this.disposed) return;

		const batch = this.queue.splice(0);
		if (batch.length === 0) return;

		try {
			await this.table.applyBatch(batch);
		} catch (err) {
			console.error(
				"[qualia-markers-tmp] applyBatch failed, rebuilding from data.json",
				err,
			);
			try {
				await this.table.dispose();
				await this.table.build();
			} catch (rebuildErr) {
				console.error(
					"[qualia-markers-tmp] rebuild also failed; temp table is desync",
					rebuildErr,
				);
			}
		}

		this.onAfterDrain?.();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.model.offMarkerMutation(this.handler);
		if (this.rafHandle !== null) {
			cancelAnimationFrame(this.rafHandle);
			this.rafHandle = null;
		}
		this.queue = [];
	}
}
