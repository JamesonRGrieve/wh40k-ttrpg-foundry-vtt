import { describe, expect, it } from 'vitest';
import { OW_ACQUISITION_LADDER, OW_LOGISTICS_FRONT_CONDITIONS } from '../config/game-systems/ow-config.ts';
import { AVAILABILITY_KEYS, type AvailabilityKey } from './acquisition-ladder.ts';
import {
    FRONT_TIME_KEYS,
    OW_DEFAULT_LOGISTICS_RATING,
    OW_MUNITORUM_INFLUENCE_BONUS,
    TROOP_COUNT_KEYS,
    WAR_CONDITION_KEYS,
    computeLogisticsTarget,
    logisticsContextFor,
    logisticsFrontFrom,
    logisticsStandingFrom,
    OW_DEFAULT_FRONT,
    resolveLogisticsTest,
    type LogisticsContext,
    type LogisticsTarget,
    type LogisticsTestTarget,
} from './ow-logistics';

/**
 * Context whose every modifier is 0 (Common availability in the Company or
 * Less column, 3–6 Months twice, Common craftsmanship) except War Conditions,
 * which prints no +0 row: Violent Impasse (−10) is used and asserted.
 */
function baseline(overrides: Partial<LogisticsContext> = {}): LogisticsContext {
    return {
        rating: OW_DEFAULT_LOGISTICS_RATING,
        munitorum: false,
        situational: 0,
        availability: 'common',
        troopCount: 'company',
        timeInFront: 'months3to6',
        frontActive: 'months3to6',
        warCondition: 'violentImpasse',
        standardKit: false,
        craftsmanship: 'common',
        ...overrides,
    };
}

function expectTest(result: LogisticsTarget): LogisticsTestTarget {
    if (result.kind !== 'test') throw new Error(`expected a rollable test, got ${result.kind}`);
    return result;
}

type Cell = number | 'automatic' | 'discretion';

/** OW's "Difficulty by Number of Troops" table, as printed. */
const TABLE_6_2: Readonly<Record<AvailabilityKey, readonly [Cell, Cell, Cell]>> = {
    ubiquitous: [30, 'automatic', 'automatic'],
    abundant: [20, 30, 'automatic'],
    plentiful: [10, 20, 30],
    common: [0, 10, 20],
    average: [-10, 0, 10],
    scarce: [-20, -10, 0],
    rare: [-30, -20, -10],
    veryRare: [-40, -30, -20],
    extremelyRare: [-50, -40, -30],
    nearUnique: [-60, -50, -40],
    unique: ['discretion', -60, -50],
};

describe('OW Squad Logistics Rating constants', () => {
    it('default Logistics Rating is 10', () => {
        expect(OW_DEFAULT_LOGISTICS_RATING).toBe(10);
    });

    it('Munitorum Influence Talent grants +5', () => {
        expect(OW_MUNITORUM_INFLUENCE_BONUS).toBe(5);
    });

    it('standard kit of a deployed regiment grants +20', () => {
        expect(OW_LOGISTICS_FRONT_CONDITIONS.standardKit).toBe(20);
    });
});

describe('Difficulty by Number of Troops', () => {
    it('prints exactly three troop columns: Company or Less, Single Regiment, Multiple Regiments', () => {
        expect(TROOP_COUNT_KEYS).toEqual(['company', 'regiment', 'regiments']);
        expect(Object.keys(OW_LOGISTICS_FRONT_CONDITIONS.availabilityByTroops).sort()).toEqual([...TROOP_COUNT_KEYS].sort());
    });

    it('the Company or Less column is the line ladder itself (one copy)', () => {
        expect(OW_LOGISTICS_FRONT_CONDITIONS.availabilityByTroops.company).toBe(OW_ACQUISITION_LADDER.availability);
    });

    const cells = AVAILABILITY_KEYS.flatMap((availability) =>
        TROOP_COUNT_KEYS.map((troopCount, column) => ({ availability, troopCount, printed: TABLE_6_2[availability][column] })),
    );

    it.each(cells)('$availability / $troopCount is stored as printed', ({ availability, troopCount, printed }) => {
        expect(OW_LOGISTICS_FRONT_CONDITIONS.availabilityByTroops[troopCount][availability]).toBe(printed);
    });

    it.each(cells.filter((cell) => typeof cell.printed === 'number'))(
        '$availability / $troopCount adds $printed to the test',
        ({ availability, troopCount, printed }) => {
            expect(expectTest(computeLogisticsTarget(baseline({ availability, troopCount }))).breakdown.availability).toBe(printed);
        },
    );

    it.each(cells.filter((cell) => typeof cell.printed !== 'number'))(
        '$availability / $troopCount resolves as $printed',
        ({ availability, troopCount, printed }) => {
            expect(computeLogisticsTarget(baseline({ availability, troopCount }))).toEqual({ kind: printed });
        },
    );

    it('the item availability moves the target (no longer ignored)', () => {
        const common = expectTest(computeLogisticsTarget(baseline({ rating: 50 }))).target;
        const veryRare = expectTest(computeLogisticsTarget(baseline({ rating: 50, availability: 'veryRare' }))).target;
        expect(common - veryRare).toBe(40);
    });

    it('an Automatic cell resolves without a roll, whatever the other modifiers', () => {
        const ctx = baseline({ availability: 'ubiquitous', troopCount: 'regiment', craftsmanship: 'best', warCondition: 'losingBadly' });
        expect(computeLogisticsTarget(ctx)).toEqual({ kind: 'automatic' });
    });

    it('a GM’s Discretion cell is never a rollable test', () => {
        expect(computeLogisticsTarget(baseline({ availability: 'unique', troopCount: 'company' }))).toEqual({ kind: 'discretion' });
    });
});

