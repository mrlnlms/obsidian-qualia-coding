# QDPX Multicoder Single-Page Import Implementation Plan

> Status: completed in Marco 1. Checkboxes below preserve the original execution
> recipe and are not the live task tracker; see `docs/ROADMAP.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar Users e Codings de seleções PDF de uma página como markers independentes por coder, iniciar projetos QDPX em somente leitura por padrão e permitir edição apenas pelo proprietário ativo.

**Architecture:** O parser passa a preservar a identidade de cada Coding e normaliza o par visual/textual do Atlas antes da criação de markers. O CoderRegistry resolve Users pelo GUID REFI-QDA, e o importer cria um marker por Selection × coder com procedência externa. Um contexto persistido de participação separa `human:default` legado de somente leitura explícito; o modelo PDF aplica a autorização na camada de mutação, enquanto popover, handles e margin panel apenas refletem essa regra.

**Tech Stack:** TypeScript 5, Obsidian API, fflate/XML DOM, Vitest 4, WebdriverIO, PDF.js, Git.

**Spec:** `docs/superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md`

## Global Constraints

- Partir do commit documental `2669120` na branch `fix/qdpx-atlas-page-anchoring`.
- Criar `feat/qdpx-multicoder-import` antes da primeira alteração de código.
- Preservar o baseline de 191/191 markers PDF não multipágina resolvidos.
- Excluir do Marco 1 os doze fragmentos dos seis grupos multipágina.
- Não alterar o algoritmo espacial geral da margin panel.
- Não criar marker compartilhado entre coders.
- O GUID REFI-QDA identifica o User importado; nome nunca é chave de merge.
- A relação entre markers da mesma Selection é procedência, não sincronização.
- Todos os markers continuam visíveis; somente o proprietário ativo pode editar.
- “Somente leitura” não cria coder e não equivale a `human:default`.
- A opção somente leitura vem pré-selecionada na importação QDPX.
- O codebook continua global; remover uma aplicação continua individual.
- Não remover cabeçalhos, rodapés, tabelas ou legendas do fluxo PDF.
- Não usar `data.json` como memória canônica; o usuário costuma apagá-lo.
- Validar o Marco 1 em um vault isolado, sem códigos, markers ou coders locais
  prévios além do `human:default` estrutural.
- Não ampliar o Marco 1 para definir novas regras de merge entre um QDPX e um
  codebook local já populado; o mecanismo de conflito existente permanece como
  está.
- Por decisão explícita do usuário, validar o comportamento no vault real antes de escrever a nova cobertura automatizada. Os testes entram na Task 8, depois da aprovação funcional.
- Nenhum commit deste plano inclui redesign multipágina, `segments[]`, zebra cross-page, filtros ou compactação `×N`.

## Execution Preflight

- [ ] Ler integralmente a spec e os três documentos em `docs/_research/` referenciados por ela.
- [ ] Confirmar worktree limpa com `git status --short --branch`.
- [ ] Confirmar `HEAD` em `2669120` ou descendente direto sem mudanças multicoder.
- [ ] Criar a branch:

```bash
git checkout -b feat/qdpx-multicoder-import
```

- [ ] Rodar o baseline antes de editar:

```bash
npx vitest run tests/import/qdpxImporter.test.ts tests/engine-models/pdfCodingModel.test.ts tests/core/icr/coderRegistry.test.ts
npm run build
```

Expected: todos os testes selecionados e o build passam.

## File Structure

### Novos arquivos

- `src/import/qdpxAuthoring.ts` — tipos e funções puras para Users, Codings, pareamento e agrupamento por autor.
- `src/core/icr/codingPermissions.ts` — política pura de modo ativo/somente leitura e propriedade de marker.
- `tests/import/qdpxAuthoring.test.ts` — cobertura posterior do parser e do pareamento.
- `tests/core/icr/codingPermissions.test.ts` — cobertura posterior da compatibilidade legado/read-only.

### Arquivos modificados no núcleo

- `src/core/icr/coderTypes.ts` — identidade externa opcional de coder.
- `src/core/icr/coderRegistry.ts` — resolução/criação por GUID REFI-QDA.
- `src/core/types.ts` — modo de participação persistido e procedência opcional da aplicação.
- `src/main.ts` — API central de participação e notificações.
- `src/core/icr/activeCoderStatusBar.ts` — opção e apresentação de somente leitura.
- `src/core/codingPopover.ts` — apresentação realmente não mutável para marker estrangeiro.
- `src/markdown/models/codeMarkerModel.ts` e `src/markdown/menu/menuController.ts`
  — propagação do modo global somente leitura ao popover Markdown;
- `src/csv/csvCodingModel.ts` e `src/csv/csvCodingMenu.ts` — propagação ao CSV;
- `src/image/imageCodingModel.ts` e `src/image/imageCodingMenu.ts` — propagação à imagem;
- `src/media/mediaCodingModel.ts` e `src/media/mediaCodingMenu.ts` — propagação a
  áudio/vídeo.

### Arquivos modificados no import

- `src/import/qdpxImporter.ts` — preview, multimap de Selection, normalização e criação per-coder.
- `src/import/importModal.ts` — campo obrigatório “Quem é você neste projeto?”.

### Arquivos modificados no PDF

- `src/pdf/pdfCodingTypes.ts` — procedência da Selection no marker.
- `src/pdf/pdfCodingModel.ts` — lookup por coder e guardas de mutação.
- `src/pdf/pdfCodingMenu.ts` — popover próprio versus estrangeiro/read-only.
- `src/pdf/pageObserver.ts` — handles apenas para markers editáveis.
- `src/pdf/marginPanelRenderer.ts` — identificação mínima do coder sem novo algoritmo de layout.
- `styles.css` — estilo mínimo para autoria e read-only.

### Testes existentes ampliados depois da validação manual

- `tests/import/qdpxImporter.test.ts`
- `tests/core/icr/coderRegistry.test.ts`
- `tests/core/dataManager.test.ts`
- `tests/engine-models/pdfCodingModel.test.ts`

O armazenamento de GUID externo no CoderRegistry continua obrigatório mesmo no
vault isolado: ele preserva autoria, permite round-trip e torna reimportações
idempotentes. Ele não deve ser confundido com uma nova política de conflito de
códigos.

---

### Task 1: Preserve Users and individual Codings while parsing QDPX

**Files:**
- Create: `src/import/qdpxAuthoring.ts`
- Modify: `src/import/qdpxImporter.ts:30-80`

**Interfaces:**
- Produces: `ParsedQdpxUser`, `ParsedQdpxCoding`, `parseQdpxUsers()`, `parseQdpxCodings()`, `mergePairedCodings()` and `groupCodingsByUser()`.
- Consumes later: Task 4 uses these functions to create CoderRegistry entries and per-coder markers.

- [ ] **Step 1: Create the authoring types and pure parsing helpers**

Create `src/import/qdpxAuthoring.ts` with this public contract:

```ts
import { getAllElements, getAttr, getChildElements } from './xmlParser';

