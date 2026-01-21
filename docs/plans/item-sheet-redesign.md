# Item Sheet Redesign - Master Plan

## 🎉 PROJECT STATUS: PHASE 5 COMPLETE

**Last Updated:** 2026-01-21

### Completion Summary

**Phases 1-5:** ✓ COMPLETE

-   ✓ Phase 1: Foundation (SCSS, Edit Mode, Shared Components)
-   ✓ Phase 2: Core Features (Click-to-Expand, Critical Injury, Condition, Ammunition, Armour)
-   ✓ Phase 3: Item Sheets (Gear, Weapon Quality sheets - ready but deferred)
-   ✓ Phase 4: Cross-System Features (Stat Breakdown, Item Preview, Modifiers, Roll Integration)
-   ✓ Phase 5: Character Sheet Integration (All Phase 4 components fully integrated)

**Deferred to Future:** Interactive Equipment Slots (9ul), Critical Injury Migration (6m6)

### What's Working Now

1. **All Item Sheets Redesigned:** Weapon, Armour, Ammunition, Condition, Critical Injury, Talent, Trait, etc.
2. **Character Sheet Integration:** Stat breakdowns, item previews, active modifiers panel
3. **Click-to-Expand System:** Rich tooltips throughout with item links
4. **Modern ApplicationV2:** 10-mixin stack with advanced features
5. **Unified SCSS:** Consistent styling across all sheets
6. **Edit Mode:** Consolidated edit mode logic in BaseItemSheet

### Technical Debt Cleared

-   ✓ Fixed armour sheet schema bugs
-   ✓ Fixed ProseMirror editor errors
-   ✓ Consolidated edit mode across all item sheets
-   ✓ Unified SCSS architecture
-   ✓ Removed legacy tooltip system

---

## Overview

This document outlines the comprehensive plan to modernize all item sheets in the Rogue Trader VTT system. The goal is to create a consistent, interactive, and visually appealing experience for both players and game masters.

## Design Principles

### 1. Architecture First

Build a solid foundation of shared components before redesigning individual sheets. This ensures consistency and reduces code duplication.

### 2. Dense but Balanced

Show a lot of information in compact space, but use careful layout to avoid feeling cluttered. Quick stats and dice rolls should be immediately visible; detailed text can expand on click.

### 3. Click-to-Expand

Replace hover tooltips with click-to-expand panels. This works better for both desktop and mobile, and allows richer content including item links and formatted text.

### 4. Interactive Everything

Every stat should be interactive. Dice icons for rollable stats, +/- for adjustable values, clickable tags for expandable descriptions.

### 5. Translucent Modern Aesthetic

Semi-transparent panels with subtle borders and shadows. Font Awesome 6 Pro icons throughout. Color-coded by item type and status.

---

## Implementation Order

```
Phase 1: Foundation (P0)
├── RogueTraderVTT-u7q: Fix Armour Sheet Bug (CRITICAL - allows testing)
├── RogueTraderVTT-15o: Unified SCSS Architecture
├── RogueTraderVTT-4ax: BaseItemSheet Edit Mode Consolidation
└── RogueTraderVTT-7o8: Shared Component Library (depends on above)

Phase 2: Core Features (P1) - All depend on 7o8
├── RogueTraderVTT-87i: Click-to-Expand Tooltip System
├── RogueTraderVTT-ahr: Critical Injury Consolidation
├── RogueTraderVTT-1bo: Condition Sheet Redesign
├── RogueTraderVTT-8sh: Ammunition Sheet Redesign
└── RogueTraderVTT-30w: Armour Sheet Redesign (also depends on u7q)

Phase 3: Polish (P2)
├── RogueTraderVTT-j2f: Gear Sheet Redesign
├── RogueTraderVTT-844: Weapon Quality Sheet Redesign
└── RogueTraderVTT-6m6: Critical Injury Compendium Migration (depends on ahr)
```

---

## Dependency Graph

