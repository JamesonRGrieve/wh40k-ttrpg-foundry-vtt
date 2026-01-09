# Ship Items Quick Start Guide
**Read this first!** | 5-minute overview

---

## 🚀 What I Did

Fixed ship components/weapons/upgrades displaying `[object Object]` on starship sheets.

**Changes**: 5 files modified, 1 script created, 4 docs written

---

## ✅ Quick Validation (2 minutes)

```bash
# 1. Build
npm run build

# 2. Start Foundry and test
# - Open a starship actor
# - Check Components/Weapons/Upgrades panels
# - Look for "[object Object]" text
# - Should see proper numbers/text instead
```

**Expected Result**: NO `[object Object]` anywhere

---

## 📁 Files Changed

**Modified** (5 files):
1. `src/module/data/item/ship-upgrade.mjs` - Added migration
2. `src/module/data/item/ship-weapon.mjs` - Enhanced migration
3. `src/templates/actor/panel/ship-upgrades-panel.hbs` - Fixed fields
4. `src/templates/actor/panel/ship-weapons-panel.hbs` - Added helpers
5. `src/module/handlebars/handlebars-helpers.mjs` - New helpers

**Created** (4 docs + 1 script):
- `SHIP_ITEMS_COMPLETE_REFACTOR_PLAN.md` - Full analysis (22KB)
- `SHIP_ITEMS_TESTING_GUIDE.md` - How to test (12KB)
- `SHIP_ITEMS_IMPLEMENTATION_SUMMARY.md` - What was done (13KB)
- `SHIP_ITEMS_DEEP_DIVE_SUMMARY.md` - Executive summary (10KB)
- `scripts/clean-ship-weapons.mjs` - Optional pack cleanup

---

## 🧪 Testing (30 minutes)

Follow `SHIP_ITEMS_TESTING_GUIDE.md` for detailed steps.

**Critical tests**:
1. Ship upgrades display correctly (was showing `[object Object]`)
2. Ship weapons show "-" for 0 strength/crit (not "0")
3. Ship components still work (no regression)
4. No console errors

**Pass criteria**: All tests green

---

## 📦 Commit

```bash
# After testing passes
git add src/module/data/item/ship-upgrade.mjs
git add src/module/data/item/ship-weapon.mjs
git add src/templates/actor/panel/ship-upgrades-panel.hbs
git add src/templates/actor/panel/ship-weapons-panel.hbs
git add src/module/handlebars/handlebars-helpers.mjs
git add scripts/clean-ship-weapons.mjs
git commit -m "fix: Ship items display - migrate upgrades, handle weapon edge cases"
```

---

## 🎯 What Was Fixed

| Item | Before | After |
|------|--------|-------|
| **Ship Upgrades** | `[object Object]` everywhere | Numbers and text |
| **Ship Weapons** | `0` and `0+` for missing values | `-` (cleaner) |
| **Ship Components** | Already working | Still working |

---

## 📚 Read More

- **SHIP_ITEMS_DEEP_DIVE_SUMMARY.md** - Executive summary (10 min read)
- **SHIP_ITEMS_COMPLETE_REFACTOR_PLAN.md** - Full technical details (30 min read)
- **SHIP_ITEMS_TESTING_GUIDE.md** - Step-by-step testing (30-60 min)

---

## 🆘 If Something Breaks

1. Check console for errors
2. Review `SHIP_ITEMS_TESTING_GUIDE.md` troubleshooting section
3. Revert commit and rebuild

**Risk**: 🟢 LOW (non-destructive, runtime migration)

---

## ✨ Optional Enhancements

**Pack Cleanup** (optional):
```bash
# Preview what would change
node scripts/clean-ship-weapons.mjs --dry-run

# Apply changes (after testing confirms migrations work)
node scripts/clean-ship-weapons.mjs
git add src/packs/rt-items-ship-weapons/_source/
git commit -m "chore: Clean ship weapons pack data"
```

**Benefit**: Cleaner pack data, slightly faster load  
**Requirement**: Only run AFTER testing confirms runtime migration works

---

## 🎓 Key Concepts

**Runtime Migration**: DataModel automatically converts legacy pack data on load  
**Display Helpers**: Handlebars functions format values for display  
**Non-Destructive**: Original pack data unchanged (optional cleanup script available)

---

## 📊 Status

- ✅ Analysis complete
- ✅ Code implemented
- ⏳ Testing pending
- ⏳ Commit pending

**Next**: Test and commit!

---

**Time to Deploy**: 30-60 minutes (testing + commit)  
**Complexity**: 🟢 Simple (just testing needed)  
**Impact**: 🔴 Critical fix (was unusable before)
