import { describe, expect, it } from 'vitest';
import {
    allocateSalvoShields,
    applyVoidShields,
    averageDamage,
    composeGunneryTest,
    crippledStrength,
    defaultShieldedBattery,
    isSalvoCriticalHit,
    isShipCriticalHit,
    salvoHitComponents,
    type SalvoBatteryShot,
    rangeBandReach,
    resolveGunneryTest,
    resolveHullDamage,
    scoreHits,
    shipWeaponClass,
    toRangeBand,
    voidShieldComponents,
} from './ship-weapon-fire.ts';

/**
 * RT ship weapon fire (#184 — RT Core 1.4 errata, Chapter VIII). The book's
 * own worked example (the Sabre against a raider) is the anchor: BS 48 at
 * close range is a 58; a 29 is two degrees and three macrobattery hits; the
 * raider's one void shield takes the first; 16 damage against Armour 15 is one
 * point. The lance then rolls an 11 — four degrees, enough for Crit Rating 4 —
 * its hit lands with the shields already down and ignores Armour: 9 damage.
 */
describe('ship weapon fire (#184)', () => {
    const raider = { name: 'Raider', armour: 15 };

    it('only macrobatteries and lances have core firing rules', () => {
        expect(shipWeaponClass('macrobattery')).toBe('macrobattery');
        expect(shipWeaponClass('lance')).toBe('lance');
        expect(shipWeaponClass('torpedo')).toBeNull();
        expect(shipWeaponClass('nova-cannon')).toBeNull();
    });

    it('adds +10 within half range and −10 beyond range, each a named row', () => {
        const close = composeGunneryTest({ ballisticSkill: 48, shipModifiers: [], band: 'close', range: 6 });
        expect(close.target).toBe(58);
        expect(close.modifiers).toEqual([{ labelKey: 'WH40K.Voidcraft.Fire.Component.RangeClose', value: 10, data: { range: 6 } }]);
        const long = composeGunneryTest({ ballisticSkill: 48, shipModifiers: [], band: 'long', range: 6 });
        expect(long.target).toBe(38);
        const standard = composeGunneryTest({ ballisticSkill: 48, shipModifiers: [], band: 'standard', range: 6 });
        expect(standard.modifiers).toEqual([]);
        expect([rangeBandReach('close', 6), rangeBandReach('standard', 6), rangeBandReach('long', 6)]).toEqual([3, 6, 12]);
        expect(toRangeBand('long')).toBe('long');
        expect(toRangeBand('nonsense')).toBe('standard');
    });

    it('carries ship-action and situational modifiers through as their own rows', () => {
        const lock = { labelKey: 'WH40K.Voidcraft.ShipAction.Modifier', value: 15, data: { name: 'Lock on Target' } };
        const test = composeGunneryTest({ ballisticSkill: 40, shipModifiers: [lock], band: 'standard', range: 6, situational: { value: -10, label: 'Smoke' } });
        expect(test.target).toBe(45);
        expect(test.modifiers.map((row) => row.value)).toEqual([15, -10]);
    });

    it("counts RT degrees: one per full 10, so a bare success is 0 (the book's 58 vs 29 is 2)", () => {
        const target = composeGunneryTest({ ballisticSkill: 48, shipModifiers: [], band: 'close', range: 6 });
        expect(resolveGunneryTest(target, 29)).toMatchObject({ success: true, dos: 2, dof: 0 });
        expect(resolveGunneryTest(target, 58)).toMatchObject({ success: true, dos: 0 });
        expect(resolveGunneryTest(target, 11)).toMatchObject({ success: true, dos: 4 });
        expect(resolveGunneryTest(target, 79)).toMatchObject({ success: false, dos: 0, dof: 2 });
        expect(resolveGunneryTest(target, 100).success).toBe(false);
        const hopeless = composeGunneryTest({ ballisticSkill: 0, shipModifiers: [], band: 'long', range: 6 });
        expect(resolveGunneryTest(hopeless, 1).success).toBe(true);
    });

    it('scores a macrobattery 1 hit + 1 per degree, capped at Strength', () => {
        const target = composeGunneryTest({ ballisticSkill: 48, shipModifiers: [], band: 'close', range: 6 });
        const hit = resolveGunneryTest(target, 29);
        expect(scoreHits('macrobattery', 3, hit, false).hits).toBe(3);
        const capped = scoreHits('macrobattery', 2, hit, false);
        expect(capped.hits).toBe(2);
        expect(capped.components.map((row) => row.value)).toEqual([1, 2, -1]);
        expect(capped.components.at(-1)?.labelKey).toBe('WH40K.Voidcraft.Fire.Component.StrengthCap');
        expect(scoreHits('macrobattery', 3, resolveGunneryTest(target, 90), false).hits).toBe(0);
    });

    it('scores a lance 1 hit + 1 per three degrees, capped at Strength', () => {
        const target = composeGunneryTest({ ballisticSkill: 48, shipModifiers: [], band: 'close', range: 6 });
        const four = resolveGunneryTest(target, 11);
        expect(scoreHits('lance', 3, four, false).hits).toBe(2);
        expect(scoreHits('lance', 1, four, false).hits).toBe(1);
        expect(scoreHits('lance', 3, resolveGunneryTest(target, 29), false).hits).toBe(1);
    });

    describe('a Crippled firing ship (RT Core "Crippled Ships": Strength halved, round up)', () => {
        const target = composeGunneryTest({ ballisticSkill: 48, shipModifiers: [], band: 'close', range: 6 });
        const CRIPPLED_KEY = 'WH40K.Voidcraft.Fire.Component.CrippledStrength';

        it('halves Strength rounding up', () => {
            expect([1, 2, 3, 4, 5, 6].map(crippledStrength)).toEqual([1, 1, 2, 2, 3, 3]);
        });

        it('caps a macrobattery at half Strength, as its own provenance row', () => {
            // The book's shot: 3 hits on a Strength 3 battery; Crippled, Strength is 2.
            const scored = scoreHits('macrobattery', 3, resolveGunneryTest(target, 29), true);
            expect(scored.hits).toBe(2);
            expect(scored.components.at(-1)).toEqual({ labelKey: CRIPPLED_KEY, value: -1, data: { strength: 3, halved: 2 } });
            expect(scored.components.reduce((sum, row) => sum + row.value, 0)).toBe(2);
        });

        it('stacks under the Strength cap without double counting', () => {
            // Roll 01 against 58: 5 degrees, 6 raw hits on a Strength 4 battery → 4, then Crippled → 2.
            const scored = scoreHits('macrobattery', 4, resolveGunneryTest(target, 1), true);
            expect(scored.components.map((row) => row.value)).toEqual([1, 5, -2, -2]);
            expect(scored.hits).toBe(2);
        });

        it('shows a 0 row when the halved Strength costs nothing this shot', () => {
            const scored = scoreHits('macrobattery', 3, resolveGunneryTest(target, 58), true);
            expect(scored.hits).toBe(1);
            expect(scored.components.at(-1)).toMatchObject({ labelKey: CRIPPLED_KEY, value: 0 });
        });

        it('halves a lance too ("all weapon Components")', () => {
            // Roll 01: 5 degrees, 1 + 1 = 2 lance hits; Strength 3 Crippled is 2, Strength 2 Crippled is 1.
            expect(scoreHits('lance', 3, resolveGunneryTest(target, 1), true).hits).toBe(2);
            expect(scoreHits('lance', 2, resolveGunneryTest(target, 1), true).hits).toBe(1);
        });

        it('adds nothing to a miss', () => {
            expect(scoreHits('macrobattery', 3, resolveGunneryTest(target, 90), true)).toEqual({ components: [], hits: 0 });
        });
    });

    it('lets each raised void shield cancel one hit, then overload', () => {
        expect(applyVoidShields(3, 1)).toEqual({ cancelled: 1, remaining: 2 });
        expect(applyVoidShields(1, 2)).toEqual({ cancelled: 1, remaining: 0 });
        expect(applyVoidShields(2, 0)).toEqual({ cancelled: 0, remaining: 2 });
        expect(voidShieldComponents({ cancelled: 1, remaining: 2 }, { name: 'Raider', shieldsUp: 1 })).toEqual([
            { labelKey: 'WH40K.Voidcraft.Fire.Component.VoidShields', value: -1, data: { ship: 'Raider', shields: 1 } },
        ]);
        expect(voidShieldComponents({ cancelled: 0, remaining: 2 }, { name: 'Raider', shieldsUp: 0 })).toEqual([]);
    });

    it('sums macrobattery hits and subtracts Armour once (16 vs 15 is one point)', () => {
        const damage = resolveHullDamage(
            'macrobattery',
            [
                { total: 9, formula: '1d10' },
                { total: 7, formula: '1d10' },
            ],
            raider,
            false,
        );
        expect(damage.hullLoss).toBe(1);
        expect(damage.components.map((row) => row.value)).toEqual([9, 7, -15]);
    });

    it('never lets Armour push damage below zero', () => {
        const damage = resolveHullDamage('macrobattery', [{ total: 6, formula: '1d10' }], raider, false);
        expect(damage.hullLoss).toBe(0);
        expect(damage.components.map((row) => row.value)).toEqual([6, -6]);
    });

    it('lands every lance hit in full, Armour ignored (the 9-damage lance)', () => {
        const damage = resolveHullDamage('lance', [{ total: 9, formula: '1d10+4' }], raider, true);
        expect(damage.hullLoss).toBe(9);
        expect(damage.components.at(-1)).toEqual({ labelKey: 'WH40K.Voidcraft.Fire.Component.ArmourIgnored', value: 0, data: { ship: 'Raider', armour: 15 } });
    });

    it('causes a Critical Hit when the degrees reach the Crit Rating, with 1 automatic point if nothing got through', () => {
        const target = composeGunneryTest({ ballisticSkill: 48, shipModifiers: [], band: 'close', range: 6 });
        expect(isShipCriticalHit(resolveGunneryTest(target, 11), 4)).toBe(true);
        expect(isShipCriticalHit(resolveGunneryTest(target, 29), 4)).toBe(false);
        expect(isShipCriticalHit(resolveGunneryTest(target, 11), 0)).toBe(false);
        const shielded = resolveHullDamage('lance', [], raider, true);
        expect(shielded.hullLoss).toBe(1);
        expect(shielded.components).toEqual([{ labelKey: 'WH40K.Voidcraft.Fire.Component.CriticalPoint', value: 1 }]);
        const stopped = resolveHullDamage('macrobattery', [{ total: 4, formula: '1d10' }], raider, true);
        expect(stopped.hullLoss).toBe(1);
        const through = resolveHullDamage('macrobattery', [{ total: 18, formula: '1d10' }], raider, true);
        expect(through.hullLoss).toBe(3);
        expect(through.components.map((row) => row.labelKey)).not.toContain('WH40K.Voidcraft.Fire.Component.CriticalPoint');
    });
});

