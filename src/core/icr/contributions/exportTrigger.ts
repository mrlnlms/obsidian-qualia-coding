/**
 * Export trigger — orquestra:
 * 1. filtra coders humanos (type === 'human')
 * 2. modal seleção (se >1) ou usa direto (se 1) ou aborta (se 0)
 * 3. extractCoderContribution
 * 4. write em vault-relative path icr-exports/<slug>-<iso>.json
 * 5. Notice de sucesso
 */

import { Modal, Notice, type App } from 'obsidian';
import type QualiaCodingPlugin from '../../../main';
import type { Coder } from '../coderTypes';
import { extractCoderContribution } from '../transport/extractCoderContribution';

export function sanitizeFilename(coderName: string, isoTimestamp: string): string {
	const slug = coderName
		.toLowerCase()
		.normalize('NFD').replace(/[̀-ͯ]/g, '') // strip combining diacritics
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	const safeIso = isoTimestamp.replace(/:/g, '-');
	return `${slug}-${safeIso}.json`;
}

export function filterHumanCoders(coders: Coder[]): Coder[] {
	return coders.filter(c => c.type === 'human');
}

export async function runExportTrigger(plugin: QualiaCodingPlugin): Promise<void> {
	const allCoders = plugin.coderRegistry.getAll();
	const humans = filterHumanCoders(allCoders);

	if (humans.length === 0) {
		new Notice('ICR Export: nenhum coder humano registrado');
		return;
	}

	const coder = humans.length === 1
		? humans[0]!
		: await pickCoderModal(plugin.app, humans);

	if (!coder) return; // user cancelou

	const result = await extractCoderContribution(
		plugin.dataManager.getDataRef(),
		coder.id,
		plugin.sourceHashRegistry,
	);

	const filename = sanitizeFilename(coder.name, new Date().toISOString());
	const path = `icr-exports/${filename}`;

	const adapter = plugin.app.vault.adapter;
	if (!await adapter.exists('icr-exports')) {
		await adapter.mkdir('icr-exports');
	}
	await adapter.write(path, JSON.stringify(result.payload, null, 2));

	new Notice(`ICR Export: salvo em ${path}`);
}

class CoderPickerModal extends Modal {
	private selected: Coder | null = null;
	private resolve!: (c: Coder | null) => void;
	private resolved = false;
	public promise: Promise<Coder | null>;

	constructor(app: App, private coders: Coder[]) {
		super(app);
		// Promise no constructor pra evitar race com onOpen disparado por super.open()
		this.promise = new Promise(resolve => {
			this.resolve = resolve;
		});
	}

	private resolveOnce(value: Coder | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve(value);
	}

	onOpen(): void {
		this.titleEl.setText('Escolher coder pra exportar');
		const list = this.contentEl.createDiv({ cls: 'qc-icr-coder-picker' });
		for (const c of this.coders) {
			const item = list.createDiv({ cls: 'qc-icr-coder-picker-item' });
			const radio = item.createEl('input', { type: 'radio', attr: { name: 'coder' } });
			radio.value = c.id;
			radio.onchange = () => { this.selected = c; };
			item.createSpan({ text: ` ${c.name}` });
		}

		const buttons = this.contentEl.createDiv({ cls: 'qc-icr-coder-picker-buttons' });
		const confirm = buttons.createEl('button', { cls: 'mod-cta', text: 'Confirm' });
		confirm.onclick = () => { this.resolveOnce(this.selected); this.close(); };
		const cancel = buttons.createEl('button', { text: 'Cancel' });
		cancel.onclick = () => { this.resolveOnce(null); this.close(); };
	}

	onClose(): void {
		this.resolveOnce(null); // safety: fechou via X / Esc sem decidir
		this.contentEl.empty();
	}
}

async function pickCoderModal(app: App, coders: Coder[]): Promise<Coder | null> {
	const modal = new CoderPickerModal(app, coders);
	modal.open();
	return await modal.promise;
}
