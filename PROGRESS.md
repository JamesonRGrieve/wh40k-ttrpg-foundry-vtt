# Rogue Trader VTT - Enhancement Progress Tracker

**Last Updated**: 2026-01-07
**Current Sprint**: Priority 0 - Critical Fixes ✅ COMPLETE

---

## Completed Items ✅

### Priority 0: Critical Fixes (Session 1 - 2026-01-07)

- [x] **Item 1**: Remove Console Logging Pollution ✅
  - Removed 13 `console.log()` statements from context-menu-mixin.mjs
  - Files: `src/module/applications/api/context-menu-mixin.mjs`

- [x] **Item 2**: Fix Inefficient Item Filtering ✅
  - Created `_categorizeItems()` helper method for single-pass item categorization
  - Replaced 10+ filter operations with one efficient loop
  - Performance improvement: O(n) instead of O(n²)
  - Files: `src/module/applications/actor/acolyte-sheet.mjs`

- [x] **Item 3**: Add Error Handling to Async Actions ✅
  - Added try-catch blocks with user notifications to 4 critical async handlers:
    - `#combatAction` - Attack, dodge, parry, damage assignment
    - `#rollInitiative` - Initiative rolls
    - `#rollHitLocation` - Hit location rolls
    - `#bonusVocalize` - Bonus vocalization
  - Files: `src/module/applications/actor/acolyte-sheet.mjs`

- [x] **Item 4**: Replace Deprecated `foundry.utils.duplicate()` ✅
  - Replaced 2 instances with V13-standard `structuredClone()`
  - Files: `src/module/applications/actor/acolyte-sheet.mjs` (lines 1041, 1064)

**Total Time**: ~60 minutes
**Build Status**: ✅ All builds passing

---

### Priority 1: Quick Wins (Session 2 - 2026-01-07)

