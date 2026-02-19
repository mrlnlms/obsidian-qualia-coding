/**
 * CodeDefinition Registry — Per-code identity, color, and metadata.
 * Identical to codemarker-v2 and codemarker-csv registries.
 */

export interface CodeDefinition {
	id: string;
	name: string;
	color: string;
	description?: string;
	createdAt: number;
	updatedAt: number;
}

export const DEFAULT_PALETTE: string[] = [
	'#6200EE', '#03DAC6', '#CF6679', '#FF9800', '#4CAF50', '#2196F3',
	'#F44336', '#FFEB3B', '#9C27B0', '#00BCD4', '#8BC34A', '#FF5722',
];

export class CodeDefinitionRegistry {
	private definitions: Map<string, CodeDefinition> = new Map();
	private nameIndex: Map<string, string> = new Map();
	private nextPaletteIndex: number = 0;

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
		if (changes.color !== undefined) def.color = changes.color;
		if (changes.description !== undefined) def.description = changes.description || undefined;
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

	peekNextPaletteColor(): string {
		return DEFAULT_PALETTE[this.nextPaletteIndex % DEFAULT_PALETTE.length]!;
	}

	private consumeNextPaletteColor(): string {
		const color = DEFAULT_PALETTE[this.nextPaletteIndex % DEFAULT_PALETTE.length]!;
		this.nextPaletteIndex++;
		return color;
	}

	getColorForCodes(codeNames: string[]): string | null {
		for (const name of codeNames) {
			const def = this.getByName(name);
			if (def) return def.color;
		}
		return null;
	}

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

	importDefinition(def: CodeDefinition): void {
		if (this.nameIndex.has(def.name)) return;
		this.definitions.set(def.id, { ...def });
		this.nameIndex.set(def.name, def.id);
	}

	syncPaletteIndex(externalIndex: number): void {
		if (externalIndex > this.nextPaletteIndex) {
			this.nextPaletteIndex = externalIndex;
		}
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}
