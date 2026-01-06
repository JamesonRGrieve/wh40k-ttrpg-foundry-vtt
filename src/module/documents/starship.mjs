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

    /** @override */
    prepareData() {
        super.prepareData();
        // Call DataModel's embedded data preparation for component calculations
        if (typeof this.system.prepareEmbeddedData === 'function') {
            this.system.prepareEmbeddedData();
        }
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

    get detectionBonus() {
        return this.system.detectionBonus || Math.floor(this.detection / 10);
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
     * Is the ship crippled (below half hull)?
     * @type {boolean}
     */
    get isCrippled() {
        return this.hullIntegrity.value <= Math.floor(this.hullIntegrity.max / 2);
    }

    /**
     * Is the ship destroyed?
     * @type {boolean}
     */
    get isDestroyed() {
        return this.hullIntegrity.value <= 0;
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
     * Get ship weapons grouped by location
     */
    get weaponsByLocation() {
        const grouped = {
            prow: [],
            dorsal: [],
            port: [],
            starboard: [],
            keel: []
        };
        for (const weapon of this.shipWeapons) {
            const loc = weapon.system.location || 'dorsal';
            if (grouped[loc]) grouped[loc].push(weapon);
        }
        return grouped;
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
            crewRating: this.system.crew?.crewRating || 30,
            detectionBonus: this.detectionBonus
        };

        const html = await renderTemplate('systems/rogue-trader/templates/chat/ship-weapon-chat.hbs', cardData);

        ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this }),
            content: html,
            type: CONST.CHAT_MESSAGE_STYLES.OTHER
        });
    }

    /**
     * Roll ship initiative (1d10 + Detection Bonus)
     */
    async rollInitiative() {
        const roll = await new Roll(`1d10 + ${this.detectionBonus}`).evaluate();
        
        const content = `
            <div class="rt-ship-initiative-roll">
                <h3><i class="fas fa-satellite-dish"></i> Ship Initiative</h3>
                <div class="rt-roll-formula">1d10 + Detection Bonus (${this.detectionBonus})</div>
                <div class="rt-roll-result">${roll.total}</div>
            </div>
        `;

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this }),
            content: content,
            rolls: [roll],
            type: CONST.CHAT_MESSAGE_STYLES.ROLL
        });

        return roll;
    }
}
