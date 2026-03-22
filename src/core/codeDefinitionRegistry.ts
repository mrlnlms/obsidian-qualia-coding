/**
 * CodeDefinition Registry — Per-code identity, color, and metadata.
 *
 * Canonical copy — all engines import from here.
 */

import type { CodeDefinition } from './types';

// 12-color categorical palette — light/dark safe, high distinguishability
export const DEFAULT_PALETTE: string[] = [
	'#6200EE', // purple (legacy default)
	'#03DAC6', // teal
	'#CF6679', // pink
	'#FF9800', // orange
	'#4CAF50', // green
	'#2196F3', // blue
	'#F44336', // red
	'#FFEB3B', // yellow
	'#9C27B0', // deep purple
	'#00BCD4', // cyan
	'#8BC34A', // light green
	'#FF5722', // deep orange
];

export class CodeDefinitionRegistry {
	private definitions: Map<string, CodeDefinition> = new Map();
	private nameIndex: Map<string, string> = new Map(); // name → id
	private nextPaletteIndex: number = 0;
	private onMutateListeners: Set<() => void> = new Set();

	/** Register a callback invoked on every mutation (create/update/delete). */
	addOnMutate(fn: () => void): void {
		this.onMutateListeners.add(fn);
	}

	/** Unregister a previously registered mutation callback. */
	removeOnMutate(fn: () => void): void {
		this.onMutateListeners.delete(fn);
	}

	// --- CRUD ---

	getById(id: string): CodeDefinition | undefined {
		return this.definitions.get(id);
	}

	getByName(name: string): CodeDefinition | undefined {
		const id = this.nameIndex.get(name);
		if (id) return this.definitions.get(id);
		return undefined;
	}

