import { ActorContainerSheet } from './actor-container-sheet.mjs';

export class StarshipSheet extends ActorContainerSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 900,
            height: 700,
            resizable: true,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'stats' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/actor/actor-starship-sheet.hbs`;
    }

    getData() {
        const context = super.getData();
        context.dh = CONFIG.rt;

        // Get ship components grouped by type
        context.shipComponents = this.actor.items.filter((item) => item.type === 'shipComponent');
        context.shipWeapons = this.actor.items.filter((item) => item.type === 'shipWeapon');
        context.shipUpgrades = this.actor.items.filter((item) => item.type === 'shipUpgrade');
        context.shipRoles = this.actor.items.filter((item) => item.type === 'shipRole');

        // Calculate power and space usage
        context.powerGenerated = 0;
        context.powerUsed = 0;
        context.spaceUsed = 0;

        for (const component of context.shipComponents) {
            const power = component.system.powerUsage || 0;
            if (power > 0) {
                context.powerGenerated += power;
            } else {
                context.powerUsed += Math.abs(power);
            }
            context.spaceUsed += component.system.spaceUsage || 0;
        }

        for (const weapon of context.shipWeapons) {
            context.powerUsed += weapon.system.powerUsage || 0;
            context.spaceUsed += weapon.system.spaceUsage || 0;
        }

        for (const upgrade of context.shipUpgrades) {
            const power = upgrade.system.powerUsage || 0;
            if (power > 0) {
                context.powerGenerated += power;
            } else {
                context.powerUsed += Math.abs(power);
            }
            context.spaceUsed += upgrade.system.spaceUsage || 0;
        }

        context.powerAvailable = context.powerGenerated - context.powerUsed;
        context.spaceAvailable = (this.actor.system.space?.total || 0) - context.spaceUsed;

        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Ship weapon fire button
        html.find('.rt-ship-weapon-fire').click(async (ev) => {
            const itemId = ev.currentTarget.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (item) {
                await this._fireShipWeapon(item);
            }
        });
    }

    async _fireShipWeapon(weapon) {
        // Send weapon card to chat
        const cardData = {
            actor: this.actor,
            weapon: weapon,
            crewRating: this.actor.system.crew?.crewRating || 30
        };

        const html = await renderTemplate('systems/rogue-trader/templates/chat/ship-weapon-chat.hbs', cardData);

        ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: html,
            type: CONST.CHAT_MESSAGE_STYLES.OTHER
        });
    }
}
