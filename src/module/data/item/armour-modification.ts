import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';

/**
 * Data model for Armour Modification items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 */
export default class ArmourModificationData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare restrictions: { armourTypes: Set<string> };
    declare modifiers: { armourPoints: number; maxAgility: number; weight: number };
    declare addedProperties: Set<string>;
    declare removedProperties: Set<string>;
    declare effect: string;
    declare notes: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new (IdentifierField as any)({ required: true, blank: true }) as foundry.data.fields.StringField,

            // What armour types this can be applied to
            restrictions: new fields.SchemaField({
                armourTypes: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: new Set() }),
            }),

            // Stat modifiers — allow null for items whose homologated source
            // data has no modifier set yet (would otherwise fail validation
            // on actor load and invalidate the parent actor).
            modifiers: new fields.SchemaField({
                armourPoints: new fields.NumberField({ required: false, initial: 0, nullable: true, integer: true }),
                maxAgility: new fields.NumberField({ required: false, initial: 0, nullable: true, integer: true }),
                weight: new fields.NumberField({ required: false, initial: 0, nullable: true }),
            }),

            // Properties added
            addedProperties: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: new Set() }),

            // Properties removed
            removedProperties: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: new Set() }),

            // Effect description
            effect: new fields.HTMLField({ required: false }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate armour modification data.
     * @param {object} source  The source data
     * @protected
     */
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
        ArmourModificationData.#migrateArmourTypes(source);
        ArmourModificationData.#migrateArmourModifier(source);
        ArmourModificationData.#extractAPFromEffect(source);
        ArmourModificationData.#migrateMaxDexBonus(source);
        ArmourModificationData.#extractAgilityFromEffect(source);
        ArmourModificationData.#migrateWeight(source);
        ArmourModificationData.#cleanupModifiers(source);
        ArmourModificationData.#initializeDefaults(source);
    }

    static #migrateArmourTypes(source: Record<string, unknown>): void {
        if (typeof source['armourTypes'] === 'string') {
            source['restrictions'] ??= {};
            (source['restrictions'] as Record<string, unknown>)['armourTypes'] = ArmourModificationData.#parseArmourTypes(source['armourTypes']);
            delete source['armourTypes'];
        }
    }

    static #migrateArmourModifier(source: Record<string, unknown>): void {
        if (typeof source['armourModifier'] === 'number') {
            source['modifiers'] ??= {};
            (source['modifiers'] as Record<string, unknown>)['armourPoints'] = source['armourModifier'];
            delete source['armourModifier'];
        }
    }

    static #extractAPFromEffect(source: Record<string, unknown>): void {
        const mods = source['modifiers'] as Record<string, unknown> | undefined;
        if ((!mods?.['armourPoints'] || mods['armourPoints'] === 0) && source['effect']) {
            const extracted = ArmourModificationData.#extractAPModifier(source['effect'] as string);
            if (extracted > 0) {
                source['modifiers'] ??= {};
                (source['modifiers'] as Record<string, unknown>)['armourPoints'] = extracted;
            }
        }
    }

    static #migrateMaxDexBonus(source: Record<string, unknown>): void {
        if (typeof source['maxDexBonus'] === 'number') {
            source['modifiers'] ??= {};
            (source['modifiers'] as Record<string, unknown>)['maxAgility'] = source['maxDexBonus'];
            delete source['maxDexBonus'];
        }
    }

    static #extractAgilityFromEffect(source: Record<string, unknown>): void {
        const mods = source['modifiers'] as Record<string, unknown> | undefined;
        if ((!mods?.['maxAgility'] || mods['maxAgility'] === 0) && source['effect']) {
            const extracted = ArmourModificationData.#extractAgilityModifier(source['effect'] as string);
            if (extracted !== 0) {
                source['modifiers'] ??= {};
                (source['modifiers'] as Record<string, unknown>)['maxAgility'] = extracted;
            }
        }
    }

    static #migrateWeight(source: Record<string, unknown>): void {
        if (typeof source['weight'] === 'string') {
            source['modifiers'] ??= {};
            (source['modifiers'] as Record<string, unknown>)['weight'] = ArmourModificationData.#parseWeight(source['weight']);
            delete source['weight'];
        }
    }

    static #cleanupModifiers(source: Record<string, unknown>): void {
        const mods = source['modifiers'] as Record<string, unknown> | undefined;
        if (mods?.['characteristics']) {
            delete mods['characteristics'];
        }
        if (mods?.['skills']) {
            delete mods['skills'];
        }
    }

    static #initializeDefaults(source: Record<string, unknown>): void {
        source['addedProperties'] ??= [];
        source['removedProperties'] ??= [];
        source['restrictions'] ??= { armourTypes: ['any'] };
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean armour modification data.
     * @param {object} source     The source data
     * @param {DataModelV14.CleaningOptions} options    Additional options
     * @protected
     */
    static override _cleanData(source: Record<string, unknown> | undefined, options: DataModelV14.CleaningOptions): void {
        super._cleanData?.(source, options);
        if (!source) return;
        // Convert SetFields to Arrays for storage
        const restrictions = source['restrictions'];
        if (restrictions instanceof Object && (restrictions as Record<string, unknown>)['armourTypes'] instanceof Set) {
            (restrictions as Record<string, unknown>)['armourTypes'] = Array.from((restrictions as Record<string, unknown>)['armourTypes'] as Set<unknown>);
        }
        if (source['addedProperties'] instanceof Set) {
            source['addedProperties'] = Array.from(source['addedProperties'] as Set<unknown>);
        }
        if (source['removedProperties'] instanceof Set) {
            source['removedProperties'] = Array.from(source['removedProperties'] as Set<unknown>);
        }
    }

    /* -------------------------------------------- */
    /*  Private Helpers                             */
    /* -------------------------------------------- */

    /**
     * Parse armour types string into Set of standardized keys.
     * @param {string} str - Raw armour types string from pack data
     * @returns {string[]} Array of standardized armour type keys
     */
    static #parseArmourTypes(str: string): string[] {
        if (!str) return ['any'];

        const normalized = str.toLowerCase();
        const types: string[] = [];

        // Check for "any" patterns
        if (normalized.includes('any armour') && !normalized.includes('except')) {
            return ['any'];
        }

        // Map common type names to standardized keys
        const typeMap = {
            'flak': 'flak',
            'mesh': 'mesh',
            'carapace': 'carapace',
            'power armour': 'power',
            'power': 'power',
            'light-power': 'light-power',
            'light power': 'light-power',
            'storm trooper': 'storm-trooper',
            'storm-trooper': 'storm-trooper',
            'feudal': 'feudal-world',
            'primitive': 'primitive',
            'xenos': 'xenos',
            'void': 'void',
            'enforcer': 'enforcer',
        };

        for (const [key, value] of Object.entries(typeMap)) {
            if (normalized.includes(key) && !types.includes(value)) types.push(value);
        }

        if (normalized.includes('helmet')) types.push('helmet');
        if (normalized.includes('non-primitive')) types.push('non-primitive');

        return types.length > 0 ? types : ['any'];
    }

    /**
     * Parse weight string into numeric value.
     * @param {string|number} str - Weight string
     * @returns {number}
     */
    static #parseWeight(str: string | number): number {
        if (typeof str === 'number') return str;
        if (!str) return 0;
        if (str.includes('wep')) return 0;
        const match = str.match(/[+-]?\d+\.?\d*/);
        return match ? parseFloat(match[0]) : 0;
    }

    /**
     * Extract AP modifier from effect text.
     * @param {string} effect - Effect description text
     * @returns {number}
     */
    static #extractAPModifier(effect: string): number {
        if (!effect) return 0;
        const patterns = [/\+(\d+)\s*AP/i, /gain\s*\+(\d+)\s*AP/i, /adds?\s*\+(\d+)\s*AP/i];
        for (const pattern of patterns) {
            const match = effect.match(pattern);
            if (match) return parseInt(match[1] ?? '', 10);
        }
        return 0;
    }

    /**
     * Extract Agility modifier from effect text.
     * @param {string} effect - Effect description text
     * @returns {number}
     */
    static #extractAgilityModifier(effect: string): number {
        if (!effect) return 0;
        const patterns = [/([+-]\d+)\s*max\s*ag/i, /([+-]\d+)\s*max\s*agility/i, /([+-]\d+)\s*to.*agility/i];
        for (const pattern of patterns) {
            const match = effect.match(pattern);
            if (match) return parseInt(match[1] ?? '', 10);
        }
        return 0;
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get restrictions label.
     * @type {string}
     */
    get restrictionsLabel(): string {
        if (this.restrictions.armourTypes.size) {
            return `Types: ${Array.from(this.restrictions.armourTypes).join(', ')}`;
        }
        return game.i18n.localize('WH40K.Modification.NoRestrictions');
    }

    /**
     * Get formatted restrictions label with localized type names.
     * @type {string}
     */
    get restrictionsLabelEnhanced(): string {
        const types = Array.from(this.restrictions.armourTypes);
        if (!types.length) return game.i18n.localize('WH40K.Modification.NoRestrictions');
        if (types.includes('any')) return game.i18n.localize('WH40K.Modification.AnyArmour');

        const labels = types.map((type) => {
            const config = CONFIG.wh40k?.armourTypes?.[type];
            return config ? game.i18n.localize(config.label) : type;
        });

        return labels.join(', ');
    }

    /**
     * Has any non-zero modifiers?
     * @type {boolean}
     */
    get hasModifiers(): boolean {
        const mods = this.modifiers;
        return mods.armourPoints !== 0 || mods.maxAgility !== 0 || mods.weight !== 0;
    }

    /**
     * Get modifier summary for display.
     * @type {string}
     */
    get modifierSummary(): string {
        const parts = [];
        const mods = this.modifiers;

        if (mods.armourPoints !== 0) {
            parts.push(`AP ${mods.armourPoints >= 0 ? '+' : ''}${mods.armourPoints}`);
        }
        if (mods.maxAgility !== 0) {
            parts.push(`Ag ${mods.maxAgility >= 0 ? '+' : ''}${mods.maxAgility}`);
        }
        if (mods.weight !== 0) {
            parts.push(`${mods.weight >= 0 ? '+' : ''}${mods.weight}kg`);
        }

        return parts.length ? parts.join(', ') : game.i18n.localize('WH40K.Modification.NoModifiers');
    }

    /**
     * Get properties summary.
     * @type {string}
     */
    get propertiesSummary(): string {
        const added = Array.from(this.addedProperties);
        const removed = Array.from(this.removedProperties);
        const parts = [];

        if (added.length) {
            parts.push(`+${added.length} ${game.i18n.localize('WH40K.Modification.Properties')}`);
        }
        if (removed.length) {
            parts.push(`-${removed.length} ${game.i18n.localize('WH40K.Modification.Properties')}`);
        }

        return parts.length ? parts.join(', ') : '';
    }

    /**
     * Get icon for modification type based on what it does.
     * @type {string}
     */
    get icon(): string {
        // Determine icon based on what this mod does
        if (this.modifiers.armourPoints > 0) return 'fa-shield-halved';
        if (this.restrictions.armourTypes.has('power')) return 'fa-bolt';
        if (this.addedProperties.has('sealed')) return 'fa-shield-virus';
        if (this.addedProperties.has('hexagrammic')) return 'fa-star-of-david';
        return 'fa-wrench';
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [...((Object.getOwnPropertyDescriptor(PhysicalItemTemplate.prototype, 'chatProperties')?.get?.call(this) as string[]) ?? [])];

        // Restrictions
        props.push(this.restrictionsLabelEnhanced);

        // Modifiers
        if (this.hasModifiers) {
            props.push(this.modifierSummary);
        }

        // Properties
        if (this.propertiesSummary) {
            props.push(this.propertiesSummary);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            restrictions: this.restrictionsLabelEnhanced,
            modifiers: this.modifierSummary,
            properties: this.propertiesSummary,
        };
    }
}
