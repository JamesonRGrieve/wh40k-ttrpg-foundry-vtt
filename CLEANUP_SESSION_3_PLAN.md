# Cleanup Session 3 - Next Steps Plan

**Date:** 2026-01-08  
**Previous Sessions:** Phase 1 (Templates), Quick Wins (Prompts/Dirs)  
**Current Status:** Medium priority review  

---

## Analysis of Medium Priority Items

### 1. TODO/FIXME Comments - DECISION: Keep All ✅

**Reviewed 4 TODO comments:**

1. **item-container.mjs:166** - "see how to avoid this"
   - **Context:** Workaround for contained items setup
   - **Decision:** KEEP - Documents intentional workaround, useful for future optimization
   - **Action:** None

2. **basic-action-manager.mjs:230** - "Cleanup all rolls older than ? minutes"
   - **Context:** Memory management for stored rolls
   - **Decision:** KEEP - Valid future feature (garbage collection)
   - **Action:** None (implement when memory issues arise)

3. **combat-quick-panel.mjs:647** - "Show weapon selection dialog"
   - **Context:** Multiple weapons available to draw
   - **Decision:** KEEP - Planned feature enhancement
   - **Action:** None (currently shows notification fallback)

4. **combat-quick-panel.mjs:697** - "Implement consumable use logic"
   - **Context:** Placeholder for consumable items
   - **Decision:** KEEP - Future feature for consumable tracking
   - **Action:** None (currently creates chat message)

**Rationale:** All TODOs mark legitimate future features with working fallbacks. They serve as documentation and future work markers.

---

### 2. Mixin Renaming - DECISION: Skip ✅

**Analyzed:**
- `drag-drop-mixin.mjs` (84 lines) - Base API layer
- `enhanced-drag-drop-mixin.mjs` (765 lines) - Visual feedback layer

**Current Names:**
```javascript
// Base API layer
export default function DragDropMixin(Base) { ... }

// Enhanced visual layer  
export default function EnhancedDragDropMixin(Base) { ... }
```

**Evaluation:**
- ✅ Names are clear and descriptive
- ✅ "Enhanced" prefix clearly indicates layered functionality
- ✅ Both mixins serve distinct purposes (API vs Visual)
- ✅ No confusion in actual usage

**Suggested Alternative (rejected):**
- `DragDropApiMixin` - Less clear than current
- `DragDropVisualMixin` - Doesn't capture full scope of enhancements

**Decision:** Keep current names - they're already optimal

---

## Next Steps: SCSS Cleanup

### Current Situation

**Old Panel SCSS Still in Use:**
```
src/scss/panels/
├── _wounds.scss        (14K)
├── _fatigue.scss       (13K)  
├── _fate.scss          (13K)
├── _corruption.scss    (3.7K)
```

**Used By:**
- `actor-npc-sheet.hbs` - Uses old `wounds-panel.hbs`, `fatigue-panel.hbs`, `fate-panel.hbs`

**V2 Versions:**
```
src/scss/panels/
├── _wounds.scss → styles for wounds-panel-v2.hbs (Acolyte)
├── _corruption-v2.scss → styles for corruption-panel-v2.hbs (Acolyte)
├── _insanity-v2.scss → styles for insanity-panel-v2.hbs (Acolyte)
```

**Problem:** Same filenames but different content for V1 vs V2 panels

---

## Recommended Approach: NPC Sheet Migration First

### Why Migrate NPC Sheet?

1. **Already V2** - NpcSheet extends AcolyteSheet (only 58 lines)
2. **Small Template** - actor-npc-sheet.hbs only 150 lines
3. **Similar Structure** - Uses similar panels to Acolyte
4. **Unblocks SCSS Cleanup** - Can then remove old SCSS files
5. **Low Risk** - Smaller scope than Starship/Vehicle

### NPC Sheet Migration Steps

**Phase A: Create NPC Template Directory**
```
src/templates/actor/npc/
├── header.hbs          (portrait, name, type, faction)
├── tabs.hbs            (tab navigation)
├── tab-main.hbs        (characteristics, skills, combat stats)
├── tab-abilities.hbs   (talents, traits, psychic powers)
├── tab-equipment.hbs   (weapons, armour, gear)
└── tab-notes.hbs       (description, tactics)
```

