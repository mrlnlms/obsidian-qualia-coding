/**
 * CodeDefinition Registry — Per-code identity, color, and metadata.
 *
 * Canonical copy — all engines import from here.
 */

import type { CodeDefinition, FolderDefinition, GroupDefinition } from './types';
import { GROUP_PALETTE } from './types';
import { cleanOverridesAfterGlobalChange, shouldStoreOverride, isCodeVisibleInFile as isVisibleHelper } from './codeVisibility';
import type { VisibilityOverrides } from './codeVisibility';

export interface VisibilityChangedDetail {
	codeIds: Set<string>;
	fileIds?: Set<string>;  // presente quando change é per-doc; ausente = change global
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
	private onMutateListeners: Set<() => void> = new Set();
	private visibilityListeners: Set<(detail: VisibilityChangedDetail) => void> = new Set();

	/** Per-doc overrides: overrides[fileId][codeId] = visibility nesse doc. */
	visibilityOverrides: VisibilityOverrides = {};

	private folders: Map<string, FolderDefinition> = new Map();
	/** Ordered list of root-level code IDs. Controls display order. */
	rootOrder: string[] = [];

	/** Groups (Tier 1.5 — flat N:N). Public pra permitir acesso do static fromJSON. */
	groups: Map<string, GroupDefinition> = new Map();
	/** Ordered list of group IDs. Controls display order in panel. */
	groupOrder: string[] = [];
	/** Monotonic index into GROUP_PALETTE. Nunca decrementa no deleteGroup (pattern do nextPaletteIndex). */
	nextGroupPaletteIndex: number = 0;

	/** Register a callback invoked on every mutation (create/update/delete). */
	addOnMutate(fn: () => void): void {
		this.onMutateListeners.add(fn);
	}

	/** Unregister a previously registered mutation callback. */
	removeOnMutate(fn: () => void): void {
		this.onMutateListeners.delete(fn);
	}

	/** Register a callback invoked on visibility changes (global or per-doc). */
	addVisibilityListener(fn: (detail: VisibilityChangedDetail) => void): void {
		this.visibilityListeners.add(fn);
	}

	removeVisibilityListener(fn: (detail: VisibilityChangedDetail) => void): void {
		this.visibilityListeners.delete(fn);
	}

	private emitVisibility(detail: VisibilityChangedDetail): void {
		for (const fn of this.visibilityListeners) fn(detail);
	}

	// --- Visibility reads ---

	getGlobalHidden(codeId: string): boolean {
		return this.definitions.get(codeId)?.hidden === true;
	}

	getDocOverride(fileId: string, codeId: string): boolean | undefined {
		return this.visibilityOverrides[fileId]?.[codeId];
	}

	isCodeVisibleInFile(codeId: string, fileId: string): boolean {
		return isVisibleHelper(codeId, fileId, this.getGlobalHidden(codeId), this.visibilityOverrides);
	}

	hasAnyOverrideForFile(fileId: string): boolean {
		const file = this.visibilityOverrides[fileId];
		return !!file && Object.keys(file).length > 0;
	}

	// --- Visibility mutations ---

	setGlobalHidden(codeId: string, hidden: boolean): void {
		const def = this.definitions.get(codeId);
		if (!def) return;
		def.hidden = hidden || undefined;  // undefined = visible (mantém JSON enxuto)
		def.updatedAt = Date.now();
		this.visibilityOverrides = cleanOverridesAfterGlobalChange(this.visibilityOverrides, codeId, hidden);
		this.emitVisibility({ codeIds: new Set([codeId]) });
	}

