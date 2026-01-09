import { prepareEnhancedSkillRoll } from '../applications/prompts/enhanced-skill-dialog.mjs';
import { SimpleSkillData } from '../rolls/action-data.mjs';
import { toCamelCase } from '../handlebars/handlebars-helpers.mjs';

export class RogueTraderBaseActor extends Actor {

    /* -------------------------------------------- */
    /*  Descendant Document Hooks                   */
    /* -------------------------------------------- */

    /**
     * Handle the creation of descendant documents (items).
     * Triggers recalculation of item-based data.
     * @override
     */
    _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
        super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
        if (collection === "items") {
            this._onItemsChanged();
        }
    }

    /**
     * Handle the update of descendant documents (items).
     * Triggers recalculation of item-based data.
     * @override
     */
    _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
        super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
        if (collection === "items") {
            this._onItemsChanged();
        }
    }

    /**
     * Handle the deletion of descendant documents (items).
     * Triggers recalculation of item-based data.
     * @override
     */
    _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
        super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
        if (collection === "items") {
            this._onItemsChanged();
        }
    }

    /**
     * Called when items are created, updated, or deleted.
     * Triggers recalculation of item-based data via prepareEmbeddedData.
     * @protected
     */
    _onItemsChanged() {
        // Re-run embedded data preparation if the DataModel supports it
        if (typeof this.system?.prepareEmbeddedData === 'function') {
            // Reset modifier tracking before recalculating
            if (typeof this.system._initializeModifierTracking === 'function') {
                this.system._initializeModifierTracking();
            }
            this.system.prepareEmbeddedData();
        }
    }

    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);
        let initData = {
            'token.bar1': { 'attribute': 'wounds' },
            'token.bar2': { 'attribute': 'fate' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'token.name': data.name,
        };
        if (data.type === 'vehicle') {
            initData['token.bar1'] = { 'attribute': 'integrity' };
            initData['token.bar2'] = undefined;
        }
        if (data.type === 'acolyte' || data.type === 'character') {
            initData['token.vision'] = true;
            initData['token.actorLink'] = true;
        }
        this.updateSource(initData);
    }

    get characteristics() {
        return this.system.characteristics;
    }

    get initiative() {
        return this.system.initiative;
    }

    get wounds() {
        return this.system.wounds;
    }

    get size() {
        return Number.parseInt(this.system.size);
    }

    get movement() {
        return this.system.movement;
    }

    prepareData() {
        super.prepareData();

        // Skip legacy calculations if a DataModel is handling data preparation
        // DataModels have their own prepareDerivedData that already ran
        const hasDataModel = typeof this.system?.prepareDerivedData === 'function';
        if (!hasDataModel) {
            this._computeCharacteristics();
            this._computeMovement();
        }
    }

    async rollCharacteristic(characteristicName, override) {
        const characteristic = this.characteristics[characteristicName];

        const simpleSkillData = new SimpleSkillData();
        const rollData = simpleSkillData.rollData;
        rollData.actor = this;
        rollData.nameOverride = characteristic.label;
        rollData.type = override ? override : 'Characteristic';
        rollData.baseTarget = characteristic.total;
        rollData.modifiers.modifier = 0;
        await prepareEnhancedSkillRoll(simpleSkillData);
    }

    getCharacteristicFuzzy(char) {
        // This tries to account for case sensitivity and abbreviations
        for (const [name, characteristic] of Object.entries(this.characteristics)) {
            if (char.toUpperCase() === name.toUpperCase() || char.toLocaleString() === characteristic.short.toUpperCase()) {
                return characteristic;
            }
        }
    }

    /**
     * Compute characteristic totals and bonuses.
     * Used for actor types that don't have a DataModel (NPC, Vehicle, Starship).
     * @protected
     */
    _computeCharacteristics() {
        if (!this.characteristics) return;

        for (const [name, characteristic] of Object.entries(this.characteristics)) {
            const base = Number(characteristic.base ?? characteristic.starting ?? 0);
            const advance = Number(characteristic.advance ?? characteristic.advances ?? 0);
            const modifier = Number(characteristic.modifier ?? 0);
            const unnatural = Number(characteristic.unnatural ?? 0);

            characteristic.total = base + advance * 5 + modifier;

            // Calculate bonus: base modifier is tens digit
            const baseModifier = Math.floor(characteristic.total / 10);
            // Unnatural multiplies the modifier (0 = no effect, 2+ = multiplier)
            characteristic.bonus = unnatural >= 2 ? baseModifier * unnatural : baseModifier;
        }

        if (this.initiative?.characteristic && this.characteristics[this.initiative.characteristic]) {
            this.initiative.bonus = this.characteristics[this.initiative.characteristic].bonus;
        }
    }

    _computeMovement() {
        let agility = this.characteristics?.agility;
        // Skip movement calculation if agility is not available (e.g., for starships)
        if (!agility) return;
        let size = this.size;
        this.system.movement = {
            half: agility.bonus + size - 4,
            full: (agility.bonus + size - 4) * 2,
            charge: (agility.bonus + size - 4) * 3,
            run: (agility.bonus + size - 4) * 6,
        };
    }

    _findCharacteristic(short) {
        for (let characteristic of Object.values(this.characteristics)) {
            if (characteristic.short === short) {
                return characteristic;
            }
        }
        return { total: 0 };
    }

    async addSpecialitySkill(skill, speciality) {
        const parent = this.system.skills[skill];
        const specialityKey = toCamelCase(speciality);
        if(!parent) {
            ui.notifications.warn(`Skill not specified -- unexpected error.`);
            return;
        }

        const entries = Array.isArray(parent.entries) ? [...parent.entries] : [];

        if(entries.some((entry) => entry.name?.toLowerCase() === speciality.toLowerCase() || entry.slug === specialityKey)) {
            ui.notifications.warn(`Speciality already exists. Unable to create.`);
            return;
        }

        entries.push({
            name: speciality,
            slug: specialityKey,
            basic: true,
            trained: false,
            plus10: false,
            plus20: false,
            bonus: 0,
            notes: '',
            cost: 0
        });

        await this.update({
            [`system.skills.${skill}.entries`]: entries
        });
    }

}
