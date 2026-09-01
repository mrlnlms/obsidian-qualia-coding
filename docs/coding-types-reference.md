# Qualia Coding — Coding Types Reference

> **Audiência:** produto, design e implementação. Este documento explica as camadas de organização e classificação do Qualia Coding para reduzir ambiguidade na UI, especialmente na sidebar/codebook.
>
> **Resumo curto:** nem tudo que parece "organizar códigos" opera no mesmo nível. Alguns conceitos pertencem ao codebook, outros aos segmentos codificados, outros aos arquivos/casos, e outros são consultas dinâmicas.

---

## 1. Por que este documento existe

O plugin oferece várias formas de estruturar uma análise qualitativa: códigos, subcódigos, folders, groups, smart codes, case variables, magnitudes, relations e memos. Todas são úteis, mas a UI atual pode fazer esses conceitos parecerem equivalentes.

Essa confusão aparece principalmente na sidebar, porque `folders`, `groups`, hierarquia de códigos e `smart codes` podem ser percebidos como "maneiras de organizar códigos". Tecnicamente, porém, eles respondem perguntas diferentes:

| Conceito | Pergunta que responde |
|---|---|
| Code | Como este segmento deve ser interpretado? |
| Code hierarchy | Este código é um tipo/subtipo de qual conceito? |
| Virtual folder | Onde quero guardar/ver este código na UI? |
| Code group | A qual coleção transversal este código pertence? |
| Smart code | Quais segmentos satisfazem esta regra dinâmica? |
| Case variable | Que propriedades este arquivo/caso tem? |
| Magnitude | Com que intensidade/valor este código aparece neste segmento? |
| Relation | Qual relação analítica existe entre códigos ou segmentos? |
| Memo | Qual reflexão interpretativa acompanha esta entidade? |

O objetivo deste documento é fixar uma taxonomia conceitual e sugerir termos melhores para a UI.

---

## 2. Modelo mental recomendado

Use quatro níveis mentais:

```text
Project metadata
  Case variables, coders, source metadata

Codebook
  Codes, subcodes, folders, code tags/collections, code-level relations

Coded data
  Markers/segments, code applications, magnitudes, segment-level relations, marker memos

Dynamic views
  Smart codes / saved queries, filters, analytic retrievals
```

Essa separação é mais importante do que a nomenclatura exata. Ela evita tratar um `Smart Code` como se fosse um código manual, ou um `Group` como se fosse um parent code.

---

## 3. Codes

### Fundamento

`Code` é a unidade analítica principal do Qualia Coding. É o rótulo interpretativo que o pesquisador aplica diretamente a um segmento, seja texto, região de PDF, área de imagem, linha/célula tabular, trecho de áudio ou trecho de vídeo.

Exemplos:

- `Frustração`
- `Confiança`
- `Barreira de acesso`
- `Expectativa quebrada`

No modelo interno, o código vive no `CodeDefinitionRegistry`. Markers referenciam códigos por `codeId`, não por nome, permitindo rename seguro.

### Casos de uso

Use um código quando o pesquisador quer afirmar: "este segmento expressa, exemplifica ou pertence a este conceito analítico".

É a camada certa para:

- open coding
- códigos dedutivos vindos de framework teórico
- temas interpretativos
- categorias de análise
- problemas reportados por usuários
- comportamentos observáveis

### Nome recomendado na UI

**Manter:** `Code` / `Código`.

É o termo central da tradição QDA e deve continuar visível.

### Risco de confusão

O risco não está no termo `Code`, mas em chamar outras entidades de "code" quando elas não são aplicações manuais diretas. O caso mais problemático é `Smart Code`.

---

## 4. Subcodes e hierarquia

### Fundamento

Subcodes são códigos organizados em relação parent/child. Eles expressam uma relação conceitual do tipo "é um tipo de", "faz parte de" ou "é uma dimensão de".

Exemplo:

```text
Experiência do usuário
  Frustração
    Frustração com suporte
    Frustração com preço
  Confiança
  Dúvida
```

No modelo interno, essa relação aparece em `parentId` e `childrenOrder`.

