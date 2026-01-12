# Rogue Trader VTT - Task Planning Document
## Date: January 10, 2026

---

# PREAMBLE - REQUIRED CONTEXT FOR ALL TASKS

This preamble MUST be included with every task delegation. It establishes the project context, coding standards, and philosophy that governs all work on this codebase.

## Project Context
- **System**: Rogue Trader VTT - Foundry VTT V13 game system
- **System ID**: `rogue-trader`
- **Architecture**: dnd5e V13 pattern (DataModel-heavy, slim Documents, ApplicationV2)
- **Build**: `npm run build` (Gulp → dist/) - DO NOT BUILD DURING TASKS, user will build manually

## Philosophy: NO SHORTCUTS, PRO-REFACTOR
- **NO SHORTCUTS**: Every change must be done properly. No quick fixes, no workarounds, no "good enough" solutions.
- **PRO-REFACTOR**: If legacy code exists, refactor it as part of the task. Do not work around old patterns—migrate to modern V13 patterns.
- **SURGICAL CHANGES**: Make the smallest possible changes to achieve the goal, but do not compromise on quality.
- **COMPLETE WORK**: Every task should result in production-ready code. No TODO comments, no incomplete implementations.

## Architecture Patterns

### DataModels (src/module/data/)
- **Heavy responsibility**: Schema definition, data preparation, derived calculations, validation
- **Mixins**: Use shared templates (DescriptionTemplate, ModifiersTemplate, PhysicalItemTemplate, etc.)
- **Migrations**: Implement `migrateData()` for backwards compatibility
- **Schema**: Use `foundry.data.fields.*` field types

```javascript
static defineSchema() {
  const fields = foundry.data.fields;
  return {
    ...super.defineSchema(),
    myField: new fields.NumberField({ required: true, initial: 0 })
  };
}
```

### Documents (src/module/documents/)
- **Slim**: Only roll methods, API surface, action triggers
- **Delegate**: Heavy logic lives in DataModel

### ApplicationV2 Sheets (src/module/applications/)
- **Action Handlers**: Static private methods with `this` bound to sheet instance
- **PARTS System**: Modular template rendering
- **No Caching**: Compute fresh on each render

```javascript
static DEFAULT_OPTIONS = {
  actions: {
    myAction: MySheet.#myAction
  }
};

static async #myAction(event, target) {
  const data = target.dataset;
  await this.actor.update({ ... });
}
```

### Templates (src/templates/)
- **Use `{{system.xxx}}`** NOT `{{actor.system.xxx}}`
- **Panel pattern**: `.rt-panel` with `.rt-panel-header` and `.rt-panel-body`
- **Data attributes**: `data-action="xxx"` for ApplicationV2 handlers

### SCSS (src/scss/)
- **Variables**: Use `$rt-` prefixed variables from `abstracts/_variables.scss`
- **Naming**: `.rt-` prefix, BEM-style modifiers
- **Theme colors**:
  - `$rt-color-gold: #c9a227`
  - `$rt-color-crimson: #8b0000`
  - `$rt-accent-combat: #a82020`
  - `$rt-accent-skills: #2a7a9a`
  - `$rt-accent-talents: #a07818`
  - `$rt-accent-equipment: #3a5f5f`

```scss
.rt-my-component {
  background: $rt-bg-paper;
  padding: $rt-space-md;
  border-radius: $rt-radius-md;
}
```

## Key Files Reference
| Purpose | Location |
|---------|----------|
| Actor DataModels | `src/module/data/actor/` |
| Item DataModels | `src/module/data/item/` |
| Shared Templates | `src/module/data/shared/` |
| Actor Sheets | `src/module/applications/actor/` |
| Item Sheets | `src/module/applications/item/` |
| Panel Templates | `src/templates/actor/panel/` |
| Item Templates | `src/templates/item/` |
| SCSS Variables | `src/scss/abstracts/_variables.scss` |
| Config | `src/module/config.mjs`, `src/module/rules/config.mjs` |

## Handlebars Helpers Available
- Comparison: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `and`, `or`, `not`
- Math: `add`, `subtract`, `multiply`, `divide`, `abs`, `floor`, `ceil`, `round`, `percent`
- Strings: `capitalize`, `uppercase`, `lowercase`, `concat`, `truncate`, `slugify`
- Arrays: `join`, `length`, `includes`, `first`, `last`, `filter`, `sort`
- System: `localize`, `signedNumber`, `romanNumeral`, `formatWeight`

