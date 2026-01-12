# Rogue Trader VTT - Sheet & Item Refactor Plan

**Date:** January 10, 2026  
**Scope:** Overview Tab, Combat Tab, Talents Tab, Equipment Tab, Item Sheets  
**Philosophy:** NO SHORTCUTS | PRO-REFACTOR

---

## Task Preamble (Copy to Each Task Context)

> **Project Context:**
> - **System:** Rogue Trader VTT for Foundry V13
> - **Architecture:** dnd5e V13 pattern (DataModel-heavy, slim Documents, ApplicationV2)
> - **Styling Framework:** SCSS with gothic theme variables (see `src/scss/abstracts/`)
> - **Template Pattern:** Handlebars (.hbs) with `{{system.xxx}}` context access
> - **Philosophy:** **NO SHORTCUTS** - Complete implementations only. **PRO-REFACTOR** - Migrate legacy code as part of tasks.
>
> **Key Style Variables (from `_variables.scss` and `_gothic-theme.scss`):**
> - **Colors:** `$rt-color-gold`, `$rt-accent-combat`, `$rt-accent-talents`, `$rt-accent-equipment`
> - **Fonts:** `$rt-font-display: 'Cinzel'`, `$rt-font-heading: 'IM Fell DW Pica'`, `$rt-font-body: 'Lusitana'`
> - **Spacing:** `$rt-space-xs: 4px`, `$rt-space-sm: 8px`, `$rt-space-md: 12px`, `$rt-space-lg: 16px`
> - **Radius:** `$rt-radius-sm: 4px`, `$rt-radius-md: 6px`, `$rt-radius-lg: 8px`
>
> **Gold Standard Templates:**
> - **Weapon Sheet:** `src/templates/item/item-weapon-sheet-modern.hbs` - The reference for all item sheets
> - **Weapon SCSS:** `src/scss/item/_weapon.scss` - Complete styling patterns
> - **Skill Sheet:** `src/templates/item/item-skill-sheet-modern.hbs` - Sections and properties pattern
>
> **Critical Pattern - Tab Navigation (from Weapon Sheet):**
> ```handlebars
> <nav class="rt-weapon-tabs" data-group="primary">
>   <button type="button" class="rt-weapon-tab active" data-tab="stats" data-group="primary">
>     <i class="fas fa-chart-bar"></i>
>     <span>Stats</span>
>   </button>
>   <button type="button" class="rt-weapon-tab" data-tab="qualities" data-group="primary">
>     <i class="fas fa-star"></i>
>     <span>Qualities</span>
>   </button>
>   <!-- ... more tabs ... -->
> </nav>
> ```
>
> **Critical Pattern - Panel Sections (from Weapon Sheet):**
> ```handlebars
> <div class="rt-weapon-section">
>   <div class="rt-weapon-section__header">
>     <i class="fas fa-swords"></i>
>     <h3>Combat Statistics</h3>
>   </div>
>   <div class="rt-weapon-section__body">
>     <!-- Content here -->
>   </div>
> </div>
> ```
>
> **Critical Pattern - Stats Bar (from Weapon Sheet):**
> ```handlebars
> <div class="rt-weapon-stats">
>   <div class="rt-weapon-stat rt-weapon-stat--damage">
>     <div class="rt-weapon-stat__icon"><i class="fas fa-burst"></i></div>
>     <div class="rt-weapon-stat__content">
>       <span class="rt-weapon-stat__label">Damage</span>
>       <span class="rt-weapon-stat__value">{{item.system.damageLabel}}</span>
>     </div>
>   </div>
>   <!-- ... more stats ... -->
> </div>
> ```
>
> **Files to Reference:**
> - `AGENTS.md` - Complete system documentation
> - `resources/RogueTraderInfo.md` - Game rules reference
> - `src/scss/abstracts/_variables.scss` - Design tokens
> - `src/scss/item/_weapon.scss` - Complete styling reference

---

## Table of Contents