### Casos de uso

Use hierarquia quando existe uma relação taxonômica ou conceitual forte:

- `Frustração com suporte` é um subtipo de `Frustração`
- `Ansiedade`, `Raiva` e `Alívio` são dimensões de `Afeto`
- `Onboarding`, `Pagamento` e `Cancelamento` são etapas dentro de `Jornada`

### Nome recomendado na UI

**Manter:** `Subcode` / `Subcódigo`.

Para ações de UI:

- `Create subcode`
- `Move under...`
- `Promote to top level`
- `Convert to parent code`

### Risco de confusão

Hierarquia não deve ser usada apenas para arrumar visualmente o codebook. Se a relação for "quero guardar estes códigos juntos", use folder ou collection/tag. Se a relação for "este código também pertence a RQ1", use group/collection.

---

## 5. Virtual folders

### Fundamento

Virtual folders são organização visual do codebook. Eles não representam relação analítica entre códigos e não devem alterar contagens, analytics ou export sem decisão explícita.

Exemplo:

```text
Folders
  Experiência do usuário
    Frustração
    Confiança
  Operações
    Tempo de resposta
    Erro de processo
```

No modelo interno, `folder` em `CodeDefinition` aponta para um `FolderDefinition`.

### Casos de uso

Use folders quando a intenção é ergonomia:

- reduzir uma lista longa de códigos
- separar áreas de trabalho
- agrupar códigos por etapa do projeto
- espelhar organização mental temporária do pesquisador
- criar gavetas visuais sem compromisso metodológico

### Nome recomendado na UI

**Recomendado:** `Folders` / `Pastas`.

Evitar expor `Virtual` no uso cotidiano. "Virtual" é explicação técnica; para usuário, pode soar como algo frágil ou artificial. Em tooltip/documentação, explicar:

> Folders organize the codebook visually and do not change analysis results.

### Risco de confusão

Folders parecem hierarquia, mas não são. A UI deve diferenciar visualmente:

- folder: ícone de pasta, cor neutra, não tem contagem analítica primária
- parent code: ícone/linha de código, cor de código, agrega ou representa conceito

---

## 6. Code groups

### Fundamento

Code groups são uma camada plana N:N aplicada aos códigos. Um código pode pertencer a vários grupos. Um grupo contém vários códigos. A relação é transversal, não hierárquica.

Exemplos:

```text
Code: Frustração
Groups: RQ1, Afetivo, Wave 2, Dedutivo
```

No modelo interno, `CodeDefinition.groups` guarda IDs de `GroupDefinition`.

### Casos de uso

Use groups quando a pergunta for: "este código pertence também a qual dimensão transversal?"

Bons exemplos:

- questão de pesquisa: `RQ1`, `RQ2`
- origem metodológica: `Dedutivo`, `Indutivo`
- dimensão temática transversal: `Afetivo`, `Cognitivo`, `Comportamental`
- onda/coorte: `Wave 1`, `Wave 2`
- equipe/projeto: `Cliente A`, `Benchmark`, `Sprint 4`

### Nome recomendado na UI

O termo interno atual é `Code Groups`, mas ele pode ser ambíguo. Sugestões:

| Opção | Avaliação |
|---|---|
| `Code Groups` | Correto tecnicamente, mas pode parecer hierarquia ou folder |
| `Code Tags` | Muito claro para N:N; comunica transversalidade |
| `Collections` | Bom para produto, mas pode parecer container exclusivo |
| `Code Collections` | Mais elegante, mas ainda pode sugerir "pasta" |
| `Dimensions` | Bom para pesquisa, mas abstrato demais |

**Recomendação principal:** usar `Code Tags` se a intenção for clareza imediata.

**Alternativa mais sofisticada:** usar `Collections` se a UI quiser parecer menos técnica, mas explicar que um código pode aparecer em várias collections.

Sugestão prática:

```text
Nome interno: GroupDefinition
Nome técnico em docs: Code Group
Nome recomendado na UI: Code Tag ou Collection
```

### Risco de confusão

Groups podem ser confundidos com:

