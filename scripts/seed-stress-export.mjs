#!/usr/bin/env node
// Stress test seed pro item BACKLOG "Export Parquet enriquecido — pipeline pra parquets muito grandes".
// Gera CodeDefinitions + RowMarkers synthetic no data.json do vault workbench, alvo do parquet
// MERGED 2.376M rows × 21 cols. Idempotente: limpa entries `synth_*` antes de gerar.
//
// Cenários (ver docs/BACKLOG.md §"Export Parquet enriquecido"):
//   baseline      — 100k markers, 50 codes, 30% comments ~30 char, 9 vcols (3 cols × 3 types)
//   long-comments — 100k markers, 20 codes, 50% comments 200-500 char, 9 vcols (3 cols × 3 types)
//   many-codes    — 50k markers (cada com 3-5 codes), 500 codes, 0 comments, 15 vcols (5 cols × 3 types)
//   pathological  — 200k markers, 200 codes, 80% comments 1k-2k char, 15 vcols (5 cols × 3 types)
//
// Usage:
//   node scripts/seed-stress-export.mjs --scenario=baseline
//   node scripts/seed-stress-export.mjs --clean         (só remove synth_*, não gera)
//
// Pre-req: Obsidian fechado pro vault workbench (senão plugin sobrescreve no próximo save).

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const VAULT = '/Users/mosx/Desktop/obsidian-plugins-workbench';
const DATA_PATH = `${VAULT}/.obsidian/plugins/obsidian-qualia-coding/data.json`;
const TARGET_FILE_ID = 'safe-mode-test/Distribution_history_MERGED_2024-12-09_2025-11-27.parquet';
const PARQUET_ROWS = 2_376_205;

// Fonte: head -1 do CSV consolidated_enriched + parquet meta (idênticos)
const ALL_COLS = [
  'Distribution Id', 'Distribution Sent Date', 'Directory Id', 'Response Id',
  'Last Name', 'First Name', 'Contact Id', 'Lookup Id', 'Transaction Id',
  'External Data Reference', 'Email Address', 'Channel', 'Message Type',
  'Status', 'Bounce Reason', 'Sent to', 'Contact Frequency Rule Id',
  'Exceeded Contact Frequency', 'End Date', 'Link', 'Link Expiration',
];

const PALETTE = ['#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9'];

// --- CLI ---
const args = process.argv.slice(2);
const scenarioArg = args.find(a => a.startsWith('--scenario='));
const nOverrideArg = args.find(a => a.startsWith('--n='));
const codesOverrideArg = args.find(a => a.startsWith('--codes='));
const clean = args.includes('--clean');
const scenario = scenarioArg?.split('=')[1];
const nOverride = nOverrideArg ? parseInt(nOverrideArg.split('=')[1], 10) : null;
const codesOverride = codesOverrideArg ? parseInt(codesOverrideArg.split('=')[1], 10) : null;

if (!clean && !scenario) {
  console.error('Uso:');
  console.error('  --scenario=baseline|long-comments|many-codes|pathological|between-1|between-2');
  console.error('  --n=N              (override numMarkers — útil pra smoke test)');
  console.error('  --codes=N          (override numCodes)');
  console.error('  --clean            (só remove synth_*, não gera)');
  process.exit(1);
}

