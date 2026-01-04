# Rogue Trader Mode

This fork repurposes the Dark Heresy 2e acolyte sheet to track Rogue Trader characters and gear while keeping existing mechanics intact. The system id remains `rogue-trader` so existing worlds and modules keep working, but the default player-facing UI is now the acolyte sheet.

## Creating a Character
1. Create a new Actor and choose the **Character** or **Acolyte** actor type.
2. The actor will automatically open with the acolyte sheet; populate characteristics, skills, and Rogue Trader values under the dedicated tab.
3. Add weapons, armour, talents, and other items to the inventory as normal.

## Sheet Tabs
- **Skills**: Characteristics, skills, and specialties with roll buttons.
- **Combat**: Weapons, armour, fatigue, and fate.
- **Rogue Trader**: Profit factor, ship/void info, acquisitions, and other RT-only fields stored under `system.rogueTrader`.
- **Bio / Notes**: Home world, birthright, career path, and freeform notes.
- **Psyker / Powers**: Psy ratings and psychic power management when relevant.

## Data Structure Overview
- `system.characteristics.*`: Base, advance, modifier, and unnatural values that derive totals and bonuses.
- `system.skills.*`: Skill definitions, training ranks, and specialty entries used for roll targets.
- `system.rogueTrader.*`: Profit factor, acquisitions, ship log, and other RT-only fields surfaced on the Rogue Trader tab.
- `system.bio.*`: Origin data (home world, birthright, career path) following Rogue Trader RPG character creation.
- `system.fate`, `system.fatigue`, `system.wounds`, `system.armour`, `system.encumbrance`: Core combat readiness values referenced by the sheet and rolls.

## Notes
- The acolyte sheet is shared by both the `acolyte` and `character` actor types; no special Rogue Trader-only sheet is required.
- Roll mechanics are unchanged; Rogue Trader additions live in parallel with the existing Dark Heresy 2e ruleset.
