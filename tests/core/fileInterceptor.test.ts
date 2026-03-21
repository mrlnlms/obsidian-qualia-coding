import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	registerFileIntercept,
	registerFileRename,
	resolveLeafFilePath,
	matchesInterceptRule,
	dispatchRenameRules,
} from '../../src/core/fileInterceptor';
import type { FileInterceptRule, FileRenameRule } from '../../src/core/fileInterceptor';

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

// ── resolveLeafFilePath ──

describe('resolveLeafFilePath', () => {
	it('returns stateFile when it is a string', () => {
		expect(resolveLeafFilePath('notes/foo.md', undefined)).toBe('notes/foo.md');
	});

	it('falls back to viewFilePath when stateFile is not a string', () => {
		expect(resolveLeafFilePath(undefined, 'fallback.pdf')).toBe('fallback.pdf');
	});

	it('prefers stateFile over viewFilePath', () => {
		expect(resolveLeafFilePath('state.md', 'view.md')).toBe('state.md');
	});

	it('returns undefined when both are absent', () => {
		expect(resolveLeafFilePath(undefined, undefined)).toBeUndefined();
	});

	it('ignores non-string stateFile (number)', () => {
		expect(resolveLeafFilePath(42, 'fallback.pdf')).toBe('fallback.pdf');
	});

	it('ignores non-string stateFile (object)', () => {
		expect(resolveLeafFilePath({ path: 'x' }, undefined)).toBeUndefined();
	});
});

// ── matchesInterceptRule ──

describe('matchesInterceptRule', () => {
	const baseRule: FileInterceptRule = {
		extensions: new Set(['pdf', 'csv']),
		targetViewType: 'pdf-coding',
	};

	it('returns false if currentViewType equals targetViewType (dedup)', () => {
		expect(matchesInterceptRule(baseRule, 'pdf-coding', 'pdf')).toBe(false);
	});

	it('returns true when extension matches and no extra guards', () => {
		expect(matchesInterceptRule(baseRule, 'markdown', 'pdf')).toBe(true);
	});

	it('returns false when extension does not match', () => {
		expect(matchesInterceptRule(baseRule, 'markdown', 'txt')).toBe(false);
	});

	it('returns false when sourceViewType does not match', () => {
		const rule: FileInterceptRule = { ...baseRule, sourceViewType: 'image' };
		expect(matchesInterceptRule(rule, 'markdown', 'pdf')).toBe(false);
	});

	it('returns true when sourceViewType matches', () => {
		const rule: FileInterceptRule = { ...baseRule, sourceViewType: 'markdown' };
		expect(matchesInterceptRule(rule, 'markdown', 'pdf')).toBe(true);
	});

	it('returns false when shouldIntercept returns false', () => {
		const rule: FileInterceptRule = { ...baseRule, shouldIntercept: () => false };
		expect(matchesInterceptRule(rule, 'markdown', 'pdf')).toBe(false);
	});

	it('does not call shouldIntercept if sourceViewType already fails', () => {
		const guard = vi.fn(() => true);
		const rule: FileInterceptRule = {
			...baseRule,
			sourceViewType: 'image',
			shouldIntercept: guard,
		};
		matchesInterceptRule(rule, 'markdown', 'pdf');
		expect(guard).not.toHaveBeenCalled();
	});
});

// ── setupFileInterceptor (no detach) ──

describe('setupFileInterceptor (no detach)', () => {
	it('matchesInterceptRule does not check for existing leaves', () => {
		const rule: FileInterceptRule = {
			extensions: new Set(['pdf']),
			targetViewType: 'pdf-coding',
		};
		expect(matchesInterceptRule(rule, 'markdown', 'pdf')).toBe(true);
		expect(matchesInterceptRule(rule, 'markdown', 'pdf')).toBe(true);
	});
});

// ── dispatchRenameRules ──

describe('dispatchRenameRules', () => {
	it('calls handler for rule with matching extension', () => {
		const handler = vi.fn();
		const rules: FileRenameRule[] = [{ extensions: new Set(['mp3']), onRename: handler }];
		dispatchRenameRules(rules, 'mp3', 'old.mp3', 'new.mp3');
		expect(handler).toHaveBeenCalledWith('old.mp3', 'new.mp3');
	});

	it('does not call handler for non-matching extension', () => {
		const handler = vi.fn();
		const rules: FileRenameRule[] = [{ extensions: new Set(['mp3']), onRename: handler }];
		dispatchRenameRules(rules, 'pdf', 'old.pdf', 'new.pdf');
		expect(handler).not.toHaveBeenCalled();
	});

	it('dispatches to multiple matching rules', () => {
		const h1 = vi.fn();
		const h2 = vi.fn();
		const rules: FileRenameRule[] = [
			{ extensions: new Set(['csv']), onRename: h1 },
			{ extensions: new Set(['csv', 'tsv']), onRename: h2 },
		];
		dispatchRenameRules(rules, 'csv', 'old.csv', 'new.csv');
		expect(h1).toHaveBeenCalledOnce();
		expect(h2).toHaveBeenCalledOnce();
	});

	it('skips non-matching rules in a mixed set', () => {
		const h1 = vi.fn();
		const h2 = vi.fn();
		const rules: FileRenameRule[] = [
			{ extensions: new Set(['mp3']), onRename: h1 },
			{ extensions: new Set(['pdf']), onRename: h2 },
		];
		dispatchRenameRules(rules, 'mp3', 'a.mp3', 'b.mp3');
		expect(h1).toHaveBeenCalledOnce();
		expect(h2).not.toHaveBeenCalled();
	});
});
