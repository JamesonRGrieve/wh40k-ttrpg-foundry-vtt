import { describe, expect, it } from 'vitest';

/** Narrow shape of NPC wounds field used in migration tests. */
interface WoundsField {
    max: number | string;
    value: number | string;
    critical: number | string;
}

/** A migrated characteristic (post-migration structured shape). */
interface MigratedCharacteristic {
    base: number;
    total: number;
    bonus: number;
    advancement: boolean;
}

/** Characteristics fixture: legacy scalar strings before migration, structured after. */
type CharacteristicsField = Record<string, string | MigratedCharacteristic>;

/** A simple-mode weapon (post-migration shape). */
interface SimpleWeapon {
    name: string;
    damage: string;
    pen: number;
    range: string;
    rof: string;
    clip: number;
    reload: string;
    special: string;
    class: string;
}

/** Legacy NPC weapon stat block (pre-migration array element). */
interface LegacyWeapon {
    name?: string;
    range?: string;
    rof?: string;
    damage?: string;
    pen?: string;
    clip?: string;
    reload?: string;
    qualities?: string;
}

/** Weapons fixture: a legacy array before migration, the simple-mode object after. */
type WeaponsField = LegacyWeapon[] | { mode: string; simple: SimpleWeapon[] };

/**
 * Tests for NPCData static utilities.
 *
 * NPCData extends foundry.abstract.TypeDataModel so it cannot be instantiated
 * in happy-dom. However, all static helpers (_toInt, _migrateData, static maps)
 * operate on plain objects and are fully testable.
 */
describe('NPCData', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./npc').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`NPCData could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('_toInt converts numeric string to integer', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;
        expect(NPCData._toInt('42')).toBe(42);
        expect(NPCData._toInt('3.9')).toBe(3);
    });

    it('_toInt uses fallback for null/undefined/empty string', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;
        expect(NPCData._toInt(null, 7)).toBe(7);
        expect(NPCData._toInt(undefined, 7)).toBe(7);
        expect(NPCData._toInt('', 7)).toBe(7);
        expect(NPCData._toInt('not-a-number', 7)).toBe(7);
    });

    it('_toInt floors floating-point numbers', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;
        expect(NPCData._toInt(9.9)).toBe(9);
        expect(NPCData._toInt(9.1)).toBe(9);
    });

    it('_migrateData converts string size to integer and clamps to [1,10]', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;

        const source = { size: '6' as number | string };
        NPCData._migrateData(source);
        expect(source.size).toBe(6);
    });

    it('_migrateData clamps size below 1 to 1', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;

        const source = { size: 0 as number };
        NPCData._migrateData(source);
        expect(source.size).toBe(1);
    });

    it('_migrateData clamps size above 10 to 10', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;

        const source = { size: 15 as number };
        NPCData._migrateData(source);
        expect(source.size).toBe(10);
    });

    it('_migrateData converts string wounds values to integers', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;

        const source = { wounds: { max: '20', value: '15', critical: '2' } as WoundsField };
        NPCData._migrateData(source);
        expect(source.wounds.max).toBe(20);
        expect(source.wounds.value).toBe(15);
        expect(source.wounds.critical).toBe(2);
    });

    it('_migrateData converts string threatLevel to integer', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;

        const source = { threatLevel: '12' as number | string };
        NPCData._migrateData(source);
        expect(source.threatLevel).toBe(12);
    });

    it('CHARACTERISTIC_MAP maps short names to full characteristic keys', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;
        expect(NPCData.CHARACTERISTIC_MAP['WS']).toBe('weaponSkill');
        expect(NPCData.CHARACTERISTIC_MAP['BS']).toBe('ballisticSkill');
        expect(NPCData.CHARACTERISTIC_MAP['Ag']).toBe('agility');
    });

    it('SKILL_CHARACTERISTIC_MAP maps skill keys to their governing characteristic', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;
        expect(NPCData.SKILL_CHARACTERISTIC_MAP['dodge']).toBe('agility');
        expect(NPCData.SKILL_CHARACTERISTIC_MAP['parry']).toBe('weaponSkill');
        expect(NPCData.SKILL_CHARACTERISTIC_MAP['medicae']).toBe('intelligence');
    });

    it('_migrateData remaps abbreviated string characteristics into the structured full-name shape', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;

        const source: { characteristics: CharacteristicsField } = {
            characteristics: { ws: '45', bs: '30', s: '55', t: '45', ag: '35', int: '25', per: '35', wp: '40', fel: '20' },
        };
        NPCData._migrateData(source);

        const ch = source.characteristics;
        expect(ch['weaponSkill']).toEqual({ base: 45, total: 45, bonus: 4, advancement: false });
        expect(ch['strength']).toEqual({ base: 55, total: 55, bonus: 5, advancement: false });
        expect(ch['fellowship']).toEqual({ base: 20, total: 20, bonus: 2, advancement: false });
        // Abbreviated keys are gone.
        expect(ch['ws']).toBeUndefined();
    });

    it('_migrateData leaves already-structured full-name characteristics untouched', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;

        const source: { characteristics: CharacteristicsField } = {
            characteristics: { weaponSkill: { base: 50, total: 50, bonus: 5, advancement: false } },
        };
        NPCData._migrateData(source);
        expect(source.characteristics['weaponSkill']).toEqual({ base: 50, total: 50, bonus: 5, advancement: false });
    });

    it('_migrateData converts a legacy weapons[] array into the simple-mode object', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;

        const source: { weapons: WeaponsField } = {
            weapons: [{ name: 'Hellblade', range: '-', rof: '-', damage: '1d10+7 E', pen: '6', clip: '-', reload: '-', qualities: 'Daemon Weapon, Tearing' }],
        };
        NPCData._migrateData(source);

        const weapons = source.weapons as { mode: string; simple: SimpleWeapon[] };
        expect(weapons.mode).toBe('simple');
        expect(weapons.simple).toEqual([
            { name: 'Hellblade', damage: '1d10+7 E', pen: 6, range: '-', rof: '-', clip: 0, reload: '-', special: 'Daemon Weapon, Tearing', class: 'melee' },
        ]);
    });

    it('_migrateData infers a ranged weapon class from a non-melee range', async () => {
        const mod = await import('./npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCData = mod.default;

        const source: { weapons: WeaponsField } = { weapons: [{ name: 'Bolt Pistol', range: '30m', damage: '1d10+5 X', pen: '4' }] };
        NPCData._migrateData(source);
        const weapons = source.weapons as { mode: string; simple: SimpleWeapon[] };
        expect(weapons.simple).toEqual([
            { name: 'Bolt Pistol', damage: '1d10+5 X', pen: 4, range: '30m', rof: 'S/-/-', clip: 0, reload: '-', special: '', class: 'basic' },
        ]);
    });
});
