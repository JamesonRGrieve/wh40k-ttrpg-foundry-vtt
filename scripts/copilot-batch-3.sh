#!/bin/bash
# Copilot Batch 3: Combat Talents 61-90

copilot -p "You are auditing Rogue Trader VTT talent pack data files. Your task is to audit and fix the following talents according to the standards defined in the documentation.

DOCUMENTATION TO READ FIRST:
1. Read docs/TALENT_TEMPLATE.json - This is the reference template showing all fields properly filled
2. Read docs/TALENT_AUDIT_CHECKLIST.md - This is your checklist for each talent
3. Read docs/TALENT_COMMON_ISSUES.md - This shows common patterns and how to fix them

CRITICAL RULES:
- Add 'identifier' field (camelCase version of talent name, no spaces or special chars)
- Add complete 'modifiers' object with characteristics, skills, combat, resources, other, situational
- Add complete 'grants' object with skills, talents, traits, specialAbilities
- Add 'rollConfig', 'stackable', 'rank', 'specialization', 'notes' fields if missing
- Use modifiers.skills for BONUSES on top of training (+5, +10, +20)
- Use grants.skills for TRAINING LEVEL changes (untrained → trained → +10 → +20)
- Use modifiers.situational for CONDITIONAL bonuses with clear condition text
- Always check benefit text against encoded modifiers/grants
- All skill names must match valid skill keys (see creature.mjs for valid keys)
- Situational modifiers MUST have: key, value, condition, icon

TALENTS TO AUDIT (files in src/packs/rt-items-talents/_source/):
61. desperate-strength_rfHpTo8x8mtL2r4c.json
62. devastating-assault_rONHrrz95TRxvEbH.json
63. disarm_R5nmolyg9b05TBiN.json
64. disciple-of-kauyon_oprScvn3yv4MOeWd.json
65. disciple-of-mont-ka_vN0XQRhFX948m34e.json
66. disciple-of-shiamesh_dbTQJB7X0i03BvYb.json
67. divine-ministration_dTrhcSA9ETSXR04h.json
68. divine-protection_8I7SXaVDRPLDs1dD.json
69. don-t-you-die-on-me_ip2qzl3PquWWpRq4.json
70. double-tap_BtZHWOPGEHCgN6It.json
71. dual-shot_m6pJeeBiESlD5PmS.json
72. dual-strike_gvbLzGorSWrOUa8U.json
73. duelist_9lkm9njRXjXoshbA.json
74. duty-unto-death_qSY5Bw1rRcQ07Ebs.json
75. emperor-s-guidance_MGtlfNl0lOu5r6oA.json
76. escalating-rage_3wZF0KGWgDDZdYqX.json
77. eternal-vigilance_CMaPRDtwxSSgt6oR.json
78. exotic-weapon-training-x_YBlideAZDfZwOkJN.json
79. eye-of-vengeance_mp8Z9dhDstyziO3T.json
80. faith-healing_kn6UqswAVs2irFLr.json
81. field-vivisection_V61f6ob25kbcYojg.json
82. fierce-loyalty_cc0iaso3HszVYruE.json
83. final-judgement_RSc3vyIyhSs5hXKR.json
84. fire-caste-weapon-training_a3qhQp51XPbyA0Ws.json
85. fire-support_cfaXSMfX044qWT4v.json
86. firebrand-s-call_LnmCfCDlOpyO7HS8.json
87. flame-weapon-training-x_Qb78nv30kXoEgS5h.json
88. flesh-render_0cQmSIIDD6W7tpsD.json
89. frenzy_h0r6im1YDlmrxdAC.json
90. furious-assault_HiALkCK6XUIOsTka.json

PROCESS FOR EACH TALENT:
1. Read the talent JSON file
2. Read the benefit/description text to understand the mechanical effect
3. Use TALENT_AUDIT_CHECKLIST.md to verify all fields
4. Fix any issues found using patterns from TALENT_COMMON_ISSUES.md
5. Ensure benefit text matches encoded modifiers/grants
6. Save the fixed JSON file with proper formatting

EXAMPLES OF COMMON FIXES:

Example 1: Benefit says \"+10 to Awareness\" but modifiers.skills empty
Fix: Add \"modifiers\": { \"skills\": { \"awareness\": 10 } }

Example 2: Benefit says \"Trained in Pistol weapons\" but grants.skills empty
Fix: Add \"grants\": { \"skills\": [{ \"name\": \"Ballistic Skill\", \"specialization\": \"Pistol\", \"level\": \"trained\" }] }

Example 3: Benefit says \"+2 damage with Ranged weapons\" (conditional)
Fix: Add to modifiers.situational.combat with condition \"With Ranged weapons only\"

Example 4: Missing identifier field
Fix: Add \"identifier\": \"camelCaseVersionOfTalentName\" (e.g., \"Mighty Shot\" → \"mightyShot\")

TRACKING:
After completing all talents, create a summary report listing:
- Total talents audited: 30
- Issues found per talent (brief list)
- Fixes applied
- Save report to docs/copilot-batch-3-report.md" --yolo
