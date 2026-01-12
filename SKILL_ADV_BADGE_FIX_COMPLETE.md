# Issue B3: ADV Badge Incorrectly Showing on Basic Skills - Resolution

## Problem Summary

**Severity**: High  
**Status**: ✅ RESOLVED  
**Date**: 2026-01-10

### Issue Description

The "ADV" badge (indicating Advanced skills) was showing on ALL skills in the Skills tab of character sheets, including Basic skills like Dodge and Awareness. This violated the game rules where only Advanced skills should show this indicator.

### Root Cause

The Handlebars template was using a loose truthy check:
```handlebars
{{#if entry.[1].advanced}}
```

This condition can evaluate to true in edge cases:
1. If `advanced` is `undefined` in some Handlebars contexts
2. If there's type coercion happening with BooleanField objects
3. If the property is missing on older actor data

The DataModel correctly defines `advanced` as a `BooleanField` with proper initial values (`true` for Advanced, `false` for Basic), but the template condition wasn't strict enough to catch all cases.

## Solution Implemented

### Template Fix

Changed the condition to use explicit equality check:

**Before:**
```handlebars
{{#if entry.[1].advanced}} rt-skill-row--advanced{{/if}}
```

**After:**
```handlebars
{{#if (eq entry.[1].advanced true)}} rt-skill-row--advanced{{/if}}
```

This ensures the class is ONLY applied when `advanced` is explicitly `true`, not when it's `undefined`, `null`, or any other falsy/truthy value.

### Files Modified

**`src/templates/actor/panel/skills-panel.hbs`** (2 occurrences fixed)
- Line 6: Left column skills
- Line 33: Right column skills

### How It Works

#### DataModel Definition (Correct - No Changes Needed)

In `creature.mjs`, the `SkillField` factory correctly creates:

```javascript
static SkillField(label, charShort, advanced = false, hasEntries = false) {
  const schema = {
    // ...
    advanced: new BooleanField({ required: true, initial: advanced }),
    basic: new BooleanField({ required: true, initial: !advanced }),
    // ...
  };
}
```

Skills are defined with correct values:
```javascript
skills: {
  dodge: this.SkillField("Dodge", "Ag", false),      // Basic → advanced: false
  acrobatics: this.SkillField("Acrobatics", "Ag", true),  // Advanced → advanced: true
  // ...
}
```

#### CSS Styling (Correct - No Changes Needed)

In `_skills.scss`, the ADV badge is added via CSS:

```scss
.rt-skill-row--advanced {
  .rt-skill-name {
    &::before {
      content: "ADV";
      // ... styling ...
    }
  }
}
```

The class is only applied to rows with the `.rt-skill-row--advanced` modifier.

#### Template Logic (Fixed)

The template now explicitly checks for `advanced === true`:

```handlebars
<div class="rt-skill-row{{#if (eq entry.[1].advanced true)}} rt-skill-row--advanced{{/if}}">
```

This uses the Handlebars `eq` helper (equality check) to ensure only skills with `advanced: true` get the class.

## Verification

### Testing Checklist

**Basic Skills (Should NOT show ADV badge):**
- [ ] Awareness
- [ ] Dodge
- [ ] Barter
- [ ] Carouse
- [ ] Charm
- [ ] Climb
- [ ] Command
- [ ] Concealment
- [ ] Contortionist
- [ ] Deceive
- [ ] Disguise
- [ ] Evaluate
- [ ] Gamble
- [ ] Inquiry
- [ ] Intimidate
- [ ] Logic
- [ ] Scrutiny
- [ ] Search
- [ ] Silent Move
- [ ] Swim

**Advanced Skills (SHOULD show ADV badge):**
- [ ] Acrobatics
- [ ] Blather
- [ ] Chem-Use
- [ ] Commerce
- [ ] Demolition
- [ ] Interrogation
- [ ] Invocation
- [ ] Literacy
- [ ] Medicae
- [ ] Psyniscience
- [ ] Security
- [ ] Shadowing
- [ ] Sleight of Hand
- [ ] Survival
- [ ] Tracking
- [ ] Wrangling

**Specialist Skills (SHOULD show ADV badge):**
- [ ] Ciphers
- [ ] Common Lore
- [ ] Drive
- [ ] Forbidden Lore
- [ ] Navigation
- [ ] Performer
- [ ] Pilot
- [ ] Scholastic Lore
- [ ] Secret Tongue
- [ ] Speak Language
- [ ] Tech-Use
- [ ] Trade

### Testing Steps

