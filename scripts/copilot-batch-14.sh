#!/bin/bash
# Copilot Batch 14: Knowledge Talents Round 2/3 (14 talents)

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

Example 1: Tech Skill Bonus
Benefit: '+10 to Tech-Use'
Fix:
\"modifiers\": {
  \"skills\": {
    \"techUse\": 10
  }
}

Example 2: Medicae Talent
Benefit: '+20 to Medicae tests for first aid'
Fix:
\"modifiers\": {
  \"situational\": {
    \"skills\": [{
      \"key\": \"medicae\",
      \"value\": 20,
      \"condition\": \"When performing first aid\",
      \"icon\": \"fa-solid fa-kit-medical\"
    }]
  }
}

Example 3: Master Level Talent
Benefit: 'Counts as having all tech-related talents'
Fix:
\"grants\": {
  \"specialAbilities\": [{
    \"name\": \"Master Technician\",
    \"description\": \"<p>You are considered to have all basic tech-related talents for prerequisite purposes.</p>\"
  }]
}

TALENTS TO AUDIT (files in src/packs/rt-items-talents/_source/):
16. gun-blessing_XU2M66YYPGZEb9nC.json
17. infused-knowledge_BMLdA7wkzU4GbZSW.json
18. logis-implant_CSp8aV5M5I41Eiem.json
19. master-enginseer_4AlXLDCNmFZum9xb.json
20. master-of-technology_Exeo1m51PBEiHYOS.json
21. master-sorcerer_iyJTAmxA9PnM1Fsi.json
22. mastery-x_EU1QWSTsts6IUayp.json
23. medicae-auxilia_BjciCFFMejqLX04A.json
24. new-allies_XrkacpLC3EKCBCos.json
25. perfected-maintenance_UKXSwR7gqdtirScn.json
26. physical-perfection-x_KHHXDMarJ7q80dkZ.json
27. polyglot_AWVKxR6VVlA7ki02.json
28. psychic-awakening_4wGeZPRHpVjagrDs.json
29. psychic-technique-x_VIvtJC7n8kDDhjQP.json

PROCESS FOR EACH TALENT:
1. Read the talent JSON file
2. Check if identifier is missing → add camelCase version
3. Read benefit text carefully
4. Identify ALL mechanical effects described
5. Encode skill bonuses in modifiers.skills
6. Encode narrative/special effects in grants.specialAbilities
7. Save the file with proper formatting

TRACKING:
After completing all talents, create a summary report at docs/copilot-batch-14-report.md listing:
- Talents audited: 14
- Identifiers added: X
- Mechanical effects encoded: X
- Issues found and fixed per talent" --yolo
