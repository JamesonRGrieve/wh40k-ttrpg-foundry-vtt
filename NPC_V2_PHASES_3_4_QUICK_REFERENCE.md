# NPC V2 Quick Reference - Phases 3 & 4

## Overview Tab - Quick Access Dashboard

### Layout (3 Rows)
```
┌─────────────────────────────────────────────────────────┐
│ Characteristics │ Favorite Skills │ Favorite Talents  │
├─────────────────────────────────────────────────────────┤
│ Combat Stats    │ Armor Points    │ Movement          │
├─────────────────────────────────────────────────────────┤
│ Weapons Quick View (2 cols)      │ GM Notes          │
└─────────────────────────────────────────────────────────┘
```

### Key Features
- **Characteristics**: Click to roll, expand for editing
- **Favorites**: Star skills/talents in other tabs to show here
- **Armor Toggle**: Switch Simple ↔ Locations mode
- **Quick Weapons**: Simplified view with roll buttons
- **GM Notes**: Private notes field (GM only)

---

## Combat Tab - Multi-Column Layout

### Layout (3 Columns)
```
┌──────────┬────────────────┬────────────┐
│ Stats    │  Weapons       │  Actions   │
│ Armour   │  (Table/List)  │  Damage    │
│ Movement │                │  Tracker   │
└──────────┴────────────────┴────────────┘
```

### Responsive Behavior
- **Desktop (>1200px)**: 3 columns (25% | 50% | 25%)
- **Tablet (768-1200px)**: 2 columns + actions row
- **Mobile (<768px)**: Single column stack

### Key Features
- **Weapons Table**: Full details with inline editing
- **Damage Controls**: Quick +/- buttons (1/5/10) + custom
- **Combat Tracker**: Add/remove from combat, reroll initiative
- **Armor Display**: Large simple or detailed locations
- **Movement Values**: All 4 types (Half/Full/Charge/Run)

---

## Favorites System

### How to Use
1. Go to Skills or Abilities tab
2. Click star icon on skill/talent
3. Returns to Overview tab
4. Starred items appear in Favorites panels

### Favorites Storage
- Skills: `actor.getFlag("rogue-trader", "favoriteSkills")`
- Talents: `actor.getFlag("rogue-trader", "favoriteTalents")`

---

## Armor System

### Two Modes
**Simple Mode**:
- Single AP value for all locations
- Shows: AP + TB = Total DR

**Locations Mode**:
- 6 hit locations (Head, Body, Arms, Legs)
- Individual AP per location
- Each shows: AP + TB = DR

### Toggle
- Click exchange icon in panel header
- Persists in `system.armour.mode`

---

## Weapons System

### Simple Mode (Default)
- Inline weapon data (no items)
- Table view in Combat tab
- List view in Overview tab
- Fields: Name, Class, Damage, Pen, Range, RoF, Special

### Embedded Mode
- Uses actual weapon items
- Displays item icons and properties
- Drag items to add weapons

### Toggle
- Click exchange icon in Weapons panel header
- Mode persists in `system.weapons.mode`

---

## Quick Actions

### Overview Tab
| Action | Location | Result |
|--------|----------|--------|
| Click Characteristic | Char panel | Rolls characteristic test |
| Click Favorite Skill | Skills panel | Rolls skill test |
| Click Combat Stat | Combat panel | Rolls initiative/dodge/parry |
| Click Armor Toggle | Armor panel | Switches Simple ↔ Locations |
| Click Weapon Roll | Weapons panel | Rolls weapon attack |
| Click Weapon Delete | Weapons panel | Removes weapon |
| Click Add Weapon | Weapons panel | Adds new simple weapon |

### Combat Tab
| Action | Location | Result |
|--------|----------|--------|
| Click Stat Row | Stats panel | Rolls combat test |
| Click Damage Button | Actions panel | Applies damage (-1/-5/-10) |
| Click Heal Button | Actions panel | Restores wounds (+1/+5/+10) |
| Enter Custom Amount | Actions panel | Custom damage/heal |
| Click Add to Combat | Tracker panel | Adds to combat encounter |
| Click Reroll Init | Tracker panel | Rerolls initiative |
| Click Remove | Tracker panel | Removes from combat |
| Click Weapon Row | Weapons panel | Rolls attack |
| Click Delete Weapon | Weapons panel | Removes weapon |
| Click Add Weapon | Weapons panel | Adds new weapon row |
| Click Toggle Mode | Weapons panel | Switches Simple ↔ Embedded |

---

## Styling Classes

### Panels
```scss
.rt-panel                    // Base panel container
.rt-panel-header             // Panel header with icon/title
.rt-panel-body               // Panel content area
.rt-header-btn               // Small button in header
```

### Characteristics
```scss
.rt-char-grid               // 5×2 grid of characteristics
.rt-char-item               // Individual characteristic tile
.rt-char-details            // Collapsible edit section
.rt-char-edit-table         // Edit table with inputs
```

### Favorites
```scss
.rt-favorite-list           // Container for favorites
.rt-favorite-row            // Individual favorite item
.rt-empty-favorites         // Empty state display
```

### Armor
```scss
.rt-armor-simple            // Simple mode display
.rt-armor-locations-grid    // 2×3 grid (Overview)
.rt-armor-locations-list    // Vertical list (Combat)
.rt-armor-location          // Individual location
```

### Weapons
```scss
.rt-weapon-quick-list       // Overview weapons list
.rt-weapon-quick-row        // Individual weapon row
.rt-weapons-table           // Combat weapons table
.rt-embedded-weapons-list   // Item-based weapons
```

