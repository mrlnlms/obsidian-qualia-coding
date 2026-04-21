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

  async initialize(): Promise<void> {
    const section = this.data.section('caseVariables');
    this.mirror = section.values;
    this.types = section.types;

    await this.waitForLayoutReady();

    for (const file of this.app.vault.getMarkdownFiles()) {
      this.syncFromFrontmatter(file);
    }

    this.metadataCacheRef = this.app.metadataCache.on('changed', (file: TFile) => {
      if (file.extension === 'md' && !this.writingInProgress.has(file.path)) {
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
      // markdown path — implementado em task 7
      throw new Error('not implemented');
    }
    this.mirror[fileId] ??= {};
    this.mirror[fileId][name] = value;
    this.persist();
    this.notify();
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

  private async waitForLayoutReady(): Promise<void> {
    if (this.app.workspace.layoutReady) return;
    await new Promise<void>(resolve => this.app.workspace.onLayoutReady(() => resolve()));
  }

  private notify(): void {
    for (const fn of this.onMutateListeners) fn();
  }
}
