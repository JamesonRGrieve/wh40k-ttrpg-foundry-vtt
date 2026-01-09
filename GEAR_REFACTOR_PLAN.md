# GEAR System Refactor Plan

## Executive Summary

The GEAR item type has **749 items** with **systematic data corruption**. All fields are misaligned between pack data and the DataModel schema. This requires a complete migration of all pack files plus updates to the DataModel, sheet, compendium browser, and presentation layers.

---

## Problem Analysis

### Data Corruption Pattern

**100% of gear items** have field mappings that don't match the schema:

| Pack Field | Contains | Should Be | Schema Field |
|------------|----------|-----------|--------------|
| `system.type` | Category descriptor ("Tool - Device") | Category enum | `system.category` |
| `system.weight` | String with "kg" ("1.5kg") | Number (1.5) | `system.weight` |
| `system.availability` | **EFFECT DESCRIPTION** (80+ char text) | Enum ("average") | `system.effect` |
| `system.effects` | **AVAILABILITY ENUM** ("Average") | Effect text | `system.availability` |
| `system.notes` | **COST VALUE** ("750 T") | GM notes | `system.cost.value` |
| `system.cost` | Misc text or null | Cost requirements | `system.notes` |
| `system.charges` | {max, value} | Uses structure | `system.uses` |

**Visual Result**: The sheets show `[object Object]` everywhere because:
1. Availability field contains long description text instead of enum
2. Effects field contains "Average" instead of effect description
3. Cost/notes are completely swapped
4. Weight is a string, not a number

---

## Type → Category Mapping

The pack `system.type` field has 20 values that need mapping to the DataModel's 13 categories:

### Mapping Table

| Pack Type | Count | → Category | Rationale |
|-----------|-------|------------|-----------|
| `Tool - Device` | 84 | `tools` | Electronic/cogitator devices |
| `Tool - Handheld` | 55 | `tools` | Manual tools |
| `Tool - Misc` | 29 | `tools` | Miscellaneous tools |
| `Tool - Worn` | 32 | `tools` | Wearable tools (auspex, etc.) |
| `Tool - Structure` | 36 | `tools` | Large structures/cages |
| `Tool - Tome` | 21 | `tools` | Books/data sources |
| `Tool - Astartes` | 15 | `tools` | Space Marine equipment |
| `Tool - Infantry Gear` | 17 | `survival` | Military survival gear |
| `Consumable` | 47 | `consumable` | One-use items |
| `Drug` | 45 | `drugs` | Chemical substances |
| `Clothing` | 44 | `clothing` | Wearable garments |
| `Clothing (Astartes)` | 22 | `clothing` | Space Marine garments |
| `Cybernetic` | 90 | `tech` | Cybernetic implants |
| `Service` | 76 | `general` | Hired services |
| `Medal` | 23 | `general` | Awards/decorations |
| `Familiar` | 21 | `tech` | Servo-skulls/familiars |
| `Poison` | 8 | `drugs` | Toxins |
| `Disease` | 4 | `consumable` | Infectious agents |
| `exotic` | 63 | `luxury` | Xenos/unique items |
| `xenos` | 17 | `luxury` | Alien technology |

---

## Availability Normalization

The `system.effects` field contains 11 different availability values that need mapping:

| Pack Value | → Schema Value | Config Key |
|------------|----------------|------------|
| `Ubiquitous` | `ubiquitous` | RT.Availability.Ubiquitous |
| `Abundant` | `abundant` | RT.Availability.Abundant |
| `Plentiful` | `plentiful` | RT.Availability.Plentiful |
| `Common` | `common` | RT.Availability.Common |
| `Average` | `average` | RT.Availability.Average |
| `Scarce` | `scarce` | RT.Availability.Scarce |
| `Rare` | `rare` | RT.Availability.Rare |
| `Very Rare` | `very-rare` | RT.Availability.VeryRare |
| `Extremely Rare` | `extremely-rare` | RT.Availability.ExtremelyRare |
| `Near Unique` | `near-unique` | RT.Availability.NearUnique |
| `Unique` | `unique` | RT.Availability.Unique |
| *other* | `average` | Default fallback |

---

## Migration Strategy

### Phase 1: DataModel Updates

**File**: `src/module/data/item/gear.mjs`

#### Changes Required:

1. **Remove obsolete fields** from schema
2. **Update migrateData()** to handle legacy pack format
3. **Update cleanData()** to ensure integer types
4. **Add validation** for enum fields

