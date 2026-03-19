import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BoardView so instanceof works in jsdom
vi.mock('../../src/analytics/views/boardView', () => {
	class BoardView {
		addSnapshot = vi.fn();
		addKpiCard = vi.fn();
		waitUntilReady = vi.fn().mockResolvedValue(undefined);
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
