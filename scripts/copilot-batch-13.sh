#!/bin/bash
# Copilot Batch 13: Knowledge Talents Round 1/3 (15 talents)

copilot -p "You are auditing Rogue Trader VTT knowledge talent pack data files. Your task is to audit and fix these talents according to the standards defined in the documentation.

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

KNOWLEDGE TALENT PATTERNS:
- Often grant skill bonuses (+10, +20 to knowledge skills)
- May grant access to lore/information
- May provide research/investigation bonuses
- Often passive, rarely require rolls
- Use modifiers.skills for skill bonuses
- Use grants.specialAbilities for special lore access or narrative effects

ENCODING EXAMPLES:

Example 1: Lore Bonus
Benefit: '+10 to Scholastic Lore (X)'
Fix:
\"modifiers\": {
  \"skills\": {
    \"scholasticLore\": 10
  }
}

Example 2: Multiple Skill Bonus
Benefit: '+10 to Common Lore and Scholastic Lore'
Fix:
\"modifiers\": {
  \"skills\": {
    \"commonLore\": 10,
    \"scholasticLore\": 10
  }
}

Example 3: Narrative Lore Access
Benefit: 'Access to forbidden knowledge'
Fix:
\"grants\": {
  \"specialAbilities\": [{
    \"name\": \"Forbidden Knowledge Access\",
    \"description\": \"<p>You have access to forbidden lore and may make Forbidden Lore tests without training.</p>\"
  }]
}

Example 4: Research Bonus
Benefit: 'Halve research time for technical subjects'
Fix:
\"grants\": {
  \"specialAbilities\": [{
    \"name\": \"Rapid Research\",
    \"description\": \"<p>You halve the time required to research technical subjects.</p>\"
  }]
}

TALENTS TO AUDIT (files in src/packs/rt-items-talents/_source/):
1. accelerated-repairs_hOM2SMf7lUX2zHyd.json
2. archivator_0eebfh8gSFPTsSo6.json
3. armour-monger_4ptj2NOW9LkuvOfr.json
4. battlefield-tech-wright_2b5bTM4ilO5tb8GF.json
5. combat-formation_ySfG09YOza4F8pCC.json
6. constant-vigilance-x_kHjvhb7LdxuEGTZ1.json
7. coordination-algorithms_7EkAGxXC1m2xuiE8.json
8. cybernetic-boost_itf1QdLVqIoXYB6n.json
9. da-big-shout_c7R2TrrJBPIEfV7q.json
10. discerning-eye_BsEcgVb9FRjBGl1I.json
11. electrical-succour_zxQ4YRpHz7D4h1wP.json
12. electro-graft-use_7HjlSLvysVdJc5EW.json
13. enhanced-bionic-frame_SHeI1PczPm72baVv.json
14. foresight_OJFzaZs0NhmI5ySC.json
15. greater-than-the-sum_eqmyBhAeNsYxU9yu.json

PROCESS FOR EACH TALENT:
1. Read the talent JSON file
2. Check if identifier is missing → add camelCase version
3. Read benefit text carefully
4. Identify ALL mechanical effects described
5. Encode skill bonuses in modifiers.skills
6. Encode narrative/special effects in grants.specialAbilities
7. Save the file with proper formatting

TRACKING:
After completing all talents, create a summary report at docs/copilot-batch-13-report.md listing:
- Talents audited: 15
- Identifiers added: X
- Mechanical effects encoded: X
- Issues found and fixed per talent" --yolo
