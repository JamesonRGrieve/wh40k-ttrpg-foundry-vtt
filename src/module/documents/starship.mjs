import { RogueTraderBaseActor } from './base-actor.mjs';

export class RogueTraderStarship extends RogueTraderBaseActor {

    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);
        let initData = {
            "token.bar1": { "attribute": "hullIntegrity" },
            "token.bar2": { "attribute": "crew.morale" },
            "token.displayName": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            "token.displayBars": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            "token.disposition": CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            "token.name": data.name
        }
        this.updateSource(initData)
    }

    async prepareData() {
        await super.prepareData();
        this._computeShipStats();
    }

    _computeShipStats() {
        // Calculate total power and space usage from components
        let powerGenerated = 0;
        let powerUsed = 0;
        let spaceUsed = 0;

        for (const item of this.items) {
            if (item.type === 'shipComponent' || item.type === 'shipWeapon' || item.type === 'shipUpgrade') {
                const power = item.system.powerUsage || 0;
                if (power > 0) {
                    powerGenerated += power;
                } else {
                    powerUsed += Math.abs(power);
                }
                spaceUsed += item.system.spaceUsage || 0;
            }
        }

        // Store calculated values
        this.system.power = this.system.power || {};
        this.system.power.generated = powerGenerated;
        this.system.power.consumed = powerUsed;
        this.system.power.available = powerGenerated - powerUsed;

        this.system.space = this.system.space || {};
        this.system.space.used = spaceUsed;
        this.system.space.available = (this.system.space.total || 0) - spaceUsed;
    }

    get hullType() {
        return this.system.hullType;
    }

    get hullClass() {
        return this.system.hullClass;
    }

    get hullIntegrity() {
        return this.system.hullIntegrity;
    }

    get speed() {
        return this.system.speed;
    }

    get manoeuvrability() {
        return this.system.manoeuvrability;
    }

    get detection() {
        return this.system.detection;
    }

    get armour() {
        return this.system.armour;
    }

    get voidShields() {
        return this.system.voidShields;
    }

    get turretRating() {
        return this.system.turretRating;
    }

    get crew() {
        return this.system.crew;
    }

    get power() {
        return this.system.power;
    }

    get space() {
        return this.system.space;
    }

    get weaponCapacity() {
        return this.system.weaponCapacity;
    }

    /**
     * Get all ship components
     */
    get shipComponents() {
        return this.items.filter(i => i.type === 'shipComponent');
    }

    /**
     * Get all ship weapons
     */
    get shipWeapons() {
        return this.items.filter(i => i.type === 'shipWeapon');
    }

    /**
     * Get all ship upgrades
     */
    get shipUpgrades() {
        return this.items.filter(i => i.type === 'shipUpgrade');
    }

    /**
     * Fire a ship weapon
     * @param {string} weaponId - The ID of the weapon to fire
     */
    async fireWeapon(weaponId) {
        const weapon = this.items.get(weaponId);
        if (!weapon || weapon.type !== 'shipWeapon') {
            ui.notifications.warn('Invalid ship weapon');
            return;
        }

        // Create a chat message with the weapon details
        const cardData = {
            actor: this,
            weapon: weapon,
            crewRating: this.system.crew?.crewRating || 30
        };

        const html = await renderTemplate('systems/rogue-trader/templates/chat/ship-weapon-chat.hbs', cardData);

        ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this }),
            content: html,
            type: CONST.CHAT_MESSAGE_STYLES.OTHER
        });
    }
}
