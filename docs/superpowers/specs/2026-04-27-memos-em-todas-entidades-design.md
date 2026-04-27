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
| 4 | Identidade de relation pra editar memo | Por **tupla `(label, target)` snapshot** — mesmo pattern já usado pro delete em `baseCodingMenu.ts:585`. Setter recebe `(codeId, label, target, memo)`, filtra primeiro match, atualiza. Limite conhecido (relations duplicadas — `(label, target)` repetido — só o primeiro é atualizado) é o **mesmo limite do delete existente**, documentado mas aceito. **Não** adicionar `id` ao `CodeRelation` |
| 5 | UI Code memo | Seção dedicada no Code Detail (`detailCodeRenderer.ts`) abaixo de description, **plain textarea** (3 rows), idêntica ao marker memo em `detailMarkerRenderer.ts:91-113`. **Sem chevron expandível** (chevron é pattern de outros componentes, não do marker memo) |
| 6 | UI Group memo | Campo inline abaixo de description no `codeGroupsPanel.ts` (mesmo pattern do description editável) |
| 7 | UI Relation memo | Botão `✎` ao lado de cada relation row existente **somente em `detailCodeRenderer.ts:670-733`** (a função `renderRelationsSection` local, que itera as existing rows pra um Code — code-level). Click → popover com textarea → save. **NÃO modificar:** (a) `baseCodingMenu.ts:498+` (popover de coding aplicado, application-level); (b) `detailMarkerRenderer.ts:180-215` (Marker Detail, application-level); (c) `relationUI.ts:renderAddRelationRow` (esse é o **add row** com inputs label/target, não tem relation existente pra editar memo) |
| 8 | UI Code popover (coding aplicação) | Memo de code **não** editável dentro do popover de coding. Edição só no Code Detail. Popover continua focado em aplicar código + memo do **marker** |
| 9 | Export QDPX | `<Description>` continua emit; **adicionar** `<MemoText>` em `<Code>`, `<Set>` e `<Link>` quando memo presente |
| 10 | Export CSV tabular | Adicionar coluna `memo` em `codes.csv`, `groups.csv` e `relations.csv` |
| 11 | Import QDPX | Parse `<MemoText>` → preencher `memo` na entidade |
| 12 | Persistência / migration | Schema aditivo (campos opcionais). Zero usuários — sem migration code |
| 13 | Registry helpers | **Code memo:** estende `update(id, changes)` existente (já aceita description/name/color/magnitude/relations) com `'memo'` no `Pick`. Mantém um único caminho de mutação pro Code. **Group memo:** `setGroupMemo(id, memo)` dedicado (consistente com `setGroupDescription`/`setGroupColor` existentes). **Relation memo:** `setRelationMemo(codeId, label, target, memo)` — identifica por tupla, atualiza primeiro match |
| 14 | Application-level relations (em `CodeApplication.relations`) | Mesmo schema (`memo?` no `CodeRelation` é compartilhado entre code-level e application-level — ver `types.ts:27-37`); UI de edição **fora** desta feature em **3 surfaces**: (a) `baseCodingMenu.ts:498+` popover de coding, (b) `detailMarkerRenderer.ts:180-215` Marker Detail, (c) Relations no popover de coding seguem sem ✎. Schema-ready: round-trip QDPX/CSV preserva memo de application-level mesmo sem UI |

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

**Code memo** — estende o `update(id, changes)` existente (~`codeDefinitionRegistry.ts:211`):

```ts
// Antes:
update(id: string, changes: Partial<Pick<CodeDefinition, 'name' | 'color' | 'description' | 'magnitude' | 'relations'>>)

// Depois (adiciona 'memo'):
update(id: string, changes: Partial<Pick<CodeDefinition, 'name' | 'color' | 'description' | 'memo' | 'magnitude' | 'relations'>>)
```

Body interno do `update()` segue **exatamente** o pattern do `description` existente (~linhas 227-229 hoje):

```ts
// Pattern existente (linha 227):
if (changes.description !== undefined) def.description = changes.description || undefined;

// Adicionar análogo:
if (changes.memo !== undefined) def.memo = changes.memo || undefined;
```

