# Convert memo to note — Design

> Data: 2026-04-30
> Status: aprovado pra implementação
> Origem: ROADMAP.md §"Analytical Memos" (linhas 226-289)
> Estimativa: 1.5-2 sessões / 10-15h

## Contexto

O plugin entrega memos inline em 5 superfícies (Code Detail, Group popover, Marker textarea, Code-level relation ✎ button, App-level relation schema-ready). Demanda: materializar memo como arquivo `.md` no vault pra destravar ferramental Obsidian (backlinks, graph view, Templater) em memos analíticos longos.

**Demanda é sintética** (não veio de pesquisador real). Validação será via uso direto pelo dev por 2 semanas em research real, com decisão posterior de manter+polir ou archive.

## Escopo

### Phase 1 (este spec)
Apenas **Code memo**. Arquitetura genérica desde o início pra extensão a Group/Marker/Relation sem refactor — schema, listeners, helpers e Settings já nascem prontos pros 4 tipos.

### Fora do escopo (extensão futura)
- Group memo → nota
- Marker memo → nota
- Relation memo (code-level e app-level) → nota
- Templater integration (template customizado pelo user)
- Materialização batch (converter N codes de uma vez)

## Decisões de design

### D1 — Schema breaking, não aditivo

Hoje: `memo?: string` em `CodeDefinition`, `GroupDefinition`, `BaseMarker`, `CodeRelation`.
Novo: `memo?: { content: string; materialized?: { path: string; mtime: number } }`.

**Razão:** memo é uma coisa só conceitualmente. Schema aditivo (`memo` + `memoFile?` paralelos) inventaria sincronização desnecessária e fonte de bug. CLAUDE.md autoriza breaking change (zero usuários, sem backcompat).

**Custo:** ~30-40 pontos de toque mecânico (read sites `def.memo` → `def.memo?.content`; write sites `{ memo: val }` → `{ memo: { content: val, materialized: prev?.materialized } }`). Afeta:
- `detailCodeRenderer.ts` (textarea + save)
- `detailMarkerRenderer.ts` (textarea + save)
- `baseCodingMenu.ts` (memo section)
- `codeDefinitionRegistry.ts` (`update`, `setGroupMemo`, `setRelationMemo`)
- `qdcExporter.ts` / `qdpxExporter.ts` / `qdcImporter.ts` / `qdpxImporter.ts`
- `buildCodesTable.ts` / `buildGroupsTable.ts` / `buildRelationsTable.ts`
- `memoView/onSaveHandlers.ts` + `renderMemoEditor.ts` + `renderCodeSection.ts` + `renderFileSection.ts` + `renderMarkerCard.ts`
- `auditLog.ts` (audit trail de `memo_edited` lê valor antigo)

### D2 — Endereçamento universal `EntityRef`

Cada `.md` materializado precisa saber qual entidade espelha. Frontmatter usa `qualiaMemoOf: <type>:<id>` + `qualiaCodeName: <displayName>` (espelho cosmético, fonte de verdade é o id):

```yaml
---
qualiaMemoOf: code:abc123
qualiaCodeName: Wellbeing
---
```

```ts
type EntityRef =
  | { type: 'code'; id: string }
  | { type: 'group'; id: string }
  | { type: 'marker'; engineType: EngineType; id: string }
  | { type: 'relation-code'; codeId: string; label: string; target: string }
  | { type: 'relation-app'; engineType: EngineType; markerId: string; codeId: string; label: string; target: string };
```

**Phase 1 só usa `'code'`.** Os outros 4 ficam na union pra TypeScript guiar extensão sem refactor.

### D3 — Localização: pasta por tipo, configurável

Settings ganha bloco novo:

```ts
memoFolders: {
  code: string;     // default 'Analytic Memos/Codes/'
  group: string;    // default 'Analytic Memos/Groups/'
  marker: string;   // default 'Analytic Memos/Markers/'
  relation: string; // default 'Analytic Memos/Relations/'
}
```

Phase 1 só consome `code`. Os 4 paths nascem juntos (Settings tab já mostra os 4 inputs) pra extensão futura não precisar tocar Settings.

**Fallback:** se path do setting é inválido (ex: user apagou pasta), `vault.createFolder` cria sob demanda no Convert.

### D4 — Estado materializado: card substitui textarea

Quando `def.memo?.materialized` existe, `detailCodeRenderer` renderiza:

```
┌─────────────────────────────────────────┐
│ 📄 Materialized at                      │
│    Analytic Memos/Codes/Wellbeing.md    │
│                                         │
│    [Open]  [Unmaterialize]              │
└─────────────────────────────────────────┘
```

