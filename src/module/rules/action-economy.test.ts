/**
 * Tests for the action-economy combat glue (#264) with stubbed Foundry globals.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ActionsSpent, EMPTY_ACTIONS_SPENT } from './action-budget.ts';
import { actionBudgetForActor, readActionsSpent, registerActionEconomy, resetActionsForActor, spendActionForActor } from './action-economy.ts';

interface FakeCombatant {
    actorId: string;
    flag: ActionsSpent | undefined;
    getFlag: (scope: string, key: string) => ActionsSpent | undefined;
    // Synchronous in the stub — the code under test fires setFlag and ignores the result.
    setFlag: (scope: string, key: string, value: ActionsSpent) => void;
}

function makeCombatant(actorId: string, initial: ActionsSpent | undefined = undefined): FakeCombatant {
    const c: FakeCombatant = {
        actorId,
        flag: initial,
        getFlag: (_s, _k) => c.flag,
        setFlag: (_s, _k, v) => {
            c.flag = v;
        },
    };
    return c;
}

function stubCombat(combatant: FakeCombatant): void {
    vi.stubGlobal('game', { combat: { started: true, combatant, combatants: [combatant] } });
    vi.stubGlobal('console', { ...console, error: vi.fn() });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('action-economy combat glue (#264)', () => {
    it('reads a fresh budget when the flag is unset', () => {
        const c = makeCombatant('a1');
        expect(readActionsSpent(c)).toEqual(EMPTY_ACTIONS_SPENT);
    });

    it('spends an action for the actor and persists it on the combatant flag', () => {
        const c = makeCombatant('a1');
        stubCombat(c);
        const view = spendActionForActor('a1', 'half');
        expect(view).toMatchObject({ halfRemaining: 1, usedPoints: 1 });
        expect(readActionsSpent(c)).toMatchObject({ half: 1 });
        // A second half consumes the pool.
        spendActionForActor('a1', 'half');
        expect(readActionsSpent(c)).toMatchObject({ half: 2 });
        // A third is a no-op (clamped).
        spendActionForActor('a1', 'half');
        expect(readActionsSpent(c)).toMatchObject({ half: 2 });
    });

    it('calls setFlag bound to the combatant (regression: detached this crashes Foundry)', () => {
        // Foundry's real setFlag reads `this` internally; a detached `const f = c.setFlag; f(...)`
        // runs with this=undefined and throws "reading 'constructor' of undefined". The old mock's
        // arrow setFlag closed over `c`, hiding the bug — use a this-dependent method so binding is tested.
        const c = {
            actorId: 'a1',
            flag: undefined as ActionsSpent | undefined,
            bound: false,
            getFlag(_s: string, _k: string): ActionsSpent | undefined {
                return this.flag;
            },
            setFlag(_s: string, _k: string, v: ActionsSpent): void {
                this.bound = true; // unreachable (TypeError) if `this` is undefined — the bug
                this.flag = v;
            },
        };
        vi.stubGlobal('game', { combat: { started: true, combatant: c, combatants: [c] } });
        vi.stubGlobal('console', { ...console, error: vi.fn() });
        spendActionForActor('a1', 'half');
        expect(c.bound).toBe(true);
        expect(c.flag).toMatchObject({ half: 1 });
    });

    it('returns null for an actor with no combatant', () => {
        stubCombat(makeCombatant('other'));
        expect(spendActionForActor('missing', 'full')).toBeNull();
        expect(actionBudgetForActor('missing')).toBeNull();
    });

    it('reports the action-budget view for an actor in combat', () => {
        const c = makeCombatant('a1', { full: 1, half: 0, free: 0, reaction: 0 });
        stubCombat(c);
        expect(actionBudgetForActor('a1')).toMatchObject({ fullAvailable: false, halfRemaining: 0, usedPoints: 2 });
    });

    it('resets an actor budget to a fresh turn', () => {
        const c = makeCombatant('a1', { full: 0, half: 2, free: 0, reaction: 1 });
        stubCombat(c);
        resetActionsForActor('a1');
        expect(readActionsSpent(c)).toEqual(EMPTY_ACTIONS_SPENT);
    });

    it('registers the updateCombat reset hook', () => {
        const on = vi.fn();
        vi.stubGlobal('Hooks', { on });
        registerActionEconomy();
        expect(on).toHaveBeenCalledWith('updateCombat', expect.any(Function));
    });
});
