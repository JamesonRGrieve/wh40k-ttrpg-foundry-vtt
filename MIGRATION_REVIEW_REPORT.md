# ApplicationV2 Migration Review Report
**Date:** January 6, 2026
**System:** Rogue Trader VTT
**Migration Status:** Incomplete - Critical Issues Found

---

## Executive Summary

The ApplicationV2 migration has made significant progress but is incomplete and contains critical architectural inconsistencies that will cause runtime failures. While the build succeeds, the implementation has several fundamental issues that prevent proper V2 functionality.

**Overall Status:** ⚠️ NEEDS MAJOR REVISION

### Key Findings:
- ✅ All V1 sheets removed successfully
- ✅ V2 sheet classes created and registered
- ❌ Critical tab configuration inconsistencies
- ❌ Actor sheets still using V1 template patterns
- ❌ Duplicate tab activation logic causing maintenance debt
- ⚠️ Templates not migrated to V2 parts system

---

## Critical Issues (Must Fix)

### 1. Tab Configuration Property Name Mismatch 🔴 CRITICAL

**Severity:** CRITICAL - Breaks tab rendering
**Affected:** All item sheets + PrimarySheetMixin

**Problem:**
- **Item sheets** define tabs with `{ id: "tab-name", group: "primary", label: "Label" }`
- **PrimarySheetMixin** expects `{ tab: "tab-name", group: "primary", ... }`

**Evidence:**
```javascript
// BaseItemSheet.mjs line 60-63
static TABS = [
    { id: "description", group: "primary", label: "Description" },  // Uses 'id'
    { id: "effects", group: "primary", label: "Effects" }
];

// PrimarySheetMixin.mjs line 153
this.constructor.TABS.reduce((tabs, { tab, condition, ...config }) => {
    // Destructures 'tab' property - won't find it!
```

**Impact:**
- Item sheet tabs won't render correctly
- Tab condition filtering (line 83-84) will fail: `this.constructor.TABS.find(t => t.tab === key)` returns undefined
- `_getTabs()` creates empty tabs object for items

**Files Affected:**
- `src/module/applications/api/primary-sheet-mixin.mjs:83, 153`
- `src/module/applications/item/base-item-sheet.mjs:60-63, 118-127`
- All 17 item sheet classes

**Fix Required:**
Either standardize on `tab` everywhere OR update PrimarySheetMixin to use `id`.

---

### 2. Actor Sheets Using Empty TABS with Legacy Handler 🔴 CRITICAL

**Severity:** CRITICAL - Not actually using V2 tabs
**Affected:** All 4 actor sheets

**Problem:**
All actor sheets set `static TABS = []` but rely on V1-style tab configuration:

```javascript
// AcolyteSheet.mjs lines 53-55, 73
static DEFAULT_OPTIONS = {
    tabs: [  // V1 pattern
        { navSelector: ".rt-navigation", contentSelector: ".rt-body", initial: "overview" }
    ]
};
static TABS = [];  // Empty - V2 system won't work
```

**Added Workaround (Dec 7 commit):**
A `_activateLegacyTabs()` method was added to PrimarySheetMixin (lines 201-268) to support this V1 pattern.

**Impact:**
- Actor sheets aren't actually using the V2 tab system
- Migration appears complete but is functionally still V1
- Templates still use `data-tab` and `data-group` attributes (V1 pattern)
- Can't leverage V2 benefits like partial tab rendering

**Files Affected:**
- `src/module/applications/actor/acolyte-sheet.mjs:53-55, 73`
- `src/module/applications/actor/npc-sheet.mjs:19-21, 37`
- `src/module/applications/actor/starship-sheet.mjs:22-24, 40`
- `src/module/applications/actor/vehicle-sheet.mjs:18-20, 36`

**Fix Required:**
1. Convert actor templates from V1 data-tab pattern to V2 PARTS
2. Define proper TABS configuration for each sheet
3. Remove legacy tab activation code

---

### 3. Templates Not Migrated to V2 Parts System 🔴 CRITICAL

**Severity:** CRITICAL - Missing core V2 benefit
**Affected:** All actor templates

**Problem:**
Actor sheets use single-part templates with V1 structure:

```javascript
static PARTS = {
    sheet: {
        template: "systems/rogue-trader/templates/actor/actor-rt-sheet.hbs",
        scrollable: [".rt-body"]
    }
};
```

Templates themselves use V1 patterns:
- Navigation with `data-tab` attributes
- Content sections with `data-tab` attributes
- No separation into V2 PARTS

**Impact:**
- Can't render tabs independently (must re-render entire sheet)
- No V2 partial rendering optimization
- No V2 tab content lazy loading
- Still fundamentally a V1 architecture wrapped in V2 API

