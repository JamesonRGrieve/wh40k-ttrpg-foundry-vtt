# Journal Enhancement Plan - Rogue Trader VTT

## Overview

Transform the existing plain-text journals into stunning V13 multi-page journals leveraging Foundry's latest capabilities. This will create an **immersive, interactive reference** for players and GMs.

## V13 Journal Capabilities Used

### ✅ Multi-Page Structure with ToC
- Automatically generated table of contents
- Logical page hierarchy
- Easy navigation between related content

### ✅ Rich HTML Formatting
- Custom CSS for Rogue Trader theme (dark red, gold accents)
- Styled tables with hover effects
- Callout boxes for important information
- Color-coded skills, talents, and characteristics

### ✅ Secret Text Blocks
- GM-only notes and advanced rules
- Hidden until revealed by GM
- Perfect for spoilers and tactical advice

### ✅ Semantic Styling
- Headers, lists, tables formatted consistently
- Quick reference cards
- Example boxes with real game scenarios
- Stat blocks for NPCs/creatures

### ✅ Interactive Elements
- Dice roll notation (`1d100`, `2d10`)
- Entity links to compendium items
- Cross-references between journal pages

---

## Journal 1: Character Creation

**Current State:** Single 92KB `<pre>` block with tab-delimited tables  
**Target:** 15-20 interactive pages with rich formatting

### Proposed Structure

1. **Welcome & Overview** (✅ Sample created)
   - Introduction to Rogue Trader
   - Origin Path system explanation
   - Quick start guide

2. **Characteristics** (✅ Sample created)
   - The 9 characteristics explained
   - Rolling vs point buy
   - Characteristic bonuses
   - GM secret: Unnatural characteristics

3. **Home World** (✅ Sample created)
   - Table of all home worlds
   - Bonuses, skills, drawbacks
   - Roleplaying advice
   - Drag-and-drop instructions

4. **Birthright**
   - All birthright options in styled table
   - Cost breakdowns
   - Narrative descriptions

5. **Lure of the Void**
   - What drew you to space
   - Multi-option choices
   - XP costs and effects

6. **Trials and Travails**
   - Life hardships table
   - Alternative paths
   - Story hooks

7. **Motivation**
   - Driving forces
   - Mechanical benefits
   - Roleplaying guides

8. **Careers**
   - All 8 careers detailed
   - Starting skills, talents, gear
   - Special abilities formatted

9. **Sample Characters**
   - Katelina Krimson walkthrough
   - Step-by-step creation example
   - Common pitfalls to avoid

10. **Xenos Origins** (Secret GM page)
    - Kroot, Ork, Tau, Eldar options
    - Balance considerations
    - Campaign integration advice

11. **Regiment Creation (Only War)** (Bonus page)
    - Regiment types and doctrines
    - Mixed regiment rules
    - Specialist characters

---

## Journal 2: Character Actions & Rules

**Current State:** Single page, plain text  
**Target:** 8-10 pages covering all action types

### Proposed Structure

1. **Combat Overview**
   - Turn structure
   - Initiative
   - Action types (Full, Half, Reaction, Free)

2. **Attack Actions**
   - Melee attacks table
   - Ranged attacks table
   - Called shots
   - Examples with DoS calculations

3. **Movement & Positioning**
   - Movement rates by AB
   - Difficult terrain
   - Charging, running
   - Tactical diagrams

4. **Skill Actions**
   - Common skill uses in combat
   - Extended tests
   - Opposed tests

5. **Special Actions**
   - Aim, All-Out Attack, Suppressing Fire
   - Formatted action cards
   - When to use each

6. **Reactions**
   - Dodge, Parry
   - Evasion rules
   - Multiple attackers

7. **Damage & Healing**
   - Damage application
   - Critical hits table
   - Healing methods

8. **Status Effects**
   - Stunned, Prone, On Fire, etc.
   - Recovery rules
   - Quick reference chart

---

## Journal 3: Fear, Insanity & Corruption

**Current State:** Plain text  
**Target:** 6-8 atmospheric themed pages

### Proposed Structure

1. **The Horror of the 41st Millennium**
   - Thematic introduction
   - Why these rules matter
   - Narrative examples

2. **Fear & Shock**
   - Fear ratings table
   - Shock tests
   - Pinning rules
   - Degrees of failure effects

3. **Insanity Points**
   - Gaining insanity
   - Insanity thresholds
   - Mental disorders table
   - Roleplaying advice (GM secret)

4. **Corruption Points**
   - Sources of corruption
   - Corruption track
   - Malignancies table
   - Point of no return

5. **Mutations**
   - Mutation table (d100)
   - Physical vs mental
   - Concealment and discovery
   - Campaign implications (GM secret)

6. **Recovery & Treatment**
   - Reducing insanity
   - Removing corruption (rare!)
   - NPC assistance
   - Mechanical options

---

## Journal 4: Ship & Vehicle Actions

**Current State:** Plain text  
**Target:** 10-12 pages with tactical focus

### Proposed Structure

1. **Starship Combat Overview**
   - Scale and abstraction
   - Turn structure
   - Crew stations

2. **Starship Maneuvers**
   - All maneuvers table
   - Pilot tests and modifiers
   - Positioning and range

3. **Starship Weapons**
   - Weapon types and arcs
   - Attack resolution
   - Critical hits
   - Component damage

