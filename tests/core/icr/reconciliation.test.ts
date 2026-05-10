import { describe, it, expect, beforeEach } from 'vitest';
import { executeReconciliationDecision, executeReconciliationRevert } from '../../../src/core/icr/reconciliation';
import { CoderRegistry } from '../../../src/core/icr/coderRegistry';
import { CodeDefinitionRegistry } from '../../../src/core/codeDefinitionRegistry';
import type { IcrMarkerOps } from '../../../src/core/icr/markerOps';
import type { AuditEntry, ReconciliationBounds, MarkerSnapshot } from '../../../src/core/types';
import type { CoderId } from '../../../src/core/icr/coderTypes';
import type { EngineId } from '../../../src/core/icr/reporter';
import type { CodeApplication } from '../../../src/core/types';

interface FakeMarker {
	markerId: string;
	codedBy: CoderId;
	codes: CodeApplication[];
	bounds: ReconciliationBounds;
	fileId: string;
	engine: EngineId;
}

class FakeMarkerOps implements IcrMarkerOps {
	markers: FakeMarker[] = [];
	createdLog: FakeMarker[] = [];
	removedIds: string[] = [];
	updatedLog: { markerId: string; codes: CodeApplication[] }[] = [];
	restoredSnapshots: MarkerSnapshot[] = [];
	private idCounter = 100;

	createMarker(engine: EngineId, spec: { fileId: string; bounds: ReconciliationBounds; codeIds: string[]; codedBy: CoderId }): { markerId: string } {
		const markerId = `m_${this.idCounter++}`;
		const m: FakeMarker = {
			markerId,
			codedBy: spec.codedBy,
			codes: spec.codeIds.map(id => ({ codeId: id })),
			bounds: spec.bounds,
			fileId: spec.fileId,
			engine,
		};
		this.markers.push(m);
		this.createdLog.push(m);
		return { markerId };
	}

	removeMarker(_engine: EngineId, _fileId: string, markerId: string): void {
		this.markers = this.markers.filter(m => m.markerId !== markerId);
		this.removedIds.push(markerId);
	}

	updateMarker(_engine: EngineId, _fileId: string, markerId: string, fields: { codes?: CodeApplication[] }): void {
		const m = this.markers.find(x => x.markerId === markerId);
		if (m && fields.codes) m.codes = fields.codes;
		if (fields.codes) this.updatedLog.push({ markerId, codes: fields.codes });
	}

	serializeMarker(engine: EngineId, fileId: string, markerId: string): MarkerSnapshot {
		const m = this.markers.find(x => x.markerId === markerId);
		return { markerId, engine, fileId, serialized: JSON.parse(JSON.stringify(m)) };
	}

	restoreMarker(snapshot: MarkerSnapshot): void {
		const data = snapshot.serialized as FakeMarker;
		this.markers.push({ ...data });
		this.restoredSnapshots.push(snapshot);
	}

	findMarkersInRegion(region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds }): { markerId: string; codedBy: CoderId; codes: CodeApplication[] }[] {
		// Heurística simples pra teste: retorna todos os markers do mesmo file+engine.
		return this.markers
			.filter(m => m.fileId === region.fileId && m.engine === region.engine)
			.map(m => ({ markerId: m.markerId, codedBy: m.codedBy, codes: m.codes }));
	}
}

const TEXT_BOUNDS: ReconciliationBounds = { kind: 'text', from: 100, to: 250 };
const REGION = { fileId: 'F1', engine: 'markdown' as const, bounds: TEXT_BOUNDS };

let registry: CodeDefinitionRegistry;
let coderRegistry: CoderRegistry;
let log: AuditEntry[];
let markerOps: FakeMarkerOps;
let codeAlpha: { id: string };
let codeBeta: { id: string };

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
	coderRegistry = new CoderRegistry();
	log = [];
	markerOps = new FakeMarkerOps();
	codeAlpha = registry.create('Alpha');
	codeBeta = registry.create('Beta');
	coderRegistry.createHuman('Alice');
	coderRegistry.createHuman('Bob');
});

