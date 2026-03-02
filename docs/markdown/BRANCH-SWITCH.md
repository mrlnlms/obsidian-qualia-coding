# Como alternar entre as versões do CodeMarker v2

## Duas branches, mesmo plugin

| Branch | O que é |
|--------|---------|
| `feat/hover-menu` | v2 atual (overlay handles) |
| `fix/handle-no-reflow` | frozen buildável (widget handles, sem bug de reflow) |

As duas usam a mesma pasta e o mesmo plugin ID ("CodeMarker v2").

## Passo a passo

### 1. Ir pro terminal na pasta do plugin

```bash
cd /Users/mosx/Desktop/code-maker_v2/.obsidian/plugins/obsidian-codemarker-v2
```

### 2. Trocar de branch

Para a **frozen** (widget handles):
```bash
git checkout fix/handle-no-reflow
npm run build
```

Para a **v2 atual** (overlay handles):
```bash
git checkout feat/hover-menu
npm run build
```

### 3. Recarregar no Obsidian

- **Ctrl+R** (ou Cmd+R no Mac) para reload do Obsidian
- Ou: Settings > Community Plugins > desabilitar e habilitar "CodeMarker v2"

## Notas

- Sempre faça `npm run build` depois de trocar de branch
- Os markers/dados (`data.json`) são compartilhados entre as duas versões
- Se tiver mudanças não commitadas, o git vai reclamar — faça `git stash` antes