export interface ParsedQdpxUser {
	guid: string;
	name: string;
}

export interface ParsedQdpxCoding {
	guid?: string;
	codeGuid: string;
	creatingUserGuid?: string;
	createdAt?: string;
	noteGuids: string[];
	sourceCodingGuids: string[];
}

export interface ParsedQdpxCoderGroup {
	creatingUserGuid?: string;
	codings: ParsedQdpxCoding[];
}

export function parseQdpxUsers(doc: Document): ParsedQdpxUser[] {
	const users = new Map<string, ParsedQdpxUser>();
	for (const el of getAllElements(doc.documentElement, 'User')) {
		const guid = getAttr(el, 'guid');
		if (!guid) continue;
		users.set(guid, { guid, name: getAttr(el, 'name') ?? `QDPX user ${guid}` });
	}
	return [...users.values()];
}

export function parseQdpxCodings(selectionEl: Element): ParsedQdpxCoding[] {
	return getChildElements(selectionEl, 'Coding').flatMap((coding) => {
		const codeRef = getChildElements(coding, 'CodeRef')[0];
		const codeGuid = codeRef ? getAttr(codeRef, 'targetGUID') : undefined;
		if (!codeGuid) return [];
		const guid = getAttr(coding, 'guid');
		return [{
			guid,
			codeGuid,
			creatingUserGuid: getAttr(coding, 'creatingUser'),
			createdAt: getAttr(coding, 'creationDateTime'),
			noteGuids: getChildElements(coding, 'NoteRef')
				.map((note) => getAttr(note, 'targetGUID'))
				.filter((id): id is string => !!id),
			sourceCodingGuids: guid ? [guid] : [],
		}];
	});
}

function semanticCodingKey(coding: ParsedQdpxCoding): string {
	return `${coding.creatingUserGuid ?? ''}\u0000${coding.codeGuid}`;
}

export function mergePairedCodings(
	pdfCodings: ParsedQdpxCoding[],
	textCodings: ParsedQdpxCoding[],
): ParsedQdpxCoding[] {
	const merged = new Map<string, ParsedQdpxCoding>();
	for (const coding of [...pdfCodings, ...textCodings]) {
		const key = semanticCodingKey(coding);
		const current = merged.get(key);
		if (!current) {
			merged.set(key, { ...coding, noteGuids: [...coding.noteGuids], sourceCodingGuids: [...coding.sourceCodingGuids] });
			continue;
		}
		current.sourceCodingGuids = [...new Set([...current.sourceCodingGuids, ...coding.sourceCodingGuids])];
		current.noteGuids = [...new Set([...current.noteGuids, ...coding.noteGuids])];
		current.createdAt ??= coding.createdAt;
		current.guid ??= coding.guid;
	}
	return [...merged.values()];
}

export function groupCodingsByUser(codings: ParsedQdpxCoding[]): ParsedQdpxCoderGroup[] {
	const groups = new Map<string, ParsedQdpxCoderGroup>();
	for (const coding of codings) {
		const key = coding.creatingUserGuid ?? '__unattributed__';
		const group = groups.get(key) ?? { creatingUserGuid: coding.creatingUserGuid, codings: [] };
		group.codings.push(coding);
		groups.set(key, group);
	}
	return [...groups.values()];
}
```

- [ ] **Step 2: Preserve Codings on ParsedSelection without removing the legacy projection yet**

In `src/import/qdpxImporter.ts`, import the new helpers and change `ParsedSelection` to contain:

```ts
codings: ParsedQdpxCoding[];
/** Compatibility projection for non-PDF creators during Marco 1. */
codeGuids: string[];
```

In `parseSelection()`, replace the loop that only fills `codeGuids` with:

```ts
const codings = parseQdpxCodings(el);
const codeGuids = codings.map((coding) => coding.codeGuid);
const noteGuids = codings.flatMap((coding) => coding.noteGuids);
```

Keep the existing direct Selection NoteRef loop and deduplicate its additions.

- [ ] **Step 3: Make preview expose Users and Coding count**

Add to `ImportPreview`:

```ts
users: ParsedQdpxUser[];
codingCount: number;
```

In `previewQdpx()`, compute:

```ts
const users = parseQdpxUsers(doc);
const codingCount = sources.reduce(
	(total, source) => total + source.selections.reduce((sum, selection) => sum + selection.codings.length, 0),
	0,
);
```

Return both fields. Do not deduplicate the preview count: it reports XML Coding elements, not semantic applications after PDF visual/text pairing.

- [ ] **Step 4: Compile the parser change**

Run:

```bash
npm run build
```

Expected: PASS. Fix only type errors directly caused by `codings`; do not alter marker behavior yet.

- [ ] **Step 5: Commit the parser checkpoint**

```bash
git add src/import/qdpxAuthoring.ts src/import/qdpxImporter.ts
git commit -m "refactor(import): preserve QDPX users and codings"
```

---

### Task 2: Give imported coders stable external identity

**Files:**
- Modify: `src/core/icr/coderTypes.ts`
- Modify: `src/core/icr/coderRegistry.ts`

**Interfaces:**
- Produces: `ExternalCoderIdentity` and `CoderRegistry.resolveOrCreateExternalHuman()`.
- Consumes: Task 4 maps each QDPX User GUID to a local CoderId through this method.

- [ ] **Step 1: Add the persisted external identity type**

In `src/core/icr/coderTypes.ts`, add:

```ts
export interface ExternalCoderIdentity {
	scheme: 'refi-qda-user-guid';
	value: string;
}
```

Add to `Coder`:

```ts
externalIdentities?: ExternalCoderIdentity[];
```

- [ ] **Step 2: Add lookup and creation by external GUID**

In `CoderRegistry`, add:

```ts
getByExternalIdentity(identity: ExternalCoderIdentity): Coder | null {
	return this.getAll().find((coder) => coder.externalIdentities?.some(
		(ref) => ref.scheme === identity.scheme && ref.value === identity.value,
	)) ?? null;
}