---

# TASK 1: Overview Tab - Critical Wounds Display Fix

## Problem Statement
The critical wounds pips are currently inline with the wounds display. They should be displayed BELOW the wounds, and should be editable (clickable pips) like in the combat tab.

## Current State
- **File**: `src/templates/actor/acolyte/tab-overview.hbs` (lines 16-38)
- Critical wounds are shown inline only when `critical > 0`
- The display is read-only in the overview

## Required Changes

### 1. Template Changes (`src/templates/actor/acolyte/tab-overview.hbs`)
- Move critical wounds section to be BELOW the wounds display
- Add clickable pip functionality using `data-action="setCriticalPip"` pattern
- Show critical wounds section always (or when value > 0), styled consistently with combat tab

### 2. Reference Implementation
Look at `src/templates/actor/panel/wounds-panel-v2.hbs` lines 83-103 for the critical wounds section with interactive pips:
```handlebars
{{!-- Critical Pips --}}
<div class="rt-wounds-critical-pips">
  {{#times 10}}
    <button class="rt-critical-pip {{#if (lte this ../system.wounds.critical)}}filled{{/if}}"
            data-action="setCriticalPip" data-value="{{this}}">
    </button>
  {{/times}}
</div>
```

### 3. SCSS Updates
Ensure styling in overview tab matches combat tab critical pips styling.

## Files to Modify
1. `src/templates/actor/acolyte/tab-overview.hbs`
2. Possibly `src/scss/actor/_overview.scss` or relevant panel SCSS

## Acceptance Criteria
- [ ] Critical wounds displayed below wounds in overview tab
- [ ] Critical pips are clickable (set value on click)
- [ ] Visual styling matches combat tab
- [ ] Works correctly with 0-10 range

---

# TASK 2: Overview Tab - Remove Initiative from Vitals Panel

## Problem Statement
The initiative row should be removed from the vitals panel in the overview tab.

## Current State
- **File**: `src/templates/actor/acolyte/tab-overview.hbs` (lines 81-89)
- Initiative displays as Agility bonus with roll button

## Required Changes

### 1. Template Changes (`src/templates/actor/acolyte/tab-overview.hbs`)
- Remove the initiative row from the vitals panel section
- Adjust spacing/layout if needed after removal

## Files to Modify
1. `src/templates/actor/acolyte/tab-overview.hbs`

## Acceptance Criteria
- [ ] Initiative row completely removed from overview vitals panel
- [ ] Layout remains clean and balanced after removal

---

# TASK 3: Combat Tab - Panel Background Color Consistency

## Problem Statement
The `.rt-panel` background should match the `.rt-vital-stat` background color for visual consistency.

## Current State
- Panels and vital stats may have different background colors
- Need to audit current SCSS values

## Required Changes

### 1. SCSS Investigation
- Find `.rt-vital-stat` background color in SCSS files
- Find `.rt-panel` background color
- Determine which color should be the standard

### 2. SCSS Updates
- Update `.rt-panel` background to match `.rt-vital-stat`
- OR create a shared variable and use it in both places

## Files to Investigate/Modify
1. `src/scss/panels/*.scss`
2. `src/scss/components/*.scss`
3. `src/scss/abstracts/_variables.scss`

## Acceptance Criteria
- [ ] `.rt-panel` and `.rt-vital-stat` have matching backgrounds
- [ ] Visual consistency across combat tab

---

# TASK 4: Combat Tab - Remove Hit Location Roller

## Problem Statement
The "Roll Hit Location" button/feature should be removed from the combat tab.

## Current State
- Hit location roller exists somewhere in the combat tab UI
- Need to locate exact template location

## Required Changes

### 1. Template Changes
- Find and remove hit location roller from `combat-station-panel.hbs` or related template
- Clean up any orphaned handlers if they exist only for this feature

## Files to Investigate/Modify
1. `src/templates/actor/panel/combat-station-panel.hbs`
2. Related SCSS if any specific styling exists

## Acceptance Criteria
- [ ] Hit location roller completely removed
- [ ] No console errors or orphaned code

---

# TASK 5: Combat Tab - Armour Panel Top Padding Fix

## Problem Statement
The `.rt-armour-panel` is missing top padding, causing column headers to be misaligned.