**Templates Affected:**
- `templates/actor/actor-rt-sheet.hbs` (Acolyte)
- `templates/actor/actor-npc-sheet.hbs` (NPC)
- `templates/actor/actor-starship-sheet.hbs` (Starship)
- `templates/actor/actor-vehicle-sheet.hbs` (Vehicle)

**Fix Required:**
1. Split actor templates into separate parts (overview.hbs, combat.hbs, etc.)
2. Update PARTS configuration to reference individual tab templates
3. Remove data-tab attributes from templates
4. Use V2 tab API in templates

---

## Major Issues (Should Fix)

### 4. Duplicate Tab Activation Logic 🟠 MAJOR

**Severity:** MAJOR - Technical debt & maintenance burden
**Affected:** PrimarySheetMixin, BaseItemSheet

**Problem:**
Three different tab activation mechanisms coexist:

1. **V2 Native:** `changeTab()` method (lines 287-292)
2. **Legacy V1:** `_activateLegacyTabs()` + `_activateTab()` (lines 201-268)
3. **Item Custom:** BaseItemSheet's `_setupTabListeners()` + `_onTabClick()` (lines 144-188)

**Impact:**
- Increased code complexity
- Potential for state synchronization issues
- Multiple event listeners on same elements
- Difficult to maintain and debug

**Files:**
- `src/module/applications/api/primary-sheet-mixin.mjs:201-268, 287-292`
- `src/module/applications/item/base-item-sheet.mjs:144-188`

**Fix Required:**
Choose ONE approach and remove others:
- **Option A:** Migrate all sheets to V2 native tabs (recommended)
- **Option B:** Keep legacy only during transition, remove when done

---

### 5. BaseItemSheet Tab Management Override 🟠 MAJOR

**Severity:** MAJOR - Breaks inheritance pattern
**Affected:** BaseItemSheet

**Problem:**
BaseItemSheet overrides `_getTabs()` with custom implementation that doesn't call parent:

```javascript
// BaseItemSheet lines 116-128
_getTabs() {
    const tabs = {};
    for (const tab of this.constructor.TABS) {  // Uses tab.id
        tabs[tab.id] = {
            id: tab.id,
            group: tab.group,
            label: tab.label,
            active: this.tabGroups?.[tab.group] === tab.id,
            cssClass: this.tabGroups?.[tab.group] === tab.id ? "active" : ""
        };
    }
    return tabs;
}
```

Parent PrimarySheetMixin also has `_getTabs()` (lines 152-163) with different logic.

**Impact:**
- Parent method never called
- Different implementations for actors vs items
- BaseItemSheet expects `tab.id`, parent expects `tab.tab`
- Code duplication and drift

**Fix Required:**
Remove override or properly extend parent implementation with super call.

---

### 6. Tab Condition Filtering Broken 🟠 MAJOR

**Severity:** MAJOR - Runtime logic bug
**Affected:** PrimarySheetMixin

**Problem:**
`_configureRenderParts()` searches for tabs using wrong property:

```javascript
// Line 83-84
const tab = this.constructor.TABS.find(t => t.tab === key);  // Searches for 'tab'
// But item sheets define { id: "key", ... } not { tab: "key", ... }
```

**Impact:**
- Tab conditions never evaluated
- Conditional tabs won't be hidden even when condition returns false
- Feature appears to exist but doesn't work

**Files:**
- `src/module/applications/api/primary-sheet-mixin.mjs:80-87`

**Fix Required:**
Update to use consistent property name: `t.tab === key` → `t.id === key`

---

### 7. Missing Container Configuration 🟠 MAJOR

**Severity:** MAJOR - Feature won't work
**Affected:** ApplicationV2Mixin

**Problem:**
`_renderContainers()` method exists (lines 104-121) but no sheets define container config:

```javascript
// ApplicationV2Mixin lines 106-107
for (const [partId, config] of Object.entries(this.constructor.PARTS)) {
    if (!config.container?.id) continue;  // Always skips - no containers defined
}
```

**Impact:**
- Container grouping infrastructure exists but is unused
- No multi-column part layouts
- Dead code in codebase

**Fix Required:**
Either:
- Document and use container feature
- Remove unused container code

---

## Moderate Issues

### 8. Mode Slider Not Integrated with V2 🟡 MODERATE

**Problem:** `_renderModeToggle()` manually manipulates DOM after render instead of using V2 template parts.

**Files:** `src/module/applications/api/primary-sheet-mixin.mjs:104-122`

**Impact:** Not properly integrated into V2 render pipeline.

---

### 9. Legacy Tab Listener Conflicts 🟡 MODERATE

**Problem:** Multiple tab click handlers can bind to same elements.

**Impact:** Memory leaks, duplicate event handlers, performance overhead.

