import { RogueTraderItemContainer } from './item-container.mjs';
import { capitalize } from '../handlebars/handlebars-helpers.mjs';

export class RogueTraderItem extends RogueTraderItemContainer {
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
            isNavigatorPower: this.isNavigatorPower,
            isShipComponent: this.isShipComponent,
            isPsychicPower: this.isPsychicPower,
            isTalent: this.isTalent,
            hasActions: this.hasActions,
            isRollable: this.isRollable,
            actor: this.actor?.name || '',
            ...options
        };

        const html = await renderTemplate('systems/rogue-trader/templates/chat/item-card-chat.hbs', cardData);
        
        const chatData = {
            user: game.user.id,
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            type: CONST.CHAT_MESSAGE_STYLES.OTHER,
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
            return this.actor?.rollWeaponAction(this);
        } else if (this.isPsychicPower) {
            // Psychic power - handled by the actor sheet  
            return this.actor?.rollPsychicPower(this);
        } else if (this.isNavigatorPower) {
            // Navigator power - send to chat
            return this.sendToChat();
        } else {
            // Default - send to chat
            return this.sendToChat();
        }
    }
}
