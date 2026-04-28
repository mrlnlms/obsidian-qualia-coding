#!/usr/bin/env node
// Seed pra smoke test do Code Merging Avançado (#30 / Tier 2).
//
// Cria nota "Smoke test merging.md" na raiz do vault com 6 parágrafos +
// markers já codificados em 6 códigos demo (cores/descriptions/memos distintas).
//
// Cenários cobertos:
//   - Merge simples (1)
//   - Name from source (2)
//   - Color from source (3)
//   - Memo concatenate (4)
//   - Collision (5)
//   - History (6 — usa o resultado de #4)
//   - Degenerate sem memo/desc (7)
//
// Usage: node scripts/seed-merging-demo.mjs
// Backup: data.json.bak
//
// Cleanup: multi-select dos códigos "MergeDemo · *" no codebook → bulk delete,
// e deletar a nota Smoke test merging.md na mão.

import fs from "node:fs";
import path from "node:path";

const VAULT_ROOT = "/Users/mosx/Desktop/obsidian-plugins-workbench";
const DATA_PATH = path.join(VAULT_ROOT, ".obsidian/plugins/obsidian-qualia-coding/data.json");
const BACKUP_PATH = DATA_PATH + ".bak";
const NOTE_PATH = path.join(VAULT_ROOT, "Smoke test merging.md");
const NOTE_FILE_ID = "Smoke test merging.md";

if (!fs.existsSync(DATA_PATH)) {
	console.error(`[ERROR] data.json não encontrado em: ${DATA_PATH}`);
	process.exit(1);
}

// ─── Backup + load ───────────────────────────────────────

const raw = fs.readFileSync(DATA_PATH, "utf-8");
fs.writeFileSync(BACKUP_PATH, raw);
console.log(`Backup → ${BACKUP_PATH}`);

const data = JSON.parse(raw);

data.registry = data.registry ?? {
	definitions: {}, nextPaletteIndex: 0,
	folders: {}, folderOrder: [], rootOrder: [],
	groups: {}, groupOrder: [], nextGroupPaletteIndex: 0,
};
data.markdown = data.markdown ?? {};
data.markdown.markers = data.markdown.markers ?? {};
data.auditLog = data.auditLog ?? [];

// ─── Cleanup demo prévio (idempotente) ───────────────────

const prevDemoIds = Object.values(data.registry.definitions)
	.filter(c => c.name?.startsWith("MergeDemo · "))
	.map(c => c.id);

if (prevDemoIds.length > 0) {
	console.log(`Removendo ${prevDemoIds.length} merge-demo codes anteriores...`);
	for (const id of prevDemoIds) delete data.registry.definitions[id];
	data.registry.rootOrder = data.registry.rootOrder.filter(id => !prevDemoIds.includes(id));
	data.auditLog = data.auditLog.filter(e => !prevDemoIds.includes(e.codeId));
}

// Limpa markers anteriores na nota (se existirem)
if (data.markdown.markers[NOTE_FILE_ID]) {
	console.log(`Removendo markers anteriores em ${NOTE_FILE_ID}...`);
	delete data.markdown.markers[NOTE_FILE_ID];
}

// ─── Note content (linhas alinhadas com markers) ─────────

// Nota "Smoke test merging.md" é criada por fora desse script (sandbox bloqueia
// escrita fora do plugin dir). Linhas dos parágrafos:
//   linha 4  → Frustração
//   linha 6  → Irritação
//   linha 8  → Burnout
//   linha 10 → Cansaço
//   linha 12 → Sem memo A
//   linha 14 → Sem memo B
if (!fs.existsSync(NOTE_PATH)) {
	console.error(`[ERROR] Nota não encontrada: ${NOTE_PATH}`);
	console.error(`Crie ela manualmente antes de rodar o script.`);
	process.exit(1);
}

// ─── Definições dos 6 códigos demo ───────────────────────

const PALETTE = ["#e85a4f", "#f49b42", "#f7d046", "#76c043", "#42b3a4", "#3a90cc"];

let _idCtr = Math.floor(Math.random() * 9000);
const cid = () => `c_mdemo_${(_idCtr++).toString(36)}`;

const NOW = Date.now();

