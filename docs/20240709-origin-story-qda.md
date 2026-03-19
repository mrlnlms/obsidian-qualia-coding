---
date: 2024-07-09
---
# Origin Story — QDA / Qualia Coding (Jul-Ago 2024)

> Documento original. Notas pessoais escritas durante a concepcao do plugin de analise qualitativa.
> Periodo: Jul-Ago 2024. Escrito na mesma epoca que a origin story do Mirror Notes (primeiro plugin).
> Contexto: apos criar o Mirror Notes (visualizacao de YAML via templates), surgiu a ideia de usar o editor do Obsidian para codificacao de texto qualitativa.
> Origin story do Mirror Notes em: `obsidian-mirror-notes/docs/archive/raw-material/plugin-dev-history/20240709-origin-story-mirror-notes.md`

---

Passado algum tempo, eu vim pensando na possibilidade de fazer análise de dados qualitativa dentro do obsidian. Eu penso que o ambiente principal do produto é o editor, e pesquisas qualitativas são em grande maioria composta por conteúdo textual. A análise de dados qualitativa pode ser feitas de diversas formas. Uma abordagem tradicional nas ciências sociais são as análises do discurso e de conteúdo. Tais métodos geralmente utilizam de codificação do conteúdo. Ferramentas como NVivo e MaxQDA são populares neste contexto.

Essas ferramentas possibilitam a criação de códigos. Tais códigos representam uma unidade de significado e você utiliza-os em diversos trechos, por exemplo de transcrições de entrevistas e entre transcrições. Ou seja, diversos participantes podem receber as mesmas codificações em diversas partes do conteúdo.
Em alguns casos, um trecho pode conter mais de um código.

Neste softwares, o trecho codificado fica ==highlited==, podendo escolher a cor e editar as tags, ou mesmo remover. Perceba que aqui estamos lidando com um tipo de interação direta com um editor, e por isso penso ser um ambiente interessante para testar a criação de um plugin com este proposito.

Sei que tem muitas outras coisas que esse software fazem, mas aqui pretendo inicialmente possibilitar a codificação de textos no formato .md.

Meu foco principal inicial foi criar a interface do usuário, que basicamente é um menu que é aberto ao selecionar um trecho de texto. Este menu foi customizado para o trabalho de codificação (apesar de buscar usar os componentes do obsidian ao maximo, por exemplo Menu o comp neste plugin). Primeiro, adicionei um campo de texto onde o usuário pode criar tags de forma rápida e simples e aplicar ao trecho instantaneamente. Este item se torna uma opção com um toggle ligado, abaixo neste mesmo menu, que continua aberto e com o texto selecionado. Se eu clicar nesta nova opção com toggle, ele desliga e a tag é removida da seleção. A cada tag criada no campo de texto, a lista de itens exibe a nova tag por ordem de criação ([futuramente por uso ao abrir em nova seleção]). Limitei a 5 itens de tag neste menu [configurar isso em settings].
Abaixo, temos uma opção add new tag, que abre um popup onde adiciona uma nova tag (mas com mais opções de preenchimentos como descrição, cor), add existing tags (abre um popup para escolher varias) e remove tags, e por fim remove All, que limpa todas as tags do arquivo.
Esses codigos estou usando atributos html span dentro do MD para poder highlight ele. esses itens .

[Vai precisar criar no campo de texto uma busca pra ficar maluco!]

E isso foi o que fiz até o momento. Agora o proximo passo vai ser fazer a gestão e exibição das tags, e a estratégia de exibiçnao dos trechos, links e visualização dos dados. -> ==Ponto Critico!.==

Acabei escrevendo sobre o que estou desenvolvendo mas não sobre a motivação. A motivação é ter uma ferramenta open-source para fazer este trabalho mas com uma UX excelente, pelo menos em termos de codificação de texto.
