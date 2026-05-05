import { Plugin, FileView, Notice, TFile, type View, type WorkspaceLeaf } from 'obsidian';
import { createDuckDBRuntime, type DuckDBRuntime } from './csv/duckdb';
import { DataManager } from './core/dataManager';
import { QualiaSettingTab } from './core/settingTab';
import { CodeDefinitionRegistry } from './core/codeDefinitionRegistry';
import { appendEntry, renderCodeHistoryMarkdown } from './core/auditLog';
import { CaseVariablesRegistry } from './core/caseVariables/caseVariablesRegistry';
import { CaseVariablesView } from './core/caseVariables/caseVariablesView';
import { CASE_VARIABLES_VIEW_TYPE } from './core/caseVariables/caseVariablesViewTypes';
import { openPropertiesPopover } from './core/caseVariables/propertiesPopover';
import { openCodeVisibilityPopover } from './core/codeVisibilityPopover';
import type { EngineCleanup, CodeDefinition, AuditEntry } from './core/types';
import { BaseCodeDetailView } from './core/baseCodeDetailView';
import { clearFileInterceptRules } from './core/fileInterceptor';
import { teardownMediaToggleButtons } from './core/mediaToggleButton';
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
import { prepopulateMarkerCaches } from './csv/prepopulateMarkerCaches';
import { registerAudioEngine } from './audio';
import { registerVideoEngine } from './video';
import { registerAnalyticsEngine } from './analytics';
import { ConsolidationCache } from './analytics/data/consolidationCache';
import { registerExportCommands } from './export/exportCommands';
import { registerImportCommands } from './import/importCommands';
import { setupFileInterceptor, registerFileRename } from './core/fileInterceptor';
import { setupMediaToggleButton } from './core/mediaToggleButton';
import { visibilityEventBus } from './core/visibilityEventBus';
import { registerMemoListeners, rebuildMemoReverseLookup } from './core/memoMaterializerListeners';
import { convertMemoToNote, unmaterialize as unmaterializeMemo } from './core/memoMaterializer';
import { MaterializeAllMemosModal } from './core/materializeAllMemosModal';
import { SmartCodeCache } from './core/smartCodes/cache';
import { SmartCodeRegistry } from './core/smartCodes/smartCodeRegistryApi';
import { SmartCodeListModal } from './core/smartCodes/smartCodeListModal';
import { SmartCodeBuilderModal } from './core/smartCodes/builderModal';
import type { PdfCodingModel } from './pdf/pdfCodingModel';
import type { ImageCodingModel } from './image/imageCodingModel';
import type { CsvCodingModel } from './csv/csvCodingModel';
import type { AudioCodingModel } from './audio/audioCodingModel';
import type { VideoCodingModel } from './video/videoCodingModel';
export default class QualiaCodingPlugin extends Plugin {
	dataManager!: DataManager;
	sharedRegistry!: CodeDefinitionRegistry;
	caseVariablesRegistry!: CaseVariablesRegistry;
	private cleanups: EngineCleanup[] = [];
	// Tracks the refresh listener per FileView for dedupe (.has) and re-invocation
	// on same-leaf navigation (.get(view)?.()). Cleanup happens via view.register() —
	// this map is NOT responsible for listener teardown.
	private caseVariablesViewListeners = new WeakMap<View, () => void>();
	// Tracks injected action buttons for teardown on plugin disable. Obsidian does
	// not remove plugin-added actions on unload; without explicit detach, re-enable
	// adds a duplicate button next to the orphan. Map entry auto-deleted on view close.
	private caseVariablesButtons = new Map<View, HTMLElement>();
	// Active Case Variables popover — tracked so it can be closed on plugin unload
	// (prevents orphan DOM + dead listeners during hot-reload). Only one popover
	// can be open at a time by design (clicking another button closes the previous).
	private activePopoverClose: (() => void) | null = null;
	updateFileMarkersEffect?: import('@codemirror/state').StateEffectType<{ fileId: string }>;
	setFileIdEffect?: import('@codemirror/state').StateEffectType<{ fileId: string }>;

