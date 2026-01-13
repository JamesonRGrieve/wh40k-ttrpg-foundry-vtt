# Lineage Quick Reference

## Overview
- **Source:** Into the Storm, pages 29-32
- **Type:** Optional 7th origin path step
- **Cost:** Variable XP (100-500) paid from starting XP only
- **Timing:** Character creation only (cannot be acquired later)
- **Files:** 18 talents + 6 origin path items (ALL 6 LINEAGES COMPLETE)

---

## The Five Lineages

### 1. A Long and Glorious History
**Theme:** Ancient family, widespread influence, legendary ancestors

| Option | Cost | Grants | Drawback |
|--------|------|--------|----------|
| A Dark Secret | 100 XP | Deceive + Scrutiny | -1 PF |
| My Great-Grandfather | 350 XP | 1 Peer (choice) + 1 PF | None |
| Prominent Ancestry | 200 XP | Scholastic Lore (Archaic) + (Legend) as Basic | None |

### 2. A Proud Tradition
**Theme:** Generations of same profession (Rogue Traders, Navigators, military)

| Option | Cost | Grants | Drawback |
|--------|------|--------|----------|
| Heir Apparent | 100 XP | Talented (1 career skill) | None |
| Uncertain Inheritance | 300 XP | Paranoia + Deceive + 3 Int/Per | None |
| Shameful Offspring | 150 XP | Carouse/Gamble + Decadence | 1d5 Cor/Ins |

### 3. Accursed Be Thy Name
**Theme:** Heretical family, Inquisitorial scrutiny, dark legacy

| Option | Cost | Grants | Drawback |
|--------|------|--------|----------|
| Outraged Scion | 300 XP | Armour of Contempt + 2 Forbidden Lores as Basic | None |
| Secret Taint | 400 XP | Dark Soul + Deceive + 5 Int/WP | 1d10+10 Cor |
| Vile Insight | 300 XP | 3 Forbidden Lores (trained) | 2d5 Ins + 2d5 Cor |

### 4. Disgraced
**Theme:** Fallen family, depleted resources, broken reputation

| Option | Cost | Grants | Drawback |
|--------|------|--------|----------|
| Another Generation | 100 XP | Carouse + Peer (Underworld) | -2 PF |
| The Last Child | 200 XP | Barter + 1 Trade + 3 Int/Fel | -3 PF |
| The One to Redeem | 300 XP | Commerce + 50 Endeavour AP | -1 PF |

### 5. Of Extensive Means
**Theme:** Immense wealth, elite society, born to rule

| Option | Cost | Grants | Drawback |
|--------|------|--------|----------|
| A Powerful Legacy | 350 XP | Talented (Intimidate) + Talented (Command) + Air of Authority | None |
| Born to Wealth ✨ NEW | 300 XP | +2 Profit Factor | None |
| Far-Reaching Contacts ✨ NEW | 300 XP | 3 Peer talents (choice) | None |

### 6. Witch-Born ✨ COMPLETELY NEW ✨
**Theme:** Psychic heritage, family touched by the warp

| Option | Cost | Grants | Drawback |
|--------|------|--------|----------|
| Perilous Choice | 500 XP | Psy Rating 1 + Discipline + Technique + Psyniscience | Unsanctioned! Renegade table |
| Proven to be Pure | 200 XP | Resistance (Psychic Powers) | None |
| Witch-knowledge | 300 XP | Forbidden Lore (Psykers/Warp) + Peer (Astropaths/Insane) | None |

**Special:** Perilous Choice cannot be taken by Astropaths or Navigators

---

## Quick Stats

### Skills Granted
- **Social:** Deceive (4×), Carouse (2×), Barter, Commerce
- **Knowledge:** Scrutiny, Scholastic Lore (2×), Forbidden Lore (10× choices), Psyniscience
- **Trade:** One Trade skill (choice)
- **Psychic:** Psyniscience (Perilous Choice)

### Talents Granted
- **Leadership:** Air of Authority, Talented (Command), Talented (Intimidate)
- **Social:** Peer (6× choices total), Decadence
- **Mental:** Paranoia, Talented (career skill)
- **Defensive:** Armour of Contempt, Dark Soul, Resistance (Psychic Powers)

### Characteristic Bonuses
- +3 Intelligence or Perception (Uncertain Inheritance)
- +5 Intelligence or Willpower (Secret Taint)
- +3 Intelligence or Fellowship (The Last Child)

### Corruption/Insanity
- 1d5 (Shameful Offspring - choice)
- 1d10+10 Corruption (Secret Taint)
- 2d5 Insanity + 2d5 Corruption (Vile Insight)

