# QDPX Authorship Round-Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export referenced QDPX Users and `Coding.creatingUser`, persist stable REFI-QDA identities for local coders, and prove Qualia → QDPX → Qualia authorship preservation without claiming Atlas PDF interoperability.

**Architecture:** A lazy authoring context resolves a marker owner only when its Coding is emitted. Source builders pass the resulting User GUID to the Coding serializer, and project assembly writes the collected Users before the CodeBook. The existing importer supplies the return half of the automated round-trip.

**Tech Stack:** TypeScript, Vitest, fflate, QDPX XML helpers, `CoderRegistry`, `DataManager`.

**Spec:** `docs/superpowers/specs/2026-09-02-qdpx-authorship-roundtrip-design.md`

## Global Constraints

- Validate Qualia↔Qualia authorship; do not claim Atlas interoperability.
- Do not reconstruct PDF visual/text pairs, multipage groups, or `continued by`.
- Do not alter bounds, anchoring, handles, zebra, or the margin panel.
- Reuse valid `refi-qda-user-guid` identity; never key identity by display name.
- Export legacy/unattributed Codings without `creatingUser`, with a warning; never assign them to Default.
- Keep identity in `CoderRegistry`; do not create an exporter-only map.

---

### Task 1: Persist identity on an existing coder

**Files:**
- Modify: `src/core/icr/coderRegistry.ts`
- Test: `tests/core/icr/coderRegistry.test.ts`

**Interfaces:**
- Produces: `setExternalIdentity(coderId: CoderId, identity: ExternalCoderIdentity): Coder`.

- [ ] **Step 1: Write failing tests**

Test replacement and JSON persistence:

```ts
const coder = registry.createHuman('Marlon');
registry.setExternalIdentity(coder.id, { scheme: 'refi-qda-user-guid', value: '11111111-1111-4111-8111-111111111111' });
registry.setExternalIdentity(coder.id, { scheme: 'refi-qda-user-guid', value: '22222222-2222-4222-8222-222222222222' });
expect(registry.getById(coder.id)?.externalIdentities).toEqual([
	{ scheme: 'refi-qda-user-guid', value: '22222222-2222-4222-8222-222222222222' },
]);
expect(CoderRegistry.fromJSON(registry.toJSON()).getByExternalIdentity({
	scheme: 'refi-qda-user-guid', value: '22222222-2222-4222-8222-222222222222',
})?.id).toBe(coder.id);
```