```javascript
static migrateData(source) {
  const migrated = super.migrateData(source);
  
  // Migrate old pack format
  if (source.type) {
    migrated.category = TYPE_TO_CATEGORY_MAP[source.type] || 'general';
    delete migrated.type;
  }
  
  if (source.effects && !source.availability) {
    migrated.availability = NORMALIZE_AVAILABILITY[source.effects] || 'average';
  }
  
  if (typeof source.weight === 'string') {
    migrated.weight = parseWeight(source.weight);
  }
  
  if (source.charges) {
    migrated.uses = source.charges;
    delete migrated.charges;
  }
  
  // Build rich description from scattered fields
  if (source.availability && source.availability.length > 50) {
    const parts = [];
    parts.push(`<h3>Effect</h3><p>${source.availability}</p>`);
    if (source.cost && source.cost.length > 5) {
      parts.push(`<h3>Requirements</h3><p>${source.cost}</p>`);
    }
    migrated.description.value = parts.join('\n');
  }
  
  // Parse cost from notes
  if (source.notes) {
    const costMatch = source.notes.match(/(\d+(?:,\d+)?)\s*T/);
    if (costMatch) {
      migrated.cost = {
        value: parseInt(costMatch[1].replace(',', '')),
        currency: 'throne'
      };
    }
  }
  
  return migrated;
}
```

### Phase 2: Pack Migration Script

**File**: `scripts/migrate-gear-packs.mjs`

This script will:
1. Read all 749 gear pack files
2. Apply field transformations
3. Write corrected JSON files
4. Generate migration report

Key transformations:
- Type → Category mapping
- Weight string → number parsing
- Availability text → effect/description
- Effects enum → availability
- Notes cost → cost.value parsing
- charges → uses rename
- Consolidate description.value from all text fields

### Phase 3: Sheet Updates

**File**: `src/templates/item/item-gear-sheet-modern.hbs`

Update template to display:
- Category dropdown (13 options)
- Effect HTML editor (rich text)
- Duration field (for drugs)
- Uses/charges tracker with consume button
- Proper weight number input
- Craftsmanship selector
- Source structured fields

**File**: `src/module/applications/item/gear-sheet.mjs`

Add actions:
- `consumeUse` - Decrement uses
- `resetUses` - Reset to max
- Update context preparation for new fields

### Phase 4: Compendium Browser

**File**: `src/module/applications/compendium-browser.mjs`

Add gear-specific filters:
- Category filter (13 categories)
- Availability filter (11 levels)
- Craftsmanship filter (4 levels)
- Consumable toggle
- Weight range slider
- Search by effect text

Update display cards:
- Show category badge
- Show availability icon
- Show uses/max if consumable
- Show weight
- Preview effect text (truncated)

### Phase 5: Actor Sheet Integration

**File**: `src/templates/actor/panel/loadout-equipment-panel.hbs`

Update gear display:
- Show category icon
- Show uses indicator (5/10)
- Consume button for consumables
- Effect tooltip on hover
- Proper weight contribution

**File**: `src/module/applications/actor/acolyte-sheet.mjs`

Add handlers:
- Quick consume from loadout
- Effect preview tooltip
- Filter by category

### Phase 6: Localization

**File**: `src/lang/en.json`

Add keys:
```json
{
  "RT.GearCategory": {
    "General": "General Equipment",
    "Tools": "Tools & Devices",
    "Drugs": "Drugs & Chemicals",
    "Consumable": "Consumables",
    "Clothing": "Clothing & Garments",
    "Survival": "Survival Gear",
    "Communications": "Communications",
    "Detection": "Detection & Sensors",
    "Medical": "Medical Supplies",
    "Tech": "Technology",
    "Religious": "Religious Items",
    "Luxury": "Luxury & Exotic",
    "Contraband": "Contraband"
  },
  "RT.Gear": {
    "Category": "Category",
    "Effect": "Effect",
    "Duration": "Duration",
    "Uses": "Uses",
    "UsesMax": "Max Uses",
    "Consume": "Consume",
    "Reset": "Reset Uses",
    "Exhausted": "Exhausted",
    "NoEffect": "No effect description"
  }
}
```

### Phase 7: Config Updates

**File**: `src/module/config.mjs`

Add gear categories config:
```javascript
ROGUE_TRADER.gearCategories = {
  general: { label: "RT.GearCategory.General", icon: "fa-box" },
  tools: { label: "RT.GearCategory.Tools", icon: "fa-wrench" },
  drugs: { label: "RT.GearCategory.Drugs", icon: "fa-flask" },
  consumable: { label: "RT.GearCategory.Consumable", icon: "fa-fire" },
  clothing: { label: "RT.GearCategory.Clothing", icon: "fa-shirt" },
  survival: { label: "RT.GearCategory.Survival", icon: "fa-tent" },
  communications: { label: "RT.GearCategory.Communications", icon: "fa-satellite-dish" },
  detection: { label: "RT.GearCategory.Detection", icon: "fa-radar" },
  medical: { label: "RT.GearCategory.Medical", icon: "fa-briefcase-medical" },
  tech: { label: "RT.GearCategory.Tech", icon: "fa-microchip" },
  religious: { label: "RT.GearCategory.Religious", icon: "fa-cross" },
  luxury: { label: "RT.GearCategory.Luxury", icon: "fa-gem" },
  contraband: { label: "RT.GearCategory.Contraband", icon: "fa-skull-crossbones" }
};
```

