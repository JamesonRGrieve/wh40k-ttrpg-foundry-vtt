# Talent Grants System - Implementation Guide

## Overview

Talents can now **grant other abilities** (talents, skills, traits) through the `grants` structure. This allows talents like "Credo Omnissiah (Forge World)" to automatically grant "Technical Knock" when acquired.

---

## Data Model Changes

### Talent Schema Addition

Added to `src/module/data/item/talent.mjs`:

```javascript
// What this talent grants (for talents that grant other abilities)
grants: new fields.SchemaField({
  // Skills granted (with training level)
  skills: new fields.ArrayField(
    new fields.SchemaField({
      name: new fields.StringField({ required: true }),
      specialization: new fields.StringField({ required: false, blank: true }),
      level: new fields.StringField({
        required: true,
        initial: "trained",
        choices: ["trained", "plus10", "plus20"]
      })
    }),
    { required: true, initial: [] }
  ),
  
  // Talents granted
  talents: new fields.ArrayField(
    new fields.SchemaField({
      name: new fields.StringField({ required: true }),
      specialization: new fields.StringField({ required: false, blank: true }),
      uuid: new fields.StringField({ required: false, blank: true })
    }),
    { required: true, initial: [] }
  ),
  
  // Traits granted
  traits: new fields.ArrayField(
    new fields.SchemaField({
      name: new fields.StringField({ required: true }),
      level: new fields.NumberField({ required: false, initial: null }),
      uuid: new fields.StringField({ required: false, blank: true })
    }),
    { required: true, initial: [] }
  ),
  
  // Special abilities (text descriptions for non-item grants)
  specialAbilities: new fields.ArrayField(
    new fields.SchemaField({
      name: new fields.StringField({ required: true }),
      description: new fields.HTMLField({ required: true })
    }),
    { required: true, initial: [] }
  )
})
```

### Helper Properties Added

```javascript
/**
 * Does this talent grant anything?
 * @type {boolean}
 */
get hasGrants() {
  const grants = this.grants;
  return grants.skills.length > 0 || 
         grants.talents.length > 0 || 
         grants.traits.length > 0 || 
         grants.specialAbilities.length > 0;
}

/**
 * Get a summary of what this talent grants.
 * @type {string[]}
 */
get grantsSummary() {
  // Returns array of grant descriptions
}
```

---

## Usage Examples

### Example 1: Grant a Single Talent

**Credo Omnissiah (Forge World)** grants **Technical Knock**:

```json
{
  "name": "Credo Omnissiah (Forge World)",
  "system": {
    "grants": {
      "skills": [],
      "talents": [
        {
          "name": "Technical Knock",
          "specialization": "",
          "uuid": "Compendium.rogue-trader.rt-items-talents.W6FkTzFZmG8C5ieI"
        }
      ],
      "traits": [],
      "specialAbilities": []
    }
  }
}
```

### Example 2: Grant a Specialized Talent

**If It Bleeds, I Can Kill It (Death World)** grants **Melee Weapon Training (Primitive)**:

```json
{
  "name": "If It Bleeds, I Can Kill It (Death World)",
  "system": {
    "grants": {
      "skills": [],
      "talents": [
        {
          "name": "Melee Weapon Training",
          "specialization": "Primitive",
          "uuid": "Compendium.rogue-trader.rt-items-talents.IA7IeKuu9Sura3tN"
        }
      ],
      "traits": [],
      "specialAbilities": []
    }
  }
}
```

### Example 3: Grant Multiple Talents with Choice

**Supremely Connected (Noble Born)** grants **Peer (Nobility)** plus one choice:

```json
{
  "name": "Supremely Connected (Noble Born)",
  "system": {
    "grants": {
      "skills": [],
      "talents": [
        {
          "name": "Peer",
          "specialization": "Nobility",
          "uuid": "Compendium.rogue-trader.rt-items-talents.Icpx3A1ddmbsNRuL"
        }
      ],
      "traits": [],
      "specialAbilities": [
        {
          "name": "Additional Peer Choice",
          "description": "<p>Choose one additional Peer talent from: Academics, Adeptus Mechanicus, Administratum, Astropaths, Ecclesiarchy, Government, Mercantile, Military, or Underworld.</p>"
        }
      ]
    }
  }
}
```

