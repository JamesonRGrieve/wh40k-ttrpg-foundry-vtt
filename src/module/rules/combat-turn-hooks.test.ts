/**
 * Tests for the system-level combat turn-boundary hooks (#413): the pure
 * boundary derivation and the subscription fan-out driven by `updateCombat`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTurnSubscribers, deriveTurnBoundary, onTurnEnd, onTurnStart, registerCombatTurnHooks, type TurnCombat, type TurnCombatant } from './combat-turn-hooks.ts';

afterEach(() => {
    clearTurnSubscribers();
    vi.unstubAllGlobals();
});

describe('deriveTurnBoundary (#413)', () => {
    it('returns null when the turn did not change', () => {
        expect(deriveTurnBoundary({ turnChanged: false, previousCombatantId: 'a', currentCombatantId: 'b' })).toBeNull();
    });

    it('returns null when neither side is known', () => {
        expect(deriveTurnBoundary({ turnChanged: true, previousCombatantId: null, currentCombatantId: undefined })).toBeNull();
    });

    it('still counts a same-combatant round wrap (solo combat) as a boundary', () => {
        expect(deriveTurnBoundary({ turnChanged: true, previousCombatantId: 'a', currentCombatantId: 'a' })).toEqual({
            endedCombatantId: 'a',
            startedCombatantId: 'a',
        });
    });

    it('derives ended/started ids across a real advance', () => {
        expect(deriveTurnBoundary({ turnChanged: true, previousCombatantId: 'a', currentCombatantId: 'b' })).toEqual({
            endedCombatantId: 'a',
            startedCombatantId: 'b',
        });
    });

    it('reports a start with an unknown end (combat start)', () => {
        expect(deriveTurnBoundary({ turnChanged: true, previousCombatantId: undefined, currentCombatantId: 'b' })).toEqual({
            endedCombatantId: null,
            startedCombatantId: 'b',
        });
    });
});

describe('combat turn-hook fan-out (#413)', () => {
    /** Capture the updateCombat handler registerCombatTurnHooks installs. */
    function installHooks(): (combat: TurnCombat, changes: { turn?: number; round?: number }) => void {
        let handler: ((combat: TurnCombat, changes: { turn?: number; round?: number }) => void) | undefined;
        vi.stubGlobal('Hooks', {
            on: (event: string, fn: (combat: TurnCombat, changes: { turn?: number; round?: number }) => void) => {
                if (event === 'updateCombat') handler = fn;
            },
        });
        vi.stubGlobal('console', { ...console, error: vi.fn() });
        registerCombatTurnHooks();
        if (handler === undefined) throw new Error('updateCombat handler was not registered');
        return handler;
    }

    const A: TurnCombatant = { id: 'c-a', actorId: 'actor-a' };
    const B: TurnCombatant = { id: 'c-b', actorId: 'actor-b' };
    const combat: TurnCombat = { combatant: B, combatants: [A, B], previous: { combatantId: 'c-a' } };

    it('fires onTurnEnd for the previous combatant and onTurnStart for the new one', () => {
        const handler = installHooks();
        const started: Array<string | null> = [];
        const ended: Array<string | null> = [];
        onTurnStart((c) => started.push(c?.id ?? null));
        onTurnEnd((c) => ended.push(c?.id ?? null));

        handler(combat, { turn: 1 });

        expect(ended).toEqual(['c-a']);
        expect(started).toEqual(['c-b']);
    });

    it('does not fire when no turn/round changed', () => {
        const handler = installHooks();
        const start = vi.fn();
        onTurnStart(start);
        handler(combat, {});
        expect(start).not.toHaveBeenCalled();
    });

    it('isolates a throwing subscriber so the others still run', () => {
        const handler = installHooks();
        const good = vi.fn();
        onTurnStart(() => {
            throw new Error('boom');
        });
        onTurnStart(good);
        handler(combat, { turn: 1 });
        expect(good).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes cleanly', () => {
        const handler = installHooks();
        const start = vi.fn();
        const off = onTurnStart(start);
        off();
        handler(combat, { turn: 1 });
        expect(start).not.toHaveBeenCalled();
    });
});