---

### 10. Tab State Persistence Issues 🟡 MODERATE

**Problem:** Tab state updates through multiple paths (`tabGroups`, V1 handlers, V2 `changeTab()`).

**Impact:** Tab position might not persist correctly across renders.

---

## Minor Issues

### 11. Inconsistent Action Handler Patterns
- Some use static private methods (correct V2 pattern)
- Naming convention is consistent but not documented

### 12. No Tab ID Validation
- Templates can reference tabs that don't exist in TABS array
- Runtime errors instead of build-time validation

### 13. CSS Class Dependencies
- Tab activation relies on specific CSS classes
- Fragile if styling changes

---

## Migration Progress Assessment

### ✅ Completed Successfully
- V1 Application sheet classes removed
- V2 sheet classes created (actor and item)
- Registration migrated to DocumentSheetConfig API
- Static action handlers implemented
- Build passes without errors
- tabGroups property added to all sheets
- Data validation fixes for fate/psy fields

### ⚠️ Partially Complete
- Tab system exists but inconsistent
- Templates reference V2 sheets but use V1 structure
- Legacy compatibility layer added instead of full migration

### ❌ Not Complete
- Actor templates still V1 structure
- Tab configuration inconsistent across sheet types
- No V2 PARTS-based tab rendering
- Duplicate code for tab activation

---

## Recommended Action Plan

### Phase 1: Critical Fixes (Required for functionality)

#### 1.1 Fix Tab Property Naming (2-3 hours)
**Choose ONE standard:**

**Option A - Use 'tab' everywhere (recommended):**
```javascript
// Update BaseItemSheet and all item sheets
static TABS = [
    { tab: "description", group: "primary", label: "Description" },
    { tab: "effects", group: "primary", label: "Effects" }
];

// Update BaseItemSheet._getTabs() to use 'tab' property
```

**Option B - Use 'id' everywhere:**
```javascript
// Update PrimarySheetMixin to destructure 'id'
this.constructor.TABS.reduce((tabs, { id, condition, ...config }) => {
    if (!condition || condition(this.document)) tabs[id] = {
        ...config,
        id: id,
        group: "primary",
        active: this.tabGroups.primary === id,
        cssClass: this.tabGroups.primary === id ? "active" : ""
    };
```

#### 1.2 Migrate Actor Templates to V2 PARTS (8-12 hours)

**For each actor sheet (Acolyte, NPC, Starship, Vehicle):**

1. **Split template into parts:**
```
templates/actor/acolyte/
  ├── sheet.hbs           # Main wrapper
  ├── overview.hbs        # Overview tab content
  ├── combat.hbs          # Combat tab content
  ├── abilities.hbs       # Abilities tab content
  ├── equipment.hbs       # Equipment tab content
  └── journal.hbs         # Journal tab content
```

2. **Update PARTS configuration:**
```javascript
static PARTS = {
    overview: {
        template: "systems/rogue-trader/templates/actor/acolyte/overview.hbs",
        scrollable: [".scrollable"]
    },
    combat: {
        template: "systems/rogue-trader/templates/actor/acolyte/combat.hbs",
        scrollable: [".scrollable"]
    },
    // ... etc
};
```

3. **Update TABS configuration:**
```javascript
static TABS = [
    { tab: "overview", group: "primary", label: "RT.Sheet.Tabs.Overview" },
    { tab: "combat", group: "primary", label: "RT.Sheet.Tabs.Combat" },
    { tab: "abilities", group: "primary", label: "RT.Sheet.Tabs.Abilities" },
    { tab: "equipment", group: "primary", label: "RT.Sheet.Tabs.Equipment" },
    { tab: "journal", group: "primary", label: "RT.Sheet.Tabs.Journal" }
];
```

4. **Remove V1 options:**
```javascript
// DELETE this:
tabs: [
    { navSelector: ".rt-navigation", contentSelector: ".rt-body", initial: "overview" }
]
```

5. **Update template structure:**

Instead of:
```handlebars
<nav class="rt-navigation" data-group="primary">
    <a class="rt-nav-item" data-tab="overview">Overview</a>
    <a class="rt-nav-item" data-tab="combat">Combat</a>
</nav>
<section class="rt-body">
    <div class="tab" data-tab="overview">...</div>
    <div class="tab" data-tab="combat">...</div>
</section>
```

Use:
```handlebars
{{!-- sheet.hbs --}}
<nav class="tabs" data-group="primary">
    {{#each tabs}}
    <a class="item" data-tab="{{id}}" {{#if active}}class="active"{{/if}}>
        {{localize label}}
    </a>
    {{/each}}
</nav>
<section class="content">
    {{> (lookup this (concat "partials/" tabGroups.primary))}}
</section>

{{!-- Each tab is separate .hbs file --}}
```

