import { capitalize } from '../handlebars/handlebars-helpers.ts';
import { applyRollModeWhispers } from '../rolls/roll-helpers.ts';
import type { WH40KItemSystemData } from '../types/global.d.ts';
import type { WH40KBaseActor } from './base-actor.ts';
import { WH40KItemContainer } from './item-container.ts';

/* eslint-disable no-restricted-syntax -- boundary: compendium pack index entry, opaque foreign system schema */
type AttackSpecialIndexEntry = {
    _id: string;
    name: string;
    img?: string;
    type?: string;
    system: Record<string, unknown> & { hasLevel?: boolean; level?: number | string | undefined; enabled?: number | string | boolean | undefined };
};
/* eslint-enable no-restricted-syntax */

type OriginActorLike = WH40KBaseActor & {
    system: WH40KBaseActor['system'] & {
        characteristics?: Record<string, { advance?: number }>;
        wounds?: { max?: number };
        fate?: { total?: number };
    };
};

export class WH40KItem extends WH40KItemContainer {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 nested-container ref is opaque
    declare system: WH40KItemSystemData & { container: unknown };

    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create return is opaque
    async toChat(): Promise<unknown> {
        return this.sendToChat();
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: receives unvalidated source data during cleanData
    static #pruneUndefined(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value.map((entry) => this.#pruneUndefined(entry));
        }

