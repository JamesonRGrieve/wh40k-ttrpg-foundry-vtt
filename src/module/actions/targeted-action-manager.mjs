import { prepareWeaponRoll } from '../prompts/weapon-prompt.mjs';
import { preparePsychicPowerRoll } from '../prompts/psychic-power-prompt.mjs';
import { PsychicActionData, WeaponActionData } from '../rolls/action-data.mjs';
import { DarkHeresySettings } from '../dark-heresy-settings.mjs';
import { SYSTEM_ID } from '../hooks-manager.mjs';

export class TargetedActionManager {

    initializeHooks() {
        // Initialize Scene Control Buttons
        Hooks.on('getSceneControlButtons', (controls) => {
            const bar = controls.find((c) => c.name === 'token');
            try {
                if (!game.settings.get(SYSTEM_ID, DarkHeresySettings.SETTINGS.simpleAttackRolls)) {
                    bar.tools.push({
                        name: 'Attack',
                        title: 'Attack',
                        icon: 'fas fa-swords',
                        visible: true,
                        onClick: async () => DHTargetedActionManager.performWeaponAttack(),
                        button: true,
                    });
                }
            } catch (error) {
                game.dh.log('Unable to add game bar icon.', error)
            }
        });
    }

    tokenDistance(token1, token2) {
        if (!token1 || !token2) return 0;

        let distance = canvas.grid.measureDistance(token1, token2);
        if (token1.document && token2.document) {
            if (token1.document.elevation !== token2.document.elevation) {
                let h_diff =
                    token2.document.elevation > token1.document.elevation
                        ? token2.document.elevation - token1.document.elevation
                        : token1.document.elevation - token2.document.elevation;

                return Math.floor(Math.sqrt(Math.pow(h_diff, 2) + Math.pow(distance, 2)));
            } else {
                return Math.floor(distance);
            }
        } else {
            return 0;
        }
    }

    getSourceToken(source) {
        game.dh.log('getSourceToken', source);
        let sourceToken;
        if (source) {
            sourceToken = source.token ?? source.getActiveTokens()[0];
        } else {
            const controlledObjects = game.canvas.tokens.controlledObjects;
            if (!controlledObjects || controlledObjects.size === 0) {
                ui.notifications.warn('You need to control a token!');
                return
            }
            if (controlledObjects.size > 1) {
                ui.notifications.warn('You need to control a single token! Multi-token support is not yet added.');
                return;
            }
            sourceToken = [...controlledObjects.values()][0];
        }

        if (sourceToken && !sourceToken.actor) {
            ui.notifications.warn('Token must be associated with an actor!');
            return;
        }

        return sourceToken;
    }

    getTargetToken(target) {
        game.dh.log('getTargetToken', target);
        let targetToken;
        if (target) {
            targetToken = target.token ?? target.getActiveTokens()[0];
        } else {
            const targetedObjects = game.user.targets;
            if (!targetedObjects || targetedObjects.size === 0) return;
            if (targetedObjects.size > 1) {
                ui.notifications.warn('You need to target a single token! Multi-token targeting is not yet added.');
                return;
            }
            targetToken = [...targetedObjects.values()][0];
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
        const sourceActorData = sourceToken ? sourceToken.actor : source;
        if(!sourceActorData) return;

        // Target
        const targetToken = this.getTargetToken(target);
        const targetActorData = targetToken ? targetToken.actor : target;

        // Distance
        const targetDistance = sourceToken && targetToken ? this.tokenDistance(sourceToken, targetToken) : 0;

        return {
            actor: sourceActorData,
            target: targetActorData,
            distance: targetDistance,
        };
    }

    async performWeaponAttack(source = null, target = null, weapon = null) {
        game.dh.log('performWeaponAttack', { source, target, weapon });
        const rollData = this.createSourceAndTargetData(source, target);
        if (!rollData) return;

        // Weapon
        const weapons = weapon ? [weapon] : rollData.actor.items.filter((item) => item.type === 'weapon').filter((item) => item.system.equipped);
        if (!weapons || weapons.length === 0) {
            ui.notifications.warn('Actor must have an equipped weapon!');
            return;
        }

        const weaponAttack = new WeaponActionData();
        const weaponRollData = weaponAttack.rollData;
        weaponRollData.weapons = weapons;
        weaponRollData.sourceActor = rollData.actor;
        weaponRollData.targetActor = rollData.target;
        weaponRollData.distance = rollData.distance;
        await prepareWeaponRoll(weaponAttack);
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

        const psychicAttack = new PsychicActionData();
        const psychicRollData = psychicAttack.rollData;
        psychicRollData.psychicPowers = powers;
        psychicRollData.sourceActor = rollData.actor;
        psychicRollData.targetActor = rollData.target;
        psychicRollData.distance = rollData.distance;
        await preparePsychicPowerRoll(psychicAttack);
    }
}

export const DHTargetedActionManager = new TargetedActionManager();
