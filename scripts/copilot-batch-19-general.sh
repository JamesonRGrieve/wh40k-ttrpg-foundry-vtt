#!/bin/bash
# Copilot Batch 19: General Talents - Complete Category

copilot -p "You are auditing ALL Rogue Trader VTT GENERAL talent pack data files in one comprehensive session.

DOCUMENTATION TO READ FIRST:
1. Read docs/TALENT_TEMPLATE.json
2. Read docs/TALENT_AUDIT_CHECKLIST.md
3. Read docs/TALENT_COMMON_ISSUES.md

YOUR TASK:
Audit and fix ALL talents in src/packs/rt-items-talents/_source/ with category='general' (approximately 93 talents).

CRITICAL RULES:
- Add 'identifier' field (camelCase) if missing
- Add complete modifiers/grants objects if missing
- Encode ALL mechanical effects from benefit text
- Normalize characteristic keys
- Add situational modifiers with: key, value, condition, icon

GENERAL TALENT PATTERNS:
- Varied effects (catch-all category)
- May include movement, survival, social, combat
- Characteristic bonuses
- Skill bonuses
- Special abilities
- Use appropriate modifiers based on effect type
- Use grants.specialAbilities for unique effects

PROCESS:
1. Find all JSON files with \"category\": \"general\"
2. For each file:
   - Add identifier if missing
   - Read benefit text carefully
   - Encode ALL mechanical effects
   - Add complete structure
3. Create comprehensive report

TRACKING:
Create detailed report at docs/copilot-batch-19-general-report.md with:
- Total talents audited
- Identifiers added
- Mechanical effects encoded
- Summary of fixes per talent" --yolo