4. **Extended Actions**
   - Repairs
   - Auguries
   - Boarding actions

5. **Vehicle Combat**
   - Ground vehicles
   - Flyers
   - Scale conversions

6. **Vehicle Maneuvers**
   - Driving tests
   - Stunts and evasion
   - Terrain effects

7. **Component Rules**
   - Power and space
   - Essential components
   - Complications
   - Repair and replacement

8. **Crew Actions** (Secret GM page)
   - Morale effects
   - Crew loss
   - Mutiny rules

---

## Journal 5: Colonies

**Current State:** Plain text  
**Target:** 6-8 management-focused pages

### Proposed Structure

1. **Colony Overview**
   - What is a colony
   - Why establish one
   - Long-term benefits

2. **Founding a Colony**
   - Requirements
   - Initial investment
   - Settlement types

3. **Colony Resources**
   - Resource types table
   - Production and trade
   - Exploitation rules

4. **Holdings & Facilities**
   - Building types
   - Construction costs
   - Benefits and synergies

5. **Colony Management**
   - Turn structure
   - Income and expenses
   - Growth mechanics

6. **Complications** (Secret GM page)
   - Disasters and threats
   - Native populations
   - Rival claims

---

## Implementation Details

### CSS Theme

Rogue Trader-themed styling:
- **Primary Colors:** Dark crimson (#8b0000), deep red (#4a0000)
- **Accent Colors:** Gold (#d4af37), cream (#f4e4c1)
- **Fonts:** Cinzel (headers), Crimson Text (body), monospace (stats)
- **Elements:** Styled tables, callout boxes, stat blocks, dice notation

### Page Types

1. **Text Pages** (primary)
   - Rich HTML with custom CSS
   - Tables, lists, callouts
   - Semantic structure

2. **Secret Pages** (GM only)
   - Special styling to indicate GM-only
   - Balance advice, spoilers
   - Campaign integration tips

3. **Image Pages** (future enhancement)
   - Tactical diagrams
   - Character art
   - Maps and schematics

### Entity Links

Use Foundry's `@Compendium` syntax:
```html
@Compendium[rogue-trader.rt-items-talents.Peer]{Peer (Nobility)}
@Compendium[rogue-trader.rt-items-skills.Common Lore]{Common Lore (Tech)}
```

### Dice Notation

Styled inline:
```html
<span class="rt-dice-roll">1d100</span>
<span class="rt-dice-roll">2d10</span>
```

---

## Benefits

### For Players
✅ **Easy Navigation** - Find rules quickly with ToC  
✅ **Visual Clarity** - Tables and callouts highlight key info  
✅ **Examples** - Real scenarios show how rules work  
✅ **Mobile-Friendly** - Clean responsive design  

### For GMs
✅ **Secret Sections** - Hide advanced rules until needed  
✅ **Quick Reference** - Pull up rules mid-session fast  
✅ **Campaign Integration** - Notes on using rules effectively  
✅ **Modular** - Show/hide pages based on campaign needs  

### For the System
✅ **Professional Polish** - Matches quality of premium systems  
✅ **V13 Showcase** - Demonstrates latest Foundry capabilities  
✅ **Future-Proof** - Easy to update and expand  
✅ **Community Standard** - Sets bar for other 40K systems  

---

## Next Steps

### Option 1: Full Implementation (Recommended)
Generate all enhanced journals with complete content:
- Character Creation (15-20 pages)
- Character Actions (8-10 pages)
- Fear/Insanity/Corruption (6-8 pages)
- Ship & Vehicle Actions (10-12 pages)
- Colonies (6-8 pages)

**Time:** ~2-4 hours of content parsing and formatting  
**Result:** Professional, publisher-quality reference journals

### Option 2: Phased Approach
1. Complete Character Creation first (most used)
2. Then Actions & Combat
3. Then specialty journals

### Option 3: Hybrid
Keep existing journals as backup, create new enhanced versions alongside them

---

## Technical Considerations

### Content Extraction
- Parse existing `<pre>` formatted text
- Identify table structures (tab-delimited)
- Extract section headers
- Preserve content accuracy

### HTML Generation
- Use template system for consistency
- Validate HTML structure
- Test in Foundry for rendering
- Ensure mobile responsiveness

### Compendium Links
- Map references to compendium items
- Create clickable links
- Test drag-and-drop functionality

### GM Secrets
- Use Foundry's secret text feature
- Mark sensitive content clearly
- Provide toggle for revealing

---

## Sample Output

See `scripts/enhance-journals.js` for working example with:
- Full CSS styling
- Multi-page structure
- Rich tables and callouts
- Dice notation
- Characteristic highlighting
- Example scenarios

Run the script to see 3 sample pages from Character Creation journal.

---

## Recommendation

**Proceed with Full Implementation** ✅

This will transform the journals from basic text dumps into a **premier reference experience** that rivals official WOTC or Paizo content. The V13 capabilities are perfect for this, and it will significantly enhance the user experience.

The existing content is comprehensive but inaccessible in its current format. Rich formatting will make it:
- Easier to learn the system
- Faster to reference during play
- More enjoyable to read
- Professional in presentation
- A showcase for the system's quality

**Estimated Effort:** 4-6 hours for full implementation  
**User Impact:** Massive improvement in usability and professionalism
