# WH40K RPG for Foundry VTT (Unofficial)

Unofficial, fan-made Foundry VTT system for the Warhammer 40,000 d100 RPG family. Not affiliated with or endorsed by Games Workshop, Fantasy Flight Games, or Cubicle 7 Entertainment.

The repo currently carries support for the FFG d100 lines and Imperium Maledictum under a shared TypeScript codebase, with per-system variants where the rules or presentation diverge.

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
./build-system.sh deps
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
./build-system.sh
./src/packs/build-compendium.sh
pnpm build
pnpm watch
pnpm packs
pnpm css
```

`./build-system.sh` is the canonical shell entrypoint. It builds the system, then calls `./src/packs/build-compendium.sh`; when the `src/packs` submodule is absent or uninitialized, the compendium step is skipped and the system build still succeeds.

`pnpm build` uses the Gulp pipeline and writes the compiled system plus packs to `dist/`.

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

`./build-system.sh release` stages a release bundle under `archive/release/`:

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

This is an unofficial, fan-made game system for Foundry VTT. It is not affiliated with, endorsed by, or licensed by Games Workshop, Fantasy Flight Games, or Cubicle 7 Entertainment.

**Warhammer 40,000**, **Dark Heresy**, **Rogue Trader**, **Deathwatch**, **Black Crusade**, **Only War**, and **Imperium Maledictum** are trademarks and/or registered trademarks of Games Workshop Ltd and/or their respective publishers. All rights belong to their respective owners.

### What this repository contains

- **System code** (TypeScript, Handlebars templates, CSS) — original work under the project license.
- **UI chrome images** in `src/images/` — inherited from the upstream forks ([mrkeathley/dark-heresy-2nd-vtt](https://github.com/mrkeathley/dark-heresy-2nd-vtt), [AndruQuiroga/RogueTraderVTT](https://github.com/AndruQuiroga/RogueTraderVTT)). These include thematic decorative elements (borders, textures, icons) consistent with the setting's visual identity.
- **Icon assets** in `src/icons/` — game-icons.net (CC BY 3.0) and GameDevMarket (purchased pro license). See `src/icons/ATTRIBUTION.md` and `src/icons/LICENSE`.

### What this repository does NOT contain

- **No copyrighted game text.** No rules text, item descriptions, talent descriptions, or stat blocks are included in the public repository. Combat-action labels and modifier values in `src/module/rules/` are original functional paraphrases, not quotations.
- **No compendium content.** `src/packs/` is a private submodule and is not included in public clones or releases. Users must supply their own content packs or use the system as a bare framework.
- **No copyrighted artwork.** The system does not bundle artwork from any Games Workshop, FFG, or Cubicle 7 publication.

### License

The code in this repository is licensed under **AGPL-3.0-or-later**. See the `LICENSE` file for details.
