# Code Groups — Design

**Data:** 2026-04-24
**Status:** Design aprovado, pronto pra plano de implementação
**ROADMAP:** #2a (Coding management — primeiro sub-item)

---

## Contexto

Hoje o plugin cobre duas camadas de organização de códigos:

1. **Hierarquia** via `parentId` — um código pai com 0 applications age como theme (padrão NVivo / Braun & Clarke). Ex: `Experiencias > resistencia, adocao, frustacao`.
2. **Folders virtuais** — organização cosmética, 1 código em 1 folder, zero impacto analítico.

O que falta é uma **camada flat N:N cross-cutting** (padrão Atlas.ti "Code Groups" / MAXQDA "Code Sets"): 1 código pode estar em N groups simultaneamente, e groups são usados pra agregar análise em dimensões ortogonais à taxonomia (ex: `Afetivo/Cognitivo`, `RQ1/RQ2`, `Onda 1/Onda 2`).

**Use case motivador:** pesquisador quer tagear códigos com dimensões analíticas ortogonais à hierarquia e filtrar Analytics por essas dimensões sem refatorar a hierarquia.

**Escopo desta feature:** Tier 1.5 estendido (meio caminho entre tier 1 MVP e tier 2 do ROADMAP #2a). Tier 3 (nested real, boolean filter, exclusive groups, aba dedicada) fica como evolução futura quando dor real aparecer.

---

## Decisões de design

| # | Decisão | Resposta |
|---|---------|----------|
| 1 | Escopo | Tier 1.5 estendido — schema + Settings-free mgmt + Analytics single-select filter + export + cor/desc opcionais + schema `parentId?` ready mas UI flat |
| 2 | UI primária | Painel Groups collapsible no topo do codebook (Tag view atual), acima da toolbar |
| 3 | Chips nas rows | Contador `🏷N` + destaque contextual (borda + fade) quando filtrando (opção C+E) |
| 4 | Assign to group | Right-click no código na tree + seção Groups em Code Detail view (E) |
| 5 | Criar/renomear/deletar | `[+]` no painel + right-click do chip + inline "+New group..." no right-click de código. **SEM Settings tab.** |
| 6 | Analytics filter | Chips clicáveis single-select, fallback dropdown em >10 groups |
| 7 | Herança parent/child | Independente (filhos não herdam groups do pai automaticamente) |
| 8 | Count semantics | Número de **códigos** no group (não applications); tooltip mostra applications |
| 9 | Cor de group | Opcional, palette **pastel separada** (8 cores) pra distinguir de códigos |
| 10 | Nome duplicado | Permitido (pattern dos códigos). Sem warning no tier 1.5 |
| 11 | Merge de códigos | Target herda **union** dos groups (source + target) |
| 12 | Search sidebar | Não filtra por nome de group (mesma lógica de folders, decisão CB3) |
| 13 | Overflow | Chips fazem wrap vertical no painel; dropdown fallback em Analytics |
| 14 | Export QDPX | `<Set>` no `<CodeBook>` com `<MemberCode targetGUID="...">` (REFI-QDA spec) |
| 15 | Export CSV | Coluna `groups` em `codes.csv` + novo `groups.csv` standalone |
| 16 | Testing | ~30-40 tests jsdom, sem E2E (feature é DOM + registry puro) |
| 17 | Tier 3 (fora de escopo) | Nested real UI, boolean filter, exclusive groups, aba dedicada, application-level groups |

---

## Arquitetura

### Schema

**Adição em `CodeDefinition`** (`src/core/types.ts`):

```ts
export interface CodeDefinition {
  // ... existing fields ...
  groups?: string[];  // array de groupIds. undefined = sem groups.
}
```

**Adição em `QualiaData.registry`**:

```ts
registry: {
  definitions: Record<string, CodeDefinition>;
  nextPaletteIndex: number;
  folders: Record<string, FolderDefinition>;
  rootOrder: string[];
  // NEW
  groups: Record<string, GroupDefinition>;
  groupOrder: string[];
}
```

**Novo tipo `GroupDefinition`**:

```ts
export interface GroupDefinition {
  id: string;              // g_XX (estável)
  name: string;            // livre, renameable (atômico, não propaga — códigos referenciam por id)
  color?: string;          // opcional, palette pastel separada
  description?: string;    // opcional, livre, multiline
  parentId?: string;       // SCHEMA-READY pra tier 3 nested; UI 1.5 ignora
  createdAt: number;
}
```

**Notas importantes:**

- `parentId?` fica no schema mas UI 1.5 renderiza 100% flat. Quando tier 3 vier, **zero migration script**.
- `groupOrder` análogo a `rootOrder`: controla ordem dos chips no painel. Reorder via drag (opcional no tier 1.5).
- Palette de group: 8 cores pastéis distintas da palette saturada dos códigos (evita confusão visual no chip contador).

### Registry API (nova no `CodeDefinitionRegistry`)

```ts
// Mutations (todas chamam onMutate → save + registry-changed)
createGroup(name: string, color?: string, description?: string): GroupDefinition;
renameGroup(id: string, newName: string): void;
deleteGroup(id: string): void;  // ripple: remove id de code.groups[] em todos os códigos
setGroupColor(id: string, color: string | undefined): void;
setGroupDescription(id: string, description: string | undefined): void;
setGroupOrder(ids: string[]): void;

// Membership
addCodeToGroup(codeId: string, groupId: string): void;   // idempotent
removeCodeFromGroup(codeId: string, groupId: string): void;  // idempotent

// Queries (puras)
getGroup(id: string): GroupDefinition | null;
getAllGroups(): GroupDefinition[];
getCodesInGroup(groupId: string): CodeDefinition[];
getGroupsForCode(codeId: string): GroupDefinition[];
getGroupCount(groupId: string): number;  // nº de códigos membros
```

---

## UI surfaces

### 1. Codebook sidebar (Tag view atual)

**Painel Groups** — collapsible, acima da toolbar. Default collapsed quando vazio.

```
┌─────────────────────────────────────┐
│ All Codes                       12  │
│                                     │
│ ▾ Groups                       [+]  │  ← novo
│   [RQ1 (5)] [RQ2 (3)] [Wave1 (8)]  │  ← chips
│                                     │
│ [Reorganize][Merge]                 │
│ [+ New Code][+ New Folder]          │
│ 🔍 Filter codes...                  │
│                                     │
│ ▾ 📁 Pasta de organização        3  │
│   ● 👁 adocao           🏷1      4  │  ← contador
│   ● 👁 caralho          🏷3      1  │
│   ● 👁 marlon                    1  │
└─────────────────────────────────────┘
```

**Estado filtrando** (user clicou em `RQ1`):

```
┌─────────────────────────────────────┐
│ ▾ Groups                       [+]  │
│   [RQ1✓] [RQ2] [Wave1]              │  ← chip selecionado
│                                     │
│ ▾ 📁 Pasta de organização        3  │
│ ┃ ● 👁 adocao           🏷1      4  │  ← borda accent (membro)
│ ┃ ● 👁 caralho          🏷3      1  │  ← borda accent
│   ○ 👁 marlon                    1  │  ← fade (não-membro)
│ ▾    Experiencias               0   │  ← fade
│   ○ 👁 resistencia              5   │
└─────────────────────────────────────┘
```

**Interações:**

- Clique em chip → seleciona/desseleciona (single-select)
- `[+]` no painel → `PromptModal` pra nome → cria group (cor default gray, editável depois)
- Right-click em chip → Menu: Rename / Delete / Edit color / Edit description
- Right-click em código na tree → submenu "Add to group" → lista + "+ New group..."
- Hover no chip contador `🏷N` na row → tooltip lista nomes dos groups + total de applications

### 2. Code Detail view

Seção `Groups` entre Description e Hierarchy:

```
┌─────────────────────────────────────┐
│ ← adocao                            │
│                                     │
│ Color: ●                            │
│ Description: ...                    │
│                                     │
│ Groups:                        [+]  │  ← nova seção
│   [RQ1 ×] [Wave1 ×]                 │  ← chips removíveis
│                                     │
│ Hierarchy: ...                      │
│ Markers (4): ...                    │
└─────────────────────────────────────┘
```

- `[+]` → `FuzzySuggestModal` com groups existentes (pattern de "Add Existing Code")
- `×` no chip → remove do group

### 3. Analytics config panel

Nova seção acima de "Filter by case variable":

```
┌── Analytics Config Panel ─────────┐
│ ┌──────────────────────────────┐  │
│ │ Filter by group              │  │
│ │ [RQ1] [RQ2] [Wave1] [Wave2]  │  │  ← single-select chips
│ │                              │  │  ← ou dropdown se >10 groups
│ └──────────────────────────────┘  │
│ ┌──────────────────────────────┐  │
│ │ Filter by case variable      │  │
│ │ [— none —     ▾] [— any — ▾] │  │
│ └──────────────────────────────┘  │
└───────────────────────────────────┘
```

---

## Data flow & events

**Mutations → auto-save + re-render:**

- Registry `onMutate` callback dispara após qualquer mutation de group (create/rename/delete/edit/membership)
- `onMutate` → DataManager debounce 500ms (pattern existente) + dispatch `qualia:registry-changed`
- Views se auto-refreshem via listener (Codebook sidebar, Code Detail, Analytics config) — já há cache + debounce rAF via `scheduleRefresh`

**State local (UI-only, não persistido):**

- Codebook sidebar: `selectedGroupId: string | null` — qual chip do painel está ativo pro destaque contextual
- Analytics: `groupFilter: string | null` em `AnalyticsViewContext` — análogo a `caseFilter`

**Counts:**

- Chip count `RQ1 (5)` = `codes.filter(c => c.groups?.includes(groupId)).length` — função pura, sem cache no tier 1.5
- Tooltip de applications = agrega via `buildCountIndex` existente somando counts dos códigos membros

**Analytics filter:**

- Aplicado em `applyFilters` (`src/analytics/data/statsHelpers.ts`) junto com `caseFilter` — reduz o marker set antes de qualquer stats engine

---

## Export / Import

### QDPX (REFI-QDA spec)

**Export** — `qdcExporter.ts` estendido pra emitir `<Sets>` dentro de `<CodeBook>`:

```xml
<CodeBook>
  <Codes>...</Codes>
  <Sets>
    <Set guid="..." name="RQ1">
      <MemberCode targetGUID="..."/>
      <MemberCode targetGUID="..."/>
    </Set>
    <Set guid="..." name="Wave1">
      <MemberCode targetGUID="..."/>
    </Set>
  </Sets>
</CodeBook>
```

- GUID dos groups reusa o pattern `ensureGuid` do exporter (como códigos/selections).
- `description` do group vai em `<Description>` child opcional do `<Set>`.
- Cor do group **não** tem representação na spec REFI-QDA → preservada só em QDPX round-trip próprio (atributo custom ignorado por importers externos).

**Import** — `qdpxImporter.ts` estendido:

- Parseia `<Set>` elements, cria `GroupDefinition` para cada.
- Liga códigos via `MemberCode` guids → `addCodeToGroup`.
- Warning log se `<Set>` tem `<MemberSource>` (source-level sets, fora de escopo desta feature) — ignora esses members, importa só MemberCodes.
- Conflito de nome (group "RQ1" já existe local) → reusa modal de resolução existente do importer.

### Tabular CSV export (`src/export/tabular/`)

- **`codes.csv`** ganha coluna `groups` — valores = nomes dos groups separated by `;`
  ```csv
  code_id,code_name,color,groups
  c_01,Produtividade,#6200EE,"RQ1;Wave1"
  ```
- **Novo `groups.csv`** standalone com metadata:
  ```csv
  group_id,group_name,color,description
  g_01,RQ1,#aec6ff,"Research question 1"
  ```
- **`README.md`** do zip documenta ambos + snippets R/Python (dplyr join com groups.csv, pandas merge).

### Round-trip

Teste de regressão: export → import = estrutura idêntica. Cobre os 4 campos de GroupDefinition + membership preservation.

---

## Edge cases & error handling

| Caso | Comportamento |
|------|---------------|
| Código deletado | Membership some automaticamente (tá em `code.groups[]`, sem referência reversa pra limpar) |
| Group deletado | `deleteGroup` remove o id de `code.groups[]` em todos os códigos. ConfirmModal `"Delete group 'RQ1'? N codes will lose this membership."` (mod-warning) |
| Merge de códigos | Target herda **union** dos groups (source + target). MergeModal preview mostra count |
| Rename group | Atômico no registry, sem ripple (códigos referenciam por id) |
| Nome duplicado | Permitido (pattern dos códigos). Sem warning no tier 1.5 |
| Group vazio | Permitido (user pode criar "RQ3" antes de marcar qualquer código) |
| Input vazio | Rejeita create/rename com `Notice` + foco no input (pattern Case Variables) |
| Search codebook | NÃO filtra por nome de group (user navega via click no chip) |
| Performance | Chips no painel wrap vertical; fallback dropdown em Analytics >10 groups |
| Import QDPX externo com MemberSource | Ignora esses members com warning log; importa só MemberCodes |
| Hot-reload com modal aberto | Trackear `activeGroupPrompt` no plugin e fechar no `onunload` (pattern Case Variables) |
| Auto-save race | Registry `onMutate` → DataManager debounce 500ms — sem mudança, pattern existente |

---

## Testing

**Unit tests (Vitest + jsdom):**

- **Registry CRUD** — extender `codeDefinitionRegistry.test.ts`:
  - `createGroup` — gera id estável, atualiza `groupOrder`
  - `renameGroup` — name muda, id constante
  - `deleteGroup` — remove de `groups{}`, limpa membership em todos os códigos
  - `addCodeToGroup` / `removeCodeFromGroup` — idempotent
  - `setGroupOrder` — valida ids, mantém consistência

- **Helpers puros** — novo `tests/core/groupHelpers.test.ts`:
  - `getCodesInGroup`, `getGroupsForCode`, `getGroupCount`
  - Parent/child independence: parent em group NÃO implica child em group

- **Merge** — extender `mergeModal.test.ts`:
  - Target herda union dos groups de source+target

**Integration tests:**

- **Filter sidebar** — novo `tests/core/codebookGroupsFilter.test.ts`:
  - Click chip → destaque na tree (borda/fade)
  - Click novamente no mesmo chip → limpa seleção

- **Filter Analytics** — estender `configSections.test.ts`:
  - Reduz dataset, markers de códigos não-membros excluídos em `applyFilters`

- **Serialization** — novo `tests/core/codeGroupsSerialization.test.ts`:
  - Save/load preserva schema completo
  - Load de data.json legado (sem `groups` / `groupOrder`) não crasha, inicializa vazio

**Export / import:**

- **QDPX round-trip** — novo `tests/export/qdpxGroupsRoundtrip.test.ts`:
  - Export gera `<Set>` + `<MemberCode>` válidos
  - Import de QDPX externo cria groups e membership
  - Roundtrip idempotente
  - `MemberSource` ignorado com warning log verificável

- **Tabular CSV** — novo `tests/export/tabularGroupsExport.test.ts`:
  - `codes.csv` com coluna `groups`
  - `groups.csv` com metadata
  - `README.md` atualizado

**UI tests (jsdom):**

- **Painel Groups** — novo `tests/core/codebookGroupsPanel.test.ts`:
  - Renderiza chips com counts quando há groups
  - Click em chip seleciona + atualiza destaque
  - Botão `[+]` abre PromptModal
  - Right-click em chip abre menu com Rename/Delete/Edit

- **Chip contador** — novo `tests/core/codebookChipCounter.test.ts`:
  - Row mostra `🏷N` quando código tem groups
  - Tooltip lista nomes dos groups

- **Code Detail section** — novo `tests/core/codeDetailGroupsSection.test.ts`:
  - Seção Groups aparece entre Description e Hierarchy
  - Add via `[+]` abre FuzzySuggestModal
  - `×` no chip remove membership

**Meta numérica:** ~30-40 testes novos. Baseline atual: 2108 tests. Alvo: ~2140-2150.

**E2E (wdio):** **não incluído**. Feature é DOM + registry puro (sem pdfjs/fabric/wavesurfer/CM6 complexo que justifique). Smoke manual no merge cobre integração com Obsidian real.

---

## Out-of-scope (tier 3 — ROADMAP #2a)

- **Nested real com UI** — `parentId?` fica no schema pronto. UI renderiza flat. Habilitar quando corpus tiver >30 groups e dor aparecer.
- **Boolean filter** (AND/OR/NOT) — testar antes se "click no chip pra filtrar, shift+click adiciona AND incremental" resolve. Se não, parser + UI dedicada.
- **Exclusive groups** (constraint semântico) — só com exemplo concreto do user (ex: `Afetivo/Cognitivo` nunca coexiste).
- **Aba dedicada de Groups** no toolbar superior da sidebar — quando metadata rica (cor/desc/memos) ou bulk operations pedirem tela própria.
- **Application-level groups** (groups em `CodeApplication`, não em `CodeDefinition`) — groups como dimensão analítica do segmento, não do código.
- **Smart Codes / query engine** (Atlas.ti pattern) — provavelmente nunca.

**Documentação:** atualizar ROADMAP #2a após merge pra riscar items feitos, atualizar tier 3 como "Habilitado quando dor real aparecer", registrar data de release.

---

## Dependências explícitas

- **Intercoder Reliability** (próxima frente do launch): groups vira dimensão legítima de discordância entre coders ("Coder A marcou código em RQ1, Coder B marcou em RQ2"). Sem dependência schema — extensão de κ/α pra groups vira item futuro dentro do próprio design do Intercoder.

---

## Estimativa

**2 sessões** (~6-8h de trabalho):

1. **Sessão 1** — schema + registry API + UI painel + chips contador + right-click menus + serialization.
2. **Sessão 2** — Code Detail section + Analytics filter + QDPX export/import + Tabular CSV export + testes.

Polishes cosméticos descobertos codificando entram inline sem sessão própria.
