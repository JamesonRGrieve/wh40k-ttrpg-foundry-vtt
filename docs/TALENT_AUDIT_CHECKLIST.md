# Talent Audit Checklist

Use this checklist for each talent you audit.

## Basic Information
- [ ] **name**: Clear and matches Rogue Trader rules
- [ ] **identifier**: Unique, camelCase, no special chars
- [ ] **category**: One of: combat, knowledge, general, origin, social, leadership, tech, psychic
- [ ] **tier**: 0 (origin), 1-3 (standard tiers)
- [ ] **cost**: Appropriate XP cost (0-1000+)
- [ ] **img**: Appropriate icon path exists

## Descriptive Fields
- [ ] **description**: General lore/context (distinct from benefit)
- [ ] **benefit**: Mechanical effect clearly explained
- [ ] **benefit vs modifiers**: If benefit mentions bonuses, check they're encoded in modifiers/grants
- [ ] **prerequisites.text**: Human-readable prerequisites
- [ ] **aptitudes**: Matches Rogue Trader aptitude system

## Prerequisites
- [ ] **prerequisites.characteristics**: Encoded properly (e.g., {"agility": 35})
- [ ] **prerequisites.skills**: Encoded with training level (0=trained, 1=+10, 2=+20)
- [ ] **prerequisites.talents**: Array of required talent names

## Modifiers (Always-On)
- [ ] **modifiers.characteristics**: Permanent stat boosts (if any)
- [ ] **modifiers.skills**: Permanent skill bonuses (if any)
- [ ] **modifiers.combat**: Attack/damage/defense/initiative bonuses
- [ ] **modifiers.resources**: Wounds/fate/corruption/insanity changes
- [ ] **No empty objects**: Remove empty {} if no modifiers

## Situational Modifiers
- [ ] **modifiers.situational.skills**: Conditional skill bonuses with clear condition text
- [ ] **modifiers.situational.characteristics**: Conditional characteristic bonuses
- [ ] **modifiers.situational.combat**: Conditional combat bonuses
- [ ] **Each has**: key, value, condition, icon

## Grants
- [ ] **grants.skills**: Skill training granted (name, specialization, level)
- [ ] **grants.talents**: Nested talents granted (name, specialization, uuid)
- [ ] **grants.traits**: Traits granted (name, level, uuid)
- [ ] **grants.specialAbilities**: Text-based special abilities (name, description)
- [ ] **UUIDs**: Compendium UUIDs for talents/traits when possible

## Flags
- [ ] **isPassive**: true if no activation needed, false if requires roll/action
- [ ] **stackable**: true if can be taken multiple times (e.g., "Talented (X)")
- [ ] **rank**: Set to 1 unless stackable
- [ ] **specialization**: For (X) talents, leave blank in template but note in name

## Roll Configuration
- [ ] **rollConfig.characteristic**: If rollable, which characteristic
- [ ] **rollConfig.skill**: If rollable, which skill (or blank if characteristic only)
- [ ] **rollConfig.modifier**: Default modifier for the roll
- [ ] **rollConfig.description**: What the roll represents

## Common Patterns
- [ ] Weapon Training talents: Check specialization requirements
- [ ] Skill improvement talents: Use modifiers.skills OR grants.skills (not both)
- [ ] Damage bonus talents: Use modifiers.combat.damage
- [ ] Initiative talents: Use modifiers.combat.initiative
- [ ] Defense talents: Use modifiers.combat.defense
- [ ] Special abilities: Use grants.specialAbilities for narrative effects

## Validation
- [ ] No benefit/modifier mismatch (benefit says +10, modifiers shows +10)
- [ ] No duplicate modifiers (don't put same bonus in both always-on and situational)
- [ ] Situational bonuses have clear conditions
- [ ] Skill names match SkillKeyHelper.SKILL_NAME_TO_KEY
- [ ] Referenced talents/traits exist in compendium

## Field Decision Tree

### Does the talent grant a skill bonus?
- **Permanent bonus** (+5, +10, +20) → `modifiers.skills`
- **Training level change** (untrained → trained → +10 → +20) → `grants.skills`
- **Conditional bonus** (in specific situations) → `modifiers.situational.skills`

### Does the talent grant combat bonuses?
- **Always active** → `modifiers.combat`
- **Conditional** (with specific weapons, in specific situations) → `modifiers.situational.combat`

### Does the talent grant other abilities?
- **Other talents/traits** → `grants.talents` or `grants.traits`
- **Narrative special rules** → `grants.specialAbilities`
- **Items/equipment** → `grants.equipment` (not in standard talent template)

### Is the effect permanent or temporary?
- **Permanent passive effect** → `isPassive: true`, use `modifiers`
- **Requires activation/roll** → `isPassive: false`, set up `rollConfig`