**Phase B: Convert Panels to V2**
- Use `wounds-panel-v2.hbs` instead of `wounds-panel.hbs`
- Use `fatigue-panel-v2.hbs` instead of `fatigue-panel.hbs`
- Use `fate-panel-v2.hbs` instead of `fate-panel.hbs`

**Phase C: Update NPC Sheet Class**
- Define proper PARTS (4-6 parts)
- Implement `_preparePartContext()`
- Add tab configuration

**Phase D: Delete Old Panels**
After migration complete:
- Delete `wounds-panel.hbs` (old version)
- Delete `fatigue-panel.hbs` (old version)
- Delete `fate-panel.hbs` (old version)
- Delete old SCSS files (~43KB)

---

## Alternative: Incremental SCSS Approach

**If NPC migration is too large:**

1. **Rename V1 SCSS to Legacy**
   ```
   _wounds.scss → _wounds-legacy.scss
   _fatigue.scss → _fatigue-legacy.scss
   _fate.scss → _fate-legacy.scss
   _corruption.scss → _corruption-legacy.scss
   ```

2. **Rename V2 SCSS to Standard**
   ```
   Keep _wounds.scss (V2 version - already correct!)
   _corruption-v2.scss → _corruption.scss
   _insanity-v2.scss → _insanity.scss
   ```

3. **Update Import Paths**
   - Update `_index.scss` to import `-legacy` versions for NPC
   - Use standard versions for Acolyte

**Pros:**
- Clarifies which is legacy vs modern
- Can be done independently of template migration

**Cons:**
- Doesn't reduce file count
- Still have duplication until NPC migrates

---

## Recommendation

**Priority Order:**

1. ✅ **Medium Priority Items** - SKIP (already optimal)
2. 🎯 **Option A: NPC Sheet Migration** (Recommended)
   - Duration: 2-3 hours
   - Benefit: Unblocks SCSS cleanup, full V2 consistency
   - Enables deletion of 7 files (~43KB)
   
3. 🔄 **Option B: SCSS Rename** (Quick workaround)
   - Duration: 30 minutes
   - Benefit: Clarifies legacy vs modern
   - Still leaves duplication

**Vote: Option A - NPC Migration**

Reasons:
- NPC sheet is already 90% V2 (extends AcolyteSheet)
- Template is small (150 lines)
- Unblocks significant cleanup (7 files, ~43KB)
- Achieves full V2 consistency
- Future-proof (no more V1 panel dependencies)

---

## Next Session Checklist

**If proceeding with NPC Migration:**

- [ ] Create `src/templates/actor/npc/` directory
- [ ] Split actor-npc-sheet.hbs into 4-6 PARTS
- [ ] Create tab templates (main, abilities, equipment, notes)
- [ ] Update NpcSheet.mjs PARTS configuration
- [ ] Implement `_preparePartContext()` routing
- [ ] Test NPC sheet rendering
- [ ] Switch to V2 panels (wounds, fatigue, fate)
- [ ] Update handlebars-manager.mjs
- [ ] Delete old panel templates (3 files)
- [ ] Delete old SCSS files (4 files, ~43KB)
- [ ] Update SCSS index imports
- [ ] Test both Acolyte and NPC sheets

**Estimated Time:** 2-3 hours  
**Risk Level:** Low-Medium  
**Benefit:** High (full V2 consistency, enables SCSS cleanup)

---

## Summary

**Medium Priority Review:** ✅ Complete
- TODOs: Keep all (valid future work)
- Mixins: Keep names (already optimal)

**Next Recommended Action:** NPC Sheet Migration
- Small scope (150-line template, 58-line class)
- High benefit (unblocks SCSS cleanup)
- Already mostly V2 (extends AcolyteSheet)

**Alternative:** SCSS rename as quick workaround (if time-limited)

---

## Related Documents
- `TEMPLATE_CLEANUP_TRACKING.md` - Phase 1 & 2 complete
- `CLEANUP_SUGGESTIONS.md` - Full roadmap
- `AGENTS.md` - Architecture reference
- `APPLICATIONV2_PROGRESS.md` - V2 migration status
