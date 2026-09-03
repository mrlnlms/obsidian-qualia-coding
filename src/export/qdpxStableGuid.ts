const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isQdpxGuid(value: string | undefined): value is string {
	return value !== undefined && UUID_RE.test(value);
}

export function normalizeQdpxGuid(value: string): string {
	return value.toUpperCase();
}

/** Browser-safe deterministic UUIDv8 derived from a semantic export key. */
export async function deterministicQdpxGuid(key: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`qualia-qdpx:${key}`));
	const bytes = new Uint8Array(digest).slice(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x80;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
