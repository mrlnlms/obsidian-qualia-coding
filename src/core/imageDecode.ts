import type { TFile, Vault } from 'obsidian';

// Formats that Chromium (the Obsidian runtime) does NOT decode natively.
// Our plugin ships a JS decoder for HEIC/HEIF so pesquisadores that capture
// images on iPhones can codify without an external conversion step.
// TIFF is left out on purpose (see BACKLOG §11 E4 — demand-driven).
const NEEDS_DECODE = new Set(['heic', 'heif']);

// MIME hints — necessary for SVG (Chromium rejects <img src=blob:...> without
// image/svg+xml due to XSS concerns); harmless for everything else.
const MIME_BY_EXT: Record<string, string> = {
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    heic: 'image/heic',
    heif: 'image/heif',
};

/**
 * Load a vault image file into a Blob that <img>/fabric/createImageBitmap can
 * actually render. For HEIC/HEIF, runs a JS decode (libheif via heic2any) that
 * returns a JPEG Blob. For everything else, just wraps the binary with the
 * correct MIME type.
 *
 * Returns null if the file is missing or the decode fails.
 */
export async function loadRenderableBlob(
    vault: Vault,
    filePath: string,
): Promise<Blob | null> {
    const file = vault.getAbstractFileByPath(filePath);
    if (!file || !('extension' in file)) return null;

    const data = await vault.readBinary(file as TFile);
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME_BY_EXT[ext];
    const source = new Blob([data], mime ? { type: mime } : {});

    if (!NEEDS_DECODE.has(ext)) return source;

    try {
        // Dynamic import so the heic2any bundle is fetched only when a user
        // actually opens a HEIC/HEIF file — keeps plugin startup lean.
        const heic2any = (await import('heic2any')).default;
        const result = await heic2any({ blob: source, toType: 'image/jpeg' });
        return Array.isArray(result) ? result[0]! : result;
    } catch {
        return null;
    }
}

/**
 * Build a blob: URL renderable by <img> / FabricImage / canvas. Caller must
 * revoke the URL when done (via `URL.revokeObjectURL`) to free memory.
 * Returns null if the file cannot be loaded or decoded.
 */
export async function loadRenderableUrl(
    vault: Vault,
    filePath: string,
): Promise<string | null> {
    const blob = await loadRenderableBlob(vault, filePath);
    if (!blob) return null;
    return URL.createObjectURL(blob);
}
