# Roll20 to Foundry Mapping

Source files

- `reference/roll20/RogueTraderImproved.html`
- `reference/roll20/RogueTraderImproved.css`
- `reference/roll20/sheet.json`

## Attribute Mapping (Roll20 -> Foundry)

Planned Foundry paths are based on the current fork schema and will be adjusted as Rogue Trader schemas are added.

| Roll20 attribute | Meaning | Foundry path (planned) | Notes |
| --- | --- | --- | --- |
| `attr_character_name` | Character name | `actor.name` | Use actor name directly. |
| `attr_player` | Player name | `actor.system.playerName` | New field (verify in repo). |
| `attr_startingWS` | Weapon Skill starting | `actor.system.characteristics.weaponSkill.starting` | Current fork uses `base`. |
| `attr_AdvancedWS1..4` | WS advances (5 each) | `actor.system.characteristics.weaponSkill.advances` | Store count or total advances. |
| `attr_WeaponSkill` | WS total | `actor.system.characteristics.weaponSkill.total` | Derived. |
| `attr_startingBS` | Ballistic Skill starting | `actor.system.characteristics.ballisticSkill.starting` | Current fork uses `base`. |
| `attr_AdvancedBS1..4` | BS advances | `actor.system.characteristics.ballisticSkill.advances` | Derived to total. |
| `attr_BallisticSkill` | BS total | `actor.system.characteristics.ballisticSkill.total` | Derived. |
| `attr_startingS` | Strength starting | `actor.system.characteristics.strength.starting` |  |
| `attr_AdvancedS1..4` | Strength advances | `actor.system.characteristics.strength.advances` |  |
| `attr_Strength` | Strength total | `actor.system.characteristics.strength.total` | Derived. |
| `attr_startingT` | Toughness starting | `actor.system.characteristics.toughness.starting` |  |
| `attr_AdvancedT1..4` | Toughness advances | `actor.system.characteristics.toughness.advances` |  |
| `attr_Toughness` | Toughness total | `actor.system.characteristics.toughness.total` | Derived. |
| `attr_startingAG` | Agility starting | `actor.system.characteristics.agility.starting` |  |
| `attr_AdvancedAG1..4` | Agility advances | `actor.system.characteristics.agility.advances` |  |
| `attr_Agility` | Agility total | `actor.system.characteristics.agility.total` | Derived. |
| `attr_startingINT` | Intelligence starting | `actor.system.characteristics.intelligence.starting` |  |
| `attr_AdvancedINT1..4` | Intelligence advances | `actor.system.characteristics.intelligence.advances` |  |
| `attr_Intelligence` | Intelligence total | `actor.system.characteristics.intelligence.total` | Derived. |
| `attr_startingPER` | Perception starting | `actor.system.characteristics.perception.starting` |  |
| `attr_AdvancedPER1..4` | Perception advances | `actor.system.characteristics.perception.advances` |  |
| `attr_Perception` | Perception total | `actor.system.characteristics.perception.total` | Derived. |
| `attr_startingWP` | Willpower starting | `actor.system.characteristics.willpower.starting` |  |
| `attr_AdvancedWP1..4` | Willpower advances | `actor.system.characteristics.willpower.advances` |  |
| `attr_Willpower` | Willpower total | `actor.system.characteristics.willpower.total` | Derived. |
| `attr_startingFEL` | Fellowship starting | `actor.system.characteristics.fellowship.starting` |  |
| `attr_AdvancedFEL1..4` | Fellowship advances | `actor.system.characteristics.fellowship.advances` |  |
| `attr_Fellowship` | Fellowship total | `actor.system.characteristics.fellowship.total` | Derived. |
| `attr_Wounds` | Wounds current | `actor.system.wounds.value` |  |
| `attr_Wounds_max` | Wounds max | `actor.system.wounds.max` |  |
| `attr_fate` | Fate current | `actor.system.fate.value` |  |
| `attr_fate_max` | Fate max | `actor.system.fate.max` |  |
| `attr_fatiguecurrent` | Fatigue current | `actor.system.fatigue.value` |  |
| `attr_fatiguepenalty` | Fatigue penalty toggle | `actor.system.fatigue.penaltyActive` | Boolean or computed. |
| `attr_modifier` | Roll modifier | `rollData.modifiers.modifier` | Prompt-driven in the current fork. |
| `attr_insanity` | Insanity points | `actor.system.insanity.value` | New field (verify in repo). |
| `attr_traumamod` | Insanity modifier | `actor.system.insanity.modifier` | Derived. |
| `attr_corruption` | Corruption points | `actor.system.corruption.value` | New field (verify in repo). |
| `attr_MaligMod` | Corruption modifier | `actor.system.corruption.malignancyModifier` | Derived. |
| `attr_Awareness1` | Basic skill trained flag | `actor.system.skills.awareness.trained` | Roll20 uses 0.5 value. |
| `attr_Awareness2` | +10 checkbox | `actor.system.skills.awareness.rank10` | Boolean. |
| `attr_Awareness3` | +20 checkbox | `actor.system.skills.awareness.rank20` | Boolean. |
| `attr_Awareness` | Skill target total | `actor.system.skills.awareness.target` | Derived from characteristic and training. |
| `attr_Acrobatics1..4` | Advanced skill training and +10/+20 | `actor.system.skills.acrobatics.*` | Advanced skills cannot be used untrained. |
| `attr_pamws` | Power armor WS mod | `actor.system.modifiers.powerArmor.ws` | Verify meaning. |
| `attr_patoggle` | Power armor toggle | `actor.system.modifiers.powerArmor.enabled` | Verify meaning. |