	setDocOverride(fileId: string, codeId: string, visible: boolean): void {
		const globalHidden = this.getGlobalHidden(codeId);
		const perFile = this.visibilityOverrides[fileId] ?? {};

		if (shouldStoreOverride(visible, globalHidden)) {
			this.visibilityOverrides[fileId] = { ...perFile, [codeId]: visible };
		} else {
			// Coincide com global — não grava; se havia override prévio, remove.
			if (codeId in perFile) {
				const { [codeId]: _, ...rest } = perFile;
				if (Object.keys(rest).length > 0) {
					this.visibilityOverrides[fileId] = rest;
				} else {
					delete this.visibilityOverrides[fileId];
				}
			}
		}
		this.emitVisibility({ codeIds: new Set([codeId]), fileIds: new Set([fileId]) });
	}

	clearDocOverrides(fileId: string): void {
		const perFile = this.visibilityOverrides[fileId];
		if (!perFile || Object.keys(perFile).length === 0) return;

		const affectedCodeIds = new Set(Object.keys(perFile));
		delete this.visibilityOverrides[fileId];
		this.emitVisibility({ codeIds: affectedCodeIds, fileIds: new Set([fileId]) });
	}

	migrateFilePathForOverrides(oldPath: string, newPath: string): void {
		const entry = this.visibilityOverrides[oldPath];
		if (!entry) return;
		this.visibilityOverrides[newPath] = entry;
		delete this.visibilityOverrides[oldPath];
		this.emitVisibility({
			codeIds: new Set(Object.keys(entry)),
			fileIds: new Set([newPath]),
		});
	}

