import { prepareWeaponRoll } from '../prompts/weapon-prompt.mjs';
import { preparePsychicPowerRoll } from '../prompts/psychic-power-prompt.mjs';
import { PsychicRollData, WeaponRollData } from '../rolls/roll-data.mjs';

export class TargetedActionManager {
    selectedTokens = {};
    targetedTokens = {};

    initializeHooks() {
        // Controlled Tokens have changed
        Hooks.on('controlToken', async (token, selected) => {
            game.dh.log('controlTokenEvent');
            if (selected) {
                this.selectedTokens[token.id] = token;
            } else {
                if (this.selectedTokens[token.id]) {
                    delete this.selectedTokens[token.id];
                }
            }
            game.dh.log(this.selectedTokens);
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
            game.dh.log(this.targetedTokens);
        });

        // Initialize Hotbar Button
        Hooks.on('getSceneControlButtons', (controls) => {
            const bar = controls.find((c) => c.name === 'token');
            bar.tools.push({
                name: 'Attack',
                title: 'Attack',
                icon: 'fas fa-hand-fist',
                visible: true,
                onClick: async () => DHTargetedActionManager.performWeaponAttack(),
                button: true,
            });
        });
    }

    tokenDistance(token1, token2) {
        if (!token1 || !token2) return;

        let distance = canvas.grid.measureDistance(token1, token2);
        if (token1.document.elevation !== token2.document.elevation) {
            let h_diff =
                token2.document.elevation > token1.document.elevation
                    ? token2.document.elevation - token1.document.elevation
                    : token1.document.elevation - token2.document.elevation;

            return Math.floor(Math.sqrt(Math.pow(h_diff, 2) + Math.pow(distance, 2)));
        } else {
            return Math.floor(distance);
        }
    }

    getSourceToken(source) {
        game.dh.log('getSourceToken', source);
        let sourceToken;
        if (source) {
            sourceToken = source.token ?? source.getActiveTokens()[0];
        } else {
            if (Object.keys(this.selectedTokens).length !== 1) {
                ui.notifications.warn('You need to control a single token! Multi-token support is not yet added.');
                return;
            }
            sourceToken = this.selectedTokens[Object.keys(this.selectedTokens)[0]];
        }

        if (sourceToken && !sourceToken.actor) {
            ui.notifications.warn('Token must be associated with an actor!');
            return;
        }

        return sourceToken;
    }

    getTargetToken(target) {
        game.dh.log('getSourceToken', target);
        let targetToken;
        if (target) {
            targetToken = target.token ?? target.getActiveTokens()[0];
        } else {
            if (Object.keys(this.targetedTokens).length > 1) {
                ui.notifications.warn('You need to target a single token! Multi-token targeting is not yet added.');
                return;
            }
            targetToken = this.targetedTokens[Object.keys(this.targetedTokens)[0]];
        }

        if (targetToken && !targetToken.actor) {
            ui.notifications.warn('Target token must be associated with an actor!');
            return;
        }

        return targetToken;
    }

    createSourceAndTargetData(source, target) {
        game.dh.log('createSourceAndTargetData', { source, target });
        // Source
        const sourceToken = this.getSourceToken(source);
        if (!sourceToken) return;
        const sourceActorData = sourceToken.actor;

        // Target
        const targetToken = this.getTargetToken(target);
        const targetDistance = targetToken ? this.tokenDistance(sourceToken, targetToken) : 0;
        const targetActorData = targetToken ? targetToken.actor : null;

        return {
            actor: sourceActorData,
            target: targetActorData,
            distance: targetDistance,
        };
    }

    async performWeaponAttack(source = null, target = null, weapon = null) {
        game.dh.log('performWeaponAttack');
        const rollData = this.createSourceAndTargetData(source, target);
        if (!rollData) return;

        // Weapon
        const weapons = weapon ? [weapon] : rollData.actor.items.filter((item) => item.type === 'weapon').filter((item) => item.system.equipped);
        if (!weapons || weapons.length === 0) {
            ui.notifications.warn('Actor must have an equipped weapon!');
            return;
        }

        const weaponRollData = new WeaponRollData();
        weaponRollData.weapons = weapons;
        weaponRollData.sourceActor = rollData.actor;
        weaponRollData.targetActor = rollData.target;
        weaponRollData.distance = rollData.distance;

        await prepareWeaponRoll(weaponRollData);
    }

    async performPsychicAttack(source = null, target = null, psychicPower = null) {
        game.dh.log('performPsychicAttack');
        const rollData = this.createSourceAndTargetData(source, target);
        if (!rollData) return;

        // Powers
        const powers = psychicPower ? [psychicPower] : rollData.actor.items.filter((item) => item.type === 'psychicPower');
        if (!powers || powers.length === 0) {
            ui.notifications.warn('Actor must have psychic power!');
            return;
        }

        const psychicRollData = new PsychicRollData();
        psychicRollData.psychicPowers = powers;
        psychicRollData.sourceActor = rollData.actor;
        psychicRollData.targetActor = rollData.target;
        psychicRollData.distance = rollData.distance;

        await preparePsychicPowerRoll(psychicRollData);
    }
}

export const DHTargetedActionManager = new TargetedActionManager();
