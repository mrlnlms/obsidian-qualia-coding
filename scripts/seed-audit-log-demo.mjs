#!/usr/bin/env node
// Gera dataset sintético rico pra testar o Audit Log (#29).
// 8 demo codes com timeline de 30 dias cobrindo todos os tipos de events.
// Usage: node scripts/seed-audit-log-demo.mjs
// Backup automático em data.json.bak antes de escrever.
//
// Pra limpar: abre o Obsidian, multi-select nos codes "Demo · *" → bulk delete.

import fs from "node:fs";
import path from "node:path";

const VAULT_ROOT = "/Users/mosx/Desktop/obsidian-plugins-workbench";
const DATA_PATH = path.join(VAULT_ROOT, ".obsidian/plugins/obsidian-qualia-coding/data.json");
const BACKUP_PATH = DATA_PATH + ".bak";

// ─── Helpers ─────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

const NOW = Date.now();
const daysAgo = (d) => NOW - d * DAY;
const at = (daysAgoVal, hour = 14) => daysAgo(daysAgoVal) + hour * HOUR;

let _idCounter = 0;
const auditId = () => `audit_${Date.now().toString(36)}_seed${(_idCounter++).toString(36)}`;

let _codeCounter = Math.floor(Math.random() * 9000);
const codeId = () => `c_demo_${(_codeCounter++).toString(36)}`;

// ─── Data load + backup ──────────────────────────────────

if (!fs.existsSync(DATA_PATH)) {
	console.error(`[ERROR] data.json não encontrado em: ${DATA_PATH}`);
	console.error("Abra o vault no Obsidian uma vez pra plugin gerar o data.json inicial, depois rode esse script de novo.");
	process.exit(1);
}

const raw = fs.readFileSync(DATA_PATH, "utf-8");
fs.writeFileSync(BACKUP_PATH, raw);
console.log(`Backup criado: ${BACKUP_PATH}`);

const data = JSON.parse(raw);

// Garante estrutura mínima caso seja vault novo
data.registry = data.registry ?? { definitions: {}, nextPaletteIndex: 0, folders: {}, folderOrder: [], rootOrder: [], groups: {}, groupOrder: [], nextGroupPaletteIndex: 0 };
data.auditLog = data.auditLog ?? [];

// ─── Cleanup demo prévio (idempotente) ───────────────────

const demoCodeIds = Object.values(data.registry.definitions)
	.filter(c => c.name?.startsWith("Demo · "))
	.map(c => c.id);

if (demoCodeIds.length > 0) {
	console.log(`Removendo ${demoCodeIds.length} demo codes anteriores...`);
	for (const id of demoCodeIds) {
		delete data.registry.definitions[id];
	}
	data.registry.rootOrder = data.registry.rootOrder.filter(id => !demoCodeIds.includes(id));
	// Remove auditLog entries dos demo codes anteriores
	data.auditLog = data.auditLog.filter(e => !demoCodeIds.includes(e.codeId));
}

// ─── Define os 8 demo codes ──────────────────────────────

const PALETTE = [
	"#e85a4f", "#f49b42", "#f7d046", "#76c043",
	"#42b3a4", "#3a90cc", "#7c5cd1", "#d05ec8",
];

const codes = [
	{
		id: codeId(),
		finalName: "Demo · Wellbeing > Burnout",
		// Timeline:
		// d-28: created como "wellbeing"
		// d-25: rename pra "Wellbeing"
		// d-22: description short ("Sintomas de exaustão.")
		// d-22 (+5min): description coalesced ("Sintomas de exaustão. Inclui despersonalização.")
		// d-22 (+15min): description coalesced ("Sintomas de exaustão. Inclui despersonalização. Maslach.")
		// d-15: memo edit
		// d-10: memo edit + 5min depois (coalesced)
		// d-7: rename pra "Wellbeing > Burnout"
		// d-3: absorbed "wellness"
	},
	{
		id: codeId(),
		finalName: "Demo · Wellbeing > Stress",
		// d-26: created "stress"
		// d-20: rename pra "Stress (post-event)"
		// d-18: description
		// d-12: description editada (sessão nova, > 60s)
		// d-7: rename pra "Wellbeing > Stress"
	},
	{
		id: codeId(),
		finalName: "Demo · Coping",
		// d-24: created
		// d-22: description
		// d-15: memo
		// d-8: description revisada (NOVA sessão)
	},
	{
		id: codeId(),
		finalName: "Demo · Resilience",
		// d-21: created
		// d-19: description
		// d-14: memo
		// d-10: 3x description em 30s (coalesced em 1)
	},
	{
		id: codeId(),
		finalName: "Demo · Autonomy",
		// d-19: created
		// d-15: memo
		// d-10: rename
	},
	{
		id: codeId(),
		finalName: "Demo · Workplace climate",
		// d-17: created
		// d-12: description
		// d-5: memo
	},
	{
		id: codeId(),
		finalName: "Demo · [DELETED] Tossed early",
		// d-23: created como "Just an idea"
		// d-22: rename "Tossed early"
		// d-21: deleted (tombstone fica preservado)
	},
	{
		id: codeId(),
		finalName: "Demo · [DELETED] Wellness (merged)",
		// d-25: created "wellness"
		// d-23: description "Versão informal do wellbeing."
		// d-3: merged_into "Wellbeing > Burnout"
	},
];

