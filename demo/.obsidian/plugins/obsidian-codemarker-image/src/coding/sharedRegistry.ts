/**
 * Shared Registry — reads/writes CodeDefinitions from a vault-level JSON file
 * so that codemarker-v2, codemarker-csv and codemarker-image plugins share the
 * same code definitions and palette index.
 *
 * File location: `.obsidian/codemarker-shared/registry.json`
 */

import type { Vault } from 'obsidian';
import type { CodeDefinition } from './codeDefinitionRegistry';

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
