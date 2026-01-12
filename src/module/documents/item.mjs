import { RogueTraderItemContainer } from './item-container.mjs';
import { capitalize } from '../handlebars/handlebars-helpers.mjs';

export class RogueTraderItem extends RogueTraderItemContainer {
    
    /**
     * Override to clean/validate img field before validation runs.
     * Foundry V13 has strict img validation - ensure valid file extension.
     * @param {object} data - The candidate data object to clean
     * @param {object} options - Additional options
     * @returns {object} The cleaned data
     * @override
     */
    static cleanData(source = {}, options = {}) {
        // CRITICAL: Clean img field if present - V13 validation is very strict
        if ('img' in source) {
            const imgValue = source.img;
            
            // Handle empty, null, undefined, or non-string img values
            if (!imgValue || imgValue === '' || typeof imgValue !== 'string' || imgValue.trim() === '') {
                // Set to type-specific default
                source.img = this._getDefaultIcon(source.type || 'unknown');
                console.warn(`RogueTrader | cleanData: Invalid img value "${imgValue}" for type "${source.type}", using default: ${source.img}`);
            } else {
                // Check if has valid extension
                const validExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.webm'];
                const imgStr = imgValue.toLowerCase().trim();
                
                // Also check for obviously invalid paths
                if (imgStr === 'null' || imgStr === 'undefined' || imgStr.length < 5) {
                    source.img = this._getDefaultIcon(source.type || 'unknown');
                    console.warn(`RogueTrader | cleanData: Invalid img path "${imgValue}" for type "${source.type}", using default: ${source.img}`);
                } else {
                    const hasValidExtension = validExtensions.some(ext => imgStr.endsWith(ext));
                    
                    if (!hasValidExtension) {
                        // Invalid extension - use type-specific default
                        source.img = this._getDefaultIcon(source.type || 'unknown');
                        console.warn(`RogueTrader | cleanData: No valid extension in "${imgValue}" for type "${source.type}", using default: ${source.img}`);
                    }
                }
            }
        } else {
            // img field not present at all - add it
            source.img = this._getDefaultIcon(source.type || 'unknown');
            console.warn(`RogueTrader | cleanData: Missing img field for type "${source.type}", using default: ${source.img}`);
        }
        
        return super.cleanData(source, options);
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
            ritual: 'icons/svg/book.svg'
        };
        