describe('executeReconciliationDecision — adopt/consensus-marker (additive default)', () => {
	it('cria consensus marker no targetCode + audit entry com codeId=target', () => {
		const result = executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice', 'human:bob'],
			decision: { kind: 'adopt', codeId: codeAlpha.id, mode: 'consensus-marker' },
			memoOfReconciliation: 'two readings',
			registry,
			coderRegistry,
			log,
			markerOps,
		});

		expect(result.ok).toBe(true);
		expect(result.consensusMarkerId).toBeTruthy();
		expect(markerOps.createdLog).toHaveLength(1);
		expect(markerOps.createdLog[0]!.codedBy).toBe('consensus:default');
		expect(markerOps.createdLog[0]!.codes).toEqual([{ codeId: codeAlpha.id }]);

		const auditEntries = log.filter(e => e.type === 'reconciliation_decided');
		expect(auditEntries).toHaveLength(1);
		expect(auditEntries[0]!.codeId).toBe(codeAlpha.id);
	});

	it('NÃO modifica markers originais (additive)', () => {
		// Cria marker original do Alice com Beta
		markerOps.markers.push({
			markerId: 'm_alice', codedBy: 'human:alice',
			codes: [{ codeId: codeBeta.id }],
			bounds: TEXT_BOUNDS, fileId: 'F1', engine: 'markdown',
		});
		executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice', 'human:bob'],
			decision: { kind: 'adopt', codeId: codeAlpha.id, mode: 'consensus-marker' },
			memoOfReconciliation: 'memo',
			registry, coderRegistry, log, markerOps,
		});
		const aliceMarker = markerOps.markers.find(m => m.markerId === 'm_alice')!;
		expect(aliceMarker.codes).toEqual([{ codeId: codeBeta.id }]);
		expect(markerOps.updatedLog).toHaveLength(0);
	});

	it('garante consensus coder no registry on-demand (idempotente)', () => {
		expect(coderRegistry.getById('consensus:default')).toBeNull();
		executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice'],
			decision: { kind: 'adopt', codeId: codeAlpha.id, mode: 'consensus-marker' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		expect(coderRegistry.getById('consensus:default')?.type).toBe('consensus');
		// segunda chamada não duplica
		executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice'],
			decision: { kind: 'adopt', codeId: codeAlpha.id, mode: 'consensus-marker' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		const consensusCount = coderRegistry.getAll().filter(c => c.type === 'consensus').length;
		expect(consensusCount).toBe(1);
	});

	it('respeita consensusBounds override no consensus marker', () => {
		const override: ReconciliationBounds = { kind: 'text', from: 50, to: 300 };
		executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice'],
			decision: { kind: 'adopt', codeId: codeAlpha.id, mode: 'consensus-marker' },
			memoOfReconciliation: '',
			consensusBounds: override,
			registry, coderRegistry, log, markerOps,
		});
		expect(markerOps.createdLog[0]!.bounds).toEqual(override);
	});

	it('falha com code-not-found quando codeId não existe', () => {
		const result = executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice'],
			decision: { kind: 'adopt', codeId: 'c_ghost', mode: 'consensus-marker' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('code-not-found');
		expect(log).toHaveLength(0);
	});
});

