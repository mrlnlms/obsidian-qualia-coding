import { describe, it, expect } from 'vitest';
import { isCodeVisibleInFile, shouldStoreOverride, cleanOverridesAfterGlobalChange } from '../../src/core/codeVisibility';

/**
 * Regression guard: codeVisibility helpers operam por string key, sem assumir lookup em registry.
 * Smart codes (`sc_*`) e regulares (`c_*`) compartilham o mesmo `visibilityOverrides[fileId][id]` map.
 */
describe('codeVisibility com smart code ids', () => {
	it('isCodeVisibleInFile aceita sc_* sem assumir registry.definitions', () => {
		const overrides = { 'note.md': { 'sc_x': false } };
		expect(isCodeVisibleInFile('sc_x', 'note.md', false, overrides)).toBe(false);
		expect(isCodeVisibleInFile('sc_x', 'other.md', false, overrides)).toBe(true);  // sem override → global visible
		expect(isCodeVisibleInFile('sc_x', 'other.md', true, overrides)).toBe(false);   // global hidden
	});

	it('shouldStoreOverride aceita decisão boolean (id-agnostic)', () => {
		expect(shouldStoreOverride(false, false)).toBe(true);   // hide num doc onde global é visible → grava
		expect(shouldStoreOverride(true, false)).toBe(false);   // ambos visible → não grava
		expect(shouldStoreOverride(false, true)).toBe(false);   // ambos hidden → não grava
		expect(shouldStoreOverride(true, true)).toBe(true);     // unhide num doc onde global é hidden → grava
	});

	it('cleanOverridesAfterGlobalChange remove overrides que viraram redundantes (sc_*)', () => {
		const overrides = { 'note.md': { 'sc_x': true } };
		// Global passou pra visible (não-hidden). Override é true (visible), agora coincide → remove
		const result = cleanOverridesAfterGlobalChange(overrides, 'sc_x', false);
		expect(result['note.md']).toBeUndefined();
	});

	it('cleanOverridesAfterGlobalChange preserva overrides de sc_x quando muda c_y', () => {
		const overrides = { 'note.md': { 'sc_x': false, 'c_y': true } };
		const result = cleanOverridesAfterGlobalChange(overrides, 'c_y', false);
		// c_y removido (passou a coincidir com global=visible), sc_x preservado
		expect(result['note.md']).toEqual({ 'sc_x': false });
	});
});