---

## Testing Strategy

### Unit Tests
1. Weight parsing: "1.5kg" → 1.5, "-" → 0, "?" → 0
2. Availability normalization: "Very Rare" → "very-rare"
3. Type mapping: "Tool - Device" → "tools"
4. Cost parsing: "750 T" → {value: 750, currency: "throne"}

### Integration Tests
1. Load migrated pack in Foundry
2. Open gear item sheet - verify all fields display correctly
3. Add gear to actor - verify encumbrance calculation
4. Consume consumable - verify uses decrement
5. Open compendium browser - verify gear filters work
6. Search by category - verify results
7. Check tooltips show effects

### Visual Verification
- No more `[object Object]` displays
- Availability shows as badge ("Average", "Rare", etc.)
- Weight shows as number with "kg" label
- Effect text displays in rich HTML
- Cost shows as "750 T" formatted string

---

## Rollout Plan

### Step 1: Create Migration Script
- Build script with dry-run mode
- Test on 10 sample items
- Verify output JSON structure

### Step 2: Run Migration
- Backup `src/packs/rt-items-gear/_source/`
- Run migration script
- Review migration report
- Commit changes

### Step 3: Update DataModel
- Add migrateData() method
- Add cleanData() validation
- Test with migrated packs

### Step 4: Update Sheet
- Rebuild template with new fields
- Add action handlers
- Test CRUD operations

### Step 5: Update Browser
- Add gear filters
- Update display cards
- Test search/filter

### Step 6: Update Actor Integration
- Update loadout panel
- Add consume handlers
- Test encumbrance

### Step 7: Documentation
- Update AGENTS.md with new schema
- Add gear system guide
- Document category meanings

---

## Risk Mitigation

### Backup Strategy
- Git commit before migration
- Keep backup of `_source/` folder
- Document rollback procedure

### Validation
- JSON schema validation for all 749 files
- Automated tests for migration logic
- Manual spot-check of 50 random items

### Incremental Rollout
- Migrate 10 items first (test batch)
- Verify in Foundry
- Migrate remaining 739 items
- Final verification pass

---

## Success Criteria

✅ **No `[object Object]` displays anywhere**  
✅ **All 749 items display correct data**  
✅ **Compendium browser filters work**  
✅ **Consumable items can be used/consumed**  
✅ **Encumbrance calculates correctly**  
✅ **Tooltips show effect descriptions**  
✅ **Availability shows as badges**  
✅ **Weight displayed as numbers**  
✅ **Cost formatted as "X T"**  
✅ **Category badges display with icons**  

---

## Estimated Effort

- **Phase 1 (DataModel)**: 2 hours
- **Phase 2 (Migration Script)**: 3 hours
- **Phase 3 (Sheet)**: 2 hours
- **Phase 4 (Browser)**: 2 hours
- **Phase 5 (Actor Integration)**: 2 hours
- **Phase 6 (Localization)**: 1 hour
- **Phase 7 (Config)**: 1 hour
- **Testing**: 3 hours

**Total: ~16 hours**

---

## Next Steps

1. **Review and approve this plan**
2. **Create migration script** (`scripts/migrate-gear-packs.mjs`)
3. **Run test migration** on 10 items
4. **Verify output** in Foundry
5. **Execute full migration**
6. **Update code layers** (DataModel → Sheet → Browser → Actor)
7. **Test thoroughly**
8. **Document changes**

---

## Additional Enhancements (Post-Migration)

### Quality of Life
- Quick-consume button in loadout
- Effect preview tooltips everywhere
- Category filtering in equipment tab
- Bulk consume for ammunition

### Advanced Features
- Auto-detect consumables and track uses
- Warning when uses exhausted
- Inventory presets (exploration, combat, social)
- Smart encumbrance suggestions

### Future Integrations
- Link drugs to condition effects
- Link tools to skill bonuses
- Link clothing to social modifiers
- Active effect integration for buffs

---

## Notes

- The migration is **destructive** - all pack files will be rewritten
- The migration is **one-way** - no automatic rollback
- The migration **must be complete** before system is usable
- **Backup everything** before starting
- Test in a **separate Foundry instance** first

**This is a major refactor** but necessary to make gear items functional and properly integrated with the V13 architecture.
