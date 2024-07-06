---
version: 9
date: 2024-07-06
title: "Clique milestone: click post create item funcionando"
plugin-id: menu-editors
---

# v9 - Clique milestone

## O que mudou
- **addItemToEditorCodingMenu funcional**: ao digitar texto no campo e pressionar Enter, um novo toggle item e criado dinamicamente no menu usando a Menu API do Obsidian
- **Menu re-exibido apos adicao**: apos criar item, o submenu fecha e reabre na mesma posicao mostrando o novo item
- **Toggle onChange mantem menu aberto**: `selectionTriggeredMenu = true` dentro do onChange impede fechamento ao interagir com toggles
- **Limpeza de debug logs**: removidos console.logs de debug do Enter handler, codigo mais limpo

## Como verificar
1. Abra este arquivo no editor
2. Selecione um trecho de texto - o menu contextual do plugin deve aparecer
3. No campo "New Item", digite um nome e pressione Enter
4. O novo item deve aparecer como toggle no menu, e o menu deve reabrir automaticamente

## Conteudo demo
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Selecione este texto para testar o menu contextual com criacao dinamica de itens.

Outro paragrafo para selecionar: Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae.
