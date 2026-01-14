#!/bin/bash
# Copilot Batch 12: Combat Talents - Final Cleanup Round 3/3 (28 talents)

copilot -p "You are completing the final audit of Rogue Trader VTT combat talent pack data files. These talents have structural fields but need mechanical effects fully encoded.

DOCUMENTATION TO READ FIRST:
1. Read docs/TALENT_TEMPLATE.json
2. Read docs/TALENT_AUDIT_CHECKLIST.md
3. Read docs/TALENT_COMMON_ISSUES.md

CRITICAL ENCODING RULES:
1. MISSING IDENTIFIERS: If identifier field is missing, add camelCase version (e.g., 'Wall of Steel' → 'wallOfSteel')

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
   - Example: {\"key\": \"defense\", \"value\": 10, \"condition\": \"In defensive stance\", \"icon\": \"fa-solid fa-shield\"}

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
57. killer-s-eye_t3f2unSxJ0ll0joe.json
58. killing-strike_f3j7NvTwqniOLUYQ.json
59. las-weapon-expertise_tfyhaXS9c3OM5VVf.json
60. las-weapon-mastery_7oetJqEOZ7JkxtO6.json
61. lasgun-barrage_Yfdquk7NmzVYF9fC.json
62. lasgun-volley_nsJQgiK8TyrnwHKb.json
63. last-man-standing_AmcuI0l5Ezg32UB5.json
64. leaping-dodge_RZjZQh4sBTFlCk5k.json
65. legendary_0HG1yBI05vvmIUIx.json
66. legion-weapon-training_Dt8w6FirBvnUcThv.json
67. mounted-warrior-x-y_dZZqD4SXKmaeovWp.json
68. opportunist-s-evasion_ON0dGdtPFA0turIQ.json
69. plasma-weapon-mastery_dO0QKCcWVMqvRsYV.json
70. ranged-weapon-expert_5ggFY8BWbZIYLIJf.json
71. scourge-of-heretics_vz6hUuxGPRxuzg6x.json
72. slayer-of-daemons_1BRfuLkSDpqyktrf.json
73. step-aside_pW2lW3StcJ5TSqP4.json
74. storm-of-iron_O7pWsdpCCc9mvcyO.json
75. street-fighting_lonqn6q9FoodOfsF.json
76. strength-through-unity_qsn3Tndaao2saDYT.json
77. sure-strike_Tjk1W6708lfDyYi6.json
78. tank-hunter_qdxtGNW6gyv8p7ko.json
79. two-weapon-wielder-x_FBpi0y0EIrPliHme.json
80. vengeful-protector_7cwuQuyqfRZOGjHV.json
81. void-tactician_6j0WovgeXFmQQ4F3.json
82. wall-of-steel_0FrabNbwBK7mPhck.json
83. weapon-intuition_9t4WFHjUZIVXyfkS.json
84. weapon-training-x_INDCmo3gHBgiF8D8.json

EXAMPLES OF PROPER ENCODING:

Example 1: Wall of Steel
Benefit: '+2 Parry attempts per round'
Fix:
\"grants\": {
  \"specialAbilities\": [{
    \"name\": \"Wall of Steel\",
    \"description\": \"<p>You may make two additional Parry reactions per round (total of 3 Parries per round).</p>\"
  }]
}

Example 2: Tank Hunter
Benefit: '+2d10 damage and +4 penetration vs vehicles'
Fix:
\"modifiers\": {
  \"situational\": {
    \"combat\": [{
      \"key\": \"damage\",
      \"value\": 20,
      \"condition\": \"Against vehicles (2d10 extra)\",
      \"icon\": \"fa-solid fa-tank\"
    }, {
      \"key\": \"penetration\",
      \"value\": 4,
      \"condition\": \"Against vehicles\",
      \"icon\": \"fa-solid fa-tank\"
    }]
  }
}

Example 3: Weapon Training (X)
Benefit: 'Trained in chosen weapon group'
Fix:
\"grants\": {
  \"specialAbilities\": [{
    \"name\": \"Weapon Training\",
    \"description\": \"<p>Choose a weapon group (Las, Bolt, Chain, etc.). You are trained in all weapons of that group and do not suffer untrained penalties.</p>\"
  }]
}

Example 4: Sure Strike
Benefit: 'Reduce called shot penalties by 10'
Fix:
\"modifiers\": {
  \"other\": [{
    \"key\": \"calledShotPenalty\",
    \"value\": -10,
    \"description\": \"Reduces called shot penalties by 10\"
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
After completing all talents, create a summary report at docs/copilot-batch-12-report.md listing:
- Talents audited: 28
- Identifiers added: X
- Mechanical effects encoded: X
- Issues found and fixed per talent" --yolo