describe('Difficulty by Number of Troops — front-condition rows', () => {
    const PRINTED_TIME = [-10, 0, 10, 20, 30];

    it.each(FRONT_TIME_KEYS.map((key, index) => [key, PRINTED_TIME[index]] as const))('Time Spent in Front and Front Active %s = %i', (key, expected) => {
        expect(OW_LOGISTICS_FRONT_CONDITIONS.timeInFront[key]).toBe(expected);
        expect(OW_LOGISTICS_FRONT_CONDITIONS.frontActive[key]).toBe(expected);
        expect(expectTest(computeLogisticsTarget(baseline({ timeInFront: key }))).breakdown.timeInFront).toBe(expected);
        expect(expectTest(computeLogisticsTarget(baseline({ frontActive: key }))).breakdown.frontActive).toBe(expected);
    });

    const PRINTED_WAR = [-30, -20, -10, 30, 10, 20];

    it.each(WAR_CONDITION_KEYS.map((key, index) => [key, PRINTED_WAR[index]] as const))('War Conditions %s = %i', (key, expected) => {
        expect(OW_LOGISTICS_FRONT_CONDITIONS.warCondition[key]).toBe(expected);
        expect(expectTest(computeLogisticsTarget(baseline({ warCondition: key }))).breakdown.warCondition).toBe(expected);
    });

    it('prints every row once, in book order', () => {
        expect(Object.keys(OW_LOGISTICS_FRONT_CONDITIONS.timeInFront)).toEqual([...FRONT_TIME_KEYS]);
        expect(Object.keys(OW_LOGISTICS_FRONT_CONDITIONS.frontActive)).toEqual([...FRONT_TIME_KEYS]);
        expect(Object.keys(OW_LOGISTICS_FRONT_CONDITIONS.warCondition)).toEqual([...WAR_CONDITION_KEYS]);
    });
});

describe('computeLogisticsTarget — flat bonuses and craftsmanship', () => {
    it('the baseline lands at the rating plus Violent Impasse (−10)', () => {
        const { target, breakdown } = expectTest(computeLogisticsTarget(baseline({ rating: 30 })));
        expect(breakdown).toEqual({
            rating: 30,
            munitorum: 0,
            situational: 0,
            availability: 0,
            timeInFront: 0,
            frontActive: 0,
            warCondition: -10,
            standardKit: 0,
            craftsmanship: 0,
        });
        expect(target).toBe(20);
    });

    it('Munitorum, situational and standard kit stack', () => {
        const { target, breakdown } = expectTest(computeLogisticsTarget(baseline({ rating: 30, munitorum: true, situational: -5, standardKit: true })));
        expect(breakdown.munitorum).toBe(5);
        expect(breakdown.situational).toBe(-5);
        expect(breakdown.standardKit).toBe(20);
        expect(target).toBe(30 + 5 - 5 + 20 - 10);
    });

    it.each([
        ['poor', 20],
        ['common', 0],
        ['good', -30],
        ['best', -50],
    ] as const)('craftsmanship table: %s = %i', (craftsmanship, expected) => {
        expect(expectTest(computeLogisticsTarget(baseline({ craftsmanship }))).breakdown.craftsmanship).toBe(expected);
    });

    it('clamps the target to 0', () => {
        expect(expectTest(computeLogisticsTarget(baseline({ rating: 5, craftsmanship: 'best', warCondition: 'losingBadly' }))).target).toBe(0);
    });

    it('a negative sum keeps its raw value and says the clamp fired, for the derivation to show (#701)', () => {
        const test = expectTest(computeLogisticsTarget(baseline({ rating: 5, craftsmanship: 'best', warCondition: 'losingBadly' })));
        const sum = Object.values(test.breakdown).reduce((total, value) => total + value, 0);
        expect(sum).toBeLessThan(0);
        expect(test).toMatchObject({ target: 0, rawSum: sum, clamped: true });
    });

    it('a non-negative sum is the target, unclamped', () => {
        const test = expectTest(computeLogisticsTarget(baseline({ rating: 50 })));
        expect(test.clamped).toBe(false);
        expect(test.rawSum).toBe(test.target);
    });
});

