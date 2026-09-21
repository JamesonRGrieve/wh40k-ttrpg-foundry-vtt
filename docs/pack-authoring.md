# Pack Authoring & Schema

The canonical schema and naming reference for wh40k-rpg compendium content packs
— the shape every `_source/*.json` document is authored in, and the conventions
the build validator (`src/packs/validate-schema.cjs`) checks.

**Two pack roots.** `src/packs` holds the public, hand-authored **generic**
content packs plus the pack tooling (validators, templates, this doc's subject
matter). The copyrighted book content lives in the private `src/packs-private`
submodule and is compiled only when a build points `WH40K_PACKS_SRC` at it (the
campaign deploy does this — see `deploy.sh`). Both roots share the identical
schema, tooling, and this document; the split is purely which content ships
publicly. Nothing in this file is source-book text — author generic, non-
copyrighted content in `src/packs`.

**Six game lines.** The schema keys off six system ids — `dh1`, `dh2`, `rt`,
`dw`, `bc`, `ow`. Dark Heresy 2e (`dh2`) is the canonical default line.

**Frontmatter templates** for each item type live in `src/packs/_templates/*.yml`
— copy the matching template when authoring a new document.

---

## Pack Naming Taxonomy

This is the canonical naming scheme for **official** (non-homebrew) content
packs. It is line-prefixed but **content-typed**: the line lives in the prefix,
the *category* is a function of the Foundry document class/type — never of the
game line. Two lines holding the same kind of document MUST use the same
category segment. Line-correlated category prefixes are a bug.

### Pattern

```
<group-dir>/<line>-<book>-<category>      # ALL official content
```

**All three segments are mandatory for official packs** — every official pack is
`<line>-<book>-<category>`, no exceptions. There is **no** bookless
`<line>-<category>` form. (Only `homebrew/hb-*` packs omit the book — see
*Homebrew Pack Naming*.)

- `<group-dir>` is the game-line directory: `black-crusade`, `dark-heresy-1`,
  `dark-heresy-2`, `deathwatch`, `only-war`, `rogue-trader`.
- `<line>` is the system id (`bc`/`dh1`/`dh2`/`dw`/`ow`/`rt`) and is **always
  retained** in the pack name. (The line prefix on pack names is *not* removed —
  only the Foundry document `type` field is de-prefixed; see *Document type vs.
  pack prefix* below.)
- `<book>` is a single lower-case slug for the source book (`core`, plus one slug
  per supplement), drawn from the per-line *Book slug registry* (see *Book
  slugs*). It is **required**. Content that feels "line-wide" still came from some
  book — attribute it to that book's slug (almost always `core`). A pack with no
  book segment is **non-conforming** and must have its book inserted.
- `<category>` is the **group prefix + content segment**, defined below.

### Group prefix = Foundry document class

The leading segment of `<category>` names the document class, so a pack's kind is
legible from its name and never varies by line:

| Document class | Group prefix | Examples |
| --- | --- | --- |
| Item (general, personal scale) | `items-` | `items-weapons`, `items-armour`, `items-force-fields`, `items-talents`, `items-traits`, `items-skills`, `items-gear`, `items-ammo`, `items-conditions`, `items-critical-injuries`, `items-psychic-powers`, `items-navigator-powers`, `items-cybernetics`, `items-orders`, `items-rituals`, `items-weapon-mods`, `items-armor-mods`, `items-endeavours` |
| Item, `originPath` subtype | `origins-` | `origins-homeworlds`, `origins-careers`, `origins-birthrights`, `origins-archetypes`, `origins-backgrounds`, `origins-roles`, `origins-motivations`, `origins-lineages`, `origins-races`, `origins-chapters`, `origins-prides`, `origins-disgraces`, `origins-specialities`, `origins-regiment-types`, `origins-regimental-drawbacks`, `origins-training-doctrines`, `origins-special-equipment-doctrines`, `origins-commanding-officers`, `origins-elite-advances`, `origins-trials-and-travails`, `origins-lure-of-the-void`, `origins-worlds` |
| Item, vehicle scale | `items-vehicle-` | `items-vehicle-upgrades`, `items-vehicle-traits` |
| Item, ship/void scale | `items-ship-` | `items-ship-components`, `items-ship-weapons`, `items-ship-roles`, `items-ship-upgrades`, `items-ship-orders` |
| Actor | `actors-` | `actors-bestiary` (unnamed classes), `actors-npcs` (named individuals), `actors-reinforcements`, `actors-mounts`, `actors-ships`, `actors-vehicles` |
| JournalEntry | `journals` / `journals-` | `journals`, `journals-character-actions`, `journals-colonies` |
| RollTable | `rolltables` | `rolltables` (single pack per book; no thematic suffixes) |
| Adventure | `adventures` | `<line>-adventures` (one pack per line; each book is one Adventure document entry — see *Adventures*) |
| Item, mechanical Endeavour | `items-endeavours` | `<line>-<book>-items-endeavours` (Item `type: endeavour` — the objective/goal tracker) |

#### Scale axis

`items-` / `items-vehicle-` / `items-ship-` are a deliberate, sanctioned **scale
grouping** layered over the content segment, for menu navigability — personal-
scale gear sits apart from vehicle-scale and void/ship-scale payloads even though
each underlying segment is already its own Foundry type (`shipWeapon`,
`vehicleUpgrade`, …). The axis is applied **symmetrically and uniformly across
lines**: a line with vehicle payloads uses `items-vehicle-*`, a line with ship
payloads uses `items-ship-*`, and neither folds its payloads back into flat
`items-*`. Personal-scale modifications (`weapon.modification`,
`armourModification`) stay in personal `items-*` (`items-weapon-mods`,
`items-armor-mods`); vehicle/ship upgrades use their scale prefix.

Rules:

- **`stats-*` is retired.** Talents, traits, skills, conditions, critical-
  injuries, and psychic-powers are Items in every line → they use `items-*`
  (`items-talents`, not `stats-talents`).
- **All `originPath` content uses `origins-*`** — never bare (`homeworlds`,
  `careers`) and never `stats-*`. `originPath` is one Foundry Item subtype
  spanning many creation categories, so it gets its own group prefix distinct from
  generic `items-*`.
- **Vehicle/ship Item payloads use their scale prefix** (`items-vehicle-*` /
  `items-ship-*`); bare `ship-weapons` / `ship-roles` and flat `vehicle-*` are
  non-conforming. A ship or vehicle that is an **Actor** is `actors-ships` /
  `actors-vehicles`, not an `items-*` payload.
- **Modifications stay at personal scale.** `weapon.modification` →
  `items-weapon-mods`; `armourModification` → `items-armor-mods`. Vehicle and ship
  upgrades are scale payloads (`items-vehicle-upgrades`, `items-ship-upgrades`).
- The content segment after the group prefix is the content type and, where it
  maps 1:1, equals the Item/Actor subtype.
- **RollTables collapse to one pack per book** (`<line>-<book>-rolltables`); do
  not thematically suffix them. JournalEntry is the one class that *may* carry a
  thematic suffix *after* the book (`<line>-<book>-journals-<theme>`), because
  JournalEntry has no mechanical subtype to key a pack on — theme is its only
  split axis. This exception does **not** license thematic splits of mechanical
  Item/Actor types (see *One document type per pack*).
- **Adventures are one pack per line, bookless** (`<line>-adventures`): the *book
  is the Adventure document entry*, not the pack. Content an adventure introduces
  (NPCs, items) is authored in the normal `<line>-<book>-actors-*` / `-items-*`
  packs and **referenced by UUID**, never duplicated into the Adventure. Full
  scenario schema is in the *Adventures* section below.
