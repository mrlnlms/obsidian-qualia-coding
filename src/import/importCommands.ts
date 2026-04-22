import type QualiaCodingPlugin from '../main';
import { ImportModal } from './importModal';

export function registerImportCommands(plugin: QualiaCodingPlugin): void {
  plugin.addCommand({
    id: 'import-qdpx',
    name: 'Import project (QDPX)',
    callback: () => {
      new ImportModal(plugin.app, plugin.dataManager, plugin.sharedRegistry, 'qdpx', plugin.caseVariablesRegistry, plugin).open();
    },
  });

  plugin.addCommand({
    id: 'import-qdc',
    name: 'Import codebook (QDC)',
    callback: () => {
      new ImportModal(plugin.app, plugin.dataManager, plugin.sharedRegistry, 'qdc', plugin.caseVariablesRegistry, plugin).open();
    },
  });
}

export function openImportModal(plugin: QualiaCodingPlugin, defaultFormat: 'qdc' | 'qdpx' = 'qdpx'): void {
  new ImportModal(plugin.app, plugin.dataManager, plugin.sharedRegistry, defaultFormat, plugin.caseVariablesRegistry, plugin).open();
}
