import { describe, expect, it } from 'vitest';
import type { DynamicModifierEntry } from '../data/shared/modifiers-template.ts';
import {
    collectDynamicComponents,
    type DynamicComponent,
    type DynamicModifierContext,
    type DynamicModifierItemLike,
    type DynamicModifierSituation,
    evaluateScale,
    hookApplies,
    modeDelta,
    resolveDynamicMagnitude,
} from './dynamic-modifiers.ts';

/* -------------------------------------------------------------------------- */
/*  Typed factories (mirror the fixture style in dynamic-modifiers.test.ts)   */
/* -------------------------------------------------------------------------- */

/** A fully-populated default hook; override only the fields under test. */
function makeHook(overrides: Partial<DynamicModifierEntry> = {}): DynamicModifierEntry {
    return {
        target: 'damage',
        targetKey: '',
        side: 'attacker',
        mode: 'add',
        value: 0,
        valueFormula: '',
        scale: { source: '', field: 'bonus', factor: 1, round: 'up', multiplier: '', min: null, max: null },
        when: 'always',
        condition: '',
        conditionValue: '',
        duration: {
            unit: 'instant',
            value: 0,
            valueFormula: '',
            sustained: false,
            upkeep: '',
            stacking: 'none',
            save: { characteristic: '', difficulty: 0 },
            aftereffect: { target: 'characteristic', targetKey: '', value: 0, valueFormula: '', durationUnit: 'instant', durationValue: 0 },
        },
        formula: '',
        label: '',
        ...overrides,
    };
}

/** A default runtime context with every scale source populated to a distinct value. */
function makeCtx(overrides: Partial<DynamicModifierContext> = {}): DynamicModifierContext {
    return {
        charBonus: { ws: 4, bs: 3, s: 5, t: 4, ag: 3, int: 2, per: 4, wp: 3, fel: 2 },
        charTotal: { ws: 45, bs: 38, s: 52, t: 41, ag: 33, int: 28, per: 47, wp: 36, fel: 29 },
        dos: 3,
        pr: 4,
        cb: 2,
        level: 3,
        penetration: 6,
        armourPoints: 5,
        ...overrides,
    };
}

/** A situation the trigger is tested against; all fields default to unset. */
function makeSituation(overrides: Partial<DynamicModifierSituation> = {}): DynamicModifierSituation {
    return { ...overrides };
}

/** Concise scale-descriptor builder. */
const scale = (o: Partial<DynamicModifierEntry['scale']>): DynamicModifierEntry['scale'] => ({
    source: '',
    field: 'bonus',
    factor: 1,
    round: 'up',
    multiplier: '',
    min: null,
    max: null,
    ...o,
});

/** An owned-item shell carrying a set of dynamic-modifier hooks. */
function item(name: string, hooks: DynamicModifierEntry[], specialization?: string): DynamicModifierItemLike {
    return { name, system: { modifiers: { dynamicModifiers: hooks }, ...(specialization !== undefined ? { specialization } : {}) } };
}

/* -------------------------------------------------------------------------- */
/*  evaluateScale — sources, fields, factors, multipliers, rounding, clamps   */
/* -------------------------------------------------------------------------- */

describe('evaluateScale — every characteristic source (bonus field)', () => {
    const cases: ReadonlyArray<[DynamicModifierEntry['scale']['source'], number]> = [
        ['ws', 4],
        ['bs', 3],
        ['s', 5],
        ['t', 4],
        ['ag', 3],
        ['int', 2],
        ['per', 4],
        ['wp', 3],
        ['fel', 2],
    ];
    for (const [source, expected] of cases) {
        it(`reads ${source} bonus verbatim at factor 1 / round none`, () => {
            expect(evaluateScale(scale({ source, field: 'bonus', factor: 1, round: 'none' }), makeCtx())).toBe(expected);
        });
    }
});

describe('evaluateScale — every characteristic source (total field)', () => {
    const cases: ReadonlyArray<[DynamicModifierEntry['scale']['source'], number]> = [
        ['ws', 45],
        ['bs', 38],
        ['s', 52],
        ['t', 41],
        ['ag', 33],
        ['int', 28],
        ['per', 47],
        ['wp', 36],
        ['fel', 29],
    ];
    for (const [source, expected] of cases) {
        it(`reads ${source} total when field is total`, () => {
            expect(evaluateScale(scale({ source, field: 'total', factor: 1, round: 'none' }), makeCtx())).toBe(expected);
        });
    }
});

describe('evaluateScale — non-characteristic (fixed) sources', () => {
    const cases: ReadonlyArray<[DynamicModifierEntry['scale']['source'], number]> = [
        ['pr', 4],
        ['cb', 2],
        ['level', 3],
        ['dos', 3],
        ['degrees', 3],
        ['penetration', 6],
        ['armourPoints', 5],
    ];
    for (const [source, expected] of cases) {
        it(`resolves the fixed source ${source} from the context`, () => {
            expect(evaluateScale(scale({ source, round: 'none' }), makeCtx())).toBe(expected);
        });
    }

    it('ignores the field selector for a fixed source (bonus vs total identical)', () => {
        expect(evaluateScale(scale({ source: 'dos', field: 'bonus', round: 'none' }), makeCtx())).toBe(3);
        expect(evaluateScale(scale({ source: 'dos', field: 'total', round: 'none' }), makeCtx())).toBe(3);
    });

    it('treats degrees as an alias of dos', () => {
        const ctx = makeCtx({ dos: 5 });
        expect(evaluateScale(scale({ source: 'degrees', round: 'none' }), ctx)).toBe(5);
        expect(evaluateScale(scale({ source: 'dos', round: 'none' }), ctx)).toBe(5);
    });
});

