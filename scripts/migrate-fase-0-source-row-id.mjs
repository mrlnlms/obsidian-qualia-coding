#!/usr/bin/env node
// Fase 0 one-shot migration: csv.segmentMarkers/rowMarkers `row` → `sourceRowId`.
// Backup automático em data.json.pre-fase-0.bak antes de gravar.
// Idempotente: rodar 2x não faz nada na 2ª.
// Usage:
//   node scripts/migrate-fase-0-source-row-id.mjs                  # vault workbench
//   node scripts/migrate-fase-0-source-row-id.mjs <path/to/data.json>

import fs from 'node:fs';
import path from 'node:path';
import { migrateData, isAlreadyMigrated } from './migrationFase0.mjs';

const DEFAULT_PATH = '/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/qualia-coding/data.json';
const dataPath = process.argv[2] ?? DEFAULT_PATH;
const backupPath = dataPath + '.pre-fase-0.bak';

if (!fs.existsSync(dataPath)) {
	console.error(`❌ data.json not found at ${dataPath}`);
	process.exit(1);
}

const raw = fs.readFileSync(dataPath, 'utf8');
let data;
try {
	data = JSON.parse(raw);
} catch (err) {
	console.error(`❌ Failed to parse JSON at ${dataPath}: ${err.message}`);
	process.exit(1);
}

if (isAlreadyMigrated(data)) {
	console.log(`✓ Already migrated (no markers with \`row\` field). No changes made.`);
	process.exit(0);
}

if (!fs.existsSync(backupPath)) {
	fs.copyFileSync(dataPath, backupPath);
	console.log(`✓ Backup: ${path.basename(backupPath)}`);
} else {
	console.log(`✓ Backup already exists: ${path.basename(backupPath)} (not overwriting)`);
}

const { segMigrated, rowMigrated } = migrateData(data);

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

console.log(`✓ Migrated ${segMigrated} segment markers, ${rowMigrated} row markers.`);
console.log(`  data.json updated at ${dataPath}`);
