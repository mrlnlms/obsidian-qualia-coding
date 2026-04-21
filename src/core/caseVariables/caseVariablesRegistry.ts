import type { App, EventRef, TFile } from 'obsidian';
import type { DataManager } from '../dataManager';
import type {
  CaseVariablesData,
  PropertyType,
  VariableValue,
} from './caseVariablesTypes';
import { OBSIDIAN_RESERVED } from './caseVariablesTypes';
import { getObsidianPropertyType } from './obsidianInternalsApi';

export class CaseVariablesRegistry {
  private mirror: CaseVariablesData = {};
  private types: Record<string, PropertyType> = {};
  private onMutateListeners = new Set<() => void>();
  private metadataCacheRef: EventRef | null = null;
  private writingInProgress = new Set<string>();

  constructor(
    private app: App,
    private data: DataManager,
  ) {}

  initialize(): void {
    const section = this.data.section('caseVariables');
    this.mirror = section.values;
    this.types = section.types;

    this.metadataCacheRef = this.app.metadataCache.on('changed', (file: TFile) => {
      if (file.extension === 'md' && !this.writingInProgress.has(file.path)) {
        this.syncFromFrontmatter(file);
      }
    });

    // Initial scan deferred to layout-ready — syncs mirror from frontmatter of
    // all md files, catching changes made while the plugin was off. Must NOT
    // be awaited: onLayoutReady fires only AFTER plugin.onload() returns, so
    // awaiting here would deadlock the plugin boot.
    this.app.workspace.onLayoutReady(() => {
      for (const file of this.app.vault.getMarkdownFiles()) {
        this.syncFromFrontmatter(file);
      }
    });
  }

  unload(): void {
    if (this.metadataCacheRef) {
      this.app.metadataCache.offref(this.metadataCacheRef);
      this.metadataCacheRef = null;
    }
    this.onMutateListeners.clear();
  }

  getVariables(fileId: string): Record<string, VariableValue> {
    return this.mirror[fileId] ?? {};
  }

  getAllVariableNames(): string[] {
    const names = new Set<string>();
    for (const vars of Object.values(this.mirror)) {
      for (const name of Object.keys(vars)) names.add(name);
    }
    return [...names].sort();
  }

  getType(name: string): PropertyType {
    const obsidianType = getObsidianPropertyType(this.app, name);
    if (obsidianType) return obsidianType;
    return this.types[name] ?? 'text';
  }

  addOnMutate(fn: () => void): void {
    this.onMutateListeners.add(fn);
  }

  removeOnMutate(fn: () => void): void {
    this.onMutateListeners.delete(fn);
  }

  async setVariable(fileId: string, name: string, value: VariableValue): Promise<void> {
    if (fileId.endsWith('.md')) {
      const file = this.app.vault.getAbstractFileByPath(fileId) as TFile | null;
      if (!file) return;

      this.writingInProgress.add(fileId);
      try {
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          fm[name] = value;
        });
      } finally {
        setTimeout(() => this.writingInProgress.delete(fileId), 0);
      }
      // NOTE: do not call persist() or notify() here.
      // The metadataCache 'changed' event fires async after processFrontMatter resolves,
      // and Task 3's syncFromFrontmatter handles mirror update + notify.
    } else {
      this.mirror[fileId] ??= {};
      this.mirror[fileId][name] = value;
      this.persist();
      this.notify();
    }
  }

  /**
   * Bulk write multiple variables to a single file. For markdown, uses one
   * processFrontMatter call (instead of N separate ones — significant perf gain
   * during QDPX import of 100+ md files). For binary, writes mirror directly.
   */
  async applyVariablesBatch(
    fileId: string,
    variables: Array<{ name: string; value: VariableValue }>,
  ): Promise<void> {
    if (variables.length === 0) return;

    if (fileId.endsWith('.md')) {
      const file = this.app.vault.getAbstractFileByPath(fileId) as TFile | null;
      if (!file) return;
      this.writingInProgress.add(fileId);
      try {
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          for (const { name, value } of variables) fm[name] = value;
        });
      } finally {
        setTimeout(() => this.writingInProgress.delete(fileId), 0);
      }
      return;
    }

    // Binary path
    this.mirror[fileId] ??= {};
    for (const { name, value } of variables) {
      this.mirror[fileId][name] = value;
    }
    this.persist();
    this.notify();
  }

  async removeVariable(fileId: string, name: string): Promise<void> {
    if (fileId.endsWith('.md')) {
      const file = this.app.vault.getAbstractFileByPath(fileId) as TFile | null;
      if (!file) return;
      this.writingInProgress.add(fileId);
      try {
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          delete fm[name];
        });
      } finally {
        setTimeout(() => this.writingInProgress.delete(fileId), 0);
      }
      return;
    }
    const entry = this.mirror[fileId];
    if (!entry) return;
    delete entry[name];
    if (Object.keys(entry).length === 0) delete this.mirror[fileId];
    this.persist();
    this.notify();
  }

  /**
   * Remove the mirror entry for a file entirely. Binary-only in practice —
   * called by the file-deletion hook (Task 18) when a file is removed from the vault.
   * Markdown files with frontmatter variables should use `removeVariable` per key;
   * on actual file delete, the metadataCache event will drop the entry reactively.
   */
  removeAllForFile(fileId: string): void {
    if (!this.mirror[fileId]) return;
    delete this.mirror[fileId];
    this.persist();
    this.notify();
  }

  migrateFilePath(oldFileId: string, newFileId: string): void {
    const entry = this.mirror[oldFileId];
    if (!entry) return;
    this.mirror[newFileId] = entry;
    delete this.mirror[oldFileId];
    this.persist();
    this.notify();
  }

  getValuesForVariable(name: string): VariableValue[] {
    const values = new Set<VariableValue>();
    for (const vars of Object.values(this.mirror)) {
      if (name in vars) values.add(vars[name] as VariableValue);
    }
    return [...values];
  }

  getFilesByVariable(name: string, value?: VariableValue): string[] {
    const files: string[] = [];
    for (const [fileId, vars] of Object.entries(this.mirror)) {
      if (name in vars && (value === undefined || vars[name] === value)) {
        files.push(fileId);
      }
    }
    return files;
  }

  /**
   * Return fileIds sharing a `caseId` value. Convention: multi-document cases
   * are grouped by setting `caseId` to the same string in each related file.
   * Sugar over `getFilesByVariable('caseId', caseId)`.
   */
  getFilesByCase(caseId: string): string[] {
    return this.getFilesByVariable('caseId', caseId);
  }

  private persist(): void {
    this.data.setSection('caseVariables', {
      values: this.mirror,
      types: this.types,
    });
  }

  private syncFromFrontmatter(file: TFile): void {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const filtered: Record<string, VariableValue> = {};
    for (const [key, value] of Object.entries(fm)) {
      if (OBSIDIAN_RESERVED.includes(key)) continue;
      filtered[key] = value as VariableValue;
    }
    if (Object.keys(filtered).length === 0) {
      delete this.mirror[file.path];
    } else {
      this.mirror[file.path] = filtered;
    }
    this.notify();
  }

  private notify(): void {
    for (const fn of this.onMutateListeners) fn();
  }
}
