/**
 * SHA-256 hash de ArrayBuffer via Web Crypto.
 *
 * `crypto.subtle.digest` é built-in browser/Node ≥15 (e jsdom 24+).
 * Sem dep nova. Pra arquivos grandes, async cede tempo pro event loop.
 */

export async function computeSourceHash(buffer: ArrayBuffer): Promise<string> {
	// Wrap em Uint8Array — normaliza input pro SubtleCrypto (jsdom polyfill é estrito com empty
	// ArrayBuffer; Uint8Array funciona consistentemente). Empty case é caso real (arquivo vazio).
	const view = new Uint8Array(buffer);
	const hashBuffer = await crypto.subtle.digest('SHA-256', view);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
