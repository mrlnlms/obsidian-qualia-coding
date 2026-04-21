import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type QualiaCodingPlugin from '../../main';
import { CASE_VARIABLES_VIEW_TYPE } from './caseVariablesViewTypes';

export class CaseVariablesView extends ItemView {
  private mutateListener: () => void;

  constructor(leaf: WorkspaceLeaf, private plugin: QualiaCodingPlugin) {
    super(leaf);
    this.mutateListener = () => this.render();
  }

  getViewType(): string { return CASE_VARIABLES_VIEW_TYPE; }
  getDisplayText(): string { return 'Case Variables'; }
  getIcon(): string { return 'clipboard-list'; }

  async onOpen(): Promise<void> {
    this.plugin.caseVariablesRegistry.addOnMutate(this.mutateListener);
    this.render();
  }

  async onClose(): Promise<void> {
    this.plugin.caseVariablesRegistry.removeOnMutate(this.mutateListener);
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.innerHTML = '';
    container.createEl('h4', { text: 'Case Variables' });

    const registry = this.plugin.caseVariablesRegistry;
    const names = registry.getAllVariableNames();

    if (names.length === 0) {
      container.createEl('p', { text: 'No variables defined yet', cls: 'case-variables-empty' });
      return;
    }

    for (const name of names) {
      const row = container.createDiv({ cls: 'case-variables-panel-row' });
      const type = registry.getType(name);
      row.createSpan({ text: name, cls: 'case-variables-panel-name' });
      row.createSpan({ text: `(${type})`, cls: 'case-variables-panel-type' });
      const count = registry.getFilesByVariable(name).length;
      row.createSpan({ text: `${count} files`, cls: 'case-variables-panel-count' });
    }
  }
}
