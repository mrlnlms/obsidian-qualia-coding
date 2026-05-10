/**
 * Types da UI layer da Fase C P1 (ICR Import view).
 *
 * ResolutionOverrides é UI-only — escolhas do user (manter local / aceitar incoming /
 * skip). Motor consome via parâmetro `options.overrides` em mergeCoderContribution
 * (sem entrar em payloadTypes.ts, que descreve só wire format).
 */

export interface ResolutionOverrides {
	/** Override per code: 'local' = mantém local, 'incoming' = aceita incoming (default), 'skip' = não importa code novo. */
	codebookOverrides: Map<string /* codeId */, 'local' | 'incoming' | 'skip'>;
	/** Override per source: 'trust-local' = importa markers mesmo com offsets potencialmente desalinhados, 'skip-source' = não importa, { kind: 'map-manual', localFileId } = remap manual. */
	sourceOverrides: Map<string /* payloadFileId */, 'trust-local' | 'skip-source' | { kind: 'map-manual'; localFileId: string }>;
	/** Markers individuais skipados pelo user (chip Lado a lado). */
	perMarkerSkip: Set<string /* markerId */>;
	/** Codes inteiros skipados (chip Por código — afeta todos markers desse code). */
	perCodeSkip: Set<string /* codeId */>;
}

export function createEmptyOverrides(): ResolutionOverrides {
	return {
		codebookOverrides: new Map(),
		sourceOverrides: new Map(),
		perMarkerSkip: new Set(),
		perCodeSkip: new Set(),
	};
}

/** Clone shallow das estruturas — usado por chips antes de mutar e emitir onOverridesChange. */
export function cloneOverrides(o: ResolutionOverrides): ResolutionOverrides {
	return {
		codebookOverrides: new Map(o.codebookOverrides),
		sourceOverrides: new Map(o.sourceOverrides),
		perMarkerSkip: new Set(o.perMarkerSkip),
		perCodeSkip: new Set(o.perCodeSkip),
	};
}
