/**
 * Pure hierarchy helpers — no Obsidian API, no DOM.
 * Used by sidebar views for tree rendering and count display.
 */

import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { CodeDefinition, BaseMarker } from './types';

// ─── Types ───────────────────────────────────────────────────────

export interface FlatCodeNode {
	type: 'code';
	def: CodeDefinition;
	depth: number;
	hasChildren: boolean;
	isExpanded: boolean;
}

export interface FlatFolderNode {
	type: 'folder';
	folderId: string;
	name: string;
	depth: 0;
	hasChildren: boolean;
	isExpanded: boolean;
	codeCount: number;
}

export type FlatTreeNode = FlatCodeNode | FlatFolderNode;

/**
 * Expanded state for tree rendering.
 * Separates codes and folders to avoid string-prefix discriminators.
 */
export interface ExpandedState {
	codes: Set<string>;
	folders: Set<string>;
}

export function createExpandedState(): ExpandedState {
	return { codes: new Set<string>(), folders: new Set<string>() };
}

export interface CountEntry {
	direct: number;
	aggregate: number;
}

export type CountIndex = Map<string, CountEntry>;

// ─── buildFlatTree ───────────────────────────────────────────────

/**
 * Builds a flat list for virtual scroll rendering.
 * - Root codes sorted alphabetically
 * - Children follow childrenOrder
 * - Only show children of expanded nodes
 * - If searchQuery provided: find codes matching query (case-insensitive),
 *   include their ancestor paths, auto-expand parents
 */
export function buildFlatTree(
	registry: CodeDefinitionRegistry,
	expanded: ExpandedState,
	searchQuery?: string,
): FlatTreeNode[] {
	const folders = registry.getAllFolders();

	// If searching, compute which codes/folders to show and which to force-expand
	let visibleCodeIds: Set<string> | null = null;
	let visibleFolderIds: Set<string> | null = null;
	let forceExpanded: ExpandedState | null = null;

	if (searchQuery && searchQuery.trim().length > 0) {
		const query = searchQuery.trim().toLowerCase();
		visibleCodeIds = new Set<string>();
		visibleFolderIds = new Set<string>();
		forceExpanded = createExpandedState();

		for (const def of registry.getAll()) {
			if (def.name.toLowerCase().includes(query)) {
				visibleCodeIds.add(def.id);
				// Add all ancestors
				for (const ancestor of registry.getAncestors(def.id)) {
					visibleCodeIds.add(ancestor.id);
					forceExpanded.codes.add(ancestor.id);
				}
				// Auto-expand containing folder
				if (def.folder) {
					visibleFolderIds.add(def.folder);
					forceExpanded.folders.add(def.folder);
				}
			}
		}
	}

	const result: FlatTreeNode[] = [];

	const visitCodes = (codes: CodeDefinition[], depth: number): void => {
		for (const def of codes) {
			if (visibleCodeIds && !visibleCodeIds.has(def.id)) continue;

			const children = registry.getChildren(def.id);
			const hasChildren = children.length > 0;
			const isExpanded = forceExpanded?.codes.has(def.id) || expanded.codes.has(def.id);

			result.push({ type: 'code', def, depth, hasChildren, isExpanded: hasChildren && isExpanded });

			if (hasChildren && isExpanded) {
				visitCodes(children, depth + 1);
			}
		}
	};

	// 1. Render folders (sorted by name)
	for (const folder of folders) {
		if (visibleFolderIds && !visibleFolderIds.has(folder.id)) continue;

		const codesInFolder = registry.getCodesInFolder(folder.id);
		const folderCodeIds = new Set(codesInFolder.map(c => c.id));
		const rootCodesInFolder = codesInFolder.filter(c => !c.parentId || !folderCodeIds.has(c.parentId));
		const isExpanded = forceExpanded?.folders.has(folder.id) || expanded.folders.has(folder.id);

		result.push({
			type: 'folder',
			folderId: folder.id,
			name: folder.name,
			depth: 0,
			hasChildren: codesInFolder.length > 0,
			isExpanded: (codesInFolder.length > 0) && isExpanded,
			codeCount: codesInFolder.length,
		});

		if (isExpanded) {
			visitCodes(rootCodesInFolder, 1);
		}
	}

	// 2. Unfiled root codes (no folder, no parentId)
	const unfiledRoots = registry.getRootCodes().filter(d => !d.folder);
	if (visibleCodeIds) {
		visitCodes(unfiledRoots.filter(d => visibleCodeIds!.has(d.id)), 0);
	} else {
		visitCodes(unfiledRoots, 0);
	}

	return result;
}

// ─── Count helpers ───────────────────────────────────────────────

/**
 * Count markers directly assigned to this code (not descendants).
 * Deduplicates: counts at most once per marker.
 */
export function getDirectCount(codeId: string, markers: BaseMarker[]): number {
	let count = 0;
	for (const marker of markers) {
		for (const app of marker.codes) {
			if (app.codeId === codeId) {
				count++;
				break;
			}
		}
	}
	return count;
}

/**
 * Count markers assigned to code OR any descendant.
 * Deduplicates: each marker counted at most once.
 */
export function getAggregateCount(
	codeId: string,
	registry: CodeDefinitionRegistry,
	markers: BaseMarker[],
): number {
	const relevantIds = new Set<string>([codeId]);
	for (const desc of registry.getDescendants(codeId)) {
		relevantIds.add(desc.id);
	}

	let count = 0;
	for (const marker of markers) {
		for (const app of marker.codes) {
			if (relevantIds.has(app.codeId)) {
				count++;
				break;
			}
		}
	}
	return count;
}

/**
 * Returns both direct and aggregate (withChildren) counts.
 */
export function getCountBreakdown(
	codeId: string,
	registry: CodeDefinitionRegistry,
	markers: BaseMarker[],
): { direct: number; withChildren: number } {
	return {
		direct: getDirectCount(codeId, markers),
		withChildren: getAggregateCount(codeId, registry, markers),
	};
}

// ─── buildCountIndex ─────────────────────────────────────────────

/**
 * Precompute direct + aggregate for all codes at once.
 * 1. Initialize all codes with {direct: 0, aggregate: 0}
 * 2. Count directs: iterate markers, deduplicate codeIds per marker with Set
 * 3. Bottom-up aggregation: post-order DFS from roots
 */
export function buildCountIndex(
	registry: CodeDefinitionRegistry,
	markers: BaseMarker[],
): CountIndex {
	const index: CountIndex = new Map();

	// 1. Initialize
	for (const def of registry.getAll()) {
		index.set(def.id, { direct: 0, aggregate: 0 });
	}

	// 2. Count directs
	for (const marker of markers) {
		const seen = new Set<string>();
		for (const app of marker.codes) {
			if (!seen.has(app.codeId) && index.has(app.codeId)) {
				seen.add(app.codeId);
				index.get(app.codeId)!.direct++;
			}
		}
	}

	// 3. Bottom-up aggregation: post-order DFS
	const postOrder = (parentId: string): number => {
		const entry = index.get(parentId)!;
		let childrenSum = 0;
		for (const child of registry.getChildren(parentId)) {
			childrenSum += postOrder(child.id);
		}
		entry.aggregate = entry.direct + childrenSum;
		return entry.aggregate;
	};

	for (const root of registry.getRootCodes()) {
		postOrder(root.id);
	}

	return index;
}