- **Gear sub-taxonomy.** The Foundry `gear` type is atomized by sub-kind into
  uniform packs across all lines: `items-gear` (general), `items-consumables`,
  `items-tools`, `items-wearables`, `items-relics`, `items-services`. Each is
  single-type `gear`; the sub-kind is expressed by the pack and applied the same
  way in every line. This is one of the three **sanctioned same-type sub-kind
  splits** — see *One document type per pack*.
- **`order` sub-kind split.** Ground orders (`items-orders`) and void manoeuvres
  (`items-ship-orders`) are both type `order`; they are kept in separate packs by
  scale/role for navigability.

### Actor atomization (uniform across lines)

Actor packs are atomized by role, and the grain is the **same for every line** —
a line does not get to fold reinforcements into bestiary just because it has fewer
entries. The split axis is **named individual vs. unnamed class** — *not*
disposition, *not* species, and *not* whether the class reads as a "person" or as
"fodder". A soldier class and a generic-daemon class are both *unnamed classes*
(→ bestiary); a *named* soldier or a *named* daemon is an individual (→ npcs):

- `actors-bestiary` — **unnamed classes**: the reusable base stat template for a
  *kind* of being — a role (a technician, a soldier, a citizen), a creature/beast,
  a trooper or mob, or a generic daemon. If it has no proper name, it is a class;
  hostility/personhood is irrelevant.
- `actors-npcs` — **named, discrete individuals**: a specific being with a proper
  name and identity. Where a named individual is a specific instance of an
  `actors-bestiary` class, author it here as a **`variantOf`** that base,
  overriding only what differs; a unique character with no base is a standalone
  document.
- `actors-reinforcements` — the reinforcement-character **stat-block style**:
  allied or summonable NPCs the party fields (e.g. currency-costed pre-made
  characters).
- `actors-mounts` — ridden/beast companions.
- `actors-ships` — ship-scale Actors (`*-starship`).
- `actors-vehicles` — vehicle Actors.

`bestiary`, `npcs`, `reinforcements`, and `mounts` are all the same `*-npc`
Foundry type; the **pack split** (not the type) is what distinguishes their role.
Named individuals live in `actors-npcs` as variants of their base classes; the
unnamed bases (role templates, creatures, mobs, generic daemons) stay in
`actors-bestiary`.

### Animate vehicles (daemon-engines / walkers / interred-pilot war machines)

Some war machines are printed with a **vehicle** stat block (Type: Walker,
Structural Integrity, facing Armour, Vehicle Traits) **and** a creature
**characteristics grid**. They are authored as the **vehicle actor type**
(`<line>-terracraft` / `-aircraft`), NOT as `npc`, because their durability model
is vehicle (Integrity + facing armour), and they carry:

- `system.characteristics` — an **optional** flat-int profile
  (`{ws,bs,s,t,ag,int,per,wp,fel}`), authored exactly like an NPC's and expanded
  to the rich `{base,total,bonus,…}` shape at runtime by the vehicle DataModel's
  migration. **`null`/absent on ordinary crewed vehicles** (their crew roll their
  own characteristics). A printed dash → `0`.
- **Creature talents / traits as embedded items** (`_stats.compendiumSource` by
  UUID, SPEC bases via `system.specialization`), exactly like an NPC's inventory.
  Weapons stay as the vehicle's `system.weapons` prose.

The vehicle sheet surfaces the profile grid + an abilities list only when
`characteristics` is non-null.

**Per-characteristic `source` marker (pilot / not-applicable).** A profile
characteristic may be authored as a **rich object `{ "base": N, "source": "…" }`**
instead of a bare int, where `source` ∈ `fixed` (chassis value, the default) |
`pilot` (uses the crewing character's stat — printed `*`) | `na` (does not apply
to a vehicle — printed dash). Without the marker a pilot/N-A characteristic stores
`0` and mis-renders as a real zero. The flat-int form stays valid (defaults every
`source` to `fixed`); mix the two freely.

**Not-applicable numeric stats.** `system.manoeuverability` and
`system.carryingCapacity` are nullable — author **`null`** (not `0`) when the
chassis genuinely has none, so the sheet prints a dash rather than a false `0`.

**Named weapon hardpoints (loadout).** A vehicle class declares its weapon slots
in `system.hardpoints` — an array of
`{ id, label, capacity, accepts: [<category>] }` (what CAN be mounted, held
separately from what is equipped). Each weapon carries a content-authored
`system.mountCategory` string; it is eligible for a hardpoint whose `accepts`
lists that category, and is installed by setting its `system.hardpoint` to the
hardpoint id (blank = available). Set `system.innate: true` on an always-on weapon
that occupies no hardpoint. The `label` and category strings are content-specific
— author them in the pack, not the system langpack. Special-rule traits are
embedded `vehicleTrait` items (lean `_stats.compendiumSource` overlays), never a
`specialRules` prose blob.