## Current State
- Armour panel columns appear misaligned at the top
- Need to investigate current padding values

## Required Changes

### 1. SCSS Updates
- Add appropriate top padding to `.rt-armour-panel` or its container
- Ensure column alignment is consistent

## Files to Investigate/Modify
1. `src/scss/components/_armour.scss`
2. `src/scss/panels/_combat-station.scss`
3. Related armour panel SCSS files

## Acceptance Criteria
- [ ] Armour panel columns properly aligned
- [ ] Consistent top padding applied

---

# TASK 6: Combat Tab - Combat Action Vocalise Cards

## Problem Statement
Need to add "vocalise" cards for each combat action, allowing players to post action descriptions to chat. This may require creating a new item type or alternative implementation.

## Current State
- Combat actions are defined in `src/module/rules/combat-actions.mjs` as static objects
- 25+ actions with name, type, subtype, description, and optional attack modifier
- No item type exists for actions - they are hardcoded

## Design Decision Required
**Option A**: Create new `combatAction` item type
- Full DataModel + Sheet + Template
- Can be dragged/dropped, edited, customized
- More work but more flexible

**Option B**: Add vocalise functionality without item type
- Create chat template for combat actions
- Add action to sheet handlers to post action to chat
- Simpler but less flexible

## Recommended Approach: Option A - Full Item Type

### 1. Create Data Model (`src/module/data/item/combat-action.mjs`)
```javascript
export default class CombatActionData extends ItemDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...DescriptionTemplate.defineSchema(),
      actionType: new fields.StringField({ initial: "Half", choices: ["Half", "Full", "Reaction", "Free", "2Full"] }),
      subtypes: new fields.SetField(new fields.StringField()),
      attackModifier: new fields.NumberField({ initial: 0, integer: true }),
      isAttack: new fields.BooleanField({ initial: false }),
      isMovement: new fields.BooleanField({ initial: false }),
      isConcentration: new fields.BooleanField({ initial: false })
    };
  }
}
```

### 2. Create Sheet Class (`src/module/applications/item/combat-action-sheet.mjs`)

### 3. Create Template (`src/templates/item/item-combat-action-sheet.hbs`)

### 4. Create Chat Template (`src/templates/chat/combat-action-card.hbs`)

### 5. Register Item Type
- Add to `system.json` documentTypes
- Add to config.mjs
- Create compendium pack with all 25 actions

### 6. Add to Combat Tab
- Show list of available combat actions
- Click to vocalise (post to chat)

## Files to Create
1. `src/module/data/item/combat-action.mjs`
2. `src/module/applications/item/combat-action-sheet.mjs`
3. `src/templates/item/item-combat-action-sheet.hbs`
4. `src/templates/chat/combat-action-card.hbs`
5. `src/packs/rt-items-combat-actions/_source/*.json` (25+ action files)

## Files to Modify
1. `src/module/data/item/_module.mjs` - export new model
2. `src/module/applications/item/_module.mjs` - export new sheet
3. `src/system.json` - add item type
4. `src/module/config.mjs` - add action types config
5. `src/templates/actor/panel/combat-station-panel.hbs` - add actions list
6. `src/scss/panels/_combat-station.scss` - style actions list

## Acceptance Criteria
- [ ] `combatAction` item type created and registered
- [ ] Item sheet allows editing action properties
- [ ] Combat tab displays available actions
- [ ] Clicking action posts to chat with formatted card
- [ ] All 25 core actions available in compendium

---

# TASK 7: Combat Tab - Armour Silhouette Redesign

## Problem Statement
The armour silhouette needs a complete redesign with a special nested grid. The body should extend slightly past the arms, and the legs should be slightly longer.

## Current State
- **CSS Grid** in `src/scss/components/_armour.scss` (lines 70-82):
```scss
.rt-armour-silhouette {
  display: grid;
  grid-template-columns: 1fr minmax(80px, 120px) 1fr;
  grid-template-areas:
    ".       head      ."
    "rarm    body      larm"
    "rleg    .         lleg";
}
```
- Body is same height as arms row
- Legs are positioned with margins, not grid

## Required Changes

### 1. New Grid Design
Create a more anatomically accurate grid where:
- Head is centered at top
- Body extends from below head down past arm height
- Arms are positioned mid-body
- Legs are longer and properly proportioned