resolveOrCreateExternalHuman(name: string, identity: ExternalCoderIdentity): Coder {
	const existing = this.getByExternalIdentity(identity);
	if (existing) return existing;
	const safeGuid = identity.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
	const coder: Coder = {
		id: `human:qdpx:${safeGuid}`,
		name,
		type: 'human',
		externalIdentities: [identity],
		createdAt: Date.now(),
	};
	this.coders.set(coder.id, coder);
	this.emitMutate();
	return coder;
}
```

Import `ExternalCoderIdentity` with the existing Coder types. Do not call `createHuman(name)`: same-name/different-GUID Users must remain distinct.

- [ ] **Step 3: Compile and commit**

```bash
npm run build
git add src/core/icr/coderTypes.ts src/core/icr/coderRegistry.ts
git commit -m "feat(icr): preserve external coder identities"
```

Expected: build PASS and one focused commit.

---

### Task 3: Introduce explicit participation mode without breaking legacy vaults

**Files:**
- Create: `src/core/icr/codingPermissions.ts`
- Modify: `src/core/types.ts:300-310,420-465`
- Modify: `src/main.ts:1076-1094`
- Modify: `src/core/icr/activeCoderStatusBar.ts`
- Modify: `src/core/codingPopover.ts`
- Modify: `src/markdown/models/codeMarkerModel.ts`
- Modify: `src/markdown/menu/menuController.ts`
- Modify: `src/csv/csvCodingModel.ts`
- Modify: `src/csv/csvCodingMenu.ts`
- Modify: `src/image/imageCodingModel.ts`
- Modify: `src/image/imageCodingMenu.ts`
- Modify: `src/media/mediaCodingModel.ts`
- Modify: `src/media/mediaCodingMenu.ts`
- Modify: `src/pdf/pdfCodingMenu.ts`

**Interfaces:**
- Produces: `CodingParticipationMode`, `resolveParticipationMode()`, `canEditOwnedMarker()`, `plugin.isCodingReadOnly()`, `plugin.canEditMarker()` and `plugin.setCodingParticipation()`.
- Consumes: Tasks 4–6 use these APIs; callers never infer read-only from a missing coder ID.

- [ ] **Step 1: Create the pure permission policy**

Create `src/core/icr/codingPermissions.ts`:

```ts
import { DEFAULT_CODER_ID, type CoderId } from './coderTypes';

export type CodingParticipationMode = 'active' | 'read-only';

export function resolveParticipationMode(
	storedMode: CodingParticipationMode | undefined,
): CodingParticipationMode {
	return storedMode ?? 'active';
}

export function resolveStoredActiveCoder(
	storedCoderId: CoderId | undefined,
	hasCoder: (id: CoderId) => boolean,
): CoderId {
	return storedCoderId && hasCoder(storedCoderId) ? storedCoderId : DEFAULT_CODER_ID;
}

export function canEditOwnedMarker(
	mode: CodingParticipationMode,
	activeCoderId: CoderId,
	markerCoderId: CoderId | undefined,
): boolean {
	if (mode === 'read-only') return false;
	return (markerCoderId ?? DEFAULT_CODER_ID) === activeCoderId;
}
```

- [ ] **Step 2: Persist participation mode additively**

In `QualiaData`, add:

```ts
/** Undefined means legacy active mode; explicit read-only survives reload. */
codingParticipationMode?: import('./icr/codingPermissions').CodingParticipationMode;
```

Do not add it to `createDefaultData()`. Undefined is intentionally the legacy-compatible value that resolves to active `human:default`.

- [ ] **Step 3: Add the plugin API**

Keep `getActiveCoderId(): CoderId` non-null for compatibility, but make mode explicit:

```ts
getCodingParticipationMode(): CodingParticipationMode {
	return resolveParticipationMode(this.dataManager.getDataRef().codingParticipationMode);
}

isCodingReadOnly(): boolean {
	return this.getCodingParticipationMode() === 'read-only';
}

getActiveCoderId(): CoderId {
	return resolveStoredActiveCoder(
		this.dataManager.getDataRef().activeCoderId,
		(id) => this.coderRegistry.has(id),
	);
}

canEditMarker(marker: { codedBy?: CoderId }): boolean {
	return canEditOwnedMarker(
		this.getCodingParticipationMode(),
		this.getActiveCoderId(),
		marker.codedBy,
	);
}

setCodingParticipation(mode: CodingParticipationMode, coderId?: CoderId): void {
	if (mode === 'active') {
		if (!coderId || !this.coderRegistry.has(coderId)) return;
		this.dataManager.setSection('activeCoderId', coderId);
	}
	this.dataManager.setSection('codingParticipationMode', mode);
	for (const fn of this.activeCoderListeners) fn();
}

setActiveCoderId(id: CoderId): void {
	this.setCodingParticipation('active', id);
}
```

- [ ] **Step 4: Expose read-only in the status bar**

Update `activeCoderStatusBar.ts` so `render()` displays `Viewing only` with an `eye` icon when `plugin.isCodingReadOnly()`. Add the first menu item:

```ts
menu.addItem((item) => item
	.setTitle('Somente leitura')
	.setIcon('eye')
	.setChecked(plugin.isCodingReadOnly())
	.onClick(() => plugin.setCodingParticipation('read-only')));