const [c0, c1, c2, c3, c4, c5, deleted_tossed, deleted_wellness] = codes;

// ─── Cria os live codes no registry ──────────────────────
// (códigos deletados não vão pro registry — só aparecem no auditLog como tombstone)

const liveCodes = [c0, c1, c2, c3, c4, c5];
let paletteIdx = 0;
for (const c of liveCodes) {
	data.registry.definitions[c.id] = {
		id: c.id,
		name: c.finalName,
		color: PALETTE[paletteIdx % PALETTE.length],
		paletteIndex: paletteIdx,
		createdAt: at(28 - paletteIdx),
		updatedAt: NOW,
		childrenOrder: [],
		description: paletteIdx % 2 === 0
			? `Operational definition (last edit). Code seeded by demo script ${new Date().toISOString().slice(0, 10)}.`
			: undefined,
		memo: paletteIdx % 3 === 0
			? `Reflexão analítica processual. Última edição via demo seed.`
			: undefined,
	};
	data.registry.rootOrder.push(c.id);
	paletteIdx++;
}

// ─── Audit log entries — timeline rica ───────────────────

function push(entry) {
	data.auditLog.push({ id: auditId(), ...entry });
}

// — c0: Wellbeing > Burnout (timeline mais rica) ───────
push({ codeId: c0.id, at: at(28, 9),  type: "created" });
push({ codeId: c0.id, at: at(25, 14), type: "renamed", from: "wellbeing", to: "Wellbeing" });
push({ codeId: c0.id, at: at(22, 10), type: "description_edited", from: "", to: "Sintomas de exaustão. Inclui despersonalização. Maslach (1981)." });
push({ codeId: c0.id, at: at(15, 16), type: "memo_edited", from: "", to: "Vincula com Burnout post-pandemia. Saturação ainda não atingida." });
push({ codeId: c0.id, at: at(10, 11), type: "memo_edited", from: "Vincula com Burnout post-pandemia. Saturação ainda não atingida.", to: "Saturação atingida na 12a entrevista. Refinar definição operacional." });
push({ codeId: c0.id, at: at(7, 13),  type: "renamed", from: "Wellbeing", to: "Wellbeing > Burnout" });
push({ codeId: c0.id, at: at(3, 15),  type: "absorbed", absorbedNames: ["wellness"], absorbedIds: [deleted_wellness.id] });

// — c1: Wellbeing > Stress ───────────────────────────
push({ codeId: c1.id, at: at(26, 10), type: "created" });
push({ codeId: c1.id, at: at(20, 14), type: "renamed", from: "stress", to: "Stress (post-event)" });
push({ codeId: c1.id, at: at(18, 11), type: "description_edited", from: "", to: "Resposta aguda a evento estressor pontual." });
push({ codeId: c1.id, at: at(12, 17), type: "description_edited", from: "Resposta aguda a evento estressor pontual.", to: "Resposta aguda a evento estressor pontual. Distinta de stress crônico (ver Burnout)." });
push({ codeId: c1.id, at: at(7, 14),  type: "renamed", from: "Stress (post-event)", to: "Wellbeing > Stress" });