**Cross-book reprint of the same chassis** (identical stats printed in two books
of one line) is ONE canonical doc (the earliest printing's pack) plus a **whole-
file `reference` stub** in the other book's pack — never a duplicated document.
Only genuine stat divergence between the two printings uses a `__books`
book-variant container instead.

### Cross-line same-name actors are NOT homologated — keep them separate

The *Homologation Model* and *Variantized Fields* rules below (one canonical
document + per-line variant containers + a whole-file `reference` stub) govern
**items**. They do **NOT** extend to a creature printed in more than one line with
its own line-tuned statblock. Author each line's printing as its **own** actor
document in that line's pack — separate `_id`, `gameSystems` scoped to the single
line, `source.<line>` `raw` — even when the `name` and the in-fiction creature are
identical and the portrait is shared. A shared portrait URL across the line-
separate copies is correct, not a reuse-defect.

Why the item homologation machinery cannot be used here: the per-line variant
resolver collapses line-keyed containers **only within `system`**. An actor's
inventory is embedded `items[]` **outside** `system`, so it has **no** per-line
resolution. Cross-line statblocks of the same creature carry genuinely different
inventories, so a single canonical doc would either leak one line's embedded items
onto the other or force regressing UUID-linked inventory back to prose — both
unacceptable.

Two related actor moves are unaffected and still apply: a **named individual**
that is a specific instance of a same-line base class is a `variantOf` that base
(*Actor atomization*), and a cross-line **homebrew port** of an actor (not RAW in
the target line) rides on the source-line doc via a `source.<target>` homebrew
branch + a `description.<target>` container and *does* add the target to
`gameSystems`.

### One document type per pack

Each pack holds **exactly one** Foundry document `type`. The role/sub-kind splits
above are consistent with this — `actors-bestiary`/`-npcs`/`-reinforcements`/
`-mounts` are each single-`npc`; the gear sub-packs are each single-`gear`;
`origins-*` packs are each single-`originPath`. A pack that mixes types is non-
conforming: distribute its entries to the correct type packs and express any
thematic grouping with a tag/field on the documents, not by co-locating types in
one pack.

**Sanctioned same-type sub-kind splits are a closed list: `gear`, `npc`, and
`order`.** Only these three types may be split across multiple packs of the same
type (gear sub-kinds; npc roles; ground orders vs. void manoeuvres). The
justification is **volume / menu navigability**, not mechanics. Every other type
is **one-pack-per-type**, with any thematic grouping expressed by a tag/field on
the documents. Adding a fourth type to this list is a deliberate amendment to this
section, not an ad-hoc call.

**Reference stubs resolve before the one-type check.** A whole-file `reference`
stub declares no `type` until the build resolves its chain (see *Whole-File
Reference Format*), so the one-type-per-pack check resolves stubs first and checks
the resolved document's type.

### Document type vs. pack prefix

The Foundry document **`type`** field is the bare content type with **no system
prefix** (`npc`, `character`, `vehicle`, `starship`, `weapon`, `talent`,
`originPath`, …) — the schema is homologated and the owning line is carried in a
data field. This de-prefixing applies **only to the `type` field**; **pack names
keep their `<line>-` prefix**.

### Book slugs

The `<book>` segment is drawn from a **per-line slug registry** — one slug per
source book, used identically across every category pack of that book. The
registry is the authoritative slug ↔ title map and **must mirror the standardized
`source.<line>.book` string** the book's content carries. One book = one slug; do
not coin a new slug for a book that already has one, and do not reuse a slug for
two books. The concrete per-line registry lives with the content (the private
submodule holds the real book titles); public generic content uses `core` for its
single implied book. `errata` is **not** a book slug — errata is an entity flag
(see *Migration debt*), not a pack/book.

### Cross-line / reprinted content

Content reprinted from one line into another line's book is **not** forked into a
line-specific copy. It is **one canonical document** with a per-line variant
container plus a whole-file `reference` stub in the other line's pack, per the
*Homologation Model* below. The reprinting book is recorded as that line's
`source.<line>` provenance on the canonical document.

### Other Foundry document classes

The table above covers Item, Actor, JournalEntry, RollTable, and Adventure — the
classes the system currently ships in packs. Any other top-level Foundry document
class introduced later (Scene, Macro, Playlist, Cards, …) takes the **bare class
name** as its group prefix when first packed (`scenes`, `macros`, …), following
the same content-typed-not-line-typed rule.

### Migration debt

Existing packs that don't match the above are migration debt; the names in this
section are the target. New packs must conform from creation. Common debt:

- `stats-*` → `items-*` / `origins-*`; bare category names (`homeworlds`,
  `careers`, `psychic-powers`, …) → `items-*` or `origins-*`.
- bare `ship-*` / flat `vehicle-*` → `items-ship-*` / `items-vehicle-*`.
- **bookless packs** (no `<book>` segment) → insert the book slug (almost always
  `core`). The book segment is mandatory.
- mixed-type bundles → dissolve into the correct type packs, carrying the theme on
  a tag/field.
- named individuals / reinforcements / mounts inside `actors-bestiary` → split
  into `actors-npcs` (as `variantOf` the base class where one exists) /
  `-reinforcements` / `-mounts`.
- **errata packs** (`*-errata-*`) → **remove the pack entirely.** An applied
  published erratum is recorded by an **`errata: true` flag on the affected
  entity** (the corrected item lives in its normal type pack with the corrected
  values and the flag set), with the citation captured via the per-field `_source`
  provenance override where the grain matters.

Renaming/dissolving a pack means updating its `system.json` declaration, any
folder block, and every `Compendium.wh40k-rpg.<pack>...` UUID reference to it —
audit those before changing.

---

## Homebrew Pack Naming

Homebrew packs live under `homebrew/` and are named so the game-line flavour is
visible in the pack name itself.

```
homebrew/hb-<line>-<category>
homebrew/hb-generic-<category>
```

Rules:

- `hb-` marks the pack as homebrew (not official line content).
- `<line>` is one of the six system ids; use `hb-<line>-<category>` when the
  homebrew is locked to one line's mechanics or setting.
- use `hb-generic-<category>` for homebrew that is cross-line or homologated —
  content that follows the Homologation Model with a single shared identity
  variantized per line, so it has no single flavour.
- `<category>` mirrors the official pack category segment (e.g. `items-weapons`,
  `origins-backgrounds`). The same content-typed rules apply — no `stats-*`,
  originPath content uses `origins-*`.

Notes:

- a homebrew record that becomes homologated across multiple lines moves from its
  `hb-<line>-*` pack into the matching `hb-generic-*` pack.
- official content does **not** belong in any `hb-*` pack; if found there it is
  promoted into the correct official line pack, not left as a homebrew copy.

---

## Homologation Model

Homologated items use a single shared item identity across game lines.

- `name` is the canonical shared join key — do **not** variantize it; use the same
  `name` string for the same homologated item across all supported lines.
- a homologated item is **one canonical document** (one `_id`) that carries a
  variant container per authored line; it is distributed into the pack of **each
  line that publishes it as `raw`** by a whole-file `reference` stub (see *Whole-
  File Reference Format*). There is **no** cross-system pointer field: an item that
  is *also RAW* in another line is simply stubbed into that line's pack, and the
  resolved document already holds that line's variant data. **A stub is only valid
  where the resolved item is that line's own `raw` content** — a line for which the
  item is `homebrew` gets **no** stub and **no** `gameSystems` membership; its
  variant container activates only at runtime (see *No cross-line stubs into RAW
  material*).
- if two files represent the same underlying item, prefer whole-file `reference`
  stubs until their line-specific data diverges; when one line diverges, author
  that line's variant container on the canonical document rather than forking.
- coverage (which lines an item is authored for) is **derived**, not declared — it
  is the set of lines with a variant container plus the packs that hold a stub. Do
  not hand-maintain a parallel `gameSystems` membership list as the source of
  truth.

### Canonical location = newest *official* line

The canonical document physically lives in the pack of the **newest line that
publishes the item as official (RAW) content**. Among the lines with a
`provenance: "raw"` version, the most recent one's pack holds the canonical `_id`,
and every other line gets a whole-file `reference` stub into it.

**Homebrew ports do not move the canonical.** A line that only has a *homebrew
adaptation* of an item official elsewhere does **not** count as a publishing line
for canonical placement. Its adaptation rides on the canonical document as that
line's variant container with `source.<line>.provenance: "homebrew"`. (Content
official in *no* line — pure homebrew — is the only thing that lives in a
`homebrew/hb-*` pack.)

Shared identity fields stay plain values where possible (`name`, `_id`, `type`,
image/icon paths, stable identifiers). Line-dependent payloads are variantized.

---

## Homebrew Conversions

A **homebrew conversion** makes content that is official (`raw`) in one game line
playable in another line where it has no official printing — by adapting **the
intent of the source rules into the target system's rules and structure**, not by
copying numbers across incompatible systems. It is expressed entirely through the
existing variant + provenance machinery — there is no separate "conversion"
document or flag:

- the converted line gets its own **variant container** on the canonical document
  for every field whose rules differ (`description`, `grants`, `modifiers`, stat
  blocks, …), authored in that target line's idiom.
- that line's `system.source.<line>` carries **`provenance: "homebrew"`** (with a
  `url` citation where one exists), while the originating line keeps
  `provenance: "raw"`.
- coverage stays **derived** and **runtime-only** — the converted line is **NOT**
  stubbed into its own pack. It becomes reachable purely at runtime: when the
  canonical (origin-line) item is dragged or granted onto a character of the
  converted line, the active line resolves to that actor's line and the resolver
  collapses the document to that line's variant container. The resolver never
  consults a `reference` stub or the `gameSystems` list to do this.

For origin-path items the builder classifies each option: official (`raw`) in the
active line → no marker; homebrew in the active line but `raw` in another →
adapted-conversion badge (tooltip names the source line); homebrew with no `raw`
source anywhere → pure-homebrew badge. Authoring a target-line variant with
`provenance: "homebrew"` on a document that is `raw` elsewhere is all that is
needed — do **not** hand-set any display flag.

### No cross-line stubs into RAW material

