#!/bin/bash
# Copilot Batch 18: Origin Talents - Complete Category

copilot -p "You are auditing ALL Rogue Trader VTT ORIGIN talent pack data files in one comprehensive session.

DOCUMENTATION TO READ FIRST:
1. Read docs/TALENT_TEMPLATE.json
2. Read docs/TALENT_AUDIT_CHECKLIST.md
3. Read docs/TALENT_COMMON_ISSUES.md

YOUR TASK:
Audit and fix ALL talents in src/packs/rt-items-talents/_source/ with category='origin' (approximately 93 talents).

CRITICAL RULES:
- Add 'identifier' field (camelCase) if missing
- Add complete modifiers/grants objects if missing
- Encode ALL mechanical effects from benefit text
- Normalize characteristic keys
- Origin talents should have tier=0
- Add situational modifiers with: key, value, condition, icon

ORIGIN TALENT PATTERNS:
- Background/homeworld benefits
- Starting bonuses (characteristics, skills)
- Special origin abilities
- Environmental adaptations
- Use modifiers for stat/skill bonuses
- Use grants.specialAbilities for origin-specific abilities
- Set tier: 0 for origin talents

PROCESS:
1. Find all JSON files with \"category\": \"origin\"
2. For each file:
   - Add identifier if missing
   - Ensure tier: 0
   - Read benefit text
   - Encode ALL mechanical effects
   - Add complete structure
3. Create comprehensive report

TRACKING:
Create detailed report at docs/copilot-batch-18-origin-report.md with:
- Total talents audited
- Identifiers added
- Mechanical effects encoded
- Summary of fixes per talent" --yolo
