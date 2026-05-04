#!/usr/bin/env node
// Reverse Fase 0 migration. Two strategies:
//   1. If <data>.pre-fase-0.bak exists → restore from backup
//   2. Else → run reverse transform sourceRowId → row in place
// Usage:
//   node scripts/revert-fase-0-source-row-id.mjs                # vault workbench
//   node scripts/revert-fase-0-source-row-id.mjs <path/to/data.json>

import fs from 'node:fs';
import path from 'node:path';
import { revertData } from './migrationFase0.mjs';

const DEFAULT_PATH = '/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/qualia-coding/data.json';
const dataPath = process.argv[2] ?? DEFAULT_PATH;
const backupPath = dataPath + '.pre-fase-0.bak';

if (!fs.existsSync(dataPath)) {
	console.error(`❌ data.json not found at ${dataPath}`);
	process.exit(1);
}

if (fs.existsSync(backupPath)) {
	fs.copyFileSync(backupPath, dataPath);
	console.log(`✓ Restored data.json from ${path.basename(backupPath)}`);
	process.exit(0);
}

console.log(`No backup at ${path.basename(backupPath)}. Running reverse transform in place.`);
const raw = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(raw);
const { segReverted, rowReverted } = revertData(data);
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log(`✓ Reverted ${segReverted} segment markers, ${rowReverted} row markers.`);
