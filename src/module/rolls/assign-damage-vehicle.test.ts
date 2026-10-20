import { describe, expect, it, vi } from 'vitest';
import { aggregateVehicleTraitEffects, emptyAggregatedVehicleTraitEffects, type VehicleTraitEffects } from '../data/shared/vehicle-trait-effects-template.ts';
import type { VehicleLocationId } from '../rules/vehicle-damage.ts';
import { type ActorLike, AssignDamageData } from './assign-damage-data.ts';
import type { VehicleCritLookupFn } from './vehicle-critical-tables.ts';
import type { VehicleStrike } from './vehicle-strike.ts';

/** A Chimera (DH2 Core: Front 30 / Side 22 / Rear 16, Structural Integrity 35) with the given traits. */
function chimera(integrity: { value: number; critical: number }, traits: Partial<VehicleTraitEffects>[] = [], line = 'dh2'): ActorLike {
    const named = traits.map((over, index) => ({
        name: index === 0 ? 'Reinforced Armour' : `Trait ${index}`,
        effects: { ...emptyAggregatedVehicleTraitEffects(), ...over },
    }));
    const system = {
        gameSystem: line,
        armour: { front: { value: 30, descriptor: '' }, side: { value: 22, descriptor: '' }, rear: { value: 16, descriptor: '' } },
        integrity: { max: 35, ...integrity },
        traitEffects: aggregateVehicleTraitEffects(named),
    };
    const actor = {
        system,
        hasTalent: () => false,
        update: vi.fn<ActorLike['update']>().mockResolvedValue(undefined),
        createEmbeddedDocuments: vi.fn<ActorLike['createEmbeddedDocuments']>(),
    };
    // eslint-disable-next-line no-restricted-syntax -- test: a craft's prepared system stands in for the creature-shaped ActorLike view the assign step is typed on
    return actor as unknown as ActorLike;
}

function strike(over: Partial<VehicleStrike> = {}): VehicleStrike {
    return {
        line: 'dh2',
        facing: 'front',
        facingAssumed: false,
        location: 'hull',
        tableRoll: 32,
        tableRollKind: 'reversed',
        redirectedFrom: null,
        armourFacing: 'front',
        forceField: null,
        righteousFury: [],
        ...over,
    };
}

function hit(
    damage: number,
    penetration: number,
    vehicleStrike: VehicleStrike,
): { location: string; damageType: string; totalDamage: number; totalPenetration: number; totalFatigue: number; vehicleStrike: VehicleStrike } {
    return { location: vehicleStrike.location, damageType: 'Explosive', totalDamage: damage, totalPenetration: penetration, totalFatigue: 0, vehicleStrike };
}

/** A chart that names the row it was read at. */
const lookup: VehicleCritLookupFn = async (line: string, location: VehicleLocationId, value: number) =>
    Promise.resolve({ chartName: `${line} ${location}`, chartUuid: 'uuid', value, text: `row ${value}` });

async function assign(actor: ActorLike, landed: ReturnType<typeof hit>, critLookup: VehicleCritLookupFn = lookup): Promise<AssignDamageData> {
    const data = new AssignDamageData(actor, landed);
    data.vehicleCritLookup = critLookup;
    data.update();
    await data.finalize();
    return data;
}

