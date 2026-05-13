#!/usr/bin/env node
/**
 * Seed Smoke B4 Camada 1 — multimodal enforcement.
 *
 * Cria cenário com markers em 2 famílias modais (text-like + categorical) pra
 * disparar o banner "κ/α são definidos sobre uma única modalidade..." +
 * per-engine table no Compare Coders Mode A.
 *
 * Famílias:
 *   - text-like (markdown):  b4-smoke/F1.md, F2.md
 *   - categorical (csvRow):  b4-smoke/data.csv  (rowMarkers, sem from/to)
 *
 * Pré-requisito: Obsidian FECHADO (senão plugin sobrescreve data.json).
 *
 * Roda: node scripts/seed-smoke-b4-multimodal.mjs
 *
 * Restore: copiar `data.json.bak-pre-b4-smoke` de volta. O script faz backup
 * automático antes de sobrescrever.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const VAULT = '/Users/mosx/Desktop/obsidian-plugins-workbench';
const DATA_JSON = path.join(VAULT, '.obsidian/plugins/obsidian-qualia-coding/data.json');
const SMOKE_DIR = path.join(VAULT, 'b4-smoke');
const BACKUP_DIR = path.join(VAULT, 'obsidian-qualia-coding/data_synthetic_bak');

const NOW = Date.parse('2026-05-13T15:00:00Z');

// ─── Coders ──────────────────────────────────────────────────
const CODERS = [
	{ id: 'human:default', name: 'Default', type: 'human', createdAt: NOW },
	{ id: 'human:carla',   name: 'Carla',   type: 'human', createdAt: NOW },
	{ id: 'human:joana',   name: 'Joana',   type: 'human', createdAt: NOW },
];

// ─── Codes ────────────────────────────────────────────────────
const CODES = [
	{ id: 'c_temaA', name: 'Tema A', color: '#ff6b6b', paletteIndex: 0 },
	{ id: 'c_temaB', name: 'Tema B', color: '#4ecdc4', paletteIndex: 1 },
	{ id: 'c_temaC', name: 'Tema C', color: '#ffd93d', paletteIndex: 2 },
];

// ─── Conteúdo dos arquivos markdown ──────────────────────────
const FILES = {
	'b4-smoke/F1.md': [
		'Primeiro trecho de F1 codificavel em markdown.',  // line 0, 47 chars
		'',
		'Segundo trecho do arquivo F1 aqui.',              // line 2, 34 chars
		'',
		'Terceiro pedaco do F1 em markdown.',              // line 4, 34 chars
	].join('\n') + '\n',
	'b4-smoke/F2.md': [
		'Frase A do primeiro contexto de F2.',             // line 0, 35 chars
		'',
		'Frase B em outro contexto de F2.',                // line 2, 32 chars
	].join('\n') + '\n',
};

// ─── CSV: 5 linhas × 2 colunas — vai gerar rowMarkers na coluna "comentario" ─
const CSV_CONTENT =
	'id,comentario\n' +
	'1,O servico estava bom e atencioso na minha visita\n' +
	'2,O atendimento foi rapido mas o cafe estava frio\n' +
	'3,Equipe simpatica e ambiente confortavel\n' +
	'4,Demora exagerada na fila e funcionario ausente\n' +
	'5,Voltarei sem duvida com a familia no fim de semana\n';

// ─── Markdown markers — 3 coders sobre as mesmas regiões ─────
const MD_MARKERS = {
	'b4-smoke/F1.md': [
		mkMd('md_f1_l0_d', 'b4-smoke/F1.md', 0, 47, 'c_temaA', 'human:default', 'Primeiro trecho de F1 codificavel em markdown.'),
		mkMd('md_f1_l0_c', 'b4-smoke/F1.md', 0, 47, 'c_temaA', 'human:carla',   'Primeiro trecho de F1 codificavel em markdown.'),
		mkMd('md_f1_l0_j', 'b4-smoke/F1.md', 0, 47, 'c_temaB', 'human:joana',   'Primeiro trecho de F1 codificavel em markdown.'),
		mkMd('md_f1_l2_d', 'b4-smoke/F1.md', 2, 34, 'c_temaB', 'human:default', 'Segundo trecho do arquivo F1 aqui.'),
		mkMd('md_f1_l2_c', 'b4-smoke/F1.md', 2, 34, 'c_temaC', 'human:carla',   'Segundo trecho do arquivo F1 aqui.'),
		mkMd('md_f1_l2_j', 'b4-smoke/F1.md', 2, 34, 'c_temaB', 'human:joana',   'Segundo trecho do arquivo F1 aqui.'),
		mkMd('md_f1_l4_d', 'b4-smoke/F1.md', 4, 34, 'c_temaA', 'human:default', 'Terceiro pedaco do F1 em markdown.'),
		mkMd('md_f1_l4_c', 'b4-smoke/F1.md', 4, 34, 'c_temaB', 'human:carla',   'Terceiro pedaco do F1 em markdown.'),
	],
	'b4-smoke/F2.md': [
		mkMd('md_f2_l0_d', 'b4-smoke/F2.md', 0, 35, 'c_temaC', 'human:default', 'Frase A do primeiro contexto de F2.'),
		mkMd('md_f2_l0_c', 'b4-smoke/F2.md', 0, 35, 'c_temaC', 'human:carla',   'Frase A do primeiro contexto de F2.'),
		mkMd('md_f2_l0_j', 'b4-smoke/F2.md', 0, 35, 'c_temaA', 'human:joana',   'Frase A do primeiro contexto de F2.'),
		mkMd('md_f2_l2_d', 'b4-smoke/F2.md', 2, 32, 'c_temaA', 'human:default', 'Frase B em outro contexto de F2.'),
		mkMd('md_f2_l2_j', 'b4-smoke/F2.md', 2, 32, 'c_temaA', 'human:joana',   'Frase B em outro contexto de F2.'),
	],
};

// ─── csvRow markers — categorical, sem from/to ───────────────
const CSV_ROW_MARKERS = [
	// Row 1: 3 coders agree em Tema A
	mkRow('row_r1_d', 'b4-smoke/data.csv', 0, 'comentario', 'c_temaA', 'human:default'),
	mkRow('row_r1_c', 'b4-smoke/data.csv', 0, 'comentario', 'c_temaA', 'human:carla'),
	mkRow('row_r1_j', 'b4-smoke/data.csv', 0, 'comentario', 'c_temaA', 'human:joana'),
	// Row 2: default+joana=B, carla=C
	mkRow('row_r2_d', 'b4-smoke/data.csv', 1, 'comentario', 'c_temaB', 'human:default'),
	mkRow('row_r2_c', 'b4-smoke/data.csv', 1, 'comentario', 'c_temaC', 'human:carla'),
	mkRow('row_r2_j', 'b4-smoke/data.csv', 1, 'comentario', 'c_temaB', 'human:joana'),
	// Row 3: agree A
	mkRow('row_r3_d', 'b4-smoke/data.csv', 2, 'comentario', 'c_temaA', 'human:default'),
	mkRow('row_r3_c', 'b4-smoke/data.csv', 2, 'comentario', 'c_temaA', 'human:carla'),
	// Row 4: divergence C/B
	mkRow('row_r4_d', 'b4-smoke/data.csv', 3, 'comentario', 'c_temaC', 'human:default'),
	mkRow('row_r4_c', 'b4-smoke/data.csv', 3, 'comentario', 'c_temaB', 'human:carla'),
	mkRow('row_r4_j', 'b4-smoke/data.csv', 3, 'comentario', 'c_temaC', 'human:joana'),
	// Row 5: default sozinho
	mkRow('row_r5_d', 'b4-smoke/data.csv', 4, 'comentario', 'c_temaA', 'human:default'),
];

function mkMd(idSuffix, fileId, line, ch_to, codeId, codedBy, text) {
	return {
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
	};
}

function mkRow(idSuffix, fileId, sourceRowId, column, codeId, codedBy) {
	return {
		markerType: 'csv',
		id: `m_${idSuffix}`,
		fileId,
		sourceRowId,
		column,
		codes: [{ codeId }],
		codedBy,
		createdAt: NOW,
		updatedAt: NOW,
	};
}

function fileHash(filePath) {
	return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileSize(filePath) {
	return fs.statSync(filePath).size;
}

// ─── 1. Backup data.json atual ───────────────────────────────
if (fs.existsSync(DATA_JSON)) {
	if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
	const backupPath = path.join(BACKUP_DIR, `data.json.bak-pre-b4-smoke-${Date.now()}`);
	fs.copyFileSync(DATA_JSON, backupPath);
	console.log(`📦 Backup: ${backupPath}`);
}

// ─── 2. Cria pasta + arquivos ───────────────────────────────
if (!fs.existsSync(SMOKE_DIR)) fs.mkdirSync(SMOKE_DIR, { recursive: true });
for (const [relPath, content] of Object.entries(FILES)) {
	fs.writeFileSync(path.join(VAULT, relPath), content, 'utf-8');
}
fs.writeFileSync(path.join(VAULT, 'b4-smoke/data.csv'), CSV_CONTENT, 'utf-8');

// ─── 3. README do smoke ──────────────────────────────────────
const README = `# B4 Camada 1 — Smoke Multimodal

Cenário gerado por \`scripts/seed-smoke-b4-multimodal.mjs\` pra validar o banner
"per-modality enforcement" + per-engine table no Compare Coders Mode A.

## Famílias modais ativas neste scope

| Família       | Engine    | Arquivo            | # markers |
|---------------|-----------|--------------------|-----------|
| text-like     | markdown  | F1.md, F2.md       | 13        |
| categorical   | csvRow    | data.csv           | 12        |

Como há **2 famílias modais distintas**, o Compare Coders deve mostrar:

1. **Banner amarelo discreto** no topo (Modes A e B):
   - ⚠ "κ/α são definidos sobre uma única modalidade — comparar valores entre
     modalidades requer cautela (δ heterogêneas)."
   - "Modalidades ativas no escopo: texto (char-range) · categórica (linha tabular)."
   - Hover no banner → tooltip com referências (Krippendorff 2018, Artstein &
     Poesio 2008, Mathet et al. 2015) + path da pesquisa.

2. **Mode A (Matriz):**
   - Tabela "κ por modalidade (apresentação primária — fonte de verdade quando
     escopo é multimodal)" com 2 linhas (markdown, csv-row) × 5 coeficientes.
   - **ANTES** da matriz coder × coder.
   - Sobre a matriz: label cinza itálico "Matriz coder × coder (descritivo —
     agrega modalidades, não usar como métrica inferencial)".
   - Hover no label → tooltip explicativo.

3. **Mode B (Tabela):** banner aparece; tabela continua per-código (sem mudança
   estrutural).

4. **Mode C (Heatmap):** banner aparece; heatmap já era per-engine (sem mudança).

## Single-family regression check

Pra validar que single-family (não-multimodal) ficou inalterado:

1. Toolbar do Compare Coders → desliga o chip \`csv-row\` (deixa só engines
   text-like ativas).
2. Banner some. Per-engine table some. Label descritivo some. Matriz volta a
   ser a apresentação primária. **Comportamento idêntico ao antes do B4.**

## Coders

- Default (\`human:default\`) — coder ativo
- Carla (\`human:carla\`)
- Joana (\`human:joana\`)

## Codes

Tema A · Tema B · Tema C

## Próximos passos

1. Abre Obsidian no vault workbench.
2. Cmd+P → "Compare Coders: Open" (ou ribbon icon "Compare Coders").
3. Verifica banner + per-engine table no Mode A.
4. Toggle chip csv-row pra validar single-family regression.
5. Se algo torto → me passa screenshot.
`;
fs.writeFileSync(path.join(SMOKE_DIR, 'README.md'), README, 'utf-8');

// ─── 4. Constrói data.json ──────────────────────────────────
const registryDefinitions = {};
for (const c of CODES) {
	registryDefinitions[c.id] = {
		id: c.id, name: c.name, color: c.color, paletteIndex: c.paletteIndex,
		createdAt: NOW, updatedAt: NOW,
		childrenOrder: [],
	};
}

const markdownMarkers = {};
for (const [fileId, markers] of Object.entries(MD_MARKERS)) {
	markdownMarkers[fileId] = markers;
}

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
	general: {
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
	},
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
	csv: {
		segmentMarkers: [],
		rowMarkers: CSV_ROW_MARKERS,
		settings: { parquetSizeWarningMB: 50, csvSizeWarningMB: 100 },
	},
	image: { markers: [], settings: { autoOpen: false, showButton: true, fileStates: {} } },
	pdf: { markers: [], shapes: [], settings: { autoOpen: false, showButton: true } },
	audio: { files: [], settings: { autoOpen: false, showButton: true, defaultZoom: 50, regionOpacity: 0.4, showLabelsOnRegions: true, fileStates: {} } },
	video: { files: [], settings: { autoOpen: false, showButton: true, defaultZoom: 50, regionOpacity: 0.4, showLabelsOnRegions: true, videoFit: 'contain', fileStates: {} } },
	caseVariables: { values: {}, types: {} },
	visibilityOverrides: {},
	auditLog: [],
	coders: { coders: CODERS },
	sourceHashes: Object.fromEntries(
		[...Object.keys(FILES), 'b4-smoke/data.csv'].map(fid => {
			const abs = path.join(VAULT, fid);
			return [fid, { hash: fileHash(abs), computedAt: NOW, fileSize: fileSize(abs) }];
		}),
	),
	activeCoderId: 'human:default',
	comparisons: { definitions: {}, order: [] },
};

fs.writeFileSync(DATA_JSON, JSON.stringify(newData, null, 2), 'utf-8');

// ─── 5. Log final ────────────────────────────────────────────
const mdCount = Object.values(MD_MARKERS).flat().length;
const rowCount = CSV_ROW_MARKERS.length;

console.log('');
console.log('✅ B4 multimodal seed completo.');
console.log('');
console.log('Arquivos criados:');
console.log(`  - ${SMOKE_DIR}/F1.md, F2.md, data.csv, README.md`);
console.log(`  - ${DATA_JSON} reescrito`);
console.log('');
console.log('Estatística:');
console.log(`  - 3 coders (default, carla, joana)`);
console.log(`  - 3 codes (Tema A..C)`);
console.log(`  - ${mdCount} markers markdown (família text-like)`);
console.log(`  - ${rowCount} markers csvRow (família categorical)`);
console.log(`  - 2 famílias modais → banner deve aparecer`);
console.log('');
console.log('▶ Próximo passo:');
console.log('  1. Abre Obsidian no vault workbench');
console.log('  2. Recarrega o plugin (Cmd+R no Obsidian, ou Settings → Community Plugins → toggle off/on)');
console.log('  3. Cmd+P → "Compare Coders: Open" (ou ribbon "Compare Coders")');
console.log('  4. Verifica banner + per-engine table no Mode A');
console.log('');
console.log('  Detalhe em b4-smoke/README.md');