        // Return type-specific icon or generic mystery-man fallback
        return defaultIcons[type] || 'icons/svg/mystery-man.svg';
    }
    
    get totalWeight() {
        let weight = this.system.weight || 0;
        if (this.items && this.items.size > 0) {
            this.items.forEach((item) => (weight += item.totalWeight));
        }
        return weight;
    }

    get equipped() {
        return !!this.system.equipped;
    }

    get isMentalDisorder() {
        return this.type === 'mentalDisorder';
    }

    get isMalignancy() {
        return this.type === 'malignancy';
    }

    get isMutation() {
        return this.type === 'mutation';
    }

    get isTalent() {
        return this.type === 'talent';
    }

    get isTrait() {
        return this.type === 'trait';
    }

    get isAptitude() {
        return this.type === 'aptitude';
    }

    get isSpecialAbility() {
        return this.type === 'specialAbility';
    }

    get isPsychicPower() {
        return this.type === 'psychicPower';
    }

    get isNavigatorPower() {
        return this.type === 'navigatorPower';
    }

    get isPsychicBarrage() {
        return this.type === 'psychicPower' && this.system.attackType === 'Psychic Barrage';
    }

    get isPsychicStorm() {
        return this.type === 'psychicPower' && this.system.attackType === 'Psychic Storm';
    }

    get isCriticalInjury() {
        return this.type === 'criticalInjury';
    }

    get isOriginPath() {
        return this.type === 'originPath' || (this.type === 'trait' && this.flags?.rt?.kind === 'origin');
    }

    get isSkill() {
        return this.type === 'skill';
    }

    get isOrder() {
        return this.type === 'order';
    }

    get isRitual() {
        return this.type === 'ritual';
    }

    get isShipComponent() {
        return this.type === 'shipComponent';
    }

    get isShipRole() {
        return this.type === 'shipRole';
    }

    get isShipUpgrade() {
        return this.type === 'shipUpgrade';
    }

    get isShipWeapon() {
        return this.type === 'shipWeapon';
    }

    get isVehicleTrait() {
        return this.type === 'vehicleTrait';
    }

    get isVehicleUpgrade() {
        return this.type === 'vehicleUpgrade';
    }

    get isWeaponQuality() {
        return this.type === 'weaponQuality';
    }

    get isCondition() {
        return this.type === 'trait' && this.flags?.rt?.kind === 'condition';
    }

    get originPathStep() {
        return this.flags?.rt?.step || this.system?.step || '';
    }

    get isWeapon() {
        return this.type === 'weapon';
    }

    get isRanged() {
        return this.type === 'weapon' && this.system.class.toLowerCase() !== 'melee';
    }

    get isThrown() {
        return this.type === 'weapon' && this.system.class.toLowerCase() === 'thrown';
    }

    get usesAmmo() {
        return this.isRanged && this.system.reload && this.system.reload !== 'N/A';
    }

    get isMelee() {
        return this.type === 'weapon' && this.system.class.toLowerCase() === 'melee';
    }

    get isArmour() {
        return this.type === 'armour';
    }

    get isArmourModification() {
        return this.type === 'armourModification';
    }

    get isGear() {
        return this.type === 'gear' || this.isConsumable || this.isDrug || this.isAmmunition || this.isTool;
    }

    get isDrug() {
        return this.type === 'drug';
    }

    get isConsumable() {
        return this.type === 'consumable';
    }

    get isTool() {
        return this.type === 'tool';
    }

    get isCybernetic() {
        return this.type === 'cybernetic';
    }

    get isWeaponModification() {
        return this.type === 'weaponModification';
    }

    get isAmmunition() {
        return this.type === 'ammunition';
    }

    get isForceField() {
        return this.type === 'forceField';
    }

    get isAttackSpecial() {
        return this.type === 'attackSpecial';
    }

    get isStorageLocation() {
        return this.type === 'storageLocation';
    }

    get isBackpack() {
        return this.type === 'backpack';
    }

    get isInBackpack() {
        return this.system.backpack?.inBackpack || false;
    }

    get isJournalEntry() {
        return this.type === 'journalEntry';
    }

    get isEnemy() {
        return this.type === 'enemy';
    }

    get isPeer() {
        return this.type === 'peer';
    }

    _onCreate(data, options, user) {
        game.rt.log('Determining nested items for', this);
        this._determineNestedItems();
        return super._onCreate(data, options, user);
    }

    async prepareData() {
        super.prepareData();
        game.rt.log('Item prepare data', this);

        this.convertNestedToItems();

        if (this.isPsychicPower) {
            if(!this.system.damage || this.system.damage === '') {
                this.system.damage = 0;
            }
            if(!this.system.penetration || this.system.penetration === '') {
                this.system.penetration = 0;
            }
        }

        // Fix Broken Selects
        if(!this.system.craftsmanship || this.system.craftsmanship === '') {
            this.system.craftsmanship = 'Common';
        }
        if(!this.system.availability || this.system.availability === '') {
            this.system.availability = 'Common';
        }
    }

    /**
     * This unlocks and loads nested items dynamically from the adjacent compendium.
     * I tried to find another way to do this but couldn't find anything online - I made my own hack.
     */
    async _determineNestedItems() {
        // Already has items just skip
        if ((this.items && this.items.size > 0) || this.hasNested()) return;

        // Check for specials
        if (this.system.special) {
            game.rt.log('Performing first time nested item configuration for item: ' + this.name + ' with specials: ', this.system.special);
            if (this.isWeapon) await this._updateSpecialsFromPack('rogue-trader.weapons', this.system.special);
            if (this.isAmmunition) await this._updateSpecialsFromPack('rogue-trader.ammo', this.system.special);
            game.rt.log('Special migrated for item: ' + this.name, this.system.special);
            this.system.special = undefined;

            await this.convertNestedToItems();
        }
    }

    async _updateSpecialsFromPack(pack, data) {
        const compendium = game.packs.find((p) => p.collection === pack);
        if (!compendium) return;
        await compendium.configure({ locked: false });
        const attackSpecials = await this._getAttackSpecials(data);
        if (attackSpecials.length > 0) {
            await this.createNestedDocuments(attackSpecials);
        }
        await compendium.configure({ locked: true });
    }

    async _getAttackSpecials(specialData) {
        const attackSpecialPack = game.packs.find((p) => p.collection === 'rogue-trader.attack-specials');
        if (!attackSpecialPack) return;
        const index = await attackSpecialPack.getIndex({ fields: ['name', 'img', 'type', 'system'] });
        const specials = [];
        for (const special of Object.keys(specialData)) {
            const specialName = capitalize(special);
            const attackSpecial = index.find((n) => n.name === specialName);
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
            forceField: 'Force Field'
        };
        return typeLabels[this.type] || this.type;
    }

    /**
     * Check if this item has actions available
     * @returns {boolean}
     */
    get hasActions() {
        return this.isWeapon || this.isPsychicPower || this.isNavigatorPower || 
               (this.isTalent && this.system?.isRollable);
    }

    /**
     * Check if this item can be rolled
     * @returns {boolean}
     */
    get isRollable() {
        return (this.isTalent && this.system?.isRollable) || 
               (this.isSkill && this.system?.rollConfig);
    }

    /**
     * Send this item's details to chat as a card
     * @param {Object} options - Options for the chat card
     */
    async sendToChat(options = {}) {
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
            ...options
        };

        // Use type-specific templates
        let template = 'systems/rogue-trader/templates/chat/item-card-chat.hbs';
        if (this.isWeapon) {
            template = 'systems/rogue-trader/templates/chat/weapon-card-chat.hbs';
        } else if (this.type === 'armour') {
            template = 'systems/rogue-trader/templates/chat/armour-card-chat.hbs';
        }

        const html = await renderTemplate(template, cardData);
        
        const chatData = {
            user: game.user.id,
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            // Set flags for ChatMessageRT enrichment
            flags: {
                "rogue-trader": {
                    itemCard: true,
                    item: {
                        uuid: this.uuid,
                        id: this.id,
                        name: this.name,
                        type: this.type
                    },
                    actor: this.actor ? {
                        uuid: this.actor.uuid,
                        id: this.actor.id,
                        name: this.actor.name
                    } : null
                }
            }
        };

        const rollMode = game.settings.get('core', 'rollMode');
        if (['gmroll', 'blindroll'].includes(rollMode)) {
            chatData.whisper = ChatMessage.getWhisperRecipients('GM');
        } else if (rollMode === 'selfroll') {
            chatData.whisper = [game.user];
        }

        return ChatMessage.create(chatData);
    }

    /**
     * Perform the default action for this item
     */
    async performAction() {
        if (this.isWeapon) {
            // Weapon attack - handled by the actor sheet
            return this.actor?.rollWeaponAction?.(this) || this.sendToChat();
        } else if (this.isPsychicPower) {
            // Psychic power - handled by the actor sheet  
            return this.actor?.rollPsychicPower?.(this) || this.sendToChat();
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
    async rollTalent() {
        if (!this.actor) {
            return this.sendToChat();
        }

        const rollConfig = this.system?.rollConfig;
        if (!rollConfig?.characteristic) {
            return this.sendToChat();
        }

        // Get the characteristic value
        const charKey = rollConfig.characteristic.toLowerCase();
        const characteristic = this.actor.characteristics?.[charKey];
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
            rollDescription: rollConfig.description || ''
        };

        const html = await renderTemplate('systems/rogue-trader/templates/chat/talent-roll-chat.hbs', cardData);
        
        return ChatMessage.create({
            user: game.user.id,
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            rolls: [roll]
        });
    }

    /**
     * Roll a navigator power
     */
    async rollNavigatorPower() {
        if (!this.actor) {
            return this.sendToChat();
        }

        // Navigator powers typically use Perception or Willpower
        const perception = this.actor.characteristics?.perception;
        const willpower = this.actor.characteristics?.willpower;
        
        // Use the higher of the two as base, modified by Navigator Rank
        const navigatorRank = this.actor.system?.navigatorRank || 0;
        const baseChar = perception?.total > willpower?.total ? perception : willpower;
        const targetValue = (baseChar?.total || 30) + (navigatorRank * 5);

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
            actor: this.actor.name
        };

        const html = await renderTemplate('systems/rogue-trader/templates/chat/navigator-power-chat.hbs', cardData);
        
        return ChatMessage.create({
            user: game.user.id,
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            rolls: [roll]
        });
    }

    /**
     * Roll a ship order
     */
    async rollOrder() {
        if (!this.actor) {
            return this.sendToChat();
        }

        // Orders typically use Command or relevant skill
        const command = this.actor.skills?.command;
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
            actor: this.actor.name
        };

        const html = await renderTemplate('systems/rogue-trader/templates/chat/order-roll-chat.hbs', cardData);
        
        return ChatMessage.create({
            user: game.user.id,
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            rolls: [roll]
        });
    }

    /**
     * Roll a ritual
     */
    async rollRitual() {
        if (!this.actor) {
            return this.sendToChat();
        }

        // Rituals typically use Willpower
        const willpower = this.actor.characteristics?.willpower;
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
            actor: this.actor.name
        };

        const html = await renderTemplate('systems/rogue-trader/templates/chat/ritual-roll-chat.hbs', cardData);
        
        return ChatMessage.create({
            user: game.user.id,
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            rolls: [roll]
        });
    }

    /**
     * Apply origin path modifiers to an actor
     * Automatically applies characteristic bonuses, skills, and talents from origin paths
     */
    async applyOriginToActor(actor) {
        if (!this.isOriginPath) {
            foundry.applications.api.Toast.warning('This item is not an origin path and cannot be auto-applied.', {
                duration: 3000
            });
            return;
        }

        const updates = {};
        const itemsToAdd = [];
        const modifiers = this.system.modifiers || {};

        // Apply characteristic modifiers
        if (modifiers.characteristics) {
            const characteristics = {};
            for (const [key, value] of Object.entries(modifiers.characteristics)) {
                if (value !== 0) {
                    const currentBonus = actor.system.characteristics?.[key]?.advance || 0;
                    characteristics[`system.characteristics.${key}.advance`] = currentBonus + value;
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
                const skillPack = game.packs.get('rogue-trader.rt-items-skills');
                if (skillPack) {
                    const index = await skillPack.getIndex({ fields: ['name'] });
                    const skillEntry = index.find(s => s.name.toLowerCase() === skillName.toLowerCase());
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
                const talentPack = game.packs.get('rogue-trader.rt-items-talents');
                if (talentPack) {
                    const index = await talentPack.getIndex({ fields: ['name'] });
                    const talentEntry = index.find(t => t.name.toLowerCase() === talentName.toLowerCase());
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

        foundry.applications.api.Toast.info(`Applied ${this.name} to ${actor.name}`, {
            duration: 3000
        });
    }

    /**
     * Get a preview of what this origin path will grant
     */
    getOriginPreview() {
        if (!this.isOriginPath) return null;

        const modifiers = this.system.modifiers || {};
        const preview = {
            characteristics: [],
            wounds: modifiers.wounds || 0,
            fate: modifiers.fate || 0,
            skills: modifiers.skills || [],
            talents: modifiers.talents || [],
            traits: modifiers.traits || []
        };

        // Build characteristic preview
        if (modifiers.characteristics) {
            for (const [key, value] of Object.entries(modifiers.characteristics)) {
                if (value !== 0) {
                    const charName = key.charAt(0).toUpperCase() + key.slice(1);
                    preview.characteristics.push({
                        name: charName,
                        value: value > 0 ? `+${value}` : value
                    });
                }
            }
        }

        return preview;
    }
}
