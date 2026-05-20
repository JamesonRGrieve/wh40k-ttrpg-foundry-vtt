import { describe, expect, it } from 'vitest';
import {
    REGIMENT_BUDGET,
    REGIMENT_CATEGORIES,
    STANDARD_KIT_BUDGET,
    aggregateRegimentGrants,
    computeKitBudget,
    computeRegimentBudget,
    emptyRegimentSelection,
    type RegimentOption,
    type RegimentSelection,
} from './ow-regiment-creation';

/* -------------------------------------------------------------- */
/*  Fixtures (content-agnostic ids only)                          */
/* -------------------------------------------------------------- */

/**
 * Synthetic catalog. Ids are intentionally opaque ("hw-a", "ct-3")
 * so the test surface stays content-agnostic — the engine must not
 * care which compendium document the option originated from.
 */
const CATALOG: ReadonlyArray<RegimentOption> = [
    // Home World options.
    { id: 'hw-a', category: 'homeWorld', cost: 3, grants: { characteristics: { weaponSkill: 3 }, skills: ['skill-survival'], wounds: 1 } },
    { id: 'hw-b', category: 'homeWorld', cost: 2, grants: { characteristics: { toughness: 3 }, talents: ['talent-hardy'] } },
    // Commanding Officer options.
    { id: 'co-a', category: 'commandingOfficer', cost: 2, grants: { logistics: 5 } },
    { id: 'co-b', category: 'commandingOfficer', cost: 4, grants: { characteristics: { fellowship: 3 }, logistics: -5 } },
    // Regiment Type options.
    { id: 'rt-a', category: 'regimentType', cost: 2, grants: { skills: ['skill-stealth'], kitModifier: 0 } },
    { id: 'rt-b', category: 'regimentType', cost: 5, grants: { kitModifier: 10, wounds: 2 } },
    // Training Doctrines (multi-select).
    { id: 'td-a', category: 'trainingDoctrine', cost: 1, grants: { talents: ['talent-sprint'] } },
    { id: 'td-b', category: 'trainingDoctrine', cost: 2, grants: { characteristics: { agility: 3 } } },
    // Special Equipment Doctrines (multi-select).
    { id: 'sed-a', category: 'specialEquipmentDoctrine', cost: 1, grants: { kitModifier: 5 } },
    { id: 'sed-b', category: 'specialEquipmentDoctrine', cost: 3, grants: { kitModifier: 10 } },
    // Favoured Weapons.
    { id: 'fw-close', category: 'favouredWeapons', cost: 1, grants: { talents: ['talent-wsmastery'] } },
    { id: 'fw-ranged', category: 'favouredWeapons', cost: 1, grants: { talents: ['talent-bsmastery'] } },
];

const BLANK = emptyRegimentSelection();

/* -------------------------------------------------------------- */
/*  Constants                                                     */
/* -------------------------------------------------------------- */

describe('OW Regiment Creation constants', () => {
    it('exposes the 12-point regiment budget', () => {
        expect(REGIMENT_BUDGET).toBe(12);
    });

    it('exposes the 30-point standard kit budget', () => {
        expect(STANDARD_KIT_BUDGET).toBe(30);
    });

    it('lists all six categories in stable order', () => {
        expect(REGIMENT_CATEGORIES).toEqual([
            'homeWorld',
            'commandingOfficer',
            'regimentType',
            'trainingDoctrine',
            'specialEquipmentDoctrine',
            'favouredWeapons',
        ]);
    });
});

/* -------------------------------------------------------------- */
/*  Empty selection                                               */
/* -------------------------------------------------------------- */

describe('emptyRegimentSelection', () => {
    it('initialises arrays + empty favoured-weapons sub-slot', () => {
        const s = emptyRegimentSelection();
        expect(s.trainingDoctrines).toEqual([]);
        expect(s.specialEquipmentDoctrines).toEqual([]);
        expect(s.favouredWeapons).toEqual({});
        expect(s.homeWorld).toBeUndefined();
        expect(s.commandingOfficer).toBeUndefined();
        expect(s.regimentType).toBeUndefined();
    });
});

/* -------------------------------------------------------------- */
/*  Regiment budget                                               */
/* -------------------------------------------------------------- */

