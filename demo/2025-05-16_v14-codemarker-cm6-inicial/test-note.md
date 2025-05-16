---
version: 14
date: 2025-05-16
plugin: CodeMarker
manifest-id: obsidian-codemarker
---

# v14 — CodeMarker CM6 inicial

## O que mudou
- Rewrite total para CM6 (CodeMirror 6)
- Novo manifest ID: `obsidian-codemarker` (era `management-codes`)
- Highlight de texto via StateField + ViewPlugin
- Handles SVG para resize (exibindo mas com erro ao interagir)
- Modelo de dados para marcações (CodeMarkerModel)
- Settings tab dedicada

## Como verificar
1. Console: `[CodeMarker] v14 loaded`
2. Comando: "Criar uma nova marcação de código" — selecionar texto e executar
3. Handles SVG devem aparecer nas marcações (interação com erro esperado)

## Texto para teste

Este é um parágrafo de exemplo para testar marcações de código qualitativo. Selecione qualquer trecho e use o comando do CodeMarker para criar uma marcação.

Segundo parágrafo com mais conteúdo para permitir múltiplas marcações simultâneas e testar o comportamento dos handles de resize.
