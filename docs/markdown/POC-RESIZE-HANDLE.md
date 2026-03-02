# POC: Resize Handle no Margin Panel

**Data:** 2026-02-27
**Status:** Experimento — não integrado
**Stash:** `git stash list` → "POC: resize handle no margin panel"
**Recuperar:** `git stash apply stash@{0}`

## Ideia

Borda direita do margin panel vira um drag handle horizontal. Usuário arrasta pra ajustar largura do panel manualmente. Double-click reseta pra auto.

## O que foi feito

3 arquivos modificados:

### `src/models/settings.ts`
- `marginPanelWidth: number | null` (null = auto, número = fixo)

### `styles.css`
- `.codemarker-margin-resize-handle` — div 6px, `cursor: col-resize`, opacity 0 → 0.5 no hover

### `src/cm6/marginPanelExtension.ts`
- Handle div no `scrollDOM` (não no panel — pra cobrir scroll height inteiro)
- `mousedown` → `document.mousemove/mouseup` pra drag
- Clamp entre 80-400px
- `dblclick` → reset pra null
- `renderBrackets()` usa `marginPanelWidth` quando setado (em vez de auto-calc)
- Handle position atualizado a cada render: `left = panelRight - 3px`

## Problemas encontrados

1. **innerHTML clear**: `renderBrackets()` faz `innerHTML = ''` — destroi o handle se for child do panel. Fix: movido pra scrollDOM.
2. **Altura**: handle com `position: absolute; top:0; bottom:0` no panel não cobria scroll height. Fix: movido pra scrollDOM.
3. **Z-index**: handle ficava atrás de bars/labels. Fix: z-index 10.
4. **Experiência geral**: drag funciona mas UX precisa de mais polish — visual sutil demais, interação não fluida.

## Próximos passos (se retomar)

- Considerar visual mais explícito (grip dots, cor mais visível)
- Testar abordagem de CSS resize nativo (`resize: horizontal` no panel?)
- Ou: setting numérico na settings tab em vez de drag interativo
- Resolver o bug original de overlap (RLL + line numbers) de forma independente
