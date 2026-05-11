import { describe, it, expect, beforeEach } from 'vitest';
import { generateReconciliationReport } from '../../../../src/core/icr/ui/reconciliationReport';
import { CoderRegistry } from '../../../../src/core/icr/coderRegistry';
import { CodeDefinitionRegistry } from '../../../../src/core/codeDefinitionRegistry';
import type { AuditEntry } from '../../../../src/core/types';
import type { ContestedRegion, RegionsByStatus } from '../../../../src/core/icr/ui/regionDerivation';

function makeRegion(opts: { fileId: string; from: number; to: number; kind?: ContestedRegion['divergenceKind']; coderIds?: string[] }): ContestedRegion {
	return {
		fileId: opts.fileId,
		engine: 'markdown',
		bounds: { kind: 'text', from: opts.from, to: opts.to },
		coderIds: opts.coderIds ?? ['human:a', 'human:b'],
		displayLabel: `chars ${opts.from}–${opts.to}`,
		markerRefs: [],
		divergenceKind: opts.kind ?? 'code',
	};
}

function makeDecided(
	id: string,
	at: number,
	region: ContestedRegion,
	kind: 'adopt' | 'accept-divergence' = 'adopt',
	memo = 'memo de teste',
	codeId = 'c_x',
): AuditEntry {
	const decision = kind === 'adopt'
		? { kind: 'adopt' as const, codeId, mode: 'consensus-marker' as const }
		: { kind: 'accept-divergence' as const };
	return {
		id, codeId: kind === 'adopt' ? codeId : '',
		at, entity: 'reconciliation', type: 'reconciliation_decided',
		region: { fileId: region.fileId, engine: region.engine, bounds: region.bounds },
		coderIds: region.coderIds, decision, memoOfReconciliation: memo,
	};
}

