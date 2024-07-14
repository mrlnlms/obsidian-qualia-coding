# Editor Playground

Plugin experimental para Obsidian — CM5 experiments + Popper.js + Settings suggesters.

## v11 — Editor Playground: CM5 experiments + Popper.js + Settings suggesters (892 LOC)

Rewrite completo. Plugin renomeado de MQDA para Editor Playground. Estrutura flat: main.ts na raiz com settings/ e utils/ como diretorios separados. Foco em experimentacao com CodeMirror 5 API, Popper.js para positioning de suggesters, e Settings Tab com FolderSuggest.

### Estrutura

```
main.ts                              <- plugin principal — CM5 events, postprocessor, workspace listeners
settings/settings.ts                 <- SampleSettingTab com FolderSuggest, template folder config
settings/suggesters/suggest.ts       <- TextInputSuggest base class com Popper.js positioning
settings/suggesters/FileSuggester.ts <- FileSuggest para template/script files
settings/suggesters/FolderSuggester.ts <- FolderSuggest para folder selection
utils/Error.ts                       <- TemplaterError, errorWrapper, errorWrapperSync
utils/Log.ts                         <- log_update, log_error com Notice
utils/Utils.ts                       <- arraymove, resolve_tfolder, get_tfiles_from_folder
```

### Estado atual

- Plugin ID: `editor-playground`
- Plugin name: Editor Playground
- Estrutura flat (main.ts root + settings/ + utils/)
- CodeMirror 5 import direto (import * as CodeMirror from 'codemirror')
- Workspace events: layout-change, active-leaf-change, editor-change
- registerMarkdownPostProcessor para coded-text click handling
- Settings Tab com FolderSuggest usando Popper.js
- TextInputSuggest base class com keyboard navigation (ArrowUp/Down/Enter/Escape)
- Utils portados do Templater (Error wrapper, Log, arraymove)

### Funcionalidades

- **CM5 experiments** — acesso direto a editor.cm como CodeMirror.Editor
- **Workspace events** — layout-change e active-leaf-change disparam Notice
- **Editor-change tracking** — loga cursor position a cada mudanca
- **Settings suggesters** — FolderSuggest com Popper.js dropdown
- **Template folder config** — setting para definir pasta de templates
- **Post processor** — coded-text element click handling
- **Error handling** — TemplaterError com wrapper sync/async

### Notas

- Milestone visual: Editor playground — CM5 + Popper.js
- Dead repo no GitHub
- Codigo baseado em patterns do Templater (suggesters, error handling)
