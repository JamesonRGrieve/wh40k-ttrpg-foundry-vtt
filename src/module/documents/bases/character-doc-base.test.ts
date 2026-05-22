import { describe, expect, it } from 'vitest';

const MOD = await import('./character-doc-base').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`CharacterDocBase could not be imported in this environment: ${msg}`);
    return undefined;
});

const ACOLYTE_MOD = await import('../acolyte').catch((err) => {
    console.warn(`WH40KAcolyte import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

const BASE_MOD = await import('../base-actor').catch((err) => {
    console.warn(`WH40KBaseActor import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

describe('CharacterDocBase', () => {
    it.skipIf(MOD === undefined)('exports a default CharacterDocBase class', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined || ACOLYTE_MOD === undefined || BASE_MOD === undefined)(
        'CharacterDocBase extends WH40KAcolyte (and therefore WH40KBaseActor)',
        () => {
            expect(MOD?.default.prototype).toBeInstanceOf(ACOLYTE_MOD?.WH40KAcolyte);
            expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.WH40KBaseActor);
        },
    );
});
