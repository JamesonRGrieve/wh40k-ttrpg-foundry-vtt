# CONDITIONS System - Complete Implementation Plan

**Comprehensive roadmap for fixing the CONDITIONS system**

---

## 📋 EXECUTIVE SUMMARY

**Current Status**: 🔴 **CRITICALLY BROKEN**

**Problem**: CONDITIONS are traits with a flag hack, using wrong schema, missing critical fields, displaying "Object [object]" errors everywhere.

**Solution**: Create proper `condition` item type following proven Critical Injuries pattern.

**Effort**: ~4-5 hours, 13 files (7 modified + 6 new), ~1200 lines of code

**Outcome**: 14 fully functional conditions (8 migrated + 6 new) with modern UI, proper schema, zero errors.

---

## 📚 DOCUMENTATION SUITE

### Primary Documents

| Document | Size | Purpose |
|----------|------|---------|
| **CONDITIONS_DEEP_DIVE.md** | 33KB | Complete technical analysis + 8-phase implementation guide with code examples |
| **CONDITIONS_ANALYSIS_SUMMARY.md** | 11KB | Executive summary of problems + recommended solution |
| **CONDITIONS_BEFORE_AFTER.md** | 15KB | Visual comparison showing transformation |
| **CONDITIONS_QUICK_REFERENCE.md** | 8KB | Fast lookup for implementation (this is your cheat sheet) |
| **CONDITIONS_IMPLEMENTATION_PLAN.md** | This file | Project management overview |

### Reading Order

1. **Start here**: `CONDITIONS_ANALYSIS_SUMMARY.md` (5 min read)
   - Understand the problem scope
   - See the recommendation
   - Get motivated!

2. **Visual comparison**: `CONDITIONS_BEFORE_AFTER.md` (10 min read)
   - See exactly what changes
   - Understand the improvements
   - Visualize the outcome

3. **Deep dive**: `CONDITIONS_DEEP_DIVE.md` (30 min read)
   - Complete technical details
   - All 8 phases with code
   - Testing checklist

4. **Quick reference**: `CONDITIONS_QUICK_REFERENCE.md` (reference)
   - Keep open while coding
   - Quick lookups
   - Validation commands

---

## 🎯 IMPLEMENTATION PHASES

### Phase 1: Data Model & Localization ⏱️ ~45 min

**Files**:
- `src/module/data/item/condition.mjs` — Update (+140 lines)
- `src/lang/en.json` — Add keys (+45 keys)

**Tasks**:
1. Add 8 computed properties with safe fallbacks:
   - `natureLabel`, `natureIcon`, `natureClass`
   - `appliesToLabel`, `appliesToIcon`
   - `fullName`, `durationDisplay`, `isTemporary`
2. Add `appliesTo` field to schema
3. Add `duration` SchemaField to schema
4. Fix `chatProperties` to return string array
5. Fix `headerLabels` to return flat strings
6. Add all 45 localization keys to en.json

**Validation**:
```javascript
// Test in browser console
const cond = game.items.find(i => i.type === "condition");
console.log(cond.system.natureLabel);      // "Harmful" (not object!)
console.log(cond.system.appliesToLabel);   // "Target"
console.log(cond.system.durationDisplay);  // "1 Round"
```

---

### Phase 2: Template.json Update ⏱️ ~15 min

**Files**:
- `src/template.json` — Add schema (+15 lines)

**Tasks**:
1. Add `"condition"` to Item types array (line ~1000)
2. Create `condition` schema section with all fields
3. Ensure defaults match ConditionData

**Validation**:
```bash
# Check schema is valid JSON
node -e "JSON.parse(require('fs').readFileSync('src/template.json'))"
```

---

### Phase 3: Modern Condition Sheet ⏱️ ~60 min

**Files**:
- `src/module/applications/item/condition-sheet.mjs` — Create new (+45 lines)
- `src/templates/item/item-condition-sheet-v2.hbs` — Create new (+220 lines)
- `src/module/applications/item/_module.mjs` — Export (+1 line)

**Tasks**:
1. Create ConditionSheet class (extends BaseItemSheet)
2. Define PARTS (single sheet part)
3. Define TABS (details/description/effects)
4. Create modern V2 template:
   - Header with badges
   - Details grid (nature, appliesTo, stackable, duration)
   - Effect editor (ProseMirror)
   - Removal editor (ProseMirror)
   - Source panel
   - Description editor
