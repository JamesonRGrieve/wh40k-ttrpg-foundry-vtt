# Rogue Trader Character Sheet Modernization Proposal

**Date**: 2026-01-09
**Status**: Draft for Review
**Goal**: Create a truly modern, sleek, and feature-packed character sheet that fully utilizes Foundry V13 AppV2 capabilities

---

## Executive Summary

The Rogue Trader character sheet is **well-architected** with solid AppV2 foundations, comprehensive features across 8 tabs, and excellent data management. However, there are opportunities to **increase information density**, **standardize visual consistency**, and **adopt modern V13 patterns** from the DnD5e reference implementation.

This proposal identifies **7 key improvement areas** with specific, actionable recommendations to transform the sheet into a truly modern interface that will wow players.

---

## Current State Analysis

### Strengths ✓
- **Modular architecture**: 41 reusable panel templates with clean separation
- **Comprehensive features**: 8 well-organized tabs covering all game aspects
- **Modern AppV2 patterns**: Proper mixin stack, action system, state persistence
- **No hardcoded values**: All data properly sourced from actor system
- **Smart caching**: Performance optimizations with cache invalidation
- **Color-coded theming**: Visual hierarchy with panel accent colors
- **V2 panel evolution**: Overview tab shows progress with modernized components

### Areas for Improvement
1. **Information density** - Overview tab has 20-30% unused vertical space
2. **Visual inconsistency** - Mix of V2 and original panel styles across tabs
3. **Component standardization** - 4+ button patterns, 3+ input styles for similar functions
4. **Grid layout variation** - Each tab uses custom grid approach
5. **Missing V13 patterns** - No edit/play mode toggle, no web components
6. **Spacing inconsistency** - Mix of CSS variables and hardcoded values
7. **Incomplete migration** - Only Overview tab fully converted to V2 panels

---

## Improvement Area 1: Overview Tab Redesign (Dashboard Approach) ⭐ HIGHEST PRIORITY

### Current Issues
- **Overview tab is not an overview** - it's a collection of detailed tracking panels
- **Too much vertical space** consumed by large, spaced-out panels
- **Not suitable as at-a-glance dashboard** during play
- **Players need to see key info quickly** without scrolling through detailed panels

### Recommendation: **Create Status Tab + Redesign Overview as Dense Dashboard**

This is a **fundamental restructuring** of the sheet's information architecture:

#### Part 1: Create New "Status" Tab

Move the current Overview tab panels to a new **"Status"** tab for detailed tracking:

**Status Tab Contents** (keeps all current V2 panels):
1. Wounds Panel V2 (detailed with critical damage tracking)
2. Fatigue Panel V2 (exhaustion management)
3. Corruption Panel V2 (with malignancy tracking)
4. Insanity Panel V2 (with disorder management)
5. Experience Panel V2 (with progress ring and details)
6. Fate Panel V2 (fate point management)
7. Movement Panel Full (all movement metrics)
8. Active Effects Panel

**Purpose**: Detailed status tracking and management, visited when players need to adjust or review these systems in depth.

---

#### Part 2: Redesign Overview as Ultra-Dense Dashboard

Create a **completely new Overview tab** as a true at-a-glance dashboard showing the most critical information in the most compact form possible.

### New Overview Tab Design

**Goal**: Everything important visible without scrolling on a 1080p display

**Layout**: Multi-zone dashboard with ultra-compact information density

```
NEW OVERVIEW TAB - DASHBOARD LAYOUT
┌─────────────────────────────────────────────────────────────┐
│ CHARACTER AT-A-GLANCE DASHBOARD                            │
├────────────────────┬────────────────────┬───────────────────┤
│ VITALS             │ CHARACTERISTICS    │ KEY SKILLS        │
│ ──────             │ ───────────────    │ ─────────         │
│ ♥ 14/16  [−][+]   │ WS: 45 (4)    🎲  │ Awareness: 45  🎲│
│ ⚡ 2/6   [Clear]   │ BS: 38 (3)    🎲  │ Dodge: 52      🎲│
│ ★★★★☆ 4/5 [+1]    │ S:  42 (4)    🎲  │ Parry: 48      🎲│
│ ⚔ 42 Initiative    │ T:  40 (4)    🎲  │ Command: 38    🎲│
│                    │ Ag: 52 (5)    🎲  │ Commerce: 35   🎲│
│ ●●○○○○○○○○ Crit   │ Int: 35 (3)   🎲  │ [Manage]          │
├────────────────────┤ Per: 45 (4)   🎲  │                   │
│ MENTAL STATE       │ WP: 38 (3)    🎲  │                   │
│ ────────────       │ Fel: 38 (3)   🎲  │                   │
│ Corruption: 2 ✓   │                    │                   │
│ Insanity: 3 ✓     │                    │                   │
├────────────────────┼────────────────────┴───────────────────┤
│ MOVEMENT & LOAD    │ QUICK COMBAT STATS                    │
│ ───────────────    │ ──────────────────                    │
│ Half:   3m        │ Primary: ⚔ Plasma Gun (1d10+6 E)     │
│ Full:   6m        │ Damage: +4 (SB)  Dodge: 52  Parry: 48│
│ Charge: 9m        │ Armor: Head(5) Body(6) Arms(4) Legs(4)│
│ Run:    18m       │ Force Field: 40 (Active) [Toggle]    │
│ Load: 24/80 kg ▓░ │                                        │
├────────────────────┼────────────────────────────────────────┤
│ PROGRESSION        │ WEALTH & DYNASTY                      │
│ ───────────        │ ────────────────                      │
│ XP: 2500 / 15000  │ Profit Factor: 35 (Modest)            │
│ Spent: 12,500     │ Acquisitions: 12 items                │
│ Rank: 3 (Tested)  │ Endeavours: 2 active                  │
└────────────────────┴────────────────────────────────────────┘
```

