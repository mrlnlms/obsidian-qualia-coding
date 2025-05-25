---
version: 21
date: 2025-05-25
title: "Versao atual"
era: 2
source: github (e7cd09e)
---

# v21 -- Versao atual

## O que mudou

- Refatoracao massiva do markerStateField (489 linhas alteradas) e markerViewPlugin (670 linhas alteradas)
- Melhorias no handleWidget
- Ajustes no CSS (styles.css)
- Arquitetura separada: StateField para decoracoes/estado + ViewPlugin para eventos/identificacao
- Multi-arquivo: sincronizacao entre instancias via workspace events

## Como verificar

1. Abrir console: deve exibir `[CodeMarker] v21 loaded -- Versao atual`
2. Selecionar texto e usar comando "Criar uma nova marcacao de codigo"
3. Testar com multiplos arquivos abertos side-by-side
4. Verificar que marcacoes persistem ao trocar entre arquivos

## Notas

Continuacao da refatoracao pos-v20 que tinha arquitetura ruim. Esta versao reestrutura o StateField e ViewPlugin com separacao clara de responsabilidades.