**A whole-file `reference` stub pointing at another line's canonical item must
NEVER be created alongside a line's RAW material, and a cross-line item must NEVER
render under a line's RAW compendium material.** A stub belongs in a line's pack
only when the resolved item is that line's *own* `raw` content (genuine multi-line
RAW homologation). It must not be used to "publish" an item that is `homebrew` (a
conversion) for that line:

- the item lives in the pack of the line where it is `raw`, and lists there only —
  `gameSystems` (the per-line compendium **browser filter**) carries only the
  line(s) where it is RAW. Do **not** add a converted line to `gameSystems`; that
  surfaces the item in that line's RAW browser, which is exactly the leak this rule
  forbids.
- when the item is dragged/granted onto a character of another line, the active
  line keys off the *owning actor's* line (never `gameSystems`, never a stub) and
  the resolver renders that line's variant container. A line with no variant branch
  falls back to the RAW line's stats, so a homebrew branch never leaks onto sibling
  lines that merely own the canonical.
- the converted line therefore has **zero compendium presence** of its own for
  that item: no stub, no `gameSystems` membership, no `hb-*` copy. Its only
  footprint is the `homebrew` variant container + `source.<line>` provenance on the
  one canonical document.

---

## Variants

`system.variantOf` links an item to the standard / most-vanilla item it is a
variant of. It holds the Foundry UUID of that base item, or `""` when the item
**is** the base.

```json
"system": {
  "variantOf": "Compendium.wh40k-rpg.dh2-core-items-weapons.Item.<base-id>"
}
```

- a manufacturing **pattern** (a named production pattern of a base item) is just
  one kind of variant — there is **no** dedicated `pattern` field. The variant's
  identity lives in its own `name`; `variantOf` points back to the vanilla base.
- each variant is its **own** item (its own `name`, own `_id`), so it is unaffected
  by the exact-name+type merge rule — different variants never collapse into one
  another.
- the base/vanilla item carries `variantOf: ""`. Grouping is implicit: every item
  whose `variantOf` resolves to the same base — plus that base — is a variant
  family.
- `variantOf` is a shared identity field: **not** variantized, not provenanced. It
  is resolved at render time through `uuidNameCache`.
- the base item is still homologated across lines normally (one canonical doc,
  per-line variant containers); `variantOf` is orthogonal to the per-line axis.

---

## Specializations (SPEC philosophy — NOT variant items)

Specialized abilities — Weapon Training (X), Trade (X), Lore (X), Drive/Operate
(X), Linguistics (X), and any other "Skill (specialization)" /
"Talent (specialization)" — use the **SPEC philosophy**, the single model for
parameterized specializations. They are **NOT** exploded into one compendium
document per specialization, and they do **not** use the `variantOf` mechanism.

> **Invariant:** the base item's `name` never carries the specialization.
> `system.specialization` is the **sole carrier**. The composed display name
> ("Weapon Training (Shock)") is built **exactly once**, at render time, from base
> name + specialization.

Why SPEC and not variant items:

- **Open-ended specializations.** Trade / Lore / Language specializations are
  author- and table-defined — a player may invent a new one at the table. A
  parameter can hold a specialization that doesn't exist yet; a pre-authored
  variant document cannot.
- **Per-actor instances.** A character holds two Trade specializations at once,
  each with an independent per-actor rank — actor-owned entries, not compendium
  documents.
- **Fidelity.** The rules model these as one parameterized ability, not N distinct
  ones.

Authoring rules:

- the base compendium item carries the **bare ability name**; a trailing `(X)`
  placeholder ("Weapon Training (X)") is an accepted authoring marker that the
  runtime strips before composing from the specialization field. Its
  `system.specialization` stays `""`.
- **Never** author a per-specialization document, and **never** point `variantOf`
  from one specialization to another to fan a base ability across specializations.
  The boundary: pattern / stat divergence → its own item via `variantOf`;
  parameterized specialization → one base item + a `specialization` parameter.
- **Skills** enumerate their valid specializations in the skill item's
  `system.specializations` option list; the chosen specialization + rank live as a
  per-actor specialist-skill entry, never in the compendium.
- **References use the base item's UUID + the specialization as a qualifier**: a
  grant / origin-path step stores `{ "uuid": "<base-item-UUID>", "specialization":
  "<name>" }`, never a name-string match against the composed display name.

---

## Standard Cost Shape

All item compendium JSON uses the same top-level `system.cost` object: a native
acquisition field per line, plus a **line-asymmetric** `homebrew` block for
non-RAW valuations.

```json
system.cost = {
  "dh1": { "throneGelt": null },
  "dh2": { "influence": null,    "homebrew": { "requisition": null, "throneGelt": null } },
  "rt":  { "profitFactor": null, "homebrew": { "throneGelt": null } },
  "dw":  { "requisition": null,  "homebrew": { "throneGelt": null } },
  "bc":  { "infamy": null,       "homebrew": { "throneGelt": null } },
  "ow":  { "logistics": null,    "homebrew": { "throneGelt": null } }
}
```

The native field per line holds the rules-as-written acquisition value for that
line: `dh1.throneGelt`, `dh2.influence`, `rt.profitFactor`, `dw.requisition`,
`bc.infamy`, `ow.logistics`.

The per-line `homebrew` block carries homebrew/non-RAW valuations, but **which
keys exist differs by line** — a homebrew valuation that is already a line's
native currency, or that only makes sense in one line, is not duplicated:

- **`homebrew.requisition` exists only under `dh2`.** No other line carries it.
- **`homebrew.throneGelt` exists under every line except `dh1`.** It is the
  civilian gelt market baseline; `dh1.throneGelt` is *already* DH1's native value.
- **`dh1` therefore has no `homebrew` block at all** — only its native
  `throneGelt`.

Rules:

- use `null` for undefined or unauthored values.
- the native field is RAW only — never put a non-RAW or converted value there; park
  non-RAW legacy numbers in that line's `homebrew` block instead.
- do not add `homebrew.requisition` to any line but `dh2`; do not add a `homebrew`
  block to `dh1`.
- do not use the legacy `system.cost.value` / `system.cost.currency` fields, and
  do not flatten cost values back into a shared cross-line field.

---

## Whole-File Reference Format

Pack source files in `_source/` may be authored in one of two formats:

1. A full Foundry document JSON object.
2. A reference stub — `reference` alone (a byte-identical share), OR `reference`
   plus an **identity/presentation override set** (a shared body with a local
   name / id / art):

```json
{ "reference": "../other-pack/_source/some-item.json" }
```

```json
{
  "reference": "../../../dark-heresy-2/dh2-core-items-weapons/_source/base-item_<id>.json",
  "_id": "<own 16-char id>",
  "name": "<local name over the shared body>",
  "img": "systems/wh40k-rpg/..."
}
```

Reference rules:

- the file must contain the `reference` key and MAY additionally carry any of the
  **override keys `name`, `_id`, `img`** — nothing else. The build merges the
  overrides OVER the resolved body; the validator (`STUB_OVERRIDE_KEYS`) warns on
  any other extra key.
- the override merge is a **shallow top-level spread**, so `name`/`_id`/`img`
  replace cleanly but **`system` cannot be deep-patched** — a `system` key on a
  stub would replace the *entire* referenced body. To share stats but diverge a
  single stat field, author a real document with a per-line variant container (or
  `variantOf`), not a stub.
- override `_id` when the stub is a **distinct item** riding a shared body (its own
  identity + UUID); omit `_id` to inherit the target's (a true byte-identical
  alias).
