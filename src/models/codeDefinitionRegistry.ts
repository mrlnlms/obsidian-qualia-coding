/**
 * CodeDefinition Registry — Per-code identity, color, and metadata.
 *
 * Foundation for downstream features: Code Explorer, Leaf View,
 * per-code decorations, margin panel. Codes are stored here
 * as first-class entities, not as bare strings in markers.
 */

export interface CodeDefinition {
	id: string;
	name: string;
	color: string;
	description?: string;
	createdAt: number;
	updatedAt: number;
}

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

		const def: CodeDefinition = {
			id: this.generateId(),
			name,
			color: color || this.consumeNextPaletteColor(),
			description: description || undefined,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		this.definitions.set(def.id, def);
		this.nameIndex.set(def.name, def.id);
		return def;
	}

	update(id: string, changes: Partial<Pick<CodeDefinition, 'name' | 'color' | 'description'>>): boolean {
		const def = this.definitions.get(id);
		if (!def) return false;

		if (changes.name !== undefined && changes.name !== def.name) {
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
		return true;
	}

	delete(id: string): boolean {
		const def = this.definitions.get(id);
		if (!def) return false;

		this.nameIndex.delete(def.name);
		this.definitions.delete(id);
		return true;
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
	 * Used by the decoration layer to derive marker highlight color.
	 */
	getColorForCodes(codeNames: string[]): string | null {
		for (const name of codeNames) {
			const def = this.getByName(name);
			if (def) return def.color;
		}
		return null;
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
				registry.definitions.set(id, def);
				registry.nameIndex.set(def.name, def.id);
			}
		}
		if (typeof data?.nextPaletteIndex === 'number') {
			registry.nextPaletteIndex = data.nextPaletteIndex;
		}

		return registry;
	}

	// --- Internal ---

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}
