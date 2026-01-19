# NPC Sheet & System Overhaul Plan

## Overview
Complete ground-up redesign of the NPC sheet and management systems for the Rogue Trader VTT, focusing on GM quality-of-life, modern Foundry V13 features, and dynamic NPC creation/management.

## Current State Analysis

### Current Implementation
- **NPC Sheet**: 112 lines, extends AcolyteSheet (3655 lines)
- **Inheritance**: 95% functionality from player character sheet
- **Data Model**: 87 lines (NPCData extends CreatureTemplate)
- **Templates**: 7 templates reusing Acolyte panels
- **Features**: Minimal - only faction, type, threat level added to full PC system

### Major Issues
1. NPCs carry unnecessary PC complexity (XP, origin paths, acquisitions, dynasty)
2. No horde/swarm mechanics despite having those types
3. Sheet UI identical to PC (not optimized for GM workflow)
4. No quick-creation tools or templates
5. No GM utilities (duplicate, scale threat, batch operations)
6. Static stat entry - no easy overrides
7. No stat block import/export

## Design Philosophy

### GM-Centric Approach
- **Quick Creation**: Multiple paths - templates, import, manual, copy from compendium
- **Easy Modification**: One-click adjustments to threat, stats, gear
- **Batch Operations**: Create multiple NPCs at once, apply changes to groups
- **Dynamic Everything**: No hardcoded values, all stats manually adjustable
- **Visual Clarity**: At-a-glance understanding of NPC capabilities
- **Minimal Clicks**: Common operations accessible without diving into menus

### Technical Approach
- **Modern Stack**: ApplicationV2, PARTS system, TypeDataModel
- **Simplified Data Model**: Remove PC-specific fields, add NPC-specific features
- **Mixin Architecture**: Reuse proven patterns from BaseActorSheet
- **Sophisticated Dialogs**: Rich interactive creation/management tools
- **Performance**: Partial rendering, efficient context preparation

## Proposed Architecture

### Data Model Redesign

**DECISION**: Independent model architecture (does NOT extend CreatureTemplate)

#### NPCData Model (New)
```javascript
// Independent model - only inherit what we need
class NPCData extends ActorDataModel.mixin(
  CommonTemplate,       // Characteristics, wounds, movement (~150 lines)
  HordeTemplate,        // Horde mechanics (separate mixin)
  ModifiersTemplate,    // Bonus/penalty system
  DescriptionTemplate   // Rich text fields
) {
  static defineSchema() {
    return {
      // === CORE IDENTITY ===
      faction: new StringField({ initial: "" }),
      subfaction: new StringField({ initial: "" }),
      allegiance: new StringField({ initial: "" }),
      role: new StringField({
        choices: ["bruiser", "sniper", "caster", "support", "commander", "specialist"],
        initial: "bruiser"
      }),
      type: new StringField({
        choices: ["troop", "elite", "master", "horde", "swarm", "creature", "daemon", "xenos"],
        initial: "troop"
      }),
      threatLevel: new NumberField({ initial: 5, min: 1, max: 30 }),

      // === SKILLS (SPARSE) ===
      trainedSkills: new ObjectField({
        initial: {},
        // Format: { "awareness": { trained: true, bonus: 10 }, "dodge": { plus10: true, bonus: 0 } }
      }),

      // === WEAPONS (HYBRID SYSTEM) ===
      weapons: new SchemaField({
        mode: new StringField({
          choices: ["embedded", "simple"],
          initial: "simple"
        }),
        simple: new ArrayField(new SchemaField({
          name: new StringField({ initial: "" }),
          damage: new StringField({ initial: "1d10" }),
          pen: new NumberField({ initial: 0 }),
          range: new StringField({ initial: "Melee" }),
          rof: new StringField({ initial: "S/-/-" }),
          clip: new NumberField({ initial: 0 }),
          reload: new StringField({ initial: "-" }),
          special: new StringField({ initial: "" })
        }))
        // Embedded mode: uses actor.items (weapon items)
      }),

      // === ARMOUR (HYBRID) ===
      armour: new SchemaField({
        mode: new StringField({
          choices: ["simple", "locations"],
          initial: "simple"
        }),
        total: new NumberField({ initial: 0, min: 0 }), // Simple mode
        // Locations mode: reuse CommonTemplate's location system if needed
      }),

      // === ABILITIES ===
      specialAbilities: new HTMLField({ initial: "" }),

      // === CUSTOM STATS (MANUAL OVERRIDES) ===
      customStats: new SchemaField({
        characteristics: new ObjectField({ initial: {} }), // { "strength": 42 }
        skills: new ObjectField({ initial: {} }),          // { "awareness": 65 }
        combat: new SchemaField({
          initiative: new NumberField(),
          dodge: new NumberField(),
          parry: new NumberField()
        }),
        wounds: new NumberField(),
        movement: new NumberField()
      }),

      // === GM UTILITIES ===
      template: new StringField({ initial: "" }), // UUID of source template
      quickNotes: new HTMLField({ initial: "" }), // GM-only tactical notes
      tags: new ArrayField(new StringField()), // ["minion", "boss", "ranged"]

      // === NOTES ===
      description: new HTMLField({ initial: "" }),
      tactics: new HTMLField({ initial: "" }),
      source: new StringField({ initial: "" }), // Book reference
    };
  }

  // Removed from PC system:
  // ❌ NO experience/XP tracking
  // ❌ NO origin path system
  // ❌ NO insanity/corruption
  // ❌ NO profit factor/acquisitions
  // ❌ NO aptitudes
  // ❌ NO full 48-skill system
  // ❌ NO encumbrance/backpack
  // ❌ NO fate/fatigue (optional: can add if needed)
}
```