### Design Principles for New Overview

**1. Information Density First**
- Single-line entries where possible
- Inline controls (±, 🎲, buttons)
- No large progress bars or gauges (use compact indicators)
- Minimal padding (4-6px instead of 12-16px)

**2. Scannable Zones**
- Clear sections: Vitals, Characteristics, Skills, Combat, Progression, Dynasty
- Each zone has minimal header (just label, no decorative elements)
- Grid-based layout with clean dividers

**3. Actionable Elements**
- Every stat that can be rolled has inline 🎲 button
- Quick adjustments (± buttons) for frequently changed values
- One-click access to key actions

**4. No Scrolling Required**
- Entire dashboard fits in ~800px height
- Everything important visible at once
- Perfect for 1080p displays and larger

**5. Smart Grouping**
- **Top Priority** (top-left): Wounds, Fate, Initiative - most frequently checked
- **Always Referenced** (top-center): All 9 characteristics with quick roll
- **Common Actions** (top-right): Frequently rolled skills with quick access
- **Combat Ready** (middle-right): Weapon, armor, and combat stats at a glance
- **Progress Tracking** (bottom): XP and Dynasty info for long-term tracking

### Detailed Zone Specifications

#### Zone 1: Vitals (Top-Left)
```
VITALS
─────────────────
♥ Wounds:    14/16      [−] [+]
⚡ Fatigue:   2/6        [Clear]
★ Fate:      ★★★★☆ 4/5  [+1]
⚔ Initiative: 42         [Roll]
Critical:    ●●○○○○○○○○ (2 taken)
```
- Compact single-line format
- Inline controls
- Critical damage pips when relevant
- ~100px height total

#### Zone 2: Characteristics (Top-Center)
```
CHARACTERISTICS
────────────────────────
WS  45 (4)  🎲    BS  38 (3)  🎲
S   42 (4)  🎲    T   40 (4)  🎲
Ag  52 (5)  🎲    Int 35 (3)  🎲
Per 45 (4)  🎲    WP  38 (3)  🎲
Fel 38 (3)  🎲
```
- 3-column compact grid
- Value + Bonus + Roll button
- Tooltips show breakdown on hover
- ~180px height total

#### Zone 3: Key Skills (Top-Right)
```
KEY SKILLS
──────────────────
⭐ Awareness  45  🎲
⭐ Dodge      52  🎲
⭐ Parry      48  🎲
⭐ Command    38  🎲
⭐ Commerce   35  🎲
[Manage Favorites]
```
- User-favorited skills (5-6 max)
- Quick roll access
- Link to Skills tab for full management
- ~140px height total

#### Zone 4: Mental State (Mid-Left)
```
MENTAL STATE
──────────────────
Corruption:  2  (Pure) ✓
Insanity:    3  (Stable) ✓
```
- Ultra-compact status
- Checkmark = under control
- Warning icon if high
- Link to Status tab for details
- ~50px height

#### Zone 5: Movement & Load (Bottom-Left)
```
MOVEMENT & LOAD
────────────────────
Half:   3m   | Load:  24/80 kg
Full:   6m   | ▓▓▓░░░░░ 30%
Charge: 9m   |
Run:    18m  |
```
- Compact movement rates
- Encumbrance bar + percentage
- ~100px height

#### Zone 6: Quick Combat Stats (Mid-Right)
```
QUICK COMBAT STATS
──────────────────────────────
Primary: ⚔ Plasma Gun
  Damage: 1d10+6 (E) | Pen: 6
Melee: +4 (SB) | Dodge: 52 | Parry: 48
Armor: H(5) B(6) RA(4) LA(4) RL(4) LL(4)
Force Field: 40 (Active) [Toggle]
```
- Most-used combat stats at a glance
- Primary weapon summary
- Key defensive stats
- Armor values abbreviated
- ~120px height

#### Zone 7: Progression (Bottom-Left)
```
PROGRESSION
──────────────────────
Available XP: 2,500
Spent XP:     12,500
Total XP:     15,000
Rank: 3 (Tested)
```
- Compact XP breakdown
- Current rank
- ~90px height

#### Zone 8: Wealth & Dynasty (Bottom-Right)
```
WEALTH & DYNASTY
──────────────────────────────
Profit Factor: 35 (Modest Wealth)
Acquisitions:  12 items
Endeavours:    2 active (12 AP)
[View Dynasty Details]
```
- Key dynasty info
- Link to Dynasty tab for details
- ~90px height

### Total Dashboard Height Calculation
- Vitals: 100px
- Mental State: 50px
- Movement: 100px
- Progression: 90px
- **Left Column Total**: ~340px

- Characteristics: 180px
- **Center Column Total**: ~180px

- Key Skills: 140px
- Quick Combat: 120px
- Wealth: 90px
- **Right Column Total**: ~350px

**Maximum Height**: ~350px + headers/padding = **~400-450px total**

**Result**: Entire overview visible on any modern display without scrolling!

---

### Benefits of This Approach

**For Players:**
- ✓ True at-a-glance overview during play
- ✓ Everything critical visible without scrolling
- ✓ Quick access to most common actions
- ✓ Clean, professional appearance
- ✓ Reduced tab switching during sessions

**For GMs:**
- ✓ Quick NPC stat reference
- ✓ Easy to verify player stats during rulings
- ✓ Clear visual hierarchy

