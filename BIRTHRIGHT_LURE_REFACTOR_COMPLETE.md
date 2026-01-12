# Birthright & Lure of the Void - Complete Refactor

**Date:** January 12, 2026  
**Status:** ✅ COMPLETE - Full flavor text and proper data structures implemented

---

## Overview

This refactor updates all 6 **Birthright** and 6 **Lure of the Void** origin paths with:
- Complete rulebook flavor text (pages 28-31)
- Proper choice-based data structures
- Clean separation of grants and modifiers
- Source citations

Following the pattern established in the Homeworld refactor (Death World, Void Born, etc.), these origin paths now provide:
- Rich, immersive descriptions with blockquotes and headers
- Properly structured choices arrays for player decisions
- Clean data model compatible with the DataModel architecture
- HTML-formatted effectText for display

---

## Files Modified

### Birthright Origin Paths (6)

| File | Name | Key Features |
|------|------|--------------|
| `scavenger_KESTjlDNtHncRoxS.json` | Scavenger | Choice: WP/Ag, Unremarkable/Resistance, Corruption/Insanity |
| `scapegrace_VpkONuWQfxGpzMCp.json` | Scapegrace | Choice: Int/Per, Sleight of Hand skill, Corruption/Insanity |
| `stubjack_RBpW3W9ZOIQYKgKg.json` | Stubjack | Choice: WS/BS +5, Quick Draw, Intimidate, 1d5 Insanity (always) |
| `child-of-the-creed_R24GdwakB9avuffJ.json` | Child of the Creed | Choice: WP/Fel, Unshakeable Faith, −3 WS (always) |
| `savant_0DMx4rOTVo5IennF.json` | Savant | Choice: Logic skill/Peer (Academic), Int/Fel, −3 Toughness (always) |
| `vaunted_hP8LpNBP5nHZngJs.json` | Vaunted | Choice: Ag/Fel, Decadence, −3 Per, 1d5 Corruption (always) |

### Lure of the Void Origin Paths (6)

| File | Name | Key Features |
|------|------|--------------|
| `tainted_QVoCUBiR1i4be47t.json` | Tainted | 3 paths: Mutant/Insane/Deviant Philosophy |
| `criminal_TKW8s7sCRjsjNgql.json` | Criminal | 3 paths: Fugitive/Hunted/Judged |
| `renegade_raFNWbq385zrzhlu.json` | Renegade | 3 paths: Recidivist/Free-thinker/Dark Visionary |
| `duty-bound_gh7Ny4UdjlzbQbk7.json` | Duty Bound | 3 paths: Throne/Humanity/Dynasty (affects Profit Factor) |
| `zealot_vWk41i89fQikyUHN.json` | Zealot | 3 paths: Blessed Scars/Unnerving Clarity/Favoured |
| `chosen-by-destiny_jUEjBWXgfjxqjFID.json` | Chosen by Destiny | 3 paths: Seeker/Xenophile/Fated (+1 Fate) |

---

## Structure Changes

### Before (Old Format)

```json
{
  "description": {
    "value": "<p>+3 Willpower or +3 Agility. Gain Unremarkable Talent or Resistance (Fear). Gain 1d5 Corruption or 1d5 Insanity.</p>"
  },
  "grants": {
    "modifiers": {
      "characteristics": {
        "agility": 3,
        "willpower": 3
      }
    },
    "skills": [
      {"name": "Unremarkable", "trainingModifier": 1},
      {"name": "1d5 Corruption or 1d5 Insanity", "trainingModifier": 1}
    ],
    "talents": ["or Resistance (Fear)", "Unremarkable"]
  }
}
```

**Problems:**
- Minimal flavor text (1 sentence)
- Talents mixed into skills array
- "Or" choices represented as strings, not proper choices
- Corruption/Insanity as fake "skills"

### After (New Format)

```json
{
  "description": {
    "value": "<h2>Scavenger</h2><blockquote><p><em>\"You became an adult amidst the yearning and poverty of the least of the God-Emperor's flock...\"</em></p></blockquote><p>All that you owned was claimed from the wastes...</p>"
  },
  "grants": {
    "skills": [],
    "talents": [],
    "choices": [
      {
        "type": "characteristic",
        "label": "Choose one characteristic bonus",
        "options": [
          {"label": "+3 Willpower", "value": "willpower"},
          {"label": "+3 Agility", "value": "agility"}
        ],
        "count": 1
      },
      {
        "type": "talent",
        "label": "Choose one talent",
        "options": ["Unremarkable", "Resistance (Fear)"],
        "count": 1
      }
    ]
  },
  "source": {
    "book": "Rogue Trader Core Rulebook",
    "page": "28"
  }
}
```

