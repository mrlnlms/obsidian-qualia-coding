#!/usr/bin/env node
// Seed pra smoke test do Codebook Timeline mode (Analytics).
// Reusa o seed do audit log #29 — single source of truth.
//
// Usage: node scripts/seed-codebook-timeline-demo.mjs
//
// Pra limpar: bulk delete em "Demo · *" no codebook.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const target = path.join(__dirname, 'seed-audit-log-demo.mjs');

const result = spawnSync('node', [target], { stdio: 'inherit' });
process.exit(result.status ?? 0);