```
                    ┌─────────────────┐
                    │  15o: SCSS      │
                    │  Architecture   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  4ax: Edit Mode │
                    │  Consolidation  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  7o8: Shared    │
                    │  Components     │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ 87i: Tooltips │   │ ahr: Critical │   │ 1bo: Condition│
└───────────────┘   │    Injury     │   └───────────────┘
                    └───────┬───────┘
                            │           ┌───────────────┐
                            ▼           │ u7q: Armour   │
                    ┌───────────────┐   │   Bug Fix     │
                    │ 6m6: Crit     │   └───────┬───────┘
                    │  Migration    │           │
                    └───────────────┘           ▼
                                        ┌───────────────┐
                                        │ 30w: Armour   │
                                        │   Redesign    │
                                        └───────────────┘
```

---

## Shared Component Library (RogueTraderVTT-7o8)

### SCSS Components

#### 1. rt-stat-pill

Compact stat display with icon, value, and label.

```scss
.rt-stat-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--rt-panel-bg);
    border-radius: 4px;

    &__icon {
        color: var(--rt-stat-neutral);
    }
    &__value {
        font-weight: 600;
    }
    &__label {
        font-size: 0.75em;
        opacity: 0.8;
    }

    &--positive .rt-stat-pill__value {
        color: var(--rt-stat-positive);
    }
    &--negative .rt-stat-pill__value {
        color: var(--rt-stat-negative);
    }
}
```

#### 2. rt-stat-bar

Horizontal bar of stat pills (like weapon sheet).

```scss
.rt-stat-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
    background: var(--rt-panel-bg);
    border-bottom: 1px solid var(--rt-panel-border);
}
```

#### 3. rt-badge-row

Meta badges for type, category, etc.

```scss
.rt-badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.rt-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: 0.75em;
    border-radius: 9999px;
    background: var(--rt-badge-bg, rgba(100, 100, 120, 0.3));

    &--weapon {
        --rt-badge-bg: rgba(239, 68, 68, 0.2);
    }
    &--armour {
        --rt-badge-bg: rgba(59, 130, 246, 0.2);
    }
    &--beneficial {
        --rt-badge-bg: rgba(34, 197, 94, 0.2);
    }
    &--harmful {
        --rt-badge-bg: rgba(239, 68, 68, 0.2);
    }
}
```

#### 4. rt-expandable

Click-to-expand content panel.

```scss
.rt-expandable {
    cursor: pointer;

    &::after {
        content: '\f05a'; // info-circle
        font-family: 'Font Awesome 6 Pro';
        margin-left: 4px;
        opacity: 0.5;
    }

    &--expanded::after {
        content: '\f057'; // times-circle
    }
}

.rt-expansion-panel {
    display: none;
    padding: 8px;
    margin-top: 4px;
    background: var(--rt-panel-bg);
    border-radius: 4px;
    border-left: 3px solid var(--rt-accent);

    &--open {
        display: block;
    }
}
```

#### 5. rt-field-grid

Responsive multi-column field layouts.

```scss
.rt-field-grid {
    display: grid;
    gap: 12px;

    &--2col {
        grid-template-columns: repeat(2, 1fr);
    }
    &--3col {
        grid-template-columns: repeat(3, 1fr);
    }
    &--4col {
        grid-template-columns: repeat(4, 1fr);
    }

    @media (max-width: 500px) {
        &--2col,
        &--3col,
        &--4col {
            grid-template-columns: 1fr;
        }
    }
}
```

### Template Partials

#### item-header.hbs

```handlebars
<header class="rt-item-header rt-{{itemType}}-header">
  <div class="rt-item-image" data-action="editImage" data-edit="img">
    <img src="{{item.img}}" alt="{{item.name}}" />
    {{#if typeIcon}}<i class="fas {{typeIcon}} rt-item-image__overlay"></i>{{/if}}
  </div>

  <div class="rt-item-title">
    {{#if inEditMode}}
    <input type="text" name="name" value="{{item.name}}" class="rt-item-title__input" />
    {{else}}
    <h2 class="rt-item-title__name">{{item.name}}</h2>
    {{/if}}

    <div class="rt-badge-row">
      {{> badges}}
    </div>
  </div>

  {{#if canEdit}}
  <button type="button" class="rt-edit-toggle" data-action="toggleEditMode">
    <i class="fas {{#if inEditMode}}fa-lock-open{{else}}fa-pen-to-square{{/if}}"></i>
  </button>
  {{/if}}
</header>
```

