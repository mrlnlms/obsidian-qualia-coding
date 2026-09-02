import type { CoderId } from '../core/icr/coderTypes';
import type { CoderRegistry } from '../core/icr/coderRegistry';
import { xmlAttr } from './xmlBuilder';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFI_USER_SCHEME = 'refi-qda-user-guid' as const;

export interface QdpxExportUser {
	coderId: CoderId;
	guid: string;
	name: string;
}

export interface QdpxAuthoredMarker {
	id: string;
	codedBy?: CoderId;
	importedQdpxSelection?: { unattributedOwner?: true };
}

export interface QdpxAuthoringContext {
	authorGuidFor(marker: QdpxAuthoredMarker): string | undefined;
	getUsers(): QdpxExportUser[];
}

function createUuid(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
		const random = (Math.random() * 16) | 0;
		return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
	});
}

export function createQdpxAuthoringContext(
	registry: CoderRegistry,
	warnings: string[],
	createGuid: () => string = createUuid,
): QdpxAuthoringContext {
	const users = new Map<CoderId, QdpxExportUser>();
	const warnedMarkers = new Set<string>();

	const warnOnce = (markerId: string, message: string): void => {
		if (warnedMarkers.has(markerId)) return;
		warnedMarkers.add(markerId);
		warnings.push(message);
	};

	return {
		authorGuidFor(marker): string | undefined {
			if (marker.importedQdpxSelection?.unattributedOwner) {
				warnOnce(marker.id, `QDPX marker ${marker.id}: explicitly unattributed owner — exported without creatingUser`);
				return undefined;
			}
			if (!marker.codedBy) {
				warnOnce(marker.id, `QDPX marker ${marker.id}: missing coder owner — exported without creatingUser`);
				return undefined;
			}

			const coder = registry.getById(marker.codedBy);
			if (!coder) {
				warnOnce(marker.id, `QDPX marker ${marker.id}: unknown coder ${marker.codedBy} — exported without creatingUser`);
				return undefined;
			}

			let guid = coder.externalIdentities?.find(
				(identity) => identity.scheme === REFI_USER_SCHEME && UUID_RE.test(identity.value),
			)?.value;
			if (!guid) {
				guid = createGuid();
				if (!UUID_RE.test(guid)) throw new Error(`Invalid generated QDPX User GUID: ${guid}`);
				registry.setExternalIdentity(coder.id, { scheme: REFI_USER_SCHEME, value: guid });
			}

			if (!users.has(coder.id)) users.set(coder.id, { coderId: coder.id, guid, name: coder.name });
			return guid;
		},

		getUsers(): QdpxExportUser[] {
			return Array.from(users.values());
		},
	};
}

export function buildUsersXml(users: QdpxExportUser[]): string {
	if (users.length === 0) return '';
	return `<Users>\n${users.map((user) =>
		`<User ${xmlAttr('guid', user.guid)} ${xmlAttr('name', user.name)}/>`
	).join('\n')}\n</Users>`;
}
