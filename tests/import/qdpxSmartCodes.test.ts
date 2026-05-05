import { describe, it, expect } from 'vitest';
import { parseSmartCodes, type GuidResolver } from '../../src/import/qdpxImporter';

const mkResolver = (codes: Record<string, string> = {}): GuidResolver => ({
	codes: new Map(Object.entries(codes)),
	sources: new Map(),
	selections: new Map(),
	smartCodes: new Map(),
});

describe('parseSmartCodes 2-pass', () => {
	it('returns empty quando bloco ausente', () => {
		const result = parseSmartCodes('<Project></Project>', mkResolver());
		expect(result.smartCodes).toEqual([]);
	});

	it('parsa smart code simples + remap codeId via resolver', () => {
		const xml = `
			<qualia:SmartCodes>
				<qualia:SmartCode guid="old-A" name="Frustration jr" color="#abc">
					<qualia:Predicate><![CDATA[{"codeId":"old-c1","kind":"hasCode"}]]></qualia:Predicate>
					<qualia:Memo>memo here</qualia:Memo>
				</qualia:SmartCode>
			</qualia:SmartCodes>
		`;
		const resolver = mkResolver({ 'old-c1': 'c_NEW1' });
		const result = parseSmartCodes(xml, resolver);
		expect(result.smartCodes).toHaveLength(1);
		const sc = result.smartCodes[0]!;
		expect(sc.name).toBe('Frustration jr');
		expect(sc.color).toBe('#abc');
		expect(sc.memo?.content).toBe('memo here');
		expect((sc.predicate as any).codeId).toBe('c_NEW1');
		expect(resolver.smartCodes.get('old-A')).toBe(sc.id);
	});

	it('resolves 2 smart codes mutuamente referenciados (2-pass)', () => {
		const xml = `
			<qualia:SmartCodes>
				<qualia:SmartCode guid="old-A" name="A" color="#aaa">
					<qualia:Predicate><![CDATA[{"kind":"smartCode","smartCodeId":"old-B"}]]></qualia:Predicate>
				</qualia:SmartCode>
				<qualia:SmartCode guid="old-B" name="B" color="#bbb">
					<qualia:Predicate><![CDATA[{"codeId":"old-c1","kind":"hasCode"}]]></qualia:Predicate>
				</qualia:SmartCode>
			</qualia:SmartCodes>
		`;
		const resolver = mkResolver({ 'old-c1': 'c_NEW1' });
		const result = parseSmartCodes(xml, resolver);
		expect(result.smartCodes).toHaveLength(2);
		const A = result.smartCodes.find(s => s.name === 'A')!;
		const B = result.smartCodes.find(s => s.name === 'B')!;
		expect((A.predicate as any).smartCodeId).toBe(B.id);
		expect((B.predicate as any).codeId).toBe('c_NEW1');
	});

	it('broken ref vira warning + leaf preservada com original ref', () => {
		const xml = `
			<qualia:SmartCodes>
				<qualia:SmartCode guid="old-A" name="A" color="#aaa">
					<qualia:Predicate><![CDATA[{"codeId":"old-deleted","kind":"hasCode"}]]></qualia:Predicate>
				</qualia:SmartCode>
			</qualia:SmartCodes>
		`;
		const resolver = mkResolver();  // sem old-deleted no map
		const result = parseSmartCodes(xml, resolver);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toMatch(/deleted code old-deleted/);
		expect((result.smartCodes[0]!.predicate as any).codeId).toBe('old-deleted');
	});

	it('attribute order tolerância (color → name → guid)', () => {
		const xml = `
			<qualia:SmartCodes>
				<qualia:SmartCode color="#abc" name="X" guid="old-A">
					<qualia:Predicate><![CDATA[{"codeId":"old-c1","kind":"hasCode"}]]></qualia:Predicate>
				</qualia:SmartCode>
			</qualia:SmartCodes>
		`;
		const resolver = mkResolver({ 'old-c1': 'c_NEW1' });
		const result = parseSmartCodes(xml, resolver);
		expect(result.smartCodes).toHaveLength(1);
		expect(result.smartCodes[0]!.name).toBe('X');
		expect(result.smartCodes[0]!.color).toBe('#abc');
	});

	it('decodifica entities em name + memo', () => {
		const xml = `
			<qualia:SmartCodes>
				<qualia:SmartCode guid="old-A" name="A &amp; B &quot;test&quot;" color="#abc">
					<qualia:Predicate><![CDATA[{"codeId":"c","kind":"hasCode"}]]></qualia:Predicate>
					<qualia:Memo>foo&lt;bar&gt;</qualia:Memo>
				</qualia:SmartCode>
			</qualia:SmartCodes>
		`;
		const resolver = mkResolver({ 'c': 'c_NEW' });
		const result = parseSmartCodes(xml, resolver);
		expect(result.smartCodes[0]!.name).toBe('A & B "test"');
		expect(result.smartCodes[0]!.memo?.content).toBe('foo<bar>');
	});
});
