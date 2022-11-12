import { prepareWeaponRoll } from '../rolls/weapon-prompt.mjs';
import { preparePsychicPowerRoll } from '../rolls/psychic-power-prompt.mjs';

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
                onClick: async () => DHAttackManager.performWeaponAttack(),
                button: true,
            });
        });
    }

    tokenDistance(token1, token2){
        if(!token1 || !token2) return;

        let distance = canvas.grid.measureDistance(token1, token2);
        if(token1.elevation !== token2.data.elevation){
            let h_diff = token2.data.elevation > token1.data.elevation
                ? token2.data.elevation - token1.data.elevation
                : token1.data.elevation - token2.data.elevation;

            return Math.sqrt(Math.pow(h_diff,2) + Math.pow(distance,2));
        }else{
            return distance;
        }
    }

    getSourceToken(source) {
        let sourceToken;
        if (source) {
            sourceToken = source.token ?? source.getActiveTokens[0];
        } else {
            if (Object.keys(this.selectedTokens).length !== 1) {
                ui.notifications.warn('You need to control a single token! Multi-token support is not yet added.');
                return;
            }
            sourceToken = this.selectedTokens[Object.keys(this.selectedTokens)[0]];
        }

        if (!sourceToken.actor) {
            ui.notifications.warn('Token must be associated with an actor!');
            return;
        }

        return sourceToken;
    }

    getTargetToken(target) {
        let targetToken;
        if (target) {
            targetToken = target.token ?? target.getActiveTokens[0];
        } else {
            if (Object.keys(this.targetedTokens).length > 1) {
                ui.notifications.warn('You need to target a single token! Multi-token targeting is not yet added.');
                return;
            }
            targetToken = this.targetedTokens[Object.keys(this.targetedTokens)[0]];
        }

        if (!targetToken.actor) {
            ui.notifications.warn('Target token must be associated with an actor!');
            return;
        }

        return targetToken;
    }

    createSourceAndTargetData(source, target) {
        // Source
        const sourceToken = this.getSourceToken(source);
        if(!sourceToken) return;
        const sourceActorData = sourceToken.actor;

        // Target
        const targetToken = this.getTargetToken(target);
        const targetDistance = targetToken ? this.tokenDistance(sourceToken, targetToken) : 0;
        const targetActorData = targetToken ? targetToken.actor : null;

        return {
            actor: sourceActorData,
            target: targetActorData,
            distance: targetDistance
        }
    }

    async performWeaponAttack(source = null, target = null, weapon = null) {
        const rollData = this.createSourceAndTargetData(source, target);
        if(!rollData) return;

        // Weapon
        const weapons = weapon ? [weapon] : rollData.actor.items
            .filter((item) => item.type === 'weapon')
            .filter((item) => item.system.equipped);
        if (!weapons || weapons.length === 0) {
            ui.notifications.warn('Actor must have an equipped weapon!');
            return;
        }
        rollData.weapons = weapons;

        await prepareWeaponRoll(rollData);
    }

    async performPsychicAttack(source = null, target = null, psychicPower = null) {
        const rollData = this.createSourceAndTargetData(source, target);
        if(!rollData) return;

        // Powers
        const powers = psychicPower ? [psychicPower] : rollData.actor.items
            .filter((item) => item.type === 'psychic-power');
        if (!powers || powers.length === 0) {
            ui.notifications.warn('Actor must have psychic power!');
            return;
        }
        rollData.psychicPowers = psychicPower;

        await preparePsychicPowerRoll(powers);
    }
}


export const DHAttackManager = new AttackManager();