5. Export from _module.mjs

**Validation**:
```javascript
// Test sheet opens
const cond = game.items.find(i => i.type === "condition");
cond.sheet.render(true);  // Should open ConditionSheet, not TraitSheet!
```

---

### Phase 4: Pack Data Migration ⏱️ ~30 min

**Files**:
- `scripts/migrate-conditions.mjs` — Create new (~120 lines)
- `src/packs/rt-items-conditions/_source/*.json` — Update 8 files

**Tasks**:
1. Create migration script with metadata for 8 conditions
2. Transform each condition:
   - Change `type: "trait"` → `type: "condition"`
   - Remove legacy fields (descriptionText, effects, requirements)
   - Add new fields (nature, effect, removal, appliesTo, duration)
   - Fix source (string → object)
   - Update flags (remove kind, add generated/version)
3. Run script: `node scripts/migrate-conditions.mjs`

**Validation**:
```bash
# Check all have correct type
grep -h "\"type\":" src/packs/rt-items-conditions/_source/*.json | sort | uniq
# Should only show: "type": "condition",

# Count files
ls src/packs/rt-items-conditions/_source/*.json | wc -l
# Should show: 8
```

---

### Phase 5: Additional Conditions ⏱️ ~45 min

**Files**:
- `scripts/generate-additional-conditions.mjs` — Create new (~180 lines)
- `src/packs/rt-items-conditions/_source/*.json` — Create 6 new files

**Tasks**:
1. Create generator script for 6 new conditions:
   - Blinded, Deafened, On Fire, Bleeding, Frightened, Inspired
2. Generate proper JSON with:
   - Correct type, identifier, nature, appliesTo
   - Rich effect/removal descriptions
   - Proper source references
   - Unique IDs
3. Run script to create 6 new files

**Validation**:
```bash
# Count total
ls src/packs/rt-items-conditions/_source/*.json | wc -l
# Should show: 14 (8 migrated + 6 new)

# Check one new condition
cat src/packs/rt-items-conditions/_source/blinded_*.json
# Should have type: "condition", proper schema
```

---

### Phase 6: Chat Card Template ⏱️ ~30 min

**Files**:
- `src/templates/chat/condition-card.hbs` — Create new (~60 lines)

**Tasks**:
1. Create chat card template with:
   - Nature-specific header (colored)
   - Icon + name prominent
   - Meta badges (AppliesTo, Duration)
   - Effect section
   - Removal section (conditional)
   - Source footer
2. Use Handlebars helpers for dynamic styling

**Validation**:
```javascript
// Test chat card
const cond = game.items.find(i => i.type === "condition");
await cond.toMessage();  // Should show styled card, no errors
```

---

### Phase 7: SCSS Styling ⏱️ ~60 min

**Files**:
- `src/scss/item/_condition.scss` — Create new (~400 lines)
- `src/scss/item/_index.scss` — Import (+1 line)

**Tasks**:
1. Create comprehensive SCSS:
   - Sheet styles (form layout, badges, inputs)
   - Chat card styles (nature themes, meta tags)
   - Badge system (nature, appliesTo, stacks)
   - Animations (fade, pulse)
2. Use existing color variables
3. Import in _index.scss

**Validation**:
```bash
# Build succeeds
npm run build

# Check output
ls dist/css/rogue-trader.css
# Should exist and contain .rt-condition-card styles
```

---

### Phase 8: System Registration ⏱️ ~15 min

**Files**:
- `src/module/config.mjs` — Register sheet (+5 lines)
- `src/lang/en.json` — Add sheet label (+1 key)

**Tasks**:
1. Import ConditionSheet in config.mjs
2. Register with DocumentSheetConfig
3. Add localization key for sheet label

**Validation**:
```javascript
// Test registration
const sheets = DocumentSheetConfig.get(Item, "condition");
console.log(sheets);  // Should include ConditionSheet
```

---

## 📊 EFFORT BREAKDOWN

