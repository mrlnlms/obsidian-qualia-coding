import { describe, it, expect } from 'vitest';
import { fromEvents } from '../../../src/core/icr/bboxKappaInput';
import type { AlignmentEvent } from '../../../src/core/icr/bboxMatcher';

describe('bboxKappaInput.fromEvents', () => {
	const aBboxes = [
		{ id: 'a0', codeIds: ['c1'] },
		{ id: 'a1', codeIds: ['c2'] },
	];
	const bBboxes = [
		{ id: 'b0', codeIds: ['c1'] },
		{ id: 'b1', codeIds: ['c3'] },
	];

	it('matched event produces 2 markers, same i, both with codeIds from respective bbox', () => {
		const events: AlignmentEvent[] = [
			{ kind: 'matched', aIndex: 0, bIndex: 0, iou: 0.8 },
		];
		const markers = fromEvents(events, 'a.pdf:page:1', { a: 'coder:c1', b: 'coder:c2' }, aBboxes, bBboxes);
		expect(markers).toHaveLength(2);
		const mA = markers.find(m => m.coderId === 'coder:c1')!;
		const mB = markers.find(m => m.coderId === 'coder:c2')!;
		expect(mA.range.from).toBe(0);
		expect(mA.range.to).toBe(1);
		expect(mB.range.from).toBe(0);
		expect(mB.range.to).toBe(1);
		expect(mA.range.locator).toBe('bbox:a.pdf:page:1');
		expect(mB.range.locator).toBe('bbox:a.pdf:page:1');
		expect(mA.codeIds).toEqual(['c1']);
		expect(mB.codeIds).toEqual(['c1']);
	});

	it('unmatched_a event produces 1 marker for coder A only', () => {
		const events: AlignmentEvent[] = [
			{ kind: 'unmatched_a', aIndex: 0 },
		];
		const markers = fromEvents(events, 'a.pdf:page:1', { a: 'coder:c1', b: 'coder:c2' }, aBboxes, bBboxes);
		expect(markers).toHaveLength(1);
		expect(markers[0]!.coderId).toBe('coder:c1');
		expect(markers[0]!.codeIds).toEqual(['c1']);
	});

	it('unmatched_b event produces 1 marker for coder B only', () => {
		const events: AlignmentEvent[] = [
			{ kind: 'unmatched_b', bIndex: 1 },
		];
		const markers = fromEvents(events, 'a.pdf:page:1', { a: 'coder:c1', b: 'coder:c2' }, aBboxes, bBboxes);
		expect(markers).toHaveLength(1);
		expect(markers[0]!.coderId).toBe('coder:c2');
		expect(markers[0]!.codeIds).toEqual(['c3']);
	});

	it('events occupy sequential indices 0..N-1', () => {
		const events: AlignmentEvent[] = [
			{ kind: 'matched', aIndex: 0, bIndex: 0, iou: 0.8 },
			{ kind: 'unmatched_a', aIndex: 1 },
			{ kind: 'unmatched_b', bIndex: 1 },
		];
		const markers = fromEvents(events, 'a.pdf:page:1', { a: 'coder:c1', b: 'coder:c2' }, aBboxes, bBboxes);
		expect(markers).toHaveLength(4);
		const indices = markers.map(m => m.range.from).sort((a, b) => a - b);
		expect(indices).toEqual([0, 0, 1, 2]);
	});

	it('matched markers from same event collide on same range (key for κ engine)', () => {
		const events: AlignmentEvent[] = [
			{ kind: 'matched', aIndex: 0, bIndex: 0, iou: 0.8 },
		];
		const markers = fromEvents(events, 's', { a: 'coder:c1', b: 'coder:c2' }, aBboxes, bBboxes);
		expect(markers[0]!.range.from).toBe(markers[1]!.range.from);
		expect(markers[0]!.range.to).toBe(markers[1]!.range.to);
	});
});