menu.addSeparator();
```

Coder items continue calling `setActiveCoderId()`, which leaves read-only mode.

- [ ] **Step 5: Add a query-only path to the shared popover**

Add to `CodingPopoverOptions`:

```ts
readOnly?: boolean;
readOnlyLabel?: string;
```

Immediately after reading `activeCodes` and `allCodes`, branch when read-only. Render `readOnlyLabel`, the active code names and memo as text; omit search input, toggles, magnitude editors, relation editors, Add New Code and delete action. Keep navigation optional and keep the existing placement/hover teardown. Use these classes:

```ts
const state = container.createDiv({ cls: 'codemarker-popover-readonly' });
state.createDiv({ cls: 'codemarker-popover-readonly-owner', text: options.readOnlyLabel ?? 'Somente leitura' });
for (const name of activeCodes) {
	state.createDiv({ cls: 'codemarker-popover-readonly-code', text: name });
}
const memoText = adapter.getMemo();
if (memoText) state.createDiv({ cls: 'codemarker-popover-readonly-memo', text: memoText });
```

Extract the existing placement/tracker block into a local `finishPopover()` helper so both paths use identical cleanup. Do not simulate query-only with CSS over editable controls. This path is reserved for an active coder inspecting a foreign marker in Task 6; global read-only does not open a popover.

- [ ] **Step 6: Suppress every shared popover entry point in global read-only mode**

Modify these exact callers:

- `src/markdown/menu/menuController.ts`;
- `src/csv/csvCodingMenu.ts`;
- `src/image/imageCodingMenu.ts`;
- `src/media/mediaCodingMenu.ts`;
- `src/pdf/pdfCodingMenu.ts`.

Expose this one-line method from `CodeMarkerModel`, `CsvCodingModel`,
`ImageCodingModel` and `MediaCodingModel`:

```ts
isCodingReadOnly(): boolean {
	return this.plugin.isCodingReadOnly();
}
```

Add the same method to `MediaMenuModel`. At the first line of every caller, return when its model is read-only:

```ts
// Markdown, CSV, Image and Media
if (model.isCodingReadOnly()) return;

// PDF
if (model.plugin.isCodingReadOnly()) return;
```

Do not read `data.json` directly from menu code.

This prevents new code applications and removes the coding popover entirely while
an imported project is explicitly view-only. Do not add per-coder ownership rules
to non-PDF engines in this Marco; only the global no-mutation state is required
there.

- [ ] **Step 7: Compile and commit the participation substrate**

```bash
npm run build
git add src/core/icr/codingPermissions.ts src/core/types.ts src/main.ts src/core/icr/activeCoderStatusBar.ts src/core/codingPopover.ts src/markdown/models/codeMarkerModel.ts src/markdown/menu/menuController.ts src/csv/csvCodingModel.ts src/csv/csvCodingMenu.ts src/image/imageCodingModel.ts src/image/imageCodingMenu.ts src/media/mediaCodingModel.ts src/media/mediaCodingMenu.ts src/pdf/pdfCodingMenu.ts
git commit -m "feat(icr): add explicit read-only participation mode"
```

Expected: build PASS; legacy vaults still resolve to active `human:default`; explicit read-only survives reload.

---

### Task 4: Normalize paired PDF selections into one marker per coder

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/pdf/pdfCodingTypes.ts`
- Modify: `src/import/qdpxImporter.ts:100-125,323-535,1009-1210,1590-1680`
- Modify: `src/import/importModal.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `QdpxCodingProvenance`, `QdpxSelectionProvenance`, multimap `GuidResolver.selections`, and per-coder imported markers.

- [ ] **Step 1: Add optional round-trip provenance**

In `src/core/types.ts`, add:

```ts
export interface QdpxCodingProvenance {
	source: 'refi-qda-coding';
	sourceCodingGuids: string[];
	creatingUserGuid?: string;
	creationDateTime?: string;
}
```

Add to `CodeApplication`:

```ts
qdpx?: QdpxCodingProvenance;
```

In `src/pdf/pdfCodingTypes.ts`, add:

```ts
export interface QdpxSelectionProvenance {
	source: 'refi-qda-selection';
	selectionGuid: string;
	/** Missing/unknown creatingUser: never treat as legacy Default ownership. */
	unattributedOwner?: true;
}
```

Add to `PdfMarker`:

```ts
importedQdpxSelection?: QdpxSelectionProvenance;
```

- [ ] **Step 2: Turn selection resolution into a multimap**

Change `GuidResolver.selections` to:

```ts
/** QDPX selection guid → every Qualia marker created from that selection. */
selections: Map<string, string[]>;
```

Add helpers beside `GuidResolver`:

```ts
function addResolvedSelection(resolver: GuidResolver, guid: string, markerId: string): void {
	const ids = resolver.selections.get(guid) ?? [];
	if (!ids.includes(markerId)) resolver.selections.set(guid, [...ids, markerId]);
}

function getResolvedSelections(resolver: GuidResolver, guid: string): string[] {
	return resolver.selections.get(guid) ?? [];
}
```

Replace direct `.set()` calls with `addResolvedSelection()`. Update diagnostics
to flatten all IDs. Update `annotatePdfMarkersWithContinuedBy()` to annotate every
resolved marker.

In `applyLinks()`, never select the first marker silently:

- code → Selection: create one relation per resolved target marker;
- Selection → code: copy the relation to every resolved origin marker;
- Selection → Selection: for each origin marker, prefer the target marker with
  the same `codedBy`; if no such target exists, copy relations to every resolved
  target so no endpoint disappears;
- code → code: preserve the current single relation behavior.

Add a local `findMarkerOwner(markerId, dataManager): CoderId | undefined` helper
that searches the existing Markdown/PDF/image/CSV/media sections, then use it for
same-coder pairing. Deduplicate by `label + target + directed` before adding each
relation.

- [ ] **Step 3: Merge visual/text Codings by author and code**

When combining `pair.pdf` and `pair.text`, replace the Set over `codeGuids` with:

```ts
const codings = mergePairedCodings(pair.pdf.codings, pair.text.codings);
selectionsToProcess.push({
	...pair.pdf,
	startPosition: pair.text.startPosition,
	endPosition: pair.text.endPosition,
	name: (!pair.pdf.name || pair.pdf.name.length < (pair.text.name?.length ?? 0)) && pair.text.name
		? pair.text.name
		: pair.pdf.name,
	codings,
	codeGuids: codings.map((coding) => coding.codeGuid),
	noteGuids: [...new Set([...(pair.pdf.noteGuids ?? []), ...(pair.text.noteGuids ?? [])])],
	qdpxMultipageFragment: multipageFragmentHints.get(pair.pdf.guid),
});
```

- [ ] **Step 4: Resolve applications per coder**

Add a function with this signature:

```ts
interface ResolvedCoderApplications {
	creatingUserGuid?: string;
	coderId?: CoderId;
	codes: CodeApplication[];
}

