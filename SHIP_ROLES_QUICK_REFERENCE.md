# Ship Roles Refactor - Quick Reference

**Status**: 🟡 Ready for Implementation  
**Items**: 22 ship role items  
**Approach**: Full pack migration + DataModel enhancement

---

## ⚡ Quick Execute

```bash
# 1. Dry-run test
node scripts/migrate-ship-roles.mjs --dry-run --verbose

# 2. Execute migration
node scripts/migrate-ship-roles.mjs

# 3. Build packs
npm run build

# 4. Test in Foundry
# - Open compendium: check no [object Object]
# - Open character sheet: check Dynasty tab
# - Drag ship role to actor: verify display
```

---

## 🔍 What's Broken?

**Visual Symptoms**:
- `[object Object]` in compendium browser
- `[object Object]` in character sheet Dynasty tab
- Career/Skills fields show gibberish

**Root Cause**:
```javascript
// Pack data (CURRENT - BROKEN):
{
  "careerPreferences": "Usually Explorator, any but Missionary/Void-Master.",
  "subordinates": "Ship Tech-Priests, Arch-Magi, and Lesser Enginseers.",
  "importantSkills": "Tech-Use, Chem-Use, Common Lore (Machine Cult)"
}

// DataModel expects (V13 SCHEMA):
{
  "careerPreferences": ["Explorator", "Seneschal", "Arch-Militant", ...],
  "subordinates": ["Ship Tech-Priests", "Arch-Magi", "Lesser Enginseers"],
  "importantSkills": [
    { "name": "Tech-Use", "specialization": "" },
    { "name": "Common Lore", "specialization": "Machine Cult" }
  ]
}

// Getter tries to do:
this.careerPreferences.join(", ")  // On a STRING → [object Object]
```

---

## 🛠️ Solution Summary

### 1. Migration Script

**Parse 3 string fields → arrays**:
- Career preferences: Handle "Only X", "Usually X", "any but Y"
- Subordinates: Split on commas and "and"
- Important skills: Parse with specializations `"Skill (Spec)"`

**Extract structured data**:
- Effect text → `abilities` array with bonus, action, actionType
- Effect bonuses → populate `shipBonuses.crewRating`, etc.

### 2. DataModel Changes

**Add** `migrateData()`:
```javascript
static migrateData(source) {
  const migrated = super.migrateData?.(source) ?? foundry.utils.deepClone(source);
  
  // String → array conversions
  if (typeof migrated.careerPreferences === 'string') {
    migrated.careerPreferences = parseCareerPreferences(migrated.careerPreferences);
  }
  // ... repeat for subordinates, skills
  
  // Extract abilities from effect
  if (migrated.effect && !migrated.abilities?.length) {
    migrated.abilities = parseEffectToAbilities(migrated.effect);
  }
  
  return migrated;
}
```

**Update getters** (handle both formats):
```javascript
get careerPreferencesLabel() {
  if (Array.isArray(this.careerPreferences)) {
    return this.careerPreferences.join(", ");
  }
  // Legacy string handling
  return this.careerPreferences || "-";
}
```

### 3. Template Updates

**Modern card design** with:
- Collapsible panel
- Rank badges
- Structured abilities display
- Ship bonuses badges
- Empty state with add button

---

## 📋 Parsing Strategies

### Career Preferences

| Input | Output |
|-------|--------|
| `"Only Rogue Trader"` | `["Rogue Trader"]` |
| `"Usually Explorator, any but Missionary/Void-Master"` | `["Rogue Trader", "Arch-Militant", "Astropath", "Explorator", "Navigator", "Seneschal"]` |
| `"Seneschal, Navigator, Explorers"` | `["Seneschal", "Navigator", "Explorator"]` |

### Subordinates

| Input | Output |
|-------|--------|
| `"Ship Tech-Priests, Arch-Magi, and Lesser Enginseers."` | `["Ship Tech-Priests", "Arch-Magi", "Lesser Enginseers"]` |

### Important Skills