Proposed new grid:
```scss
.rt-armour-silhouette {
  display: grid;
  grid-template-columns: 1fr minmax(80px, 120px) 1fr;
  grid-template-rows: auto auto auto auto; /* head, upper-body+arms, lower-body, legs */
  grid-template-areas:
    ".       head        ."
    "rarm    body        larm"
    ".       body        ."
    "rleg    .           lleg";
}
```

### 2. Template Updates
Update `src/templates/actor/panel/armour-display-panel.hbs` if grid area names change.

### 3. SCSS Updates
- Redesign `.rt-armour-silhouette` grid
- Update `.rt-armour-location` positioning
- Adjust sizes for proportional appearance
- Ensure body overlaps arm row visually

## Files to Modify
1. `src/scss/components/_armour.scss`
2. `src/templates/actor/panel/armour-display-panel.hbs`
3. Possibly `src/scss/item/_armour.scss` if item sheet uses same component

## Acceptance Criteria
- [ ] Body extends past arms vertically
- [ ] Legs are proportionally longer
- [ ] Hit locations remain clickable with roll ranges
- [ ] Silhouette looks more anatomically accurate
- [ ] Responsive and scales appropriately

---

# TASK 8: Weapon Creation - Special Array Validation Error

## Problem Statement
When creating a new weapon, validation error occurs:
```
RogueTraderItem validation errors:
  system: 
    special: must be an Array
```

## Current State
- **`special` field** defined in `src/module/data/shared/damage-template.mjs` as:
```javascript
special: new fields.SetField(
  new fields.StringField({ required: true }),
  { required: true, initial: new Set() }
)
```
- **Migration** in `src/module/data/item/weapon.mjs` tries to initialize:
```javascript
if (source.special === undefined || source.special === null) {
  source.special = [];
}
```

## Root Cause
The `SetField` expects a Set, but:
1. Initial value is `new Set()` which may not serialize correctly
2. Migration sets it to `[]` (array) but field expects Set
3. Foundry validation runs before migration

## Required Changes

### 1. Fix SetField Initial Value
In `damage-template.mjs`, change initial to empty array (Foundry converts to Set):
```javascript
special: new fields.SetField(
  new fields.StringField({ required: true }),
  { required: true, initial: [] }
)
```

### 2. Fix Migration Logic
In `weapon.mjs`, ensure migration handles both cases:
```javascript
if (!Array.isArray(source.special)) {
  source.special = source.special ? Array.from(source.special) : [];
}
```

### 3. Test New Weapon Creation
Verify no validation errors on:
- Creating new weapon via UI
- Duplicating existing weapon
- Importing weapon from compendium

## Files to Modify
1. `src/module/data/shared/damage-template.mjs`
2. `src/module/data/item/weapon.mjs`

## Acceptance Criteria
- [ ] New weapons create without validation errors
- [ ] Existing weapons with special qualities still work
- [ ] No data loss on migration

---

# TASK 9: Skills Tab - Fix Advanced Skill Badge

## Problem Statement
The "ADV" badge is being applied to ALL skills, including basic skills. According to Rogue Trader rules, only certain skills are "Advanced" (require training to use).

## Current State
- **Badge applied via CSS class**: `.rt-skill-row--advanced`
- **Class added conditionally**: `{{#if (eq entry.[1].advanced true)}}`
- **Schema** in `creature.mjs` defines each skill with `advanced: true/false`

## Root Cause Investigation Needed
Either:
1. Schema has all skills marked as `advanced: true`
2. Template condition is wrong
3. Data preparation is overriding the values

## Basic Skills (should have advanced: false)
From RogueTraderInfo.md:
- Awareness, Barter, Carouse, Charm, Climb, Command, Concealment, Contortionist
- Deceive, Disguise, Dodge, Evaluate, Gamble, Inquiry, Intimidate
- Logic, Scrutiny, Search, Silent Move, Survival, Swim

## Advanced Skills (should have advanced: true)
- Acrobatics, Blather, Chem-Use, Commerce, Demolition, Interrogation
- Invocation, Lip Reading, Literacy, Medicae, Navigation, Psyniscience
- Security, Shadowing, Sleight of Hand, Tech-Use, Tracking, Wrangling
- All Specialist Skills (Common Lore, Forbidden Lore, etc.)

## Required Changes

