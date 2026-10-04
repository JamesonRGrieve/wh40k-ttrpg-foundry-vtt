import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conditionPackFixture } from '../testing/condition-catalog.ts';
import {
    autoFailingConditions,
    coerceConditionMechanics,
    type ConditionMechanics,
    helplessAutoHitConditions,
    helplessTargetConditions,
    resolveActionLimit,
    rolledCharacteristic,
    uniqueConditionMechanics,
} from './condition-mechanics.ts';
import { buildConditionCatalog, conditionMechanicsFor, setConditionCatalog } from './condition-registry.ts';

beforeEach(() => {
    setConditionCatalog(buildConditionCatalog(conditionPackFixture()));
});

afterEach(() => {
    setConditionCatalog(new Map());
});

/** Line-resolved mechanics of one fixture condition. */
function one(line: 'dh2' | 'rt', id: string): ConditionMechanics {
    const resolved = conditionMechanicsFor(id, line);
    if (resolved === null) throw new Error(`fixture has no ${id}`);
    return resolved;
}

/** Line-resolved mechanics of fixture conditions. */
function mechanics(line: 'dh2' | 'rt', ...ids: string[]): ConditionMechanics[] {
    return ids.map((id) => one(line, id));
}

describe('coerceConditionMechanics', () => {
    it('reads the structured fields', () => {
        const m = coerceConditionMechanics('x', 'X', {
            targeted: [{ attack: 'melee', value: 10, exceptRange: ' pointBlank ', label: '' }],
            helplessTarget: true,
            actionLimit: 'halfActionOnly',
            autoFail: ['ballisticSkill', ' Visual '],
            tick: {
                interval: 'turn',
                damage: '1d5',
                damageType: 'impact',
                ignoresArmour: false,
                fatigue: 2,
                test: { characteristic: 'toughness', difficulty: -10 },
                onFail: 'unconscious',
            },
        });
        expect(m.targeted).toEqual([{ attack: 'melee', value: 10, exceptRange: 'pointBlank', label: '' }]);
        expect(m.helplessTarget).toBe(true);
        expect(m.actionLimit).toBe('halfActionOnly');
        expect(m.autoFail).toEqual(['ballisticSkill', 'Visual']);
        expect(m.tick).toEqual({
            interval: 'turn',
            damage: '1d5',
            damageType: 'impact',
            ignoresArmour: false,
            fatigue: 2,
            test: { characteristic: 'toughness', difficulty: -10 },
            onFail: 'unconscious',
        });
    });

    it('drops malformed data instead of coercing it into behaviour', () => {
        const m = coerceConditionMechanics('x', 'X', {
            targeted: [{ attack: 'thrown', value: 10 }, { attack: 'any', value: 0 }, 'junk'],
            helplessTarget: 'yes',
            actionLimit: 'sleep',
            autoFail: ['', 3],
            tick: { interval: 'hour', fatigue: -2, test: { characteristic: '' } },
        });
        expect(m.targeted).toEqual([]);
        expect(m.helplessTarget).toBe(false);
        expect(m.actionLimit).toBe('none');
        expect(m.autoFail).toEqual([]);
        expect(m.tick.interval).toBe('');
        expect(m.tick.fatigue).toBe(0);
        expect(m.tick.test).toBeNull();
    });

    it('defaults every field when the condition authors none', () => {
        const m = coerceConditionMechanics('corruption', 'Corruption', {});
        expect(m).toMatchObject({ targeted: [], helplessTarget: false, actionLimit: 'none', autoFail: [], removal: '' });
        expect(m.tick.interval).toBe('');
    });
});

describe('uniqueConditionMechanics', () => {
    it('keeps the first copy of each identifier', () => {
        const prone = one('dh2', 'prone');
        expect(uniqueConditionMechanics([prone, one('dh2', 'stunned'), { ...prone, name: 'dupe' }]).map((m) => m.name)).toEqual(['Prone', 'Stunned']);
    });
});