describe('generateReconciliationReport', () => {
	let coderRegistry: CoderRegistry;
	let codeRegistry: CodeDefinitionRegistry;

	beforeEach(() => {
		coderRegistry = new CoderRegistry();
		coderRegistry.createHuman('Alice');
		coderRegistry.createHuman('Bob');
		codeRegistry = new CodeDefinitionRegistry();
		codeRegistry.create('Frustração', '#abc');
	});

	function emptyByStatus(): RegionsByStatus {
		return { open: [], inDiscussion: [], resolved: [], divergenceAccepted: [] };
	}

	it('inclui header com timestamp + coders', () => {
		const md = generateReconciliationReport({
			scope: { coderIds: ['human:alice', 'human:bob'] },
			byStatus: emptyByStatus(),
			auditLog: [],
			coderRegistry, codeRegistry,
		});
		expect(md).toContain('# Relatório de reconciliação ICR');
		expect(md).toContain('Alice');
		expect(md).toContain('Bob');
		expect(md).toMatch(/\*\*Data:\*\* \d{4}-\d{2}-\d{2}/);
	});

	it('seção resumo lista counts das 4 colunas', () => {
		const r1 = makeRegion({ fileId: 'A.md', from: 0, to: 50 });
		const r2 = makeRegion({ fileId: 'B.md', from: 0, to: 50 });
		const md = generateReconciliationReport({
			scope: { coderIds: ['human:alice', 'human:bob'] },
			byStatus: { open: [r1], inDiscussion: [r2], resolved: [], divergenceAccepted: [] },
			auditLog: [],
			coderRegistry, codeRegistry,
		});
		expect(md).toContain('🔥 Abertos: 1');
		expect(md).toContain('💬 Em discussão: 1');
		expect(md).toContain('✓ Resolvidos: 0');
		expect(md).toContain('◇ Divergência aceita: 0');
	});

	it('decisões aplicadas listam memo + tipo + timestamp', () => {
		const code = codeRegistry.getAll()[0]!;
		const region = makeRegion({ fileId: 'A.md', from: 0, to: 50 });
		const decided = makeDecided('d1', 1700000000000, region, 'adopt', 'porque era ruído', code.id);
		const md = generateReconciliationReport({
			scope: { coderIds: ['human:alice', 'human:bob'] },
			byStatus: { open: [], inDiscussion: [], resolved: [region], divergenceAccepted: [] },
			auditLog: [decided],
			coderRegistry, codeRegistry,
		});
		expect(md).toContain('## Decisões aplicadas');
		expect(md).toContain('A.md · markdown · chars 0–50');
		expect(md).toContain(`adopt ${code.name}`);
		expect(md).toContain('> porque era ruído');
	});

	it('inclui tabela κ pré/pós quando ambos são passados', () => {
		const md = generateReconciliationReport({
			scope: { coderIds: ['human:alice', 'human:bob'] },
			byStatus: emptyByStatus(),
			auditLog: [],
			coderRegistry, codeRegistry,
			kappaPre: { byPair: { 'human:alice|human:bob': 0.45 } },
			kappaPost: { byPair: { 'human:alice|human:bob': 0.82 } },
		});
		expect(md).toContain('## κ pré vs pós reconciliação');
		expect(md).toContain('| par | κ pré (humanos) | κ pós (c/ consensus) |');
		expect(md).toContain('Alice ↔ Bob');
		expect(md).toContain('0.45');
		expect(md).toContain('0.82');
	});

	it('lida com κ undefined (—)', () => {
		const md = generateReconciliationReport({
			scope: { coderIds: ['human:alice', 'human:bob'] },
			byStatus: emptyByStatus(),
			auditLog: [],
			coderRegistry, codeRegistry,
			kappaPre: { byPair: { 'human:alice|human:bob': undefined } },
		});
		expect(md).toContain('| Alice ↔ Bob | — |');
	});

	it('seção Em discussão lista regiões marcadas', () => {
		const r = makeRegion({ fileId: 'B.md', from: 100, to: 200 });
		const md = generateReconciliationReport({
			scope: { coderIds: ['human:alice', 'human:bob'] },
			byStatus: { open: [], inDiscussion: [r], resolved: [], divergenceAccepted: [] },
			auditLog: [],
			coderRegistry, codeRegistry,
		});
		expect(md).toContain('## Em discussão (marcadas pra revisão)');
		expect(md).toContain('B.md · markdown · chars 100–200');
	});

	it('seção Abertos lista regiões pendentes com tipo de divergência', () => {
		const r = makeRegion({ fileId: 'C.md', from: 0, to: 50, kind: 'boundary' });
		const md = generateReconciliationReport({
			scope: { coderIds: ['human:alice', 'human:bob'] },
			byStatus: { open: [r], inDiscussion: [], resolved: [], divergenceAccepted: [] },
			auditLog: [],
			coderRegistry, codeRegistry,
		});
		expect(md).toContain('## Abertos (pendentes)');
		expect(md).toContain('boundary');
	});

	it('omite seções sem conteúdo', () => {
		const md = generateReconciliationReport({
			scope: { coderIds: ['human:alice'] },
			byStatus: emptyByStatus(),
			auditLog: [],
			coderRegistry, codeRegistry,
		});
		expect(md).not.toContain('## Decisões aplicadas');
		expect(md).not.toContain('## Em discussão');
		expect(md).not.toContain('## Abertos');
		expect(md).not.toContain('## κ pré');
	});

	it('decisão revertida não aparece em "Decisões aplicadas"', () => {
		const region = makeRegion({ fileId: 'A.md', from: 0, to: 50 });
		const decided = makeDecided('d1', 1, region, 'adopt');
		const reverted: AuditEntry = {
			id: 'r1', codeId: 'c_x', at: 2,
			entity: 'reconciliation', type: 'reconciliation_reverted',
			originalEntryId: 'd1', restoredMarkerIds: [],
		};
		// Apesar do region estar em "resolved", se ela foi revertida o auditLog reflete
		// (region status calculation já lidou; aqui testamos que o report não exibe).
		// Cenário: região veio em `open` (após revert), audit ainda tem decided+reverted.
		const md = generateReconciliationReport({
			scope: { coderIds: ['human:alice', 'human:bob'] },
			byStatus: { open: [region], inDiscussion: [], resolved: [], divergenceAccepted: [] },
			auditLog: [decided, reverted],
			coderRegistry, codeRegistry,
		});
		expect(md).not.toContain('## Decisões aplicadas');
	});
});
