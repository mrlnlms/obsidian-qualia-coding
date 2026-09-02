# PDF — handles e resize de markers simples e multipágina

> Data: 2026-09-02
>
> Branch: `feat/qdpx-multicoder-import`
>
> Baseline: `26fc151`
>
> Estado: desenho aprovado; implementação ainda não iniciada.

## Contexto

O Marco 3 introduziu `segments[]` como geometria autoritativa de um marker PDF
multipágina. Para evitar editar somente uma projeção local, o resize desses
markers ficou temporariamente bloqueado. O Marco 4 passou a representar essa
geometria como uma rail contínua na margin panel.

O produto já possui a interação esperada para resize de markers PDF simples:
dois handles movem o início e o fim, o highlight acompanha o cursor por
atualização silenciosa e a alteração é salva ao soltar. O novo trabalho não cria
outra UX; ele generaliza essa interação para endpoints em páginas diferentes.

A inspeção também confirmou um bug independente de multipágina. Durante o drag,
`updateMarkerRangeSilent` altera o marker e `updateHighlightRectsForMarker`
atualiza somente o highlight. O snapshot da margin panel permanece antigo. No
`mouseup`, `dragHandles.ts` repete o hit-test; se ele falhar, retorna antes de
`updateMarkerRange`, `notify` e do rerender final. Isso explica a rail permanecer
desatualizada mesmo depois de soltar o handle.

## Objetivo observável

Todo marker PDF editável deve oferecer a mesma interação por dois endpoints:

- o handle inicial move o começo lógico do marker;
- o handle final move o fim lógico do marker;
- ambos podem atravessar páginas;
- highlight, handles e margin rail acompanham o movimento;
- uma única alteração é persistida ao soltar;
- um marker simples pode tornar-se multipágina;
- um marker multipágina pode tornar-se simples;
- o usuário nunca manipula `segments[]` diretamente.

Autoria, permissão, hover, códigos, memo e exclusão continuam seguindo as regras
existentes. Somente markers pertencentes ao coder ativo são redimensionáveis.

## Princípio de interação

Não haverá uma regra de resize específica para multipágina. A regra atual será
expressa em coordenadas de documento:

```ts
interface PdfDocumentEndpoint {
  page: number;
  index: number;
  offset: number;
}
```

A ordem é lexicográfica por `page`, depois `index`, depois `offset`. A validação
atual que impede o início de alcançar ou ultrapassar o fim continua a mesma,
apenas usando essa ordem documental.

Existem sempre dois handles lógicos:

- início, no primeiro retângulo do primeiro segmento;
- fim, no último retângulo do último segmento.

Projeções intermediárias não criam handles próprios. Quando ambos os endpoints
estão na mesma página, os dois aparecem nessa página como em qualquer marker
simples.

## Geometria derivada dos endpoints

A representação persistida continua sendo a atual. Nenhum novo schema global é
necessário. Dados dois endpoints válidos:

1. se estão na mesma página, persistir os campos escalares existentes e remover
   `segments[]`;
2. se estão em páginas diferentes, produzir `segments[]` ordenado;
3. o primeiro segmento vai do endpoint inicial ao fim textual da primeira
   página;
4. cada página intermediária forma um segmento textual completo;
5. o último segmento vai do início textual da última página ao endpoint final;
6. sincronizar os campos escalares legados com o primeiro segmento;
7. recompor `marker.text` pela mesma função canônica já usada pelo modelo.

Adicionar ou remover páginas não constitui uma operação exposta ao usuário. É
apenas o resultado de mover início ou fim pelo documento.

## Transação de drag

O resize passa a possuir uma pequena transação efêmera:

```ts
interface PdfMarkerDragTransaction {
  markerId: string;
  handle: 'start' | 'end';
  originalGeometry: PdfMarkerGeometry;
  lastValidGeometry: PdfMarkerGeometry | null;
}
```

### Início

No `mousedown`, capturar uma cópia da geometria original. O DOM do handle mantém
a aparência, hover e classes atuais.

### Movimento

O `mousemove` mantém o throttle existente de aproximadamente 60 fps:

1. localizar a página e a posição textual sob o cursor;
2. substituir somente o endpoint arrastado;
3. aplicar a mesma validação de ordem já existente;
4. derivar a geometria simples ou segmentada;
5. guardar a última geometria válida;
6. atualizar o modelo silenciosamente, sem save e sem `notify`;
7. atualizar os highlights das páginas afetadas;
8. reposicionar os dois handles lógicos;
9. recomputar os snapshots afetados e a rail global da margin panel.

Um ponto sem text layer ou posição textual válida não cria estado novo. A última
geometria válida permanece visível, seguindo a tolerância atual do hit-test PDF.

### Fim

No `mouseup`, não repetir o hit-test como condição para salvar. Persistir a
`lastValidGeometry` já mostrada ao usuário e emitir um único `notify`. Se nenhum
movimento válido ocorreu, restaurar a geometria original sem persistência.

O rerender normal do observer após o `notify` consolida highlights, handles e
margin panel. Isso também corrige o bug dos markers simples em que o `mouseup`
pode abandonar a alteração silenciosa antes do ciclo final.

## Responsabilidades por componente

### Geometria pura

Um módulo DOM-free deve comparar endpoints, construir a geometria simples ou
`segments[]`, recompor textos e permitir testes de simples→multipágina e
multipágina→simples sem mutar o input.

