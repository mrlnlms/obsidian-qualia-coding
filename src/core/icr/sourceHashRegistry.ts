/**
 * SourceHashRegistry — stateful registry de hashes por source.
 *
 * Compute lazy on first access via getOrCompute(). Recompute forçado via recompute()
 * (caller decide quando — geralmente em vault.on('modify')). Eventos:
 * - 'compute': hash computado pela primeira vez
 * - 'recompute': hash recomputado E mudou (não emite se mesmo hash)
 * - 'rename': entry movida de oldFileId pra fileId
 * - 'remove': entry deletada
 *
 * Pattern: classe stateful com Map<fileId, SourceHashEntry>, addOnMutate listeners,
 * toJSON/fromJSON round-trip. Mesmo shape de CoderRegistry / CodeDefinitionRegistry.
 */

import type { SourceHashEntry } from './sourceHashTypes';
import { computeSourceHash } from './computeSourceHash';

interface VaultLike {
	adapter: {
		readBinary(path: string): Promise<ArrayBuffer>;
	};
}

export type SourceHashMutationEvent =
	| { type: 'compute'; fileId: string }
	| { type: 'recompute'; fileId: string; oldHash: string; newHash: string }
	| { type: 'remove'; fileId: string }
	| { type: 'rename'; fileId: string; oldFileId: string };

export class SourceHashRegistry {
	private entries: Map<string, SourceHashEntry> = new Map();
	private mutateListeners: Set<(e: SourceHashMutationEvent) => void> = new Set();
	private vault: VaultLike;

	constructor(vault: VaultLike) {
		this.vault = vault;
	}

	private emit(event: SourceHashMutationEvent): void {
		for (const fn of this.mutateListeners) fn(event);
	}

	addOnMutate(fn: (e: SourceHashMutationEvent) => void): void {
		this.mutateListeners.add(fn);
	}

	removeOnMutate(fn: (e: SourceHashMutationEvent) => void): void {
		this.mutateListeners.delete(fn);
	}

	/** Get cached hash, or compute if absent. */
	async getOrCompute(fileId: string): Promise<string> {
		const existing = this.entries.get(fileId);
		if (existing) return existing.hash;
		const buffer = await this.vault.adapter.readBinary(fileId);
		const hash = await computeSourceHash(buffer);
		const entry: SourceHashEntry = { hash, computedAt: Date.now(), fileSize: buffer.byteLength };
		this.entries.set(fileId, entry);
		this.emit({ type: 'compute', fileId });
		return hash;
	}

	/** Force recompute. Returns whether hash changed. Emite 'recompute' event só se mudou. */
	async recompute(fileId: string): Promise<{ changed: boolean; oldHash?: string; newHash: string }> {
		const old = this.entries.get(fileId);
		const buffer = await this.vault.adapter.readBinary(fileId);
		const newHash = await computeSourceHash(buffer);
		const newEntry: SourceHashEntry = { hash: newHash, computedAt: Date.now(), fileSize: buffer.byteLength };
		this.entries.set(fileId, newEntry);
		const changed = !old || old.hash !== newHash;
		if (changed && old) {
			this.emit({ type: 'recompute', fileId, oldHash: old.hash, newHash });
		} else if (!old) {
			this.emit({ type: 'compute', fileId });
		}
		return { changed, oldHash: old?.hash, newHash };
	}

	getEntry(fileId: string): SourceHashEntry | null {
		return this.entries.get(fileId) ?? null;
	}

	setEntry(fileId: string, entry: SourceHashEntry): void {
		this.entries.set(fileId, entry);
	}

	removeEntry(fileId: string): void {
		if (this.entries.delete(fileId)) {
			this.emit({ type: 'remove', fileId });
		}
	}

	renameEntry(oldFileId: string, newFileId: string): void {
		const entry = this.entries.get(oldFileId);
		if (!entry) return;
		this.entries.delete(oldFileId);
		this.entries.set(newFileId, entry);
		this.emit({ type: 'rename', fileId: newFileId, oldFileId });
	}

	/** Returns all fileIds with the given hash. Usado pra dedup em QDPX import. */
	findByHash(hash: string): string[] {
		const result: string[] = [];
		for (const [fileId, entry] of this.entries) {
			if (entry.hash === hash) result.push(fileId);
		}
		return result;
	}

	getAllFileIds(): string[] {
		return Array.from(this.entries.keys());
	}

	toJSON(): Record<string, SourceHashEntry> {
		const obj: Record<string, SourceHashEntry> = {};
		for (const [fileId, entry] of this.entries) obj[fileId] = entry;
		return obj;
	}

	static fromJSON(
		json: Record<string, SourceHashEntry> | null | undefined,
		vault: VaultLike,
	): SourceHashRegistry {
		const r = new SourceHashRegistry(vault);
		if (!json) return r;
		for (const [fileId, entry] of Object.entries(json)) {
			r.entries.set(fileId, entry);
		}
		return r;
	}
}