**Improvements:**
- Rich flavor text with proper HTML structure
- Clean separation of fixed grants vs. choices
- Proper choice objects with type, label, options, count
- Source citations for reference

---

## Key Patterns

### Simple Characteristic Choice (Scavenger, Scapegrace, Child of the Creed, Savant, Vaunted)

```json
{
  "type": "characteristic",
  "label": "Choose one characteristic bonus",
  "options": [
    {"label": "+3 Willpower", "value": "willpower"},
    {"label": "+3 Agility", "value": "agility"}
  ],
  "count": 1
}
```

### Skill or Talent Choice (Savant)

```json
{
  "type": "skill_or_talent",
  "label": "Choose Logic skill or Peer talent",
  "options": [
    {"label": "Logic (Int) as trained Basic Skill", "value": "skill:logic"},
    {"label": "Peer (Academic) Talent", "value": "talent:peer_academic"}
  ],
  "count": 1
}
```

### Complex Multi-Path Choice (Tainted, Criminal, Renegade, Duty Bound, Zealot, Chosen by Destiny)

```json
{
  "type": "criminal_path",
  "label": "Choose one criminal background",
  "options": [
    {
      "label": "Wanted Fugitive: Enemy (Adeptus Arbites) and Peer (Underworld)",
      "value": "fugitive",
      "description": "You gain the Enemy (Adeptus Arbites) and Peer (Underworld) Talents.",
      "grants": {
        "talents": ["Enemy (Adeptus Arbites)", "Peer (Underworld)"]
      }
    },
    // ... more options
  ],
  "count": 1
}
```

**Note:** Options with nested `grants` objects allow the UI to show what each choice provides.

---

## Flavor Text Structure

All 12 origin paths now follow this HTML structure:

```html
<h2>Origin Path Name</h2>
<blockquote>
  <p><em>"Opening quote from rulebook..."</em></p>
</blockquote>
<p>First paragraph of description...</p>
<p>Second paragraph expanding on the theme...</p>
```

This matches the pattern from the refactored Homeworlds and provides:
- Clear visual hierarchy with headers
- Evocative opening quote in blockquote/italics
- Rich descriptive text split into logical paragraphs
- Immersive lore that helps players understand their character's background

---

## Choice Types Introduced

| Type | Used By | Description |
|------|---------|-------------|
| `characteristic` | Scavenger, Scapegrace, Child of the Creed, Savant, Vaunted | Choose between two characteristic bonuses |
| `talent` | Scavenger | Choose between two talents |
| `corruption_or_insanity` | Scavenger, Scapegrace | Choose dice roll for corruption or insanity |
| `skill_or_talent` | Savant | Choose between gaining a skill or a talent |
| `tainted_path` | Tainted | Choose one of three tainted origins (Mutant/Insane/Deviant) |
| `criminal_path` | Criminal | Choose one of three criminal backgrounds |
| `renegade_path` | Renegade | Choose one of three renegade backgrounds |
| `duty_path` | Duty Bound | Choose one of three duty paths |
| `zealot_path` | Zealot | Choose one of three zealot backgrounds |
| `destiny_path` | Chosen by Destiny | Choose one of three destiny paths |

These custom types allow the UI to:
- Present appropriate selection dialogs
- Apply correct grants when choice is made
- Track selected choice in `selectedChoices` object
- Display choice-specific flavor text

---

## Special Considerations

### Always-Applied Effects (Not Choices)

Some origin paths have effects that ALWAYS apply, not as choices:

| Origin Path | Always Applied |
|-------------|----------------|
| **Stubjack** | −5 Fellowship, 1d5 Insanity Points |
| **Child of the Creed** | −3 Weapon Skill |
| **Savant** | −3 Toughness |
| **Vaunted** | −3 Perception, 1d5 Corruption Points |

These are listed in `modifiers.characteristics` or noted in the `notes` field.

