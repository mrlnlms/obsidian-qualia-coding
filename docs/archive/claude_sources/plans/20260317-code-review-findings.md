# Plano: Resolver achados do code review (6 findings)

## Context

Code review externo identificou 6 achados. Destes, 3 sao acionaveis agora:
- **#1 Bug real**: media `migrateFilePath` nao atualiza `marker.fileId` (unico engine com esse bug)
- **#2 Gap de testes**: fileInterceptor tem logica critica sem cobertura
- **#4 Duplicacao**: sidebar adapters repetem `deleteCode` e `updateMarkerFields`

Os achados #3 (EngineRegistration), #5 (PDF listener separado) e #6 (PDF/Image infra comum) sao observacoes arquiteturais corretas mas nao acionaveis agora.

---

## Commit 1: fix media migrateFilePath

**Arquivo:** `src/media/mediaCodingModel.ts:251-257`

Adicionar loop para atualizar `marker.fileId` em todos os markers do file renomeado, seguindo o padrao dos outros engines (image:189, csv:172, pdf:89, markdown:294).

```typescript
migrateFilePath(oldPath: string, newPath: string): void {
    const file = this.files.find((f) => f.path === oldPath);
    if (file) {
        file.path = newPath;
        for (const m of file.markers) {
            m.fileId = newPath;
        }
        this.notify();
    }
}
```

**Teste:** `tests/media/mediaCodingModel.test.ts:264-277`

Fortalecer o teste existente com asserção explicita de `marker.fileId` + novo teste para multiplos markers:

```typescript
// No teste existente, adicionar:
const marker = model.getMarkersForFile('new.mp3')[0];
expect(marker.fileId).toBe('new.mp3');

// Novo teste:
it('updates fileId on all markers in the file', () => {
    model.findOrCreateMarker('old.mp3', 0, 5);
    model.findOrCreateMarker('old.mp3', 10, 15);
    model.migrateFilePath('old.mp3', 'renamed.mp3');
    vi.advanceTimersByTime(600);
    const markers = model.getMarkersForFile('renamed.mp3');
    expect(markers).toHaveLength(2);
    for (const m of markers) {
        expect(m.fileId).toBe('renamed.mp3');
    }
});
```

---

## Commit 2: testes do fileInterceptor

**Abordagem:** Extrair 3 funcoes puras de `setupFileInterceptor` para testar a logica sem mock completo do Obsidian. Manter no mesmo arquivo, refatorar `setupFileInterceptor` para usar os helpers.

**Arquivo:** `src/core/fileInterceptor.ts`

### Funcoes a extrair:

1. **`resolveLeafFilePath(viewState, view)`** — extrai file path de `vs.state.file` ou `FileView.file.path` (linhas 71-78)

2. **`matchesInterceptRule(rule, currentViewType, fileExt)`** — avalia guards em ordem: dedup viewType, sourceViewType, shouldIntercept, extension match (linhas 62-83)

3. **`dispatchRenameRules(rules, ext, oldPath, newPath)`** — filtra rename rules por extension e chama handlers (linhas 48-50)

### Testes: `tests/core/fileInterceptor.test.ts`

~15-18 novos testes organizados em 3 describe blocks:

**resolveLeafFilePath** (~4 testes):
- Retorna `vs.state.file` quando presente e string
- Fallback para `view.file.path` quando state.file ausente
- Retorna undefined quando ambos ausentes
- Ignora `state.file` nao-string

**matchesInterceptRule** (~6 testes):
- Skip se viewType === targetViewType (dedup)
- Skip se sourceViewType nao bate
- Skip se shouldIntercept retorna false
- Skip se extension nao esta no Set
- Match quando todas as condicoes passam
- Guards avaliados em ordem (shouldIntercept nao chamado se sourceViewType falha)

**dispatchRenameRules** (~4 testes):
- Chama handler para rule com extension correspondente
- Nao chama handler para extension diferente
- Multiplas rules, so as com match sao chamadas
- Case-insensitive ja garantido pelo chamador (ext vem lowercase)

Manter os 7 testes existentes (registration smoke tests).

---

## Commit 3: pull deleteCode para BaseSidebarAdapter

