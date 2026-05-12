#!/usr/bin/env node
/**
 * Seed Smoke `textContains` — cenário fechado pra smoke do leaf novo de Smart Code.
 *
 * Roda: `node scripts/seed-smoke-text-contains.mjs`
 *
 * Pré-requisito: Obsidian FECHADO (senão plugin sobrescreve data.json).
 *
 * O que prepara:
 * 1. Pasta `smoke-text-contains/` na raiz do vault com F1.md, F2.md, F3.md + README.md
 * 2. Reescreve data.json preservando `general` settings + `coders`/`activeCoderId`:
 *    - 1 coder humano (Default) já ativo
 *    - 2 codes (Tema A · Tema B) só pra ter codeIds reais nos markers
 *    - 6 markers markdown com `text` controlado pra casar leaf textContains
 *    - 2 Smart Codes:
 *       - "Tem 'kappa'" — kind: textContains, value: "kappa" (case-insensitive default)
 *       - "KAPPA exato"  — kind: textContains, value: "KAPPA", caseSensitive: true
 *
 * Esperado após reload:
 * - Code Explorer sidebar → grupo Smart Codes mostra:
 *    ⚡ Tem 'kappa'      → 3 matches (F1.m1 "kappa coefficient", F2.m1 "KAPPA value", F3.m1 "Kappa importante")
 *    ⚡ KAPPA exato      → 1 match  (F2.m1)
 * - Builder modal: dropdown "Kind" inclui "Text contains"; ao selecionar, aparece text input + checkbox "Aa"
 * - Detail Smart Code formata leaf como: `Text contains "kappa"` ou `Text contains "KAPPA" (case sensitive)`
 *
 * Cenário de invalidação via vault.on('modify'):
 * - Texto do marker é cacheado em `marker.text` (markdown). Edição IN-Obsidian dispara
 *   MarkerMutationEvent → applyMarkerMutation invalida via deps.codeIds.
 * - vault.on('modify') é a rede de segurança pra mudança de texto que NÃO passa por marker
 *   mutation (edição externa, future leaf de texto que lê source bruto). Aqui é wired mas
 *   visualmente redundante com applyMarkerMutation pra markdown.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const VAULT = '/Users/mosx/Desktop/obsidian-plugins-workbench';
const DATA_JSON = path.join(VAULT, '.obsidian/plugins/obsidian-qualia-coding/data.json');
const SMOKE_DIR = path.join(VAULT, 'smoke-text-contains');

const NOW = Date.parse('2026-05-12T18:00:00Z');

const CODES = [
	{ id: 'c_temaA', name: 'Tema A', color: '#ff6b6b', paletteIndex: 0 },
	{ id: 'c_temaB', name: 'Tema B', color: '#4ecdc4', paletteIndex: 1 },
];

const SMART_CODES = [
	{
		id: 'sc_kappa_any', name: "Tem 'kappa'", color: '#a8e6cf', paletteIndex: 0, createdAt: NOW,
		predicate: { kind: 'textContains', value: 'kappa' },
	},
	{
		id: 'sc_kappa_exact', name: 'KAPPA exato', color: '#ffd93d', paletteIndex: 1, createdAt: NOW,
		predicate: { kind: 'textContains', value: 'KAPPA', caseSensitive: true },
	},
];

const FILES = {
	'smoke-text-contains/F1.md': [
		'Discussão sobre kappa coefficient e métricas.',
		'',
		'Texto comum sem a palavra que importa.',
	].join('\n') + '\n',
	'smoke-text-contains/F2.md': [
		'Análise de KAPPA value reveals concordância.',
		'',
		'Identidade e pertencimento — outro tema.',
	].join('\n') + '\n',
	'smoke-text-contains/F3.md': [
		'Kappa importante neste parágrafo.',
		'',
		'Tema separado, sem menção relevante.',
	].join('\n') + '\n',
};

// Markers com text cacheado controlado (id, fileId, line, char-to, codeId, text)
const mkMarker = (idSuffix, fileId, line, chTo, codeId, text) => ({
	markerType: 'markdown',
	id: `m_${idSuffix}`,
	fileId,
	range: { from: { line, ch: 0 }, to: { line, ch: chTo } },
	color: CODES.find(c => c.id === codeId).color,
	codes: [{ codeId }],
	codedBy: 'human:default',
	createdAt: NOW,
	updatedAt: NOW,
	text,
});

const MARKERS_BY_FILE = {
	'smoke-text-contains/F1.md': [
		mkMarker('f1_m1', 'smoke-text-contains/F1.md', 0, 45, 'c_temaA', 'Discussão sobre kappa coefficient e métricas.'),
		mkMarker('f1_m2', 'smoke-text-contains/F1.md', 2, 38, 'c_temaB', 'Texto comum sem a palavra que importa.'),
	],
	'smoke-text-contains/F2.md': [
		mkMarker('f2_m1', 'smoke-text-contains/F2.md', 0, 45, 'c_temaA', 'Análise de KAPPA value reveals concordância.'),
		mkMarker('f2_m2', 'smoke-text-contains/F2.md', 2, 41, 'c_temaB', 'Identidade e pertencimento — outro tema.'),
	],
	'smoke-text-contains/F3.md': [
		mkMarker('f3_m1', 'smoke-text-contains/F3.md', 0, 33, 'c_temaA', 'Kappa importante neste parágrafo.'),
		mkMarker('f3_m2', 'smoke-text-contains/F3.md', 2, 37, 'c_temaB', 'Tema separado, sem menção relevante.'),
	],
};

// ─── 1. Pasta + arquivos markdown ─────────────────────────────
if (!fs.existsSync(SMOKE_DIR)) fs.mkdirSync(SMOKE_DIR, { recursive: true });
for (const [relPath, content] of Object.entries(FILES)) {
	fs.writeFileSync(path.join(VAULT, relPath), content, 'utf-8');
}

// ─── 2. README.md descrevendo cenário esperado ────────────────
const README = `# Smoke textContains — Smart Code leaf novo

Cenário gerado por \`scripts/seed-smoke-text-contains.mjs\` pra validar o leaf de busca por texto.

## Esperado após reload do plugin

### Code Explorer sidebar → grupo Smart Codes

| Smart Code | Predicate | Matches esperados |
|------------|-----------|-------------------|
| ⚡ Tem 'kappa'  | textContains "kappa" (case-insensitive) | **3** — F1.m1 "kappa coefficient", F2.m1 "KAPPA value", F3.m1 "Kappa importante" |
| ⚡ KAPPA exato  | textContains "KAPPA" (case-sensitive)   | **1** — só F2.m1 |

### Builder modal (criar Smart Code novo)

1. Command palette → \`Smart Codes: New\`
2. + Condition → dropdown "Kind" → procura **"Text contains"**
3. Selecionar → aparece text input + checkbox "Aa" (case sensitive)
4. Save desabilitado enquanto value vazio (validator marca "Type text to search for")

### Detail view (clicar num SC do grupo)

- "Tem 'kappa'": predicate renderiza como \`Text contains "kappa"\`
- "KAPPA exato": predicate renderiza como \`Text contains "KAPPA" (case sensitive)\`

## Cenário de invalidação via \`vault.on('modify')\`

Texto cacheado em \`marker.text\` (markdown). Edição IN-Obsidian dispara
\`MarkerMutationEvent\` → \`applyMarkerMutation\` invalida cache pelo caminho normal.

\`vault.on('modify')\` é a rede de segurança extra que invalida SCs com \`needsText=true\`
quando arquivo é modificado por qualquer caminho (inclui edição externa).
Coberto por tests:
- \`tests/core/smartCodes/cache.test.ts\` → \`invalidateForFileText\` (3 cenários)
- \`tests/core/smartCodes/evaluator.test.ts\` → \`textContains\` (5 cenários)
- \`tests/core/smartCodes/dependencyExtractor.test.ts\` → \`needsText\` flag (3 cenários)
- \`tests/core/smartCodes/predicateValidator.test.ts\` → value vazio rejeitado (2 cenários)

## Roteiro de smoke manual

1. **Reload plugin** (Settings → Community plugins → toggle off/on)
2. Abre Code Explorer (ícone na sidebar)
3. Expande grupo "Smart Codes" — confere counts 3 / 1
4. Clica em "Tem 'kappa'" → Detail abre → 3 markers listados
5. Edita F1.md, adiciona "kappa" em outro parágrafo → cria marker novo lá → count vai pra 4
6. Edita F2.md, remove "KAPPA" do marker m1 → re-cria marker com texto novo → "KAPPA exato" vai pra 0
7. Cria SC novo via command palette pra validar builder (passos acima)
`;
fs.writeFileSync(path.join(SMOKE_DIR, 'README.md'), README, 'utf-8');

// ─── 3. data.json — preserva general + coders + activeCoderId ──
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
const coders = oldData.coders?.coders?.length
	? oldData.coders
	: { coders: [{ id: 'human:default', name: 'Default', type: 'human', createdAt: NOW }] };
const activeCoderId = oldData.activeCoderId ?? 'human:default';

const registryDefinitions = {};
for (const c of CODES) {
	registryDefinitions[c.id] = {
		id: c.id, name: c.name, color: c.color, paletteIndex: c.paletteIndex,
		createdAt: NOW, updatedAt: NOW, childrenOrder: [],
	};
}

const smartCodeDefinitions = {};
for (const sc of SMART_CODES) smartCodeDefinitions[sc.id] = sc;

const fileHash = (fp) => crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
const fileSize = (fp) => fs.statSync(fp).size;

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
	smartCodes: {
		definitions: smartCodeDefinitions,
		order: SMART_CODES.map(sc => sc.id),
		nextPaletteIndex: SMART_CODES.length,
	},
	general,
	markdown: {
		markers: MARKERS_BY_FILE,
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
	coders,
	sourceHashes: Object.fromEntries(
		Object.keys(FILES).map(fid => {
			const abs = path.join(VAULT, fid);
			return [fid, { hash: fileHash(abs), computedAt: NOW, fileSize: fileSize(abs) }];
		}),
	),
	activeCoderId,
	comparisons: { definitions: {}, order: [] },
};

fs.writeFileSync(DATA_JSON, JSON.stringify(newData, null, 2), 'utf-8');

console.log('✓ Smoke textContains seed completo.');
console.log(`  → ${SMOKE_DIR}/ (F1.md, F2.md, F3.md + README.md)`);
console.log(`  → ${DATA_JSON} reescrito com 6 markers + 2 Smart Codes`);
console.log('');
console.log('Próximo passo: reload do plugin no Obsidian (Settings → Community plugins → toggle off/on).');
console.log('Esperado: SC "Tem \'kappa\'" mostra 3 matches; SC "KAPPA exato" mostra 1 match.');
