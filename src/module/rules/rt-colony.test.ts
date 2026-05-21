import { describe, expect, it } from 'vitest';
import {
    AP_PER_CHARACTERISTIC_POINT,
    COLONY_AFFECTIVE_KEYS,
    COLONY_CHARACTERISTICS,
    COLONY_CHARACTERISTIC_KEYS,
    COLONY_SIZE_TIERS,
    ENDEAVOUR_THEME_MAPPING,
    REFERENCE_COLONY_TYPES,
    type ColonyState,
    activeColonyEffects,
    applyEndeavours,
    applyPfValueAdjustment,
    clampCharacteristic,
    leadershipPfValueModifier,
    profitFactorValueAdjustment,
    resolveColonyGrowth,
    tierForSize,
} from './rt-colony';

/* -------------------------------------------------------------- */
/*  Seeded RNG                                                    */
/* -------------------------------------------------------------- */

/** Constant-value RNG — every call returns the same number in [0,1). */
function fixed(...values: number[]): () => number {
    let i = 0;
    return () => {
        const v = values[i % values.length] ?? 0;
        i += 1;
        return v;
    };
}

const BASE: ColonyState = { size: 3, complacency: 2, order: 2, productivity: 2, piety: 2 };

/* -------------------------------------------------------------- */
/*  Characteristic registry                                       */
/* -------------------------------------------------------------- */

describe('Colony Characteristic registry (Stars-of-Inequity §"Colony Characteristics")', () => {
    it('lists Size + four affective stats', () => {
        expect(COLONY_CHARACTERISTIC_KEYS).toEqual(['size', 'complacency', 'order', 'productivity', 'piety']);
        expect(COLONY_AFFECTIVE_KEYS).toEqual(['complacency', 'order', 'productivity', 'piety']);
    });

    it('Size is bounded 0..10', () => {
        expect(COLONY_CHARACTERISTICS.size.min).toBe(0);
        expect(COLONY_CHARACTERISTICS.size.max).toBe(10);
    });

    it('every characteristic spec has an i18n label key under WH40K.RT.Colony.Characteristic.*', () => {
        for (const key of COLONY_CHARACTERISTIC_KEYS) {
            const spec = COLONY_CHARACTERISTICS[key];
            expect(spec.labelKey.startsWith('WH40K.RT.Colony.Characteristic.')).toBe(true);
        }
    });
});

describe('clampCharacteristic', () => {
    it('clamps Size at upper bound 10', () => {
        expect(clampCharacteristic('size', 15)).toBe(10);
    });
    it('clamps Size at lower bound 0', () => {
        expect(clampCharacteristic('size', -3)).toBe(0);
    });
    it('clamps Complacency at 0 (cannot fall below)', () => {
        expect(clampCharacteristic('complacency', -1)).toBe(0);
    });
    it('truncates non-integer inputs', () => {
        expect(clampCharacteristic('order', 2.9)).toBe(2);
    });
    it('returns default for NaN', () => {
        expect(clampCharacteristic('piety', Number.NaN)).toBe(COLONY_CHARACTERISTICS.piety.default);
    });
});

/* -------------------------------------------------------------- */
/*  Size tier table                                               */
/* -------------------------------------------------------------- */

describe('tierForSize (Stars-of-Inequity Table 3-2)', () => {
    it('Size 0 → Abandoned', () => {
        expect(tierForSize(0)).toBe('abandoned');
    });
    it('Size 1 → Outpost', () => {
        expect(tierForSize(1)).toBe('outpost');
    });
    it('Size 5 → Holding', () => {
        expect(tierForSize(5)).toBe('holding');
    });
    it('Size 10 → Hive', () => {
        expect(tierForSize(10)).toBe('hive');
    });
    it('clamps out-of-range Size down to 10 / up to 0', () => {
        expect(tierForSize(50)).toBe('hive');
        expect(tierForSize(-99)).toBe('abandoned');
    });
    it('has an exhaustive Size 0..10 table', () => {
        expect(COLONY_SIZE_TIERS).toHaveLength(11);
        for (let i = 0; i <= 10; i += 1) {
            const row = COLONY_SIZE_TIERS[i];
            expect(row?.size).toBe(i); // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess is false in tsconfig.test.json but true in tsconfig.json; keep ?. for production-tsconfig safety
        }
    });
});

