# Common Talent Issues & Fixes

## Issue 1: Benefit Mentions Bonus, Modifiers Empty

**Example**: "Mighty Shot" benefit says "+2 damage with Ranged weapons" but `modifiers.combat.damage = 0`

**Fix (Always-On)**:
```json
"modifiers": {
  "combat": {
    "damage": 2
  }
}
```

**Fix (Conditional)**:
```json
"modifiers": {
  "situational": {
    "combat": [
      {
        "key": "damage",
        "value": 2,
        "condition": "With Ranged weapons only",
        "icon": "fa-solid fa-gun"
      }
    ]
  }
}
```

**Decision**: If the benefit text includes phrases like "with X weapon", "in Y situation", "against Z enemies" → use situational. Otherwise use always-on.

---

## Issue 2: Skill Training Not Encoded in Grants

**Example**: "Pistol Weapon Training (Universal)" benefit says "Trained in Pistol weapons" but `grants.skills = []`

**Fix**:
```json
"grants": {
  "skills": [
    {
      "name": "Ballistic Skill",
      "specialization": "Pistol",
      "level": "trained"
    }
  ]
}
```

**Note**: Weapon Training talents typically grant training in a weapon group, which corresponds to a skill specialization.

---

## Issue 3: +10 Skill Bonus Wrong Location

**Example**: "Talented (Awareness)" says "+10 to Awareness" but encoded as `grants.skills`

**Fix**: Should be in modifiers, NOT grants
```json
"modifiers": {
  "skills": {
    "awareness": 10
  }
}
```

**Important Distinction**:
- `grants.skills` is for **training level changes** (untrained → trained → +10 → +20)
- `modifiers.skills` is for **bonuses on top** of training (+5, +10, +20 bonus)

---

## Issue 4: Weapon Training Missing Specialization

**Example**: Name is "Weapon Training (Chain)" but `specialization = ""`

**Fix**: Leave blank in template (each instance will have different specialization). Add note in benefit.
```json
"name": "Weapon Training (X)",
"specialization": "",
"benefit": "<p>Choose one weapon group (Las, Chain, Bolt, Solid Projectile, Melta, Plasma, Flame, Launcher, Exotic, Power, Low-Tech, etc.). You are trained in all weapons of that group and may use them without the -20 untrained penalty.</p>"
```

---

## Issue 5: Situational vs Always-On Confusion

**Example**: "Stealthy" gives "+10 to Stealth" encoded as always-on, but benefit text suggests it's conditional

**Fix**: If condition exists in benefit text, use situational:
```json
"modifiers": {
  "situational": {
    "skills": [
      {
        "key": "stealth",
        "value": 10,
        "condition": "In shadows, darkness, or when moving slowly",
        "icon": "fa-solid fa-user-ninja"
      }
    ]
  }
}
```

**Keywords that suggest situational**:
- "when...", "in...", "against...", "while...", "during..."
- "with [specific weapon]", "against [specific enemy type]"
- "in [specific environment/condition]"

---

## Issue 6: Empty Modifiers Object

**Example**: `modifiers = {}` but benefit describes mechanical effect

**Check**: Is this purely narrative or does it have a mechanical effect?

**Narrative only** (e.g., "You have a dark secret"):
- Leave modifiers empty
- Use `grants.specialAbilities` for the narrative text

**Mechanical effect** (e.g., "+10 to tests"):
- Encode in modifiers properly

---

## Issue 7: Special Abilities in Wrong Field

**Example**: "Night Vision" is encoded as a trait grant instead of special ability

**Fix**: Use `grants.specialAbilities` for narrative/special rules:
```json
"grants": {
  "specialAbilities": [
    {
      "name": "Night Vision",
      "description": "<p>You can see in darkness as if it were dim light. You never suffer penalties for poor lighting conditions.</p>"
    }
  ]
}
```

**When to use `grants.specialAbilities`**:
- Narrative effects that don't have a simple +X bonus
- Special rules that require GM adjudication
- Abilities that grant advantage in specific situations (not easily encoded as modifiers)

---

## Issue 8: Stackable Flag Wrong

**Example**: "Talented (X)" allows multiple different skills but `stackable = false`

**Fix**: Talents with (X) that can be taken for different specializations should have `stackable = true`

**When stackable = true**:
- Talent can be taken multiple times for different specializations (e.g., "Talented (Awareness)", "Talented (Dodge)")
- Talent explicitly says "This talent can be taken multiple times"
- Each instance improves the same ability (e.g., "Hatred (X)" for different enemy types)

