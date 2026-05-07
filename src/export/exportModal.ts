import { Modal, Setting, Notice } from 'obsidian';
import type { DataManager } from '../core/dataManager';
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
import type { CaseVariablesRegistry } from '../core/caseVariables/caseVariablesRegistry';
import type QualiaCodingPlugin from '../main';
import { exportProject } from './qdpxExporter';
import { exportTabular } from './tabular/tabularExporter';
// `exportParquetEnriched` é dynamic-imported em doExport pra evitar carregar
// `CsvCodingView` (extends FileView) em contextos de teste onde obsidian é mockado.

export class ExportModal extends Modal {
  private plugin: QualiaCodingPlugin;
  private format: 'qdc' | 'qdpx' | 'tabular' | 'parquet';
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
    plugin: QualiaCodingPlugin,
    dataManager: DataManager,
    registry: CodeDefinitionRegistry,
    defaultFormat: 'qdc' | 'qdpx' | 'tabular' | 'parquet',
    pluginVersion: string,
    caseVariablesRegistry: CaseVariablesRegistry,
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.dataManager = dataManager;
    this.registry = registry;
    this.caseVariablesRegistry = caseVariablesRegistry;
    this.format = defaultFormat;
    this.pluginVersion = pluginVersion;
    this.fileName = `qualia-project.${this.extensionFor(defaultFormat)}`;
  }

  private extensionFor(format: 'qdc' | 'qdpx' | 'tabular' | 'parquet'): string {
    if (format === 'tabular') return 'zip';
    if (format === 'parquet') return 'parquet';
    return format;
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
        dd.addOption('parquet', 'Parquet enriquecido (active file + virtual cols)');
        dd.setValue(this.format);
        dd.onChange(v => {
          this.format = v as 'qdc' | 'qdpx' | 'tabular' | 'parquet';
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

    if (this.format === 'parquet') {
      const info = this.dynamicEl.createDiv({ cls: 'qualia-export-csv-warning' });
      info.createSpan({ text: 'Exports the active parquet/CSV file with virtual columns (codes + comments) materialized as parquet. Source file must be open in lazy mode.' });
      // File name não é editável aqui — output path é derivado do file ativo

      // Estimated load: descritivo, não preditivo. Mostra os números do que será
      // exportado pra dar visibilidade do peso. NÃO muda comportamento — sistema
      // tenta single-file e cai no fallback automático se OOM (decisão runtime).
      // Duck typing pra evitar puxar CsvCodingView (extends FileView) na carga
      // inicial do modal — view via getLeavesOfType('qualia-csv') + cast.
      const activeFile = this.app.workspace.getActiveFile();
      const csvLeaves = this.app.workspace.getLeavesOfType('qualia-csv');
      const matchingLeaf = csvLeaves.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        l => (l.view as any)?.file?.path === activeFile?.path,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const view = matchingLeaf?.view as any;

      if (view?.file && view?.csvModel) {
        const filePath = view.file.path as string;
        const markers = view.csvModel.getMarkersForFile(filePath) as Array<{ comment?: string }>;
        const enabledVcols = view.csvModel.getEnabledVirtualColumns(filePath) as string[];
        let totalCommentBytes = 0;
        for (const m of markers) {
          if (m.comment) totalCommentBytes += m.comment.length;
        }
        const commentMB = (totalCommentBytes / (1024 * 1024)).toFixed(1);

        const stats = this.dynamicEl.createDiv({ cls: 'qualia-export-csv-warning' });
        stats.createEl('strong', { text: 'Estimated load: ' });
        stats.createSpan({
          text: `${markers.length.toLocaleString()} markers, ${commentMB} MB of comment text, ${enabledVcols.length} virtual columns enabled.`,
        });

        const behavior = this.dynamicEl.createDiv({ cls: 'qualia-export-csv-warning' });
        behavior.createSpan({
          text: 'Output: <name>.qualia-enriched.parquet (single file). Auto-fallback to <name>.qualia-enriched/ folder with parts if memory limit hit on this machine.',
        });
      } else {
        const warn = this.dynamicEl.createDiv({ cls: 'qualia-export-csv-warning' });
        warn.createSpan({ text: '⚠ Open a parquet/CSV file first to see estimated load.' });
      }
      return;
    }

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
      if (this.format === 'parquet') {
        const { exportParquetEnrichedFromActiveView } = await import('../csv/exportParquetEnriched');
        await exportParquetEnrichedFromActiveView(this.app, this.plugin);
        this.close();
        return;
      }

      if (this.format === 'tabular') {
        const result = await exportTabular(this.plugin, this.dataManager, this.registry, {
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
