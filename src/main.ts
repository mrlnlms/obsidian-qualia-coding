import { Plugin } from 'obsidian';
import { DataManager } from './core/dataManager';
import { QualiaSettingTab } from './core/settingTab';
import { CodeDefinitionRegistry } from './core/codeDefinitionRegistry';
import type { EngineCleanup } from './core/types';
import { BaseCodeDetailView } from './core/baseCodeDetailView';
import { clearFileInterceptRules } from './core/fileInterceptor';
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
import { ConsolidationCache } from './analytics/data/consolidationCache';
import { setupFileInterceptor } from './core/fileInterceptor';
import type { PdfCodingModel } from './pdf/pdfCodingModel';
import type { ImageCodingModel } from './image/imageCodingModel';
import type { CsvCodingModel } from './csv/csvCodingModel';
import type { AudioCodingModel } from './audio/audioCodingModel';
import type { VideoCodingModel } from './video/videoCodingModel';

export default class QualiaCodingPlugin extends Plugin {
	dataManager!: DataManager;
	sharedRegistry!: CodeDefinitionRegistry;
	private cleanups: EngineCleanup[] = [];
	updateFileMarkersEffect?: import('@codemirror/state').StateEffectType<{ fileId: string }>;
	setFileIdEffect?: import('@codemirror/state').StateEffectType<{ fileId: string }>;
	markdownModel?: import('./markdown/models/codeMarkerModel').CodeMarkerModel;
	pdfModel?: PdfCodingModel;
	imageModel?: ImageCodingModel;
	csvModel?: CsvCodingModel;
	audioModel?: AudioCodingModel;
	videoModel?: VideoCodingModel;

	async onload() {
		console.log(`[Qualia Coding] v${this.manifest.version} loaded`);
		this.dataManager = new DataManager(this);
		await this.dataManager.load();

		// Single shared registry for ALL engines
		this.sharedRegistry = CodeDefinitionRegistry.fromJSON(
			this.dataManager.section('registry'),
		);

		// Auto-persist registry on any mutation (create/update/delete code)
		// Also notify sidebar views to refresh (rename, color, description changes)
		this.sharedRegistry.addOnMutate(() => {
			this.dataManager.setSection('registry', this.sharedRegistry.toJSON());
			document.dispatchEvent(new Event('qualia:registry-changed'));
		});

		this.addSettingTab(new QualiaSettingTab(this.app, this));

		// Register engines — all receive the same registry instance
		const markdown = registerMarkdownEngine(this);
		this.cleanups.push(markdown.cleanup);

		const pdf = registerPdfEngine(this);
		this.cleanups.push(pdf.cleanup);

		const image = registerImageEngine(this);
		this.cleanups.push(image.cleanup);

		const csv = registerCsvEngine(this);
		this.cleanups.push(csv.cleanup);

		const audio = registerAudioEngine(this);
		this.cleanups.push(audio.cleanup);

		const video = registerVideoEngine(this);
		this.cleanups.push(video.cleanup);

		// Consolidation cache — per-engine dirty tracking
		const consolidationCache = new ConsolidationCache();
		this.cleanups.push(registerAnalyticsEngine(this, consolidationCache));

		// Single active-leaf-change listener for file-open interception
		setupFileInterceptor(this);

		// Build unified model from all engines
		const mdModel = markdown.model.codeMarkerModel;
		const pdfModel = pdf.model;
		const imageModel = image.model;
		const csvModel = csv.model;
		const audioModel = audio.model;
		const videoModel = video.model;

		// Wire engine models → consolidation cache invalidation
		mdModel.onChange(() => consolidationCache.invalidateEngine('markdown'));
		pdfModel.onChange(() => consolidationCache.invalidateEngine('pdf'));
		imageModel.onChange(() => consolidationCache.invalidateEngine('image'));
		csvModel.onChange(() => consolidationCache.invalidateEngine('csv'));
		audioModel.onChange(() => consolidationCache.invalidateEngine('audio'));
		videoModel.onChange(() => consolidationCache.invalidateEngine('video'));

		// Registry mutations → invalidate codes
		this.sharedRegistry.addOnMutate(() => consolidationCache.invalidateRegistry());

		const pdfAdapter = new PdfSidebarAdapter(pdfModel);
		const imageAdapter = new ImageSidebarAdapter(imageModel);
		const csvAdapter = new CsvSidebarAdapter(csvModel);
		const audioAdapter = new AudioSidebarAdapter(audioModel);
		const videoAdapter = new VideoSidebarAdapter(videoModel);
		const unifiedModel = new UnifiedModelAdapter(
			this.sharedRegistry,
			[mdModel, pdfAdapter, imageAdapter, csvAdapter, audioAdapter, videoAdapter],
		);

		// Register unified sidebar views (single set for ALL engines)
		this.registerView(CODE_EXPLORER_VIEW_TYPE, (leaf) =>
			new UnifiedCodeExplorerView(leaf, unifiedModel, mdModel));
		this.registerView(CODE_DETAIL_VIEW_TYPE, (leaf) =>
			new UnifiedCodeDetailView(leaf, unifiedModel, mdModel));

		// ── Cross-engine navigation listeners ──────────────────────────
		// These serve ALL engines (margin panel label-click, hover menu code-click)
		// and open the unified sidebar views. Previously lived in markdown/index.ts.

		const onLabelClick = (evt: Event) => {
			const detail = (evt as CustomEvent<{ markerId: string; codeName: string }>).detail;
			if (!detail?.markerId || !detail?.codeName) return;
			// Resolve codeName → codeId at the event boundary
			const def = this.sharedRegistry.getByName(detail.codeName);
			if (!def) return;
			this.revealCodeDetailPanel(detail.markerId, def.id);
		};
		document.addEventListener('codemarker:label-click', onLabelClick);
		this.register(() => document.removeEventListener('codemarker:label-click', onLabelClick));

		const onCodeClick = (evt: Event) => {
			const detail = (evt as CustomEvent<{ codeName: string }>).detail;
			if (!detail?.codeName) return;
			// Resolve codeName → codeId at the event boundary
			const def = this.sharedRegistry.getByName(detail.codeName);
			if (!def) return;
			this.revealCodeDetailForCode(def.id);
		};
		document.addEventListener('codemarker:code-click', onCodeClick);
		this.register(() => document.removeEventListener('codemarker:code-click', onCodeClick));
	}