	clearFilePathForOverrides(fileId: string): void {
		const entry = this.visibilityOverrides[fileId];
		if (!entry || Object.keys(entry).length === 0) return;
		const codeIds = new Set(Object.keys(entry));
		delete this.visibilityOverrides[fileId];
		this.emitVisibility({ codeIds, fileIds: new Set([fileId]) });
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

	create(name: string, color?: string, description?: string, parentId?: string): CodeDefinition {
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

		// Wire parent if valid
		if (parentId) {
			const parent = this.definitions.get(parentId);
			if (parent) {
				def.parentId = parentId;
				parent.childrenOrder.push(def.id);
			} else {
				this.rootOrder.push(def.id);
			}
		} else {
			this.rootOrder.push(def.id);
		}

		for (const fn of this.onMutateListeners) fn();
		return def;
	}

	update(id: string, changes: Partial<Pick<CodeDefinition, 'name' | 'color' | 'description' | 'magnitude' | 'relations'>>): boolean {
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
		if ('magnitude' in changes) {
			def.magnitude = changes.magnitude;
		}
		if ('relations' in changes) {
			def.relations = changes.relations;
		}
		def.updatedAt = Date.now();
		for (const fn of this.onMutateListeners) fn();
		return true;
	}

	delete(id: string): boolean {
		const def = this.definitions.get(id);
		if (!def) return false;

		// Promote children to root
		for (const childId of def.childrenOrder) {
			const child = this.definitions.get(childId);
			if (child) {
				child.parentId = undefined;
				this.rootOrder.push(childId);
			}
		}

		// Remove from own parent's childrenOrder
		if (def.parentId) {
			const parent = this.definitions.get(def.parentId);
			if (parent) {
				parent.childrenOrder = parent.childrenOrder.filter(cid => cid !== id);
			}
		} else {
			// Was root — remove from rootOrder
			this.rootOrder = this.rootOrder.filter(rid => rid !== id);
		}

		this.nameIndex.delete(def.name);
		this.definitions.delete(id);

		// Visibility cleanup: remover overrides do código deletado em todos os docs
		for (const fileId of Object.keys(this.visibilityOverrides)) {
			const perFile = this.visibilityOverrides[fileId]!;
			if (id in perFile) {
				const { [id]: _, ...rest } = perFile;
				if (Object.keys(rest).length > 0) {
					this.visibilityOverrides[fileId] = rest;
				} else {
					delete this.visibilityOverrides[fileId];
				}
			}
		}

		for (const fn of this.onMutateListeners) fn();
		return true;
	}

	/** Remove all code definitions and reset palette index. */
	clear(): void {
		this.definitions.clear();
		this.nameIndex.clear();
		this.folders.clear();
		this.rootOrder = [];
		this.nextPaletteIndex = 0;
		this.groups.clear();
		this.groupOrder = [];
		this.nextGroupPaletteIndex = 0;
		for (const fn of this.onMutateListeners) fn();
	}

	// --- Groups CRUD ---

	createGroup(name: string): GroupDefinition {
		const paletteIndex = this.nextGroupPaletteIndex % GROUP_PALETTE.length;
		const color = GROUP_PALETTE[paletteIndex]!;
		const group: GroupDefinition = {
			id: this.generateGroupId(),
			name,
			color,
			paletteIndex,
			createdAt: Date.now(),
		};
		this.groups.set(group.id, group);
		this.groupOrder.push(group.id);
		this.nextGroupPaletteIndex++;
		for (const fn of this.onMutateListeners) fn();
		return group;
	}

	getGroup(id: string): GroupDefinition | null {
		return this.groups.get(id) ?? null;
	}

	getAllGroups(): GroupDefinition[] {
		return this.groupOrder
			.map(id => this.groups.get(id))
			.filter((g): g is GroupDefinition => g !== undefined);
	}

	getGroupOrder(): string[] {
		return [...this.groupOrder];
	}

	renameGroup(id: string, newName: string): boolean {
		const g = this.groups.get(id);
		if (!g) return false;
		g.name = newName;
		for (const fn of this.onMutateListeners) fn();
		return true;
	}

	deleteGroup(id: string): boolean {
		const g = this.groups.get(id);
		if (!g) return false;

		// Ripple: remover groupId de code.groups[] em todos os códigos.
		// Single listener fire at end (batch semantics) — NÃO mover emit pra dentro do loop.
		for (const code of this.definitions.values()) {
			if (code.groups && code.groups.includes(id)) {
				code.groups = code.groups.filter(gid => gid !== id);
				if (code.groups.length === 0) delete code.groups;
			}
		}

		this.groups.delete(id);
		this.groupOrder = this.groupOrder.filter(gid => gid !== id);
		for (const fn of this.onMutateListeners) fn();
		return true;
	}

	// --- Membership ---

	addCodeToGroup(codeId: string, groupId: string): void {
		const code = this.definitions.get(codeId);
		const group = this.groups.get(groupId);
		if (!code || !group) return;
		if (!code.groups) code.groups = [];
		if (!code.groups.includes(groupId)) {
			code.groups.push(groupId);
			for (const fn of this.onMutateListeners) fn();
		}
		// idempotent: no fire se já era membro
	}

	removeCodeFromGroup(codeId: string, groupId: string): void {
		const code = this.definitions.get(codeId);
		if (!code || !code.groups) return;
		const changed = code.groups.includes(groupId);
		if (!changed) return;  // no-op: código não é membro
		code.groups = code.groups.filter(gid => gid !== groupId);
		if (code.groups.length === 0) delete code.groups;
		for (const fn of this.onMutateListeners) fn();
	}

	// --- Queries ---

	getCodesInGroup(groupId: string): CodeDefinition[] {
		const result: CodeDefinition[] = [];
		for (const code of this.definitions.values()) {
			if (code.groups?.includes(groupId)) result.push(code);
		}
		return result;
	}

	getGroupsForCode(codeId: string): GroupDefinition[] {
		const code = this.definitions.get(codeId);
		if (!code?.groups) return [];
		return code.groups
			.map(gid => this.groups.get(gid))
			.filter((g): g is GroupDefinition => g !== undefined);
	}

	getGroupMemberCount(groupId: string): number {
		let count = 0;
		for (const code of this.definitions.values()) {
			if (code.groups?.includes(groupId)) count++;
		}
		return count;
	}

	// --- Color / description / order mutations ---

	setGroupColor(id: string, color: string): void {
		const g = this.groups.get(id);
		if (!g) return;
		g.color = color;
		// Case-insensitive match contra GROUP_PALETTE (user colors podem vir lowercase de picker)
		const paletteIdx = GROUP_PALETTE.findIndex(c => c.toLowerCase() === color.toLowerCase());
		g.paletteIndex = paletteIdx >= 0 ? paletteIdx : -1;
		for (const fn of this.onMutateListeners) fn();
	}

	setGroupDescription(id: string, description: string | undefined): void {
		const g = this.groups.get(id);
		if (!g) return;
		g.description = description && description.length > 0 ? description : undefined;
		for (const fn of this.onMutateListeners) fn();
	}

	setGroupOrder(ids: string[]): void {
		// Validate: only include existing groups, preserve missing in trailing position
		const valid = ids.filter(id => this.groups.has(id));
		const missing = Array.from(this.groups.keys()).filter(id => !valid.includes(id));
		this.groupOrder = [...valid, ...missing];
		for (const fn of this.onMutateListeners) fn();
	}

	private generateGroupId(): string {
		// Reusa o pattern de generateId() dos códigos: Date+Math.random evita colisão após add-delete-add.
		return 'g_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
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

	// --- Folder CRUD ---

	createFolder(name: string): FolderDefinition {
		// Dedup by name
		for (const f of this.folders.values()) {
			if (f.name === name) return f;
		}
		const folder: FolderDefinition = {
			id: this.generateId(),
			name,
			createdAt: Date.now(),
		};
		this.folders.set(folder.id, folder);
		for (const fn of this.onMutateListeners) fn();
		return folder;
	}

	getFolderById(id: string): FolderDefinition | undefined {
		return this.folders.get(id);
	}

	getAllFolders(): FolderDefinition[] {
		return Array.from(this.folders.values())
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	renameFolder(id: string, name: string): boolean {
		const folder = this.folders.get(id);
		if (!folder) return false;
		if (folder.name === name) return true; // no-op
		// Reject duplicate name
		for (const f of this.folders.values()) {
			if (f.id !== id && f.name === name) return false;
		}
		folder.name = name;
		for (const fn of this.onMutateListeners) fn();
		return true;
	}

	deleteFolder(id: string): boolean {
		if (!this.folders.has(id)) return false;
		// Clear folder reference from all codes
		for (const def of this.definitions.values()) {
			if (def.folder === id) {
				def.folder = undefined;
			}
		}
		this.folders.delete(id);
		for (const fn of this.onMutateListeners) fn();
		return true;
	}

	setCodeFolder(codeId: string, folderId: string | undefined): boolean {
		const def = this.definitions.get(codeId);
		if (!def) return false;
		if (folderId !== undefined && !this.folders.has(folderId)) return false;
		def.folder = folderId;
		def.updatedAt = Date.now();
		for (const fn of this.onMutateListeners) fn();
		return true;
	}

	getCodesInFolder(folderId: string): CodeDefinition[] {
		return this.getAll().filter(d => d.folder === folderId);
	}

	// --- Hierarchy mutations ---

	/**
	 * Set or remove the parent of a code, optionally at a specific position.
	 * Returns false if the operation is invalid (self-parent, cycle, nonexistent parent).
	 * @param insertBefore — insert before this sibling ID. If omitted, appends at end.
	 */
	setParent(id: string, parentId: string | undefined, insertBefore?: string): boolean {
		const def = this.definitions.get(id);
		if (!def) return false;

		if (parentId !== undefined) {
			if (parentId === id) return false;
			if (!this.definitions.has(parentId)) return false;
			// Cycle detection: walk up from parentId
			let cursor: string | undefined = parentId;
			while (cursor) {
				if (cursor === id) return false;
				const p = this.definitions.get(cursor);
				cursor = p?.parentId;
			}
		}

		const wasRoot = !def.parentId;

		// Remove from old parent's childrenOrder
		if (def.parentId) {
			const oldParent = this.definitions.get(def.parentId);
			if (oldParent) {
				oldParent.childrenOrder = oldParent.childrenOrder.filter(cid => cid !== id);
			}
		}
		// Remove from rootOrder if was root
		if (wasRoot) {
			this.rootOrder = this.rootOrder.filter(rid => rid !== id);
		}

		def.parentId = parentId;
		def.updatedAt = Date.now();

		if (parentId) {
			// Add to new parent's childrenOrder
			const newParent = this.definitions.get(parentId)!;
			newParent.childrenOrder = newParent.childrenOrder.filter(cid => cid !== id);
			this._insertInList(newParent.childrenOrder, id, insertBefore);
			newParent.updatedAt = Date.now();
		} else {
			// Promote to root — insert in rootOrder
			this._insertInList(this.rootOrder, id, insertBefore);
		}

		for (const fn of this.onMutateListeners) fn();
		return true;
	}

	/** Insert id into list before the given anchor, or append if no anchor. */
	private _insertInList(list: string[], id: string, insertBefore?: string): void {
		if (insertBefore) {
			const idx = list.indexOf(insertBefore);
			if (idx >= 0) {
				list.splice(idx, 0, id);
				return;
			}
		}
		list.push(id);
	}

	// --- Hierarchy queries ---

	/** Returns root-level codes in rootOrder. */
	getRootCodes(): CodeDefinition[] {
		return this.rootOrder
			.map(id => this.definitions.get(id))
			.filter((d): d is CodeDefinition => d !== undefined && !d.parentId);
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

	toJSON(): {
		definitions: Record<string, CodeDefinition>;
		nextPaletteIndex: number;
		rootOrder: string[];
		folders: Record<string, FolderDefinition>;
		groups: Record<string, GroupDefinition>;
		groupOrder: string[];
		nextGroupPaletteIndex: number;
	} {
		const definitions: Record<string, CodeDefinition> = {};
		for (const [id, def] of this.definitions.entries()) {
			definitions[id] = def;
		}
		const folders: Record<string, FolderDefinition> = {};
		for (const [id, f] of this.folders.entries()) {
			folders[id] = f;
		}
		const groups: Record<string, GroupDefinition> = {};
		for (const [id, g] of this.groups.entries()) {
			groups[id] = g;
		}
		return {
			definitions,
			nextPaletteIndex: this.nextPaletteIndex,
			rootOrder: this.rootOrder,
			folders,
			groups,
			groupOrder: this.groupOrder,
			nextGroupPaletteIndex: this.nextGroupPaletteIndex,
		};
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
		if (data?.folders) {
			for (const id in data.folders) {
				const f = data.folders[id] as FolderDefinition;
				f.id = id;
				registry.folders.set(id, f);
			}
		}
		if (typeof data?.nextPaletteIndex === 'number') {
			registry.nextPaletteIndex = data.nextPaletteIndex;
		}

		// Restore rootOrder, or rebuild from definitions if missing (migration)
		if (Array.isArray(data?.rootOrder)) {
			registry.rootOrder = data.rootOrder.filter((id: string) => registry.definitions.has(id));
		}
		// Ensure all root codes are in rootOrder (migration safety)
		for (const [id, def] of registry.definitions) {
			if (!def.parentId && !registry.rootOrder.includes(id)) {
				registry.rootOrder.push(id);
			}
		}

		// Groups (Tier 1.5) — tolerante a data.json legado
		if (data?.groups) {
			for (const id in data.groups) {
				const g = data.groups[id] as GroupDefinition;
				g.id = id;  // consistency (igual ao pattern de codes/folders)
				registry.groups.set(id, g);
			}
		}
		if (Array.isArray(data?.groupOrder)) {
			registry.groupOrder = data.groupOrder.filter((id: string) => registry.groups.has(id));
		}
		// Se groupOrder ausente mas tem groups carregados, popula na ordem de inserção
		for (const id of registry.groups.keys()) {
			if (!registry.groupOrder.includes(id)) registry.groupOrder.push(id);
		}
		if (typeof data?.nextGroupPaletteIndex === 'number') {
			registry.nextGroupPaletteIndex = data.nextGroupPaletteIndex;
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
