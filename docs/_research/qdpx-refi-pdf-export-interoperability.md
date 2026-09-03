# QDPX PDF — auditoria REFI, Atlas → Qualia e desenho da saída

> Levantamento de 2026-09-02 para o desenho do Marco 6. Este documento registra
> evidência e recomendação arquitetural; não declara o exporter implementado nem
> a interoperabilidade validada no Atlas. A aceitação externa continua sendo o
> checkpoint do Marco 7.

## Objetivo

Cruzar três visões do mesmo projeto:

1. como o QDPX real do Atlas representa selections, codings e multipágina;
2. como o importer atual do Qualia normaliza esse conteúdo;
3. qual projeção de saída preserva a semântica do Qualia e continua portátil para
   outras ferramentas QDPX.

O objetivo não é produzir um “QDPX privado do Qualia” nem copiar bytes do Atlas.
O Atlas é a principal referência concreta disponível para uma implementação
compatível do padrão REFI-QDA.

## Fontes consultadas

### Primárias locais

- QDPX e XML real do Atlas, projeto `UnifiedDevOps Selective Coding ITE5 ICA`,
  mantidos fora deste repositório em `QUALIA-QDPX/QDPX Tests/`;
- schema REFI-QDA `Project.xsd`, originalmente consultado no acervo externo
  `qualia-coding-sources-FINAL/2024-07-17-local-workbench-QDA-refs/` e recuperado
  em 2026-09-03 pela [página oficial de arquivos de implementação](https://www.qdasoftware.org/project-implementation-files)
  e pelo [mirror técnico OpenQDA](https://github.com/openqda/refi-tools/blob/main/docs/schemas/project/v1.0/Project.xsd);
- importer atual em [`src/import/qdpxImporter.ts`](../../src/import/qdpxImporter.ts),
  [`src/import/qdpxAuthoring.ts`](../../src/import/qdpxAuthoring.ts) e
  [`src/import/qdpxMultipage.ts`](../../src/import/qdpxMultipage.ts);
- exporter atual em
  [`src/export/qdpxExporter.ts`](../../src/export/qdpxExporter.ts) e
  [`src/export/qdpxAuthoring.ts`](../../src/export/qdpxAuthoring.ts);
- modelo PDF em
  [`src/pdf/pdfCodingTypes.ts`](../../src/pdf/pdfCodingTypes.ts);
- testes contra o corpus real em
  [`tests/import/atlasQdpxSimulation.test.ts`](../../tests/import/atlasQdpxSimulation.test.ts).

### Primárias externas

- [site oficial do REFI-QDA](https://www.qdasoftware.org/), que define o formato
  como intercâmbio bidirecional, aberto e independente de software;
- [especificação REFI-QDA 1.5](https://openqda.github.io/refi-tools/docs/standard/REFI-QDA-1-5.pdf),
  incluindo os conceitos de Selection, Coding, Representation e seleções PDF;
- [documentação oficial do Atlas sobre QDPX](https://atlasti.com/features/project-export-in-qdpx-format),
  que descreve o pacote como denominador comum entre produtos;
- [conceito de quotation no Atlas](https://manuals.atlasti.com/Win/en/manual/MainConcepts/EntityTypeQuotation.html)
  e [criação de quotations PDF](https://manuals.atlasti.com/Win/en/manual/Quotations/QuotationsTextCreating.html).

A especificação é normativa para o significado dos elementos. O XML real é a
evidência do dialeto efetivamente produzido pelo Atlas. O manual do Atlas explica
o modelo de produto, mas não substitui o schema nem prova sozinho a forma do XML.

## Modelo semântico confirmado

No REFI-QDA:

- `Selection` é uma parte identificada de uma source;
- `Coding` é a aplicação de um código a uma source ou Selection;
- a Selection pode conter zero ou vários Codings;
- cada Coding possui GUID próprio e pode ter `creatingUser`,
  `creationDateTime` e `NoteRef` próprios;
- a própria Selection também possui identidade, autoria, datas, descrição e
  notas no seu nível;
- uma seleção textual de PDF pertence à Representation textual;
- uma `PDFSelection` descreve uma região retangular de uma página em pontos PDF.

Logo, coder não faz parte da identidade geométrica da Selection no padrão. Vários
coders e vários códigos podem estar associados à mesma unidade selecionada.

O Atlas usa a mesma distinção: quotation é o trecho/unidade de análise; coding é
o vínculo de um código com essa quotation. Uma quotation pode existir sem código.

## Perfil estrutural do QDPX Atlas real

O XML inspecionado contém:

- 207 `PDFSelection`;
- 201 `PlainTextSelection`;
- 1.224 Codings nas seleções visuais;
- 1.189 Codings nas seleções textuais;
- 203 das 207 seleções visuais com mais de um Coding;
- 197 das 201 seleções textuais com mais de um Coding;
- 201 pares visual/textual correlacionados pelo mesmo GUID;
- 6 `PDFSelection` adicionais, que são continuações de seis quotations
  multipágina;
- nenhum `NoteRef` nas seleções PDF ou nos seus Codings neste corpus específico.

Uma única Selection observada possui 14 Codings de quatro usuários, envolvendo
quatro códigos. A Selection tem um criador e uma data; cada Coding mantém seu
próprio usuário e timestamp.

### Seleção PDF simples no dialeto observado

O Atlas projeta a mesma quotation textual de duas formas:

```text
PDFSource
├── PDFSelection guid=S, page, bbox
│   └── Coding(s), cada um com GUID próprio
└── Representation
    └── PlainTextSelection guid=S, startPosition, endPosition
        └── Coding(s), cada um com outro GUID próprio
```

O GUID compartilhado correlaciona as duas representações da Selection. Os GUIDs
dos elementos `Coding` não são reutilizados entre os dois nós XML; o que os torna
semanticamente equivalentes é a combinação de usuário e código.

O schema permite múltiplos Codings, mas não obriga todo produtor a emitir o par
visual/textual com o mesmo GUID. Essa correlação é uma convenção concreta e útil
do Atlas, já compreendida pelo importer do Qualia.

### Seleção multipágina no dialeto observado

Nos seis casos do corpus, cada quotation ocupa duas páginas:

```text
PDFSelection S (página inicial)       PDFSelection T (página seguinte)
        │
        └── PlainTextSelection S cobre o intervalo textual lógico completo
```

O conjunto semântico de Codings é repetido nas três representações físicas. Cada
repetição recebe GUID próprio. A continuidade multipágina é estrutural: mesmo
nome, timestamp e conjunto semântico de Codings em páginas consecutivas, com uma
única `PlainTextSelection` âncora. A auditoria de implementação confirmou que os
14 Links chamados `continued by` no corpus conectam quotations na mesma página e
são relações analíticas comuns; não codificam os seis casos multipágina.

Não há evidência local de quotation Atlas com três ou mais páginas. Uma cadeia
ordenada entre fragmentos adjacentes é uma extensão plausível, mas esse cenário
não pertence ao critério de aceitação Atlas desta frente porque não existe uma
referência comparável. Pode ser avaliado posteriormente com outro corpus.

## Como o importer atual trata o arquivo

### Autoria e aplicações

O estado atual já não corresponde ao diagnóstico antigo de perda de autoria:

- lê `<Users>` e registra identidade externa REFI estável;
- lê GUID, usuário, timestamp e notas de cada Coding;
- funde repetições visual/textual pela chave semântica usuário + código;
- preserva os GUIDs físicos encontrados em `sourceCodingGuids[]`;
- divide uma Selection multicoder em um marker independente por coder;
- mantém vários códigos do mesmo coder no `codes[]` desse marker.

Essa normalização preserva o modelo interno do Qualia: propriedade e edição são
por marker, enquanto a Selection externa compartilhada permanece como
procedência, não como entidade sincronizada.

### Par visual/textual

Para PDF, o importer:

1. reúne `PDFSelection` e `PlainTextSelection` de mesmo GUID;
2. usa offsets/nome da parte textual para reconstruir o conteúdo;
3. mantém página e bbox da parte visual como evidência geométrica;
4. cria um marker por coder;
5. registra o GUID comum em `importedQdpxSelection`.

Se apenas a parte textual existir, o importer possui fallback. Se apenas a parte
visual possuir nome textual, também tenta criar um text marker antes de tratá-la
como shape. Portanto, o par melhora a interoperabilidade, mas cada metade tem um
caminho degradado explícito.

### Multipágina

O importer detecta um grupo multipágina por evidência estrutural:

- fragmentos `PDFSelection` em páginas adjacentes;
- mesmo nome normalizado, data e multiconjunto semântico de Codings;
- exatamente um fragmento com `PlainTextSelection` de mesmo GUID.

Os Links `continued by` são preservados como relações analíticas, mas não são
usados para consolidar multipágina. Em seguida, o intervalo lógico é
projetado em `segments[]`, e cada coder recebe seu próprio marker lógico com uma
cópia independente desses segmentos.

No corpus validado, isso resulta em:

- 615 markers PDF;
- 633 segmentos;
- 1.189 aplicações semânticas;
- 6 grupos multipágina;
- 18 markers lógicos multipágina, 36 segmentos e 35 aplicações nesses grupos.

### Situação dos testes na auditoria

Em 2026-09-02, os sete arquivos focados de importação Atlas/multipágina/autoria e
exportação de autoria/GUIDs/Links passaram: 64 testes aprovados. A validação manual
dos Marcos 1–5 permanece a evidência de produto. Isso não testa ainda um pacote
PDF gerado pelo novo exporter nem sua abertura no Atlas.

## O que o exporter atual produz e por que ainda é insuficiente

Para text markers PDF, o exporter atual:

- gera a Representation textual;
- procura novamente `marker.text` nessa Representation;
- emite apenas `PlainTextSelection` quando encontra offsets;
- omite silenciosamente do XML o marker cujo offset não foi resolvido, deixando
  apenas warning;
- não emite a `PDFSelection` visual correspondente;
- não projeta `segments[]` em fragmentos por página;
- gera novos GUIDs de Coding a cada serialização;
- já emite Users e `Coding.creatingUser` para as selections que chegam a ser
  serializadas.

O checkpoint real do Marco 2 tornou a perda mensurável: apenas 33 dos 113 markers
do D1 foram emitidos pelo resolver atual. Isso não é um limite do QDPX, e sim do
caminho de resolução do exporter.

## Três estratégias de saída avaliadas

| Estratégia | Vantagem | Risco |
| --- | --- | --- |
| Um marker Qualia = uma Selection QDPX | Mapeamento simples e sem inferir identidade compartilhada | Atlas pode mostrar várias quotations sobrepostas onde semanticamente havia uma só |
| Agrupar todo marker de geometria coincidente | Saída compacta e próxima do Atlas | Pode fundir memos, relações, datas ou identidades que não são equivalentes |
| Reagrupamento condicional e reversível | Recupera o modelo Atlas quando a equivalência é demonstrável e separa divergências | Exige uma etapa explícita de projeção e critérios de compatibilidade |

A recomendação é a terceira estratégia.

## Projeção de exportação recomendada

Antes de gerar XML, o exporter deve construir unidades de exportação, sem alterar
os markers persistidos. Uma unidade reúne markers somente quando todos os dados
de nível Selection são compatíveis.

### Critérios mínimos para reagrupar

Markers podem compartilhar uma Selection exportada quando possuem:

- mesma source;
- mesma geometria lógica e mesmos segmentos ordenados;
- mesmo conteúdo textual efetivo;
- memo de marker idêntico ou igualmente ausente;
- relações de nível Selection equivalentes;
- metadata de Selection compatível, incluindo a identidade/procedência comum
  quando existir.

Os Codings podem e devem diferir em coder, código, GUID e timestamp. Essas
diferenças são precisamente o conteúdo que fica dentro da Selection compartilhada.

Se qualquer dado que o REFI representa no nível Selection divergir, os markers
saem como Selections independentes. Isso impede que uma otimização estrutural
apague informação.

Procedência pode fornecer identidade e GUIDs estáveis, mas não muda a regra
semântica. Markers nativos e importados com estado equivalente devem produzir a
mesma forma. Markers irmãos importados que foram redimensionados de modo diferente
deixam de ser agrupáveis.

### Memos e relações são gates, não detalhes

O importer atual resolve notes agregadas da Selection e aplica o memo resultante
a todos os markers por coder. Portanto, markers coincidentes com memos diferentes
não podem compartilhar Selection sem revisão adicional do modelo.

Links REFI partem da Selection, não de um Coding. Se somente o marker de um coder
possui uma relação, agrupá-lo faria a relação parecer pertencer também aos outros
coders na reimportação. Por isso relações distintas também impedem agrupamento.

### Autoria e timestamps

- autoria/data da Selection representam a criação da unidade compartilhada;
- autoria/data de cada Coding representam a aplicação individual;
- `codedBy` resolve `Coding.creatingUser`;
- `CodeApplication.qdpx.creationDateTime`, quando válido, tem precedência para o
  timestamp do Coding; aplicações nativas usam o timestamp disponível no marker;
- cada nó físico `Coding` recebe GUID único, mesmo quando repete semanticamente a
  aplicação na parte visual e textual.

Para siblings originalmente compartilhados, a procedência e o timestamp comum
permitem recuperar a Selection Atlas. Markers nativos independentes não devem ser
forçados a compartilhar uma Selection apenas porque seus bounds coincidem.

## Endpoints: conversão direta antes de busca textual

O exporter atual trata `marker.text` como a fonte para redescobrir a posição. Isso
é invertido: markers resolvidos já possuem endpoints autoritativos em
`page/index/offset`, e multipágina possui `segments[]`.

O caminho primário recomendado é:

1. extrair uma vez os text items do PDF e construir a Representation canônica;
2. manter um mapa item/offset → offset global dessa Representation;
3. converter diretamente o início e o fim de cada segmento;
4. verificar que o slice produzido é compatível com o texto lógico do marker;
5. tratar marker pending ou inconsistente como precondição não atendida, com erro
   explícito de cobertura; o exporter não tenta resolver esse estado;
6. nunca descartar silenciosamente uma Selection que não possa ser representada.

Esse caminho evita que hifenização, ligaturas e espaçamento sejam usados para
redescobrir endpoints que o marker já possui. A normalização tolerante serve para
validar o slice produzido, não para reparar markers pending durante o export.

## Bbox: projeção da geometria atual, não recuperação do Atlas

Para abrir como quotation visual no Atlas, cada fragmento precisa de
`PDFSelection(page, firstX, firstY, secondX, secondY)`. O marker do Qualia guarda
endpoints textuais, não um retângulo canônico; o retângulo é uma projeção de
exportação desses endpoints.

A implementação recomendada é preservar nos text items de exportação os campos
geométricos do PDF.js (`transform`, largura e altura), calcular os retângulos dos
itens cobertos e emitir a união retangular em coordenadas PDF para cada segmento.
Offsets parciais dentro de um item exigem aproximação proporcional ou medição
equivalente à text layer; esse detalhe deve receber fixture geométrica própria.

`importedPdfSelectionBBox` pode ser usado pelo comparador para medir o cálculo no
corpus de referência, mas não participa da geração da saída. O exporter não deve
depender do QDPX original nem de hints importados, estejam eles disponíveis ou
não. A geometria atual do marker e o PDF atual são as únicas fontes da bbox.

O export não deve depender de uma página estar aberta no viewer. A extração
headless já feita por `loadPdfExportData` deve ser ampliada para carregar a
geometria necessária no mesmo passe.

## Estrutura alvo

### Uma página

Para cada unidade textual exportada:

- uma `PDFSelection` com página e bbox atuais;
- uma `PlainTextSelection` dentro da Representation com os offsets atuais;
- o mesmo GUID de Selection nas duas representações;
- o mesmo conjunto semântico de Codings em ambas;
- GUID físico distinto para cada elemento Coding;
- notes compatíveis anexadas no nível correto.

### Multipágina

Para cada unidade lógica:

- uma `PDFSelection` por segmento/página;
- o GUID do primeiro fragmento também identifica a `PlainTextSelection` âncora;
- a âncora textual cobre o intervalo lógico inteiro na Representation;
- cada fragmento repete o conjunto semântico de Codings com GUIDs físicos próprios;
- a continuidade fica expressa pela mesma assinatura estrutural que o Atlas usa;
- Links analíticos, inclusive os chamados `continued by`, são preservados apenas
  quando existem no projeto;
- cada bbox deriva do segmento atual correspondente.

## O importer precisa ser refeito?

Não para o contrato principal. Ele já entende a forma Atlas que o exporter deve
produzir. A auditoria recomenda preservar seu comportamento e acrescentar testes
de simetria antes de alterar qualquer regra.

Revisões pontuais podem ser necessárias se o desenho final decidir suportar:

- memo diferente por coder dentro de Selection compartilhada;
- relação pertencente apenas a um Coding dentro de Selection compartilhada;
- preservação byte-identitária do papel de cada GUID físico de Coding;
- cadeia multipágina com três ou mais páginas em algum dialeto externo diferente.

Nenhum desses casos exige revisão para o corpus Atlas atual se o regroup aplicar
os gates de compatibilidade acima.

## Validação em camadas

## Snapshot do estado atual

O exporter representa o corpus existente no Qualia no momento da operação; não
restaura o snapshot que entrou originalmente por QDPX. Se uma source foi removida
do corpus no Qualia, ela e seus markers não participam do novo pacote. O exporter
não tenta recuperar o arquivo, as codificações ou a geometria a partir do QDPX
anterior.

Se restarem registros órfãos apontando para uma source inexistente, o audit deve
identificá-los separadamente como órfãos fora do corpus. Isso não equivale a
descartar silenciosamente um marker válido de uma source atual.

## Corpus de referência e definição externa de sucesso

A aceitação não será uma exploração irrestrita das possibilidades do schema. O
único projeto público comparável encontrado foi criado no Atlas, exportado pelo
próprio Atlas e já validado visualmente no Qualia. Portanto, ele é o corpus
canônico desta frente.

Sem modificar códigos ou trechos importados, a projeção deve inverter corretamente
a normalização interna:

```text
QDPX Atlas: 201 quotations lógicas compartilhadas
→ Qualia: 615 markers independentes por coder
→ QDPX Qualia: 201 quotations lógicas compartilhadas
```

Para o mesmo corpus, a estrutura alvo volta a conter:

- 10 sources PDF codificadas;
- 201 `PlainTextSelection`;
- 207 `PDFSelection`, incluindo seis continuações;
- seis quotations multipágina de duas páginas;
- 1.189 Codings semânticos na representação textual;
- repetição correspondente dos Codings nos fragmentos visuais;
- quatro coders com aplicações preservados em cada Coding.

O sucesso externo é o pacote produzido pelo Qualia abrir no Atlas com os mesmos
documentos, quotations, trechos, códigos, autores e seis casos multipágina que o
projeto original. Não se exige igualdade byte a byte do XML, ordem idêntica dos
elementos ou GUIDs aleatórios idênticos quando a identidade semântica foi mantida.

O QDPX original declara ainda dois usuários sem aplicações: a conta de sistema
`ATLAS.ti` e uma conta Marlon criada no software, mas sem participação na pesquisa.
Os quatro pesquisadores efetivos são exatamente os quatro usuários referenciados
por `Coding.creatingUser`. O importer atual registra os dois restantes no audit,
mas deliberadamente não os cria no CoderRegistry. Essa filtragem é correta e deve
ser preservada: o novo QDPX não deve reemitir contas administrativas ou usuários
sem contribuição como participantes do projeto analítico.

### Marco 6 — antes do Atlas

1. validar o XML contra o XSD local;
2. auditar contagem: todo marker codificado de uma source atual deve aparecer em
   alguma unidade exportada ou em erro explícito;
3. auditar GUIDs e referências sem duplicação inválida;
4. comparar a forma estrutural com o corpus Atlas;
5. importar em outro vault Qualia;
6. comparar Users, coder, códigos, memos, relações, bounds e `segments[]`;
7. cobrir simples, multipágina, simples↔multipágina após resize, siblings ainda
   equivalentes e siblings divergentes.

### Marco 7 — Atlas

O teste externo é deliberadamente fechado sobre o único projeto público de
referência disponível. O fluxo é:

```text
projeto Atlas original
→ QDPX Atlas de referência
→ Qualia, sem editar códigos ou trechos importados
→ novo QDPX produzido pelo Qualia
→ Atlas
```

1. abrir no Atlas exatamente o pacote aprovado no Marco 6;
2. comparar o resultado com o projeto Atlas que gerou o QDPX de referência;
3. conferir os mesmos documentos, quotations, páginas, trechos, códigos e coders;
4. conferir especificamente os seis casos multipágina de duas páginas;
5. verificar que o desdobramento interno em markers por coder voltou a aparecer
   como quotations compartilhadas, sem multiplicação visual;
6. registrar qualquer adaptação do dialeto Atlas sem enfraquecer o QDPX genérico.

O suporte declarado pelo Atlas a QDPX torna plausível que um pacote conforme abra,
mas somente esse checkpoint comprova como sua versão interpreta o par
visual/textual, os links e os grupos multipágina do corpus conhecido. Quotations
com mais páginas, edições no Atlas e outros dialetos continuam úteis como testes
futuros, mas não bloqueiam o fechamento desta referência.

## Conclusão

### Evidência do round-trip Qualia — 2026-09-03

Um projeto PDF pequeno foi exportado e reimportado em vault limpo com dois
markers multipágina recompostos, magnitudes nominais configuradas e aplicadas,
autoria, relação, highlights e margin panel preservados. O estado final continha
sete markers lógicos e nove segmentos físicos (dois pares multipágina mais cinco
markers simples), sem converter cada página em marker independente.

O teste explicitou dois níveis de magnitude: a escala pertence à definição do
código; o valor pertence à aplicação do código em um marker. REFI-QDA não oferece
no corpus observado uma representação nativa para a configuração Qualia da
escala. Uma primeira implementação usou `qualia:magnitude` no `<Code>`, mas a
validação contra o XSD REFI 1.0 mostrou que `CodeType` não aceita atributos
estrangeiros. A forma final usa uma Note padrão
`[Qualia Magnitude Definition: {...}]` referenciada pelo `<Code>` via `<NoteRef>`;
valores aplicados continuam como Notes do Coding. A mesma validação mostrou que
as coordenadas de `PDFSelection` são inteiras no schema, levando o serializer a
arredondar bboxes somente na borda XML.

O importer funcional não precisa ser redesenhado para viabilizar o Marco 6. O
maior trabalho está no exporter: criar uma projeção explícita, derivar offsets e
bbox da geometria atual, emitir as representações visual/textual, projetar
multipágina e medir cobertura sem descarte silencioso.

Seguir o Atlas significa adotar sua representação QDPX quando ela é coerente com
o padrão e com a semântica atual — não condicionar o arquivo à plataforma de
origem. O resultado esperado é o mesmo pacote poder seguir Qualia → Qualia,
Qualia → Atlas e Atlas → Qualia → Atlas.