## Mapping Coverage Status

Completed (in schema)

- Core characteristics: WS/BS/S/T/Ag/Int/Per/WP/Fel
- Core vitals: wounds, fate, fatigue (penalty toggle)
- Skills in schema (aligned to Roll20 characteristic labels): Acrobatics, Awareness, Barter, Blather, Carouse, Charm, Chem-Use, Ciphers, Climb, Command, Commerce, Common Lore, Concealment, Contortionist, Deceive, Demolition, Disguise, Dodge, Drive, Evaluate, Forbidden Lore, Gamble, Inquiry, Interrogation, Intimidate, Invocation, Literacy, Logic, Medicae, Navigation, Parry, Performer, Pilot, Psyniscience, Search, Scholastic Lore, Scrutiny, Secret Tongue, Security, Shadowing, Silent Move, Sleight of Hand, Speak Language, Stealth, Survival, Swim, Tracking, Trade, Tech-Use, Wrangling

Remaining to map (verify in Roll20 sheet)

- Skill groups and repeats: Navigation, Pilot, Trade, Common/Scholastic/Forbidden Lore, Secret Tongue, Speak Language, Ciphers, Performer, Drive (need repeating group handling)
- Custom skills (Roll20 repeating custom skill section)
- Power armor modifiers (`pam*`) and toggle logic (if used in RT)
- Any skills not present in the Roll20 sheet (e.g., Athletics) should be confirmed against RT rules before adding

## Group Skills (Roll20 Repeating Sections)

The following skills are implemented as Roll20 repeating sections with per-group names and bonuses. Foundry will need a structure for grouped skills or itemized sub-skills.

| Roll20 section | Characteristic | Notes |
| --- | --- | --- |
| Speak Language | Int | `repeating_speaklanguage`, uses `attr_language*` fields |
| Scholastic Lore | Int | `repeating_scholasticlore`, uses `attr_Slore*` fields |
| Drive | Ag | `repeating_drive`, uses `attr_Drive*` fields |
| Secret Tongue | Int | `repeating_secrettongue`, uses `attr_STongue*` fields |
| Ciphers | Int | `repeating_ciphers`, uses `attr_Ciphers*` fields |
| Common Lore | Int | `repeating_commonlore`, uses `attr_Clore*` fields |
| Forbidden Lore | Int | `repeating_forbiddenlore`, uses `attr_Flore*` fields |
| Navigation | Int | `repeating_navigation`, uses `attr_Navigation*` fields |
| Pilot | Ag | `repeating_pilot`, uses `attr_Pilot*` fields |
| Trade | Varies (selected) | `repeating_trade`, uses `attr_Tradecharacteristic` select |
| Performer | Fel | `repeating_performer`, uses `attr_Performer*` fields |

## Formula Preservation

### Characteristics

From Roll20 sheet workers (`reference/roll20/RogueTraderImproved.html`):

- `Characteristic Total = starting + Advanced1 + Advanced2 + Advanced3 + Advanced4 + powerArmorMod - fatiguePenalty`
- Power armor modifiers (`pamws`, `pambs`, `pams`, `pamag`, `pamper`) apply only when `patoggle = 1`.
- Fatigue penalty is applied as a flat subtraction.

### Skills (Basic)

From Roll20 skill fields:

- `Skill Target = floor((0.5 + trainedFlag) * characteristic) + +10 + +20 + talentBonus + otherBonus`
- When not trained, basic skills use half characteristic (rounded down).

### Skills (Advanced)

From Roll20 advanced skill fields (example Acrobatics):

- `Skill Target = floor((trainedFlag1 + trainedFlag2) * characteristic) + +10 + +20 + talentBonus + otherBonus`
- Advanced skills are not usable untrained (training flags start at 0).

### Insanity / Corruption Thresholds

From Roll20 sheet workers:

- Corruption:
  - 0 -> `corruption_0`, modifier 0
  - 1-30 -> `corruption_30`, modifier 0
  - 31-60 -> `corruption_60`, modifier +10
  - 61-90 -> `corruption_90`, modifier -20
  - 91-99 -> `corruption_99`, modifier -30
  - 100+ -> `corruption_100`, modifier -99
- Insanity:
  - 0-9 -> modifier +10 (`insanity_0`)
  - 10-39 -> modifier +10 (`insanity_10`)
  - 40-59 -> modifier 0 (`insanity_40`)
  - 60-79 -> modifier -10 (`insanity_60`)
  - 80-99 -> modifier -20 (`insanity_80`)
  - 100+ -> modifier -99 (`insanity_100`)

## Roll20-Only Features to Reimplement

- Roll templates (`&{template:custom}`) -> Foundry chat cards.
- Sheet workers -> derived data in actor `prepareData()` / `prepareDerivedData()`.
- Repeating section totals (ship components, gear weights) -> Foundry item collections + derived totals.
- Inline Roll20 macros (e.g., `@{modifier}` prompts) -> Foundry roll dialogs or inline modifier inputs.

## Notes

- When uncertain, validate against the current fork code: `src/module/rolls/*` and `src/module/prompts/*`.
- Any new field names should be defined in the Rogue Trader actor schema before use.
