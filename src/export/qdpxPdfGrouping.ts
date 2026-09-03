import type { CodeApplication } from '../core/types';
import { getMemoContent } from '../core/memoHelpers';
import type { MemoRecord } from '../core/memoTypes';
import type { PdfMarker } from '../pdf/pdfCodingTypes';
import type { ProjectedPdfFragment, ProjectedPdfMarker } from './qdpxPdfProjection';
import { deterministicQdpxGuid, isQdpxGuid, normalizeQdpxGuid } from './qdpxStableGuid';

export interface QdpxPdfCodingUnit {
	application: CodeApplication;
	markerId: string;
	creatingUserGuid?: string;
	creationDateTime: string;
	semanticKey: string;
	pdfCodingGuids: string[];
	plainTextCodingGuid: string;
}

export interface QdpxPdfSelectionUnit {
	key: string;
	selectionGuid: string;
	markerIds: string[];
	sourceId: string;
	name: string;
	creationDateTime: string;
	creatingUserGuid?: string;
	startPosition: number;
	endPosition: number;
	text: string;
	fragments: Array<ProjectedPdfFragment & { selectionGuid: string }>;
	codings: QdpxPdfCodingUnit[];
	memo?: MemoRecord;
}

export interface QdpxPdfGroupingResult {
	units: QdpxPdfSelectionUnit[];
	selectionGuidByMarkerId: Map<string, string>;
}

