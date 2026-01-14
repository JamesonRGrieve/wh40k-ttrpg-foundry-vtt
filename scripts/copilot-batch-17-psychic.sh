#!/bin/bash
# Copilot Batch 17: Psychic Talents - Complete Category

copilot -p "You are auditing ALL Rogue Trader VTT PSYCHIC talent pack data files in one comprehensive session.

DOCUMENTATION TO READ FIRST:
1. Read docs/TALENT_TEMPLATE.json
2. Read docs/TALENT_AUDIT_CHECKLIST.md
3. Read docs/TALENT_COMMON_ISSUES.md

YOUR TASK:
Audit and fix ALL talents in src/packs/rt-items-talents/_source/ with category='psychic' (approximately 79 talents).

CRITICAL RULES:
- Add 'identifier' field (camelCase) if missing
- Add complete modifiers/grants objects if missing
- Encode ALL mechanical effects from benefit text
- Normalize characteristic keys
- Add situational modifiers with: key, value, condition, icon

PSYCHIC TALENT PATTERNS:
- Willpower bonuses
- Psy Rating modifications
- Psychic power effects
- Manifestation bonuses
- Perils of the Warp modifications
- Use modifiers.characteristics for WP bonuses
- Use modifiers.other for Psy Rating changes
- Use grants.specialAbilities for complex psychic effects

PROCESS:
1. Find all JSON files with \"category\": \"psychic\"
2. For each file:
   - Add identifier if missing
   - Read benefit text
   - Encode ALL mechanical effects (especially psychic-specific ones)
   - Add complete structure
3. Create comprehensive report

TRACKING:
Create detailed report at docs/copilot-batch-17-psychic-report.md with:
- Total talents audited
- Identifiers added
- Mechanical effects encoded
- Summary of fixes per talent" --yolo
