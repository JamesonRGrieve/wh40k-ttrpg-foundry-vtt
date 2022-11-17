import { refundAmmo } from '../rules/ammo.mjs';
import { uuid } from '../rolls/roll-helpers.mjs';

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
                await actionData.performAttackAndSendToChat();
            },
            no: () => {},
            defaultYes: false,
        });
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
            type: CONST.CHAT_MESSAGE_TYPES.IC,
        };
        ChatMessage.create(chatData);
    }
}

export const DHBasicActionManager = new BasicActionManager();