	// DuckDB runtime — lazy. First call to getDuckDB() instantiates; subsequent calls
	// return the cached instance. Null until first use; reset to null on onunload.
	private duckdb: DuckDBRuntime | null = null;
	private duckdbInitPromise: Promise<DuckDBRuntime> | null = null;
	markdownModel?: import('./markdown/models/codeMarkerModel').CodeMarkerModel;
	pdfModel?: PdfCodingModel;
	imageModel?: ImageCodingModel;
	csvModel?: CsvCodingModel;
	audioModel?: AudioCodingModel;
	videoModel?: VideoCodingModel;
	togglePdfInstrumentation?: (view: unknown, force?: 'on' | 'off') => void;
	memoReverseLookup: Map<string, import('./core/memoTypes').EntityRef> = new Map();
	memoSelfWriting: Set<string> = new Set();

	// Smart Codes (Tier 3)
	smartCodeCache!: SmartCodeCache;
	smartCodeRegistry!: SmartCodeRegistry;

	async onload() {
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

		// Audit log: registry events viram entries em data.auditLog (com coalescing pra description/memo).
		this.sharedRegistry.setAuditListener((event) => {
			const log = (this.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
			appendEntry(log, { ...event, at: Date.now() });
			this.dataManager.setSection('auditLog', log);
		});

		this.sharedRegistry.addVisibilityListener((detail) => {
			visibilityEventBus.notify(detail.codeIds);
		});

		// Memo materialization: reconstrói reverse-lookup + registra vault listeners
		// (modify/rename/delete espelham mudanças do .md de volta pro data.json).
		rebuildMemoReverseLookup(this);
		registerMemoListeners(this);

		// Hydrate visibility overrides from persisted data
		const storedOverrides = this.dataManager.section('visibilityOverrides');
		if (storedOverrides) {
			this.sharedRegistry.visibilityOverrides = storedOverrides;
		}

		// Persist overrides + notify views on visibility changes
		this.sharedRegistry.addVisibilityListener(() => {
			// Persist current overrides state
			this.dataManager.setSection('visibilityOverrides', this.sharedRegistry.visibilityOverrides);
			// Persist registry (covers hidden flag changes on CodeDefinition)
			this.dataManager.setSection('registry', this.sharedRegistry.toJSON());
			// Update dot indicator across all open file views
			this.app.workspace.iterateAllLeaves((leaf) => {
				if (leaf.view instanceof FileView) {
					this.updateVisibilityActionIndicator(leaf.view);
				}
			});
		});

		// Case Variables registry — per-file typed properties (like Obsidian Properties for binaries)
		this.caseVariablesRegistry = new CaseVariablesRegistry(this.app, this.dataManager);
		this.caseVariablesRegistry.initialize();
		this.cleanups.push(() => this.caseVariablesRegistry.unload());

		// ─── Smart Codes (Tier 3) ───────────────────────────────
		this.smartCodeRegistry = SmartCodeRegistry.fromJSON(this.dataManager.getDataRef().smartCodes);
		this.smartCodeCache = new SmartCodeCache();
		this.refreshSmartCodeCacheConfig();
		this.smartCodeCache.rebuildIndexes(this.dataManager.getDataRef());

		// Persistência da section + cache invalidation granular por id mudado.
		this.smartCodeRegistry.addOnMutate((changedId) => {
			this.dataManager.setSection('smartCodes', this.smartCodeRegistry.toJSON());
			this.smartCodeCache.onSmartCodeChanged(changedId);
		});

		// Audit: spread direto em appendEntry (mesmo pattern do sharedRegistry).
		this.smartCodeRegistry.setAuditListener((event) => {
			const log = (this.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
			appendEntry(log, { ...event, at: Date.now() });
			this.dataManager.setSection('auditLog', log);
		});

		// Code mutation → invalida smart codes que dependem do code afetado
		this.sharedRegistry.addOnMutate(() => {
			this.smartCodeCache.invalidateAll();
		});
		// Case var mutation → invalida smart codes que dependem
		this.caseVariablesRegistry.addOnMutate(() => {
			this.smartCodeCache.invalidateAll();
		});
		// Marker mutations: re-build indexes + invalidate (event emit em saveMarkers de cada engine — SC3 pendente)
		const onMarkersChanged = () => {
			this.smartCodeCache.rebuildIndexes(this.dataManager.getDataRef());
			this.smartCodeCache.invalidateAll();
		};
		document.addEventListener('qualia:markers-changed', onMarkersChanged);
		this.cleanups.push(() => document.removeEventListener('qualia:markers-changed', onMarkersChanged));

		// Workaround SC3: enquanto models não emitem qualia:markers-changed, hookamos `qualia:registry-changed`
		// (que dispara após qualquer mutação no registry de codes, incl. coding novo). Falha em casos onde só
		// marker muda sem tocar registry (edit de range, magnitude). NÃO incluído pelo SmartCodeRegistry: salvar
		// um SC não toca markers, então não justifica reindex global.
		document.addEventListener('qualia:registry-changed', onMarkersChanged);
		this.cleanups.push(() => document.removeEventListener('qualia:registry-changed', onMarkersChanged));


		this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
			const view = leaf?.view;
			if (view instanceof FileView) {
				this.addCaseVariablesActionToView(view);
				this.addVisibilityActionToView(view);
			}
		}));

