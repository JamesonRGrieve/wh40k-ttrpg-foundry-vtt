import { describe, expect, it } from 'vitest';
import type { DynamicModifierEntry } from '../data/shared/modifiers-template.ts';
import {
    collectDynamicComponents,
    type DynamicModifierContext,
    type DynamicModifierItemLike,
    type DynamicModifierSituation,
    evaluateScale,
    hookApplies,
    modeDelta,
    resolveDynamicMagnitude,
} from './dynamic-modifiers.ts';

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

function makeCtx(overrides: Partial<DynamicModifierContext> = {}): DynamicModifierContext {
    return {
        charBonus: { ws: 4, bs: 3, s: 5, per: 4 },
        charTotal: { ws: 45, s: 52 },
        dos: 3,
        pr: 4,
        cb: 2,
        level: 3,
        penetration: 6,
        armourPoints: 5,
        ...overrides,
    };
}

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

describe('evaluateScale', () => {
    it('scales half a characteristic bonus rounded up (Crushing Blow / Mighty Shot shape)', () => {
        // WS bonus 4 → ceil(4 × 0.5) = 2
        expect(evaluateScale(scale({ source: 'ws', field: 'bonus', factor: 0.5, round: 'up' }), makeCtx())).toBe(2);
        // BS bonus 3 → ceil(3 × 0.5) = 2
        expect(evaluateScale(scale({ source: 'bs', field: 'bonus', factor: 0.5, round: 'up' }), makeCtx())).toBe(2);
    });

    it('reads the characteristic total when field is total', () => {
        expect(evaluateScale(scale({ source: 's', field: 'total', factor: 1, round: 'none' }), makeCtx())).toBe(52);
    });

    it('resolves the non-characteristic sources (pr, cb, level, dos, penetration, armourPoints)', () => {
        expect(evaluateScale(scale({ source: 'pr', round: 'none' }), makeCtx())).toBe(4);
        expect(evaluateScale(scale({ source: 'cb', round: 'none' }), makeCtx())).toBe(2);
        expect(evaluateScale(scale({ source: 'level', round: 'none' }), makeCtx())).toBe(3);
        expect(evaluateScale(scale({ source: 'dos', round: 'none' }), makeCtx())).toBe(3);
        expect(evaluateScale(scale({ source: 'penetration', round: 'none' }), makeCtx())).toBe(6);
        expect(evaluateScale(scale({ source: 'armourPoints', round: 'none' }), makeCtx())).toBe(5);
    });

    it('applies the product-of-two-variables multiplier (Lance = pen × DoS)', () => {
        // penetration 6 × factor 1 × dos 3 = 18
        expect(evaluateScale(scale({ source: 'penetration', factor: 1, multiplier: 'dos', round: 'none' }), makeCtx())).toBe(18);
    });

    it('clamps to min / max', () => {
        expect(evaluateScale(scale({ source: 'pr', factor: 10, round: 'none', max: 20 }), makeCtx())).toBe(20);
        expect(evaluateScale(scale({ source: 'cb', factor: 0, round: 'none', min: 1 }), makeCtx())).toBe(1);
    });

    it('honours each rounding mode', () => {
        // s bonus 5 × 0.5 = 2.5
        expect(evaluateScale(scale({ source: 's', factor: 0.5, round: 'up' }), makeCtx())).toBe(3);
        expect(evaluateScale(scale({ source: 's', factor: 0.5, round: 'down' }), makeCtx())).toBe(2);
        expect(evaluateScale(scale({ source: 's', factor: 0.5, round: 'nearest' }), makeCtx())).toBe(3);
        expect(evaluateScale(scale({ source: 's', factor: 0.5, round: 'none' }), makeCtx())).toBe(2.5);
    });

    it('returns 0 for an unscaled descriptor', () => {
        expect(evaluateScale(scale({ source: '' }), makeCtx())).toBe(0);
    });

    it('reads 0 for a source absent from the context', () => {
        expect(evaluateScale(scale({ source: 'fel', field: 'bonus', round: 'none' }), makeCtx())).toBe(0);
    });
});

describe('resolveDynamicMagnitude', () => {
    it('uses the static value when unscaled', () => {
        expect(resolveDynamicMagnitude(makeHook({ value: 3 }), makeCtx())).toBe(3);
    });
    it('uses the scale when scaled (scale wins over a stray static value)', () => {
        expect(resolveDynamicMagnitude(makeHook({ value: 99, scale: scale({ source: 'per', factor: 0.5, round: 'up' }) }), makeCtx())).toBe(2);
    });
});

describe('modeDelta — additive delta for each combine mode', () => {
    it('add returns the value verbatim', () => {
        expect(modeDelta('add', 10, 3)).toBe(3);
    });
    it('multiply returns base × (value − 1) so the total becomes base × value', () => {
        // Melta pen×2 on base pen 6 → delta 6 → total 12
        expect(modeDelta('multiply', 6, 2)).toBe(6);
        // Lance pen×DoS(3) on base pen 6 → delta 12 → total 18
        expect(modeDelta('multiply', 6, 3)).toBe(12);
    });
    it('set returns value − base so the total becomes value', () => {
        expect(modeDelta('set', 6, 10)).toBe(4);
    });
    it('min / max return null (a stat clamp, not a damage/pen delta)', () => {
        expect(modeDelta('min', 6, 2)).toBeNull();
        expect(modeDelta('max', 6, 2)).toBeNull();
    });
});

