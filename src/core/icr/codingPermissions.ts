import { DEFAULT_CODER_ID, type CoderId } from './coderTypes';

export type CodingParticipationMode = 'active' | 'read-only';

export function resolveParticipationMode(
	storedMode: CodingParticipationMode | undefined,
): CodingParticipationMode {
	return storedMode ?? 'active';
}

export function resolveStoredActiveCoder(
	storedCoderId: CoderId | undefined,
	hasCoder: (id: CoderId) => boolean,
): CoderId {
	return storedCoderId && hasCoder(storedCoderId) ? storedCoderId : DEFAULT_CODER_ID;
}

export function canEditOwnedMarker(
	mode: CodingParticipationMode,
	activeCoderId: CoderId,
	markerCoderId: CoderId | undefined,
): boolean {
	if (mode === 'read-only') return false;
	return (markerCoderId ?? DEFAULT_CODER_ID) === activeCoderId;
}
