// src/import/importModal.ts
import { Modal, Setting, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { DataManager } from '../core/dataManager';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CaseVariablesRegistry } from '../core/caseVariables/caseVariablesRegistry';
import { previewQdpx, importQdpx, type ImportOptions, type ImportPreview } from './qdpxImporter';
import { parseCodebook, applyCodebook, type ConflictStrategy } from './qdcImporter';
import { parseXml } from './xmlParser';

export class ImportModal extends Modal {
  private dataManager: DataManager;
  private registry: CodeDefinitionRegistry;
  private caseVariablesRegistry?: CaseVariablesRegistry;
  private format: 'qdpx' | 'qdc';
  private zipData: ArrayBuffer | null = null;
  private xmlString: string | null = null;
  private preview: ImportPreview | null = null;
  private conflictStrategy: ConflictStrategy = 'merge';
  private keepOriginalSources = false;

  constructor(
    app: App,
    dataManager: DataManager,
    registry: CodeDefinitionRegistry,
    format: 'qdpx' | 'qdc',
    caseVariablesRegistry?: CaseVariablesRegistry,
  ) {
    super(app);
    this.dataManager = dataManager;
    this.registry = registry;
    this.caseVariablesRegistry = caseVariablesRegistry;
    this.format = format;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Import REFI-QDA' });

    // File input
    const inputContainer = contentEl.createDiv({ cls: 'qualia-import-file-input' });
    const fileInput = inputContainer.createEl('input', { type: 'file' });
    fileInput.accept = this.format === 'qdpx' ? '.qdpx' : '.qdc';
    fileInput.addEventListener('change', () => this.onFileSelected(fileInput));

    // Dynamic content area
    this.dynamicEl = contentEl.createDiv();
  }

  private dynamicEl!: HTMLElement;

  private async onFileSelected(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;

    try {
      if (this.format === 'qdpx') {
        this.zipData = await file.arrayBuffer();
        this.preview = previewQdpx(this.zipData, this.registry);
        this.renderPreview();
      } else {
        this.xmlString = await file.text();
        this.renderQdcPreview();
      }
    } catch (err) {
      new Notice(`Failed to read file: ${(err as Error).message}`);
    }
  }

  private renderPreview(): void {
    if (!this.preview) return;
    this.dynamicEl.empty();
    const p = this.preview;

    const info = this.dynamicEl.createDiv({ cls: 'qualia-import-preview' });
    info.createEl('p', { text: `File: ${p.projectName}` });
    if (p.origin) info.createEl('p', { text: `Origin: ${p.origin}` });
    info.createEl('p', { text: `Found: ${p.codeCount} codes${p.hierarchyCount > 0 ? ` (${p.hierarchyCount} with hierarchy)` : ''}, ${p.selectionCount} segments, ${p.sourceCount} sources, ${p.noteCount} memos${p.linkCount > 0 ? `, ${p.linkCount} relations` : ''}` });

    // Conflicts
    if (p.conflictingCodes.length > 0) {
      const conflictEl = this.dynamicEl.createDiv({ cls: 'qualia-import-conflicts' });
      conflictEl.createEl('p', { text: `⚠ ${p.conflictingCodes.length} codes already exist: ${p.conflictingCodes.join(', ')}` });

      new Setting(conflictEl)
        .setName('Conflict resolution')
        .addDropdown(dd => {
          dd.addOption('merge', 'Merge (use existing codes)');
          dd.addOption('separate', 'Create separate (suffix "imported")');
          dd.setValue(this.conflictStrategy);
          dd.onChange(v => { this.conflictStrategy = v as ConflictStrategy; });
        });
    }

    if (this.format === 'qdpx') {
      new Setting(this.dynamicEl)
        .setName('Keep original source files')
        .setDesc('.docx, .txt alongside .md')
        .addToggle(t => {
          t.setValue(this.keepOriginalSources);
          t.onChange(v => { this.keepOriginalSources = v; });
        });
    }

    // Buttons
    new Setting(this.dynamicEl)
      .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(btn => btn.setButtonText('Import').setCta().onClick(() => this.doImport()));
  }

  private renderQdcPreview(): void {
    this.dynamicEl.empty();
    if (!this.xmlString) return;

    try {
      const doc = parseXml(this.xmlString);
      const codebook = parseCodebook(doc);
      const conflicting = codebook.codes.filter(c => this.registry.getByName(c.name));

      const info = this.dynamicEl.createDiv();
      info.createEl('p', { text: `Found: ${codebook.codes.length} codes` });

      if (conflicting.length > 0) {
        info.createEl('p', { text: `⚠ ${conflicting.length} already exist: ${conflicting.map(c => c.name).join(', ')}` });

        new Setting(this.dynamicEl)
          .setName('Conflict resolution')
          .addDropdown(dd => {
            dd.addOption('merge', 'Merge (use existing codes)');
            dd.addOption('separate', 'Create separate (suffix "imported")');
            dd.setValue(this.conflictStrategy);
            dd.onChange(v => { this.conflictStrategy = v as ConflictStrategy; });
          });
      }

      new Setting(this.dynamicEl)
        .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()))
        .addButton(btn => btn.setButtonText('Import').setCta().onClick(() => this.doQdcImport(codebook)));
    } catch (err) {
      new Notice(`Invalid QDC file: ${(err as Error).message}`);
    }
  }

  private async doImport(): Promise<void> {
    if (!this.zipData || !this.preview) return;

    try {
      const result = await importQdpx(this.zipData, this.app, this.dataManager, this.registry, {
        conflictStrategy: this.conflictStrategy,
        keepOriginalSources: this.keepOriginalSources,
        projectName: this.preview.projectName,
      } as ImportOptions, this.caseVariablesRegistry);

      const parts = [
        `${result.codesCreated} codes created`,
        result.codesMerged > 0 ? `${result.codesMerged} merged` : '',
        `${result.sourcesImported} sources`,
        `${result.segmentsCreated} segments`,
        result.relationsImported > 0 ? `${result.relationsImported} relations` : '',
      ].filter(Boolean);

      new Notice(`Import complete: ${parts.join(', ')}`, 8000);
      if (result.warnings.length > 0) {
        console.warn('[Qualia Import] Warnings:', result.warnings);
      }
      this.close();
    } catch (err) {
      new Notice(`Import failed: ${(err as Error).message}`);
      console.error('[Qualia Import]', err);
    }
  }

  private async doQdcImport(codebook: ReturnType<typeof parseCodebook>): Promise<void> {
    const result = applyCodebook(codebook, this.registry, this.conflictStrategy);
    this.dataManager.setSection('registry', this.registry.toJSON());
    this.dataManager.markDirty();
    await this.dataManager.flush();

    new Notice(`Codebook imported: ${result.created} created, ${result.merged} merged`);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
