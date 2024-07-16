import { App, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, ItemView, Notice, Modal, TextComponent, normalizePath } from 'obsidian';
import { writeFile, appendFile, readFile, access, constants } from 'fs/promises';
import * as path from 'path';

const VIEW_TYPE_CSV = "csv-view";

export default class MyPlugin extends Plugin {
	async onload() {
		console.log('[Management Codes] v12 loaded -- Code management: CSV view + file operations');
		this.addRibbonIcon('file-plus', 'Add Item', async () => {
			new InputModal(this).open();
		});

		this.registerView(
			VIEW_TYPE_CSV,
			(leaf) => new CSVView(leaf, this)
		);

		// Abrir automaticamente a view na sidebar
		if (!this.app.workspace.getLeavesOfType(VIEW_TYPE_CSV).length) {
			this.app.workspace.getRightLeaf(false)?.setViewState({
				type: VIEW_TYPE_CSV,
			});
		}
	}

	async saveItemToCSV(item: string) {
		const filePath = this.getCSVFilePath();
		try {
			await this.ensureFileExists(filePath);
			await appendFile(filePath, `${item}\n`);
			new Notice('Item added to CSV');
			this.updateCSVView();
		} catch (error) {
			console.error('Failed to save item to CSV:', error);
			new Notice('Failed to save item to CSV');
		}
	}

	getCSVFilePath(): string {
		const basePath = (this.app.vault.adapter as any).basePath || (this.app.vault as any).configDir;
		return path.join(basePath, 'items.csv');
	}

	async ensureFileExists(filePath: string) {
		try {
			await access(filePath, constants.F_OK);
		} catch (error) {
			await writeFile(filePath, ''); // Create the file if it does not exist
		}
	}

	async updateCSVView() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CSV);
		if (leaves.length) {
			const view = leaves[0].view as CSVView;
			view.loadItemsFromCSV();
		}
	}
}

class CSVView extends ItemView {
	plugin: MyPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.loadItemsFromCSV();
	}

	getViewType() {
		return VIEW_TYPE_CSV;
	}

	getDisplayText() {
		return 'CSV Items';
	}

	async loadItemsFromCSV() {
		const filePath = this.plugin.getCSVFilePath();
		let content = '';

		try {
			await this.plugin.ensureFileExists(filePath);
			content = await readFile(filePath, 'utf-8');
		} catch (error) {
			console.error('Failed to read CSV file:', error);
			new Notice('Failed to load CSV items');
		}

		const items = content.split('\n').filter((line) => line.trim() !== '');
		const container = this.containerEl.children[1];

		container.empty();
		items.forEach((item) => {
			const div = document.createElement('div');
			div.textContent = item;
			container.appendChild(div);
		});
	}

	async onOpen() {
		this.loadItemsFromCSV();
	}

	async onClose() {
		// Handle any cleanup if necessary
	}
}

class InputModal extends Modal {
	plugin: MyPlugin;
	input: TextComponent;

	constructor(plugin: MyPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Add New Item' });

		this.input = new TextComponent(contentEl);
		this.input.inputEl.style.width = '100%';
		this.input.inputEl.focus();

		const saveButton = contentEl.createEl('button', { text: 'Save' });
		saveButton.style.marginTop = '10px';
		saveButton.onclick = async () => {
			const newItem = this.input.getValue();
			if (newItem) {
				await this.plugin.saveItemToCSV(newItem);
				this.close();
			} else {
				new Notice('Please enter a valid item');
			}
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
