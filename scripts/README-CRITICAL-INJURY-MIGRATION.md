# Critical Injury Migration

This directory contains the migration script used to consolidate the critical injury compendium from 160 individual items to 16 multi-severity items.

## Overview

**Date**: January 21, 2026
**Status**: ✅ COMPLETE

### Changes Summary

-   **Before**: 160 items (4 damage types × 4 body parts × 10 severities)
-   **After**: 16 items (4 damage types × 4 body parts, each containing all 10 severities)
-   **Reduction**: 90% fewer items in compendium

### Schema Changes

The `CriticalInjuryData` model was updated to support both legacy and consolidated formats:

```javascript
{
  severity: 1,              // Current active severity
  effect: "",               // LEGACY: Single effect text (deprecated)
  permanent: false,         // LEGACY: Permanent flag (deprecated)
  effects: {                // NEW: All severity levels
    "1": { text: "...", permanent: false },
    "2": { text: "...", permanent: false },
    // ... up to 10
  }
}
```

## Migration Script

### Usage

```bash
# Preview changes (dry-run)
node scripts/migrate-critical-injuries.mjs --dry-run

# Run migration (modifies files)
node scripts/migrate-critical-injuries.mjs
```

### What It Does

1. Reads all 160 JSON files from `src/packs/rt-items-critical-injuries/_source/`
2. Groups items by `damageType-bodyPart` combination (16 groups)
3. Creates consolidated item for each group with `effects` object containing all 10 severities
4. Validates all combinations present and complete
5. Writes 16 new consolidated JSON files
6. Deletes 160 original files

### Backup

A backup was created before migration:

```bash
backups/critical-injuries-backup-20260121-185202.tar.gz
```

To restore from backup:

```bash
cd src/packs/rt-items-critical-injuries/_source/
rm *.json
tar -xzf ../../../../backups/critical-injuries-backup-20260121-185202.tar.gz --strip-components=4
```

## Files Modified

1. **Schema**: `src/module/data/item/critical-injury.mjs`

    - Added `effects` field for multi-severity storage
    - Added computed properties: `isConsolidated`, `currentEffect`, `isPermanent`, `availableSeverities`
    - Maintained backward compatibility with legacy format

2. **Sheet**: `src/module/applications/item/critical-injury-sheet.mjs`

    - Added `changeSeverity` action handler for live severity updates
    - Updated context preparation for consolidated format

3. **Template**: `src/templates/item/item-critical-injury-sheet-v2.hbs`

    - Updated to display current severity effect
    - Edit mode shows all 10 effect editors for consolidated items
    - Severity slider triggers live effect updates

4. **Pack Source**: `src/packs/rt-items-critical-injuries/_source/`
    - Consolidated 160 JSON files → 16 JSON files

## Testing Checklist

-   [ ] Open critical injury from compendium
-   [ ] Verify sheet displays correct severity effect
-   [ ] Move severity slider - verify effect updates
-   [ ] Enter edit mode - verify all 10 effects editable
-   [ ] Apply injury to character
-   [ ] Verify chat message displays correct effect
-   [ ] Verify permanent injuries marked correctly
-   [ ] Test with different damage types and body parts

## Rollback Plan

If issues are found:

1. Restore backup:

    ```bash
    cd src/packs/rt-items-critical-injuries/_source/
    rm *.json
    tar -xzf ../../../../backups/critical-injuries-backup-20260121-185202.tar.gz --strip-components=4
    ```

2. Rebuild pack:

    ```bash
    npm run packs
    ```

3. Revert code changes:
    ```bash
    git restore src/module/data/item/critical-injury.mjs
    git restore src/module/applications/item/critical-injury-sheet.mjs
    git restore src/templates/item/item-critical-injury-sheet-v2.hbs
    ```

## Notes

-   Migration script is idempotent - running multiple times produces same result
-   Legacy items (using `effect` field) will continue to work due to backward compatibility
-   The in-game migration utility (`src/module/utils/critical-injury-migration.mjs`) can be used to migrate compendiums within a running Foundry world, but it's recommended to use the Node script for clean migrations