const codes = [
	{
		id: cid(),
		name: "MergeDemo · Frustração",
		color: PALETTE[0],
		description: "Reação aguda quando algo bloqueia o objetivo.",
		memo: "Achei que aparece mais com tarefas técnicas — checar.",
	},
	{
		id: cid(),
		name: "MergeDemo · Irritação",
		color: PALETTE[1],
		description: "Tensão leve, tipicamente sem alvo claro.",
		memo: "Diferença com frustração ainda nebulosa — talvez merge.",
	},
	{
		id: cid(),
		name: "MergeDemo · Burnout",
		color: PALETTE[2],
		description: "Exaustão prolongada por sobrecarga sustentada.",
		memo: "Casos crônicos só, não pontuais.",
	},
	{
		id: cid(),
		name: "MergeDemo · Cansaço",
		color: PALETTE[3],
		description: "Fadiga aguda recuperável com descanso.",
		memo: "Se some em 1-2 dias, é cansaço; se persiste, virá burnout.",
	},
	{
		id: cid(),
		name: "MergeDemo · Sem memo A",
		color: PALETTE[4],
		// sem description nem memo — pra testar caso #9
	},
	{
		id: cid(),
		name: "MergeDemo · Sem memo B",
		color: PALETTE[5],
		// idem
	},
];

let paletteIdx = data.registry.nextPaletteIndex || 0;

for (const c of codes) {
	data.registry.definitions[c.id] = {
		id: c.id,
		name: c.name,
		color: c.color,
		paletteIndex: paletteIdx++,
		childrenOrder: [],
		createdAt: NOW,
		updatedAt: NOW,
		...(c.description ? { description: c.description } : {}),
		...(c.memo ? { memo: c.memo } : {}),
	};
	data.registry.rootOrder.push(c.id);

	// Audit: simular created
	data.auditLog.push({
		id: `audit_${Date.now().toString(36)}_${c.id.slice(-4)}`,
		type: "created",
		codeId: c.id,
		at: NOW,
	});
}

data.registry.nextPaletteIndex = paletteIdx;

// ─── Markers — 1 por código no arquivo de teste ──────────
//
// Cada parágrafo do NOTE_CONTENT está numa linha distinta. Usamos `range` por
// linha/coluna do CM6. Linha 0 = "# Smoke test...", então parágrafos começam em:
//   linha 4 → Frustração
//   linha 6 → Irritação
//   linha 8 → Burnout
//   linha 10 → Cansaço
//   linha 12 → Sem memo A
//   linha 14 → Sem memo B
// Cada marker cobre a linha inteira do parágrafo.

const markerLines = [
	{ line: 4, code: codes[0], excerpt: "Frustração com a interface ficou intensa quando o sistema travou no terceiro click." },
	{ line: 6, code: codes[1], excerpt: "Irritação leve apareceu logo de manhã, ainda no primeiro café, antes mesmo de abrir o laptop." },
	{ line: 8, code: codes[2], excerpt: "Burnout depois de duas semanas seguidas trabalhando até tarde, sem pausa real." },
	{ line: 10, code: codes[3], excerpt: "Cansaço acumulado virou um fardo, mas o time deu suporte e foi possível desacelerar." },
	{ line: 12, code: codes[4], excerpt: "Outro código sem memo nem description, só pra testar o caso degenerate." },
	{ line: 14, code: codes[5], excerpt: "Mais um sem memo nem description, parceiro do anterior nesse cenário." },
];

let _mid = Math.floor(Math.random() * 9000);
const markerId = () => `m_mdemo_${(_mid++).toString(36)}`;

const fileMarkers = [];
for (const m of markerLines) {
	fileMarkers.push({
		markerType: "markdown",
		id: markerId(),
		fileId: NOTE_FILE_ID,
		range: {
			from: { line: m.line, ch: 0 },
			to: { line: m.line, ch: m.excerpt.length },
		},
		color: m.code.color,
		codes: [{ codeId: m.code.id }],
		text: m.excerpt,
		createdAt: NOW,
		updatedAt: NOW,
	});
}
data.markdown.markers[NOTE_FILE_ID] = fileMarkers;

// ─── Save ────────────────────────────────────────────────

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
console.log(`\n✅ Seed pronto.`);
console.log(`\nCódigos criados:`);
for (const c of codes) console.log(`  • ${c.name}`);
console.log(`\nNota: "${NOTE_FILE_ID}" (raiz do vault). 1 marker por parágrafo.`);
console.log(`\nReload o Obsidian pra carregar (Cmd+R).`);