**Technical:**
- ✓ All existing functionality preserved (moved to Status tab)
- ✓ No feature loss
- ✓ Backward compatible (Status tab has all original panels)
- ✓ Modular implementation (new overview template, existing panels untouched)

---

### Tab Order After Change

New recommended tab order:
1. **Overview** (new dense dashboard) - First tab, always visible
2. **Status** (detailed tracking) - Former overview panels
3. **Combat** (battle interface)
4. **Skills** (37+ skills management)
5. **Talents** (abilities and traits)
6. **Equipment** (inventory)
7. **Powers** (psychic/navigator powers)
8. **Dynasty** (profit factor and endeavours)
9. **Biography** (notes and narrative)

---

## Improvement Area 2: Visual Consistency & Style Standardization ⭐ HIGH PRIORITY

### Current Issues
- **Panel Style Split**: Overview uses V2 panels, other tabs use original styles
- **Button variations**: 4+ different button patterns (`.rt-vital-btn-compact`, `.rt-vital-ctrl-btn`, `.rt-btn-minus`, `.rt-quick-action-btn`)
- **Input field variations**: 3+ styles (`.rt-edit-input`, `.rt-vital-input`, `.rt-field-input`)
- **Collapsible inconsistency**: Mix of `data-toggle` with CollapsiblePanelMixin vs manual classes
- **Typography hierarchy**: Headers mix font sizes (1.1rem, 1.2rem, 1.4rem) without clear pattern
- **Spacing**: V2 panels use CSS variables, older panels use hardcoded values

### Recommendation: **Complete V2 Migration + Component Library**

#### Phase 1: Standardize Core Components

**1. Unified Button System**
Create single button component system based on function:

```scss
// Primary actions (roll, use, activate)
.rt-btn-primary {
  background: linear-gradient(135deg, var(--rt-accent), var(--rt-accent-dark));
  color: white;
  padding: 6px 12px;
  border-radius: 4px;
  &:hover { transform: translateY(-1px); }
}

// Control buttons (±, toggle, edit)
.rt-btn-control {
  width: 26px;
  height: 26px;
  border: 1px solid var(--rt-border);
  background: var(--rt-surface-2);
  &:hover { background: var(--rt-surface-3); }
}

// Icon buttons (config, delete, expand)
.rt-btn-icon {
  background: transparent;
  padding: 4px;
  &:hover { background: var(--rt-surface-2); }
}

// Quick action buttons (restore fate, clear fatigue)
.rt-btn-quick {
  padding: 4px 8px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

**2. Unified Input System**
Single input component with variants:

```scss
.rt-input {
  background: var(--rt-input-bg);
  border: 1px solid var(--rt-input-border);
  border-radius: 3px;
  padding: 4px 8px;
  font-size: 0.9rem;

  &--compact { padding: 2px 6px; }
  &--numeric { text-align: center; width: 60px; }
  &--large { padding: 6px 10px; font-size: 1rem; }
}
```

**3. Standardized Panel Structure**
All panels follow V2 structure:

```handlebars
<div class="rt-panel rt-panel--{{type}}" data-panel="{{id}}">
  <header class="rt-panel__header" data-toggle="collapsed">
    <h3 class="rt-panel__title">
      <i class="{{icon}}"></i>
      {{title}}
    </h3>
    <i class="rt-panel__chevron fas fa-chevron-down"></i>
  </header>
  <div class="rt-panel__body">
    {{> content}}
  </div>
