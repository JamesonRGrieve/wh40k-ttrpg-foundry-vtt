# Weapon Pack Cleanup - Quick Reference

**Full Plan**: See `WEAPON_PACK_CLEANUP_PLAN.md`

## Quick Facts

- **Total Weapons**: 1,093
- **Script**: `src/scripts/migrate-weapon-pack.mjs`
- **Estimated Runtime**: ~30 seconds
- **New Files Created**: ~150 (craftsmanship variants)
- **Files Modified**: 1,093 (all base weapons)

## Command Quick Reference

```bash
# 1. Dry run first (ALWAYS)
node src/scripts/migrate-weapon-pack.mjs --dry-run --verbose

# 2. Validate before migrating
node src/scripts/migrate-weapon-pack.mjs --validate

# 3. Phase by phase (recommended)
node src/scripts/migrate-weapon-pack.mjs --icons-only
node src/scripts/migrate-weapon-pack.mjs --two-handed
node src/scripts/migrate-weapon-pack.mjs --sources
node src/scripts/migrate-weapon-pack.mjs --craftsmanship

# 4. Full migration (all at once)
node src/scripts/migrate-weapon-pack.mjs

# 5. Restore from backup if needed
rm -rf src/packs/rt-items-weapons/_source/*
cp -r backups/weapons-{timestamp}/* src/packs/rt-items-weapons/_source/
```

## What Gets Changed

### 1. Icons (1,093 files)

- FROM: `"img": "icons/svg/sword.svg"`
- TO: `"img": "systems/rogue-trader/assets/icons/weapons/melee-chain.svg"`
- Logic: Based on class + type mapping

### 2. Craftsmanship (~150 NEW files)

- Creates variants: [Best Quality], [Master-Crafted], [Good], [Poor]
- Original common versions untouched
- New files with unique IDs

### 3. twoHanded (~600 files)

- Heavy weapons: false → true (128 weapons)
- Basic weapons (rifles): false → true (~260 weapons)
- Great melee weapons: false → true (~40 weapons)
- Pistols/thrown: remain false

### 4. Source (1,093 files)

- FROM: "Rogue Trader: Core", "DH 2E: Enemies Beyond", "ChatGPT"
- TO: "RT: Core Rulebook", "DH2: Enemies Beyond", "Homebrew"
- Standardized format: `{Abbrev}: {Title} p.{page}`

### 5. Proficiency → requiredTraining (1,093 files)

- FROM: `"proficiency": ""`
- TO: `"requiredTraining": ""`
- Simple field rename (all values currently empty)

## Icon Mapping Quick Lookup

| Class  | Type             | Icon               |
| ------ | ---------------- | ------------------ |
| melee  | chain            | melee-chain.svg    |
| melee  | power            | melee-power.svg    |
| pistol | las              | pistol-las.svg     |
| pistol | bolt             | pistol-bolt.svg    |
| basic  | las              | basic-lasgun.svg   |
| basic  | bolt             | basic-bolter.svg   |
| heavy  | solid-projectile | heavy-cannon.svg   |
| thrown | explosive        | thrown-grenade.svg |

**Full mapping**: See plan section 1

## Craftsmanship Lists Quick Lookup

**Best Quality (30)**:

- Bolter family (6): Godwyn, Storm Bolter, etc.
- Power weapons (8): Power Sword, Thunder Hammer, etc.
- Chain weapons (4): Chainsword, Chainaxe, etc.
- Las weapons (5): Laspistol Lucius, Lasgun Accatran, etc.
- Plasma weapons (3): Pistol, Gun, Cannon
- Special (4): Meltagun, Inferno Pistol, etc.

**Master-Crafted (15)**:

- Named/unique weapons: Almace's Last Conquest, Ascension, etc.
- Relic/Archeotech weapons (auto-detected by name)

**Good Quality (70)**:

- Standard military issue: Autoguns, Lasguns, Shotguns, etc.

**Poor Quality (35)**:

- Primitive weapons (15): Club, Knife, Bow, etc.
- Shoddy solid projectile (10): Stub Revolver, etc.
- Unreliable special (10): Poor Flamer, Poor Chainsword, etc.

**Full lists**: See plan appendix A

## twoHanded Detection Rules

```
✓ TRUE if class === 'heavy'
✓ TRUE if class === 'basic' AND not Astartes AND not flame
✓ TRUE if melee AND name contains: great/halberd/two-handed/eviscerator/thunder hammer
✗ FALSE if class === 'pistol'
✗ FALSE if class === 'thrown'
✗ FALSE if Astartes weapon (exception)
```

## Source Abbreviations

```
Rogue Trader / RT → RT
Dark Heresy 2E / DH 2E → DH2
Dark Heresy / DH → DH
Deathwatch / DW → DW
Only War / OW → OW
Black Crusade / BC → BC
ChatGPT → Homebrew
```

## Validation Checks (After Migration)

**Manual spot checks**:

- [ ] 10 random weapons have correct icon paths
- [ ] All 128 heavy weapons have twoHanded: true
- [ ] All 144 pistols have twoHanded: false
- [ ] 20 random weapons have standardized source format
- [ ] No weapons have "proficiency" field
- [ ] All weapons have "requiredTraining" field
- [ ] BEST quality variants exist (30 new files)
- [ ] Original common versions still exist

**Foundry load test**:

```bash
npm run build
# Launch Foundry
# Open Compendiums → RT Items (Weapons)
# Verify all weapons load without errors
```

## Rollback

```bash
# Restore from backup
rm -rf src/packs/rt-items-weapons/_source/*
cp -r backups/weapons-{timestamp}/* src/packs/rt-items-weapons/_source/
npm run build
```

## Success Criteria

✓ All 1,093 base weapons have appropriate icon paths
✓ ~150 craftsmanship variant files created
✓ ~600 weapons have twoHanded: true
✓ All weapons have standardized source format
✓ Zero weapons have "proficiency" field
✓ All weapons pass schema validation
✓ Foundry loads all weapons without errors
✓ Migration report shows zero critical errors
✓ Backup exists and is valid

## Common Issues & Solutions

**Issue**: Icon assets don't exist yet

- **Solution**: Paths are placeholders, assets can be added later

**Issue**: Astartes weapon twoHanded ambiguous

- **Solution**: Script defaults to one-handed (Astartes strength)

**Issue**: Some sources can't be parsed

- **Solution**: Script keeps original if can't standardize, logs warning

**Issue**: Craftsmanship variant already exists

- **Solution**: Script skips creation, logs warning

## Next Steps

1. Review full plan (`WEAPON_PACK_CLEANUP_PLAN.md`)
2. Write script implementation
3. Test with dry-run
4. Execute phased migration
5. Validate results
6. Commit to git
7. Close RogueTraderVTT-7jb
