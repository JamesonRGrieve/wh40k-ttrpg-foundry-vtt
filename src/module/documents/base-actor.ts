import { prepareUnifiedRoll } from '../applications/prompts/unified-roll-dialog.ts';
import { toCamelCase } from '../handlebars/handlebars-helpers.ts';
import type { WH40KItem } from './item.ts';
import { SimpleSkillData } from '../rolls/action-data.ts';
import { processTalentGrants, handleTalentRemoval } from '../utils/talent-grants.ts';

// WH40KCharacteristic, WH40KModifierEntry, WH40KStatBreakdown are declared
// globally in types/global.d.ts — do not redeclare here.

export class WH40KBaseActor extends Actor {
    declare system: import('../data/abstract/actor-data-model.ts').default;
    /* -------------------------------------------- */
    /*  Descendant Document Hooks                   */
    /* -------------------------------------------- */

    /**
     * Handle the creation of descendant documents (items).
     * Triggers recalculation of item-based data.
     * Also processes talent grants for newly added talents.
     * @override
     */
    _onCreateDescendantDocuments(
        parent: Record<string, unknown>,
        collection: string,
        documents: unknown[],
        data: unknown[],
        options: Record<string, unknown>,
        userId: string,
    ): void {
        (super._onCreateDescendantDocuments as any)(parent, collection, documents, data, options, userId);
        if (collection === 'items') {
            this._onItemsChanged();

            // Process talent grants for newly added talents
            // Only process if this is the user who created the items
            if (game.user.id === userId) {
                for (const item of documents) {
                    if (item.type === 'talent' && item.system?.hasGrants) {
                        // Use setTimeout to ensure the item is fully created before processing grants
                        setTimeout(() => void processTalentGrants(item, this), 100);
                    }
                }
            }
        }
    }

    /**
     * Handle the update of descendant documents (items).
     * Triggers recalculation of item-based data.
     * @override
     */
    _onUpdateDescendantDocuments(
        parent: Record<string, unknown>,
        collection: string,
        documents: unknown[],
        changes: unknown[],
        options: Record<string, unknown>,
        userId: string,
    ): void {
        (super._onUpdateDescendantDocuments as any)(parent, collection, documents, changes, options, userId);
        if (collection === 'items') {
            this._onItemsChanged();
        }
    }

    /**
     * Handle the deletion of descendant documents (items).
     * Triggers recalculation of item-based data.
     * Also handles removal of granted items when a talent is deleted.
     * @override
     */
    _onDeleteDescendantDocuments(
        parent: Record<string, unknown>,
        collection: string,
        documents: unknown[],
        ids: string[],
        options: Record<string, unknown>,
        userId: string,
    ): void {
        // Process talent removal BEFORE deletion to access the talent's data
        if (collection === 'items' && game.user.id === userId) {
            for (const item of documents) {
                if (item.type === 'talent' && item.system?.hasGrants) {
                    // Use setTimeout to show dialog after the item is deleted
                    setTimeout(() => void handleTalentRemoval(item, this), 100);
                }
            }
        }

        (super._onDeleteDescendantDocuments as any)(parent, collection, documents, ids, options, userId);
        if (collection === 'items') {
            this._onItemsChanged();
        }
    }

    /**
     * Called when items are created, updated, or deleted.
     * Triggers recalculation of item-based data via prepareEmbeddedData.
     * @protected
     */
    _onItemsChanged(): void {
        // Re-run embedded data preparation if the DataModel supports it
        if (typeof this.system?.prepareEmbeddedData === 'function') {
            // Reset modifier tracking before recalculating
            if (typeof this.system._initializeModifierTracking === 'function') {
                this.system._initializeModifierTracking();
            }
            this.system.prepareEmbeddedData();
        }
    }

