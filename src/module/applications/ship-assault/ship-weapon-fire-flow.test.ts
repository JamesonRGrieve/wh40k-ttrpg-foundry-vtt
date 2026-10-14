import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShipAssaultShip } from '../../rules/ship-assault.ts';
import { assaultContext, formValues, queueRolls, QueuedRollStub, recordingShip, type RecordingShip } from '../../testing/ship-assault.ts';
import type { ShipAssaultSession } from './ship-assault-flow.ts';
import { createShipWeaponFireFlow, type ShipWeaponFireInput } from './ship-weapon-fire-flow.ts';

/**
 * The ship weapon fire flow (#184) end to end: the gunner's test, the hits
 * through the target's void shields and Armour, and every write landing on the
 * TARGET ship — the regression was the firing ship damaging itself.
 */

const SABRE: ShipAssaultShip = {
    name: 'Sabre',
    hullType: 'frigate',
    manoeuvrability: 15,
    armour: 18,
    turretRating: 1,
    crewPopulation: 80,
    hullIntegrity: 35,
    morale: 75,
};
const RAIDER: ShipAssaultShip = { ...SABRE, name: 'Raider', hullType: 'raider', armour: 15, hullIntegrity: 30, crewPopulation: 60, morale: 50 };

const MACROBATTERY: ShipWeaponFireInput['weapon'] = {
    name: 'Sunsear Laser Battery',
    img: '',
    weaponClass: 'macrobattery',
    typeLabel: 'Macrobattery',
    locationLabel: 'Prow',
    strength: 3,
    damage: '1d10',
    crit: 4,
    range: 6,
};
const LANCE: ShipWeaponFireInput['weapon'] = {
    ...MACROBATTERY,
    name: 'Titanforge Lance',
    weaponClass: 'lance',
    typeLabel: 'Lance Weapon',
    strength: 1,
    damage: '1d10+4',
};

afterEach(() => {
    vi.unstubAllGlobals();
});

interface Fired {
    session: ShipAssaultSession;
    firer: RecordingShip;
    target: RecordingShip;
}

function fire(weapon: ShipWeaponFireInput['weapon'], options: { shields?: number; owner?: boolean; ballisticSkill?: number } = {}): Fired {
    const firer = recordingShip(SABRE);
    const target = recordingShip(RAIDER, { voidShields: options.shields ?? 1, isOwner: options.owner ?? true });
    const entry = createShipWeaponFireFlow({ weapon, ballisticSkill: options.ballisticSkill ?? 48, shipModifiers: [] });
    return { session: entry.start(assaultContext(firer, target)), firer, target };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate's open Handlebars context bag; the tests read named keys off it
type CardData = Record<string, unknown>;

describe('ship weapon fire flow (#184)', () => {
    it('is offered from the Weapons tab, titled as a weapon fire', () => {
        const entry = createShipWeaponFireFlow({ weapon: MACROBATTERY, ballisticSkill: 40, shipModifiers: [] });
        expect(entry.tab).toBe('weapons');
        expect(entry.windowTitleKey).toBe('WH40K.Voidcraft.Fire.DialogTitle');
    });

    it("offers the gunner's BS (the ship's by default), the range band and a situational modifier", () => {
        const { session } = fire(MACROBATTERY, { ballisticSkill: 52 });
        const fields = session.inputGroups().flatMap((group) => group.fields);
        expect(fields.map((field) => field.name)).toEqual(['gunnerSkill', 'rangeBand', 'situationalValue', 'situationalLabel']);
        expect(fields[0]?.value).toBe(52);
        expect(fields[1]?.options?.map((option) => option.value)).toEqual(['close', 'standard', 'long']);
    });

    it("resolves the book's macrobattery shot against the target: 3 hits, 1 shielded, 16 − 15 Armour = 1", async () => {
        const { session, firer, target } = fire(MACROBATTERY);
        queueRolls(29, 9, 7);
        await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
        expect(QueuedRollStub.formulas).toEqual(['1d100', '1d10', '1d10']);
        const applied = await session.apply(formValues({}));
        expect(target.shieldOverloads).toEqual([1]);
        expect(target.hullHits).toEqual([1]);
        expect(target.criticalHits).toEqual([]);
        // The regression: nothing lands on the firing ship.
        expect(firer.hullHits).toEqual([]);
        expect(firer.shieldOverloads).toEqual([]);
        const data = applied?.card.data as CardData;
        expect(data['defenderName']).toBe('Raider');
        expect((data['hits'] as { total: number }).total).toBe(2);
        expect((data['damage'] as { total: number }).total).toBe(1);
        expect(applied?.rolls).toHaveLength(3);
    });

    it("resolves the book's lance shot: shields down, Armour ignored, 9 damage and the Crit Rating's Critical Hit", async () => {
        const { session, target } = fire(LANCE, { shields: 0 });
        queueRolls(11, 9, 5);
        await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
        expect(QueuedRollStub.formulas).toEqual(['1d100', '1d10+4', '1d5']);
        await session.apply(formValues({}));
        expect(target.shieldOverloads).toEqual([]);
        expect(target.hullHits).toEqual([9]);
        expect(target.criticalHits).toEqual([5]);
    });

    it('inflicts 1 automatic point when a Critical Hit is fully shielded', async () => {
        const { session, target } = fire(LANCE, { shields: 2 });
        queueRolls(11, 3);
        await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
        expect(QueuedRollStub.formulas).toEqual(['1d100', '1d5']);
        const applied = await session.apply(formValues({}));
        expect(target.shieldOverloads).toEqual([1]);
        expect(target.hullHits).toEqual([1]);
        expect(target.criticalHits).toEqual([3]);
        expect((applied?.card.data as CardData)['allShielded']).toBe(true);
    });

    it('rolls nothing more on a miss and leaves the target untouched', async () => {
        const { session, target } = fire(MACROBATTERY);
        queueRolls(90);
        await session.roll(formValues({ gunnerSkill: 48 }));
        expect(QueuedRollStub.formulas).toEqual(['1d100']);
        const applied = await session.apply(formValues({}));
        expect(target.hullHits).toEqual([]);
        expect(target.shieldOverloads).toEqual([]);
        const data = applied?.card.data as CardData;
        expect(data['missed']).toBe(true);
        expect(data['hits']).toBeNull();
    });

    it('previews the target vitals before the shot, and fills the after column once applied', async () => {
        const { session } = fire(MACROBATTERY);
        queueRolls(29, 9, 7);
        await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
        const preview = session.previewCard()?.data as CardData;
        expect(preview['applied']).toBe(false);
        expect((preview['vitals'] as { before: string; after: string }[])[0]).toMatchObject({ before: '30 / 30', after: '' });
        const applied = (await session.apply(formValues({})))?.card.data as CardData;
        expect(applied['applied']).toBe(true);
    });

    it("does not write to a target the user doesn't own, and says so", async () => {
        const { session, target } = fire(MACROBATTERY, { owner: false });
        queueRolls(29, 9, 7);
        await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
        const applied = await session.apply(formValues({}));
        expect(target.hullHits).toEqual([]);
        expect(target.shieldOverloads).toEqual([]);
        expect((applied?.card.data as CardData)['unapplied']).toBe(true);
    });
});