/* -------------------------------------------------------------- */
/*  Threshold effects (RAW p.103-104)                             */
/* -------------------------------------------------------------- */

describe('activeColonyEffects — Characteristic > Size positive cascade', () => {
    it('Complacency > Size → Placated', () => {
        const s: ColonyState = { ...BASE, complacency: 5, size: 3 };
        const ids = activeColonyEffects(s).map((e) => e.id);
        expect(ids).toContain('placated');
    });
    it('Order > Size → Orderly', () => {
        const s: ColonyState = { ...BASE, order: 5, size: 3 };
        expect(activeColonyEffects(s).map((e) => e.id)).toContain('orderly');
    });
    it('Productivity > Size → Productive', () => {
        const s: ColonyState = { ...BASE, productivity: 5, size: 3 };
        expect(activeColonyEffects(s).map((e) => e.id)).toContain('productive');
    });
    it('Piety > Size → Pious', () => {
        const s: ColonyState = { ...BASE, piety: 5, size: 3 };
        expect(activeColonyEffects(s).map((e) => e.id)).toContain('pious');
    });
    it('Characteristic == Size does NOT trigger positive cascade (must be STRICTLY greater)', () => {
        const s: ColonyState = { size: 3, complacency: 3, order: 3, productivity: 3, piety: 3 };
        expect(activeColonyEffects(s)).toEqual([]);
    });
});

describe('activeColonyEffects — Characteristic at 0 negative cascade', () => {
    it('Complacency 0 → Unhappy', () => {
        const s: ColonyState = { ...BASE, complacency: 0 };
        expect(activeColonyEffects(s).map((e) => e.id)).toContain('unhappy');
    });
    it('Order 0 → Anarchy', () => {
        const s: ColonyState = { ...BASE, order: 0 };
        expect(activeColonyEffects(s).map((e) => e.id)).toContain('anarchy');
    });
    it('Productivity 0 → Idle', () => {
        const s: ColonyState = { ...BASE, productivity: 0 };
        expect(activeColonyEffects(s).map((e) => e.id)).toContain('idle');
    });
    it('Piety 0 → Apostate', () => {
        const s: ColonyState = { ...BASE, piety: 0 };
        expect(activeColonyEffects(s).map((e) => e.id)).toContain('apostate');
    });
});

/* -------------------------------------------------------------- */
/*  PF Value adjustment                                           */
/* -------------------------------------------------------------- */

describe('profitFactorValueAdjustment', () => {
    it('Placated alone = +1, factor 1', () => {
        const s: ColonyState = { size: 3, complacency: 5, order: 3, productivity: 3, piety: 3 };
        const adj = profitFactorValueAdjustment(s);
        expect(adj.delta).toBe(1);
        expect(adj.factor).toBe(1);
    });
    it('Placated + Productive = +3', () => {
        const s: ColonyState = { size: 3, complacency: 5, order: 3, productivity: 5, piety: 3 };
        const adj = profitFactorValueAdjustment(s);
        expect(adj.delta).toBe(3);
    });
    it('Anarchy zeroes factor regardless of delta', () => {
        const s: ColonyState = { size: 3, complacency: 5, order: 0, productivity: 5, piety: 3 };
        const adj = profitFactorValueAdjustment(s);
        expect(adj.factor).toBe(0);
    });
    it('Idle halves factor', () => {
        const s: ColonyState = { size: 3, complacency: 3, order: 3, productivity: 0, piety: 3 };
        const adj = profitFactorValueAdjustment(s);
        expect(adj.factor).toBe(0.5);
    });
});

describe('applyPfValueAdjustment', () => {
    it('Anarchy → 0', () => {
        expect(applyPfValueAdjustment(40, { delta: 1, factor: 0, contributors: ['anarchy'] })).toBe(0);
    });
    it('Idle halves with ceiling: ceil((40+0)*0.5) = 20', () => {
        expect(applyPfValueAdjustment(40, { delta: 0, factor: 0.5, contributors: ['idle'] })).toBe(20);
    });
    it('Idle on odd PF: ceil((41+0)*0.5) = 21', () => {
        expect(applyPfValueAdjustment(41, { delta: 0, factor: 0.5, contributors: ['idle'] })).toBe(21);
    });
    it('Placated stacks before halve: ceil((40+1)*0.5) = 21', () => {
        expect(applyPfValueAdjustment(40, { delta: 1, factor: 0.5, contributors: ['placated', 'idle'] })).toBe(21);
    });
    it('clamps negative result to 0', () => {
        expect(applyPfValueAdjustment(0, { delta: -5, factor: 1, contributors: [] })).toBe(0);
    });
});

