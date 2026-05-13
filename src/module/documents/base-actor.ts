import { prepareUnifiedRoll } from '../applications/prompts/unified-roll-dialog.ts';
import { toCamelCase } from '../handlebars/handlebars-helpers.ts';
import { SimpleSkillData } from '../rolls/action-data.ts';
import type { WH40KActorSystemData, WH40KCharacteristic, WH40KModifierEntry, WH40KSkill, WH40KStatBreakdown } from '../types/global.d.ts';
import { handleTalentRemoval, processTalentGrants } from '../utils/talent-grants.ts';
import type { WH40KItem } from './item.ts';

type RollDataLike = Record<string, unknown> & {
    actor?: WH40KBaseActor;
    sourceActor?: WH40KBaseActor;
    nameOverride?: string;
    type?: string;
    rollKey?: string;
    baseTarget?: number;
    modifiers: { modifier: number; situational?: number };
};

type CharacteristicLike = Record<string, unknown> & WH40KCharacteristic;
type SkillLike = Record<string, unknown> & WH40KSkill;
type ItemModifierCarrier = WH40KItem & {
    system: WH40KItem['system'] & {
        modifiers?: {
            characteristics?: Record<string, number>;
            skills?: Record<string, number>;
            other?: Array<{ key: string; value: number }>;
        };
    };
};

export class WH40KBaseActor extends Actor {
    declare system: Actor['system'] & WH40KActorSystemData;
    declare items: Actor['items'] & foundry.utils.Collection<WH40KItem>;

    async rollCharacteristicCheck(_characteristic: string): Promise<unknown> {
        return Promise.resolve(null);
    }

    async rollWeaponAction(item: WH40KItem): Promise<unknown> {
        return this.rollItem(item.id ?? '');
    }

    async rollPsychicPower(item: WH40KItem): Promise<unknown> {
        return this.rollItem(item.id ?? '');
    }

    async spendFate(): Promise<void> {}

    /* -------------------------------------------- */
    /*  Descendant Document Hooks                   */
    /* -------------------------------------------- */

    /**
     * Handle the creation of descendant documents (items).
     * @override
     */
    protected override _onCreateDescendantDocuments(...args: Actor.OnCreateDescendantDocumentsArgs): void {
        super._onCreateDescendantDocuments(...args);
        const [, collection, documents, , , userId] = args;
        const items = documents as unknown as WH40KItem[];
        if (collection === 'items') {
            this._onItemsChanged();

            // Process talent grants for newly added talents
            if (game.user.id === userId) {
                for (const item of items) {
                    if (item.type === 'talent' && (item.system as { hasGrants?: boolean }).hasGrants === true) {
                        setTimeout(() => void processTalentGrants(item, this), 100);
                    }
                }
            }
        }
    }

    /**
     * Handle the update of descendant documents (items).
     * @override
     */
    protected override _onUpdateDescendantDocuments(...args: Actor.OnUpdateDescendantDocumentsArgs): void {
        super._onUpdateDescendantDocuments(...args);
        const [, collection] = args;
        if (collection === 'items') {
            this._onItemsChanged();
        }
    }

    /**
     * Handle the deletion of descendant documents (items).
     * @override
     */
    protected override _onDeleteDescendantDocuments(...args: Actor.OnDeleteDescendantDocumentsArgs): void {
        const [, collection, documents, , , userId] = args;
        const items = documents as unknown as WH40KItem[];
        if (collection === 'items' && game.user.id === userId) {
            for (const item of items) {
                if (item.type === 'talent' && (item.system as { hasGrants?: boolean }).hasGrants === true) {
                    setTimeout(() => void handleTalentRemoval(item, this), 100);
                }
            }
        }

        super._onDeleteDescendantDocuments(...args);
        if (collection === 'items') {
            this._onItemsChanged();
        }
    }

    /**
     * Called when items are created, updated, or deleted.
     * Triggers recalculation of item-based data via prepareEmbeddedData.
     */
    _onItemsChanged(): void {
        const system = this.system as {
            _initializeModifierTracking?: () => void;
            prepareEmbeddedData?: () => void;
        };
        if (typeof system._initializeModifierTracking === 'function') {
            system._initializeModifierTracking();
        }
        if (typeof system.prepareEmbeddedData === 'function') {
            system.prepareEmbeddedData();
        }
    }

