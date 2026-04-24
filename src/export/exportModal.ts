import { Modal, Setting, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { DataManager } from '../core/dataManager';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CaseVariablesRegistry } from '../core/caseVariables/caseVariablesRegistry';
import { exportProject } from './qdpxExporter';
import { exportTabular } from './tabular/tabularExporter';

export class ExportModal extends Modal {
  private format: 'qdc' | 'qdpx' | 'tabular';
  private includeSources = true;
  private includeRelations = true;
  private includeShapeCoords = true;
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
    defaultFormat: 'qdc' | 'qdpx' | 'tabular',
    pluginVersion: string,
    caseVariablesRegistry: CaseVariablesRegistry,
  ) {
    super(app);
    this.dataManager = dataManager;
    this.registry = registry;
    this.caseVariablesRegistry = caseVariablesRegistry;
    this.format = defaultFormat;
    this.pluginVersion = pluginVersion;
    this.fileName = `qualia-project.${this.extensionFor(defaultFormat)}`;
  }

  private extensionFor(format: 'qdc' | 'qdpx' | 'tabular'): string {
    return format === 'tabular' ? 'zip' : format;
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
        dd.addOption('tabular', 'Tabular (CSV zip, for R/Python)');
        dd.setValue(this.format);
        dd.onChange(v => {
          this.format = v as 'qdc' | 'qdpx' | 'tabular';
          this.fileName = this.fileName.replace(/\.\w+$/, `.${this.extensionFor(this.format)}`);
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

    if (this.format === 'tabular') {
      new Setting(this.dynamicEl)
        .setName('Include relations')
        .setDesc('Adds relations.csv with code-level and application-level relations.')
        .addToggle(t => t.setValue(this.includeRelations).onChange(v => { this.includeRelations = v; }));

      new Setting(this.dynamicEl)
        .setName('Include shape coords')
        .setDesc('Adds shape_type and shape_coords columns for PDF/image shapes.')
        .addToggle(t => t.setValue(this.includeShapeCoords).onChange(v => { this.includeShapeCoords = v; }));
      return;
    }

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

  private notifyResult(warnings: string[], fileName: string): void {
    if (warnings.length > 0) {
      const preview = warnings.slice(0, 3).join('\n');
      const extra = warnings.length > 3 ? `\n…and ${warnings.length - 3} more` : '';
      new Notice(`Export complete: ${fileName}\n\n${warnings.length} warning(s):\n${preview}${extra}`, 12000);
    } else {
      new Notice(`Export complete: ${fileName}`);
    }
  }

  private async doExport(): Promise<void> {
    try {
      if (this.format === 'tabular') {
        const result = await exportTabular(this.app, this.dataManager, this.registry, {
          fileName: this.fileName,
          includeRelations: this.includeRelations,
          includeShapeCoords: this.includeShapeCoords,
          pluginVersion: this.pluginVersion,
        });
        await this.app.vault.createBinary(result.fileName, result.data.buffer as ArrayBuffer);
        this.notifyResult(result.warnings, result.fileName);
        this.close();
        return;
      }

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

      this.notifyResult(result.warnings, result.fileName);
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
