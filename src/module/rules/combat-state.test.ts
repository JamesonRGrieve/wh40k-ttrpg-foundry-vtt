/**
 * Tests for the shared combat-state predicate (#251).
 *
 * `isActorInActiveCombat` gates combat-only actions (weapon attacks, reload).
 * It is Foundry-free, so these exercise the real branches directly.
 */

import { describe, expect, it } from 'vitest';
import { type ActiveCombatLike, isActorInActiveCombat } from './combat-state.ts';

function combat(started: boolean, actorIds: (string | null)[]): ActiveCombatLike {
    return { started, combatants: actorIds.map((id) => ({ actor: id === null ? null : { id } })) };
}

describe('isActorInActiveCombat', () => {
    it('is true when a started encounter includes the actor', () => {
        expect(isActorInActiveCombat('a1', combat(true, ['a1', 'a2']))).toBe(true);
    });

    it('is false when no combat exists', () => {
        expect(isActorInActiveCombat('a1', null)).toBe(false);
        expect(isActorInActiveCombat('a1', undefined)).toBe(false);
    });

    it('is false when the encounter has not started', () => {
        expect(isActorInActiveCombat('a1', combat(false, ['a1']))).toBe(false);
    });

    it('is false when the actor is not a combatant in the tracker', () => {
        expect(isActorInActiveCombat('a1', combat(true, ['a2', 'a3']))).toBe(false);
    });

    it('is false for a missing/blank actor id', () => {
        expect(isActorInActiveCombat(null, combat(true, ['a1']))).toBe(false);
        expect(isActorInActiveCombat(undefined, combat(true, ['a1']))).toBe(false);
        expect(isActorInActiveCombat('', combat(true, ['a1']))).toBe(false);
    });

    it('tolerates combatants with no linked actor', () => {
        expect(isActorInActiveCombat('a1', combat(true, [null, 'a1']))).toBe(true);
        expect(isActorInActiveCombat('a1', combat(true, [null]))).toBe(false);
    });
});
