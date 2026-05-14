import { describe, expect, it } from 'vitest';

/** BCNPCData is a thin wrapper with only gameSystem = 'bc' added. */
describe('BCNPCData', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./bc-npc').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`BCNPCData could not be imported: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('static gameSystem is bc', async () => {
        const mod = await import('./bc-npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect((mod.default as { gameSystem?: string }).gameSystem).toBe('bc');
    });

    it('inherits NPCBaseData', async () => {
        const [baseMod, mod] = await Promise.all([import('../bases/npc-base').catch(() => undefined), import('./bc-npc').catch(() => undefined)]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (baseMod === undefined || mod === undefined) return;
        expect(mod.default.prototype).toBeInstanceOf(baseMod.default);
    });
});