describe('executeReconciliationDecision — adopt/overwrite-originals', () => {
	beforeEach(() => {
		markerOps.markers.push(
			{ markerId: 'm_alice', codedBy: 'human:alice', codes: [{ codeId: codeBeta.id }], bounds: TEXT_BOUNDS, fileId: 'F1', engine: 'markdown' },
			{ markerId: 'm_bob', codedBy: 'human:bob', codes: [{ codeId: codeAlpha.id }], bounds: TEXT_BOUNDS, fileId: 'F1', engine: 'markdown' },
		);
	});

	it('snapshot preStateSnapshot dos coders perdedores + update pra targetCode', () => {
		const result = executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice', 'human:bob'],
			decision: { kind: 'adopt', codeId: codeAlpha.id, mode: 'overwrite-originals' },
			memoOfReconciliation: 'memo',
			registry, coderRegistry, log, markerOps,
		});
		expect(result.ok).toBe(true);
		// Alice tinha Beta (perdedora) → snapshot + update pra Alpha
		expect(result.preStateSnapshot).toHaveLength(1);
		expect(result.preStateSnapshot![0]!.markerId).toBe('m_alice');
		expect(markerOps.updatedLog).toHaveLength(1);
		const aliceMarker = markerOps.markers.find(m => m.markerId === 'm_alice')!;
		expect(aliceMarker.codes.map(c => c.codeId)).toEqual([codeAlpha.id]);
		// Bob já tinha Alpha → não muda
		const bobMarker = markerOps.markers.find(m => m.markerId === 'm_bob')!;
		expect(bobMarker.codes.map(c => c.codeId)).toEqual([codeAlpha.id]);
	});

	it('audit entry preserva preStateSnapshot dentro de decision', () => {
		executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice', 'human:bob'],
			decision: { kind: 'adopt', codeId: codeAlpha.id, mode: 'overwrite-originals' },
			memoOfReconciliation: 'memo',
			registry, coderRegistry, log, markerOps,
		});
		const decided = log.find(e => e.type === 'reconciliation_decided') as Extract<AuditEntry, { type: 'reconciliation_decided' }>;
		expect(decided.decision.kind).toBe('adopt');
		if (decided.decision.kind === 'adopt') {
			expect(decided.decision.preStateSnapshot).toHaveLength(1);
			expect(decided.decision.mode).toBe('overwrite-originals');
		}
	});

	it('cria consensus marker mesmo no overwrite mode', () => {
		executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice', 'human:bob'],
			decision: { kind: 'adopt', codeId: codeAlpha.id, mode: 'overwrite-originals' },
			memoOfReconciliation: 'memo',
			registry, coderRegistry, log, markerOps,
		});
		const consensusMarkers = markerOps.markers.filter(m => m.codedBy === 'consensus:default');
		expect(consensusMarkers).toHaveLength(1);
		expect(consensusMarkers[0]!.codes.map(c => c.codeId)).toEqual([codeAlpha.id]);
	});
});

describe('executeReconciliationDecision — split', () => {
	it('cria CodeDefinition novo + consensus marker no novo code', () => {
		const result = executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice', 'human:bob'],
			decision: { kind: 'split', newCodeId: 'placeholder', mode: 'consensus-marker' },
			memoOfReconciliation: 'split memo',
			registry, coderRegistry, log, markerOps,
		});
		expect(result.ok).toBe(true);
		expect(result.newCodeId).toBeTruthy();
		const newCode = registry.getById(result.newCodeId!);
		expect(newCode).toBeTruthy();
		// Consensus marker criado no novo code
		expect(markerOps.createdLog).toHaveLength(1);
		expect(markerOps.createdLog[0]!.codes.map(c => c.codeId)).toEqual([result.newCodeId]);
	});

	it('audit entry tem codeId = newCodeId (anchor pro Code Stability Timeline)', () => {
		const result = executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice'],
			decision: { kind: 'split', newCodeId: 'placeholder', mode: 'consensus-marker' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		const decided = log.find(e => e.type === 'reconciliation_decided');
		expect(decided?.codeId).toBe(result.newCodeId);
	});

	it('split com overwrite-originals re-aponta markers perdedores pro novo code', () => {
		markerOps.markers.push({
			markerId: 'm_alice', codedBy: 'human:alice', codes: [{ codeId: codeAlpha.id }],
			bounds: TEXT_BOUNDS, fileId: 'F1', engine: 'markdown',
		});
		const result = executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice'],
			decision: { kind: 'split', newCodeId: 'placeholder', mode: 'overwrite-originals' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		const alice = markerOps.markers.find(m => m.markerId === 'm_alice')!;
		expect(alice.codes.map(c => c.codeId)).toEqual([result.newCodeId]);
	});
});

describe('executeReconciliationDecision — accept-divergence', () => {
	it('audit-only, zero mudanças em markers', () => {
		const result = executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice', 'human:bob'],
			decision: { kind: 'accept-divergence' },
			memoOfReconciliation: 'duas leituras válidas',
			anchorCodeId: codeAlpha.id,
			registry, coderRegistry, log, markerOps,
		});
		expect(result.ok).toBe(true);
		expect(markerOps.createdLog).toHaveLength(0);
		expect(markerOps.updatedLog).toHaveLength(0);
		const decided = log.find(e => e.type === 'reconciliation_decided');
		expect(decided?.codeId).toBe(codeAlpha.id);
	});

	it('com candidateCodeIds vazios usa anchorCodeId="" (não polui timeline de nenhum code)', () => {
		executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice'],
			decision: { kind: 'accept-divergence' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		const decided = log.find(e => e.type === 'reconciliation_decided');
		expect(decided?.codeId).toBe('');
	});
});

