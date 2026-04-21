import { Modal, Setting, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { DataManager } from '../core/dataManager';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CaseVariablesRegistry } from '../core/caseVariables/caseVariablesRegistry';
import { exportProject } from './qdpxExporter';

export class ExportModal extends Modal {
  private format: 'qdc' | 'qdpx';
  private includeSources = true;
  private fileName: string;
  private dataManager: DataManager;
  private registry: CodeDefinitionRegistry;
  private caseVariablesRegistry: CaseVariablesRegistry;
  private pluginVersion: string;
  private dynamicEl!: HTMLElement;

  constructor(
    app: App,
    dataManager: DataManager,
    registry: CodeDefinitionRegistry,
    defaultFormat: 'qdc' | 'qdpx',
    pluginVersion: string,
    caseVariablesRegistry: CaseVariablesRegistry,
  ) {
    super(app);
    this.dataManager = dataManager;
    this.registry = registry;
    this.caseVariablesRegistry = caseVariablesRegistry;
    this.format = defaultFormat;
    this.pluginVersion = pluginVersion;
    this.fileName = `qualia-project.${defaultFormat}`;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Export REFI-QDA' });

    new Setting(contentEl)
      .setName('Format')
      .addDropdown(dd => {
        dd.addOption('qdpx', 'QDPX (full project)');
        dd.addOption('qdc', 'QDC (codebook only)');
        dd.setValue(this.format);
        dd.onChange(v => {
          this.format = v as 'qdc' | 'qdpx';
          this.fileName = this.fileName.replace(/\.\w+$/, `.${this.format}`);
          this.renderDynamicSections();
        });
      });

    this.dynamicEl = contentEl.createDiv();
    this.renderDynamicSections();

    new Setting(contentEl)
      .setName('File name')
      .addText(text => {
        text.setValue(this.fileName);
        text.onChange(v => { this.fileName = v; });
      });

    new Setting(contentEl)
      .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(btn => btn.setButtonText('Export').setCta().onClick(() => this.doExport()));
  }

  private renderDynamicSections(): void {
    this.dynamicEl.empty();
    if (this.format !== 'qdpx') return;

    new Setting(this.dynamicEl)
      .setName('Include source files')
      .setDesc('Embeds files in the archive. Uncheck for smaller export.')
      .addToggle(t => {
        t.setValue(this.includeSources);
        t.onChange(v => { this.includeSources = v; });
      });

    const csvData = this.dataManager.section('csv');
    const hasCsvMarkers = csvData.segmentMarkers.length > 0 || csvData.rowMarkers.length > 0;
    if (hasCsvMarkers) {
      const warning = this.dynamicEl.createDiv({ cls: 'qualia-export-csv-warning' });
      warning.createSpan({ text: 'CSV segments will not be included (REFI-QDA does not support tabular data)' });
    }
  }

  private async doExport(): Promise<void> {
    try {
      const result = await exportProject(this.app, this.dataManager, this.registry, {
        format: this.format,
        includeSources: this.format === 'qdpx' ? this.includeSources : false,
        fileName: this.fileName,
        vaultName: this.app.vault.getName(),
        pluginVersion: this.pluginVersion,
      }, this.caseVariablesRegistry);

      if (typeof result.data === 'string') {
        await this.app.vault.create(result.fileName, result.data);
      } else {
        await this.app.vault.createBinary(result.fileName, result.data.buffer as ArrayBuffer);
      }

      if (result.warnings.length > 0) {
        new Notice(`Export complete: ${result.fileName}\n${result.warnings.length} warning(s) — see console`, 8000);
        console.warn('[Qualia Export] Warnings:', result.warnings);
      } else {
        new Notice(`Export complete: ${result.fileName}`);
      }
      this.close();
    } catch (err) {
      new Notice(`Export failed: ${(err as Error).message}`);
      console.error('[Qualia Export]', err);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