describe('evaluateScale — factor', () => {
    it('multiplies the source by factor', () => {
        expect(evaluateScale(scale({ source: 's', factor: 2, round: 'none' }), makeCtx())).toBe(10);
        expect(evaluateScale(scale({ source: 's', factor: 0.5, round: 'none' }), makeCtx())).toBe(2.5);
    });
    it('factor 0 zeroes the contribution', () => {
        expect(evaluateScale(scale({ source: 'ws', factor: 0, round: 'none' }), makeCtx())).toBe(0);
    });
    it('a negative factor yields a negative magnitude (a reduction)', () => {
        expect(evaluateScale(scale({ source: 't', factor: -1, round: 'none' }), makeCtx())).toBe(-4);
    });
});

describe('evaluateScale — the product-of-two-variables multiplier', () => {
    it('dos multiplier multiplies by ctx.dos (Lance = pen × DoS)', () => {
        // penetration 6 × 1 × dos 3 = 18
        expect(evaluateScale(scale({ source: 'penetration', multiplier: 'dos', round: 'none' }), makeCtx())).toBe(18);
    });
    it('degrees multiplier also multiplies by ctx.dos', () => {
        expect(evaluateScale(scale({ source: 'penetration', multiplier: 'degrees', round: 'none' }), makeCtx())).toBe(18);
    });
    it('level multiplier multiplies by ctx.level', () => {
        // s bonus 5 × 1 × level 3 = 15
        expect(evaluateScale(scale({ source: 's', multiplier: 'level', round: 'none' }), makeCtx())).toBe(15);
    });
    it('empty multiplier leaves the product untouched', () => {
        expect(evaluateScale(scale({ source: 's', multiplier: '', round: 'none' }), makeCtx())).toBe(5);
    });
    it('combines factor and multiplier (source × factor × multiplier)', () => {
        // per bonus 4 × 0.5 × dos 3 = 6
        expect(evaluateScale(scale({ source: 'per', factor: 0.5, multiplier: 'dos', round: 'none' }), makeCtx())).toBe(6);
    });
});

describe('evaluateScale — every rounding mode', () => {
    // s bonus 5 × 0.5 = 2.5 is the fractional test value.
    it('up rounds toward +infinity (ceil)', () => {
        expect(evaluateScale(scale({ source: 's', factor: 0.5, round: 'up' }), makeCtx())).toBe(3);
    });
    it('down rounds toward -infinity (floor)', () => {
        expect(evaluateScale(scale({ source: 's', factor: 0.5, round: 'down' }), makeCtx())).toBe(2);
    });
    it('nearest rounds to the closest integer', () => {
        expect(evaluateScale(scale({ source: 's', factor: 0.5, round: 'nearest' }), makeCtx())).toBe(3);
        // 4 × 0.5 = 2.0 rounds to 2 (exact, no ties here)
        expect(evaluateScale(scale({ source: 't', factor: 0.5, round: 'nearest' }), makeCtx())).toBe(2);
    });
    it('none leaves the fractional value intact', () => {
        expect(evaluateScale(scale({ source: 's', factor: 0.5, round: 'none' }), makeCtx())).toBe(2.5);
    });
    it('down of a negative fractional value floors further negative', () => {
        // t bonus 4 × -0.5 = -2 exact; use per 4 × -0.375 = -1.5 to exercise a negative fraction
        expect(evaluateScale(scale({ source: 'per', factor: -0.375, round: 'down' }), makeCtx())).toBe(-2);
        expect(evaluateScale(scale({ source: 'per', factor: -0.375, round: 'up' }), makeCtx())).toBe(-1);
    });
});

describe('evaluateScale — min / max clamps', () => {
    it('max caps the value', () => {
        expect(evaluateScale(scale({ source: 'pr', factor: 10, round: 'none', max: 20 }), makeCtx())).toBe(20);
    });
    it('min floors the value', () => {
        expect(evaluateScale(scale({ source: 'cb', factor: 0, round: 'none', min: 1 }), makeCtx())).toBe(1);
    });
    it('both clamps applied — value inside the band passes through', () => {
        expect(evaluateScale(scale({ source: 's', factor: 1, round: 'none', min: 1, max: 10 }), makeCtx())).toBe(5);
    });
    it('min of 0 clamps a negative magnitude up to 0', () => {
        expect(evaluateScale(scale({ source: 't', factor: -1, round: 'none', min: 0 }), makeCtx())).toBe(0);
    });
    it('clamps are applied after rounding', () => {
        // s 5 × 0.5 = 2.5 → ceil 3, then max 2 → 2
        expect(evaluateScale(scale({ source: 's', factor: 0.5, round: 'up', max: 2 }), makeCtx())).toBe(2);
    });
    it('null clamps impose no bound', () => {
        expect(evaluateScale(scale({ source: 'pr', factor: 100, round: 'none', min: null, max: null }), makeCtx())).toBe(400);
    });
});

