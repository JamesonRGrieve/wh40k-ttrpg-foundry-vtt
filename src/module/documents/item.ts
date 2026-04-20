import { capitalize } from '../handlebars/handlebars-helpers.ts';
import { applyRollModeWhispers } from '../rolls/roll-helpers.ts';
import { WH40KItemContainer } from './item-container.ts';

export class WH40KItem extends WH40KItemContainer {
    static #pruneUndefined(value: any): any {
        if (Array.isArray(value)) {
            return value.map((entry) => this.#pruneUndefined(entry));
        }

        if (value && typeof value === 'object' && !(value instanceof Set) && !(value instanceof Map)) {
            for (const key of Object.keys(value)) {
                const entry = value[key];
                if (entry === undefined) {
                    delete value[key];
                    continue;
                }

                value[key] = this.#pruneUndefined(entry);
            }
        }

        return value;
    }

    /**
     * Override to clean/validate img field before validation runs.
     * Foundry V13 has strict img validation - ensure valid file extension.
     * @param {object} data - The candidate data object to clean
     * @param {object} options - Additional options
     * @returns {object} The cleaned data
     * @override
     */
    static cleanData(source: Record<string, unknown> = {}, options: Record<string, unknown> = {}, _state: any = {}) {
        // Remove explicit undefined values before schema validation runs.
        // Foundry treats `undefined` differently from an omitted field during updates.
        this.#pruneUndefined(source);

        // CRITICAL: Clean img field if present - V13 validation is very strict
        if ('img' in source) {
            const imgValue = source.img;

            // Handle empty, null, undefined, or non-string img values
            if (!imgValue || imgValue === '' || typeof imgValue !== 'string' || imgValue.trim() === '') {
                // Set to type-specific default
                source.img = this._getDefaultIcon(source.type || 'unknown');
                console.warn(`WH40K | cleanData: Invalid img value "${imgValue}" for type "${source.type}", using default: ${source.img}`);
            } else {
                // Check if has valid extension
                const validExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.webm'];
                const imgStr = imgValue.toLowerCase().trim();

                // Also check for obviously invalid paths
                if (imgStr === 'null' || imgStr === 'undefined' || imgStr.length < 5) {
                    source.img = this._getDefaultIcon(source.type || 'unknown');
                    console.warn(`WH40K | cleanData: Invalid img path "${imgValue}" for type "${source.type}", using default: ${source.img}`);
                } else {
                    const hasValidExtension = validExtensions.some((ext) => imgStr.endsWith(ext));

                    if (!hasValidExtension) {
                        // Invalid extension - use type-specific default
                        source.img = this._getDefaultIcon(source.type || 'unknown');
                        console.warn(`WH40K | cleanData: No valid extension in "${imgValue}" for type "${source.type}", using default: ${source.img}`);
                    }
                }
            }
        }
        // Note: If img is not in source, that's fine - it just won't be updated
        // No need to add a default since the existing document img will remain

        return super.cleanData(source, options, _state);
    }

    /**
     * Get default icon path for an item type.
     * Uses Foundry's built-in default icons which are guaranteed to exist.
     * @param {string} type - The item type
     * @returns {string} Path to default icon
     * @private
     */
    static _getDefaultIcon(type) {
        // Use Foundry's built-in default icons that definitely exist
        const defaultIcons = {
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
            combatAction: 'icons/svg/combat.svg',
            originPath: 'icons/svg/direction.svg',
            order: 'icons/svg/pawprint.svg',
            ritual: 'icons/svg/book.svg',
        };

        // Return type-specific icon or generic mystery-man fallback
        return (defaultIcons as any)[type] || 'icons/svg/mystery-man.svg';
    }

    /** Helper to get the item type as a plain string for comparison. */
    get _type(): string {
        return this.type as string;
    }

    get totalWeight(): boolean {
        let weight = this.system.weight || 0;
        if (this.items && this.items.size > 0) {
            this.items.forEach((item: WH40KItem) => (weight += item.totalWeight));
        }
        return weight;
    }

    get equipped(): boolean {
        return !!this.system.equipped;
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
        return this._type === 'originPath' || (this._type === 'trait' && (this.flags as any)?.rt?.kind === 'origin');
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
        return this._type === 'trait' && (this.flags as any)?.rt?.kind === 'condition';
    }

    get originPathStep(): boolean {
        return (this.flags as any)?.rt?.step || this.system?.step || '';
    }

    get isWeapon(): boolean {
        return this._type === 'weapon';
    }

    get isRanged(): boolean {
        return this._type === 'weapon' && this.system.class.toLowerCase() !== 'melee';
    }

    get isThrown(): boolean {
        return this._type === 'weapon' && this.system.class.toLowerCase() === 'thrown';
    }

    get usesAmmo(): boolean {
        return this.isRanged && this.system.reload && this.system.reload !== 'N/A';
    }