- parent codes, porque ambos agrupam códigos
- folders, porque ambos organizam visualmente
- filters, porque aparecem em Analytics como filtro

A regra de ouro:

```text
Group/Tag organiza códigos por dimensão transversal.
Não organiza segmentos diretamente.
Não define subtipo.
Não é apenas uma pasta visual.
```

---

## 7. Smart codes

### Fundamento

Smart Code é uma consulta salva que retorna markers dinamicamente. Ele não é uma codificação manual aplicada diretamente. Ele é uma regra.

Exemplo:

```text
Smart Code: Frustração severa em entrevistas

hasCode(Frustração)
AND magnitude >= 3
AND caseVariable(Tipo de participante = Entrevistado)
AND textContains("suporte")
```

Se novos markers passarem a satisfazer a regra, o resultado do Smart Code muda automaticamente.

No modelo interno, um Smart Code tem `predicate: PredicateNode`, com operadores `AND`, `OR`, `NOT` e leaves como `hasCode`, `inGroup`, `caseVarEquals`, `magnitudeGte`, `engineType`, `relationExists`, `textContains` e até outro `smartCode`.

### Casos de uso

Use Smart Codes quando a pergunta for: "quero recuperar automaticamente todos os segmentos que combinam estas condições".

Bons exemplos:

- `Frustração severa em entrevistas`
- `Menções a preço em clientes enterprise`
- `Afeto negativo em Wave 2`
- `Códigos de RQ1 em PDFs`
- `Segmentos com relação causal`
- `Trechos de áudio com intensidade >= 4`

### Nome recomendado na UI

`Smart Code` é um bom nome interno, mas problemático para usuário. Ele faz a entidade parecer "mais um tipo de código", quando na prática é uma query dinâmica.

Opções:

| Opção | Avaliação |
|---|---|
| `Smart Codes` | Curto, mas ambíguo |
| `Saved Queries` | Mais preciso; bom para usuários de dados |
| `Dynamic Sets` | Bom conceitualmente; menos familiar |
| `Smart Sets` | Mais amigável; ainda indica conjunto dinâmico |
| `Dynamic Codes` | Pode manter proximidade com codebook, mas segue ambíguo |
| `Saved Searches` | Claro, mas reduz demais o poder da feature |

**Recomendação principal:** `Saved Queries`.

**Alternativa mais user-friendly:** `Smart Sets`.

Sugestão prática:

```text
Nome interno: SmartCodeDefinition
Nome técnico em docs: Smart Code
Nome recomendado na UI: Saved Query
Tooltip: Dynamic set of coded segments matched by rules.
```

### Risco de confusão

O maior risco é o usuário achar que Smart Code aplica código automaticamente. A UI deve deixar claro:

- code: aplicado pelo pesquisador
- saved query: calculada pelo sistema

Regras de copy:

- evitar "Apply Smart Code"
- preferir "Run query", "View matches", "Edit rules"
- mostrar contagem como `24 matches`, não apenas `24 coded`

---

## 8. Case variables

### Fundamento

Case variables são propriedades tipadas associadas a arquivos/casos. Elas classificam a fonte, não o código e não o segmento isolado.

Exemplos:

```text
File: Entrevista P03 - Ana.md
Tipo de participante: Cliente ativo
Região: Sudeste
Plano: Premium
Data da entrevista: 2026-03-12
```

### Casos de uso

Use case variables quando a análise precisa comparar fontes/casos:

- tipo de participante
- país/região
- coorte
- plano do cliente
- etapa do experimento
- idade, renda, gênero, cargo, segmento

### Nome recomendado na UI

**Manter:** `Case Variables` / `Variáveis de caso`.

Para UX research, considerar alias ou subtítulo:

```text
Case Variables
Source properties
```

ou em português:

```text
Variáveis de caso
Propriedades das fontes
```

### Risco de confusão

Case variables podem ser confundidas com code groups quando ambas expressam dimensões como `Wave 2`.

Regra prática:

```text
Se classifica o arquivo/caso, é Case Variable.
Se classifica o código, é Code Tag/Group.
Se classifica o segmento por regra dinâmica, é Saved Query.
```

