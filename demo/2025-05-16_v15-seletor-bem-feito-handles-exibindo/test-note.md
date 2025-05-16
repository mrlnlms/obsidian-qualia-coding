---
version: 15
date: 2025-05-16
title: "Seletor bem feito, handles exibindo (sem drag)"
era: 2
source: github (4583fdb)
---

# v15 — Seletor bem feito, handles exibindo (sem drag)

## O que mudou
- Seletor de texto para marcacao agora funciona corretamente
- Handles (alcas) de redimensionamento exibem nas posicoes corretas ao hover
- Handles ainda nao suportam drag funcional
- Vertical handles implementados para marcacoes multilinhas
- Settings tab com color picker, opacity slider e dropdown de cores predefinidas
- CSS melhorado para handles com hover effects e sombras

## Como verificar
1. Abra o console: deve exibir `[CodeMarker] v15 loaded`
2. Selecione texto e use o comando "Criar uma nova marcacao de codigo"
3. Passe o mouse sobre a marcacao — as alcas devem aparecer nos extremos
4. Note que arrastar as alcas ainda nao funciona nesta versao

## Teste de marcacao

Este e um paragrafo de exemplo para testar a funcionalidade de marcacao do CodeMarker v15.
Selecione qualquer trecho deste texto e aplique uma marcacao via comando.

Outro paragrafo para testar marcacoes multilinhas que cruzam
mais de uma linha do editor.
