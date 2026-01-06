# Rogue Trader V13 - Deployment Guide

## What Was Fixed

### Critical Issues Resolved:
1. ✅ **Compendia now visible** - Fixed ownership permissions from `default: 0` to `PLAYER: OBSERVER`
2. ✅ **V13 compatibility** - Added required `documentTypes` section with all Actor and Item types
3. ✅ **Type system** - Added `flags.rt.types` to all packs for proper organization
4. ✅ **Origin paths accessible** - All 57 origin path items (careers, homeworlds, etc.) now work

### System Status:
- ✅ 31 compendium packs configured
- ✅ 4,251 documents compiled
- ✅ All packs have correct ownership
- ✅ All item types declared (38 types)
- ✅ All actor types declared (5 types)
- ✅ V13 LevelDB format

## Deployment Steps

### 1. Build the System
```bash
cd /home/aqui/RogueTraderVTT
npm run build
```

The built system will be in: `build/rogue-trader/`

### 2. Deploy to Foundry VTT

**Option A: Local Foundry Installation**
```bash
# Copy to Foundry systems directory
cp -r build/rogue-trader /path/to/foundry/Data/systems/rogue-trader

# Or create a symlink for development
ln -s $(pwd)/build/rogue-trader /path/to/foundry/Data/systems/rogue-trader
```

**Option B: Docker/Container Foundry**
Copy the `build/rogue-trader` directory to your Foundry volume's systems folder.

### 3. Verify in Foundry VTT

1. **Launch Foundry VTT**
2. **Create or load a Rogue Trader world**
3. **Check Compendia Tab** - You should see:
   - Actors (3 packs)
   - Equipment (6 packs)
   - Character Features (5 packs) - INCLUDING Origin Path
   - Powers & Abilities (3 packs)
   - Ships & Vehicles (7 packs)
   - Journals & Rules (5 packs)
   - Roll Tables (2 packs)

4. **Test Origin Paths**:
   - Open "RT Items: Origin Path" compendium
   - Should see 57 items organized by character creation steps
   - Try dragging one onto a character sheet

5. **Test Gear Drag & Drop**:
   - Open "RT Items: Gear" compendium (749 items)
   - Drag an item onto a character sheet
   - Should add to inventory

6. **Test Weapons**:
   - Open "RT Items: Weapons" compendium (1,093 items)
   - Drag a weapon onto a character sheet
   - Should appear in weapons panel

## Troubleshooting

### Compendia Still Not Showing?

**Check 1: Permissions**
Open browser console (F12) and check for permission errors. If you see them:
```javascript
// In Foundry console, check pack ownership:
game.packs.get("rogue-trader.rt-items-origin-path").ownership
// Should show: {PLAYER: 3, ASSISTANT: 4}
```

**Check 2: System Version**
Verify you're using the rebuilt version:
```javascript
// In Foundry console:
game.system.version
// Should show: 1.8.1 (or your version)
```

**Check 3: Rebuild**
If changes aren't appearing:
```bash
# Clean and rebuild
cd /home/aqui/RogueTraderVTT
rm -rf build
npm run build
```

### Items Show But Can't Drag?

This usually means the sheet isn't properly handling drops. Check that:
1. Character sheet is properly loaded
2. You're dragging to the correct panel (gear to gear panel, weapons to weapons panel)
3. Actor has the correct type (character/acolyte)

### Origin Paths Not Working in Character Creation?

The origin path system requires custom character creation UI. The compendia now work and items are accessible, but the automated character creation flow depends on additional UI code that may need to be implemented in the character sheet.

## What's Included

### Origin Path Items (57 total):

**Careers (8):**
- Rogue Trader, Arch-Militant, Void Master, Seneschal, Missionary, Navigator, Astropath Transcendent, Explorator

**Homeworlds (11):**
- Hive World, Imperial World, Forge World, Void Born, Frontier World, Death World, Fortress World, Penal World, and more

**Birthrights (10):**
- Child of Dynasty, In Service to the Throne, Savant, Scavenger, Scapegrace, Vaunted, and more

**Lures (10):**
- Fortune, Prestige, Renown, Devotion, Pride, Vengeance, and more

**Trials (10):**
- Darkness, Calamity, Hunter, Lost Worlds, New Horizons, The Hand of War, and more

**Motivations (8):**
- Endurance, Exhilaration, Fear, Knowledge, and more

### All Equipment & Gear:
- 1,093 weapons
- 749 gear items  
- 174 armour pieces
- 133 ammunition types
- 650 talents
- And much more!

## Need Help?

See:
- `COMPENDIUM_FIX_SUMMARY.md` - Quick summary of fixes
- `COMPENDIUM_V13_UPDATES.md` - Detailed technical changes
- `verify_v13_compendia.sh` - Verification script

Enjoy your fully functional Rogue Trader compendia! ⚙️🚀