function resolveCoderApplications(
	sel: ParsedSelection,
	resolver: GuidResolver,
	notes: Map<string, ParsedNote>,
	userGuidToCoderId: Map<string, CoderId>,
	result: ImportResult,
): ResolvedCoderApplications[];
```

Implement it as:

```ts
function resolveCoderApplications(
	sel: ParsedSelection,
	resolver: GuidResolver,
	notes: Map<string, ParsedNote>,
	userGuidToCoderId: Map<string, CoderId>,
	result: ImportResult,
): ResolvedCoderApplications[] {
	return groupCodingsByUser(sel.codings).flatMap((group) => {
		const coderId = group.creatingUserGuid
			? userGuidToCoderId.get(group.creatingUserGuid)
			: undefined;
		if (!coderId) {
			result.warnings.push(
				`Selection ${sel.guid}: Coding owner ${group.creatingUserGuid ?? 'missing'} is unresolved and will remain read-only`,
			);
		}

		const byCodeId = new Map<string, CodeApplication>();
		for (const coding of group.codings) {
			const codeId = resolver.codes.get(coding.codeGuid);
			if (!codeId) continue;
			const current = byCodeId.get(codeId);
			if (current) {
				current.qdpx!.sourceCodingGuids = [...new Set([
					...current.qdpx!.sourceCodingGuids,
					...coding.sourceCodingGuids,
				])];
				continue;
			}

			const application: CodeApplication = {
				codeId,
				qdpx: {
					source: 'refi-qda-coding',
					sourceCodingGuids: [...coding.sourceCodingGuids],
					creatingUserGuid: coding.creatingUserGuid,
					creationDateTime: coding.createdAt,
				},
			};
			for (const noteGuid of coding.noteGuids) {
				const note = notes.get(noteGuid);
				if (note?.magnitude) {
					application.magnitude = note.magnitude;
					break;
				}
			}
			byCodeId.set(codeId, application);
		}

		const codes = [...byCodeId.values()];
		return codes.length > 0 ? [{
			creatingUserGuid: group.creatingUserGuid,
			coderId,
			codes,
		}] : [];
	});
}
```

This deduplicates only inside one coder group. It preserves unknown/unattributed
groups with `coderId: undefined`; the marker creator then marks their Selection
provenance with `unattributedOwner: true`.

- [ ] **Step 5: Import Users before sources**

Extend `importQdpx()` with a `CoderRegistry` parameter. Immediately after parsing XML:

```ts
const parsedUsers = parseQdpxUsers(doc);
const userGuidToCoderId = new Map<string, CoderId>();
for (const user of parsedUsers) {
	const coder = coderRegistry.resolveOrCreateExternalHuman(user.name, {
		scheme: 'refi-qda-user-guid',
		value: user.guid,
	});
	userGuidToCoderId.set(user.guid, coder.id);
}
```

Pass the map down to `createMarkersForSource()`.

- [ ] **Step 6: Create one PDF marker per coder and skip multipage groups**

For `src.type === 'pdf'`, if `sel.qdpxMultipageFragment` is present, retain the existing legacy creation path unchanged in Marco 1. For other PDF text selections, call `resolveCoderApplications()` and invoke `createPdfMarker()` once per group.

Append optional parameters to `createPdfMarker()` so existing test callers keep
compiling until Task 8:

```ts
codedBy?: CoderId,
markerId = importedMarkerId(sel.guid, codedBy),
```

Set:

```ts
id: markerId,
codedBy,
importedQdpxSelection: {
	 source: 'refi-qda-selection',
	 selectionGuid: sel.guid,
	 ...(codedBy ? {} : { unattributedOwner: true as const }),
},
```

Build deterministic distinct IDs:

```ts
function importedMarkerId(selectionGuid: string, coderId: CoderId | undefined): string {
	const owner = (coderId ?? 'unattributed').replace(/[^a-zA-Z0-9_-]/g, '_');
	return `import_${selectionGuid}_${owner}`;
}
```

Record every returned marker ID with `addResolvedSelection()` rather than reconstructing `import_${sel.guid}`.

- [ ] **Step 7: Compile the normalized importer**

Run:

```bash
npm run build
```

Expected: PASS. The four-coder behavior is verified against the real corpus in
Task 7, after the UI and permission path exist.

- [ ] **Step 8: Commit the per-coder normalization**

```bash
git add src/core/types.ts src/pdf/pdfCodingTypes.ts src/import/qdpxImporter.ts
git commit -m "feat(import): create QDPX PDF markers per coder"
```

---

### Task 5: Add required import participation choice

**Files:**
- Modify: `src/import/qdpxImporter.ts`
- Modify: `src/import/importModal.ts`

**Interfaces:**
- Consumes: preview Users from Task 1, external coder resolution from Task 2 and plugin participation API from Task 3.
- Produces: `ImportParticipation` passed from modal to importer and applied only after Users resolve.

- [ ] **Step 1: Define the import option**

Add:

```ts
export type ImportParticipation =
	| { mode: 'read-only' }
	| { mode: 'imported-coder'; userGuid: string }
	| { mode: 'local-default' };