    async _preCreate(data: Record<string, unknown>, options: Record<string, unknown>, user: Record<string, unknown>): Promise<void> {
        await (super._preCreate as any)(data, options, user);
        const initData = {
            'token.bar1': { attribute: 'wounds' },
            'token.bar2': { attribute: 'fate' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'token.name': data.name,
        };
        if (data.type === 'vehicle') {
            initData['token.bar1'] = { attribute: 'integrity' };
            initData['token.bar2'] = undefined;
        }
        if (data.type === 'acolyte' || data.type === 'character') {
            initData['token.vision'] = true;
            initData['token.actorLink'] = true;

            // Set default favorite skills for new characters
            if (!(this as any).getFlag('wh40k-rpg', 'favoriteSkills')) {
                initData['flags.wh40k-rpg.favoriteSkills'] = ['dodge', 'awareness', 'scrutiny', 'inquiry', 'commerce', 'techUse', 'command', 'medicae'];
            }
        }
        (this as any).updateSource(initData);
    }

    get characteristics(): Record<string, WH40KCharacteristic> {
        return this.system.characteristics;
    }

    get initiative(): { base: number; bonus: number; characteristic?: string } {
        return this.system.initiative;
    }

    get wounds(): { value: number; max: number; critical: number } {
        return this.system.wounds;
    }

    get size(): number {
        return Number.parseInt(this.system.size);
    }

    get movement(): { half: number; full: number; charge: number; run: number } {
        return this.system.movement;
    }

    prepareData(): void {
        super.prepareData();

        // Skip legacy calculations if a DataModel is handling data preparation
        // DataModels have their own prepareDerivedData that already ran
        const hasDataModel = typeof this.system?.prepareDerivedData === 'function';
        if (!hasDataModel) {
            this._computeCharacteristics();
            this._computeMovement();
        }
    }

    async rollCharacteristic(characteristicName: string, override?: string): Promise<void> {
        const characteristic = this.characteristics[characteristicName];

        const simpleSkillData = new SimpleSkillData();
        const rollData = simpleSkillData.rollData;
        rollData.actor = this;
        rollData.nameOverride = characteristic.label;
        rollData.type = override ? override : 'Characteristic';
        rollData.baseTarget = characteristic.total;
        rollData.modifiers.modifier = 0;
        await prepareUnifiedRoll(simpleSkillData);
    }

    getCharacteristicFuzzy(char: string): WH40KCharacteristic | undefined {
        // This tries to account for case sensitivity and abbreviations
        for (const [name, characteristic] of Object.entries(this.characteristics)) {
            if (char.toUpperCase() === name.toUpperCase() || char.toLocaleString() === characteristic.short.toUpperCase()) {
                return characteristic;
            }
        }
        return undefined;
    }

    /**
     * Compute characteristic totals and bonuses.
     * Used for actor types that don't have a DataModel (NPC, Vehicle, Starship).
     * @protected
     */
    _computeCharacteristics(): void {
        if (!this.characteristics) return;

        for (const [, characteristic] of Object.entries(this.characteristics)) {
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

    _computeMovement(): void {
        const agility = this.characteristics?.agility;
        // Skip movement calculation if agility is not available (e.g., for starships)
        if (!agility) return;
        const size = this.size;
        this.system.movement = {
            half: agility.bonus + size - 4,
            full: (agility.bonus + size - 4) * 2,
            charge: (agility.bonus + size - 4) * 3,
            run: (agility.bonus + size - 4) * 6,
        };
    }

    _findCharacteristic(short: string): any {
        for (const characteristic of Object.values(this.characteristics)) {
            if (characteristic.short === short) {
                return characteristic;
            }
        }
        return { total: 0 };
    }

    async addSpecialitySkill(skill: string, speciality: string): Promise<void> {
        const parent = this.system.skills[skill];
        const specialityKey = toCamelCase(speciality);
        if (!parent) {
            ui.notifications.warn(`Skill not specified -- unexpected error.`);
            return;
        }

        const entries = Array.isArray(parent.entries) ? [...parent.entries] : [];

        if (entries.some((entry) => entry.name?.toLowerCase() === speciality.toLowerCase() || entry.slug === specialityKey)) {
            ui.notifications.warn(`Speciality already exists. Unable to create.`);
            return;
        }

        const isAdvanced = parent.advanced ?? false;
        entries.push({
            name: speciality,
            slug: specialityKey,
            characteristic: parent.characteristic,
            advanced: isAdvanced,
            basic: !isAdvanced,
            trained: false,
            plus10: false,
            plus20: false,
            bonus: 0,
            notes: '',
            cost: 0,
            current: 0,
        });

        await this.update({
            [`system.skills.${skill}.entries`]: entries,
        });
    }

    /* -------------------------------------------- */
    /*  Stat Breakdown System                       */
    /* -------------------------------------------- */

    /**
     * Get a breakdown of a stat showing base value and all modifiers.
     * Used by StatBreakdownMixin to display detailed stat calculations.
     * @param {string} statKey - The stat to break down (characteristic name, skill name, etc.)
     * @returns {Object|null} Breakdown object or null if stat not found
     */
    getStatBreakdown(statKey: string): WH40KStatBreakdown | null {
        // Try characteristic
        const characteristic = this.system.characteristics?.[statKey];
        if (characteristic) {
            return this.#getCharacteristicBreakdown(statKey, characteristic);
        }

        // Try skill
        const skill = this.system.skills?.[statKey];
        if (skill) {
            return this.#getSkillBreakdown(statKey, skill);
        }

        // Try derived stats (wounds, initiative, etc.)
        if (statKey === 'wounds') {
            return this.#getWoundsBreakdown();
        }
        if (statKey === 'initiative') {
            return this.#getInitiativeBreakdown();
        }
        if (statKey === 'fate') {
            return this.#getFateBreakdown();
        }

        // Armour locations
        if (statKey.startsWith('armour.')) {
            const location = statKey.split('.')[1];
            return this.#getArmourBreakdown(location);
        }

        return null;
    }

    /**
     * Get breakdown for a characteristic
     * @param {string} charKey - Characteristic key
     * @param {Object} characteristic - Characteristic data
     * @returns {Object} Breakdown object
     * @private
     */
    #getCharacteristicBreakdown(charKey: string, characteristic: any): WH40KStatBreakdown {
        const base = Number(characteristic.base ?? characteristic.starting ?? 0);
        const advance = Number(characteristic.advance ?? characteristic.advances ?? 0);
        const modifierValue = Number(characteristic.modifier ?? 0);

        const breakdown = {
            label: characteristic.label || charKey.toUpperCase(),
            base: base,
            modifiers: [],
            total: characteristic.total || 0,
        };

        // Add advances
        if (advance > 0) {
            breakdown.modifiers.push({
                source: `Advances (${advance})`,
                value: advance * 5,
                icon: 'fa-solid fa-arrow-up',
            });
        }

        // Add modifier from items/effects
        if (modifierValue !== 0) {
            // Collect modifiers from items
            this.#collectCharacteristicModifiers(charKey, breakdown.modifiers);
        }

        return breakdown;
    }

    /**
     * Get breakdown for a skill
     * @param {string} skillKey - Skill key
     * @param {Object} skill - Skill data
     * @returns {Object} Breakdown object
     * @private
     */
    #getSkillBreakdown(skillKey: string, skill: any): WH40KStatBreakdown {
        const charShort = skill.characteristic;
        const characteristic = this._findCharacteristic(charShort);
        const baseTarget = characteristic.total || 0;

        const breakdown = {
            label: skill.label || skillKey,
            base: baseTarget,
            modifiers: [],
            total: skill.current || baseTarget,
        };

        // Add training modifiers
        if (skill.trained) {
            breakdown.modifiers.push({
                source: 'Trained',
                value: skill.advanced ? 20 : 0, // Advanced skills get +20 when trained (removes -20 penalty)
                icon: 'fa-solid fa-graduation-cap',
            });
        } else if (skill.advanced) {
            breakdown.modifiers.push({
                source: 'Untrained (Advanced)',
                value: -20,
                icon: 'fa-solid fa-ban',
            });
        }

        if (skill.plus10) {
            breakdown.modifiers.push({
                source: '+10 Training',
                value: 10,
                icon: 'fa-solid fa-star',
            });
        }

        if (skill.plus20) {
            breakdown.modifiers.push({
                source: '+20 Training',
                value: 20,
                icon: 'fa-solid fa-star',
            });
        }

        // Add skill bonus
        if (skill.bonus && skill.bonus !== 0) {
            this.#collectSkillModifiers(skillKey, breakdown.modifiers);
        }

        return breakdown;
    }

    /**
     * Get breakdown for wounds
     * @returns {Object} Breakdown object
     * @private
     */
    #getWoundsBreakdown(): WH40KStatBreakdown {
        const wounds = this.system.wounds;
        const toughness = this.system.characteristics?.toughness;
        const strength = this.system.characteristics?.strength;
        const willpower = this.system.characteristics?.willpower;

        const breakdown = {
            label: 'Wounds',
            base: 0,
            modifiers: [],
            total: wounds.max || 0,
        };

        // Base calculation varies by actor type, but typically TB + 2xSB + 2xWPB for characters
        if (toughness) {
            breakdown.modifiers.push({
                source: 'Toughness Bonus',
                value: toughness.bonus || 0,
                icon: 'fa-solid fa-shield-halved',
            });
        }

        if (strength) {
            breakdown.modifiers.push({
                source: 'Strength Bonus ×2',
                value: (strength.bonus || 0) * 2,
                icon: 'fa-solid fa-dumbbell',
            });
        }

        if (willpower) {
            breakdown.modifiers.push({
                source: 'Willpower Bonus ×2',
                value: (willpower.bonus || 0) * 2,
                icon: 'fa-solid fa-brain',
            });
        }

        // Collect modifiers from talents/traits
        this.#collectWoundsModifiers(breakdown.modifiers);

        return breakdown;
    }

