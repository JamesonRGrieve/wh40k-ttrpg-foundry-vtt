#!/bin/bash
# Copilot Batch 16: Social Talents - Complete Category

copilot -p "You are auditing ALL Rogue Trader VTT SOCIAL talent pack data files in one comprehensive session.

DOCUMENTATION TO READ FIRST:
1. Read docs/TALENT_TEMPLATE.json
2. Read docs/TALENT_AUDIT_CHECKLIST.md
3. Read docs/TALENT_COMMON_ISSUES.md

YOUR TASK:
Audit and fix ALL talents in src/packs/rt-items-talents/_source/ with category='social' (approximately 66 talents).

CRITICAL RULES:
- Add 'identifier' field (camelCase) if missing
- Add complete modifiers/grants objects if missing
- Encode ALL mechanical effects from benefit text
- Normalize characteristic keys
- Add situational modifiers with: key, value, condition, icon

SOCIAL TALENT PATTERNS:
- Fellowship skill bonuses
- Charm, Deceive, Command bonuses
- Influence/reputation effects
- Social interaction bonuses
- Use modifiers.skills for bonuses
- Use modifiers.situational for conditional social bonuses
- Use grants.specialAbilities for reputation/influence effects

PROCESS:
1. Find all JSON files with \"category\": \"social\"
2. For each file:
   - Add identifier if missing
   - Read benefit text
   - Encode ALL mechanical effects
   - Add complete structure
3. Create comprehensive report

TRACKING:
Create detailed report at docs/copilot-batch-16-social-report.md with:
- Total talents audited
- Identifiers added
- Mechanical effects encoded
- Summary of fixes per talent" --yolo