</div>
```

#### Phase 2: Migrate All Tabs to V2 Panels

**Priority order:**
1. **Combat tab** (high usage during play)
2. **Skills tab** (frequently accessed)
3. **Equipment tab** (complex, benefits most from standardization)
4. **Talents tab**
5. **Powers tab**
6. **Dynasty tab**
7. **Biography tab** (lowest priority, simpler structure)

#### Phase 3: Typography Standardization

```scss
:root {
  // Header hierarchy
  --rt-text-h1: 1.5rem;    // Tab headers
  --rt-text-h2: 1.25rem;   // Panel headers
  --rt-text-h3: 1.1rem;    // Section headers
  --rt-text-body: 0.9rem;  // Normal text
  --rt-text-small: 0.8rem; // Labels, captions

  // Font stacks
  --rt-font-display: "Modesto Condensed", serif;
  --rt-font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
  --rt-font-numeric: "Roboto Mono", monospace;
}
```

**Benefits:**
- ✓ Single source of truth for each component type
- ✓ Easier maintenance and future updates
- ✓ Professional, cohesive appearance across all tabs
- ✓ Faster development of new features
- ✓ Reduced CSS bundle size after cleanup

---

## Improvement Area 3: Modern V13 Patterns Adoption ⭐ MEDIUM PRIORITY

### V13 Patterns to Adopt from DnD5e Reference

#### 1. **Delta Input Support** 🔥 High Value QoL Feature

**Pattern**: Allow `+5`, `-3`, `=10` notation in numeric fields

```javascript
static #onChangeInputDelta(event) {
  const input = event.target;
  const current = Number(this.actor.system[input.name]);
  const value = input.value.trim();

  let result;
  if (value.startsWith('+')) result = current + Number(value.slice(1));
  else if (value.startsWith('-')) result = current - Number(value.slice(1));
  else if (value.startsWith('=')) result = Number(value.slice(1));
  else result = Number(value);

  this.actor.update({ [input.name]: result });
}
```

**Benefits:**
- ✓ Players love this QoL feature
- ✓ Faster adjustments during play
- ✓ Fewer calculation errors

#### 2. **Enhanced Tooltips with Breakdown**

**Current**: Basic tooltips
**Proposed**: Rich tooltips with calculation breakdown

```javascript
_prepareCharacteristicTooltip(char) {
  return {
    content: `
      <div class="rt-tooltip">
        <h4>${char.label}</h4>
        <div class="rt-tooltip__breakdown">
          <div>Base: ${char.base}</div>
          <div>Advances: +${char.advances * 5}</div>
          ${char.modifiers.map(m => `<div>${m.source}: ${m.value:+d}</div>`).join('')}
          <hr>
          <div><strong>Total: ${char.total}</strong></div>
          <div>Bonus: ${char.bonus}</div>
        </div>
      </div>
    `,
    cssClass: "rt-tooltip-rich"
  };
}
```

#### 3. **Responsive Column Management**

**Pattern**: Adjust grid columns based on sheet width

```javascript
_onResize(width, height) {
  const columns = width < 700 ? 1 : width < 900 ? 2 : 3;
  this.element.style.setProperty('--rt-columns', columns);
}
```

```scss
.rt-overview-grid {
  display: grid;
  grid-template-columns: repeat(var(--rt-columns, 3), 1fr);
  gap: 12px;
}
```

**Benefits:**
- ✓ Works on smaller displays
- ✓ Adapts to user preferences
- ✓ Professional responsive design

---

## Improvement Area 4: Enhanced Combat Tab ⚔️ HIGH PRIORITY

### Current State
- 3-column layout (Vitals HUD | Armour Display | Weapon Loadout)
- Good density already achieved
- Functional and clear

### Recommendations

#### 1. **Integrated Hit Location Targeting** 🔥 User Priority Feature

Add **interactive hit location system** directly in armour display:

```
ARMOUR DISPLAY (INTERACTIVE)
┌─────────────────────┐
│    ◯ Head (5)      │ ← Clickable hit locations
│    ╱│╲             │    Roll to hit specific location
│   ◯ ◯ ◯ Arms       │    Visual feedback on hover
│   L   R            │
│     ◯ Body (6)     │
│    ╱ ╲             │
│   ◯   ◯ Legs       │
│   L   R            │
└─────────────────────┘
[Roll Random Hit Location 🎲]
[Target Mode: OFF]
```

**Interactive Features:**
- **Click body part** → Enables targeting mode
- **Targeted attack** → Applies called shot modifiers automatically
- **Random roll** → 1d100 hit location table
- **Visual feedback** → Highlight on hover, indicate current target
- **Damage tracking** → Show damage taken per location
- **Armor display** → Show armor value per location

**Implementation Details:**
```javascript
static #onHitLocationClick(event, target) {
  const location = target.dataset.location; // "head", "body", "leftArm", etc.

  // Toggle targeting mode
  if (this.#targetedLocation === location) {
    this.#targetedLocation = null; // Clear target
  } else {
    this.#targetedLocation = location;
    ui.notifications.info(`Targeting ${location}. Next attack will be a called shot.`);
  }

  this.render();
}

static #rollHitLocation(event, target) {
  const roll = await new Roll("1d100").evaluate();
  const location = CONFIG.ROGUE_TRADER.hitLocationTable[roll.total];

  ChatMessage.create({
    flavor: "Hit Location Roll",
    content: `Struck the <strong>${location.label}</strong>!`,
    roll: roll
  });
}
```

**Benefits:**
- ✓ Faster combat flow with visual targeting
- ✓ Visual reference + mechanical function combined
- ✓ Reduces need to reference hit location tables
- ✓ Modern, interactive combat experience
- ✓ Called shot modifiers applied automatically

#### 2. **Weapon Quick Stats Display**

Add inline damage/penetration displays:

```
PRIMARY WEAPON
┌─────────────────────────────────┐
│ ⚔ Plasma Gun (2H)              │
│ ┌─────────┬──────────┬─────────┐│
│ │ 1d10+6  │  Pen 6   │ 30m    ││
│ │  Energy │ S/2/–    │ Clip 10││
│ └─────────┴──────────┴─────────┘│
│ [⚡ Fire] [🔄 Reload] [⚙]      │
└─────────────────────────────────┘
```

#### 3. **Reaction Counters**

Track reactions used per round:

```
REACTIONS
┌─────────────────────┐
│ Dodge: 45 (◉◯◯)    │ ← 1 of 3 used
│ Parry: 52 (◯◯◯)    │
│ [Reset Round]       │
└─────────────────────┘
```

---

## Improvement Area 5: Skills Tab Enhancements 🎯 MEDIUM PRIORITY

### Current State
- 2-column layout
- Training toggles (T, +10, +20)
- Search and filter
- Characteristic grouping

### Recommendations

#### 1. **Compact List View Option**

Toggle between **Detailed** and **Compact** views:

**Detailed (Current)**:
```
┌──────────────────────────────────┐
│ 🎯 Awareness (Per)              │
│ Target: 45  Training: +10       │
│ [Untrained] [T] [+10✓] [+20]   │
│ [Roll Test]                      │
└──────────────────────────────────┘
```

**Compact (New)**:
```
┌──────────────────────────────────┐
│ 🎯 Awareness (Per) 45 [T][+10✓][+20] 🎲│
│ 👁 Command (Fel) 38 [T✓][+10][+20] 🎲│
│ 🎭 Deceive (Fel) 28 [T][+10][+20] 🎲│
└──────────────────────────────────┘
```

**Benefits:**
- ✓ View all 37+ skills without scrolling
- ✓ Faster scanning during play
- ✓ User choice for preference

#### 2. **Frequently Used Skills Favorites**

Add star/pin system to highlight commonly used skills:

```
FAVORITE SKILLS
┌──────────────────────────────────┐
│ ⭐ Awareness (Per) 45 🎲        │
│ ⭐ Dodge (Ag) 52 🎲             │
│ ⭐ Parry (WS) 48 🎲             │
└──────────────────────────────────┘

