import { describe, expect, it } from 'vitest';
import {
	canEditOwnedMarker,
	resolveParticipationMode,
} from '../../../src/core/icr/codingPermissions';

describe('coding participation permissions', () => {
	it('preserves legacy active behavior while supporting explicit read-only', () => {
		expect(resolveParticipationMode(undefined)).toBe('active');
		expect(resolveParticipationMode('read-only')).toBe('read-only');
	});

	it('allows only the active owner to edit', () => {
		expect(canEditOwnedMarker('read-only', 'human:carla', 'human:carla')).toBe(false);
		expect(canEditOwnedMarker('active', 'human:carla', 'human:carla')).toBe(true);
		expect(canEditOwnedMarker('active', 'human:carla', 'human:joao')).toBe(false);
		expect(canEditOwnedMarker('active', 'human:default', undefined)).toBe(true);
});
});
