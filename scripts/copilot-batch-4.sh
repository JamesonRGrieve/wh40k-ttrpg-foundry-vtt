#!/bin/bash
# Copilot Batch 4: Combat Talents 91-120

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
- Normalize characteristic keys: bs→ballisticSkill, ws→weaponSkill, s→strength, t→toughness, ag→agility, int→intelligence, per→perception, wp→willpower, fel→fellowship
- Situational modifiers MUST have: key, value, condition, icon

TALENTS TO AUDIT (files in src/packs/rt-items-talents/_source/):
91. lightning-attack_RdTVEDLSnY0uOVeP.json
92. loader_KwdgsCSyJWmiSCij.json
93. luminen-blast_TkT8nZkFz4G6JFgV.json
94. luminen-charge_AuT50V9tts6o67b2.json
95. luminen-desecration_QG9sxjfqd9ssTmSv.json
96. luminen-shock_fQPORlrL0bxS459u.json
97. machinator-array_ZupcDNAETAQzC80G.json
98. maglev-grace_8AXWAVkYrCLkFdjL.json
99. maglev-transcendence_79zm4ZG13yQbgm0D.json
100. marksman_8VKDlCeeXtAp3MSl.json
101. master-chirurgeon_vXMp4nWesoI2opbY.json
102. mechadendrite-use-x_AC76EdCkMO7I3Yvs.json
103. melee-weapon-training-x_IA7IeKuu9Sura3tN.json
104. melta-weapon-expertise_6sj2OzUdcfPpDbXL.json
105. melta-weapon-mastery_NPzeCqtoxz3lroJh.json
106. methodical-care_bFIlC1RknmCRNbXE.json
107. mighty-shot_ZGpTB3nFWNqrHaPP.json
108. mindtrap-maze_1wifmSHQwRlch6gU.json
109. modify-payload_wohz2SKZ5xa07grC.json
110. more-fer-me_UuB3oMX698QWSJVH.json
111. mounted-warrior-x-y_dZZqD4SXKmaeovWp.json
112. never-die_dfIXY9g6fvk7Eu9W.json
113. nowhere-to-hide_yXxECRWR4jmtyKDd.json
114. one-on-one_N5jP95T532H9AbRs.json
115. opportunist-s-evasion_ON0dGdtPFA0turIQ.json
116. overkill_8T9MAYlSQuHRmOhW.json
117. overlooked_djXzsoWr2YDmsZMZ.json
118. piety-s-reward_SRaMvTlktZDnoC3p.json
119. pistol-weapon-training-x_rCt2fZpvgUwKVtPf.json
120. plasma-weapon-expertise_LhvNvHGwyOZZHrau.json

PROCESS FOR EACH TALENT:
1. Read the talent JSON file
2. Read the benefit/description text to understand the mechanical effect
3. Use TALENT_AUDIT_CHECKLIST.md to verify all fields
4. Fix any issues found using patterns from TALENT_COMMON_ISSUES.md
5. Ensure benefit text matches encoded modifiers/grants
6. Normalize ALL prerequisite characteristic keys to full names
7. Save the fixed JSON file with proper formatting

TRACKING:
After completing all talents, create a summary report at docs/copilot-batch-4-report.md" --yolo