- **Open** → `app.workspace.getLeaf().openFile(file)` em nova aba
- **Unmaterialize** → remove `materialized`, textarea inline volta. `.md` vira órfão (não deletado pelo plugin; user decide)

**Razão:** source of truth visualmente clara. "Editar aqui ou no .md?" não existe — quando materialized, edita no .md.

### D5 — Convert: 1 click, abre o arquivo

Botão `[Convert to note]` ao lado do `<h6>Memo</h6>` no Code Detail. Click:

1. Resolve `path = settings.memoFolders.code + sanitize(code.name) + '.md'`
2. Se path já existe (outro arquivo), aplica sufixo `(2)`, `(3)`...
3. Cria arquivo via `vault.create(path, serialize(frontmatter, content))` onde `content = code.memo?.content ?? ''`
4. Atualiza `code.memo = { content, materialized: { path, mtime: file.stat.mtime } }`
5. Abre arquivo em nova aba via `workspace.getLeaf().openFile(file)`

Se `code.memo` era undefined, conteúdo inicial é vazio (cria `.md` em branco abaixo do frontmatter).

### D6 — Reatividade: vault listeners + self-write tracker

Listeners no `onload` do plugin:

| Evento | Handler | Comportamento |
|---|---|---|
| `vault.on('modify', file)` | `onMaterializedFileModified` | Se `file.path` está no reverse-lookup map, lê `vault.read(file)`, faz parse do frontmatter, atualiza `entity.memo.content` no data.json, refresh memoView/Code Detail. Ignora se `file.path ∈ selfWriting`. |
| `vault.on('rename', file, oldPath)` | `onMaterializedFileRenamed` | Se `oldPath` está no map, atualiza `materialized.path` da entidade pra `file.path`. Reconstrói entry do map. |
| `vault.on('delete', file)` | `onMaterializedFileDeleted` | Se `file.path` está no map, remove `materialized` da entidade. **`memo.content` preservado** — entidade volta a modo inline. Remove entry do map. |

**Reverse-lookup:** `Map<string, EntityRef>` (key: path) construído no `onload` varrendo registry/markers, atualizado a cada Convert/rename/delete. Sem isso, cada vault event seria O(n) sobre todas entidades.

**Self-write tracker:** `Set<string>` (paths sendo escritos pelo plugin). Convert/popover-edit adicionam path antes do `vault.modify`, removem no microtask seguinte (queueMicrotask). Listener `modify` ignora paths nesse set.

### D7 — Edge cases

| Caso | Comportamento |
|---|---|
| Frontmatter `qualiaMemoOf` deletado pelo user à mão | No próximo `modify`, listener detecta ausência, remove `materialized` da entidade (mesmo efeito de delete). Sem erro ruidoso. |
| User renomeia `.md` | `rename` listener atualiza `materialized.path`. Funciona. |
| User move `.md` pra outra pasta | Mesmo fluxo de rename (Obsidian dispara `rename` em moves). Funciona. |
| User deleta entidade (code) | Convert flow remove o materialized; `.md` órfão fica no vault. User decide deletar. |
| User deleta `.md` | `materialized` removido, content preservado, textarea volta. |
| Code é deletado por merge | Mesmo de "user deleta entidade". Sem comportamento especial pra merge. |
| Conflito de path no Convert | Sufixo `(2)`, `(3)`... automático. Sem modal. |
| Settings.memoFolders.code mudado depois de já ter `.md`s materializados | Arquivos existentes ficam onde estão (path já registrado em `materialized.path`). Novos Converts vão pro novo path. |
| Frontmatter editado/quebrado pelo user (YAML inválido) | Listener tenta parse, falha graciosamente, faz log no console, **não** propaga mudança. User vê comportamento "edição não salvou" e abre console se quiser entender. |
| `.md` aberto e popover editando o memo simultâneo | Não pode acontecer com D4 — popover/textarea inline some quando materialized. Estado materializado tem só os botões Open/Unmaterialize. |

## Componentes novos

```
src/core/
  memoMaterializerTypes.ts        — EntityRef (discriminated union), MaterializedRef
  memoMaterializer.ts             — convert(), unmaterialize(), syncToFile(), syncFromFile(),
                                    resolveConflictPath(), parseFrontmatter(), serializeNote()
  memoMaterializerListeners.ts    — registerListeners(), reverse-lookup Map, selfWriting Set,
                                    handlers (modify/rename/delete)
```

