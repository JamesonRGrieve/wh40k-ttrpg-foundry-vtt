# Rogue Trader Gear & Combat Fields

This system update adds the Rogue Trader PDF tracking boxes to the acolyte sheet so the RT format can be recorded without breaking existing Dark Heresy 2e mechanics.

## Data model

All new RT-only values live under `system.rogueTrader.*` on actors that use the acolyte sheet.

- `system.rogueTrader.armour.{head,rightArm,leftArm,body,rightLeg,leftLeg}`: manual armour values by hit location. Labels match the RT d100 hit bands (Head 1–10, RA 11–20, LA 21–30, Body 31–70, RL 71–85, LL 86–100).
- `system.rogueTrader.weight.{total,current}`: total and current armour/gear weight fields.
- `system.rogueTrader.armourWeight`: total armour weight entry.
- `system.rogueTrader.lifting.{lift,carry,push}`: unchanged lifting trio from earlier RT support.
- `system.rogueTrader.wounds` and `system.rogueTrader.fate`: derived snapshots shown on the RT tab. Edits still write to the DH2e sources (`system.wounds.*`, `system.fatigue.value`, `system.fate.*`).
- `system.rogueTrader.acquisitions`: array of structured acquisition entries (name, availability, modifier, notes, acquired).

Existing DH2e armour calculations, wound/fate handling, and encumbrance remain the source of truth; the RT fields simply mirror or supplement them.

## Sheet layout changes

- **Rogue Trader tab** now includes armour-by-location inputs with d100 band labels, weight and lifting trackers, RT-formatted wound/fate/fatigue fields, and a structured acquisitions table (with add/remove controls) instead of the freeform textarea.
- **Weapon panel** now displays RT-relevant weapon stats in the expanded description: range, RoF, clip, reload, and special in addition to the existing damage/pen entries.

## Migration notes

If an actor previously stored `system.rogueTrader.acquisitions` as free text, the sheet displays that text in the notes field of a single acquisition row so it can be saved without losing information.