#### 1.3 Remove Legacy Tab Activation (2 hours)
- Delete `_activateLegacyTabs()` from PrimarySheetMixin (lines 201-238)
- Delete `_activateTab()` from PrimarySheetMixin (lines 240-268)
- Remove custom tab listeners from BaseItemSheet
- Use only V2 `changeTab()` method

### Phase 2: Code Quality Improvements (Recommended)

#### 2.1 Consolidate Tab Management
- Ensure BaseItemSheet calls `super._getTabs()` or remove override
- Document tab configuration pattern in AGENTS.md
- Add JSDoc examples

#### 2.2 Container Configuration
- Decide if container feature is needed
- If yes, document and implement
- If no, remove `_renderContainers()` method

#### 2.3 Mode Toggle Integration
- Consider making mode slider a V2 template part
- Or document why manual DOM manipulation is necessary

### Phase 3: Polish & Testing (Recommended)

#### 3.1 Add Validation
- Validate tab IDs match between TABS array and templates
- Throw errors for misconfigurations during development

#### 3.2 Update Documentation
- Update AGENTS.md with V2 patterns
- Add migration guide for future sheets
- Document any hybrid V1/V2 patterns if needed

#### 3.3 Testing Checklist
- [ ] All actor sheets render correctly
- [ ] All item sheets render correctly
- [ ] Tab switching works in all sheets
- [ ] Edit/Play mode toggle works
- [ ] Collapsible sections work
- [ ] Drag-drop functionality intact
- [ ] All action handlers fire correctly
- [ ] No console errors or warnings
- [ ] Tab state persists on re-render

---

## Complexity Estimates

| Task | Priority | Complexity | Time Est. | Risk |
|------|----------|------------|-----------|------|
| Fix tab property naming | P0 | Low | 2-3 hrs | Low |
| Migrate actor templates to V2 | P0 | High | 8-12 hrs | Medium |
| Remove legacy tab code | P0 | Medium | 2 hrs | Low |
| Fix BaseItemSheet tab override | P1 | Low | 1 hr | Low |
| Container cleanup | P2 | Low | 1 hr | Low |
| Add validation | P2 | Medium | 2-3 hrs | Low |
| Documentation updates | P2 | Low | 2 hrs | Low |
| Full testing pass | P1 | Medium | 4 hrs | N/A |
| **Total** | | | **22-28 hrs** | |

---

## Risk Assessment

### High Risk Areas
1. **Template Migration:** Breaking actor sheet rendering requires careful testing
2. **Tab State:** Incorrect tab state management could lose user position

### Medium Risk Areas
1. **Event Handlers:** Removing legacy code might break some interactions
2. **CSS Dependencies:** V2 templates might need CSS updates

### Low Risk Areas
1. **Property Naming:** Simple find-replace with clear impact
2. **Documentation:** No functional changes

---

## Conclusion

The ApplicationV2 migration made strong initial progress but is architecturally incomplete. While the system builds and likely appears to work at first glance, it's fundamentally still using V1 patterns with a V2 wrapper.

**The migration needs to be completed properly to:**
- Avoid future maintenance problems
- Leverage V2 performance benefits
- Prevent runtime bugs from property mismatches
- Reduce code complexity and duplication

**Recommended Approach:**
Complete Phase 1 (Critical Fixes) immediately. The current state will likely cause runtime errors, especially with item sheet tabs. Phase 2 and 3 can follow as time permits.

**Estimated Total Work:** 22-28 hours for complete migration.

---

## Appendix: File Change Summary

### Files Requiring Changes

#### Critical Priority
- `src/module/applications/api/primary-sheet-mixin.mjs` - Fix tab property usage
- `src/module/applications/item/base-item-sheet.mjs` - Fix TABS definition, remove override
- All 17 item sheets - Update TABS from `id` to `tab`
- `src/module/applications/actor/acolyte-sheet.mjs` - Add proper TABS, update PARTS
- `src/module/applications/actor/npc-sheet.mjs` - Add proper TABS, update PARTS
- `src/module/applications/actor/starship-sheet.mjs` - Add proper TABS, update PARTS
- `src/module/applications/actor/vehicle-sheet.mjs` - Add proper TABS, update PARTS
- `templates/actor/*.hbs` - Split into V2 parts structure

#### Medium Priority
- `src/module/applications/api/application-v2-mixin.mjs` - Container cleanup
- `AGENTS.md` - Documentation updates

### Test Files Needed
- Actor sheet tab switching tests
- Item sheet tab switching tests
- Tab state persistence tests
- Mode toggle tests

---

**Report Generated:** 2026-01-06
**Reviewed By:** Claude Code Analysis Agent
**Next Review:** After Phase 1 completion
