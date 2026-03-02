# CodeMarker Audio — Project Briefing for Claude.ai

> Cole este documento inteiro como mensagem inicial no Claude.ai para dar contexto completo do projeto.

---

## O que é

Plugin Obsidian para **codificação qualitativa de áudio** (QDA). O pesquisador abre um arquivo de áudio (.mp3, .wav, etc), vê o waveform, seleciona trechos arrastando no waveform, e atribui "códigos" (tags qualitativas) a esses trechos. É o equivalente audio do que o MAXQDA/Atlas.ti fazem para texto.

Faz parte de uma família de 5 plugins que compartilham um registry de códigos:
- **codemarker-v2** — markdown (CM6 engine)
- **codemarker-csv** — CSV (AG Grid)
- **codemarker-pdf** — PDF (PDF.js nativo do Obsidian)
- **codemarker-image** — imagens (Fabric.js canvas)
- **codemarker-audio** — áudio (WaveSurfer.js) ← **este**
- **codemarker-analytics** — dashboard cross-plugin (Chart.js)

## Stack

- **Obsidian Plugin API** (TypeScript)
- **WaveSurfer.js v7** — waveform rendering, zoom, scroll
  - **RegionsPlugin** — colored overlays, drag-to-create, drag-to-resize
  - **TimelinePlugin** — ruler com marcas de tempo
  - **MinimapPlugin** — overview do waveform completo
- **esbuild** — bundle
- **tsc** — type check (noEmit)
- Build: `npm run build`

## Estrutura de arquivos (13 TS + 1 CSS)

```
src/
├── main.ts                          (588 loc) — Plugin + AudioView (ItemView)
├── audio/
│   ├── waveformRenderer.ts          (232 loc) — WaveSurfer lifecycle wrapper
│   └── regionRenderer.ts            (228 loc) — Regions, labels, lanes, minimap markers, hover
├── coding/
│   ├── audioCodingModel.ts          (288 loc) — Data model, CRUD, persistence, hover state
│   ├── audioCodingTypes.ts           (34 loc) — Types: AudioMarker, AudioFile, AudioSettings
│   ├── codeDefinitionRegistry.ts    (137 loc) — Code definitions CRUD + palette
│   └── sharedRegistry.ts             (40 loc) — Cross-plugin sync via registry.json
├── menu/
│   ├── audioCodingMenu.ts           (285 loc) — Popover com toggles + ações
│   └── audioCodeFormModal.ts         (71 loc) — Modal criar/editar código
├── views/
│   ├── audioCodeExplorerView.ts     (312 loc) — Tree 3 níveis: Code → File → Segment
│   ├── audioCodeDetailView.ts       (369 loc) — Sidebar 3 modos: lista, code-focused, marker-focused
│   └── audioSettingTab.ts            (61 loc) — Settings tab
└── utils/
    └── formatTime.ts                  (9 loc) — Formatter M:SS.s
styles.css                           (562 loc) — UI styling (namespace codemarker-audio-*)
```

**Total: ~3,500 LOC**

## Data Model

```typescript
interface AudioMarker {
  id: string;           // gerado (timestamp+random base36)
  from: number;         // início em segundos (float, ex: 12.340)
  to: number;           // fim em segundos (float)
  codes: string[];      // nomes dos códigos aplicados
  memo?: string;        // nota opcional
  createdAt: number;    // timestamp ms
}

interface AudioFile {
  path: string;         // caminho no vault, ex: "interviews/p01.mp3"
  markers: AudioMarker[];
}

interface AudioSettings {
  defaultZoom: number;          // px/sec, default 50
  regionOpacity: number;        // 0–1, default 0.15
  showLabelsOnRegions: boolean; // default true
  fileStates: Record<string, { zoom: number; lastPosition: number }>;
}

interface CodeDefinition {
  id: string;
  name: string;
  color: string;       // hex
  description?: string;
  createdAt: number;
  updatedAt: number;
}

// Persistido em data.json (raiz do plugin)
interface AudioPluginData {
  files: AudioFile[];
  codeDefinitions: { definitions: Record<string, CodeDefinition>; nextPaletteIndex: number };
  settings: AudioSettings;
}
```

## Arquitetura — Fluxo Principal

### 1. Abertura de arquivo
- Usuário clica em .mp3/.wav/etc no file explorer do Obsidian
- Obsidian abre no player nativo
- Plugin intercepta via `active-leaf-change` event e substitui o view state pelo `AudioView`
- **NÃO usa `registerExtensions`** — conflita com handler built-in do Obsidian