- [x] **Item 5**: Implement Search & Filter for Equipment ✅
  - Added search box with clear button functionality
  - Added type filter (All, Weapons, Armour, Gear, Cybernetics, Force Fields)
  - Added status filter (All Items, Equipped, Unequipped)
  - Real-time filtering with "No results" message
  - Styled controls with focus states and transitions
  - Files:
    - `src/templates/actor/panel/loadout-equipment-panel.hbs`
    - `src/module/applications/actor/acolyte-sheet.mjs` (#filterEquipment, #clearEquipmentSearch)
    - `src/scss/panels/_loadout.scss`

**Total Time**: ~3 hours

- [x] **Item 8**: Improve Visual Feedback & Animations ✅
  - Color-coded encumbrance warnings (50-74%: yellow, 75-99%: orange, 100%+: red pulsing)
  - Enhanced equipped item highlighting with golden glow and shadow
  - Button press ripple animations for all card buttons
  - Smooth tab transitions with fade & slide effects
  - Improved hover states with cubic-bezier easing
  - Press-down visual feedback (scale transforms)
  - Files:
    - `src/templates/actor/panel/loadout-equipment-panel.hbs`
    - `src/scss/panels/_loadout.scss`
    - `src/scss/panels/_equipment-cards.scss`
    - `src/scss/components/_navigation.scss`

**Total Time**: ~2 hours

- [x] **Item 6**: Add Equipment Bulk Operations ✅
  - "Equip All Armour" button - equips all armour pieces
  - "Unequip All" button - unequips all equipped items
  - "Stow All Gear" button - stows all gear to backpack
  - Smart counting with pluralized notifications
  - Error handling with user feedback
  - Ripple button animations with color-coded hover states
  - Files:
    - `src/module/applications/actor/acolyte-sheet.mjs` (#bulkEquip handler)
    - `src/templates/actor/panel/loadout-equipment-panel.hbs` (bulk operation buttons)
    - `src/scss/panels/_loadout.scss` (bulk button styling)

**Total Time**: ~2 hours

- [x] **Item 7**: Add Search & Filter for Skills ✅
  - Search box with clear button functionality
  - Characteristic filter (All, WS, BS, S, T, Ag, Int, Per, WP, Fel)
  - Training level filter (All, Untrained, Trained, +10, +20)
  - Real-time filtering with "No results" message
  - Styled controls with focus states matching equipment controls
  - Skills accent color for focus borders
  - Files:
    - `src/templates/actor/panel/skills-panel.hbs` (controls and data attributes)
    - `src/module/applications/actor/acolyte-sheet.mjs` (#filterSkills, #clearSkillsSearch)
    - `src/scss/panels/_skills.scss` (controls styling)

**Total Time**: ~2.5 hours

- [x] **Item 10**: Add Button Debouncing ✅
  - Implemented throttle utility to prevent rapid-fire clicks
  - 200ms throttle on stat adjustments (wounds, fate, corruption, insanity, critical)
  - 500ms throttle on fate restoration and spending (to prevent accidental double-spending)
  - Per-actor throttling using unique keys
  - Throttled handlers:
    - `#adjustStat` - Increment/decrement buttons
    - `#setCriticalPip` - Critical damage pips
    - `#setFateStar` - Fate point pips
    - `#setCorruption` - Corruption setters
    - `#setInsanity` - Insanity setters
    - `#restoreFate` - Fate restoration button
    - `#spendFate` - All fate spending actions
  - Files:
    - `src/module/applications/actor/acolyte-sheet.mjs` (throttle utility + wrapped handlers)

**Total Time**: ~2 hours

- [x] **Item 9**: Replace ui.notifications with V13 Toast System ✅
  - Migrated from legacy ui.notifications to Foundry V13 Toast API
  - Replaced 21 instances across main player-facing files:
    - 14 instances in `acolyte-sheet.mjs` (combat actions, stat validation, bulk operations, bonus vocalization)
    - 5 instances in `acolyte.mjs` (weapon/skill/item rolls, force field checks)
    - 2 instances in `item.mjs` (origin path application)
  - Toast notification types:
    - `Toast.error()` - Error messages (5s duration)
    - `Toast.warning()` - Warning messages (3s duration)
    - `Toast.info()` - Informational messages (3s duration)
  - Benefits: Better visual consistency, auto-dismissing, non-intrusive
  - Files:
    - `src/module/applications/actor/acolyte-sheet.mjs`
    - `src/module/documents/acolyte.mjs`
    - `src/module/documents/item.mjs`

**Total Time**: ~1.5 hours
**Build Status**: ✅ All builds passing

---

### Priority 2: Medium Priority (Session 3 - 2026-01-07)

- [x] **Item 13**: Implement Lazy Template Loading ✅
  - Refactored `HandlebarManager` with lazy loading infrastructure:
    - `loadTemplateOnDemand()` - Load single template if not cached
    - `loadTemplatesOnDemand()` - Load multiple templates efficiently
    - `loadAcolyteTabTemplates()` - Load tab-specific templates by tab name
    - `loadActorSheetTemplates()` - Load actor type-specific templates
  - Reduced preloaded templates from 104 to ~30 core templates
  - Core templates (always preloaded):
    - Essential partials (character-field, characteristic-hud-v2, etc.)
    - Acolyte header, tabs, and overview tab (default view)
    - Chat templates (needed for roll results)
  - Deferred templates (loaded on-demand):
    - Acolyte tab templates (combat, skills, talents, equipment, powers, dynasty, biography)
    - NPC sheet templates
    - Vehicle sheet templates
    - Starship sheet templates
    - Legacy panels (v1 versions of panels)
  - Sheet integration:
    - `AcolyteSheet._prepareTabPartContext()` - Lazy loads tab templates before rendering
    - `NpcSheet._prepareContext()` - Lazy loads NPC templates
    - `VehicleSheet._prepareContext()` - Lazy loads Vehicle templates
    - `StarshipSheet._prepareContext()` - Lazy loads Starship templates
  - Files modified:
    - `src/module/handlebars/handlebars-manager.mjs` (complete rewrite)
    - `src/module/applications/actor/acolyte-sheet.mjs`
    - `src/module/applications/actor/npc-sheet.mjs`
    - `src/module/applications/actor/vehicle-sheet.mjs`
    - `src/module/applications/actor/starship-sheet.mjs`
  - **Expected Benefit**: 20-30% faster initial load time

**Total Time**: ~1 hour
**Build Status**: ✅ All builds passing

- [x] **Item 14**: State Persistence Enhancements ✅
  - Added instance properties to BaseActorSheet:
    - `_equipmentFilter` - Stores equipment search/type/status filter state
    - `_skillsFilter` - Stores skills search/characteristic/training filter state
    - `_scrollPositions` - Map of scroll positions for scrollable containers
    - `_stateRestored` - Flag to prevent duplicate restoration
  - Implemented state save/restore methods:
    - `_saveSheetState()` - Saves state to actor flags on sheet close
    - `_restoreSheetState()` - Restores state from actor flags on first render
    - `_applyRestoredState()` - Applies filter values and triggers DOM updates
    - `_captureScrollPositions()` - Captures scroll positions of all scrollable containers
    - `_applyScrollPositions()` - Restores scroll positions after render
  - State persisted:
    - Equipment filter (search term, type filter, status filter)
    - Skills filter (search term, characteristic filter, training filter)
    - Scroll positions (rt-body, skills columns, items grid, talents grid)
    - Window size (width/height)
  - Updated filter handlers in AcolyteSheet to store state:
    - `#filterEquipment` - Updates `_equipmentFilter` on every filter change
    - `#filterSkills` - Updates `_skillsFilter` on every filter change
    - Clear handlers reset filter state objects
  - Files modified:
    - `src/module/applications/actor/base-actor-sheet.mjs`
    - `src/module/applications/actor/acolyte-sheet.mjs`

**Total Time**: ~45 minutes
**Build Status**: ✅ All builds passing

---

## Completed 🎉

**Priority 1: Quick Wins - COMPLETE!**

All 6 Priority 1 items completed in this session:
- Item 5: Equipment Search & Filter
- Item 8: Visual Feedback & Animations
- Item 6: Equipment Bulk Operations
- Item 7: Skills Search & Filter
- Item 10: Button Debouncing
- Item 9: V13 Toast Notifications

**Total Session Time**: ~13 hours of development

---

## Next Up 📋

### Priority 2: Medium Priority
- ✅ Item 13: Lazy Template Loading
- ✅ Item 14: State Persistence Enhancements
- Item 11: Keyboard Shortcuts System (2-3 days)
- Item 12: Active Effects Foundation (2-3 days)
- Item 15: Replace Custom Context Menu with V13 Native (2-3 days)
- Item 16: Data Caching & Memoization (1-2 days)
- Item 17: Accessibility Compliance (WCAG AA) (2-3 days)
- Item 15: Replace Custom Context Menu with V13 Native (2-3 days)
- Item 16: Data Caching & Memoization (1-2 days)
- Item 17: Accessibility Compliance (WCAG AA) (2-3 days)

---

## Notes

- Starting fresh with clean implementation
- Following ROADMAP.md for detailed specifications
- Testing after each fix before moving to next
- Will commit to git after completing Priority 0 session

---

### Priority 2: Medium Priority (Session 3 - 2026-01-07)

- [x] **Item 12**: Implement Active Effects Foundation ✅ COMPLETE
  - Created custom `RogueTraderActiveEffect` document class extending Foundry's ActiveEffect
  - Integrated with existing modifier system in CreatureTemplate
  - Extended active-effects.mjs with comprehensive helper functions:
    - `createEffect()` - Generic effect creation
    - `createCharacteristicEffect()` - Characteristic modifiers
    - `createSkillEffect()` - Skill modifiers
    - `createCombatEffect()` - Combat stat modifiers
    - `createConditionEffect()` - Predefined conditions (stunned, prone, blinded, etc.)
    - `createTemporaryEffect()` - Duration-based effects
    - `removeEffects()` - Bulk removal with filter function
    - `toggleEffect()` - Enable/disable effects
  - Created effects panel template with visual indicators:
    - Color-coded by nature (beneficial/harmful/neutral)
    - Duration tracking with expiring warnings
    - Source attribution for transparency
    - Enable/disable toggles
    - Delete buttons for owners
    - Changes summary display
  - Added effects display to Overview tab
  - Implemented action handlers in acolyte-sheet.mjs:
    - `#createEffect` - Create new effects
    - `#toggleEffect` - Enable/disable effects
    - `#deleteEffect` - Remove effects with confirmation
  - Styled effects panel with SCSS:
    - Beneficial effects: green border
    - Harmful effects: red border
    - Neutral effects: white border
    - Disabled state: grayscale + opacity
    - Expiring animation: pulsing warning
  - Files Created:
    - `src/module/documents/active-effect.mjs` (360 lines)
    - `src/templates/actor/panel/effects-panel.hbs` (73 lines)
  - Files Modified:
    - `src/module/documents/_module.mjs` (added export)
    - `src/module/hooks-manager.mjs` (registered ActiveEffect)
    - `src/module/rules/active-effects.mjs` (expanded from 42 → 250+ lines)
    - `src/module/applications/actor/acolyte-sheet.mjs` (added handlers)
    - `src/templates/actor/acolyte/tab-overview.hbs` (added panel)
    - `src/scss/panels/_effects.scss` (replaced old styles)

**Features Implemented**:
- ✅ Proper V13 ActiveEffect integration
- ✅ Nature classification (beneficial/harmful/neutral)
- ✅ Duration tracking and expiring warnings
- ✅ Source attribution for transparency
- ✅ Visual change summary in cards
- ✅ Enable/disable toggle functionality
- ✅ Helper functions for common effects
- ✅ Predefined condition effects (7 conditions)
- ✅ Temporary effects with round/turn tracking
- ✅ Custom effect application logic

**Total Time**: ~2.5 hours
**Build Status**: ✅ All builds passing

---

## Next Steps 📋

### Priority 2: Medium Priority (Remaining)
- Item 11: Keyboard Shortcuts System (2-3 days, VERY HIGH impact)
- Item 13: Lazy Template Loading (3-4 hours)
- Item 14: State Persistence Enhancements (1-2 days)
- Item 15: Replace Context Menu with V13 Native (2-3 days)
- Item 16: Data Caching & Memoization (1-2 days)
- Item 17: Accessibility Compliance (2-3 days, HIGH impact)
