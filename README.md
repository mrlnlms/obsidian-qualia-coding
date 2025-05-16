# CodeMarker (v14)

Qualitative text coding tool for Obsidian, similar to MAXQDA, Atlas.ti, NVivo.

## Current state

CM6 rewrite total. Highlights de texto via CodeMirror 6 StateField + ViewPlugin.
Handles SVG para resize exibindo, mas com erro ao interagir com eles.

- Comando para criar marcação de código a partir de seleção de texto
- Modelo de dados para marcações (CodeMarkerModel)
- Settings tab dedicada
- Handles SVG visíveis nas marcações (interação com bug)

## Structure

```
main.ts              — plugin entry point
src/models/          — data model + settings
src/views/           — resize handles + settings tab
styles.css           — marker styles
demo/                — demo vault with dated test folders
```

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build
```
