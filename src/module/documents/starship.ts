import { WH40KBaseActor } from './base-actor.ts';
import type { WH40KItem } from './item.ts';

type StarshipSystemData = WH40KBaseActor['system'] & {
    hullType: string;
    hullClass: string;
    gameSystem?: string;
    hullIntegrity: { value: number; max: number };
    speed: number;
    manoeuvrability: number;
    detection: number;
    detectionBonus: number;
    armour: number;
    voidShields: number;
    turretRating: number;
    crew: {
        population: number;
        crewRating: number;
        morale: { value: number; max: number };
    };
    power: { used: number; total: number };
    space: { used: number; total: number };
    weaponCapacity: {
        dorsal: number;
        prow: number;
        port: number;
        starboard: number;
        keel: number;
    };
};

export class WH40KStarship extends WH40KBaseActor {
    declare system: StarshipSystemData;

    // biome-ignore lint/suspicious/noConfusingVoidType: Foundry _preCreate contract — returning false cancels creation; void means proceed
    protected override async _preCreate(data: never, options: never, user: never): Promise<boolean | void> {
        await super._preCreate(data, options, user);
        const dataWithName = data as { name?: string } | undefined;
        // eslint-disable-next-line no-restricted-syntax -- boundary: updateSource expects typed token delta; Record<string,unknown> is the only viable shape for dot-notation token update paths
        const initData: Record<string, unknown> = {
            'token.bar1': { attribute: 'hullIntegrity' },
            'token.bar2': { attribute: 'crew.morale' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'token.name': dataWithName?.name,
        };
        this.updateSource(initData);
    }

    /** @override */
    override prepareData(): void {
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

    get crew(): { population: number; crewRating: number; morale: { value: number; max: number } } {
        return this.system.crew;
    }

    get power(): { used: number; total: number } {
        return this.system.power;
    }

    get space(): { used: number; total: number } {
        return this.system.space;
    }

    get weaponCapacity(): { dorsal: number; prow: number; port: number; starboard: number; keel: number } {
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
    get shipComponents(): WH40KItem[] {
        return this.items.filter((i) => i.type === 'shipComponent');
    }

    /**
     * Get all ship weapons
     */
    get shipWeapons(): WH40KItem[] {
        return this.items.filter((i) => i.type === 'shipWeapon');
    }

    /**
     * Get all ship upgrades
     */
    get shipUpgrades(): WH40KItem[] {
        return this.items.filter((i) => i.type === 'shipUpgrade');
    }

    /**
     * Get ship weapons grouped by location
     */
    get weaponsByLocation(): Record<string, WH40KItem[]> {
        const grouped: Record<string, WH40KItem[]> = {
            prow: [],
            dorsal: [],
            port: [],
            starboard: [],
            keel: [],
        };
        for (const weapon of this.shipWeapons) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: ship weapon item.system fields are not typed in this document layer; accessing location requires dynamic lookup
            const loc = (weapon.system as Record<string, unknown>)['location'];
            const locStr = typeof loc === 'string' ? loc : 'dorsal';
            const bucket = grouped[locStr];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: Record index access may be undefined at runtime
            if (bucket !== undefined) bucket.push(weapon);
        }
        return grouped;
    }

    /**
     * Fire a ship weapon
     * @param {string} weaponId - The ID of the weapon to fire
     */
    async fireWeapon(weaponId: string): Promise<void> {
        const weapon = this.items.get(weaponId);
        if (weapon?.type !== 'shipWeapon') {
            // eslint-disable-next-line no-restricted-syntax -- string is a localization key passed via { localize: true }
            ui.notifications.warn('WH40K.Starship.Errors.InvalidShipWeapon', { localize: true });
            return;
        }

        // Create a chat message with the weapon details
        const cardData = {
            actor: this,
            weapon: weapon,
            crewRating: this.system.crew.crewRating,
            detectionBonus: this.detectionBonus,
            gameSystem: this.system.gameSystem,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ship-weapon-chat.hbs', cardData);

        await ChatMessage.create({
            user: game.user.id,
            // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker requires Actor.Implementation; WH40KStarship extends it but type narrowing requires cast
            speaker: ChatMessage.getSpeaker({ actor: this as unknown as Actor.Implementation }),
            content: html,
        });
    }

    /**
     * Roll ship initiative (1d10 + Detection Bonus)
     */
    override async rollInitiative(_options?: Actor.RollInitiativeOptions): Promise<Combat.Implementation | null> {
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
            // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker requires Actor.Implementation; WH40KStarship extends it but type narrowing requires cast
            speaker: ChatMessage.getSpeaker({ actor: this as unknown as Actor.Implementation }),
            content: content,
            rolls: [roll],
        });

        return null;
    }
}