/* -------------------------------------------------------------- */
/*  Growth tick (Table 3-3)                                       */
/* -------------------------------------------------------------- */

describe('resolveColonyGrowth (Table 3-3)', () => {
    it('rolls in the noChange band 3..7 → no Size delta', () => {
        // d10 = floor(0.45 * 10) + 1 = 5 → in 3..7
        const rng = fixed(0.45);
        const r = resolveColonyGrowth({ state: BASE, rng });
        expect(r.growthRoll).toBe(5);
        expect(r.outcome).toBe('noChange');
        expect(r.nextState).toEqual(BASE);
        expect(r.deltas).toEqual({});
    });

    it('roll 1 → decrease: Size −1 and a random non-Size stat receives the d5−3 (min 1) penalty', () => {
        // First call → d10 roll. Force a low value to land in the decrease band.
        // Seq: [d10=0.05 → 1] [pick=0.0 → complacency] [d5=0.0 → 1, penalty = max(1, 1-3) = 1]
        const rng = fixed(0.05, 0, 0);
        const r = resolveColonyGrowth({ state: BASE, rng });
        expect(r.growthRoll).toBe(1);
        expect(r.outcome).toBe('decrease');
        expect(r.nextState.size).toBe(BASE.size - 1);
        expect(r.decreasedStat).toBe('complacency');
        // complacency was 2, penalty 1 → 1
        expect(r.nextState.complacency).toBe(1);
    });

    it('roll ≥8 → increase: Size +1, no stat penalty', () => {
        const rng = fixed(0.85); // 0.85*10 → 8 → +1 Size
        const r = resolveColonyGrowth({ state: BASE, rng });
        expect(r.growthRoll).toBe(9);
        expect(r.outcome).toBe('increase');
        expect(r.nextState.size).toBe(BASE.size + 1);
        expect(r.decreasedStat).toBeNull();
    });

    it('growthModifier shifts the band — PF burn turns a roll-2 decrease into roll-2+6=8 increase', () => {
        const rng = fixed(0.15); // d10 = 2
        const r = resolveColonyGrowth({ state: BASE, rng, growthModifier: 6 });
        expect(r.growthRoll).toBe(2);
        expect(r.growthTotal).toBe(8);
        expect(r.outcome).toBe('increase');
    });

    it('agriculturalSoftener: a decrease roll re-rolls d10; 8+ saves the colony', () => {
        // Seq: [d10=0.05 → 1, decrease] [softener d10=0.85 → 9, saves]
        const rng = fixed(0.05, 0.85);
        const r = resolveColonyGrowth({ state: BASE, rng, agriculturalSoftener: true });
        expect(r.growthRoll).toBe(1);
        expect(r.softenerRoll).toBe(9);
        expect(r.outcome).toBe('noChange');
        expect(r.nextState).toEqual(BASE);
    });

    it('agriculturalSoftener: a decrease roll re-rolls d10; <8 stays decreased', () => {
        // Seq: [d10=0.05 → 1] [softener=0.2 → 3] [pick=0 → complacency] [d5=0 → 1]
        const rng = fixed(0.05, 0.2, 0, 0);
        const r = resolveColonyGrowth({ state: BASE, rng, agriculturalSoftener: true });
        expect(r.outcome).toBe('decrease');
        expect(r.softenerRoll).toBe(3);
    });

    it('ecclesiasticalOrderSwap: when the random pick lands on order, swap to piety', () => {
        // Affective keys order: [complacency, order, productivity, piety] indices 0..3
        // pick=0.3 → idx floor(0.3*4)=1 → 'order' → swap to 'piety'.
        // Seq: [d10=0.05 → 1] [pick=0.3 → order→piety] [d5=0.9 → 5, penalty = max(1, 5-3) = 2]
        const rng = fixed(0.05, 0.3, 0.9);
        const r = resolveColonyGrowth({ state: BASE, rng, ecclesiasticalOrderSwap: true });
        expect(r.outcome).toBe('decrease');
        expect(r.decreasedStat).toBe('piety');
        // piety was 2, penalty 2 → 0
        expect(r.nextState.piety).toBe(0);
        // Order unaffected by the penalty.
        expect(r.nextState.order).toBe(BASE.order);
    });

    it('penalty floor — 1d5−3 with d5=1 → penalty 1 (not −2)', () => {
        const rng = fixed(0.05, 0, 0); // d10=1, pick=complacency, d5=1
        const r = resolveColonyGrowth({ state: BASE, rng });
        expect(r.decreasedStat).toBe('complacency');
        // complacency 2 → 1 (only −1, not −(1-3)= +2)
        expect(r.nextState.complacency).toBe(1);
    });

    it('Size cannot fall below 0', () => {
        const tiny: ColonyState = { ...BASE, size: 0 };
        const rng = fixed(0.05, 0, 0);
        const r = resolveColonyGrowth({ state: tiny, rng });
        expect(r.nextState.size).toBe(0);
    });

    it('Size cannot rise above 10', () => {
        const huge: ColonyState = { ...BASE, size: 10 };
        const rng = fixed(0.95);
        const r = resolveColonyGrowth({ state: huge, rng });
        expect(r.nextState.size).toBe(10);
        // The delta is 0 since size was already at cap; outcome is still 'increase'.
        expect(r.outcome).toBe('increase');
    });

    it('reports activeEffects of the resulting state', () => {
        const r = resolveColonyGrowth({
            state: { size: 0, complacency: 5, order: 3, productivity: 0, piety: 3 },
            rng: fixed(0.4), // d10 = 5 → noChange
        });
        // size 0 → Placated (complacency > size), Idle (productivity 0)
        expect(r.activeEffects).toContain('placated');
        expect(r.activeEffects).toContain('idle');
    });
});