### Profit Factor Modifiers (Duty Bound)

Duty Bound has three paths that affect starting Profit Factor:
- **Duty to Humanity:** −1 Profit Factor
- **Duty to Your Dynasty:** +1 Profit Factor

This requires special handling in character creation, as Profit Factor is typically tracked at the group/dynasty level, not individual character level.

### Mutation Table (Tainted - Mutant)

The Mutant option for Tainted requires:
- Rolling on Table 14-3: Mutations (page 369)
- OR spending 200 xp to choose any result lower than 76

This requires a custom dialog/UI when this choice is selected.

### Bionic Implants (Criminal, Zealot)

Some choices grant a poor-Craftsmanship bionic:
- Criminal (Judged and Found Wanting)
- Zealot (Blessed Scars)

Players can upgrade quality by spending XP:
- 200 xp → common-Craftsmanship
- 300 xp total → good-Craftsmanship

This requires a custom item creation dialog.

### Specialist Forbidden Lore (Renegade - Dark Visionary)

Dark Visionary grants "Forbidden Lore (choose one)" as trained skill. The UI should present a list of Forbidden Lore specializations:
- Forbidden Lore (Daemonology)
- Forbidden Lore (Heresy)
- Forbidden Lore (The Warp)
- Forbidden Lore (Xenos)
- etc.

---

## Implementation Roadmap

### Phase 1: Data Structure ✅ COMPLETE
- [x] Update all 12 origin path JSON files
- [x] Add rich flavor text from rulebook
- [x] Structure choices properly
- [x] Add source citations
- [x] Validate JSON syntax

### Phase 2: Choice System (Needs Implementation)

**Create Choice Handler** (`src/module/utils/origin-choice-handler.mjs`)
```javascript
export class OriginChoiceHandler {
  static async presentChoiceDialog(actor, originPath) {
    // Present dialog based on choice types
    // Return selected choices
  }
  
  static async applyChoice(actor, originPath, choiceKey, selectedValue) {
    // Apply grants from selected choice
    // Update selectedChoices on origin path item
  }
}
```

**Dialog Templates:**
- `templates/dialogs/origin-choice-characteristic.hbs`
- `templates/dialogs/origin-choice-talent.hbs`
- `templates/dialogs/origin-choice-multi-path.hbs`
- `templates/dialogs/origin-choice-mutation.hbs`
- `templates/dialogs/origin-choice-bionic.hbs`

### Phase 3: UI Integration (Needs Implementation)

**Biography Tab** - Display origin path choices with edit button:
```handlebars
{{#each system.originPathItems}}
  <div class="origin-path-item">
    <h3>{{name}}</h3>
    {{{system.description.value}}}
    
    {{#each system.grants.choices}}
      <div class="origin-choice">
        <label>{{label}}</label>
        {{#if @root.isEditable}}
          <button data-action="editOriginChoice" data-choice-key="{{@key}}">
            {{#if ../selectedChoices.[this]}}
              Change (Current: {{lookup ../selectedChoices @key}})
            {{else}}
              Select
            {{/if}}
          </button>
        {{else}}
          <span>{{lookup ../selectedChoices @key}}</span>
        {{/if}}
      </div>
    {{/each}}
  </div>
{{/each}}
```

### Phase 4: Automatic Application (Needs Implementation)

**Hook into Origin Path Addition:**
```javascript
Hooks.on("createItem", async (item, options, userId) => {
  if (item.type !== "originPath") return;
  if (!item.parent) return;  // Not on an actor
  
  // Present choice dialogs
  const choices = item.system.grants.choices || [];
  for (const choice of choices) {
    const selected = await OriginChoiceHandler.presentChoiceDialog(
      item.parent, 
      item, 
      choice
    );
    await OriginChoiceHandler.applyChoice(item.parent, item, choice, selected);
  }
});
```

### Phase 5: Testing Checklist

- [ ] Add Scavenger to character → Choice dialog appears
- [ ] Select Willpower → Character gains +3 WP
- [ ] Select Unremarkable → Talent added to character
- [ ] Select Corruption → Roll 1d5, apply corruption points
- [ ] Add Criminal (Judged) → Bionic creation dialog appears
- [ ] Add Tainted (Mutant) → Mutation table roll/selection
- [ ] Add Duty Bound (Dynasty) → Profit Factor +1 applied
- [ ] Verify all 12 origin paths have proper descriptions
- [ ] Verify effectText displays correctly in item sheets