```

Add `participation: ImportParticipation` to `ImportOptions`.

- [ ] **Step 2: Render the choice after QDPX preview**

Add modal state:

```ts
private participation: ImportParticipation = { mode: 'read-only' };
```

In `renderPreview()`, after the source toggle, create a dropdown named `Quem é você neste projeto?` with:

```ts
dd.addOption('read-only', 'Somente leitura — não interferir no ICR');
for (const user of p.users) dd.addOption(`user:${user.guid}`, user.name);
dd.addOption('local-default', 'Perfil padrão deste vault — participar como novo codificador');
dd.setValue('read-only');
```

Map changes back to the discriminated union. The option is mandatory but already has a safe default; do not block import waiting for an extra click.

- [ ] **Step 3: Apply participation after User import**

Pass `participation` and `this.plugin?.coderRegistry` to `importQdpx()`. After `userGuidToCoderId` exists and before source markers are created:

```ts
if (options.participation.mode === 'read-only') {
	plugin.setCodingParticipation('read-only');
} else if (options.participation.mode === 'local-default') {
	plugin.setCodingParticipation('active', DEFAULT_CODER_ID);
} else {
	const coderId = userGuidToCoderId.get(options.participation.userGuid);
	if (!coderId) throw new Error('Selected QDPX coder was not found in the imported Users registry');
	plugin.setCodingParticipation('active', coderId);
}
```

Prefer passing the plugin explicitly to `importQdpx()` over using `any`. Update every production/test caller at compile time.

- [ ] **Step 4: Update preview copy**

Change the preview summary to show both XML-level figures:

```ts
info.createEl('p', {
	text: `Found: ${p.codeCount} codes, ${p.codingCount} codings, ${p.users.length} researchers, ${p.selectionCount} selections, ${p.sourceCount} sources, ${p.noteCount} memos${p.linkCount > 0 ? `, ${p.linkCount} relations` : ''}`,
});
```

Use “codings” for Coding elements and “selections” for selection elements. Do not label both as “segments”.

- [ ] **Step 5: Compile and commit**

```bash
npm run build
git add src/import/qdpxImporter.ts src/import/importModal.ts
git commit -m "feat(import): choose QDPX participation identity"
```

---

### Task 6: Enforce PDF ownership and identify coder in the existing UI

**Files:**
- Modify: `src/pdf/pdfCodingModel.ts`
- Modify: `src/pdf/pdfCodingMenu.ts`
- Modify: `src/pdf/pageObserver.ts`
- Modify: `src/pdf/marginPanelRenderer.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `plugin.canEditMarker()` and imported `codedBy`.
- Produces: coder-aware exact lookup, mutation guards, read-only foreign popover, owner-only handles and labels with coder name.

- [ ] **Step 1: Make exact lookup coder-aware**

Change the signature to accept the active owner explicitly:

```ts
findExistingMarker(
	file: string,
	page: number,
	beginIndex: number,
	beginOffset: number,
	endIndex: number,
	endOffset: number,
	coderId: CoderId = this.plugin.getActiveCoderId(),
): PdfMarker | undefined
```

Add to the predicate:

```ts
(m.codedBy ?? DEFAULT_CODER_ID) === coderId
```

`findOrCreateMarker()` must return an existing marker only for the active coder. If `plugin.isCodingReadOnly()` is true, throw `new Error('Cannot create PDF marker while coding participation is read-only')`; the UI path in Step 3 prevents this from becoming a normal user-facing exception.

- [ ] **Step 2: Put authorization in every PDF marker mutation**

Add:

```ts
isMarkerEditable(marker: PdfMarker | PdfShapeMarker): boolean {
	if ('importedQdpxSelection' in marker && marker.importedQdpxSelection?.unattributedOwner) return false;
	return this.plugin.canEditMarker(marker);
}

private editableMarkerById(markerId: string): PdfMarker | undefined {
	const marker = this.findMarkerById(markerId);
	return marker && this.isMarkerEditable(marker) ? marker : undefined;
}
```

Use `editableMarkerById()` instead of `findMarkerById()` in:

- `updateMarkerFields()` for text markers;
- `addCodeToMarker()`;
- `removeCodeFromMarker()`;
- `removeAllCodesFromMarker()`;
- `updateMarkerRange()`;
- `updateMarkerRangeSilent()`;
- `removeMarker()`.

Add:

```ts
private editableShapeById(shapeId: string): PdfShapeMarker | undefined {
	const shape = this.findShapeById(shapeId);
	return shape && this.isMarkerEditable(shape) ? shape : undefined;
}
```

Use it in `updateShapeCoords()`, `deleteShape()`, `addCodeToShape()`,
`removeCodeFromShape()` and `removeAllCodesFromShape()`. Make `createShape()`
throw the same controlled read-only error as `findOrCreateMarker()`. Keep
import/raw insertion, migration, clear-project and reconciliation infrastructure
outside these interactive guards; they are system operations, not pretending to
be the active coder.

- [ ] **Step 3: Open foreign markers through the shared read-only popover**

In `openPdfCodingPopover()`, resolve `hoverMarkerId` before constructing callbacks:

```ts
const hoveredMarker = hoverMarkerId ? model.findMarkerById(hoverMarkerId) : undefined;
const readOnly = hoveredMarker ? !model.isMarkerEditable(hoveredMarker) : model.plugin.isCodingReadOnly();
const ownerName = hoveredMarker?.codedBy
	? model.plugin.coderRegistry.getById(hoveredMarker.codedBy)?.name ?? hoveredMarker.codedBy
	: hoveredMarker?.importedQdpxSelection?.unattributedOwner
		? 'Usuário QDPX não identificado'
		: 'Default';
```

Pass:

```ts
readOnly,
readOnlyLabel: readOnly ? `${ownerName} · somente leitura` : ownerName,
deleteAction: isHoverMode && !readOnly ? {
	label: 'Delete Marker',
	icon: 'trash',
	onDelete: () => {
		for (const r of results) {
			const existing = model.findExistingMarker(
				r.file, r.page,
				r.beginIndex, r.beginOffset,
				r.endIndex, r.endOffset,
			);
			if (existing) model.removeAllCodesFromMarker(existing.id);
		}
		onHighlightRefresh();
	},
} : undefined,
```

Do not call `getMarkers()` from read-only callbacks. The shared popover branch must guarantee those callbacks are not exposed.

- [ ] **Step 4: Attach handles only to editable markers**

In `pageObserver.ts`, change the loop:

```ts
for (const info of renderInfos) {
	if (!this.model.isMarkerEditable(info.marker)) continue;
	attachDragHandles(info, pageView, {
		onRangeUpdate: (markerId, changes) => {
			this.model.updateMarkerRange(markerId, changes);
		},
		onRangePreview: (markerId, changes) => {
			this.model.updateMarkerRangeSilent(markerId, changes);
			const marker = this.model.findMarkerById(markerId);
			if (marker) updateHighlightRectsForMarker(pageView, marker, this.model.registry, filePath);
		},
		onHandleHover: (markerId) => this.model.setHoverState(markerId, null),
	});
}
```

All highlights remain rendered. Foreign markers simply receive no handle DOM.

- [ ] **Step 5: Add coder identity to current margin labels without changing layout**

Append to `renderMarginPanelForPage()` after the existing optional `shapes`
parameter:

```ts
ownerLabelForMarker?: (marker: PdfMarker | PdfShapeMarker) => string;
```

Add `coderName` to `BarEntry`/`LabelEntry`, populate it from each marker and render:

```ts
labelEl.textContent = label.coderName
	? `${label.codeName} · ${label.coderName}`
	: label.codeName;
labelEl.dataset.coderName = label.coderName ?? '';
```

From `pageObserver.ts`, keep `shapes` as the fifth argument and pass this callback
as the sixth:

```ts
(marker) => marker.codedBy
	? this.model.plugin.coderRegistry.getById(marker.codedBy)?.name ?? marker.codedBy
	: 'importedQdpxSelection' in marker && marker.importedQdpxSelection?.unattributedOwner
		? 'Usuário QDPX não identificado'
		: 'Default'
```

Do not aggregate labels, change column assignment or introduce filters.

- [ ] **Step 6: Add minimal styles**

In `styles.css`, add only typography/state styles:

```css
.codemarker-popover-readonly-owner {
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  padding: 6px 10px;
}

.codemarker-popover-readonly-code,
.codemarker-popover-readonly-memo {
  padding: 4px 10px;
}

.codemarker-popover-readonly-memo {
  color: var(--text-muted);
  white-space: pre-wrap;
}
```

- [ ] **Step 7: Compile and commit the PDF behavior**

```bash
npm run build
git add src/pdf/pdfCodingModel.ts src/pdf/pdfCodingMenu.ts src/pdf/pageObserver.ts src/pdf/marginPanelRenderer.ts src/core/codingPopover.ts styles.css
git commit -m "feat(pdf): enforce coder ownership on imported markers"
```

Expected: build PASS; no multipage or lane code changed.

---

### Task 7: Validate the complete slice manually in the real vault

**Files:**
- Modify only after observation: `docs/_research/qdpx-atlas-coder-roundtrip-margin-panel.md`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: user-approved behavior and exact observed counts used by Task 8 tests.

- [ ] **Step 1: Build and load the plugin**

```bash
npm run build
```

Reload Obsidian using the established workbench workflow. Use um vault isolado
para este ensaio. Antes de importar, confirme que não existem códigos ou markers
locais e que o único coder é o `human:default` estrutural. Não apague dados de
outros vaults. Para resetar somente o experimento QDPX, primeiro execute:

```bash
npm run qdpx:reset:dry-run
```

Review the targets, then use `npm run qdpx:reset` only for the known QDPX import state.

- [ ] **Step 2: Import the real Atlas file in default read-only mode**

Use:

`/Users/mosx/Desktop/obsidian-plugins-workbench/QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA.qdpx`

Confirm in the preview:

- 6 researchers are listed;
- Coding and Selection counts are separately labeled;
- “Somente leitura — não interferir no ICR” is selected;
- import succeeds without selecting a person.

- [ ] **Step 3: Verify faithful visibility and ownership**

Choose a known Selection where Carla, Jessica, Jorge and Isaque applied the same code. Confirm:

- four independent marker IDs exist;
- each marker has the correct `codedBy`;
- each marker has the same `importedQdpxSelection.selectionGuid`;
- each application retains its source Coding GUID(s);
- four labels remain visible in the current panel, even if congested;
- coder names distinguish them.

- [ ] **Step 4: Verify read-only is real**

While status bar says `Viewing only`, confirm:

- no handles appear;
- no coding popover opens, so code toggles, memo editors and delete action do not appear;
- selecting a new interval cannot create a marker;
- imported markers remain visible and navigable through the existing panel/sidebar;
- opening another coding modality does not open a coding popover.

- [ ] **Step 5: Verify active imported coder edits only their marker**

Select one imported coder from the status bar. Resize their marker and remove one code. Confirm the other three markers retain original bounds and codes.

- [ ] **Step 6: Verify local default creates an independent contribution**

Select `Default`, code the exact same interval and confirm a fifth marker is created with `codedBy: human:default`. Switch back to an imported coder and confirm exact-range lookup resolves that coder's marker, not Default's.

- [ ] **Step 7: Verify the baseline did not regress**

Recheck representative single-page Atlas anchors from the earlier 191-marker baseline. Confirm page and text coverage remain correct. Ignore the twelve known multipage fragments; they are intentionally unchanged.

- [ ] **Step 8: Ask the user for the functional gate**

Present the observed results and any visual limitations. Do not start Task 8 until the user confirms that the slice behaves correctly in the vault.

- [ ] **Step 9: Record evidence and commit**

Append a dated “Marco 1 — validação funcional” section with observed counts and remaining limitations. Then:

```bash
git add docs/_research/qdpx-atlas-coder-roundtrip-margin-panel.md
git commit -m "docs: record multicoder import validation"
```

---

### Task 8: Freeze the working behavior with automated coverage

> Concluída em 2026-09-02. A regressão focada aprovou 200 testes; a suíte
> integral, build e `git diff --check` foram executados antes deste checkpoint.

**Files:**
- Create: `tests/import/qdpxAuthoring.test.ts`
- Create: `tests/core/icr/codingPermissions.test.ts`
- Modify: `tests/import/qdpxImporter.test.ts`
- Modify: `tests/core/icr/coderRegistry.test.ts`
- Modify: `tests/core/dataManager.test.ts`
- Modify: `tests/engine-models/pdfCodingModel.test.ts`

**Interfaces:**
- Consumes: final approved interfaces from Tasks 1–7.
- Produces: regression protection for the complete Marco 1.

- [x] **Step 1: Cover author parsing and visual/text pairing**