Also assert that assigning one identity to two coders throws `already belongs`, assigning to `human:missing` throws `Unknown coder`, and repeating the same assignment does not emit another mutation.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/core/icr/coderRegistry.test.ts`

Expected: FAIL because `setExternalIdentity` does not exist.

- [ ] **Step 3: Implement**

```ts
setExternalIdentity(coderId: CoderId, identity: ExternalCoderIdentity): Coder {
	const coder = this.coders.get(coderId);
	if (!coder) throw new Error(`Unknown coder: ${coderId}`);
	const owner = this.getByExternalIdentity(identity);
	if (owner && owner.id !== coderId) throw new Error(`External identity already belongs to ${owner.id}`);
	if (coder.externalIdentities?.some((ref) => ref.scheme === identity.scheme && ref.value === identity.value)) return coder;
	coder.externalIdentities = [
		...(coder.externalIdentities ?? []).filter((ref) => ref.scheme !== identity.scheme),
		identity,
	];
	this.emitMutate();
	return coder;
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/core/icr/coderRegistry.test.ts`

Commit: `feat(icr): persist exporter coder identities`

---

### Task 2: Create the lazy authoring context

**Files:**
- Create: `src/export/qdpxAuthoring.ts`
- Create: `tests/export/qdpxAuthoring.test.ts`

**Interfaces:**
- Produces: `QdpxExportUser`, `QdpxAuthoredMarker`, `QdpxAuthoringContext`, `createQdpxAuthoringContext()`, `buildUsersXml()`.

- [ ] **Step 1: Write failing tests**

```ts
const importedGuid = '11111111-1111-4111-8111-111111111111';
const localGuid = '22222222-2222-4222-8222-222222222222';
const carla = registry.resolveOrCreateExternalHuman('Carla', { scheme: 'refi-qda-user-guid', value: importedGuid });
const createGuid = vi.fn(() => localGuid);
const context = createQdpxAuthoringContext(registry, warnings, createGuid);
expect(context.authorGuidFor({ id: 'm1', codedBy: carla.id })).toBe(importedGuid);
expect(context.authorGuidFor({ id: 'm2', codedBy: 'human:default' })).toBe(localGuid);
expect(context.authorGuidFor({ id: 'm3', codedBy: 'human:default' })).toBe(localGuid);
expect(createGuid).toHaveBeenCalledTimes(1);
expect(context.getUsers().map((user) => user.coderId)).toEqual([carla.id, 'human:default']);
```

Cover unused coder, same name/different GUID, invalid GUID replacement, XML escaping, missing `codedBy`, `unattributedOwner`, and unknown explicit owner. Require one warning per marker.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/export/qdpxAuthoring.test.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement contracts**

```ts
export interface QdpxExportUser { coderId: CoderId; guid: string; name: string }
export interface QdpxAuthoredMarker {
	id: string;
	codedBy?: CoderId;
	importedQdpxSelection?: { unattributedOwner?: true };
}
export interface QdpxAuthoringContext {
	authorGuidFor(marker: QdpxAuthoredMarker): string | undefined;
	getUsers(): QdpxExportUser[];
}
```

Use a local UUID regex to avoid a circular import. `authorGuidFor` must reuse a valid identity, replace an invalid one, create a missing one through `registry.setExternalIdentity`, warn for ownerless/unresolved cases, and record Users in first-use order.

```ts
export function buildUsersXml(users: QdpxExportUser[]): string {
	if (users.length === 0) return '';
	return `<Users>\n${users.map((user) =>
		`<User ${xmlAttr('guid', user.guid)} ${xmlAttr('name', user.name)}/>`
	).join('\n')}\n</Users>`;
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/export/qdpxAuthoring.test.ts tests/core/icr/coderRegistry.test.ts`

Commit: `feat(export): resolve QDPX coding authors`

---

### Task 3: Emit Users and authored Codings

**Files:**
- Modify: `src/export/qdpxExporter.ts`
- Modify: `tests/export/qdpxExporter.test.ts`

**Interfaces:**
- Extends: `buildCodingXml(..., creatingUserGuid?: string)`.
- Extends: every source builder with final `authoring?: QdpxAuthoringContext`.
- Extends: `buildProjectXml(..., usersXml?: string)`.

- [ ] **Step 1: Write failing serializer tests**

```ts
const xml = buildCodingXml([{
	codeId: '550e8400-e29b-41d4-a716-446655440000',
	qdpx: { source: 'refi-qda-coding', sourceCodingGuids: [], creationDateTime: '2026-01-02T03:04:05.000Z' },
}], new Map(), 1, [], '11111111-1111-4111-8111-111111111111');
expect(xml).toContain('creatingUser="11111111-1111-4111-8111-111111111111"');
expect(xml).toContain('creationDateTime="2026-01-02T03:04:05.000Z"');
```

Add one PDF builder test proving its marker owner reaches Coding XML. Add one project test proving `<Users>` appears before `<CodeBook>`.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/export/qdpxExporter.test.ts`

Expected: FAIL on unsupported signatures.

- [ ] **Step 3: Implement Coding serialization**

```ts
export function buildCodingXml(
	codes: CodeApplication[], guidMap: Map<string, string>,
	createdAt?: number, notes?: string[], creatingUserGuid?: string,
): string
```

For each application, prefer a valid `ca.qdpx.creationDateTime`; otherwise use marker `createdAt`. Render `creatingUser` only when supplied. Keep generating Coding GUIDs; do not consume `sourceCodingGuids` yet.

- [ ] **Step 4: Propagate context through builders**

Add the optional final context to Markdown, media, tabular, image, and both PDF builder paths. Only after existing offset/geometry guards pass, call:

```ts
buildCodingXml(m.codes, guidMap, m.createdAt, notes, authoring?.authorGuidFor(m))
```

- [ ] **Step 5: Assemble Users**

Add final `usersXml = ''` to `buildProjectXml` and assemble `[usersXml, codebook, sourcesSection, notesSection, linksSection, casesSection, smartCodesSection]`.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run tests/export/qdpxExporter.test.ts tests/export/qdpxAuthoring.test.ts tests/import/magnitudeRoundTrip.test.ts`

Commit: `feat(export): emit QDPX users and coding authors`

---

### Task 4: Wire full project export

**Files:**
- Modify: `src/export/qdpxExporter.ts`
- Modify: `src/export/exportModal.ts`
- Modify: `tests/export/exportLazyAware.test.ts`
- Create: `tests/export/qdpxProjectAuthorship.test.ts`

**Interfaces:**
- Produces: `exportProject(app, dataManager, registry, coderRegistry, options, caseVariablesRegistry)`.

- [ ] **Step 1: Write a failing project test**

Build three same-bounds PDF markers owned by imported Carla, imported João, and Default. Mock PDF export data as `{ plainText: 'quoted passage', pageStartOffsets: [0], pageDims: { 0: { width: 612, height: 792 } } }`. Use `11111111-1111-4111-8111-111111111111` for Carla, `22222222-2222-4222-8222-222222222222` for João, and mock `crypto.randomUUID()` as `33333333-3333-4333-8333-333333333333` for Default.

Export, unzip, and assert exactly three Users, three matching `creatingUser` values, and Default's persisted identity. Add an ownerless fourth marker and assert it has no `creatingUser`, produces one warning, and creates no User.

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/export/qdpxProjectAuthorship.test.ts`

Expected: FAIL because full export lacks `CoderRegistry`.

- [ ] **Step 3: Wire orchestration**

Change the signature:

```ts
export async function exportProject(
	app: App, dataManager: DataManager, registry: CodeDefinitionRegistry,
	coderRegistry: CoderRegistry, options: ExportOptions,
	caseVariablesRegistry: CaseVariablesRegistry,
): Promise<ExportResult>
```

Create `authoring = createQdpxAuthoringContext(coderRegistry, warnings, uuidV4)`, pass it to every builder, build Users immediately before project assembly, and pass Users to `buildProjectXml`.

- [ ] **Step 4: Update callers**

Pass `this.plugin.coderRegistry` from `ExportModal`. Create and pass a `CoderRegistry` in every `exportProject` test call. Keep new ownerless warnings visible.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/export/qdpxProjectAuthorship.test.ts tests/export/exportLazyAware.test.ts tests/export/qdpxExporter.test.ts`

Commit: `feat(export): include coder registry in QDPX projects`

---

### Task 5: Prove the return trip and validate

**Files:**
- Modify: `tests/export/qdpxProjectAuthorship.test.ts`
- Modify after manual approval: `docs/superpowers/specs/2026-09-01-qdpx-multicoder-import-design.md`
- Modify after manual approval: `docs/superpowers/specs/2026-09-02-qdpx-authorship-roundtrip-design.md`
- Modify after manual approval: `docs/superpowers/plans/2026-09-02-qdpx-authorship-roundtrip.md`

**Interfaces:**
- Consumes: full exported ZIP and existing `importQdpx`.
- Produces: automated and manual authorship round-trip evidence.

- [ ] **Step 1: Reimport into fresh registries**

Use a fresh `DataManager`, code registry, coder registry, and a vault adapter mock implementing async `exists`, `mkdir`, `write`, and `writeBinary`. Import in read-only mode.

Assert four PDF markers: three authored and one explicitly unattributed. Assert authored `codedBy` values resolve to the three `human:qdpx:<guid>` IDs; assert the fourth has `unattributedOwner`. Export a second time from the source registry and prove Default reuses its GUID without another UUID call.

- [ ] **Step 2: Run focused verification**

Run: `npx vitest run tests/core/icr/coderRegistry.test.ts tests/export/qdpxAuthoring.test.ts tests/export/qdpxExporter.test.ts tests/export/qdpxProjectAuthorship.test.ts tests/export/exportLazyAware.test.ts tests/import/qdpxAuthoring.test.ts tests/import/qdpxImporter.test.ts tests/import/magnitudeRoundTrip.test.ts`

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run in order: `npm test`, `npm run build`, `git diff --check`.

Expected: suite PASS, build PASS, no whitespace errors.

- [ ] **Step 4: Commit automated coverage**

Commit: `test(export): prove QDPX authorship round-trip`

- [ ] **Step 5: Pause for manual Qualia↔Qualia validation**

Ask the user to export Carla, João, and Default contributions from the isolated vault, reset imported test state, reimport read-only, and confirm three independent contributions in Compare Coders. Do not use Atlas and do not mark Marco 2 complete yet.

- [ ] **Step 6: Close only Marco 2 after approval**

Set the new spec state to `Marco 2 concluído; interoperabilidade Atlas pendente para o Marco 6`; check only Marco 2 globally; leave Marcos 3–6 unchecked; mark completed plan steps; run `git diff --check`; commit `docs: close QDPX authorship round-trip milestone`.
