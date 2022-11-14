export class BasicActionManager {
    initializeHooks() {}

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
