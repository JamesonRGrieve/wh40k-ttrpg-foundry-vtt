#!/bin/bash
# Copilot Batch 8: Combat Talents - Final Round 2/3 (51 talents)

copilot -p "You are auditing Rogue Trader VTT talent pack data files. Your task is to audit and fix the following talents according to the standards defined in the documentation.

DOCUMENTATION TO READ FIRST:
1. Read docs/TALENT_TEMPLATE.json
2. Read docs/TALENT_AUDIT_CHECKLIST.md
3. Read docs/TALENT_COMMON_ISSUES.md

CRITICAL RULES:
- Add 'identifier' field (camelCase version of talent name)
- Add complete 'modifiers' and 'grants' objects
- Add 'rollConfig', 'stackable', 'rank', 'specialization', 'notes' fields
- Normalize characteristic keys: bs→ballisticSkill, ws→weaponSkill, s→strength, t→toughness, ag→agility, int→intelligence, per→perception, wp→willpower, fel→fellowship
- Situational modifiers MUST have: key, value, condition, icon

TALENTS TO AUDIT (files in src/packs/rt-items-talents/_source/):
52. fire-support_cfaXSMfX044qWT4v.json
53. furious-fusillade_vyiBhAykascn8A5C.json
54. furious-zeal_v8OmZFaZdjrt7FLz.json
55. giantkiller_zmIDbrPt54ZBfcXG.json
56. glowy-stick_LT9KCqdLMcxtkmJO.json
57. grenadier_2WyJ7P8kdY0biMnR.json
58. guardian_cQ7M4Rw2XTObZNwS.json
59. guided-precision_ljJHR4CDQHUd1yd0.json
60. gunner_se9mj0a2sywaKFGI.json
61. gunslinger_poyd06jrl11hMAak.json
62. hammer-blow_U2FBRFAtWaKb4RmO.json
63. hard-target_fqzH0FfJAgxs0nbG.json
64. hardy_cxdCGZYushVAWRzB.json
65. hatred-x_RR3rNt6WnWvwG4n8.json
66. heavy-weapon-training-x_bybZgIAJ5u8DIBda.json
67. heroic-resilience_J0OgHspRVFITbeRi.json
68. hip-shooting_1DBXaXBKbzCrX1Dm.json
69. horde-fighter_yyn3M0aH9n3jVFio.json
70. hull-down_V8uFkAhGqKdYBuUE.json
71. hunter-of-aliens_OxOosltkT5gUL6L5.json
72. improved-dexterity_lXoP5NqER9XaieCJ.json
73. independent-targeting_nKqa8bHY24DQgOxs.json
74. inescapable-attack-x_bITuRyaUmfub3MDh.json
75. initiated-maintenance_0VctLUSaDejMFefG.json
76. instrument-of-his-will_DBAqymwRHuwZtfDd.json
77. integrated-weapon-systems-x_U4XcR9g25Zqmzkr4.json
78. integrated-weapons-expertise_qKJi4sqYTOnN8cMT.json
79. integrated-weapons-mastery_ddnCGlluwJV7m76g.json
80. kabalite-weapon-training_PSF37IgUBnw8CraG.json
81. killer-s-eye_t3f2unSxJ0ll0joe.json
82. killing-strike_f3j7NvTwqniOLUYQ.json
83. las-weapon-expertise_tfyhaXS9c3OM5VVf.json
84. las-weapon-mastery_7oetJqEOZ7JkxtO6.json
85. lasgun-barrage_Yfdquk7NmzVYF9fC.json
86. lasgun-volley_nsJQgiK8TyrnwHKb.json
87. last-man-standing_AmcuI0l5Ezg32UB5.json
88. leaping-dodge_RZjZQh4sBTFlCk5k.json
89. legendary_0HG1yBI05vvmIUIx.json
90. legion-weapon-training_Dt8w6FirBvnUcThv.json
91. luminen-blast_TkT8nZkFz4G6JFgV.json
92. luminen-desecration_QG9sxjfqd9ssTmSv.json
93. luminen-shock_fQPORlrL0bxS459u.json
94. melta-weapon-expertise_6sj2OzUdcfPpDbXL.json
95. melta-weapon-mastery_NPzeCqtoxz3lroJh.json
96. mounted-warrior-x-y_dZZqD4SXKmaeovWp.json
97. opportunist-s-evasion_ON0dGdtPFA0turIQ.json
98. overkill_8T9MAYlSQuHRmOhW.json
99. plasma-weapon-mastery_dO0QKCcWVMqvRsYV.json
100. precise-blow_PNKDVvEf4q0wkFjC.json
101. ranged-weapon-expert_5ggFY8BWbZIYLIJf.json
102. ripper-charge_G99F16aLX1EKT2ue.json

TRACKING:
After completing all talents, create a summary report at docs/copilot-batch-8-report.md" --yolo
