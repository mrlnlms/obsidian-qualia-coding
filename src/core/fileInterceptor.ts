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

export function registerFileIntercept(rule: FileInterceptRule): void {
	rules.push(rule);
}

export function registerFileRename(rule: FileRenameRule): void {
	renameRules.push(rule);
}

export function setupFileInterceptor(plugin: QualiaCodingPlugin): void {
	// Centralized rename handler — dispatches to all registered engines
	plugin.registerEvent(
		plugin.app.vault.on('rename', (file, oldPath) => {
			if (!(file instanceof TFile)) return;
			const ext = file.extension.toLowerCase();
			for (const rule of renameRules) {
				if (rule.extensions.has(ext)) rule.onRename(oldPath, file.path);
			}
		})
	);

	plugin.registerEvent(
		plugin.app.workspace.on('active-leaf-change', (leaf) => {
			if (!leaf) return;

			const viewType = leaf.view.getViewType();

			for (const rule of rules) {
				// Already showing target view — skip
				if (viewType === rule.targetViewType) continue;

				// Source filter: only intercept specific source view types
				if (rule.sourceViewType && viewType !== rule.sourceViewType) continue;

				// Custom guard
				if (rule.shouldIntercept && !rule.shouldIntercept()) continue;

				// Resolve file path from view state or view.file
				let filePath: string | undefined;
				const vs = leaf.getViewState();
				if (vs.state?.file) {
					filePath = vs.state.file as string;
				} else if (leaf.view instanceof FileView) {
					const f = leaf.view.file;
					if (f instanceof TFile) filePath = f.path;
				}
				if (!filePath) continue;

				// Extension check
				const ext = filePath.split('.').pop()?.toLowerCase();
				if (!ext || !rule.extensions.has(ext)) continue;

				// Verify file exists
				const file = plugin.app.vault.getAbstractFileByPath(filePath);
				if (!(file instanceof TFile)) continue;

				// Check if file is already open in another leaf of the target type
				const existingLeaves = plugin.app.workspace.getLeavesOfType(rule.targetViewType);
				const existingLeaf = existingLeaves.find(l => {
					const state = l.view.getState?.();
					const viewFile = state?.file ?? (l.view instanceof FileView ? l.view.file?.path : undefined);
					return viewFile === filePath;
				});
				if (existingLeaf) {
					leaf.detach();
					plugin.app.workspace.setActiveLeaf(existingLeaf);
					return;
				}

				leaf.setViewState({
					type: rule.targetViewType,
					state: { file: file.path },
				});
				return; // first match wins
			}
		}),
	);
}