| Phase | Time | Complexity | Priority |
|-------|------|------------|----------|
| 1. Data Model | 45 min | Medium | 🔴 Critical |
| 2. Template.json | 15 min | Low | 🔴 Critical |
| 3. Sheet | 60 min | High | 🔴 Critical |
| 4. Migration | 30 min | Medium | 🔴 Critical |
| 5. Additional | 45 min | Medium | 🟡 Important |
| 6. Chat Card | 30 min | Low | 🟡 Important |
| 7. SCSS | 60 min | Medium | 🟢 Nice to have |
| 8. Registration | 15 min | Low | 🔴 Critical |
| **Total** | **300 min** | **~5 hours** | |

---

## 🧪 COMPREHENSIVE TEST PLAN

### Smoke Tests (Critical - Must Pass)
- [ ] Build succeeds without errors
- [ ] Foundry loads without console errors
- [ ] Pack loads with 14 conditions visible
- [ ] Can create new condition
- [ ] Condition sheet opens (not trait sheet)
- [ ] Can drag condition to character
- [ ] No "Object [object]" errors anywhere

### Data Model Tests
- [ ] `condition.system.natureLabel` returns "Harmful" (string)
- [ ] `condition.system.appliesToLabel` returns "Target" (string)
- [ ] `condition.system.durationDisplay` returns formatted string
- [ ] `condition.system.fullName` includes stacks if stackable
- [ ] `condition.system.chatProperties` returns string array
- [ ] `condition.system.headerLabels` returns flat object

### Sheet Tests
- [ ] All fields display correctly
- [ ] Nature select shows 3 options with proper labels
- [ ] AppliesTo select shows 4 options with proper labels
- [ ] Stackable checkbox toggles stacks input
- [ ] Duration inputs work (value + units select)
- [ ] ProseMirror editors work (effect, removal, description)
- [ ] Source panel displays (book/page/custom)
- [ ] Can save changes

### Visual Tests
- [ ] Nature badge displays in header (color-coded)
- [ ] AppliesTo badge displays in header
- [ ] Stacking indicator shows (×N)
- [ ] Duration badge shows (if temporary)
- [ ] SCSS colors match design (green/red/gray)

### Chat Card Tests
- [ ] Card displays when dragged to chat
- [ ] Nature-specific header color
- [ ] Icon displays
- [ ] Meta badges show (AppliesTo, Duration)
- [ ] Effect section displays HTML
- [ ] Removal section displays (if present)
- [ ] Source footer displays

### Compendium Browser Tests
- [ ] Conditions appear in browser
- [ ] Filter by type: "Condition" works
- [ ] Nature badge displays
- [ ] Source displays correctly
- [ ] Can search by name
- [ ] Can drag to character

### Edge Case Tests
- [ ] Stackable condition with stacks > 1
- [ ] Temporary condition (duration ≠ permanent)
- [ ] Beneficial condition (green theme)
- [ ] Neutral condition (gray theme)
- [ ] Condition with no removal instructions
- [ ] Condition with custom source

---

## ✅ ACCEPTANCE CRITERIA

### Must Have (Critical)
- ✅ Zero "Object [object]" errors
- ✅ Conditions are proper `condition` type (not trait)
- ✅ All 8 existing conditions migrated successfully
- ✅ Condition sheet is custom (not trait sheet)
- ✅ All fields editable
- ✅ Complete localization (45+ keys)
- ✅ Proper schema matching DataModel
- ✅ Build succeeds
- ✅ Pack loads

### Should Have (Important)
- ✅ 6 additional core conditions added
- ✅ Chat cards with nature-specific styling
- ✅ Visual badges (nature, appliesTo, stacks, duration)
- ✅ Compendium browser integration
- ✅ Source as structured object

### Nice to Have
- ✅ SCSS styling with animations
- ✅ Rich tooltips
- ✅ Custom icons per condition (vs generic)

---

## 🚦 RISK ASSESSMENT

### Low Risk
- ✅ Pattern proven (Critical Injuries already done)
- ✅ Clear documentation (33KB deep dive)
- ✅ No dependency changes
- ✅ Can test incrementally

### Potential Issues
- ⚠️ Pack migration must preserve IDs
- ⚠️ Must update template.json correctly
- ⚠️ Localization keys must match computed properties
- ⚠️ SCSS must not conflict with existing styles

