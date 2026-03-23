import type QualiaCodingPlugin from '../main';
import { ExportModal } from './exportModal';

export function registerExportCommands(plugin: QualiaCodingPlugin): void {
  plugin.addCommand({
    id: 'export-qdpx',
    name: 'Export project (QDPX)',
    callback: () => {
      new ExportModal(
        plugin.app,
        plugin.dataManager,
        plugin.sharedRegistry,
        'qdpx',
        plugin.manifest.version,
      ).open();
    },
  });

  plugin.addCommand({
    id: 'export-qdc',
    name: 'Export codebook (QDC)',
    callback: () => {
      new ExportModal(
        plugin.app,
        plugin.dataManager,
        plugin.sharedRegistry,
        'qdc',
        plugin.manifest.version,
      ).open();
    },
  });
}

/** Factory for analytics toolbar — avoids importing ExportModal in analytics view. */
export function openExportModal(plugin: QualiaCodingPlugin, defaultFormat: 'qdc' | 'qdpx' = 'qdpx'): void {
  new ExportModal(
    plugin.app,
    plugin.dataManager,
    plugin.sharedRegistry,
    defaultFormat,
    plugin.manifest.version,
  ).open();
}
