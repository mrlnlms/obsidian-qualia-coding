import type { CaseVariablesRegistry } from './caseVariablesRegistry';
import type { VariableValue } from './caseVariablesTypes';
import { TYPE_ICONS } from './typeIcons';
import { setIcon } from 'obsidian';

export interface PropertiesEditorConfig {
  fileId: string;
  registry: CaseVariablesRegistry;
  onClose?: () => void;
}

export class PropertiesEditor {
  private container: HTMLElement;
  private config: PropertiesEditorConfig;
  private mutateListener: () => void;

  constructor(container: HTMLElement, config: PropertiesEditorConfig) {
    this.container = container;
    this.config = config;
    this.mutateListener = () => this.render();
    this.config.registry.addOnMutate(this.mutateListener);
    this.render();
  }

  destroy(): void {
    this.config.registry.removeOnMutate(this.mutateListener);
    this.container.innerHTML = '';
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.classList.add('case-variables-editor');

    const variables = this.config.registry.getVariables(this.config.fileId);
    const entries = Object.entries(variables);

    if (entries.length === 0) {
      const empty = this.container.createDiv({ cls: 'case-variables-empty' });
      empty.textContent = 'No properties yet — click + to add';
    }

    for (const [name, value] of entries) {
      this.renderRow(name, value);
    }

    this.renderAddRow();
  }

  private renderRow(name: string, value: VariableValue): void {
    const row = this.container.createDiv({ cls: 'case-variables-row' });
    row.dataset.propertyName = name;

    const type = this.config.registry.getType(name);
    const iconEl = row.createSpan({ cls: 'case-variables-icon' });
    setIcon(iconEl, TYPE_ICONS[type]);

    row.createSpan({ cls: 'case-variables-name', text: name });
    row.createSpan({ cls: 'case-variables-value', text: String(value) });

    // Inline edit + remove implemented in Task 13
  }

  private renderAddRow(): void {
    const row = this.container.createDiv({ cls: 'case-variables-add-row' });
    row.createSpan({ cls: 'case-variables-add-icon', text: '+' });
    // Full add row (name input + value input + button) implemented in Task 13b
  }
}
