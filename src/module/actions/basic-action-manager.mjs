import { refundAmmo } from '../rules/ammo.mjs';
import { uuid } from '../rolls/roll-helpers.mjs';
import { AssignDamageData } from '../rolls/assign-damage-data.mjs';
import { prepareAssignDamageRoll } from '../prompts/assign-damage-prompt.mjs';
import { DHTargetedActionManager } from './targeted-action-manager.mjs';
import { Hit } from '../rolls/damage-data.mjs';
import { DarkHeresySettings } from '../dark-heresy-settings.mjs';
import { SYSTEM_ID } from '../hooks-manager.mjs';

export class BasicActionManager {
    // This is stored rolls for allowing re-rolls, ammo refund, etc.
    storedRolls = {};

    initializeHooks() {
        // Add show/hide support for chat messages
        Hooks.on('renderChatMessage', async (message, html, data) => {
            game.dh.log('renderChatMessage', { message, html, data });
            html.find('.roll-control__hide-control').click(async (ev) => await this._toggleExpandChatMessage(ev));
            html.find('.roll-control__refund').click(async (ev) => await this._refundResources(ev));
            html.find('.roll-control__fate-reroll').click(async (ev) => await this._fateReroll(ev));
            html.find('.roll-control__assign-damage').click(async (ev) => await this._assignDamage(ev));
            html.find('.roll-control__apply-damage').click(async (ev) => await this._applyDamage(ev));
        });

        // Initialize Scene Control Buttons
        Hooks.on('getSceneControlButtons', (controls) => {
            const bar = controls.find((c) => c.name === 'token');
            bar.tools.push({
                name: 'Assign Damage',
                title: 'Assign Damage',
                icon: 'fas fa-shield',
                visible: true,
                onClick: async () => DHBasicActionManager.assignDamageTool(),
                button: true,
            });
        });
    }

    async _toggleExpandChatMessage(event) {
        game.dh.log('roll-control-toggle');
        event.preventDefault();
        const displayToggle = $(event.currentTarget);
        $('span', displayToggle).toggleClass('active');
        const target = displayToggle.data('toggle');
        $('#' + target).toggle();
    }

    async _refundResources(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const rollId = div.data('rollId');
        const actionData = this.getActionData(rollId);

        if (!actionData) {
            ui.notifications.warn(`Action data expired. Unable to perform action.`);
            return;
        }

        Dialog.confirm({
            title: 'Confirm Refund',
            content: '<p>Are you sure you would like to refund ammo, fate, etc for this action?</p>',
            yes: async () => {
                await actionData.refundResources();
                ui.notifications.info(`Resources refunded`);
            },
            no: () => {},
            defaultYes: false,
        });
    }

    async _fateReroll(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const rollId = div.data('rollId');
        const actionData = this.getActionData(rollId);

        if (!actionData) {
            ui.notifications.warn(`Action data expired. Unable to perform action.`);
            return;
        }

        if (actionData.rollData?.sourceActor?.system?.fate?.value <= 0) {
            ui.notifications.warn(`Actor does not have enough fate points!`);
            return;
        }

        Dialog.confirm({
            title: 'Confirm Re-Roll',
            content: '<p>Are you sure you would like to use a fate point to re-roll action?</p>',
            yes: async () => {
                // Generate new ID for action data
                actionData.id = uuid();
                // Use a FP
                await actionData.rollData.sourceActor.spendFate();
                // Refund Initial Resources
                await actionData.refundResources();
                // Reset
                actionData.reset();
                // Run it back
                await actionData.performActionAndSendToChat();
            },
            no: () => {},
            defaultYes: false,
        });
    }