ALL SKILLS (grouped by characteristic)
[... full list below ...]
```

#### 3. **Quick Modifier Input**

Add inline modifier field for situational bonuses:

```
┌──────────────────────────────────┐
│ 🎯 Awareness (Per)              │
│ Base: 45  Modifier: [+20▼]     │
│ Target: 65 (With modifier)      │
│ [Roll with +20]                  │
└──────────────────────────────────┘
```

---

## Improvement Area 6: Dynasty Tab Enhancements 💰 HIGH PRIORITY

### Current State
- 2-column layout
- Profit Factor tracking
- Acquisitions list
- Endeavour tracker

### Recommendations

#### 1. **Visual Profit Factor Gauge** 🔥 User Priority Feature

Replace simple number with **rich visual wealth tracking system**:

```
PROFIT FACTOR TRACKER
┌──────────────────────────────────────────────────┐
│         Profit Factor: 35 (Modest Wealth)        │
│                                                   │
│  Poor    Modest    Notable    Mighty   Legendary │
│  ├─────────●─────────┼─────────┼─────────────┤  │
│  0       25       50       75      100      150  │
│                                                   │
│  Base PF:        38                              │
│  Misfortunes:    -3 (2 active)                   │
│  Temporary:      +0                              │
│  ────────────────────                            │
│  Current:        35                              │
│                                                   │
│  [View Misfortunes] [Acquisition Test]           │
└──────────────────────────────────────────────────┘
```

**Features:**
- **Visual gauge** showing position on wealth spectrum
- **Wealth tier indicators** with color coding
- **Breakdown section** showing base PF, modifiers, misfortunes
- **Tier descriptions** on hover (Poor: 1-24, Modest: 25-49, etc.)
- **Quick reference** for acquisition modifiers by tier

**Styling:**
```scss
.rt-profit-factor-gauge {
  .rt-gauge-track {
    background: linear-gradient(to right,
      #8b4513 0%,   // Poor (brown)
      #c0c0c0 25%,  // Modest (silver)
      #ffd700 50%,  // Notable (gold)
      #ff8c00 75%,  // Mighty (orange)
      #ff1493 100%  // Legendary (pink)
    );
  }

  .rt-gauge-marker {
    position: absolute;
    left: var(--pf-percentage);
    animation: pulse 2s ease-in-out infinite;
  }
}
```

#### 2. **Integrated Acquisition Calculator** 🔥 High Value Feature

Add **inline acquisition test tool** with smart suggestions:

```
ACQUISITION TEST
┌──────────────────────────────────────────────────┐
│ Current Profit Factor: 35 (Modest)               │
│                                                   │
│ Item Rarity:     [Common ▼]                      │
│   Availability:  +10 (Common)                    │
│                                                   │
│ Additional Mods: [+0    ▼]                       │
│                                                   │
│ ──────────────────────────────────────────────── │
│ Target Number:   45 (35 PF + 10 Avail)           │
│                                                   │
│ [Roll Acquisition Test 🎲] [Save to Acquisitions]│
└──────────────────────────────────────────────────┘
```

**Features:**
- **Rarity dropdown** with pre-defined modifiers:
  - Ubiquitous: +70
  - Abundant: +50
  - Plentiful: +30
  - Common: +10
  - Average: +0
  - Scarce: −10
  - Rare: −20
  - Very Rare: −30
  - Extremely Rare: −40
  - Near Unique: −60
  - Unique: −70
- **Additional modifiers** for circumstances
- **Auto-calculated target** showing math
- **One-click roll** that creates chat message
- **Save to acquisitions** adds item to tracking list

**Advanced Features:**
```javascript
static async #rollAcquisition(event, target) {
  const pf = this.actor.system.dynasty.profitFactor.value;
  const rarity = target.closest('.rt-acquisition-test').querySelector('[name="rarity"]').value;
  const mods = parseInt(target.closest('.rt-acquisition-test').querySelector('[name="mods"]').value) || 0;

  const targetNumber = pf + rarity + mods;
  const roll = await new Roll("1d100").evaluate();

  const success = roll.total <= targetNumber;
  const degrees = Math.floor(Math.abs(roll.total - targetNumber) / 10);

  // Determine consequences
  let consequence = "";
  if (success) {
    if (degrees >= 3) consequence = "No loss, exceptional deal!";
    else consequence = `PF temporarily reduced by ${degrees}`;
  } else {
    if (degrees >= 3) consequence = `Failed badly, −${degrees} PF permanently!`;
    else consequence = `Failed, no change`;
  }

  ChatMessage.create({
    flavor: "Acquisition Test",
    content: `
      <h3>${success ? "Success" : "Failure"} (${degrees} DoS/DoF)</h3>
      <p><strong>Target:</strong> ${targetNumber}</p>
      <p><strong>Result:</strong> ${roll.total}</p>
      <p><strong>Consequence:</strong> ${consequence}</p>
    `,
    roll: roll
  });
}
```

#### 3. **Misfortunes Tracker**

Enhanced misfortune management:

```
MISFORTUNES
┌──────────────────────────────────────────────────┐
│ ⚠ Active Misfortunes (2)             Total: -3 PF│
│                                                   │
│ 1. Lost Shipment (-2 PF)                     [X] │
│    Duration: 3 sessions remaining                │
│    [Resolve via Endeavour]                       │
│                                                   │
│ 2. Bad Reputation (-1 PF)                    [X] │
│    Duration: Permanent until resolved            │
│    [View Resolution Options]                     │
│                                                   │
│ [Add Misfortune] [View History]                  │
└──────────────────────────────────────────────────┘
```

**Benefits:**
- ✓ Visual wealth progression system
- ✓ Instant acquisition calculations
- ✓ Automated consequence tracking
- ✓ Better understanding of Profit Factor mechanics
- ✓ Streamlined Rogue Trader gameplay

---

## Improvement Area 7: Cross-Tab Features 🔄 LOW PRIORITY

### Global Sheet Enhancements

#### 1. **Quick Reference Sidebar**

Collapsible right sidebar with key stats visible from any tab:

```
┌─────────────────────────────┬──┐
│                             │Q │
│  [OVERVIEW TAB CONTENT]     │U │
│                             │I │
│                             │C │
│                             │K │
│                             │  │
│                             │R │
│                             │E │
│                             │F │
└─────────────────────────────┴──┘

