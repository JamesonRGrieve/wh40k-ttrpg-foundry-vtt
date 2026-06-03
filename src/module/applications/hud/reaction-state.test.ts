/**
 * Regression tests for the combat-panel reaction-state builder (#245).
 *
 * The panel used to list Dodge and Parry unconditionally with a placeholder
 * `(0)` target for actors lacking the skill. These assert the builder only
 * surfaces reactions with a real, positive TN, carries the true target, and
 * tracks spent reactions — "the actual usable reactions," nothing more.
 */

import { describe, expect, it } from 'vitest';
import { buildReactionState, type ReactionInputs } from './reaction-state.ts';

const labels = {
    dodgeLabel: (t: number): string => `Dodge (${t})`,
    parryLabel: (t: number): string => `Parry (${t})`,
};

function inputs(overrides: Partial<ReactionInputs> = {}): ReactionInputs {
    return { dodgeTarget: 45, parryTarget: 38, dodgeUsed: false, parryUsed: false, ...labels, ...overrides };
}

describe('buildReactionState', () => {
    it('surfaces both reactions with their real TNs when the actor has them', () => {
        const state = buildReactionState(inputs());
        expect(state.dodge).toEqual({ available: true, target: 45, label: 'Dodge (45)' });
        expect(state.parry).toEqual({ available: true, target: 38, label: 'Parry (38)' });
        expect(state.remaining).toBe(2);
    });

    it('omits a reaction entirely when its skill TN is absent (no placeholder 0)', () => {
        const state = buildReactionState(inputs({ parryTarget: undefined }));
        expect(state.dodge).toBeDefined();
        expect(state.parry).toBeUndefined();
        expect(state.remaining).toBe(1);
    });

    it('omits a reaction with a non-positive TN (NPC without the skill)', () => {
        const state = buildReactionState(inputs({ dodgeTarget: 0, parryTarget: -5 }));
        expect(state.dodge).toBeUndefined();
        expect(state.parry).toBeUndefined();
        expect(state.remaining).toBe(0);
    });

    it('never emits a (0) target — the reported placeholder noise', () => {
        const state = buildReactionState(inputs({ dodgeTarget: 0, parryTarget: undefined }));
        expect(state.dodge?.target).not.toBe(0);
        expect(state.dodge).toBeUndefined();
        expect(state.parry).toBeUndefined();
    });

    it('keeps a spent reaction present but marks it unavailable (and out of the remaining count)', () => {
        const state = buildReactionState(inputs({ dodgeUsed: true }));
        expect(state.dodge?.available).toBe(false);
        expect(state.dodge?.target).toBe(45);
        expect(state.parry?.available).toBe(true);
        expect(state.remaining).toBe(1);
    });

    it('ignores a non-finite TN', () => {
        const state = buildReactionState(inputs({ dodgeTarget: Number.NaN }));
        expect(state.dodge).toBeUndefined();
    });
});
