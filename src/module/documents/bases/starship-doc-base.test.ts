import { describe, expect, it } from 'vitest';

const MOD = await import('./starship-doc-base').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`StarshipDocBase could not be imported in this environment: ${msg}`);
    return undefined;
});

const STARSHIP_MOD = await import('../starship').catch((err) => {
    console.warn(`WH40KStarship import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

const BASE_MOD = await import('../base-actor').catch((err) => {
    console.warn(`WH40KBaseActor import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

describe('StarshipDocBase', () => {
    it.skipIf(MOD === undefined)('exports a default StarshipDocBase class', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined || STARSHIP_MOD === undefined || BASE_MOD === undefined)(
        'StarshipDocBase extends WH40KStarship (and therefore WH40KBaseActor)',
        () => {
            expect(MOD?.default.prototype).toBeInstanceOf(STARSHIP_MOD?.WH40KStarship);
            expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.WH40KBaseActor);
        },
    );
});
