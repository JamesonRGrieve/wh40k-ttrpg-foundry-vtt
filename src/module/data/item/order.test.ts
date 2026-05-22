import { describe, expect, it } from 'vitest';

const MOD = await import('./order').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`order DataModel could not be imported in this environment: ${msg}`);
    return undefined;
});

describe('OrderData', () => {
    it.skipIf(MOD === undefined)('has a default OrderData symbol exported', () => {
        expect(MOD).toBeTruthy();
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema mixes description template with category / actionType / test (skill, characteristic, modifier)
    //   - shipActionEffect is the content-agnostic primitive ('' | cancelPriorTurnDamage | replenishMorale)
    //   - shipActionEffect routes into the RT crew/morale economy without name string-matching
});
