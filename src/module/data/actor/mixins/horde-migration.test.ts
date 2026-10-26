/**
 * The horde source migration is partial-safe (#699).
 *
 * Foundry migrates every partial update diff, not only stored documents. The
 * old migration filled in whatever a diff lacked. A magnitude hit, whose diff
 * carries only `current`, reset the horde's maximum to 30. Any other NPC edit,
 * whose diff carries no horde at all, replaced the horde with a disabled
 * 30/30 default.
 */
import { describe, expect, it } from 'vitest';
import { type MigrationSource, migrateHordeSource } from './horde-migration.ts';

function migrated(source: MigrationSource): MigrationSource {
    migrateHordeSource(source);
    return source;
}

describe('migrateHordeSource (#699)', () => {
    it('leaves a diff with no horde without one', () => {
        expect(migrated({ threatLevel: 7 })).toEqual({ threatLevel: 7 });
    });

    it('leaves the maximum alone on a diff that carries only the current Magnitude', () => {
        expect(migrated({ horde: { magnitude: { current: 89 } } })).toEqual({ horde: { magnitude: { current: 89 } } });
    });

    it('leaves the current Magnitude alone on a diff that carries only the maximum', () => {
        expect(migrated({ horde: { magnitude: { max: 90 } } })).toEqual({ horde: { magnitude: { max: 90 } } });
    });

    it('keeps a destroyed horde at Magnitude 0', () => {
        expect(migrated({ horde: { magnitude: { max: 90, current: 0 } } })).toEqual({ horde: { magnitude: { max: 90, current: 0 } } });
    });

    it('coerces stored string bounds to integers', () => {
        expect(migrated({ horde: { magnitude: { max: '60', current: '45.7' } } })).toEqual({ horde: { magnitude: { max: 60, current: 45 } } });
    });

    it('falls back to 30 only for a bound that cannot be read', () => {
        expect(migrated({ horde: { magnitude: { max: 'lots', current: 12 } } })).toEqual({ horde: { magnitude: { max: 30, current: 12 } } });
    });

    it('drops a null horde so the schema initial fills it', () => {
        expect(migrated({ horde: null })).toEqual({});
    });

    it('leaves a horde diff with no magnitude untouched', () => {
        expect(migrated({ horde: { enabled: true } })).toEqual({ horde: { enabled: true } });
    });
});
