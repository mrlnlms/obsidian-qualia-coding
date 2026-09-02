import { describe, expect, it, vi } from 'vitest';
import { CoderRegistry } from '../../src/core/icr/coderRegistry';
import {
	buildUsersXml,
	createQdpxAuthoringContext,
} from '../../src/export/qdpxAuthoring';

const CARLA_GUID = '11111111-1111-4111-8111-111111111111';
const LOCAL_GUID = '22222222-2222-4222-8222-222222222222';

describe('QDPX export authoring', () => {
	it('reuses imported identity, creates one stable local identity, and includes only used coders', () => {
		const registry = new CoderRegistry();
		const carla = registry.resolveOrCreateExternalHuman('Carla', {
			scheme: 'refi-qda-user-guid',
			value: CARLA_GUID,
		});
		registry.createHuman('Unused');
		const warnings: string[] = [];
		const createGuid = vi.fn(() => LOCAL_GUID);
		const context = createQdpxAuthoringContext(registry, warnings, createGuid);

		expect(context.authorGuidFor({ id: 'm1', codedBy: carla.id })).toBe(CARLA_GUID);
		expect(context.authorGuidFor({ id: 'm2', codedBy: 'human:default' })).toBe(LOCAL_GUID);
		expect(context.authorGuidFor({ id: 'm3', codedBy: 'human:default' })).toBe(LOCAL_GUID);
		expect(createGuid).toHaveBeenCalledTimes(1);
		expect(context.getUsers().map((user) => user.coderId)).toEqual([carla.id, 'human:default']);
		expect(registry.getById('human:default')?.externalIdentities).toEqual([{
			scheme: 'refi-qda-user-guid',
			value: LOCAL_GUID,
		}]);
		expect(warnings).toEqual([]);
	});

	it('keeps same-name coders distinct by external GUID', () => {
		const registry = new CoderRegistry();
		const first = registry.resolveOrCreateExternalHuman('Alex', {
			scheme: 'refi-qda-user-guid', value: CARLA_GUID,
		});
		const second = registry.resolveOrCreateExternalHuman('Alex', {
			scheme: 'refi-qda-user-guid', value: LOCAL_GUID,
		});
		const context = createQdpxAuthoringContext(registry, []);

		expect(context.authorGuidFor({ id: 'm1', codedBy: first.id })).toBe(CARLA_GUID);
		expect(context.authorGuidFor({ id: 'm2', codedBy: second.id })).toBe(LOCAL_GUID);
		expect(context.getUsers()).toHaveLength(2);
	});

	it('replaces an invalid stored identity and persists the replacement', () => {
		const registry = new CoderRegistry();
		const coder = registry.createHuman('Carla');
		registry.setExternalIdentity(coder.id, { scheme: 'refi-qda-user-guid', value: 'not-a-guid' });
		const createGuid = vi.fn(() => CARLA_GUID);
		const context = createQdpxAuthoringContext(registry, [], createGuid);

		expect(context.authorGuidFor({ id: 'm1', codedBy: coder.id })).toBe(CARLA_GUID);
		expect(registry.getByExternalIdentity({
			scheme: 'refi-qda-user-guid', value: CARLA_GUID,
		})?.id).toBe(coder.id);
	});

	it('warns once per unattributed, ownerless, or unknown marker without inventing a User', () => {
		const warnings: string[] = [];
		const context = createQdpxAuthoringContext(new CoderRegistry(), warnings);

		expect(context.authorGuidFor({
			id: 'unattributed',
			importedQdpxSelection: { unattributedOwner: true },
		})).toBeUndefined();
		expect(context.authorGuidFor({ id: 'legacy' })).toBeUndefined();
		expect(context.authorGuidFor({ id: 'unknown', codedBy: 'human:missing' })).toBeUndefined();

		expect(context.getUsers()).toEqual([]);
		expect(warnings).toEqual([
			'QDPX marker unattributed: explicitly unattributed owner — exported without creatingUser',
			'QDPX marker legacy: missing coder owner — exported without creatingUser',
			'QDPX marker unknown: unknown coder human:missing — exported without creatingUser',
		]);
	});

	it('escapes User attributes and omits the section when empty', () => {
		expect(buildUsersXml([])).toBe('');
		expect(buildUsersXml([{
			coderId: 'human:a',
			guid: CARLA_GUID,
			name: 'A & "B"',
		}])).toBe(`<Users>\n<User guid="${CARLA_GUID}" name="A &amp; &quot;B&quot;"/>\n</Users>`);
	});
});
