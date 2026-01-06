# Journal Not Showing - Quick Fix Guide

## 🔍 Problem Identified

The enhanced journal **IS created** (verified ✅) but **Foundry hasn't loaded it yet** because:

1. ✅ Enhanced JSON exists in source: `src/packs/rt-journals-character-creation/_source/character-creation_koPySvFXZhwQlpXs.json`
2. ✅ Contains 3 rich HTML pages with styling
3. ❌ **Not compiled into LevelDB pack** (Foundry is running, files locked)
4. ❌ Foundry is showing the **old compiled version** from before enhancement

## ✅ Solution (Pick One)

### Option 1: Close Foundry & Build (Recommended)
```bash
# 1. Close Foundry VTT completely
# 2. Run build:
npm run build

# 3. Relaunch Foundry
# 4. Check RT Journals: Character Creation compendium
```

### Option 2: Build Without Full Clean (If Foundry Running)
```bash
# This builds just the packs without cleaning:
npm run packs
```
**Note:** May still fail if Foundry has files locked

### Option 3: Manual Copy (Quick Test)
```bash
# 1. Close Foundry
# 2. Delete old pack:
rm -rf "/mnt/c/Users/Dreski-PC/AppData/Local/FoundryVTT/Data/systems/rogue-trader/packs/rt-journals-character-creation"

# 3. Run build:
npm run build

# 4. Relaunch Foundry
```

## 📊 What Changed

**Source File (What We Modified):**
```
src/packs/rt-journals-character-creation/_source/
└── character-creation_koPySvFXZhwQlpXs.json ✅ ENHANCED
    ├── 3 pages (was 1)
    ├── 27KB (was 94KB)
    ├── Rich HTML with CSS
    ├── Styled tables
    └── Callout boxes
```

**Compiled Pack (What Foundry Reads - NOT YET UPDATED):**
```
/mnt/c/Users/.../rogue-trader/packs/rt-journals-character-creation/
├── 000005.ldb ❌ OLD VERSION (79KB from before)
├── 000006.log
├── LOCK ⚠️ Foundry has this locked!
└── MANIFEST-000004
```

## 🎯 Verification Steps

After building:

1. **Check file timestamp:**
   ```bash
   ls -lh /mnt/c/Users/Dreski-PC/AppData/Local/FoundryVTT/Data/systems/rogue-trader/packs/rt-journals-character-creation/*.ldb
   ```
   Should show recent timestamp

2. **In Foundry:**
   - Open Compendiums
   - Find "RT Journals: Character Creation"
   - Click to open
   - Should see **3 pages** in sidebar (not 1)
   - Pages should have:
     - ⚔️ Styled headers with gold/crimson gradient
     - 📊 Formatted tables
     - 🎲 Dice roll badges
     - 📦 Callout boxes

3. **Quick Test:**
   - Open "Welcome to Rogue Trader" page
   - Should see dramatic header with gradient
   - Look for styled section boxes
   - Check for "Origin Path" callout with list

## 🔧 If Still Not Working

### Check Console (F12 in Foundry)
Look for errors like:
- Journal rendering errors
- CSS not loading
- Page structure issues

### Verify Source Content
```bash
cd src/packs/rt-journals-character-creation/_source
node -e "const j=JSON.parse(require('fs').readFileSync('character-creation_koPySvFXZhwQlpXs.json')); console.log('Pages:', j.pages.length); console.log('Has CSS:', j.pages[0].text.content.includes('.rt-header'));"
```
Should output:
```
Pages: 3
Has CSS: true
```

### Force Rebuild
```bash
# Close Foundry completely
# Delete entire packs folder in Foundry data:
rm -rf "/mnt/c/Users/Dreski-PC/AppData/Local/FoundryVTT/Data/systems/rogue-trader/packs"

# Rebuild everything:
npm run build

# Relaunch Foundry
```

## 📝 Expected Visual Changes

### Before (Old Journal)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Character Creation          |
|                             |
| <pre>                       |
| Explorer Creation...        |
| Generating Characteristics  |
| [massive block of text]     |
| </pre>                      |
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### After (Enhanced Journal)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Character Creation          |
├─ 📄 Welcome to Rogue Trader
├─ 📄 Step 1: Characteristics  
└─ 📄 Step 2: Home World       
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Page 1: Welcome to Rogue Trader
╔═══════════════════════════╗
║ ⚔️ Character Creation ⚔️  ║
║ Forge Your Legacy...      ║
╚═══════════════════════════╝

🌟 Welcome, Explorer
[Styled section with border]

📜 The Origin Path System
[Callout box with list]
...
```

## 🎉 Success Indicators

You'll know it worked when you see:
- ✅ **3 pages** in journal sidebar (not 1)
- ✅ **Crimson & gold gradient** headers
- ✅ **Styled tables** with hover effects
- ✅ **Callout boxes** with borders
- ✅ **Dice notation** in red badges
- ✅ **Characteristic badges** (WS, BS, etc.)
- ✅ **Clean, readable formatting**

## 💾 Status

**Source Files**: ✅ Enhanced and ready
**Compiled Packs**: ❌ Waiting for build
**Foundry Display**: ❌ Showing old version

**Action Required**: Close Foundry → Run `npm run build` → Relaunch Foundry

---

**TL;DR:** The enhanced journal exists but Foundry needs to be closed so we can compile it. Close Foundry, run `npm run build`, then relaunch to see the new multi-page styled journal!
