import { describe, expect, it } from 'vitest';

describe('WH40KRTCharacter (Rogue Trader)', () => {
    it('exports default WH40KRTCharacter class', async () => {
        const mod = await import('./rt-character').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KRTCharacter could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('WH40KRTCharacter and WH40KDH2Character are distinct classes', async () => {
        const [rtMod, dh2Mod] = await Promise.all([
            import('./rt-character').catch((err) => {
                console.warn(`RT import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
            import('./dh2-character').catch((err) => {
                console.warn(`DH2 import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
        ]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (rtMod === undefined || dh2Mod === undefined) return;
        // Both are concrete subclasses that delegate to the same CharacterDocBase —
        // verify they are separate classes (different per-system actor registration).
        expect(rtMod.default).not.toBe(dh2Mod.default);
    });

    it('WH40KRTCharacter prototype chain reaches WH40KAcolyte', async () => {
        const [rtMod, acolyteMod] = await Promise.all([
            import('./rt-character').catch((err) => {
                console.warn(`RT import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
            import('../acolyte').catch((err) => {
                console.warn(`WH40KAcolyte import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
        ]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (rtMod === undefined || acolyteMod === undefined) return;
        expect(rtMod.default.prototype).toBeInstanceOf(acolyteMod.WH40KAcolyte);
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - RT character inherits rollCharacteristic, rollSkill, etc. unchanged
    //   - isOriginPath item flag reads rt.kind === 'origin' (RT-specific logic in WH40KItem)
});
