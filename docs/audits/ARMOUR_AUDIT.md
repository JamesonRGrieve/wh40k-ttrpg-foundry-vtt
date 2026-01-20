# Rogue Trader VTT Armour System Audit Report

**Date**: 2026-01-20
**Auditor**: OpenCode AI  
**Scope**: Data Model, Pack Data (174 items), Templates, SCSS

## Executive Summary

The armour system is **well-structured and production-ready** with a modern DataModel-driven architecture. The system has 174 armour items, clean schema design, and modern ApplicationV2 sheets. However, there are **significant data quality issues** in the pack that need attention.

**Overall Grade: B+ (Schema: A, Implementation: A-, Data Quality: C)**

---

## 1. Data Model Analysis

### Location

`src/module/data/item/armour.mjs` (804 lines)

### Schema Assessment: **EXCELLENT (A)**

#### Strengths

1. **Modern V13 Architecture**

    - Proper DataModel with mixins (DescriptionTemplate, PhysicalItemTemplate, EquippableTemplate)
    - SetField for properties and coverage (proper handling of unique values)
    - Comprehensive migration system for legacy data
    - Proper validation with `validateJoint()`

2. **Well-Designed Schema**

    ```javascript
    {
      identifier: IdentifierField,
      type: StringField (12 choices: flak, mesh, carapace, power, etc.),
      armourPoints: LocationSchema (head, body, leftArm, rightArm, leftLeg, rightLeg),
      coverage: SetField (body locations + "all"),
      maxAgility: NumberField (nullable),
      properties: SetField (special properties),
      modificationSlots: NumberField (0-10),
      modifications: ArrayField (installed mods)
    }
    ```

3. **Rich Computed Properties** (25+ properties)

    - `apSummary` - "All: 8" or "H: 4, B: 6, LA: 4, RA: 4, LL: 4, RL: 4"
    - `coverageLabel` - "All", "Body, Arms", etc.
    - `protectionLevel` - "light", "medium", "heavy", "power" (for styling)
    - `locationArray` - Full location details with icons
    - `propertiesArray` - Localized property objects

4. **Migration System**
    - Handles legacy `ap` → `armourPoints`
    - Handles legacy `locations` → `coverage`
    - Handles `maxAg` string → `maxAgility` number
    - Cleans weight (removes "kg" suffix)

#### Minor Issues

1. **Missing Craftsmanship in Schema**: Field exists in template but not in DataModel schema
2. **Properties not utilized**: Schema defines 9 properties but **0 armors use them** in pack
3. **Coverage redundancy**: Both `coverage` Set and AP-based inference exist (intentional for flexibility, but could be simplified)

### Recommendations

1. **Add craftsmanship field to schema**:

    ```javascript
    craftsmanship: new fields.StringField({
        required: true,
        initial: 'common',
        choices: ['poor', 'common', 'good', 'best'],
    });
    ```

2. **Consider simplifying coverage**: Either make coverage purely decorative or enforce it strictly. Current system allows AP > 0 in uncovered locations.

3. **Add identifier field to all pack items** (currently missing from 174/174 items)

---

## 2. Pack Data Analysis

### Location

`src/packs/rt-items-armour/_source/` (174 JSON files)

### Data Quality Assessment: **NEEDS WORK (C)**

#### Distribution

| Metric                | Value                         |
| --------------------- | ----------------------------- |
| **Total Armor Items** | 174                           |
| **AP Range**          | 0-14                          |
| **Weight Range**      | 0.05kg - 200,250kg (outlier!) |
| **Median Weight**     | 9kg                           |

#### Armour Type Distribution

| Type      | Count | %   |
| --------- | ----- | --- |
| Power     | 46    | 26% |
| Void      | 34    | 20% |
| Flak      | 26    | 15% |
| Xenos     | 24    | 14% |
| Primitive | 23    | 13% |
| Carapace  | 13    | 7%  |
| Mesh      | 8     | 5%  |

**Analysis**: Good variety, but "void" type is overrepresented (includes force fields, shields, and void suits).

#### Coverage Patterns

| Pattern | Count     |
| ------- | --------- |
| "all"   | 105 (60%) |
| 5-parts | 25 (14%)  |
| 1-part  | 27 (16%)  |
| 2-parts | 10 (6%)   |
| 3-parts | 6 (3%)    |

**Analysis**: Most armours use "all" coverage, which is sensible for full suits. Partial coverage works well for helmets, shields, etc.

#### AP Patterns