/* -------------------------------------------------------------- */
/*  Endeavour application                                         */
/* -------------------------------------------------------------- */

describe('applyEndeavours — AP → Characteristic delta', () => {
    it('one 100-AP Industry Endeavour → +1 Productivity', () => {
        const r = applyEndeavours(BASE, [{ theme: 'industry', ap: 100 }]);
        expect(r.deltas).toEqual({ productivity: 1 });
        expect(r.nextState.productivity).toBe(BASE.productivity + 1);
    });
    it('one 250-AP Creed Endeavour → +2 Piety (floor 250/100)', () => {
        const r = applyEndeavours(BASE, [{ theme: 'creed', ap: 250 }]);
        expect(r.rawPoints.piety).toBe(2);
        expect(r.deltas.piety).toBe(2);
    });
    it('mixed themes split correctly', () => {
        const r = applyEndeavours(BASE, [
            { theme: 'industry', ap: 100 },
            { theme: 'creed', ap: 100 },
            { theme: 'military', ap: 100 },
            { theme: 'trade', ap: 200 },
        ]);
        expect(r.rawPoints).toEqual({ productivity: 1, piety: 1, order: 1, complacency: 2 });
    });
    it('sub-100 AP yields 0 — no fractional points', () => {
        const r = applyEndeavours(BASE, [{ theme: 'industry', ap: 99 }]);
        expect(r.deltas).toEqual({});
    });
    it('negative AP is treated as 0', () => {
        const r = applyEndeavours(BASE, [{ theme: 'industry', ap: -500 }]);
        expect(r.deltas).toEqual({});
    });
    it('clamps the affective stat at its plumbing cap (99)', () => {
        const r = applyEndeavours({ ...BASE, complacency: 98 }, [{ theme: 'trade', ap: 1000 }]);
        // 98 + 10 = 108 → clamped to 99 → delta = 1
        expect(r.nextState.complacency).toBe(99);
        expect(r.deltas.complacency).toBe(1);
    });
    it('multiple Endeavours of the same theme accumulate', () => {
        const r = applyEndeavours(BASE, [
            { theme: 'industry', ap: 100 },
            { theme: 'industry', ap: 100 },
            { theme: 'industry', ap: 100 },
        ]);
        expect(r.deltas.productivity).toBe(3);
    });
    it('AP divisor is 100', () => {
        expect(AP_PER_CHARACTERISTIC_POINT).toBe(100);
    });
    it('reports active effects of the resulting state', () => {
        const state: ColonyState = { size: 3, complacency: 3, order: 3, productivity: 3, piety: 3 };
        const r = applyEndeavours(state, [{ theme: 'industry', ap: 200 }]);
        // Productivity goes 3 → 5 (Size still 3) → 'productive'
        expect(r.activeEffects).toContain('productive');
    });
});