describe('hookApplies — trigger filtering', () => {
    it('always / onHit fire unconditionally', () => {
        expect(hookApplies(makeHook({ when: 'always' }), {})).toBe(true);
        expect(hookApplies(makeHook({ when: 'onHit' }), {})).toBe(true);
    });

    it('onCrit / onCharge / onParry gate on the situation flag', () => {
        expect(hookApplies(makeHook({ when: 'onCrit' }), { isCrit: true })).toBe(true);
        expect(hookApplies(makeHook({ when: 'onCrit' }), { isCrit: false })).toBe(false);
        expect(hookApplies(makeHook({ when: 'onCharge' }), { isCharge: true })).toBe(true);
        expect(hookApplies(makeHook({ when: 'onParry' }), {})).toBe(false);
    });

    it('atRangeBand / onAction match their conditionValue', () => {
        expect(hookApplies(makeHook({ when: 'atRangeBand', conditionValue: 'point-blank' }), { rangeBand: 'point-blank' })).toBe(true);
        expect(hookApplies(makeHook({ when: 'atRangeBand', conditionValue: 'point-blank' }), { rangeBand: 'short' })).toBe(false);
        expect(hookApplies(makeHook({ when: 'onAction', conditionValue: 'All Out Attack' }), { action: 'All Out Attack' })).toBe(true);
    });

    it('condition predicates gate melee/ranged, whileState, vsType, action', () => {
        expect(hookApplies(makeHook({ condition: 'melee' }), { isMelee: true })).toBe(true);
        expect(hookApplies(makeHook({ condition: 'melee' }), { isRanged: true })).toBe(false);
        expect(hookApplies(makeHook({ condition: 'ranged' }), { isRanged: true })).toBe(true);
        expect(hookApplies(makeHook({ condition: 'whileState', conditionValue: 'fatigued' }), { states: ['fatigued'] })).toBe(true);
        expect(hookApplies(makeHook({ condition: 'whileState', conditionValue: 'fatigued' }), { states: [] })).toBe(false);
        expect(hookApplies(makeHook({ condition: 'vsType', conditionValue: 'daemon' }), { targetTags: ['daemon'] })).toBe(true);
        expect(hookApplies(makeHook({ condition: 'action', conditionValue: 'Charge' }), { action: 'Charge' })).toBe(true);
    });

    it('requires BOTH timing and predicate to match', () => {
        const hook = makeHook({ when: 'onCrit', condition: 'ranged' });
        expect(hookApplies(hook, { isCrit: true, isRanged: true })).toBe(true);
        expect(hookApplies(hook, { isCrit: true, isRanged: false })).toBe(false);
        expect(hookApplies(hook, { isCrit: false, isRanged: true })).toBe(false);
    });

    it('specializationMode gates on the owning item specialization vs the attack mode (Deathdealer)', () => {
        const hook = makeHook({ when: 'onCrit', condition: 'specializationMode' });
        // Deathdealer (Melee) on a melee crit fires; on a ranged crit it does not.
        expect(hookApplies(hook, { isCrit: true, isMelee: true }, 'Melee')).toBe(true);
        expect(hookApplies(hook, { isCrit: true, isRanged: true }, 'Melee')).toBe(false);
        // Deathdealer (Ranged) mirrors it.
        expect(hookApplies(hook, { isCrit: true, isRanged: true }, 'Ranged')).toBe(true);
        expect(hookApplies(hook, { isCrit: true, isMelee: true }, 'Ranged')).toBe(false);
        // No specialization → never fires.
        expect(hookApplies(hook, { isCrit: true, isMelee: true }, '')).toBe(false);
    });
});

describe('collectDynamicComponents', () => {
    function item(name: string, hooks: DynamicModifierEntry[]): DynamicModifierItemLike {
        return { name, system: { modifiers: { dynamicModifiers: hooks } } };
    }

    it('emits a component per firing hook with resolved value + provenance', () => {
        const items = [
            item('Crushing Blow', [makeHook({ target: 'damage', condition: 'melee', scale: scale({ source: 'ws', factor: 0.5, round: 'up' }) })]),
            item('Mighty Shot', [makeHook({ target: 'damage', condition: 'ranged', scale: scale({ source: 'bs', factor: 0.5, round: 'up' }) })]),
        ];
        const melee: DynamicModifierSituation = { isMelee: true };
        const out = collectDynamicComponents(items, makeCtx(), melee);
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ target: 'damage', value: 2, label: 'Crushing Blow', source: 'Crushing Blow', valueFormula: '' });
    });

    it('skips hooks whose trigger does not fire', () => {
        const items = [item('Deathdealer', [makeHook({ when: 'onCrit', scale: scale({ source: 'per', factor: 1, round: 'none' }) })])];
        expect(collectDynamicComponents(items, makeCtx(), { isCrit: false })).toEqual([]);
        expect(collectDynamicComponents(items, makeCtx(), { isCrit: true })).toHaveLength(1);
    });

    it('defers a dice valueFormula (value 0, formula carried) for the caller to roll', () => {
        const items = [item('Hellfire Rounds', [makeHook({ target: 'damage', value: 0, valueFormula: '1d10' })])];
        const out = collectDynamicComponents(items, makeCtx(), {});
        expect(out[0]).toMatchObject({ value: 0, valueFormula: '1d10' });
    });

    it('prefers the hook label override, falling back to the item name', () => {
        const items = [item('Big Gun', [makeHook({ label: 'Custom Bonus', value: 1 })])];
        expect(collectDynamicComponents(items, makeCtx(), {})[0]?.label).toBe('Custom Bonus');
        const items2 = [item('Big Gun', [makeHook({ label: '', value: 1 })])];
        expect(collectDynamicComponents(items2, makeCtx(), {})[0]?.label).toBe('Big Gun');
    });

    it('tolerates items with no hooks', () => {
        const bare: DynamicModifierItemLike = { name: 'Plain', system: {} };
        expect(collectDynamicComponents([bare], makeCtx(), {})).toEqual([]);
    });
});
