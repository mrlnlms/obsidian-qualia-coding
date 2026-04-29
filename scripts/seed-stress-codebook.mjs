#!/usr/bin/env node
// Stress test seed pra diagnóstico do bug "código duplicado no codebook".
// Popula registry com 1000 codes incluindo duplicate-name pairs deliberados,
// hierarquia nested, pastas, e groups.
//
// Usage:
//   node scripts/seed-stress-codebook.mjs           (default — com 30 dup pairs)
//   node scripts/seed-stress-codebook.mjs --no-dups (puro stress test sem dups)
//
// Vault: /Users/mosx/Desktop/obsidian-plugins-workbench (workbench root)
// Backup automático em data.json.bak.<timestamp>.

import { writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const VAULT = '/Users/mosx/Desktop/obsidian-plugins-workbench';
const DATA_PATH = `${VAULT}/.obsidian/plugins/obsidian-qualia-coding/data.json`;

const SKIP_DUPS = process.argv.includes('--no-dups');

const ROOTS = 50;
const NESTED = 700;
const IN_FOLDERS = 190;
const DUP_PAIRS = SKIP_DUPS ? 0 : 30;
const FOLDER_COUNT = 5;
const GROUP_COUNT = 5;

const PALETTE = ['#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9'];
const now = Date.now();

let cCounter = 0;
const codeId = () => `c_${(++cCounter).toString(36).padStart(4, '0')}`;
const folderId = (i) => `f_${i.toString(36).padStart(2, '0')}`;
const groupId = (i) => `g_${i.toString(36).padStart(2, '0')}`;

const definitions = {};
const rootOrder = [];

function makeCode(name, opts = {}) {
  const palIdx = Math.floor(Math.random() * PALETTE.length);
  const code = {
    id: codeId(),
    name,
    color: PALETTE[palIdx],
    paletteIndex: palIdx,
    createdAt: now,
    updatedAt: now,
    childrenOrder: [],
    ...opts,
  };
  definitions[code.id] = code;
  return code;
}

// Folders
const folders = {};
const folderOrder = [];
for (let i = 0; i < FOLDER_COUNT; i++) {
  const f = { id: folderId(i), name: `Folder-${i + 1}`, createdAt: now };
  folders[f.id] = f;
  folderOrder.push(f.id);
}

// Groups
const groups = {};
const groupOrder = [];
for (let i = 0; i < GROUP_COUNT; i++) {
  const g = {
    id: groupId(i),
    name: `Group-${i + 1}`,
    color: PALETTE[i % PALETTE.length],
    paletteIndex: i,
    createdAt: now,
  };
  groups[g.id] = g;
  groupOrder.push(g.id);
}

// 1) Root codes
const roots = [];
for (let i = 1; i <= ROOTS; i++) {
  const c = makeCode(`Root-${i.toString().padStart(3, '0')}`);
  roots.push(c);
  rootOrder.push(c.id);
}

// 2) Nested (depth 1, attached to random root)
for (let i = 1; i <= NESTED; i++) {
  const parent = roots[Math.floor(Math.random() * roots.length)];
  const c = makeCode(`Nested-${i.toString().padStart(4, '0')}`, { parentId: parent.id });
  parent.childrenOrder.push(c.id);
}

// 3) Codes em folders (rootOrder push pq não tem parent — folder é só metadata)
for (let i = 1; i <= IN_FOLDERS; i++) {
  const f = folderOrder[i % FOLDER_COUNT];
  const c = makeCode(`Item-${f}-${i.toString().padStart(3, '0')}`, { folder: f });
  rootOrder.push(c.id);
}

// 4) Duplicate pairs (mesma name, ids diferentes — um root + um nested)
const dupNames = [];
for (let i = 0; i < DUP_PAIRS; i++) {
  const name = `Dup-${i.toString().padStart(2, '0')}`;
  dupNames.push(name);

  // 1° code: root
  const c1 = makeCode(name);
  rootOrder.push(c1.id);

  // 2° code: nested debaixo de um root random
  const parent = roots[Math.floor(Math.random() * roots.length)];
  const c2 = makeCode(name, { parentId: parent.id });
  parent.childrenOrder.push(c2.id);
}

// Random group membership em ~30% dos codes
for (const id of Object.keys(definitions)) {
  if (Math.random() < 0.3) {
    const gIds = [];
    for (const g of groupOrder) if (Math.random() < 0.4) gIds.push(g);
    if (gIds.length > 0) definitions[id].groups = gIds;
  }
}

// Magnitude em ~10%
for (const id of Object.keys(definitions)) {
  if (Math.random() < 0.1) {
    definitions[id].magnitude = { type: 'ordinal', values: ['low', 'medium', 'high'] };
  }
}

// Build data.json final
const data = {
  registry: {
    definitions,
    nextPaletteIndex: PALETTE.length,
    folders,
    folderOrder,
    rootOrder,
    groups,
    groupOrder,
    nextGroupPaletteIndex: GROUP_COUNT,
  },
  general: {
    showMagnitudeInPopover: true,
    showRelationsInPopover: true,
    openToggleInNewTab: false,
  },
  markdown: {
    markers: {},
    settings: {
      defaultColor: '#6200EE',
      markerOpacity: 0.4,
      showHandlesOnHover: true,
      handleSize: 12,
      showMenuOnSelection: true,
      showMenuOnRightClick: true,
      showRibbonButton: true,
    },
  },
  csv: {
    segmentMarkers: [], rowMarkers: [],
    settings: { parquetSizeWarningMB: 50, csvSizeWarningMB: 100 },
  },
  image: { markers: [], settings: { autoOpen: false, showButton: true, fileStates: {} } },
  pdf: { markers: [], shapes: [], settings: { autoOpen: false, showButton: true } },
  audio: {
    files: [],
    settings: { autoOpen: false, showButton: true, defaultZoom: 50, regionOpacity: 0.4, showLabelsOnRegions: true, fileStates: {} },
  },
  video: {
    files: [],
    settings: { autoOpen: false, showButton: true, defaultZoom: 50, regionOpacity: 0.4, showLabelsOnRegions: true, videoFit: 'contain', fileStates: {} },
  },
  caseVariables: { values: {}, types: {} },
  visibilityOverrides: {},
  auditLog: [],
};

// Backup if existing
if (existsSync(DATA_PATH)) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bk = `${DATA_PATH}.bak.${ts}`;
  copyFileSync(DATA_PATH, bk);
  console.log(`Backup: ${bk}`);
}

