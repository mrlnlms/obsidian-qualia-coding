# Memos em todas as entidades — Design

**Data:** 2026-04-27
**Status:** Design aprovado, pronto pra plano de implementação
**ROADMAP:** §3 Analytics — melhorias (parte do "Analytic Memo View" — esta feature é o pré-requisito; a view consumidora vem depois)

---

## Contexto

Hoje só **markers** têm campo `memo`. Outras entidades onde reflexão analítica faria sentido (códigos, grupos, relações) só têm `description` (ou nada). A distinção é importante na metodologia QDA:

- `description` = **definição operacional** ("frustração: sentimento de impotência diante de obstáculo") — sai no codebook export, é consensual
- `memo` = **reflexão analítica processual** ("comecei codificando frustração mas percebi sobreposição com tédio em RQ2") — é histórico de pensamento, evolui durante análise

Atlas.ti, MAXQDA e NVivo separam os dois. Padrão da indústria. O spec original do ROADMAP propunha "Analytic Memo View" no Analytics, mas isso depende de existir memo em entidades além de marker.

**Esta feature** adiciona o campo `memo` em `CodeDefinition`, `GroupDefinition` e `CodeRelation`, mais a UI mínima pra editar e os hooks de export/import. **Não inclui** view consumidora no Analytics — fica pra próxima sessão.

**Alternativa rejeitada:** comando "Convert to Note" (cria `.md` no vault em vez de campo no plugin). Reavaliada e descartada nesta sessão — o caminho do `.md` é interessante mas precisa decisão arquitetural separada (convenção de link entre nota e entidade do plugin). Hoje, o pesquisador precisa escrever memo durante a análise, não há razão pra esperar essa decisão.

---

## Decisões de design

| # | Decisão | Resposta |
|---|---------|----------|
| 1 | Campo separado de `description` | Sim — `memo?: string` ao lado, semântica distinta |
| 2 | Entidades que ganham memo | `CodeDefinition`, `GroupDefinition`, `CodeRelation` |
| 3 | Document memo | Fora — Obsidian já dá nativo (frontmatter + body do `.md`) |
| 4 | Identidade de relation pra editar memo | Por índice no array — relations são append/delete, sem reorder. Não precisa adicionar `id` ao `CodeRelation` (overengineering pra zero usuários) |
| 5 | UI Code memo | Seção dedicada no Code Detail (`detailCodeRenderer.ts`) abaixo de description, mesmo pattern do marker memo (textarea com chevron expandível) |
| 6 | UI Group memo | Campo inline abaixo de description no `codeGroupsPanel.ts` (mesmo pattern do description editável) |
| 7 | UI Relation memo | Botão `✎` ao lado de cada relation row → popover com textarea pra editar memo |
| 8 | UI Code popover | Memo de code **não** editável dentro do popover de coding. Edição só no Code Detail. Popover continua focado em aplicar código + memo do **marker** |
| 9 | Export QDPX | `<Description>` continua emit; **adicionar** `<MemoText>` em `<Code>`, `<Set>` e `<Link>` quando memo presente |
| 10 | Export CSV tabular | Adicionar coluna `memo` em `codes.csv`, `groups.csv` e `relations.csv` |
| 11 | Import QDPX | Parse `<MemoText>` → preencher `memo` na entidade |
| 12 | Persistência / migration | Schema aditivo (campos opcionais). Zero usuários — sem migration code |
| 13 | Registry helpers | `setCodeMemo(id, memo)`, `setGroupMemo(id, memo)`, `setRelationMemo(codeId, relationIndex, memo)` |
| 14 | Application-level relations (em `CodeApplication.relations`) | Mesmo schema (`memo?` no `CodeRelation`); UI de edição **fora** desta feature (popover de coding já é denso). Schema-ready apenas |

---

## Arquitetura

### Schema (src/core/types.ts)

