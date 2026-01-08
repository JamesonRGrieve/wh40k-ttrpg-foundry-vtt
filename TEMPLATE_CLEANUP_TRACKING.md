# Template Cleanup Tracking

**Started:** 2026-01-08  
**Purpose:** Remove obsolete pre-V2 migration templates and panels  
**Goal:** Clean up codebase, reduce confusion, improve maintainability

---

## Current State

**Total Templates:** 124 .hbs files  
**Panel Directory:** 58 panel files in `src/templates/actor/panel/`  
**Old Actor Sheets:** 4 monolithic templates (actor-rt-sheet.hbs, actor-npc-sheet.hbs, actor-starship-sheet.hbs, actor-vehicle-sheet.hbs)  
**New V2 Structure:** `src/templates/actor/acolyte/` directory with 12 PARTS templates  

---

## Sheet Migration Status

### ✅ Fully Migrated to V2 PARTS System
- **AcolyteSheet** - Uses `acolyte/` directory with 10 template parts
  - Uses V2 panels: wounds-panel-v2.hbs, fatigue-panel-v2.hbs, corruption-panel-v2.hbs, insanity-panel-v2.hbs, fate-panel-v2.hbs

### ⚠️ Still Using Monolithic Templates
- **NpcSheet** - Uses `actor-npc-sheet.hbs` (9,462 bytes)
  - Uses OLD panels: wounds-panel.hbs, fatigue-panel.hbs, fate-panel.hbs
- **StarshipSheet** - Uses `actor-starship-sheet.hbs` (16,190 bytes)
- **VehicleSheet** - Uses `actor-vehicle-sheet.hbs` (4,609 bytes)

### ❌ Obsolete Template
- **actor-rt-sheet.hbs** - 32,840 bytes - OLD acolyte sheet, NOT USED ANYMORE
  - No references found in application code
  - **STATUS: SAFE TO DELETE**

---

## Panel Inventory

### V2 Panels (Modern - Keep)
| File | Used By | Status |
|------|---------|--------|
| `wounds-panel-v2.hbs` | AcolyteSheet (tab-overview) | ✅ KEEP |
| `fatigue-panel-v2.hbs` | AcolyteSheet (tab-overview) | ✅ KEEP |
| `corruption-panel-v2.hbs` | AcolyteSheet (tab-overview) | ✅ KEEP |
| `insanity-panel-v2.hbs` | AcolyteSheet (tab-overview) | ✅ KEEP |
| `fate-panel-v2.hbs` | AcolyteSheet (tab-overview) | ✅ KEEP |
| `combat-station-panel.hbs` | AcolyteSheet (tab-combat) | ✅ KEEP |
| `loadout-equipment-panel.hbs` | AcolyteSheet (tab-equipment) | ✅ KEEP |

### V1 Panels (Legacy - Evaluate)
| File | Used By | V2 Equivalent | Decision |
|------|---------|---------------|----------|
| `wounds-panel.hbs` | NpcSheet, actor-rt-sheet | wounds-panel-v2.hbs | 🔄 MIGRATE NPC, DELETE |
| `fatigue-panel.hbs` | NpcSheet, actor-rt-sheet | fatigue-panel-v2.hbs | 🔄 MIGRATE NPC, DELETE |
| `corruption-panel.hbs` | actor-rt-sheet | corruption-panel-v2.hbs | ⚠️ DELETE (unused) |
| `insanity-panel.hbs` | actor-rt-sheet | insanity-panel-v2.hbs | ⚠️ DELETE (unused) |
| `fate-panel.hbs` | NpcSheet, actor-rt-sheet | fate-panel-v2.hbs | 🔄 MIGRATE NPC, DELETE |