1. [Overview Tab Improvements](#task-1-overview-tab-improvements)
2. [Combat Tab Fixes](#task-2-combat-tab-fixes)
3. [Talents Tab - Item Sheets Refactor](#task-3-talents-tab---item-sheets-refactor)
4. [Equipment Tab - Armour Sheet Refactor](#task-4-equipment-tab---armour-sheet-refactor)
5. [Equipment Tab - ForceField/Cybernetics/Gear Sheet Refactor](#task-5-equipment-tab---other-item-sheets-refactor)
6. [Item Sheet Style Guide Creation](#task-6-item-sheet-style-guide-creation)

---

## Task 1: Overview Tab Improvements

### Goal
Enhance the overview tab with additional quick information blocks to make it a comprehensive at-a-glance dashboard.

### Current State Analysis
**File:** `src/templates/actor/acolyte/tab-overview.hbs`

The current overview tab has:
- **Zone 1:** Vitals (Wounds, Critical, Fatigue, Fate, Corruption/Insanity)
- **Zone 2:** Favorite Skills (with roll buttons)
- **Zone 4:** Movement & Load
- **Zone 5:** Quick Combat (weapon, stats, armour summary, force field)
- **Zone 6:** Progression (XP tracking)
- **Zone 7:** Wealth & Dynasty (Profit Factor, Endeavour)
- **Zone 8:** Active Effects Preview

### Suggested Additions

#### 1. **Characteristics Quick Reference Panel (NEW Zone 3)**
Add a compact characteristics grid showing all 9 characteristics with rollable buttons:
```
WS  BS  S   T   Ag
42  35  40  38  45

Int Per WP  Fel Inf
32  38  40  35  45
```
- Each value is clickable to roll
- Show bonuses in tooltips

#### 2. **Combat Readiness Widget (Enhance Zone 5)**
Add to Quick Combat section:
- Initiative bonus display: `Init: +X`
- Primary/Secondary weapon quick swap
- Active force field status with activation toggle

#### 3. **Conditions Summary (NEW Zone)**
Quick display of active conditions with icons:
- Bleeding, Stunned, Prone, etc.
- Click to view condition details

#### 4. **Psy Rating Widget (for psykers - Conditional)**
If character has psy rating > 0:
- Current/Max psy rating
- Sustained powers count
- Phenomena warning threshold

#### 5. **Navigator Mutations Widget (for navigators - Conditional)**
If character is Navigator type:
- Mutation level indicator
- Warp Eye status

### Files to Modify
- `src/templates/actor/acolyte/tab-overview.hbs` - Add new zones
- `src/scss/panels/_overview-dashboard.scss` - Add styling for new widgets
- `src/module/applications/actor/acolyte-sheet.mjs` - Prepare context data for new widgets

### Implementation Steps
1. Create new panel partials for each new widget
2. Update `_prepareOverviewContext()` in acolyte-sheet.mjs to prepare data
3. Add new zone styling to match existing gothic theme
4. Test all new interactive elements

---

## Task 2: Combat Tab Fixes

### Issues to Fix

#### Issue 2.1: Armour Points Panel Buffer
**Problem:** The armour points panel has unwanted padding/margin around it.

**File:** `src/scss/components/_armour.scss`

**Current Code (lines 26-34):**
```scss
.rt-panel-body {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: var(--rt-space-md, 12px);
  padding-top: var(--rt-space-lg, 16px);
  background: var(--rt-panel-body-bg, rgba(40, 35, 30, 0.6));
  min-height: 300px;
}
```

**Fix:** Remove/reduce padding on `.rt-armour-panel .rt-panel-body`:
```scss
.rt-panel-body {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: var(--rt-space-sm, 8px);
  padding-top: var(--rt-space-sm, 8px);
  background: var(--rt-panel-body-bg, rgba(40, 35, 30, 0.6));
  min-height: auto;
}
```

---

#### Issue 2.2: Armour Silhouette Not Centered - Legs Need Fixes
**Problem:** The silhouette layout is not properly centered. Legs should be longer and positioned without margin changes.

**File:** `src/scss/components/_armour.scss`

**Current Layout (lines 78-93):**
```scss
.rt-armour-silhouette {
  grid-template-columns: 90px minmax(90px, 120px) 90px;
  grid-template-rows: auto auto auto auto;
  grid-template-areas:
    ".       head      ."
    "rarm    body      larm"
    ".       body      ."
    "rleg    .         lleg";
  gap: 6px;
  max-width: 340px;
  margin: 0 auto;
}
```

**Current Leg Styles (lines 221-235):**
```scss
.rt-box-right-leg {
  grid-area: rleg;
  justify-self: center;
  align-self: start;
  min-height: 110px;
  min-width: 72px;
}

.rt-box-left-leg {
  grid-area: lleg;
  justify-self: center;
  align-self: start;
  min-height: 110px;
  min-width: 72px;
}
```

**Fix:** Revise grid layout so legs are positioned directly under body, centered properly, and are longer:
```scss
.rt-armour-silhouette {
  display: grid !important;
  visibility: visible !important;
  grid-template-columns: 80px 1fr 80px;  // Arms on sides, body center
  grid-template-rows: auto auto auto;
  grid-template-areas:
    ".       head      ."
    "rarm    body      larm"
    "rleg    body      lleg";  // Legs positioned at bottom, body spans
  gap: 4px;
  padding: var(--rt-space-xs, 4px);
  width: 100%;
  max-width: 300px;
  margin: 0 auto;
}

// Revise body to span correctly
.rt-box-body {
  grid-area: body;
  min-height: 140px;
  align-self: stretch;
}

// Arms - fixed positioning
.rt-box-right-arm {
  grid-area: rarm;
  justify-self: end;
  align-self: center;  // Center vertically with body
  min-height: 80px;
  min-width: 60px;
}

.rt-box-left-arm {
  grid-area: larm;
  justify-self: start;
  align-self: center;  // Center vertically with body
  min-height: 80px;
  min-width: 60px;
}

// Legs - taller, positioned at bottom, no margin hacks
.rt-box-right-leg {
  grid-area: rleg;
  justify-self: end;   // Align with body edge
  align-self: start;
  min-height: 120px;   // Taller
  min-width: 65px;
}

.rt-box-left-leg {
  grid-area: lleg;
  justify-self: start; // Align with body edge  
  align-self: start;
  min-height: 120px;   // Taller
  min-width: 65px;
}
```

---

#### Issue 2.3: Weapons Panel Header Not at Top
**Problem:** The weapons panel header is not positioned at the top of the panel.

**File:** `src/templates/actor/panel/combat-station-panel.hbs` (lines 321-373)

**Analysis:** The weapons panel `.rt-panel-arsenal` is placed INSIDE `.rt-combat-left-side` grid, but the panel header may be affected by flex/grid layout issues.

**Check:** Look at `src/scss/panels/_combat-station.scss` line 33:
```scss
.rt-combat-left-side {
  .rt-panel-arsenal {
    grid-column: 1 / -1;
  }
}
```

**Potential Fix:** Ensure `.rt-panel-arsenal` uses standard panel styling:
```scss
.rt-panel-arsenal {
  display: flex;
  flex-direction: column;
  
  .rt-panel-header {
    order: -1;  // Force header to top
    flex-shrink: 0;
  }
  
  .rt-panel-body {
    flex: 1;
    overflow: auto;
  }
}
```

### Files to Modify
- `src/scss/components/_armour.scss` - Fix panel body padding, revise silhouette grid
- `src/scss/panels/_combat-station.scss` - Fix arsenal panel header

---

## Task 3: Talents Tab - Item Sheets Refactor

### Goal
Refactor Talent, Trait, and Origin Path item sheets to match the polished Weapon/Skill sheet pattern with working tabs.

### Issues
1. Tabs do not function (not wired up properly)
2. Styling is bland compared to weapon sheet
3. Missing colorful section headers
4. No stat bar equivalent

### Current Files
- `src/templates/item/item-talent-sheet-modern.hbs`
- `src/templates/item/item-trait-sheet-modern.hbs`
- `src/templates/item/item-origin-path-sheet.hbs`
- `src/scss/item/_talent-trait-modern.scss`

### Reference Pattern (from Weapon Sheet)

**Working Tab Navigation:**
```handlebars
<nav class="rt-weapon-tabs" data-group="primary">
  <button type="button" class="rt-weapon-tab active" data-tab="stats" data-group="primary">
    <i class="fas fa-chart-bar"></i>
    <span>Stats</span>
  </button>
  <!-- Note: active class and data-tab/data-group attributes are key -->
</nav>
```

**Tab Content Panels:**
```handlebars
<section class="rt-weapon-content">
  <div class="rt-weapon-panel active" data-tab="stats" data-group="primary">
    <!-- Content -->
  </div>
  <div class="rt-weapon-panel" data-tab="qualities" data-group="primary">
    <!-- Content -->
  </div>
</section>
```

### Refactor Plan

#### Step 1: Create Unified Item Tab System
Create shared tab styling that works for all item types:
- `src/scss/item/_item-tabs.scss` - Shared tab styles
- Copy the working pattern from `_weapon.scss` (lines 381-453)

#### Step 2: Refactor Talent Sheet

**New Structure:**
```
rt-talent-sheet (container)
├── rt-talent-header (image, name, badges)
├── rt-talent-stats (tier, XP cost, category in stat bar style)
├── rt-talent-tabs nav (working tabs)
└── rt-talent-content
    ├── Properties panel (active)
    ├── Prerequisites panel
    ├── Effects panel  
    └── Description panel
```

**Stats Bar for Talents:**
- Tier badge (T1/T2/T3)
- XP Cost
- Category
- Passive/Active indicator

#### Step 3: Refactor Trait Sheet

**New Structure:**
```
rt-trait-sheet (container)
├── rt-trait-header (image, name, badges)
├── rt-trait-stats (level, category in stat bar style)
├── rt-trait-tabs nav (working tabs)
└── rt-trait-content
    ├── Properties panel
    ├── Effects panel
    └── Description panel
```

**Stats Bar for Traits:**
- Level/Rating
- Category
- Variable (X) indicator

#### Step 4: Update SCSS

Create `_talent-sheet.scss` and `_trait-sheet.scss` following `_weapon.scss` patterns:
- Use `--talent-color` / `--trait-color` CSS custom properties
- Apply consistent section styling with `.rt-xxx-section__header` pattern
- Use colored accent borders on sections

### Files to Create/Modify
- `src/scss/item/_item-tabs.scss` (NEW) - Shared tab styles
- `src/scss/item/_talent-sheet.scss` (NEW) - Talent-specific styles
- `src/scss/item/_trait-sheet.scss` (NEW) - Trait-specific styles
- `src/scss/item/_index.scss` - Update imports
- `src/templates/item/item-talent-sheet-modern.hbs` - Complete refactor
- `src/templates/item/item-trait-sheet-modern.hbs` - Complete refactor
- `src/templates/item/item-origin-path-sheet.hbs` - Update to match pattern

---

## Task 4: Equipment Tab - Armour Sheet Refactor

### Goal
Refactor the Armour item sheet to match weapon sheet patterns with working tabs and consistent styling.

### Issues
1. Tabs do not function (using `data-action="changeTab"` but needs proper wiring)
2. Quick stats section different from weapon stats bar
3. Base properties in single row (can't see all options)
4. Location Coverage panel unnecessary (infer from non-zero AP)
5. Panel styles don't match weapon sheet sections

### Current Files
- `src/templates/item/item-armour-sheet-v2.hbs`
- `src/scss/item/_armour-v2.scss`

### Refactor Plan

#### Step 1: Fix Tab Navigation
**Replace** (current broken pattern):
```handlebars
<nav class="rt-armour-tabs" role="tablist">
  <button type="button" class="rt-armour-tab" data-action="changeTab" data-group="primary" data-tab="protection">
```

**With** (working weapon pattern):
```handlebars
<nav class="rt-armour-tabs" data-group="primary">
  <button type="button" class="rt-armour-tab active" data-tab="protection" data-group="primary">
```

#### Step 2: Replace Quick Stats with Weapon-Style Stats Bar
**Remove:** `rt-armour-quick-stats` (3 inline items)

**Add:** `rt-armour-stats` matching weapon pattern:
```handlebars
<div class="rt-armour-stats">
  {{!-- Total AP (highest location) --}}
  <div class="rt-armour-stat rt-armour-stat--ap">
    <div class="rt-armour-stat__icon"><i class="fas fa-shield-halved"></i></div>
    <div class="rt-armour-stat__content">
      <span class="rt-armour-stat__label">Max AP</span>
      <span class="rt-armour-stat__value">{{system.maxAP}}</span>
    </div>
  </div>
  
  {{!-- Weight --}}
  <div class="rt-armour-stat rt-armour-stat--weight">
    <div class="rt-armour-stat__icon"><i class="fas fa-weight-hanging"></i></div>
    <div class="rt-armour-stat__content">
      <span class="rt-armour-stat__label">Weight</span>
      <span class="rt-armour-stat__value">{{system.weight}}kg</span>
    </div>
  </div>
  
  {{!-- Locations covered --}}
  <div class="rt-armour-stat rt-armour-stat--locations">
    <div class="rt-armour-stat__icon"><i class="fas fa-person"></i></div>
    <div class="rt-armour-stat__content">
      <span class="rt-armour-stat__label">Coverage</span>
      <span class="rt-armour-stat__value">{{system.locationCount}}/6</span>
    </div>
  </div>
</div>
```

#### Step 3: Remove Location Coverage Section
**Delete:** The "Location Coverage" toggle section (lines 192-215)
Coverage is already visible from the AP grid - non-zero values = covered.

#### Step 4: Fix Base Properties Layout
**Current:** All fields in single row (overflows)
**Fix:** Use 2-column grid with proper wrapping:
```handlebars
<div class="rt-field-grid rt-field-grid--2col">
  <div class="rt-field">
    <label>Armour Type</label>
    <select name="system.type">...</select>
  </div>
  <div class="rt-field">
    <label>Craftsmanship</label>
    <select name="system.craftsmanship">...</select>
  </div>
  <div class="rt-field">
    <label>Availability</label>
    <select name="system.availability">...</select>
  </div>
  <div class="rt-field">
    <label>Weight (kg)</label>
    <input type="number" name="system.weight" ... />
  </div>
  <div class="rt-field">
    <label>Max Agility</label>
    <input type="number" name="system.maxAgility" ... />
  </div>
  <div class="rt-field">
    <label>Cost (Thrones)</label>
    <input type="number" name="system.cost" ... />
  </div>
</div>
```

#### Step 5: Use Weapon Section Pattern for Panels
**Replace:** `<section class="rt-panel">` pattern
**With:** `<div class="rt-armour-section">` matching weapon:
```handlebars
<div class="rt-armour-section">
  <div class="rt-armour-section__header">
    <i class="fas fa-shield-halved"></i>
    <h3>Armour Points by Location</h3>
  </div>
  <div class="rt-armour-section__body">
    <!-- Content -->
  </div>
</div>
```

### Files to Modify
- `src/templates/item/item-armour-sheet-v2.hbs` - Complete template refactor
- `src/scss/item/_armour-v2.scss` - Add stats bar, section styles

---

## Task 5: Equipment Tab - Other Item Sheets Refactor

### Goal
Apply the same weapon-style refactoring to Force Field, Cybernetics, and Gear item sheets.

### Files to Refactor
- `src/templates/item/item-force-field-sheet-v2.hbs`
- `src/templates/item/item-cybernetic-sheet-v2.hbs`
- `src/templates/item/item-gear-sheet-v2.hbs` (or `item-gear-sheet-modern.hbs`)

### Common Changes for All

1. **Fix Tab Navigation** - Use weapon pattern with `data-group` and `data-tab`
2. **Add Stats Bar** - Quick-reference stats at top
3. **Use Section Pattern** - `rt-xxx-section` with `__header` and `__body`
4. **2-Column Field Grid** - For form fields

### Force Field Stats Bar
```handlebars
<div class="rt-forcefield-stats">
  <div class="rt-forcefield-stat rt-forcefield-stat--rating">
    <div class="rt-forcefield-stat__icon"><i class="fas fa-shield-alt"></i></div>
    <div class="rt-forcefield-stat__content">
      <span class="rt-forcefield-stat__label">Rating</span>
      <span class="rt-forcefield-stat__value">{{system.protectionRating}}</span>
    </div>
  </div>
  <div class="rt-forcefield-stat rt-forcefield-stat--overload">
    <div class="rt-forcefield-stat__icon"><i class="fas fa-bolt"></i></div>
    <div class="rt-forcefield-stat__content">
      <span class="rt-forcefield-stat__label">Overload</span>
      <span class="rt-forcefield-stat__value">{{system.overloadChance}}%</span>
    </div>
  </div>
  <div class="rt-forcefield-stat rt-forcefield-stat--weight">
    <div class="rt-forcefield-stat__icon"><i class="fas fa-weight-hanging"></i></div>
    <div class="rt-forcefield-stat__content">
      <span class="rt-forcefield-stat__label">Weight</span>
      <span class="rt-forcefield-stat__value">{{system.weight}}kg</span>
    </div>
  </div>
</div>
```

### Cybernetic Stats Bar
```handlebars
<div class="rt-cybernetic-stats">
  <div class="rt-cybernetic-stat rt-cybernetic-stat--slot">
    <div class="rt-cybernetic-stat__icon"><i class="fas fa-microchip"></i></div>
    <div class="rt-cybernetic-stat__content">
      <span class="rt-cybernetic-stat__label">Slot</span>
      <span class="rt-cybernetic-stat__value">{{system.slotLabel}}</span>
    </div>
  </div>
  <div class="rt-cybernetic-stat rt-cybernetic-stat--weight">
    <div class="rt-cybernetic-stat__icon"><i class="fas fa-weight-hanging"></i></div>
    <div class="rt-cybernetic-stat__content">
      <span class="rt-cybernetic-stat__label">Weight</span>
      <span class="rt-cybernetic-stat__value">{{system.weight}}kg</span>
    </div>
  </div>
</div>
```

### Gear Stats Bar
```handlebars
<div class="rt-gear-stats">
  <div class="rt-gear-stat rt-gear-stat--category">
    <div class="rt-gear-stat__icon"><i class="fas fa-tag"></i></div>
    <div class="rt-gear-stat__content">
      <span class="rt-gear-stat__label">Category</span>
      <span class="rt-gear-stat__value">{{system.categoryLabel}}</span>
    </div>
  </div>
  <div class="rt-gear-stat rt-gear-stat--quantity">
    <div class="rt-gear-stat__icon"><i class="fas fa-cubes"></i></div>
    <div class="rt-gear-stat__content">
      <span class="rt-gear-stat__label">Quantity</span>
      <span class="rt-gear-stat__value">{{system.quantity}}</span>
    </div>
  </div>
  <div class="rt-gear-stat rt-gear-stat--weight">
    <div class="rt-gear-stat__icon"><i class="fas fa-weight-hanging"></i></div>
    <div class="rt-gear-stat__content">
      <span class="rt-gear-stat__label">Weight</span>
      <span class="rt-gear-stat__value">{{system.totalWeight}}kg</span>
    </div>
  </div>
</div>
```

### Files to Modify
- `src/templates/item/item-force-field-sheet-v2.hbs`
- `src/templates/item/item-cybernetic-sheet-v2.hbs`
- `src/templates/item/item-gear-sheet-v2.hbs`
- `src/scss/item/_force-field-v2.scss`
- `src/scss/item/_cybernetic-v2.scss`
- `src/scss/item/_gear-v2.scss`

---

## Task 6: Item Sheet Style Guide Creation

### Goal
Create a comprehensive style guide document that defines the standard patterns for creating consistent item sheets.

### Document: `ITEM_SHEET_STYLE_GUIDE.md`

### Content Outline

```markdown
# Rogue Trader VTT - Item Sheet Style Guide

## 1. Sheet Structure

### Required Elements (in order)
1. Container: `.rt-{itemtype}-sheet`
2. Form: `<form autocomplete="off">`
3. Header: `.rt-{itemtype}-header`
4. Stats Bar: `.rt-{itemtype}-stats`
5. Tab Navigation: `.rt-{itemtype}-tabs`
6. Tab Content: `.rt-{itemtype}-content`

### Container Pattern
```html
<div class="rt-{itemtype}-sheet">
  <form autocomplete="off">
    <!-- All content inside form -->
  </form>
</div>
```

## 2. Header Pattern

### Structure
```handlebars
<header class="rt-{itemtype}-header">
  <div class="rt-{itemtype}-header__image" data-action="editImage" data-edit="img">
    <img src="{{item.img}}" alt="{{item.name}}" />
    <div class="rt-{itemtype}-header__image-overlay">
      <i class="fas fa-edit"></i>
    </div>
  </div>
  
  <div class="rt-{itemtype}-header__info">
    <input type="text" class="rt-{itemtype}-header__name" name="name" value="{{item.name}}" />
    
    <div class="rt-{itemtype}-header__meta">
      <!-- Type/Category badges -->
    </div>
  </div>
  
  <div class="rt-{itemtype}-header__equipped">
    <!-- Equipped toggle (for equippable items) -->
  </div>
</header>
```

### SCSS
```scss
.rt-{itemtype}-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: linear-gradient(135deg, var(--rt-{type}-bg) 0%, transparent 100%);
  border-bottom: 2px solid var(--rt-{type}-border);
}
```

## 3. Stats Bar Pattern

### Structure
```handlebars
<div class="rt-{itemtype}-stats">
  <div class="rt-{itemtype}-stat rt-{itemtype}-stat--{statname}">
    <div class="rt-{itemtype}-stat__icon"><i class="fas fa-{icon}"></i></div>
    <div class="rt-{itemtype}-stat__content">
      <span class="rt-{itemtype}-stat__label">{Label}</span>
      <span class="rt-{itemtype}-stat__value">{Value}</span>
    </div>
  </div>
  <!-- Repeat for each stat -->
</div>
```

### SCSS
```scss
.rt-{itemtype}-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 8px;
  background: var(--rt-panel-bg-solid);
  border-bottom: 1px solid var(--rt-border-color-light);
}

.rt-{itemtype}-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 60px;
  padding: 8px 6px;
  background: var(--rt-panel-bg);
  border-radius: 4px;
  border: 1px solid var(--rt-border-color-light);
}
```

## 4. Tab Navigation Pattern

### Structure (CRITICAL - Must match exactly)
```handlebars
<nav class="rt-{itemtype}-tabs" data-group="primary">
  <button type="button" class="rt-{itemtype}-tab active" data-tab="stats" data-group="primary">
    <i class="fas fa-chart-bar"></i>
    <span>Stats</span>
  </button>
  <button type="button" class="rt-{itemtype}-tab" data-tab="effects" data-group="primary">
    <i class="fas fa-magic"></i>
    <span>Effects</span>
  </button>
  <!-- More tabs -->
</nav>
```

### Tab Content
```handlebars
<section class="rt-{itemtype}-content">
  <div class="rt-{itemtype}-panel active" data-tab="stats" data-group="primary">
    <!-- First tab content (always has 'active' class) -->
  </div>
  <div class="rt-{itemtype}-panel" data-tab="effects" data-group="primary">
    <!-- Second tab content -->
  </div>
</section>
```

### SCSS
```scss
.rt-{itemtype}-tabs {
  display: flex;
  gap: 2px;
  padding: 0 12px;
  background: var(--rt-panel-bg-solid);
  border-bottom: 1px solid var(--rt-border-color);
}

.rt-{itemtype}-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  
  &.active {
    color: var(--rt-{type}-primary);
    border-bottom-color: var(--rt-{type}-primary);
    background: var(--rt-{type}-bg);
  }
}

.rt-{itemtype}-panel {
  display: none;
  
  &.active {
    display: block;
  }
}
```

## 5. Section Pattern

### Structure
```handlebars
<div class="rt-{itemtype}-section">
  <div class="rt-{itemtype}-section__header">
    <i class="fas fa-{icon}"></i>
    <h3>{Section Title}</h3>
    {{!-- Optional: count badge, action button --}}
  </div>
  <div class="rt-{itemtype}-section__body">
    <!-- Section content -->
  </div>
</div>
```

### SCSS
```scss
.rt-{itemtype}-section {
  background: var(--rt-panel-bg);
  border: 1px solid var(--rt-border-color-light);
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
  
  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: linear-gradient(135deg, var(--rt-accent-overlay) 0%, transparent 100%);
    border-bottom: 1px solid var(--rt-border-color-light);
    
    i { color: var(--rt-bronze); }
    
    h3 {
      flex: 1;
      margin: 0;
      font-family: 'Cinzel', serif;
      font-size: 0.95rem;
      font-weight: 600;
    }
  }
  
  &__body {
    padding: 12px;
  }
}
```

## 6. Form Field Patterns

### Field Row
```handlebars
<div class="rt-field-row">
  <div class="rt-field">
    <label>Field Name</label>
    <input type="text" name="system.fieldPath" value="{{item.system.fieldPath}}" />
  </div>
  <div class="rt-field rt-field--small">
    <label>Small Field</label>
    <input type="number" name="system.numberField" value="{{item.system.numberField}}" />
  </div>
</div>
```

### 2-Column Grid
```handlebars
<div class="rt-field-grid rt-field-grid--2col">
  <div class="rt-field">...</div>
  <div class="rt-field">...</div>
  <div class="rt-field">...</div>
  <div class="rt-field">...</div>
</div>
```

### Checkbox Row
```handlebars
<div class="rt-field-row rt-field-row--checkboxes">
  <label class="rt-checkbox">
    <input type="checkbox" name="system.boolField" {{checked item.system.boolField}} />
    <span><i class="fas fa-icon"></i> Label</span>
  </label>
</div>
```

## 7. Badge Patterns

### Type/Category Badge
```handlebars
<span class="rt-{itemtype}-badge rt-{itemtype}-badge--{variant}" title="Tooltip">
  <i class="fas fa-{icon}"></i>
  {Label}
</span>
```

### SCSS
```scss
.rt-{itemtype}-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  
  &--{variant} {
    background: rgba($color, 0.1);
    border: 1px solid rgba($color, 0.4);
    color: $color;
  }
}
```

## 8. Color Theming by Item Type

### CSS Custom Properties
Define in your item sheet SCSS:
```scss
.rt-{itemtype}-sheet {
  --rt-{type}-primary: #{$rt-accent-combat};  // Or appropriate accent
  --rt-{type}-bg: rgba(168, 32, 32, 0.1);
  --rt-{type}-border: rgba(168, 32, 32, 0.4);
}
```

### Available Accent Colors
- Combat/Weapons: `$rt-accent-combat` (#a82020)
- Skills: `$rt-accent-skills` (#2a7a9a)
- Talents: `$rt-accent-talents` (#a07818)
- Equipment: `$rt-accent-equipment` (#3a5f5f)
- Powers: `$rt-accent-powers` (#6a2090)
- Gold/Dynasty: `$rt-accent-gold` (#d4a520)
```

---

## Implementation Order

1. **Task 6** - Create style guide first (reference for all other tasks)
2. **Task 2** - Combat tab fixes (quick wins, foundation fixes)
3. **Task 4** - Armour sheet refactor (most complex item sheet)
4. **Task 3** - Talents tab item sheets (builds on armour patterns)
5. **Task 5** - Other equipment sheets (apply established patterns)
6. **Task 1** - Overview tab improvements (last, builds on stable foundation)

---

## Verification Checklist

After each task, verify:
- [ ] Build completes without errors (`npm run build`)
- [ ] No console errors in browser
- [ ] Tabs switch correctly on click
- [ ] Form data saves properly
- [ ] Styling matches gothic theme
- [ ] Responsive on smaller window sizes
- [ ] All interactive elements work (buttons, toggles, rolls)

---

## Notes

- All templates use `{{system.xxx}}` for data access, not `{{actor.system.xxx}}`
- Tab active state uses CSS class `active`, controlled by Foundry's tab system
- Form submission via `submitOnChange: true` in sheet options
- Editor fields use ProseMirror: `{{editor ... engine="prosemirror"}}`