        if (value !== null && typeof value === 'object' && !(value instanceof Set) && !(value instanceof Map)) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: cleanData source bag
            const mutableValue = value as Record<string, unknown>;
            // ActorDelta.updateSyntheticActor hands us frozen delta objects during token
            // resynthesis; mutating them would throw and abort Item init, which in turn
            // blanks the token texture. Skip frozen/sealed objects entirely — their
            // `undefined` fields will be handled by schema coercion downstream.
            if (Object.isFrozen(value) || Object.isSealed(value)) return value;
            for (const key of Object.keys(mutableValue)) {
                const entry = mutableValue[key];
                if (entry === undefined) {
                    const desc = Object.getOwnPropertyDescriptor(mutableValue, key);
                    if (desc?.configurable === true) delete mutableValue[key];
                    continue;
                }

                mutableValue[key] = this.#pruneUndefined(entry);
            }
        }

        return value;
    }

    /**
     * Override to clean/validate img field before validation runs.
     * Foundry V13 has strict img validation - ensure valid file extension.
     * @param {object} source - The candidate data object to clean
     * @param {object} options - Additional options
     * @param {object} _state - Internal state
     * @returns {object} The cleaned data
     * @override
     */
    /* eslint-disable no-restricted-syntax -- boundary: Foundry V14 cleanData receives raw source bag */
    static override cleanData(
        source: Record<string, unknown> = {},
        options: DataModelV14.CleaningOptions = {},
        _state: DataModelV14.UpdateState = {},
    ): Record<string, unknown> {
        /* eslint-enable no-restricted-syntax */
        // Remove explicit undefined values before schema validation runs.
        // Foundry treats `undefined` differently from an omitted field during updates.
        this.#pruneUndefined(source);

        // CRITICAL: Clean img field if present - V13 validation is very strict
        if ('img' in source) {
            const imgValue = source['img'];
            const sourceType = source['type'];
            const typeStr = typeof sourceType === 'string' && sourceType.length > 0 ? sourceType : 'unknown';

            // Handle empty, null, undefined, or non-string img values
            if (typeof imgValue !== 'string' || imgValue.trim() === '') {
                // Set to type-specific default
                source['img'] = this._getDefaultIcon(typeStr);
                console.warn(`WH40K | cleanData: Invalid img value "${String(imgValue)}" for type "${typeStr}", using default: ${String(source['img'])}`);
            } else {
                // Check if has valid extension
                const validExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.webm'];
                const imgStr = imgValue.toLowerCase().trim();

                // Also check for obviously invalid paths
                if (imgStr === 'null' || imgStr === 'undefined' || imgStr.length < 5) {
                    source['img'] = this._getDefaultIcon(typeStr);
                    console.warn(`WH40K | cleanData: Invalid img path "${imgValue}" for type "${typeStr}", using default: ${String(source['img'])}`);
                } else {
                    const hasValidExtension = validExtensions.some((ext) => imgStr.endsWith(ext));

                    if (!hasValidExtension) {
                        // Invalid extension - use type-specific default
                        source['img'] = this._getDefaultIcon(typeStr);
                        console.warn(`WH40K | cleanData: No valid extension in "${imgValue}" for type "${typeStr}", using default: ${String(source['img'])}`);
                    }
                }
            }
        }
        // Note: If img is not in source, that's fine - it just won't be updated
        // No need to add a default since the existing document img will remain

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- super.cleanData signature is too narrow at compile time; runtime accepts _state
        return (super.cleanData as DataModelV14.CleanDataSignature)(source, options, _state);
    }

    /**
     * Get default icon path for an item type.
     * Uses Foundry's built-in default icons which are guaranteed to exist.
     * @param {string} type - The item type
     * @returns {string} Path to default icon
     * @private
     */
    static _getDefaultIcon(type: string): string {
        // Use Foundry's built-in default icons that definitely exist
        const defaultIcons: Record<string, string> = {
            weapon: 'icons/svg/sword.svg',
            armour: 'icons/svg/shield.svg',
            gear: 'icons/svg/item-bag.svg',
            ammunition: 'icons/svg/explosion.svg',
            talent: 'icons/svg/book.svg',
            trait: 'icons/svg/blood.svg',
            psychicPower: 'icons/svg/lightning.svg',
            navigatorPower: 'icons/svg/eye.svg',
            skill: 'icons/svg/target.svg',
            cybernetic: 'icons/svg/upgrade.svg',
            forceField: 'icons/svg/shield.svg',
            shipComponent: 'icons/svg/mech.svg',
            shipWeapon: 'icons/svg/cannon.svg',
            condition: 'icons/svg/daze.svg',
            criticalInjury: 'icons/svg/blood.svg',
            originPath: 'icons/svg/direction.svg',
            order: 'icons/svg/pawprint.svg',
            ritual: 'icons/svg/book.svg',
        };

        // Return type-specific icon or generic mystery-man fallback
        return defaultIcons[type] ?? 'icons/svg/mystery-man.svg';
    }

    /** Helper to get the item type as a plain string for comparison. */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- legacy public alias
    get _type(): string {
        return this.type;
    }

    get totalWeight(): number {
        // eslint-disable-next-line no-restricted-syntax -- boundary: system.weight optional in shared item schema
        let weight: number = this.system.weight ?? 0;
        if (this.items.size > 0) {
            this.items.forEach((item) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: nested Item store typed as base Foundry Item
                weight += (item as unknown as WH40KItem).totalWeight;
            });
        }
        return weight;
    }

    get equipped(): boolean {
        return this.system.equipped === true;
    }

    get isMentalDisorder(): boolean {
        return this._type === 'mentalDisorder';
    }

    get isMalignancy(): boolean {
        return this._type === 'malignancy';
    }

    get isMutation(): boolean {
        return this._type === 'mutation';
    }

    get isTalent(): boolean {
        return this._type === 'talent';
    }

    get isTrait(): boolean {
        return this._type === 'trait';
    }

    get isAptitude(): boolean {
        return this._type === 'aptitude';
    }

    get isSpecialAbility(): boolean {
        return this._type === 'specialAbility';
    }

    get isPsychicPower(): boolean {
        return this._type === 'psychicPower';
    }

    get isNavigatorPower(): boolean {
        return this._type === 'navigatorPower';
    }

    get isPsychicBarrage(): boolean {
        return this._type === 'psychicPower' && this.system.attackType === 'Psychic Barrage';
    }

    get isPsychicStorm(): boolean {
        return this._type === 'psychicPower' && this.system.attackType === 'Psychic Storm';
    }

    get isCriticalInjury(): boolean {
        return this._type === 'criticalInjury';
    }

    get isOriginPath(): boolean {
        const rtFlags = this.flags['rt'];
        return this._type === 'originPath' || (this._type === 'trait' && rtFlags?.['kind'] === 'origin');
    }

    get isSkill(): boolean {
        return this._type === 'skill';
    }

    get isOrder(): boolean {
        return this._type === 'order';
    }

    get isRitual(): boolean {
        return this._type === 'ritual';
    }

    get isShipComponent(): boolean {
        return this._type === 'shipComponent';
    }

    get isShipRole(): boolean {
        return this._type === 'shipRole';
    }

    get isShipUpgrade(): boolean {
        return this._type === 'shipUpgrade';
    }

    get isShipWeapon(): boolean {
        return this._type === 'shipWeapon';
    }

    get isVehicleTrait(): boolean {
        return this._type === 'vehicleTrait';
    }

    get isVehicleUpgrade(): boolean {
        return this._type === 'vehicleUpgrade';
    }

    get isWeaponQuality(): boolean {
        return this._type === 'weaponQuality';
    }

    get isCondition(): boolean {
        const rtFlags = this.flags['rt'];
        return this._type === 'trait' && rtFlags?.['kind'] === 'condition';
    }

    get originPathStep(): string {
        const rtFlags = this.flags['rt'];
        const flagStep = rtFlags?.['step'];
        if (typeof flagStep === 'string' && flagStep !== '') return flagStep;
        // eslint-disable-next-line no-restricted-syntax -- boundary: system.step optional in shared item schema
        return this.system.step ?? '';
    }

    /** Normalize a possibly-undefined weapon class to lower-case string. */
    #weaponClass(): string {
        // eslint-disable-next-line no-restricted-syntax -- boundary: system.class optional in shared weapon schema
        const cls: string = this.system.class ?? '';
        return cls.toLowerCase();
    }

    /** Narrow `this.actor` to the WH40K-specific actor whose schema we depend on. */
    #wh40kActor(): WH40KBaseActor | null {
        return this.actor;
    }

    get isWeapon(): boolean {
        return this._type === 'weapon';
    }

    get isRanged(): boolean {
        return this._type === 'weapon' && this.#weaponClass() !== 'melee';
    }

    get isThrown(): boolean {
        return this._type === 'weapon' && this.#weaponClass() === 'thrown';
    }

    get usesAmmo(): boolean {
        return this.isRanged && this.system.reload !== undefined && this.system.reload !== '' && this.system.reload !== 'N/A';
    }

    get isMelee(): boolean {
        return this._type === 'weapon' && this.#weaponClass() === 'melee';
    }

    get isArmour(): boolean {
        return this._type === 'armour';
    }

    get isArmourModification(): boolean {
        return this._type === 'armourModification';
    }

    get isGear(): boolean {
        return this._type === 'gear' || this.isConsumable || this.isDrug || this.isAmmunition || this.isTool;
    }

    get isDrug(): boolean {
        return this._type === 'drug';
    }

    get isConsumable(): boolean {
        return this._type === 'consumable';
    }

    get isTool(): boolean {
        return this._type === 'tool';
    }

    get isCybernetic(): boolean {
        return this._type === 'cybernetic';
    }

    get isWeaponModification(): boolean {
        return this._type === 'weaponModification';
    }

    get isAmmunition(): boolean {
        return this._type === 'ammunition';
    }

    get isForceField(): boolean {
        return this._type === 'forceField';
    }

    get isAttackSpecial(): boolean {
        return this._type === 'attackSpecial';
    }

    get isStorageLocation(): boolean {
        return this._type === 'storageLocation';
    }

    get isBackpack(): boolean {
        return this._type === 'backpack';
    }

    get isInBackpack(): boolean {
        return (this.system['backpack'] as { inBackpack?: boolean } | undefined)?.inBackpack === true;
    }

    get isJournalEntry(): boolean {
        return this._type === 'journalEntry';
    }

    get isEnemy(): boolean {
        return this._type === 'enemy';
    }

    get isPeer(): boolean {
        return this._type === 'peer';
    }

    protected override _onCreate(data: never, options: never, userId: string): void {
        game.wh40k.log('Determining nested items for', this);
        void this._determineNestedItems();
        super._onCreate(data, options, userId);
    }

    override prepareData(): void {
        super.prepareData();
        game.wh40k.log('Item prepare data', this);

        this.convertNestedToItems();

        if (this.isPsychicPower) {
            if (this.system.damage === undefined || this.system.damage === '') {
                this.system.damage = '0';
            }
            /* eslint-disable no-restricted-syntax -- boundary: penetration default for psychic powers (legacy data shape) */
            this.system.penetration ??= 0;
            /* eslint-enable no-restricted-syntax */
        }

        // Fix Broken Selects
        if (this.system.craftsmanship === undefined || this.system.craftsmanship === '') {
            this.system.craftsmanship = 'Common';
        }
        if (this.system.availability === undefined || this.system.availability === '') {
            this.system.availability = 'Common';
        }
    }

    /**
     * This unlocks and loads nested items dynamically from the adjacent compendium.
     * I tried to find another way to do this but couldn't find anything online - I made my own hack.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns opaque Foundry Document.update result
    async _determineNestedItems(): Promise<unknown> {
        // Already has items just skip
        if (this.items.size > 0 || this.hasNested()) return undefined;

        // Check for specials
        if (this.system['special'] !== undefined && this.system['special'] !== null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: legacy `system.special` is a free-form bag pre-migration
            const specialData = this.system['special'] as Record<string, unknown>;
            game.wh40k.log(`Performing first time nested item configuration for item: ${this.name} with specials: `, this.system['special']);
            if (this.isWeapon) await this._updateSpecialsFromPack('wh40k-rpg.weapons', specialData);
            if (this.isAmmunition) await this._updateSpecialsFromPack('wh40k-rpg.ammo', specialData);
            game.wh40k.log(`Special migrated for item: ${this.name}`, this.system['special']);
            this.system['special'] = undefined;

            this.convertNestedToItems();
        }
        return undefined;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: receives legacy `system.special` bag
    async _updateSpecialsFromPack(pack: string, data: Record<string, unknown>): Promise<unknown> {
        const compendium = game.packs.find((p: { collection?: string }) => p.collection === pack);
        if (!compendium) return undefined;
        await compendium.configure({ locked: false });
        const attackSpecials = await this._getAttackSpecials(data);
        if (attackSpecials.length > 0) {
            await this.createNestedDocuments(attackSpecials);
        }
        await compendium.configure({ locked: true });
        return undefined;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: receives legacy `system.special` bag
    async _getAttackSpecials(specialData: Record<string, unknown>): Promise<AttackSpecialIndexEntry[]> {
        const attackSpecialPack = game.packs.find((p: { collection?: string }) => p.collection === 'wh40k-rpg.attack-specials');
        if (!attackSpecialPack) return [];
        const index = await attackSpecialPack.getIndex({ fields: ['name', 'img', 'type', 'system'] });
        const specials: AttackSpecialIndexEntry[] = [];
        for (const special of Object.keys(specialData)) {
            const specialName = capitalize(special);
            const attackSpecial = index.find((n: { name?: string }) => n.name === specialName) as AttackSpecialIndexEntry | undefined;
            if (attackSpecial) {
                const value = specialData[special];
                if (attackSpecial.system.hasLevel === true) {
                    attackSpecial.system.level = value as AttackSpecialIndexEntry['system']['level'];
                } else {
                    attackSpecial.system.enabled = value as AttackSpecialIndexEntry['system']['enabled'];
                }
                specials.push(attackSpecial);
            }
        }
        return specials;
    }

    /**
     * Get the item type label for display
     * @returns {string} The localized item type label
     */
    get itemTypeLabel(): string {
        const typeLabels: Record<string, string> = {
            weapon: 'Weapon',
            armour: 'Armour',
            talent: 'Talent',
            trait: 'Trait',
            skill: 'Skill',
            psychicPower: 'Psychic Power',
            navigatorPower: 'Navigator Power',
            shipComponent: 'Ship Component',
            shipRole: 'Ship Role',
            shipWeapon: 'Ship Weapon',
            order: 'Order',
            ritual: 'Ritual',
            originPath: 'Origin Path',
            gear: 'Gear',
            cybernetic: 'Cybernetic',
            consumable: 'Consumable',
            ammunition: 'Ammunition',
            forceField: 'Force Field',
        };
        return typeLabels[this.type] ?? this.type;
    }

    /**
     * Check if this item has actions available
     * @returns {boolean}
     */
    get hasActions(): boolean {
        return this.isWeapon || this.isPsychicPower || this.isNavigatorPower || (this.isTalent && this.system.isRollable);
    }

    /**
     * Check if this item can be rolled
     * @returns {boolean}
     */
    get isRollable(): boolean {
        return (this.isTalent && this.system.isRollable) || (this.isSkill && this.system['rollConfig'] !== undefined && this.system['rollConfig'] !== null);
    }

    /**
     * Send this item's details to chat as a card
     * @param {Object} options - Options for the chat card
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: chat options passed through to Foundry ChatMessage.create
    async sendToChat(options: Record<string, unknown> = {}): Promise<unknown> {
        const cardData = {
            item: this,
            itemTypeLabel: this.itemTypeLabel,
            isWeapon: this.isWeapon,
            isArmour: this.isArmour,
            isNavigatorPower: this.isNavigatorPower,
            isShipComponent: this.isShipComponent,
            isPsychicPower: this.isPsychicPower,
            isTalent: this.isTalent,
            hasActions: this.hasActions,
            isRollable: this.isRollable,
            isUsable: this.isConsumable || this.isDrug || this.isTool,
            actor: this.actor,
            gameSystem: (this.actor?.system as { gameSystem?: string } | undefined)?.gameSystem,
            ...options,
        };

        // Use type-specific templates
        let template = 'systems/wh40k-rpg/templates/chat/item-card-chat.hbs';
        if (this.isWeapon) {
            template = 'systems/wh40k-rpg/templates/chat/weapon-card-chat.hbs';
        } else if (this._type === 'armour') {
            template = 'systems/wh40k-rpg/templates/chat/armour-card-chat.hbs';
        }

        const html = await foundry.applications.handlebars.renderTemplate(template, cardData);

        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts a free-form data bag
        const chatData: Record<string, unknown> = {
            user: game.user.id,
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            // Set flags for ChatMessageWH40K enrichment
            flags: {
                'wh40k-rpg': {
                    itemCard: true,
                    item: {
                        uuid: this.uuid,
                        id: this.id,
                        name: this.name,
                        type: this.type,
                    },
                    actor: this.actor
                        ? {
                              uuid: this.actor.uuid,
                              id: this.actor.id,
                              name: this.actor.name,
                          }
                        : null,
                },
            },
        };

        chatData['rollMode'] = game.settings.get('core', 'rollMode');
        applyRollModeWhispers(chatData);

        return ChatMessage.create(chatData);
    }

    /**
     * Perform the default action for this item
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: dispatches to actor roll APIs returning opaque results
    async performAction(): Promise<unknown> {
        if (this.isWeapon) {
            // Weapon attack - handled by the actor sheet
            const weaponActor = this.actor;
            const result = weaponActor?.rollWeaponAction(this);
            return result ?? this.sendToChat();
        } else if (this.isPsychicPower) {
            // Psychic power - handled by the actor sheet
            const psychicActor = this.actor;
            const result = psychicActor?.rollPsychicPower(this);
            return result ?? this.sendToChat();
        } else if (this.isNavigatorPower) {
            // Navigator power - roll navigator power
            return this.rollNavigatorPower();
        } else if (this.isTalent && this.system.isRollable) {
            // Rollable talent
            return this.rollTalent();
        } else if (this.isOrder) {
            // Ship order - roll order
            return this.rollOrder();
        } else if (this.isRitual) {
            // Ritual - roll ritual
            return this.rollRitual();
        } else {
            // Default - send to chat
            return this.sendToChat();
        }
    }

    /**
     * Roll a talent that has a rollable action
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns opaque ChatMessage / roll result
    async rollTalent(): Promise<unknown> {
        if (!this.actor) {
            return this.sendToChat();
        }

        const rollConfig = this.system['rollConfig'] as
            | {
                  characteristic?: string;
                  modifier?: number;
                  description?: string;
              }
            | undefined;
        if (rollConfig?.characteristic === undefined || rollConfig.characteristic === '') {
            return this.sendToChat();
        }

        // Get the characteristic value
        const charKey = rollConfig.characteristic.toLowerCase();
        const talentActor = this.#wh40kActor();
        const characteristic = talentActor?.characteristics[charKey];
        if (characteristic === undefined) {
            return this.sendToChat();
        }

        const targetValue = characteristic.total + (rollConfig.modifier ?? 0);

        // Create the roll
        const roll = new Roll('1d100');
        await roll.evaluate();
        if (roll.total === undefined) return this.sendToChat();
        const rollTotal: number = roll.total;

        const success = rollTotal <= targetValue;
        const degrees = Math.floor(Math.abs(targetValue - rollTotal) / 10);

        const cardData = {
            item: this,
            itemTypeLabel: this.itemTypeLabel,
            roll: roll,
            targetValue: targetValue,
            success: success,
            degrees: degrees,
            characteristic: characteristic,
            charKey: charKey,
            actor: this.actor.name,
            rollDescription: rollConfig.description ?? '',
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/talent-roll-chat.hbs', cardData);

        return ChatMessage.create({
            user: game.user.id,
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            rolls: [roll],
        });
    }

    /**
     * Roll a navigator power
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns opaque ChatMessage / roll result
    async rollNavigatorPower(): Promise<unknown> {
        if (!this.actor) {
            return this.sendToChat();
        }

        // Navigator powers typically use Perception or Willpower
        const navActor = this.#wh40kActor();
        if (navActor === null) return this.sendToChat();
        const perception = navActor.characteristics['perception'];
        const willpower = navActor.characteristics['willpower'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics[key] may be undefined at runtime
        if (perception === undefined || willpower === undefined) return this.sendToChat();

        // Use the higher of the two as base, modified by Navigator Rank
        // eslint-disable-next-line no-restricted-syntax -- boundary: navigatorRank lives outside the shared system schema
        const navigatorRank: number = ((navActor.system as Record<string, unknown> | undefined)?.['navigatorRank'] as number | undefined) ?? 0;
        const perceptionTotal: number = perception.total;
        const willpowerTotal: number = willpower.total;
        const baseChar = perceptionTotal > willpowerTotal ? perception : willpower;
        const targetValue = baseChar.total + navigatorRank * 5;

        const roll = new Roll('1d100');
        await roll.evaluate();
        if (roll.total === undefined) return this.sendToChat();
        const rollTotal: number = roll.total;

        const success = rollTotal <= targetValue;
        const degrees = Math.floor(Math.abs(targetValue - rollTotal) / 10);

        const cardData = {
            item: this,
            itemTypeLabel: 'Navigator Power',
            roll: roll,
            targetValue: targetValue,
            success: success,
            degrees: degrees,
            actor: this.actor.name,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/navigator-power-chat.hbs', cardData);

        return ChatMessage.create({
            user: game.user.id,
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            rolls: [roll],
        });
    }

    /**
     * Roll a ship order
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns opaque ChatMessage / roll result
    async rollOrder(): Promise<unknown> {
        if (!this.actor) {
            return this.sendToChat();
        }

        // Orders typically use Command or relevant skill
        const orderActor = this.#wh40kActor();
        const command = (orderActor?.system as { skills?: Record<string, { current?: number }> } | undefined)?.skills?.['command'];
        const targetValue = command?.current ?? 50;

        const roll = new Roll('1d100');
        await roll.evaluate();
        if (roll.total === undefined) return this.sendToChat();
        const rollTotal: number = roll.total;

        const success = rollTotal <= targetValue;
        const degrees = Math.floor(Math.abs(targetValue - rollTotal) / 10);

        const cardData = {
            item: this,
            itemTypeLabel: 'Ship Order',
            roll: roll,
            targetValue: targetValue,
            success: success,
            degrees: degrees,
            actor: this.actor.name,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/order-roll-chat.hbs', cardData);

        return ChatMessage.create({
            user: game.user.id,
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            rolls: [roll],
        });
    }

    /**
     * Roll a ritual
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns opaque ChatMessage / roll result
    async rollRitual(): Promise<unknown> {
        if (!this.actor) {
            return this.sendToChat();
        }

        // Rituals typically use Willpower
        const ritualActor = this.#wh40kActor();
        const willpower = ritualActor?.characteristics['willpower'];
        const targetValue = willpower?.total ?? 30;

        const roll = new Roll('1d100');
        await roll.evaluate();
        if (roll.total === undefined) return this.sendToChat();
        const rollTotal: number = roll.total;

        const success = rollTotal <= targetValue;
        const degrees = Math.floor(Math.abs(targetValue - rollTotal) / 10);

        const cardData = {
            item: this,
            itemTypeLabel: 'Ritual',
            roll: roll,
            targetValue: targetValue,
            success: success,
            degrees: degrees,
            actor: this.actor.name,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ritual-roll-chat.hbs', cardData);

        return ChatMessage.create({
            user: game.user.id,
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            rolls: [roll],
        });
    }

    /**
     * Apply origin path modifiers to an actor
     * Automatically applies characteristic bonuses, skills, and talents from origin paths
     */
    async applyOriginToActor(actor: OriginActorLike): Promise<void> {
        if (!this.isOriginPath) {
            // eslint-disable-next-line no-restricted-syntax -- legacy notification string, pending langpack migration
            ui.notifications.warn('This item is not an origin path and cannot be auto-applied.');
            return;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: build-up of partial update bag passed to actor.update()
        const updates: Record<string, unknown> = {};
        // eslint-disable-next-line no-restricted-syntax -- boundary: items destined for createEmbeddedDocuments
        const itemsToAdd: Record<string, unknown>[] = [];
        // eslint-disable-next-line no-restricted-syntax -- boundary: origin-path modifiers are stored as an opaque bag in the shared item schema
        const modifiers = (this.system.modifiers ?? {}) as unknown as {
            characteristics?: Record<string, number>;
            wounds?: number;
            fate?: number;
            skills?: string[];
            talents?: string[];
            traits?: string[];
        };

        // Apply characteristic modifiers
        if (modifiers.characteristics !== undefined) {
            for (const [key, value] of Object.entries(modifiers.characteristics)) {
                if (value !== 0) {
                    const charEntry = actor.system.characteristics[key];
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics[key] may be undefined at runtime
                    if (charEntry === undefined) continue;
                    const currentBonus: number = charEntry.advance;
                    updates[`system.characteristics.${key}.advance`] = currentBonus + Number(value);
                }
            }
        }

        // Apply wounds modifier
        if (modifiers.wounds !== undefined && modifiers.wounds !== 0) {
            const currentWounds: number = actor.system.wounds.max;
            updates['system.wounds.max'] = currentWounds + modifiers.wounds;
        }

        // Apply fate modifier
        if (modifiers.fate !== undefined && modifiers.fate !== 0) {
            const currentFate: number = actor.system.fate?.total ?? 0;
            updates['system.fate.total'] = currentFate + modifiers.fate;
        }

        // Collect skills to add
        if (Array.isArray(modifiers.skills)) {
            for (const skillName of modifiers.skills) {
                const skillPack = game.packs.get('wh40k-rpg.dh2-core-stats-skills');
                if (skillPack) {
                    // eslint-disable-next-line no-await-in-loop -- sequential compendium access by design
                    const index = await skillPack.getIndex({ fields: ['name'] });
                    const skillEntry = index.find((s) => typeof s.name === 'string' && s.name.toLowerCase() === skillName.toLowerCase());
                    if (skillEntry) {
                        // eslint-disable-next-line no-await-in-loop -- sequential compendium access by design
                        const skill = await skillPack.getDocument(skillEntry._id);
                        if (skill) itemsToAdd.push(skill.toObject());
                    }
                }
            }
        }

        // Collect talents to add
        if (Array.isArray(modifiers.talents)) {
            for (const talentName of modifiers.talents) {
                const talentPack = game.packs.get('wh40k-rpg.dh2-core-stats-talents');
                if (talentPack) {
                    // eslint-disable-next-line no-await-in-loop -- sequential compendium access by design
                    const index = await talentPack.getIndex({ fields: ['name'] });
                    const talentEntry = index.find((t) => typeof t.name === 'string' && t.name.toLowerCase() === talentName.toLowerCase());
                    if (talentEntry) {
                        // eslint-disable-next-line no-await-in-loop -- sequential compendium access by design
                        const talent = await talentPack.getDocument(talentEntry._id);
                        if (talent) itemsToAdd.push(talent.toObject());
                    }
                }
            }
        }

        // Apply updates
        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
        }

        // Add items
        if (itemsToAdd.length > 0) {
            await actor.createEmbeddedDocuments('Item', itemsToAdd as never[]);
        }

        // Add the origin path itself
        await actor.createEmbeddedDocuments('Item', [this.toObject() as never]);

        ui.notifications.info(`Applied ${this.name} to ${actor.name}`);
    }

    /**
     * Get a preview of what this origin path will grant
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: preview structure is consumed by templates with no type contract
    getOriginPreview(): unknown {
        if (!this.isOriginPath) return null;

        // eslint-disable-next-line no-restricted-syntax -- boundary: origin-path modifiers are stored as an opaque bag in the shared item schema
        const modifiers = (this.system.modifiers ?? {}) as unknown as {
            characteristics?: Record<string, number>;
            wounds?: number;
            fate?: number;
            skills?: string[];
            talents?: string[];
            traits?: string[];
        };
        const preview = {
            characteristics: [] as Array<{ name: string; value: string | number }>,
            wounds: modifiers.wounds ?? 0,
            fate: modifiers.fate ?? 0,
            skills: modifiers.skills ?? [],
            talents: modifiers.talents ?? [],
            traits: modifiers.traits ?? [],
        };

        // Build characteristic preview
        if (modifiers.characteristics !== undefined) {
            for (const [key, value] of Object.entries(modifiers.characteristics)) {
                if (value !== 0) {
                    const charName = key.charAt(0).toUpperCase() + key.slice(1);
                    preview.characteristics.push({
                        name: charName,
                        value: value > 0 ? `+${value}` : value,
                    });
                }
            }
        }

        return preview;
    }
}
