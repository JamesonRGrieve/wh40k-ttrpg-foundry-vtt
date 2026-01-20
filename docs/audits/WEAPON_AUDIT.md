# Rogue Trader VTT Weapon System Audit Report

**Date**: 2026-01-20
**Auditor**: OpenCode AI
**Scope**: Data Model, Pack Data (1,093 items), Templates, SCSS

## Executive Summary

Comprehensive audit of **1,093 weapon items** across data model, pack data, templates, and styling. The system is **well-structured and functional**, with a modern ApplicationV2 implementation. However, there are opportunities for improvement in data quality, schema refinement, and user experience enhancements.

**Overall Grade**: B+ (would be A- with icon/craftsmanship fixes)

---

## 1. Data Model Analysis

**File**: `src/module/data/item/weapon.mjs` (497 lines)

### Strengths

**Well-Structured Schema**:

-   Clean mixin architecture (DescriptionTemplate, PhysicalItemTemplate, EquippableTemplate, AttackTemplate, DamageTemplate)
-   Comprehensive weapon classification (class + type dual taxonomy)
-   Robust ammunition system (clip tracking, reload times, jam thresholds)
-   Intelligent craftsmanship modifiers (automatic quality application, stat bonuses)
-   Rich computed properties (19 getters for display, calculations, status)

**Modern V13 Patterns**:

-   Proper DataModel inheritance
-   Custom fields (IdentifierField, FormulaField)
-   Excellent derived data system (`effectiveSpecial`, `craftsmanshipModifiers`)
-   Comprehensive `migrateData()` for backwards compatibility

**Smart Features**:

-   Auto-applies craftsmanship qualities (reliable, unreliable, never-jam)
-   Jam threshold calculation based on qualities
-   Ammo status tracking with visual feedback
-   Modification system ready for expansion

### Issues & Recommendations

**1. Proficiency Field - Unused**

```javascript
proficiency: new fields.StringField({ required: false, blank: true });
```

-   **Finding**: All 1,093 weapons have empty `proficiency: ""` field
-   **Impact**: Schema bloat, no functional purpose
-   **Recommendation**:
    -   **Option A**: Remove field entirely (cleanest)
    -   **Option B**: Repurpose for talent requirements (e.g., "Weapon Training (Las)")
    -   **Option C**: Link to skill specializations

**2. Modifications Array Not Fully Utilized**

```javascript
modifications: new fields.ArrayField(
    new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        active: new fields.BooleanField({ required: true, initial: true }),
    }),
);
```

-   **Finding**: Schema exists but embedded items not integrated into derived stats
-   **Recommendation**: Build modifier aggregation system in `prepareDerivedData()`

**3. Class/Type Overlap**

-   **Finding**: Weapon `class` and `type` choices have conceptual overlap
    -   `class: "chain"` vs `type: "chain"`
    -   `class: "power"` vs `type: "power"`
-   **Issue**: Confusing for data entry, potential for inconsistency
-   **Recommendation**:
    -   `class` = Usage pattern (melee, pistol, basic, heavy, thrown, exotic)
    -   `type` = Technology/damage mechanism (primitive, las, bolt, power, etc.)
    -   Remove overlapping choices from `class` field

**4. Missing Fields**
Consider adding:

-   `category`: String ("civilian", "military", "exotic", "relic") for filtering
-   `era`: String ("m41", "heresy", "dark-age") for lore filtering
-   `manufacturer`: String ("Mars", "Ryza", "Xenos") for flavor
-   `damagePerHit`: Number (for horde rules, especially NPCs)

**5. Notes Field Redundancy**

-   Both `notes` and `description.value` exist
-   Consider consolidating or clarifying purpose

---

## 2. Pack Data Analysis

**Location**: `src/packs/rt-items-weapons/_source/`
**Total Files**: 1,093 weapons

### Distribution Analysis

**Class Distribution**:

```
Melee:  417 (38.2%)
Basic:  300 (27.4%)
Pistol: 144 (13.2%)
Heavy:  128 (11.7%)
Thrown: 104 (9.5%)
```

**Well-balanced spread** across weapon types.

**Type Distribution** (Top 10):

```
Exotic:          370 (33.9%)
Primitive:       166 (15.2%)
Solid-Projectile: 106 (9.7%)
Power:            78 (7.1%)
Bolt:             59 (5.4%)
Las:              56 (5.1%)
Flame:            37 (3.4%)
Plasma:           28 (2.6%)
Melta:            28 (2.6%)
Chain:            30 (2.7%)
```

**Strong exotic weapon representation** (likely xenos, archeotech, unique items).

**Craftsmanship Distribution**:

```
Common: 1,093 (100%)
Good:   0
Poor:   0
Best:   0
Master: 0
```

**CRITICAL FINDING**: All weapons are "common" craftsmanship. This is a **major data quality issue**.

### Data Quality Assessment

**✅ Excellent**:

-   **Consistent structure**: All fields present, valid JSON
-   **Naming conventions**: Clear, descriptive names with variant suffixes
-   **Value ranges**: Damage, penetration, ranges all reasonable
-   **Special qualities**: Properly formatted arrays

**⚠️ Issues Found**:

1. **Placeholder Icons (100%)**: All 1,093 weapons use `"icons/svg/sword.svg"`

    - **Impact**: Poor visual differentiation
    - **Recommendation**: Assign proper icons per weapon class/type

2. **Craftsmanship Homogeneity**: All weapons are "common"

    - **Recommendation**: Curate 50-100 "best" and "good" variants for iconic weapons

