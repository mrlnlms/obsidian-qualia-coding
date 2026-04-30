import type QualiaCodingPlugin from '../main';
import type { EntityRef } from './memoTypes';
import { sanitizeFilename } from './memoPathResolver';

/**
 * Filename pra marker memo materializado, usando estratégia híbrida por engine:
 *   - markdown / csv / pdf-text: `<filename>-<excerpt-4-palavras>`
 *   - pdf-shape / image: `<filename>-<shape>-<id-curto>`
 *   - audio / video: `<filename>-<timecode>`
 *
 * Garante estabilidade (id-curto sufixa quando texto é curto/genérico) e
 * legibilidade onde dá. Sanitiza pra filesystem.
 */
export function buildMarkerFilename(plugin: QualiaCodingPlugin, ref: EntityRef): string {
	if (ref.type !== 'marker') throw new Error('buildMarkerFilename only handles marker refs');
	const m = plugin.dataManager.findMarker(ref.engineType, ref.id);
	if (!m) throw new Error(`Marker not found: ${ref.engineType}:${ref.id}`);

	const fileBase = stripExtension(basename((m as { fileId: string }).fileId));
	const idCurto = ref.id.slice(-6);

	switch (ref.engineType) {
		case 'markdown':
		case 'csv': {
			const excerpt = extractExcerpt(m);
			return excerpt ? `${fileBase}-${excerpt}` : `${fileBase}-${idCurto}`;
		}
		case 'pdf': {
			const anyM = m as { text?: string; shape?: string; page?: number };
			if (anyM.shape) {
				return `${fileBase}-p${anyM.page ?? '?'}-${anyM.shape}-${idCurto}`;
			}
			const excerpt = extractExcerpt(m);
			return excerpt ? `${fileBase}-${excerpt}` : `${fileBase}-p${anyM.page ?? '?'}-${idCurto}`;
		}
		case 'image': {
			const anyM = m as { shape?: string };
			return `${fileBase}-${anyM.shape ?? 'region'}-${idCurto}`;
		}
		case 'audio':
		case 'video': {
			const anyM = m as { from?: number; to?: number };
			const tc = formatTimecode(anyM.from, anyM.to);
			return `${fileBase}-${tc}`;
		}
	}
}

/**
 * Tenta extrair primeiras 4 palavras de campos textuais. Threshold mínimo de 3 palavras —
 * abaixo disso, retorna null pra forçar ID fallback (evita filename muito curto/genérico
 * que se confunde com o filebase, ex: PDF "International" → filename = "<pdfBase>-International.md"
 * fica idêntico ao PDF original).
 */
function extractExcerpt(marker: unknown): string | null {
	const m = marker as { text?: string; markerText?: string };
	const raw = m.text ?? m.markerText;
	if (!raw || typeof raw !== 'string') return null;
	const allWords = raw.trim().split(/\s+/);
	if (allWords.length < 3) return null;
	const taken = allWords.slice(0, 4).join(' ');
	const cleaned = sanitizeFilename(taken);
	return cleaned.length > 0 ? cleaned : null;
}

/** `00m12s-00m45s` ou `00m12s` se to indefinido. */
function formatTimecode(from?: number, to?: number): string {
	const fmt = (sec?: number): string => {
		if (sec === undefined || !Number.isFinite(sec)) return '00m00s';
		const total = Math.max(0, Math.round(sec));
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
	};
	if (to === undefined) return fmt(from);
	return `${fmt(from)}-${fmt(to)}`;
}

function basename(path: string): string {
	const idx = path.lastIndexOf('/');
	return idx >= 0 ? path.slice(idx + 1) : path;
}

function stripExtension(name: string): string {
	const idx = name.lastIndexOf('.');
	return idx > 0 ? name.slice(0, idx) : name;
}
