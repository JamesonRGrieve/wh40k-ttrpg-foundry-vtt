/**
 * Tests for the combat-tracker action-economy surfacing (#264): the hook
 * registration and the "re-render the actor sheet when its action-economy flag
 * changes" behaviour. The DOM injection path is exercised in Storybook against
 * the partial; here we cover the wiring and the flag-change gate.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCombatTrackerEconomy } from './combat-tracker-economy.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Hooks.on callback args are untyped by the framework
type Handler = (...args: unknown[]) => void;

interface CapturedHooks {
    renderCombatTracker?: Handler;
    updateCombatant?: Handler;
}

function installHooks(): CapturedHooks {
    const captured: CapturedHooks = {};
    vi.stubGlobal('Hooks', {
        on: (event: string, fn: Handler) => {
            if (event === 'renderCombatTracker') captured.renderCombatTracker = fn;
            if (event === 'updateCombatant') captured.updateCombatant = fn;
        },
    });
    vi.stubGlobal('console', { ...console, error: vi.fn() });
    return captured;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('combat tracker economy (#264)', () => {
    it('registers both the tracker-render and combatant-update hooks', () => {
        const hooks = installHooks();
        registerCombatTrackerEconomy();
        expect(hooks.renderCombatTracker).toBeTypeOf('function');
        expect(hooks.updateCombatant).toBeTypeOf('function');
    });

    it('re-renders the actor sheet when the action-economy flag changes', () => {
        const hooks = installHooks();
        registerCombatTrackerEconomy();
        const render = vi.fn();
        const combatant = { actorId: 'a1', actor: { sheet: { rendered: true, render } } };
        hooks.updateCombatant?.(combatant, { flags: { 'wh40k-rpg': { actionsSpentThisTurn: { full: 0, half: 1, free: 0, reaction: 0 } } } });
        expect(render).toHaveBeenCalledWith(false);
    });

    it('ignores unrelated combatant updates', () => {
        const hooks = installHooks();
        registerCombatTrackerEconomy();
        const render = vi.fn();
        const combatant = { actorId: 'a1', actor: { sheet: { rendered: true, render } } };
        hooks.updateCombatant?.(combatant, { initiative: 12 });
        expect(render).not.toHaveBeenCalled();
    });

    it('does not render a closed sheet', () => {
        const hooks = installHooks();
        registerCombatTrackerEconomy();
        const render = vi.fn();
        const combatant = { actorId: 'a1', actor: { sheet: { rendered: false, render } } };
        hooks.updateCombatant?.(combatant, { flags: { 'wh40k-rpg': { actionsSpentThisTurn: { full: 1, half: 0, free: 0, reaction: 0 } } } });
        expect(render).not.toHaveBeenCalled();
    });
});
