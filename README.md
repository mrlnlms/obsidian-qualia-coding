# Qualitative Coding Plugin

Plugin para Analise de Dados Qualitativos (QDA) no Obsidian.

## v2 — Modular: modals/, tooltip/, types/

Refatoracao para estrutura modular. Logica extraida de main.ts para modulos separados.

### Estrutura

```
main.ts                    <- plugin principal (imports modulares)
modals/ApplyCodeModal.ts   <- modal de aplicar codigo
modals/RemoveCodeModal.ts  <- modal de remover codigo
tooltip/CodeTooltip.ts     <- tooltip no hover
types/obsidian-ex.d.ts     <- type augmentations (Menu, MenuItem)
```

### Funcionalidades

- **ApplyCodeModal** — aplica codigos qualitativos a selecoes de texto
- **RemoveCodeModal** — remove codigos de selecoes
- **CodeTooltip** — tooltip no hover mostrando nome do codigo e cor
- **Clean All Codes** — comando para limpar todos os codigos do documento
- **Highlight colorido** — estilos dinamicos por codigo, persistidos no localStorage
- **Context menu** — itens no editor-menu (botao direito)
- **Ribbon icons** — sol (apply), cross (remove), trash (clean all)
- **reapplyStyles()** — estilos recarregados ao abrir arquivo

### Como usar

1. Selecione texto no editor
2. Use o comando "Apply Code to Selected Text" (ou o icone sol na ribbon)
3. Digite o nome do codigo e escolha uma cor
4. O texto fica highlighted com a cor escolhida
5. Passe o mouse sobre texto codificado para ver o tooltip
6. Use "Clean All Codes" para limpar todos os codigos do documento