### Shared Panels (Keep)
| File | Used By | Status |
|------|---------|--------|
| `active-effects-panel.hbs` | Acolyte, NPC, actor-rt | ✅ KEEP |
| `skills-panel.hbs` | Acolyte, NPC, actor-rt | ✅ KEEP |
| `skills-specialist-panel.hbs` | Acolyte, NPC, actor-rt | ✅ KEEP |
| `talent-panel.hbs` | Acolyte, NPC, actor-rt | ✅ KEEP |
| `trait-panel.hbs` | Acolyte, NPC, Vehicle, actor-rt | ✅ KEEP |
| `weapon-panel.hbs` | NPC, Vehicle | ✅ KEEP |
| `characteristic-panel.hbs` | NPC | ✅ KEEP |
| `armour-display-panel.hbs` | NPC | ✅ KEEP |
| `armour-panel.hbs` | NPC | ✅ KEEP |
| `movement-panel.hbs` | NPC | ✅ KEEP |
| `encumbrance-panel.hbs` | NPC | ✅ KEEP |
| `psy-panel.hbs` | Acolyte, NPC, actor-rt | ✅ KEEP |
| `psychic-powers-panel.hbs` | Acolyte, NPC, actor-rt | ✅ KEEP |
| `navigator-powers-panel.hbs` | Acolyte, NPC, actor-rt | ✅ KEEP |
| `orders-panel.hbs` | Acolyte, actor-rt | ✅ KEEP |
| `rituals-panel.hbs` | Acolyte, actor-rt | ✅ KEEP |
| `journal-panel.hbs` | Acolyte (biography) | ✅ KEEP |
| `acquisitions-panel.hbs` | Acolyte (dynasty) | ✅ KEEP |
| `ship-role-panel.hbs` | Acolyte (dynasty) | ✅ KEEP |
| `bonuses-panel.hbs` | NPC | ✅ KEEP |
| `combat-controls-panel.hbs` | NPC | ✅ KEEP |

### Starship Panels (Keep)
| File | Used By | Status |
|------|---------|--------|
| `ship-components-panel.hbs` | StarshipSheet | ✅ KEEP |
| `ship-upgrades-panel.hbs` | StarshipSheet | ✅ KEEP |
| `ship-weapons-panel.hbs` | StarshipSheet | ✅ KEEP |
| `ship-crew-panel.hbs` | StarshipSheet | ✅ KEEP |

### Vehicle Panels (Keep)
| File | Used By | Status |
|------|---------|--------|
| `vehicle-armour-panel.hbs` | VehicleSheet | ✅ KEEP |
| `vehicle-integrity-panel.hbs` | VehicleSheet | ✅ KEEP |
| `vehicle-movement-panel.hbs` | VehicleSheet | ✅ KEEP |
| `vehicle-upgrades-panel.hbs` | VehicleSheet | ✅ KEEP |

### Unused Panels (Delete)
| File | Last Used By | Reason | Status |
|------|--------------|--------|--------|
| `aptitude-panel.hbs` | Unknown | No references found | ❌ DELETE |
| `backpack-panel.hbs` | NPC (legacy) | Replaced by loadout-equipment | ❌ DELETE |
| `biography-panel.hbs` | Unknown | Replaced by journal-panel | ❌ DELETE |
| `characteristic-roller-panel.hbs` | NPC | Redundant with characteristic-panel | ❌ DELETE |
| `cybernetic-panel.hbs` | Unknown | Integrated into equipment tab | ❌ DELETE |
| `enemy-panel.hbs` | Unknown | Not implemented | ❌ DELETE |
| `experience-panel.hbs` | Unknown | Integrated into overview | ❌ DELETE |
| `force-field-panel.hbs` | Unknown | Integrated into equipment tab | ❌ DELETE |
| `gear-panel.hbs` | NPC (legacy) | Replaced by loadout-equipment | ❌ DELETE |
| `initiative-panel.hbs` | Unknown | Integrated into combat station | ❌ DELETE |
| `origin-path-panel.hbs` | Unknown | Integrated into biography tab | ❌ DELETE |
| `peer-panel.hbs` | Unknown | Not implemented | ❌ DELETE |
| `profit-factor-panel.hbs` | Unknown | Integrated into dynasty tab | ❌ DELETE |
| `rogue-trader-panel.hbs` | Unknown | Obsolete/unused | ❌ DELETE |
| `storage-location-panel.hbs` | NPC (legacy) | Replaced by loadout-equipment | ❌ DELETE |

---

## Deletion Plan

