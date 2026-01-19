# Phase 7 QoL Features - Quick Reference

## 🎯 Quick Token Setup

**What:** Auto-configure token from NPC stats  
**How:** NPC sheet → GM Tools → "Setup Token" button

**Auto-configures:**
- ✅ Size-based dimensions (0.5x to 4x)
- ✅ Vision (30ft standard, 60ft darkvision for daemon/xenos)
- ✅ Bars (wounds + magnitude for hordes)
- ✅ Disposition (hostile)
- ✅ Display mode (owner hover)

**Console:**
```javascript
// Setup any NPC token
const npc = game.actors.getName("Chaos Cultist");
// Then click "Setup Token" on sheet
```

---

## 📊 Difficulty Calculator

**What:** Calculate encounter difficulty vs active party  
**How:** NPC sheet → GM Tools → "Calculate Difficulty" button

**Shows:**
- Party size & average rank
- NPC threat × quantity
- Threat ratio with color coding
- Difficulty rating (Trivial → Apocalyptic)

**Difficulty Scale:**
| Ratio | Rating | Meaning |
|-------|--------|---------|
| <0.25 | Trivial | Walk in the park |
| 0.25-0.50 | Easy | Light encounter |
| 0.50-0.75 | Moderate | Fair fight |
| 0.75-1.00 | Dangerous | Serious wounds |
| 1.00-1.50 | Deadly | May die |
| >1.50 | Apocalyptic | TPK territory |

**Console:**
```javascript
// Open calculator
game.rt.calculateDifficulty(actor);

// Or
const dialog = new game.rt.applications.DifficultyCalculatorDialog(actor);
dialog.render(true);
```

---

## 💾 Combat Presets

**What:** Save/load NPC builds as templates  
**How:** NPC sheet → GM Tools → "Save/Load Preset" buttons

### Save Preset
1. Configure NPC stats
2. Click "Save as Preset"
3. Enter name & description
4. Preset stored in world

### Load Preset
1. Click "Load Preset"
2. Browse preset library
3. Select preset
4. Click "Load" (overwrites current NPC)

### Manage Library
**Console:** `game.rt.openPresetLibrary()`

**Features:**
- ✅ View all presets
- ✅ Export preset to JSON
- ✅ Import preset from JSON
- ✅ Delete presets

**Console API:**
```javascript
// Get all presets
const presets = game.rt.CombatPresetDialog.getPresets();

// Save current NPC as preset
game.rt.savePreset(actor);

// Load preset to NPC
game.rt.loadPreset(actor);

// Open library
game.rt.openPresetLibrary();

// Direct manipulation
const preset = game.rt.CombatPresetDialog.getPreset(id);
await game.rt.CombatPresetDialog.addPreset(presetData);
await game.rt.CombatPresetDialog.deletePresetById(id);
await game.rt.CombatPresetDialog.applyPresetToNPC(actor, preset);
```

---

## 🔧 Integration Points

### NPC Sheet Buttons
All features accessible from GM Tools section:
- 🎯 Setup Token
- 📊 Calculate Difficulty  
- 💾 Save Preset
- 💾 Load Preset

### Global API
```javascript
game.rt.calculateDifficulty(actor);     // Open difficulty calculator
game.rt.savePreset(actor);              // Save NPC as preset
game.rt.loadPreset(actor);              // Load preset to NPC
game.rt.openPresetLibrary();            // Manage all presets
```

### Namespaces
```javascript
game.rt.applications.DifficultyCalculatorDialog
game.rt.applications.CombatPresetDialog
game.rt.npc.DifficultyCalculatorDialog     // Alias
game.rt.npc.CombatPresetDialog             // Alias
```

---

## 📝 Preset Data Structure

**What's Saved:**
```javascript
{
  name: "Elite Guard",              // ← You provide
  description: "Well-trained...",   // ← You provide
  faction: "Imperium",
  type: "elite",
  role: "bruiser",
  threatLevel: 12,
  characteristics: {...},           // All 10 characteristics
  wounds: {...},                    // Max, current, critical
  trainedSkills: {...},             // All skills
  weapons: {...},                   // All weapons
  armour: {...},                    // All armour
  horde: {...},                     // Horde config
  tags: [...]                       // All tags
}
```

**What's NOT Saved:**
- Actor name
- Actor image
- Actor UUID
- Embedded items (talents, traits)
- Special abilities text
- Tactics text
- Description text

---

## 💡 Tips & Tricks

### Token Setup
- Run after creating NPC to get default config
- Size changes? Re-run to update token
- Customize further in token config if needed

### Difficulty Calculator
- Quantity = number of this NPC in encounter
- Works with horde magnitude automatically
- Multiple NPC types? Calculate each separately
- Party size = active users with characters

### Combat Presets
- **Save early, save often** - Don't lose work
- **Name descriptively** - "Elite Guard" not "NPC1"
- **Export favorites** - Share with other GMs
- **Use for variants** - Save "Chaos Cultist" then modify for "Chaos Champion"

### Workflows

**Quick Encounter:**
1. Load preset → "Chaos Cultist"
2. Rename actor → "Cultist Alpha"
3. Setup token
4. Calculate difficulty
5. Drag to scene

**Create Template:**
1. Build NPC from scratch
2. Test in combat
3. Save as preset
4. Use for future encounters

**Share with Group:**
1. Save preset
2. Export to JSON
3. Send to other GM
4. They import
5. Consistent NPCs across campaigns

---

## 🐛 Common Issues

### "No party members found"
**Fix:** Ensure users have assigned characters with rank set

### "Preset not saving"
**Fix:** Must be GM to save world-scoped presets

### "Token setup does nothing"
**Fix:** Check that NPC has valid size (1-10)

### "Difficulty seems wrong"
**Fix:** Verify party rank is set correctly on characters

---

## 🚀 Advanced Usage

### Batch Token Setup
```javascript
// Setup all NPCs in a folder
const folder = game.folders.getName("Enemies");
for (const actor of folder.contents) {
  // Trigger setup token action
  await actor.update({
    "prototypeToken.width": /* calculate */,
    "prototypeToken.height": /* calculate */
  });
}
```

### Export All Presets
```javascript
// Backup all presets
const presets = game.rt.CombatPresetDialog.getPresets();
const json = JSON.stringify(presets, null, 2);
saveDataToFile(json, "application/json", "combat-presets-backup.json");
```

### Difficulty Analysis
```javascript
// Check all NPCs in folder
const folder = game.folders.getName("Encounter 1");
for (const npc of folder.contents) {
  const dialog = new game.rt.applications.DifficultyCalculatorDialog(npc);
  console.log(`${npc.name}: ${dialog._getDifficultyRating(/* ratio */).label}`);
}
```

---

## 📚 See Also

- `PHASE_7_QOL_FEATURES_COMPLETE.md` - Full implementation details
- `NPC_V2_PHASES_3_4_COMPLETE.md` - Quick create & threat scaling
- `PHASE_5_COMPLETE_SUMMARY.md` - Threat calculator utilities
- `NPC_SYSTEM_DEEP_DIVE.md` - Complete NPC system docs

---

**Version:** Phase 7 Complete  
**Updated:** 2026-01-15
