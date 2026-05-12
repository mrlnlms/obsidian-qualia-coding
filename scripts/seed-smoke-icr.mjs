#!/usr/bin/env node
/**
 * Seed Smoke ICR — cenário fechado pra testar A1+A2+B1+B2+B3 num push só.
 *
 * Roda: `node scripts/seed-smoke-icr.mjs`
 *
 * Pré-requisito: Obsidian FECHADO (senão plugin sobrescreve data.json).
 *
 * O que faz:
 * 1. Cria pasta `smoke-icr-fixes/` na raiz do vault com F1.md, F2.md, F3.md, F4.md + README.md
 * 2. Zera data.json do plugin preservando settings `general` + reescreve com:
 *    - 3 coders: human:default + human:carla + human:joana (activeCoderId = default)
 *    - 5 codes (Tema A..E)
 *    - Markers markdown distribuídos com agreement, divergence e existence controlados
 *    - 1 Saved Comparison "Smoke ICR — A1-B3" pré-pronta
 * 3. Gera 2 contribuições em `icr-exports/`: smoke-carla.json + smoke-joana.json
 *    (pra importar na ICR Import View e testar A1/A2)
 *
 * Cenário esperado documentado em smoke-icr-fixes/README.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const VAULT = '/Users/mosx/Desktop/obsidian-plugins-workbench';
const DATA_JSON = path.join(VAULT, '.obsidian/plugins/obsidian-qualia-coding/data.json');
const SMOKE_DIR = path.join(VAULT, 'smoke-icr-fixes');
const EXPORTS_DIR = path.join(VAULT, 'icr-exports');

const NOW = Date.parse('2026-05-12T15:00:00Z');

// ─── Coders ──────────────────────────────────────────────────
const CODERS = [
	{ id: 'human:default', name: 'Default', type: 'human', createdAt: NOW },
	{ id: 'human:carla',   name: 'Carla',   type: 'human', createdAt: NOW },
	{ id: 'human:joana',   name: 'Joana',   type: 'human', createdAt: NOW },
];

// ─── Codes (5 com cores distintas) ───────────────────────────
const CODES = [
	{ id: 'c_temaA', name: 'Tema A', color: '#ff6b6b', paletteIndex: 0 },
	{ id: 'c_temaB', name: 'Tema B', color: '#4ecdc4', paletteIndex: 1 },
	{ id: 'c_temaC', name: 'Tema C', color: '#ffd93d', paletteIndex: 2 },
	{ id: 'c_temaD', name: 'Tema D', color: '#6c5ce7', paletteIndex: 3 },
	{ id: 'c_temaE', name: 'Tema E', color: '#a8e6cf', paletteIndex: 4 },
];

// ─── Conteúdo dos arquivos ───────────────────────────────────
// Linhas pares = trecho codificavel; linhas ímpares = blank. Comprimentos controlados.
const FILES = {
	'smoke-icr-fixes/F1.md': [
		'Primeiro trecho de F1 que pode ser codificado.',  // line 0, 47 chars
		'',
		'Segundo trecho do arquivo F1 aqui.',              // line 2, 34 chars
		'',
		'Terceiro pedaco que so a Carla marca.',           // line 4, 37 chars
	].join('\n') + '\n',
	'smoke-icr-fixes/F2.md': [
		'Frase A do primeiro contexto de F2.',             // line 0, 35 chars
		'',
		'Frase B em outro contexto de F2.',                // line 2, 32 chars
		'',
		'Frase C iniciando bloco que so a Joana marca.',   // line 4, 45 chars
		'',
		'Frase D do quarto bloco que so o default marca.', // line 6, 47 chars
		'',
		'Frase E ultima do arquivo que so a Carla marca.', // line 8, 47 chars
	].join('\n') + '\n',
	'smoke-icr-fixes/F3.md': [
		'Primeira linha do arquivo F3.',                   // line 0, 30 chars
		'',
		'Segunda parte do arquivo F3.',                    // line 2, 28 chars
	].join('\n') + '\n',
	'smoke-icr-fixes/F4.md': [
		'F4 marcado so pela Carla aqui.',                  // line 0, 30 chars
		'',
		'Outra linha de F4 marcada so pela Carla.',        // line 2, 40 chars
	].join('\n') + '\n',
};

// ─── Markers (distribuídos pra cobrir todos os smoke cases) ──
// Helper pra criar marker
const mkMarker = (idSuffix, fileId, line, ch_to, codeId, codedBy, text) => ({
	markerType: 'markdown',
	id: `m_${idSuffix}`,
	fileId,
	range: { from: { line, ch: 0 }, to: { line, ch: ch_to } },
	color: CODES.find(c => c.id === codeId).color,
	codes: [{ codeId }],
	codedBy,
	createdAt: NOW,
	updatedAt: NOW,
	text,
});

const MARKERS_BY_FILE = {
	'smoke-icr-fixes/F1.md': [
		// agree em line 0: ambos code-A
		mkMarker('f1_d_a', 'smoke-icr-fixes/F1.md', 0, 47, 'c_temaA', 'human:default', 'Primeiro trecho de F1 que pode ser codificado.'),
		mkMarker('f1_c_a', 'smoke-icr-fixes/F1.md', 0, 47, 'c_temaA', 'human:carla',   'Primeiro trecho de F1 que pode ser codificado.'),
		// divergence code em line 2: default=B, carla=C
		mkMarker('f1_d_b', 'smoke-icr-fixes/F1.md', 2, 34, 'c_temaB', 'human:default', 'Segundo trecho do arquivo F1 aqui.'),
		mkMarker('f1_c_c', 'smoke-icr-fixes/F1.md', 2, 34, 'c_temaC', 'human:carla',   'Segundo trecho do arquivo F1 aqui.'),
		// existence em line 4: só carla
		mkMarker('f1_c_a2', 'smoke-icr-fixes/F1.md', 4, 37, 'c_temaA', 'human:carla',  'Terceiro pedaco que so a Carla marca.'),
	],
	'smoke-icr-fixes/F2.md': [
		// agree 3-way em line 0: todos code-A
		mkMarker('f2_d_a', 'smoke-icr-fixes/F2.md', 0, 35, 'c_temaA', 'human:default', 'Frase A do primeiro contexto de F2.'),
		mkMarker('f2_c_a', 'smoke-icr-fixes/F2.md', 0, 35, 'c_temaA', 'human:carla',   'Frase A do primeiro contexto de F2.'),
		mkMarker('f2_j_a', 'smoke-icr-fixes/F2.md', 0, 35, 'c_temaA', 'human:joana',   'Frase A do primeiro contexto de F2.'),
		// divergence em line 2: default=B, joana=B (agree), carla=D (diverge dos 2)
		mkMarker('f2_d_b', 'smoke-icr-fixes/F2.md', 2, 32, 'c_temaB', 'human:default', 'Frase B em outro contexto de F2.'),
		mkMarker('f2_c_d', 'smoke-icr-fixes/F2.md', 2, 32, 'c_temaD', 'human:carla',   'Frase B em outro contexto de F2.'),
		mkMarker('f2_j_b', 'smoke-icr-fixes/F2.md', 2, 32, 'c_temaB', 'human:joana',   'Frase B em outro contexto de F2.'),
		// existence em line 4: só joana code-E
		mkMarker('f2_j_e', 'smoke-icr-fixes/F2.md', 4, 45, 'c_temaE', 'human:joana',   'Frase C iniciando bloco que so a Joana marca.'),
		// existence em line 6: só default code-A (segundo marker code-A do default — pra A2 diferenciar)
		mkMarker('f2_d_a2', 'smoke-icr-fixes/F2.md', 6, 47, 'c_temaA', 'human:default', 'Frase D do quarto bloco que so o default marca.'),
		// existence em line 8: só carla code-A (segundo marker code-A da carla — pra A2 diferenciar)
		mkMarker('f2_c_a2', 'smoke-icr-fixes/F2.md', 8, 47, 'c_temaA', 'human:carla',   'Frase E ultima do arquivo que so a Carla marca.'),
	],
	'smoke-icr-fixes/F3.md': [
		// agree em line 0: ambos code-C
		mkMarker('f3_d_c', 'smoke-icr-fixes/F3.md', 0, 30, 'c_temaC', 'human:default', 'Primeira linha do arquivo F3.'),
		mkMarker('f3_j_c', 'smoke-icr-fixes/F3.md', 0, 30, 'c_temaC', 'human:joana',   'Primeira linha do arquivo F3.'),
		// divergence em line 2: default=E, joana=D
		mkMarker('f3_d_e', 'smoke-icr-fixes/F3.md', 2, 28, 'c_temaE', 'human:default', 'Segunda parte do arquivo F3.'),
		mkMarker('f3_j_d', 'smoke-icr-fixes/F3.md', 2, 28, 'c_temaD', 'human:joana',   'Segunda parte do arquivo F3.'),
	],
	'smoke-icr-fixes/F4.md': [
		// só carla — file inteiro existence
		mkMarker('f4_c_a', 'smoke-icr-fixes/F4.md', 0, 30, 'c_temaA', 'human:carla', 'F4 marcado so pela Carla aqui.'),
		mkMarker('f4_c_b', 'smoke-icr-fixes/F4.md', 2, 40, 'c_temaB', 'human:carla', 'Outra linha de F4 marcada so pela Carla.'),
	],
};

// ─── 1. Pasta + arquivos markdown ────────────────────────────
if (!fs.existsSync(SMOKE_DIR)) fs.mkdirSync(SMOKE_DIR, { recursive: true });
for (const [relPath, content] of Object.entries(FILES)) {
	fs.writeFileSync(path.join(VAULT, relPath), content, 'utf-8');
}

// ─── 2. README.md descrevendo cenário esperado ───────────────
const README = `# Smoke ICR — A1+A2+B1+B2+B3

Cenário gerado por \`scripts/seed-smoke-icr.mjs\` pra testar 5 fixes ICR num push.

## Coders
- **Default** (você, \`human:default\`) — coder ativo
- **Carla** (\`human:carla\`)
- **Joana** (\`human:joana\`)

## Codes
Tema A · Tema B · Tema C · Tema D · Tema E

## Mapa de markers

| File | Linha | Default | Carla | Joana | Tipo |
|------|-------|---------|-------|-------|------|
| F1   | 0     | A       | A     | —     | agree (default↔carla) |
| F1   | 2     | B       | C     | —     | divergence code (default↔carla) |
| F1   | 4     | —       | A     | —     | existence (só carla) |
| F2   | 0     | A       | A     | A     | agree 3-way |
| F2   | 2     | B       | D     | B     | carla diverge dos 2 |
| F2   | 4     | —       | —     | E     | existence (só joana) |
| F2   | 6     | A       | —     | —     | existence (só default) |
| F2   | 8     | —       | A     | —     | existence (só carla) |
| F3   | 0     | C       | —     | C     | agree (default↔joana) |
| F3   | 2     | E       | —     | D     | divergence code (default↔joana) |
| F4   | 0     | —       | A     | —     | existence (só carla) |
| F4   | 2     | —       | B     | —     | existence (só carla) |

## Comportamento esperado por fix

### A1 — Lado a lado (ICR Import View)
Importa \`icr-exports/smoke-carla.json\`. Chip "Lado a lado". Pra cada marker da Carla:

| Marker | Local (você) deve mostrar |
|--------|---------------------------|
| F1 line 0 code-A | chip **Tema A** (agree) |
| F1 line 2 code-C | chip **Tema B** (default=B na mesma região) |
| F1 line 4 code-A | "— sem marker —" |
| F2 line 0 code-A | chip **Tema A** (agree) |
| F2 line 2 code-D | chip **Tema B** (default=B) |
| F2 line 8 code-A | "— sem marker —" |
| F4 line 0 code-A | "— sem marker —" |
| F4 line 2 code-B | "— sem marker —" |

**Antes do fix A1:** TODOS markdown markers mostravam "— sem marker —" (modo degraded). Agora 3 dos 8 acima mostram chips.

### A2 — Por código (ICR Import View)
Chip "Por código" da contribuição da Carla. Linha por code:

| Code | Carla aplicou | Você | overlap (real) | min antigo |
|------|---------------|------|----------------|------------|
| A    | 4× (F1.0, F2.0, F2.8, F4.0) | 3× (F1.0, F2.0, F2.6) | **2** | 3 |
| B    | 1× (F4.2) | 2× (F1.2, F2.2) | **0** | 1 |
| C    | 1× (F1.2) | 1× (F3.0) | **0** | 1 |
| D    | 1× (F2.2) | 0× | **0** | 0 |

**Antes do fix A2:** overlap = \`min(local, carla)\`. Agora reflete count real (count de markers da carla cujo codeId tem ao menos 1 local sobrepondo espacialmente).

### B1 — Drill-down Cards/Workflow filtra por seleção
Compare Coders → matriz Mode A. Click em par **default↔carla** (off-diagonal). Drill-down Cards.

**Esperado:** banner cinza com borda azul \`filtrado pela seleção da overview: par Default ↔ Carla (N/M) · limpar\`. Lista de regiões inclui só regiões onde AMBOS coders aparecem (F1 line 2 divergence, F1 line 4 existence se entrar, F2 line 2, F2 line 8 etc).

Click "limpar" → banner some + lista volta a todas as regiões (todos pares).

Mesmo banner aparece em drill-down Workflow.

### B2 — Spatial responde a cliques diferentes
Compare Coders → matriz Mode A → drill-down Spatial.

| Click par | Files listados (intersection) |
|-----------|-------------------------------|
| Default ↔ Carla | F1, F2 (F3 sem carla, F4 sem default) |
| Default ↔ Joana | F2, F3 (F1 sem joana, F4 sem default) |
| Carla ↔ Joana   | F2 (único com ambos) |

Header acima das lanes: "par selecionado: <NomeA> ↔ <NomeB> (files onde AMBOS marcaram)".

**Antes do fix B2:** todos pares mostravam quase os mesmos files (union, não intersection).

### B3 — Toggle "par único" disabled sem cell selecionada
Compare Coders, **sem clicar em célula nenhuma da matriz**. Click botão "↗ ver lado a lado" no toolbar.

Modal abre com chip "par único" **esmaecido + tooltip** "Selecione um par na matriz Mode A primeiro pra ativar este modo". Click no chip não faz nada.

Selecione um par na matriz primeiro → reabre modal → "par único" ativo normalmente.

## Saved Comparison

Pré-criada: **"Smoke ICR — A1-B3"** (scope = 3 coders). Compare Coders: Open hub → lista mostra ela → clica pra abrir.
`;

fs.writeFileSync(path.join(SMOKE_DIR, 'README.md'), README, 'utf-8');

// ─── 3. Lê data.json atual, preserva `general` ───────────────
const oldData = fs.existsSync(DATA_JSON) ? JSON.parse(fs.readFileSync(DATA_JSON, 'utf-8')) : {};
const general = oldData.general ?? {
	showMagnitudeInPopover: true,
	showRelationsInPopover: true,
	openToggleInNewTab: false,
	showNarrativeDiagnosis: true,
	memoFolders: {
		code: 'Analytic Memos/Codes',
		group: 'Analytic Memos/Groups',
		marker: 'Analytic Memos/Markers',
		relation: 'Analytic Memos/Relations',
		smartCode: 'Analytic Memos/Smart Codes',
	},
};

// ─── 4. Constrói data.json novo ──────────────────────────────
const registryDefinitions = {};
for (const c of CODES) {
	registryDefinitions[c.id] = {
		id: c.id, name: c.name, color: c.color, paletteIndex: c.paletteIndex,
		createdAt: NOW, updatedAt: NOW,
		childrenOrder: [],
	};
}

const markdownMarkers = {};
for (const [fileId, markers] of Object.entries(MARKERS_BY_FILE)) {
	markdownMarkers[fileId] = markers;
}

// Saved comparison pré-criada
const SAVED_COMPARISON_ID = 'cmp_smoke';
const savedComparison = {
	id: SAVED_COMPARISON_ID,
	name: 'Smoke ICR — A1-B3',
	scope: { coderIds: ['human:default', 'human:carla', 'human:joana'] },
	view: {
		overviewMode: 'matrix',
		drilldownMode: 'spatial',
		primaryCoefficient: 'cohen',
	},
	filters: {},
	createdAt: NOW,
	updatedAt: NOW,
};

const newData = {
	registry: {
		definitions: registryDefinitions,
		nextPaletteIndex: CODES.length,
		folders: {},
		folderOrder: [],
		rootOrder: CODES.map(c => c.id),
		groups: {},
		groupOrder: [],
		nextGroupPaletteIndex: 0,
	},
	smartCodes: { definitions: {}, order: [], nextPaletteIndex: 0 },
	general,
	markdown: {
		markers: markdownMarkers,
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
	csv: { segmentMarkers: [], rowMarkers: [], settings: { parquetSizeWarningMB: 50, csvSizeWarningMB: 100 } },
	image: { markers: [], settings: { autoOpen: false, showButton: true, fileStates: {} } },
	pdf: { markers: [], shapes: [], settings: { autoOpen: false, showButton: true } },
	audio: { files: [], settings: { autoOpen: false, showButton: true, defaultZoom: 50, regionOpacity: 0.4, showLabelsOnRegions: true, fileStates: {} } },
	video: { files: [], settings: { autoOpen: false, showButton: true, defaultZoom: 50, regionOpacity: 0.4, showLabelsOnRegions: true, videoFit: 'contain', fileStates: {} } },
	caseVariables: { values: {}, types: {} },
	visibilityOverrides: {},
	auditLog: [],
	coders: { coders: CODERS },
	sourceHashes: {},
	activeCoderId: 'human:default',
	comparisons: {
		definitions: { [SAVED_COMPARISON_ID]: savedComparison },
		order: [SAVED_COMPARISON_ID],
	},
};

fs.writeFileSync(DATA_JSON, JSON.stringify(newData, null, 2), 'utf-8');

// ─── 5. Gera 2 contribuições JSON ────────────────────────────
// computeCodebookHash réplica de src/core/icr/transport/computeCodebookHash.ts
function computeCodebookHash() {
	const canonical = {
		codes: CODES.map(c => ({ id: c.id, name: c.name, color: c.color, parentId: undefined, groups: undefined }))
			.sort((a, b) => a.id.localeCompare(b.id)),
		groups: [],
		smartCodes: [],
	};
	const json = JSON.stringify(canonical);
	return crypto.createHash('sha256').update(json, 'utf-8').digest('hex');
}

function fileHash(filePath) {
	const buf = fs.readFileSync(filePath);
	return crypto.createHash('sha256').update(buf).digest('hex');
}

function fileSize(filePath) {
	return fs.statSync(filePath).size;
}

const codebookVersion = computeCodebookHash();

function buildPayload(coderId) {
	const coder = CODERS.find(c => c.id === coderId);
	const allMarkers = Object.values(MARKERS_BY_FILE).flat().filter(m => m.codedBy === coderId);
	const markdownByFile = {};
	const fileIds = new Set();
	for (const m of allMarkers) {
		fileIds.add(m.fileId);
		if (!markdownByFile[m.fileId]) markdownByFile[m.fileId] = [];
		markdownByFile[m.fileId].push(m);
	}
	const sources = {};
	for (const fid of fileIds) {
		const abs = path.join(VAULT, fid);
		sources[fid] = { hash: fileHash(abs), fileSize: fileSize(abs) };
	}
	const codesUsed = new Set();
	for (const m of allMarkers) {
		for (const c of m.codes) codesUsed.add(c.codeId);
	}
	const codeDefs = CODES.filter(c => codesUsed.has(c.id)).map(c => ({
		id: c.id, name: c.name, color: c.color, paletteIndex: c.paletteIndex,
		createdAt: NOW, updatedAt: NOW, childrenOrder: [],
	}));
	return {
		version: '1.0',
		codebookVersion,
		coder: { id: coder.id, name: coder.name, type: coder.type, createdAt: coder.createdAt },
		sources,
		codes: codeDefs,
		markers: { markdown: markdownByFile, pdf: [], csvSegment: [] },
		exportedAt: NOW,
	};
}

if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });
const carlaPayload = buildPayload('human:carla');
const joanaPayload = buildPayload('human:joana');
fs.writeFileSync(path.join(EXPORTS_DIR, 'smoke-carla.json'), JSON.stringify(carlaPayload, null, 2), 'utf-8');
fs.writeFileSync(path.join(EXPORTS_DIR, 'smoke-joana.json'), JSON.stringify(joanaPayload, null, 2), 'utf-8');

// ─── 6. Log final ────────────────────────────────────────────
console.log('');
console.log('✅ Smoke ICR seed completo.');
console.log('');
console.log('Arquivos criados:');
console.log(`  - ${SMOKE_DIR}/F1.md, F2.md, F3.md, F4.md, README.md`);
console.log(`  - ${DATA_JSON} (zerado + repovoado)`);
console.log(`  - ${EXPORTS_DIR}/smoke-carla.json, smoke-joana.json`);
console.log('');
console.log('Estatística:');
console.log(`  - 3 coders (default, carla, joana)`);
console.log(`  - 5 codes (Tema A..E)`);
console.log(`  - ${Object.values(MARKERS_BY_FILE).flat().length} markers markdown total`);
for (const [fid, ms] of Object.entries(MARKERS_BY_FILE)) {
	const byCoder = ms.reduce((acc, m) => { acc[m.codedBy] = (acc[m.codedBy] ?? 0) + 1; return acc; }, {});
	console.log(`    ${fid}: ${Object.entries(byCoder).map(([k,v]) => `${k.replace('human:','')}=${v}`).join(' · ')}`);
}
console.log('');
console.log('▶ Proximo passo:');
console.log('  1. Abra o Obsidian no vault workbench');
console.log('  2. Cmd+P → "Compare Coders: Open hub" → clica "Smoke ICR — A1-B3"');
console.log('  3. Siga README em smoke-icr-fixes/README.md');