#### HordeTemplate Mixin (Separate, Reusable)
```javascript
// src/module/data/actor/mixins/horde-template.mjs
export default class HordeTemplate extends ActorDataModel {
  static defineSchema() {
    return {
      horde: new SchemaField({
        enabled: new BooleanField({ initial: false }), // Toggle horde mode
        magnitude: new SchemaField({
          max: new NumberField({ initial: 100, min: 1 }),
          current: new NumberField({ initial: 100, min: 0 })
        }),
        magnitudeDamage: new ArrayField(new SchemaField({
          amount: new NumberField(),
          source: new StringField(),
          timestamp: new NumberField()
        })),
        traits: new ArrayField(new StringField()), // ["Can't be pinned", "Immune to morale"]
        damageMultiplier: new NumberField({ initial: 1.0 }), // Derived
        sizeModifier: new NumberField({ initial: 0 }) // Derived: token size
      })
    };
  }

  prepareDerivedData() {
    if (!this.horde.enabled) return;

    // Calculate magnitude-based modifiers
    const magnitudePercent = this.horde.magnitude.current / this.horde.magnitude.max;

    // Damage multiplier: 0.5x to 5x based on magnitude
    this.horde.damageMultiplier = Math.ceil(magnitudePercent * 10) / 2;

    // Size modifier: 0-3 based on magnitude (for token scaling)
    this.horde.sizeModifier = Math.floor(magnitudePercent * 3);
  }
}
```

**Why Independent Model?**
- Avoids inheriting 796 lines of PC-specific CreatureTemplate code
- No need to delete/override unwanted fields
- Cleaner, more maintainable architecture
- Only implement what NPCs actually need
- Easier to test and reason about

### NPC Sheet Redesign

#### Sheet Structure (NPCSheetV2)
```javascript
class NPCSheetV2 extends BaseActorSheet {
  static PARTS = {
    header: "npc/header.hbs",           // Portrait, name, vitals, quick actions
    tabs: "npc/tabs.hbs",               // Tab navigation
    overview: "npc/tab-overview.hbs",   // At-a-glance stats, quick rolls
    combat: "npc/tab-combat.hbs",       // Weapons, armour, combat stats
    abilities: "npc/tab-abilities.hbs", // Talents, traits, special abilities
    notes: "npc/tab-notes.hbs"          // Description, tactics, GM notes
  }
}
```

#### 5-Tab Layout (DECISION: User Selected)

**1. Overview Tab** (Default - Dashboard View):
- **Header**: Portrait, name, faction, role, type, threat badge
- **Quick Actions Bar**: Duplicate, Scale Threat, Export, Convert to Template
- **Vital Stats HUD**: Wounds (current/max), magnitude bar (if horde)
- **Combat Summary Panel**: Initiative bonus, dodge, parry, armor rating
- **Characteristics HUD**: 10 stats in compact display, click-to-roll
- **Quick Weapons** (pinned 3-5): Attack buttons with damage/pen shown
- **Pinned Abilities**: 3-5 key talents/traits flagged as important
- **GM Quick Notes**: Collapsed rich text panel

**2. Combat Tab**:
- **Full Weapons List**:
  - Simple mode: Editable weapon rows (name, damage, pen, range, special)
  - Embedded mode: Item cards with drag-drop from compendium
  - Toggle button to switch modes
- **Armor Display**:
  - Simple mode: Single total AP value
  - Locations mode: By-location breakdown (head, body, arms, legs)
  - Toggle button to switch modes
- **Combat Stats**: Dodge, parry, initiative (with breakdowns)
- **Combat Modifiers Panel**: Active bonuses/penalties from talents/traits
- **Actions**: Quick buttons for dodge, parry, initiative rolls

