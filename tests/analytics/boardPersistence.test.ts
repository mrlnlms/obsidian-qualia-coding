import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/analytics/board/boardData', () => ({
	serializeBoard: () => ({ version: 1, nodes: [], arrows: [] }),
	deserializeBoard: vi.fn(),
}));

import { clearBoard, saveBoard } from '../../src/analytics/views/boardPersistence';
import type { DataAdapter } from 'obsidian';
import type { Canvas } from 'fabric';

function mockAdapter(fileExists: boolean): DataAdapter {
	return {
		exists: vi.fn().mockResolvedValue(fileExists),
		remove: vi.fn().mockResolvedValue(undefined),
	} as unknown as DataAdapter;
}

describe('clearBoard', () => {
	it('removes board.json when it exists', async () => {
		const adapter = mockAdapter(true);
		await clearBoard(adapter);
		expect(adapter.exists).toHaveBeenCalledWith('.obsidian/plugins/qualia-coding/board.json');
		expect(adapter.remove).toHaveBeenCalledWith('.obsidian/plugins/qualia-coding/board.json');
	});

	it('does not call remove when board.json does not exist', async () => {
		const adapter = mockAdapter(false);
		await clearBoard(adapter);
		expect(adapter.exists).toHaveBeenCalled();
		expect(adapter.remove).not.toHaveBeenCalled();
	});

	it('does not throw when remove fails', async () => {
		const adapter = {
			exists: vi.fn().mockResolvedValue(true),
			remove: vi.fn().mockRejectedValue(new Error('permission denied')),
		} as unknown as DataAdapter;
		await expect(clearBoard(adapter)).resolves.toBe(false);
	});
});

describe('saveBoard', () => {
	const fakeCanvas = {} as Canvas;

	it('writes board.json on success', async () => {
		const adapter = {
			write: vi.fn().mockResolvedValue(undefined),
		} as unknown as DataAdapter;
		await saveBoard(fakeCanvas, adapter);
		expect(adapter.write).toHaveBeenCalledWith(
			'.obsidian/plugins/qualia-coding/board.json',
			expect.any(String),
		);
	});

	it('creates directory and retries when first write fails', async () => {
		let callCount = 0;
		const adapter = {
			write: vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) return Promise.reject(new Error('ENOENT'));
				return Promise.resolve();
			}),
			exists: vi.fn().mockResolvedValue(false),
			mkdir: vi.fn().mockResolvedValue(undefined),
		} as unknown as DataAdapter;
		await saveBoard(fakeCanvas, adapter);
		expect(adapter.mkdir).toHaveBeenCalledWith('.obsidian/plugins/qualia-coding');
		expect(adapter.write).toHaveBeenCalledTimes(2);
	});

	it('does not throw when both writes fail', async () => {
		const adapter = {
			write: vi.fn().mockRejectedValue(new Error('fail')),
			exists: vi.fn().mockResolvedValue(true),
			mkdir: vi.fn().mockResolvedValue(undefined),
		} as unknown as DataAdapter;
		await expect(saveBoard(fakeCanvas, adapter)).resolves.toBeUndefined();
	});
});
