/**
 * Unified file-open interceptor.
 *
 * Instead of each engine registering its own `active-leaf-change` listener,
 * they call `registerFileIntercept()` and a single listener dispatches.
 */

import { FileView, TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';

export interface FileInterceptRule {
	extensions: Set<string>;
	targetViewType: string;
	/** If set, only intercept when the current view is this type (e.g. 'image') */
	sourceViewType?: string;
	/** Optional guard — return false to skip this rule */
	shouldIntercept?: () => boolean;
}

export interface FileRenameRule {
	extensions: Set<string>;
	onRename: (oldPath: string, newPath: string) => void;
}

const rules: FileInterceptRule[] = [];
const renameRules: FileRenameRule[] = [];

// ── Extracted pure helpers (testable without Obsidian) ──

/** Extract file path from a leaf's view state or FileView fallback. */
export function resolveLeafFilePath(
	stateFile: unknown,
	viewFilePath: string | undefined,
): string | undefined {
	if (typeof stateFile === 'string') return stateFile;
	return viewFilePath;
}

/** Check whether a rule matches the current context (guards + extension). */
export function matchesInterceptRule(
	rule: FileInterceptRule,
	currentViewType: string,
	fileExt: string,
): boolean {
	if (currentViewType === rule.targetViewType) return false;
	if (rule.sourceViewType && currentViewType !== rule.sourceViewType) return false;
	if (rule.shouldIntercept && !rule.shouldIntercept()) return false;
	return rule.extensions.has(fileExt);
}

/** Dispatch rename to all rules matching the file extension. */
export function dispatchRenameRules(
	rules: FileRenameRule[],
	ext: string,
	oldPath: string,
	newPath: string,
): void {
	for (const rule of rules) {
		if (rule.extensions.has(ext)) rule.onRename(oldPath, newPath);
	}
}

export function registerFileIntercept(rule: FileInterceptRule): void {
	rules.push(rule);
}

export function registerFileRename(rule: FileRenameRule): void {
	renameRules.push(rule);
}

/** Clear all registered rules and pinned leaves. Call on plugin unload to prevent accumulation on hot-reload. */
export function clearFileInterceptRules(): void {
	rules.length = 0;
	renameRules.length = 0;
	pinnedFileByLeaf = new WeakMap();
}

/**
 * Per-leaf override: when the user manually swaps view type (via toggle button
 * or command), we remember the file path they're now "pinned" on for that leaf.
 * The intercept respects this pin and won't re-intercept the same (leaf, file).
 *
 * The pin is scoped to (leaf, file). Opening a DIFFERENT file in the same leaf
 * releases the pin and the intercept resumes normal autoOpen behavior.
 *
 * Reset on hot-reload via clearFileInterceptRules() so stale entries don't
 * survive a plugin disable/enable cycle.
 */
let pinnedFileByLeaf = new WeakMap<object, string>();

/**
 * Pin the current (leaf, file) as user-overridden. The next active-leaf-change
 * on this same leaf+file will be ignored by the intercept.
 */
export function markLeafHandled(leaf: object, filePath: string): void {
	pinnedFileByLeaf.set(leaf, filePath);
}

export function setupFileInterceptor(plugin: QualiaCodingPlugin): void {
	// Centralized rename handler — dispatches to all registered engines
	plugin.registerEvent(
		plugin.app.vault.on('rename', (file, oldPath) => {
			if (!(file instanceof TFile)) return;
			dispatchRenameRules(renameRules, file.extension.toLowerCase(), oldPath, file.path);
		})
	);

	plugin.registerEvent(
		plugin.app.workspace.on('active-leaf-change', (leaf) => {
			if (!leaf) return;

			const viewType = leaf.view.getViewType();

			for (const rule of rules) {
				// Resolve file path from view state or view.file
				const vs = leaf.getViewState();
				const viewFilePath = leaf.view instanceof FileView && leaf.view.file instanceof TFile
					? leaf.view.file.path
					: undefined;
				const filePath = resolveLeafFilePath(vs.state?.file, viewFilePath);
				if (!filePath) continue;

				// If the user has pinned this (leaf, file) via a manual swap, respect it.
				// Opening a different file in the same leaf releases the pin automatically.
				if (pinnedFileByLeaf.get(leaf) === filePath) continue;

				// Extension + guard checks
				const ext = filePath.split('.').pop()?.toLowerCase();
				if (!ext || !matchesInterceptRule(rule, viewType, ext)) continue;

				// Verify file exists
				const file = plugin.app.vault.getAbstractFileByPath(filePath);
				if (!(file instanceof TFile)) continue;

				leaf.setViewState({
					type: rule.targetViewType,
					state: { file: file.path },
				});
				return; // first match wins
			}
		}),
	);
}
