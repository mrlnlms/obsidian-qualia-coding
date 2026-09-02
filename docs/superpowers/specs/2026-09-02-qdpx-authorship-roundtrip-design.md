# QDPX — round-trip isolado de autoria

> Data: 2026-09-02
>
> Estado: Marco 2 concluído; round-trip PDF Qualia↔Qualia pendente para o Marco 6
> e interoperabilidade Atlas pendente para o Marco 7.

## Objetivo

Fechar um ciclo automatizável Qualia → QDPX → Qualia para identidade e autoria,
sem declarar concluída a interoperabilidade PDF com o Atlas. O pacote exportado
deve preservar os coders que realmente possuem aplicações e associar cada
`Coding` ao `User` correto.

Este slice é uma fundação comum para seleções simples e multipágina. A projeção
final da geometria PDF continua adiada até o marker lógico com `segments[]` estar
estável.

## Motivação e ordem dos marcos

O acesso ao Atlas é temporário. Validar agora um round-trip PDF simples e repetir
o processo depois do multipágina consumiria duas janelas externas e ainda poderia
cristalizar uma representação que precisaria ser refeita.

A nova sequência é:

1. round-trip isolado de autoria, validável sem Atlas;
2. completar o conteúdo dos imports multipágina;
3. criar o marker lógico por coder com `segments[]`;
4. entregar a margin panel multipágina mínima correta;
5. realizar melhorias visuais posteriores no Qualia;
6. implementar e validar o round-trip PDF simples e multipágina entre vaults
   Qualia/Obsidian;
7. usar uma rodada externa separada no Atlas para validar interoperabilidade,
   edição e retorno ao Qualia.

## Escopo incluído

- emitir `<Users>` no `project.qde`;
- incluir apenas coders referenciados por aplicações exportadas;
- usar o GUID REFI-QDA já preservado para coders importados;
- atribuir e persistir uma identidade REFI-QDA estável para coders locais que
  participem da exportação;
- emitir `creatingUser` em cada `<Coding>`;
- usar o timestamp da aplicação importada quando disponível e o timestamp do
  marker como fallback;
- reimportar o pacote no Qualia e confirmar identidade, autoria e independência
  das aplicações;
- validar o XML produzido contra os contratos locais e, quando disponível no
  ambiente de testes, contra o schema REFI-QDA.

## Fora de escopo

- afirmar que o QDPX já foi validado no Atlas;
- reconstruir o par Atlas `PDFSelection + PlainTextSelection`;
- reagrupar markers irmãos por geometria;
- preservar definitivamente os dois GUIDs de Coding do par visual/textual;
- emitir grupos multipágina ou relações `continued by`;
- alterar bounds, anchoring, handles, zebra ou margin panel;
- implementar políticas de merge para reimportação em vault populado.

## Contrato de identidade

O `CoderRegistry` é a fonte canônica de coders; `data.json` não é memória da
investigação nem deve receber um mapa paralelo específico do exporter.

Para cada coder referenciado:

- se houver `externalIdentities` com scheme `refi-qda-user-guid`, esse GUID é
  reutilizado;
- caso contrário, uma identidade REFI-QDA é criada uma única vez, anexada ao
  próprio coder e persistida pelo registry;
- o nome é apresentação e nunca chave de identidade;
- dois nomes iguais com GUIDs diferentes continuam Users diferentes;
- coders sem aplicações exportadas não entram em `<Users>` neste slice;
- markers explicitamente `unattributedOwner` não são atribuídos ao Default e
  permanecem fora da exportação autorada, acompanhados de warning.

## Contrato de Coding

O serializer recebe explicitamente a identidade do owner. Cada Coding exportado
contém:

- `guid` válido para o pacote;
- `creatingUser` apontando para um User emitido;
- `creationDateTime` vindo de `CodeApplication.qdpx.creationDateTime`, quando
  disponível, ou do marker;
- `CodeRef` e eventuais NoteRefs já suportados.

