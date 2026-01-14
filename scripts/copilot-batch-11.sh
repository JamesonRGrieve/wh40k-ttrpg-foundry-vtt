#!/bin/bash
# Copilot Batch 11: Combat Talents - Final Cleanup Round 2/3 (28 talents)

copilot -p "You are completing the final audit of Rogue Trader VTT combat talent pack data files. These talents have structural fields but need mechanical effects fully encoded.

DOCUMENTATION TO READ FIRST:
1. Read docs/TALENT_TEMPLATE.json
2. Read docs/TALENT_AUDIT_CHECKLIST.md
3. Read docs/TALENT_COMMON_ISSUES.md

CRITICAL ENCODING RULES:
1. MISSING IDENTIFIERS: If identifier field is missing, add camelCase version (e.g., 'Ded Ard' → 'dedArd')

2. MECHANICAL EFFECTS MUST BE ENCODED:
   - If benefit says 'reduce penalty by X' → add to modifiers.other or grants.specialAbilities
   - If benefit says '+X to [characteristic]' → add to modifiers.characteristics.[key] = X
   - If benefit says '+X to [skill]' → add to modifiers.skills.[key] = X
   - If benefit says '+X damage' → add to modifiers.combat.damage = X (or situational if conditional)
   - If benefit says '+X Initiative' → add to modifiers.combat.initiative = X
   - If benefit says 'grants training in [skill]' → add to grants.skills array
   - If benefit says 'you may reroll' or special narrative effect → add to grants.specialAbilities

3. CONDITIONAL BONUSES (situational):
   - If benefit says 'when X' or 'against Y' or 'while Z' → use modifiers.situational
   - MUST include: key, value, condition (clear text), icon
   - Example: {\"key\": \"attack\", \"value\": 10, \"condition\": \"Against daemons\", \"icon\": \"fa-solid fa-skull\"}

4. SPECIAL MECHANICS:
   - Penalty reductions → modifiers.other array with description
   - Rerolls → grants.specialAbilities
   - Extra actions → grants.specialAbilities
   - Special combat maneuvers → grants.specialAbilities with clear description

5. DO NOT USE MODIFIERS FOR:
   - Effects that require player choice/activation
   - Complex rules that can't be auto-calculated
   - Use grants.specialAbilities instead for these

TALENTS TO AUDIT (files in src/packs/rt-items-talents/_source/):
29. deathdealer-x_cKxILTXNjiVY8FMH.json
30. ded-ard_xQK3lBpO6gsnL5Fx.json
31. ded-sneaky_2JX2OiKkYUmhBEzQ.json
32. deflect-shot_xAr07OQu4DIgtceb.json
33. deny-the-witch_yzxFbyZdpM4nbJUH.json
34. desperate-strength_rfHpTo8x8mtL2r4c.json
35. disciple-of-kauyon_oprScvn3yv4MOeWd.json
36. disciple-of-mont-ka_vN0XQRhFX948m34e.json
37. double-tap_BtZHWOPGEHCgN6It.json
38. exotic-weapon-training-x_YBlideAZDfZwOkJN.json
39. fierce-loyalty_cc0iaso3HszVYruE.json
40. furious-zeal_v8OmZFaZdjrt7FLz.json
41. giantkiller_zmIDbrPt54ZBfcXG.json
42. hatred-x_RR3rNt6WnWvwG4n8.json
43. heroic-resilience_J0OgHspRVFITbeRi.json
44. hip-shooting_1DBXaXBKbzCrX1Dm.json
45. horde-fighter_yyn3M0aH9n3jVFio.json
46. hull-down_V8uFkAhGqKdYBuUE.json
47. hunter-of-aliens_OxOosltkT5gUL6L5.json
48. improved-dexterity_lXoP5NqER9XaieCJ.json
49. independent-targeting_nKqa8bHY24DQgOxs.json
50. inescapable-attack-x_bITuRyaUmfub3MDh.json
51. initiated-maintenance_0VctLUSaDejMFefG.json
52. instrument-of-his-will_DBAqymwRHuwZtfDd.json
53. integrated-weapon-systems-x_U4XcR9g25Zqmzkr4.json
54. integrated-weapons-expertise_qKJi4sqYTOnN8cMT.json
55. integrated-weapons-mastery_ddnCGlluwJV7m76g.json
56. kabalite-weapon-training_PSF37IgUBnw8CraG.json

EXAMPLES OF PROPER ENCODING:

Example 1: Hatred (X)
Benefit: '+10 Weapon Skill when attacking [chosen enemy]'
Fix:
\"modifiers\": {
  \"situational\": {
    \"characteristics\": [{
      \"key\": \"weaponSkill\",
      \"value\": 10,
      \"condition\": \"When attacking chosen enemy type\",
      \"icon\": \"fa-solid fa-skull\"
    }]
  }
}

Example 2: Hip Shooting
Benefit: 'Reduce penalty for shooting while moving by 10'
Fix:
\"modifiers\": {
  \"other\": [{
    \"key\": \"shootingWhileMovingPenalty\",
    \"value\": -10,
    \"description\": \"Reduces penalty for shooting while moving by 10\"
  }]
}

Example 3: Hunter of Aliens
Benefit: '+10 to track xenos, +10 damage vs xenos'
Fix:
\"modifiers\": {
  \"situational\": {
    \"skills\": [{
      \"key\": \"tracking\",
      \"value\": 10,
      \"condition\": \"When tracking xenos\",
      \"icon\": \"fa-solid fa-paw-claws\"
    }],
    \"combat\": [{
      \"key\": \"damage\",
      \"value\": 10,
      \"condition\": \"Against xenos enemies\",
      \"icon\": \"fa-solid fa-alien\"
    }]
  }
}

Example 4: Double Tap
Benefit: 'May make extra attack as half action with semi-auto weapon'
Fix:
\"grants\": {
  \"specialAbilities\": [{
    \"name\": \"Double Tap\",
    \"description\": \"<p>When using a semi-automatic weapon, you may spend a Half Action to make an additional attack with +20 to hit. Both attacks must target the same enemy.</p>\"
  }]
}

PROCESS FOR EACH TALENT:
1. Read the talent JSON file
2. Check if identifier is missing → add it
3. Read benefit text carefully
4. Identify ALL mechanical effects described
5. Encode EACH effect in appropriate location:
   - Always-on numerical bonuses → modifiers.[category]
   - Conditional bonuses → modifiers.situational
   - Training grants → grants.skills
   - Special rules/abilities → grants.specialAbilities
6. If benefit describes multiple effects, encode ALL of them
7. Save the file with proper formatting

TRACKING:
After completing all talents, create a summary report at docs/copilot-batch-11-report.md listing:
- Talents audited: 28
- Identifiers added: X
- Mechanical effects encoded: X
- Issues found and fixed per talent" --yolo