**When stackable = false**:
- Talent can only be taken once
- Talent does not have (X) in the name
- Benefit does not mention taking it multiple times

---

## Issue 9: Tier 0 for Non-Origin Talents

**Example**: "Mighty Shot" has `tier = 0` but `category = "combat"`

**Fix**: Tier 0 is reserved for origin talents. Combat talents should be tier 1-3.

**Tier Guidelines**:
- **Tier 0**: Origin talents only (from character creation path)
- **Tier 1**: Basic talents (300-500 XP)
- **Tier 2**: Intermediate talents (500-750 XP)
- **Tier 3**: Advanced talents (750-1000+ XP)

---

## Issue 10: Missing Compendium UUIDs in Grants

**Example**: `grants.talents` has talent name but `uuid = ""`

**Fix**: Look up UUID from compendium:
```json
"grants": {
  "talents": [
    {
      "name": "Lightning Reflexes",
      "uuid": "Compendium.rogue-trader.rt-items-talents.Item.xxxxxxxxxxxxx"
    }
  ]
}
```

**How to find UUIDs**:
1. Open Foundry VTT
2. Open the Compendium browser
3. Find the item
4. Right-click → "Copy Document ID" or check the item's UUID field
5. Format as: `Compendium.rogue-trader.rt-items-talents.Item.[ID]`

---

## Issue 11: Characteristic Modifiers Not Encoded

**Example**: "Strong Back" benefit says "+5 to Strength" but `modifiers.characteristics = {}`

**Fix**:
```json
"modifiers": {
  "characteristics": {
    "strength": 5
  }
}
```

**Characteristic Keys**:
- `weaponSkill`, `ballisticSkill`, `strength`, `toughness`, `agility`
- `intelligence`, `perception`, `willpower`, `fellowship`

---

## Issue 12: Initiative Bonuses Not Encoded

**Example**: "Lightning Reflexes" says "+2 Initiative" but `modifiers.combat.initiative = 0`

**Fix**:
```json
"modifiers": {
  "combat": {
    "initiative": 2
  }
}
```

---

## Issue 13: Resource Modifiers Missing

**Example**: "Iron Jaw" says "+2 Wounds" but `modifiers.resources.wounds = 0`

**Fix**:
```json
"modifiers": {
  "resources": {
    "wounds": 2
  }
}
```

**Resource Keys**:
- `wounds`, `fate`, `insanity`, `corruption`

---

## Issue 14: Attack Bonuses Not Distinguished

**Example**: Benefit says "+10 to hit with melee weapons"

**Fix (Always-On)**:
```json
"modifiers": {
  "combat": {
    "attack": 10
  }
}
```

**Fix (Conditional - Melee Only)**:
```json
"modifiers": {
  "situational": {
    "combat": [
      {
        "key": "attack",
        "value": 10,
        "condition": "With melee weapons only",
        "icon": "fa-solid fa-sword"
      }
    ]
  }
}
```

---

## Issue 15: Multiple Bonuses in Benefit, Only One Encoded

**Example**: Benefit says "You gain +10 to Awareness and +5 to Dodge" but only Awareness is encoded

**Fix**: Encode ALL bonuses mentioned in benefit
```json
"modifiers": {
  "skills": {
    "awareness": 10,
    "dodge": 5
  }
}
```

**Common Pattern**: Always read the ENTIRE benefit text and encode ALL mechanical effects.

---

## Pattern Recognition Guide

### Skill Training Patterns
- "Trained in [skill]" → `grants.skills` with `level: "trained"`
- "Gain [skill] at +10" → `grants.skills` with `level: "plus10"`
- "+X to [skill] tests" → `modifiers.skills`

### Combat Patterns
- "+X damage" → `modifiers.combat.damage`
- "+X to hit" or "+X to attack" → `modifiers.combat.attack`
- "+X Initiative" → `modifiers.combat.initiative`
- "+X to Dodge/Parry" → `modifiers.combat.defense`

### Characteristic Patterns
- "+X to [Characteristic]" → `modifiers.characteristics`
- "Unnatural [Characteristic] (X)" → `modifiers.characteristics` (value = X)

### Conditional Patterns
- "When [condition]..." → `modifiers.situational`
- "Against [enemy type]..." → `modifiers.situational`
- "With [weapon type]..." → `modifiers.situational`
- "In [environment]..." → `modifiers.situational`

### Grants Patterns
- "You gain the [Talent Name] talent" → `grants.talents`
- "You gain the [Trait Name] trait" → `grants.traits`
- "Trained in [Skill]" → `grants.skills`
