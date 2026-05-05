import { describe, it, expect } from 'vitest';
import { buildSmartCodesXml } from '../../src/export/qdpxExporter';
import type { SmartCodeDefinition } from '../../src/core/types';

const mkSc = (over: Partial<SmartCodeDefinition> = {}): SmartCodeDefinition => ({
	id: 'sc_1', name: 'X', color: '#abc', paletteIndex: 0, createdAt: 0,
	predicate: { kind: 'hasCode', codeId: 'c_x' },
	...over,
});

describe('buildSmartCodesXml', () => {
	it('returns empty string quando 0 smart codes', () => {
		expect(buildSmartCodesXml([])).toBe('');
	});

	it('export com smart code simples preserva predicate JSON em CDATA', () => {
		const sc = mkSc({ name: 'Frustration jr', memo: { content: 'My memo' } });
		const xml = buildSmartCodesXml([sc]);
		expect(xml).toContain('<qualia:SmartCodes>');
		expect(xml).toContain('guid="sc_1"');
		expect(xml).toContain('name="Frustration jr"');
		expect(xml).toContain('color="#abc"');
		expect(xml).toContain('<qualia:Predicate><![CDATA[');
		expect(xml).toMatch(/"kind":"hasCode"/);
		expect(xml).toContain('<qualia:Memo>My memo</qualia:Memo>');
	});

	it('omits qualia:Memo quando memo vazio/ausente', () => {
		expect(buildSmartCodesXml([mkSc()])).not.toContain('<qualia:Memo>');
		expect(buildSmartCodesXml([mkSc({ memo: { content: '' } })])).not.toContain('<qualia:Memo>');
		expect(buildSmartCodesXml([mkSc({ memo: { content: '   ' } })])).not.toContain('<qualia:Memo>');
	});

	it('escapa name + memo com & " < > corretamente', () => {
		const sc = mkSc({ name: 'A & B "test"', memo: { content: 'foo<bar>' } });
		const xml = buildSmartCodesXml([sc]);
		expect(xml).toContain('name="A &amp; B &quot;test&quot;"');
		expect(xml).toContain('foo&lt;bar&gt;');
	});

	it('export com 2 smart codes onde sc_2 referencia sc_1', () => {
		const sc1 = mkSc({ id: 'sc_1', name: 'A' });
		const sc2 = mkSc({ id: 'sc_2', name: 'B', predicate: { kind: 'smartCode', smartCodeId: 'sc_1' }});
		const xml = buildSmartCodesXml([sc1, sc2]);
		expect(xml.match(/<qualia:SmartCode\s/g)?.length).toBe(2);
		expect(xml).toMatch(/"smartCodeId":"sc_1"/);
	});
});