// --- Cenários ---
const CENARIOS = {
  baseline: {
    label: 'Baseline real (100k markers, 50 codes, 30% comments curtos)',
    numMarkers: 100_000,
    numCodes: 50,
    targetCols: ['Email Address', 'Status', 'Bounce Reason'],
    vcolTypes: ['cod-frow', 'cod-seg', 'comment'],
    codesPerMarker: { min: 0, max: 2 },
    commentProb: 0.30,
    commentLen: { min: 10, max: 50 },
  },
  'long-comments': {
    label: 'Comments longos (100k markers, 20 codes, 50% comments 200-500 char)',
    numMarkers: 100_000,
    numCodes: 20,
    targetCols: ['Email Address', 'Status', 'Bounce Reason'],
    vcolTypes: ['cod-frow', 'cod-seg', 'comment'],
    codesPerMarker: { min: 0, max: 1 },
    commentProb: 0.50,
    commentLen: { min: 200, max: 500 },
  },
  'many-codes': {
    label: 'Many distinct codes (50k markers, 500 codes, 3-5 codes/marker, 0 comments, 15 vcols)',
    numMarkers: 50_000,
    numCodes: 500,
    targetCols: ['Distribution Id', 'Email Address', 'Status', 'Bounce Reason', 'Channel'],
    vcolTypes: ['cod-frow', 'cod-seg', 'comment'],
    codesPerMarker: { min: 3, max: 5 },
    commentProb: 0,
    commentLen: { min: 0, max: 0 },
  },
  pathological: {
    label: 'Pathological (200k markers, 200 codes, 80% comments 1k-2k char, 15 vcols)',
    numMarkers: 200_000,
    numCodes: 200,
    targetCols: ['Distribution Id', 'Email Address', 'Status', 'Bounce Reason', 'Channel'],
    vcolTypes: ['cod-frow', 'cod-seg', 'comment'],
    codesPerMarker: { min: 1, max: 3 },
    commentProb: 0.80,
    commentLen: { min: 1_000, max: 2_000 },
  },
  // Cenários intermediários pra mapear o teto entre C3 (passou single) e
  // C4 (single OOM, multi passa) — preencher gap empírico na M1 8GB.
  'between-1': {
    label: 'Between-1 (150k markers, 100 codes, 50% comments 500-1000 char, 12 vcols)',
    numMarkers: 150_000,
    numCodes: 100,
    targetCols: ['Distribution Id', 'Email Address', 'Status', 'Bounce Reason'],
    vcolTypes: ['cod-frow', 'cod-seg', 'comment'],
    codesPerMarker: { min: 1, max: 2 },
    commentProb: 0.50,
    commentLen: { min: 500, max: 1_000 },
  },
  'between-2': {
    label: 'Between-2 (175k markers, 150 codes, 70% comments 800-1500 char, 15 vcols)',
    numMarkers: 175_000,
    numCodes: 150,
    targetCols: ['Distribution Id', 'Email Address', 'Status', 'Bounce Reason', 'Channel'],
    vcolTypes: ['cod-frow', 'cod-seg', 'comment'],
    codesPerMarker: { min: 1, max: 2 },
    commentProb: 0.70,
    commentLen: { min: 800, max: 1_500 },
  },
};

// --- Seeded RNG (mulberry32) pra reprodutibilidade ---
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// --- Helpers ---
const now = Date.now();

function pickFrom(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

const LOREM_WORDS = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna ' +
  'aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis ' +
  'aute irure reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat ' +
  'non proident sunt culpa qui officia deserunt mollit anim id est laborum').split(' ');

function randText(rng, len) {
  if (len <= 0) return '';
  let out = '';
  while (out.length < len) {
    const w = LOREM_WORDS[Math.floor(rng() * LOREM_WORDS.length)];
    out += (out ? ' ' : '') + w;
  }
  return out.slice(0, len);
}

// --- Load data.json ---
console.log(`📁 Loading ${DATA_PATH}`);
const raw = readFileSync(DATA_PATH, 'utf8');
const data = JSON.parse(raw);