- the target may be **relative** to the referencing file, or rooted at the active
  pack tree with `packs/<group>/<pack>/…` or `src/packs/<group>/<pack>/…` (both
  resolve within the pack root currently being built — `src/packs` or
  `src/packs-private`).
- the referenced file may itself be another reference stub; circular references are
  invalid.

Build behavior:

- `gulp packs` resolves the reference chain before writing the compendium document.
- the resolved document is written as `{ ...resolvedTargetBody, ...overrideKeys }`
  — the referenced JSON copied into place, then the stub's `name`/`_id`/`img`
  applied on top.
- this is a pack-authoring feature, not an alternate Foundry runtime shape — after
  compilation Foundry receives a normal expanded document object.

---

## Variantized Fields

Any field whose content can differ by game line is authored as a per-line variant
container. This includes: `system.description`, `system.source`, `system.effect`,
`system.notes`, `system.cost`, gear payload fields (`category`, `consumable`,
`uses`, `duration`), skill rules content (`exampleDifficulties`,
`exampleAdditionalUses`), backpack/container fields (`capacity`, `isCombatVest`),
weapon/armour/ammunition stat blocks and their support fields, cybernetic rules
payloads, force-field stat blocks, modification payloads, and any other line-
dependent rules text or mechanics.

In short: lore text, acquisition data, and rules data are all variantized. Only
shared identity and structurally universal metadata stays non-variant.

### Variant Container Convention

Use per-line keyed objects with the six system ids: `dh1`, `dh2`, `rt`, `dw`,
`bc`, `ow`. The resolver collapses any line-keyed container to the active line
**before** the DataModel validates, so **every variantizable field — including
stat blocks (`grants`, `modifiers`, weapon/armour/ammo stats) — may be authored
per-line**. This is the mechanism behind both homologation and game-line homebrew
conversion.

```json
system.description = {
  "dh1": { "value": "", "chat": "", "summary": "" },
  "dh2": { "value": "", "chat": "", "summary": "" },
  "rt":  { "value": "", "chat": "", "summary": "" },
  "dw":  { "value": "", "chat": "", "summary": "" },
  "bc":  { "value": "", "chat": "", "summary": "" },
  "ow":  { "value": "", "chat": "", "summary": "" }
}
```

For an unauthored line: use `null` for scalar values, empty strings only where the
field shape requires a concrete string payload; do not invent cross-line values
just to fill space.

### Stats Must Also Be Variantized

For homologated items, line-specific stats must not be stored as one shared
canonical block if the rules can differ by system — weapon damage / penetration /
range / rof / clip / reload / qualities / class, armour points / coverage /
protection / max-agility, ammunition modifiers, gear categories and usage pools,
backpack capacity, cybernetic locations and effects, force-field protection and
overload behavior, modification restrictions and granted modifiers. If a stat can
differ by line, it belongs inside a variant container.

### Book Variants (intra-line stat divergence)

The same publisher sometimes prints the **same item with different stats in
different books of the *same* line**. A field that diverges by book is authored as
a **book-variant container** — a second variant axis nested inside (or used
independently of) the per-line axis:

```json
system.damage = {
  "dh2": {
    "__canonical": "core",
    "__books": {
      "core": "1d10+3",
      "<supplement-slug>": "1d10+5"
    }
  },
  "dh1": "1d10+2"
}
```

Shape:

- `__books` — required object keyed by **book slug**, each value being that book's
  stat for the field.
- `__canonical` — the book slug whose value is used at runtime (the primary). When
  absent or unresolved, the first defined book wins.

Rules:

- a book-variant container holds **only** `__books` + `__canonical`; the `__`-prefix
  keeps it distinct from line keys and ordinary payloads.
- it may sit **directly** under a field (single-line item, multiple books) or
  **inside a per-line branch** (`system.damage.dh2.__books…`); the resolver
  collapses line → canonical book before schema validation.
- every book's value is **retained on disk** — never discard a divergent printing;
  mark one canonical and keep the rest.
- only use it where the books genuinely differ; a single-source field stays a plain
  value.

### Stateful Fields Live Under `system.state`

Transient runtime state — the mutable state minted when an item is owned by an
actor — is **shared** (never variantized) **and** lives under a dedicated top-level
`system.state` object, not jammed in beside line-authored metadata.

```json
system.state = {
  "equipped": false,
  "stowed": false,
  "inBackpack": false,
  "inShipStorage": false,
  "container": "",
  "activated": false,
  "overloaded": false,
  "clip": { "value": 0 }
}
```

Rules:

- state is **never** variantized (same shape across every line) and **never**
  provenanced (it is not authored rules content).
- do **not** place these fields directly under `system.*` (the legacy layout);
  they belong under `system.state.*`.
- line-authored rules content (damage, qualities, capacity, overload *thresholds*,
  etc.) is **not** state — it stays in its variant container. Only the live,
  mutable value (`activated`, `clip.value`) is state.

### Skill Example Fields

Skill items (`type: "skill"`) carry two line-specific rules-content fields in
addition to `uses`. Both are **variantized** — authored as per-line keyed
containers and collapsed to the active line before the flat skill DataModel sees
them. The per-line branch holds the field's payload (an **array**), not a
`{ value, chat, summary }` object:

```json
system.exampleDifficulties = {
  "dh2": [
    { "difficulty": "Easy",      "modifier": 30,  "example": "<plain-text example for this band>", "specialization": "" },
    { "difficulty": "Very Hard", "modifier": -30, "example": "<plain-text example for this band>", "specialization": "" }
  ],
  "rt": null
}
system.exampleAdditionalUses = {
  "dh2": [
    { "name": "<use label>", "description": "<additional-use prose>" }
  ],
  "rt": null
}
```

**`exampleDifficulties`** — the skill's example-modifiers table. Each row pairs a
difficulty band `name` with its test `modifier`; author both from the standard
DH2e ladder:

| modifier | band        | | modifier | band       |
| -------- | ----------- |-| -------- | ---------- |
| `+30`    | Easy        | | `-10`    | Difficult  |
| `+20`    | Routine     | | `-20`    | Hard       |
| `+10`    | Ordinary    | | `-30`    | Very Hard  |
| `0`      | Challenging | |          |            |

(The fuller ladder — `+60` Trivial … `-40` Punishing — applies if a row needs it.)
`example` is the plain-text example for that band; `specialization` is blank for
basic skills, or tags a row when a specialist skill prints a separate table per
specialization (so all sub-tables coexist in one array and the sheet groups by the
label).

**`exampleAdditionalUses`** — the "special use" / additional-use prose a skill
specifies. Narrative and non-rollable (distinct from the structured, individually-
rollable `system.specialUses`). Each row is `{ name, description }` (HTML string).

Leave a line's branch `null` until that line's content is authored; do not copy one
line's values into another.

---

## Source & Provenance

`system.source` is a per-line keyed object (one of `dh1`/`dh2`/`rt`/`dw`/`bc`/
`ow`). Each entry is a **structured provenance record** for that line's authored
payload — "where did this line's data come from, and is it official or homebrew?"

```json
system.source = {
  "dh2": { "provenance": "raw", "book": "<Book>", "page": "<n>", "errata": true },
  "rt":  { "provenance": "raw", "book": "<Book>", "page": "<n>" },
  "ow":  { "provenance": "homebrew", "url": "https://…/houserules#<anchor>" }
}
```

Shape:

- `provenance` — required enum: `raw` (rules-as-written from a source book) |
  `homebrew` (authored, non-RAW) | `derived` (converted/normalized from another
  line's data).
- `book`, `page` — used **only** with `provenance: "raw"` (the official citation).
  Strings.
- `url` — optional on any provenance, but primarily the homebrew/derived citation.
- `derivedFrom` — optional, only with `provenance: "derived"`: the line id this
  entry was converted from, for auditing.
- `errata` — optional boolean (default `false`): `true` when this line's data
  incorporates published errata corrections. Per-line; valid on any provenance.

Rules:

- the per-line key already encodes the system — do **not** add a `system` field
  inside an entry.
- `raw` entries carry `book` + `page` and **no** `url`; `homebrew`/`derived`
  entries carry **no** `book`/`page` (`url` is optional).
- `errata` is independent of provenance.
- the legacy `custom` field and bare-string `source` values are deprecated —
  migrate them into the structured per-line shape.
- presence of a `source.<line>` entry marks that line as authored; a line with no
  entry is simply not authored yet.

### Per-field provenance override

Provenance is recorded at the per-(line, item) grain. The rare case where a single
field of a line has different provenance (e.g. an errata-added quality on an
otherwise-RAW item) is handled by an **optional** `_source` override inside that
field's variant container, using the same shape:

```json
system.qualities = {
  "ow": { "value": ["<quality-slug>"], "_source": { "provenance": "homebrew", "url": null } }
}
```

When present, a field's `_source` wins over `system.source.<line>` for that field
only. Omit it in the normal case.

---

## RAW Fields

These fields use the native acquisition vocabulary of each line and are line-
specific authoring targets — not interchangeable, not inferred from one another:
`system.cost.dh1.throneGelt`, `system.cost.dh2.influence`,
`system.cost.rt.profitFactor`, `system.cost.dw.requisition`,
`system.cost.bc.infamy`, `system.cost.ow.logistics`.

### Legacy Cost Caveat

The legacy `system.cost.value` / `system.cost.currency` fields have been migrated
out of all `_source/` JSON. Rules going forward:

- do **not** convert legacy line-agnostic prices into RAW native fields; unmapped
  legacy numbers live in the line's `homebrew` block.
- if a line has not been explicitly authored into the RAW-first cost schema, leave
  its native RAW branch `null`.
- stats, descriptions, and other rules payloads may still be homologated even when
  that line's cost branch remains unresolved.

---

## DH2 Authoring

For the canonical default line (`dh2`), the currently authored cost fields are
`system.cost.dh2.influence`, `system.cost.dh2.homebrew.requisition`, and
`system.cost.dh2.homebrew.throneGelt`. All other `system.cost.*` fields stay
`null` in DH2 content until those lines are homologated.

- **`system.cost.dh2.influence`** — the normalized DH2 acquisition baseline: the
  approximate Influence needed to reasonably secure the item through the contacts,
  patronage, and institutional reach DH2 acquisition play assumes. It is an
  authored abstraction for parsing/validation, not a printed per-item field.
- **`system.cost.dh2.homebrew.throneGelt`** — the canonical homebrew civilian-
  market baseline: what an average citizen would pay via the most direct plausible
  acquisition path, assuming a typical market. Do **not** encode local scarcity,
  world/city modifiers, or campaign markups here.
- **`system.cost.dh2.homebrew.requisition`** — the canonical homebrew requisition-
  channel baseline (a standard sanctioned supply channel). Excludes burned
  Influence, favors, scarcity, and situational adjustments. **DH2-only.**

---

## Canonical Schema & Build Validation

The shape described in this file is the **canonical item schema**. A build-time
validator checks every `_source/*.json` against it and **warns** (never fails the
build) on any deviation, so the warning output doubles as the migration worklist
while legacy-shaped files keep building.

- validator: `src/packs/validate-schema.cjs`
- run standalone: `pnpm packs:validate` (add `--verbose` for the per-file list;
  default output is a grouped summary by rule).
- it also runs automatically during `gulp packs` / `pnpm packs` in warn-only mode.
- to validate the private content root, point the validator at it, e.g.
  `WH40K_PACKS_SRC=src/packs-private pnpm packs:validate`.

What it checks (each a separate warning rule):

- **identity** — `name` non-empty, `_id` and `type` present.
- **reference stubs** — a stub carries `reference` plus at most the override keys
  `name` / `_id` / `img`.
- **cost** — matches the asymmetric *Standard Cost Shape* (no `homebrew` on `dh1`;
  `homebrew.requisition` only on `dh2`; no legacy `value` / `currency`).
- **state** — transient state lives under `system.state`, not flat on `system.*`.
- **variantization** — variantizable lore/stat fields are per-line keyed
  containers, not flat values.
- **provenance** — `system.source.<line>` entries match the *Source & Provenance*
  shape.
- **variants** — `system.variantOf`, when set, is a Foundry UUID (or empty).
- **reference graph** — every `Compendium.wh40k-rpg.<pack>.<Class>.<id>` UUID a
  document references (a structured field, an embedded item's
  `_stats.compendiumSource`, an adventure scenario UUID, or an inline `@UUID[…]` /
  `{{Compendium.…}}` token) is dereferenced against a `pack → Set<_id>` index built
  from every source document (reference-stub chains resolved to their real `_id`).
  A UUID whose target is absent warns `reference-unresolved`; a UUID naming a pack
  with no documents warns `reference-unknown-pack`.

When the canonical schema changes, update both this file **and** the validator's
rule tables in the same change.

Companion validators (also run against either pack root):

- `pnpm packs:validate:actors` (`src/packs/validate-actors.cjs`) — actor-
  completeness gaps the schema validator does not cover (see *Actor statblock &
  inventory references*, *NPC Trained Skills*).
- `pnpm packs:validate:images` (`src/packs/validate-images.cjs`) — image-coverage
  report per document class (see *Artwork & Tokens*).

---

## Actor statblock & inventory references

An actor's own inventory **references compendium items by UUID** — it is **not**
flat re-typed text and **not** an uncredited embedded copy. The canonical weapon /
talent / trait already lives once in its item pack; the actor points at it, the
same way origin grants and adventure encounters do, and resolves at render time
through `uuidNameCache`.

Per the NPC DataModel (`src/module/data/actor/npc.ts`):

- **weapons** — `system.weapons.mode` ∈ `'simple' | 'embedded'`. Use
  **`'embedded'`** whenever the weapon exists in a compendium: it rides as a
  Foundry embedded Item in the actor's `items[]`, stamped with
  `_stats.compendiumSource = "Compendium.wh40k-rpg.<pack>.Item.<id>"`. Reserve
  **`'simple'`** (inline text, no link) only for genuinely unique / natural weapons
  with no compendium entry — and prefer authoring those into the line's items pack
  and linking instead.
- **talents / traits / gear / ammo / consumables / cybernetics** — embedded
  `items[]` of the matching type, each carrying `_stats.compendiumSource` into the
  corresponding `<line>-<book>-items-*` pack. Never text in a description, never
  pseudo-rows in `system.weapons`.
- **skills** — authored as the structured `system.trainedSkills` sparse map, never
  as linked items and never as prose alone (see *NPC Trained Skills*).

**Embedded items are LEAN join keys; the RUNTIME joins the body IN MEMORY.** The
canonical item data lives once, on the compendium item. An actor's embedded item
(world OR pack) stores only `_stats.compendiumSource` (or `system.variantOf` + the
variant name) plus the per-actor fields (`specialization`, `level`,
equipped/quantity state, XP `cost`). The compendium→world join
(`src/module/compendium-hydrate.ts`) deep-merges the canonical body under each lean
overlay at load/import/render time via `updateSource` + `reset()` — always in
memory, never writing the database — so the stored record stays lean, persisted
per-actor fields win the merge, and a compendium edit propagates to every actor on
the next load with zero writes. Never bake full item copies into the pack source.

**ID discipline.** Resolve every item name through a `name → {uuid, type, pack}`
index built from the compendia (normalized for spelling variants). An unresolved
name is a **review-queue** item (link-to-existing vs author-new), **never** a
guessed UUID. Per-line scoping is mandatory — a shared ability name exists in
several lines with different UUIDs; scope lookups by the actor/item's owning line
(pack prefix `dh1`/`dh2`/`bc`/`dw`/`ow`/`rt`).

---

## NPC Trained Skills

**`system.trainedSkills` is the authored source of truth for every NPC's skills.**
It is the only skill field in the NPC schema and the only one the sheet reads. An
actor whose skills exist solely as a prose `system.skills` line has **no skills at
runtime** the moment that prose fails to parse.

### Skills are ADVANCEMENTS, not flags

NPC skills are authored in the **same advancement shape PCs use**
(`CreatureTemplate.SkillField`), so a GM can advance an NPC exactly as a player
advances a character. The persisted datum is the **rank integer `advance` (0–4)**;
the boolean flags are *derived*. An NPC has no origin path, so `advance` *is* the
effective rank — the printed statblock rank is authored directly as `advance`.

| Printed | `advance` | `trained` | `plus10` | `plus20` | `plus30` |
| --- | --- | --- | --- | --- | --- |
| *(absent)* | `0` | `false` | `false` | `false` | `false` |
| skill (Known) | `1` | `true` | `false` | `false` | `false` |
| skill +10 | `2` | `true` | `true` | `false` | `false` |
| skill +20 | `3` | `true` | `true` | `true` | `false` |
| skill +30 | `4` | `true` | `true` | `true` | `true` |

### Shape

A **sparse** map — only the skills the NPC actually has:

```json
"trainedSkills": {
  "awareness": {
    "name": "Awareness", "characteristic": "perception",
    "advance": 2,
    "trained": true, "plus10": true, "plus20": false, "plus30": false, "bonus": 0
  },
  "commonLore": {
    "name": "Common Lore", "characteristic": "intelligence",
    "advance": 0,
    "trained": false, "plus10": false, "plus20": false, "plus30": false, "bonus": 0,
    "entries": [
      { "name": "<Spec A>", "specialization": "<Spec A>", "characteristic": "intelligence", "advance": 3, "bonus": 0 },
      { "name": "<Spec B>", "specialization": "<Spec B>", "characteristic": "intelligence", "advance": 1, "bonus": 0 }
    ]
  }
}
```

- **key** — the catalogue skill key (`awareness`, `techUse`, …). For a specialist
  skill (Common Lore, Forbidden Lore, Scholastic Lore, Linguistics, Trade,
  Navigate, Operate) the key is the **base** skill and each specialization is a row
  in **`entries[]`**, each with its own `advance`.
- **`advance`** — integer 0–4. On a specialist base skill the base `advance` is `0`
  unless the statblock prints the bare skill itself; the ranks live on `entries[]`.
- **`name`** — display name (bare skill on the base row, specialization on an
  `entries[]` row).
- **`specialization`** — on `entries[]` rows only; used to match origin grants and
  compose the display name.
- **`characteristic`** — the **full** characteristic key (`perception`,
  `intelligence`, …), never the short form. **Always author it explicitly** — some
  skills legitimately map to different characteristics per line, and an explicit
  value makes the actor correct regardless of which line's catalogue is active.
- **`bonus`** — a flat situational modifier, `0` in almost every case. It is *not*
  the training ladder.
- **derived boolean mirrors** (`trained`/`plus10`/`plus20`/`plus30`) are written
  alongside `advance` and are **cumulative** (`+20` sets both `plus10` and
  `plus20`). Author them to agree with `advance`; `advance` is the source of truth.

Authoring rules:

- **Use the line's own skill list.** Lines fold and rename skills differently;
  authoring an out-of-line skill name mints a garbage key that resolves to no
  characteristic and renders nowhere.
- **Never author a talent as a skill.** Talents belong in `items[]` as UUID-linked
  embedded items.
- **No placeholders.** "Any one skill" is not a skill; pick the concrete skill the
  role implies or omit the entry. A RAW choice is resolved to one concrete option
  at author time, with the alternative noted in prose.
- **Two specializations of one skill collide on the base key.** When the book
  prints them together with one advance, author a single entry whose `name` carries
  both. Only when they genuinely differ in rank do they need separate entries,
  keyed `<skillKey>:<spec-slug>`.
- **Vehicles, ships and mindless constructs carry no `trainedSkills`** — an empty
  map is correct there, not a coverage gap.

The prose `system.skills` line is **not in the schema** — keep it as the verbatim
citation of the printed statblock line (the audit trail), but it is **never** the
mechanical truth; the structured map wins.

---

## NPC Advancement — aptitudes and spawn XP

An NPC is a **buildable character**, not a frozen stat block: its skills, talents,
characteristics and psychic powers are all *advancements*, and its XP at spawn is
**exactly the XP required to purchase them** — so a GM can keep advancing it
through the normal Advancement Dialog. This layer is gated behind the
`npcAdvancement` world setting; with it off, NPCs behave as flat stat blocks.

### What is authored vs. what is derived

**Only `trainedSkills` is authored.** Aptitudes, the characteristic split, and the
XP ledger are computed at prepare time, so they can never drift from the stat
block. Do **not** hand-write them into pack JSON.

| Field | Authored? | Where it comes from |
| --- | --- | --- |
| `system.trainedSkills` | **yes** | the printed skills line |
| `characteristics.<k>.base` / `.advance` | optional | split from the printed total when absent |
| `system.aptitudes` | no | derived from the stat block (an authored set wins if present) |
| `experience.used` | no | derived: the exact cost of every advance the NPC has |
| `experience.total` | no (seeds itself) | adopts `used` at spawn; GM raises it to grant XP |

- **`system.aptitudes`** are derived from the stat block (scoring every aptitude by
  how much of *this* NPC's own build it would pay for, keeping the highest eight;
  ties break alphabetically for stability). An explicitly authored `aptitudes`
  array wins, for the rare NPC whose text names them outright — never author one
  merely to force a cheaper cost.
- **`experience.used`** is the exact cumulative sum of every advancement's cost,
  priced through the line's cost tables against the NPC's aptitudes (a skill at
  `advance: 3` costs rank1 + rank2 + rank3). `total` seeds to `used` at spawn, so a
  freshly imported NPC shows **0 available** — a legal, fully-built character.

The printed stat block stays the source of truth throughout; if a derived number
looks wrong, fix the stat block, never hand-patch the derived output.

---

## Artwork & Tokens

Actors carry TWO art references at different aspect ratios; items carry one.
Curated art (`systems/wh40k-rpg/images/**` or an `https://` hotlink) is **never
overwritten** by any tool; only defaults (`icons/**`,
`systems/wh40k-rpg/icons/**`, generic placeholder icons) are replaceable.

**Image coverage is a one-way ratchet across all entity types.**
`validate-images.cjs` grades every pack document's `img` as real art (a
`…/images/**` asset or an `https://` hotlink) or a replaceable default, and counts
the real-art documents **per Foundry document class** (Actor, Item, JournalEntry,
Adventure). RollTables are **art-exempt** — their Foundry default icon is the
correct final state. `pnpm images:ratchet` enforces that each class's covered
count may only RISE — an adoption ratchet (opposite direction to the defect
ratchets). Adding new, legitimately un-arted content never trips it; only losing
art does. Because coverage is bounded by source-art availability, no class
graduates to strict; re-baseline upward with `pnpm images:ratchet:update`.