Predicate `changes.memo !== undefined` permite passar `""` pra explicitamente apagar o memo (vai virar `undefined` via `|| undefined`). `|| undefined` faz coerção de `""`/`null`/whitespace → `undefined`, que mantém JSON enxuto após save.

**Group memo** — método dedicado (consistente com `setGroupDescription`/`setGroupColor` existentes):

```ts
setGroupMemo(id: string, memo: string): void
```

**Relation memo** — método novo, identifica por tupla:

```ts
setRelationMemo(codeId: string, label: string, target: string, memo: string): boolean
// Retorna true se atualizou, false se nenhum (label,target) match
```

Comportamento comum aos 3:
1. Atualiza in-place (no caso de Code via `update()`, no caso dos outros direto)
2. Memo vazio (`""` ou só whitespace) = remove campo (`delete obj.memo`) pra manter JSON enxuto (mesmo pattern de `setGroupDescription`)
3. Emite `onMutate` callbacks → DataManager subscribed → save automático no `data.json` (não chamada explícita; pattern existente)

**Limite conhecido de `setRelationMemo`:** se houver relations duplicadas com mesmo `(label, target)`, atualiza só a primeira. Mesmo limite do delete existente em `baseCodingMenu.ts:585`. Aceito.

### UI

**`detailCodeRenderer.ts`** — adiciona após renderização de description:

```
[Existente: nome, color picker, hierarchy, description]
NEW:
[Memo section]
  Label "Memo"
  [textarea rows=3, plain (sem chevron), placeholder "Reflexão analítica…"]
  → save on blur (debounced)
[Continua: groups, markers list]
```

Pattern de referência: `detailMarkerRenderer.ts:91-113` — `codemarker-detail-section` com label + `<textarea rows={3}>` plain (sem chevron, sem expand-on-focus), auto-save via blur. **Replicar exatamente esse pattern** — não inventar UX nova.

**`codeGroupsPanel.ts`** — quando user clica num group pra editar (já abre painel inline com nome + description editáveis), adicionar campo `memo` abaixo de description:

```
Group: [nome editável]
Color: [picker]
Description: [textarea inline]      <- existe
Memo: [textarea inline]              <- NEW
```

Mesmo pattern de "click pra editar inline + save no blur" do description existente.

**Tocar APENAS em `detailCodeRenderer.ts:670-733`** — o loop `renderRelationsSection` local que itera `code.relations` e renderiza cada existing row. Adicionar `✎` ao lado do `×` na ~linha 715 (hoje só tem o remove button).