describe('evaluateScale — edge cases', () => {
    it('returns 0 for the unscaled (empty source) descriptor', () => {
        expect(evaluateScale(scale({ source: '' }), makeCtx())).toBe(0);
    });
    it('reads 0 for a characteristic absent from the context', () => {
        const ctx = makeCtx({ charBonus: {}, charTotal: {} });
        expect(evaluateScale(scale({ source: 'ws', field: 'bonus', round: 'none' }), ctx)).toBe(0);
        expect(evaluateScale(scale({ source: 'fel', field: 'total', round: 'none' }), ctx)).toBe(0);
    });
});

/* -------------------------------------------------------------------------- */
/*  modeDelta — additive delta per combine mode                               */
/* -------------------------------------------------------------------------- */

describe('modeDelta — every combine mode', () => {
    it('add returns the value verbatim as a plain delta', () => {
        expect(modeDelta('add', 10, 3)).toBe(3);
        expect(modeDelta('add', 0, 7)).toBe(7);
        expect(modeDelta('add', 5, -2)).toBe(-2);
    });
    it('multiply returns base × (value − 1) so total becomes base × value', () => {
        // Melta pen×2 on base pen 6 → delta 6 → total 12
        expect(modeDelta('multiply', 6, 2)).toBe(6);
        // Lance pen×DoS(3) on base pen 6 → delta 12 → total 18
        expect(modeDelta('multiply', 6, 3)).toBe(12);
        // ×1 is a no-op delta
        expect(modeDelta('multiply', 6, 1)).toBe(0);
        // halving
        expect(modeDelta('multiply', 8, 0.5)).toBe(-4);
    });
    it('set returns value − base so total becomes value', () => {
        expect(modeDelta('set', 6, 10)).toBe(4);
        expect(modeDelta('set', 10, 4)).toBe(-6);
        expect(modeDelta('set', 0, 3)).toBe(3);
    });
    it('min returns null (a stat clamp, not a damage/pen delta)', () => {
        expect(modeDelta('min', 6, 2)).toBeNull();
    });
    it('max returns null (a stat clamp, not a damage/pen delta)', () => {
        expect(modeDelta('max', 6, 2)).toBeNull();
    });
});

/* -------------------------------------------------------------------------- */
/*  resolveDynamicMagnitude — scaled vs static                                */
/* -------------------------------------------------------------------------- */

describe('resolveDynamicMagnitude', () => {
    it('uses the static value when unscaled', () => {
        expect(resolveDynamicMagnitude(makeHook({ value: 3, scale: scale({ source: '' }) }), makeCtx())).toBe(3);
    });
    it('uses the scale when scaled, ignoring any stray static value', () => {
        expect(resolveDynamicMagnitude(makeHook({ value: 99, scale: scale({ source: 'per', factor: 0.5, round: 'up' }) }), makeCtx())).toBe(2);
    });
    it('returns the static value even when it is 0 (dice-deferred magnitude)', () => {
        expect(resolveDynamicMagnitude(makeHook({ value: 0, valueFormula: '1d10', scale: scale({ source: '' }) }), makeCtx())).toBe(0);
    });
    it('threads the full scale pipeline (factor, multiplier, round, clamp)', () => {
        const hook = makeHook({ scale: scale({ source: 'penetration', multiplier: 'dos', round: 'none', max: 12 }) });
        // 6 × 1 × 3 = 18, clamped to 12
        expect(resolveDynamicMagnitude(hook, makeCtx())).toBe(12);
    });
});

/* -------------------------------------------------------------------------- */
/*  hookApplies — timing (when) predicates                                    */
/* -------------------------------------------------------------------------- */

