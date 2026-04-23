import { describe, it, expect } from 'vitest';
import { resolveToggleTarget, isMediaViewType, type MediaKind } from '../../src/core/viewToggleHelpers';
import { IMAGE_CODING_VIEW_TYPE, AUDIO_VIEW_TYPE, VIDEO_VIEW_TYPE } from '../../src/core/mediaViewTypes';

describe('resolveToggleTarget', () => {
	it('image native → coding view', () => {
		expect(resolveToggleTarget('image', 'image')).toBe(IMAGE_CODING_VIEW_TYPE);
	});

	it('image coding view → native', () => {
		expect(resolveToggleTarget(IMAGE_CODING_VIEW_TYPE, 'image')).toBe('image');
	});

	it('audio native → coding view', () => {
		expect(resolveToggleTarget('audio', 'audio')).toBe(AUDIO_VIEW_TYPE);
	});

	it('audio coding view → native', () => {
		expect(resolveToggleTarget(AUDIO_VIEW_TYPE, 'audio')).toBe('audio');
	});

	it('video native → coding view', () => {
		expect(resolveToggleTarget('video', 'video')).toBe(VIDEO_VIEW_TYPE);
	});

	it('video coding view → native', () => {
		expect(resolveToggleTarget(VIDEO_VIEW_TYPE, 'video')).toBe('video');
	});

	it('pdf never swaps view type (returns same type; caller toggles instrumentation)', () => {
		expect(resolveToggleTarget('pdf', 'pdf')).toBe('pdf');
	});

	it('returns null for unknown combination', () => {
		expect(resolveToggleTarget('markdown', 'image' as MediaKind)).toBeNull();
	});
});

describe('isMediaViewType', () => {
	it('recognizes native media view types', () => {
		expect(isMediaViewType('image')).toBe('image');
		expect(isMediaViewType('audio')).toBe('audio');
		expect(isMediaViewType('video')).toBe('video');
		expect(isMediaViewType('pdf')).toBe('pdf');
	});

	it('recognizes coding view types', () => {
		expect(isMediaViewType(IMAGE_CODING_VIEW_TYPE)).toBe('image');
		expect(isMediaViewType(AUDIO_VIEW_TYPE)).toBe('audio');
		expect(isMediaViewType(VIDEO_VIEW_TYPE)).toBe('video');
	});

	it('returns null for non-media view types', () => {
		expect(isMediaViewType('markdown')).toBeNull();
		expect(isMediaViewType('empty')).toBeNull();
		expect(isMediaViewType('qualia-image-coding-xxx')).toBeNull();
	});
});
