#!/bin/bash
# Copilot Batch 1: Combat Talents 1-30

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
1. abhor-the-witch_geRrB2xK0YSHcVxb.json
2. agony-from-afar_mfRGnWmPFCKVrGak.json
3. ambidextrous_uG4R9ADGyaJ8F0Ni.json
4. ambush_dDiyH3L7gMw21VXt.json
5. ancestral-blessing_emrOQebwpDA3dXu1.json
6. ancient-warrior_wruUiFND0cvAy3yV.json
7. armour-breaker_rdYR36JYR1O7g5ru.json
8. arms-master_yn2oE4iixiypCZbe.json
9. armsman_RVsByXv1IMNEYw2R.json
10. aspire-to-vengeance_7bj3mEaDhN8uf3gc.json
11. assassin-strike_KTrYgKpxzvt1pWMK.json
12. astartes-weapon-specialisation-x_DBqu54MHdwgtg3qf.json
13. astartes-weapon-training_lnjWDZ7hR7YwARQw.json
14. autosanguine_VnK6TaiB6EtMyXtl.json
15. ballistic-fury_0UeQEwOF3iSWi68f.json
16. basic-weapon-training-x_hcos9l0fGA2ZqhsJ.json
17. beast-hunter_qzu0sOk7N7cRS9vQ.json
18. berserk-charge_64PD43Q2KaW52vkK.json
19. blade-dancer_7hI8UhALpxfB0OhO.json
20. blademaster_b43qLSnrex7Z8XWY.json
21. blessed-radiance_4E0eWCCZ7x0tz6ap.json
22. blessing-of-flame_ZKy8trsGlBStadJk.json
23. blessing-of-the-ethereals_FArNpiGZtDdN8bfA.json
24. blind-fighting_xXSDf0PkAg9zLNzh.json
25. blistering-evasion_AEYhrVih6TjSH8NU.json
26. bodyguard_K9jJBo8RG60icdiN.json
27. bolter-drill_FGLOYPhiI7xqv4S7.json
28. bombardier_QEEZuLBbisvUgLYD.json
29. bonding-ritual_w3oH7K0IxcwOB8xZ.json
30. brimstone-rhetoric_UMv9fkcE1YwAg8lp.json

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
- Save report to docs/copilot-batch-1-report.md" --yolo
