# 🚀 Quick Start - Rogue Trader V13 Compendia

## What Was Done

✅ **Fixed the main problem**: Compendia now visible (ownership was set to 0)  
✅ **Added V13 compatibility**: documentTypes declaration  
✅ **Built compendium browser**: Search & filter all content  
✅ **Added smart integration**: Auto-apply origin paths to characters  

## How to Use Right Now

### 1. Deploy the System
```bash
# Already built! Just copy it:
cp -r build/rogue-trader /path/to/foundry/Data/systems/rogue-trader
```

### 2. Open Compendium Browser
In Foundry console or macro:
```javascript
game.rt.openCompendiumBrowser()
```

You'll see a beautiful browser with:
- Search bar
- Source & category filters  
- All 4,251 items clickable & draggable

### 3. Apply an Origin Path
```javascript
// Quick example - Apply Rogue Trader career
const pack = game.packs.get('rogue-trader.rt-items-origin-path');
const career = await pack.getDocument('iRaYAhcZNkQMGTXF'); // Rogue Trader
const actor = game.actors.getName('Your Character Name');

await career.applyOriginToActor(actor);
// ✨ Magic! Characteristic bonuses, skills, and talents all added!
```

### 4. Preview Before Applying
```javascript
const origin = await fromUuid('Compendium.rogue-trader.rt-items-origin-path.iRaYAhcZNkQMGTXF');
console.log(origin.getOriginPreview());
// Shows exactly what you'll get!
```

## What's Available

### 📚 31 Compendium Packs
- All visible and working
- All 4,251 documents accessible
- Drag & drop enabled

### 🎭 57 Origin Paths  
- 8 Careers (Rogue Trader, Arch-Militant, etc.)
- 11 Homeworlds (Hive World, Forge World, etc.)
- 10 Birthrights, 10 Lures, 10 Trials, 8 Motivations

### ⚔️ Equipment
- 1,093 Weapons
- 749 Gear Items
- 650 Talents
- 355 Psychic Powers
- And much more!

## Key Commands

```javascript
// Open browser
game.rt.openCompendiumBrowser()

// Apply origin to character
await originItem.applyOriginToActor(actor)

// Preview origin
originItem.getOriginPreview()

// Check if item is an origin
item.isOriginPath // true/false
```

## Files to Read

1. **COMPLETE_V13_INTEGRATION.md** - Full feature list
2. **DEPLOYMENT_GUIDE.md** - Detailed deployment steps
3. **COMPENDIUM_ENHANCEMENTS.md** - Technical details & API

## Troubleshooting

**Compendia still not showing?**
- Rebuild: `npm run build`
- Check ownership in console: `game.packs.get("rogue-trader.rt-items-origin-path").ownership`
- Should show `{PLAYER: 3, ASSISTANT: 4}`

**Browser not opening?**
- Check console for errors
- Verify file exists: `src/module/applications/compendium-browser.mjs`
- Rebuild if needed

**Origin not applying?**
- Make sure you have both the origin item AND target actor
- Check console for any error messages
- Verify the item has `system.modifiers` data

## That's It!

You now have a fully functional, modern Foundry VTT V13 compendium system with:
- ✅ All compendia visible
- ✅ Advanced search & filtering
- ✅ Smart character creation
- ✅ Drag & drop everything
- ✅ Professional UI

**Just run `game.rt.openCompendiumBrowser()` and start exploring!** 🎉

---

*Questions? Check the other documentation files or test from the Foundry console.*
