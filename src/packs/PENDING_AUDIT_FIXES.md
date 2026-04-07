# Dark Heresy 2E Supplement Audit

Date: 2026-04-06

Status:
- Active supplement-pack issues from the original audit have been actioned.
- Live-pack contamination, malformed supplement `_id` values, blank supplement weapon identifiers, and confirmed naming errors were fixed.
- Shared DH2 pack families now exist for elite advances, reinforcement actors, vehicles, and specialised talents.
- Mispacked or structurally invalid supplement entries were preserved under [_backups/dh2-supplement-quarantine](/home/jameson/Documents/dh-campaign/.foundry/src/packs/_backups/dh2-supplement-quarantine), except where they have now been moved into the new active family.

Resolved supplement actions:
- `dh2-within-items-backgrounds` contamination removed from active packs.
- Mispacked `Field Wall Generator` and `Mouldsuit` gear entries moved out of active packs.
- `Heaver Flamer` renamed to `Heavy Flamer`.
- `Harlequinn's Kiss` renamed to `Harlequin's Kiss`.
- `Cosecrated Scrolls` renamed to `Consecrated Scrolls`.
- Supplement background `_id` length issues fixed.
- `Enemies Without` weapon identifier and `_id` issues fixed.
- Added pack families:
  - [dh2-items-elite-advances](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-items-elite-advances)
  - [dh2-actors-reinforcements](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-actors-reinforcements)
  - [dh2-actors-vehicles](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-actors-vehicles)
  - [dh2-items-talents-specialisations](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-items-talents-specialisations)
- `Astropath` removed from live `dh2-beyond-items-backgrounds` and moved into the active [dh2-items-elite-advances](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-items-elite-advances) family.
- `Weapon Training` and `Resistance` moved into the active [dh2-items-talents-specialisations](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-items-talents-specialisations) family.

Remaining supplement work:
- `Enemies Within`: `Sister of Battle` elite advance content still needs to be authored into [dh2-items-elite-advances](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-items-elite-advances), and reinforcement-character actor entries still need to be authored into [dh2-actors-reinforcements](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-actors-reinforcements).
- `Enemies Without`: vehicle entries still need to be authored into [dh2-actors-vehicles](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-actors-vehicles), and reinforcement-character actor entries still need to be authored into [dh2-actors-reinforcements](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-actors-reinforcements).
- `Enemies Beyond`: additional elite-advance content still needs to be authored into [dh2-items-elite-advances](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-items-elite-advances), and reinforcement-character actor entries still need to be authored into [dh2-actors-reinforcements](/home/jameson/Documents/dh-campaign/.foundry/src/packs/dh2-actors-reinforcements).

This file now tracks unresolved work where content still needs to be authored, not missing pack structure.

## DH2 Core Fix Status

Date updated: 2026-04-06

### Completed this pass

- Corrected the DH2 psychic tables and added missing `Interrogation`.
- Corrected the explicit weapon and armour mismatches previously called out in this audit:
  - `Autocannon`
  - `Heavy Bolter`
  - `Eviscerator`
  - `Force Staff`
  - `Force Sword`
  - `Inferno Pistol`
  - `Meltagun`
  - `Warhammer`
  - `Chainmail Suit` (formerly `Chain Coat`)
  - `Conversion Field`
  - `Militarum Tempestus Carapace` (renamed from `Stormtrooper Carapace`)
- Quarantined confirmed non-core or duplicate DH2 core records under `_backups/dh2-core-audit-20260406`, including:
  - `Ignatus Power Armour`
  - `Rosarius`
  - `Mesh Combat Cloak`
  - duplicate `Fire Bomb`
  - duplicate talent and trait records listed in the earlier audit
- Moved `Ferric Lure Implants` from gear to cybernetics.
- Moved the misfiled special ammunition records from gear to ammo:
  - `Dumdum Bullets`
  - `Expander Rounds`
  - `Hot-Shot Charge Pack`
  - `Inferno Shells`
  - `Man-Stopper Rounds`
  - `Metal Storm Rounds`
  - `Tox Rounds`
- Added the missing `Displacer Field`.
- Backfilled missing DH2 core cybernetics so the pack now includes the audit roster entries rather than only mechadendrites.
- Backfilled the missing DH2 core weapons and tools from adjacent local source packs where suitable donors existed.

### Remaining caveats

- Some newly added DH2 core records were seeded from close local donor entries rather than a fresh page-by-page OCR transcription in this pass. The main cases to re-check later against the exact core-book wording are:
  - `Chainblade`
  - `Hunting Lance`
  - `Whip`
  - `Shock Whip`
- Three cybernetics were added as conservative minimal records because I did not complete an exact text/stat transcription for them in this pass:
  - `Bionic Legs`
  - `Bionic Respiratory System`
  - `Bionic Senses`
- Two gear entries were retained as conservative synthesized records pending a stricter OCR normalization pass:
  - `Combat Vest`
  - `Multi-Key`
- Several gear entries now use improved donor-backed data, but they should still be book-checked later if you want strict page-accurate DH2 wording for every description and note:
  - `Auto-Quill`
  - `Diagnostor`
  - `Grav-Chute`
  - `Lascutter`
  - `Magnoculars`
  - `Manacles`
  - `Psy-Focus`
