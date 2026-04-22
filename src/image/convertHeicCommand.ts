import { Notice, TFile } from 'obsidian';
import type QualiaCodingPlugin from '../main';

const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

/**
 * Convert every HEIC/HEIF file in the vault to PNG.
 *
 * Chromium (Obsidian's runtime) doesn't decode HEIC natively, so users that
 * capture photos on iPhones need to run this once to make them codable. The
 * original .heic file is kept next to the new .png — user deletes manually if
 * desired (avoids data loss if conversion is subtly wrong).
 *
 * Uses dynamic import so the heic2any bundle (libheif WASM) is pulled in only
 * when the command actually runs — keeps plugin startup lean for users that
 * never touch HEIC.
 */
export async function convertAllHeicToPng(plugin: QualiaCodingPlugin): Promise<void> {
    const heicFiles: TFile[] = plugin.app.vault.getFiles().filter(
        (f) => HEIC_EXTENSIONS.has(f.extension.toLowerCase()),
    );

    if (heicFiles.length === 0) {
        new Notice('No HEIC/HEIF files found in the vault.');
        return;
    }

    new Notice(`Converting ${heicFiles.length} HEIC/HEIF file(s) to PNG...`);

    const { default: heic2any } = await import('heic2any');

    let converted = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const file of heicFiles) {
        const pngPath = file.path.replace(/\.(heic|heif)$/i, '.png');

        if (plugin.app.vault.getAbstractFileByPath(pngPath)) {
            skipped++;
            continue;
        }

        try {
            const data = await plugin.app.vault.readBinary(file);
            const sourceBlob = new Blob([data], { type: 'image/heic' });
            const pngResult = await heic2any({ blob: sourceBlob, toType: 'image/png' });
            const pngBlob = Array.isArray(pngResult) ? pngResult[0]! : pngResult;
            const pngBuffer = await pngBlob.arrayBuffer();

            await plugin.app.vault.createBinary(pngPath, pngBuffer);
            converted++;
        } catch (e) {
            failed++;
            errors.push(`${file.path}: ${(e as Error).message}`);
        }
    }

    const parts: string[] = [];
    if (converted > 0) parts.push(`${converted} converted`);
    if (skipped > 0) parts.push(`${skipped} skipped (PNG already exists)`);
    if (failed > 0) parts.push(`${failed} failed`);

    new Notice(`HEIC conversion: ${parts.join(', ')}.`, 8000);

    if (errors.length > 0) {
        console.warn('[Qualia Coding] HEIC conversion errors:\n' + errors.join('\n'));
    }
}