### 1. Audit Schema (`src/module/data/actor/templates/creature.mjs`)
- Check each skill's `advanced` field initial value
- Correct any that are wrong

### 2. Verify Template Logic
- Ensure condition correctly reads the `advanced` property
- May need to check if property path is correct

### 3. Test
- Verify basic skills show no ADV badge
- Verify advanced skills show ADV badge

## Files to Modify
1. `src/module/data/actor/templates/creature.mjs`
2. Possibly template files if condition is wrong

## Acceptance Criteria
- [ ] Basic skills do NOT show ADV badge
- [ ] Advanced skills DO show ADV badge
- [ ] Specialist skills (all advanced) show ADV badge

---

# TASK 10: Skills Tab - Click Skill Name Opens Item Sheet

## Problem Statement
Clicking the skill name should open the skill's item sheet. Clicking anywhere else on the row should trigger the roll prompt.

## Current State
- Entire skill row triggers roll prompt
- No way to access skill item sheet from skills tab

## Required Changes

### 1. Template Updates
Modify skill row template to separate:
- Skill name as clickable link → opens item sheet
- Rest of row (or roll button) → triggers roll prompt

```handlebars
<div class="rt-skill-row" data-action="rollSkill" data-skill-id="{{skill.id}}">
  <a class="rt-skill-name" data-action="itemEdit" data-item-id="{{skill.id}}">
    {{skill.name}}
  </a>
  {{!-- rest of row content --}}
</div>
```

### 2. Event Handling
- Ensure `itemEdit` action exists and opens item sheet
- Ensure click on name doesn't bubble to row's roll action

### 3. SCSS Updates
- Style skill name as clickable link
- Add hover state to indicate clickability

## Files to Modify
1. `src/templates/actor/panel/skills-panel.hbs`
2. `src/templates/actor/panel/skills-specialist-panel.hbs`
3. `src/module/applications/actor/acolyte-sheet.mjs` (verify handlers exist)
4. `src/scss/panels/_skills.scss`

## Acceptance Criteria
- [ ] Clicking skill name opens skill item sheet
- [ ] Clicking elsewhere on row (or roll button) triggers roll
- [ ] Visual indication that name is clickable (cursor, hover state)

---

# TASK 11: Talents Tab - Talent Item Sheet Redesign

## Problem Statement
Redesign talent item sheet to look similar to skill/weapon item sheets using modern V13 patterns.

## Current State
- **Data Model**: `src/module/data/item/talent.mjs` - comprehensive and well-structured
- **Sheet**: `src/module/applications/item/talent-sheet.mjs` - minimal, extends BaseItemSheet
- **Template**: `src/templates/item/item-talent-sheet-modern.hbs` - exists but needs redesign

## Target Design (based on weapon/skill sheets)
- Tabbed interface (Properties | Prerequisites | Effects | Description)
- Inline badges in header (tier, category, XP cost)
- Rich property grid
- Visual prerequisite display
- Modifiers panel with clear formatting

## Required Changes

### 1. Template Redesign (`src/templates/item/item-talent-sheet-modern.hbs`)
Structure:
```
HEADER
├── Image
├── Name input
├── Badges: Tier (T1/T2/T3), Category, XP Cost
└── Passive/Stackable indicators

TABS: Properties | Prerequisites | Effects | Description

PROPERTIES TAB
├── Category dropdown
├── Tier dropdown  
├── XP Cost input
├── Aptitudes (tag list)
├── Specialization input
├── Passive checkbox
├── Stackable checkbox (with rank input if true)

PREREQUISITES TAB
├── Text description
├── Required Characteristics (if any)
├── Required Skills (if any)
├── Required Talents (if any)

EFFECTS TAB
├── Benefit (HTML editor)
├── Modifiers display (read-only, from Active Effects)

DESCRIPTION TAB
├── Description (HTML editor)
├── Notes (textarea)
├── Source (book/page)
```

### 2. Sheet Class Updates
- Add tab configuration if needed
- Prepare context for dropdowns and computed values

### 3. SCSS Updates
- Create/update `src/scss/item/_talent.scss`
- Match styling patterns from weapon sheet

## Files to Modify
1. `src/templates/item/item-talent-sheet-modern.hbs`
2. `src/module/applications/item/talent-sheet.mjs`
3. `src/scss/item/_talent.scss`