describe('ENDEAVOUR_THEME_MAPPING completeness', () => {
    it('every theme maps to an affective stat', () => {
        for (const [, stat] of Object.entries(ENDEAVOUR_THEME_MAPPING)) {
            expect(COLONY_AFFECTIVE_KEYS).toContain(stat);
        }
    });
});

/* -------------------------------------------------------------- */
/*  Leadership table                                              */
/* -------------------------------------------------------------- */

describe('leadershipPfValueModifier (Table 3-4)', () => {
    it('bonus ≤ 2 → −2', () => {
        expect(leadershipPfValueModifier({ intBonus: 1, perBonus: 2, felBonus: 0 })).toBe(-2);
    });
    it('bonus 3 → −1', () => {
        expect(leadershipPfValueModifier({ intBonus: 3, perBonus: 2, felBonus: 1 })).toBe(-1);
    });
    it('bonus 4 → 0', () => {
        expect(leadershipPfValueModifier({ intBonus: 4, perBonus: 2, felBonus: 1 })).toBe(0);
    });
    it('bonus 5 → +1', () => {
        expect(leadershipPfValueModifier({ intBonus: 2, perBonus: 5, felBonus: 1 })).toBe(1);
    });
    it('bonus 6 → +2', () => {
        expect(leadershipPfValueModifier({ intBonus: 2, perBonus: 4, felBonus: 6 })).toBe(2);
    });
    it('bonus 7+ clamps at +2 (table tops out at 6)', () => {
        expect(leadershipPfValueModifier({ intBonus: 9, perBonus: 4, felBonus: 6 })).toBe(2);
    });
    it('takes the highest of the three bonuses', () => {
        expect(leadershipPfValueModifier({ intBonus: 3, perBonus: 5, felBonus: 1 })).toBe(1);
    });
});

/* -------------------------------------------------------------- */
/*  Reference Colony Types                                        */
/* -------------------------------------------------------------- */

describe('REFERENCE_COLONY_TYPES (spot-check RAW founding states)', () => {
    it('Research Mission starts Size 1, Complacency 2, all else 1', () => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: false in tsconfig.test.json, true in tsconfig.json
        expect(REFERENCE_COLONY_TYPES['research-mission']?.starting).toEqual({
            size: 1,
            complacency: 2,
            productivity: 1,
            order: 1,
            piety: 1,
        });
    });
    it('Mining and Industry starts Productivity 2', () => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: false in tsconfig.test.json, true in tsconfig.json
        expect(REFERENCE_COLONY_TYPES['mining-industry']?.starting.productivity).toBe(2);
    });
    it('Ecclesiastical starts Order 2, Piety 2', () => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: false in tsconfig.test.json, true in tsconfig.json
        expect(REFERENCE_COLONY_TYPES['ecclesiastical']?.starting.order).toBe(2);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: false in tsconfig.test.json, true in tsconfig.json
        expect(REFERENCE_COLONY_TYPES['ecclesiastical']?.starting.piety).toBe(2);
    });
    it('Agricultural starts Order 2, Piety 1', () => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: false in tsconfig.test.json, true in tsconfig.json
        expect(REFERENCE_COLONY_TYPES['agricultural']?.starting.order).toBe(2);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: false in tsconfig.test.json, true in tsconfig.json
        expect(REFERENCE_COLONY_TYPES['agricultural']?.starting.piety).toBe(1);
    });
    it('all four reference types have unique labelKeys under WH40K.RT.Colony.Type.*', () => {
        const labels = new Set<string>(Object.values(REFERENCE_COLONY_TYPES).map((t) => t.labelKey));
        expect(labels.size).toBe(4);
        for (const l of labels) {
            expect(l.startsWith('WH40K.RT.Colony.Type.')).toBe(true);
        }
    });
});
