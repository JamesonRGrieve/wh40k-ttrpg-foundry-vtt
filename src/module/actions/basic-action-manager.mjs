import { refundAmmo } from '../rules/ammo.mjs';
import { uuid } from '../rolls/roll-helpers.mjs';
import { AssignDamageData } from '../rolls/assign-damage-data.mjs';
import { prepareAssignDamageRoll } from '../prompts/assign-damage-prompt.mjs';
import { DHTargetedActionManager } from './targeted-action-manager.mjs';
import { Hit } from '../rolls/damage-data.mjs';

export class BasicActionManager {
    // This is stored rolls for allowing re-rolls, ammo refund, etc.
    storedRolls = {};

    initializeHooks() {
        // Add show/hide support for chat messages
        Hooks.on('renderChatMessage', async (message, html, data) => {
            game.dh.log('renderChatMessage', { message, html, data });
            html.find('.roll-control__hide-control').click(async (ev) => await this._toggleExpandChatMessage(ev));
            html.find('.roll-control__refund-ammo').click(async (ev) => await this._refundAmmo(ev));
            html.find('.roll-control__fate-reroll').click(async (ev) => await this._fateReroll(ev));
            html.find('.roll-control__assign-damage').click(async (ev) => await this._assignDamage(ev));
        });

        // Initialize Scene Control Buttons
        Hooks.on('getSceneControlButtons', (controls) => {
            const bar = controls.find((c) => c.name === 'token');
            bar.tools.push({
                name: 'Assign Damage',
                title: 'Assign Damage',
                icon: 'fas fa-wand-magic-sparkles',
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

    async _refundAmmo(event) {
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
            content: '<p>Are you sure you would like to refund ammo for this action?</p>',
            yes: async () => {
                await refundAmmo(actionData);
                ui.notifications.info(`Ammo refunded`);
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
        // Generate new ID for action data
        actionData.id = uuid();

        if (!actionData) {
            ui.notifications.warn(`Action data expired. Unable to perform action.`);
            return;
        }

        Dialog.confirm({
            title: 'Confirm Re-Roll',
            content: '<p>Are you sure you would like to use a fate point to re-roll action?</p>',
            yes: async () => {
                await refundAmmo(actionData);
                actionData.reset();
                await actionData.performActionAndSendToChat();
            },
            no: () => {},
            defaultYes: false,
        });
    }

    async _assignDamage(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const rollId = div.data('rollId');
        const hit = div.data('hitIndex');
        const actionData = this.getActionData(rollId);

        if (!actionData) {
            ui.notifications.warn(`Action data expired. Unable to perform action.`);
            return;
        }

        if (!actionData.rollData?.targetActor) {
            ui.notifications.warn(`Cannot determine target actor to assign hit.`);
            return;
        }

        if(!Number.isInteger(hit)) {
            ui.notifications.warn(`Unable to determine hit to assign.`);
            return;
        }
        const hitIndex = Number.parseInt(hit);

        if(hitIndex >= actionData.damageData.hits.length) {
            ui.notifications.warn(`Unable to determine hit to assign.`);
            return;
        }

        const hitData = actionData.damageData.hits[hitIndex];
        const assignData = new AssignDamageData(actionData.rollData.targetActor, hitData);
        await prepareAssignDamageRoll(assignData);
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
