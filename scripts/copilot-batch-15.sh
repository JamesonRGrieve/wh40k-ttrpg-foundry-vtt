#!/bin/bash
# Copilot Batch 15: Knowledge Talents Round 3/3 (14 talents)

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

Example 1: Information Recall
Benefit: '+20 to recall obscure information'
Fix:
\"grants\": {
  \"specialAbilities\": [{
    \"name\": \"Total Recall\",
    \"description\": \"<p>You gain +20 to Intelligence tests to recall obscure or forgotten information.</p>\"
  }]
}

Example 2: Xenology Bonus
Benefit: '+10 to all tests about xenos'
Fix:
\"modifiers\": {
  \"situational\": {
    \"skills\": [{
      \"key\": \"forbiddenLore\",
      \"value\": 10,
      \"condition\": \"When dealing with xenos subjects\",
      \"icon\": \"fa-solid fa-alien\"
    }]
  }
}

Example 3: Archive Access
Benefit: 'Access to extensive archives, halve research time'
Fix:
\"grants\": {
  \"specialAbilities\": [{
    \"name\": \"Archive Access\",
    \"description\": \"<p>You have access to extensive archives and databases. Halve the time required for research.</p>\"
  }]
}

TALENTS TO AUDIT (files in src/packs/rt-items-talents/_source/):
30. record-keeper_jsEb992gk3K2IbkI.json
31. redundant-systems-x_qtSnlukqGy4q9GNZ.json
32. servo-arm_Gw8ufdRk1Tp9ryH9.json
33. sorcerer_BiafeOjhNugVKBP0.json
34. steady-hand_7b6SJJa5RYTVjAp4.json
35. swarm-protocols_iCvtyA7FZDqSsUAl.json
36. swift-suture_zg9uakY8lflUZ6qi.json
37. tactical-flexibility_H7u4CMcAIJfzrVUc.json
38. technology-triumphant_m86NldPBD54u6hiZ.json
39. total-recall_5w4MtzbhmNP9VKbQ.json
40. vile-intrusion_Sv0DxQSQ7ZLiLCNi.json
41. vox-tech_MoRPLq1iKezJOjx8.json
42. walking-archive_UsE19sDkB8H9VNRw.json
43. xenosavant_tCUmtQi3K9LvKuiB.json

PROCESS FOR EACH TALENT:
1. Read the talent JSON file
2. Check if identifier is missing → add camelCase version
3. Read benefit text carefully
4. Identify ALL mechanical effects described
5. Encode skill bonuses in modifiers.skills
6. Encode narrative/special effects in grants.specialAbilities
7. Save the file with proper formatting

TRACKING:
After completing all talents, create a summary report at docs/copilot-batch-15-report.md listing:
- Talents audited: 14
- Identifiers added: X
- Mechanical effects encoded: X
- Issues found and fixed per talent" --yolo
