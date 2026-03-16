import { Plugin } from 'obsidian';
import { DataManager } from './core/dataManager';
import { QualiaSettingTab } from './core/settingTab';
import { CodeDefinitionRegistry } from './core/codeDefinitionRegistry';
import type { EngineCleanup, SidebarModelInterface } from './core/types';
import { UnifiedModelAdapter } from './core/unifiedModelAdapter';
import { UnifiedCodeExplorerView, CODE_EXPLORER_VIEW_TYPE } from './core/unifiedExplorerView';
import { UnifiedCodeDetailView, CODE_DETAIL_VIEW_TYPE } from './core/unifiedDetailView';
import { PdfSidebarAdapter } from './pdf/views/pdfSidebarAdapter';
import { ImageSidebarAdapter } from './image/views/imageSidebarAdapter';
import { CsvSidebarAdapter } from './csv/views/csvSidebarAdapter';
import { AudioSidebarAdapter } from './audio/views/audioSidebarAdapter';
import { VideoSidebarAdapter } from './video/views/videoSidebarAdapter';
import { registerMarkdownEngine } from './markdown';
import { registerPdfEngine } from './pdf';
import { registerImageEngine } from './image';
import { registerCsvEngine } from './csv';
import { registerAudioEngine } from './audio';
import { registerVideoEngine } from './video';
import { registerAnalyticsEngine } from './analytics';
import { setupFileInterceptor } from './core/fileInterceptor';
import type { CodeMarkerModel } from './markdown/models/codeMarkerModel';
import type { PdfCodingModel } from './pdf/pdfCodingModel';
import type { ImageCodingModel } from './image/models/codingModel';
import type { CsvCodingModel } from './csv/codingModel';
import type { AudioCodingModel } from './audio/audioCodingModel';
import type { VideoCodingModel } from './video/videoCodingModel';

export default class QualiaCodingPlugin extends Plugin {
	dataManager!: DataManager;
	sharedRegistry!: CodeDefinitionRegistry;
	private cleanups: EngineCleanup[] = [];
	updateFileMarkersEffect: any; // Set by markdown engine
	markdownModel: any; // Set by markdown engine
	pdfModel?: PdfCodingModel;
	imageModel?: ImageCodingModel;
	csvModel?: CsvCodingModel;
	audioModel?: AudioCodingModel;
	videoModel?: VideoCodingModel;

	async onload() {
		console.log('[Qualia Coding] v45 loaded — Cache refresh + market research + strategy docs (final)');
		this.dataManager = new DataManager(this);
		await this.dataManager.load();

		// Single shared registry for ALL engines
		this.sharedRegistry = CodeDefinitionRegistry.fromJSON(
			this.dataManager.section('registry'),
		);

		this.addSettingTab(new QualiaSettingTab(this.app, this));

		// Register engines — all receive the same registry instance
		this.cleanups.push(registerMarkdownEngine(this));
		this.cleanups.push(registerPdfEngine(this));
		this.cleanups.push(registerImageEngine(this));
		this.cleanups.push(registerCsvEngine(this));
		this.cleanups.push(registerAudioEngine(this));
		this.cleanups.push(registerVideoEngine(this));
		this.cleanups.push(registerAnalyticsEngine(this));

		// Single active-leaf-change listener for file-open interception
		setupFileInterceptor(this);

		// Build unified model from all engines
		const mdModel = this.markdownModel as CodeMarkerModel;
		const pdfModel = this.pdfModel!;
		const imageModel = this.imageModel!;
		const csvModel = this.csvModel!;
		const audioModel = this.audioModel!;
		const videoModel = this.videoModel!;
		const pdfAdapter = new PdfSidebarAdapter(pdfModel);
		const imageAdapter = new ImageSidebarAdapter(imageModel);
		const csvAdapter = new CsvSidebarAdapter(csvModel);
		const audioAdapter = new AudioSidebarAdapter(audioModel);
		const videoAdapter = new VideoSidebarAdapter(videoModel);
		const unifiedModel = new UnifiedModelAdapter(
			this.sharedRegistry,
			[mdModel as unknown as SidebarModelInterface, pdfAdapter, imageAdapter, csvAdapter, audioAdapter, videoAdapter],
		);

		// Register unified sidebar views (single set for ALL engines)
		this.registerView(CODE_EXPLORER_VIEW_TYPE, (leaf) =>
			new UnifiedCodeExplorerView(leaf, unifiedModel, mdModel));
		this.registerView(CODE_DETAIL_VIEW_TYPE, (leaf) =>
			new UnifiedCodeDetailView(leaf, unifiedModel, mdModel));
	}

	async onunload() {
		this.app.workspace.detachLeavesOfType(CODE_EXPLORER_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(CODE_DETAIL_VIEW_TYPE);

		for (let i = this.cleanups.length - 1; i >= 0; i--) {
			await this.cleanups[i]!();
		}
		// Persist shared registry back to DataManager
		this.dataManager.setSection('registry', this.sharedRegistry.toJSON());
		await this.dataManager.flush();
	}
}