3. **Proficiency Field**: 1,093 entries with empty string `"proficiency": ""`

    - **Recommendation**: Remove field or populate with talent requirements

4. **Duplicate Descriptions**: Many weapons have redundant text in both `description.value` and `notes`

5. **Source Attribution**: Inconsistent format

    - Examples: "Rogue Trader: Core", "RT: Hostile Acquisitions", "Only War: Core", "ChatGPT"
    - **Recommendation**: Standardize source format

6. **Incomplete Data** (Spot Checks):
    - Some xenos weapons have placeholder notes ("Nearly Unchanged from ChatGPT description")
    - Some weapons have `cost.value: 0` (may be intentional for unique items)

---

## 3. Template Analysis

**File**: `src/templates/item/item-weapon-sheet-modern.hbs` (510 lines)

### Strengths

**Modern Design**:

-   Clean ApplicationV2 PARTS structure
-   Excellent information density
-   Gothic 40K aesthetic with modern UX
-   4-tab organization (Stats, Qualities, Info, Effects)

**Outstanding Features**:

-   **Stat bar**: Visual at-a-glance primary stats
-   **Ammo display**: Color-coded bar with percentage
-   **Craftsmanship effects**: Highlighted special section for non-common quality
-   **Qualities grid**: Clear display of special properties
-   **Jam threshold indicator**: Warns user of jam risk
-   **Modifications section**: Ready for drag-drop

**Accessibility**:

-   Tooltips on qualities
-   Clear labels and icons
-   Logical field grouping

### Recommendations

**1. Add Quick Actions**:

```handlebars
{{! Missing: Quick roll buttons in header }}
<div class='rt-weapon-header__actions'>
    <button data-action='rollAttack' title='Roll Attack'>
        <i class='fas fa-dice-d20'></i>
    </button>
    <button data-action='rollDamage' title='Roll Damage'>
        <i class='fas fa-burst'></i>
    </button>
</div>
```

**2. Conditional Field Display**:

-   Hide "Reload Time" for melee weapons
-   Hide "RoF" section for thrown weapons
-   Show/hide based on weapon class

**3. Modification Visualization**:

-   Currently just a list
-   Add visual indicators for active/inactive mods
-   Show mod effects on stats

**4. Comparison Mode**:

-   Add "Compare" button to overlay stats from another weapon
-   Useful for players making purchase decisions

**5. Icon Picker**:

-   Replace simple image upload with icon browser
-   Suggest icons based on weapon class/type

---

## 4. SCSS Analysis

**File**: `src/scss/item/_weapon.scss` (1,109 lines)

### Strengths

**Comprehensive Styling**:

-   Complete component library for weapon display
-   Theme-aware custom properties (`--rt-*` variables)
-   Responsive flexbox layouts
-   Gothic aesthetic with modern polish

**Well-Organized**:

-   Clear section comments
-   BEM-like naming (`.rt-weapon-*`)
-   Logical cascade (base → header → stats → tabs → content)

**Visual Excellence**:

-   Craftsmanship color-coding (poor=red, good=green, best=gold)
-   Ammo bar status colors (good, low, critical, empty)
-   Smooth transitions and hover states
-   Professional scrollbar styling

### Recommendations

**1. Reduce Redundancy**:

-   `.rt-weapon-badge` and `.rt-weapon-section__badge` have overlap
-   Consider consolidating badge variants

**2. Add Print Styles**:

```scss
@media print {
    .rt-weapon-sheet {
        // Hide tabs, show all content
        // Simplify colors for B&W printing
    }
}
```

**3. Dark Mode Enhancement**:

-   Already theme-aware via custom properties
-   Add explicit dark theme tests

**4. Accessibility Improvements**:

```scss
.rt-weapon-stat {
    &:focus-within {
        outline: 2px solid var(--rt-gold);
        outline-offset: 2px;
    }
}
```

**5. Mobile Responsiveness**:

-   Current fixed widths may not work on small screens
-   Add breakpoints for tablet/mobile

---

## 5. Redesign Priorities

For the upcoming weapon sheet redesign, focus on:

**Must-Have**:

1. Quick roll actions (attack/damage buttons)
2. Dynamic field visibility (hide irrelevant fields)
3. Craftsmanship visual prominence
4. Mobile-friendly layout

**Should-Have**:

1. Modification effects visualization
2. Comparison tool
3. Icon browser/picker
4. Enhanced ammo management (fire modes, special ammo)

**Nice-to-Have**:

1. Drag-to-reorder modifications
2. "What-if" mode for trying different mods
3. Export to PDF/print
4. Favorites/bookmarking system

---

## 6. Action Items

**Immediate (Pre-Redesign)**:

-   [ ] Decide on `proficiency` field (remove or repurpose)
-   [ ] Document craftsmanship curation plan
-   [ ] Create icon assignment spreadsheet

**Short-Term (With Redesign)**:

-   [ ] Implement quick roll buttons
-   [ ] Add conditional field display logic
-   [ ] Build modification integration
-   [ ] Mobile responsive stylesheet

**Long-Term (Post-Redesign)**:

-   [ ] Icon assignment campaign (community crowdsourcing?)
-   [ ] Craftsmanship variant creation
-   [ ] Source standardization pass
-   [ ] Advanced features (comparison, what-if mode)

---

## Conclusion

The weapon system is **solid and functional**, with a modern architecture that supports complex features. The primary issues are **data quality** (icons, craftsmanship) rather than structural problems. The redesign should focus on **UX enhancements** (quick actions, visual feedback) while maintaining the excellent foundation already in place.
