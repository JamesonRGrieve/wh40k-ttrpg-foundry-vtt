#!/bin/bash
# Copilot Batch 20: Small Categories - All Remaining

copilot -p "You are auditing ALL remaining Rogue Trader VTT talent pack data files across multiple small categories in one comprehensive session.

DOCUMENTATION TO READ FIRST:
1. Read docs/TALENT_TEMPLATE.json
2. Read docs/TALENT_AUDIT_CHECKLIST.md
3. Read docs/TALENT_COMMON_ISSUES.md

YOUR TASK:
Audit and fix ALL talents in src/packs/rt-items-talents/_source/ with the following categories:
- category='leadership' (~16 talents)
- category='defense' (~12 talents)
- category='tech' (~12 talents)
- category='career' (~8 talents)
- category='technical' (~7 talents)
- category='movement' (~3 talents)
- category='unique' (~2 talents)
- category='willpower' (~2 talents)

TOTAL: Approximately 62 talents across 8 small categories

CRITICAL RULES:
- Add 'identifier' field (camelCase) if missing
- Add complete modifiers/grants objects if missing
- Encode ALL mechanical effects from benefit text
- Normalize characteristic keys
- Add situational modifiers with: key, value, condition, icon

CATEGORY-SPECIFIC PATTERNS:
- Leadership: Fellowship bonuses, command bonuses, squad effects
- Defense: Dodge/parry bonuses, armor bonuses, defensive abilities
- Tech: Tech-Use bonuses, repair bonuses, technical abilities
- Career: Career-specific bonuses (Rogue Trader, Navigator, etc.)
- Technical: Technical skill bonuses
- Movement: Speed bonuses, movement abilities
- Unique: Special/unique effects
- Willpower: Willpower characteristic bonuses, mental resistance

PROCESS:
1. Find all JSON files matching any of the above categories
2. For each file:
   - Add identifier if missing
   - Read benefit text
   - Encode ALL mechanical effects appropriate to category
   - Add complete structure
3. Create comprehensive report organized by category

TRACKING:
Create detailed report at docs/copilot-batch-20-small-categories-report.md with:
- Total talents audited per category
- Identifiers added
- Mechanical effects encoded
- Summary of fixes per category and talent" --yolo