    /**
     * Get breakdown for initiative
     * @returns {Object} Breakdown object
     * @private
     */
    #getInitiativeBreakdown(): WH40KStatBreakdown {
        const initiative = this.system.initiative;
        const agility = this.system.characteristics?.agility;

        const breakdown = {
            label: 'Initiative',
            base: agility?.bonus || 0,
            modifiers: [],
            total: initiative.bonus || 0,
        };

        // Collect modifiers from items
        this.#collectInitiativeModifiers(breakdown.modifiers);

        return breakdown;
    }

    /**
     * Get breakdown for fate points
     * @returns {Object} Breakdown object
     * @private
     */
    #getFateBreakdown(): WH40KStatBreakdown {
        const fate = this.system.fate;

        const breakdown = {
            label: 'Fate Points',
            base: fate.rolled ? fate.max - (this.system.totalFateModifier || 0) : 0,
            modifiers: [],
            total: fate.max || 0,
        };

        if (fate.rolled) {
            breakdown.modifiers.push({
                source: 'Rolled Value',
                value: breakdown.base,
                icon: 'fa-solid fa-dice',
            });
        }

        // Collect modifiers from items
        this.#collectFateModifiers(breakdown.modifiers);

        return breakdown;
    }

    /**
     * Get breakdown for armour at a specific location
     * @param {string} location - Body location (head, body, leftArm, etc.)
     * @returns {Object} Breakdown object
     * @private
     */
    #getArmourBreakdown(location: string): WH40KStatBreakdown | null {
        const armour = this.system.armour?.[location];
        if (!armour) return null;

        const breakdown = {
            label: `Armour (${location})`,
            base: 0,
            modifiers: [],
            total: armour.value || 0,
        };

        if (armour.total > 0) {
            breakdown.modifiers.push({
                source: 'Equipped Armour',
                value: armour.total,
                icon: 'fa-solid fa-vest',
            });
        }

        if (armour.toughnessBonus > 0) {
            breakdown.modifiers.push({
                source: 'Toughness Bonus',
                value: armour.toughnessBonus,
                icon: 'fa-solid fa-shield-halved',
            });
        }

        if (armour.traitBonus > 0) {
            breakdown.modifiers.push({
                source: 'Trait Bonuses',
                value: armour.traitBonus,
                icon: 'fa-solid fa-bolt',
            });
        }

        return breakdown;
    }

    /**
     * Collect characteristic modifiers from items
     * @param {string} charKey - Characteristic key
     * @param {Array} modifiersArray - Array to push modifiers to
     * @private
     */
    #collectCharacteristicModifiers(charKey: string, modifiersArray: WH40KModifierEntry[]): void {
        for (const item of [...this.items] as unknown[]) {
            const modifiers = item.system.modifiers;
            if (!modifiers?.characteristics) continue;

            const value = modifiers.characteristics[charKey];
            if (value && value !== 0) {
                modifiersArray.push({
                    source: item.name,
                    value: value,
                    uuid: item.uuid,
                    icon: this.#getItemIcon(item),
                });
            }
        }
    }

    /**
     * Collect skill modifiers from items
     * @param {string} skillKey - Skill key
     * @param {Array} modifiersArray - Array to push modifiers to
     * @private
     */
    #collectSkillModifiers(skillKey: string, modifiersArray: WH40KModifierEntry[]): void {
        for (const item of [...this.items] as unknown[]) {
            const modifiers = item.system.modifiers;
            if (!modifiers?.skills) continue;

            const value = modifiers.skills[skillKey];
            if (value && value !== 0) {
                modifiersArray.push({
                    source: item.name,
                    value: value,
                    uuid: item.uuid,
                    icon: this.#getItemIcon(item),
                });
            }
        }
    }

    /**
     * Collect wounds modifiers from items
     * @param {Array} modifiersArray - Array to push modifiers to
     * @private
     */
    #collectWoundsModifiers(modifiersArray: WH40KModifierEntry[]): void {
        for (const item of [...this.items] as unknown[]) {
            const modifiers = item.system.modifiers;
            if (!modifiers?.other) continue;

            const woundsMod = modifiers.other.find((m) => m.key === 'wounds' || m.key === 'wounds.max');
            if (woundsMod && woundsMod.value !== 0) {
                modifiersArray.push({
                    source: item.name,
                    value: woundsMod.value,
                    uuid: item.uuid,
                    icon: this.#getItemIcon(item),
                });
            }
        }
    }

    /**
     * Collect initiative modifiers from items
     * @param {Array} modifiersArray - Array to push modifiers to
     * @private
     */
    #collectInitiativeModifiers(modifiersArray: WH40KModifierEntry[]): void {
        for (const item of [...this.items] as unknown[]) {
            const modifiers = item.system.modifiers;
            if (!modifiers?.other) continue;

            const initiativeMod = modifiers.other.find((m) => m.key === 'initiative');
            if (initiativeMod && initiativeMod.value !== 0) {
                modifiersArray.push({
                    source: item.name,
                    value: initiativeMod.value,
                    uuid: item.uuid,
                    icon: this.#getItemIcon(item),
                });
            }
        }
    }

    /**
     * Collect fate modifiers from items
     * @param {Array} modifiersArray - Array to push modifiers to
     * @private
     */
    #collectFateModifiers(modifiersArray: WH40KModifierEntry[]): void {
        const totalMod = this.system.totalFateModifier || 0;
        if (totalMod !== 0) {
            modifiersArray.push({
                source: 'Talents & Traits',
                value: totalMod,
                icon: 'fa-solid fa-sparkles',
            });
        }
    }

    /**
     * Get appropriate icon for an item type
     * @param {Item} item - The item
     * @returns {string} Font Awesome icon class
     * @private
     */
    #getItemIcon(item: WH40KItem): string {
        const iconMap = {
            talent: 'fa-solid fa-star',
            trait: 'fa-solid fa-dna',
            condition: 'fa-solid fa-circle-exclamation',
            weapon: 'fa-solid fa-gun',
            armour: 'fa-solid fa-vest',
            gear: 'fa-solid fa-box',
        };
        return iconMap[item.type] || 'fa-solid fa-circle';
    }
}