### 2. AudioView (ItemView)
Layout top-to-bottom:
1. **Minimap** — MinimapPlugin overview + overlay com barras coloridas dos markers
2. **Waveform** — WaveSurfer principal, zoomável, auto-scroll durante playback
3. **Timeline ruler** — TimelinePlugin em container externo (fora do shadow DOM do WaveSurfer)
4. **Transport bar** — play/pause, tempo atual/total, volume, velocidade, zoom slider

### 3. Criação de marker
- Usuário arrasta no waveform → RegionsPlugin cria region temporária
- Evento `region-created` → abre popover de codificação
- Popover: text input pra buscar/criar código + toggle list dos códigos existentes
- Se adiciona pelo menos 1 código → persiste AudioMarker no model
- Se dismiss sem código → remove a region (phantom marker prevention)

### 4. Edição de marker existente
- Click na region → abre popover pré-populado
- Toggle de códigos on/off
- Memo editável
- "Remove All Codes" → deferred deletion
- Resize arrastando bordas da region → `region-update-end` → `updateMarkerBounds()`
- Double-click → play só aquele trecho

### 5. Hover bidirecional
- Hover em region no waveform → `model.setHoverState()` → sidebar destaca item
- Hover em item na sidebar → `model.setHoverState()` → region ganha box-shadow accent
- Label chips nas regions também emitem hover

### 6. Sidebar views
**Code Explorer** (tree 3 níveis):
- Nível 1: código (swatch + nome + contagem)
- Nível 2: arquivo (nome + contagem)
- Nível 3: segmento (time range, clicável → seek)
- Toolbar: expand/collapse all, expand/collapse files, search, refresh

**Code Detail** (3 modos):
- **Lista** — todos os códigos com swatch, desc, contagem, filtro de busca
- **Code-focused** — todos os markers de um código cross-file
- **Marker-focused** — detalhe de um marker: time range, memo editável, outros códigos, outros markers

### 7. Overlapping regions — Vertical Lanes
Algoritmo greedy de atribuição de lanes:
- Ordena markers por start time, depois por duração (maior primeiro)
- Cada lane tracked pelo seu "end time"
- Atribui a primeira lane disponível onde `laneEnd <= marker.from`
- Aplica CSS `top` e `height` como porcentagem: `height = 100% / totalLanes`

### 8. Minimap markers
Barras coloridas no overlay do minimap mostrando posição dos markers:
- Posição: `left = (from / duration) * 100%`
- Largura: `width = ((to - from) / duration) * 100%` (mínimo 0.3%)
- Cor: primeira cor do código

### 9. Persistência
- `data.json` na pasta do plugin
- Save debounced (500ms) via `scheduleSave()`
- Zoom/scroll per-file em `settings.fileStates`
- Shared registry sync: `.obsidian/codemarker-shared/registry.json`

### 10. Integração Analytics
- Analytics lê `data.json` direto
- Navegação: `workspace.trigger('codemarker-audio:seek', { file, seekTo })`
- Audio plugin escuta e faz `openAudioAndSeek()`

## Padrões técnicos importantes

1. **WaveSurfer shadow DOM** — Timeline e Minimap precisam de container externo explícito, senão ficam invisíveis dentro do shadow DOM
2. **ResizeObserver + try-catch** — zoom reflow debounced 100ms, mas audio pode não estar carregado ainda → try-catch obrigatório
3. **Memo textarea pausa listener** — `offChange()` no focus, `onChange()` no blur, pra não rererender enquanto digita
4. **revealLeaf só na criação** — nunca chamar pra leaf existente (causa focus steal + render loop)
5. **Color alpha dinâmico** — `regionOpacity` da settings aplicado como canal alpha hex na cor da region
6. **`notifyChange()` vs `notify()`** — `notify()` agenda save + dispara listeners; `notifyChange()` só dispara listeners (usado quando save é feito separado, ex: settings tab)

## Settings

3 configurações na Settings tab:
- **Default Zoom** — slider 10–200, step 5 (px/sec)
- **Region Opacity** — slider 0–1, step 0.05
- **Show Labels on Regions** — toggle

Mudanças têm efeito imediato via `notifyChange()` → AudioView re-renderiza regions.

## Extensões suportadas

`.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`, `.aac`

## Regras de desenvolvimento

- Build deve passar (`npm run build`) antes de qualquer PR
- Namespace CSS: `codemarker-audio-*` (sem colisão com plugins irmãos)
- Nunca quebrar contrato do `AudioMarker` — Analytics lê `data.json` diretamente
- Nunca usar `registerExtensions` — usar `active-leaf-change` interceptor
- Shared registry: sync bidirecional com merge por `updatedAt`
