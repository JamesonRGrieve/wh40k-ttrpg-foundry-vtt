import { processConditionTicks } from '../rules/active-effects.ts';

/** Shape of the data payload delivered by the combatTurn / combatRound hooks. */
interface CombatUpdateData {
    round: number;
    turn: number | null;
}

class CombatActionManager {
    combatTurnHook: number | undefined;
    combatRoundHook: number | undefined;

    initializeHooks(): void {
        // Initialize Combat Hooks
        this.combatTurnHook = Hooks.on('combatTurn', (combat: Combat, data: CombatUpdateData) => {
            this.updateCombat(combat, data);
        });
        this.combatRoundHook = Hooks.on('combatRound', (combat: Combat, data: CombatUpdateData) => {
            this.updateCombat(combat, data);
        });
    }

    disableHooks(): void {
        game.wh40k.log('Disabling Hooks', { cth: this.combatTurnHook, crh: this.combatRoundHook });
        if (this.combatTurnHook !== undefined) Hooks.off('combatTurn', this.combatTurnHook);
        if (this.combatRoundHook !== undefined) Hooks.off('combatRound', this.combatRoundHook);
    }

    updateCombat(combat: Combat, data: CombatUpdateData): void {
        // Only Run on the first GM -- so it will only run once
        if (game.userId === this.getFirstGM()) {
            game.wh40k.log('updateCombat - this should only be running on first GM');
            void this.processCombatActiveEffects(combat, data);

            // Reset first attack flags for all combatants at start of new round
            if (data.round !== combat.previous?.round) {
                void this.resetFirstAttackFlags(combat);
            }
        }
    }

    /**
     * Reset the "hit this round" flag for all combatants at the start of a new round.
     * This enables Good armour's +1 AP bonus on first attack.
     * @param {Combat} combat - The combat encounter
     */
    async resetFirstAttackFlags(combat: Combat): Promise<void> {
        const updates = [...combat.combatants]
            .map((c) => c.actor)
            .filter((actor): actor is NonNullable<typeof actor> => actor !== null)
            .map(async (actor) => actor.unsetFlag('wh40k-rpg', 'hitThisRound'));
        await Promise.all(updates);
    }

    async processCombatActiveEffects(combat: Combat, data: CombatUpdateData): Promise<void> {
        const turn = data.turn ?? combat.turn;
        if (turn === null) return;
        const currentCombatant = combat.turns[turn];
        game.wh40k.log('processCombatActiveEffects', currentCombatant);

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- combat.turns indexing may return undefined at runtime despite Foundry types
        if (currentCombatant?.actor !== null && currentCombatant?.actor !== undefined) {
            // One data-driven processor for every ticking condition: what fires,
            // and what it does, is each condition document's `system.tick` —
            // never a status id or effect name matched here.
            await processConditionTicks(currentCombatant.actor);
        }
    }

    getFirstGM(): string | undefined {
        for (const user of game.users.contents) {
            if (user.active && user.isGM) return user.id;
        }
        return undefined;
    }
}

export const DHCombatActionManager = new CombatActionManager();
