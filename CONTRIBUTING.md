# Contributing

Thanks for helping with the WH40K RPG Foundry VTT system (unofficial). This is a
fan-made, community project — **not affiliated with or endorsed by Games
Workshop, Fantasy Flight Games, or Cubicle 7 Entertainment.** Contributions of
code, tooling, tests, docs, and **trademark-free** game content are welcome.

By contributing you agree that your contribution is licensed under
**AGPL-3.0-or-later** (see *Licensing & intellectual property* below).

## Getting started

```bash
pnpm install          # installs deps and wires the pre-commit hooks
pnpm watch            # continuous build to dist/
pnpm test             # Vitest
pnpm storybook        # component workbench (port 6006)
pnpm check            # lint + format + typecheck + tests (run before a PR)
```

- **Source tree:** `src/` (TypeScript, DataModel-heavy, ApplicationV2). Repo
  standards live in `CLAUDE.md`; the pack/compendium schema lives in
  [`docs/pack-authoring.md`](docs/pack-authoring.md).
- **Six game lines** share one codebase — `dh1`, `dh2`, `rt`, `dw`, `bc`, `ow`.
  A change should improve, or at least not regress, all six (see `CLAUDE.md`).
- **Tests + stories are part of the change.** New components ship with a
  `*.test.ts` and a `*.stories.ts`; bug fixes ship with a regression test.

## Opening a pull request

1. Fork, branch, and keep the change focused (one logical change per PR).
2. `pnpm check` must pass, and the **pre-commit ratchets must stay green** — they
   are a one-way valve (lint, typing, coverage, and content quality may improve
   but never regress). Do **not** bypass hooks with `--no-verify`.
3. Every source file carries an SPDX header; match the surrounding style.
4. Write commit messages that explain **why**. Describe cross-system impact.

## Licensing & intellectual property

- The project is **AGPL-3.0-or-later**. Some portions are derived from
  GPL-3.0 upstreams (see `LICENSE_NOTICE.md`) and remain GPL-3.0-compatible.
- **Every contribution must be yours to give and must grant redistribution under
  AGPL-3.0-or-later.** Do not submit code, text, images, or data you cannot
  license this way. All dependencies must be AGPL-compatible.
- **No third-party intellectual property.** Do not contribute copyrighted rules
  text, stat blocks transcribed from published books, official artwork, or other
  material owned by a rights holder. That content is out of scope for this public
  repository.

### Content: what belongs in this repo

Compendium content in this public repo lives under `src/packs/` and must be
**clean, original, and trademark-free** — authored per
[`docs/pack-authoring.md`](docs/pack-authoring.md) and validated by
`pnpm packs:validate`, `pnpm packs:validate:actors`, and
`pnpm packs:validate:images`. Book-sourced (copyrighted) content is kept in a
separate private submodule and is **never** accepted into `src/packs/`.

## Homebrew content requirements

Homebrew (original, non-official) content is welcome in `src/packs/homebrew/`
(named `hb-<line>-<category>` or `hb-generic-<category>` per the taxonomy in
[`docs/pack-authoring.md`](docs/pack-authoring.md)). **Every homebrew
contribution MUST meet all three of the following, or it will not be merged:**

1. **Balanced against official material.** New content must be tuned to sit
   fairly alongside the official rules it plays next to — comparable in power,
   cost, and utility to equivalent official options for its tier/line. State the
   official items you balanced against in the PR description. Content that is
   strictly better than its official peers (or that trivialises an encounter or
   subsystem) will be sent back for tuning.

2. **Redistributable under AGPL-3.0-or-later.** The contribution must be your own
   original work and must grant redistribution and modification rights under
   AGPL-3.0-or-later, the same as the rest of the repository. Do not submit
   homebrew you found elsewhere unless you hold the rights and can license it this
   way.

3. **No third-party trademarks or IP without permission.** Do **not** use the
   trademarks or copyrighted names of Games Workshop or any other rights holder —
   including the names of official planets, sectors, factions, organizations,
   characters, units, weapons, vehicles, ships, or titles, and any verbatim
   official rules text or artwork. Invent your own names and prose. Generic,
   real-world, or public-domain terminology is fine; anything that identifies an
   official IP element is not. When in doubt, rename it.

Homebrew that meets all three routes through the same variant/provenance model as
official content (authored with `source.<line>.provenance: "homebrew"`); see
[`docs/pack-authoring.md`](docs/pack-authoring.md) → *Homebrew Pack Naming* and
*Homebrew Conversions*.

## Reporting issues

Open a GitHub issue with steps to reproduce, the affected game line(s), and your
Foundry version. Security-sensitive reports should be raised privately with the
maintainer rather than in a public issue.
