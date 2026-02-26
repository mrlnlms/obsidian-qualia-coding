/**
 * Shared Registry — reads/writes CodeDefinitions from a vault-level JSON file
 * so that both the markdown (codemarker-v2) and CSV plugins share the same
 * code definitions and palette index.
 *
 * File location: `.obsidian/codemarker-shared/registry.json`
 */

import { Vault } from 'obsidian';
import { CodeDefinition, CodeDefinitionRegistry } from './codeDefinitionRegistry';

const REGISTRY_DIR = '.obsidian/codemarker-shared';
const REGISTRY_FILE = '.obsidian/codemarker-shared/registry.json';

export interface RegistryData {
	definitions: Record<string, CodeDefinition>;
	nextPaletteIndex: number;
}

async function ensureRegistryDir(vault: Vault): Promise<void> {
	if (!(await vault.adapter.exists(REGISTRY_DIR))) {
		await vault.adapter.mkdir(REGISTRY_DIR);
	}
}

export async function loadSharedRegistry(vault: Vault): Promise<RegistryData | null> {
	try {
		if (!(await vault.adapter.exists(REGISTRY_FILE))) return null;
		const raw = await vault.adapter.read(REGISTRY_FILE);
		return JSON.parse(raw) as RegistryData;
	} catch {
		return null;
	}
}

export async function saveSharedRegistry(vault: Vault, data: RegistryData): Promise<void> {
	await ensureRegistryDir(vault);
	await vault.adapter.write(REGISTRY_FILE, JSON.stringify(data, null, '\t'));
}

/**
 * Merge shared registry data into a local CodeDefinitionRegistry.
 * - Definitions in shared but missing locally are imported.
 * - Definitions in both: the one with the later `updatedAt` wins.
 * - `nextPaletteIndex` takes the max of both.
 */
export function mergeRegistries(local: CodeDefinitionRegistry, shared: RegistryData): void {
	for (const id in shared.definitions) {
		const sharedDef = shared.definitions[id];
		if (!sharedDef) continue;

		const localByName = local.getByName(sharedDef.name);

		if (!localByName) {
			local.importDefinition(sharedDef);
		} else if (sharedDef.updatedAt > localByName.updatedAt) {
			local.update(localByName.id, {
				color: sharedDef.color,
				description: sharedDef.description,
			});
		}
	}

	// Sync palette index
	const sharedIdx = shared.nextPaletteIndex ?? 0;
	local.syncPaletteIndex(sharedIdx);
}
