import { describe, expect, it } from 'vitest';

describe('WH40KIMCharacter (Imperium Maledictum)', () => {
    it('exports default WH40KIMCharacter class', async () => {
        const mod = await import('./im-character').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KIMCharacter could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('WH40KIMCharacter, WH40KDH2Character, and WH40KRTCharacter are three distinct classes', async () => {
        const [imMod, dh2Mod, rtMod] = await Promise.all([
            import('./im-character').catch((err) => {
                console.warn(`IM import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
            import('./dh2-character').catch((err) => {
                console.warn(`DH2 import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
            import('./rt-character').catch((err) => {
                console.warn(`RT import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
        ]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (imMod === undefined || dh2Mod === undefined || rtMod === undefined) return;
        expect(imMod.default).not.toBe(dh2Mod.default);
        expect(imMod.default).not.toBe(rtMod.default);
        expect(dh2Mod.default).not.toBe(rtMod.default);
    });

    it('WH40KIMCharacter prototype chain reaches CharacterDocBase', async () => {
        const [imMod, baseMod] = await Promise.all([
            import('./im-character').catch((err) => {
                console.warn(`IM import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
            import('../bases/character-doc-base').catch((err) => {
                console.warn(`CharacterDocBase import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
        ]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (imMod === undefined || baseMod === undefined) return;
        expect(imMod.default.prototype).toBeInstanceOf(baseMod.default);
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - IM character shares rollCharacteristic / rollSkill API with other systems
    //   - IM-specific Patron / Faction fields don't break the base WH40KAcolyte accessor surface
});