---

## 9. Magnitude coding

### Fundamento

Magnitude é um atributo da aplicação de um código em um segmento. Ela não cria outro código; ela qualifica a intensidade, direção, avaliação ou valor daquele código naquele marker.

Exemplo:

```text
Segmento: "O suporte demorou três dias para responder."
Code: Frustração
Magnitude: Intensidade 4/5
```

O mesmo código pode ter magnitude diferente em segmentos diferentes.

### Casos de uso

Use magnitude quando a análise exige gradação:

- intensidade: `1-5`
- sentimento: `negativo`, `neutro`, `positivo`
- avaliação: `baixa`, `média`, `alta`
- direção: `a favor`, `contra`
- frequência percebida: `raro`, `ocasional`, `frequente`

### Nome recomendado na UI

**Manter:** `Magnitude` em documentação metodológica.

Na UI, considerar nomes mais concretos quando o tipo estiver configurado:

- `Intensity`
- `Rating`
- `Scale`
- `Value`

Exemplo:

```text
Magnitude
Intensity 1-5
```

### Risco de confusão

Sem UI clara, usuários podem criar códigos separados como `Frustração baixa`, `Frustração média`, `Frustração alta`. Isso explode o codebook e prejudica análise.

Regra prática:

```text
Se é o mesmo conceito em diferentes intensidades, use magnitude.
Se é outro conceito, use outro código.
```

---

## 10. Relations

### Fundamento

Relations expressam uma conexão analítica entre códigos ou entre aplicações de códigos. Elas representam interpretação teórica, causal, temporal, semântica ou associativa.

Exemplos:

```text
Frustração -> causa -> Abandono
Confiança -> reduz -> Incerteza
Preço -> intensifica -> Hesitação
```

O plugin suporta relações no nível do codebook e no nível do segmento.

### Casos de uso

Use relations quando a análise não quer apenas contar coocorrência, mas declarar uma interpretação:

- causalidade
- oposição
- reforço
- sequência
- justificativa
- tensão conceitual
- relação parte-todo não hierárquica

### Nome recomendado na UI

**Manter:** `Relations` / `Relações`.

Para ações:

- `Add relation`
- `Link to code`
- `Describe relation`

### Risco de confusão

Relations não são groups. Um group diz "estes códigos pertencem à mesma dimensão". Uma relation diz "este código se relaciona com aquele código deste modo".

---

## 11. Memos

### Fundamento

Memo é reflexão analítica processual. Ele pode existir em várias entidades: code, group, marker, relation e smart code.

Exemplos:

- por que `Frustração` foi definido assim
- por que `RQ1` agrupa certos códigos
- interpretação específica de um segmento
- hipótese sobre uma relação causal
- nota sobre limites de uma Saved Query

### Casos de uso

Use memos para preservar raciocínio:

- definição operacional
- exceções e edge cases
- decisões de coding
- hipóteses emergentes
- mudanças de interpretação
- trilha de auditoria qualitativa

### Nome recomendado na UI

**Manter:** `Memo`.

Em UI compacta, usar indicador visual consistente:

- dot/ícone discreto para memo inline
- ícone de documento para memo materializado
- tooltip `Has memo`

### Risco de confusão

Memo não é descrição. Uma descrição define a entidade. Um memo registra reflexão, dúvida, decisão ou interpretação em processo.

---

## 12. Comparação geral

| Entidade | Nível | Dinâmica? | Afeta analytics? | Exemplo |
|---|---|---:|---:|---|
| Code | Segmento/codebook | Não | Sim | `Frustração` |
| Subcode | Codebook | Não | Sim, por agregação/estrutura | `Frustração com suporte` |
| Folder | UI/codebook | Não | Não diretamente | `Experiência do usuário` |
| Code group/tag | Codebook transversal | Não | Sim, como filtro/dimensão | `RQ1`, `Afetivo` |
| Smart code/query | Dynamic views | Sim | Sim, como objeto analítico derivado | `Frustração severa em entrevistas` |
| Case variable | Fonte/caso | Não | Sim, como filtro/comparação | `Tipo de participante` |
| Magnitude | Aplicação de código | Não | Sim | `Intensidade 1-5` |
| Relation | Codebook ou segmento | Não | Sim | `Frustração causa Abandono` |
| Memo | Reflexão analítica | Não | Indiretamente | Nota sobre definição |