## Componentes alterados

| Arquivo | Mudança |
|---|---|
| `src/core/types.ts` | `memo?: string` → `memo?: { content, materialized? }` em 4 entidades |
| `src/core/codeDefinitionRegistry.ts` | `update()` aceita `memo: string \| { content }`, normaliza pra objeto interno; preserva `materialized` em mutações de content |
| `src/core/detailCodeRenderer.ts` | Render condicional textarea vs card; botão Convert |
| `src/main.ts` | Registra listeners no `onload`, popula reverse-lookup map |
| `src/core/settings.ts` (ou equivalente) | `memoFolders` block com 4 paths |
| Settings tab UI | 4 text inputs pros paths |
| `src/core/auditLog.ts` | Audit `memo_edited` lê `def.memo?.content ?? ''` (não muda comportamento, só accessor) |
| `qdcExporter`, `qdpxExporter`, `qdcImporter`, `qdpxImporter` | Lê/escreve `memo.content` em vez de `memo` direto |
| `buildCodesTable`, `buildGroupsTable`, `buildRelationsTable` | Idem |
| `memoView/*` (5 arquivos) | Idem |
| `detailMarkerRenderer.ts`, `baseCodingMenu.ts` | Idem (memo de marker e popover existente, sem materializar) |

## Testing

### Unit (puros, jsdom)
- `parseFrontmatter` — valid, missing keys, invalid YAML, extra keys
- `serializeNote` — round-trip com `parseFrontmatter`
- `resolveConflictPath` — base livre, base ocupado, sequência (2)/(3)/(4)
- `EntityRef` serialize/deserialize (`code:abc123` ↔ `{ type: 'code', id: 'abc123' }`)
- Schema migration helpers (read sites com fallback `def.memo?.content ?? ''`)

### Integration (vault.adapter mockado)
- Convert cria arquivo, popula `materialized`, abre file (workspace mock)
- `vault.modify` no .md → entidade atualizada
- `vault.rename` → `materialized.path` atualizado
- `vault.delete` → `materialized` removido, content preservado
- Self-write suprime loop (escrever via syncToFile não dispara syncFromFile)
- Frontmatter inválido → no-op + console.warn
- Conflito de path no Convert (criar 3 codes "Wellbeing" seguidos)

### Smoke manual no workbench
- Convert + edit no .md + verificar memoView
- Unmaterialize, conferir textarea de volta com content preservado
- Delete .md, conferir textarea de volta
- Rename .md, conferir Open continua funcionando
- Editar frontmatter (deletar `qualiaMemoOf`), conferir desmaterialização graciosa
- Round-trip QDPX export/import com memo materializado (memo deve sair no `<MemoText>` igual a memo inline)

## Risco

| Risco | Mitigação |
|---|---|
| Self-write loop (modify dispara syncFromFile que dispara syncToFile que dispara modify...) | `Set<string> selfWriting` + queueMicrotask cleanup. Pattern conhecido (Templater faz parecido). |
| Reverse-lookup desatualizado | Reconstruído no `onload`. Atualizado em todos os caminhos que mexem em `materialized` (Convert, rename listener, delete listener, Unmaterialize). |
| Migração schema quebra audit log de memos pré-existentes | Audit `memo_edited.from/to` são strings literais; novo accessor `memo?.content ?? ''` retorna string vazia pra entidades sem memo. Sem quebra. |
| Workbench vault tem entidades com `memo?: string` no data.json atual | Migration one-shot no `onload` (CLAUDE.md autoriza): se `typeof def.memo === 'string'`, converter pra `{ content: def.memo }`. Roda 1 vez, persistido no próximo save. |

## Não-objetivos

- Templates customizados (Templater integration)
- Materialização batch
- Sincronização do `qualiaCodeName` quando user renomeia o code (cosmético — fica desatualizado, sem efeito funcional)
- Reconciliação se user editar o frontmatter pra apontar `qualiaMemoOf` pra outro code (comportamento nulo aceitável)
- UI pra Group/Marker/Relation memos (Phase 1 = Code only)

## Métrica de sucesso (decisão pós-spike)

Marlon usa por 2 semanas em research real. Critério de decisão (ROADMAP linha 282):
- **Manter+polir:** 3+ memos materializados em uso ativo + benefício percebido (backlinks, graph)
- **Archive:** uso esporádico ou abandono, "popover inline já bastava"

Se manter, próxima fase = estender pros 3 tipos restantes (mecânico, mesmo schema/listener).