    get isMelee(): boolean {
        return this._type === 'weapon' && this.system.class.toLowerCase() === 'melee';
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
        return this.system.backpack?.inBackpack || false;
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

    _onCreate(data, options, user): any {
        game.wh40k.log('Determining nested items for', this);
        void this._determineNestedItems();
        return super._onCreate(data, options, user);
    }

    prepareData(): void {
        super.prepareData();
        game.wh40k.log('Item prepare data', this);

        void this.convertNestedToItems();

        if (this.isPsychicPower) {
            if (!this.system.damage || this.system.damage === '') {
                this.system.damage = 0;
            }
            if (!this.system.penetration || this.system.penetration === '') {
                this.system.penetration = 0;
            }
        }

        // Fix Broken Selects
        if (!this.system.craftsmanship || this.system.craftsmanship === '') {
            this.system.craftsmanship = 'Common';
        }
        if (!this.system.availability || this.system.availability === '') {
            this.system.availability = 'Common';
        }
    }

    /**
     * This unlocks and loads nested items dynamically from the adjacent compendium.
     * I tried to find another way to do this but couldn't find anything online - I made my own hack.
     */
    async _determineNestedItems(): Promise<unknown> {
        // Already has items just skip
        if ((this.items && this.items.size > 0) || this.hasNested()) return;

        // Check for specials
        if (this.system.special) {
            game.wh40k.log(`Performing first time nested item configuration for item: ${this.name as string} with specials: `, this.system.special);
            if (this.isWeapon) await this._updateSpecialsFromPack('wh40k-rpg.weapons', this.system.special);
            if (this.isAmmunition) await this._updateSpecialsFromPack('wh40k-rpg.ammo', this.system.special);
            game.wh40k.log(`Special migrated for item: ${this.name as string}`, this.system.special);
            this.system.special = undefined;

            await this.convertNestedToItems();
        }
    }

    async _updateSpecialsFromPack(pack, data): Promise<unknown> {
        const compendium = game.packs.find((p) => p.collection === pack);
        if (!compendium) return;
        await compendium.configure({ locked: false });
        const attackSpecials = await this._getAttackSpecials(data);
        if (attackSpecials.length > 0) {
            await this.createNestedDocuments(attackSpecials);
        }
        await compendium.configure({ locked: true });
    }

    async _getAttackSpecials(specialData): Promise<unknown> {
        const attackSpecialPack = game.packs.find((p) => p.collection === 'wh40k-rpg.attack-specials');
        if (!attackSpecialPack) return [];
        const index = await attackSpecialPack.getIndex({ fields: ['name', 'img', 'type', 'system'] });
        const specials = [];
        for (const special of Object.keys(specialData)) {
            const specialName = capitalize(special);
            const attackSpecial: unknown = index.find((n) => n.name === specialName);
            if (attackSpecial) {
                if (attackSpecial.system.hasLevel) {
                    attackSpecial.system.level = specialData[special];
                } else {
                    attackSpecial.system.enabled = specialData[special];
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
    get itemTypeLabel() {
        const typeLabels = {
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
        return (typeLabels as any)[this.type] || this.type;
    }

    /**
     * Check if this item has actions available
     * @returns {boolean}
     */
    get hasActions(): boolean {
        return this.isWeapon || this.isPsychicPower || this.isNavigatorPower || (this.isTalent && this.system?.isRollable);
    }

    /**
     * Check if this item can be rolled
     * @returns {boolean}
     */
    get isRollable(): any {
        return (this.isTalent && this.system?.isRollable) || (this.isSkill && this.system?.rollConfig);
    }

    /**
     * Send this item's details to chat as a card
     * @param {Object} options - Options for the chat card
     */
    async sendToChat(options = {}): Promise<void> {
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

        const chatData: unknown = {
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

        chatData.rollMode = game.settings.get('core', 'rollMode');
        applyRollModeWhispers(chatData);

        return ChatMessage.create(chatData);
    }

    /**
     * Perform the default action for this item
     */
    async performAction(): Promise<unknown> {
        if (this.isWeapon) {
            // Weapon attack - handled by the actor sheet
            return (this.actor as any)?.rollWeaponAction?.(this) || this.sendToChat();
        } else if (this.isPsychicPower) {
            // Psychic power - handled by the actor sheet
            return (this.actor as any)?.rollPsychicPower?.(this) || this.sendToChat();
        } else if (this.isNavigatorPower) {
            // Navigator power - roll navigator power
            return this.rollNavigatorPower();
        } else if (this.isTalent && this.system?.isRollable) {
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
    async rollTalent(): Promise<unknown> {
        if (!this.actor) {
            return this.sendToChat();
        }

        const rollConfig = this.system?.rollConfig;
        if (!rollConfig?.characteristic) {
            return this.sendToChat();
        }

        // Get the characteristic value
        const charKey = rollConfig.characteristic.toLowerCase();
        const characteristic = (this.actor as any).characteristics?.[charKey];
        if (!characteristic) {
            return this.sendToChat();
        }

        const targetValue = characteristic.total + (rollConfig.modifier || 0);

        // Create the roll
        const roll = new Roll('1d100');
        await roll.evaluate();

        const success = roll.total <= targetValue;
        const degrees = Math.floor(Math.abs(targetValue - roll.total) / 10);

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
            rollDescription: rollConfig.description || '',
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
    async rollNavigatorPower(): Promise<unknown> {
        if (!this.actor) {
            return this.sendToChat();
        }

        // Navigator powers typically use Perception or Willpower
        const perception = (this.actor as any).characteristics?.perception;
        const willpower = (this.actor as any).characteristics?.willpower;

        // Use the higher of the two as base, modified by Navigator Rank
        const navigatorRank = (this.actor as any).system?.navigatorRank || 0;
        const baseChar = perception?.total > willpower?.total ? perception : willpower;
        const targetValue = (baseChar?.total || 30) + navigatorRank * 5;

        const roll = new Roll('1d100');
        await roll.evaluate();

        const success = roll.total <= targetValue;
        const degrees = Math.floor(Math.abs(targetValue - roll.total) / 10);

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
    async rollOrder(): Promise<unknown> {
        if (!this.actor) {
            return this.sendToChat();
        }

        // Orders typically use Command or relevant skill
        const command = (this.actor as any).skills?.command;
        const targetValue = command?.current || 50;

        const roll = new Roll('1d100');
        await roll.evaluate();

        const success = roll.total <= targetValue;
        const degrees = Math.floor(Math.abs(targetValue - roll.total) / 10);

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
    async rollRitual(): Promise<unknown> {
        if (!this.actor) {
            return this.sendToChat();
        }

        // Rituals typically use Willpower
        const willpower = (this.actor as any).characteristics?.willpower;
        const targetValue = willpower?.total || 30;

        const roll = new Roll('1d100');
        await roll.evaluate();

        const success = roll.total <= targetValue;
        const degrees = Math.floor(Math.abs(targetValue - roll.total) / 10);

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
    async applyOriginToActor(actor): Promise<void> {
        if (!this.isOriginPath) {
            ui.notifications.warn('This item is not an origin path and cannot be auto-applied.');
            return;
        }

        const updates: unknown = {};
        const itemsToAdd = [];
        const modifiers = this.system.modifiers || {};

        // Apply characteristic modifiers
        if (modifiers.characteristics) {
            const characteristics: unknown = {};
            for (const [key, value] of Object.entries(modifiers.characteristics)) {
                if (value !== 0) {
                    const currentBonus = actor.system.characteristics?.[key]?.advance || 0;
                    characteristics[`system.characteristics.${key}.advance`] = currentBonus + Number(value);
                }
            }
            Object.assign(updates, characteristics);
        }

        // Apply wounds modifier
        if (modifiers.wounds && modifiers.wounds !== 0) {
            const currentWounds = actor.system.wounds?.max || 0;
            updates['system.wounds.max'] = currentWounds + modifiers.wounds;
        }

        // Apply fate modifier
        if (modifiers.fate && modifiers.fate !== 0) {
            const currentFate = actor.system.fate?.total || 0;
            updates['system.fate.total'] = currentFate + modifiers.fate;
        }

        // Collect skills to add
        if (modifiers.skills && Array.isArray(modifiers.skills)) {
            for (const skillName of modifiers.skills) {
                const skillPack = game.packs.get('wh40k-rpg.dh2-core-stats-skills');
                if (skillPack) {
                    const index = await skillPack.getIndex({ fields: ['name'] });
                    const skillEntry = index.find((s: any) => s.name.toLowerCase() === skillName.toLowerCase());
                    if (skillEntry) {
                        const skill = await skillPack.getDocument(skillEntry._id);
                        if (skill) itemsToAdd.push(skill.toObject());
                    }
                }
            }
        }

        // Collect talents to add
        if (modifiers.talents && Array.isArray(modifiers.talents)) {
            for (const talentName of modifiers.talents) {
                const talentPack = game.packs.get('wh40k-rpg.dh2-core-stats-talents');
                if (talentPack) {
                    const index = await talentPack.getIndex({ fields: ['name'] });
                    const talentEntry = index.find((t: any) => t.name.toLowerCase() === (talentName as string).toLowerCase());
                    if (talentEntry) {
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
            await actor.createEmbeddedDocuments('Item', itemsToAdd);
        }

        // Add the origin path itself
        await actor.createEmbeddedDocuments('Item', [this.toObject()]);

        ui.notifications.info(`Applied ${this.name as string} to ${actor.name}`);
    }

    /**
     * Get a preview of what this origin path will grant
     */
    getOriginPreview(): any {
        if (!this.isOriginPath) return null;

        const modifiers = this.system.modifiers || {};
        const preview = {
            characteristics: [],
            wounds: modifiers.wounds || 0,
            fate: modifiers.fate || 0,
            skills: modifiers.skills || [],
            talents: modifiers.talents || [],
            traits: modifiers.traits || [],
        };

        // Build characteristic preview
        if (modifiers.characteristics) {
            for (const [key, value] of Object.entries(modifiers.characteristics)) {
                if (value !== 0) {
                    const charName = key.charAt(0).toUpperCase() + key.slice(1);
                    preview.characteristics.push({
                        name: charName,
                        value: (value as number) > 0 ? `+${value as number}` : value,
                    });
                }
            }
        }

        return preview;
    }
}
