import { handleBleeding, handleOnFire } from '../rules/active-effects.ts';

export class CombatActionManager {
    combatTurnHook;
    combatRoundHook;

    initializeHooks(): void {
        // Initialize Combat Hooks
        this.combatTurnHook = Hooks.on('combatTurn', (combat, data) => this.updateCombat(combat, data));
        this.combatRoundHook = Hooks.on('combatRound', (combat, data) => this.updateCombat(combat, data));
    }

    disableHooks(): void {
        game.wh40k.log('Disabling Hooks', { cth: this.combatTurnHook, crh: this.combatRoundHook });
        Hooks.off('combatTurn', this.combatTurnHook);
        Hooks.off('combatRound', this.combatRoundHook);
    }

    updateCombat(combat: any, data: any): void {
        // Only Run on the first GM -- so it will only run once
        if (game.userId === this.getFirstGM()) {
            game.wh40k.log('updateCombat - this should only be running on first GM');
            void this.processCombatActiveEffects(combat, data);

            // Reset first attack flags for all combatants at start of new round
            if (data.round !== data.previous?.round) {
                void this.resetFirstAttackFlags(combat);
            }
        }
    }

    /**
     * Reset the "hit this round" flag for all combatants at the start of a new round.
     * This enables Good armour's +1 AP bonus on first attack.
     * @param {Combat} combat - The combat encounter
     */
    async resetFirstAttackFlags(combat: any): Promise<void> {
        for (const combatant of combat.combatants) {
            if (combatant.actor) {
                // eslint-disable-next-line no-await-in-loop -- Foundry flag operations must be sequential
                await combatant.actor.unsetFlag('wh40k-rpg', 'hitThisRound');
            }
        }
    }

    async processCombatActiveEffects(combat: any, data: any): Promise<void> {
        const currentCombatant = combat.turns[data.turn];
        game.wh40k.log('processCombatActiveEffects', currentCombatant);

        if (currentCombatant) {
            // Handle Actor Effects
            if (currentCombatant.actor && currentCombatant.actor.effects) {
                for (const effect of currentCombatant.actor.effects.contents) {
                    // On Fire!
                    if (effect.label === 'Burning') {
                        // eslint-disable-next-line no-await-in-loop -- Sequential effect processing required
                        await handleOnFire(currentCombatant.actor);
                    } else if (effect.label === 'Bleeding') {
                        // eslint-disable-next-line no-await-in-loop -- Sequential effect processing required
                        await handleBleeding(currentCombatant.actor);
                    }
                }
            }
        }
    }

    getFirstGM(): string | undefined {
        // @ts-expect-error - dynamic property access
        for (const user of game.users.contents) {
            if (user.active && user.isGM) return user.id;
        }
        return undefined;
    }
}

export const DHCombatActionManager = new CombatActionManager();