	// ── Sidebar reveal helpers (used by cross-engine listeners + commands) ──

	async revealCodeDetailPanel(markerId: string, codeId: string) {
		const leaves = this.app.workspace.getLeavesOfType(CODE_DETAIL_VIEW_TYPE);
		const existing = leaves[0];
		if (existing) {
			const view = existing.view as BaseCodeDetailView;
			view.setContext(markerId, codeId);
			this.app.workspace.revealLeaf(existing);
		} else {
			const leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: CODE_DETAIL_VIEW_TYPE, active: true });
				const view = leaf.view as BaseCodeDetailView;
				view.setContext(markerId, codeId);
				this.app.workspace.revealLeaf(leaf);
			}
		}
	}

	async revealCodeDetailForCode(codeId: string) {
		const leaves = this.app.workspace.getLeavesOfType(CODE_DETAIL_VIEW_TYPE);
		const existing = leaves[0];
		if (existing) {
			const view = existing.view as BaseCodeDetailView;
			view.showCodeDetail(codeId);
			this.app.workspace.revealLeaf(existing);
		} else {
			const leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: CODE_DETAIL_VIEW_TYPE, active: true });
				const view = leaf.view as BaseCodeDetailView;
				view.showCodeDetail(codeId);
				this.app.workspace.revealLeaf(leaf);
			}
		}
	}

	async onunload() {
		clearFileInterceptRules();
		this.app.workspace.detachLeavesOfType(CODE_EXPLORER_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(CODE_DETAIL_VIEW_TYPE);

		for (let i = this.cleanups.length - 1; i >= 0; i--) {
			try { await this.cleanups[i]!(); } catch (e) {
				console.error(`QualiaCoding: cleanup[${i}] failed`, e);
			}
		}
		// Persist shared registry back to DataManager
		this.dataManager.setSection('registry', this.sharedRegistry.toJSON());
		await this.dataManager.flush();
	}
}
