#!/usr/bin/env node
// Gera corpus sintético pra medir performance do Memo View.
// Usage: node scripts/seed-memo-corpus.mjs [N_MARKERS=500]
// Backup automático em data.json.bak antes de escrever.

import fs from "node:fs";
import path from "node:path";

const VAULT_ROOT = "/Users/mosx/Desktop/obsidian-plugins-workbench";
const DATA_PATH = path.join(VAULT_ROOT, ".obsidian/plugins/obsidian-qualia-coding/data.json");
const BACKUP_PATH = DATA_PATH + ".bak";

const N_MARKERS = parseInt(process.argv[2] ?? "500", 10);
const N_FILES = 12;
const N_CODES = 50;
const N_GROUPS = 6;

const PALETTE = [
	"#e85a4f", "#f49b42", "#f7d046", "#76c043", "#42b3a4",
	"#3a90cc", "#7c5cd1", "#d05ec8", "#9c7e6e", "#6d8a96",
];

const PHRASES = [
	"Participante demonstra alta resistencia a mudancas no fluxo de trabalho.",
	"Memo: vincula esse trecho a categoria emergente de burnout pos-sprint.",
	"Insight: o codigo se comporta diferente em entrevistas vs questionarios.",
	"Reflexao analitica processual sobre o uso recursivo da ferramenta.",
	"Hipotese: dimensao temporal afeta interpretacao do conceito.",
	"Cuidado: esse trecho pode ser mais bem codificado como subtema de Wellbeing.",
	"Indicio de saturacao no corpus apos 8 entrevistas semelhantes.",
	"Comparacao com Atlas.ti mostra padrao similar de aplicacao.",
	"Nota metodologica: revisar definicao operacional pra clarificar boundary.",
	"Triangulacao com survey quantitativa confirma direcao do achado.",
];

const EXCERPTS = [
	"Eu nao acredito que esse e o caminho certo, mas tentei mesmo assim porque o time pediu.",
	"O processo todo foi confuso, fiquei perdido em varios momentos do desenvolvimento.",
	"Foi a primeira vez que percebi como a ferramenta podia me ajudar de verdade no dia a dia.",
	"Meu manager nao entendeu de cara, e isso me frustrou bastante na semana passada.",
	"Aprendi rapido depois que vi o tutorial e copiei alguns padroes do colega senior.",
	"A documentacao deveria ser mais clara, principalmente nos exemplos avancados.",
	"Senti que estava sozinho nessa jornada por muito tempo, ate aparecer uma comunidade.",
	"O resultado final superou minhas expectativas e me motivou a continuar tentando.",
	"Tive que abandonar duas vezes antes de conseguir fazer funcionar como queria.",
	"A produtividade aumentou consideravelmente depois que adotei o novo workflow proposto.",
];

function pick(arr, i) { return arr[i % arr.length]; }
function rng(seed) { let x = seed; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }

const rand = rng(42);

// ─── Carrega + backup ────────────────────────────────────────────
console.log(`[seed] reading ${DATA_PATH}`);
const raw = fs.readFileSync(DATA_PATH, "utf8");
fs.writeFileSync(BACKUP_PATH, raw);
console.log(`[seed] backup -> ${BACKUP_PATH}`);
const data = JSON.parse(raw);

// ─── Codes hierarquicos ──────────────────────────────────────────
const definitions = data.registry.definitions ?? {};
const rootOrder = data.registry.rootOrder ?? [];

// 5 root themes, cada um com 9 children = 50 codes
const codes = [];
for (let r = 0; r < 5; r++) {
	const rootId = `synth-root-${r}`;
	codes.push({ id: rootId, name: `Tema sintetico ${r + 1}`, parentId: null, depth: 0 });
	for (let c = 0; c < 9; c++) {
		codes.push({ id: `synth-${r}-${c}`, name: `Subtema ${r + 1}.${c + 1}`, parentId: rootId, depth: 1 });
	}
}

const childrenOrderByParent = {};
for (const c of codes) {
	const isRoot = !c.parentId;
	const def = {
		id: c.id,
		name: c.name,
		color: pick(PALETTE, codes.indexOf(c)),
		description: `Definicao operacional sintetica de ${c.name}`,
		paletteIndex: codes.indexOf(c) % PALETTE.length,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		parentId: c.parentId ?? undefined,
		childrenOrder: [],
		groups: [],
		relations: [],
	};
	// 60% dos codes ganham memo
	if (rand() < 0.6) {
		def.memo = pick(PHRASES, codes.indexOf(c));
	}
	definitions[c.id] = def;
	if (isRoot) {
		if (!rootOrder.includes(c.id)) rootOrder.push(c.id);
	} else {
		const arr = childrenOrderByParent[c.parentId] ?? [];
		arr.push(c.id);
		childrenOrderByParent[c.parentId] = arr;
	}
}
for (const [parentId, kids] of Object.entries(childrenOrderByParent)) {
	definitions[parentId].childrenOrder = kids;
}