describe('computeLogisticsTarget — the printed worked example', () => {
    it('Very Rare plasma gun, five regiments, just deployed, century-old front, Violent Impasse, another regiment’s kit: difficulty +10', () => {
        const { target, breakdown } = expectTest(
            computeLogisticsTarget(
                baseline({
                    rating: 0,
                    availability: 'veryRare',
                    troopCount: 'regiments',
                    timeInFront: 'under3Months',
                    frontActive: 'years5plus',
                    warCondition: 'violentImpasse',
                    standardKit: true,
                }),
            ),
        );
        expect(breakdown.availability).toBe(-20);
        expect(breakdown.timeInFront).toBe(-10);
        expect(breakdown.frontActive).toBe(30);
        expect(breakdown.warCondition).toBe(-10);
        expect(breakdown.standardKit).toBe(20);
        // "−20 + −10 + 30 + −10 + 20 = Ordinary (+10)" on top of the rating.
        expect(target).toBe(10);
    });
});

describe('resolveLogisticsTest', () => {
    const test40 = (): LogisticsTestTarget => expectTest(computeLogisticsTarget(baseline({ rating: 50 })));

    it('returns success with DoS when the roll is well below the target', () => {
        const result = resolveLogisticsTest(test40(), 12);
        expect(result.target).toBe(40);
        expect(result.success).toBe(true);
        expect(result.degreesOfSuccess).toBe(2);
        expect(result.degreesOfFailure).toBe(0);
    });

    it('a roll equal to the target succeeds with 0 DoS', () => {
        const result = resolveLogisticsTest(test40(), 40);
        expect(result.success).toBe(true);
        expect(result.degreesOfSuccess).toBe(0);
    });

    it('a marginal failure has 0 DoF', () => {
        const result = resolveLogisticsTest(test40(), 41);
        expect(result.success).toBe(false);
        expect(result.degreesOfFailure).toBe(0);
    });

    it('returns failure with DoF when the roll is well above the target', () => {
        const result = resolveLogisticsTest(test40(), 73);
        expect(result.success).toBe(false);
        expect(result.degreesOfFailure).toBe(3);
    });

    it('carries the test breakdown through', () => {
        const test = test40();
        expect(resolveLogisticsTest(test, 1).breakdown).toBe(test.breakdown);
    });
});

describe('the squad’s persisted standing (#496)', () => {
    it('defaults the front to Company or Less, 3–6 Months twice, Violent Impasse', () => {
        expect(OW_DEFAULT_FRONT).toEqual({ troopCount: 'company', timeInFront: 'months3to6', frontActive: 'months3to6', warCondition: 'violentImpasse' });
        expect(logisticsFrontFrom(undefined)).toEqual(OW_DEFAULT_FRONT);
    });

    it('keeps every stored row it knows and defaults the unknown or missing ones', () => {
        expect(logisticsFrontFrom({ troopCount: 'regiments', timeInFront: 'bogus', warCondition: 'dominant' })).toEqual({
            troopCount: 'regiments',
            timeInFront: 'months3to6',
            frontActive: 'months3to6',
            warCondition: 'dominant',
        });
    });

    it('reads the rating, Munitorum and situational, defaulting a fresh squad', () => {
        expect(logisticsStandingFrom({})).toEqual({ rating: 10, munitorum: false, situational: 0, front: OW_DEFAULT_FRONT });
        expect(logisticsStandingFrom({ logisticsRating: 25, munitorum: true, situational: -5 })).toMatchObject({
            rating: 25,
            munitorum: true,
            situational: -5,
        });
    });

    it('builds the full test context from a standing plus a request', () => {
        const standing = logisticsStandingFrom({ logisticsRating: 25, logisticsFront: { troopCount: 'regiment' } });
        expect(logisticsContextFor(standing, { availability: 'rare', craftsmanship: 'good', standardKit: true })).toEqual(
            baseline({ rating: 25, availability: 'rare', troopCount: 'regiment', craftsmanship: 'good', standardKit: true }),
        );
    });
});
