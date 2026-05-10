/**
 * CoderRegistry — display estável + detalhes opcionais.
 *
 * Pattern: classe stateful, Map<id, Coder>, addOnMutate/removeOnMutate listeners,
 * toJSON/fromJSON round-trip. Mesmo shape de CodeDefinitionRegistry.
 *
 * Default coder seed (`human:default`) é criado on construct e ao restaurar de JSON
 * que não contenha o id (idempotente — não duplica se já existir).
 */

import type { Coder, CoderId } from './coderTypes';
import { DEFAULT_CODER_ID } from './coderTypes';

export class CoderRegistry {
	private coders: Map<CoderId, Coder> = new Map();
	private onMutateListeners: Set<() => void> = new Set();

	constructor() {
		this.seedDefault();
	}

	private seedDefault(): void {
		if (this.coders.has(DEFAULT_CODER_ID)) return;
		this.coders.set(DEFAULT_CODER_ID, {
			id: DEFAULT_CODER_ID,
			name: 'Default',
			type: 'human',
			createdAt: Date.now(),
		});
	}

	private emitMutate(): void {
		for (const fn of this.onMutateListeners) fn();
	}

	addOnMutate(fn: () => void): void {
		this.onMutateListeners.add(fn);
	}

	removeOnMutate(fn: () => void): void {
		this.onMutateListeners.delete(fn);
	}

	/** Cria/retorna coder humano. ID estável: `human:<lowercased-slug-of-name>`. */
	createHuman(name: string): Coder {
		const id: CoderId = `human:${name.toLowerCase().replace(/\s+/g, '-')}`;
		const existing = this.coders.get(id);
		if (existing) return existing;
		const coder: Coder = { id, name, type: 'human', createdAt: Date.now() };
		this.coders.set(id, coder);
		this.emitMutate();
		return coder;
	}

	/** Cria/retorna coder LLM. ID estável: `llm:<model>`. Detalhes (version, temperature, seed) preservados. */
	createLLM(opts: { model: string; version?: string; temperature?: number; seed?: number }): Coder {
		const id: CoderId = `llm:${opts.model}`;
		const existing = this.coders.get(id);
		if (existing) return existing;
		const coder: Coder = {
			id,
			name: opts.model,
			type: 'llm',
			model: opts.model,
			version: opts.version,
			temperature: opts.temperature,
			seed: opts.seed,
			createdAt: Date.now(),
		};
		this.coders.set(id, coder);
		this.emitMutate();
		return coder;
	}

	/** Cria/retorna coder consensus. ID estável: `consensus:<slug>`. Idempotente.
	 *  Convenção: 1 vault → 1 default (`'consensus:default'`); múltiplos permitidos pra waves. */
	createConsensus(slug: string, displayName?: string): Coder {
		const id: CoderId = `consensus:${slug}`;
		const existing = this.coders.get(id);
		if (existing) return existing;
		const coder: Coder = {
			id,
			name: displayName ?? `Consensus (${slug})`,
			type: 'consensus',
			createdAt: Date.now(),
		};
		this.coders.set(id, coder);
		this.emitMutate();
		return coder;
	}

	/** Coders elegíveis pra coding ativo. Exclui consensus (consensus marker é criado por executeReconciliationDecision). */
	getCodableCoders(): Coder[] {
		return this.getAll().filter(c => c.type !== 'consensus');
	}

	getById(id: CoderId): Coder | null {
		return this.coders.get(id) ?? null;
	}

	getAll(): Coder[] {
		return Array.from(this.coders.values());
	}

	has(id: CoderId): boolean {
		return this.coders.has(id);
	}

	toJSON(): { coders: Coder[] } {
		return { coders: this.getAll() };
	}

	static fromJSON(json: { coders?: Coder[] } | null | undefined): CoderRegistry {
		const r = new CoderRegistry();
		if (!json?.coders) return r;
		for (const c of json.coders) r.coders.set(c.id, c);
		// seedDefault já foi chamado no construct; idempotente.
		return r;
	}
}
