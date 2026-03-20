# Explorer/Detail Cache — Design Spec

> Cache no UnifiedModelAdapter + debounce nas views + eliminacao de chamadas redundantes no Detail. Preparacao pra escala — evitar trabalho desnecessario quando nada mudou.

## Contexto

O `UnifiedModelAdapter` agrega markers de 6 engines via `flatMap` sem cache. As views (Explorer e Detail) re-renderizam em cascata quando qualquer engine muda, incluindo engines que nao tem relacao com a view aberta.

**Problemas atuais:**
1. `getAllMarkers()` chamado em multiplos contextos no Detail (render path + event handlers como color picker) sem cache
2. `getAllMarkers()` recalcula mesmo quando nada mudou (sem cache)
3. `getMarkersForFile(fileId)` filtra array completo por arquivo — O(n×m) no Explorer com muitos arquivos
4. Sem debounce — 5 mudancas rapidas = 5 rebuilds DOM completos

**Objetivo:** preparacao pra escala, mesma filosofia do ConsolidationCache — nao reprocessar quando desnecessario.

## Decisoes de design

| Decisao | Escolha | Alternativa descartada | Razao |
|---------|---------|----------------------|-------|
| Granularidade do cache | Dirty flag global (boolean) | Per-engine dirty tracking | flatMap do adapter e sub-millisecond mesmo com 5.000 markers — gargalo e DOM, nao dados. Complexidade de merge por engine nao se justifica aqui |
| Debounce | Nas views (Explorer e Detail) | No adapter | Adapter deve ser canal limpo de notificacao. Cada view sabe quando reagir. Evita debounce-em-cima-de-debounce (Detail list mode ja tem 150ms) |
| Index por fileId | Lazy `Map<fileId, BaseMarker[]>` | Filtrar array a cada chamada | `getMarkersForFile()` e chamado 1x por arquivo no Explorer. Com 100 arquivos × 5.000 markers = 500k comparacoes (O(n×m)). Map indexado reduz pra O(1) por lookup |
| Chamadas redundantes | Corrigir no Detail (1 chamada, guardar em variavel) | Deixar como esta | Custo zero de manutencao, ganho imediato |

## Arquitetura

### Mudancas no `UnifiedModelAdapter`

**Arquivo:** `src/core/unifiedModelAdapter.ts` (~25 LOC adicionais)

**Estado interno novo:**

```typescript
private dirty = true;                              // comeca dirty (primeira chamada computa)
private cachedMarkers: BaseMarker[] = [];           // array cacheado do flatMap
private cachedFileIndex: Map<string, BaseMarker[]> = new Map();  // index por fileId
private cachedIdIndex: Map<string, BaseMarker> = new Map();      // index por id (O(1) lookup para hover/write)
private wrappedListeners = new Map<() => void, () => void>();    // fn → wrapped (para offChange funcionar)
```

**`getAllMarkers()` — com cache:**

```typescript
getAllMarkers(): BaseMarker[] {
  if (this.dirty) this.rebuild();
  return this.cachedMarkers;
}
```

**`getMarkersForFile(fileId)` — via index:**

```typescript
getMarkersForFile(fileId: string): BaseMarker[] {
  if (this.dirty) this.rebuild();
  return this.cachedFileIndex.get(fileId) ?? [];
}
```

**`getAllFileIds()` — derivado do index:**

```typescript
getAllFileIds(): string[] {
  if (this.dirty) this.rebuild();
  return Array.from(this.cachedFileIndex.keys());
}
```

**`getMarkerById(id)` — via index:**

```typescript
getMarkerById(id: string): BaseMarker | undefined {
  if (this.dirty) this.rebuild();
  return this.cachedIdIndex.get(id);
}
```

**`rebuild()` — reconstroi cache + indices:**

```typescript
private rebuild(): void {
  this.cachedMarkers = this.models.flatMap(m => m.getAllMarkers());
  this.cachedFileIndex = new Map();
  this.cachedIdIndex = new Map();
  for (const marker of this.cachedMarkers) {
    // file index
    const list = this.cachedFileIndex.get(marker.fileId);
    if (list) list.push(marker);
    else this.cachedFileIndex.set(marker.fileId, [marker]);
    // id index
    this.cachedIdIndex.set(marker.id, marker);
  }
  this.dirty = false;
}
```

> **Nota:** `getAllFileIds()` deriva do `cachedFileIndex.keys()`. Isso so retorna fileIds que tem markers. Se algum engine model retornar fileIds para arquivos sem markers via `getAllFileIds()`, esses serao omitidos. Na pratica, todos os engines derivam fileIds dos markers, entao o comportamento e equivalente. Documentar como premissa.

**Invalidacao — no `onChange`/`offChange`:**

O adapter registra callbacks nos models. O wrapper adiciona invalidacao do dirty flag. Para que `offChange` funcione, o mapping `fn → wrapped` e armazenado (mesma pattern do `BaseSidebarAdapter`):

