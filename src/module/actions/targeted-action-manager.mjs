import { prepareUnifiedRoll } from '../applications/prompts/unified-roll-dialog.mjs';
import { PsychicActionData, WeaponActionData } from '../rolls/action-data.mjs';
import { RogueTraderSettings } from '../rogue-trader-settings.mjs';
import { SYSTEM_ID } from '../constants.mjs';
import { calculateTokenDistance } from '../utils/range-calculator.mjs';

export class TargetedActionManager {
    initializeHooks() {
        // Initialize Scene Control Buttons
        Hooks.on('getSceneControlButtons', (controls) => {
            const bar = controls.token;
            if (!bar) return;
            try {
                if (!game.settings.get(SYSTEM_ID, RogueTraderSettings.SETTINGS.simpleAttackRolls)) {
                    const toolOrder = Object.keys(bar.tools).length;
                    bar.tools.attack = {
                        name: 'Attack',
                        title: 'Attack',
                        icon: 'fas fa-swords',
                        visible: true,
                        onClick: async () => DHTargetedActionManager.performWeaponAttack(),
                        button: true,
                        order: toolOrder,
                    };
                }
            } catch (error) {
                game.rt.log('Unable to add game bar icon.', error);
            }
        });
    }

    tokenDistance(token1, token2) {
        // Use the new range calculator for consistent distance calculation
        return calculateTokenDistance(token1, token2);
    }

    getSourceToken(source) {
        game.rt.log('getSourceToken', source);
        let sourceToken;
        if (source) {
            sourceToken = source.token ?? source.getActiveTokens()[0];
        } else {
            const controlledObjects = game.canvas.tokens.controlledObjects;
            if (!controlledObjects || controlledObjects.size === 0) {
                ui.notifications.warn('You need to control a token!');
                return;
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
        game.rt.log('getTargetToken', target);
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
        game.rt.log('createSourceAndTargetData', { source, target });

        // Source
        const sourceToken = this.getSourceToken(source);
        const sourceActorData = sourceToken ? sourceToken.actor : source;
        if (!sourceActorData) return;

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
        game.rt.log('performWeaponAttack', { source, target, weapon });
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
        await prepareUnifiedRoll(weaponAttack);
    }

    async performPsychicAttack(source = null, target = null, psychicPower = null) {
        game.rt.log('performPsychicAttack');
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
        await prepareUnifiedRoll(psychicAttack);
    }
}

export const DHTargetedActionManager = new TargetedActionManager();
