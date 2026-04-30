import type { Vault } from 'obsidian';

const INVALID_FS_RE = /[/\\:*?"<>|]/g;

export function sanitizeFilename(name: string): string {
	return name.replace(INVALID_FS_RE, '_').replace(/[\.\s]+$/, '');
}

/**
 * Resolve path com sufixo `(2)`, `(3)`... se base já existe no vault.
 * Quando a base está livre, retorna inalterada.
 */
export async function resolveConflictPath(vault: Vault, basePath: string): Promise<string> {
	if (!(await vault.adapter.exists(basePath))) return basePath;
	const dotIdx = basePath.lastIndexOf('.');
	const slashIdx = basePath.lastIndexOf('/');
	// Só trata como extensão se o ponto vier depois da última barra (evita `dir.name/file`)
	const hasExt = dotIdx > slashIdx;
	const stem = hasExt ? basePath.slice(0, dotIdx) : basePath;
	const ext = hasExt ? basePath.slice(dotIdx) : '';
	let n = 2;
	while (await vault.adapter.exists(`${stem} (${n})${ext}`)) n++;
	return `${stem} (${n})${ext}`;
}
