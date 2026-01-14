#!/bin/bash
# Copilot Batch 10: Combat Talents - Final Cleanup Round 1/3 (28 talents)

copilot -p "You are completing the final audit of Rogue Trader VTT combat talent pack data files. These talents have structural fields but need mechanical effects fully encoded.

DOCUMENTATION TO READ FIRST:
1. Read docs/TALENT_TEMPLATE.json
2. Read docs/TALENT_AUDIT_CHECKLIST.md
3. Read docs/TALENT_COMMON_ISSUES.md

CRITICAL ENCODING RULES:
1. MISSING IDENTIFIERS: If identifier field is missing, add camelCase version (e.g., 'Arms Master' → 'armsMaster')

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
   - Example: {\"key\": \"attack\", \"value\": 10, \"condition\": \"When charging\", \"icon\": \"fa-solid fa-person-running\"}

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
1. ambush_dDiyH3L7gMw21VXt.json
2. armour-breaker_rdYR36JYR1O7g5ru.json
3. arms-master_yn2oE4iixiypCZbe.json
4. aspire-to-vengeance_7bj3mEaDhN8uf3gc.json
5. astartes-weapon-training_lnjWDZ7hR7YwARQw.json
6. beast-hunter_qzu0sOk7N7cRS9vQ.json
7. berserk-charge_64PD43Q2KaW52vkK.json
8. blade-dancer_7hI8UhALpxfB0OhO.json
9. blademaster_b43qLSnrex7Z8XWY.json
10. blessed-radiance_4E0eWCCZ7x0tz6ap.json
11. blessing-of-flame_ZKy8trsGlBStadJk.json
12. blessing-of-the-ethereals_FArNpiGZtDdN8bfA.json
13. blistering-evasion_AEYhrVih6TjSH8NU.json
14. bodyguard_K9jJBo8RG60icdiN.json
15. bombardier_QEEZuLBbisvUgLYD.json
16. bonding-ritual_w3oH7K0IxcwOB8xZ.json
17. brimstone-rhetoric_UMv9fkcE1YwAg8lp.json
18. crack-shot_JJCV3nv9G1vRkh2M.json
19. creative-killer_1fte7wpoPmgVT5qq.json
20. crippling-strike_wdmo0R0QkHPiVIhD.json
21. cruelty_z2BHXPHbdWC7Rzvy.json
22. crushing-blow_BiAhjzVuUBdOw9zQ.json
23. cursed-heirloom_A95axB6BwWNw284h.json
24. daemonhunter_2J7nhocHBJIKLwx1.json
25. daemonic-disruption_6mpBKLhj3EBDAPap.json
26. deadeye-shot_4DOynDQ10MFaL5mT.json
27. death-from-above_HF8SKxmLQO2il7Wm.json
28. death-serves-the-righteous_xv7bEEmwc3cRC4Ip.json

EXAMPLES OF PROPER ENCODING:

Example 1: Blade Dancer
Benefit: 'Reduce penalty for Two-Weapon Fighting by 10'
Fix:
\"modifiers\": {
  \"other\": [{
    \"key\": \"twoWeaponFightingPenalty\",
    \"value\": -10,
    \"description\": \"Reduces Two-Weapon Fighting penalty by 10\"
  }]
}

Example 2: Crack Shot
Benefit: '+2 damage with ranged weapons'
Fix (conditional):
\"modifiers\": {
  \"situational\": {
    \"combat\": [{
      \"key\": \"damage\",
      \"value\": 2,
      \"condition\": \"With ranged weapons\",
      \"icon\": \"fa-solid fa-bullseye\"
    }]
  }
}

Example 3: Arms Master
Benefit: 'Reroll failed attack rolls once per round'
Fix:
\"grants\": {
  \"specialAbilities\": [{
    \"name\": \"Arms Master\",
    \"description\": \"<p>Once per round, you may reroll a failed attack roll. You must accept the second result.</p>\"
  }]
}

Example 4: Berserk Charge
Benefit: '+10 Weapon Skill when charging'
Fix:
\"modifiers\": {
  \"situational\": {
    \"characteristics\": [{
      \"key\": \"weaponSkill\",
      \"value\": 10,
      \"condition\": \"When charging\",
      \"icon\": \"fa-solid fa-person-running\"
    }]
  }
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
After completing all talents, create a summary report at docs/copilot-batch-10-report.md listing:
- Talents audited: 28
- Identifiers added: X
- Mechanical effects encoded: X
- Issues found and fixed per talent" --yolo