### Example 4: Grant Skills

**Hypothetical talent** that grants a skill:

```json
{
  "system": {
    "grants": {
      "skills": [
        {
          "name": "Tech-Use",
          "specialization": "",
          "level": "trained"
        }
      ],
      "talents": [],
      "traits": [],
      "specialAbilities": []
    }
  }
}
```

### Example 5: Grant Traits

**Hypothetical talent** that grants a trait:

```json
{
  "system": {
    "grants": {
      "skills": [],
      "talents": [],
      "traits": [
        {
          "name": "Dark Sight",
          "level": null,
          "uuid": "Compendium.rogue-trader.rt-items-traits.XXX"
        }
      ],
      "specialAbilities": []
    }
  }
}
```

---

## Implementation Flow

### When a Talent is Added to an Actor

The system should automatically grant all abilities listed in `grants`:

```javascript
/**
 * Hook: When an item is created on an actor
 */
Hooks.on("createItem", async (item, options, userId) => {
  // Only process if this is a talent with grants
  if (item.type !== "talent" || !item.system.hasGrants) return;
  
  const actor = item.parent;
  if (!actor) return;
  
  // Grant all talents
  for (const talentGrant of item.system.grants.talents) {
    await grantTalent(actor, talentGrant);
  }
  
  // Grant all skills
  for (const skillGrant of item.system.grants.skills) {
    await grantSkill(actor, skillGrant);
  }
  
  // Grant all traits
  for (const traitGrant of item.system.grants.traits) {
    await grantTrait(actor, traitGrant);
  }
  
  // Special abilities are text-only (displayed in UI)
});
```

### Grant Talent Function

```javascript
/**
 * Grant a talent to an actor
 * @param {Actor} actor - The actor receiving the talent
 * @param {object} talentGrant - The grant definition
 */
async function grantTalent(actor, talentGrant) {
  // Check if actor already has this talent
  const existing = actor.items.find(i => 
    i.type === "talent" && 
    i.name === talentGrant.name &&
    (!talentGrant.specialization || i.system.specialization === talentGrant.specialization)
  );
  
  if (existing) {
    ui.notifications.info(`${actor.name} already has ${talentGrant.name}`);
    return;
  }
  
  // Load talent from compendium
  let talentItem;
  if (talentGrant.uuid) {
    talentItem = await fromUuid(talentGrant.uuid);
  } else {
    // Fallback: search compendium by name
    const pack = game.packs.get("rogue-trader.rt-items-talents");
    const index = await pack.getIndex();
    const entry = index.find(i => i.name === talentGrant.name);
    if (entry) talentItem = await pack.getDocument(entry._id);
  }
  
  if (!talentItem) {
    ui.notifications.warn(`Could not find talent: ${talentGrant.name}`);
    return;
  }
  
  // Clone and apply specialization if needed
  const itemData = talentItem.toObject();
  if (talentGrant.specialization) {
    itemData.system.specialization = talentGrant.specialization;
    itemData.name = `${itemData.name} (${talentGrant.specialization})`;
  }
  
  // Add to actor
  await actor.createEmbeddedDocuments("Item", [itemData]);
  
  ui.notifications.info(`${actor.name} gained ${itemData.name}`);
}
```

### Grant Skill Function

```javascript
/**
 * Grant a skill to an actor
 * @param {Actor} actor - The actor receiving the skill
 * @param {object} skillGrant - The grant definition
 */
async function grantSkill(actor, skillGrant) {
  const skillKey = skillGrant.name.toLowerCase().replace(/\s+/g, "");
  const skill = actor.system.skills[skillKey];
  
  if (!skill) {
    ui.notifications.warn(`Unknown skill: ${skillGrant.name}`);
    return;
  }
  
  // Determine training level to set
  const level = skillGrant.level || "trained";
  const updateData = {};
  
  if (level === "trained") {
    updateData[`system.skills.${skillKey}.trained`] = true;
  } else if (level === "plus10") {
    updateData[`system.skills.${skillKey}.trained`] = true;
    updateData[`system.skills.${skillKey}.plus10`] = true;
  } else if (level === "plus20") {
    updateData[`system.skills.${skillKey}.trained`] = true;
    updateData[`system.skills.${skillKey}.plus10`] = true;
    updateData[`system.skills.${skillKey}.plus20`] = true;
  }
  
  await actor.update(updateData);
  ui.notifications.info(`${actor.name} gained ${skillGrant.name} (${level})`);
}
```