When expanded:
┌──────────────────────┬──────────┐
│                      │ WOUNDS   │
│  [TAB CONTENT]       │ ■■■■□ 14 │
│                      │          │
│                      │ FATE ★★★ │
│                      │          │
│                      │ INIT 42  │
└──────────────────────┴──────────┘
```

#### 2. **Characteristic HUD Upgrade**

Enhance the header characteristic display:

**Current**: Simple icon + value
**Proposed**: Clickable with tooltip + quick roll

```
Hovering over WS shows:
┌─────────────────────┐
│ Weapon Skill        │
│ Total: 45           │
│ Bonus: 4            │
│ [Roll WS Test]      │
└─────────────────────┘
```

#### 3. **Sheet-Wide Search**

Add global search (Ctrl+F) that searches across all tabs:

```
┌─────────────────────────────────┐
│ 🔍 Search sheet...              │
└─────────────────────────────────┘
Results:
• Overview > Wounds: "14/16"
• Combat > Plasma Gun: "1d10+6 E"
• Skills > Awareness: "45 (+10)"
```

---

## Implementation Priorities

### Phase 1: Foundation & Component Standardization 🔥
**Goal**: Create unified component library for consistent styling

**Tasks:**
1. Create **button component system** (`.rt-btn-primary`, `.rt-btn-control`, `.rt-btn-icon`, `.rt-btn-quick`)
2. Create **input component system** (`.rt-input` with variants)
3. **Standardize panel V2 structure** - create single source of truth template
4. Update existing V2 panels to use new component library
5. Create **CSS custom property system** for theming and responsive design

**Files to create:**
- `/src/scss/components/_buttons.scss`
- `/src/scss/components/_inputs.scss`
- `/src/scss/components/_panels-v2.scss`
- `/src/templates/actor/panel/_panel-v2-base.hbs`

**Estimated complexity**: Medium
**Impact**: Foundation for all subsequent work

---

### Phase 2: New Overview Dashboard + Status Tab Creation ⭐ HIGHEST PRIORITY
**Goal**: Create new ultra-dense Overview dashboard and move current panels to Status tab

**Tasks:**
1. **Create new Status tab**
   - Copy current Overview tab structure
   - Rename tab from "Overview" to "Status"
   - Keep all 8 existing V2 panels intact
   - Update tab configuration in `acolyte-sheet.mjs`

2. **Design and implement new Overview dashboard**
   - Create `/src/templates/actor/acolyte/tabs/overview-dashboard.hbs`
   - Implement 8 dashboard zones:
     - Zone 1: Vitals (compact wounds/fatigue/fate/initiative)
     - Zone 2: Characteristics (9 characteristics in compact grid)
     - Zone 3: Key Skills (user favorites with quick roll)
     - Zone 4: Mental State (corruption/insanity status)
     - Zone 5: Movement & Load (compact movement + encumbrance)
     - Zone 6: Quick Combat Stats (primary weapon + armor summary)
     - Zone 7: Progression (XP breakdown)
     - Zone 8: Wealth & Dynasty (PF + acquisitions summary)
   - Create SCSS for dashboard: `/src/scss/actor/overview-dashboard.scss`
   - Implement **favorites system** for skills (store in actor flags)
   - Add data preparation methods in `acolyte-sheet.mjs`

3. **Update tab navigation**
   - Reorder tabs: Overview (dashboard), Status, Combat, Skills, etc.
   - Update tab icons and labels

**Files to modify:**
- `/src/module/applications/actor/acolyte-sheet.mjs` - Tab configuration, data prep
- `/src/templates/actor/acolyte/tabs.hbs` - Tab navigation
- `/src/templates/actor/acolyte/body.hbs` - Tab container structure

**Files to create:**
- `/src/templates/actor/acolyte/tabs/overview-dashboard.hbs` - New dashboard
- `/src/templates/actor/acolyte/tabs/status.hbs` - Move current overview here
- `/src/scss/actor/overview-dashboard.scss` - Dashboard styles

**Estimated complexity**: High (new architecture)
**Impact**: Transformative - completely changes sheet UX

---

### Phase 3: Combat Tab Enhancements ⚔️ HIGH PRIORITY
**Goal**: Add interactive hit location targeting system

**Tasks:**
1. **Implement interactive hit location system**
   - Make armor body diagram clickable
   - Add targeting mode toggle
   - Store targeted location in sheet state
   - Visual feedback (highlight on hover, show current target)
   - Implement called shot modifier application

2. **Add hit location roll button**
   - Roll 1d100 against hit location table
   - Display result in chat
   - Option to apply to current attack

3. **Enhance weapon display**
   - Show inline damage/pen/range stats
   - Add quick-fire buttons
   - Display current weapon mode (semi/auto/etc.)

**Files to modify:**
- `/src/templates/actor/acolyte/tabs/combat.hbs` - Add interactive elements
- `/src/templates/actor/panel/armour-display-panel.hbs` - Make clickable
- `/src/module/applications/actor/acolyte-sheet.mjs` - Add actions and state tracking
- `/src/scss/panels/armour-display-panel.scss` - Hover states, targeting visuals

**Estimated complexity**: Medium
**Impact**: Significant QoL improvement for combat

---

### Phase 4: Dynasty Tab Enhancements 💰 HIGH PRIORITY
**Goal**: Add visual Profit Factor gauge and acquisition calculator

**Tasks:**
1. **Implement Profit Factor gauge**
   - Create visual wealth tier gauge with gradient
   - Show position on Poor → Legendary spectrum
   - Display PF breakdown (base, misfortunes, temporary)
   - Add wealth tier tooltips

2. **Create acquisition calculator**
   - Rarity dropdown with pre-defined modifiers
   - Additional modifier input
   - Auto-calculate target number
   - One-click roll with consequence calculation
   - Save successful acquisitions to list

3. **Enhanced misfortunes tracker**
   - List active misfortunes with durations
   - Show total PF penalty
   - Add/remove/resolve misfortunes
   - History view

**Files to modify:**
- `/src/templates/actor/acolyte/tabs/dynasty.hbs` - Add new components
- `/src/templates/actor/panel/profit-factor-panel.hbs` - Replace with gauge
- `/src/module/applications/actor/acolyte-sheet.mjs` - Add acquisition action
- `/src/scss/panels/profit-factor-panel.scss` - Gauge styling

**Files to create:**
- `/src/templates/actor/panel/acquisition-calculator.hbs`
- `/src/scss/panels/acquisition-calculator.scss`

**Estimated complexity**: Medium
**Impact**: Major improvement to Dynasty mechanics UX

---

### Phase 5: Skills Tab Enhancements 🎯 MEDIUM PRIORITY
**Goal**: Add toggle between Detailed and Compact views

**Tasks:**
1. **Create compact skill view**
   - One-line per skill layout
   - Inline training toggles
   - Inline roll button
   - Fits all 37+ skills without scrolling

2. **Implement view toggle**
   - Button to switch between views
   - Store preference in actor flags
   - Smooth transition between modes

3. **Migrate Skills tab to V2 panels**
   - Use standardized V2 panel structure
   - Apply new component library (buttons, inputs)

**Files to modify:**
- `/src/templates/actor/acolyte/tabs/skills.hbs` - Add view toggle
- `/src/templates/actor/panel/skills-panel.hbs` - Add compact mode
- `/src/module/applications/actor/acolyte-sheet.mjs` - View state management
- `/src/scss/panels/skills-panel.scss` - Compact mode styles

**Estimated complexity**: Medium
**Impact**: Significant QoL for skill management

---

### Phase 6: Remaining Tab V2 Migration 📋 MEDIUM PRIORITY
**Goal**: Migrate all remaining tabs to V2 panel structure and component library

**Tasks:**
1. **Equipment tab migration**
   - Apply V2 panel structure
   - Use standardized buttons and inputs
   - Maintain all current functionality

2. **Talents tab migration**
3. **Powers tab migration**
4. **Biography tab migration** (if needed)

**Estimated complexity**: Medium (repetitive work)
**Impact**: Visual consistency across entire sheet

---

### Phase 7: Modern V13 Patterns & Polish ✨ LOW PRIORITY
**Goal**: Add quality-of-life features and final polish

**Tasks:**
1. **Delta input support** - Allow `+5`, `-3` notation in number fields
2. **Enhanced tooltips** - Show calculation breakdowns
3. **Responsive grid system** - Adapt to different sheet widths
4. **Remove old styles** - Clean up deprecated panel SCSS
5. **Performance audit** - Ensure no render time regression

**Estimated complexity**: Low-Medium
**Impact**: Polish and professional finish

---

### Phase 8: Advanced Features (Optional) 🚀 LOW PRIORITY
**Goal**: Add nice-to-have features if time permits

**Tasks:**
1. Quick reference sidebar (collapsible)
2. Sheet-wide search (Ctrl+F)
3. Reaction counters in combat tab
4. Frequently used skills favorites system (already in Phase 2)

**Estimated complexity**: Medium-High
**Impact**: Nice-to-have enhancements

---

## Success Criteria

The revamped sheet will be considered successful when:

✓ **Dashboard Overview**: New Overview tab displays all critical info without scrolling on 1080p display (~400-450px height)
✓ **Status Tab**: All detailed tracking panels preserved in dedicated Status tab
✓ **Consistency**: All tabs use V2 panel structure with unified component library
✓ **Polish**: Single button system, single input system, standardized typography
✓ **Interactive Combat**: Hit location targeting system with visual feedback
✓ **Dynasty Tools**: Visual PF gauge and integrated acquisition calculator
✓ **Flexible Skills**: Toggle between detailed and compact skill views
✓ **Modernity**: Delta inputs, rich tooltips, responsive design
✓ **Performance**: No regression in render times or interaction responsiveness
✓ **Zero Feature Loss**: All current functionality preserved or enhanced
✓ **Modern Feel**: Dynamic, thoughtful layout that integrates well with V13 system

---

## User Preferences (Confirmed)

Based on user feedback:

1. ✓ **Overview Tab**: Create new Status tab for current panels, redesign Overview as ultra-dense dashboard
2. ✓ **Edit/Play Mode**: No mode toggle - keep always editable
3. ✓ **Skills Tab**: Implement toggle between Detailed and Compact views
4. ✓ **Combat Tab**: Add interactive hit location targeting (high priority)
5. ✓ **Dynasty Tab**: Add visual Profit Factor gauge and acquisition calculator (high priority)
6. ✓ **Design Goal**: Modern, thoughtful layout with dynamic feeling, fully utilizing V13 capabilities

---

## Critical Files Analysis

### New Files to Create

**Templates**:
- `/src/templates/actor/acolyte/tabs/overview-dashboard.hbs` - New dense dashboard
- `/src/templates/actor/acolyte/tabs/status.hbs` - Move current overview panels here
- `/src/templates/actor/panel/_panel-v2-base.hbs` - Base V2 panel template
- `/src/templates/actor/panel/acquisition-calculator.hbs` - Dynasty tab calculator

**Styles**:
- `/src/scss/components/_buttons.scss` - Unified button system
- `/src/scss/components/_inputs.scss` - Unified input system
- `/src/scss/components/_panels-v2.scss` - V2 panel base styles
- `/src/scss/actor/overview-dashboard.scss` - Dashboard-specific styles
- `/src/scss/panels/acquisition-calculator.scss` - Calculator styles

### Files to Modify (High Impact)

**JavaScript** (~3-4 files):
- `/src/module/applications/actor/acolyte-sheet.mjs` - **MAJOR CHANGES**
  - Add Status tab configuration
  - Redesign Overview data preparation
  - Add hit location targeting actions
  - Add acquisition calculator actions
  - Add skill favorites system
  - Add delta input handler
  - Add view mode toggles

- `/src/module/applications/actor/base-actor-sheet.mjs` - **MINOR CHANGES**
  - Enhanced tooltip generation
  - May need shared utility methods

**Templates** (~15-20 files):
- `/src/templates/actor/acolyte/body.hbs` - Tab container (minor)
- `/src/templates/actor/acolyte/tabs.hbs` - Tab navigation with new Status tab
- `/src/templates/actor/acolyte/tabs/combat.hbs` - Add interactive hit locations
- `/src/templates/actor/acolyte/tabs/skills.hbs` - Add view toggle, compact mode
- `/src/templates/actor/acolyte/tabs/dynasty.hbs` - Add PF gauge and calculator
- `/src/templates/actor/panel/armour-display-panel.hbs` - Make interactive
- `/src/templates/actor/panel/profit-factor-panel.hbs` - Replace with gauge
- `/src/templates/actor/panel/skills-panel.hbs` - Add compact variant
- Multiple other panel templates for V2 migration

**Styles** (~20+ files):
- `/src/scss/panels/*.scss` - Update all panel styles to V2 standards
- `/src/scss/actor/*.scss` - Update actor-specific styles
- Create new component SCSS files (buttons, inputs, panels-v2)

### Files That Can Be Removed (After Migration)
- Old panel SCSS files with non-V2 styles (once migration complete)
- Redundant button/input style definitions
- Deprecated template partials

### Backward Compatibility
✓ **No breaking changes** - Status tab preserves all current Overview functionality
✓ **Additive changes** - New Overview is additional, not replacement
✓ **Data model unchanged** - No changes to actor system data structure
✓ **Progressive enhancement** - Features can be implemented incrementally

---

## Implementation Strategy

### Recommended Approach

**Week 1-2: Foundation + Overview/Status Tabs**
- Phase 1 (Component library) + Phase 2 (Dashboard/Status tab)
- This delivers the most visible, impactful change first
- Establishes patterns for all subsequent work

**Week 3: Combat + Dynasty Enhancements**
- Phase 3 (Hit location targeting) + Phase 4 (PF gauge)
- Both are high-priority user requests
- Relatively isolated changes, low risk

**Week 4: Skills + Remaining Tabs**
- Phase 5 (Skills view toggle) + Phase 6 (V2 migration)
- Benefits from established component library
- Completes visual consistency across sheet

**Week 5+: Polish + Optional Features**
- Phase 7 (V13 patterns, polish) + Phase 8 (advanced features)
- Final touches and quality-of-life improvements

### Risk Mitigation
- **Test after each phase** before moving to next
- **Commit frequently** with clear messages
- **Keep Status tab identical** to current Overview initially (safety net)
- **Incremental rollout** - can deploy phases independently
- **User feedback loops** - validate each major change

---

## Next Steps

1. ✓ **User has reviewed** proposal and provided preferences
2. ✓ **Priorities confirmed** based on user feedback
3. **Ready to begin implementation** starting with Phase 1 (Foundation) and Phase 2 (Overview Dashboard/Status Tab)

---

## Final Notes

This proposal represents a **comprehensive modernization** that:
- Transforms the Overview into a true at-a-glance dashboard
- Preserves all current functionality in new Status tab
- Adds modern, interactive features (hit location targeting, PF gauge, acquisition calculator)
- Standardizes visual design across all tabs
- Fully utilizes Foundry V13 AppV2 capabilities
- Creates a truly modern and sleek sheet that will wow players

The phased approach allows for **incremental progress** with testing between phases, reducing risk while delivering value quickly. The new Overview dashboard alone will be a game-changer for play experience.

---

This proposal represents a comprehensive modernization that maintains all current features while significantly improving density, consistency, and user experience. The phased approach allows for incremental improvements with testing between phases.