Create a compact XML fixture containing two Users, one PDFSelection and one same-GUID PlainTextSelection. Each representation has the same code applied by both users with different Coding GUIDs. Assert:

```ts
expect(parseQdpxUsers(doc)).toEqual([
	{ guid: 'u1', name: 'Carla' },
	{ guid: 'u2', name: 'João' },
]);
expect(mergePairedCodings(pdfCodings, textCodings)).toMatchObject([
	{ codeGuid: 'code-a', creatingUserGuid: 'u1', sourceCodingGuids: ['pdf-c1', 'text-c1'] },
	{ codeGuid: 'code-a', creatingUserGuid: 'u2', sourceCodingGuids: ['pdf-c2', 'text-c2'] },
]);
```

Run:

```bash
npx vitest run tests/import/qdpxAuthoring.test.ts
```

Expected: PASS.

- [x] **Step 2: Cover external coder identity**

Add cases proving:

```ts
const a = registry.resolveOrCreateExternalHuman('Alex', { scheme: 'refi-qda-user-guid', value: 'guid-a' });
const b = registry.resolveOrCreateExternalHuman('Alex', { scheme: 'refi-qda-user-guid', value: 'guid-b' });
expect(a.id).not.toBe(b.id);
expect(registry.resolveOrCreateExternalHuman('Renamed Alex', { scheme: 'refi-qda-user-guid', value: 'guid-a' }).id).toBe(a.id);
expect(CoderRegistry.fromJSON(registry.toJSON()).getByExternalIdentity({ scheme: 'refi-qda-user-guid', value: 'guid-a' })?.id).toBe(a.id);
```

Run the coder registry file and expect PASS.

- [x] **Step 3: Cover legacy versus explicit read-only**

In `codingPermissions.test.ts`, assert:

```ts
expect(resolveParticipationMode(undefined)).toBe('active');
expect(resolveParticipationMode('read-only')).toBe('read-only');
expect(canEditOwnedMarker('read-only', 'human:carla', 'human:carla')).toBe(false);
expect(canEditOwnedMarker('active', 'human:carla', 'human:carla')).toBe(true);
expect(canEditOwnedMarker('active', 'human:carla', 'human:joao')).toBe(false);
expect(canEditOwnedMarker('active', 'human:default', undefined)).toBe(true);
```

Add a DataManager round-trip case where `codingParticipationMode: 'read-only'` survives load/save and missing mode remains missing/legacy-active.

- [x] **Step 4: Cover per-coder marker creation**

Extend the importer test fixture so one same-GUID PDF/text pair contains two users applying the same code. Assert two PDF markers, distinct IDs, distinct `codedBy`, common Selection provenance and one CodeApplication per coder with paired source GUIDs.

Run:

```bash
npx vitest run tests/import/qdpxImporter.test.ts
```

Expected: PASS.

- [x] **Step 5: Cover PDF lookup and mutation authorization**

In `pdfCodingModel.test.ts`, make the plugin mock expose `isCodingReadOnly()` and `canEditMarker()`. Add cases proving:

- identical bounds for Carla and João produce different markers;
- lookup under Carla returns Carla's marker;
- resize/remove code/delete on João is a no-op while Carla is active;
- those operations succeed after João becomes active;
- creation fails in read-only;
- markers with missing legacy `codedBy` are owned by Default only.
- imported markers explicitly marked `unattributedOwner` remain read-only and
  excluded from ICR even when Default is active.

Run:

```bash
npx vitest run tests/engine-models/pdfCodingModel.test.ts
```

Expected: PASS.

- [x] **Step 6: Run the focused regression set**

```bash
npx vitest run tests/import/qdpxAuthoring.test.ts tests/import/qdpxImporter.test.ts tests/core/icr/coderRegistry.test.ts tests/core/icr/codingPermissions.test.ts tests/core/dataManager.test.ts tests/engine-models/pdfCodingModel.test.ts tests/pdf/resolvePendingIndices.test.ts
```

Expected: PASS.

- [x] **Step 7: Run full suite and build**

```bash
npm test
npm run build
git diff --check
```

Expected: full suite PASS, build PASS and no whitespace errors.

- [x] **Step 8: Commit the coverage**

```bash
git add tests/import/qdpxAuthoring.test.ts tests/core/icr/codingPermissions.test.ts tests/import/qdpxImporter.test.ts tests/core/icr/coderRegistry.test.ts tests/core/dataManager.test.ts tests/engine-models/pdfCodingModel.test.ts
git commit -m "test(import): cover QDPX multicoder ownership"
```

---

### Task 9: Final audit and handoff to the round-trip milestone

> Concluída em 2026-09-02. A auditoria confirmou ausência de implementação de
> round-trip, multipágina, agregação `×N` ou redesign geral do margin panel.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md`
- Modify: `docs/superpowers/plans/2026-09-01-qdpx-multicoder-import.md`

**Interfaces:**
- Consumes: every previous task.
- Produces: clean completion checkpoint; no exporter or multipage implementation.

- [x] **Step 1: Audit scope**

Run:

```bash
git log --oneline 2669120..HEAD
git diff --stat 2669120..HEAD
rg -n "segments\[\]|×N|continued by|assignColumns" src
```

Inspect the diff and confirm no implementation of multipágina, aggregation or general lane refactor entered the branch. Existing references to those terms are allowed; new behavior is not.

- [x] **Step 2: Re-run final verification**

```bash
npm test
npm run build
git diff --check
git status --short --branch
```

Expected: tests/build/check PASS and worktree clean.

- [x] **Step 3: Mark only completed checkboxes and update the spec status**

Change the spec state to “Marco 1 concluído” only if every criterion in its “Critérios de conclusão do Marco 1” section is satisfied. Leave Marcos 2–5 unchecked.

- [x] **Step 4: Commit documentation state if it changed**

```bash
git add docs/superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md docs/superpowers/plans/2026-09-01-qdpx-multicoder-import.md
git commit -m "docs: close QDPX multicoder import milestone"
```

- [x] **Step 5: Stop before Marco 2**

Report commits, manual evidence, test totals and remaining open decisions. Do not start exporter round-trip, multipage model or margin-panel redesign without a new review checkpoint.
