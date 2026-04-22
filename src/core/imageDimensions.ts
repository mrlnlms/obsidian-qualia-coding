import type { TFile, Vault } from 'obsidian';

/**
 * Read width × height from an image file in the vault.
 *
 * Tries `createImageBitmap` first (fast, off-main-thread, but format-limited —
 * Chrome/Electron rejects SVG/TIFF/HEIC and some exotic formats). Falls back to
 * an `<img>` tag decode, which works for anything the browser can render —
 * if Obsidian can display the file, this path reads its dimensions.
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
    const blob = new Blob([data]);

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