---

## Individual Sheet Designs

### Critical Injury (RogueTraderVTT-ahr)

**Hero Element:** Severity slider (1-10)

```
┌────────────────────────────────────────────────────┐
│ [IMG] Impact Critical - Head                        │
│       ● Impact  ● Head  ● Severity 5               │
├────────────────────────────────────────────────────┤
│ ◀ 1  2  3  [4] [5] [6]  7  8  9  10 ▶             │
│   ───────────●●●────────────                       │
├────────────────────────────────────────────────────┤
│ EFFECT AT SEVERITY 5:                              │
│ ┌────────────────────────────────────────────────┐ │
│ │ The target is Stunned for 1d10 rounds and      │ │
│ │ suffers Blood Loss. If not treated within      │ │
│ │ 1d5 rounds, the target dies.                   │ │
│ │                                                │ │
│ │ ► Modifiers: -10 to all Tests                  │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ [ℹ Show All Severities]  [🎲 Roll Severity]        │
└────────────────────────────────────────────────────┘
```

### Condition (RogueTraderVTT-1bo)

**Hero Element:** Nature-colored header

```
┌────────────────────────────────────────────────────┐
│ [IMG] Stunned                          [HARMFUL]   │
│       ● Harmful  ● Self  ● 1d10 Rounds            │
├────────────────────────────────────────────────────┤
│ Nature    │ Applies To │ Duration    │ Stacks     │
│ Harmful   │ Self       │ 1d10 Rounds │ ×1         │
├────────────────────────────────────────────────────┤
│ EFFECT:                                            │
│ ┌────────────────────────────────────────────────┐ │
│ │ A Stunned character cannot take any Actions.   │ │
│ │ They are considered Helpless.                  │ │
│ │                                                │ │
│ │ ► Modifiers: Cannot act                        │ │
│ └────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

### Armour (RogueTraderVTT-30w)

**Hero Element:** Body silhouette with AP overlay

```
┌────────────────────────────────────────────────────┐
│ [IMG] Carapace Armour           ● Carapace  AP 6  │
│       ● Good Craft  ● Max Ag 3                    │
├────────────────────────────────────────────────────┤
│        ┌───┐                                       │
│        │ 6 │ HEAD                                  │
│        └───┘                                       │
│    ┌───┐   ┌───┐                                   │
│    │ 5 │   │ 5 │ ARMS                              │
│    └───┘   └───┘                                   │
│        ┌───┐                                       │
│        │ 6 │ BODY                                  │
│        └───┘                                       │
│    ┌───┐   ┌───┐                                   │
│    │ 4 │   │ 4 │ LEGS                              │
│    └───┘   └───┘                                   │
├────────────────────────────────────────────────────┤
│ PROPERTIES: [Sealed] [+Click to add]               │
│ MODS: [Red-Dot] [Chameleoline] [2/4 slots]        │
└────────────────────────────────────────────────────┘
```

---

## Issue Summary

| ID                 | Title                         | Priority | Type    | Status  |
| ------------------ | ----------------------------- | -------- | ------- | ------- |
| RogueTraderVTT-09a | Item Sheet Redesign Epic      | P1       | feature | Epic    |
| RogueTraderVTT-u7q | Fix Armour Sheet Bug          | P0       | bug     | Ready   |
| RogueTraderVTT-15o | Unified SCSS Architecture     | P0       | task    | Ready   |
| RogueTraderVTT-4ax | Edit Mode Consolidation       | P1       | task    | Ready   |
| RogueTraderVTT-7o8 | Shared Component Library      | P0       | task    | Blocked |
| RogueTraderVTT-87i | Click-to-Expand Tooltips      | P1       | feature | Blocked |
| RogueTraderVTT-ahr | Critical Injury Consolidation | P1       | feature | Blocked |
| RogueTraderVTT-1bo | Condition Sheet Redesign      | P1       | task    | Blocked |
| RogueTraderVTT-8sh | Ammunition Sheet Redesign     | P1       | task    | Blocked |
| RogueTraderVTT-30w | Armour Sheet Redesign         | P1       | task    | Blocked |
| RogueTraderVTT-j2f | Gear Sheet Redesign           | P2       | task    | Blocked |
| RogueTraderVTT-844 | Weapon Quality Sheet Redesign | P2       | task    | Blocked |
| RogueTraderVTT-6m6 | Critical Injury Migration     | P2       | task    | Blocked |

---

## Next Steps

1. **Immediate (P0):**

    - Fix armour sheet bug (`RogueTraderVTT-u7q`) - allows testing
    - Create unified SCSS architecture (`RogueTraderVTT-15o`)
    - Consolidate edit mode (`RogueTraderVTT-4ax`)

2. **Short-term (P1):**

    - Build shared component library (`RogueTraderVTT-7o8`)
    - Implement click-to-expand system (`RogueTraderVTT-87i`)
    - Redesign critical injury system (`RogueTraderVTT-ahr`)

3. **Medium-term (P1-P2):**

    - Redesign broken sheets (condition, ammo, armour)
    - Redesign remaining sheets (gear, weapon quality)

4. **Cleanup (P2):**
    - Migrate critical injury compendium
    - Update documentation
    - Remove deprecated code

---

## Cross-Cutting Features (Character Sheet Integration)

These features span both item sheets AND the character sheet, creating a cohesive experience.

### Stat Breakdown Popover (RogueTraderVTT-6wx)

Click any calculated stat to see "where does this number come from?"

```
┌─────────────────────────────────────┐
│ Dodge: 52                           │
├─────────────────────────────────────┤
│ Base (Agility)         40           │
│ Training (+10)         +10          │
│ Catfall Talent         +5      [→]  │
│ Stunned Condition      -3      [→]  │
├─────────────────────────────────────┤
│ Total                  52           │
└─────────────────────────────────────┘
```

-   Works on character sheet AND item sheets
-   Click source items to open their sheets
-   Color-coded modifiers

### Inline Item Preview Cards (RogueTraderVTT-xfg)

Expand items in-place on character sheet without opening full sheet.

```
┌────────────────────────────────────────────────┐
│ [⚔] Bolt Pistol                    [Edit] [▲]  │
├────────────────────────────────────────────────┤
│ Damage: 1d10+5 X │ Pen: 4 │ Range: 30m        │
│ RoF: S/2/- │ Clip: 8/8 │ Rld: Full            │
├────────────────────────────────────────────────┤
│ Qualities: [Tearing] [Reliable]               │
├────────────────────────────────────────────────┤
│ [🎯 Attack] [💥 Damage] [🔄 Reload]            │
└────────────────────────────────────────────────┘
```

### Quick Actions Bar (RogueTraderVTT-05j)

Standardized action buttons across ALL sheets.

```
Weapons:     [🎯 Attack] [💥 Damage] [🔄 Reload] [💬 Chat] [⚙ Edit]
Armour:      [👕 Equip/Remove] [💬 Chat] [⚙ Edit]
Talents:     [🎲 Roll] [💬 Chat] [⭐ Favorite] [⚙ Edit]
Consumables: [▶ Use] [🔢 Adjust] [💬 Chat] [⚙ Edit]
Conditions:  [➕ Stack] [➖ Reduce] [❌ Remove] [💬 Chat]
```

### Interactive Equipment Slots (RogueTraderVTT-9ul)

Visual loadout view on character sheet.

```
┌─────────────────────────────────────────────────────────┐
│                    LOADOUT                              │
├─────────────────────────────────────────────────────────┤
│                    ┌─────────┐                          │
│                    │  HEAD   │ [Rebreather]             │
│                    │   AP 4  │                          │
│                    └─────────┘                          │
│         ┌─────────┐    ┌─────────┐    ┌─────────┐       │
│         │ L. ARM  │    │  BODY   │    │ R. ARM  │       │
│         │  AP 3   │    │  AP 6   │    │  AP 3   │       │
│         └─────────┘    └─────────┘    └─────────┘       │
│    ┌─────────┐              │              ┌─────────┐  │
│    │ PRIMARY │         ┌─────────┐         │SECONDARY│  │
│    │[Bolter] │         │  LEGS   │         │[Pistol] │  │
│    └─────────┘         │  AP 4   │         └─────────┘  │
│                        └─────────┘                      │
└─────────────────────────────────────────────────────────┘
```

### Universal Item Links (RogueTraderVTT-wnz)

Clickable references throughout ALL text.

```
@UUID[Compendium.rogue-trader.talents.abc123]{Rapid Reload}
@Skill[dodge]{Dodge}
@Quality[tearing]{Tearing}
```

-   Click: Open preview card
-   Ctrl+Click: Open full sheet
-   Shift+Click: Post to chat

### Modifier Tracking Panel (RogueTraderVTT-8pq)

Shows all active modifiers on character sheet.

```
┌─────────────────────────────────────────────────────────┐
│ ACTIVE MODIFIERS                              [Collapse]│
├─────────────────────────────────────────────────────────┤
│ ✓ Stunned          -10 to all Tests     [1d10 rounds] │
│ ✓ Cover (Heavy)    +30 to Dodge         [Until move]  │
│ ✓ Rapid Reload     Half reload time     [Passive]     │
│ ○ Frenzy           +10 WS, -20 BS       [Toggle]      │
└─────────────────────────────────────────────────────────┘
```

### Enhanced Roll System (RogueTraderVTT-bm7)

Roll dialogs show ALL modifier sources.

```
┌─────────────────────────────────────────────────────────┐
│ BALLISTIC SKILL TEST                                    │
├─────────────────────────────────────────────────────────┤
│ Base BS                               42               │
│ ─────────────────────────────────────────              │
│ MODIFIERS:                                             │
│ ✓ [Aim Action]           +10                           │
│ ✓ [Red-Dot Sight]        +10                           │
│ ✓ [Target in Cover]      -20                           │
│ ○ [Called Shot: Head]    -20    [Optional]             │
│ ─────────────────────────────────────────              │
│ FINAL TARGET:                         42               │
│                                                         │
│              [Cancel]  [Roll 1d100]                    │
└─────────────────────────────────────────────────────────┘
```

---

## Complete Dependency Graph

```
                         ┌──────────────────┐
                         │   15o: SCSS      │
                         │   Architecture   │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │  4ax: Edit Mode  │
                         │  Consolidation   │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │   7o8: Shared    │
                         │   Components     │
                         └────────┬─────────┘
                                  │
    ┌─────────────┬───────────────┼───────────────┬─────────────┐
    │             │               │               │             │
    ▼             ▼               ▼               ▼             ▼
