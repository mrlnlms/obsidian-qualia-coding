import { describe, expect, it } from 'vitest';
import { parseXml } from '../../src/import/xmlParser';
import {
	groupCodingsByUser,
	mergePairedCodings,
	mergeQdpxRepresentationCodings,
	parseQdpxCodings,
	parseQdpxUsers,
} from '../../src/import/qdpxAuthoring';

describe('QDPX authoring metadata', () => {
	it('preserves Users and Coding authors', () => {
		const doc = parseXml(`<Project>
			<Users>
				<User guid="u1" name="Carla" />
				<User guid="u2" name="João" />
			</Users>
			<PDFSelection guid="s1">
				<Coding guid="c1" creatingUser="u1"><CodeRef targetGUID="code-a" /></Coding>
				<Coding guid="c2" creatingUser="u2"><CodeRef targetGUID="code-a" /></Coding>
			</PDFSelection>
		</Project>`);

		expect(parseQdpxUsers(doc)).toEqual([
			{ guid: 'u1', name: 'Carla' },
			{ guid: 'u2', name: 'João' },
		]);
		const codings = parseQdpxCodings(doc.documentElement.querySelector('PDFSelection')!);
		expect(codings.map((coding) => coding.creatingUserGuid)).toEqual(['u1', 'u2']);
		expect(groupCodingsByUser(codings)).toHaveLength(2);
	});

	it('merges paired PDF/text codings by author and code, retaining source GUIDs', () => {
		const merged = mergePairedCodings(
			[
				{ guid: 'pdf-c1', codeGuid: 'code-a', creatingUserGuid: 'u1', noteGuids: [], sourceCodingGuids: ['pdf-c1'] },
				{ guid: 'pdf-c2', codeGuid: 'code-a', creatingUserGuid: 'u2', noteGuids: [], sourceCodingGuids: ['pdf-c2'] },
			],
			[
				{ guid: 'text-c1', codeGuid: 'code-a', creatingUserGuid: 'u1', noteGuids: [], sourceCodingGuids: ['text-c1'] },
				{ guid: 'text-c2', codeGuid: 'code-a', creatingUserGuid: 'u2', noteGuids: [], sourceCodingGuids: ['text-c2'] },
			],
		);

		expect(merged).toHaveLength(2);
		expect(merged).toEqual(expect.arrayContaining([
			expect.objectContaining({ creatingUserGuid: 'u1', sourceCodingGuids: ['pdf-c1', 'text-c1'] }),
			expect.objectContaining({ creatingUserGuid: 'u2', sourceCodingGuids: ['pdf-c2', 'text-c2'] }),
		]));
	});

	it('merges three representations in order without merging different coders', () => {
		const merged = mergeQdpxRepresentationCodings([
			{ codings: [
				{ guid: 'pdf-anchor-a', codeGuid: 'code-a', creatingUserGuid: 'u1', createdAt: '2026-01-03T00:00:00Z', noteGuids: ['n1'], sourceCodingGuids: ['pdf-anchor-a'] },
				{ guid: 'pdf-anchor-b', codeGuid: 'code-a', creatingUserGuid: 'u2', noteGuids: [], sourceCodingGuids: ['pdf-anchor-b'] },
			] },
			{ codings: [
				{ guid: 'plain-a', codeGuid: 'code-a', creatingUserGuid: 'u1', createdAt: '2026-01-01T00:00:00Z', noteGuids: ['n2'], sourceCodingGuids: ['plain-a'] },
				{ guid: 'plain-b', codeGuid: 'code-a', creatingUserGuid: 'u2', noteGuids: [], sourceCodingGuids: ['plain-b'] },
			] },
			{ codings: [
				{ guid: 'pdf-continuation-a', codeGuid: 'code-a', creatingUserGuid: 'u1', createdAt: '2026-01-02T00:00:00Z', noteGuids: ['n1'], sourceCodingGuids: ['pdf-continuation-a'] },
				{ guid: 'pdf-continuation-b', codeGuid: 'code-a', creatingUserGuid: 'u2', noteGuids: [], sourceCodingGuids: ['pdf-continuation-b'] },
			] },
		]);

		expect(merged).toHaveLength(2);
		expect(merged).toEqual(expect.arrayContaining([
			expect.objectContaining({
				guid: 'pdf-anchor-a',
				creatingUserGuid: 'u1',
				createdAt: '2026-01-01T00:00:00Z',
				noteGuids: ['n1', 'n2'],
				sourceCodingGuids: ['pdf-anchor-a', 'plain-a', 'pdf-continuation-a'],
			}),
			expect.objectContaining({
				creatingUserGuid: 'u2',
				sourceCodingGuids: ['pdf-anchor-b', 'plain-b', 'pdf-continuation-b'],
			}),
		]));
	});
});