- **Portrait** (`img`): the full illustration, native aspect. Local art lives under
  `src/images/bestiary/<line>/<slug>.webp` (actors) or
  `src/images/items/<line>/<slug>.webp` (items); external art is **hotlinked** (the
  CDN URL is stored as `img`, nothing downloaded).
- **Token** (`prototypeToken.texture.src`): the SAME image as `img` — actors do not
  ship a separate baked bust file. The system GPU-masks a circular bust from the
  portrait at draw time when the token carries
  `prototypeToken.flags.wh40k-rpg.tokenFrame = {cx?, cy?}` (the bust centre in the
  source, 0–1 fractions) and `prototypeToken.ring.enabled: true`. With the ring
  enabled the runtime crops to **75% content**, so a full-bleed source never covers
  the Dynamic Ring band (never set `ring.subject`). `cx` defaults to `0.5`, `cy` is
  head-biased (~`0.3`). Cross-origin portraits load untainted when the host serves
  `access-control-allow-origin: *` and Foundry requests with
  `crossOrigin=anonymous`.

### Actor authoring conventions (schema-relevant)

- **NPC tier is a field, never the name.** Tier → `system.tier` (the sheet
  dropdown); threat → `system.threatLevel`. Strip any `(Tier)` suffix from the
  actor name.