**NÃO tocar em:**
- `baseCodingMenu.ts:498+` (`renderRelationsSection` no popover de coding — application-level, fora #14)
- `detailMarkerRenderer.ts:180-215` (Marker Detail relation rows — também application-level, fora #14)
- `relationUI.ts:renderAddRelationRow` (esse é a **add row** com inputs label+target+Add — não há relation existente ali pra editar memo)

Cada existing relation row em Code Detail hoje é:

```
[label] [target] [directional? toggle] [×]
```

Adicionar:

```
[label] [target] [directional? toggle] [✎ edit-memo] [×]
                                        ^^^
                                        NEW: clica → abre popover com textarea pra memo
```

Popover de edit usa pattern de popovers existentes do plugin (ex: `PromptModal` multiline em `dialogs.ts`). Salva via `registry.setRelationMemo(codeId, label, target, memo)` — o componente já conhece label e target da row sendo editada (snapshot no momento do click; immune a deletes subsequentes).

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

REFI-QDA 1.5 spec aceita `<MemoText>` como child de `<Code>`, `<Set>`, `<Link>` (ver schema oficial em https://www.qdasoftware.org/refi-qda-codebook/ — `<MemoText>` é elemento padrão do REFI-QDA, não extensão custom). Se memo vazio, omite o elemento.

**Atenção a forma do elemento:**

- `<Code>` e `<Set>` hoje saem self-closing (`<Code .../>`) quando não têm filhos (ver `qdcExporter.ts:63-68, 92-97`). Quando memo presente, viram open/close. **Branch existente** `if (!descEl && children.length === 0)` em `buildCodeElement`/`buildSetElement` precisa adicionar memo na decisão (`if (!descEl && !memoEl && children.length === 0)`)
- `<Link>` em `qdpxExporter.ts:383, 398` hoje sai como linha única sem filhos. Quando memo presente, vira open/close. Re-arquitetar a emission line: single template literal → conditional inner block. **Tratar como sub-task separada do plan** — é a única mudança estrutural de emission (as outras são aditivas), fácil subestimar esforço

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
- Conflito com import — se tipo entidade já existe no vault e arquivo importado tem memo, **merge**: anexa novo memo como `\n\n--- Imported memo ---\n<conteúdo>`. **Decisão de implementação: criar `mergeMemos` como função separada análoga a `mergeDescriptions`** (5 linhas; mesmo separador `\n\n--- Imported memo ---\n`). Não parametrizar — pattern é tão simples que cópia é mais clara que abstração genérica
- **Adição não-substitutiva ao parser:** o pipeline atual de marker-memo via `<Note>` + `<NoteRef>` (em `qdpxImporter.ts:184+`) **continua intocado**. `<MemoText>` é uma **nova branch** de parser que extrai memo direto do filho de `<Code>`/`<Set>`/`<Link>` durante leitura do codebook XML — não passa pelo `<Notes>` collection. Os dois paths coexistem: marker memo via Notes (existente), code/group/relation memo via MemoText (novo)

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
| `tests/core/codeDefinitionRegistry.test.ts` (existente, ampliar) | `update(id, { memo })` set/get/empty-string-deletes; `setGroupMemo` idem; `setRelationMemo` por tupla `(label, target)`, `setRelationMemo` em relation duplicada atualiza só primeira; `onMutate` chamado em cada |
| `tests/export/qdcExporter.test.ts` (existente, ampliar) | `<MemoText>` emit em Code, Set, Link quando memo presente; omitido quando vazio; `<Code>`/`<Set>` self-closing → open/close quando memo virou; `<Link>` open/close form com memo |
| `tests/import/qdcImporter.test.ts` (existente, ampliar) | `<MemoText>` parsed em Code, Set, Link; conflito merge usa pattern `\n\n--- Imported memo ---\n` |
| `tests/export/tabular/buildCodesTable.test.ts` (existente, ampliar) | coluna `memo` populada |
| `tests/export/tabular/buildGroupsTable.test.ts` (existente) | idem |
| `tests/export/tabular/buildRelationsTable.test.ts` (existente) | idem (coluna `memo` no fim, mistura code-level e application-level memos — intencional. **Cells de application-level rows ficam vazias até UI landed** — esperado e testável: fixture com CodeApplication.relations sem memo gera coluna vazia, fixture com memo (via setRelationMemo schema-ready ou seed direto no data.json) preenche) |
| `tests/import/qdpxImporter.test.ts` (novo bloco) | **Round-trip schema-ready de `CodeApplication.relations` memo** — fixture com marker contendo CodeApplication com relation que tem memo; export QDPX → re-import → memo preservado, mesmo sem UI escrevendo |

### Smoke manual obrigatório (memory `feedback_validate_dom_contract`)

Vault `obsidian-plugins-workbench` — após cada chunk:

1. Abrir Code Detail de um código → editar memo → fechar e reabrir → memo persistiu ✓
2. Abrir Group editor → editar memo → fechar e reabrir → memo persistiu ✓
3. Abrir Code Detail → adicionar relation → clicar ✎ → editar memo no popover → salvar → reabrir Code Detail → memo persistiu na row ✓ (✎ aparece **somente** no Code Detail, **não** no popover de coding aplicação)
4. Aplicar código a um trecho via popover de coding (`baseCodingMenu.ts`) → conferir que **não há ✎ ao lado das relations** (consistente com decisão #14 — application-level fora) ✓
5. Export QDPX → abrir XML → conferir `<MemoText>` em `<Code>`, `<Set>`, `<Link>` ✓
6. Import QDPX (próprio export) → conferir memos preservados ✓
7. Import QDPX externo (Atlas.ti/MAXQDA, se disponível) → conferir memo de `<Code>` reaproveitado ✓
8. Export CSV tabular → abrir codes.csv / groups.csv / relations.csv → coluna `memo` populada ✓

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