---

## 13. Regras práticas de decisão

Quando estiver em dúvida:

```text
Quero aplicar uma interpretação a um segmento.
→ Code

Quero dizer que um código é subtipo de outro.
→ Subcode / hierarchy

Quero arrumar visualmente minha lista de códigos.
→ Folder

Quero marcar que um código pertence a uma dimensão transversal.
→ Code Tag / Code Group

Quero recuperar segmentos que combinam várias condições.
→ Saved Query / Smart Code

Quero classificar arquivos, participantes ou casos.
→ Case Variable

Quero registrar intensidade, direção ou escala de um código naquele segmento.
→ Magnitude

Quero afirmar uma conexão analítica entre conceitos ou segmentos.
→ Relation

Quero registrar raciocínio, dúvida ou decisão interpretativa.
→ Memo
```

---

## 14. Recomendações de nomenclatura para a sidebar

### Termos que deveriam continuar

| Atual | Recomendação |
|---|---|
| Code | Manter |
| Subcode | Manter |
| Case Variables | Manter |
| Magnitude | Manter em docs; contextualizar na UI |
| Relations | Manter |
| Memos | Manter |

### Termos que deveriam mudar ou ganhar alias

| Atual | Problema | Recomendação |
|---|---|---|
| Code Groups | Parece folder/hierarquia | `Code Tags` ou `Collections` |
| Smart Codes | Parece código aplicado automaticamente | `Saved Queries` ou `Smart Sets` |
| Virtual Folders | Termo técnico demais | `Folders` com tooltip explicativo |

### Vocabulário recomendado

Versão mais clara:

```text
Codes
Code Tags
Saved Queries
Folders
Case Variables
```

Versão mais elegante:

```text
Codebook
Collections
Saved Queries
Folders
Cases
```

Versão mais próxima do estado atual:

```text
Codes
Groups
Smart Codes
Folders
Case Variables
```

Se a prioridade for reduzir ambiguidade, a primeira versão é a melhor.

---

## 15. Implicações para a sidebar

Uma sidebar clara deve separar objetos por nível:

```text
Codebook
  Codes
    Experiência do usuário
      Frustração
        Frustração com suporte
      Confiança
  Folders
    UX Research
    Operações
  Code Tags
    RQ1
    Afetivo
    Wave 2

Dynamic Views
  Saved Queries
    Frustração severa em entrevistas
    Afeto negativo em Wave 2

Project Metadata
  Case Variables
    Tipo de participante
    Região
    Plano
```

Também é possível manter uma árvore única de códigos, mas as entidades dinâmicas devem ter tratamento visual próprio.

### Diferenciação visual recomendada

| Entidade | Sinal visual |
|---|---|
| Code | cor do código + label |
| Parent code | disclosure arrow + cor do código |
| Folder | ícone de pasta neutro |
| Code Tag/Collection | ícone de tag/chip + contador de códigos |
| Saved Query | ícone de raio/filtro/search + contador de matches |
| Hidden code | opacidade reduzida + ícone de olho riscado |
| Code with memo | ícone discreto de memo |
| Code with magnitude | badge/ícone de escala |

### Copy recomendada

Evitar:

```text
Apply Smart Code
Add code to folder and group
Group code under...
```

Preferir:

```text
View query matches
Add code tag
Move to folder
Create subcode
Add to collection
```

---

## 16. Recomendações de produto

### 1. Separar "Codebook" de "Dynamic Views"

Essa é a mudança mais importante. `Saved Queries` não devem parecer irmãos diretos de códigos normais dentro da mesma árvore sem distinção forte.

### 2. Tratar folders como ergonomia, não método

Folders podem aparecer dentro do Codebook, mas com visual neutro e sem linguagem analítica.