### Phase 1: Immediate Deletions (No Dependencies)
1. ✅ `actor-rt-sheet.hbs` - Old acolyte sheet, replaced by acolyte/ directory
2. ✅ `corruption-panel.hbs` - Only used by actor-rt-sheet (deleted)
3. ✅ `insanity-panel.hbs` - Only used by actor-rt-sheet (deleted)
4. ✅ `aptitude-panel.hbs` - No references found
5. ✅ `biography-panel.hbs` - Replaced by journal-panel
6. ✅ `cybernetic-panel.hbs` - Integrated into equipment
7. ✅ `enemy-panel.hbs` - Not implemented
8. ✅ `experience-panel.hbs` - Integrated into overview
9. ✅ `force-field-panel.hbs` - Integrated into equipment
10. ✅ `initiative-panel.hbs` - Integrated into combat station
11. ✅ `origin-path-panel.hbs` - Integrated into biography
12. ✅ `peer-panel.hbs` - Not implemented
13. ✅ `profit-factor-panel.hbs` - Integrated into dynasty
14. ✅ `rogue-trader-panel.hbs` - Obsolete
15. ✅ Empty directories: `tabs/`, `parts/`

### Phase 2: After NPC Migration (Future)
1. 🔄 `wounds-panel.hbs` - After NPC migrates to V2
2. 🔄 `fatigue-panel.hbs` - After NPC migrates to V2
3. 🔄 `fate-panel.hbs` - After NPC migrates to V2
4. 🔄 `characteristic-roller-panel.hbs` - After NPC refactor
5. 🔄 `backpack-panel.hbs` - After NPC uses loadout-equipment
6. 🔄 `gear-panel.hbs` - After NPC uses loadout-equipment
7. 🔄 `storage-location-panel.hbs` - After NPC uses loadout-equipment

---

## Progress Checklist

### Session 1 (2026-01-08)
- [x] Create tracking document
- [x] Audit all template files
- [x] Identify obsolete templates
- [ ] Delete actor-rt-sheet.hbs
- [ ] Delete unused panel files (Phase 1: 14 files)
- [ ] Delete empty directories (tabs/, parts/)
- [ ] Verify build still works
- [ ] Update AGENTS.md with new counts

### Session 2 (Future)
- [ ] Migrate NpcSheet to V2 PARTS system
- [ ] Create npc/ directory with PARTS templates
- [ ] Update NPC to use V2 panels
- [ ] Delete legacy NPC panels (Phase 2: 7 files)
- [ ] Update NpcSheet .mjs to reference new templates

### Session 3 (Future)
- [ ] Migrate StarshipSheet to V2 PARTS system
- [ ] Migrate VehicleSheet to V2 PARTS system
- [ ] Consider if more panels can be consolidated
- [ ] Final cleanup and documentation update

---

## File Counts

### Before Cleanup
- **Total Templates:** 124
- **Panel Files:** 58
- **Actor Sheet Templates:** 4 monolithic + 1 directory (acolyte/)

### After Phase 1 (Target)
- **Total Templates:** ~109 (-15)
- **Panel Files:** ~43 (-15)
- **Actor Sheet Templates:** 3 monolithic + 1 directory

### After All Phases (Goal)
- **Total Templates:** ~100 (-24)
- **Panel Files:** ~36 (-22)
- **Actor Sheet Templates:** 4 directories (acolyte/, npc/, starship/, vehicle/)

---

## Notes

- **DO NOT** delete any panel that is still referenced by NPC/Starship/Vehicle sheets
- **DO NOT** delete shared panels used across multiple sheets
- Always grep for references before deletion
- Update AGENTS.md after each cleanup session
- Test build after deletions to ensure no broken imports

---

## Risk Assessment

**Low Risk Deletions (Phase 1):**
- actor-rt-sheet.hbs - Confirmed unused by grep
- Unused panels with no references
- Empty directories

**Medium Risk (Phase 2):**
- Legacy panels after NPC migration - requires testing

**High Risk (Never Delete):**
- Shared panels used by multiple sheets
- V2 panels actively used by AcolyteSheet
- Starship/Vehicle specific panels

---

## Related Documents
- `AGENTS.md` - System architecture documentation
- `APPLICATIONV2_PROGRESS.md` - V2 migration status
- `resources/RogueTraderInfo.md` - Game rules reference
