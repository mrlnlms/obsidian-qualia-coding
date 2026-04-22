import type { TFile, Vault } from 'obsidian';

// SVG via <img src=blob:...> only works when the Blob carries an image MIME
// type — without it, Chromium rejects the decode silently. Other formats
// generally tolerate missing type, but keeping a mapping is cheap and makes
// the behaviour deterministic.
const MIME_BY_EXT: Record<string, string> = {
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
};

/**
 * Read width × height from an image file in the vault.
 *
 * Tries `createImageBitmap` first (fast, off-main-thread, but format-limited —
 * Chrome/Electron rejects SVG and some exotic formats). Falls back to an
 * `<img>` tag decode, which works for anything the browser can render — if
 * Obsidian can display the file, this path reads its dimensions.
 *
 * Returns null if both paths fail (unsupported binary, not an image, etc.).
 */
export async function getImageDimensions(
    vault: Vault,
    filePath: string,
): Promise<{ width: number; height: number } | null> {
    const file = vault.getAbstractFileByPath(filePath);
    if (!file || !('extension' in file)) return null;

    const data = await vault.readBinary(file as TFile);
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME_BY_EXT[ext];
    const blob = new Blob([data], mime ? { type: mime } : {});

    try {
        const bitmap = await createImageBitmap(blob);
        const result = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return result;
    } catch {
        // Fallback: browser <img> decode — universal across formats.
    }

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            const result = { width: img.naturalWidth, height: img.naturalHeight };
            URL.revokeObjectURL(url);
            resolve(result.width > 0 && result.height > 0 ? result : null);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}
