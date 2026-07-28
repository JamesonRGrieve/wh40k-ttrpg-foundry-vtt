/**
 * Coverage for the chat-card defender reaction (#414) — Attempt Dodge / Parry.
 *
 * The affordance exists and is wired, but the reaction ECONOMY around it had no
 * test: whether a defender with no Reaction left is actually blocked, whether a
 * successful attempt spends exactly one Reaction, and whether the out-of-combat
 * case still rolls while spending nothing. Those are the invariants a table
 * notices when they break — a double-spend or a free reaction is silent at the
 * point of use and only shows up as an argument mid-combat.
 *
 * Exercised through the action-economy module the card calls, with a minimal
 * typed combat stub — no Foundry client needed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FlagBag {
    [key: string]: unknown;
}

/** Minimal combatant carrying the spent-actions flag the economy reads/writes. */
class StubCombatant {
    actorId: string;
    #flags: FlagBag = {};
    constructor(actorId: string) {
        this.actorId = actorId;
    }
    getFlag(_scope: string, key: string): unknown {
        return this.#flags[key];
    }
    setFlag(_scope: string, key: string, value: unknown): Promise<void> {
        this.#flags[key] = value;
        return Promise.resolve();
    }
}

const DEFENDER = 'defender-actor-id';

async function loadEconomy(): Promise<typeof import('../src/module/rules/action-economy.ts')> {
    return import('../src/module/rules/action-economy.ts');
}

/** Install a combat containing `combatants`, or no combat at all. */
function installCombat(combatants: StubCombatant[] | null): void {
    vi.stubGlobal('game', combatants === null ? {} : { combat: { combatants } });
}

describe('defender reaction economy (#414)', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it('a fresh defender in combat has a Reaction available', async () => {
        installCombat([new StubCombatant(DEFENDER)]);
        const { actionBudgetForActor } = await loadEconomy();
        expect(actionBudgetForActor(DEFENDER)?.reactionRemaining).toBe(1);
    });

    it('spending the Reaction leaves none — the card must then block a second attempt', async () => {
        installCombat([new StubCombatant(DEFENDER)]);
        const { actionBudgetForActor, spendActionForActor } = await loadEconomy();

        expect(spendActionForActor(DEFENDER, 'reaction')?.reactionRemaining).toBe(0);
        // This is the exact read the card's guard performs before rolling.
        expect(actionBudgetForActor(DEFENDER)?.reactionRemaining).toBe(0);
    });

    it('a second spend cannot drive the remaining count below zero', async () => {
        installCombat([new StubCombatant(DEFENDER)]);
        const { spendActionForActor } = await loadEconomy();
        spendActionForActor(DEFENDER, 'reaction');
        expect(spendActionForActor(DEFENDER, 'reaction')?.reactionRemaining).toBe(0);
    });

    it('out of combat the budget is null — the test still rolls, spending nothing', async () => {
        // The card treats `null` as "not in combat" and skips the guard entirely,
        // which is what lets a defender dodge outside an encounter.
        installCombat(null);
        const { actionBudgetForActor, spendActionForActor } = await loadEconomy();
        expect(actionBudgetForActor(DEFENDER)).toBeNull();
        expect(spendActionForActor(DEFENDER, 'reaction')).toBeNull();
    });

    it('an actor not in the active combat reads null rather than another combatant’s budget', async () => {
        installCombat([new StubCombatant('someone-else')]);
        const { actionBudgetForActor } = await loadEconomy();
        expect(actionBudgetForActor(DEFENDER)).toBeNull();
    });

    it("spending a defender's Reaction does not touch another combatant's budget", async () => {
        const other = new StubCombatant('other-actor-id');
        installCombat([new StubCombatant(DEFENDER), other]);
        const { actionBudgetForActor, spendActionForActor } = await loadEconomy();

        spendActionForActor(DEFENDER, 'reaction');

        expect(actionBudgetForActor(DEFENDER)?.reactionRemaining).toBe(0);
        expect(actionBudgetForActor('other-actor-id')?.reactionRemaining).toBe(1);
    });
});
