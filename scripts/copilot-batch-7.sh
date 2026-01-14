#!/bin/bash
# Copilot Batch 7: Combat Talents - Final Round 1/3 (51 talents)

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
1. abhor-the-witch_geRrB2xK0YSHcVxb.json
2. ambush_dDiyH3L7gMw21VXt.json
3. ancestral-blessing_emrOQebwpDA3dXu1.json
4. armour-breaker_rdYR36JYR1O7g5ru.json
5. arms-master_yn2oE4iixiypCZbe.json
6. aspire-to-vengeance_7bj3mEaDhN8uf3gc.json
7. assassin-strike_KTrYgKpxzvt1pWMK.json
8. astartes-weapon-training_lnjWDZ7hR7YwARQw.json
9. beast-hunter_qzu0sOk7N7cRS9vQ.json
10. berserk-charge_64PD43Q2KaW52vkK.json
11. blade-dancer_7hI8UhALpxfB0OhO.json
12. blademaster_b43qLSnrex7Z8XWY.json
13. blessed-radiance_4E0eWCCZ7x0tz6ap.json
14. blessing-of-flame_ZKy8trsGlBStadJk.json
15. blessing-of-the-ethereals_FArNpiGZtDdN8bfA.json
16. blind-fighting_xXSDf0PkAg9zLNzh.json
17. blistering-evasion_AEYhrVih6TjSH8NU.json
18. bodyguard_K9jJBo8RG60icdiN.json
19. bolter-drill_FGLOYPhiI7xqv4S7.json
20. bombardier_QEEZuLBbisvUgLYD.json
21. bonding-ritual_w3oH7K0IxcwOB8xZ.json
22. brimstone-rhetoric_UMv9fkcE1YwAg8lp.json
23. calculated-barrage_dE6QGbavHotbIsHi.json
24. combat-flair_cWmYxSYscjdgA1Zw.json
25. coordinated-strike_4Vi0grElp7j6nC3P.json
26. counter-attack_Ij8T0KeCJ8b58s8y.json
27. crack-shot_JJCV3nv9G1vRkh2M.json
28. creative-killer_1fte7wpoPmgVT5qq.json
29. crippling-strike_wdmo0R0QkHPiVIhD.json
30. cruelty_z2BHXPHbdWC7Rzvy.json
31. crushing-blow_BiAhjzVuUBdOw9zQ.json
32. cursed-heirloom_A95axB6BwWNw284h.json
33. daemonhunter_2J7nhocHBJIKLwx1.json
34. daemonic-disruption_6mpBKLhj3EBDAPap.json
35. deadeye-shot_4DOynDQ10MFaL5mT.json
36. death-from-above_HF8SKxmLQO2il7Wm.json
37. death-serves-the-righteous_xv7bEEmwc3cRC4Ip.json
38. deathdealer-x_cKxILTXNjiVY8FMH.json
39. ded-ard_xQK3lBpO6gsnL5Fx.json
40. ded-sneaky_2JX2OiKkYUmhBEzQ.json
41. deflect-shot_xAr07OQu4DIgtceb.json
42. deny-the-witch_yzxFbyZdpM4nbJUH.json
43. desperate-strength_rfHpTo8x8mtL2r4c.json
44. disciple-of-kauyon_oprScvn3yv4MOeWd.json
45. disciple-of-mont-ka_vN0XQRhFX948m34e.json
46. double-tap_BtZHWOPGEHCgN6It.json
47. duelist_9lkm9njRXjXoshbA.json
48. escalating-rage_3wZF0KGWgDDZdYqX.json
49. eternal-vigilance_CMaPRDtwxSSgt6oR.json
50. exotic-weapon-training-x_YBlideAZDfZwOkJN.json
51. fierce-loyalty_cc0iaso3HszVYruE.json

TRACKING:
After completing all talents, create a summary report at docs/copilot-batch-7-report.md" --yolo
