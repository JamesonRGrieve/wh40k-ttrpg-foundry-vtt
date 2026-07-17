import type { WH40KBaseActorDocument, WH40KItemDocument } from '../types/global.d.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';
import { postChatCard, resolveGettersForTemplate, roll1d100 } from './roll-helpers.ts';

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
        const overloadByCraftsmanship: Record<string, number> = {
            Poor: 15,
            Common: 10,
            Good: 5,
        };
        return overloadByCraftsmanship[craftsmanship] ?? 1;
    }

    async finalize(): Promise<void> {
        this.roll = await roll1d100();

        if ((this.roll.total ?? 0) <= this.protectionRating) {
            this.success = true;
        }

        if ((this.roll.total ?? 0) <= this.overloadRating) {
            this.overload = true;
        }
    }

    async performActionAndSendToChat(): Promise<void> {
        game.wh40k.log('performActionAndSendToChat', this);

        // Update to overloaded if necessary
        if (this.overload) {
            this.forceField = (await this.forceField.update({
                'system.state.overloaded': true,
            })) as ForceFieldItem;
        }

        const cardData = resolveGettersForTemplate(this);
        cardData['_gameSystemId'] = firstSystemId(this.actor);
        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/force-field-roll-chat.hbs', cardData);
        await postChatCard(html);
    }
}