**3. Skills & Characteristics Tab** (Combined):
- **Characteristics Section** (top):
  - All 10 characteristics with detailed view
  - Editable base/modifier/unnatural
  - Custom stat override toggles
  - Progress indicators
- **Trained Skills Section** (bottom):
  - Only skills with training shown
  - Add Skill button (dropdown or autocomplete)
  - Remove skill button
  - Filters: by characteristic, by name search
  - Training level indicators (trained/+10/+20)

**4. Abilities Tab**:
- **Talents Section**:
  - Simplified list (no XP costs)
  - Name, tier, effect description
  - Pin/unpin for overview dashboard
- **Traits Section**:
  - Creature/elite traits
  - Drag from compendium or create custom
- **Special Abilities Section**:
  - Psychic powers, special attacks
  - Rich text descriptions
  - Usage tracking (if limited use)
- **Filters**: By category, search by name

**5. Notes & Metadata Tab**:
- **Description Panel**: Rich text editor (appearance, lore, background)
- **Tactics Panel**: GM-only combat strategy notes
- **Source Reference**: Book name, page number, link
- **Tags Section**: Color-coded labels for categorization/filtering
- **Template Info**: UUID link to source template (if created from template)
- **Custom Metadata**: Free-form key-value pairs

#### Modern UI Features

1. **Quick-Action Header**:
   - Duplicate button
   - Scale threat (dialog to adjust all stats by %)
   - Convert to template
   - Export stat block
   - Apply damage/healing
   - Toggle horde mode

2. **Interactive Stat Blocks**:
   - Click characteristic to roll
   - Click weapon to attack
   - Click skill to test
   - Hover for detailed breakdowns

3. **Manual Override System**:
   - Every stat has "custom" toggle
   - Opens inline editor for manual value
   - Visual indicator (icon) when customized
   - Reset to calculated value option

4. **Magnitude System** (Hordes):
   - Visual magnitude bar (0-100+)
   - Damage taken converts to magnitude loss
   - Auto-calculate size/threat by magnitude
   - Magnitude affects damage output

5. **Tag System**:
   - Color-coded tags for categorization
   - Filter NPCs in compendium/world by tags
   - Quick-apply common tag sets (minions, bosses, etc.)

### NPC Creation System

#### Multi-Path Creation Dialog (NPCCreationWizard)

**Path 1: From Template**
1. Browse NPC templates (compendium)
2. Select base template (Ork Boy, Imperial Guard, etc.)
3. Customize stats (threat, weapons, abilities)
4. Apply modifications (tougher, faster, etc.)
5. Confirm and create

**Path 2: Quick Create**
1. Enter name, type, threat level
2. Auto-generate stats from threat level
3. Select equipment preset (ranged, melee, mixed)
4. Add special abilities (dropdown)
5. Confirm and create

**Path 3: Import Stat Block**
1. Paste text stat block (regex parser)
2. Parse characteristics, skills, weapons, etc.
3. Review parsed data
4. Adjust as needed
5. Confirm and create

**Path 4: Duplicate & Modify**
1. Right-click existing NPC → Duplicate
2. Opens dialog with current stats
3. Modify name, threat, stats
4. Confirm and create

**Path 5: Batch Create**
1. Select template
2. Enter count (e.g., "5 Ork Boyz")
3. Name pattern (Ork Boy 1, Ork Boy 2, etc.)
4. Apply random variation (±10% to stats)
5. Create all at once

#### Template System

**NPC Template Item Type** (new):
- Category (humanoid, xenos, daemon, creature)
- Base stats (characteristics, skills, weapons)
- Equipment loadouts
- Special abilities
- Scaling rules (how stats change with threat)

**Compendium: rt-npc-templates**:
- Pre-built templates for common enemies
- Organized by faction/type
- Drag-and-drop to create instance
- Update template → update instances option

### Threat Scaling System

**Auto-Scaling Based on Threat Level**:
```javascript
function calculateStatByThreat(baseStat, threatLevel) {
  // Threat 1-5: Minor enemies
  // Threat 6-10: Standard enemies
  // Threat 11-15: Tough enemies
  // Threat 16-20: Elite enemies
  // Threat 21+: Boss enemies

  return baseStat + (threatLevel * scalingFactor);
}
```

**Scale Dialog**:
- Adjust threat level (slider)
- Preview stat changes in real-time
- Option to scale: All / Stats Only / Combat Only
- Confirm to apply

### Advanced GM Features

#### 1. NPC Manager Application
- Tabletop-style NPC browser
- Filter by: faction, type, threat, tags
- Sort by: name, threat, type
- Bulk operations: delete, tag, export
- Quick-create button
- Folder organization

#### 2. Encounter Builder
- Add NPCs to encounter
- Calculate total threat rating
- Adjust threat dynamically
- Save encounter as template
- Export to combat tracker

