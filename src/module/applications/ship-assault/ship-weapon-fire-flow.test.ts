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
    crippledManoeuvrability: 0,
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
    const entry = createShipWeaponFireFlow({ weapon, ballisticSkill: options.ballisticSkill ?? 48, shipModifiers: [], companions: [] });
    return { session: entry.start(assaultContext(firer, target)), firer, target };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate's open Handlebars context bag; the tests read named keys off it
type CardData = Record<string, unknown>;

describe('ship weapon fire flow (#184)', () => {
    it('is offered from the Weapons tab, titled as a weapon fire', () => {
        const entry = createShipWeaponFireFlow({ weapon: MACROBATTERY, ballisticSkill: 40, shipModifiers: [], companions: [] });
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

    it('fires a Crippled ship’s weapon at half Strength, named on the hits derivation (RT "Crippled Ships")', async () => {
        // The firing ship is at 0 Hull Integrity: the book's 3-hit shot from a Strength 3 battery lands 2.
        const firer: RecordingShip = { ...recordingShip(SABRE), hullIntegrity: { value: 0, max: 35 } };
        const target = recordingShip(RAIDER, { voidShields: 1 });
        const session = createShipWeaponFireFlow({ weapon: MACROBATTERY, ballisticSkill: 48, shipModifiers: [], companions: [] }).start(
            assaultContext(firer, target),
        );
        queueRolls(29, 9);
        await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
        // 2 hits, one shielded: a single damage die.
        expect(QueuedRollStub.formulas).toEqual(['1d100', '1d10']);
        const data = (await session.apply(formValues({})))?.card.data as CardData;
        const hits = data['hits'] as { total: number; rows: { label: string; value: number }[] };
        expect(hits.total).toBe(1);
        expect(hits.rows.map((row) => row.value)).toEqual([1, 2, -1, -1]);
        expect(hits.rows[2]?.label).toBe('WH40K.Voidcraft.Fire.Component.CrippledStrength{"strength":3,"halved":2}');
        // 9 against Armour 15: nothing gets through.
        expect(target.hullHits).toEqual([]);
    });

    it('fires an undamaged-enough ship at full Strength: half Hull is not Crippled', async () => {
        const firer: RecordingShip = { ...recordingShip(SABRE), hullIntegrity: { value: 17, max: 35 } };
        const session = createShipWeaponFireFlow({ weapon: MACROBATTERY, ballisticSkill: 48, shipModifiers: [], companions: [] }).start(
            assaultContext(firer, recordingShip(RAIDER, { voidShields: 0 })),
        );
        queueRolls(29, 9, 7, 1);
        await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
        const hits = (session.previewCard()?.data as CardData)['hits'] as { total: number; rows: { label: string }[] };
        expect(hits.total).toBe(3);
        expect(hits.rows.some((row) => row.label.includes('CrippledStrength'))).toBe(false);
    });

    describe('a Crippled target takes a Critical Hit from damage past its Armour (RT "Crippled Ships", #187)', () => {
        function crippledTarget(gameSystem = 'rt', shields = 1): RecordingShip {
            const target = recordingShip(RAIDER, { voidShields: shields });
            return Object.assign(target, { hullIntegrity: { value: 0, max: 30 }, system: { ...target.system, gameSystem } });
        }

        it('reads a macrobattery’s total past Armour on the chart', async () => {
            const target = crippledTarget();
            const session = createShipWeaponFireFlow({ weapon: MACROBATTERY, ballisticSkill: 48, shipModifiers: [], companions: [] }).start(
                assaultContext(recordingShip(SABRE), target),
            );
            // 3 hits, the shield takes one; 9 + 7 = 16 against Armour 15 is 1 past it.
            queueRolls(29, 9, 7);
            await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
            const data = (await session.apply(formValues({})))?.card.data as CardData;
            expect(target.crippledCriticalHits).toEqual([1]);
            expect(data['crippledCriticals']).toEqual(['WH40K.Voidcraft.Crippled.FireCritical{"ship":"Raider","damage":1}']);
        });

        it('reads each lance hit on its own, beside the Crit Rating’s 1d5', async () => {
            const target = crippledTarget('rt', 0);
            const session = createShipWeaponFireFlow({ weapon: LANCE, ballisticSkill: 48, shipModifiers: [], companions: [] }).start(
                assaultContext(recordingShip(SABRE), target),
            );
            queueRolls(11, 9, 5);
            await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
            await session.apply(formValues({}));
            expect(target.criticalHits).toEqual([5]);
            expect(target.crippledCriticalHits).toEqual([9]);
        });

        it('takes none when the damage stopped at Armour', async () => {
            const target = crippledTarget();
            const session = createShipWeaponFireFlow({ weapon: MACROBATTERY, ballisticSkill: 48, shipModifiers: [], companions: [] }).start(
                assaultContext(recordingShip(SABRE), target),
            );
            queueRolls(29, 3, 2);
            await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
            await session.apply(formValues({}));
            expect(target.crippledCriticalHits).toEqual([]);
        });

        it('takes none on another line', async () => {
            const target = crippledTarget('dh2');
            const session = createShipWeaponFireFlow({ weapon: MACROBATTERY, ballisticSkill: 48, shipModifiers: [], companions: [] }).start(
                assaultContext(recordingShip(SABRE), target),
            );
            queueRolls(29, 9, 7);
            await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
            await session.apply(formValues({}));
            expect(target.crippledCriticalHits).toEqual([]);
        });
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

describe('ship weapon fire flow — a combined macrobattery salvo (#184, RT)', () => {
    const BROADSIDE: ShipWeaponFireInput['weapon'] = { ...MACROBATTERY, name: 'Broadside Battery', strength: 4, damage: '2d10', locationLabel: 'Starboard' };
    const LOCK = { labelKey: 'WH40K.Voidcraft.ShipAction.Component.Effect', value: 10, data: { name: 'Lock on Target' } };

    function salvo(shields: number, primary: ShipWeaponFireInput['weapon'] = MACROBATTERY): Fired {
        const firer = recordingShip(SABRE);
        const target = recordingShip(RAIDER, { voidShields: shields });
        const entry = createShipWeaponFireFlow({
            weapon: primary,
            ballisticSkill: 48,
            shipModifiers: [],
            companions: [
                { id: 'broadside', weapon: BROADSIDE, shipModifiers: [LOCK] },
                { id: 'lance', weapon: LANCE, shipModifiers: [] },
            ],
        });
        return { session: entry.start(assaultContext(firer, target)), firer, target };
    }

    it('offers the other macrobatteries (never a lance) with their own range band, and the shields-first choice', () => {
        const groups = salvo(1).session.inputGroups();
        expect(groups).toHaveLength(2);
        const fields = groups[1]?.fields ?? [];
        expect(fields.map((field) => field.name)).toEqual(['salvo-broadside', 'salvoRange-broadside', 'shieldsFirst']);
        // The clicked 1d10 battery's hits are worth less than the 2d10 broadside's, so the shields take them by default.
        expect(fields[2]).toMatchObject({ value: 'primary', options: [{ value: 'primary' }, { value: 'broadside' }] });
    });

    it('offers no salvo from a lance, or from a macrobattery with no other macrobattery', () => {
        expect(salvo(1, LANCE).session.inputGroups()).toHaveLength(1);
        expect(fire(MACROBATTERY).session.inputGroups()).toHaveLength(1);
    });

    it('fires singly when no other battery is ticked', async () => {
        const { session } = salvo(1);
        queueRolls(29, 9, 7);
        await session.roll(formValues({ gunnerSkill: 48, rangeBand: 'close' }));
        expect(QueuedRollStub.formulas).toEqual(['1d100', '1d10', '1d10']);
        expect((session.previewCard()?.data as CardData)['salvo']).toBeNull();
    });

    it('rolls each battery’s own test, pools the hits, and lets Armour count once against the total', async () => {
        const { session, target } = salvo(2);
        // Port battery: 58 rolls 29 → 2 DoS, 3 hits. Broadside: 48 + Lock on Target 10 = 58 at standard range, rolls 40 → 1 DoS, 2 hits.
        // The shields take 2 of the port battery's hits; 1 × 1d10 (6) + 2 × 2d10 (12, 9) = 27 − 15 = 12.
        queueRolls(29, 40, 6, 12, 9);
        await session.roll(formValues({ 'gunnerSkill': 48, 'rangeBand': 'close', 'salvo-broadside': true, 'salvoRange-broadside': 'standard' }));
        expect(QueuedRollStub.formulas).toEqual(['1d100', '1d100', '1d10', '2d10', '2d10']);
        const applied = await session.apply(formValues({}));
        expect(target.shieldOverloads).toEqual([2]);
        expect(target.hullHits).toEqual([12]);
        expect(target.criticalHits).toEqual([]);
        const data = applied?.card.data as CardData;
        const view = data['salvo'] as { title: string; batteries: { test: { target: number; dos: number }; hits: { total: number } }[] };
        expect(view.batteries.map((battery) => [battery.test.target, battery.test.dos, battery.hits.total])).toEqual([
            [58, 2, 3],
            [58, 1, 2],
        ]);
        const hits = data['hits'] as { total: number; rows: { value: number }[] };
        expect(hits.rows.map((row) => row.value)).toEqual([3, 2, -2]);
        expect(hits.total).toBe(3);
        const damage = data['damage'] as { total: number; rows: { label: string; value: number }[] };
        expect(damage.rows.map((row) => row.value)).toEqual([6, 12, 9, -15]);
        expect(damage.rows.filter((row) => row.label.startsWith('WH40K.Voidcraft.Fire.Component.Armour'))).toHaveLength(1);
        expect(damage.total).toBe(12);
    });

    it('honours the attacker’s shields-first choice', async () => {
        const { session } = salvo(2);
        queueRolls(29, 40, 6, 5, 4);
        await session.roll(formValues({ 'gunnerSkill': 48, 'rangeBand': 'close', 'salvo-broadside': true, 'shieldsFirst': 'broadside' }));
        // The broadside's 2 hits are discarded; the port battery's 3 land.
        expect(QueuedRollStub.formulas).toEqual(['1d100', '1d100', '1d10', '1d10', '1d10']);
    });

    it('inflicts one Critical Hit at most, however many batteries met their Crit Rating', async () => {
        const { session, target } = salvo(0);
        // Both roll 01: 5 and 4 DoS, both reach Crit Rating 4. 3 + 4 hits, one 1d5.
        queueRolls(1, 1, 1, 1, 1, 1, 1, 1, 1, 3);
        await session.roll(formValues({ 'gunnerSkill': 48, 'rangeBand': 'close', 'salvo-broadside': true }));
        expect(QueuedRollStub.formulas.filter((formula) => formula === '1d5')).toHaveLength(1);
        const applied = await session.apply(formValues({}));
        expect(target.criticalHits).toEqual([3]);
        expect((applied?.card.data as CardData)['salvoCriticalLimit']).toBe(true);
    });

    it('a salvo with no hit is a miss and touches nothing', async () => {
        const { session, target } = salvo(1);
        queueRolls(95, 96);
        await session.roll(formValues({ 'gunnerSkill': 48, 'rangeBand': 'close', 'salvo-broadside': true }));
        const data = (await session.apply(formValues({})))?.card.data as CardData;
        expect(data['missed']).toBe(true);
        expect(data['hits']).toBeNull();
        expect(target.hullHits).toEqual([]);
        expect(target.shieldOverloads).toEqual([]);
    });
});