```ts
export interface CodeRelation {
  label: string;
  target: string;
  directed: boolean;
  memo?: string;  // NEW — reflexão analítica sobre essa relação
}

export interface CodeDefinition {
  // ...existing fields
  description?: string;  // já existe
  memo?: string;         // NEW — reflexão analítica processual
  // ...
}

export interface GroupDefinition {
  // ...existing fields
  description?: string;  // já existe
  memo?: string;         // NEW
  // ...
}
```

### Registry (src/core/codeDefinitionRegistry.ts)

Adicionar 3 métodos seguindo pattern dos setters existentes (`setCodeColor`, `setGroupDescription`, etc.):

```ts
setCodeMemo(id: string, memo: string): void
setGroupMemo(id: string, memo: string): void
setRelationMemo(codeId: string, relationIndex: number, memo: string): void
```

Cada um:
1. Atualiza in-place
2. Persiste via `data.json`
3. Emite `onMutate` callback (usado pro cache invalidation)

`memo` vazio (`""`) = remover campo (`delete obj.memo`) pra manter JSON enxuto. Mesmo pattern usado em `setGroupDescription`.

### UI

**`detailCodeRenderer.ts`** — adiciona após renderização de description:

```
[Existente: nome, color picker, hierarchy, description]
NEW:
[Memo section]
  ▼ Memo (chevron expandível)
    [textarea expandable on focus, similar a marker memo em detailMarkerRenderer.ts:97-140]
[Continua: groups, markers list]
```

Pattern de referência: `detailMarkerRenderer.ts:97-140` — `codemarker-detail-section` + textarea com auto-save no blur/debounce.

**`codeGroupsPanel.ts`** — quando user clica num group pra editar (já abre painel inline com nome + description editáveis), adicionar campo `memo` abaixo de description:

```
Group: [nome editável]
Color: [picker]
Description: [textarea inline]      <- existe
Memo: [textarea inline]              <- NEW
```

Mesmo pattern de "click pra editar inline + save no blur" do description existente.

**`baseCodingMenu.ts:renderRelationsSection`** + **`relationUI.ts:renderAddRelationRow`** — cada relation row hoje é:

```
[label] [target] [directional? toggle] [×]
```

Adicionar:

```
[label] [target] [directional? toggle] [✎ edit-memo] [×]
                                        ^^^
                                        NEW: clica → abre popover com textarea pra memo
```

Popover de edit usa pattern dos popovers existentes do plugin (ex: PromptModal multiline). Salva via `registry.setRelationMemo(codeId, relationIndex, memo)`.

### Export

**QDPX** (`src/export/qdcExporter.ts`):

```xml
<!-- antes -->
<Code guid="..." name="frustacao" color="#FF0000">
  <Description>sentimento de impotência</Description>
</Code>

<!-- depois (quando memo presente) -->
<Code guid="..." name="frustacao" color="#FF0000">
  <Description>sentimento de impotência</Description>
  <MemoText>comecei codificando frustração mas percebi sobreposição...</MemoText>
</Code>
```

Idem em `<Set>` (groups) e `<Link>` (code-level relations).

REFI-QDA 1.5 spec aceita `<MemoText>` como child de `<Code>`, `<Set>`, `<Link>` — não é extensão custom. Se memo vazio, omite o elemento.

**CSV tabular**:

| Tabela | Header novo |
|---|---|
| `codes.csv` | `..., description, memo, ...` |
| `groups.csv` | `..., description, memo` |
| `relations.csv` | `..., directed, memo` |

Memo vazio = string `""` na cell.

### Import

**QDPX** (`src/import/qdcImporter.ts`, `src/import/qdpxImporter.ts`):

- Parse `<MemoText>` em `<Code>`, `<Set>`, `<Link>` — popular `memo` correspondente na entidade criada
- Quando QDPX externo (Atlas.ti/MAXQDA) tem `<MemoText>` mas não `<Description>`, usa o que tiver
- Conflito com import — se tipo entidade já existe no vault e arquivo importado tem memo, **merge**: anexa novo memo como `\n\n--- Imported memo ---\n<conteúdo>` (mesmo pattern já usado em `qdcImporter.ts:132` pra description+memo de marker)

---

## Edge cases