describe('hookApplies — when timing', () => {
    it('always fires unconditionally', () => {
        expect(hookApplies(makeHook({ when: 'always' }), makeSituation())).toBe(true);
        expect(hookApplies(makeHook({ when: 'always' }), makeSituation({ isCrit: false }))).toBe(true);
    });
    it('onHit fires unconditionally (a hit is the baseline)', () => {
        expect(hookApplies(makeHook({ when: 'onHit' }), makeSituation())).toBe(true);
    });
    it('onCrit gates on isCrit', () => {
        expect(hookApplies(makeHook({ when: 'onCrit' }), makeSituation({ isCrit: true }))).toBe(true);
        expect(hookApplies(makeHook({ when: 'onCrit' }), makeSituation({ isCrit: false }))).toBe(false);
        expect(hookApplies(makeHook({ when: 'onCrit' }), makeSituation())).toBe(false);
    });
    it('onKill gates on isKill', () => {
        expect(hookApplies(makeHook({ when: 'onKill' }), makeSituation({ isKill: true }))).toBe(true);
        expect(hookApplies(makeHook({ when: 'onKill' }), makeSituation({ isKill: false }))).toBe(false);
        expect(hookApplies(makeHook({ when: 'onKill' }), makeSituation())).toBe(false);
    });
    it('onCharge gates on isCharge', () => {
        expect(hookApplies(makeHook({ when: 'onCharge' }), makeSituation({ isCharge: true }))).toBe(true);
        expect(hookApplies(makeHook({ when: 'onCharge' }), makeSituation())).toBe(false);
    });
    it('onParry gates on isParry', () => {
        expect(hookApplies(makeHook({ when: 'onParry' }), makeSituation({ isParry: true }))).toBe(true);
        expect(hookApplies(makeHook({ when: 'onParry' }), makeSituation())).toBe(false);
    });
    it('onAction matches situation.action against conditionValue', () => {
        expect(hookApplies(makeHook({ when: 'onAction', conditionValue: 'All Out Attack' }), makeSituation({ action: 'All Out Attack' }))).toBe(true);
        expect(hookApplies(makeHook({ when: 'onAction', conditionValue: 'All Out Attack' }), makeSituation({ action: 'Standard Attack' }))).toBe(false);
        expect(hookApplies(makeHook({ when: 'onAction', conditionValue: 'All Out Attack' }), makeSituation())).toBe(false);
    });
    it('onAction with an empty conditionValue fires on any action', () => {
        expect(hookApplies(makeHook({ when: 'onAction', conditionValue: '' }), makeSituation({ action: 'Anything' }))).toBe(true);
        // With no action set, an empty conditionValue still matches (the empty branch short-circuits before the action read)
        expect(hookApplies(makeHook({ when: 'onAction', conditionValue: '' }), makeSituation())).toBe(true);
    });
    it('atRangeBand matches situation.rangeBand against conditionValue', () => {
        expect(hookApplies(makeHook({ when: 'atRangeBand', conditionValue: 'point-blank' }), makeSituation({ rangeBand: 'point-blank' }))).toBe(true);
        expect(hookApplies(makeHook({ when: 'atRangeBand', conditionValue: 'point-blank' }), makeSituation({ rangeBand: 'short' }))).toBe(false);
        expect(hookApplies(makeHook({ when: 'atRangeBand', conditionValue: 'point-blank' }), makeSituation())).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/*  hookApplies — condition predicates                                        */
/* -------------------------------------------------------------------------- */

describe('hookApplies — condition predicate', () => {
    it('empty condition always matches', () => {
        expect(hookApplies(makeHook({ condition: '' }), makeSituation())).toBe(true);
    });
    it('melee gates on isMelee', () => {
        expect(hookApplies(makeHook({ condition: 'melee' }), makeSituation({ isMelee: true }))).toBe(true);
        expect(hookApplies(makeHook({ condition: 'melee' }), makeSituation({ isRanged: true }))).toBe(false);
        expect(hookApplies(makeHook({ condition: 'melee' }), makeSituation())).toBe(false);
    });
    it('ranged gates on isRanged', () => {
        expect(hookApplies(makeHook({ condition: 'ranged' }), makeSituation({ isRanged: true }))).toBe(true);
        expect(hookApplies(makeHook({ condition: 'ranged' }), makeSituation({ isMelee: true }))).toBe(false);
        expect(hookApplies(makeHook({ condition: 'ranged' }), makeSituation())).toBe(false);
    });
    it('whileState checks membership of situation.states', () => {
        expect(hookApplies(makeHook({ condition: 'whileState', conditionValue: 'aiming' }), makeSituation({ states: ['aiming', 'braced'] }))).toBe(true);
        expect(hookApplies(makeHook({ condition: 'whileState', conditionValue: 'aiming' }), makeSituation({ states: ['braced'] }))).toBe(false);
        expect(hookApplies(makeHook({ condition: 'whileState', conditionValue: 'aiming' }), makeSituation({ states: [] }))).toBe(false);
        // states unset defaults to empty
        expect(hookApplies(makeHook({ condition: 'whileState', conditionValue: 'aiming' }), makeSituation())).toBe(false);
    });
    it('vsType / vsFaction / vsAlignment all check membership of targetTags', () => {
        for (const c of ['vsType', 'vsFaction', 'vsAlignment'] as const) {
            expect(hookApplies(makeHook({ condition: c, conditionValue: 'daemon' }), makeSituation({ targetTags: ['daemon', 'chaos'] }))).toBe(true);
            expect(hookApplies(makeHook({ condition: c, conditionValue: 'daemon' }), makeSituation({ targetTags: ['ork'] }))).toBe(false);
            expect(hookApplies(makeHook({ condition: c, conditionValue: 'daemon' }), makeSituation())).toBe(false);
        }
    });
    it('rangeBand condition matches situation.rangeBand', () => {
        expect(hookApplies(makeHook({ condition: 'rangeBand', conditionValue: 'long' }), makeSituation({ rangeBand: 'long' }))).toBe(true);
        expect(hookApplies(makeHook({ condition: 'rangeBand', conditionValue: 'long' }), makeSituation({ rangeBand: 'short' }))).toBe(false);
    });
    it('action condition matches situation.action', () => {
        expect(hookApplies(makeHook({ condition: 'action', conditionValue: 'Charge' }), makeSituation({ action: 'Charge' }))).toBe(true);
        expect(hookApplies(makeHook({ condition: 'action', conditionValue: 'Charge' }), makeSituation({ action: 'Standard Attack' }))).toBe(false);
    });
    it('activated checks membership of situation.activated', () => {
        expect(hookApplies(makeHook({ condition: 'activated', conditionValue: 'eyeOfVengeance' }), makeSituation({ activated: ['eyeOfVengeance'] }))).toBe(
            true,
        );
        expect(hookApplies(makeHook({ condition: 'activated', conditionValue: 'eyeOfVengeance' }), makeSituation({ activated: [] }))).toBe(false);
        expect(hookApplies(makeHook({ condition: 'activated', conditionValue: 'eyeOfVengeance' }), makeSituation())).toBe(false);
    });
    it('an unknown condition string falls through to match (default true)', () => {
        // The final `return true` guards any condition value outside the known set.
        expect(hookApplies(makeHook({ condition: 'someFutureCondition' }), makeSituation())).toBe(true);
    });
});

describe('hookApplies — specializationMode condition', () => {
    it('item spec Melee fires on a melee attack, not a ranged one', () => {
        const hook = makeHook({ condition: 'specializationMode' });
        expect(hookApplies(hook, makeSituation({ isMelee: true }), 'Melee')).toBe(true);
        expect(hookApplies(hook, makeSituation({ isRanged: true }), 'Melee')).toBe(false);
        expect(hookApplies(hook, makeSituation(), 'Melee')).toBe(false);
    });
    it('item spec Ranged fires on a ranged attack, not a melee one', () => {
        const hook = makeHook({ condition: 'specializationMode' });
        expect(hookApplies(hook, makeSituation({ isRanged: true }), 'Ranged')).toBe(true);
        expect(hookApplies(hook, makeSituation({ isMelee: true }), 'Ranged')).toBe(false);
    });
    it('any other (or default empty) specialization never fires', () => {
        const hook = makeHook({ condition: 'specializationMode' });
        expect(hookApplies(hook, makeSituation({ isMelee: true }))).toBe(false);
        expect(hookApplies(hook, makeSituation({ isRanged: true }))).toBe(false);
        expect(hookApplies(hook, makeSituation({ isMelee: true }), 'Psychic')).toBe(false);
    });
});

describe('hookApplies — AND of both predicates', () => {
    it('requires both timing and condition to match', () => {
        const hook = makeHook({ when: 'onCrit', condition: 'ranged' });
        expect(hookApplies(hook, makeSituation({ isCrit: true, isRanged: true }))).toBe(true);
        expect(hookApplies(hook, makeSituation({ isCrit: true, isRanged: false }))).toBe(false);
        expect(hookApplies(hook, makeSituation({ isCrit: false, isRanged: true }))).toBe(false);
        expect(hookApplies(hook, makeSituation({ isCrit: false, isRanged: false }))).toBe(false);
    });
    it('always-timing still respects a failing condition', () => {
        expect(hookApplies(makeHook({ when: 'always', condition: 'melee' }), makeSituation({ isRanged: true }))).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/*  collectDynamicComponents — filtering, deferral, labelling, multiplicity   */
/* -------------------------------------------------------------------------- */

describe('collectDynamicComponents — basic behavior', () => {
    it('emits a component per firing hook with resolved value + provenance', () => {
        const items = [
            item('Crushing Blow', [makeHook({ target: 'damage', condition: 'melee', scale: scale({ source: 'ws', factor: 0.5, round: 'up' }) })]),
            item('Mighty Shot', [makeHook({ target: 'damage', condition: 'ranged', scale: scale({ source: 'bs', factor: 0.5, round: 'up' }) })]),
        ];
        const out = collectDynamicComponents(items, makeCtx(), makeSituation({ isMelee: true }));
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({
            target: 'damage',
            side: 'attacker',
            mode: 'add',
            value: 2,
            valueFormula: '',
            label: 'Crushing Blow',
            source: 'Crushing Blow',
        });
    });

    it('carries target/targetKey/side/mode through to the component', () => {
        const items = [item('Bane', [makeHook({ target: 'critReduction', targetKey: 'wounds', side: 'defender', mode: 'add', value: 5 })])];
        const out = collectDynamicComponents(items, makeCtx(), makeSituation());
        expect(out[0]).toMatchObject({ target: 'critReduction', targetKey: 'wounds', side: 'defender', mode: 'add', value: 5 });
    });

    it('skips hooks whose trigger does not fire', () => {
        const items = [item('Deathdealer', [makeHook({ when: 'onCrit', scale: scale({ source: 'per', factor: 1, round: 'none' }) })])];
        expect(collectDynamicComponents(items, makeCtx(), makeSituation({ isCrit: false }))).toEqual([]);
        expect(collectDynamicComponents(items, makeCtx(), makeSituation({ isCrit: true }))).toHaveLength(1);
    });

    it('defers a dice valueFormula (value 0, formula carried) for the caller to roll', () => {
        const items = [item('Hellfire Rounds', [makeHook({ target: 'damage', value: 0, valueFormula: '1d10' })])];
        const out = collectDynamicComponents(items, makeCtx(), makeSituation());
        expect(out[0]).toMatchObject({ value: 0, valueFormula: '1d10' });
    });

    it('does NOT defer when a scale is present — the scale wins even alongside a valueFormula', () => {
        // isDice requires source === '' AND valueFormula !== ''; a scaled hook resolves numerically.
        const items = [item('Scaled+Formula', [makeHook({ valueFormula: '1d10', scale: scale({ source: 's', factor: 1, round: 'none' }) })])];
        const out = collectDynamicComponents(items, makeCtx(), makeSituation());
        expect(out[0]).toMatchObject({ value: 5, valueFormula: '' });
    });

    it('a static-value hook (no formula, no scale) carries its value with an empty formula', () => {
        const items = [item('Flat +2', [makeHook({ value: 2 })])];
        expect(collectDynamicComponents(items, makeCtx(), makeSituation())[0]).toMatchObject({ value: 2, valueFormula: '' });
    });

    it('prefers the hook label override, falling back to the item name', () => {
        expect(collectDynamicComponents([item('Big Gun', [makeHook({ label: 'Custom Bonus', value: 1 })])], makeCtx(), makeSituation())[0]?.label).toBe(
            'Custom Bonus',
        );
        expect(collectDynamicComponents([item('Big Gun', [makeHook({ label: '', value: 1 })])], makeCtx(), makeSituation())[0]?.label).toBe('Big Gun');
    });

    it('falls back to an empty label/source when the item name is null', () => {
        const nameless: DynamicModifierItemLike = { name: null, system: { modifiers: { dynamicModifiers: [makeHook({ label: '', value: 1 })] } } };
        expect(collectDynamicComponents([nameless], makeCtx(), makeSituation())[0]).toMatchObject({ label: '', source: '' });
    });

    it('always reports source as the owning item name regardless of a label override', () => {
        const out = collectDynamicComponents([item('Power Sword', [makeHook({ label: 'Balanced', value: 1 })])], makeCtx(), makeSituation());
        expect(out[0]).toMatchObject({ label: 'Balanced', source: 'Power Sword' });
    });

    it('tolerates items with no modifiers block or no hooks', () => {
        expect(collectDynamicComponents([{ name: 'Plain', system: {} }], makeCtx(), makeSituation())).toEqual([]);
        expect(collectDynamicComponents([item('Empty', [])], makeCtx(), makeSituation())).toEqual([]);
    });

    it('emits one component per firing hook on a multi-hook item', () => {
        const items = [
            item('Eye of Vengeance', [
                makeHook({
                    target: 'damage',
                    condition: 'activated',
                    conditionValue: 'eyeOfVengeance',
                    scale: scale({ source: 'dos', factor: 1, round: 'none' }),
                }),
                makeHook({
                    target: 'penetration',
                    condition: 'activated',
                    conditionValue: 'eyeOfVengeance',
                    scale: scale({ source: 'dos', factor: 1, round: 'none' }),
                }),
            ]),
        ];
        const out = collectDynamicComponents(items, makeCtx(), makeSituation({ activated: ['eyeOfVengeance'] }));
        expect(out).toHaveLength(2);
        expect(out.map((c) => c.target)).toEqual(['damage', 'penetration']);
    });

    it('collects across multiple items, dropping the non-firing ones', () => {
        const items = [
            item('Crushing Blow', [makeHook({ condition: 'melee', scale: scale({ source: 'ws', factor: 0.5, round: 'up' }) })]),
            item('Mighty Shot', [makeHook({ condition: 'ranged', scale: scale({ source: 'bs', factor: 0.5, round: 'up' }) })]),
            item('Inert Trinket', []),
        ];
        const out = collectDynamicComponents(items, makeCtx(), makeSituation({ isRanged: true }));
        expect(out).toHaveLength(1);
        expect(out[0]?.source).toBe('Mighty Shot');
    });

    it('threads the item specialization into specializationMode (Deathdealer fires on the matching attack mode only)', () => {
        const deathdealerMelee = [
            item(
                'Deathdealer',
                [makeHook({ when: 'onCrit', condition: 'specializationMode', scale: scale({ source: 'per', factor: 1, round: 'none' }) })],
                'Melee',
            ),
        ];
        // Deathdealer (Melee) on a melee crit → fires, full Perception Bonus (ctx.per = 4).
        const melee = collectDynamicComponents(deathdealerMelee, makeCtx(), makeSituation({ isCrit: true, isMelee: true }));
        expect(melee).toHaveLength(1);
        expect(melee[0]?.value).toBe(4);
        // Deathdealer (Melee) on a ranged crit → does not fire.
        expect(collectDynamicComponents(deathdealerMelee, makeCtx(), makeSituation({ isCrit: true, isRanged: true }))).toEqual([]);
        // Deathdealer (Ranged) mirrors it.
        const deathdealerRanged = [
            item(
                'Deathdealer',
                [makeHook({ when: 'onCrit', condition: 'specializationMode', scale: scale({ source: 'per', factor: 1, round: 'none' }) })],
                'Ranged',
            ),
        ];
        expect(collectDynamicComponents(deathdealerRanged, makeCtx(), makeSituation({ isCrit: true, isRanged: true }))).toHaveLength(1);
    });
});

/* -------------------------------------------------------------------------- */
/*  End-to-end talent-shaped scenarios (real migrated hooks)                  */
/* -------------------------------------------------------------------------- */

/** Pull the single component a one-hook item is expected to produce. */
function only(components: DynamicComponent[]): DynamicComponent {
    expect(components).toHaveLength(1);
    const first = components.at(0);
    if (first === undefined) throw new Error('expected exactly one dynamic component');
    return first;
}

describe('scenario — Crushing Blow (melee damage, scale WS × 0.5 round up)', () => {
    const crushingBlow = (): DynamicModifierItemLike =>
        item('Crushing Blow', [makeHook({ target: 'damage', condition: 'melee', scale: scale({ source: 'ws', factor: 0.5, round: 'up' }) })]);

    it('adds half WS bonus (rounded up) to melee damage', () => {
        // WS bonus 4 → ceil(2) = 2
        const c = only(collectDynamicComponents([crushingBlow()], makeCtx({ charBonus: { ws: 4 } }), makeSituation({ isMelee: true })));
        expect(c).toMatchObject({ target: 'damage', mode: 'add', value: 2, source: 'Crushing Blow' });
    });
    it('rounds an odd WS bonus up', () => {
        // WS bonus 5 → ceil(2.5) = 3
        const c = only(collectDynamicComponents([crushingBlow()], makeCtx({ charBonus: { ws: 5 } }), makeSituation({ isMelee: true })));
        expect(c.value).toBe(3);
    });
    it('does not fire on a ranged attack', () => {
        expect(collectDynamicComponents([crushingBlow()], makeCtx(), makeSituation({ isRanged: true }))).toEqual([]);
    });
});

describe('scenario — Mighty Shot (ranged damage, scale BS × 0.5 round up)', () => {
    const mightyShot = (): DynamicModifierItemLike =>
        item('Mighty Shot', [makeHook({ target: 'damage', condition: 'ranged', scale: scale({ source: 'bs', factor: 0.5, round: 'up' }) })]);

    it('adds half BS bonus (rounded up) to ranged damage', () => {
        // BS bonus 3 → ceil(1.5) = 2
        const c = only(collectDynamicComponents([mightyShot()], makeCtx({ charBonus: { bs: 3 } }), makeSituation({ isRanged: true })));
        expect(c).toMatchObject({ target: 'damage', mode: 'add', value: 2, source: 'Mighty Shot' });
    });
    it('does not fire on a melee attack', () => {
        expect(collectDynamicComponents([mightyShot()], makeCtx(), makeSituation({ isMelee: true }))).toEqual([]);
    });
});

describe('scenario — Hammer Blow (penetration, scale S × 0.5, when All Out Attack)', () => {
    const hammerBlow = (): DynamicModifierItemLike =>
        item('Hammer Blow', [
            makeHook({ target: 'penetration', when: 'onAction', conditionValue: 'All Out Attack', scale: scale({ source: 's', factor: 0.5, round: 'up' }) }),
        ]);

    it('adds half SB (rounded up) to penetration on an All Out Attack', () => {
        // S bonus 5 → ceil(2.5) = 3
        const c = only(collectDynamicComponents([hammerBlow()], makeCtx({ charBonus: { s: 5 } }), makeSituation({ action: 'All Out Attack' })));
        expect(c).toMatchObject({ target: 'penetration', mode: 'add', value: 3, source: 'Hammer Blow' });
    });
    it('does not fire on any other action', () => {
        expect(collectDynamicComponents([hammerBlow()], makeCtx(), makeSituation({ action: 'Standard Attack' }))).toEqual([]);
        expect(collectDynamicComponents([hammerBlow()], makeCtx(), makeSituation())).toEqual([]);
    });
});

describe('scenario — True Grit (defender critReduction, when onCrit, scale T × 1)', () => {
    const trueGrit = (): DynamicModifierItemLike =>
        item('True Grit', [makeHook({ target: 'critReduction', side: 'defender', when: 'onCrit', scale: scale({ source: 't', factor: 1, round: 'up' }) })]);

    it('reduces incoming critical damage by TB when suffering a crit', () => {
        // T bonus 4 → 4
        const c = only(collectDynamicComponents([trueGrit()], makeCtx({ charBonus: { t: 4 } }), makeSituation({ isCrit: true })));
        expect(c).toMatchObject({ target: 'critReduction', side: 'defender', value: 4, source: 'True Grit' });
    });
    it('does not fire on a non-critical hit', () => {
        expect(collectDynamicComponents([trueGrit()], makeCtx(), makeSituation({ isCrit: false }))).toEqual([]);
    });
});

describe('scenario — Eye of Vengeance (damage + penetration, condition activated, scale DoS × 1)', () => {
    const eyeOfVengeance = (): DynamicModifierItemLike =>
        item('Eye of Vengeance', [
            makeHook({ target: 'damage', condition: 'activated', conditionValue: 'eyeOfVengeance', scale: scale({ source: 'dos', factor: 1, round: 'none' }) }),
            makeHook({
                target: 'penetration',
                condition: 'activated',
                conditionValue: 'eyeOfVengeance',
                scale: scale({ source: 'dos', factor: 1, round: 'none' }),
            }),
        ]);

    it('adds DoS to both damage and penetration when activated', () => {
        const out = collectDynamicComponents([eyeOfVengeance()], makeCtx({ dos: 4 }), makeSituation({ activated: ['eyeOfVengeance'] }));
        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({ target: 'damage', value: 4 });
        expect(out[1]).toMatchObject({ target: 'penetration', value: 4 });
    });
    it('contributes nothing when not activated this roll', () => {
        expect(collectDynamicComponents([eyeOfVengeance()], makeCtx(), makeSituation({ activated: [] }))).toEqual([]);
    });
});

describe('scenario — Deathdealer (damage, when onCrit, scale PER × 1, condition specializationMode)', () => {
    // The specializationMode dimension is only reachable via hookApplies (the collector does not
    // thread item specialization); the onCrit + PER-scale dimension is proven via the collector.
    const deathdealerHook = (): DynamicModifierEntry =>
        makeHook({ target: 'damage', when: 'onCrit', condition: 'specializationMode', scale: scale({ source: 'per', factor: 1, round: 'up' }) });

    it('Melee specialization fires on a melee crit, not a ranged one', () => {
        const hook = deathdealerHook();
        expect(hookApplies(hook, makeSituation({ isCrit: true, isMelee: true }), 'Melee')).toBe(true);
        expect(hookApplies(hook, makeSituation({ isCrit: true, isRanged: true }), 'Melee')).toBe(false);
    });
    it('Ranged specialization fires on a ranged crit, not a melee one', () => {
        const hook = deathdealerHook();
        expect(hookApplies(hook, makeSituation({ isCrit: true, isRanged: true }), 'Ranged')).toBe(true);
        expect(hookApplies(hook, makeSituation({ isCrit: true, isMelee: true }), 'Ranged')).toBe(false);
    });
    it('does not fire on a non-crit even when the specialization matches', () => {
        expect(hookApplies(deathdealerHook(), makeSituation({ isCrit: false, isMelee: true }), 'Melee')).toBe(false);
    });
    it('resolves PER bonus as the damage magnitude when it fires', () => {
        // PER bonus 4 → 4 (proven through resolveDynamicMagnitude / the scale pipeline)
        expect(resolveDynamicMagnitude(deathdealerHook(), makeCtx({ charBonus: { per: 4 } }))).toBe(4);
    });
});

describe('scenario — Melta (penetration, mode multiply, static value 2)', () => {
    const melta = (): DynamicModifierItemLike => item('Melta', [makeHook({ target: 'penetration', mode: 'multiply', value: 2 })]);

    it('emits a multiply component with value 2', () => {
        const c = only(collectDynamicComponents([melta()], makeCtx(), makeSituation()));
        expect(c).toMatchObject({ target: 'penetration', mode: 'multiply', value: 2, valueFormula: '' });
    });
    it('doubles base penetration via modeDelta (delta = base, total = base × 2)', () => {
        const c = only(collectDynamicComponents([melta()], makeCtx(), makeSituation()));
        const basePen = 6;
        const delta = modeDelta(c.mode, basePen, c.value);
        expect(delta).toBe(6);
        expect(basePen + (delta ?? 0)).toBe(12);
    });
});

describe('scenario — Lance (penetration, mode multiply, scale DoS)', () => {
    const lance = (): DynamicModifierItemLike =>
        item('Lance', [makeHook({ target: 'penetration', mode: 'multiply', scale: scale({ source: 'dos', factor: 1, round: 'none' }) })]);

    it('emits a multiply component whose value is the DoS', () => {
        const c = only(collectDynamicComponents([lance()], makeCtx({ dos: 3 }), makeSituation()));
        expect(c).toMatchObject({ target: 'penetration', mode: 'multiply', value: 3 });
    });
    it('multiplies base penetration by DoS via modeDelta (base 6, DoS 3 → total 18)', () => {
        const c = only(collectDynamicComponents([lance()], makeCtx({ dos: 3 }), makeSituation()));
        const basePen = 6;
        const delta = modeDelta(c.mode, basePen, c.value);
        expect(delta).toBe(12);
        expect(basePen + (delta ?? 0)).toBe(18);
    });
    it('scales with a different DoS (base 6, DoS 5 → total 30)', () => {
        const c = only(collectDynamicComponents([lance()], makeCtx({ dos: 5 }), makeSituation()));
        const basePen = 6;
        expect(basePen + (modeDelta(c.mode, basePen, c.value) ?? 0)).toBe(30);
    });
});