## Acceptance Criteria
- [ ] Tabbed interface implemented
- [ ] Header with visual badges
- [ ] Prerequisites displayed clearly
- [ ] Modifiers panel shows granted bonuses
- [ ] Matches visual style of weapon/skill sheets

---

# TASK 12: Talents Tab - Trait Item Sheet Redesign

## Problem Statement
Redesign trait item sheet to look similar to skill/weapon item sheets using modern V13 patterns.

## Current State
- **Data Model**: `src/module/data/item/trait.mjs` - simpler than talent but complete
- **Sheet**: `src/module/applications/item/trait-sheet.mjs` - minimal, extends BaseItemSheet  
- **Template**: `src/templates/item/item-trait-sheet-modern.hbs` - exists but needs redesign

## Target Design
- Tabbed interface (Properties | Effects | Description)
- Inline badges in header (category, level if variable)
- Property grid
- Clear modifier display

## Required Changes

### 1. Template Redesign (`src/templates/item/item-trait-sheet-modern.hbs`)
Structure:
```
HEADER
├── Image
├── Name input
├── Badges: Category, Level (if hasLevel)
└── Variable indicator (X) if applicable

TABS: Properties | Effects | Description

PROPERTIES TAB
├── Category dropdown
├── Level/Rating input (if hasLevel)
├── Requirements text

EFFECTS TAB
├── Benefit (HTML editor)
├── Modifiers display (characteristics, skills, combat, wounds, movement)

DESCRIPTION TAB
├── Description (HTML editor)
├── Notes (textarea)
├── Source (book/page)
```

### 2. Sheet Class Updates
- Add tab configuration if needed
- Prepare context for dropdowns

### 3. SCSS Updates
- Create/update `src/scss/item/_trait.scss`
- Match styling patterns from weapon sheet

## Files to Modify
1. `src/templates/item/item-trait-sheet-modern.hbs`
2. `src/module/applications/item/trait-sheet.mjs`
3. `src/scss/item/_trait.scss`

## Acceptance Criteria
- [ ] Tabbed interface implemented
- [ ] Header with visual badges
- [ ] Level/Rating input for variable traits
- [ ] Modifiers panel shows granted bonuses
- [ ] Matches visual style of weapon/skill sheets

---

# TASK 13: Equipment Tab - Armour Item Sheet Redesign

## Problem Statement
The Armour item sheet is broken in design/layout/style. Needs complete redesign to match weapon/skill sheet patterns.

## Current State
- **Data Model**: `src/module/data/item/armour.mjs` - complex, ~795 lines, mature
- **Template**: `src/templates/item/item-armour-sheet-modern.hbs` - exists, ~420 lines
- Has tabbed interface but may have broken styling

## Investigation Needed
- What exactly is "broken"? Layout issues? Styling issues? Functionality?
- Audit current template and compare to weapon sheet

## Target Design
Match weapon sheet pattern:
- Clean header with key stat badges (Total AP, Type, Max Ag)
- Body diagram with interactive location toggles
- Tabbed interface (Protection | Properties | Mods | Description)
- Consistent styling with rest of system

## Required Changes

### 1. Audit Current State
- Document what is broken
- Compare to weapon-sheet-modern.hbs

### 2. Template Fixes/Redesign
Based on audit findings, either:
- Fix specific broken elements
- Complete redesign following weapon sheet pattern

### 3. SCSS Fixes
- Fix broken styling
- Ensure consistency with weapon sheet

## Files to Modify
1. `src/templates/item/item-armour-sheet-modern.hbs`
2. `src/module/applications/item/armour-sheet.mjs`
3. `src/scss/item/_armour.scss`

## Acceptance Criteria
- [ ] Sheet opens without visual bugs
- [ ] All locations editable
- [ ] Body diagram displays correctly
- [ ] Properties editable
- [ ] Modifications manageable
- [ ] Matches weapon sheet visual style

---

# TASK 14: Equipment Tab - Force Field Item Sheet Redesign

## Problem Statement
The Force Field item sheet is broken in design/layout/style. Needs redesign to match weapon/skill sheet patterns.

## Current State
- **Data Model**: `src/module/data/item/force-field.mjs` - specialized, ~148 lines
- **Template**: `src/templates/item/item-force-field-sheet.hbs` - exists, ~163 lines
- Simple focused design but may have styling issues

