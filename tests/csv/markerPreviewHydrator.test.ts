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