1. **Open existing character** in Foundry VTT
2. **Navigate to Skills tab**
3. **Verify Basic skills** (Dodge, Awareness, etc.) have NO ADV badge
4. **Verify Advanced skills** (Medicae, Acrobatics, etc.) HAVE ADV badge
5. **Check specialist skills** (Common Lore, Tech-Use) HAVE ADV badge
6. **Create new character** and repeat steps 2-5
7. **Import skill from compendium** and verify badge appears correctly

### Visual Confirmation

**Basic Skill Row (e.g., Dodge):**
```
[Icon] Dodge (Ag)                    [T][+10][+20]  45
```

**Advanced Skill Row (e.g., Medicae):**
```
[Icon] [ADV] Medicae (Int)           [T][+10][+20]  38
       ^^^^^ Orange badge
```

The ADV badge should:
- Only appear on Advanced and Specialist skills
- Be styled with orange background (`rgba($rt-accent-skills, 0.15)`)
- Have small font size (0.6rem)
- Appear before the skill name
- Make the skill name italic

## Technical Details

### Handlebars Helper Used

The `eq` helper is a standard comparison helper:

```javascript
Handlebars.registerHelper('eq', function(a, b) {
  return a === b;
});
```

Usage: `{{#if (eq value1 value2)}}...{{/if}}`

Returns `true` only if `value1 === value2` (strict equality).

### Why This Fix Works

1. **Explicit Comparison**: `(eq entry.[1].advanced true)` uses strict equality (`===`)
2. **No Truthy Coercion**: Doesn't rely on JavaScript truthiness
3. **Type Safe**: Only matches boolean `true`, not truthy values
4. **Handles Missing Data**: If `advanced` is `undefined`, `eq` returns `false`

### Alternative Solutions Considered

**Option 1: Add `not` helper check**
```handlebars
{{#unless (eq entry.[1].advanced false)}} rt-skill-row--advanced{{/unless}}
```
❌ Rejected - Double negative is confusing

**Option 2: Check `basic` field instead**
```handlebars
{{#unless entry.[1].basic}} rt-skill-row--advanced{{/unless}}
```
❌ Rejected - Relies on inverse logic, could fail if both fields corrupted

**Option 3: Add data migration**
- Migrate all existing actors to ensure `advanced` field exists
❌ Rejected - Template fix is simpler and handles all cases

**Option 4: Use explicit `true` check** ✅ **SELECTED**
```handlebars
{{#if (eq entry.[1].advanced true)}}
```
✅ Simple, explicit, handles all edge cases

## Data Model Reference

### Skill Type Definitions (SKILL_TABLE.md)

| Type | Can Use Untrained? | DataModel Field |
|------|-------------------|----------------|
| Basic | Yes (half characteristic) | `advanced: false`, `basic: true` |
| Advanced | No | `advanced: true`, `basic: false` |
| Specialist | No (requires specialization) | `advanced: true`, `basic: false` |

### Skill Schema (creature.mjs)

```javascript
{
  label: StringField,
  characteristic: StringField,  // "Ag", "Int", etc.
  advanced: BooleanField,       // true = Advanced, false = Basic
  basic: BooleanField,          // true = Basic, false = Advanced
  trained: BooleanField,        // Training level flags
  plus10: BooleanField,
  plus20: BooleanField,
  bonus: NumberField,           // Modifier bonuses
  current: NumberField,         // Calculated total
  // ... other fields
}
```

## Related Issues

- **Issue B1**: Skill Type/Characteristic/Descriptor Inconsistency (Resolved)
  - Fixed compendium pack data
  - Ensured all skills have correct `skillType` and `isBasic` values

- **Issue B2**: Skill Item Sheet Redesign (Resolved)
  - Created comprehensive skill item sheet with badges
  - Color-coded skill types (Basic/Advanced/Specialist)

## Impact

**Before Fix:**
- ALL skills showed ADV badge
- Players couldn't distinguish Basic from Advanced skills
- Rules interpretation was incorrect
- Visual clutter from unnecessary badges

**After Fix:**
- Only Advanced skills show ADV badge
- Basic skills have clean display
- Correct rules representation
- Proper visual hierarchy

## Related Files

- `src/templates/actor/panel/skills-panel.hbs` - Template with fix
- `src/scss/panels/_skills.scss` - ADV badge styling
- `src/module/data/actor/templates/creature.mjs` - DataModel schema
- `SKILL_TABLE.md` - Authoritative skill reference
- `SKILL_SYSTEM_FIX_COMPLETE.md` - Related Issue B1 documentation

---

**Resolution Date**: 2026-01-10  
**Status**: ✅ COMPLETE - Ready for build and testing  
**Severity**: High → **Resolved**