    async _assignDamage(event) {
        event.preventDefault();
        const div = $(event.currentTarget);

        const location = div.data('location');
        const totalDamage = div.data('totalDamage');
        const totalPenetration = div.data('totalPenetration');
        const totalFatigue = div.data('totalFatigue');
        const damageType = div.data('damageType');

        const hitData = new Hit();
        hitData.location = location;
        hitData.totalDamage = totalDamage;
        hitData.totalPenetration = totalPenetration;
        hitData.totalFatigue = totalFatigue;
        hitData.damageType = damageType;

        const targetUuid = div.data('targetUuid');

        let targetActor;
        if (targetUuid) {
            targetActor = await fromUuid(targetUuid);
            if (targetActor.actor != undefined) {
                targetActor = targetActor.actor;
            }
        } else {
            const targetedObjects = game.user.targets;
            if (targetedObjects && targetedObjects.size > 0) {
                const target = targetedObjects.values().next().value;
                targetActor = target.actor;
            }
        }
        if (!targetActor) {
            ui.notifications.warn(`Cannot determine target actor to assign hit.`);
            return;
        }

        const assignData = new AssignDamageData(targetActor, hitData);
        await prepareAssignDamageRoll(assignData);
    }

    async _applyDamage(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        console.log(div);
        const uuid = div.data('uuid');
        const damageType = div.data('type');
        const ignoreArmour = div.data('ignoreArmour');
        const location = div.data('location');
        const damage = div.data('damage');
        const penetration = div.data('penetration');
        const fatigue = div.data('fatigue');

        const actor = (await fromUuid(uuid)).actor;
        if (!actor) {
            ui.notifications.warn(`Cannot determine actor to assign hit.`);
            return;
        }
        for(const field of [damage, penetration, fatigue]) {
            if(field && !Number.isInteger(field)) {
                ui.notifications.warn(`Unable to determine damage/penetration/fatigue to assign.`);
                return;
            }
        }

        const assignDamageData = new AssignDamageData();
        assignDamageData.actor = actor;
        if(ignoreArmour || "true" === ignoreArmour || "TRUE" === ignoreArmour) {
            assignDamageData.ignoreArmour = true;
        }

        const hit = new Hit();
        if(location) {
            hit.location = location;
        }
        if(damage) {
            hit.totalDamage = Number.parseInt(damage);
        }
        if(penetration) {
            hit.totalPenetration = Number.parseInt(penetration);
        }
        if(fatigue) {
            hit.totalFatigue = Number.parseInt(fatigue);
        }
        if(damageType) {
            hit.damageType = damageType;
        }

        assignDamageData.hit = hit;

        await assignDamageData.update();
        await assignDamageData.finalize();
        await assignDamageData.performActionAndSendToChat();
    }

    async assignDamageTool() {
        const sourceToken = DHTargetedActionManager.getSourceToken();
        const sourceActorData = sourceToken ? sourceToken.actor : source;
        if(!sourceActorData) return;

        const hitData = new Hit();
        const assignData = new AssignDamageData(sourceActorData, hitData);
        await prepareAssignDamageRoll(assignData);
    }

    getActionData(id) {
        return this.storedRolls[id];
    }

    storeActionData(actionData) {
        //TODO: Cleanup all rolls older than ? minutes
        this.storedRolls[actionData.id] = actionData;
    }

    /**
     * Data Expected to vocalize item:
     * actor, name, type description
     * @param data
     * @returns {Promise<void>}
     */
    async sendItemVocalizeChat(data) {
        const html = await renderTemplate('systems/dark-heresy-2nd/templates/chat/item-vocalize-chat.hbs', data);
        let chatData = {
            user: game.user.id,
            content: html,
            rollMode: game.settings.get('core', 'rollMode'),
            type: CONST.CHAT_MESSAGE_TYPES.IC,
        };
        if (['gmroll', 'blindroll'].includes(chatData.rollMode)) {
            chatData.whisper = ChatMessage.getWhisperRecipients('GM');
        } else if (chatData.rollMode === 'selfroll') {
            chatData.whisper = [game.user];
        }
        ChatMessage.create(chatData);
    }
}

export const DHBasicActionManager = new BasicActionManager();