#### 3. Loot Generator
- Based on NPC type/threat
- Random or fixed loot tables
- Add to NPC inventory
- Transfer to PC on death

#### 4. Stat Block Export/Import
- Export to formatted text
- Export to JSON
- Import from other systems (via adapters)
- Share via clipboard

#### 5. Combat Utilities
- Mass initiative roll
- Apply area damage to multiple NPCs
- Quick wounds adjustment (slider)
- Magnitude damage tracking (hordes)

#### 6. Token Integration
- Auto-generate token from portrait
- Auto-scale token by size/threat
- Color-code by faction
- Vision/light based on creature type

## Implementation Plan

**USER PRIORITY**: Quick create, Horde mechanics, Threat scaling (templates are lower priority)

### Phase 0: Proof of Concept (NEW - START HERE)
**Goal**: Validate architecture before full implementation

**Files to Create:**
- `src/module/data/actor/npc-v2.mjs` - Minimal NPCData schema (just core fields)
- `src/module/data/actor/mixins/horde-template.mjs` - HordeTemplate mixin
- `src/module/applications/actor/npc-sheet-v2.mjs` - Minimal 1-tab sheet
- `src/templates/actor/npc-v2/npc-sheet-v2.hbs` - Single template (overview only)
- `src/scss/actor/_npc-sheet-v2.scss` - Basic styling

**Tasks:**
1. Create minimal NPCData model (characteristics, wounds, faction, type, threat only)
2. Create HordeTemplate mixin (magnitude system)
3. Create simple NPCSheetV2 with overview tab only
4. Test creating 2-3 NPCs manually
5. Test horde magnitude tracking
6. Validate mixin architecture works
7. Test rendering performance

**Success Criteria:**
- Can create NPC with manual stat entry
- Sheet renders in < 100ms
- Horde magnitude updates correctly
- No console errors
- GMs can use NPCs in combat

**Deliverable**: Working prototype to validate approach before full build

---

### Phase 1: Complete Data Model & Document
**Builds on**: Phase 0 proof of concept

**Files to Expand:**
- `src/module/data/actor/npc-v2.mjs` - Complete schema (add skills, weapons, armour)
- `src/module/documents/npc-v2.mjs` - RogueTraderNPCV2 document class

**Files to Modify:**
- `src/template.json` - Update npc type schema fully
- `src/module/data/_module.mjs` - Export models
- `src/module/documents/_module.mjs` - Export documents

**Tasks:**
1. Expand NPCData schema:
   - Add trainedSkills (sparse map, not full 48)
   - Add weapons (hybrid: simple + embedded mode)
   - Add armour (simple total + location mode)
   - Add customStats (manual override system)
   - Add tags, quickNotes, source reference
2. Implement computed properties:
   - `get typeLabel()` - Localized type name
   - `get threatSummary()` - "Elite (Threat 12)"
   - `get threatDescription()` - Trivial/Dangerous/Deadly/etc.
   - `get isHorde()` - Check if type is horde/swarm
   - `get effectiveStats()` - Merge base + custom overrides
3. Add skill calculation methods:
   - `getSkillTarget(skillName)` - Calculate skill target number
   - `addTrainedSkill(name, characteristic, level)` - Add skill
   - `removeSkill(name)` - Remove skill
4. Add weapon management:
   - `switchWeaponMode(mode)` - Toggle simple/embedded
   - `addSimpleWeapon(data)` - Add plain weapon
   - `promoteSimpleWeapon(index)` - Convert to item
5. Implement RogueTraderNPCV2 document:
   - Roll methods (rollCharacteristic, rollSkill, rollAttack)
   - Damage application (applyDamage, with horde magnitude loss)
   - Threat scaling (scaleToThreat, adjustStatsByPercent)
   - Token auto-config (configureToken based on size/faction)
   - Horde conversion (convertToSingleEnemy when magnitude < 10)
6. Add data preparation flow:
   - `prepareBaseData()` - Initialize structures
   - `prepareDerivedData()` - Calculate stats, skills, combat values
   - Handle custom stat overrides
7. Add validation helpers

### Phase 2: Complete NPC Sheet (5 Tabs)
**Files to Expand:**
- `src/module/applications/actor/npc-sheet-v2.mjs` - Add all 5 tabs

