# Phase 4 Migration Report

**Date:** 2026-01-13T02:00:16.751Z
**Script:** migrate-origin-paths-phase4.mjs

---

## Summary

| Metric | Count |
|--------|-------|
| **Total Origins Processed** | 63 |
| **effectText Migrated** | 0 |
| **Legacy Fields Standardized** | 0 |
| **Navigation Data Generated** | 0 |
| **Choices Validated** | 47 |
| **Warnings** | 8 |
| **Issues** | 0 |

---

## Warnings (8)

### Choice Warnings

- **Crusade:** Choice "Choose one Crusade path" option "Chasing the Enemy (150 XP)" has no grants defined
- **Hunter:** Choice "Choose one Hunter path" option "Xenos Hunter (200 XP)" has no grants defined
- **In Service to the Throne:** Choice "Choose one Service to the Throne path" option "Tithed (350 XP)" has no grants defined
- **Knowledge:** Choice "Choose one Knowledge path" option "Know Thy Foe (200 XP)" has no grants defined
- **New Horizons:** Choice "Choose one New Horizons path" option "Xeno-Arcanist (200 XP)" has no grants defined
- **Pride:** Choice "Choose Heirloom or Toughness" option "Heirloom Item (roll 1d100)" has no grants defined
- **The Hand of War:** Choice "The Ashes of War: Choose one Weapon Training or Leap Up" option "One Weapon Training Talent of your choice" has no grants defined

### Choice-uuid Warnings

- **Fringe Survivor:** Choice "Choose one Fringe Survivor path" → "Pit-Fighter (200 XP)" → trait "Rival (Underworld)" missing UUID

---

## Next Steps

1. Review warnings and issues above
2. Fix any critical issues manually
3. Rebuild compendia: `npm run build`
4. Test in Foundry with Origin Path Builder
5. Run validation scripts:
   - `node src/scripts/validate-origin-uuids.mjs`
   - `node src/scripts/audit-origins.mjs`