### Grant Trait Function

```javascript
/**
 * Grant a trait to an actor
 * @param {Actor} actor - The actor receiving the trait
 * @param {object} traitGrant - The grant definition
 */
async function grantTrait(actor, traitGrant) {
  // Similar to grantTalent but for traits
  // Check for existing, load from compendium, add to actor
}
```

---

## UI Display

### Talent Sheet

When viewing a talent that grants abilities, show the grants in the description:

```handlebars
{{#if system.hasGrants}}
  <div class="rt-talent-grants">
    <h3>{{localize "RT.Talent.Grants"}}</h3>
    <ul>
      {{#each system.grantsSummary}}
        <li>{{this}}</li>
      {{/each}}
    </ul>
  </div>
{{/if}}
```

### Actor Sheet

Show granted abilities with a badge or icon indicating they came from another talent:

```handlebars
{{#each talents}}
  <div class="rt-talent-card">
    <span class="rt-talent-name">{{name}}</span>
    {{#if flags.rt.grantedBy}}
      <span class="rt-granted-badge" title="Granted by {{flags.rt.grantedBy}}">
        <i class="fa-solid fa-gift"></i>
      </span>
    {{/if}}
  </div>
{{/each}}
```

---

## Updated Talents

The following origin talents now have grants:

| Talent | Grants |
|--------|--------|
| **Credo Omnissiah (Forge World)** | Technical Knock |
| **If It Bleeds, I Can Kill It (Death World)** | Melee Weapon Training (Primitive) |
| **Supremely Connected (Noble Born)** | Peer (Nobility) + choice |

---

## Future Enhancements

### Automatic Granting on Character Creation

When an origin path is selected during character creation:

1. Add all origin talents to character
2. Each origin talent automatically grants its sub-abilities
3. Present choice dialogs for talents with multiple options

### Grant Tracking

Add flags to granted items to track their source:

```javascript
const itemData = talentItem.toObject();
itemData.flags = {
  rt: {
    grantedBy: parentTalent.name,
    grantedById: parentTalent.id,
    autoGranted: true
  }
};
```

### Removal Cascade

When a talent that grants abilities is removed, optionally remove granted abilities:

```javascript
Hooks.on("deleteItem", async (item, options, userId) => {
  if (item.type !== "talent" || !item.system.hasGrants) return;
  
  const actor = item.parent;
  if (!actor) return;
  
  // Find all items granted by this talent
  const grantedItems = actor.items.filter(i => 
    i.flags.rt?.grantedById === item.id
  );
  
  if (grantedItems.length > 0) {
    const confirm = await Dialog.confirm({
      title: "Remove Granted Abilities?",
      content: `<p>This talent granted ${grantedItems.length} abilities. Remove them as well?</p>`
    });
    
    if (confirm) {
      await actor.deleteEmbeddedDocuments("Item", grantedItems.map(i => i.id));
    }
  }
});
```

---

## Testing Checklist

- [ ] Talent with `grants.talents` can be added to actor
- [ ] Granted talent appears in actor's talent list
- [ ] Granted talent with specialization has correct name
- [ ] Duplicate grants are prevented
- [ ] Grant summary displays in talent sheet
- [ ] Granted items show badge/indicator in UI
- [ ] Removing granting talent optionally removes granted items
- [ ] Skills are correctly granted and updated
- [ ] Traits are correctly granted

---

## Summary

The `grants` structure allows talents to **automatically provide other abilities** when acquired. This is essential for origin talents like "Credo Omnissiah" which grants "Technical Knock".

**Key Files Modified:**
- `src/module/data/item/talent.mjs` - Added grants schema
- `src/packs/rt-items-talents/_source/credo-omnissiah-forge-world_FW00000000000001.json`
- `src/packs/rt-items-talents/_source/if-it-bleeds-death-world_DW00000000000002.json`
- `src/packs/rt-items-talents/_source/supremely-connected-noble-born_NB00000000000003.json`

**Next Steps:**
1. Implement the `createItem` hook to auto-grant abilities
2. Add UI indicators for granted items
3. Test the complete flow from origin selection to talent granting
