# CodeMarker

Qualitative text coding tool for Obsidian (similar to MAXQDA, Atlas.ti, NVivo).

## Current state (v17 — TAG v0.1.0)

First stable tagged release. Handles de redimensionamento sao exibidas nas marcacoes,
mas a interacao (drag) nao funciona devido a um bug na traducao de coordenadas DOM para CodeMirror.

### Features
- Criar marcacoes de codigo qualitativo sobre texto selecionado
- Decoracoes CM6 com highlights coloridos
- Handles de redimensionamento visiveis (sem interacao funcional)
- Comando para resetar todas as marcacoes
- Settings tab
- Eventos de workspace escondem handles ao mudar de leaf/layout

### Known issues
- Bug DOM-to-CM6: handles nao respondem a drag
- Marcacoes sao limpas ao descarregar o plugin

## Build

```bash
npm install
npm run build
```
