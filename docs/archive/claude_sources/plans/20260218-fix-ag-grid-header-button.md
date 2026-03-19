# Fix: Posicionar botão custom ANTES do filter icon no AG Grid header

## Context

Estamos injetando um botão custom (tag icon) nos headers do AG Grid via DOM injection + MutationObserver. O botão aparece, mas sempre na posição errada — antes do texto ou depois do filter. Isso acontece porque o `.ag-cell-label-container` usa `flex-direction: row-reverse`, invertendo a relação entre ordem DOM e ordem visual.

## Análise do DOM

Estrutura do header cell:
```
.ag-cell-label-container  (display: flex, flex-direction: row-reverse)
  ├── span.ag-header-cell-filter-button   ← DOM pos 0 → visual: RIGHTMOST
  └── div.ag-header-cell-label            ← DOM pos 1 → visual: LEFTMOST
```

Com `row-reverse`, a lógica visual se inverte:
- DOM primeiro → visual último (direita)
- DOM último → visual primeiro (esquerda)

## Solução

Para obter a ordem visual `[PRODUTO] [🏷] [≡]`, precisamos da ordem DOM `[filter] [btn] [label]`:

```ts
const labelContainer = cell.querySelector(".ag-cell-label-container");
const labelDiv = labelContainer.querySelector(".ag-header-cell-label");

// Insert btn BEFORE labelDiv in DOM → visually AFTER label (between label and filter)
labelContainer.insertBefore(btn, labelDiv);
```

**NÃO setar `order` no CSS** — deixar o `row-reverse` do AG Grid controlar a posição.

## Arquivo a modificar

`src/csvView.ts` — método `injectHeaderButtons()`:
1. Remover o debug log
2. Remover `btn.style.order = "1000"`
3. Mudar inserção: `labelContainer.insertBefore(btn, labelDiv)` em vez de `labelContainer.appendChild(btn)`

## Verificação

1. `npm run build` sem erros
2. Botão aparece entre o texto e o filter icon: `PRODUTO [🏷] [≡]`
3. Botão persiste após scroll horizontal
4. Botão reaparece após toggle de coluna show/hide