- **A dash characteristic → `0`** (it means "cannot test", not missing). Reject
  superscript/column-bleed misreads (a beast with a BS of `3` where the page shows
  a dash).
- **Size → numeric `system.size`** (`config.ts WH40K.sizes`, 1 Miniscule … 4
  Average … 8 Immense); the runtime maps the number to its label. Size is **not** an
  inventory item.
- **Weapon qualities live on the weapon** (`weapon.system.special` / the NPC
  weapon's `qualities`), never as standalone talent/trait items.
- **Talent / trait / psychicPower cost is XP** (a number or per-line `{line: xp}`
  map), **never** the acquisition-currency object; the schema validator skips the
  currency-shape check for these types.
- **Affliction types carry NO cost at all** — `malignancy`, `mutation`, and
  `mentalDisorder` are gained from Corruption/Insanity, never acquired; their
  DataModels have no `system.cost`. Their packs are
  `<line>-<book>-items-malignancies` / `-mutations` / `-mental-disorders`.
- **Never merge distinct base-vs-variant statblocks** into one actor — they are
  separate documents (see *Cross-line same-name actors* and *Variants*).

---

## Adventures

Official adventure books (and homebrew scenarios) ship as Foundry **Adventure**
documents — a bundle of Scenes, Actors, Items, JournalEntries, RollTables and
Folders that imports as a unit.

- **One pack per line, bookless:** `<line>-adventures`. The *book is the Adventure
  document entry*, not the pack (the second naming exception, with RollTables). The
  book↔Adventure relation is **not** bijective — see *Anthology vs. campaign* below.
- **Content is referenced, never duplicated.** NPCs, weapons, gear an adventure
  introduces are authored the same way as content-only books — in the normal
  `<line>-<book>-actors-*` / `-items-*` packs with full source/provenance, cost,
  and variant shape — and the Adventure links them by **Compendium UUID**.

| Book element | Foundry document | Authored in | Adventure links via |
| --- | --- | --- | --- |
| NPC / enemy stat block | Actor | `<line>-<book>-actors-*` | UUID |
| New weapon / gear / etc. | Item | `<line>-<book>-items-*` | UUID |
| Map | Scene | the Adventure | embedded scene |
| Handout / player doc | JournalEntry page | the Adventure | embedded, permissioned |
| Random table | RollTable | `<line>-<book>-rolltables` | UUID |

GM-only vs player-facing handouts use Foundry JournalEntry **permission** levels
(GM-only ↔ Observer).

### Anthology books vs. multi-act campaigns

A single source book may hold more than one adventure. The two shapes resolve
differently — and **neither touches the book slug** (one book = one slug):

- **Anthology** — one book printing several *standalone, unconnected* scenarios →
  **N Adventure documents in the one `<line>-adventures` pack**, one per scenario,
  each its own `_id` / `name` and its own scenario scene graph. The slug is **not**
  suffixed per scenario; the per-scenario handle lives on the scenario `id`.
- **Multi-act campaign** — one book printing several *linked* acts of a single arc
  → **one** Adventure document; the parts are modelled inside its scene graph via
  `act`, `transitions[]`, and `leads[].revealsSceneId`. Do **not** split a campaign
  into multiple Adventures.

All Adventure documents from one book carry the same `scenario.source.book` string
(differing only by `page`); tooling regroups them under one book heading by that
string. `source.book` is the grouping key, not a uniqueness constraint.

### Scenario schema

The GM-facing scenario flow is machine-readable, stored on the adventure's GM
**JournalEntry page** under `flags['wh40k-rpg'].scenario`, so investigation / quest
tooling consumes official adventures the same way as homebrew content:

```jsonc
flags['wh40k-rpg'].scenario = {
  "id": "<adventure-handle>",            // stable per-adventure handle, unique within the line
  "source": { "provenance": "raw", "book": "<Book>", "page": "<n>" },
  "act": 1,
  "subtletyTier": "moderate",            // optional difficulty/exposure hint
  "entrySceneId": "<scene-id>",
  "scenes": [
    {
      "id": "<scene-id>",
      "name": "<scene name>",
      "type": "investigation",           // investigation | combat | social | travel | set-piece
      "sceneUuid": null,                 // Compendium UUID of a mapped Scene, if any
      "readAloud": "<p>Boxed read-aloud text…</p>",
      "gmNotes": "<p>GM-only context…</p>",
      "checks": [
        { "id": "<check-id>", "skill": "awareness", "characteristic": "perception",
          "difficulty": -10, "success": "<outcome>", "partial": "<outcome>", "failure": "<outcome>" }
      ],
      "encounters": [
        { "actorUuid": "Compendium.wh40k-rpg.<line>-<book>-actors-npcs.Actor.<id>", "count": 3, "disposition": "hostile", "tactics": "<tactics>" }
      ],
      "leads": [
        { "text": "<lead prose>", "revealsSceneId": "<scene-id>", "requiresCheckId": "<check-id>" }
      ],
      "rewards": [
        { "xp": 200, "itemUuid": "Compendium.wh40k-rpg.<line>-<book>-items-gear.Item.<id>", "currency": { "key": "throne", "amount": 500 }, "influence": 1 }
      ],
      "transitions": [ { "toSceneId": "<scene-id>", "condition": "<condition>" } ]
    }
  ]
}
```

- **`id`** — a stable per-adventure handle, unique within the line. For anthology
  books it carries the per-scenario suffix; for a single-adventure book it is just
  the book slug. Never folded into the pack name or book slug.
- **`source`** — the same provenance shape as item `system.source`.
- **`scenes[]`** form a directed graph: `entrySceneId` is the start; `transitions[]`
  and `leads[].revealsSceneId` are edges.
- **`checks[]`** are skill/characteristic tests with the difficulty modifier and
  per-outcome text (`success`/`partial`/`failure`).
- **`encounters[].actorUuid`**, **`rewards[].itemUuid`**, and mapped **`sceneUuid`**
  hold Compendium UUIDs into the line's content packs — resolved at runtime, never
  duplicated.
- **`rewards[].currency.key`** is a `CONFIG.wh40k.currencies` key (the currency
  registry is documented in `docs/VALUATION.md`).
