#!/usr/bin/env node
/**
 * Reset a QDPX import from the workbench vault.
 *
 * Default behavior:
 * - backs up the plugin data.json with a timestamped suffix
 * - backs up the generated imports/<project> folder with a timestamped suffix
 * - leaves the source fixture folder untouched
 *
 * This is meant to make "from zero" import tests reproducible without touching
 * the plugin source directory itself.
 *
 * Usage:
 *   node scripts/reset-qdpx-import-state.mjs
 *   node scripts/reset-qdpx-import-state.mjs --project "UnifiedDevOps Selective Coding ITE5 ICA"
 *   node scripts/reset-qdpx-import-state.mjs --vault /path/to/vault --dry-run
 *   node scripts/reset-qdpx-import-state.mjs --keep-data
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const DEFAULT_VAULT = path.resolve(repoRoot, '..', '..', '..');
const DEFAULT_PROJECT = 'UnifiedDevOps Selective Coding ITE5 ICA';
const PLUGIN_ID = 'obsidian-qualia-coding';

function parseArgs(argv) {
	const args = {
		vault: DEFAULT_VAULT,
		project: DEFAULT_PROJECT,
		dryRun: false,
		keepData: false,
		keepImports: false,
		listProjects: false,
		help: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--vault') {
			if (!argv[i + 1]) throw new Error('--vault requires a path');
			args.vault = argv[++i];
		} else if (arg === '--project') {
			if (!argv[i + 1]) throw new Error('--project requires a folder name');
			args.project = argv[++i];
		} else if (arg === '--dry-run') {
			args.dryRun = true;
		} else if (arg === '--keep-data') {
			args.keepData = true;
		} else if (arg === '--keep-imports') {
			args.keepImports = true;
		} else if (arg === '--list-projects') {
			args.listProjects = true;
		} else if (arg === '--help' || arg === '-h') {
			args.help = true;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return args;
}

function tsStamp() {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

function uniqueBackupPath(src, stamp) {
	let candidate = `${src}.bak.${stamp}`;
	let suffix = 2;
	while (fs.existsSync(candidate)) {
		candidate = `${src}.bak.${stamp}.${suffix}`;
		suffix++;
	}
	return candidate;
}

function movePath(src, dest, dryRun) {
	if (!fs.existsSync(src)) return false;
	if (dryRun) {
		console.log(`[dry-run] move ${src} -> ${dest}`);
		return true;
	}
	fs.renameSync(src, dest);
	console.log(`moved ${src} -> ${dest}`);
	return true;
}

function removePath(src, dryRun) {
	if (!fs.existsSync(src)) return false;
	if (dryRun) {
		console.log(`[dry-run] remove ${src}`);
		return true;
	}
	fs.rmSync(src, { recursive: true, force: true });
	console.log(`removed ${src}`);
	return true;
}

function printHelp() {
	console.log(`Usage: node scripts/reset-qdpx-import-state.mjs [options]

Options:
  --vault <path>      Vault root (default: ${DEFAULT_VAULT})
  --project <name>    Imported folder name under imports/ (default: ${DEFAULT_PROJECT})
  --dry-run          Show what would change
  --keep-data        Keep plugin data.json in place
  --keep-imports     Keep imports/<project> in place
  --list-projects    List folders under imports/ and exit
  --help, -h         Show this help

Default actions:
  - backs up data.json to data.json.bak.<timestamp> and removes the live file
  - backs up imports/<project> to imports/<project>.bak.<timestamp> and removes the live folder
`);
}

try {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.help) {
		printHelp();
		process.exit(0);
	}

	const vaultRoot = path.resolve(opts.vault);
	const pluginDataPath = path.join(vaultRoot, '.obsidian', 'plugins', PLUGIN_ID, 'data.json');
	const importsDir = path.join(vaultRoot, 'imports');
	const projectDir = path.join(importsDir, opts.project);
	const stamp = tsStamp();

	console.log(`Vault: ${vaultRoot}`);
	console.log(`Plugin data: ${pluginDataPath}`);
	console.log(`Imported folder: ${projectDir}`);

	if (opts.listProjects) {
		if (!fs.existsSync(importsDir)) {
			console.log(`imports folder not found: ${importsDir}`);
			process.exit(0);
		}
		const entries = fs.readdirSync(importsDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort((a, b) => a.localeCompare(b));
		if (entries.length === 0) {
			console.log('no imported project folders found');
		} else {
			for (const entry of entries) console.log(entry);
		}
		process.exit(0);
	}

	if (!opts.keepData) {
		if (fs.existsSync(pluginDataPath)) {
			const backup = uniqueBackupPath(pluginDataPath, stamp);
			movePath(pluginDataPath, backup, opts.dryRun);
		} else {
			console.log(`data.json not found: ${pluginDataPath}`);
		}
	} else {
		console.log('keeping data.json');
	}

	if (!opts.keepImports) {
		if (fs.existsSync(projectDir)) {
			const backup = uniqueBackupPath(projectDir, stamp);
			movePath(projectDir, backup, opts.dryRun);
		} else {
			console.log(`import folder not found: ${projectDir}`);
		}
	} else {
		console.log('keeping imports folder');
	}

	if (!opts.dryRun) {
		// If imports/ became empty, leave it as-is; Obsidian/scripts recreate on demand.
		const importsExists = fs.existsSync(importsDir);
		if (importsExists && fs.readdirSync(importsDir).length === 0) {
			removePath(importsDir, false);
		}
	}
} catch (err) {
	console.error((err && err.message) ? err.message : String(err));
	process.exit(1);
}
