/**
 * SplitNewCodeModal — usado pela ação "Split em código novo" do drill-down P2.
 *
 * Pede nome obrigatório + cor opcional (hex picker). Submit dispara onSubmit
 * com { name, color? }; caller cria CodeDefinition e dispara reconciliação.
 */

import { App, Modal } from 'obsidian';
import type { CodeDefinitionRegistry } from '../../codeDefinitionRegistry';

export class SplitNewCodeModal extends Modal {
	private name = '';
	private color: string | undefined;

	constructor(
		app: App,
		private registry: CodeDefinitionRegistry,
		private onSubmit: (params: { name: string; color?: string }) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: 'Split em código novo' });

		const nameRow = contentEl.createDiv({ cls: 'qc-cc-split-row' });
		nameRow.createEl('label', { text: 'Nome do código' });
		const nameInput = nameRow.createEl('input', { type: 'text' });
		nameInput.placeholder = 'Ex: Frustração-com-tempo';
		nameInput.oninput = () => { this.name = nameInput.value; };
		setTimeout(() => nameInput.focus(), 0);

		const colorRow = contentEl.createDiv({ cls: 'qc-cc-split-row' });
		colorRow.createEl('label', { text: 'Cor (opcional)' });
		const colorInput = colorRow.createEl('input', { type: 'color' });
		colorInput.value = '#888888';
		colorInput.oninput = () => { this.color = colorInput.value; };

		const actions = contentEl.createDiv({ cls: 'qc-cc-split-actions' });
		const cancelBtn = actions.createEl('button', { text: 'Cancelar' });
		cancelBtn.onclick = () => this.close();
		const submitBtn = actions.createEl('button', { cls: 'mod-cta', text: 'Criar e adotar' });
		submitBtn.onclick = () => {
			const trimmed = this.name.trim();
			if (!trimmed) {
				alert('Nome é obrigatório.');
				return;
			}
			if (this.registry.getByName(trimmed)) {
				if (!confirm(`Já existe um código "${trimmed}". Reusar o existente?`)) return;
			}
			this.close();
			this.onSubmit({ name: trimmed, color: this.color });
		};

		nameInput.addEventListener('keydown', e => {
			if (e.key === 'Enter') submitBtn.click();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