// 3 relations code-level com memo (entre subthemas de root 0 e 1)
const relSource = "synth-0-0";
definitions[relSource].relations.push(
	{ label: "causes", target: "synth-1-1", directed: true, memo: "Reflexao sobre causalidade entre dois subthemas." },
	{ label: "cooccurs", target: "synth-1-2", directed: false, memo: "Co-ocorrencia frequente nas entrevistas iniciais." },
	{ label: "contradicts", target: "synth-2-3", directed: true, memo: "Tensao analitica entre essas duas categorias." },
);

// ─── Groups ──────────────────────────────────────────────────────
const groups = data.registry.groups ?? {};
const groupOrder = data.registry.groupOrder ?? [];
for (let g = 0; g < N_GROUPS; g++) {
	const id = `synth-g-${g}`;
	groups[id] = {
		id,
		name: `Group sintetico ${g + 1}`,
		color: pick(PALETTE, g + 5),
		description: `Description do group ${g + 1}`,
		memo: pick(PHRASES, g + 3),
		paletteIndex: g,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
	if (!groupOrder.includes(id)) groupOrder.push(id);
}
// Atribui codes aos groups (round-robin)
for (let i = 0; i < codes.length; i++) {
	const code = codes[i];
	const groupId = `synth-g-${i % N_GROUPS}`;
	if (!definitions[code.id].groups.includes(groupId)) {
		definitions[code.id].groups.push(groupId);
	}
}

// ─── Markdown markers ────────────────────────────────────────────
const markdownMarkers = data.markdown.markers ?? {};
const SYNTH_FILE_PREFIX = "synth-corpus/S";
for (let f = 0; f < N_FILES; f++) {
	const fileId = `${SYNTH_FILE_PREFIX}${String(f).padStart(2, "0")}.md`;
	if (!markdownMarkers[fileId]) markdownMarkers[fileId] = [];
}

const markersPerFile = Math.ceil(N_MARKERS / N_FILES);
let markerCount = 0;
for (let f = 0; f < N_FILES && markerCount < N_MARKERS; f++) {
	const fileId = `${SYNTH_FILE_PREFIX}${String(f).padStart(2, "0")}.md`;
	const arr = markdownMarkers[fileId];
	for (let m = 0; m < markersPerFile && markerCount < N_MARKERS; m++) {
		const codeIdx = Math.floor(rand() * codes.length);
		const code = codes[codeIdx];
		const marker = {
			id: `synth-m-${markerCount}`,
			markerType: "markdown",
			fileId,
			codes: [{ codeId: code.id }],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			fromLine: m * 3,
			toLine: m * 3,
			fromCh: 0,
			toCh: 60,
			text: pick(EXCERPTS, markerCount),
		};
		// 80% dos markers ganham memo
		if (rand() < 0.8) {
			marker.memo = pick(PHRASES, markerCount);
		}
		arr.push(marker);
		markerCount++;
	}
}

// ─── Salva ───────────────────────────────────────────────────────
data.registry.definitions = definitions;
data.registry.rootOrder = rootOrder;
data.registry.groups = groups;
data.registry.groupOrder = groupOrder;
data.markdown.markers = markdownMarkers;

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

// ─── Cria arquivos .md placeholder no vault ──────────────────────
const synthFolder = path.join(VAULT_ROOT, "synth-corpus");
if (!fs.existsSync(synthFolder)) fs.mkdirSync(synthFolder, { recursive: true });
for (let f = 0; f < N_FILES; f++) {
	const fileName = `S${String(f).padStart(2, "0")}.md`;
	const filePath = path.join(synthFolder, fileName);
	if (!fs.existsSync(filePath)) {
		const content = EXCERPTS.map((e, i) => `## Trecho ${i + 1}\n${e}\n`).join("\n");
		fs.writeFileSync(filePath, content);
	}
}

console.log(`[seed] codes: ${codes.length} (${codes.filter(c => definitions[c.id].memo).length} com memo)`);
console.log(`[seed] groups: ${N_GROUPS} (todos com memo)`);
console.log(`[seed] relations code-level com memo: 3`);
console.log(`[seed] markers: ${markerCount} em ${N_FILES} arquivos (~80% com memo)`);
console.log(`[seed] arquivos .md em ${synthFolder}/`);
console.log(`[seed] data.json salvo. Backup em ${BACKUP_PATH}`);
console.log(`[seed] pra reverter: cp ${BACKUP_PATH} ${DATA_PATH} && rm -rf ${synthFolder}`);
