# Plano: Adicionar markerType discriminante ao BaseMarker

## Context

Os type guards em `markerResolvers.ts` usam duck typing (`'page' in marker && 'isShape' in marker`) para distinguir tipos de marker. Isso funciona hoje mas e fragil: se dois engines passarem a ter campos com mesmo nome, um guard pode dar match falso. Achado levantado em code review externo.

Solucao: adicionar `markerType` como campo discriminante em `BaseMarker`. Type guards passam a checar `marker.markerType === 'pdf'` etc. Zero ambiguidade.

Analytics NAO e afetado — ja tem `source: SourceType` proprio em `UnifiedMarker`.

---

## Commit 1: adiciona markerType ao BaseMarker e propaga em todos os engines

### 1. Tipo + Interface

**`src/core/types.ts`** — adicionar tipo e campo:

```typescript
export type MarkerType = 'markdown' | 'pdf' | 'csv' | 'image' | 'audio' | 'video';

export interface BaseMarker {
    markerType: MarkerType;  // NOVO
    id: string;
    fileId: string;
    // ... resto igual
}
```

### 2. Type guards

**`src/core/markerResolvers.ts`** — simplificar todos os guards:

```typescript
export function isPdfMarker(marker: BaseMarker): marker is PdfBaseMarker {
    return marker.markerType === 'pdf';
}
export function isImageMarker(marker: BaseMarker): marker is ImageBaseMarker {
    return marker.markerType === 'image';
}
export function isCsvMarker(marker: BaseMarker): marker is CsvBaseMarker {
    return marker.markerType === 'csv';
}
export function isAudioMarker(marker: BaseMarker): marker is AudioBaseMarker {
    return marker.markerType === 'audio';
}
export function isVideoMarker(marker: BaseMarker): marker is VideoBaseMarker {
    return marker.markerType === 'video';
}
```

### 3. Sidebar adapters — adicionar campo nos markerToBase

**`src/image/views/imageSidebarAdapter.ts`** — `markerToBase()` (linha 15):
```typescript
markerType: 'image',
```

**`src/csv/views/csvSidebarAdapter.ts`** — `markerToBase()` (linha 18):
```typescript
markerType: 'csv',
```

**`src/pdf/views/pdfSidebarAdapter.ts`** — `textMarkerToBase()` (linha 21) e `shapeMarkerToBase()` (linha 36):
```typescript
markerType: 'pdf',
```

**`src/media/mediaSidebarAdapter.ts`** — `markerToBase()` method (linha 31):
Adicionar campo generico. O mediaType ja resolve audio/video:
```typescript
markerType: this.mediaType as MarkerType,  // 'audio' ou 'video'
```

### 4. Markdown — caso especial

**`src/markdown/models/codeMarkerModel.ts`** — interface `Marker` (linha 10):
Adicionar `markerType: 'markdown'` na interface.

Todos os locais que criam `Marker` precisam incluir o campo. Buscar por criacao de markers no model:
- `addMarker()` / `addMarkerDirect()` / migration code

### 5. AdapterModel — SidebarModelInterface

**`src/core/baseSidebarAdapter.ts`** — `AdapterModel.getAllMarkers()` e `findMarkerById()`:
Tipo de retorno ja e `BaseMarker` ou compatible — nao precisa mudar.

### 6. Testes

**`tests/core/markerResolvers.test.ts`** — atualizar `makeBase()`:
```typescript
function makeBase(extra: Record<string, any> = {}): BaseMarker {
    return {
        markerType: 'markdown',  // default para testes
        id: 'test-1',
        fileId: 'file.md',
        codes: ['code1'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...extra,
    };
}
```

Todos os test cases que criam markers de tipos especificos precisam incluir `markerType`:
- PDF: `makeBase({ markerType: 'pdf', page: 1, isShape: false, text: 'hello' })`
- Image: `makeBase({ markerType: 'image', shape: 'rect', shapeLabel: 'Region 1' })`
- CSV: `makeBase({ markerType: 'csv', rowIndex: 0, columnId: 'col1' })`
- Audio: `makeBase({ markerType: 'audio', mediaType: 'audio', markerLabel: 'seg' })`
- Video: `makeBase({ markerType: 'video', mediaType: 'video', markerLabel: 'seg' })`

Qualquer outro test file que cria objetos BaseMarker ou Marker tambem precisa do campo.

---

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/core/types.ts` | Adicionar `MarkerType` + campo `markerType` |
| `src/core/markerResolvers.ts` | Simplificar 5 type guards |
| `src/image/views/imageSidebarAdapter.ts` | +1 campo no markerToBase |
| `src/csv/views/csvSidebarAdapter.ts` | +1 campo no markerToBase |
| `src/pdf/views/pdfSidebarAdapter.ts` | +1 campo em textMarkerToBase + shapeMarkerToBase |
| `src/media/mediaSidebarAdapter.ts` | +1 campo no markerToBase |
| `src/markdown/models/codeMarkerModel.ts` | +campo na interface Marker + nos construtores |
| `tests/core/markerResolvers.test.ts` | +markerType em makeBase + todos os test cases |
| Outros test files que criam markers | +markerType onde necessario |

## O que NAO muda

- `src/analytics/` — usa `UnifiedMarker` com `source` proprio
- `src/core/unifiedModelAdapter.ts` — so agrega, nao inspeciona tipo
- `src/core/baseSidebarAdapter.ts` — AdapterModel interface (getAllMarkers retorna tipo generico)
- Nenhum engine model interno (AudioCodingModel, PdfCodingModel etc.) — so os adapters

## Verificacao

1. `npm run build` — tsc strict vai pegar qualquer lugar que cria BaseMarker sem markerType
2. `npm run test` — 1100+ testes passando
3. `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`
4. Teste manual: abrir vault, verificar que explorer/detail view funcionam normalmente