describe('helplessTargetConditions', () => {
    it('finds Helpless and Unconscious (dh2) by their data, not their names', () => {
        expect(helplessTargetConditions(mechanics('dh2', 'prone', 'helpless', 'unconscious')).map((m) => m.identifier)).toEqual(['helpless', 'unconscious']);
        expect(helplessTargetConditions(mechanics('rt', 'stunned', 'prone'))).toEqual([]);
    });
});

// Every line prints the helpless auto-hit for Weapon Skill tests only (DH2 p229,
// RT/DW p248, OW p253, BC p245, DH1 p199); a ranged shot at a helpless target rolls.
describe('helplessAutoHitConditions', () => {
    it('grants the auto-hit to a melee attack against a helpless target', () => {
        expect(helplessAutoHitConditions(mechanics('dh2', 'helpless'), true).map((m) => m.identifier)).toEqual(['helpless']);
    });

    it('does not grant it to a ranged attack', () => {
        expect(helplessAutoHitConditions(mechanics('dh2', 'helpless', 'unconscious'), false)).toEqual([]);
    });
});

describe('resolveActionLimit — action-limit gating input', () => {
    it('is unrestricted with no limiting condition', () => {
        expect(resolveActionLimit(mechanics('dh2', 'prone'))).toEqual({ limit: 'none', source: null });
    });

    it('takes the most restrictive limit and reports its source (dh2)', () => {
        const resolved = resolveActionLimit(mechanics('dh2', 'pinned', 'stunned'));
        expect(resolved.limit).toBe('noActions');
        expect(resolved.source?.identifier).toBe('stunned');
    });

    it('orders grappleOnly < halfActionOnly < loseTurn (rt)', () => {
        expect(resolveActionLimit(mechanics('rt', 'grappled')).limit).toBe('grappleOnly');
        expect(resolveActionLimit(mechanics('rt', 'grappled', 'pinned')).limit).toBe('halfActionOnly');
        expect(resolveActionLimit(mechanics('rt', 'pinned', 'surprised-unaware')).limit).toBe('loseTurn');
    });
});

describe('autoFailingConditions', () => {
    it('Blinded fails Ballistic Skill tests and the Visual variant (dh2)', () => {
        const blinded = mechanics('dh2', 'blinded', 'prone');
        expect(autoFailingConditions(blinded, { characteristic: 'ballisticSkill', variant: null }).map((m) => m.identifier)).toEqual(['blinded']);
        expect(autoFailingConditions(blinded, { characteristic: null, variant: 'visual' }).map((m) => m.identifier)).toEqual(['blinded']);
        expect(autoFailingConditions(blinded, { characteristic: 'weaponSkill', variant: null })).toEqual([]);
    });

    it('Deafened fails the Auditory variant only (rt)', () => {
        const deafened = mechanics('rt', 'deafened');
        expect(autoFailingConditions(deafened, { characteristic: null, variant: 'Auditory' })).toHaveLength(1);
        expect(autoFailingConditions(deafened, { characteristic: null, variant: 'Visual' })).toEqual([]);
        expect(autoFailingConditions(deafened, { characteristic: null, variant: null })).toEqual([]);
    });
});

describe('rolledCharacteristic', () => {
    it('is the rolled key for a Characteristic test', () => {
        expect(rolledCharacteristic({ type: 'Characteristic', rollKey: 'ballisticSkill', baseChar: '' })).toBe('ballisticSkill');
    });

    it('is the base characteristic for an attack (short code)', () => {
        expect(rolledCharacteristic({ type: 'Attack', rollKey: '', baseChar: 'BS' })).toBe('ballisticSkill');
        expect(rolledCharacteristic({ type: '', rollKey: '', baseChar: 'WS' })).toBe('weaponSkill');
    });

    it('is null for a Skill test', () => {
        expect(rolledCharacteristic({ type: 'Skill', rollKey: 'awareness', baseChar: 'Per' })).toBeNull();
    });
});
