# QDPX PDF — export interoperável e round-trip do corpus Atlas

> Data: 2026-09-02  
> Estado: desenho aprovado; implementação pendente  
> Marco: 6 — export PDF e round-trip completo antes do checkpoint Atlas

## Contexto

Os Marcos 1–5 já entregaram:

- importação multicoder com um marker independente por coder;
- Users e autoria de Codings no round-trip já emitido;
- marker lógico PDF multipágina baseado em `segments[]`;
- margin panel mínima correta para multipágina;
- handles capazes de transformar simples ↔ multipágina;
- validação visual dos dez PDFs do corpus Atlas.

O exporter PDF ainda não representa esse estado com fidelidade. Text markers são
redescobertos por busca em uma Representation gerada e, quando resolvidos, saem
somente como `PlainTextSelection`. Não há `PDFSelection` visual correspondente,
fragmentos multipágina nem Links `continued by`. No D1 real, somente 33 dos 113
markers chegaram ao XML no checkpoint do Marco 2.

O objetivo agora é exportar o estado atual do Qualia em QDPX REFI-QDA portátil,
reimportá-lo sem perda e, no Marco 7, abrir exatamente esse pacote no Atlas.

## Referências

### Pesquisa do projeto

- [Auditoria REFI, Atlas → Qualia e desenho da saída](../../_research/qdpx-refi-pdf-export-interoperability.md)
- [Autoria multicoder, round-trip e margin panel](../../_research/qdpx-atlas-coder-roundtrip-margin-panel.md)
- [Diagnóstico multipágina do corpus Atlas](../../_research/qdpx-atlas-multipage-diagnostic.md)
- [Desenho do marker lógico multipágina](2026-09-02-qdpx-multipage-marker-design.md)
- [Desenho dos handles multipágina](2026-09-02-pdf-multipage-handle-resize-design.md)

### Referências externas