		// Cover leaves that don't fire active-leaf-change (e.g. second pane at boot)
		const addActionToAllLeaves = () => {
			this.app.workspace.iterateAllLeaves((leaf) => {
				if (leaf.view instanceof FileView) {
					this.addCaseVariablesActionToView(leaf.view);
					this.addVisibilityActionToView(leaf.view);
				}
			});
		};
		this.app.workspace.onLayoutReady(addActionToAllLeaves);
		this.registerEvent(this.app.workspace.on('layout-change', addActionToAllLeaves));
		// Also react to file-open: covers splits where layout-change fires before view.file is loaded.
		this.registerEvent(this.app.workspace.on('file-open', addActionToAllLeaves));

		// Case variables: migrate on rename, clear on delete
		const CASE_VAR_EXTENSIONS = new Set([
			'md',
			'pdf',
			'jpg', 'jpeg', 'png', 'webp',
			'mp3', 'wav', 'm4a', 'ogg',
			'mp4', 'mov', 'webm',
		]);

		registerFileRename({
			extensions: CASE_VAR_EXTENSIONS,
			onRename: (oldPath, newPath) => {
				this.caseVariablesRegistry.migrateFilePath(oldPath, newPath);
			},
		});

		// Obsidian emits extension-changing renames as create+delete (no rename event).
		// Correlate create and delete within a 2s window by basename OR file size,
		// covering: (a) same name, changed extension; (b) changed name + extension
		// (size survives rename without re-encode — TFile.stat.size is byte-exact).
		interface RecentCreate {
			path: string;
			basename: string;
			size: number;
			timer: ReturnType<typeof setTimeout>;
		}
		const recentCreates = new Map<string, RecentCreate>();
		const basenameNoExt = (path: string): string => {
			const slash = path.lastIndexOf('/');
			const name = slash >= 0 ? path.slice(slash + 1) : path;
			const dot = name.lastIndexOf('.');
			return dot >= 0 ? name.slice(0, dot) : name;
		};

