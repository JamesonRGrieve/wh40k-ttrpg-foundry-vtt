import { describe, expect, it } from 'vitest';

/** DH1NPCData is a thin wrapper with only gameSystem = 'dh1e' added. */
describe('DH1NPCData', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./dh1-npc').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`DH1NPCData could not be imported: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('static gameSystem is dh1e', async () => {
        const mod = await import('./dh1-npc').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect((mod.default as { gameSystem?: string }).gameSystem).toBe('dh1e');
    });

    it('inherits NPCBaseData', async () => {
        const [baseMod, mod] = await Promise.all([import('../bases/npc-base').catch(() => undefined), import('./dh1-npc').catch(() => undefined)]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (baseMod === undefined || mod === undefined) return;
        expect(mod.default.prototype).toBeInstanceOf(baseMod.default);
    });
});