- [REFI-QDA](https://www.qdasoftware.org/)
- [Especificação REFI-QDA 1.5](https://openqda.github.io/refi-tools/docs/standard/REFI-QDA-1-5.pdf)
- [ATLAS.ti — Project Export in QDPX format](https://atlasti.com/features/project-export-in-qdpx-format)
- [ATLAS.ti — Quotations](https://manuals.atlasti.com/Win/en/manual/MainConcepts/EntityTypeQuotation.html)

O padrão é a referência semântica e de schema. O QDPX real do Atlas é a principal
referência concreta de interoperabilidade disponível. O resultado não será um
formato privado do Qualia nem um serializer condicionado à plataforma de origem.

## Objetivo de produto

Um projeto PDF codificado no Qualia deve poder:

1. ser exportado como pacote QDPX válido;
2. ser importado em outro vault Qualia sem perder o estado analítico;
3. ser exportado novamente sem degradação progressiva;
4. quando derivado do corpus Atlas intacto, abrir no Atlas como o projeto de
   referência que gerou o primeiro QDPX.

QDPX representa o snapshot atual. Não restaura sources, markers ou geometria que
tenham sido removidos no Qualia depois da importação.

## Corpus e definição fechada de sucesso externo

O único projeto público comparável encontrado foi criado no Atlas e exportado
pelo próprio Atlas. O teste externo será deliberadamente fechado sobre ele:

```text
projeto Atlas original
→ QDPX Atlas de referência
→ Qualia, sem alterar códigos ou trechos
→ QDPX produzido pelo Qualia
→ Atlas
→ comparação com o projeto original
```

A normalização interna precisa ser invertida corretamente:

```text
201 quotations compartilhadas no QDPX Atlas
→ 615 markers independentes por coder no Qualia
→ 201 quotations compartilhadas no QDPX Qualia
```

O pacote recomposto deve conter:

- 10 sources PDF codificadas;
- 201 `PlainTextSelection`;
- 207 `PDFSelection`, incluindo seis continuações;
- seis quotations multipágina de duas páginas;
- 1.189 Codings semânticos na representação textual;
- repetição correspondente dos Codings nos fragmentos visuais;
- quatro pesquisadores referenciados por `Coding.creatingUser`;
- os mesmos trechos, códigos, autores, páginas e grupos multipágina.

O arquivo Atlas declara ainda a conta de sistema `ATLAS.ti` e uma conta Marlon
sem Codings. O importer já as exclui corretamente do CoderRegistry. Elas aparecem
somente no audit e não devem ser reemitidas como participantes.

Não são requisitos deste checkpoint:

- igualdade byte a byte do XML;
- ordem idêntica dos elementos;
- GUIDs aleatórios idênticos quando a identidade semântica foi preservada;
- quotations com três ou mais páginas;
- cenários sintéticos sem projeto Atlas comparável;
- edição no Atlas seguida de um novo retorno ao Qualia.

Esses cenários podem ser avaliados depois com evidência própria.

## Modelo semântico

No REFI-QDA:

- Selection é uma parte identificada da source;
- Coding é a aplicação de um código à Selection;
- uma Selection pode conter múltiplos Codings;
- autoria e timestamp do Coding pertencem à aplicação;
- autoria, nome, datas, memo e Links da Selection pertencem à unidade selecionada.

O Qualia continua com um marker independente por coder. A Selection compartilhada
é uma projeção do export, nunca uma entidade interna editável ou sincronizada.

## Arquitetura

O exporter ganha uma etapa intermediária explícita:

```text
PdfMarker[]
    ↓
extração PDF.js por documento
    ↓
projeções individuais
(offsets + texto + bbox + metadata)
    ↓
unidades semânticas QDPX
(independentes ou reagrupadas)
    ↓
serializer REFI-QDA
    ↓
auditoria de cobertura
```

### Extração PDF

`loadPdfExportData` continua carregando o PDF uma única vez, mas a extração deve
conservar durante o processamento:

- Representation textual canônica;
- offsets iniciais de página;
- texto bruto e faixa útil de cada text item;
- mapa item/offset → offset global;
- dimensões de página;
- transformação, largura e altura necessárias ao bbox.

O processamento ocorre sequencialmente por PDF. A geometria não é persistida no
`data.json` e o exporter não depende de tabs abertas no viewer.

### Projeção individual

Cada marker de uma source atual produz primeiro uma projeção independente:

- referência ao marker;
- intervalo textual global;
- texto efetivamente coberto;
- fragmentos visuais por página;
- bbox atual de cada fragmento;
- coder, códigos, magnitudes e timestamps;
- memo, relações e procedência;
- estado de validação.

O serializer não procura texto, calcula geometria ou decide agrupamento.

### Unidade semântica

A etapa seguinte transforma uma ou mais projeções compatíveis em uma unidade
QDPX contendo:

- GUID da Selection;
- markers internos representados;
- Codings semânticos;
- fragmento âncora;
- fragmentos de continuação;
- PlainTextSelection;
- assinatura estrutural de continuidade multipágina;
- metadata de nível Selection.

## Snapshot atual e sources removidas

O universo do export é o corpus atual:

- source atual: seus markers codificados entram na cobertura;
- source removida: source e markers não entram no pacote;
- registro órfão apontando para source inexistente: aparece no audit como órfão
  fora do corpus e não é recuperado do QDPX anterior;
- source atual ilegível: falha de export, pois seu estado não pode ser projetado.

O teste Atlas não altera nem remove sources; por isso exige paridade integral.

## Endpoints e Representation

### Autoridade

As únicas autoridades da saída são:

```text
PDF atual + endpoints atuais do marker
```

Para marker multipágina, `segments[]` é autoritativo. Para marker simples, valem
`page`, `beginIndex`, `beginOffset`, `endIndex` e `endOffset`.

### Conversão direta

O caminho primário não redescobre `marker.text` por busca:

1. construir a Representation e o mapa dos text items;
2. converter diretamente o início e o fim de cada segmento;
3. compor o intervalo global da primeira à última página;
4. extrair o slice correspondente;
5. verificar sua compatibilidade com `marker.text` e `segment.text`;
6. registrar normalizações aceitas.

A Representation mantém items unidos por espaço e páginas separadas por `\f`.
Cabeçalhos, rodapés, tabelas e legendas permanecem na ordem linear nativa.

### Pending fora do escopo

O exporter não tenta resolver marker pending. Esse estado é uma limitação antiga
e não participa do caso de uso real validado, em que os documentos foram abertos
e trabalhados.

- marker resolvido: projetar;
- marker pending ou inconsistente em source atual: erro explícito de cobertura;
- nenhuma busca headless nova ou persistência de resolução durante o export.

## Geometria e bbox

Cada fragmento textual gera uma `PDFSelection` retangular:

1. identificar text items e parcelas cobertas pelos endpoints;
2. derivar retângulos usando a geometria PDF.js;
3. converter para pontos PDF;
4. calcular a união retangular na página;
5. arredondar conforme o contrato do schema e do corpus.

Offsets parciais nos items inicial/final devem ser cobertos pelo cálculo. A
primeira implementação cobre o texto horizontal e as rotações encontradas nos dez
PDFs do corpus.

`importedPdfSelectionBBox` não participa da geração. Ele pode ser usado apenas no
comparador para medir a proximidade entre o cálculo do Qualia e o bbox Atlas. O
exporter funciona sem o QDPX original e sempre usa a geometria atual.

## Reagrupamento

### Candidatos

Markers por coder com o mesmo `importedQdpxSelection.selectionGuid` são candidatos
a recompor a mesma Selection externa. Markers nativos independentes continuam
independentes mesmo com bounds coincidentes; igualdade geométrica não prova uma
identidade compartilhada.

### Compatibilidade

Siblings podem ser reagrupados quando possuem:

- mesma source;
- mesma geometria e segmentos ordenados;
- mesmo conteúdo textual efetivo;
- memo idêntico ou igualmente ausente;
- relações de nível Selection equivalentes;
- metadata de Selection compatível.

Coder, código, GUID e timestamp de Coding podem diferir. Essas diferenças viram
Codings independentes dentro da Selection compartilhada.

### Divergência

Se bounds, texto, memo ou relações divergirem, os markers incompatíveis formam
Selections independentes. Se um grupo compartilhado se dividir, o GUID comum
antigo é aposentado para aquele conjunto e as novas unidades recebem identidades
determinísticas próprias; nenhum coder é escolhido arbitrariamente como dono da
quotation anterior.

No corpus intacto, todos os siblings compatíveis recompõem as 201 quotations.

## Proveniência mínima adicional no importer

O importer atual preserva os autores dos Codings, mas não guarda separadamente o
criador e o nome da Selection. Esses dados não podem ser inferidos do primeiro
Coding: no corpus, 207 PDFSelections têm `creatingUser`, mas apenas 170 possuem
algum Coding do mesmo usuário e apenas 122 coincidem também em timestamp.

`QdpxSelectionProvenance` deve preservar, sem alterar comportamento visível:

- `creatingUserGuid` da Selection;
- nome original;
- `creationDateTime` quando necessário;
- GUID âncora e GUIDs dos fragmentos, já existentes.

Essa extensão não muda quantidade de markers, ICR, permissões, handles, layout ou
resolução. Serve somente ao reexport de uma Selection intacta.

## Estrutura XML alvo

### Uma página

Para cada unidade textual:

- `PDFSelection` com página e bbox atuais;
- `PlainTextSelection` na Representation com offsets atuais;
- mesmo GUID de Selection nas duas representações;
- mesmo conjunto semântico de Codings em ambas;
- GUID físico distinto em cada elemento Coding;
- autoria, datas e Notes no nível correto.

### Multipágina

Para cada unidade lógica:

- uma `PDFSelection` por segmento/página;
- primeiro fragmento como âncora;
- `PlainTextSelection` com o GUID da âncora e intervalo lógico completo;
- Codings semânticos repetidos em cada representação com GUIDs físicos próprios;
- mesma assinatura estrutural entre os fragmentos, sem sintetizar Links;
- Links analíticos existentes, inclusive os chamados `continued by`, preservados
  como relações normais;
- bbox derivado de cada segmento atual.

O corpus conhecido possui somente duas páginas por quotation. Mais páginas não
entram na aceitação Atlas desta frente.

## GUIDs

### Selection

- unidade importada intacta: reutilizar GUIDs da âncora e fragmentos;
- unidade nativa ou derivada de divergência: GUID determinístico baseado em
  identidade estável do marker/unidade e papel do fragmento;
- PlainTextSelection e PDFSelection âncora compartilham GUID, seguindo o dialeto
  Atlas observado.

### Coding

- cada nó físico Coding possui GUID global próprio;
- `sourceCodingGuids[]` é reutilizado conforme o papel em que foi lido quando a
  estrutura permanecer intacta;
- aplicação nova ou alterada recebe GUID determinístico derivado da Selection,
  coder, código, representação e fragmento;
- o mesmo projeto reexportado não troca identidades sem motivo.

## Autoria, nomes, memos e relações

- `<Users>` contém somente coders referenciados por Codings emitidos;
- `codedBy` resolve `Coding.creatingUser`;
- timestamp QDPX válido da aplicação tem precedência no Coding;
- Selection intacta preserva criador, nome e data importados;
- Selection nativa/modificada deriva nome do texto lógico atual;
- memo idêntico entre siblings pode permanecer no nível Selection;
- memo divergente impede agrupamento;
- magnitude permanece NoteRef do Coding correspondente;
- a definição Qualia da escala (`type` e valores permitidos) permanece metadado
  namespaced do Code; o valor escolhido continua pertencendo ao Coding;
- relações equivalentes podem partir da Selection compartilhada;
- relação divergente por marker impede agrupamento.

Isso evita que memo ou Link pertencente a um coder seja propagado aos demais na
reimportação.

## Pacote e operação atômica

Cada PDF atual exportado inclui:

- arquivo PDF;
- Representation `.txt` atual;
- `PDFSource`;
- PDFSelections;
- PlainTextSelections;
- Codings, Notes e Links referenciados.

O exporter primeiro projeta e valida todas as sources. O `.qdpx` só é oferecido
como concluído depois que não houver falha de marker válido, bbox, offset, GUID,
arquivo ou referência.

## Auditoria do export

Por documento, registrar:

- markers de origem em sources atuais;
- projeções válidas;
- Selections emitidas;
- Codings semânticos e físicos;
- fragmentos PDF;
- normalizações;
- órfãos fora do corpus;
- falhas.

Todo marker codificado de source atual precisa aparecer em exatamente uma unidade
exportada ou em erro explícito.

## Comparador semântico

O QDPX original e o produzido pelo Qualia serão normalizados para:

```text
source
└── selection lógica
    ├── trecho textual
    ├── páginas e fragmentos
    ├── bbox por página
    ├── coder + código + timestamp
    ├── memo
    └── relações
```

Comparar:

- PDFs e, quando aplicável, hash binário;
- codebook: nomes, cores e hierarquia;
- quatro pesquisadores participantes;
- contagens de Selection, fragmento e Coding;
- pares coder–código por quotation;
- seis grupos multipágina;
- páginas e ordem dos fragmentos;
- texto selecionado após normalização controlada;
- ausência de perdas, extras e multiplicações.

GUID preservado exige igualdade. GUID legitimamente regenerado exige consistência
referencial. Offsets são comparados pelo texto resultante porque a Representation
PDF.js pode diferir da textualização Atlas. Bboxes calculados são comparados ao
Atlas com diagnóstico geométrico; a inspeção final no Atlas decide a equivalência
visual.

## Round-trip Qualia

Antes do Atlas:

```text
Vault A → QDPX 1 → Vault B → QDPX 2
```

Comparar entre A e B e entre os dois pacotes:

- markers e Selections lógicas;
- coder e códigos;
- magnitudes;
- memos e relações;
- bounds;
- texto lógico;
- quantidade e ordem de `segments[]`;
- classificação simples/multipágina;
- identidade externa relevante;
- ausência de multiplicação no segundo export.

## Checkpoint Atlas

Depois do Marco 6, abrir exatamente o pacote aprovado no Atlas e comparar com o
projeto original:

- mesmos documentos;
- mesmas quotations;
- mesmos trechos e páginas;
- mesmos códigos e quatro pesquisadores;
- mesmos seis casos multipágina;
- nenhuma explosão das 201 quotations em 615 quotations por coder.

Esse checkpoint mede o dialeto concreto do Atlas. Não será usado para explorar
cenários sem referência nesta frente.

## Tratamento de falhas

- source removida: fora do snapshot;
- registro órfão: audit, sem recuperação histórica;
- source atual ilegível: falha;
- marker pending/inconsistente: falha explícita, sem resolver;
- divergência de normalização compatível: aceitar e registrar;
- bbox/offset/GUID/referência inválida: falha;
- marker não emitido: nunca apenas warning seguido de sucesso.

## Consumo

- processar um PDF por vez;
- construir texto e geometria em um único passe PDF.js;
- liberar o documento antes da próxima source;
- manter projeção e agrupamento em memória somente durante o export;
- não renderizar DOM;
- não persistir geometria temporária.

## Sequência de implementação

1. proveniência mínima da Selection;
2. projeção PDF pura: endpoints, offsets, texto e bbox;
3. unidade semântica e reagrupamento;
4. serializer visual/textual e multipágina;
5. auditoria e comparador do corpus.

As tarefas serão implementadas inline. Depois do diff funcional completo:

1. um único subagente fresco revisa o conjunto;
2. os achados são corrigidos;
3. o corpus gera o primeiro pacote;
4. o usuário valida Qualia → Qualia;
5. testes e documentação são consolidados;
6. suíte, build, XSD e comparador fecham o Marco 6;
7. o mesmo pacote segue para o Atlas.

Verificações mínimas acompanham a implementação, mas a bateria final de regressão
é consolidada depois do checkpoint manual, conforme metodologia aprovada.

## Fora do escopo

- redesign da margin panel;
- resolver markers pending durante export;
- recuperar source removida pelo QDPX original;
- alterar semântica de autoria, edição ou ICR;
- introduzir quotation compartilhada no modelo persistido do Qualia;
- testar multipágina além do corpus conhecido;
- ampliar a rodada Atlas para cenários sintéticos;
- mudar o fluxo de shapes PDF, salvo adaptação estritamente necessária para
  coexistir com text selections.

## Critérios de aceitação do Marco 6

1. nenhuma source removida é restaurada;
2. nenhum marker válido de source atual desaparece;
3. offsets derivam dos endpoints atuais;
4. bbox deriva do PDF e geometria atuais;
5. PDF textual sai como par visual/textual;
6. `segments[]` sai como fragmentos ordenados e estruturalmente correlacionados;
7. siblings intactos recompõem a Selection compartilhada;
8. siblings divergentes permanecem independentes;
9. Users, Codings, códigos, autoria, memo e relações mantêm semântica;
10. XML é conferido contra o `Project.xsd` oficial do REFI-QDA; o schema é obtido
    da fonte oficial e não pressuposto como arquivo versionado local;
11. Vault A → QDPX → Vault B preserva o contrato;
12. o segundo export não degrada nem multiplica o projeto;
13. o comparador do corpus reporta as contagens esperadas e zero perda semântica;
14. checkpoint visual no Qualia aprovado;
15. suíte focada, suíte completa, type-check, build e `git diff --check` aprovados.

Aceitação pelo Atlas pertence ao Marco 7 e não será declarada antes do teste
externo, embora este desenho seja orientado diretamente pelo pacote Atlas real.
