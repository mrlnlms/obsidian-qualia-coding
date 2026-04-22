import type { Vault } from 'obsidian';
import { loadRenderableBlob } from './imageDecode';

/**
 * Read width × height from an image file in the vault.
 *
 * Delegates to `loadRenderableBlob` so HEIC/HEIF are decoded first. Tries
 * `createImageBitmap` (fast), falls back to `<img>` decode (universal across
 * formats the browser can render).
 *
 * Returns null if the file cannot be loaded/decoded.
 */
export async function getImageDimensions(
    vault: Vault,
    filePath: string,
): Promise<{ width: number; height: number } | null> {
    const blob = await loadRenderableBlob(vault, filePath);
    if (!blob) return null;

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