### Profit Factor
- **Gains:** Born to Wealth (+2), My Great-Grandfather (+1)
- **Losses:** Dark Secret (-1), Another Generation (-2), Last Child (-3), Redeemer (-1)

### Psychic Powers
- **Perilous Choice:** Grants Psy Rating 1, one discipline, one technique ≤100xp
- **WARNING:** Unsanctioned psyker - uses Renegade Psyker table

---

## File Locations

### Talents (18 total)
`/src/packs/rt-items-talents/_source/`
- `a-dark-secret-lineage_LN00000000000001.json`
- `my-great-grandfather-built-this-colony-lineage_LN00000000000002.json`
- `prominent-ancestry-lineage_LN00000000000003.json`
- `heir-apparent-lineage_LN00000000000004.json`
- `uncertain-inheritance-lineage_LN00000000000005.json`
- `shameful-offspring-lineage_LN00000000000006.json`
- `outraged-scion-lineage_LN00000000000007.json`
- `secret-taint-lineage_LN00000000000008.json`
- `vile-insight-lineage_LN00000000000009.json`
- `another-generation-of-shame-lineage_LN00000000000010.json`
- `the-last-child-lineage_LN00000000000011.json`
- `the-one-to-redeem-them-lineage_LN00000000000012.json`
- `a-powerful-legacy-lineage_LN00000000000013.json`
- `born-to-wealth-lineage_LN00000000000014.json` ✨ NEW
- `far-reaching-contacts-lineage_LN00000000000015.json` ✨ NEW
- `perilous-choice-lineage_LN00000000000016.json` ✨ NEW
- `proven-to-be-pure-lineage_LN00000000000017.json` ✨ NEW
- `witch-knowledge-lineage_LN00000000000018.json` ✨ NEW

### Origin Paths (6 total)
`/src/packs/rt-items-origin-path/_source/`
- `lineage-a-long-and-glorious-history_LNPATH0000000001.json`
- `lineage-a-proud-tradition_LNPATH0000000002.json`
- `lineage-accursed-be-thy-name_LNPATH0000000003.json`
- `lineage-disgraced_LNPATH0000000004.json`
- `lineage-of-extensive-means_LNPATH0000000005.json` ✨ UPDATED (now 3 choices)
- `lineage-witch-born_LNPATH0000000006.json` ✨ NEW

---

## Build Command

```bash
npm run build
```

This will:
1. Compile all 13 new talents into the `rt-items-talents` compendium
2. Compile all 5 new origin paths into the `rt-items-origin-path` compendium
3. Make them available in Foundry

---

## Character Creation Example

**Player wants "Uncertain Inheritance":**

1. Complete 6 standard origin steps
2. Starting XP: 1000
3. Choose Lineage: "A Proud Tradition"
4. Select "Uncertain Inheritance" (300 XP)
5. **Deduct 300 XP** → 700 XP remaining
6. **Grants applied:**
   - Paranoia talent
   - Deceive skill (trained)
   - Choice dialog: +3 Int or +3 Per
7. Character ready!

**Result:** 
- 700 starting XP available
- Paranoia, Deceive, +3 to chosen stat
- All standard origin benefits

---

## Testing Steps

1. **Build:** `npm run build`
2. **Launch Foundry:** Open world
3. **Open Compendiums:**
   - "Talents" → Search "lineage"
   - "Origin Path" → Look for "Lineage:" entries
4. **Verify:**
   - All 13 talents present
   - All 5 origin paths present
   - Descriptions formatted correctly
   - UUIDs resolve correctly

---

## Design Notes

### Why This Matters

Lineage adds depth and mechanical choices to character backgrounds:

- **Storytelling:** Rich family histories
- **Differentiation:** Two Rogue Traders from same origin path can be very different if one is a "Proud Tradition" heir and the other is "Disgraced"
- **Balance:** XP costs prevent min-maxing
- **Choice:** Optional system doesn't force complexity on players who don't want it

### Integration with Existing System

- Uses existing talent infrastructure
- Compatible with grants system
- Follows origin path data model
- No changes to core DataModels needed

### Future Expansion

This system can be extended with:
- "Battlefleet Heritage" (Into the Storm)
- "Regimental Heritage" (Only War)
- Custom lineages created by GMs

---

## Status

✅ **ALL 6 LINEAGES COMPLETE** - 100% source material coverage  
✅ **Data Complete** - 18 talents + 6 origin paths  
✅ **Flavor Text Complete** - Full Into the Storm descriptions  
✅ **Witch-Born Implemented** - Complete new lineage with psychic heritage  
✅ **Of Extensive Means Complete** - All 3 choices now available  
✅ **Documentation Complete** - Full guide written  
⏳ **Runtime Needed** - XP system, choice dialogs, UI integration  

---

*For the Emperor and the Legacy!* 🚀