## Target Design
Match weapon sheet pattern:
- Header with status badge (Inactive/Active/Overloaded)
- Key stats: Protection Rating, Overload Threshold
- Activation controls
- Properties panel
- Description panel

## Required Changes

### 1. Template Redesign
Structure:
```
HEADER
├── Image
├── Name input
├── Status Badge (Inactive/Active/Overloaded)
└── Protection Rating badge

STAT BAR
├── Protection Rating
├── Overload Threshold  
├── Recovery Duration

PROPERTIES PANEL
├── Activated toggle
├── Overloaded toggle
├── Equipped toggle
├── Weight, Availability, Craftsmanship

DESCRIPTION PANEL
├── Effect (HTML)
├── Description (HTML)
├── Notes
├── Source
```

### 2. SCSS Updates
- Match styling to weapon sheet
- Status-based color coding (green active, red overloaded)

## Files to Modify
1. `src/templates/item/item-force-field-sheet.hbs`
2. `src/module/applications/item/force-field-sheet.mjs`
3. `src/scss/item/_force-field.scss` (create if needed)

## Acceptance Criteria
- [ ] Clean header with status indication
- [ ] Key stats clearly displayed
- [ ] Activation toggles work
- [ ] Matches weapon sheet visual style

---

# TASK 15: Equipment Tab - Gear Item Sheet Redesign

## Problem Statement
The Gear item sheet is broken in design/layout/style. Needs redesign to match weapon/skill sheet patterns.

## Current State
- **Data Model**: `src/module/data/item/gear.mjs` - simple, ~357 lines
- **Template**: `src/templates/item/item-gear-sheet-modern.hbs` - exists, ~294 lines
- Has tabbed interface but may have issues

## Target Design
Match weapon sheet pattern:
- Header with category icon and key badges
- Tabbed interface (Details | Effects)
- Consumable tracking if applicable
- Properties panel
- Description panel

## Required Changes

### 1. Template Redesign
Structure:
```
HEADER
├── Image
├── Name input
├── Category icon + badge
├── Quick stats: Weight, Quantity

TABS: Details | Effects

DETAILS TAB
├── Category dropdown
├── Physical properties (weight, availability, craftsmanship)
├── Quantity, Cost
├── Equipped/Backpack toggles
├── Consumable section (if uses > 0):
│   ├── Current/Max uses
│   ├── Duration
│   └── Reset button

EFFECTS TAB
├── Effect (HTML)
├── Description (HTML)
├── Notes
├── Source
```

### 2. SCSS Updates
- Match styling to weapon sheet
- Category-based icons/colors

## Files to Modify
1. `src/templates/item/item-gear-sheet-modern.hbs`
2. `src/module/applications/item/gear-sheet.mjs`
3. `src/scss/item/_gear.scss`

## Acceptance Criteria
- [ ] Category clearly displayed
- [ ] Consumable tracking works
- [ ] Tabs function properly
- [ ] Matches weapon sheet visual style

---

# TASK 16: Equipment Tab - Cybernetic Item Sheet Redesign

## Problem Statement
The Cybernetic item sheet is broken in design/layout/style. Needs redesign to match weapon/skill sheet patterns.

## Current State
- **Data Model**: `src/module/data/item/cybernetic.mjs` - medium, ~142 lines
- **Template**: `src/templates/item/item-cybernetic-sheet.hbs` - exists, ~330 lines
- Has panels but no tabs

## Target Design
Match weapon sheet pattern:
- Header with type badge and location(s)
- Tabbed interface (Properties | Installation | Modifiers | Description)
- Body location grid
- Modifier display

## Required Changes

### 1. Template Redesign
Structure:
```
HEADER
├── Image
├── Name input
├── Type badge (Replacement/Implant/Augmetic/etc.)
├── Location badge(s)

TABS: Properties | Installation | Modifiers | Description

PROPERTIES TAB
├── Type dropdown
├── Location checkbox grid (13 locations)
├── Physical properties (weight, availability, craftsmanship)
├── Armour Points (if applicable)

INSTALLATION TAB
├── Surgery Type
├── Difficulty
├── Recovery Time
├── Installation Requirements

MODIFIERS TAB
├── Characteristic modifiers
├── Skill modifiers
├── Combat modifiers

DESCRIPTION TAB
├── Effect (HTML)
├── Drawbacks (HTML)
├── Description (HTML)
├── Notes
├── Source
```

