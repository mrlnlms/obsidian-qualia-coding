# Contributing to Qualia Coding

Thanks for your interest. Qualia Coding is **pre-alpha**, evolving fast, and most of the work happens against a real research workload. This document explains how to set up, what to expect, and how to land changes that fit.

## Status

The plugin is distributed via [BRAT](https://github.com/TfTHacker/obsidian42-brat) and is not yet on the Obsidian Community Plugins directory. APIs, schemas, and `data.json` layout can change without notice. There is no migration path between pre-alpha versions — assume a clean install per release.

## Setup

```bash
git clone https://github.com/mrlnlms/obsidian-qualia-coding
cd obsidian-qualia-coding
npm install
npm run dev      # esbuild watch mode
```

For day-to-day development the repo is opened **as a plugin folder inside an Obsidian vault** (the vault is the workspace). Drop the cloned folder into `your-vault/.obsidian/plugins/qualia-coding/` and enable it in **Settings → Community plugins**. `npm run dev` rewrites `main.js` in place; the [Hot Reload plugin](https://github.com/pjeby/hot-reload) picks up changes automatically.

A demo vault with sample files lives in `demo/` — open it as a vault to test against pre-built fixtures.

## Tests

```bash
npm run test           # ~2,400 unit tests (Vitest + jsdom)
npm run test:watch     # watch mode
npm run test:e2e       # ~66 e2e specs (wdio + real Obsidian, desktop only)
npm run build          # tsc strict + esbuild production
```

Unit tests cover pure helpers, engine models, registry CRUD, REFI-QDA round-trip, and analytics consolidators. They validate **contract**, not runtime — for anything touching `MarkdownRenderer`, CodeMirror, or fabric.js, a manual smoke test in a real vault is required before claiming a feature works.

Visual regression tests live in `tests/screenshots/`. Update baselines with `npm run test:visual:update` only when the change is intentional.

## Code style

- TypeScript strict, end-to-end. No `any` without a comment explaining why.
- Conventional commits in Portuguese: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`. Short, descriptive messages, no emoji.
- No defensive backcompat — pre-alpha means breaking changes are fine. Migrations are one-shot scripts, not inline guards.
- Each engine (markdown, pdf, csv, image, audio, video) is self-contained. Adding a format does not modify the others. Shared logic lives in `src/core/` and `src/media/`.
- Pure helpers for analytics, hierarchy, and tabular export. Side-effecting code stays in views and models.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the broader picture and [`docs/TECHNICAL-PATTERNS.md`](docs/TECHNICAL-PATTERNS.md) for recurring patterns.

## Pull requests

PRs are welcome but please open an issue first for anything beyond a typo or trivial fix — the roadmap shifts often and a feature that looks orphan may already be in flight, or out of scope by design (`docs/ROADMAP.md` lists "won't do" decisions).

Before submitting:

1. `npm run build` passes (tsc strict + production bundle)
2. `npm run test` is green
3. Manual smoke test in a real vault for anything UI-facing
4. CHANGELOG entry under `[Unreleased]` if user-visible

Reviews focus on: alignment with existing patterns, no defensive bloat, correct cleanup in `onunload`, and tests for pure helpers. Large refactors should be discussed before implementation.

## Reporting bugs

Use [GitHub Issues](https://github.com/mrlnlms/obsidian-qualia-coding/issues). Include Obsidian version, OS, plugin version, and a minimal reproduction. A `data.json` snippet (with sensitive content redacted) helps when the bug touches state.

## Security

Security issues should be reported privately. See [`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree your contributions will be licensed under the [MIT License](LICENSE).
