# WH40K RPG for Foundry VTT (Unofficial)

Unofficial, fan-made Foundry VTT system for the Warhammer 40,000 d100 RPG family. Not affiliated with or endorsed by Games Workshop, Fantasy Flight Games, or Cubicle 7 Entertainment.

The repo currently carries support for the FFG d100 lines under a shared TypeScript codebase, with per-system variants where the rules or presentation diverge.

This project is in active migration:

- TypeScript-first, with ratchets to reduce weak typing over time.
- Tailwind-first for new UI work, while legacy CSS is still being retired.
- Storybook and Vitest are part of the normal component workflow.
- Per-system support is being homologated across DH1, DH2, RT, BC, OW, and DW.

Fork lineage: [AndruQuiroga/RogueTraderVTT](https://github.com/AndruQuiroga/RogueTraderVTT), itself forked from [mrkeathley/dark-heresy-2nd-vtt](https://github.com/mrkeathley/dark-heresy-2nd-vtt).

## Current Repo State

- Active runtime target: Foundry VTT 14.
- Manifest compatibility: minimum 14, maximum 14, verified `14.368`.
- Main source tree: `src/`
- Automated tests: `tests/`
- Storybook stories: `stories/`
- Build / coverage / ratchet scripts: `scripts/`
- Tailwind migration helpers: `tailwind/`
- Foundry runtime mirror for local tooling: `.foundry-release/`

No copyrighted compendium content ships with this system.

## Supported Systems

The codebase currently includes concrete actor/data model wiring for:

- Dark Heresy 1e
- Dark Heresy 2e
- Rogue Trader
- Black Crusade
- Only War
- Deathwatch

The sheet architecture uses explicit per-system actor types such as `dh2-character`, `rt-starship`, and `dh1-npc` rather than relying on one generic sheet path.

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

`./build-system.sh` is the canonical shell entrypoint. It builds the system, then calls `./src/packs/build-compendium.sh`, which compiles the public generic packs in `src/packs` (none yet, so the step is a no-op).

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
  icons/         Icon attribution only (game-icons.net, CC BY 3.0) — no icons bundled
  lang/          Localization files
  module/        TypeScript application, document, data model, rules, and hook code
  packs/         Public generic compendium source + pack tooling
  packs-private/ Copyrighted book content (private submodule; never shipped publicly)
  scripts/       Runtime scripts shipped with the system
  templates/     Handlebars templates and partials
stories/         Storybook stories, mocks, and rendering helpers
tests/           Vitest coverage
scripts/         Repo maintenance, ratchet, and scaffolding scripts
tailwind/        Legacy Tailwind plugin/component bridge during migration
.foundry-release/ Mirrored Foundry runtime assets for local compatibility work (gitignored)
```

## Releases

Releases are built and published by `.github/workflows/release.yml`:

- **Official release** — bump `version` in `src/system.json`, commit, then push a matching `v<version>` tag (e.g. `v1.0.0`). The workflow runs `pnpm check`, builds, and publishes a GitHub release whose manifest URL is `https://github.com/JamesonRGrieve/wh40k-ttrpg-foundry-vtt/releases/latest/download/system.json` and whose download URL is pinned to the tag. A tag with a prerelease label (`v1.1.0-rc.1`) publishes as a prerelease.
- **Nightly** — every push to `main` republishes the rolling `nightly` prerelease (`…/releases/download/nightly/system.json`).

Both channels ship system code, `LICENSE`, and the public generic packs only; the release manifest declares exactly the packs present in the zip. `./build-system.sh release` stages the same bundle locally under `archive/release/`.

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

**Warhammer 40,000**, **Dark Heresy**, **Rogue Trader**, **Deathwatch**, **Black Crusade**, and **Only War** are trademarks and/or registered trademarks of Games Workshop Ltd and/or their respective publishers. All rights belong to their respective owners.

### What this repository contains

- **System code** (TypeScript, Handlebars templates, CSS) — original work under the project license.
- **Icon references** — the system uses [game-icons.net](https://game-icons.net/) icons (CC BY 3.0); see `src/icons/ATTRIBUTION.md`. No image or icon assets are bundled — UI chrome is styled with CSS/Tailwind.

### What this repository does NOT contain

- **No copyrighted game text.** No rules text, item descriptions, talent descriptions, or stat blocks are included in the public repository. Combat-action labels and modifier values in `src/module/rules/` are original functional paraphrases, not quotations.
- **No copyrighted compendium content.** Book content lives in the private `src/packs-private` submodule and is not included in public clones or releases. Users must supply their own content packs or use the system as a bare framework.
- **No copyrighted artwork.** The system does not bundle artwork from any Games Workshop, FFG, or Cubicle 7 publication.

### License

The code in this repository is licensed under **AGPL-3.0-or-later**. See the `LICENSE` file for details.