describe('executeReconciliationDecision — region validation', () => {
	it('falha com bounds inválidos (text from > to)', () => {
		const result = executeReconciliationDecision({
			region: { fileId: 'F1', engine: 'markdown', bounds: { kind: 'text', from: 200, to: 100 } },
			coderIds: ['human:alice'],
			decision: { kind: 'adopt', codeId: codeAlpha.id, mode: 'consensus-marker' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('invalid-region');
	});

	it('falha com csvRow inválido (rowIndex negativo)', () => {
		const result = executeReconciliationDecision({
			region: { fileId: 'F1', engine: 'csvRow', bounds: { kind: 'csvRow', rowIndex: -1 } },
			coderIds: ['human:alice'],
			decision: { kind: 'accept-divergence' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		expect(result.ok).toBe(false);
	});
});

describe('executeReconciliationRevert', () => {
	it('reverte adopt/consensus-marker removendo o consensus marker', () => {
		const decided = executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice'],
			decision: { kind: 'adopt', codeId: codeAlpha.id, mode: 'consensus-marker' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		const before = markerOps.markers.length;
		const result = executeReconciliationRevert(decided.auditEntryId, { registry, coderRegistry, log, markerOps });
		expect(result.ok).toBe(true);
		expect(markerOps.markers.length).toBe(before - 1);
		expect(markerOps.removedIds).toContain(decided.consensusMarkerId);
		const reverted = log.find(e => e.type === 'reconciliation_reverted') as Extract<AuditEntry, { type: 'reconciliation_reverted' }>;
		expect(reverted.originalEntryId).toBe(decided.auditEntryId);
		expect(reverted.codeId).toBe(codeAlpha.id);
	});

	it('reverte adopt/overwrite-originals restaurando markers via snapshot', () => {
		markerOps.markers.push({
			markerId: 'm_alice', codedBy: 'human:alice', codes: [{ codeId: codeBeta.id }],
			bounds: TEXT_BOUNDS, fileId: 'F1', engine: 'markdown',
		});
		const decided = executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice'],
			decision: { kind: 'adopt', codeId: codeAlpha.id, mode: 'overwrite-originals' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		// Alice agora tem Alpha (mudou de Beta)
		const aliceAfter = markerOps.markers.find(m => m.markerId === 'm_alice')!;
		expect(aliceAfter.codes.map(c => c.codeId)).toEqual([codeAlpha.id]);

		executeReconciliationRevert(decided.auditEntryId, { registry, coderRegistry, log, markerOps });
		// markerOps.restoredSnapshots tem 1 entry (Alice)
		expect(markerOps.restoredSnapshots).toHaveLength(1);
		expect(markerOps.restoredSnapshots[0]!.markerId).toBe('m_alice');
	});

	it('reverte split removendo consensus marker mas não deletando o code novo', () => {
		const decided = executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice'],
			decision: { kind: 'split', newCodeId: 'placeholder', mode: 'consensus-marker' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		const newCodeId = decided.newCodeId!;
		executeReconciliationRevert(decided.auditEntryId, { registry, coderRegistry, log, markerOps });
		// Code novo continua no registry
		expect(registry.getById(newCodeId)).toBeTruthy();
		// Consensus marker foi removido
		expect(markerOps.removedIds).toContain(decided.consensusMarkerId);
	});

	it('reverte accept-divergence sem mudar markers (audit-only)', () => {
		const decided = executeReconciliationDecision({
			region: REGION,
			coderIds: ['human:alice'],
			decision: { kind: 'accept-divergence' },
			memoOfReconciliation: '',
			registry, coderRegistry, log, markerOps,
		});
		const before = markerOps.markers.length;
		executeReconciliationRevert(decided.auditEntryId, { registry, coderRegistry, log, markerOps });
		expect(markerOps.markers.length).toBe(before);
		expect(markerOps.removedIds).toHaveLength(0);
		const reverted = log.find(e => e.type === 'reconciliation_reverted') as Extract<AuditEntry, { type: 'reconciliation_reverted' }>;
		expect(reverted.restoredMarkerIds).toEqual([]);
	});

	it('falha gracefully se originalEntryId não existe', () => {
		const result = executeReconciliationRevert('a_ghost', { registry, coderRegistry, log, markerOps });
		expect(result.ok).toBe(false);
	});
});