```typescript
onChange(fn: () => void): void {
  const wrapped = () => {
    this.dirty = true;
    fn();
  };
  this.wrappedListeners.set(fn, wrapped);
  for (const m of this.models) m.onChange(wrapped);
}

offChange(fn: () => void): void {
  const wrapped = this.wrappedListeners.get(fn);
  if (!wrapped) return;
  this.wrappedListeners.delete(fn);
  for (const m of this.models) m.offChange(wrapped);
}
```

Quando qualquer model muda: `dirty = true` → proximo `getAllMarkers()` reconstroi. Se ninguem pedir dados (view fechada), nada acontece. O `offChange` remove o wrapper correto dos sub-models, preservando a identidade da funcao (critico para `suspendRefresh`/`resumeRefresh` no Detail).

### Debounce nas views

**`BaseCodeExplorerView`** (~2 LOC):

Substituir o listener direto por `requestAnimationFrame`:

```typescript
// Antes:
private boundRenderTree = () => this.renderTree();

// Depois:
private rafId: number | null = null;
private boundRenderTree = () => {
  if (this.rafId !== null) return;
  this.rafId = requestAnimationFrame(() => {
    this.rafId = null;
    this.renderTree();
  });
};
```

Cancelar no `onClose()`:
```typescript
if (this.rafId !== null) cancelAnimationFrame(this.rafId);
```

**`BaseCodeDetailView`** — mesma pattern no `boundRefresh`.

### Chamadas multiplas no Detail

**Arquivo:** `src/core/detailCodeRenderer.ts`

`getAllMarkers()` e chamado no render path (linha 85) e tambem em event handlers (linha 65, color picker `input`). Com o cache no adapter, todas essas chamadas sao cache hits (~0ms), entao o problema se resolve naturalmente. Nenhuma mudanca necessaria no Detail alem do debounce.

### Debounce e `boundRegistryRefresh`

As views tem dois listeners que disparam `renderTree()`/`refreshCurrentMode()`:
1. `boundRenderTree` / `boundRefresh` — via `model.onChange()` (mudancas em markers)
2. `boundRegistryRefresh` — via `document.addEventListener('qualia:registry-changed')` (mudancas em code definitions)

Ambos devem passar pelo mesmo rAF debounce. A forma mais simples: unificar num unico metodo debounced:

```typescript
private scheduleRefresh = () => {
  if (this.rafId !== null) return;
  this.rafId = requestAnimationFrame(() => {
    this.rafId = null;
    this.renderTree();  // ou refreshCurrentMode() no Detail
  });
};
```

Registrar `scheduleRefresh` tanto no `model.onChange()` quanto no `registry-changed` event.

Cancelar no `onClose()` de **ambas** as views:
```typescript
if (this.rafId !== null) cancelAnimationFrame(this.rafId);
```

## O que NAO muda

- `SidebarModelInterface` (contrato dos engine models)
- Como os engine models notificam mudancas
- `ConsolidationCache` (analytics — pipeline separado)
- Como as views renderizam DOM (full rebuild continua, so debounced)
- `DataManager`, engine models, registry

## Testes

Adicionar ao arquivo existente `tests/core/unifiedModelAdapter.test.ts` (cache e detalhe interno da mesma classe).

### Casos de teste

1. `getAllMarkers()` retorna dados corretos na primeira chamada
2. Segunda chamada sem mudanca retorna mesmo array (referencia `===`)
3. Apos model change, `getAllMarkers()` retorna array novo
4. `getMarkersForFile()` retorna markers corretos
5. `getMarkersForFile()` usa cache (referencia `===` sem mudanca)
6. `getAllFileIds()` retorna lista correta derivada do index
7. Multiplas mudancas antes de query = 1 rebuild
8. Model change em 1 engine invalida tudo (dirty global)
9. `getMarkersForFile()` para fileId inexistente retorna `[]`
10. Cache funciona com 0 markers (array vazio)
11. `getMarkerById()` retorna marker correto via index
12. `getMarkerById()` retorna `undefined` para id inexistente
13. `offChange()` remove listener corretamente (wrapper identity preservada)

### Testes de debounce (nas views)

Cobertos por e2e ou manual — debounce com `requestAnimationFrame` e dificil de testar em jsdom (nao tem rAF real). Verificar que `cancelAnimationFrame` e chamado no `onClose()`.

## Riscos

| Risco | Mitigacao |
|-------|-----------|
| Cache stale (adapter retorna dados velhos) | Dirty flag setado no wrapper do `onChange` — mesma chamada que notifica as views |
| `requestAnimationFrame` nao disponivel em testes | jsdom tem polyfill basico. Se falhar, usar `setTimeout(fn, 0)` como fallback |
| Ordem de operacoes: dirty flag vs view callback | Wrapper seta `dirty = true` ANTES de chamar `fn()` — view sempre ve cache limpo no proximo `getAllMarkers()` |
| Novos metodos adicionados ao adapter sem cache | Pattern e simples — qualquer metodo que leia markers chama `if (this.dirty) this.rebuild()` |
| Arrays retornados sao mutaveis | Contrato: consumidores NAO devem mutar arrays retornados pelo cache. Codigo existente nao faz isso. Documentar na JSDoc dos metodos |
| `getAllFileIds()` omite arquivos sem markers | Premissa: todos os engines derivam fileIds dos markers. Comportamento equivalente ao atual na pratica |
