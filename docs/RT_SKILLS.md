# Rogue Trader Skill Model

The Rogue Trader skill list replaces the previous Dark Heresy 2e layout. Skills use the RT defaults for their characteristics and
training tiers (untrained, Basic, Trained, +10, +20) plus an optional flat bonus and notes field. Specialist skills now store
repeatable entries as arrays.

## Specialisation Groups

These skills hold repeatable entries in `system.skills.<skill>.entries[]`:

- Common Lore (Int)
- Forbidden Lore (Int)
- Scholastic Lore (Int)
- Speak Language (Int)
- Secret Tongue (Int)
- Trade (Int)
- Performer (Fel)
- Pilot (Ag)

Each entry records its own training flags and bonus.

## Compatibility Notes

- Legacy DH2e-only skills are preserved but hidden from the sheet: `Parry`, `Stealth`, and `Athletics`.
- `Navigate` remains an alias for `Navigation` to keep existing macros and data working.
- All RT skills now point to their book-accurate default characteristics (e.g., Commerce uses Fel, Survival uses Int, Security uses Ag, Intimidate uses S).