	getAll(): CodeDefinition[] {
		return Array.from(this.definitions.values())
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	create(name: string, color?: string, description?: string): CodeDefinition {
		// If already exists, return existing
		const existing = this.getByName(name);
		if (existing) return existing;

		const assignedColor = color || this.consumeNextPaletteColor();
		const def: CodeDefinition = {
			id: this.generateId(),
			name,
			color: assignedColor,
			description: description || undefined,
			paletteIndex: color ? -1 : this.nextPaletteIndex - 1,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			childrenOrder: [],
		};

		this.definitions.set(def.id, def);
		this.nameIndex.set(def.name, def.id);
		for (const fn of this.onMutateListeners) fn();
		return def;
	}

	update(id: string, changes: Partial<Pick<CodeDefinition, 'name' | 'color' | 'description'>>): boolean {
		const def = this.definitions.get(id);
		if (!def) return false;

		if (changes.name !== undefined && changes.name !== def.name) {
			// Reject rename if target name already exists (prevents ghost codes)
			const collision = this.nameIndex.get(changes.name);
			if (collision !== undefined) return false;

			this.nameIndex.delete(def.name);
			def.name = changes.name;
			this.nameIndex.set(def.name, def.id);
		}
		if (changes.color !== undefined) {
			def.color = changes.color;
		}
		if (changes.description !== undefined) {
			def.description = changes.description || undefined;
		}
		def.updatedAt = Date.now();
		for (const fn of this.onMutateListeners) fn();
		return true;
	}

	delete(id: string): boolean {
		const def = this.definitions.get(id);
		if (!def) return false;

		this.nameIndex.delete(def.name);
		this.definitions.delete(id);
		for (const fn of this.onMutateListeners) fn();
		return true;
	}

	/** Remove all code definitions and reset palette index. */
	clear(): void {
		this.definitions.clear();
		this.nameIndex.clear();
		this.nextPaletteIndex = 0;
		for (const fn of this.onMutateListeners) fn();
	}

	// --- Palette ---

	/**
	 * Preview the next palette color without consuming it.
	 */
	peekNextPaletteColor(): string {
		return DEFAULT_PALETTE[this.nextPaletteIndex % DEFAULT_PALETTE.length]!;
	}

	/**
	 * Consume the next palette color and advance the index.
	 */
	private consumeNextPaletteColor(): string {
		const color = DEFAULT_PALETTE[this.nextPaletteIndex % DEFAULT_PALETTE.length]!;
		this.nextPaletteIndex++;
		return color;
	}

	// --- Color lookup for markers ---

	/**
	 * Returns the color of the first code (by name) found in the registry.
	 * @deprecated Use getColorForCodeIds instead.
	 */
	getColorForCodes(codeNames: string[]): string | null {
		for (const name of codeNames) {
			const def = this.getByName(name);
			if (def) return def.color;
		}
		return null;
	}

	/**
	 * Returns the color of the first code (by id) found in the registry.
	 * Used by the decoration layer to derive marker highlight color.
	 */
	getColorForCodeIds(codeIds: string[]): string | null {
		for (const id of codeIds) {
			const def = this.getById(id);
			if (def) return def.color;
		}
		return null;
	}

	// --- Hierarchy queries ---

	/** Returns all codes that have no parent (root-level codes). */
	getRootCodes(): CodeDefinition[] {
		return this.getAll().filter(d => !d.parentId);
	}

	/** Returns direct children of the given parent in childrenOrder. */
	getChildren(parentId: string): CodeDefinition[] {
		const parent = this.definitions.get(parentId);
		if (!parent) return [];
		return parent.childrenOrder
			.map(id => this.definitions.get(id))
			.filter((d): d is CodeDefinition => d !== undefined);
	}

	/** Returns ancestors bottom-up (parent first, then grandparent, etc.). */
	getAncestors(id: string): CodeDefinition[] {
		const ancestors: CodeDefinition[] = [];
		let current = this.definitions.get(id);
		while (current?.parentId) {
			const parent = this.definitions.get(current.parentId);
			if (!parent) break;
			ancestors.push(parent);
			current = parent;
		}
		return ancestors;
	}

	/** Returns all descendants depth-first. */
	getDescendants(id: string): CodeDefinition[] {
		const result: CodeDefinition[] = [];
		const visit = (parentId: string) => {
			for (const child of this.getChildren(parentId)) {
				result.push(child);
				visit(child.id);
			}
		};
		visit(id);
		return result;
	}

	/** Returns the depth of a code (0 for root). */
	getDepth(id: string): number {
		return this.getAncestors(id).length;
	}

	// --- Serialization ---

	toJSON(): { definitions: Record<string, CodeDefinition>; nextPaletteIndex: number } {
		const definitions: Record<string, CodeDefinition> = {};
		for (const [id, def] of this.definitions.entries()) {
			definitions[id] = def;
		}
		return { definitions, nextPaletteIndex: this.nextPaletteIndex };
	}

	static fromJSON(data: any): CodeDefinitionRegistry {
		const registry = new CodeDefinitionRegistry();

		if (data?.definitions) {
			for (const id in data.definitions) {
				const def = data.definitions[id] as CodeDefinition;
				// Garante consistencia entre key do JSON e def.id.
				// Se alguem editar data.json manualmente e mudar a key sem
				// atualizar def.id, o nameIndex apontaria pra um ID inexistente.
				def.id = id;
				if (!def.childrenOrder) def.childrenOrder = [];
				registry.definitions.set(id, def);
				registry.nameIndex.set(def.name, id);
			}
		}
		if (typeof data?.nextPaletteIndex === 'number') {
			registry.nextPaletteIndex = data.nextPaletteIndex;
		}

		return registry;
	}

	// --- Import / Sync ---

	/**
	 * Import an external CodeDefinition (e.g. from shared registry).
	 * Skips if a definition with the same name already exists.
	 */
	importDefinition(def: CodeDefinition): void {
		if (this.nameIndex.has(def.name)) return;
		this.definitions.set(def.id, { ...def, childrenOrder: def.childrenOrder ?? [] });
		this.nameIndex.set(def.name, def.id);
	}

	/**
	 * Set nextPaletteIndex to the max of current and given value.
	 */
	syncPaletteIndex(externalIndex: number): void {
		if (externalIndex > this.nextPaletteIndex) {
			this.nextPaletteIndex = externalIndex;
		}
	}

	// --- Internal ---

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}
