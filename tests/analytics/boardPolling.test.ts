import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BoardView so instanceof works in jsdom
vi.mock('../../src/analytics/views/boardView', () => {
	class BoardView {
		addSnapshot = vi.fn();
		addKpiCard = vi.fn();
	}
	return { BOARD_VIEW_TYPE: 'codemarker-board', BoardView };
});

import { waitForBoardView } from '../../src/analytics/index';
import { BoardView } from '../../src/analytics/views/boardView';

describe('waitForBoardView', () => {
	let boardInstance: InstanceType<typeof BoardView>;
	const activateFn = vi.fn().mockResolvedValue(undefined);

	beforeEach(() => {
		boardInstance = new BoardView(null as any, null as any);
		vi.clearAllMocks();
	});

	it('returns BoardView immediately when already available', async () => {
		const workspace = {
			getLeavesOfType: vi.fn().mockReturnValue([{ view: boardInstance }]),
		};

		const result = await waitForBoardView(workspace, activateFn);

		expect(activateFn).toHaveBeenCalledOnce();
		expect(workspace.getLeavesOfType).toHaveBeenCalledWith('codemarker-board');
		expect(result).toBe(boardInstance);
	});

	it('polls until BoardView appears', async () => {
		let callCount = 0;
		const workspace = {
			getLeavesOfType: vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount < 4) return [];
				return [{ view: boardInstance }];
			}),
		};

		const result = await waitForBoardView(workspace, activateFn);

		expect(result).toBe(boardInstance);
		expect(callCount).toBe(4);
	});

	it('returns null after max retries (20 attempts)', async () => {
		const workspace = {
			getLeavesOfType: vi.fn().mockReturnValue([]),
		};

		const result = await waitForBoardView(workspace, activateFn);

		expect(result).toBeNull();
		expect(workspace.getLeavesOfType).toHaveBeenCalledTimes(20);
	});

	it('ignores leaves where view is not a BoardView instance', async () => {
		const workspace = {
			getLeavesOfType: vi.fn().mockReturnValue([{ view: { fake: true } }]),
		};

		const result = await waitForBoardView(workspace, activateFn);

		expect(result).toBeNull();
	});

	it('calls activateFn exactly once', async () => {
		const workspace = {
			getLeavesOfType: vi.fn().mockReturnValue([{ view: boardInstance }]),
		};

		await waitForBoardView(workspace, activateFn);

		expect(activateFn).toHaveBeenCalledOnce();
	});

	it('handles activateFn rejection gracefully', async () => {
		const failActivate = vi.fn().mockRejectedValue(new Error('workspace error'));
		const workspace = {
			getLeavesOfType: vi.fn().mockReturnValue([]),
		};

		await expect(waitForBoardView(workspace, failActivate)).rejects.toThrow('workspace error');
	});
});

describe('DataManager settings deep merge', () => {
	it('merges all engine settings with defaults on load', async () => {
		const { DataManager } = await import('../../src/core/dataManager');

		const mockPlugin = {
			loadData: vi.fn().mockResolvedValue({
				registry: { definitions: {}, nextPaletteIndex: 0 },
				markdown: { markers: {}, settings: { defaultColor: '#custom' } },
				csv: { segmentMarkers: [], rowMarkers: [] },
				image: { markers: [], settings: { autoOpenImages: false } },
				pdf: { markers: [], shapes: [] },
				audio: { files: [], settings: { defaultZoom: 80 } },
				video: { files: [], settings: { defaultZoom: 80, videoFit: 'cover' as const } },
			}),
			saveData: vi.fn(),
		} as any;

		const dm = new DataManager(mockPlugin);
		await dm.load();

		// markdown: custom preserved, defaults filled
		expect(dm.section('markdown').settings.defaultColor).toBe('#custom');
		expect(dm.section('markdown').settings.markerOpacity).toBe(0.4);

		// image: custom preserved, defaults filled
		expect(dm.section('image').settings.autoOpenImages).toBe(false);
		expect(dm.section('image').settings.fileStates).toEqual({});

		// audio: custom preserved, defaults filled
		expect(dm.section('audio').settings.defaultZoom).toBe(80);
		expect(dm.section('audio').settings.regionOpacity).toBe(0.4);
		expect(dm.section('audio').settings.fileStates).toEqual({});

		// video: custom preserved, defaults filled
		expect(dm.section('video').settings.defaultZoom).toBe(80);
		expect(dm.section('video').settings.videoFit).toBe('cover');
		expect(dm.section('video').settings.regionOpacity).toBe(0.4);
		expect(dm.section('video').settings.fileStates).toEqual({});
	});

	it('fills all defaults when settings are missing', async () => {
		const { DataManager } = await import('../../src/core/dataManager');

		const mockPlugin = {
			loadData: vi.fn().mockResolvedValue({
				registry: { definitions: {}, nextPaletteIndex: 0 },
				markdown: { markers: {} },
				csv: { segmentMarkers: [], rowMarkers: [] },
				image: { markers: [] },
				pdf: { markers: [], shapes: [] },
				audio: { files: [] },
				video: { files: [] },
			}),
			saveData: vi.fn(),
		} as any;

		const dm = new DataManager(mockPlugin);
		await dm.load();

		expect(dm.section('markdown').settings.defaultColor).toBe('#6200EE');
		expect(dm.section('image').settings.autoOpenImages).toBe(true);
		expect(dm.section('audio').settings.defaultZoom).toBe(50);
		expect(dm.section('video').settings.videoFit).toBe('contain');
	});
});