**Files to Create:**
- `src/templates/actor/npc-v2/header.hbs` - Header with quick actions
- `src/templates/actor/npc-v2/tabs.hbs` - 5-tab navigation
- `src/templates/actor/npc-v2/tab-overview.hbs` - Overview dashboard (expand from Phase 0)
- `src/templates/actor/npc-v2/tab-combat.hbs` - Combat details
- `src/templates/actor/npc-v2/tab-skills.hbs` - Skills & characteristics
- `src/templates/actor/npc-v2/tab-abilities.hbs` - Talents, traits, powers
- `src/templates/actor/npc-v2/tab-notes.hbs` - Notes & metadata
- `src/templates/actor/npc-v2/panels/vital-stats-panel.hbs` - Reusable panel
- `src/templates/actor/npc-v2/panels/magnitude-panel.hbs` - Horde magnitude
- `src/templates/actor/npc-v2/panels/quick-weapons-panel.hbs` - Pinned weapons
- `src/templates/actor/npc-v2/panels/characteristics-hud.hbs` - Char display
- `src/scss/actor/_npc-sheet-v2.scss` - Complete styling

**Files to Delete (Legacy Code):**
- `src/module/applications/actor/npc-sheet.mjs` - Old 112-line sheet
- `src/module/data/actor/npc.mjs` - Old 87-line model (keep for migration reference)
- `src/module/documents/npc.mjs` - Old 21-line document (keep for migration reference)
- `src/templates/actor/npc/header.hbs` - Old header
- `src/templates/actor/npc/tabs.hbs` - Old tabs
- `src/templates/actor/npc/tab-combat.hbs` - Old combat
- `src/templates/actor/npc/tab-abilities.hbs` - Old abilities
- `src/templates/actor/npc/tab-gear.hbs` - Old gear
- `src/templates/actor/npc/tab-powers.hbs` - Old powers
- `src/templates/actor/npc/tab-notes.hbs` - Old notes

**Tasks:**
1. Expand NPCSheetV2 class:
   - Extend BaseActorSheet (inherits mixins: Tooltip, VisualFeedback, CollapsiblePanel, ContextMenu)
   - Implement PARTS system (header, tabs, 5 tab contents)
   - Add action handlers (30+ actions for quick operations)
2. Create header with quick actions:
   - Duplicate, scale threat, export, convert to template
   - Portrait editor
   - Name/faction/type inline editing
   - Threat badge with visual indicator
3. Implement Overview tab:
   - Vital stats panel (wounds, magnitude if horde)
   - Combat summary (initiative, dodge, parry, armor)
   - Characteristics HUD (compact, click-to-roll)
   - Quick weapons panel (3-5 pinned attacks)
   - Pinned abilities panel
   - GM quick notes (collapsible)
4. Implement Combat tab:
   - Weapons list (hybrid system: simple editable rows OR item cards)
   - Mode toggle button (simple ↔ embedded)
   - Armor display (simple total OR by-location, with toggle)
   - Combat stats breakdown
   - Combat modifiers panel
   - Action buttons (roll initiative, dodge, parry)
5. Implement Skills & Characteristics tab:
   - Full characteristics section (all 10 stats, detailed editing)
   - Custom stat override toggles (inline editors)
   - Trained skills section (sparse list)
   - Add/remove skill buttons
   - Skill filters (by char, by name)
6. Implement Abilities tab:
   - Talents list (simple, no XP costs)
   - Traits list
   - Special abilities section
   - Pin/unpin buttons for overview
   - Filters and search
7. Implement Notes & Metadata tab:
   - Description editor (rich text)
   - Tactics editor (rich text)
   - Source reference field
   - Tags editor (add/remove color-coded tags)
   - Template info display
8. Implement magnitude tracker UI:
   - Visual progress bar
   - Current/max display
   - Range slider for adjustment
   - Damage multiplier indicator
   - Size modifier indicator
   - Auto-convert warning (< 10 magnitude)
9. Implement custom stat override UI:
   - Toggle icon next to each stat
   - Inline editor on toggle
   - Reset to calculated value button
   - Visual indicator when stat is customized
10. Style with modern, sleek design:
    - Clean layout, generous whitespace
    - Color-coded threat levels
    - Faction-themed accents (optional)
    - Smooth transitions and animations
    - Responsive layout (1 column on narrow, 2-3 on wide)
11. Add state persistence:
    - Save expanded/collapsed panels
    - Save scroll positions
    - Save tab selection
    - Save weapon/armor mode toggles

### Phase 3: Quick Create Dialog (USER PRIORITY)
**Focus**: Fast NPC creation with threat-based auto-generation (90% use case)

**Files to Create:**
- `src/module/applications/npc/quick-create-dialog.mjs` - Quick create form
- `src/module/applications/npc/threat-calculator.mjs` - Stat generation from threat
- `src/templates/dialogs/npc-quick-create.hbs` - Dialog template
- `src/scss/dialogs/_npc-quick-create.scss` - Dialog styling

**Tasks:**
1. Create QuickCreateDialog (ApplicationV2):
   - Extends DialogRT for promise-based workflow
   - Simple form: name, type, role, faction, threat level
   - Equipment preset dropdown (ranged, melee, mixed, caster, support)
   - Horde toggle (enable magnitude system)
   - Preview panel (live stat calculation as threat changes)
