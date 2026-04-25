import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { buildCodebookXml } from '../../src/export/qdcExporter';
import { parseSetsFromXml } from '../../src/import/qdpxImporter';
import { GROUP_PALETTE } from '../../src/core/types';

describe('QDPX export — Sets', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('emit <Sets> ausente quando não há groups', () => {
		registry.create('c1');
		const xml = buildCodebookXml(registry);
		// Aceita: tag <Sets> omitida (sem groups)
		expect(xml).not.toContain('<Sets>');
	});

	it('emit <Set> com MemberCode pros códigos membros', () => {
		const c = registry.create('code1');
		const g = registry.createGroup('RQ1');
		registry.addCodeToGroup(c.id, g.id);

		const xml = buildCodebookXml(registry, { ensureCodeGuid: (id) => `guid-${id}` });
		expect(xml).toContain('<Sets>');
		expect(xml).toContain('<Set ');
		expect(xml).toContain('name="RQ1"');
		expect(xml).toContain(`<MemberCode targetGUID="guid-${c.id}"`);
	});

	it('emit qualia:color custom attribute + <Description> quando preenchidos', () => {
		const g = registry.createGroup('RQ1');
		registry.setGroupDescription(g.id, 'Research Q1');

		const xml = buildCodebookXml(registry);
		expect(xml).toContain(`qualia:color="${g.color}"`);
		expect(xml).toContain('<Description>Research Q1</Description>');
	});

	it('omite <Description> quando description é undefined', () => {
		registry.createGroup('RQ1');
		const xml = buildCodebookXml(registry);
		expect(xml).not.toContain('<Description>');
	});
});

describe('parseSetsFromXml', () => {
	it('parse <Set> com qualia:color + MemberCode', () => {
		const xml = `
			<CodeBook>
				<Sets>
					<Set guid="s1" name="RQ1" qualia:color="#AEC6FF">
						<Description>Research Q1</Description>
						<MemberCode targetGUID="c-guid-1"/>
						<MemberCode targetGUID="c-guid-2"/>
					</Set>
				</Sets>
			</CodeBook>
		`;
		const result = parseSetsFromXml(xml);
		expect(result.groups.length).toBe(1);
		expect(result.groups[0]!.name).toBe('RQ1');
		expect(result.groups[0]!.color).toBe('#AEC6FF');
		expect(result.groups[0]!.description).toBe('Research Q1');
		expect(result.memberships[0]!.memberCodeGuids).toEqual(['c-guid-1', 'c-guid-2']);
		expect(result.warnings).toEqual([]);
	});

	it('sem qualia:color → auto-atribui do palette', () => {
		const xml = `<Sets><Set name="RQ1"/></Sets>`;
		const result = parseSetsFromXml(xml);
		expect(result.groups[0]!.paletteIndex).toBe(0);
		expect(result.groups[0]!.color).toBe(GROUP_PALETTE[0]);
	});

	it('MemberSource gera warning e é ignorado', () => {
		const xml = `
			<Sets>
				<Set name="MixedSet">
					<MemberCode targetGUID="c1"/>
					<MemberSource targetGUID="s1"/>
				</Set>
			</Sets>
		`;
		const result = parseSetsFromXml(xml);
		expect(result.memberships[0]!.memberCodeGuids).toEqual(['c1']);
		expect(result.warnings.some(w => w.includes('MemberSource'))).toBe(true);
	});

	it('description com entidades XML é decoded', () => {
		const xml = `<Sets><Set name="X"><Description>A &amp; B &lt;x&gt;</Description></Set></Sets>`;
		const result = parseSetsFromXml(xml);
		expect(result.groups[0]!.description).toBe('A & B <x>');
	});

	it('hadExplicitColor=true quando qualia:color presente, false quando ausente', () => {
		const xmlExplicit = `<Sets><Set name="A" qualia:color="#AEC6FF"/></Sets>`;
		const xmlImplicit = `<Sets><Set name="A"/></Sets>`;
		expect(parseSetsFromXml(xmlExplicit).groups[0]!.hadExplicitColor).toBe(true);
		expect(parseSetsFromXml(xmlImplicit).groups[0]!.hadExplicitColor).toBe(false);
	});
});
