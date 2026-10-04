import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conditionPackFixture } from '../testing/condition-catalog.ts';
import { coerceConditionMechanics, type ConditionMechanics } from './condition-mechanics.ts';
import { buildConditionCatalog, conditionMechanicsFor, setConditionCatalog } from './condition-registry.ts';
import { collectTargetedConditionModifiers, sumTargetedComponents, TARGET_CONDITION_BUCKET } from './targeted-conditions.ts';

beforeEach(() => {
    setConditionCatalog(buildConditionCatalog(conditionPackFixture()));
});

afterEach(() => {
    setConditionCatalog(new Map());
});

function target(line: 'dh2' | 'rt', ...ids: string[]): ConditionMechanics[] {
    return ids.map((id) => {
        const resolved = conditionMechanicsFor(id, line);
        if (resolved === null) throw new Error(`fixture has no ${id}`);
        return resolved;
    });
}

const MELEE = { isMelee: true, isRanged: false, rangeBand: 'melee' };
const RANGED_SHORT = { isMelee: false, isRanged: true, rangeBand: 'short' };
const RANGED_POINT_BLANK = { isMelee: false, isRanged: true, rangeBand: 'pointBlank' };

describe('collectTargetedConditionModifiers (Path B)', () => {
    it('Prone target (dh2): melee +10', () => {
        expect(collectTargetedConditionModifiers(target('dh2', 'prone'), MELEE)).toEqual([
            { key: `${TARGET_CONDITION_BUCKET}.prone.0`, label: 'Prone', value: 10, source: 'Prone' },
        ]);
    });

    it('Prone target (dh2): ranged −10, except at Point Blank (any spelling of the band)', () => {
        expect(collectTargetedConditionModifiers(target('dh2', 'prone'), RANGED_SHORT).map((c) => c.value)).toEqual([-10]);
        expect(collectTargetedConditionModifiers(target('dh2', 'prone'), RANGED_POINT_BLANK)).toEqual([]);
        expect(collectTargetedConditionModifiers(target('dh2', 'prone'), { ...RANGED_POINT_BLANK, rangeBand: 'point-blank' })).toEqual([]);
    });

    it('Stunned (dh2) +20 and Unaware (rt) +30 apply to any attack', () => {
        expect(collectTargetedConditionModifiers(target('dh2', 'stunned'), MELEE).map((c) => c.value)).toEqual([20]);
        expect(collectTargetedConditionModifiers(target('dh2', 'stunned'), RANGED_SHORT).map((c) => c.value)).toEqual([20]);
        expect(collectTargetedConditionModifiers(target('rt', 'surprised-unaware'), RANGED_SHORT).map((c) => c.value)).toEqual([30]);
    });

    it('Grappled (rt) melee +20 only; Concealed (rt) ranged −20 only', () => {
        expect(collectTargetedConditionModifiers(target('rt', 'grappled'), MELEE).map((c) => c.value)).toEqual([20]);
        expect(collectTargetedConditionModifiers(target('rt', 'grappled'), RANGED_SHORT)).toEqual([]);
        expect(collectTargetedConditionModifiers(target('rt', 'concealed'), RANGED_SHORT).map((c) => c.value)).toEqual([-20]);
        expect(collectTargetedConditionModifiers(target('rt', 'concealed'), MELEE)).toEqual([]);
    });

    it('emits one sourced component per condition and sums them', () => {
        const components = collectTargetedConditionModifiers(target('rt', 'prone', 'stunned', 'surprised-unaware'), MELEE);
        expect(components.map((c) => c.source)).toEqual(['Prone', 'Stunned', 'Surprised / Unaware']);
        expect(sumTargetedComponents(components)).toBe(60);
    });

    it("resolves a per-line `targeted` container for the target's line", () => {
        setConditionCatalog(
            buildConditionCatalog([
                {
                    packName: 'dh2-core-items-conditions',
                    rows: [
                        {
                            type: 'condition',
                            name: 'Obscured',
                            img: '',
                            system: {
                                identifier: 'obscured',
                                targeted: {
                                    dh2: [{ attack: 'ranged', value: -30, exceptRange: '', label: 'Obscured (DH2)' }],
                                    rt: [{ attack: 'ranged', value: -20, exceptRange: '', label: '' }],
                                },
                            },
                        },
                    ],
                },
            ]),
        );
        expect(collectTargetedConditionModifiers(target('dh2', 'obscured'), RANGED_SHORT)).toEqual([
            { key: `${TARGET_CONDITION_BUCKET}.obscured.0`, label: 'Obscured (DH2)', value: -30, source: 'Obscured' },
        ]);
        expect(collectTargetedConditionModifiers(target('rt', 'obscured'), RANGED_SHORT).map((c) => [c.label, c.value])).toEqual([['Obscured', -20]]);
    });

    it('a directly-coerced condition (an owned item) contributes its entries', () => {
        const item = coerceConditionMechanics('smoke', 'Smoke', { targeted: [{ attack: 'any', value: -10, exceptRange: '', label: '' }] });
        expect(collectTargetedConditionModifiers([item], MELEE).map((c) => c.value)).toEqual([-10]);
    });

    it('applies when the attack has no computed range band', () => {
        expect(collectTargetedConditionModifiers(target('dh2', 'prone'), { isMelee: false, isRanged: true, rangeBand: undefined }).map((c) => c.value)).toEqual(
            [-10],
        );
    });
});