### 3. Renomear Code Groups na UI

`Code Tags` comunica melhor a relação N:N. Se o produto quiser uma linguagem menos técnica, `Collections` é aceitável, mas precisa de tooltip:

> A collection is a reusable tag for codes. A code can belong to multiple collections.

### 4. Renomear Smart Codes na UI

`Saved Queries` é mais preciso. O nome interno pode continuar `SmartCodeDefinition`; a UI não precisa expor esse termo em todos os lugares.

### 5. Mostrar "matches", não apenas contagens genéricas

Para Smart Codes/Saved Queries, a contagem deveria dizer `matches`. Isso reforça que a entidade é dinâmica.

### 6. Usar tooltips conceituais curtos

Exemplos:

```text
Code
Applied directly to coded segments.

Code Tag
Groups codes across folders and hierarchies.

Saved Query
Dynamic set of segments matched by rules.

Folder
Visual organization only.

Case Variable
Property of a source or case.
```

---

## 17. Exemplos concretos

### Exemplo 1 — Hierarquia correta

```text
Code: Frustração
Subcode: Frustração com suporte
```

Use quando `Frustração com suporte` é uma forma específica de `Frustração`.

### Exemplo 2 — Group/tag correto

```text
Code: Frustração
Code Tags: Afetivo, RQ1
```

Use quando `Frustração` participa de dimensões transversais. `Afetivo` não é parent de `Frustração`; é uma classificação adicional do código.

### Exemplo 3 — Folder correto

```text
Folder: Experiência do usuário
Codes:
  Frustração
  Confiança
  Dúvida
```

Use quando a intenção é organizar a lista para navegação.

### Exemplo 4 — Saved Query correta

```text
Saved Query: Frustração severa em entrevistas

Rules:
  hasCode(Frustração)
  AND magnitude >= 3
  AND caseVariable(Tipo de participante = Entrevistado)
```

Use quando a intenção é recuperar segmentos automaticamente.

### Exemplo 5 — Magnitude correta

```text
Marker:
  Text: "O suporte demorou três dias."
  Code: Frustração
  Magnitude: Intensidade 4/5
```

Use quando a codificação precisa capturar grau, não criar novos códigos para cada intensidade.

---

## 18. Glossário recomendado

| Termo interno | Termo recomendado na UI | Definição curta |
|---|---|---|
| `CodeDefinition` | Code | Analytical label applied to segments |
| `parentId` / hierarchy | Subcode | Code nested under a broader code |
| `FolderDefinition` | Folder | Visual organization for codes |
| `GroupDefinition` | Code Tag | Cross-cutting tag/collection for codes |
| `SmartCodeDefinition` | Saved Query | Dynamic rule that returns matching segments |
| `CaseVariable` | Case Variable | Property of a source/case |
| `magnitude` | Magnitude / Intensity | Value attached to a code application |
| `CodeRelation` | Relation | Analytical link between codes |
| `MemoRecord` | Memo | Interpretive note attached to an entity |

---

## 19. Benchmark terminológico em outras ferramentas

> Pesquisa rápida em documentação pública feita em 2026-08-05. A intenção aqui não é copiar a terminologia de outra ferramenta, mas validar quais termos são reconhecíveis no mercado QDA/CAQDAS e onde eles geram ambiguidade.

### ATLAS.ti

ATLAS.ti usa termos muito próximos aos do Qualia, mas a própria documentação deixa claras algumas distinções que ajudam nossa decisão de UI:

