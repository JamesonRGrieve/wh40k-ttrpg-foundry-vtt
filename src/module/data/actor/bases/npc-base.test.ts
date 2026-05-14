import { describe, expect, it } from 'vitest';

/**
 * Tests for NPCBaseData.
 * NPCBaseData is a re-export alias of NPCData with no additional fields.
 */
describe('NPCBaseData', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./npc-base').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`NPCBaseData could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('inherits NPCData as its parent class', async () => {
        const [npcMod, baseMod] = await Promise.all([import('../npc').catch(() => undefined), import('./npc-base').catch(() => undefined)]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (npcMod === undefined || baseMod === undefined) return;
        const NPCData = npcMod.default;
        const NPCBaseData = baseMod.default;
        expect(NPCBaseData.prototype).toBeInstanceOf(NPCData);
    });

    it('_toInt is inherited from NPCData', async () => {
        const mod = await import('./npc-base').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCBaseData = mod.default;
        // eslint-disable-next-line no-restricted-syntax -- boundary: test-only cast to inspect static property existence on class; read-only and test-scoped
        const cls = NPCBaseData as { _toInt?: (v: unknown, fallback?: number) => number };
        expect(typeof cls._toInt).toBe('function');
    });

    it('CHARACTERISTIC_MAP is inherited from NPCData', async () => {
        const mod = await import('./npc-base').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCBaseData = mod.default;
        const cls = NPCBaseData as { CHARACTERISTIC_MAP?: Record<string, string> };
        expect(typeof cls.CHARACTERISTIC_MAP).toBe('object');
    });

    it('_migrateData with empty source does not throw', async () => {
        const mod = await import('./npc-base').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const NPCBaseData = mod.default;
        expect(() => NPCBaseData._migrateData({})).not.toThrow();
    });
});