---

## Validation

All 12 JSON files pass validation:
```bash
✓ scavenger_KESTjlDNtHncRoxS.json
✓ scapegrace_VpkONuWQfxGpzMCp.json
✓ stubjack_RBpW3W9ZOIQYKgKg.json
✓ child-of-the-creed_R24GdwakB9avuffJ.json
✓ savant_0DMx4rOTVo5IennF.json
✓ vaunted_hP8LpNBP5nHZngJs.json
✓ tainted_QVoCUBiR1i4be47t.json
✓ criminal_TKW8s7sCRjsjNgql.json
✓ renegade_raFNWbq385zrzhlu.json
✓ duty-bound_gh7Ny4UdjlzbQbk7.json
✓ zealot_vWk41i89fQikyUHN.json
✓ chosen-by-destiny_jUEjBWXgfjxqjFID.json
```

---

## Examples

### Simple Choice (Scavenger)

**Flavor Text:**
> You became an adult amidst the yearning and poverty of the least of the God-Emperor's flock, one soul amongst countless underhivers, renegades, bonepickers, and a thousand other outcast castes that exist on the fringes of the Imperium...

**Choices:**
1. Characteristic: Willpower OR Agility (+3)
2. Talent: Unremarkable OR Resistance (Fear)
3. Corruption/Insanity: 1d5 Corruption OR 1d5 Insanity

### Complex Multi-Path (Criminal)

**Flavor Text:**
> The wheels of Imperial justice turn slowly, but they will surely grind to a pulp any life caught in their path. To make matters worse, there are traps in the criminal underworld that will lead to far worse consequences than years of hard labour in an Imperial penal colony...

**Three Distinct Paths:**

1. **Wanted Fugitive**
   - Grants: Enemy (Adeptus Arbites), Peer (Underworld)
   
2. **Hunted by a Crime Baron**
   - Grants: +3 Perception, Enemy (Underworld)
   
3. **Judged and Found Wanting**
   - Grants: −5 Fellowship, poor bionic limb/implant

Each path tells a different story about the character's criminal past.

---

## Architecture Notes

### Why Choices Over Fixed Grants?

**Problem with old approach:**
```json
"characteristics": {
  "agility": 3,
  "willpower": 3
}
```
This implies the character gets BOTH bonuses, when the rule says "choose one."

**Solution with choices:**
```json
"choices": [{
  "type": "characteristic",
  "options": [
    {"label": "+3 Willpower", "value": "willpower"},
    {"label": "+3 Agility", "value": "agility"}
  ],
  "count": 1
}]
```
This clearly indicates a choice must be made, and the system can enforce it.

### Nested Grants in Options

For complex multi-path choices (Criminal, Renegade, etc.), each option has its own `grants` object:

```json
{
  "label": "Wanted Fugitive",
  "value": "fugitive",
  "grants": {
    "talents": ["Enemy (Adeptus Arbites)", "Peer (Underworld)"]
  }
}
```

This allows the UI to:
1. Show player what each path provides
2. Apply correct grants when path selected
3. Track which path was chosen

---

## Related Documentation

- `COMPLETE_REFACTOR_FINAL_SUMMARY.md` - Overview of refactor project
- `ORIGIN_PATH_REFACTOR_COMPLETE.md` - Homeworld refactor details
- `ORIGIN_PATH_FORMULAS_GUIDE.md` - Formula notation reference
- `ORIGIN_PATH_BUILDER_GUIDE.md` - UI implementation guide
- `AGENTS.md` - System architecture reference

---

## What's Next

With data structures complete, the next steps are:

1. **Implement OriginChoiceHandler** - Core logic for presenting and applying choices
2. **Create Dialog Templates** - UI for each choice type
3. **Integrate with Biography Tab** - Display and edit origin choices
4. **Hook into Item Creation** - Auto-present dialogs when origin path added
5. **Testing** - Verify all 12 origin paths work correctly

The foundation is now solid, following the same patterns as the refactored Homeworlds. Runtime implementation can proceed with confidence that the data structures are correct and comprehensive.

---

**Status: ✅ Data structures complete and validated. Ready for runtime implementation.**