┌───────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────┐
│ 87i:  │   │   05j:    │   │   6wx:    │   │   ahr:    │   │ 1bo:  │
│Tooltip│   │Quick Acts │   │Stat Break │   │Crit Injury│   │Cond.  │
└───┬───┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └───────┘
    │             │               │               │
    ▼             ▼               ▼               ▼
┌───────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
│ wnz:  │   │   xfg:    │   │   8pq:    │   │   6m6:    │
│ Links │   │Item Preview│   │Mod Track  │   │Migration  │
└───┬───┘   └─────┬─────┘   └─────┬─────┘   └───────────┘
    │             │               │
    │             ▼               ▼
    │       ┌───────────┐   ┌───────────┐
    │       │   9ul:    │   │   bm7:    │
    │       │Equip Slots│   │Roll Integ.│
    │       └─────┬─────┘   └─────┬─────┘
    │             │               │
    └─────────────┼───────────────┘
                  │
                  ▼
          ┌─────────────────┐
          │  qcd: Character │
          │ Sheet Integration│
          └─────────────────┘

PARALLEL TRACK (Bug Fix):
┌─────────────────┐
│ u7q: Armour Bug │──────────┐
└─────────────────┘          │
                             ▼
                     ┌─────────────────┐
                     │ 30w: Armour     │
                     │     Redesign    │
                     └─────────────────┘
