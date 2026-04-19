import { roll1d100, applyRollModeWhispers } from './roll-helpers.ts';

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

    craftsmanshipToOverload(craftsmanship) {
        switch (craftsmanship) {
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

        if (this.roll.total <= this.protectionRating) {
            this.success = true;
        }

        if (this.roll.total <= this.overloadRating) {
            this.overload = true;
        }
    }

    async performActionAndSendToChat() {
        game.wh40k.log('performActionAndSendToChat', this);

        // Update to overloaded if necessary
        if (this.overload) {
            this.forceField = await this.forceField.update({
                'system.overloaded': true,
            });
        }

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/force-field-roll-chat.hbs', this);
        const chatData: Record<string, unknown> = {
            user: game.user.id,
            rollMode: game.settings.get('core', 'rollMode'),
            content: html,
        };
        applyRollModeWhispers(chatData);
        await (ChatMessage as any).create(chatData);
    }
}