### `dragHandles.ts`

Continua responsável por aparência e eventos do drag, mas passa a consumir
callbacks de documento em vez de manter o hit-test preso ao `pageView` inicial.
Ele mantém a última posição válida e finaliza sem novo hit-test.

### `PdfCodingModel`

Substitui o bloqueio indiscriminado de multipágina por APIs simétricas de preview
e commit de geometria. Ambas respeitam `isMarkerEditable`; preview não salva,
commit atualiza `updatedAt`, salva e notifica uma vez.

### `PdfPageObserver`

Coordena as projeções visuais durante o drag: atualiza as páginas afetadas,
mantém apenas os dois handles lógicos, recompõe snapshots da margin panel e usa o
fluxo normal de `refreshAll` no commit. O fast path não pode destruir o handle que
está recebendo os eventos do drag.

## Margin panel durante resize

A rail PDF deve acompanhar aumento e redução durante o movimento, tanto para
markers simples quanto multipágina. O preview não persiste nada: substitui os
snapshots afetados e recalcula o layout global do Marco 4. Ao soltar, o `notify`
normal confirma a mesma geometria.

Não entram mudanças de lanes, labels, filtros, colisões ou compactação. O
redesign da margin panel permanece uma melhoria posterior independente.

## Estado, autoria e procedência

- marker não pertencente ao coder ativo continua sem handles;
- marker não atribuído continua somente leitura;
- markers de coders coincidentes continuam independentes;
- códigos, memo, magnitude, relações e autoria não mudam durante resize;
- hints e GUIDs importados não participam da interação e não serão redesenhados;
- a geometria editada permanece a fonte autoritativa para o exporter futuro.

## Tratamento de falhas

- hit-test inválido durante movimento: manter a última posição válida;
- nenhuma posição válida no drag: restaurar estado original;
- endpoint que inverteria o intervalo: ignorar, como no fluxo atual;
- página sem text layer: aguardar uma posição válida;
- marker deixa de ser editável: restaurar e não persistir;
- unload durante drag: remover listeners globais e classes de estado.

Não haverá toast ou modal novo para essas condições.

## Escopo incluído

- corrigir o commit de resize simples quando o hit-test do `mouseup` falha;
- sincronizar a margin panel PDF durante resize simples;
- permitir handles em markers multipágina editáveis;
- mover endpoints através de páginas;
- derivar segmentos automaticamente;
- converter simples↔multipágina;
- atualizar highlights, handles e rail durante preview;
- persistir uma vez ao soltar;
- adicionar testes puros, de modelo, DOM e validação manual.

## Fora do escopo

- importer ou resolução de markers pending;
- exporter QDPX e round-trip;
- validação ou adaptação Atlas;
- novo schema persistido para posição global;
- redesign da margin panel;
- novos estilos ou handles intermediários;
- alteração de autoria ou permissão;
- undo/redo novo além do comportamento atual de resize.

## Testes automatizados

### Geometria

- comparação por página, índice e offset;
- movimento dentro da mesma página;
- simples→multipágina e multipágina→simples;
- expansão e redução por uma ou várias páginas;
- páginas intermediárias completas;
- tentativa de inversão rejeitada;
- texto lógico e projeção escalar sincronizados;
- cálculo não muta o input.

### Modelo e transação

- somente owner pode confirmar resize;
- preview não salva nem notifica;
- commit salva/notifica exatamente uma vez;
- `mouseup` confirma a última posição válida sem novo hit-test;
- drag sem candidato restaura o original;
- marker simples continua funcionando.

### DOM e observer

- exatamente dois handles no marker lógico;
- nenhum handle em projeções intermediárias;
- handle muda de página sem duplicação;
- highlights antigos são removidos e novos aparecem nas páginas afetadas;
- rails simples e multipágina acompanham o drag;
- cleanup remove listeners e estado transitório.

## Validação manual

No viewer real:

1. redimensionar início e fim de um marker simples e confirmar rail ao vivo;
2. transformar esse marker em multipágina e voltar para simples;
3. mover início e fim de um marker multipágina do perfil ativo;
4. reduzir um marker de duas páginas para uma;
5. expandir através de uma página intermediária;
6. confirmar apenas dois handles durante todo o fluxo;
7. confirmar persistência reabrindo o PDF;
8. confirmar ausência de handles e mutação em marker estrangeiro;
9. repetir após zoom e scroll;
10. confirmar que Markdown não mudou.

## Ordem do roadmap

Este trabalho passa a ser o Marco 5 por completar a funcionalidade-base de
marcação e edição. Depois dele:

1. Marco 6 fecha o round-trip PDF Qualia→Qualia;
2. Marco 7 testa imediatamente o mesmo contrato no Atlas;
3. o redesign da margin panel permanece backlog isolado de usabilidade e refino.

## Critérios de conclusão

O Marco 5 termina quando:

1. resize PDF simples atualiza highlight e margin panel durante o drag e após o
   `mouseup`;
2. markers multipágina possuem apenas os dois handles lógicos;
3. endpoints atravessam páginas preservando um intervalo contínuo;
4. conversões simples↔multipágina acontecem automaticamente;
5. preview não persiste e commit persiste uma vez;
6. ownership e read-only permanecem corretos;
7. testes focados, suíte completa, build e validação manual passam;
8. importer, exporter, Atlas e redesign permanecem fora do diff.