-   **Uniform AP**: 159 armours (91%) - Same AP for all locations
-   **Varied AP**: 15 armours (9%) - Different AP per location
    -   Examples: Boarding Armour (H:4 B:4 LA:3 RA:3 LL:3 RL:3), Astartes Mark II (H:7 B:9 LA:7 RA:7 LL:7 RL:7)

**Analysis**: Good. Most armours have uniform protection, with realistic variations for specialized armours (e.g., reinforced chest plates).

#### Data Quality Issues (187 Issues Found)

| Issue                         | Count | Severity |
| ----------------------------- | ----- | -------- |
| **Missing identifier**        | 174   | HIGH     |
| **Empty description**         | 8     | MEDIUM   |
| **Zero weight**               | 5     | LOW      |
| **Availability non-standard** | 40    | HIGH     |

**Missing Identifiers**: Every single armour lacks an identifier field. This is a systemic issue.

**Examples**:

-   Helmetless (0kg weight - acceptable)
-   Fury Unrelenting (0kg weight - questionable)
-   One item has weight of 200,250kg (obvious data error)

#### Availability Distribution Issues

The pack uses **inconsistent availability values**:

-   Standard values: extremely-rare (25), very-rare (24), rare (24), scarce (11), common (7)
-   **Non-standard values**: "Hero" (13), "Initiated" (10), "Special" (8), "Famed" (4), "Distinguished" (2), "Respected" (1)

**Problem**: Schema expects standard Rogue Trader availability tiers, but 40+ items use non-standard values (possibly from Deathwatch or other systems).

#### Craftsmanship Usage

-   **Items with craftsmanship field**: 1 (Mesh Weave Clothing)
-   **Items without craftsmanship**: 173 (99.4%)

**Problem**: Template expects craftsmanship, DataModel defines it, but **it's not in the schema** and almost no items use it.

#### Properties Usage

-   **Items with properties**: 0
-   **Available properties**: 9 (sealed, auto-stabilized, hexagrammic, blessed, camouflage, lightweight, reinforced, agility-bonus, strength-bonus)

**Problem**: Rich property system exists but is completely unused in the pack.

---

## 3. Template Analysis

### Location

`src/templates/item/item-armour-sheet-v2.hbs` (489 lines)

### Template Assessment: **VERY GOOD (A-)**

#### Design Quality

**Modern ApplicationV2 Pattern** - Matches weapon sheet design:

1. **Compact header** with image, name, type badge, AP badge, craftsmanship, equipped toggle
2. **Stats bar** with quick-view stats (Max AP, Weight, Coverage, locations)
3. **Tab navigation** (Protection, Properties, Mods, Description, Effects)
4. **Clean sections** with collapsible panels

#### Tabs

1. **Protection Tab**

    - 3x2 grid for AP by location (head, body, arms, legs)
    - Base properties (type, max agility, availability, craftsmanship, weight, cost)
    - Clean, information-dense layout

2. **Properties Tab**

    - Property tags (add/remove)
    - Property descriptions with icons
    - **Currently empty for all items**

3. **Modifications Tab**

    - Slot management (X/Y slots used)
    - Installed modifications list
    - Add/edit/remove actions
    - Empty state with drag-drop hint

4. **Description Tab**

    - Effect (ProseMirror editor)
    - Description (ProseMirror editor)
    - Notes (textarea)
    - Source (text field)

5. **Effects Tab**
    - Active Effects panel (partial)

#### Strengths

1. **Visual hierarchy** - Clear badge system for type, AP level, craftsmanship
2. **Protection level styling** - Dynamic classes based on avgAP:
    - `none` (0 AP)
    - `light` (1-2 AP)
    - `medium` (3-5 AP)
    - `heavy` (6-8 AP)
    - `power` (9+ AP)
3. **Responsive layout** - Grid-based, adapts to window size
4. **Accessibility** - Proper labels, semantic HTML

#### Minor Issues

1. **Craftsmanship field** - Present in template but not in DataModel schema
2. **Coverage grid removed** - Comments mention "coverage now inferred from non-zero AP" but coverage Set still exists in schema
3. **Properties system underutilized** - UI is great but no items use it
4. **No visual body diagram** - Could benefit from SVG body outline showing coverage

---

## 4. SCSS Analysis

### Location

-   `src/scss/item/_armour-v2.scss` (863 lines) - **CURRENT**
-   `src/scss/item/_armour-modern.scss` (863 lines) - Duplicate?
-   `src/scss/item/_armour-modification.scss` (629 lines)

### SCSS Assessment: **EXCELLENT (A)**

#### Design System

**Gothic 40K Aesthetic**:

-   Color palette: Gold (`#c9a227`), dark browns, parchment (`#e0d5c7`)
-   Fonts: Cinzel (headers), Roboto (body), Courier New (stats)
-   Visual style: Borders, gradients, subtle shadows

#### Component Quality

1. **Header** (lines 34-124)

    - Image with hover overlay and edit icon
    - Name input with subtle border-bottom focus
    - Badge system with type-specific colors
    - Equipped toggle with green checkmark

2. **Stats Bar** (lines 184-249)

    - Flexbox layout with wrapping
    - Icon + label + value per stat
    - Color-coded by stat type
    - Responsive min-width

3. **Tabs** (lines 255-291)

    - Clean tab bar with active indicator
    - Border-bottom highlight
    - Smooth transitions

4. **AP Grid** (lines 431-475)

    - 3x2 grid for 6 locations
    - Large, centered inputs
    - Icon labels for each location
    - Gold accent colors

5. **Properties** (lines 533-633)

    - Tag-based display
    - Remove buttons with hover effects
    - Add dropdown with button
    - Property detail cards

6. **Modifications** (lines 639-713)
    - Slot counter
    - Mod list with edit/remove actions
    - Empty state with dashed border

#### Strengths

1. **Consistent with weapon sheet** - Uses same design patterns
2. **Theme-aware** - Uses CSS custom properties
3. **Well-organized** - Clear section comments
4. **Responsive** - Flexbox and grid layouts
5. **Accessible** - Good contrast ratios, focus states

#### Minor Issues

1. **Duplicate files** - `_armour-v2.scss` and `_armour-modern.scss` are identical (863 lines each)
2. **Coverage grid styles removed** - Comments mention removal but no replacement

---

## 5. Recommendations for Redesign

### Priority 1: Data Quality (Critical)

1. **Add identifiers to all 174 items**

    - Use kebab-case (e.g., "guard-flak-armour")
    - Run batch migration script

2. **Fix availability values**

    - Replace "Hero", "Initiated", etc. with standard RT values
    - Map Deathwatch values to RT equivalents

3. **Add craftsmanship to schema**

    - Update DataModel to include field
    - Populate common/good/best values for appropriate items

4. **Fix weight outlier** (200,250kg item)

5. **Fill empty descriptions** (8 items)

### Priority 2: Features (Important)

1. **Populate properties**

    - Add "sealed" to void suits and power armour
    - Add "blessed" to holy items
    - Add "camouflage" to scout armour
    - Add "lightweight" to mesh armour

2. **Add visual body diagram** to sheet

    - SVG body outline with clickable locations
    - Highlight covered areas
    - Show AP values per location

3. **Implement compendium browser** for modifications
    - Replace notification with actual item picker
    - Filter to show only armour modifications

### Priority 3: Polish (Nice to Have)

1. **Remove duplicate SCSS file** (\_armour-modern.scss)

2. **Simplify coverage system**

    - Either remove coverage Set (infer from AP > 0)
    - Or enforce coverage validation (can't have AP > 0 if not covered)

3. **Add quick-apply buttons** for common patterns

    - "Full Suit" - Set all locations to same AP
    - "Helmet Only" - Set head only
    - "No Helmet" - Set all except head

4. **Add comparison tooltip**
    - Hover over stat to compare with equipped armour
    - Show difference in AP, weight, coverage

---

## 6. Data Migration Script Needed

Recommended migration script to run:

```javascript
// Add identifiers, fix availability, set craftsmanship defaults
for (let item of armours) {
    // Generate identifier
    const id = item.name
        .toLowerCase()
        .replace(/[''']/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

    // Fix availability
    const availMap = {
        Hero: 'rare',
        Initiated: 'scarce',
        Special: 'unique',
        Famed: 'very-rare',
        Distinguished: 'rare',
        Respected: 'common',
    };
    const avail = availMap[item.system.availability] || item.system.availability;

    // Set craftsmanship based on type/name
    let craft = 'common';
    if (item.name.includes('Astartes') || item.name.includes('Artificer')) craft = 'best';
    else if (item.name.includes('Good') || item.name.includes('Guard')) craft = 'good';
    else if (item.name.includes('Poor') || item.name.includes('Primitive')) craft = 'poor';

    await item.update({
        'system.identifier': id,
        'system.availability': avail,
        'system.craftsmanship': craft,
    });
}
```

---

## Conclusion

The armour system has **excellent architecture** but **needs data cleanup**. The DataModel and templates are production-ready. Focus on data quality fixes (identifiers, availability, craftsmanship) before redesign work begins.