### Combat
```scss
.rt-combat-tab-grid         // 3-column grid
.rt-combat-col              // Column container
.rt-combat-stat-list        // Vertical stat list
.rt-damage-section          // Damage control section
.rt-tracker-info            // Combat tracker display
```

### Buttons
```scss
.rt-btn-icon                // Icon-only button
.rt-btn-attack              // Attack action button (green)
.rt-btn-delete              // Delete action button (red)
.rt-btn-damage              // Apply damage button (red)
.rt-btn-heal                // Heal wounds button (green)
.rt-btn-secondary           // Secondary action button
```

---

## Color Palette

| Use | Color | Variable |
|-----|-------|----------|
| Accent/Headers | Dark Red (#8b0000) | `--rt-gold` |
| Damage/Delete | Red (#cc0000) | N/A |
| Heal/Success | Green (#4caf50) | N/A |
| Background (Primary) | Dark Gray (rgba(10,10,10,0.95)) | `--color-bg-primary` |
| Background (Secondary) | Medium Gray (rgba(20,20,20,0.95)) | `--color-bg-secondary` |
| Background (Tertiary) | Light Gray (rgba(30,30,30,0.9)) | `--color-bg-tertiary` |
| Border (Secondary) | Dark Border (#444) | `--color-border-secondary` |
| Border (Tertiary) | Light Border (#333) | `--color-border-tertiary` |
| Text (Primary) | Light (#f0f0f0) | `--color-text-light-primary` |
| Text (Secondary) | Gray (#888) | `--color-text-light-secondary` |

---

## Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Desktop | >1200px | 3 columns, all features visible |
| Tablet | 768-1200px | 2 columns, actions row |
| Mobile | <768px | Single column stack |

### Grid Behavior
```scss
// Desktop
grid-template-columns: 1fr 2fr 1fr;

// Tablet
grid-template-columns: 1fr 1fr;
.rt-combat-col-actions { grid-column: 1 / -1; }

// Mobile
grid-template-columns: 1fr;
```

---

## Data Structure

### Required Actor Properties
```javascript
system: {
  characteristics: { /* 10 characteristics */ },
  armour: {
    mode: "simple" | "locations",
    total: Number,          // Simple mode
    locations: {            // Locations mode
      head: Number,
      body: Number,
      leftArm: Number,
      rightArm: Number,
      leftLeg: Number,
      rightLeg: Number
    }
  },
  movement: {
    half: Number,
    full: Number,
    charge: Number,
    run: Number
  },
  weapons: {
    mode: "simple" | "embedded",
    simple: [                // Simple mode
      { name, class, damage, pen, range, rof, special }
    ]
  },
  initiative: {
    base: String,           // "1d10"
    bonus: Number
  },
  primaryUse: String,       // For roleplay panel condition
  quickNotes: String        // GM notes HTML
}
```

### Required Methods
```javascript
// On Actor
actor.getFlag(scope, key)
actor.setFlag(scope, key, value)
actor.applyDamage(amount, location)
actor.healWounds(amount)

// On System Data Model
system.getSkillTarget(skillKey)
system.characteristics[key].total
system.characteristics[key].bonus
```

---

## Action Handlers

### Overview Tab Actions
```javascript
rollCharacteristic      // Roll characteristic test
rollSkill              // Roll skill test (favorites)
rollInitiative         // Roll initiative
addSimpleWeapon        // Add new weapon to list
removeSimpleWeapon     // Remove weapon from list
toggleArmourMode       // Switch armor mode
toggleFavoriteSkill    // Star/unstar skill
toggleFavoriteTalent   // Star/unstar talent
```

### Combat Tab Actions
```javascript
rollCharacteristic     // Roll combat stat
rollSkill             // Roll dodge/parry
rollWeapon            // Roll weapon attack
applyDamage           // Apply preset damage
healWounds            // Heal preset wounds
applyCustomDamage     // Apply custom damage
healCustomWounds      // Heal custom wounds
addSimpleWeapon       // Add weapon row
removeSimpleWeapon    // Remove weapon row
toggleWeaponMode      // Switch weapon mode
toggleArmourMode      // Switch armor mode
rerollInitiative      // Reroll initiative
addToCombat          // Add to encounter
removeFromCombat     // Remove from encounter
```

---

## Migration Notes

### From Old NPC Sheet
- Old weapon data needs conversion to new format
- Armor needs mode property added
- Movement structure unchanged
- Characteristics structure unchanged

### Backward Compatibility
- All new features are additive
- Old NPCs will work with defaults
- Favorites system uses new flags (won't break old data)
- Armor defaults to "simple" mode if not set

---

## Performance Notes

- Panel-based rendering allows partial updates
- Favorites use flags (minimal data overhead)
- Responsive CSS only (no JavaScript detection)
- Armor toggle is instant (no recalculation)
- All inputs use standard Foundry change handlers

---

## Accessibility

- All interactive elements have proper cursor styles
- Hover states clearly indicate clickable areas
- Empty states provide helpful instructions
- Labels clearly identify input purposes
- Keyboard navigation works for all inputs
- Screen reader friendly semantic HTML

---

## Browser Compatibility

- Grid layouts: All modern browsers
- CSS Variables: All modern browsers
- Flexbox: All modern browsers
- Transitions: All modern browsers
- No IE11 support required (Foundry V13)

---

**Quick Start**: Open NPC sheet → Overview tab shows dashboard → Combat tab shows multi-column layout → Star skills/talents to add favorites → Toggle armor/weapon modes as needed → Use damage controls for quick combat management.