| Caso | Comportamento |
|------|---------------|
| Memo vazio (`""` ou só whitespace) | Remove campo do objeto (delete obj.memo) — JSON enxuto |
| Code/Group deletado | Memo vai junto (cascade natural) |
| Relation deletada do array | Memo vai junto (mesmo array) |
| Relation reordenada | **Não acontece hoje** — relations são append-only. Se um dia houver reorder, índice fica frágil. Documentar como TODO se aparecer |
| Import QDPX com memo > 10KB | Sem truncamento — REFI-QDA não impõe limite, deixa passar |
| Import com memo + description ambos no XML | Preserva os dois separados |
| Merge import (entidade pré-existente com memo + memo importado) | Anexa: `<existente>\n\n--- Imported memo ---\n<importado>` |

---

## Testing

### Unit (Vitest + jsdom)

| Arquivo | Cobertura |
|---|---|
| `tests/core/codeDefinitionRegistry.test.ts` (existente, ampliar) | `setCodeMemo` set/get/empty-string-deletes; `setGroupMemo` idem; `setRelationMemo` por índice; `onMutate` chamado em cada |
| `tests/export/qdcExporter.test.ts` (existente, ampliar) | `<MemoText>` emit em Code, Set, Link quando memo presente; omitido quando vazio |
| `tests/import/qdcImporter.test.ts` (existente, ampliar) | `<MemoText>` parsed em Code, Set, Link; conflito merge |
| `tests/export/tabular/buildCodesTable.test.ts` (existente, ampliar) | coluna `memo` populada |
| `tests/export/tabular/buildGroupsTable.test.ts` (existente) | idem |
| `tests/export/tabular/buildRelationsTable.test.ts` (existente) | idem |

### Smoke manual obrigatório (memory `feedback_validate_dom_contract`)

Vault `obsidian-plugins-workbench` — após cada chunk:

1. Abrir Code Detail de um código → editar memo → fechar e reabrir → memo persistiu ✓
2. Abrir Group editor → editar memo → fechar e reabrir → memo persistiu ✓
3. Abrir Code Detail → adicionar relation → clicar ✎ → editar memo → salvar → reabrir popover → memo persistiu ✓
4. Export QDPX → abrir XML → conferir `<MemoText>` em `<Code>`, `<Set>`, `<Link>` ✓
5. Import QDPX → conferir memos preservados ✓
6. Export CSV tabular → abrir codes.csv / groups.csv / relations.csv → coluna `memo` populada ✓

---

## Fora do escopo (futuro separado)

- **Analytic Memo View** — visualização no Analytics que agrega memos (markers + codes + groups) por código/source. Esta é a feature consumidora; será spec/plan próprio depois desta merge
- **Memo em CodeApplication.relations** (application-level) — schema vai junto (`CodeRelation.memo` cobre os dois usos), mas UI de edição em popover de coding fica fora — popover de coding já é denso
- **Convert to Note** — comando que cria `.md` no vault com template. Decisão arquitetural pendente (convenção de link)
- **Memo em Document** — Obsidian já dá nativo
- **Memo history / version tracking** — sem
- **Rich text em memo** — só plain text no campo

---

## Estimativa

~2-3h. Distribuída em chunks com smoke checkpoint a cada um:

1. **Schema + registry helpers** (~30min) — types.ts + 3 setters + tests
2. **Code memo UI** (~30min) — Code Detail seção memo + tests
3. **Group memo UI** (~30min) — codeGroupsPanel inline + tests
4. **Relation memo UI** (~45min) — botão ✎ + popover edit + tests
5. **Export/Import QDPX + CSV tabular** (~30min) — emit/parse `<MemoText>` + colunas memo
6. **Smoke manual + ajustes finais** (~15min)

---

## Não-impacto

- Analytics existentes (frequency, cooccurrence, evolution, code-metadata, etc.) — não consomem memo, sem mudanças
- Marker memo — sem mudança (já existia)
- `data.json` schema — apenas 3 campos novos opcionais (vault existente continua válido)
- Performance — campos opcionais, sem hot path novo