### Mitigation
- ✅ Script-based migration (consistent)
- ✅ JSON validation before committing
- ✅ Safe fallbacks in computed properties
- ✅ Namespaced SCSS classes (.rt-condition-*)

---

## 📅 RECOMMENDED TIMELINE

### Option A: Sprint (1 day)
- Morning: Phases 1-4 (migrate existing)
- Afternoon: Phases 5-8 (enhance + style)
- Evening: Test + fix issues
- **Total**: 1 full day

### Option B: Incremental (3 sessions)
- Session 1: Phases 1-3 (data model + sheet) — 2 hours
- Session 2: Phases 4-5 (migration + new conditions) — 1.5 hours
- Session 3: Phases 6-8 (polish + style) — 1.5 hours
- **Total**: 3 sessions over 2-3 days

### Option C: Phased Rollout (1 week)
- Day 1: Phase 1-2 (data model ready)
- Day 2: Phase 3 (sheet working)
- Day 3: Phase 4 (migration complete)
- Day 4: Phase 5-6 (enhanced)
- Day 5: Phase 7-8 (styled + done)
- **Total**: 1 hour per day for 5 days

**Recommended**: **Option B** (Incremental) — Good balance of progress and testing time

---

## 🎓 LESSONS FROM CRITICAL INJURIES

### What Worked Well
- ✅ Script-based pack generation (consistent, fast)
- ✅ Safe fallbacks in computed properties (no errors)
- ✅ Complete localization upfront (no missing keys)
- ✅ Modern V2 sheet with tabs (good UX)
- ✅ Comprehensive planning document (this!)

### Apply to CONDITIONS
- ✅ Use same safe fallback pattern
- ✅ Create migration script (not manual)
- ✅ Add all localization keys first
- ✅ Follow same sheet structure
- ✅ Plan before coding

---

## 📊 SUCCESS METRICS

### Quantitative
- ✅ Build time: < 30 seconds
- ✅ Console errors: 0
- ✅ "Object [object]" occurrences: 0
- ✅ Conditions in pack: 14
- ✅ Localization coverage: 100%
- ✅ Test pass rate: 100%

### Qualitative
- ✅ User can create/edit conditions easily
- ✅ Visual design matches system aesthetic
- ✅ Chat cards are informative and attractive
- ✅ Compendium browser is useful
- ✅ No confusion between conditions and traits

---

## 🔄 CONTINUOUS IMPROVEMENT

### Post-Implementation
1. Gather user feedback
2. Monitor console for errors
3. Track which conditions are most used
4. Consider adding more conditions based on usage

### Future Enhancements (Not in scope)
- Active effects automation
- Duration tracking with timers
- Condition immunity system
- Stacking cap configuration
- Condition prerequisites/chains

---

## 📞 SUPPORT & REFERENCES

### If You Get Stuck

1. **Check deep dive**: `CONDITIONS_DEEP_DIVE.md` has all code examples
2. **Compare to Critical Injuries**: Same pattern, proven working
3. **Console errors**: Check browser console for specific errors
4. **Localization**: Use `game.i18n.has(key)` to check keys exist
5. **Schema**: Verify template.json matches DataModel exactly

### Key Reference Files
- `src/module/data/item/critical-injury.mjs` — Computed properties pattern
- `CRITICAL_INJURIES_DEEP_DIVE.md` — Same refactor pattern
- `CRITICAL_INJURIES_IMPLEMENTATION_SUMMARY.md` — What was done for injuries

---

## ✅ FINAL CHECKLIST

- [ ] Read all 4 documentation files
- [ ] Understand the problem (broken trait hack)
- [ ] Understand the solution (proper condition type)
- [ ] Set aside 5 hours (or 3 sessions)
- [ ] Follow phases in order
- [ ] Test after each phase
- [ ] Run all validation commands
- [ ] Complete full test plan
- [ ] Build succeeds
- [ ] Zero errors in Foundry
- [ ] Update AGENTS.md with changes

---

**Status**: Complete planning, ready to execute  
**Confidence**: High (proven pattern from Critical Injuries)  
**Next Action**: Begin Phase 1 in `CONDITIONS_DEEP_DIVE.md`

**Good luck!** 🚀
