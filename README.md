# Management Codes

Plugin experimental para Obsidian — Code management com CSV view e file operations.

## v12 — Management Codes: CSV view + file operations (143 LOC)

Rewrite completo. Plugin renomeado de Editor Playground para Management Codes. Abordagem completamente diferente: em vez de CM5 experiments, foco em file operations com Node.js fs/promises e uma ItemView sidebar para listar itens de CSV.

### Estrutura

```
main.ts                              <- plugin principal — CSV view, InputModal, file ops
```

### Estado atual

- Plugin ID: `management-codes`
- Plugin name: Management Codes
- Arquivo unico (main.ts root, 143 LOC)
- Node.js fs/promises para file I/O (readFile, writeFile, appendFile, access)
- ItemView (CSVView) registrada como sidebar view
- InputModal para adicionar itens via ribbon icon

### Funcionalidades

- **CSV sidebar view** — ItemView que lista itens de items.csv na right leaf
- **Ribbon icon** — file-plus icon abre InputModal para adicionar itens
- **File operations** — readFile, writeFile, appendFile via Node.js fs/promises
- **Auto-open** — CSV view abre automaticamente na sidebar direita ao carregar
- **ensureFileExists** — cria items.csv se nao existir

### Notas

- Dead repo no GitHub
- Sem settings, sem CM5, sem Popper.js — rewrite limpo e minimalista
- Usa path.join para construir caminho do CSV no vault
