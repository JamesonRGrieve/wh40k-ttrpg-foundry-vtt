# Pack authoring & schema — moved

The pack authoring and schema reference now lives at
[`docs/pack-authoring.md`](../../docs/pack-authoring.md), consolidated with the
rest of the repo documentation.

This file is a **redirect stub only** — no schema documentation lives here. It
exists so the many in-code references to `src/packs/CLAUDE.md` (comments in
`src/module/**`, the `validate-*.cjs` tooling, tests) keep resolving after the
move. The naming taxonomy, variant/provenance conventions, cost shape, NPC/actor
schema, artwork/token rules, and the validator rule list are all in
`docs/pack-authoring.md`.

> `src/packs` itself holds the public, hand-authored **generic** content packs
> plus the pack tooling (`validate-*.cjs`, `_templates/`, `build-compendium.sh`,
> `assign_icons.py`). The private copyrighted book content lives in the
> `src/packs-private` submodule and is compiled + shipped only by the campaign
> deploy.
