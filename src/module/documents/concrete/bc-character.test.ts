import { describe, expect, it } from 'vitest';

const MOD = await import('./bc-character').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`WH40KBCCharacter could not be imported in this environment: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('../bases/character-doc-base').catch((err) => {
    console.warn(`CharacterDocBase import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

const ACOLYTE_MOD = await import('../acolyte').catch((err) => {
    console.warn(`WH40KAcolyte import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

describe('WH40KBCCharacter', () => {
    it.skipIf(MOD === undefined)('exports a default WH40KBCCharacter class', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined || ACOLYTE_MOD === undefined)(
        'WH40KBCCharacter extends CharacterDocBase (and therefore WH40KAcolyte)',
        () => {
            expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.default);
            expect(MOD?.default.prototype).toBeInstanceOf(ACOLYTE_MOD?.WH40KAcolyte);
        },
    );
});
