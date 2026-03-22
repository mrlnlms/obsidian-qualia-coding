import { escapeXml, xmlAttr } from './xmlBuilder';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export function uuidV4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function ensureGuid(id: string, guidMap: Map<string, string>): string {
  if (isValidUuid(id)) return id;
  const cached = guidMap.get(id);
  if (cached) return cached;
  const guid = uuidV4();
  guidMap.set(id, guid);
  return guid;
}