Os `sourceCodingGuids` continuam preservados no estado interno, mas este slice não
promete escolher definitivamente entre o GUID visual e o textual. Essa escolha
pertence ao exporter PDF completo, quando ambas as representações forem emitidas.

## Fluxo de dados

1. A orquestração reúne todos os markers que serão exportados.
2. Um helper coleta os owners atribuídos e resolve um GUID REFI-QDA estável para
   cada um.
3. O projeto emite `<Users>` antes das fontes.
4. Cada builder de seleção passa o owner e o timestamp da aplicação ao serializer
   de Coding.
5. O importer existente lê o pacote e resolve os GUIDs externos para os mesmos
   coders locais.
6. Um teste de integração compara Users, `codedBy`, códigos e independência dos
   markers após a reimportação.

## Erros e warnings

- marker sem owner legado não deve ganhar autoria silenciosamente;
- marker `unattributedOwner` deve ser omitido do conjunto autorado e gerar warning;
- Coding nunca deve referenciar User ausente de `<Users>`;
- identidade externa inválida deve ser substituída por GUID válido e persistente,
  sem usar o nome como fallback;
- falha na persistência da nova identidade deve interromper a exportação, pois um
  GUID efêmero quebraria a estabilidade entre pacotes.

## Validação automatizada

O fixture mínimo contém Carla e João aplicando o mesmo código ao mesmo trecho e
uma terceira aplicação criada por `human:default`. Os testes devem provar:

- três Users referenciados e três Codings com `creatingUser` correto;
- GUIDs importados de Carla e João preservados;
- GUID do Default estável em duas exportações;
- reimportação gera três markers independentes;
- nomes iguais com GUIDs diferentes não são fundidos;
- coder sem aplicação não é emitido;
- marker sem autoria não é atribuído ao Default;
- nenhum comportamento de multipágina ou margin panel muda.

## Checkpoint manual sem Atlas

O usuário precisa apenas:

1. abrir o vault de teste;
2. confirmar contribuições de dois perfis importados e do Default;
3. exportar o QDPX;
4. limpar o estado de importação pelo fluxo de teste já usado;
5. reimportar o pacote;
6. confirmar que os três perfis e suas contribuições continuam separados no
   Compare Coders.

Esse checkpoint valida o contrato isolado de autoria Qualia↔Qualia. A cobertura
PDF completa entre vaults pertence ao Marco 6; a aceitação pelo Atlas permanece
explicitamente separada e pendente para o Marco 7.

### Resultado observado em 2026-09-02

- o pacote declarou cinco Users participantes, incluindo o perfil local Default;
- o Default recebeu o GUID REFI-QDA estável
  `0f5d233d-ca4f-4d82-bd22-31cff84ed4ab`;
- a seleção curta `Stable product teams` foi emitida em `33601–33621`, reimportada
  em modo somente leitura e associada ao mesmo GUID externo;
- o marker apareceu no trecho esperado e no Compare Coders como
  `Default - marlon-teste`, separado dos perfis importados;
- 109 testes focados e 3.660 testes da suíte completa passaram, junto com build e
  `git diff --check`.

O corpus real também expôs uma limitação fora deste slice: somente 33 dos 113
markers do D1 foram serializados porque o resolver atual do exporter aceita
apenas correspondência exata ou normalização de whitespace. Os markers omitidos
contêm diferenças de hifenização, ligaturas, pontuação espaçada e caracteres de
substituição entre o marker e o PlainText canônico. A correção e a paridade de
cobertura pertencem ao Marco 6; este marco garante autoria para toda Selection
que efetivamente é emitida, sem declarar round-trip PDF completo.

## Critérios de conclusão

O slice termina quando:

1. Users e `creatingUser` são emitidos sem referências órfãs;
2. identidade externa importada e identidade local recém-atribuída são estáveis;
3. exportação seguida de reimportação preserva autoria e aplicações independentes;
4. testes focados, suíte completa, build e `git diff --check` passam;
5. o checkpoint manual Qualia↔Qualia é aprovado;
6. nenhuma projeção multipágina ou promessa de interoperabilidade Atlas é
   introduzida.
