---
version: 17
tag: v0.1.0
date: 2025-05-19
description: "TAG v0.1.0 — Estavel: handles visiveis, bug DOM-CM"
---

# v17 — TAG v0.1.0: Estavel, handles visiveis, bug DOM-CM

## O que ha de novo
- Primeira versao estavel taggeada (v0.1.0)
- Handles de redimensionamento visiveis nas marcacoes
- Bug conhecido: traducao DOM para CodeMirror nao funciona (interacao das handles)
- Eventos de workspace (active-leaf-change, layout-change) escondem handles
- Comando para resetar todas as marcacoes

## Como verificar
1. Abra o console: deve mostrar `[CodeMarker] v17 loaded`
2. Selecione texto e use o comando "Criar uma nova marcacao de codigo"
3. Observe que handles aparecem mas nao respondem a drag (bug DOM-CM)

## Conteudo para teste

Este e um paragrafo de exemplo para testar marcacoes de codigo qualitativo.
Selecione qualquer trecho e crie uma marcacao usando o command palette.

Outro paragrafo com conteudo diferente para testar multiplas marcacoes
no mesmo arquivo e verificar que handles sao exibidas corretamente.
