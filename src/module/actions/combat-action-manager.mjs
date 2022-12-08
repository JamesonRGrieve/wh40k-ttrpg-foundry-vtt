import { handleOnFire } from '../rules/active_effects.mjs';

export class CombatActionManager {
    combatTurnHook;
    combatRoundHook;

    initializeHooks() {
        // Initialize Combat Hooks
        this.combatTurnHook = Hooks.on('combatTurn', async (combat, data) => await this.updateCombat(combat, data));
        this.combatRoundHook = Hooks.on('combatRound', async (combat, data) => await this.updateCombat(combat, data));
    }

    async updateCombat(combat, data) {
        console.log(combat);
        console.log(data);
        // Only Run on the first GM -- so it will only run once
        if(game.userId === this.getFirstGM()) {
            game.dh.log('updateCombat - this should only be running on first GM');
            this.processCombatActiveEffects(combat, data);
        }
    }

    async processCombatActiveEffects(combat, data) {
        const currentCombatant = combat.turns[data.turn];
        game.dh.log('processCombatActiveEffects', currentCombatant);

        if (currentCombatant) {
            // Handle Actor Effects
            if(currentCombatant.actor && currentCombatant.actor.effects) {
                for(const effect of currentCombatant.actor.effects.contents) {
                    // On Fire!
                    if(effect.label === 'Burning') {
                        await handleOnFire(currentCombatant.actor);
                    }
                }
            }
        }
    }

    getFirstGM() {
        for(const user of game.users.contents) {
            if (user.active && user.isGM) return user.id;
        }
    }
}



export const DHCombatActionManager = new CombatActionManager();
