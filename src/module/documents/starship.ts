import { WH40KBaseActor } from './base-actor.ts';

export class WH40KStarship extends WH40KBaseActor {
    async _preCreate(data, options, user): Promise<unknown> {
        await super._preCreate(data, options, user);
        const initData = {
            'token.bar1': { attribute: 'hullIntegrity' },
            'token.bar2': { attribute: 'crew.morale' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'token.name': data.name,
        };
        // @ts-expect-error - type mismatch
        this.updateSource(initData);
    }

    /** @override */
    prepareData(): void {
        super.prepareData();
        // Call DataModel's embedded data preparation for component calculations
        if (typeof this.system.prepareEmbeddedData === 'function') {
            this.system.prepareEmbeddedData();
        }
    }

    get hullType(): string {
        return this.system.hullType;
    }

    get hullClass(): string {
        return this.system.hullClass;
    }

    get hullIntegrity(): { value: number; max: number } {
        return this.system.hullIntegrity;
    }

    get speed(): number {
        return this.system.speed;
    }

    get manoeuvrability(): number {
        return this.system.manoeuvrability;
    }

    get detection(): number {
        return this.system.detection;
    }

    get detectionBonus(): number {
        return this.system.detectionBonus || Math.floor(this.detection / 10);
    }

    get armour(): number {
        return this.system.armour;
    }

    get voidShields(): number {
        return this.system.voidShields;
    }

    get turretRating(): number {
        return this.system.turretRating;
    }

    get crew(): Record<string, unknown> {
        return this.system.crew;
    }

    get power(): { used: number; total: number } {
        return this.system.power;
    }

    get space(): { used: number; total: number } {
        return this.system.space;
    }

    get weaponCapacity(): Record<string, unknown> {
        return this.system.weaponCapacity;
    }

    /**
     * Is the ship crippled (below half hull)?
     * @type {boolean}
     */
    get isCrippled(): boolean {
        return this.hullIntegrity.value <= Math.floor(this.hullIntegrity.max / 2);
    }

    /**
     * Is the ship destroyed?
     * @type {boolean}
     */
    get isDestroyed(): boolean {
        return this.hullIntegrity.value <= 0;
    }

    /**
     * Get all ship components
     */
    get shipComponents(): unknown[] {
        return this.items.filter((i) => (i.type as string) === 'shipComponent');
    }

    /**
     * Get all ship weapons
     */
    get shipWeapons(): unknown[] {
        return this.items.filter((i) => (i.type as string) === 'shipWeapon');
    }

    /**
     * Get all ship upgrades
     */
    get shipUpgrades(): unknown[] {
        return this.items.filter((i) => (i.type as string) === 'shipUpgrade');
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
            keel: [],
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
    async fireWeapon(weaponId): Promise<void> {
        const weapon = this.items.get(weaponId);
        if (!weapon || (weapon.type as string) !== 'shipWeapon') {
            ui.notifications.warn('Invalid ship weapon');
            return;
        }

        // Create a chat message with the weapon details
        const cardData = {
            actor: this,
            weapon: weapon,
            crewRating: this.system.crew?.crewRating || 30,
            detectionBonus: this.detectionBonus,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ship-weapon-chat.hbs', cardData);

        await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this }),
            content: html,
        });
    }

    /**
     * Roll ship initiative (1d10 + Detection Bonus)
     */
    async rollInitiative(): Promise<unknown> {
        const roll = await new Roll(`1d10 + ${this.detectionBonus}`).evaluate();

        const content = `
            <div class="wh40k-hit-location-result">
                <h3><i class="fas fa-satellite-dish"></i> Ship Initiative</h3>
                <div class="wh40k-hit-roll">
                    <span class="wh40k-roll-result">${roll.total}</span>
                </div>
                <div class="wh40k-hit-location">
                    <span class="wh40k-location-armour">1d10 + Detection Bonus (${this.detectionBonus})</span>
                </div>
            </div>
        `;

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this }),
            content: content,
            rolls: [roll],
        });

        return roll;
    }
}
