import { describe, expect, it } from 'vitest';
import { makeDynamicHook } from '../testing/dynamic-modifier-hook.ts';
import { hookApplies } from './dynamic-modifiers.ts';
import { ENCOUNTER_GRANT_FLAG, FANATIC_IDENTIFIER, HATRED_IDENTIFIER, hasFanaticRole, hatredAgainstFoe } from './fanatic.ts';

/**
 * Fanatic "Death to All Who Oppose Me!" (DH2 Enemies Within p34): a Fate point
 * buys the Hatred talent against the current foe for the encounter. The role and
 * the Hatred talent are matched by identifier; Hatred's own hooks are re-aimed.
 */
describe('Fanatic role detection', () => {
    it('matches the role by its identifier on an originPath item', () => {
        expect(FANATIC_IDENTIFIER).toBe('fanatic');
        expect(hasFanaticRole([{ type: 'originPath', system: { identifier: 'fanatic' } }])).toBe(true);
    });

    it('does not match a talent or a role named "Fanatic" without the identifier', () => {
        expect(hasFanaticRole([{ type: 'talent', system: { identifier: 'fanatic' } }])).toBe(false);
        expect(hasFanaticRole([{ type: 'originPath', system: { identifier: 'penitent' } }])).toBe(false);
        expect(hasFanaticRole([])).toBe(false);
    });
});

describe('hatredAgainstFoe', () => {
    const hatredHook = makeDynamicHook({ target: 'attack', condition: 'vsSpecialization', value: 10 });

    it("re-aims Hatred's vsSpecialization hook at the one foe, keeping its value", () => {
        const [aimed] = hatredAgainstFoe([hatredHook], 'Scene.s.Token.t.Actor.foe');
        expect(aimed).toMatchObject({ target: 'attack', condition: 'vsActor', conditionValue: 'Scene.s.Token.t.Actor.foe', value: 10 });
    });

    it('the re-aimed hook fires against that foe and no other', () => {
        const aimed = hatredAgainstFoe([hatredHook], 'Actor.foe');
        expect(aimed.map((hook) => hookApplies(hook, { targetActorUuid: 'Actor.foe' }))).toEqual([true]);
        expect(aimed.map((hook) => hookApplies(hook, { targetActorUuid: 'Actor.bystander' }))).toEqual([false]);
    });

    it('passes other hooks through unchanged and never mutates the source', () => {
        const other = makeDynamicHook({ target: 'damage', condition: 'melee', value: 2 });
        const result = hatredAgainstFoe([hatredHook, other], 'Actor.foe');
        expect(result[1]).toEqual(other);
        expect(hatredHook.condition).toBe('vsSpecialization');
    });

    it('exposes the identifiers and flag the grant uses', () => {
        expect(HATRED_IDENTIFIER).toBe('hatred');
        expect(ENCOUNTER_GRANT_FLAG).toBe('encounterGrant');
    });
});