**Arquivos:**
- `src/core/baseSidebarAdapter.ts` — expandir `AdapterModel`, implementar `deleteCode`
- `src/image/views/imageSidebarAdapter.ts` — remover deleteCode (linhas 75-84)
- `src/csv/views/csvSidebarAdapter.ts` — remover deleteCode (linhas 81-89)
- `src/media/mediaSidebarAdapter.ts` — remover deleteCode (linhas 87-96)
- `src/pdf/views/pdfSidebarAdapter.ts` — manter override (tem shapes)

### Mudancas em AdapterModel:

```typescript
export interface AdapterModel {
    // ... existente ...
    // Novo para deleteCode:
    getAllMarkers(): Array<{ id: string; codes: string[] }>;
    removeCodeFromMarker(markerId: string, codeName: string, keepIfEmpty?: boolean): void;
}
```

### deleteCode no BaseSidebarAdapter:

Mover de abstract para concreto. Implementacao identica as 3 copias atuais (Image:75, CSV:81, Media:87):

```typescript
deleteCode(codeName: string): void {
    for (const m of this.model.getAllMarkers()) {
        if (m.codes.includes(codeName)) {
            this.model.removeCodeFromMarker(m.id, codeName, true);
        }
    }
    const def = this.registry.getByName(codeName);
    if (def) this.registry.delete(def.id);
    this.saveMarkers();
}
```

PDF override continua como esta (itera markers E shapes, chama `removeCodeFromShape`).

---

## Commit 4: pull updateMarkerFields para BaseSidebarAdapter

**Arquivos:**
- `src/core/baseSidebarAdapter.ts` — expandir AdapterModel, implementar updateMarkerFields + hook
- `src/image/views/imageSidebarAdapter.ts` — remover updateMarkerFields (linhas 58-65)
- `src/media/mediaSidebarAdapter.ts` — remover updateMarkerFields (linhas 70-77)
- `src/csv/views/csvSidebarAdapter.ts` — remover updateMarkerFields, adicionar `notifyAfterFieldUpdate` override
- `src/pdf/views/pdfSidebarAdapter.ts` — manter override (dual text/shape lookup)

### Mudancas em AdapterModel:

```typescript
export interface AdapterModel {
    // ... existente + commit 3 ...
    // Novo para updateMarkerFields:
    findMarkerById(id: string): { memo?: string; colorOverride?: string; updatedAt: number } | undefined | null;
    notify(): void;
}
```

### BaseSidebarAdapter:

```typescript
/** Override para usar notifyAndSave() etc. Default: model.notify() */
protected notifyAfterFieldUpdate(): void {
    this.model.notify();
}

updateMarkerFields(markerId: string, fields: { memo?: string; colorOverride?: string }): void {
    const m = this.model.findMarkerById(markerId);
    if (!m) return;
    if ('memo' in fields) m.memo = fields.memo;
    if ('colorOverride' in fields) m.colorOverride = fields.colorOverride;
    m.updatedAt = Date.now();
    this.notifyAfterFieldUpdate();
}
```

- Image e Media: deletam updateMarkerFields (usam notify(), que e o default)
- CSV: override de `notifyAfterFieldUpdate()` para chamar `this.model.notifyAndSave()`
- PDF: manter override completo (busca em text markers E shapes)

---

## Verificacao

Apos cada commit:
1. `npm run build` — tsc strict + esbuild passam
2. `npm run test` — todos os testes passam (1082+)
3. `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`

Teste manual apos commit 1: renomear audio/video no Obsidian, verificar que explorer mostra path novo.

---

## Arquivos criticos

| Arquivo | Commits |
|---------|---------|
| `src/media/mediaCodingModel.ts` | 1 |
| `tests/media/mediaCodingModel.test.ts` | 1 |
| `src/core/fileInterceptor.ts` | 2 |
| `tests/core/fileInterceptor.test.ts` | 2 |
| `src/core/baseSidebarAdapter.ts` | 3, 4 |
| `src/image/views/imageSidebarAdapter.ts` | 3, 4 |
| `src/csv/views/csvSidebarAdapter.ts` | 3, 4 |
| `src/media/mediaSidebarAdapter.ts` | 3, 4 |
| `src/pdf/views/pdfSidebarAdapter.ts` | 3 (verificar override) |