// --- Backup ---
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${DATA_PATH}.bak.${stamp}`;
copyFileSync(DATA_PATH, backupPath);
console.log(`💾 Backup → ${backupPath}`);

// --- Wipe synth_* entries ---
const SYNTH_PREFIX = 'synth_';

let removedDefs = 0;
for (const id of Object.keys(data.registry.definitions)) {
  if (id.startsWith(SYNTH_PREFIX)) {
    delete data.registry.definitions[id];
    removedDefs++;
  }
}
data.registry.rootOrder = (data.registry.rootOrder || []).filter(id => !id.startsWith(SYNTH_PREFIX));

const beforeRow = data.csv.rowMarkers.length;
const beforeSeg = data.csv.segmentMarkers.length;
data.csv.rowMarkers = data.csv.rowMarkers.filter(m => !m.id.startsWith(SYNTH_PREFIX));
data.csv.segmentMarkers = data.csv.segmentMarkers.filter(m => !m.id.startsWith(SYNTH_PREFIX));
const removedRow = beforeRow - data.csv.rowMarkers.length;
const removedSeg = beforeSeg - data.csv.segmentMarkers.length;

// fileMeta synth: clear vcols pro target file (sempre re-setamos)
const oldVcols = data.csv.fileMeta?.[TARGET_FILE_ID]?.enabledVirtualColumns ?? [];

console.log(`🧹 Removed: ${removedDefs} defs, ${removedRow} rowMarkers, ${removedSeg} segmentMarkers, vcols=[${oldVcols.join(',')}]`);

if (clean) {
  if (!data.csv.fileMeta) data.csv.fileMeta = {};
  if (data.csv.fileMeta[TARGET_FILE_ID]) {
    data.csv.fileMeta[TARGET_FILE_ID].enabledVirtualColumns = [];
  }
  writeFileSync(DATA_PATH + '.tmp', JSON.stringify(data, null, 2));
  copyFileSync(DATA_PATH + '.tmp', DATA_PATH);
  console.log(`✅ Clean done. Restart Obsidian.`);
  process.exit(0);
}

// --- Generate cenário ---
const baseCfg = CENARIOS[scenario];
if (!baseCfg) {
  console.error(`Cenário inválido: ${scenario}. Disponíveis: ${Object.keys(CENARIOS).join(', ')}`);
  process.exit(1);
}

const cfg = { ...baseCfg };
if (nOverride !== null) cfg.numMarkers = nOverride;
if (codesOverride !== null) cfg.numCodes = codesOverride;

console.log(`\n🎯 Cenário: ${cfg.label}`);
if (nOverride !== null || codesOverride !== null) {
  console.log(`   ⚠️  Overrides: numMarkers=${cfg.numMarkers}, numCodes=${cfg.numCodes}`);
}

const rng = mulberry32(42);

// 1. Codes
const codeIds = [];
const startPaletteIdx = data.registry.nextPaletteIndex || 0;
for (let i = 0; i < cfg.numCodes; i++) {
  const id = `${SYNTH_PREFIX}c_${i.toString(36).padStart(4, '0')}`;
  const palIdx = (startPaletteIdx + i) % PALETTE.length;
  data.registry.definitions[id] = {
    id,
    name: `synth-code-${i + 1}`,
    color: PALETTE[palIdx],
    paletteIndex: palIdx,
    createdAt: now,
    updatedAt: now,
    childrenOrder: [],
  };
  data.registry.rootOrder.push(id);
  codeIds.push(id);
}
data.registry.nextPaletteIndex = startPaletteIdx + cfg.numCodes;

// 2. Markers
const newMarkers = [];
let codedCount = 0, commentedCount = 0;
for (let i = 0; i < cfg.numMarkers; i++) {
  const id = `${SYNTH_PREFIX}m_${i.toString(36).padStart(7, '0')}`;
  const sourceRowId = randInt(rng, 0, PARQUET_ROWS - 1);
  const column = pickFrom(rng, cfg.targetCols);

  // Codes
  const numCodes = randInt(rng, cfg.codesPerMarker.min, cfg.codesPerMarker.max);
  const codes = [];
  const usedIdxs = new Set();
  for (let j = 0; j < numCodes; j++) {
    let idx;
    do { idx = randInt(rng, 0, codeIds.length - 1); } while (usedIdxs.has(idx));
    usedIdxs.add(idx);
    codes.push({ codeId: codeIds[idx] });
  }
  if (codes.length > 0) codedCount++;

  // Comment
  let comment;
  if (rng() < cfg.commentProb) {
    const len = randInt(rng, cfg.commentLen.min, cfg.commentLen.max);
    comment = randText(rng, len);
    commentedCount++;
  }

  const marker = {
    markerType: 'csv',
    id,
    fileId: TARGET_FILE_ID,
    sourceRowId,
    column,
    codes,
    createdAt: now,
    updatedAt: now,
  };
  if (comment) marker.comment = comment;
  newMarkers.push(marker);
}

for (const m of newMarkers) data.csv.rowMarkers.push(m);

// 3. Set enabledVirtualColumns
const vcols = [];
for (const col of cfg.targetCols) {
  for (const suffix of cfg.vcolTypes) {
    vcols.push(`${col}_${suffix}`);
  }
}
if (!data.csv.fileMeta) data.csv.fileMeta = {};
if (!data.csv.fileMeta[TARGET_FILE_ID]) data.csv.fileMeta[TARGET_FILE_ID] = {};
data.csv.fileMeta[TARGET_FILE_ID].enabledVirtualColumns = vcols;

// --- Atomic write ---
console.log('\n📝 Writing data.json (atomic)...');
const t0 = Date.now();
const serialized = JSON.stringify(data, null, 2);
writeFileSync(DATA_PATH + '.tmp', serialized);
copyFileSync(DATA_PATH + '.tmp', DATA_PATH);
const t1 = Date.now();

// --- Summary ---
const sizeBytes = Buffer.byteLength(serialized, 'utf8');
const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
const totalCommentBytes = newMarkers.reduce((acc, m) => acc + (m.comment?.length ?? 0), 0);
const totalCommentMB = (totalCommentBytes / 1024 / 1024).toFixed(2);

console.log(`\n✅ Done in ${t1 - t0}ms`);
console.log(`   data.json size: ${sizeMB} MB`);
console.log(`   markers added: ${newMarkers.length} (${codedCount} with codes, ${commentedCount} with comments)`);
console.log(`   comment text total: ${totalCommentMB} MB`);
console.log(`   codes added: ${codeIds.length}`);
console.log(`   vcols enabled (${vcols.length}):`);
for (const v of vcols) console.log(`     - ${v}`);
console.log(`\n📋 Next steps:`);
console.log(`   1. (Re)open Obsidian no vault workbench`);
console.log(`   2. Abrir o arquivo: ${TARGET_FILE_ID}`);
console.log(`   3. Aguardar OPFS streaming + grid montar`);
console.log(`   4. Command palette: "Export active parquet with codes (enriched parquet)"`);
console.log(`   5. Capturar: tempo total, output file size, peak memory (Activity Monitor), erro DuckDB OOM`);