describe('computeRegimentBudget', () => {
    it('empty selection → 0 spent, invalid (under budget)', () => {
        const result = computeRegimentBudget(BLANK, CATALOG);
        expect(result.spent).toBe(0);
        expect(result.remaining).toBe(12);
        expect(result.valid).toBe(false);
    });

    it('exactly 12 spent → valid', () => {
        // 3 (hw-a) + 2 (co-a) + 2 (rt-a) + 1 (td-a) + 2 (td-b) + 1 (sed-a) + 1 (fw-close) = 12
        const selection: RegimentSelection = {
            homeWorld: 'hw-a',
            commandingOfficer: 'co-a',
            regimentType: 'rt-a',
            trainingDoctrines: ['td-a', 'td-b'],
            specialEquipmentDoctrines: ['sed-a'],
            favouredWeapons: { close: 'fw-close' },
        };
        const result = computeRegimentBudget(selection, CATALOG);
        expect(result.spent).toBe(12);
        expect(result.remaining).toBe(0);
        expect(result.valid).toBe(true);
    });

    it('over-budget → invalid with negative remaining', () => {
        // 3 + 4 + 5 + 2 = 14
        const selection: RegimentSelection = {
            homeWorld: 'hw-a',
            commandingOfficer: 'co-b',
            regimentType: 'rt-b',
            trainingDoctrines: ['td-b'],
            specialEquipmentDoctrines: [],
            favouredWeapons: {},
        };
        const result = computeRegimentBudget(selection, CATALOG);
        expect(result.spent).toBe(14);
        expect(result.remaining).toBe(-2);
        expect(result.valid).toBe(false);
    });

    it('under-budget by leftover points → invalid', () => {
        const selection: RegimentSelection = {
            homeWorld: 'hw-b', // 2
            commandingOfficer: 'co-a', // 2
            regimentType: 'rt-a', // 2
            trainingDoctrines: ['td-a'], // 1
            specialEquipmentDoctrines: [],
            favouredWeapons: {},
        };
        const result = computeRegimentBudget(selection, CATALOG);
        expect(result.spent).toBe(7);
        expect(result.remaining).toBe(5);
        expect(result.valid).toBe(false);
    });

    it('reports per-category breakdown', () => {
        const selection: RegimentSelection = {
            homeWorld: 'hw-a',
            commandingOfficer: 'co-a',
            regimentType: 'rt-a',
            trainingDoctrines: ['td-a', 'td-b'],
            specialEquipmentDoctrines: ['sed-a'],
            favouredWeapons: { close: 'fw-close', ranged: 'fw-ranged' },
        };
        const result = computeRegimentBudget(selection, CATALOG);
        expect(result.perCategory.homeWorld).toBe(3);
        expect(result.perCategory.commandingOfficer).toBe(2);
        expect(result.perCategory.regimentType).toBe(2);
        expect(result.perCategory.trainingDoctrine).toBe(3); // td-a (1) + td-b (2)
        expect(result.perCategory.specialEquipmentDoctrine).toBe(1);
        expect(result.perCategory.favouredWeapons).toBe(2); // close (1) + ranged (1)
    });

    it('different mixes of categories can hit the same total', () => {
        // Mix A: heavy in regiment type, no doctrines beyond one each.
        const a: RegimentSelection = {
            homeWorld: 'hw-b', // 2
            commandingOfficer: 'co-a', // 2
            regimentType: 'rt-b', // 5
            trainingDoctrines: ['td-a'], // 1
            specialEquipmentDoctrines: ['sed-a'], // 1
            favouredWeapons: { close: 'fw-close' }, // 1
        };
        // Mix B: heavy doctrines, cheap regiment type.
        const b: RegimentSelection = {
            homeWorld: 'hw-a', // 3
            commandingOfficer: 'co-a', // 2
            regimentType: 'rt-a', // 2
            trainingDoctrines: ['td-b'], // 2
            specialEquipmentDoctrines: ['sed-a'], // 1
            favouredWeapons: { close: 'fw-close', ranged: 'fw-ranged' }, // 2
        };
        const ra = computeRegimentBudget(a, CATALOG);
        const rb = computeRegimentBudget(b, CATALOG);
        expect(ra.spent).toBe(12);
        expect(rb.spent).toBe(12);
        expect(ra.valid).toBe(true);
        expect(rb.valid).toBe(true);
        // Yet per-category distribution differs.
        expect(ra.perCategory.regimentType).not.toBe(rb.perCategory.regimentType);
        expect(ra.perCategory.trainingDoctrine).not.toBe(rb.perCategory.trainingDoctrine);
    });

    it('silently skips unknown ids', () => {
        const selection: RegimentSelection = {
            ...BLANK,
            homeWorld: 'does-not-exist',
            commandingOfficer: 'co-a',
        };
        const result = computeRegimentBudget(selection, CATALOG);
        expect(result.spent).toBe(2);
        expect(result.perCategory.homeWorld).toBe(0);
    });
});

/* -------------------------------------------------------------- */
/*  Kit budget                                                    */
/* -------------------------------------------------------------- */

