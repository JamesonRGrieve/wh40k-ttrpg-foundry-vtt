# WH40K RPG for Foundry VTT

Foundry VTT system for Warhammer 40,000 roleplaying games. The repo currently carries support for the FFG d100 lines and Imperium Maledictum under a shared TypeScript codebase, with per-system variants where the rules or presentation diverge.

This project is in active migration:

- TypeScript-first, with ratchets to reduce weak typing over time.
- Tailwind-first for new UI work, while legacy CSS is still being retired.
- Storybook and Vitest are part of the normal component workflow.
- Per-system support is being homologated across DH1, DH2, RT, BC, OW, DW, and IM.

Fork lineage: [AndruQuiroga/RogueTraderVTT](https://github.com/AndruQuiroga/RogueTraderVTT), itself forked from [mrkeathley/dark-heresy-2nd-vtt](https://github.com/mrkeathley/dark-heresy-2nd-vtt).

## Current Repo State

- Active runtime target: Foundry VTT 14.
- Manifest compatibility: minimum 13, maximum 14, verified `14.349`.
- Main source tree: `src/`
- Automated tests: `tests/`
- Storybook stories: `stories/`
- Build / coverage / ratchet scripts: `scripts/`
- Tailwind migration helpers: `tailwind/`
- Foundry runtime mirror for local tooling: `.foundry-release/`
- Cartography and campaign asset pipeline: `cartography/`

The repo also contains local compendium content under `src/packs/` and backup/export material used for personal campaign work. Public releases strip copyrighted pack payloads from the release zip.

## Supported Systems

The codebase currently includes concrete actor/data model wiring for:

- Dark Heresy 1e
- Dark Heresy 2e
- Rogue Trader
- Black Crusade
- Only War
- Deathwatch
- Imperium Maledictum

The sheet architecture uses explicit per-system actor types such as `dh2-character`, `rt-starship`, and `im-npc` rather than relying on one generic sheet path.

## Requirements

- Node.js 20+ recommended
- `pnpm` `10.32.1` via Corepack or standalone install
- Foundry VTT 14 for active development testing

## Setup

```bash
./build.sh deps
```

That script will:

- verify Node is available
- enable the pinned `pnpm` version
- run `pnpm install --frozen-lockfile`

If you already have the toolchain installed:

```bash
pnpm install --frozen-lockfile
```

## Development Commands

### Build

```bash
pnpm build
pnpm watch
pnpm packs
pnpm css
```

`pnpm build` uses the Gulp pipeline and writes the compiled system to `dist/`.

### Quality Gates

```bash
pnpm lint
pnpm stylelint
pnpm format
pnpm typecheck
pnpm test
pnpm check
```

`pnpm check` runs the baseline validation pass used before commits:

- lang JSON validation
- ESLint
- Prettier
- Stylelint
- TypeScript
- Vitest

### Storybook

```bash
pnpm storybook
pnpm build-storybook
pnpm test:storybook:integration
```

Storybook is part of the expected workflow for sheets, dialogs, partials, and shared UI pieces. Use the existing mocks and helpers in `stories/` instead of hand-rolling large Foundry contexts.

### Coverage / Ratchets / Scaffolding

```bash
pnpm css:coverage
pnpm animation:coverage
pnpm theme:coverage
pnpm important:coverage
pnpm ts:coverage
pnpm symmetry
pnpm preload:drift
pnpm i18n:gen
pnpm i18n:check
pnpm icons:gen
pnpm icons:check
pnpm scaffold:story <path-to-source.ts>
pnpm scaffold:test <path-to-source.ts>
```

These scripts exist to make the migration measurable. If you are touching an area that has a ratchet, the expectation is to leave that metric better than you found it.

## Repository Layout

```text
src/
  css/           Legacy CSS still being migrated away from
  icons/         Generated / curated icon assets
  images/        System images
  lang/          Localization files
  module/        TypeScript application, document, data model, rules, and hook code
  packs/         Local compendium source
  scripts/       Runtime scripts shipped with the system
  templates/     Handlebars templates and partials
stories/         Storybook stories, mocks, and rendering helpers
tests/           Vitest coverage
scripts/         Repo maintenance, ratchet, and scaffolding scripts
tailwind/        Legacy Tailwind plugin/component bridge during migration
.foundry-release/ Mirrored Foundry runtime assets for local compatibility work
cartography/     Campaign map, token, overlay, and presentation pipeline
```

## Release Notes

`./build.sh release` stages a release bundle under `archive/release/`:

- `system.json`
- `wh40k-rpg.zip`

As part of that flow, the script removes `packs/` from the release archive before publication. That is intentional and should not be bypassed.

## Foundry Runtime Mirror

`pull-foundry.sh` mirrors the live Foundry installation into `.foundry-release/` for local tooling and UI compatibility work.

```bash
FOUNDRY_PASS=... ./pull-foundry.sh
```

It pulls:

- `public/`
- `dist/`
- `templates/`
- installed modules
- installed systems other than `wh40k-rpg`

## Content and Licensing

This repo includes local campaign and pack material that is not suitable for public redistribution as-is. Treat `src/packs/` and related backup/export content as private working data unless the release tooling has explicitly stripped it.

Project package metadata currently declares the code license as `MIT` in `package.json`.