### 2. SCSS Updates
- Match styling to weapon sheet
- Location visualization

## Files to Modify
1. `src/templates/item/item-cybernetic-sheet.hbs`
2. `src/module/applications/item/cybernetic-sheet.mjs`
3. `src/scss/item/_cybernetic.scss`

## Acceptance Criteria
- [ ] Tabbed interface implemented
- [ ] Location grid works
- [ ] Installation info displayed
- [ ] Modifiers clearly shown
- [ ] Matches weapon sheet visual style

---

# TASK 17: Bio Tab - Origin Path Item Sheet Redesign

## Problem Statement
The Origin Path item sheet needs redesign to look similar to skill item sheet using modern V13 patterns.

## Current State
- **Data Model**: `src/module/data/item/origin-path.mjs` - comprehensive with many grant fields
- **Sheet**: `src/module/applications/item/origin-path-sheet.mjs` - minimal, 600x700
- **Template**: `src/templates/item/item-origin-path-sheet.hbs` - structured but may need modernization

## Target Design
Match skill sheet pattern:
- Header with step indicator badge
- Tabbed interface (Grants | Requirements | Choices | Description)
- Clear grant displays (characteristics, skills, talents, traits)
- Choice configuration for character creation

## Required Changes

### 1. Template Redesign
Structure:
```
HEADER
├── Image
├── Name input
├── Step badge (Home World / Birthright / Lure / Trials / Motivation / Career)
└── Step index indicator

TABS: Grants | Requirements | Choices | Description

GRANTS TAB
├── Characteristic Modifiers (grid)
├── Wounds modifier
├── Fate Threshold
├── Blessed by Emperor checkbox
├── Skills granted (list with training level)
├── Talents granted (list)
├── Traits granted (list)
├── Aptitudes (tag list)
├── Equipment (list)
├── Special Abilities (list)

REQUIREMENTS TAB
├── Requirements text
├── Previous Steps required
├── Excluded Steps

CHOICES TAB
├── Choice list (type, count, options)
├── Add/remove choice controls

DESCRIPTION TAB
├── Effect Text (HTML)
├── Description (HTML)
├── Notes
├── Source
```

### 2. Sheet Class Updates
- Add tab configuration
- Prepare context for step dropdowns

### 3. SCSS Updates
- Match styling to skill sheet
- Step-specific colors if desired

## Files to Modify
1. `src/templates/item/item-origin-path-sheet.hbs`
2. `src/module/applications/item/origin-path-sheet.mjs`
3. `src/scss/item/_origin-path.scss`

## Acceptance Criteria
- [ ] Tabbed interface implemented
- [ ] All grant types clearly displayed
- [ ] Requirements section works
- [ ] Choices configurable
- [ ] Matches skill sheet visual style

---

# IMPLEMENTATION ORDER

Recommended order based on dependencies and complexity:

## Phase 1: Quick Fixes (Low Complexity)
1. **TASK 2**: Remove initiative from overview vitals
2. **TASK 4**: Remove hit location roller
3. **TASK 5**: Armour panel top padding fix
4. **TASK 3**: Panel background color consistency
5. **TASK 8**: Weapon special array validation fix

## Phase 2: Overview/Combat Tab Enhancements
6. **TASK 1**: Critical wounds display fix
7. **TASK 9**: Fix advanced skill badge
8. **TASK 10**: Skill name opens item sheet

## Phase 3: Item Sheet Redesigns (Medium Complexity)
9. **TASK 11**: Talent item sheet redesign
10. **TASK 12**: Trait item sheet redesign
11. **TASK 17**: Origin path item sheet redesign

## Phase 4: Equipment Sheets (Medium-High Complexity)
12. **TASK 15**: Gear item sheet redesign
13. **TASK 14**: Force field item sheet redesign
14. **TASK 16**: Cybernetic item sheet redesign
15. **TASK 13**: Armour item sheet redesign

## Phase 5: Major Features (High Complexity)
16. **TASK 7**: Armour silhouette redesign
17. **TASK 6**: Combat action vocalise cards (new item type)

---

# NOTES

- Each task should be completed fully before moving to the next
- User will build and test manually after each task
- Do not create shortcuts or workarounds - do it properly
- Refactor legacy code as encountered
- Follow all patterns from the preamble
- Keep commits focused and atomic