		this.registerEvent(this.app.vault.on('create', (file) => {
			if (!(file instanceof TFile) || !CASE_VAR_EXTENSIONS.has(file.extension)) return;
			const prev = recentCreates.get(file.path);
			if (prev) clearTimeout(prev.timer);
			const timer = setTimeout(() => recentCreates.delete(file.path), 2000);
			recentCreates.set(file.path, {
				path: file.path,
				basename: basenameNoExt(file.path),
				size: file.stat.size,
				timer,
			});
		}));

		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (!(file instanceof TFile) || !CASE_VAR_EXTENSIONS.has(file.extension)) return;
			const deletedBase = basenameNoExt(file.path);
			const deletedSize = file.stat.size;
			let match: RecentCreate | null = null;
			for (const entry of recentCreates.values()) {
				if (entry.path === file.path) continue;
				if (entry.basename === deletedBase || entry.size === deletedSize) {
					match = entry;
					break;
				}
			}
			if (match) {
				this.caseVariablesRegistry.migrateFilePath(file.path, match.path);
				clearTimeout(match.timer);
				recentCreates.delete(match.path);
				return;
			}
			this.caseVariablesRegistry.removeAllForFile(file.path);
			this.sharedRegistry.clearFilePathForOverrides(file.path);
			// Purge markers from each engine model so sidebar counts + analytics stay consistent.
			// Each model's notify() persists + fires onChange listeners.
			this.markdownModel?.removeAllMarkersForFile(file.path);
			this.pdfModel?.removeAllMarkersForFile(file.path);
			this.csvModel?.removeAllMarkersForFile(file.path);
			this.imageModel?.removeAllMarkersForFile(file.path);
			this.audioModel?.removeAllMarkersForFile(file.path);
			this.videoModel?.removeAllMarkersForFile(file.path);
		}));

		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			this.sharedRegistry.migrateFilePathForOverrides(oldPath, file.path);
		}));

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

		registerExportCommands(this);
		registerImportCommands(this);

		// Single active-leaf-change listener for file-open interception
		setupFileInterceptor(this);

		// Toggle button in media view headers (Image/Audio/Video/PDF)
		setupMediaToggleButton(this);

		// Build unified model from all engines
		const mdModel = markdown.model.codeMarkerModel;
		const pdfModel = pdf.model;
		const imageModel = image.model;
		const csvModel = csv.model;
		const audioModel = audio.model;
		const videoModel = video.model;

		// Expose on plugin so bulk operations (import, clear all) can reload model state
		this.markdownModel = mdModel;
		this.pdfModel = pdfModel;
		this.imageModel = imageModel;
		this.csvModel = csvModel;
		this.audioModel = audioModel;
		this.videoModel = videoModel;

		// Wire engine models → consolidation cache invalidation
		mdModel.onChange(() => consolidationCache.invalidateEngine('markdown'));
		pdfModel.onChange(() => consolidationCache.invalidateEngine('pdf'));
		imageModel.onChange(() => consolidationCache.invalidateEngine('image'));
		csvModel.onChange(() => consolidationCache.invalidateEngine('csv'));
		audioModel.onChange(() => consolidationCache.invalidateEngine('audio'));
		videoModel.onChange(() => consolidationCache.invalidateEngine('video'));

		// Background pre-populate of CSV/parquet caches: lets sidebar/detail labels
		// resolve from cell content for files the user hasn't opened yet this
		// session. Eager parses small files; lazy uses OPFS only if already cached
		// (no surprise downloads). Runs after layoutReady to avoid the plugin
		// init / DuckDB boot race.
		this.app.workspace.onLayoutReady(() => {
			void prepopulateMarkerCaches(this, csvModel);
		});

		// Registry mutations → invalidate codes
		this.sharedRegistry.addOnMutate(() => consolidationCache.invalidateRegistry());

		// Case variable mutations affect filter results across all analytics
		this.caseVariablesRegistry.addOnMutate(() => consolidationCache.invalidateAll());

		const pdfAdapter = new PdfSidebarAdapter(pdfModel);
		const imageAdapter = new ImageSidebarAdapter(imageModel);
		const csvAdapter = new CsvSidebarAdapter(csvModel);
		const audioAdapter = new AudioSidebarAdapter(audioModel);
		const videoAdapter = new VideoSidebarAdapter(videoModel);
		const unifiedModel = new UnifiedModelAdapter(
			this.sharedRegistry,
			[mdModel, pdfAdapter, imageAdapter, csvAdapter, audioAdapter, videoAdapter],
		);

		// Audit log accessor injetado nas views — encapsula leitura/escrita do log central + export.
		const auditAccess = {
			getLog: (): AuditEntry[] => (this.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [],
			hideEntry: (id: string) => {
				const log = (this.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
				const e = log.find(x => x.id === id);
				if (e) { e.hidden = true; this.dataManager.setSection('auditLog', log); document.dispatchEvent(new Event('qualia:registry-changed')); }
			},
			unhideEntry: (id: string) => {
				const log = (this.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
				const e = log.find(x => x.id === id);
				if (e) { delete e.hidden; this.dataManager.setSection('auditLog', log); document.dispatchEvent(new Event('qualia:registry-changed')); }
			},
			exportCodeHistory: async (codeId: string, codeName: string) => {
				const log = (this.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
				const md = renderCodeHistoryMarkdown(log, codeId, codeName);
				const safe = codeName.replace(/[\\/:*?"<>|]/g, '_');
				const path = `Codebook history — ${safe}.md`;
				const existing = this.app.vault.getAbstractFileByPath(path);
				if (existing instanceof TFile) {
					await this.app.vault.modify(existing, md);
				} else {
					await this.app.vault.create(path, md);
				}
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) await this.app.workspace.getLeaf(true).openFile(file);
			},
		};

		// Memo materialization access — wireado pra UnifiedCodeDetailView (Phase 1+2: code, group)
		const memoAccess = {
			convertMemo: async (ref: import('./core/memoTypes').EntityRef) => {
				await convertMemoToNote(this, ref);
			},
			unmaterializeMemo: (ref: import('./core/memoTypes').EntityRef) => {
				unmaterializeMemo(this, ref);
			},
			openMaterializedFile: (path: string) => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) return;

				// Smart open — se já há leaf aberto com esse arquivo, reativa em vez de criar nova aba.
				// Evita poluir workspace com tabs duplicadas quando user clica Open múltiplas vezes.
				let existingLeaf: WorkspaceLeaf | null = null;
				this.app.workspace.iterateAllLeaves((leaf) => {
					if (existingLeaf) return;
					const view = leaf.view;
					if (view instanceof FileView && view.file?.path === path) {
						existingLeaf = leaf;
					}
				});

				if (existingLeaf) {
					this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
				} else {
					this.app.workspace.getLeaf('tab').openFile(file);
				}
			},
		};

		// Register unified sidebar views (single set for ALL engines)
		this.registerView(CODE_EXPLORER_VIEW_TYPE, (leaf) =>
			new UnifiedCodeExplorerView(leaf, unifiedModel, mdModel));
		this.registerView(CODE_DETAIL_VIEW_TYPE, (leaf) =>
			new UnifiedCodeDetailView(leaf, unifiedModel, mdModel, auditAccess, memoAccess));
		this.registerView(CASE_VARIABLES_VIEW_TYPE, (leaf) =>
			new CaseVariablesView(leaf, this));

		this.addCommand({
			id: 'materialize-all-memos',
			name: 'Materialize all memos',
			callback: () => {
				new MaterializeAllMemosModal(this).open();
			},
		});

		// Smart Codes (Tier 3)
		this.addCommand({
			id: 'smart-codes-open',
			name: 'Smart Codes: Open hub',
			callback: () => {
				// Rebuild indexes pra capturar markers criados após onload (engines não emitem qualia:markers-changed ainda — pendente SC3)
				this.smartCodeCache.rebuildIndexes(this.dataManager.getDataRef());
				new SmartCodeListModal({
					app: this.app,
					smartCodeRegistry: this.smartCodeRegistry,
					smartCodeCache: this.smartCodeCache,
					registry: this.sharedRegistry,
					caseVarsRegistry: this.caseVariablesRegistry,
					getAuditLog: () => (this.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [],
				}).open();
			},
		});
		this.addCommand({
			id: 'smart-codes-new',
			name: 'Smart Codes: New',
			callback: () => {
				// Rebuild indexes idem
				this.smartCodeCache.rebuildIndexes(this.dataManager.getDataRef());
				new SmartCodeBuilderModal({
					app: this.app,
					mode: 'create',
					registry: this.sharedRegistry,
					caseVarsRegistry: this.caseVariablesRegistry,
					smartCodeRegistry: this.smartCodeRegistry,
					smartCodeCache: this.smartCodeCache,
				}).open();
			},
		});

		// Dev smoke: confirms the DuckDB-Wasm runtime boots inside the real plugin
		// (not just the spike). No user-visible flow consumes this yet — Fase 2 of the
		// parquet-lazy work just lands the infrastructure.
		this.addCommand({
			id: 'duckdb-hello-query',
			name: 'DuckDB hello query (dev smoke)',
			callback: () => this.runDuckDBSmoke(),
		});

		this.addCommand({
			id: 'open-case-variables-panel',
			name: 'Open Case Variables panel',
			callback: async () => {
				const { workspace } = this.app;
				let leaf = workspace.getLeavesOfType(CASE_VARIABLES_VIEW_TYPE)[0];
				if (!leaf) {
					const right = workspace.getRightLeaf(false);
					if (!right) return;
					await right.setViewState({ type: CASE_VARIABLES_VIEW_TYPE, active: true });
					leaf = right;
				}
				workspace.revealLeaf(leaf);
			},
		});

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

	/**
	 * Sync each engine model with DataManager and notify listeners.
	 * Call after bulk writes bypass the model API (e.g. REFI-QDA import).
	 */
	reloadAfterImport(): void {
		this.markdownModel?.loadMarkers();
		this.markdownModel?.notifyChange();
		this.pdfModel?.load();
		this.pdfModel?.notify();
		this.imageModel?.notify();
		this.csvModel?.reload();
		this.audioModel?.reload();
		this.videoModel?.reload();
		document.dispatchEvent(new Event('qualia:registry-changed'));
	}

	private addCaseVariablesActionToView(view: View): void {
		if (!(view instanceof FileView)) return;
		if (this.caseVariablesViewListeners.has(view)) {
			// View already registered — file may have changed on the same leaf (e.g. md→md navigation).
			// The stored listener is `() => updateBadge()`, so invoking it re-reads view.file?.path.
			this.caseVariablesViewListeners.get(view)?.();
			return;
		}
		if (!view.file) return;

		// Resolve fileId dynamically — TFile.path mutates on rename; closure capture would stale.
		const currentFileId = (): string | null => view.file?.path ?? null;

		let closeCurrent: (() => void) | null = null;
		const button = view.addAction('clipboard-list', 'Case Variables', () => {
			if (closeCurrent) {
				closeCurrent();
				return;
			}
			if (!currentFileId()) return;
			closeCurrent = openPropertiesPopover(button, {
				fileId: currentFileId,
				registry: this.caseVariablesRegistry,
				onClose: () => {
					closeCurrent = null;
					this.activePopoverClose = null;
				},
			});
			this.activePopoverClose = closeCurrent;
		});
		button.addClass('case-variables-action');

		const updateBadge = () => {
			try {
				if (!button.isConnected) return;
				const fileId = currentFileId();
				if (!fileId) return;
				const count = Object.keys(this.caseVariablesRegistry.getVariables(fileId)).length;
				button.toggleClass('has-properties', count > 0);
				button.setAttribute('data-count', String(count));
			} catch {
				// button may be disconnected during view teardown; no-op
			}
		};
		updateBadge();

		const listener = () => updateBadge();
		this.caseVariablesRegistry.addOnMutate(listener);
		this.caseVariablesViewListeners.set(view, listener);
		this.caseVariablesButtons.set(view, button);
		view.register(() => {
			this.caseVariablesRegistry.removeOnMutate(listener);
			this.caseVariablesButtons.delete(view);
		});
	}

	/** Wires cache com a section de smartCodes (mesma reference do registry) + lookups. Chamada UMA vez no onload. */
	private refreshSmartCodeCacheConfig(): void {
		const data = this.dataManager.getDataRef();
		this.smartCodeCache.configure({
			smartCodes: this.smartCodeRegistry.getDefinitionsRef(),
			caseVars: {
				get: (fileId, variable) => {
					const v = this.caseVariablesRegistry.getVariables(fileId)[variable];
					if (v === null || Array.isArray(v)) return undefined;  // null/multitext não suportados em leaf scalar
					return v;
				},
				allKeys: () => {
					const out = new Set<string>();
					for (const fileId of Object.keys(data.caseVariables.values)) {
						for (const k of Object.keys(this.caseVariablesRegistry.getVariables(fileId))) out.add(k);
					}
					return out;
				},
			},
			codeStruct: {
				codesInFolder: (folderId) => this.sharedRegistry.getCodesInFolder(folderId).map(c => c.id),
				codesInGroup: (groupId) => this.sharedRegistry.getCodesInGroup(groupId).map(c => c.id),
			},
		});
	}

	private addVisibilityActionToView(view: View): void {
		if (!(view instanceof FileView)) return;
		if (!view.file) return;
		const existing = view.containerEl.querySelector('.qc-visibility-action');
		if (existing) return;  // dedupe

		let closeCurrent: (() => void) | null = null;
		const button = view.addAction('eye', 'Toggle code visibility', () => {
			if (closeCurrent) { closeCurrent(); return; }
			if (!view.file) return;
			const fileId = view.file.path;
			const codesInFile = this.collectCodesInFile(fileId);
			closeCurrent = openCodeVisibilityPopover(button, {
				fileId,
				codesInFile,
				registry: this.sharedRegistry,
				onClose: () => { closeCurrent = null; },
			});
		});
		button.addClass('qc-visibility-action');
		this.updateVisibilityActionIndicator(view);
	}

	private updateVisibilityActionIndicator(view: View): void {
		if (!(view instanceof FileView) || !view.file) return;
		const button = view.containerEl.querySelector('.qc-visibility-action') as HTMLElement | null;
		if (!button) return;
		if (this.sharedRegistry.hasAnyOverrideForFile(view.file.path)) {
			button.classList.add('qc-has-overrides');
		} else {
			button.classList.remove('qc-has-overrides');
		}
	}

	private collectCodesInFile(fileId: string): CodeDefinition[] {
		const ids = new Set<string>();
		const data = this.dataManager;

		// Markdown: Record<fileId, Marker[]>
		const mdMarkers = data.section('markdown').markers?.[fileId] ?? [];
		for (const m of mdMarkers) for (const app of m.codes) ids.add(app.codeId);

		// PDF: arrays com .fileId
		const pdf = data.section('pdf');
		for (const m of pdf.markers) if (m.fileId === fileId) for (const app of m.codes) ids.add(app.codeId);
		for (const s of pdf.shapes) if (s.fileId === fileId) for (const app of s.codes) ids.add(app.codeId);

		// CSV: segment + row (ambos contam)
		const csv = data.section('csv');
		for (const m of csv.segmentMarkers) if (m.fileId === fileId) for (const app of m.codes) ids.add(app.codeId);
		for (const m of csv.rowMarkers) if (m.fileId === fileId) for (const app of m.codes) ids.add(app.codeId);

		// Image
		const image = data.section('image');
		for (const m of image.markers) if (m.fileId === fileId) for (const app of m.codes) ids.add(app.codeId);

		// Audio: files[].markers
		const audio = data.section('audio');
		for (const f of audio.files) if (f.path === fileId) for (const m of f.markers) for (const app of m.codes) ids.add(app.codeId);

		// Video
		const video = data.section('video');
		for (const f of video.files) if (f.path === fileId) for (const m of f.markers) for (const app of m.codes) ids.add(app.codeId);

		const registry = this.sharedRegistry;
		return Array.from(ids).map(id => registry.getById(id)!).filter(Boolean);
	}

	/**
	 * Lazy DuckDB runtime accessor. First call instantiates; concurrent callers
	 * await the same in-flight promise. Returns null on transient init failure
	 * — caller decides whether to retry or surface the error.
	 */
	async getDuckDB(): Promise<DuckDBRuntime> {
		if (this.duckdb) return this.duckdb;
		if (this.duckdbInitPromise) return this.duckdbInitPromise;
		this.duckdbInitPromise = createDuckDBRuntime();
		try {
			this.duckdb = await this.duckdbInitPromise;
			return this.duckdb;
		} finally {
			this.duckdbInitPromise = null;
		}
	}

	private async runDuckDBSmoke(): Promise<void> {
		try {
			const t0 = performance.now();
			const rt = await this.getDuckDB();
			const tBoot = performance.now() - t0;
			const tQ = performance.now();
			const result = await rt.conn.query("SELECT 42 AS answer");
			const tQuery = performance.now() - tQ;
			const rows = result.toArray().map((r) => r.toJSON());
			const msg = `✅ DuckDB OK · boot ${tBoot.toFixed(0)}ms · query ${tQuery.toFixed(1)}ms · ${JSON.stringify(rows)}`;
			console.log("[qualia-coding] duckdb smoke", { rows, tBoot, tQuery });
			new Notice(msg, 8000);
		} catch (err) {
			const msg = `❌ DuckDB smoke failed: ${err instanceof Error ? err.message : String(err)}`;
			console.error("[qualia-coding] duckdb smoke", err);
			new Notice(msg, 12000);
		}
	}

	async onunload() {
		// DuckDB lifecycle: dispose worker + revoke Blob URLs. Avoids hot-reload leak.
		try {
			await this.duckdb?.dispose();
		} catch (e) {
			console.warn("[qualia-coding] duckdb dispose failed", e);
		}
		this.duckdb = null;
		this.duckdbInitPromise = null;
		// Release the ~34MB decompressed WASM Uint8Array cached at module scope.
		// Without this, hot-reload (let/const survive across plugin reloads in Obsidian)
		// keeps the buffer alive between sessions until the user restarts Obsidian.
		try {
			const { clearWasmBytesCache } = await import('./csv/duckdb/wasmAssets');
			clearWasmBytesCache();
		} catch (e) {
			console.warn("[qualia-coding] clearWasmBytesCache failed", e);
		}
		// OPFS lazy cache is wiped on file close (csvCodingView.onUnloadFile),
		// so by the time the plugin unloads there should be no leftover entries.
		// `clearOPFSCache` here would be a redundant safety net — skip to keep
		// teardown lean. The Settings "Clear all" button stays as the manual
		// recovery for the rare case where a crashed view left orphans behind.
		clearFileInterceptRules();
		teardownMediaToggleButtons();
		this.memoReverseLookup.clear();
		this.memoSelfWriting.clear();
		// Close any open Case Variables popover before tearing down the registry
		this.activePopoverClose?.();
		this.activePopoverClose = null;
		// Detach Case Variables action buttons so hot-reload doesn't leave orphans.
		for (const button of this.caseVariablesButtons.values()) button.detach();
		this.caseVariablesButtons.clear();
		this.app.workspace.detachLeavesOfType(CODE_EXPLORER_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(CODE_DETAIL_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(CASE_VARIABLES_VIEW_TYPE);

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
