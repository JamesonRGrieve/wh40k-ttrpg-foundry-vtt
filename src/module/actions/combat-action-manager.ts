import { handleBleeding, handleOnFire } from '../rules/active-effects.ts';

export class CombatActionManager {
    combatTurnHook: number | undefined;
    combatRoundHook: number | undefined;

    initializeHooks(): void {
        // Initialize Combat Hooks
        this.combatTurnHook = Hooks.on('combatTurn', async (combat: Combat, data: Record<string, unknown>) => await this.updateCombat(combat, data));
        this.combatRoundHook = Hooks.on('combatRound', async (combat: Combat, data: Record<string, unknown>) => await this.updateCombat(combat, data));
    }

    disableHooks(): void {
        game.wh40k.log('Disabling Hooks', { cth: this.combatTurnHook, crh: this.combatRoundHook });
        if (this.combatTurnHook !== undefined) Hooks.off('combatTurn', this.combatTurnHook);
        if (this.combatRoundHook !== undefined) Hooks.off('combatRound', this.combatRoundHook);
    }

    updateCombat(combat: Combat, data: Record<string, unknown>): void {
        // Only Run on the first GM -- so it will only run once
        if (game.userId === this.getFirstGM()) {
            game.wh40k.log('updateCombat - this should only be running on first GM');
            void this.processCombatActiveEffects(combat, data);

            // Reset first attack flags for all combatants at start of new round
            if (data.round !== (data.previous as Record<string, unknown> | undefined)?.round) {
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
        for (const combatant of combat.combatants) {
            if (combatant.actor) {
                await combatant.actor.unsetFlag('wh40k-rpg', 'hitThisRound');
            }
        }
    }

    async processCombatActiveEffects(combat: Combat, data: Record<string, unknown>): Promise<void> {
        const turn = typeof data.turn === 'number' ? data.turn : combat.turn;
        if (turn === null) return;
        const currentCombatant = combat.turns[turn];
        game.wh40k.log('processCombatActiveEffects', currentCombatant);

        if (currentCombatant) {
            // Handle Actor Effects
            if (currentCombatant.actor && currentCombatant.actor.effects) {
                for (const effect of currentCombatant.actor.effects.contents) {
                    // On Fire!
                    if (effect.name === 'Burning') {
                        await handleOnFire(currentCombatant.actor);
                    } else if (effect.name === 'Bleeding') {
                        await handleBleeding(currentCombatant.actor);
                    }
                }
            }
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
