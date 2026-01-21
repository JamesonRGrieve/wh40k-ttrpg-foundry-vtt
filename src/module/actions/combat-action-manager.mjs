import { handleBleeding, handleOnFire } from '../rules/active-effects.mjs';

export class CombatActionManager {
    combatTurnHook;
    combatRoundHook;

    initializeHooks() {
        // Initialize Combat Hooks
        this.combatTurnHook = Hooks.on('combatTurn', async (combat, data) => await this.updateCombat(combat, data));
        this.combatRoundHook = Hooks.on('combatRound', async (combat, data) => await this.updateCombat(combat, data));
    }

    disableHooks() {
        game.rt.log('Disabling Hooks', { cth: this.combatTurnHook, crh: this.combatRoundHook });
        Hooks.off('combatTurn', this.combatTurnHook);
        Hooks.off('combatRound', this.combatRoundHook);
    }

    async updateCombat(combat, data) {
        // Only Run on the first GM -- so it will only run once
        if (game.userId === this.getFirstGM()) {
            game.rt.log('updateCombat - this should only be running on first GM');
            this.processCombatActiveEffects(combat, data);

            // Reset first attack flags for all combatants at start of new round
            if (data.round !== data.previous?.round) {
                this.resetFirstAttackFlags(combat);
            }
        }
    }

    /**
     * Reset the "hit this round" flag for all combatants at the start of a new round.
     * This enables Good armour's +1 AP bonus on first attack.
     * @param {Combat} combat - The combat encounter
     */
    async resetFirstAttackFlags(combat) {
        for (const combatant of combat.combatants) {
            if (combatant.actor) {
                await combatant.actor.unsetFlag('rogue-trader', 'hitThisRound');
            }
        }
    }

    async processCombatActiveEffects(combat, data) {
        const currentCombatant = combat.turns[data.turn];
        game.rt.log('processCombatActiveEffects', currentCombatant);

        if (currentCombatant) {
            // Handle Actor Effects
            if (currentCombatant.actor && currentCombatant.actor.effects) {
                for (const effect of currentCombatant.actor.effects.contents) {
                    // On Fire!
                    if (effect.label === 'Burning') {
                        await handleOnFire(currentCombatant.actor);
                    } else if (effect.label === 'Bleeding') {
                        await handleBleeding(currentCombatant.actor);
                    }
                }
            }
        }
    }

    getFirstGM() {
        for (const user of game.users.contents) {
            if (user.active && user.isGM) return user.id;
        }
    }
}

export const DHCombatActionManager = new CombatActionManager();