    protected override async _preCreate(data: never, options: never, user: User.Internal.Implementation): Promise<boolean | void> {
        await super._preCreate(data, options, user as never);
        const createData = data as Record<string, unknown>;
        const preCreateOptions = options as Record<string, unknown>;
        void preCreateOptions;
        const initData: Record<string, unknown> = {
            'token.bar1': { attribute: 'wounds' },
            'token.bar2': { attribute: 'fate' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'token.name': createData['name'],
        };
        if (createData['type'] === 'vehicle') {
            initData['token.bar1'] = { attribute: 'integrity' };
            initData['token.bar2'] = undefined;
        }
        if (createData['type'] === 'acolyte' || createData['type'] === 'character') {
            initData['token.vision'] = true;
            initData['token.actorLink'] = true;

            // Set default favorite skills for new characters
            if (this.getFlag('wh40k-rpg', 'favoriteSkills') === undefined || this.getFlag('wh40k-rpg', 'favoriteSkills') === null) {
                initData['flags.wh40k-rpg.favoriteSkills'] = ['dodge', 'awareness', 'scrutiny', 'inquiry', 'commerce', 'techUse', 'command', 'medicae'];
            }
        }
        this.updateSource(initData);
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
        return Number.parseInt(String(this.system.size), 10);
    }

    get movement(): { half: number; full: number; charge: number; run: number } {
        return this.system.movement;
    }

    override prepareData(): void {
        super.prepareData();

        // Skip legacy calculations if a DataModel is handling data preparation
        // DataModels have their own prepareDerivedData that already ran
        const hasDataModel = typeof this.system.prepareDerivedData === 'function';
        if (!hasDataModel) {
            this._computeCharacteristics();
            this._computeMovement();
        }
    }

    /**
     * Roll an item action (weapon attack, psychic power, etc.) by item ID.
     * Override in subclasses with item-type-specific behavior.
     */
    async rollItem(_itemId: string): Promise<void> {
        // Base implementation does nothing; subclasses override.
    }

    rollCharacteristic(characteristicName: string, override?: string): void {
        const characteristic = this.characteristics[characteristicName];
        if (characteristic === undefined) return;

        const simpleSkillData = new SimpleSkillData();
        const rollData = simpleSkillData.rollData as unknown as RollDataLike;
        rollData.actor = this;
        rollData.nameOverride = characteristic.label;
        rollData.type = override ?? 'Characteristic';
        rollData.baseTarget = characteristic.total;
        rollData.modifiers.modifier = 0;
        prepareUnifiedRoll(simpleSkillData);
    }

    /* -------------------------------------------- */
    /*  Roll Builders                               */
    /* -------------------------------------------- */

    /**
     * Build a populated SimpleSkillData for a unified roll. Centralises the boilerplate
     * shared by `rollCharacteristic` / `rollSkill` / `rollSimpleWeapon` across PC and NPC
     * actors.
     *
     * Asymmetry: PCs (acolyte) honour situational modifiers from items; NPCs do not.
     * Pass `situationalKey` (with the matching `type`) to opt-in to PC-style situational
     * modifier collection. Omit it for NPC-style direct rolls.
     */
    protected _buildSimpleSkillRoll(opts: {
        key: string;
        type: 'characteristic' | 'skill' | 'simpleWeapon';
        label: string;
        target: number;
        situationalKey?: string | undefined;
        nameOverride?: string | undefined;
    }): SimpleSkillData {
        const TYPE_LITERAL: Record<typeof opts.type, string> = {
            characteristic: 'Characteristic',
            skill: 'Skill',
            simpleWeapon: 'Attack',
        };

        const simpleSkillData = new SimpleSkillData();
        const rollData = simpleSkillData.rollData as unknown as RollDataLike;
        rollData.actor = this;
        rollData.sourceActor = this;
        rollData.nameOverride = opts.nameOverride ?? opts.label;
        rollData.type = TYPE_LITERAL[opts.type];
        rollData.rollKey = opts.key;
        rollData.baseTarget = opts.target;
        rollData.modifiers.modifier = 0;

        if (opts.situationalKey !== undefined) {
            const sitMod = this._collectSituationalModifierTotal(opts.type, opts.situationalKey);
            if (sitMod !== 0) rollData.modifiers.situational = sitMod;
        }

        return simpleSkillData;
    }

    /**
     * Sum situational modifiers for a roll. Subclasses (e.g. WH40KAcolyte) expose the
     * per-type modifier collectors; if they are not available, this returns 0 — matching
     * the NPC path where situational modifiers are intentionally not consulted.
     * @private
     */
    private _collectSituationalModifierTotal(type: 'characteristic' | 'skill' | 'simpleWeapon', key: string): number {
        const provider = this as unknown as {
            getCharacteristicSituationalModifiers?: (k: string) => Array<{ value: number }>;
            getSkillSituationalModifiers?: (k: string) => Array<{ value: number }>;
            getCombatSituationalModifiers?: (k: string) => Array<{ value: number }>;
        };
        let modifiers: Array<{ value: number }> | undefined;
        if (type === 'characteristic') {
            modifiers = provider.getCharacteristicSituationalModifiers?.(key);
        } else if (type === 'skill') {
            modifiers = provider.getSkillSituationalModifiers?.(key);
        } else {
            modifiers = provider.getCombatSituationalModifiers?.(key);
        }
        if (modifiers === undefined || modifiers.length === 0) return 0;
        let total = 0;
        for (const mod of modifiers) total += mod.value;
        return total;
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
        if (this.characteristics === undefined) return;

        const charRecord = this.characteristics as Record<string, WH40KCharacteristic & { starting?: number; advances?: number }>;
        for (const [, characteristic] of Object.entries(charRecord)) {
            const charAny = characteristic as unknown as Record<string, unknown>;
            const base = Number(charAny['base'] ?? charAny['starting'] ?? 0);
            const advance = Number(charAny['advance'] ?? charAny['advances'] ?? 0);
            const modifier = Number(charAny['modifier'] ?? 0);
            const unnatural = Number(charAny['unnatural'] ?? 0);

            characteristic.total = base + advance * 5 + modifier;

            // Calculate bonus: base modifier is tens digit
            const baseModifier = Math.floor(characteristic.total / 10);
            // Unnatural multiplies the modifier (0 = no effect, 2+ = multiplier)
            characteristic.bonus = unnatural >= 2 ? baseModifier * unnatural : baseModifier;
        }

        const initChar = this.initiative.characteristic;
        if (initChar !== undefined && initChar !== '') {
            const charEntry = this.characteristics[initChar];
            if (charEntry !== undefined) {
                this.initiative.bonus = charEntry.bonus;
            }
        }
    }

    _computeMovement(): void {
        const chars = this.characteristics as Record<string, WH40KCharacteristic> | undefined | null;
        const agility = chars !== undefined && chars !== null ? chars['agility'] : undefined;
        // Skip movement calculation if agility is not available (e.g., for starships)
        if (agility === undefined) return;
        const size = this.size;
        this.system.movement = {
            half: agility.bonus + size - 4,
            full: (agility.bonus + size - 4) * 2,
            charge: (agility.bonus + size - 4) * 3,
            run: (agility.bonus + size - 4) * 6,
        };
    }

    _findCharacteristic(short: string): unknown {
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
        if (parent === undefined || parent === null) {
            ui.notifications.warn(`Skill not specified -- unexpected error.`);
            return;
        }

        const entries = Array.isArray(parent.entries) ? [...parent.entries] : [];

        if (
            entries.some((entry) => (entry.name !== undefined ? entry.name.toLowerCase() === speciality.toLowerCase() : false) || entry.slug === specialityKey)
        ) {
            ui.notifications.warn(`Speciality already exists. Unable to create.`);
            return;
        }

        const isAdvanced = parent.advanced;
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
        const sysChars = (this.system as Record<string, unknown>)['characteristics'] as Record<string, unknown> | undefined;
        const characteristic = sysChars !== undefined ? sysChars[statKey] : undefined;
        if (characteristic !== undefined && characteristic !== null) {
            return this.#getCharacteristicBreakdown(statKey, characteristic as CharacteristicLike);
        }

        // Try skill
        const sysSkills = (this.system as Record<string, unknown>)['skills'] as Record<string, unknown> | undefined;
        const skill = sysSkills !== undefined ? sysSkills[statKey] : undefined;
        if (skill !== undefined && skill !== null) {
            return this.#getSkillBreakdown(statKey, skill as SkillLike);
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
            if (location === undefined) return null;
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
    #getCharacteristicBreakdown(charKey: string, characteristic: CharacteristicLike): WH40KStatBreakdown {
        const charAny = characteristic as Record<string, unknown>;
        const base = Number(charAny['base'] ?? charAny['starting'] ?? 0);
        const advance = Number(charAny['advance'] ?? charAny['advances'] ?? 0);
        const modifierValue = Number(charAny['modifier'] ?? 0);

        const breakdown: WH40KStatBreakdown = {
            label: characteristic.label !== '' ? characteristic.label : charKey.toUpperCase(),
            base,
            modifiers: [],
            total: Number(characteristic.total),
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
    #getSkillBreakdown(skillKey: string, skill: SkillLike): WH40KStatBreakdown {
        const charShort = skill.characteristic;
        const characteristic = this._findCharacteristic(charShort) as { total?: number };
        const baseTarget = Number(characteristic.total ?? 0);

        const breakdown: WH40KStatBreakdown = {
            label: skill.label !== undefined && skill.label !== '' ? skill.label : skillKey,
            base: baseTarget,
            modifiers: [],
            total: Number(skill.current !== 0 ? skill.current : baseTarget),
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
        if (skill.bonus !== 0 && skill.bonus !== undefined) {
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
        const sysChars = (this.system as Record<string, unknown>)['characteristics'] as Record<string, WH40KCharacteristic> | undefined;
        const toughness = sysChars !== undefined ? sysChars['toughness'] : undefined;
        const strength = sysChars !== undefined ? sysChars['strength'] : undefined;
        const willpower = sysChars !== undefined ? sysChars['willpower'] : undefined;

        const breakdown: WH40KStatBreakdown = {
            label: 'Wounds',
            base: 0,
            modifiers: [],
            total: wounds.max,
        };

        // Base calculation varies by actor type, but typically TB + 2xSB + 2xWPB for characters
        if (toughness !== undefined) {
            breakdown.modifiers.push({
                source: 'Toughness Bonus',
                value: toughness.bonus,
                icon: 'fa-solid fa-shield-halved',
            });
        }

        if (strength !== undefined) {
            breakdown.modifiers.push({
                source: 'Strength Bonus ×2',
                value: strength.bonus * 2,
                icon: 'fa-solid fa-dumbbell',
            });
        }

        if (willpower !== undefined) {
            breakdown.modifiers.push({
                source: 'Willpower Bonus ×2',
                value: willpower.bonus * 2,
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
        const sysCharsI = (this.system as Record<string, unknown>)['characteristics'] as Record<string, WH40KCharacteristic> | undefined;
        const agility = sysCharsI !== undefined ? sysCharsI['agility'] : undefined;

        const breakdown: WH40KStatBreakdown = {
            label: 'Initiative',
            base: agility !== undefined ? agility.bonus : 0,
            modifiers: [],
            total: initiative.bonus,
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
        const fate = (this.system as Record<string, unknown>)['fate'] as { rolled?: boolean; max?: number } | undefined | null;

        if (fate === undefined || fate === null) {
            return { label: 'Fate Points', base: 0, modifiers: [], total: 0 };
        }

        const totalFateMod = (this.system as Record<string, unknown>)['totalFateModifier'] as number | undefined;
        const breakdown: WH40KStatBreakdown = {
            label: 'Fate Points',
            base: fate.rolled === true ? (fate.max ?? 0) - (totalFateMod ?? 0) : 0,
            modifiers: [],
            total: fate.max ?? 0,
        };

        if (fate.rolled === true) {
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
        const sysArmour = (this.system as Record<string, unknown>)['armour'] as
            | Record<string, { value?: number; total?: number; toughnessBonus?: number; traitBonus?: number }>
            | undefined;
        const armour = sysArmour !== undefined ? sysArmour[location] : undefined;
        if (armour === undefined || armour === null) return null;

        const breakdown: WH40KStatBreakdown = {
            label: `Armour (${location})`,
            base: 0,
            modifiers: [],
            total: armour.value ?? 0,
        };

        const total = armour.total ?? 0;
        const toughnessBonus = armour.toughnessBonus ?? 0;
        const traitBonus = armour.traitBonus ?? 0;

        if (total > 0) {
            breakdown.modifiers.push({
                source: 'Equipped Armour',
                value: total,
                icon: 'fa-solid fa-vest',
            });
        }

        if (toughnessBonus > 0) {
            breakdown.modifiers.push({
                source: 'Toughness Bonus',
                value: toughnessBonus,
                icon: 'fa-solid fa-shield-halved',
            });
        }

        if (traitBonus > 0) {
            breakdown.modifiers.push({
                source: 'Trait Bonuses',
                value: traitBonus,
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
        for (const item of [...this.items] as ItemModifierCarrier[]) {
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
        for (const item of [...this.items] as ItemModifierCarrier[]) {
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
        for (const item of [...this.items] as ItemModifierCarrier[]) {
            const modifiers = item.system.modifiers;
            if (!modifiers?.other) continue;

            const woundsMod = modifiers.other.find((m: { key: string; value: number }) => m.key === 'wounds' || m.key === 'wounds.max');
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
        for (const item of [...this.items] as ItemModifierCarrier[]) {
            const modifiers = item.system.modifiers;
            if (!modifiers?.other) continue;

            const initiativeMod = modifiers.other.find((m: { key: string; value: number }) => m.key === 'initiative');
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
        const totalMod = this.system.totalFateModifier ?? 0;
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
        const iconMap: Record<string, string> = {
            talent: 'fa-solid fa-star',
            trait: 'fa-solid fa-dna',
            condition: 'fa-solid fa-circle-exclamation',
            weapon: 'fa-solid fa-gun',
            armour: 'fa-solid fa-vest',
            gear: 'fa-solid fa-box',
        };
        return iconMap[item.type] ?? 'fa-solid fa-circle';
    }
}