| Input | Output |
|-------|--------|
| `"Tech-Use, Common Lore (Machine Cult)"` | `[{name: "Tech-Use", spec: ""}, {name: "Common Lore", spec: "Machine Cult"}]` |

### Effect → Abilities

| Input | Output |
|-------|--------|
| `"+10 to Emergency Repairs Extended Actions"` | `{name: "Emergency Repairs Expertise", bonus: 10, action: "Emergency Repairs", actionType: "extended"}` |
| `"+5 to Ship Crew Rating"` | `{name: "Crew Rating Bonus", bonus: 5}` + `shipBonuses.crewRating = 5` |

---

## 🎯 Verification Checklist

After migration:

### Data Integrity
- [ ] All 22 JSON files have array fields
- [ ] Career arrays populated (not empty)
- [ ] Skills have name + specialization structure
- [ ] Abilities extracted from effect text
- [ ] Ship bonuses populated where applicable

### Build
- [ ] `npm run build` passes with 0 errors
- [ ] Pack compiles all 22 items

### Compendium Browser
- [ ] Filter to "shipRole" type
- [ ] No `[object Object]` displays
- [ ] Rank badges visible
- [ ] Career labels readable
- [ ] Ability summaries shown

### Character Sheet
- [ ] Dynasty tab → Ship Role panel displays
- [ ] No `[object Object]` in role cards
- [ ] Career preferences show as text
- [ ] Subordinates show as text
- [ ] Skills show as text (with specializations)
- [ ] Abilities display with bonuses
- [ ] Ship bonuses show as badges

### Item Sheet
- [ ] Open ship role item
- [ ] Arrays editable
- [ ] Can add/remove careers, subordinates, skills
- [ ] Abilities editor works

---

## 🔄 Rollback Procedure

If migration fails:

1. **Stop Foundry VTT**
2. **Restore backup**:
   ```bash
   cp src/packs/_backups/ship-roles-{timestamp}/*.json src/packs/rt-items-ship-roles/_source/
   ```
3. **Rebuild**:
   ```bash
   npm run build
   ```
4. **Revert code changes**:
   ```bash
   git checkout src/module/data/item/ship-role.mjs
   git checkout src/templates/actor/panel/ship-role-panel.hbs
   ```

---

## 📊 Expected Results

| Metric | Before | After |
|--------|--------|-------|
| `[object Object]` instances | ~20+ | 0 |
| Readable career text | 0/22 | 22/22 |
| Readable subordinates | 0/22 | 22/22 |
| Readable skills | 0/22 | 22/22 |
| Structured abilities | 0/22 | 22/22 |
| Ship bonuses populated | 0/22 | ~8/22 |

---

## 🚀 Implementation Order

1. ✅ **Planning** (COMPLETE)
   - Deep dive analysis
   - Solution design
   - Migration strategy

2. ⏳ **Phase 1: Migration Script** (Next)
   - Create `scripts/migrate-ship-roles.mjs`
   - Implement parsing functions
   - Dry-run validation

3. ⏳ **Phase 2: DataModel**
   - Add `migrateData()` method
   - Update display getters
   - Add new schema fields

4. ⏳ **Phase 3: Templates**
   - Modernize `ship-role-panel.hbs`
   - Add compendium metadata
   - Update styles

5. ⏳ **Phase 4: Testing**
   - Execute migration
   - Build and test in Foundry
   - Verify all displays correct
   - Create completion report

---

## 📚 Key Files

### To Create
- `scripts/migrate-ship-roles.mjs` (500+ lines)

### To Modify
- `src/module/data/item/ship-role.mjs` (+150 lines)
- `src/templates/actor/panel/ship-role-panel.hbs` (complete rewrite)
- `src/module/applications/compendium-browser.mjs` (+80 lines)
- `src/lang/en.json` (+15 keys)

### Pack Data
- `src/packs/rt-items-ship-roles/_source/*.json` (all 22 files)

---

**Ready to start? Begin with Phase 1: Migration Script**

See **SHIP_ROLES_DEEP_DIVE.md** Phase 4 section for complete migration script code.

---

*Quick reference created 2026-01-09*
