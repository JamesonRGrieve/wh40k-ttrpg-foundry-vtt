#!/bin/bash
# Copilot Batch 2: Combat Talents 31-60

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
31. bulging-biceps_FIVxIyneptJATaIv.json
32. bulwark-of-faith_y5DDehRuPm2Fpqtv.json
33. calculated-barrage_dE6QGbavHotbIsHi.json
34. catfall_i4Y4v8rhniFvboR4.json
35. chain-weapon-expertise_mAXoMeiRs8wJvD8H.json
36. cleanse-and-purify_CNayxwPr9BlW3ome.json
37. cleanse-with-fire_U8eZWwGTlfoeud9L.json
38. combat-flair_cWmYxSYscjdgA1Zw.json
39. combat-master_3mmeTUGeHTCav5HP.json
40. coordinated-strike_4Vi0grElp7j6nC3P.json
41. corpus-conversion_o6daKJOanh2rr9EE.json
42. corrupted-charge_3Hm1p0w1L04NGK4q.json
43. counter-attack_Ij8T0KeCJ8b58s8y.json
44. crack-shot_JJCV3nv9G1vRkh2M.json
45. creative-killer_1fte7wpoPmgVT5qq.json
46. crippling-strike_wdmo0R0QkHPiVIhD.json
47. cruelty_z2BHXPHbdWC7Rzvy.json
48. crushing-blow_BiAhjzVuUBdOw9zQ.json
49. cursed-heirloom_A95axB6BwWNw284h.json
50. daemonhunter_2J7nhocHBJIKLwx1.json
51. daemonic-disruption_6mpBKLhj3EBDAPap.json
52. deadeye-shot_4DOynDQ10MFaL5mT.json
53. death-from-above_HF8SKxmLQO2il7Wm.json
54. death-serves-the-righteous_xv7bEEmwc3cRC4Ip.json
55. deathdealer-x_cKxILTXNjiVY8FMH.json
56. deathwatch-training_XHh4MDEvZxcmr8ht.json
57. ded-ard_xQK3lBpO6gsnL5Fx.json
58. ded-sneaky_2JX2OiKkYUmhBEzQ.json
59. deflect-shot_xAr07OQu4DIgtceb.json
60. deny-the-witch_yzxFbyZdpM4nbJUH.json

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
- Save report to docs/copilot-batch-2-report.md" --yolo
