import { describe, expect, it, vi } from 'vitest';
import { navigateToMarker } from '../../src/core/navigateToMarker';
import type { BaseMarker } from '../../src/core/types';

describe('navigateToMarker PDF', () => {
	it('navigates a raw logical marker to its first segment', async () => {
		const trigger = vi.fn();
		const app = { workspace: { trigger } };
		const marker = {
			markerType: 'pdf',
			id: 'multipage',
			fileId: 'doc.pdf',
			page: 99,
			segments: [
				{ page: 6 },
				{ page: 7 },
			],
			codes: [],
			createdAt: 1,
			updatedAt: 1,
		} as unknown as BaseMarker;

		await navigateToMarker(app as any, marker, null);

		expect(trigger).toHaveBeenCalledWith('qualia-pdf:navigate', {
			file: 'doc.pdf',
			page: 6,
		});
	});
});
