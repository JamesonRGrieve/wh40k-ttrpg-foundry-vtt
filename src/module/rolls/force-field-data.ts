import type { WH40KBaseActorDocument, WH40KItemDocument } from '../types/global.d.ts';
import { roll1d100, applyRollModeWhispers } from './roll-helpers.ts';

type ForceFieldItem = WH40KItemDocument & {
    system: WH40KItemDocument['system'] & {
        protectionRating: number;
        craftsmanship: string;
    };
};

export class ForceFieldData {
    actor: WH40KBaseActorDocument;
    forceField: ForceFieldItem;
    protectionRating = 0;
    overloadRating = 1;

    roll: Roll | null = null;
    success = false;
    overload = false;

    constructor(actor: WH40KBaseActorDocument, forceField: ForceFieldItem) {
        this.actor = actor;
        this.forceField = forceField;

        this.protectionRating = this.forceField.system.protectionRating;
        this.overloadRating = this.craftsmanshipToOverload(this.forceField.system.craftsmanship);
    }

    craftsmanshipToOverload(craftsmanship: string): number {
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

        if ((this.roll.total ?? 0) <= this.protectionRating) {
            this.success = true;
        }

        if ((this.roll.total ?? 0) <= this.overloadRating) {
            this.overload = true;
        }
    }

    async performActionAndSendToChat() {
        game.wh40k.log('performActionAndSendToChat', this);

        // Update to overloaded if necessary
        if (this.overload) {
            this.forceField = (await this.forceField.update({
                'system.overloaded': true,
            })) as ForceFieldItem;
        }

        const html = await foundry.applications.handlebars.renderTemplate(
            'systems/wh40k-rpg/templates/chat/force-field-roll-chat.hbs',
            this as unknown as Record<string, unknown>,
        );
        const chatData: Record<string, unknown> = {
            user: game.user.id,
            rollMode: game.settings.get('core', 'rollMode'),
            content: html,
        };
        applyRollModeWhispers(chatData);
        await ChatMessage.create(chatData);
    }
}
