# CodeMarker (Qualia Coding)

Qualitative text coding plugin for Obsidian — similar to MAXQDA, Atlas.ti, NVivo.

## Current State (v20)

Multi-arquivo funcionando. CSS melhorado. Marcacoes sincronizam entre varios arquivos abertos. Mouseover funciona em paineis nao ativos. Arquitetura atual considerada ruim pelo autor.

### Features
- Criar marcacoes de texto via comando
- Marcacoes persistem entre sessoes (data.json)
- Suporte multi-arquivo: marcacoes funcionam com multiplos arquivos abertos
- Hover funciona em arquivos nao ativos
- CSS estilizado para marcacoes
- Resetar todas as marcacoes via comando
- Debug de instancias ativas via comando

### Architecture
- CM6 ViewPlugin para renderizacao de marcacoes
- Modelo de dados centralizado (CodeMarkerModel)
- Sincronizacao via workspace events (file-open, layout-change, active-leaf-change)

### Commands
- `Criar uma nova marcacao de codigo` — selecione texto e execute
- `Resetar todas as marcacoes salvas` — limpa todas as marcacoes
- `[DEBUG] Listar instancias ativas do CodeMarker` — mostra instancias no console

## Demo Vault

A pasta `demo/` contem um vault de demonstracao com notas de teste para cada versao.
