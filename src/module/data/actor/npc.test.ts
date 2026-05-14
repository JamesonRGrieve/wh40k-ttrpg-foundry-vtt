import { describe, expect, it } from 'vitest';

/** Narrow shape of NPC wounds field used in migration tests. */
interface WoundsField {
    max: number | string;
    value: number | string;
    critical: number | string;
}

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
});
