import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import EquippableTemplate from '../shared/equippable-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';
import { bodyLocationsSchema } from '../shared/body-locations.ts';
import { inferActiveGameLine, resolveLineVariant } from '../../utils/item-variant-utils.ts';

/**
 * Data model for Armour items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 */
export default class ArmourData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate, EquippableTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare type: string;
    declare armourPoints: { head: number; leftArm: number; rightArm: number; body: number; leftLeg: number; rightLeg: number };
    declare coverage: Set<string>;
    declare maxAgility: number | null;
    declare properties: Set<string>;
    declare primitive: boolean;
    declare notes: string;
    declare modifications: Array<{
        uuid: string;
        name: string;
        active: boolean;
        cachedModifiers: { armourPoints: number; maxAgility: number };
    }>;
    declare modificationSlots: number;
    // Added missing properties
    declare craftsmanship: string;
    declare equipped: boolean;

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Normalize armour data shape.
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
        if (!source.properties) {
            source.properties = [];
        }
        if (Array.isArray(source.coverage)) {
            source.coverage = new Set(source.coverage);
        }
        if (Array.isArray(source.properties)) {
            source.properties = new Set(source.properties);
        }
    }

    static #inferCoverageFromArmourPoints(armourPoints: Record<string, unknown> | undefined): Set<string> {
        if (!armourPoints || typeof armourPoints !== 'object') return new Set();

        return new Set(
            Object.entries(armourPoints)
                .filter(([, value]) => typeof value === 'number' && value > 0)
                .map(([location]) => location),
        );
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean armour data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    static _cleanData(source: Record<string, unknown> | undefined, options: Record<string, unknown>): void {
        super._cleanData?.(source, options);
        // Note: Set to Array conversion is handled by Foundry's SetField
    }

    /* -------------------------------------------- */
    /*  Data Validation                             */
    /* -------------------------------------------- */

    /**
     * Validate armour data.
     * @param {object} data  The data to validate
     * @protected
     */
    static _validateJoint(data: Record<string, unknown>): void {
        super._validateJoint?.(data);

        const lineKey = inferActiveGameLine(data);
        const armourPoints = resolveLineVariant(data.armourPoints as Record<string, unknown>, lineKey) as Record<string, number> | undefined;
        const coverageValue = resolveLineVariant(data.coverage as Record<string, unknown>, lineKey);
        const maxAgility = resolveLineVariant(data.maxAgility as Record<string, unknown>, lineKey) as number | null | undefined;

        // Validate AP values (0-20 reasonable range)
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
        for (const loc of locations) {
            const ap = armourPoints?.[loc];
            if (ap !== undefined && (ap < 0 || ap > 20)) {
                throw new Error(`Armour point value for ${loc} must be between 0 and 20`);
            }
        }

        // Validate coverage is not empty. Coverage may be a Set (in-memory) or
        // an object map {head:true,...} (current homologated shape).
        let coverage: Set<string>;
        if (coverageValue instanceof Set) {
            coverage = coverageValue;
        } else if (coverageValue && typeof coverageValue === 'object') {
            coverage = new Set(Object.keys(coverageValue).filter((k) => (coverageValue as Record<string, unknown>)[k]));
        } else {
            coverage = new Set();
        }

        if (coverage.size === 0) {
            coverage = ArmourData.#inferCoverageFromArmourPoints(armourPoints);
        }
        if (coverage.size === 0) {
            throw new Error('Armour must cover at least one location');
        }

        // Validate maxAgility
        if (maxAgility !== null && maxAgility !== undefined) {
            if (maxAgility < 0 || maxAgility > 100) {
                throw new Error('Max Agility must be between 0 and 100');
            }
        }
    }

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;

        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }) as foundry.data.fields.DataField.Any,

            // Armour classification
            type: new fields.StringField({
                required: true,
                initial: 'flak',
                choices: [
                    'flak',
                    'mesh',
                    'carapace',
                    'power',
                    'light-power',
                    'storm-trooper',
                    'feudal-world',
                    'primitive',
                    'xenos',
                    'void',
                    'enforcer',
                    'hostile-environment',
                ],
            }),

            // Armour points per location
            armourPoints: bodyLocationsSchema(),

            // Coverage - which locations does this cover?
            coverage: new fields.SetField(
                new fields.StringField({
                    required: true,
                    choices: ['head', 'leftArm', 'rightArm', 'body', 'leftLeg', 'rightLeg', 'all'],
                }),
                { required: true, initial: ['body'] },
            ),

            // Maximum agility bonus while wearing
            maxAgility: new fields.NumberField({ required: false, nullable: true, min: 0 }),

            // Special properties
            properties: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: [] }),

            // Primitive armour flag
            primitive: new fields.BooleanField({ required: true, initial: false }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),

            // Modifications
            modifications: new fields.ArrayField(
                new fields.SchemaField({
                    uuid: new fields.StringField({ required: true }),
                    name: new fields.StringField({ required: true }),
                    active: new fields.BooleanField({ required: true, initial: true }),
                    cachedModifiers: new fields.SchemaField({
                        armourPoints: new fields.NumberField({ required: false, integer: true }),
                        maxAgility: new fields.NumberField({ required: false, integer: true }),
                    }),
                }),
                { required: true, initial: [] },
            ),

            // Number of modification slots
            modificationSlots: new fields.NumberField({ required: true, initial: 2, min: 0, max: 10, integer: true }),
        };
    }

    /** @inheritdoc */
    prepareBaseData(): void {
        super.prepareBaseData();

        const lineKey = inferActiveGameLine(this.parent?._source?.system ?? {}, this.parent);
        this.type = (resolveLineVariant(this.type, lineKey) as string) ?? 'flak';
        this.armourPoints = foundry.utils.mergeObject(
            {
                head: 0,
                leftArm: 0,
                rightArm: 0,
                body: 0,
                leftLeg: 0,
                rightLeg: 0,
            },
            (resolveLineVariant(this.armourPoints, lineKey) as Record<string, unknown>) ?? {},
            { inplace: false },
        ) as typeof this.armourPoints;

        const resolvedCoverage = resolveLineVariant(this.coverage as unknown, lineKey);
        this.coverage = new Set(Array.isArray(resolvedCoverage) ? resolvedCoverage : Array.from((resolvedCoverage as Set<string>) ?? new Set(['body'])));

        this.maxAgility = (resolveLineVariant(this.maxAgility as unknown, lineKey) as number | null) ?? null;

        const resolvedProperties = resolveLineVariant(this.properties as unknown, lineKey);
        this.properties = new Set(Array.isArray(resolvedProperties) ? resolvedProperties : Array.from((resolvedProperties as Set<string>) ?? new Set()));

        this.primitive = Boolean(resolveLineVariant(this.primitive as unknown, lineKey));
        this.notes = (resolveLineVariant(this.notes as unknown, lineKey) as string) ?? '';
        this.modificationSlots = Number(resolveLineVariant(this.modificationSlots as unknown, lineKey) ?? 2);
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the armour type label.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get typeLabel(): string {
        return game.i18n.localize(
            `WH40K.ArmourType.${this.type
                .split('-')
                .map((s) => s.capitalize())
                .join('')}`,
        );
    }

    /**
     * Does this cover all locations?
     * @scripts/gen-i18n-types.mjs {boolean}
     */
    get coversAll() {
        return this.coverage.has('all');
    }

    /**
     * Get human-readable coverage description.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get coverageLabel(): string {
        const coverage = this._getEffectiveCoverage();
        if (coverage.has('all')) return game.i18n.localize('WH40K.Coverage.All');

        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        const covered = locations.filter((loc) => coverage.has(loc));

        if (covered.length === 0) return game.i18n.localize('WH40K.Coverage.None');
        if (covered.length === 6) return game.i18n.localize('WH40K.Coverage.All');

        // Check for symmetrical coverage
        const hasArms = covered.includes('leftArm') && covered.includes('rightArm');
        const hasLegs = covered.includes('leftLeg') && covered.includes('rightLeg');

        const parts = [];
        if (covered.includes('head')) parts.push('Head');
        if (covered.includes('body')) parts.push('Body');
        if (hasArms) parts.push('Arms');
        else {
            if (covered.includes('leftArm')) parts.push('L.Arm');
            if (covered.includes('rightArm')) parts.push('R.Arm');
        }
        if (hasLegs) parts.push('Legs');
        else {
            if (covered.includes('leftLeg')) parts.push('L.Leg');
            if (covered.includes('rightLeg')) parts.push('R.Leg');
        }

        return parts.join(', ');
    }

    /**
     * Get coverage as icon string for compact display.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get coverageIcons(): string {
        const coverage = this._getEffectiveCoverage();
        if (coverage.has('all')) return '●●●●●●';

        const icons = [];
        if (coverage.has('head')) icons.push('●');
        else icons.push('○');
        if (coverage.has('body')) icons.push('●');
        else icons.push('○');
        if (coverage.has('leftArm') || coverage.has('rightArm')) icons.push('●');
        else icons.push('○');
        if (coverage.has('leftLeg') || coverage.has('rightLeg')) icons.push('●');
        else icons.push('○');

        return icons.join('');
    }

    /**
     * Get available special properties.
     * @scripts/gen-i18n-types.mjs {string[]}
     */
    static get AVAILABLE_PROPERTIES() {
        return ['sealed', 'auto-stabilized', 'hexagrammic', 'blessed', 'camouflage', 'lightweight', 'reinforced', 'agility-bonus', 'strength-bonus'];
    }

    /**
     * Get properties as localized labels array.
     * @scripts/gen-i18n-types.mjs {string[]}
     */
    get propertyLabels() {
        return Array.from(this.properties).map((prop) =>
            game.i18n.localize(
                `WH40K.ArmourProperty.${prop
                    .split('-')
                    .map((s) => s.capitalize())
                    .join('')}`,
            ),
        );
    }

    _getEffectiveCoverage(): Set<string> {
        const inferred = new Set<string>();
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        for (const location of locations) {
            if (Number(this.armourPoints?.[location]) > 0) {
                inferred.add(location);
            }
        }
        if (inferred.size) return inferred;

        return this.coverage ?? new Set();
    }

    /**
     * Get the AP value for a specific location.
     * @param {string} location   The body location.
     * @returns {number}
     */
    getAPForLocation(location: keyof typeof this.armourPoints): number {
        const coverage = this._getEffectiveCoverage();
        if (coverage.has('all')) return this.armourPoints[location] ?? 0;
        if (coverage.size && !coverage.has(location)) return 0;
        return this.armourPoints[location] ?? 0;
    }

    /**
     * Get a summary of AP by location.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get apSummary(): string {
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
        const abbrs = { head: 'H', body: 'B', leftArm: 'LA', rightArm: 'RA', leftLeg: 'LL', rightLeg: 'RL' };
        const coverage = this._getEffectiveCoverage();
        const coveredLocations = coverage.has('all') || !coverage.size ? locations : locations.filter((loc) => coverage.has(loc));

        const values = coveredLocations.map((loc) => this.getEffectiveAPForLocation(loc));
        const same = values.length && values.every((value) => value === values[0]);
        if (same && coveredLocations.length === locations.length) {
            return `All: ${values[0]}`;
        }

        return coveredLocations.map((loc) => `${abbrs[loc as keyof typeof abbrs]}: ${this.getEffectiveAPForLocation(loc)}`).join(', ');
    }

    /**
     * How many modification slots are available?
     * @scripts/gen-i18n-types.mjs {number}
     */
    get availableModSlots() {
        return this.modificationSlots - this.modifications.length;
    }

    /* -------------------------------------------- */
    /*  Display Properties                          */
    /* -------------------------------------------- */

    /**
     * Get icon class for armour type.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get typeIcon() {
        const icons: Record<string, string> = {
            'flak': 'fa-shield',
            'mesh': 'fa-vest',
            'carapace': 'fa-shield-halved',
            'power': 'fa-robot',
            'light-power': 'fa-shield-virus',
            'storm-trooper': 'fa-helmet-battle',
            'feudal-world': 'fa-chess-knight',
            'primitive': 'fa-shirt',
            'xenos': 'fa-alien',
            'void': 'fa-helmet-safety',
            'enforcer': 'fa-user-shield',
            'hostile-environment': 'fa-mask-ventilator',
        };
        // Cast this.type to keyof typeof icons to satisfy TypeScript if type is not directly assignable
        return icons[this.type as keyof typeof icons] ?? 'fa-shield-halved';
    }

    /**
     * Get protection level category for styling.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get protectionLevel(): string {
        const avgAP = this.averageAP;
        if (avgAP === 0) return 'none';
        if (avgAP <= 2) return 'light';
        if (avgAP <= 5) return 'medium';
        if (avgAP <= 8) return 'heavy';
        return 'power';
    }

    /**
     * Get average armour points across all covered locations.
     * @scripts/gen-i18n-types.mjs {number}
     */
    get averageAP(): number {
        const coverage = this._getEffectiveCoverage();
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        const coveredLocs = coverage.has('all') ? locations : locations.filter((loc) => coverage.has(loc));

        if (coveredLocs.length === 0) return 0;

        const total = coveredLocs.reduce((sum, loc) => sum + this.getEffectiveAPForLocation(loc as keyof typeof this.armourPoints), 0);
        return Math.round(total / coveredLocs.length);
    }

    /**
     * Get max armour points across all locations.
     * @scripts/gen-i18n-types.mjs {number}
     */
    get maxAP(): number {
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        return Math.max(...locations.map((loc) => this.getEffectiveAPForLocation(loc as keyof typeof this.armourPoints)));
    }

    /**
     * Get max base armour points across all locations (before modifications).
     * @scripts/gen-i18n-types.mjs {number}
     */
    get maxBaseAP(): number {
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        return Math.max(...locations.map((loc) => this.getAPForLocation(loc as keyof typeof this.armourPoints)));
    }

    /**
     * Get the count of locations with AP > 0.
     * @scripts/gen-i18n-types.mjs {number}
     */
    get locationCount() {
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        return locations.filter((loc) => this.getAPForLocation(loc as keyof typeof this.armourPoints) > 0).length;
    }

    /**
     * Get armour points as an array of location objects for visual display.
     * @scripts/gen-i18n-types.mjs {Array<{location: string, label: string, abbr: string, ap: number, covered: boolean, icon: string}>}
     */
    get locationArray() {
        const locations = [
            { location: 'head', label: 'Head', abbr: 'H', icon: 'fa-head-side' },
            { location: 'body', label: 'Body', abbr: 'B', icon: 'fa-person' },
            { location: 'leftArm', label: 'Left Arm', abbr: 'LA', icon: 'fa-hand' },
            { location: 'rightArm', label: 'Right Arm', abbr: 'RA', icon: 'fa-hand' },
            { location: 'leftLeg', label: 'Left Leg', abbr: 'LL', icon: 'fa-socks' },
            { location: 'rightLeg', label: 'Right Leg', abbr: 'RL', icon: 'fa-socks' },
        ];

        const coverage = this._getEffectiveCoverage();
        const coversAll = coverage.has('all');

        return locations.map((loc) => ({
            ...loc,
            ap: this.getEffectiveAPForLocation(loc.location as keyof typeof this.armourPoints),
            covered: coversAll || coverage.has(loc.location),
        }));
    }

    /**
     * Get properties as array of objects with labels and descriptions.
     * @scripts/gen-i18n-types.mjs {Array<{id: string, label: string, description: string}>}
     */
    get propertiesArray() {
        const props = [];
        const config = CONFIG.WH40K?.armourProperties ?? {};

        for (const propId of this.properties) {
            // Convert kebab-case to PascalCase for i18n lookup
            const pascalCase = propId
                .split('-')
                .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                .join('');

            props.push({
                id: propId,
                label: config[propId]?.label
                    ? game.i18n.localize(config[propId].label)
                    : game.i18n.localize(`WH40K.ArmourProperty.${pascalCase}`) || propId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
                description: config[propId]?.description
                    ? game.i18n.localize(config[propId].description)
                    : game.i18n.localize(`WH40K.ArmourProperty.${pascalCase}Desc`) || '',
            });
        }

        return props;
    }

    /**
     * Get a compact summary string for compendium/list display.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get compendiumSummary() {
        const parts = [];
        parts.push(`AP ${this.maxAP}`);
        parts.push(this.coverageLabel);
        if (this.maxAgility !== null) parts.push(`Max Ag ${this.maxAgility}`);
        return parts.join(' • ');
    }

    /**
     * Get full stat line for display.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get statLine() {
        const parts = [];
        parts.push(this.typeLabel);
        parts.push(`AP: ${this.apSummary}`);
        parts.push(`Coverage: ${this.coverageLabel}`);
        if (this.maxAgility !== null) parts.push(`Max Ag: ${this.maxAgility}`);
        if (this.properties.size) parts.push(`Props: ${this.properties.size}`);
        return parts.join(' | ');
    }

    /**
     * Get craftsmanship label.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get craftsmanshipLabel(): string {
        const craft = this.craftsmanship ?? 'common';
        return game.i18n.localize(`WH40K.Craftsmanship.${craft.charAt(0).toUpperCase() + craft.slice(1)}`);
    }

    /**
     * Get craftsmanship-derived modifiers for armour.
     * Applies WH40K RPG armour craftsmanship rules:
     *
     * ARMOUR:
     * - Poor: -10 to Agility tests
     * - Good: +1 AP on first attack each round
     * - Best: Half weight, +1 AP (permanent)
     *
     * @scripts/gen-i18n-types.mjs {object}
     */
    get craftsmanshipModifiers() {
        const mods = {
            agility: 0, // Agility test modifier
            armourBonus: 0, // Permanent AP bonus (Best only)
            weight: 1.0, // Weight multiplier
            firstAttackBonus: 0, // AP bonus on first attack (Good only)
        };

        switch (this.craftsmanship) {
            case 'poor':
                mods.agility = -10; // -10 to Agility tests
                break;
            case 'good':
                mods.firstAttackBonus = 1; // +1 AP on first attack per round
                break;
            case 'best':
                mods.armourBonus = 1; // +1 AP permanent
                mods.weight = 0.5; // Half weight
                break;
        }

        return mods;
    }

    /**
     * Get effective armour points for a location, including craftsmanship bonus.
     * @param {string} location - The body location
     * @returns {number} - Effective AP value
     */
    getEffectiveAPForLocation(location: keyof typeof this.armourPoints): number {
        const baseAP = this.getAPForLocation(location);
        const craftMods = this.craftsmanshipModifiers;

        // Best craftsmanship adds +1 AP permanently
        return baseAP + craftMods.armourBonus;
    }

    /**
     * Get effective AP against a specific weapon.
     * Primitive armour has halved AP (round up) vs non-primitive weapons.
     * @param {string} location - Body location
     * @param {object} [weapon] - Optional weapon data model
     * @returns {number} - Effective AP value
     */
    getEffectiveAPAgainstWeapon(location: keyof typeof this.armourPoints, weapon: ArmourData | null = null): number {
        let ap = this.getEffectiveAPForLocation(location);

        // Primitive armour vs non-primitive weapon: halve AP (round up)
        if (this.primitive && weapon && !weapon.primitive) {
            ap = Math.ceil((ap as unknown as number) / 2); // TS2352 fix
        }

        return ap;
    }

    /**
     * Get effective weight including craftsmanship modifier.
     * @scripts/gen-i18n-types.mjs {number}
     */
    get effectiveWeight(): number {
        const craftMods = this.craftsmanshipModifiers;
        return Math.round(this.weight * craftMods.weight * 10) / 10; // Round to 1 decimal
    }

    /**
     * Check if armour has craftsmanship-derived effects.
     * @scripts/gen-i18n-types.mjs {boolean}
     */
    get hasCraftsmanshipEffects() {
        const craft = this.craftsmanship ?? 'common';
        return craft !== 'common';
    }

    /**
     * Check if armour is heavy enough to impose stealth penalties.
     * Any location with AP > 7 causes -30 to Concealment/Silent Move.
     * @scripts/gen-i18n-types.mjs {boolean}
     */
    get imposesStealthPenalty() {
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        return locations.some((loc) => this.getEffectiveAPForLocation(loc as keyof typeof this.armourPoints) > 7);
    }

    /**
     * Get the stealth penalty value (0 or -30).
     * @scripts/gen-i18n-types.mjs {number}
     */
    get stealthPenalty() {
        return this.imposesStealthPenalty ? -30 : 0;
    }

    /**
     * Check if this armour has any special properties.
     * @scripts/gen-i18n-types.mjs {boolean}
     */
    get hasProperties(): boolean {
        return this.properties.size > 0;
    }

    /**
     * Check if armour is currently equipped.
     * @scripts/gen-i18n-types.mjs {boolean}
     */
    get isWorn(): boolean {
        return this.equipped === true;
    }

    /**
     * Get weight display string.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get weightLabel() {
        return this.weight ? `${this.effectiveWeight} kg` : '-';
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get chatProperties(): string[] {
        // TS2339 fix: Property 'call' does not exist on type 'string[]'.
        // This assumes PhysicalItemTemplate.prototype.chatProperties is a string array,
        // and the .call(this) was a misunderstanding.
        const props = [...PhysicalItemTemplate.prototype.chatProperties];

        props.unshift(this.typeLabel);
        props.push(`AP: ${this.apSummary}`);
        props.push(`Coverage: ${this.coverageLabel}`);

        if (this.maxAgility !== null) {
            props.push(`Max Ag: ${this.maxAgility}`);
        }

        if (this.properties.size) {
            props.push(`Properties: ${this.propertyLabels.join(', ')}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            type: this.typeLabel,
            ap: this.apSummary,
            coverage: this.coverageLabel,
            maxAg: this.maxAgility ?? '-',
        };
    }
}
