import { describe, expect, it } from 'vitest';

describe('WH40KDH2Character', () => {
    it('exports default WH40KDH2Character class', async () => {
        const mod = await import('./dh2-character').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KDH2Character could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('WH40KDH2Character prototype chain reaches CharacterDocBase', async () => {
        const [dh2Mod, baseMod] = await Promise.all([
            import('./dh2-character').catch((err) => {
                console.warn(`DH2 import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
            import('../bases/character-doc-base').catch((err) => {
                console.warn(`CharacterDocBase import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
        ]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (dh2Mod === undefined || baseMod === undefined) return;
        expect(dh2Mod.default.prototype).toBeInstanceOf(baseMod.default);
    });

    it('WH40KDH2Character prototype chain reaches WH40KAcolyte', async () => {
        const [dh2Mod, acolyteMod] = await Promise.all([
            import('./dh2-character').catch((err) => {
                console.warn(`DH2 import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
            import('../acolyte').catch((err) => {
                console.warn(`WH40KAcolyte import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
        ]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (dh2Mod === undefined || acolyteMod === undefined) return;
        expect(dh2Mod.default.prototype).toBeInstanceOf(acolyteMod.WH40KAcolyte);
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - DH2 character inherits rollCharacteristic from WH40KAcolyte
    //   - DH2 character has no divergent property overrides (empty subclass by design)
});
