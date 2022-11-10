import { prepareWeaponRoll } from '../rolls/weapon-prompt.mjs';

export class AttackManager {

    selectedTokens = {};
    targetedTokens = {};

    initializeHooks() {
        // Controlled Tokens have changed
        Hooks.on('controlToken', async (token, selected) => {
            console.log('controlTokenEvent');
            if (selected) {
                this.selectedTokens[token.id] = token;
            } else {
                if (this.selectedTokens[token.id]) {
                    delete this.selectedTokens[token.id];
                }
            }
            console.log(this.selectedTokens);
        });

        // Targets have changed
        Hooks.on('targetToken', async (user, token, selected) => {
            if (selected) {
                this.targetedTokens[token.id] = token;
            } else {
                if (this.targetedTokens[token.id]) {
                    delete this.targetedTokens[token.id];
                }
            }
            console.log(this.targetedTokens);
        });

        // Initialize Hotbar Button
        Hooks.on('getSceneControlButtons', (controls) => {
            const bar = controls.find(c => c.name === 'token');
            bar.tools.push({
                name: 'Attack',
                title: 'Attack',
                icon: 'fas fa-hand-fist',
                visible: true,
                onClick: async () => DHAttackManager.performAttack(),
                button: true,
            });
        });
    }

    async performAttack() {
        console.log('Selected Tokens', this.selectedTokens);
        if (Object.keys(this.selectedTokens).length !== 1) {
            ui.notifications.warn('You need to control a single token! Multi-token support is not yet added.');
            return;
        }

        const sourceToken = this.selectedTokens[Object.keys(this.selectedTokens)[0]];
        if (!sourceToken.actor) {
            ui.notifications.warn('Token must be associated with an actor!');
            return;
        }

        const sourceActorData = sourceToken.actor;
        const equippedWeapons = sourceToken.actor.items
            .filter((item) => item.type === 'weapon')
            .filter((item) => item.system.equipped);

        if (!equippedWeapons || equippedWeapons.length === 0) {
            ui.notifications.warn('Actor must have an equipped weapon!');
            return;
        }

        await prepareWeaponRoll({
            actor: sourceActorData,
            weapons: equippedWeapons,
        });
    }
}


export const DHAttackManager = new AttackManager();

