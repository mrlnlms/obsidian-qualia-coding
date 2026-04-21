import type { CaseVariablesRegistry } from './caseVariablesRegistry';
import type { PropertyType, VariableValue } from './caseVariablesTypes';
import { TYPE_ICONS } from './typeIcons';
import { inferPropertyType } from './inferPropertyType';
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

    const valueContainer = row.createDiv({ cls: 'case-variables-value' });
    this.renderInputForType(valueContainer, name, type, value);

    const removeBtn = row.createSpan({ cls: 'case-variables-remove', text: '×' });
    removeBtn.addEventListener('click', () => this.confirmRemove(name));
  }

  private renderInputForType(
    container: HTMLElement,
    name: string,
    type: PropertyType,
    value: VariableValue,
  ): void {
    const handleChange = (newValue: VariableValue) => {
      void this.config.registry.setVariable(this.config.fileId, name, newValue);
    };

    if (type === 'checkbox') {
      const cb = container.createEl('input', { type: 'checkbox' });
      cb.checked = Boolean(value);
      cb.addEventListener('change', () => handleChange(cb.checked));
      return;
    }

    const inputType =
      type === 'number' ? 'number' :
      type === 'date' ? 'date' :
      type === 'datetime' ? 'datetime-local' :
      'text';

    const input = container.createEl('input', { type: inputType });
    input.value = value == null ? '' : String(value);
    input.addEventListener('blur', () => {
      const raw = input.value;
      const coerced: VariableValue = type === 'number' ? Number(raw) : raw;
      handleChange(coerced);
    });
  }

  private confirmRemove(name: string): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'case-variables-confirm-modal-wrapper';
    const modalBox = document.createElement('div');
    modalBox.className = 'case-variables-confirm-modal';
    const p = document.createElement('p');
    p.textContent = `Remove property "${name}" from this file?`;
    modalBox.appendChild(p);
    const actions = document.createElement('div');
    actions.className = 'case-variables-confirm-actions';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.className = 'mod-warning';
    actions.appendChild(cancel);
    actions.appendChild(remove);
    modalBox.appendChild(actions);
    wrapper.appendChild(modalBox);
    document.body.appendChild(wrapper);

    const close = () => wrapper.remove();
    cancel.addEventListener('click', close);
    remove.addEventListener('click', async () => {
      await this.config.registry.removeVariable(this.config.fileId, name);
      close();
    });
  }

  private renderAddRow(): void {
    const row = this.container.createDiv({ cls: 'case-variables-add-row' });

    const nameInput = row.createEl('input', { type: 'text' });
    nameInput.dataset.role = 'name';
    nameInput.placeholder = 'Property name';

    const valueInput = row.createEl('input', { type: 'text' });
    valueInput.dataset.role = 'value';
    valueInput.placeholder = 'Value';

    const addBtn = row.createEl('button', { text: 'Add' });
    addBtn.dataset.role = 'add';

    const handleAdd = async () => {
      const name = nameInput.value.trim();
      const rawValue = valueInput.value;
      if (!name) return;

      const type = inferPropertyType(rawValue);
      const coerced: VariableValue =
        type === 'number' ? Number(rawValue) :
        type === 'checkbox' ? /^true$/i.test(rawValue) :
        rawValue;

      await this.config.registry.setVariable(this.config.fileId, name, coerced);
      nameInput.value = '';
      valueInput.value = '';
    };

    addBtn.addEventListener('click', () => void handleAdd());
    valueInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void handleAdd();
    });
  }
}