describe('computeKitBudget', () => {
    it('empty kit → 0 spent, full remaining, valid', () => {
        const result = computeKitBudget([]);
        expect(result.spent).toBe(0);
        expect(result.remaining).toBe(30);
        expect(result.valid).toBe(true);
    });

    it('under budget → valid with positive remaining', () => {
        const result = computeKitBudget([
            { id: 'lasgun', cost: 10 },
            { id: 'rations', cost: 5 },
            { id: 'flak', cost: 10 },
        ]);
        expect(result.spent).toBe(25);
        expect(result.remaining).toBe(5);
        expect(result.valid).toBe(true);
    });

    it('exactly 30 → valid', () => {
        const result = computeKitBudget([
            { id: 'a', cost: 15 },
            { id: 'b', cost: 15 },
        ]);
        expect(result.spent).toBe(30);
        expect(result.remaining).toBe(0);
        expect(result.valid).toBe(true);
    });

    it('over budget → invalid', () => {
        const result = computeKitBudget([
            { id: 'a', cost: 20 },
            { id: 'b', cost: 20 },
        ]);
        expect(result.spent).toBe(40);
        expect(result.remaining).toBe(-10);
        expect(result.valid).toBe(false);
    });

    it('kitModifier adjusts the cap (Mechanised +10)', () => {
        const result = computeKitBudget(
            [
                { id: 'a', cost: 25 },
                { id: 'b', cost: 15 },
            ],
            10,
        );
        expect(result.spent).toBe(40);
        expect(result.remaining).toBe(0);
        expect(result.valid).toBe(true);
    });

    it('kitModifier can lower the cap (Penal -10)', () => {
        const result = computeKitBudget([{ id: 'a', cost: 25 }], -10);
        // Cap = 30 + (-10) = 20.
        expect(result.spent).toBe(25);
        expect(result.remaining).toBe(-5);
        expect(result.valid).toBe(false);
    });
});

/* -------------------------------------------------------------- */
/*  Grant aggregation                                             */
/* -------------------------------------------------------------- */

describe('aggregateRegimentGrants', () => {
    it('empty selection → zero-valued grants', () => {
        const g = aggregateRegimentGrants(BLANK, CATALOG);
        expect(g.characteristics).toEqual({});
        expect(g.skills).toEqual([]);
        expect(g.talents).toEqual([]);
        expect(g.wounds).toBe(0);
        expect(g.logistics).toBe(0);
        expect(g.kitModifier).toBe(0);
    });

    it('sums characteristics across multiple options', () => {
        const selection: RegimentSelection = {
            homeWorld: 'hw-a', // weaponSkill +3
            commandingOfficer: 'co-b', // fellowship +3
            regimentType: 'rt-a',
            trainingDoctrines: ['td-b'], // agility +3
            specialEquipmentDoctrines: [],
            favouredWeapons: {},
        };
        const g = aggregateRegimentGrants(selection, CATALOG);
        expect(g.characteristics).toEqual({ weaponSkill: 3, fellowship: 3, agility: 3 });
    });

    it('concatenates skills and talents (order preserved, no dedup)', () => {
        const selection: RegimentSelection = {
            homeWorld: 'hw-a', // skills: survival
            commandingOfficer: 'co-a',
            regimentType: 'rt-a', // skills: stealth
            trainingDoctrines: ['td-a'], // talents: sprint
            specialEquipmentDoctrines: [],
            favouredWeapons: { close: 'fw-close', ranged: 'fw-ranged' }, // talents: wsmastery, bsmastery
        };
        const g = aggregateRegimentGrants(selection, CATALOG);
        expect(g.skills).toEqual(['skill-survival', 'skill-stealth']);
        expect(g.talents).toEqual(['talent-sprint', 'talent-wsmastery', 'talent-bsmastery']);
    });

    it('sums wounds, logistics, and kitModifier', () => {
        const selection: RegimentSelection = {
            homeWorld: 'hw-a', // wounds +1
            commandingOfficer: 'co-a', // logistics +5
            regimentType: 'rt-b', // kitModifier +10, wounds +2
            trainingDoctrines: [],
            specialEquipmentDoctrines: ['sed-a', 'sed-b'], // kitModifier +5, +10
            favouredWeapons: {},
        };
        const g = aggregateRegimentGrants(selection, CATALOG);
        expect(g.wounds).toBe(3);
        expect(g.logistics).toBe(5);
        expect(g.kitModifier).toBe(25);
    });

    it('opposite-sign logistics deltas sum (CO penalty cancels bonus)', () => {
        const selection: RegimentSelection = {
            ...BLANK,
            commandingOfficer: 'co-b', // logistics -5
        };
        const g = aggregateRegimentGrants(selection, CATALOG);
        expect(g.logistics).toBe(-5);
    });

    it('characteristics stack additively when same key appears twice', () => {
        const catalog: ReadonlyArray<RegimentOption> = [
            { id: 'one', category: 'trainingDoctrine', cost: 1, grants: { characteristics: { toughness: 3 } } },
            { id: 'two', category: 'specialEquipmentDoctrine', cost: 1, grants: { characteristics: { toughness: 2 } } },
        ];
        const selection: RegimentSelection = {
            ...BLANK,
            trainingDoctrines: ['one'],
            specialEquipmentDoctrines: ['two'],
        };
        const g = aggregateRegimentGrants(selection, catalog);
        expect(g.characteristics?.['toughness']).toBe(5);
    });
});