// — c2: Coping ───────────────────────────────────────
push({ codeId: c2.id, at: at(24, 10), type: "created" });
push({ codeId: c2.id, at: at(22, 13), type: "description_edited", from: "", to: "Estratégias deliberadas pra lidar com stress." });
push({ codeId: c2.id, at: at(15, 15), type: "memo_edited", from: "", to: "Lazarus & Folkman framework. Considerar problem-focused vs emotion-focused." });
push({ codeId: c2.id, at: at(8, 11),  type: "description_edited", from: "Estratégias deliberadas pra lidar com stress.", to: "Estratégias conscientes pra regular o impacto de stressors. Inclui evitar e reframing." });

// — c3: Resilience (3 description edits coalesced em 1) ─
// No real flow, 3 saves dentro de 60s viram 1 entry. Aqui simulo isso direto: só a entry final.
push({ codeId: c3.id, at: at(21, 10), type: "created" });
push({ codeId: c3.id, at: at(19, 14), type: "description_edited", from: "", to: "Capacidade de recuperação." });
push({ codeId: c3.id, at: at(14, 11), type: "memo_edited", from: "", to: "Conceito psicológico × organizacional. Decidir foco." });
// Coalesced session — entry única representa 3 saves em janela de 60s
push({ codeId: c3.id, at: at(10, 16), type: "description_edited", from: "Capacidade de recuperação.", to: "Capacidade de recuperação após adversidade, com aprendizado e adaptação. Construct multi-dimensional." });

// — c4: Autonomy ─────────────────────────────────────
push({ codeId: c4.id, at: at(19, 11), type: "created" });
push({ codeId: c4.id, at: at(15, 14), type: "memo_edited", from: "", to: "SDT (Deci & Ryan). Necessidade básica." });
push({ codeId: c4.id, at: at(10, 13), type: "renamed", from: "autonomy", to: "Autonomy" });

// — c5: Workplace climate ────────────────────────────
push({ codeId: c5.id, at: at(17, 10), type: "created" });
push({ codeId: c5.id, at: at(12, 15), type: "description_edited", from: "", to: "Percepção compartilhada do ambiente psicológico no trabalho." });
push({ codeId: c5.id, at: at(5, 11),  type: "memo_edited", from: "", to: "Schneider & Reichers (1983). Considerar dimensões: safety, fairness, support." });

// — deleted_tossed: criado e deletado (tombstone) ────
push({ codeId: deleted_tossed.id, at: at(23, 10), type: "created" });
push({ codeId: deleted_tossed.id, at: at(22, 14), type: "renamed", from: "Just an idea", to: "Tossed early" });
push({ codeId: deleted_tossed.id, at: at(21, 16), type: "deleted" });

// — deleted_wellness: merged_into c0 (preservado pelo log central) ─
push({ codeId: deleted_wellness.id, at: at(25, 11), type: "created" });
push({ codeId: deleted_wellness.id, at: at(23, 14), type: "description_edited", from: "", to: "Versão informal do wellbeing. Possível merge candidato." });
push({ codeId: deleted_wellness.id, at: at(3, 15),  type: "merged_into", intoId: c0.id, intoName: "Wellbeing > Burnout" });

// — Algumas entries pré-hidden pra demo do soft-delete ─
// Última edit de c2 description marcada hidden (pesquisador "removeu" do log público)
const c2LastDesc = data.auditLog.filter(e => e.codeId === c2.id && e.type === "description_edited").pop();
if (c2LastDesc) c2LastDesc.hidden = true;

// Memo edit de c3 marcado hidden
const c3Memo = data.auditLog.find(e => e.codeId === c3.id && e.type === "memo_edited");
if (c3Memo) c3Memo.hidden = true;

// ─── Save ────────────────────────────────────────────────

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

console.log("");
console.log("✓ Dataset sintético criado.");
console.log(`  • ${liveCodes.length} demo codes vivos no registry`);
console.log(`  • 2 codes deletados/merged preservados como tombstones no auditLog`);
console.log(`  • ${data.auditLog.filter(e => codes.some(c => c.id === e.codeId)).length} audit entries totais`);
console.log(`  • 2 entries pré-hidden (toggle "Show hidden" pra ver)`);
console.log("");
console.log("Próximo passo: recarrega o plugin no Obsidian (Settings → Community plugins → toggle off/on).");
console.log('Depois abre Code Detail em qualquer "Demo · *" pra ver a seção History.');
console.log(`Pra desfazer: cp ${BACKUP_PATH} ${DATA_PATH}`);
