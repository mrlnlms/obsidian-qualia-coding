# Tag chips nas células coding — teste de layout

## Context
Os modals de tag já abrem, mas queremos testar o visual real: clicar no botão tag deve adicionar tag chips coloridas dentro da célula (estilo pill/badge com cor de fundo, texto e botão X para remover). Isso é para validar o layout antes de conectar ao sistema de codificação real.

## Arquivos a modificar
- `.obsidian/plugins/obsidian-csv-viewer/src/csvView.ts`
- `.obsidian/plugins/obsidian-csv-viewer/styles.css`

## Plano

### 1. Pool de tags estáticas para teste

Definir 5 tags com cores diferentes (inspiradas na imagem de referência):
```ts
const TEST_TAGS = [
  { name: "Red tag", bg: "#fdddd5", color: "#9a3412" },
  { name: "Yellow tag", bg: "#fef3c7", color: "#92400e" },
  { name: "Green tag", bg: "#d1fae5", color: "#065f46" },
  { name: "Blue tag", bg: "#dbeafe", color: "#1e40af" },
  { name: "Purple tag", bg: "#e9d5ff", color: "#6b21a8" },
];
```

### 2. State: Map de tags por célula

Um `Map<string, Set<string>>` onde a key é `"rowIndex:field"` e o value é o set de tag names aplicados. Isso vive como variável de módulo (não persiste — é só para teste).

### 3. Alterar o `codCellRenderer`

O renderer atual mostra texto + botão tag. Agora precisa:
- Ler as tags do state para esta célula
- Renderizar chips coloridos (pill com texto + X) entre o texto e o botão tag
- Área de tags usa `flex-wrap: wrap` para quebrar linha se muitas tags
- O botão tag fica sempre no final (flex-shrink: 0)

Layout da célula:
```
[texto truncado] [tag1 ×] [tag2 ×] [tag3 ×] ... [botão tag]
```

### 4. Click no botão tag → adiciona próxima tag do pool

Em vez de abrir modal, o click no botão tag agora:
1. Pega as tags atuais da célula do state
2. Encontra a próxima tag do pool que ainda não foi aplicada
3. Adiciona ao state
4. Faz `params.api.refreshCells()` para re-renderizar a célula

Se todas as 5 já foram aplicadas, não faz nada (ou cicla).

### 5. Click no X do chip → remove a tag

1. Remove do state
2. `refreshCells()` para re-renderizar

### 6. CSS para os chips (styles.css)

```css
.csv-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  line-height: 1.4;
}

.csv-tag-chip-x {
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  opacity: 0.6;
  line-height: 1;
}

.csv-tag-chip-x:hover {
  opacity: 1;
}
```

### 7. Ajustar row height do AG Grid

Tags podem fazer a célula precisar de mais altura. Setar `rowHeight: 'auto'` ou um valor fixo maior (ex: 38) no grid options para acomodar chips + wrap.

Também ajustar `.csv-cod-seg-cell` para permitir wrap:
- Remover `white-space: nowrap` do `.csv-cod-seg-text` (manter no texto, mas a área de tags pode quebrar)
- Adicionar uma área de tags com `flex-wrap: wrap`

### 8. Header button (cod-frow) — mesmo comportamento

O header button aplica tags a todas as células daquela coluna de uma vez (loop pelas rows).

## Verificação
1. `npm run build`
2. Abrir CSV, ativar cod-seg e cod-frow
3. Clicar tag button numa célula → chip colorido aparece
4. Clicar várias vezes → até 5 chips diferentes
5. Clicar X no chip → remove
6. Clicar tag no header cod-frow → todas as células da coluna ganham a tag
7. Layout se ajusta bem com múltiplas tags
