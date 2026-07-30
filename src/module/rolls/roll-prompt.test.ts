import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    type DamagePromptPayload,
    openDamagePrompt,
    openRollPrompt,
    registerRollPrompts,
    resetRollPrompts,
    type RollPromptPayload,
    rollPromptsRegistered,
} from './roll-prompt.ts';

/**
 * The `rolls/roll-prompt.ts` port is what keeps `documents/*` off the UI layer
 * (#516). Its contract is small but load-bearing: a Document calls
 * `openRollPrompt` / `openDamagePrompt`, the bootstrap installs the concrete
 * dialog openers once, and an unwired port must complain rather than silently
 * drop the roll.
 */

/** The `game.wh40k.error` surface the port reports an unwired call through. */
interface Wh40kStub {
    error: (message: string) => void;
}
interface GameStub {
    wh40k: Wh40kStub;
}

function stubGame(): { errors: string[] } {
    const errors: string[] = [];
    vi.stubGlobal('game', { wh40k: { error: (message: string) => errors.push(message) } } satisfies GameStub);
    return { errors };
}

/**
 * A prepared-roll token. The port carries the payload opaquely and reads nothing
 * off it, so identity is the whole contract — which is also why the port can be
 * exercised without constructing a real `ActionData` (whose module pulls in the
 * Foundry-dependent action layer at import time).
 */
function rollToken(id: string): RollPromptPayload {
    return { id };
}

afterEach(() => {
    resetRollPrompts();
    vi.unstubAllGlobals();
});

describe('roll-prompt port registration', () => {
    it('starts unregistered and reports so', () => {
        expect(rollPromptsRegistered()).toBe(false);
    });

    it('registers both openers as one pair', () => {
        registerRollPrompts({ openRoll: () => undefined, openDamage: () => undefined });
        expect(rollPromptsRegistered()).toBe(true);
    });

    it('resetRollPrompts un-installs the pair', () => {
        registerRollPrompts({ openRoll: () => undefined, openDamage: () => undefined });
        resetRollPrompts();
        expect(rollPromptsRegistered()).toBe(false);
    });

    it('re-registering replaces the previous pair rather than stacking', () => {
        const seen: string[] = [];
        registerRollPrompts({ openRoll: () => seen.push('first'), openDamage: () => undefined });
        registerRollPrompts({ openRoll: () => seen.push('second'), openDamage: () => undefined });
        openRollPrompt(rollToken('a'));
        expect(seen).toEqual(['second']);
    });
});

describe('openRollPrompt', () => {
    it('forwards the payload reference untouched to the installed opener', () => {
        const received: RollPromptPayload[] = [];
        registerRollPrompts({ openRoll: (data) => received.push(data), openDamage: () => undefined });
        const action = rollToken('skill-roll');
        openRollPrompt(action);
        expect(received).toHaveLength(1);
        expect(received[0]).toBe(action);
    });

    it('reports an error instead of throwing when the UI layer never registered', () => {
        const { errors } = stubGame();
        openRollPrompt(rollToken('orphaned'));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('unified-roll');
    });
});

describe('openDamagePrompt', () => {
    it('forwards the legacy damage payload untouched', () => {
        const received: DamagePromptPayload[] = [];
        registerRollPrompts({ openRoll: () => undefined, openDamage: (payload) => received.push(payload) });
        const damage: DamagePromptPayload = { name: 'Chainsword', damage: '1d10+3', penetration: 2 };
        openDamagePrompt(damage);
        expect(received[0]).toBe(damage);
    });

    it('reports an error instead of throwing when the UI layer never registered', () => {
        const { errors } = stubGame();
        openDamagePrompt({ name: 'Lasgun' });
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('damage-roll');
    });
});

describe('the two openers are independent channels', () => {
    it('a roll prompt does not reach the damage opener and vice versa', () => {
        const calls: string[] = [];
        registerRollPrompts({ openRoll: () => calls.push('roll'), openDamage: () => calls.push('damage') });
        openRollPrompt(rollToken('x'));
        openDamagePrompt({});
        openRollPrompt(rollToken('y'));
        expect(calls).toEqual(['roll', 'damage', 'roll']);
    });
});
