import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('obsidian', async () => {
	const actual = await vi.importActual<any>('obsidian');
	return {
		...actual,
		TFile: class TFile {
			extension = '';
			stat: { size: number; mtime: number } = { size: 0, mtime: 0 };
		},
		FileSystemAdapter: class FileSystemAdapter {
			getFullPath(_path: string): string { return '/abs/' + _path; }
		},
	};
});

import { TFile, FileSystemAdapter } from 'obsidian';
import { MarkerPreviewHydrator } from '../../src/csv/markerPreviewHydrator';

// RAF mock — coalescing depende disso
let rafCallback: FrameRequestCallback | null = null;
beforeEach(() => {
	rafCallback = null;
	(global as any).requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
		rafCallback = cb;
		return 1;
	});
	(global as any).cancelAnimationFrame = vi.fn();
});

function flushRaf() {
	if (rafCallback) {
		const cb = rafCallback;
		rafCallback = null;
		cb(0);
	}
}

function createMockPlugin(opts: { fileSize?: number; ext?: string; missingFile?: boolean; noFsAdapter?: boolean } = {}) {
	const stat = { size: opts.fileSize ?? 200 * 1024 * 1024, mtime: 1 };
	let af: any = null;
	if (!opts.missingFile) {
		af = Object.assign(new (TFile as any)(), { extension: opts.ext ?? 'parquet', stat });
	}
	const adapter = opts.noFsAdapter ? {} : new (FileSystemAdapter as any)();
	return {
		app: {
			vault: {
				getAbstractFileByPath: vi.fn(() => af),
				adapter,
				getName: () => 'test-vault',
			},
		},
		dataManager: {
			section: vi.fn(() => ({ settings: { parquetSizeWarningMB: 50, csvSizeWarningMB: 100 } })),
		},
		getDuckDB: vi.fn(),
	} as any;
}

function createMockCsvModel() {
	return {
		getLazyProvider: vi.fn(),
		populateMissingMarkerTextsForFile: vi.fn().mockResolvedValue(0),
		notifyListenersOnly: vi.fn(),
	} as any;
}

describe('MarkerPreviewHydrator construction', () => {
	it('starts with empty status', () => {
		const plugin = createMockPlugin();
		const csvModel = createMockCsvModel();
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);
		const status = hydrator.getStatus();
		expect(status).toEqual({ inflightCount: 0, totalSeen: 0, completedCount: 0 });
	});
});

describe('MarkerPreviewHydrator.requestHydration idempotência', () => {
	it('chamadas concorrentes pra mesmo fileId produzem 1 batch', async () => {
		const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
		const csvModel = createMockCsvModel();
		csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(3);
		csvModel.getLazyProvider.mockReturnValue({} as any);
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		const [r1, r2, r3] = await Promise.all([
			hydrator.requestHydration('a.parquet'),
			hydrator.requestHydration('a.parquet'),
			hydrator.requestHydration('a.parquet'),
		]);
		expect(r1).toBe(r2);
		expect(r2).toBe(r3);
		expect(csvModel.populateMissingMarkerTextsForFile).toHaveBeenCalledTimes(1);
	});

	it('após sucesso, marca seen e próxima chamada retorna skipped', async () => {
		const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
		const csvModel = createMockCsvModel();
		csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(2);
		csvModel.getLazyProvider.mockReturnValue({} as any);
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		const first = await hydrator.requestHydration('a.parquet');
		expect(first.status).toBe('success');

		const second = await hydrator.requestHydration('a.parquet');
		expect(second.status).toBe('skipped');
		expect(second.reason).toBe('already seen');
		expect(csvModel.populateMissingMarkerTextsForFile).toHaveBeenCalledTimes(1);
	});
});

describe('MarkerPreviewHydrator skip + error', () => {
	it('skipa eager mode (file < threshold)', async () => {
		const plugin = createMockPlugin({ fileSize: 10 * 1024 * 1024 }); // 10MB < 50MB threshold
		const csvModel = createMockCsvModel();
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		const result = await hydrator.requestHydration('small.parquet');
		expect(result.status).toBe('skipped');
		expect(result.reason).toBe('eager mode');
		expect(csvModel.populateMissingMarkerTextsForFile).not.toHaveBeenCalled();
	});

	it('skipa quando addedCount === 0 (parquet sem matches)', async () => {
		const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
		const csvModel = createMockCsvModel();
		csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(0);
		csvModel.getLazyProvider.mockReturnValue({} as any);
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		const result = await hydrator.requestHydration('empty.parquet');
		expect(result.status).toBe('skipped');
		expect(result.addedCount).toBe(0);

		const second = await hydrator.requestHydration('empty.parquet');
		expect(second.reason).toBe('already seen');
	});

	it('error NÃO marca seen — próxima retenta', async () => {
		const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
		const csvModel = createMockCsvModel();
		csvModel.populateMissingMarkerTextsForFile.mockRejectedValueOnce(new Error('parse failed'));
		csvModel.getLazyProvider.mockReturnValue({} as any);
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		const first = await hydrator.requestHydration('bad.parquet');
		expect(first.status).toBe('error');
		expect(first.reason).toContain('parse failed');

		csvModel.populateMissingMarkerTextsForFile.mockResolvedValueOnce(2);
		const second = await hydrator.requestHydration('bad.parquet');
		expect(second.status).toBe('success');
		expect(csvModel.populateMissingMarkerTextsForFile).toHaveBeenCalledTimes(2);
	});

	it('skipa file missing (TFile não encontrado)', async () => {
		const plugin = createMockPlugin({ missingFile: true });
		const csvModel = createMockCsvModel();
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		const result = await hydrator.requestHydration('ghost.parquet');
		expect(result.status).toBe('skipped');
		// File missing — isLazyFile retorna false antes de runLazyBatch
		expect(result.reason).toBe('eager mode');
	});
});

