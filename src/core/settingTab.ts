import { App, PluginSettingTab, Setting } from 'obsidian';
import type QualiaCodingPlugin from '../main';
import { ExportModal } from '../export/exportModal';
import { openExportModal } from '../export/exportCommands';
import { refreshMediaToggleButtons } from './mediaToggleButton';

export class QualiaSettingTab extends PluginSettingTab {
	plugin: QualiaCodingPlugin;

	constructor(app: App, plugin: QualiaCodingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const settings = this.plugin.dataManager.section('markdown').settings;
		const save = () => this.plugin.dataManager.markDirty();
		const refreshDecorations = () => {
			const model = this.plugin.markdownModel;
			if (!model) return;
			for (const fileId of model.getAllFileIds()) {
				model.updateMarkersForFile(fileId);
			}
		};

		// ── General ────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'General' });

		const generalSettings = this.plugin.dataManager.section('general');

		new Setting(containerEl)
			.setName('Show magnitude in popover')
			.setDesc('Show magnitude picker section in the coding popover for codes with magnitude configured')
			.addToggle(toggle => toggle
				.setValue(generalSettings.showMagnitudeInPopover)
				.onChange((value) => {
					generalSettings.showMagnitudeInPopover = value;
					save();
				}));

		new Setting(containerEl)
			.setName('Show relations in popover')
			.setDesc('Show relations section in the coding popover for adding segment-level relations')
			.addToggle(toggle => toggle
				.setValue(generalSettings.showRelationsInPopover)
				.onChange((value) => {
					generalSettings.showRelationsInPopover = value;
					save();
				}));

		// ── Markdown ────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'Markdown' });

		new Setting(containerEl)
			.setName('Default color')
			.setDesc('Default highlight color for new markers')
			.addColorPicker(color => color
				.setValue(settings.defaultColor)
				.onChange((value) => {
					settings.defaultColor = value;
					save();
				}));

		new Setting(containerEl)
			.setName('Marker opacity')
			.setDesc('Transparency of the marker highlight (0.1–0.5)')
			.addSlider(slider => slider
				.setLimits(0.1, 0.5, 0.05)
				.setValue(settings.markerOpacity)
				.setDynamicTooltip()
				.onChange((value) => {
					settings.markerOpacity = value;
					save();
					refreshDecorations();
				}));

		new Setting(containerEl)
			.setName('Show handles on hover')
			.setDesc('Only show drag handles when hovering over a marker')
			.addToggle(toggle => toggle
				.setValue(settings.showHandlesOnHover)
				.onChange((value) => {
					settings.showHandlesOnHover = value;
					save();
					refreshDecorations();
				}));

		containerEl.createEl('h3', { text: 'Menus' });

		new Setting(containerEl)
			.setName('Show menu on text selection')
			.setDesc('Automatically show the coding menu when you select text')
			.addToggle(toggle => toggle
				.setValue(settings.showMenuOnSelection)
				.onChange((value) => {
					settings.showMenuOnSelection = value;
					save();
				}));

		new Setting(containerEl)
			.setName('Show in right-click menu')
			.setDesc('Add code options to the editor right-click context menu')
			.addToggle(toggle => toggle
				.setValue(settings.showMenuOnRightClick)
				.onChange((value) => {
					settings.showMenuOnRightClick = value;
					save();
				}));

		new Setting(containerEl)
			.setName('Show ribbon button')
			.setDesc('Show a "Code Selection" button in the left ribbon')
			.addToggle(toggle => toggle
				.setValue(settings.showRibbonButton)
				.onChange((value) => {
					settings.showRibbonButton = value;
					save();
				}));

		// ── Media ──────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'Media' });
		containerEl.createEl('p', {
			text: 'When enabled, files open in the plugin\'s Coding View instead of the native Obsidian viewer. When disabled, files open in the native viewer (no coding features active). The header button lets you toggle between modes for any open file.',
			cls: 'setting-item-description',
		});

		const imageSettings = this.plugin.dataManager.section('image').settings;
		const audioSettings = this.plugin.dataManager.section('audio').settings;
		const videoSettings = this.plugin.dataManager.section('video').settings;
		const pdfSettings = this.plugin.dataManager.section('pdf').settings;

		const renderMediaPair = (
			autoOpenLabel: string,
			autoOpenDesc: string,
			shortName: string,
			settingsObj: { autoOpen: boolean; showButton: boolean },
		) => {
			new Setting(containerEl)
				.setName(autoOpenLabel)
				.setDesc(autoOpenDesc)
				.addToggle(toggle => toggle
					.setValue(settingsObj.autoOpen)
					.onChange((value) => { settingsObj.autoOpen = value; save(); }));

			new Setting(containerEl)
				.setName(`Show toggle button in ${shortName} header`)
				.setDesc('Adds a header button to switch between native and coding view at any time.')
				.setClass('qualia-setting-indent')
				.addToggle(toggle => toggle
					.setValue(settingsObj.showButton)
					.onChange((value) => {
						settingsObj.showButton = value;
						save();
						refreshMediaToggleButtons(this.plugin);
					}));
		};

		renderMediaPair('Open images in coding view', 'PNG, JPG, WebP, SVG, etc.', 'image', imageSettings);
		renderMediaPair('Open audio in coding view', 'MP3, WAV, OGG, M4A, etc.', 'audio', audioSettings);
		renderMediaPair('Open video in coding view', 'MP4, WebM, MKV, MOV, etc.', 'video', videoSettings);
		renderMediaPair('Enable coding on PDF files', 'Adds highlight/shape/selection-to-code overlay on the native PDF viewer.', 'PDF', pdfSettings);

		new Setting(containerEl)
			.setName('Open toggle in a new tab')
			.setDesc('When on, the header button opens the alternate view in a new tab instead of replacing the current one. Does not apply to PDF (toggle is always in-place).')
			.addToggle(toggle => toggle
				.setValue(generalSettings.openToggleInNewTab)
				.onChange((value) => {
					generalSettings.openToggleInNewTab = value;
					save();
				}));

		// ── Tabular files (CSV / Parquet) ───────────────────────
		containerEl.createEl('h2', { text: 'Tabular files (CSV / Parquet)' });

		const csvSection = (this.plugin.dataManager.section('csv') as { settings: { parquetSizeWarningMB: number; csvSizeWarningMB: number } });
		// Defensive: vault legado pode não ter settings
		if (!csvSection.settings) {
			csvSection.settings = { parquetSizeWarningMB: 50, csvSizeWarningMB: 100 };
		}

		new Setting(containerEl)
			.setName('Parquet size warning (MB)')
			.setDesc('Show "Large file" banner before opening parquet larger than this. Decode is heavy (~5-18× heap multiplier). Default 50 MB. Bench data: 78 MB → 1.4 GB RSS.')
			.addText(text => text
				.setPlaceholder('50')
				.setValue(String(csvSection.settings.parquetSizeWarningMB))
				.onChange((value) => {
					const n = parseInt(value, 10);
					if (Number.isFinite(n) && n > 0) {
						csvSection.settings.parquetSizeWarningMB = n;
						save();
					}
				}));

		new Setting(containerEl)
			.setName('CSV size warning (MB)')
			.setDesc('Show "Large file" banner before opening CSV larger than this. Default 100 MB. Bench data: 148 MB CSV → 1 GB RSS (~7× multiplier).')
			.addText(text => text
				.setPlaceholder('100')
				.setValue(String(csvSection.settings.csvSizeWarningMB))
				.onChange((value) => {
					const n = parseInt(value, 10);
					if (Number.isFinite(n) && n > 0) {
						csvSection.settings.csvSizeWarningMB = n;
						save();
					}
				}));

		// ── Export ──────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'Export' });

		new Setting(containerEl)
			.setName('Export project (QDPX)')
			.setDesc('Export codes, segments, and sources as a REFI-QDA project')
			.addButton(btn => btn
				.setButtonText('Export QDPX')
				.onClick(() => {
					new ExportModal(this.app, this.plugin.dataManager, this.plugin.sharedRegistry, 'qdpx', this.plugin.manifest.version, this.plugin.caseVariablesRegistry).open();
				}));

		new Setting(containerEl)
			.setName('Export codebook (QDC)')
			.setDesc('Export only the code definitions and hierarchy')
			.addButton(btn => btn
				.setButtonText('Export QDC')
				.onClick(() => {
					new ExportModal(this.app, this.plugin.dataManager, this.plugin.sharedRegistry, 'qdc', this.plugin.manifest.version, this.plugin.caseVariablesRegistry).open();
				}));

		new Setting(containerEl)
			.setName('Tabular export for external analysis')
			.setDesc('Export codes, segments, and case variables as a zip of CSVs for use in R, Python, or BI tools.')
			.addButton(btn => btn
				.setButtonText('Open export dialog')
				.onClick(() => openExportModal(this.plugin, 'tabular')));
	}
}
