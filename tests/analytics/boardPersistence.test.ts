import { describe, it, expect, vi } from 'vitest';
import { clearBoard } from '../../src/analytics/views/boardPersistence';
import type { DataAdapter } from 'obsidian';

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
		await expect(clearBoard(adapter)).resolves.toBeUndefined();
	});
});