describe('ship-weapon-fire — macrobattery salvos (RT Core p.221–222)', () => {
    const raider = { name: 'Raider', armour: 15 };
    const target = composeGunneryTest({ ballisticSkill: 48, shipModifiers: [], band: 'close', range: 6 });
    const battery = (name: string, damage: string, strength: number, roll: number, crit = 4): SalvoBatteryShot => {
        const test = resolveGunneryTest(target, roll);
        return { name, damage, crit, test, scored: scoreHits('macrobattery', strength, test, false) };
    };

    it('averages a ship weapon Damage formula, and never defaults to discarding an unreadable one', () => {
        expect(averageDamage('1d10')).toBe(5.5);
        expect(averageDamage('2d10')).toBe(11);
        expect(averageDamage('1d10+2')).toBe(7.5);
        expect(averageDamage('d5 - 1')).toBe(2);
        expect(averageDamage('3')).toBe(3);
        expect(averageDamage('1d10x')).toBe(Number.POSITIVE_INFINITY);
        expect(averageDamage('')).toBe(Number.POSITIVE_INFINITY);
    });

    it('defaults the shields to the battery whose hits are worth least, first listed on a tie', () => {
        expect(defaultShieldedBattery([{ damage: '2d10' }, { damage: '1d10+2' }, { damage: '1d10' }])).toBe(2);
        expect(defaultShieldedBattery([{ damage: '1d10' }, { damage: '1d10' }])).toBe(0);
    });

    it('spends the shields on the attacker’s chosen battery first, then the cheapest', () => {
        const pool = [
            { damage: '2d10', hits: 2 },
            { damage: '1d10', hits: 1 },
            { damage: '1d10+2', hits: 3 },
        ];
        // "the attacker chooses which hits are discarded by the void shields" (p.222).
        const lost = (shields: number, first: number): number[] => allocateSalvoShields(pool, shields, first).map((entry) => entry.cancelled);
        expect(lost(2, 1)).toEqual([0, 1, 1]);
        expect(lost(2, 0)).toEqual([2, 0, 0]);
        expect(lost(9, 0)).toEqual([2, 1, 3]);
        expect(lost(0, 0)).toEqual([0, 0, 0]);
        // The batteries come back in their own order, carrying their fields.
        expect(allocateSalvoShields(pool, 2, 1)[2]).toEqual({ damage: '1d10+2', hits: 3, cancelled: 1 });
    });

    it('derives the pooled hits by battery, then the shields by battery', () => {
        const batteries = [
            { ...battery('Port Battery', '1d10', 3, 29), cancelled: 1 },
            { ...battery('Broadside', '2d10', 4, 40), cancelled: 0 },
        ];
        expect(salvoHitComponents(batteries, raider)).toEqual([
            { labelKey: 'WH40K.Voidcraft.Fire.Component.SalvoBatteryHits', value: 3, data: { weapon: 'Port Battery' } },
            { labelKey: 'WH40K.Voidcraft.Fire.Component.SalvoBatteryHits', value: 2, data: { weapon: 'Broadside' } },
            { labelKey: 'WH40K.Voidcraft.Fire.Component.SalvoShields', value: -1, data: { ship: 'Raider', weapon: 'Port Battery' } },
        ]);
    });

    it('adds every battery’s hits into one total and subtracts Armour once', () => {
        const damage = resolveHullDamage(
            'macrobattery',
            [
                { total: 6, formula: '1d10', weapon: 'Port Battery' },
                { total: 12, formula: '2d10', weapon: 'Broadside' },
            ],
            raider,
            false,
        );
        // Separately, 6 and 12 each fail to pass Armour 15; combined, 18 − 15 = 3.
        expect(damage.hullLoss).toBe(3);
        expect(damage.components.filter((row) => row.labelKey === 'WH40K.Voidcraft.Fire.Component.Armour')).toHaveLength(1);
        expect(damage.components[0]).toEqual({
            labelKey: 'WH40K.Voidcraft.Fire.Component.SalvoHitDamage',
            value: 6,
            data: { hit: 1, formula: '1d10', weapon: 'Port Battery' },
        });
    });

    it('causes at most one Critical Hit, when any battery met its Crit Rating', () => {
        expect(isSalvoCriticalHit([battery('A', '1d10', 3, 1), battery('B', '1d10', 3, 1)])).toBe(true);
        expect(isSalvoCriticalHit([battery('A', '1d10', 3, 29), battery('B', '1d10', 3, 1)])).toBe(true);
        expect(isSalvoCriticalHit([battery('A', '1d10', 3, 29), battery('B', '1d10', 3, 40)])).toBe(false);
    });
});
