import { roll1d100 } from './roll-helpers.mjs';


export class ForceFieldData {

    actor;
    forceField;
    protectionRating = 0;
    overloadRating = 1;

    roll;
    success = false;
    overload = false;

    constructor(actor, forceField) {
        this.actor = actor;
        this.forceField = forceField;

        this.protectionRating = this.forceField.system.protectionRating;
        this.overloadRating = this.craftsmanshipToOverload(this.forceField.system.craftsmanship);
    }

    update() {}

    craftsmanshipToOverload(craftsmanship) {
        switch(craftsmanship) {
            case 'Poor':
                return 15;
            case 'Common':
                return 10;
            case 'Good':
                return 5;
            default:
                return 1;
        }
    }

    async finalize() {
        this.roll = await roll1d100();

        if(this.roll.total <= this.protectionRating) {
            this.success = true;
        }

        if(this.roll.total <= this.overloadRating) {
            this.overload = true;
        }
    }

    async performActionAndSendToChat() {
        game.dh.log('performActionAndSendToChat', this)

        // Update to overloaded if necessary
        if(this.overload) {
            this.forceField = this.forceField.update({
                system: {
                    overloaded: true
                }
            })
        }

        const html = await renderTemplate('systems/dark-heresy-2nd/templates/chat/force-field-roll-chat.hbs', this);
        let chatData = {
            user: game.user.id,
            rollMode: game.settings.get('core', 'rollMode'),
            content: html,
            type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        };
        if (['gmroll', 'blindroll'].includes(chatData.rollMode)) {
            chatData.whisper = ChatMessage.getWhisperRecipients('GM');
        } else if (chatData.rollMode === 'selfroll') {
            chatData.whisper = [game.user];
        }
        ChatMessage.create(chatData);
    }
}
