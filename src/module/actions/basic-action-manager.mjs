export class BasicActionManager {
    initializeHooks() {
        // Add show/hide support for chat messages
        Hooks.on('renderChatMessage', async (message, html, data) => {
            game.dh.log('renderChatMessage', {message, html, data});
            html.find('.roll-control__hide-control').click(async (ev) => {
                game.dh.log('roll-control-toggle');
                ev.preventDefault();
                const displayToggle = $(ev.currentTarget);
                $('span:first', displayToggle).toggleClass('active');
                const target = displayToggle.data('toggle');
                $('#' + target).toggle();
            });
        });
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
