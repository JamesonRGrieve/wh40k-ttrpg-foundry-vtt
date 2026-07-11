# Cogitator Terminal

An in-fiction **data-terminal** for browsing a curated set of record documents as
permission-gated, cross-linked pages — a Dark-Heresy cogitator / data-slate.

It is **content-agnostic** (Direction #7): the system code hard-codes no records.
A terminal is opened against whatever Items a GM (or an importer) groups together,
and it renders each Item's description as a "record". This makes it reusable for
any archive — medicae files, Administratum dossiers, Mechanicus logs, a ship's
memory core — across all seven game lines.

## What it does

- **Index + body.** A left rail lists the records; selecting one shows its body
  (the Item's `system.description.value`, enriched so `@UUID[…]` links resolve).
- **Cross-linked pages.** A link inside a record that points at *another record in
  the same terminal* turns the page **in-place** (hypertext). A link to anything
  else falls through to Foundry's default handler (opens that document's sheet).
- **Access gating.** A record the viewing user cannot read (< `OBSERVER`) is listed
  as a **`▓ RESTRICTED ▓`** placeholder and its body shows a sealed / access-denied
  notice — the "the file exists, you are not cleared for it" beat. Grant the user
  permission on that Item and it opens; no separate mechanic required. Pass
  `hideRestricted: true` to omit locked records from the index entirely instead.

## Architecture (3-layer)

| Layer | File | Responsibility |
| --- | --- | --- |
| **Logic** (pure, unit-tested) | `src/module/applications/cogitator/cogitator-records.ts` | Build the index, resolve the active record, decide internal-vs-external links. Framework-free — no Foundry import. |
| **Application** | `src/module/applications/cogitator/cogitator-terminal.ts` | `ApplicationV2` shell: resolves Items, computes per-record access via `Document#testUserPermission`, enriches the body, intercepts cross-link clicks. |
| **Template** | `src/templates/applications/cogitator-terminal.hbs` | Terminal chrome (index rail + body pane), inline Tailwind, `<id>:tw-*` per-line accent. |

All player-facing strings live under `WH40K.Cogitator.*` in `src/lang/en.json`.

## Opening a terminal

Via the system API (`game.wh40k.openCogitator`), from a macro, a scene Note's
click behaviour, or a chat button:

```js
// From an Item Folder (the ergonomic path — drop the record Items into one folder):
game.wh40k.openCogitator({ folderId: game.folders.getName('Medicae Archive').id, title: 'Medicae Archive Cogitator' });

// From an explicit list of record UUIDs:
game.wh40k.openCogitator({ recordUuids: ['Item.abc…', 'Item.def…'], activeUuid: 'Item.abc…' });
```

**Options** (`CogitatorTerminalOptions`):

| Option | Meaning |
| --- | --- |
| `folderId` | Item Folder whose contents are the records. |
| `recordUuids` | Explicit record Item UUIDs (usable with or instead of `folderId`; deduped by UUID). |
| `activeUuid` | Record to open on launch; omit for the landing screen. |
| `title` | Window / header title (e.g. a specific archive name). Defaults to the localized generic title. |
| `hideRestricted` | Drop records the viewer cannot read from the index instead of listing them `RESTRICTED`. |

### Wiring it to the map

Put the record Items in a Folder, drop a **scene Note** on the relevant map
feature (a records alcove, a cogitator console), and set the Note's click action /
a bound macro to `game.wh40k.openCogitator({ folderId })`. The Note then *is* the
in-world terminal.

## Access = Foundry ownership

The terminal reads `Document#testUserPermission(user, OBSERVER)` per record. Map
your access fiction onto ownership:

- **Sealed / GM-only** → default ownership (players get `None`) ⇒ listed `RESTRICTED`.
- **Released to the party** → set the Item's default ownership (or a specific
  player's) to `Observer` ⇒ it opens. Flipping this at the table is the "record
  pulled / authorised" beat.
- **Two tiers** (summary vs full file) → two Items, one `Observer` (the summary)
  and one `None` until authorised (the full archive copy).

Because gating is pure ownership, it composes with everything Foundry already does
(per-user permissions, "show to players", etc.) and never leaks a restricted
record's body — the Application refuses to send it to the client.

## Campaign use — the Solenne medical records

The `dh-campaign` vault's medicae/records documents (`The Infertility Record`,
`The Transfer Record`, treatment / birth / death records, etc.) import as record
Items marked `is_private`. Group them into a **Medicae Archive** Item Folder; the
`is_private` ones stay GM-only (`RESTRICTED`) until the party earns access under
the Elevated Warrant, at which point you flip ownership to reveal them. Their
existing `[[wiki links]]` become `@UUID[…]` cross-links, so pulling one record
(the infertility finding) walks the players straight to the next (the transfer
record) inside the terminal — no duplication of the record text; the Items remain
the single source of truth.
