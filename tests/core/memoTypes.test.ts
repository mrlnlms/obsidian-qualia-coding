import { describe, it, expect } from 'vitest';
import { entityRefToString, entityRefFromString, type EntityRef } from '../../src/core/memoTypes';

describe('EntityRef serialization round-trip', () => {
	const cases: Array<[string, EntityRef]> = [
		['code', { type: 'code', id: 'c_abc' }],
		['group', { type: 'group', id: 'g_xyz' }],
		['marker', { type: 'marker', engineType: 'pdf', id: 'm_1' }],
		['relation-code', { type: 'relation-code', codeId: 'c_a', label: 'causes', target: 'c_b' }],
		['relation-app', { type: 'relation-app', engineType: 'markdown', markerId: 'm_1', codeId: 'c_a', label: 'causes', target: 'c_b' }],
		['smartCode', { type: 'smartCode', id: 'sc_abc' }],
	];

	for (const [name, ref] of cases) {
		it(`${name} → string → back`, () => {
			const s = entityRefToString(ref);
			const back = entityRefFromString(s);
			expect(back).toEqual(ref);
		});
	}

	it('smartCode shape: smartCode:<id>', () => {
		expect(entityRefToString({ type: 'smartCode', id: 'sc_abc' })).toBe('smartCode:sc_abc');
	});

	it('parse de smartCode:<id> roundtrip', () => {
		expect(entityRefFromString('smartCode:sc_abc')).toEqual({ type: 'smartCode', id: 'sc_abc' });
	});

	it('parse rejeita smartCode com mais de 1 segmento extra', () => {
		expect(entityRefFromString('smartCode:sc_a:extra')).toBeNull();
	});

	it('parse rejeita type desconhecido', () => {
		expect(entityRefFromString('unknown:foo')).toBeNull();
	});
});
