import { describe, expect, it } from 'vitest';
import type { TestSubstitutionEntry } from '../data/shared/modifiers-template.ts';
import {
    areaAvoidanceTest,
    type CalledShotContext,
    knowsSpecialistSkill,
    ownedSubstitutions,
    resolveCalledShotSubstitution,
    type SubstitutionItemLike,
    trainingOffsetTarget,
} from './test-substitution.ts';

/**
 * Test substitutions are data on the owning item; the resolver evaluates the
 * authored conditions and names no talent.
 */

const CALLED_SHOT: TestSubstitutionEntry = {
    test: 'calledShot',
    skill: 'medicae',
    basis: 'trainingOffset',
    attack: 'bySpecialization',
    targetTag: 'xenos',
    requiresSkill: 'forbiddenLore',
    requiresSpecialization: 'xenos',
};

const AREA: TestSubstitutionEntry = {
    test: 'areaAvoidance',
    skill: 'dodge',
    basis: 'skill',
    attack: 'any',
    targetTag: '',
    requiresSkill: '',
    requiresSpecialization: '',
};

function item(name: string, entries: TestSubstitutionEntry[], specialization = ''): SubstitutionItemLike {
    return { name, system: { specialization, modifiers: { testSubstitutions: entries } } };
}

function context(overrides: Partial<CalledShotContext> = {}): CalledShotContext {
    return {
        isCalledShot: true,
        isRanged: false,
        targetTags: ['xenos'],
        baseTarget: 30,
        skills: {
            medicae: { current: 60, characteristic: 'intelligence' },
            forbiddenLore: { current: 0, characteristic: 'intelligence', entries: [{ name: 'Xenos (Eldar)', rank: 1 }] },
        },
        characteristicTotal: (key) => (key === 'intelligence' ? 50 : 0),
        ...overrides,
    };
}

describe('ownedSubstitutions', () => {
    it("collects each item's entries for the test, with the item's name and specialization", () => {
        const owned = ownedSubstitutions([item('A', [CALLED_SHOT, AREA], 'Melee'), item('B', [])], 'calledShot');
        expect(owned).toEqual([{ entry: CALLED_SHOT, source: 'A', specialization: 'Melee' }]);
    });
});

describe('knowsSpecialistSkill', () => {
    it('matches a specialization by prefix at Known or better', () => {
        const skills = {
            forbiddenLore: {
                current: 0,
                characteristic: 'intelligence',
                entries: [
                    { name: 'Xenos (Eldar)', rank: 1 },
                    { name: 'Daemonology', rank: 0 },
                ],
            },
        };
        expect([
            knowsSpecialistSkill(skills, 'forbiddenLore', 'xenos'),
            knowsSpecialistSkill(skills, 'forbiddenLore', 'daemon'),
            knowsSpecialistSkill(skills, 'commonLore', ''),
        ]).toEqual([true, false, false]);
    });
});

describe('trainingOffsetTarget', () => {
    it("carries the skill's training over onto the replaced characteristic", () => {
        expect(trainingOffsetTarget(60, 50, 30)).toBe(40);
    });
});

describe('resolveCalledShotSubstitution', () => {
    it('swaps a covered Called Shot onto the skill, with the training-offset target and the granting item', () => {
        expect(resolveCalledShotSubstitution([item('Talent', [CALLED_SHOT], 'Melee')], context())).toEqual({ skill: 'medicae', target: 40, source: 'Talent' });
    });

    it("uses the skill's own total for a `skill` basis", () => {
        expect(resolveCalledShotSubstitution([item('Talent', [{ ...CALLED_SHOT, basis: 'skill' }], 'Melee')], context())?.target).toBe(60);
    });

    it.each([
        ['not a Called Shot', context({ isCalledShot: false }), 'Melee'],
        ['an attack the specialization does not name', context({ isRanged: true }), 'Melee'],
        ['a target without the tag', context({ targetTags: ['creature'] }), 'Melee'],
        ['the required specialist skill unknown', context({ skills: { medicae: { current: 60, characteristic: 'intelligence' } } }), 'Melee'],
    ] as const)('leaves the test alone for %s', (_case, ctx, specialization) => {
        expect(resolveCalledShotSubstitution([item('Talent', [CALLED_SHOT], specialization)], ctx)).toBeNull();
    });

    it('covers any attack when the entry says so', () => {
        expect(resolveCalledShotSubstitution([item('Talent', [{ ...CALLED_SHOT, attack: 'any' }])], context({ isRanged: true }))?.skill).toBe('medicae');
    });
});

describe('areaAvoidanceTest', () => {
    const skills = (skill: string): number | undefined => (skill === 'dodge' ? 55 : undefined);

    it('avoids with Agility by default, floored at 0', () => {
        expect(areaAvoidanceTest([], 41, skills)).toEqual({ skill: 'agility', target: 41 });
        expect(areaAvoidanceTest([], -5, skills)).toEqual({ skill: 'agility', target: 0 });
    });

    it('avoids with the substituted skill when an owned item grants it', () => {
        expect(areaAvoidanceTest([item('Talent', [AREA])], 41, skills)).toEqual({ skill: 'dodge', target: 55 });
    });

    it('ignores a substitution naming a skill the area card cannot label, or one the bearer lacks', () => {
        expect(areaAvoidanceTest([item('Talent', [{ ...AREA, skill: 'acrobatics' }])], 41, skills)).toEqual({ skill: 'agility', target: 41 });
        expect(areaAvoidanceTest([item('Talent', [AREA])], 41, () => undefined)).toEqual({ skill: 'agility', target: 41 });
    });
});
