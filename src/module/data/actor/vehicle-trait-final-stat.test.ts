import { afterAll, describe, expect, it } from 'vitest';
import { installFoundryDataStub } from '../../testing/foundry-data-stub.ts';
import type { VehicleTraitEffects } from '../shared/vehicle-trait-effects-template.ts';

/**
 * Authored vehicle stat lines are the FINAL printed book values, which already
 * include their traits' effects (content#28). The DH2 Chimera prints
 * Manoeuvrability +0 although Tracked Vehicle says −10, so preparing the craft
 * must leave the printed stat alone and contribute only what a stat line cannot
 * carry: the trait's test modifiers and rule flags, each naming the trait.
 *
 * `vehicle.ts` builds its classes from `foundry.abstract` / `foundry.data.fields`
 * at load, so the stub is installed before the dynamic import.
 */
afterAll(installFoundryDataStub());

const { ConventionalCraftData } = await import('./vehicle.ts');
const { emptyAggregatedVehicleTraitEffects } = await import('../shared/vehicle-trait-effects-template.ts');

/** The slice of a prepared craft this contract reads and drives. */
interface CraftUnderTest {
    manoeuverability: number | null;
    speed: { cruising: number; tactical: number };
    armour: { front: { value: number }; side: { value: number }; rear: { value: number } };
    integrity: { max: number; value: number };
    traitEffects: ReturnType<typeof emptyAggregatedVehicleTraitEffects>;
    _applyVehicleTraitModifiers: () => void;
    _aggregateTraitEffects: () => void;
    parent: { items: Array<{ type: string; name: string; system: object }> };
}

/** An owned vehicle trait: zero flat stat deltas, plus its structured effects. */
function ownedTrait(name: string, effects: Partial<VehicleTraitEffects>): CraftUnderTest['parent']['items'][number] {
    return {
        type: 'vehicleTrait',
        name,
        system: { modifiers: { speed: 0, manoeuvrability: 0, armour: 0, integrity: 0 }, effects: { ...emptyAggregatedVehicleTraitEffects(), ...effects } },
    };
}

describe('vehicle traits never re-apply what the printed stat line already includes (content#28)', () => {
    it('a Chimera-shaped actor with Tracked Vehicle keeps its printed Manoeuvrability', () => {
        const craft = Object.create(ConventionalCraftData.prototype) as CraftUnderTest;
        // The DH2 Chimera Armoured Transport's printed line (DH2 core p. 191).
        craft.manoeuverability = 0;
        craft.speed = { cruising: 70, tactical: 15 };
        craft.armour = { front: { value: 30 }, side: { value: 22 }, rear: { value: 16 } };
        craft.integrity = { max: 35, value: 35 };
        craft.parent = {
            items: [
                ownedTrait('Tracked Vehicle', {
                    testModifiers: [{ test: 'difficultTerrain', value: 10 }],
                    mitigatesMotiveCrit: true,
                    motiveRepairTimeMultiplier: 2,
                }),
                ownedTrait('Rugged', { testModifiers: [{ test: 'repair', value: 20 }] }),
            ],
        };

        craft._applyVehicleTraitModifiers();
        craft._aggregateTraitEffects();

        expect(craft.manoeuverability).toBe(0);
        expect(craft.speed).toEqual({ cruising: 70, tactical: 15 });
        expect(craft.armour).toEqual({ front: { value: 30 }, side: { value: 22 }, rear: { value: 16 } });
        expect(craft.integrity).toEqual({ max: 35, value: 35 });
        expect(craft.traitEffects.testModifiers).toEqual([
            { test: 'difficultTerrain', value: 10, source: 'Tracked Vehicle' },
            { test: 'repair', value: 20, source: 'Rugged' },
        ]);
        expect(craft.traitEffects.mitigatesMotiveCrit).toBe(true);
        expect(craft.traitEffects.motiveRepairTimeMultiplier).toBe(2);
    });
});