describe('MarkerPreviewHydrator provider reuse', () => {
	it('reusa provider de getLazyProvider, não cria, não chama dispose', async () => {
		const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
		const csvModel = createMockCsvModel();
		const existingProvider = { dispose: vi.fn() };
		csvModel.getLazyProvider.mockReturnValue(existingProvider);
		csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(2);
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		const result = await hydrator.requestHydration('open.parquet');
		expect(result.status).toBe('success');
		expect(csvModel.populateMissingMarkerTextsForFile).toHaveBeenCalledWith('open.parquet', existingProvider);
		expect(existingProvider.dispose).not.toHaveBeenCalled();
		expect(plugin.getDuckDB).not.toHaveBeenCalled();
	});
});

describe('MarkerPreviewHydrator status + notify coalescing', () => {
	it('dispara onStatusChange a cada inflight start/complete', async () => {
		const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
		const csvModel = createMockCsvModel();
		csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(1);
		csvModel.getLazyProvider.mockReturnValue({} as any);
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		const statuses: any[] = [];
		hydrator.onStatusChange(s => statuses.push({ ...s }));

		await hydrator.requestHydration('a.parquet');
		expect(statuses.length).toBeGreaterThanOrEqual(2);
		expect(statuses[0].inflightCount).toBe(1);
		expect(statuses[statuses.length - 1].inflightCount).toBe(0);
	});

	it('coalesce 3 batches concorrentes em 1 notifyListenersOnly via RAF', async () => {
		const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
		const csvModel = createMockCsvModel();
		csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(2);
		csvModel.getLazyProvider.mockReturnValue({} as any);
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		await Promise.all([
			hydrator.requestHydration('a.parquet'),
			hydrator.requestHydration('b.parquet'),
			hydrator.requestHydration('c.parquet'),
		]);
		expect(csvModel.notifyListenersOnly).not.toHaveBeenCalled();

		flushRaf();
		expect(csvModel.notifyListenersOnly).toHaveBeenCalledTimes(1);
	});

	it('markSeen pula batch e dispara status', () => {
		const plugin = createMockPlugin();
		const csvModel = createMockCsvModel();
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);
		const statuses: any[] = [];
		hydrator.onStatusChange(s => statuses.push({ ...s }));

		hydrator.markSeen('pre.parquet');
		expect(hydrator.getStatus().completedCount).toBe(1);
		expect(statuses).toContainEqual(expect.objectContaining({ completedCount: 1 }));
	});
});

describe('MarkerPreviewHydrator inflight bookkeeping (regression)', () => {
	it('eager + lazy mistos terminam com inflight=0 (bug do "2/3 travado" 2026-05-06)', async () => {
		// Repro: png eager-skip rodava síncrono; inflight.delete acontecia ANTES de inflight.set,
		// deixando o png órfão no inflight permanentemente. Total seen+inflight nunca convergia.
		const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
		const csvModel = createMockCsvModel();
		csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(2);
		csvModel.getLazyProvider.mockReturnValue({} as any);
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		// Force eager pra primeiro fileId (small size)
		(plugin.app.vault.getAbstractFileByPath as any).mockImplementationOnce(() => {
			const af: any = Object.assign(new (TFile as any)(), { extension: 'png', stat: { size: 100, mtime: 1 } });
			return af;
		});
		const eagerPromise = hydrator.requestHydration('img.png');

		// Lazy pra segundo
		const lazyPromise = hydrator.requestHydration('big.parquet');

		await Promise.all([eagerPromise, lazyPromise]);

		const status = hydrator.getStatus();
		expect(status.inflightCount).toBe(0);
		expect(status.completedCount).toBe(2);
		expect(status.totalSeen).toBe(2);  // sem orfão
	});
});

describe('MarkerPreviewHydrator dispose', () => {
	it('cancela RAF pending', async () => {
		const plugin = createMockPlugin({ fileSize: 200 * 1024 * 1024 });
		const csvModel = createMockCsvModel();
		csvModel.populateMissingMarkerTextsForFile.mockResolvedValue(2);
		csvModel.getLazyProvider.mockReturnValue({} as any);
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		await hydrator.requestHydration('a.parquet');
		// Notify agendado mas não flushed
		expect(csvModel.notifyListenersOnly).not.toHaveBeenCalled();

		await hydrator.dispose();
		expect((global as any).cancelAnimationFrame).toHaveBeenCalled();
	});

	it('rejeita novas requests após disposed', async () => {
		const plugin = createMockPlugin();
		const csvModel = createMockCsvModel();
		const hydrator = new MarkerPreviewHydrator(plugin, csvModel);

		await hydrator.dispose();
		const result = await hydrator.requestHydration('a.parquet');
		expect(result.status).toBe('skipped');
		expect(result.reason).toBe('disposed');
	});
});
