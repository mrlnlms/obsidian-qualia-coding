import { describe, it, expect } from 'vitest';
import { resolveConflictPath, sanitizeFilename } from '../../src/core/memoPathResolver';

describe('sanitizeFilename', () => {
	it('replaces invalid filesystem chars with underscore', () => {
		expect(sanitizeFilename('Code: name/with*invalid?chars')).toBe('Code_ name_with_invalid_chars');
	});

	it('keeps unicode characters', () => {
		expect(sanitizeFilename('Código análise')).toBe('Código análise');
	});

	it('trims trailing dots and spaces', () => {
		expect(sanitizeFilename('Name.. ')).toBe('Name');
	});

	it('handles empty string', () => {
		expect(sanitizeFilename('')).toBe('');
	});

	it('handles names with only invalid chars', () => {
		expect(sanitizeFilename('///')).toBe('___');
	});
});

describe('resolveConflictPath', () => {
	const mkVault = (existing: Set<string>) => ({
		adapter: { exists: async (p: string) => existing.has(p) },
	} as any);

	it('returns base path when free', async () => {
		const out = await resolveConflictPath(mkVault(new Set()), 'A/Wellbeing.md');
		expect(out).toBe('A/Wellbeing.md');
	});

	it('appends (2) when base is taken', async () => {
		const out = await resolveConflictPath(mkVault(new Set(['A/Wellbeing.md'])), 'A/Wellbeing.md');
		expect(out).toBe('A/Wellbeing (2).md');
	});

	it('appends (3) when base and (2) are taken', async () => {
		const out = await resolveConflictPath(
			mkVault(new Set(['A/W.md', 'A/W (2).md'])),
			'A/W.md',
		);
		expect(out).toBe('A/W (3).md');
	});

	it('handles paths without folder', async () => {
		const out = await resolveConflictPath(mkVault(new Set(['X.md'])), 'X.md');
		expect(out).toBe('X (2).md');
	});

	it('handles paths without extension', async () => {
		const out = await resolveConflictPath(mkVault(new Set(['A/B'])), 'A/B');
		expect(out).toBe('A/B (2)');
	});
});