2. Implement ThreatCalculator utility:
   - `generateStatsFromThreat(threatLevel)` - Auto-calculate characteristics
   - Scaling formulas:
     - Threat 1-5: Minor enemies (chars 20-35)
     - Threat 6-10: Standard enemies (chars 30-45)
     - Threat 11-15: Tough enemies (chars 40-55)
     - Threat 16-20: Elite enemies (chars 50-65)
     - Threat 21+: Boss enemies (chars 60-75)
   - `generateWoundsFromThreat(threatLevel)` - Wounds calculation
   - `generateSkillsFromRole(role, threatLevel)` - Auto-assign trained skills
   - `generateWeaponsFromPreset(preset, threatLevel)` - Auto-create weapons
   - `generateArmorFromThreat(threatLevel)` - AP calculation
3. Implement equipment presets:
   - Ranged: Ranged weapon + light armor + awareness/dodge
   - Melee: Melee weapon + medium armor + dodge/parry
   - Mixed: Both weapons + medium armor + balanced skills
   - Caster: Psychic powers + light armor + WP focus
   - Support: Utility gear + varied skills
4. Add preview panel:
   - Live update as threat slider changes
   - Show calculated stats (characteristics, wounds, skills, weapons)
   - "What you'll get" summary
5. Add validation:
   - Name required
   - Threat level 1-30
   - Valid type/role selection
6. Connect to NPCData creation:
   - Build complete NPC data object
   - Create actor with generated stats
   - Open sheet on creation
7. Add to Actor directory:
   - "Create NPC" button in actors sidebar
   - Opens quick create dialog

### Phase 4: Threat Scaling Dialog (USER PRIORITY)
**Focus**: Adjust existing NPC threat on-the-fly

**Files to Create:**
- `src/module/applications/npc/threat-scaler-dialog.mjs` - Scaling dialog
- `src/templates/dialogs/threat-scaler.hbs` - Dialog template
- `src/scss/dialogs/_threat-scaler.scss` - Dialog styling

**Tasks:**
1. Create ThreatScalerDialog (ApplicationV2):
   - Takes existing NPC as input
   - Threat level slider (1-30)
   - Preview panel showing stat changes
   - Scaling options checkboxes:
     - Scale characteristics
     - Scale wounds
     - Scale skills
     - Scale weapon damage
     - Scale armor
   - Percentage-based scaling (± X% per threat level)
2. Implement scaling calculation:
   - `calculateScaledStats(currentThreat, newThreat, options)` - Calculate changes
   - Formula: `newValue = baseValue * (1 + (threatDelta * scaleFactor))`
   - Scale factor: ~5-10% per threat level
   - Minimum/maximum caps (chars 1-100, wounds 1-999)
3. Add live preview:
   - Table showing: Stat | Current | → | New
   - Color code: green (increase), red (decrease), gray (no change)
   - Real-time update as slider moves
4. Add validation:
   - Warn if threat change is extreme (±10 levels)
   - Confirm before applying large changes
5. Integrate with NPC sheet:
   - "Scale Threat" button in header quick actions
   - Opens dialog with current NPC
   - Apply changes on confirm
6. Add to document class:
   - `scaleToThreat(newThreat, options)` method
   - Updates actor data with scaled values

### Phase 5: Migration & Compatibility (CRITICAL)
**Focus**: Ensure backward compatibility with existing NPCs

**Files to Create:**
- `src/module/migrations/migrate-npc-v2.mjs` - Migration script
- `src/module/migrations/npc-compatibility-layer.mjs` - Fallback rendering

**Tasks:**
1. Create migration script:
   - Detect old NPC format (version field)
   - Extract trained skills from full 48-skill system
   - Convert embedded weapon items OR parse specialAbilities text for simple weapons
   - Detect horde type → enable horde mode
   - Map old fields to new schema
   - Preserve custom modifications
   - Handle missing fields gracefully
2. Implement data extraction helpers:
   - `extractTrainedSkills(oldSkills)` - Get only trained from full system
   - `extractCustomStats(oldData, newData)` - Detect manual overrides
   - `convertWeaponsToSimple(items, text)` - Extract weapon data
   - `detectHordeMode(type, traits)` - Auto-enable horde if appropriate
3. Add migration testing:
   - Test with 8 bestiary NPCs from compendium
   - Test with custom user NPCs (if available)
   - Validate all data migrates correctly
   - Ensure no data loss
4. Create compatibility layer:
   - If migration fails, NPCSheetV2 falls back to read-only mode
   - Display old data in simplified view
   - Warning banner: "This NPC uses old format. Click to migrate."
   - Manual migration button
