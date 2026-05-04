import type QualiaCodingPlugin from '../main';
import { ExportModal } from './exportModal';

export function registerExportCommands(plugin: QualiaCodingPlugin): void {
  plugin.addCommand({
    id: 'export-qdpx',
    name: 'Export project (QDPX)',
    callback: () => {
      new ExportModal(
        plugin,
        plugin.dataManager,
        plugin.sharedRegistry,
        'qdpx',
        plugin.manifest.version,
        plugin.caseVariablesRegistry,
      ).open();
    },
  });

  plugin.addCommand({
    id: 'export-qdc',
    name: 'Export codebook (QDC)',
    callback: () => {
      new ExportModal(
        plugin,
        plugin.dataManager,
        plugin.sharedRegistry,
        'qdc',
        plugin.manifest.version,
        plugin.caseVariablesRegistry,
      ).open();
    },
  });

  plugin.addCommand({
    id: 'export-tabular',
    name: 'Export codes as tabular data (for R/Python)',
    callback: () => {
      new ExportModal(
        plugin,
        plugin.dataManager,
        plugin.sharedRegistry,
        'tabular',
        plugin.manifest.version,
        plugin.caseVariablesRegistry,
      ).open();
    },
  });
}

/** Factory for analytics toolbar — avoids importing ExportModal in analytics view. */
export function openExportModal(plugin: QualiaCodingPlugin, defaultFormat: 'qdc' | 'qdpx' | 'tabular' = 'qdpx'): void {
  new ExportModal(
    plugin,
    plugin.dataManager,
    plugin.sharedRegistry,
    defaultFormat,
    plugin.manifest.version,
    plugin.caseVariablesRegistry,
  ).open();
}