export interface QdpxGroupingContext {
	projectKey: string;
	authorGuidFor(marker: PdfMarker): string | undefined;
	selectionAuthorGuidFor?(marker: PdfMarker): string | undefined;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function memoSignature(memo: MemoRecord | undefined): string {
	return memo ? getMemoContent(memo) : '';
}

function relationSignature(marker: PdfMarker): string {
	const relations = marker.codes.flatMap((application) =>
		(application.relations ?? []).map((relation) => ({
			ownerCodeId: application.codeId,
			label: relation.label,
			target: relation.target,
			directed: relation.directed,
			memo: memoSignature(relation.memo),
		})),
	);
	return stableJson(relations.sort((a, b) => stableJson(a).localeCompare(stableJson(b))));
}

function compatibilityKey(projected: ProjectedPdfMarker): string {
	const provenance = projected.marker.importedQdpxSelection;
	return stableJson({
		sourceId: projected.marker.fileId,
		startPosition: projected.startPosition,
		endPosition: projected.endPosition,
		text: projected.text,
		fragments: projected.fragments.map((fragment) => ({
			page: fragment.page,
			startPosition: fragment.startPosition,
			endPosition: fragment.endPosition,
			text: fragment.text,
			bbox: fragment.bbox,
		})),
		selection: {
			creatingUserGuid: provenance?.creatingUserGuid,
			name: provenance?.name,
			creationDateTime: provenance?.creationDateTime,
		},
		memo: memoSignature(projected.marker.memo),
		relations: relationSignature(projected.marker),
	});
}

function codingSemanticKey(marker: PdfMarker, application: CodeApplication, authorGuid: string | undefined): string {
	return stableJson({
		coder: authorGuid ?? marker.codedBy ?? null,
		codeId: application.codeId,
		magnitude: application.magnitude ?? null,
	});
}

function importedRoleGuids(
	application: CodeApplication,
	fragmentCount: number,
): { pdf: string[]; plainText: string } | null {
	const source = application.qdpx?.sourceCodingGuids;
	if (!source || source.length !== fragmentCount + 1 || !source.every(isQdpxGuid)) return null;
	return {
		pdf: [source[0]!, ...source.slice(2)].map(normalizeQdpxGuid),
		plainText: normalizeQdpxGuid(source[1]!),
	};
}

async function buildCodingUnits(
	markers: ProjectedPdfMarker[],
	unitKey: string,
	fragmentCount: number,
	canReuseImportedIdentity: boolean,
	context: QdpxGroupingContext,
): Promise<QdpxPdfCodingUnit[]> {
	const semantic = new Map<string, { marker: PdfMarker; application: CodeApplication; authorGuid?: string }>();
	const usedPhysicalGuids = new Set<string>();
	const allocatePhysicalGuid = async (candidate: string | undefined, fallbackKey: string): Promise<string> => {
		if (candidate && !usedPhysicalGuids.has(candidate)) {
			usedPhysicalGuids.add(candidate);
			return candidate;
		}
		const generated = await deterministicQdpxGuid(fallbackKey);
		usedPhysicalGuids.add(generated);
		return generated;
	};
	for (const projected of markers) {
		const resolvedMarkerAuthor = context.authorGuidFor(projected.marker);
		for (const application of projected.marker.codes) {
			const applicationAuthor = application.qdpx?.creatingUserGuid ?? resolvedMarkerAuthor;
			const semanticKey = codingSemanticKey(projected.marker, application, applicationAuthor);
			if (!semantic.has(semanticKey)) semantic.set(semanticKey, { marker: projected.marker, application, authorGuid: applicationAuthor });
		}
	}

	const units: QdpxPdfCodingUnit[] = [];
	for (const [semanticKey, value] of [...semantic].sort(([a], [b]) => a.localeCompare(b))) {
		const imported = canReuseImportedIdentity ? importedRoleGuids(value.application, fragmentCount) : null;
		const pdfCodingGuids: string[] = [];
		for (let index = 0; index < fragmentCount; index++) {
			pdfCodingGuids.push(await allocatePhysicalGuid(
				imported?.pdf[index],
				`${context.projectKey}:coding:${unitKey}:${semanticKey}:pdf:${index}`,
			));
		}
		units.push({
			application: value.application,
			markerId: value.marker.id,
			creatingUserGuid: value.authorGuid,
			creationDateTime: value.application.qdpx?.creationDateTime
				?? new Date(value.marker.createdAt).toISOString(),
			semanticKey,
			pdfCodingGuids,
			plainTextCodingGuid: await allocatePhysicalGuid(
				imported?.plainText,
				`${context.projectKey}:coding:${unitKey}:${semanticKey}:text`,
			),
		});
	}
	return units;
}

async function buildUnit(
	sourceId: string,
	partition: ProjectedPdfMarker[],
	partitionIndex: number,
	canReuseImportedIdentity: boolean,
	context: QdpxGroupingContext,
): Promise<QdpxPdfSelectionUnit> {
	const first = partition[0]!;
	const provenance = first.marker.importedQdpxSelection;
	const unitKey = `${sourceId}:${provenance?.selectionGuid ?? first.marker.id}:${compatibilityKey(first)}:${partitionIndex}`;
	const selectionGuid = canReuseImportedIdentity && isQdpxGuid(provenance?.selectionGuid)
		? normalizeQdpxGuid(provenance.selectionGuid)
		: await deterministicQdpxGuid(`${context.projectKey}:selection:${unitKey}`);
	const fragments = [] as QdpxPdfSelectionUnit['fragments'];
	for (let index = 0; index < first.fragments.length; index++) {
		const fragment = first.fragments[index]!;
		const importedFragmentGuid = provenance?.selectionGuids?.[index]
			?? (index === 0 ? provenance?.selectionGuid : undefined);
		const fragmentGuid = index === 0
			? selectionGuid
			: canReuseImportedIdentity && isQdpxGuid(importedFragmentGuid)
				? normalizeQdpxGuid(importedFragmentGuid)
				: await deterministicQdpxGuid(`${context.projectKey}:selection:${unitKey}:fragment:${index}`);
		fragments.push({ ...fragment, selectionGuid: fragmentGuid });
	}
	return {
		key: unitKey,
		selectionGuid,
		markerIds: partition.map((item) => item.marker.id).sort(),
		sourceId,
		name: provenance?.name ?? first.text.replace(/\f/g, ' '),
		creationDateTime: provenance?.creationDateTime ?? new Date(first.marker.createdAt).toISOString(),
		creatingUserGuid: context.selectionAuthorGuidFor?.(first.marker),
		startPosition: first.startPosition,
		endPosition: first.endPosition,
		text: first.text,
		fragments,
		codings: await buildCodingUnits(partition, unitKey, fragments.length, canReuseImportedIdentity, context),
		memo: first.marker.memo,
	};
}

export async function buildQdpxPdfSelectionUnits(
	sourceId: string,
	projectedMarkers: ProjectedPdfMarker[],
	context: QdpxGroupingContext,
): Promise<QdpxPdfGroupingResult> {
	const buckets = new Map<string, ProjectedPdfMarker[]>();
	for (const projected of projectedMarkers) {
		const importedGuid = projected.marker.importedQdpxSelection?.selectionGuid;
		const bucketKey = importedGuid ? `imported:${importedGuid}` : `native:${projected.marker.id}`;
		buckets.set(bucketKey, [...(buckets.get(bucketKey) ?? []), projected]);
	}

	const units: QdpxPdfSelectionUnit[] = [];
	const selectionGuidByMarkerId = new Map<string, string>();
	for (const [, bucket] of [...buckets].sort(([a], [b]) => a.localeCompare(b))) {
		const partitionsByCompatibility = new Map<string, ProjectedPdfMarker[]>();
		for (const projected of bucket) {
			const key = compatibilityKey(projected);
			partitionsByCompatibility.set(key, [...(partitionsByCompatibility.get(key) ?? []), projected]);
		}
		const partitions = [...partitionsByCompatibility]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([, partition]) => partition);
		const isImported = bucket[0]!.marker.importedQdpxSelection !== undefined;
		const canReuseImportedIdentity = isImported && partitions.length === 1;
		for (let index = 0; index < partitions.length; index++) {
			const unit = await buildUnit(sourceId, partitions[index]!, index, canReuseImportedIdentity, context);
			units.push(unit);
			for (const markerId of unit.markerIds) selectionGuidByMarkerId.set(markerId, unit.selectionGuid);
		}
	}
	return { units, selectionGuidByMarkerId };
}