mkdirSync(dirname(DATA_PATH), { recursive: true });
writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

const totalCodes = Object.keys(definitions).length;
console.log(`Wrote: ${DATA_PATH}\n`);
console.log(`Generated:`);
console.log(`  Codes: ${totalCodes}`);
console.log(`    Root (no folder, no parent): ${ROOTS}`);
console.log(`    Nested (depth 1): ${NESTED}`);
console.log(`    In folders: ${IN_FOLDERS}`);
console.log(`    Duplicate pairs: ${DUP_PAIRS} (${DUP_PAIRS * 2} codes)`);
console.log(`  Folders: ${FOLDER_COUNT}`);
console.log(`  Groups: ${GROUP_COUNT}`);

if (DUP_PAIRS > 0) {
  console.log(`\nDuplicate names plantados (mesmo name, ids diferentes):`);
  console.log(`  ${dupNames.join(', ')}`);
  console.log(`\nExpectativa visual no codebook:`);
  console.log(`  Cada nome 'Dup-NN' aparece 2x na árvore (1 root + 1 nested).`);
  console.log(`  Se aparecer >2x → bug de virtual scroll/render (hipótese 1 do BACKLOG).`);
  console.log(`  Se aparecer 0x → registry deduplica algo (improvável).`);
}

console.log(`\nPróximos passos:`);
console.log(`  1. Abrir o vault no Obsidian (workbench root)`);
console.log(`  2. Abrir o codebook panel`);
console.log(`  3. Observar tree com filtros / scroll / expand-collapse`);
console.log(`  4. Reportar quantos 'Dup-NN' aparecem e em qual cenário aparece duplicado`);