5. Add migration UI:
   - World migration dialog (migrate all NPCs at once)
   - Individual migration (per-NPC basis)
   - Progress bar for batch migration
   - Rollback option (backup before migration)
6. Document migration process:
   - GM guide for migration
   - What changes to expect
   - How to handle edge cases

### Phase 6: Advanced GM Tools (Lower Priority)
**Files to Create:**
- `src/module/applications/npc/npc-manager.mjs` - NPC browser (optional)
- `src/module/applications/npc/encounter-builder.mjs` - Encounter planner
- `src/module/applications/npc/stat-block-exporter.mjs` - Export utility
- `src/module/applications/npc/stat-block-parser.mjs` - Import parser
- `src/module/applications/npc/batch-create-dialog.mjs` - Batch creation
- `src/templates/apps/encounter-builder.hbs` - Encounter UI
- `src/scss/apps/_encounter-builder.scss` - Encounter styling

**Tasks (Implement as Needed):**
1. **Stat Block Exporter**:
   - Export NPC to formatted text (for sharing with players)
   - Export to JSON (for backup/sharing with other GMs)
   - Copy to clipboard button
2. **Stat Block Parser** (Complex):
   - Support multiple formats (JSON, structured text, freeform)
   - Pattern matching for common stat block layouts
   - Heuristics for PDF copy-paste
   - Validation and preview before import
3. **Batch Creation**:
   - Create X identical NPCs from template/existing NPC
   - Name pattern (e.g., "Ork Boy 1", "Ork Boy 2")
   - Random variation (±10% to stats for variety)
   - Create all at once
4. **Encounter Builder** (First-class app):
   - Drag NPCs from compendium/world
   - Calculate total threat vs party level
   - Encounter difficulty rating (trivial/easy/moderate/hard/deadly)
   - Save encounter as template
   - Deploy to combat tracker
   - Action economy display
5. **NPC Manager** (Optional):
   - Browse world NPCs with filters
   - Sort by faction, type, threat
   - Bulk operations (tag, delete, export)
   - Folder organization
6. **Token Integration**:
   - Auto-configure token on creation (size, tint, vision, bars)
   - Token HUD for magnitude (quick adjustment)
   - Mass initiative rolling

### Phase 7: Template System (Lower Priority)
**Files to Create:**
- `src/module/data/item/npc-template.mjs` - Template data model
- `src/module/applications/item/npc-template-sheet.mjs` - Template editor
- `src/module/applications/npc/template-selector.mjs` - Template browser
- `src/templates/item/npc-template-sheet.hbs` - Template UI
- `src/templates/dialogs/npc-template-selector.hbs` - Browser UI
- `src/scss/item/_npc-template-sheet.scss` - Template styling
- `src/packs/rt-npc-templates/_source/*.json` - Template compendium (20+ entries)

**Tasks:**
1. Define NPCTemplate item type:
   - Schema similar to NPCData but as "template"
   - Scaling rules (how stats change with threat)
   - Equipment loadouts
   - Variants (e.g., Ork Boy vs Ork Boy Heavy)
2. Create template editor UI:
   - Similar to NPC sheet but focused on template authoring
   - Scaling rule configuration (formula editor)
   - Preview at different threat levels
3. Create template browser:
   - Filter by faction, type, category
   - Search by name
   - Drag-and-drop to create instance
   - Preview template details
4. Build template compendium (20+ templates):
   - Imperial Guard (standard, veteran, officer)
   - Orks (boy, nob, warboss)
   - Chaos cultists (standard, fanatic, champion)
   - Eldar (guardian, ranger, aspect warrior)
   - Daemons (lesser, greater)
   - Tyranids (gaunt, warrior, carnifex)
5. Implement instantiation:
   - `createFromTemplate(templateUUID, options)` - Create NPC from template
   - Apply threat level modifier
   - Customize name/stats
   - Link back to source template
6. Add "Save as Template" to NPC sheet:
   - Export current NPC as template
   - Save to compendium or world
7. Add "Create from Template" path:
   - Extend QuickCreateDialog with template option
   - Or create separate TemplateCreateDialog

### Phase 8: Integration, Polish & Cleanup

**Files to Modify:**
- `src/module/hooks/hooks-manager.mjs` - Register NPCSheetV2
- `src/module/rogue-trader.mjs` - Export new classes
- `src/lang/en.json` - Add localization strings (100+ new strings)
- `src/scss/rogue-trader.scss` - Import new NPC stylesheets
- `src/template.json` - Finalize npc type schema

