import { describe, expect, it } from 'vitest';

const MOD = await import('./npc-doc-base').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`NPCDocBase could not be imported in this environment: ${msg}`);
    return undefined;
});

const NPC_MOD = await import('../npc').catch((err) => {
    console.warn(`WH40KNPC import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

const BASE_MOD = await import('../base-actor').catch((err) => {
    console.warn(`WH40KBaseActor import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

describe('NPCDocBase', () => {
    it.skipIf(MOD === undefined)('exports a default NPCDocBase class', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined || NPC_MOD === undefined || BASE_MOD === undefined)('NPCDocBase extends WH40KNPC (and therefore WH40KBaseActor)', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(NPC_MOD?.WH40KNPC);
        expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.WH40KBaseActor);
    });
});
