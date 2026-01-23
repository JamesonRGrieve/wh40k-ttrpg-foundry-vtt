# Character Advancement System

The advancement system allows players to spend XP to improve their characters through a modern, interactive dialog interface.

## Overview

Characters earn Experience Points (XP) through gameplay and can spend them on three types of advancements:

1. **Characteristics** - Increase raw abilities (+5 per advance, up to 4 tiers)
2. **Skills** - Gain proficiency in skills (trained level)
3. **Talents** - Acquire special abilities

## Architecture

### Data Flow

```
Career Config (rogue-trader.mjs)
        ↓
Advancement Dialog (advancement-dialog.mjs)
        ↓
  ┌─────┴─────┐
  ↓           ↓
Prerequisite    XP Transaction
Validator       (xp-transaction.mjs)
        ↓
Actor Updates (skills, talents, characteristics)
```

### Key Files

| File | Purpose |
|------|---------|
| `config/advancements/rogue-trader.mjs` | Rogue Trader career costs and advances |
| `config/advancements/index.mjs` | Career registry and helper functions |
| `utils/prerequisite-validator.mjs` | Validate prerequisites for advances |
| `utils/xp-transaction.mjs` | XP spending utilities |
| `applications/dialogs/advancement-dialog.mjs` | Main dialog application |
| `templates/dialogs/advancement-dialog.hbs` | Dialog template |
| `scss/dialogs/_advancement-dialog.scss` | Dialog styles |

## Career Advancement Data

Each career defines:

### Characteristic Costs

Four progression tiers, each granting +5 to a characteristic:

```javascript
CHARACTERISTIC_COSTS = {
  fellowship: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  // ...
}
```

### Rank Advances

Skills and talents available at each rank:

```javascript
RANK_1_ADVANCES = [
  { name: 'Charm', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Air of Authority', cost: 100, type: 'talent', 
    prerequisites: [{ type: 'characteristic', key: 'fellowship', value: 30 }] 
  },
  // ...
]
```

## Prerequisites

Prerequisites are defined as an array of conditions:

```javascript
// Characteristic: "Fel 30" = Fellowship must be 30 or higher
{ type: 'characteristic', key: 'fellowship', value: 30 }

// Skill: Must have skill trained
{ type: 'skill', key: 'Command' }

// Talent: Must have talent
{ type: 'talent', key: 'Sound Constitution' }
```

When prerequisites aren't met, the advance is greyed out with a tooltip showing why.

## UI Features

- **Tabbed Interface**: Characteristics | Skills | Talents
- **XP Tracking**: Progress bar and available XP display
- **Visual States**:
  - Available: Full color, purchasable
  - Can't Afford: Faded with red cost
  - Blocked (prereqs): Greyed with lock icon and tooltip
  - Owned: Checkmark badge
- **Animations**: Purchase confirmation pulse, hover effects

## Opening the Dialog

The advancement dialog can be opened from:

1. **Experience Panel**: Click the chart icon button next to the + XP button
2. **Programmatically**: 
   ```javascript
   import AdvancementDialog from './applications/dialogs/advancement-dialog.mjs';
   AdvancementDialog.open(actor, { careerKey: 'rogueTrader' });
   ```

## Adding New Careers

1. Create `config/advancements/{career-key}.mjs` with:
   - `CHARACTERISTIC_COSTS` - Cost table
   - `RANK_1_ADVANCES` (and future ranks) - Available advances
   - `CAREER_INFO` - Metadata

2. Register in `config/advancements/index.mjs`:
   ```javascript
   import * as NewCareer from './new-career.mjs';
   const CAREER_REGISTRY = {
     rogueTrader: RogueTrader,
     newCareer: NewCareer,  // Add here
   };
   ```

3. Add localization strings to `lang/en.json`

## XP Rules

- **Starting XP**: Total 5000, Available 500 (origin path uses 4500)
- **No Refunds**: Purchases are permanent
- **Characteristic Tiers**: Must purchase in order (Simple → Intermediate → Trained → Expert)
- **Skill Stacking**: Skills are one-time purchase (grants "trained"), unless marked with multiplier (x2, x3)

## Future Enhancements

- [ ] Support for Rank 2+ advances
- [ ] All 8 careers
- [ ] Multiplier support (x2/x3 advances)
- [ ] Advanced/specialist skill level purchases (+10, +20)
- [ ] Career detection from character origin path