**Files to Delete (Legacy Code):**
- `src/module/applications/actor/npc-sheet.mjs` (112 lines - OLD)
- `src/templates/actor/npc/header.hbs` (OLD)
- `src/templates/actor/npc/tabs.hbs` (OLD)
- `src/templates/actor/npc/tab-combat.hbs` (OLD)
- `src/templates/actor/npc/tab-abilities.hbs` (OLD)
- `src/templates/actor/npc/tab-gear.hbs` (OLD)
- `src/templates/actor/npc/tab-powers.hbs` (OLD)
- `src/templates/actor/npc/tab-notes.hbs` (OLD)

**Note**: Keep old `src/module/data/actor/npc.mjs` and `src/module/documents/npc.mjs` temporarily for migration reference, delete after migration is stable.

**Tasks:**
1. Register NPCSheetV2:
   - Set as default sheet for "npc" type
   - Unregister old NpcSheet
2. Register NPCTemplate item (if Phase 7 complete)
3. Add all localization strings:
   - Tab labels, field labels, button text
   - Tooltips, help text
   - Error messages, validation messages
   - Threat descriptions
4. Import stylesheets:
   - `@import "actor/npc-sheet-v2";`
   - `@import "dialogs/npc-quick-create";`
   - `@import "dialogs/threat-scaler";`
5. Create documentation:
   - GM guide for NPC creation
   - Quick create walkthrough
   - Horde mechanics explanation
   - Threat scaling guide
   - Migration guide
6. Add tutorial tooltips:
   - First-time user hints
   - Feature callouts on sheet
7. Performance optimization:
   - Benchmark sheet rendering (< 100ms target)
   - Optimize magnitude updates (debouncing)
   - Efficient partial rendering
8. Accessibility improvements:
   - Keyboard navigation
   - Screen reader labels
   - Focus management
   - ARIA attributes
9. Final testing:
   - Create 50 NPCs via quick create
   - Test horde mechanics in combat
   - Test threat scaling
   - Test migration with all compendium NPCs
   - Performance test with 20+ tokens
10. Delete legacy code (after confirming migration works)

## Verification & Testing

### Unit Testing
1. NPCData model calculations (threat, magnitude, stats)
2. Horde damage calculations
3. Modifier system (manual overrides)
4. Template instantiation
5. Stat block parser

### Integration Testing
1. NPC creation via all 5 paths
2. Threat scaling
3. Template system (create, edit, instantiate)
4. Migration from old NPC format
5. Sheet rendering performance
6. Horde mechanics in combat

### User Acceptance Testing (GM Workflow)
1. Create 10 NPCs for an encounter in under 2 minutes
2. Adjust threat of existing NPC
3. Apply damage to horde (magnitude loss)
4. Export stat block to share with player
5. Duplicate and modify NPC
6. Create custom template
7. Batch create 20 identical NPCs with variation

## Success Criteria

### Phase 0 (Proof of Concept)
- [ ] Can create NPC with manual stat entry
- [ ] Sheet renders in < 100ms
- [ ] Horde magnitude updates correctly
- [ ] No console errors
- [ ] Architecture validated (independent model, mixins work)

### Phase 1-2 (Core Functionality)
- [ ] All PC-specific fields removed from NPC data model
- [ ] Hybrid weapons system working (simple + embedded modes)
- [ ] Hybrid armor system working (simple + locations modes)
- [ ] Custom stat overrides functional
- [ ] 5-tab sheet layout complete and responsive
- [ ] Modern, sleek UI with Foundry V13 features

### Phase 3-4 (GM Priority Features)
- [ ] NPC creation in < 30 seconds via quick-create
- [ ] Threat-based stat generation accurate and balanced
- [ ] Threat scaling functional with live preview
- [ ] All stats manually overridable with UI toggles

### Phase 5 (Migration)
- [ ] 100% backward compatibility via migration
- [ ] All 8 compendium NPCs migrate successfully
- [ ] No data loss during migration
- [ ] Fallback read-only mode for failed migrations

### Phase 6-8 (Polish & Advanced)
- [ ] Horde mechanics fully functional (magnitude, damage, auto-convert)
- [ ] Performance: Sheet renders in < 100ms
- [ ] Accessibility: Keyboard navigation functional
- [ ] Documentation complete
- [ ] No legacy code remaining (old files deleted)

### Optional (If Time Permits)
- [ ] Template system with 20+ pre-built templates
- [ ] Stat block export/import functional
- [ ] Encounter builder operational
- [ ] Token auto-configuration working

## Future Enhancements (Post-Launch)
- AI-powered stat block parser (ML-based)
- Encounter balancing recommendations
- Loot table integration
- NPC advancement system (level up enemies)
- Behavior AI (automated tactics)
- Voice line integration
- 3D token support

---

**This plan represents a complete ground-up redesign** of the NPC system with GM quality-of-life as the primary focus. Every aspect is designed to minimize clicks, maximize flexibility, and leverage modern Foundry V13 capabilities.