describe('AssignDamageData on a vehicle (content#28)', () => {
    it('meets a frontal hit with Front armour and a rear hit with Rear armour', async () => {
        const front = await assign(chimera({ value: 35, critical: 0 }), hit(40, 4, strike()));
        expect(front.armour).toBe(30);
        expect(front.tb).toBe(0);
        expect(front.vehicleDamage?.outcome.integrityLoss).toBe(14);

        const rear = await assign(chimera({ value: 35, critical: 0 }), hit(40, 4, strike({ facing: 'rear', armourFacing: 'rear' })));
        expect(rear.armour).toBe(16);
        expect(rear.vehicleDamage?.outcome.integrityLoss).toBe(28);
    });

    it('reads a Turret hit against Front armour even from the rear', async () => {
        const data = await assign(chimera({ value: 35, critical: 0 }), hit(40, 0, strike({ facing: 'rear', location: 'turret', armourFacing: 'front' })));
        expect(data.armour).toBe(30);
    });

    it('takes the loss off Structural Integrity on apply, with no wounds, injury item or 1-point minimum', async () => {
        const actor = chimera({ value: 35, critical: 0 });
        const absorbed = await assign(actor, hit(20, 0, strike()));
        expect(absorbed.vehicleDamage?.outcome.integrityLoss).toBe(0);
        expect(absorbed.hasDamage).toBe(false);

        vi.stubGlobal('foundry', { applications: { handlebars: { renderTemplate: vi.fn(async () => Promise.resolve('<div></div>')) } } });
        vi.stubGlobal('ChatMessage', { create: vi.fn(async () => Promise.resolve(null)), getSpeaker: vi.fn(() => ({})) });
        const data = await assign(actor, hit(47, 0, strike()));
        await data.performActionAndSendToChat().catch(() => undefined);
        expect(actor.update).toHaveBeenCalledWith({ 'system.integrity.value': 18, 'system.integrity.critical': 0 });
        expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('turns damage past Integrity into Critical damage read cumulatively on the struck chart', async () => {
        const data = await assign(chimera({ value: 3, critical: 2 }), hit(38, 0, strike({ location: 'motive' })));
        expect(data.vehicleDamage?.outcome).toMatchObject({ integrityLoss: 3, excess: 5, criticalTaken: 5, criticalAfter: 7 });
        expect(data.vehicleDamage?.critical).toMatchObject({ chartName: 'dh2 motive', value: 7, text: 'row 7' });
        expect(data.criticalEffect).toBe('row 7');
    });

    it('halves Critical damage under Reinforced Armour, rounding up', async () => {
        const data = await assign(chimera({ value: 0, critical: 0 }, [{ critDamageMultiplier: 0.5, critExcludesRighteousFury: true }]), hit(37, 0, strike()));
        expect(data.vehicleDamage?.outcome).toMatchObject({ excess: 7, critMultiplier: 0.5, criticalTaken: 4, criticalAfter: 4 });
        expect(data.vehicleDamage?.critSources).toEqual(['Reinforced Armour']);
        expect(data.vehicleRows.find((row) => row.hook === 'vehicle-crit-multiplier')?.label).toBe('Reinforced Armour');
    });

    it("applies Righteous Fury's chart rows untouched by Reinforced Armour", async () => {
        const fury = { die: '1d5', dieSource: '', rolled: 5, value: 5, unaffectedBy: 'Reinforced Armour' };
        const data = await assign(
            chimera({ value: 35, critical: 0 }, [{ critDamageMultiplier: 0.5, critExcludesRighteousFury: true }]),
            hit(32, 0, strike({ righteousFury: [fury] })),
        );
        expect(data.vehicleDamage?.righteousFury).toEqual([{ ...fury, critical: { chartName: 'dh2 hull', chartUuid: 'uuid', value: 5, text: 'row 5' } }]);
        expect(data.vehicleDamage?.outcome.criticalAfter).toBe(0);
    });

    it('loses Righteous Fury on a line that needs a damaging hit when this one dealt none', async () => {
        const fury = { die: '1d5', dieSource: '', rolled: 2, value: 2, unaffectedBy: '' };
        const ow = await assign(chimera({ value: 35, critical: 0 }, [], 'ow'), hit(20, 0, strike({ line: 'ow', righteousFury: [fury] })));
        expect(ow.vehicleDamage?.righteousFuryLost).toBe(true);
        expect(ow.vehicleDamage?.righteousFury).toEqual([]);

        const dh2 = await assign(chimera({ value: 35, critical: 0 }), hit(20, 0, strike({ righteousFury: [fury] })));
        expect(dh2.vehicleDamage?.righteousFuryLost).toBe(false);
        expect(dh2.vehicleDamage?.righteousFury).toHaveLength(1);
    });

    it('lets nothing through a trait force field that nullified the attack', async () => {
        const forceField = { rating: 40, roll: 12, nullified: true, source: 'Shield Generator', overloadUnmodelled: true };
        const data = await assign(
            chimera({ value: 35, critical: 0 }),
            hit(60, 10, strike({ forceField, righteousFury: [{ die: '1d5', dieSource: '', rolled: 3, value: 3, unaffectedBy: '' }] })),
        );
        expect(data.vehicleDamage?.nullifiedBy).toEqual(forceField);
        expect(data.vehicleDamage?.outcome.integrityLoss).toBe(0);
        expect(data.vehicleDamage?.righteousFury).toEqual([]);
        expect(data.previewReducedDamage().effective).toBe(0);
    });

    it('reports a chart the line does not carry', async () => {
        const data = await assign(chimera({ value: 0, critical: 0 }, [], 'bc'), hit(35, 0, strike({ line: 'bc' })), async () => Promise.resolve(null));
        expect(data.vehicleDamage?.criticalChartMissing).toBe(true);
    });

    it('previews Integrity damage with no Toughness Bonus and no 1-point minimum', () => {
        const data = new AssignDamageData(chimera({ value: 35, critical: 0 }), hit(25, 2, strike({ facing: 'left', armourFacing: 'side' })));
        data.update();
        expect(data.previewReducedDamage()).toEqual({ effective: 5, armour: 20, toughnessBonus: 0, penetration: 2, absorbed: false });
        const absorbed = new AssignDamageData(chimera({ value: 35, critical: 0 }), hit(10, 0, strike()));
        absorbed.update();
        expect(absorbed.previewReducedDamage().effective).toBe(0);
    });

    it('takes the location the assign dialog picked over where the hit struck', async () => {
        const landed = { ...hit(40, 0, strike()), location: 'turret' };
        const data = await assign(chimera({ value: 0, critical: 0 }), landed);
        expect(data.vehicleDamage?.location).toBe('turret');
        expect(data.armour).toBe(30);
    });
});