- **Code Groups** existem como forma de organizar e filtrar códigos. A documentação de Code Groups diz que eles ajudam a organizar listas longas de códigos e servem como filtros para consultas ([ATLAS.ti — Working With Code Groups](https://manuals.atlasti.com/Win/en/manual/Codes/CodeGroupsWorkingWith.html)).
- **Groups vs folders**: a documentação de suporte explica que groups funcionam como labels/tags flexíveis, enquanto folders criam estrutura hierárquica. Também explicita que um item pode pertencer a vários groups ao mesmo tempo ([ATLAS.ti — Groups and folders](https://atlastihelp.helpscoutdocs.com/article/153-organize-documents-codes-and-memos-in-groups)).
- **Smart Codes** são queries salvas. A documentação é direta: Smart Codes parecem códigos normais, mas armazenam uma query para computar referências virtuais. Também diz que Smart Codes não podem ser usados para codificar e não aparecem na margem ([ATLAS.ti — What are Smart Codes?](https://manuals.atlasti.com/Win/en/manual/Analysis/AnalysisWhatAreSmartCodes.html)).
- **Smart Groups** também existem: são combinações de groups com operadores booleanos, especialmente úteis como filtros globais ([ATLAS.ti — Working With Smart Groups](https://manuals.atlasti.com/Win/en/manual/Analysis/AnalysisSmartGroupsWorkingWith.html)).

**Implicação para Qualia:** manter `Smart Code` como termo técnico é defensável porque ATLAS.ti usa esse nome. Mas, se a prioridade for clareza para usuários novos, `Saved Query` comunica melhor a natureza real da entidade. A própria documentação do ATLAS.ti precisa explicar que Smart Code não é código aplicável, o que confirma o risco de ambiguidade.

### MAXQDA

MAXQDA usa uma terminologia mais clássica para codebook:

- **Code** é definido como uma palavra ou combinação de palavras usada para atribuir significado, sistematizar, classificar e interpretar material empírico. A documentação reforça que, em pesquisa qualitativa, códigos vão além de simples labels ([MAXQDA — About Codes and the Code System](https://www.maxqda.com/help/codes-2/about-codes-and-the-code-system)).
- **Code System** é a janela/estrutura hierárquica de códigos. A documentação diz que códigos podem ter subcodes, inclusive subcodes de subcodes, dentro de uma estrutura hierárquica ([MAXQDA — About the Code System](https://www.maxqda.com/help/codes-2/about-codes-and-the-code-system)).
- **Code Sets** são combinações temporárias de códigos. Eles contêm apenas referências para códigos existentes, e remover um código do set não afeta o código original ([MAXQDA — Create Code Sets](https://www.maxqda.com/help/codes-2/creating-code-sets)).
- **Document Variables** são metadados associados ao documento inteiro, como gênero, idade ou escolaridade; **Code Variables** permitem aplicar valores a coded segments e usar isso como critério de seleção ([MAXQDA — Document and Code Variables](https://www.maxqda.com/help/variables/document-code-variables-maxqda)).

**Implicação para Qualia:** `Codebook` ou `Code System` são termos seguros para a área principal da sidebar. Para groups, `Code Sets` seria familiar para usuários MAXQDA, mas carrega a ideia de combinação temporária. `Code Tags` ainda é mais explícito para a semântica N:N permanente do Qualia.

### NVivo

NVivo é relevante principalmente por separar bem codes, cases, classifications, sets e queries:

- A documentação de mudança terminológica mostra a transição de **Node** para **Code**, deixando `Code` como termo moderno para o que antes era theme node/node ([NVivo — Terminology changes](https://help-nv.qsrtest.com/15/win/Content/about-nvivo/terminology-changes.htm)).
- NVivo distingue **static sets** e **dynamic sets**. Static sets são grupos manuais de itens; dynamic sets são definidos por critérios de busca e podem atualizar conforme o projeto cresce ([NVivo — Terminology changes](https://help-nv.qsrtest.com/15/win/Content/about-nvivo/terminology-changes.htm)).
- Queries podem ter critérios salvos para rodar novamente depois, quando houver mais coding. A documentação separa salvar critérios de query de salvar resultados ([NVivo — Coding comparison query](https://help-nv.qsrinternational.com/20/mac/Content/queries/coding-comparison-query.htm?Highlight=coding+comparison)).
- Em queries, NVivo trata folders, static sets, file classifications, selected codes e cases with classifications como escopos/filtros distintos ([NVivo — Coding comparison query](https://help-nv.qsrinternational.com/20/mac/Content/queries/coding-comparison-query.htm?Highlight=coding+comparison)).

**Implicação para Qualia:** `Saved Query` é altamente defensável. NVivo usa a ideia de query criteria salvos e distingue isso de sets/folders/classifications. `Dynamic Set` também é conceitualmente válido, mas pode aproximar Smart Codes de sets/collections e gerar nova ambiguidade.

### Dedoose

Dedoose usa termos úteis para duas decisões do Qualia:

- **Descriptors** são dados categóricos, demográficos ou quantitativos associados a uma mídia/fonte, usados para análise relacional ou comparativa ([Dedoose — Descriptors Overview](https://helpdesk.dedoose.com/hc/en-us/articles/14059447553421-Descriptors-Overview-and-Workspace-Orientation)).
- **Code Weights** permitem adicionar valor numérico a um código para indicar valência, sentimento ou quantificar informação qualitativa. A documentação também aponta que isso ajuda a manter o codebook condensado ([Dedoose — Code Weights](https://helpdesk.dedoose.com/hc/en-us/articles/14067732041997-Code-Weights)).
- Dedoose usa **Subcodes (Child codes)** na organização de codebook, o que confirma que `Subcode`/`Child code` são termos reconhecíveis ([Dedoose — Codes, Coding, & Memos](https://helpdesk.dedoose.com/hc/en-us/categories/12090852334093-Codes-and-Coding)).

**Implicação para Qualia:** `Case Variables` continua bom para tradição QDA/NVivo/MAXQDA, mas `Source Properties` ou `Descriptors` podem ser aliases úteis para UX research. Para magnitude, `Code Weight` é um termo reconhecível em Dedoose, mas `Magnitude` é mais amplo; a UI pode mostrar `Magnitude` com subtipo concreto (`Intensity`, `Valence`, `Rating`).

### Síntese do benchmark

| Conceito no Qualia | Termos encontrados | Leitura |
|---|---|---|
| Code | Code, formerly Node, Code System | `Code` é padrão moderno e deve ficar |
| Subcode | Subcode, Child code | `Subcode` é seguro; `Child code` pode aparecer em tooltip |
| Folder | Folder | Usar para hierarquia/organização visual; diferenciar de groups |
| Code Group | Code Group, Group, Code Set, Static Set | `Code Group` é validado por ATLAS.ti, mas `Code Tag` explica melhor N:N |
| Smart Code | Smart Code, Saved Query, Dynamic Set | `Smart Code` é validado por ATLAS.ti; `Saved Query` é mais claro |
| Case Variables | Case classifications, Document variables, Descriptors | `Case Variables` é bom; `Source Properties` pode ser subtítulo |
| Magnitude | Code Weight, Code Variable, Weight Score | `Magnitude` é mais amplo; `Intensity/Rating/Valence` devem aparecer por configuração |
| Relations | Relations, Networks, Links | `Relations` é seguro |
| Memo | Memo | `Memo` é padrão |

### Decisão recomendada após benchmark

O benchmark muda pouco a recomendação central, mas dá mais segurança:

```text
Code Groups
  Internamente: manter GroupDefinition.
  UI principal: testar Code Tags.
  Tooltip/docs: "Groups/tags for codes; a code can belong to multiple tags."

Smart Codes
  Internamente: manter SmartCodeDefinition.
  UI principal: testar Saved Queries.
  Tooltip/docs: "Dynamic queries that return matching coded segments."
  Menção secundária: "Smart Codes in ATLAS.ti terminology."

Case Variables
  UI principal: manter Case Variables.
  Subtítulo opcional: Source properties.

Magnitude
  UI principal: manter Magnitude quando genérico.
  Campo específico: mostrar Intensity, Valence, Rating, Scale conforme configuração.
```

---

## 20. Frase-guia para decisões futuras

> **Codes are applied. Tags organize codes. Folders organize the UI. Case variables describe sources. Magnitudes qualify applications. Relations express interpretation. Saved queries retrieve matches dynamically.**

Em português:

> **Códigos são aplicados. Tags organizam códigos. Pastas organizam a UI. Variáveis de caso descrevem fontes. Magnitudes qualificam aplicações. Relações expressam interpretação. Consultas salvas recuperam resultados dinamicamente.**
