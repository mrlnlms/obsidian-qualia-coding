export type QdpxExportIssueKind =
	| 'source-load'
	| 'projection'
	| 'geometry'
	| 'identity'
	| 'serialization';

export interface QdpxExportIssue {
	sourceId?: string;
	markerId?: string;
	kind: QdpxExportIssueKind;
	message: string;
}

export interface QdpxExportAudit {
	activePdfSources: number;
	resolvedPdfMarkers: number;
	exportedLogicalSelections: number;
	exportedPdfFragments: number;
	omittedOrphanMarkers: number;
	issues: QdpxExportIssue[];
}

export function createQdpxExportAudit(): QdpxExportAudit {
	return {
		activePdfSources: 0,
		resolvedPdfMarkers: 0,
		exportedLogicalSelections: 0,
		exportedPdfFragments: 0,
		omittedOrphanMarkers: 0,
		issues: [],
	};
}

export class QdpxExportValidationError extends Error {
	constructor(public readonly audit: QdpxExportAudit) {
		const preview = audit.issues.slice(0, 3).map((issue) => issue.message).join('; ');
		const extra = audit.issues.length > 3 ? `; and ${audit.issues.length - 3} more` : '';
		super(`QDPX export coverage failed (${audit.issues.length} issue(s)): ${preview}${extra}`);
		this.name = 'QdpxExportValidationError';
	}
}

export function assertQdpxExportAudit(audit: QdpxExportAudit): void {
	if (audit.issues.length > 0) throw new QdpxExportValidationError(audit);
}
