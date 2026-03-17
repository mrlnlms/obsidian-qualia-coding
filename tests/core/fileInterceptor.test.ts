import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerFileIntercept, registerFileRename } from '../../src/core/fileInterceptor';
import type { FileInterceptRule, FileRenameRule } from '../../src/core/fileInterceptor';

/**
 * NOTE: setupFileInterceptor is tightly coupled to Obsidian plugin/workspace APIs
 * (registerEvent, active-leaf-change, etc.) and cannot be unit-tested without
 * extensive mocking. We test the pure registration functions and rule structures.
 */

describe('registerFileIntercept', () => {
	it('accepts a rule with extensions and targetViewType', () => {
		const rule: FileInterceptRule = {
			extensions: new Set(['pdf']),
			targetViewType: 'pdf-coding',
		};
		// Should not throw
		expect(() => registerFileIntercept(rule)).not.toThrow();
	});

	it('accepts a rule with sourceViewType filter', () => {
		const rule: FileInterceptRule = {
			extensions: new Set(['png', 'jpg']),
			targetViewType: 'image-coding',
			sourceViewType: 'image',
		};
		expect(() => registerFileIntercept(rule)).not.toThrow();
	});

	it('accepts a rule with shouldIntercept guard', () => {
		const guard = vi.fn(() => true);
		const rule: FileInterceptRule = {
			extensions: new Set(['csv']),
			targetViewType: 'csv-coding',
			shouldIntercept: guard,
		};
		expect(() => registerFileIntercept(rule)).not.toThrow();
	});

	it('multiple rules can be registered without error', () => {
		const rule1: FileInterceptRule = {
			extensions: new Set(['mp3']),
			targetViewType: 'audio-coding',
		};
		const rule2: FileInterceptRule = {
			extensions: new Set(['mp4']),
			targetViewType: 'video-coding',
		};
		expect(() => {
			registerFileIntercept(rule1);
			registerFileIntercept(rule2);
		}).not.toThrow();
	});
});

describe('registerFileRename', () => {
	it('accepts a rename rule', () => {
		const onRename = vi.fn();
		const rule: FileRenameRule = {
			extensions: new Set(['pdf']),
			onRename,
		};
		expect(() => registerFileRename(rule)).not.toThrow();
	});

	it('multiple rename rules can be registered', () => {
		const rule1: FileRenameRule = { extensions: new Set(['png']), onRename: vi.fn() };
		const rule2: FileRenameRule = { extensions: new Set(['csv']), onRename: vi.fn() };
		expect(() => {
			registerFileRename(rule1);
			registerFileRename(rule2);
		}).not.toThrow();
	});
});

describe('FileInterceptRule structure', () => {
	it('extensions Set correctly checks membership', () => {
		const rule: FileInterceptRule = {
			extensions: new Set(['pdf', 'csv', 'parquet']),
			targetViewType: 'custom-view',
		};
		expect(rule.extensions.has('pdf')).toBe(true);
		expect(rule.extensions.has('csv')).toBe(true);
		expect(rule.extensions.has('txt')).toBe(false);
	});
});