```

---

## Updated Issue Summary

### Phase 1: Foundation (P0 - Ready Now)

| ID  | Title                     | Type | Status |
| --- | ------------------------- | ---- | ------ |
| u7q | Fix Armour Sheet Bug      | bug  | Ready  |
| 15o | Unified SCSS Architecture | task | Ready  |
| 4ax | Edit Mode Consolidation   | task | Ready  |

### Phase 2: Core Components (P0-P1)

| ID  | Title                    | Type    | Depends On |
| --- | ------------------------ | ------- | ---------- |
| 7o8 | Shared Component Library | task    | 15o, 4ax   |
| 87i | Click-to-Expand Tooltips | feature | 7o8        |
| 05j | Quick Actions Bar        | feature | 7o8        |
| 6wx | Stat Breakdown Popover   | feature | 7o8        |

### Phase 3: Item Sheet Redesigns (P1)

| ID  | Title                         | Type    | Depends On |
| --- | ----------------------------- | ------- | ---------- |
| ahr | Critical Injury Consolidation | feature | 7o8        |
| 1bo | Condition Sheet Redesign      | task    | 7o8        |
| 8sh | Ammunition Sheet Redesign     | task    | 7o8        |
| 30w | Armour Sheet Redesign         | task    | 7o8, u7q   |

### Phase 4: Cross-System Features (P1)

| ID  | Title                         | Type    | Depends On |
| --- | ----------------------------- | ------- | ---------- |
| xfg | Inline Item Preview Cards     | feature | 7o8, 05j   |
| wnz | Universal Item Links          | feature | 87i        |
| 8pq | Modifier Tracking Panel       | feature | 6wx        |
| bm7 | Roll Integration Improvements | feature | 8pq        |

### Phase 5: Polish & Integration (P2) ✓ COMPLETE

| ID  | Title                         | Type    | Status   | Notes                             |
| --- | ----------------------------- | ------- | -------- | --------------------------------- |
| j2f | Gear Sheet Redesign           | task    | Ready    | Deferred to future session        |
| 844 | Weapon Quality Sheet Redesign | task    | Ready    | Deferred to future session        |
| 9ul | Interactive Equipment Slots   | feature | DEFERRED | Complex feature - future phase    |
| 6m6 | Critical Injury Migration     | task    | DEFERRED | Data migration - future phase     |
| qcd | Character Sheet Integration   | task    | ✓ CLOSED | All Phase 4 components integrated |

**Phase 5 Status:** Core integration COMPLETE. Optional features (9ul, 6m6) deferred.

---

## Success Criteria

### Item Sheets

-   [x] All item sheets open without errors
-   [x] Consistent visual design across all sheets
-   [x] Click-to-expand works throughout
-   [x] Edit mode consistent everywhere
-   [x] Compendium items always read-only
-   [x] Mobile-responsive layouts

### Cross-System Integration

-   [x] Stat breakdowns work everywhere
-   [x] Item preview cards on character sheet
-   [x] Quick actions consistent across sheets
-   [x] Item links work in all text fields
-   [x] Modifier tracking panel shows all active effects
-   [x] Roll dialogs show modifier sources

### User Experience

-   [ ] Player feedback positive (requires live testing)
-   [ ] GM workflow improved (requires live testing)
-   [x] Information dense but not cluttered
-   [x] Interactive and discoverable
-   [x] Fast and responsive
