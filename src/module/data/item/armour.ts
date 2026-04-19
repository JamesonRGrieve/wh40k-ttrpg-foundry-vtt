import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import EquippableTemplate from '../shared/equippable-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';
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

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate armour data.
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
        ArmourData.#migrateArmourPoints(source);
        ArmourData.#migrateCoverage(source);
        ArmourData.#migrateMaxAgility(source);
        ArmourData.#migrateWeight(source);
        ArmourData.#migrateProperties(source);
        ArmourData.#migrateCollections(source);
    }

    /**
     * Migrate `ap` → `armourPoints`.
     * @param {object} source  The source data
     */
    static #migrateArmourPoints(source: Record<string, unknown>): void {
        if (source.ap !== undefined && !ArmourData.#hasCustomArmourPoints(source)) {
            const parsed = ArmourData.#parseLegacyAP(source);
            if (parsed?.pointsByLocation) {
                source.armourPoints = parsed.pointsByLocation;
            } else if (parsed?.defaultValue !== undefined) {
                const ap = parsed.defaultValue;
                source.armourPoints = {
                    head: ap,
                    body: ap,
                    leftArm: ap,
                    rightArm: ap,
                    leftLeg: ap,
                    rightLeg: ap,
                };
            } else if (parsed?.special) {
                source.armourPoints = {
                    head: 0,
                    body: 0,
                    leftArm: 0,
                    rightArm: 0,
                    leftLeg: 0,
                    rightLeg: 0,
                };
                const specialNote = typeof source.ap === 'string' ? source.ap : 'Special';
                source.notes = `${source.notes || ''} [AP: ${specialNote}]`.trim();
            }
        }
    }

    /**
     * Migrate `locations` → `coverage`.
     * @param {object} source  The source data
     */
    static #migrateCoverage(source: Record<string, unknown>): void {
        if (typeof source.locations === 'string' && !source.coverage) {
            const parsed = ArmourData.#parseLegacyLocations(source);
            if (parsed?.size) {
                source.coverage = Array.from(parsed);
            }
        }
    }

    /**
     * Migrate `maxAg` string → `maxAgility` number.
     * @param {object} source  The source data
     */
    static #migrateMaxAgility(source: Record<string, unknown>): void {
        if (source.maxAg !== undefined && source.maxAgility === undefined) {
            if (source.maxAg === '-' || source.maxAg === '' || source.maxAg === null) {
                source.maxAgility = null;
            } else {
                const parsed = parseInt(source.maxAg);
                if (!isNaN(parsed)) source.maxAgility = parsed;
            }
        }
    }

    /**
     * Clean weight (remove "kg" suffix).
     * @param {object} source  The source data
     */
    static #migrateWeight(source: Record<string, unknown>): void {
        if (typeof source.weight === 'string') {
            const cleaned = parseFloat(source.weight.replace(/[^\d.]/g, ''));
            if (!isNaN(cleaned)) source.weight = cleaned;
        }
    }

    /**
     * Ensure properties exists.
     * @param {object} source  The source data
     */
    static #migrateProperties(source: Record<string, unknown>): void {
        if (!source.properties) {
            source.properties = [];
        }
    }

    /**
     * Convert arrays to Sets for V13.
     * @param {object} source  The source data
     */
    static #migrateCollections(source: Record<string, unknown>): void {
        if (Array.isArray(source.coverage)) {
            source.coverage = new Set(source.coverage);
        }
        if (Array.isArray(source.properties)) {
            source.properties = new Set(source.properties);
        }
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
    static _cleanData(source: Record<string, unknown> | undefined, options): void {
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

        // Validate AP values (0-20 reasonable range)
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        for (const loc of locations) {
            const ap = data.armourPoints?.[loc];
            if (ap !== undefined && (ap < 0 || ap > 20)) {
                throw new Error(`Armour point value for ${loc} must be between 0 and 20`);
            }
        }

        // Validate coverage is not empty
        const coverage = data.coverage instanceof Set ? data.coverage : new Set(data.coverage || []);
        if (coverage.size === 0) {
            throw new Error('Armour must cover at least one location');
        }

        // Validate maxAgility
        if (data.maxAgility !== null && data.maxAgility !== undefined) {
            if (data.maxAgility < 0 || data.maxAgility > 100) {
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

            // @ts-expect-error - argument count
            identifier: new IdentifierField({ required: true, blank: true }),

            // Armour classification
            type: new fields.ObjectField({ required: true, initial: 'flak' }),

            // Armour points per location
            armourPoints: new fields.ObjectField({
                required: true,
                initial: {
                    head: 0,
                    leftArm: 0,
                    rightArm: 0,
                    body: 0,
                    leftLeg: 0,
                    rightLeg: 0,
                },
            }),

            // Coverage - which locations does this cover?
            coverage: new fields.ObjectField({ required: true, initial: ['body'] }),

            // Maximum agility bonus while wearing
            maxAgility: new fields.ObjectField({ required: false, initial: null }),

            // Special properties
            properties: new fields.ObjectField({ required: true, initial: [] }),

            // Primitive armour flag
            primitive: new fields.ObjectField({ required: true, initial: false }),

            // Notes
            notes: new fields.ObjectField({ required: false, initial: '' }),

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
            modificationSlots: new fields.ObjectField({ required: true, initial: 2 }),
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
     * @type {string}
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
     * @type {boolean}
     */
    get coversAll() {
        return this.coverage.has('all');
    }

    /**
     * Get human-readable coverage description.
     * @type {string}
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
     * @type {string}
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
     * @type {string[]}
     */
    static get AVAILABLE_PROPERTIES() {
        return ['sealed', 'auto-stabilized', 'hexagrammic', 'blessed', 'camouflage', 'lightweight', 'reinforced', 'agility-bonus', 'strength-bonus'];
    }

    /**
     * Get properties as localized labels array.
     * @type {string[]}
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

    _getLegacyField(field): any {
        return this.parent?._source?.system?.[field];
    }

    /**
     * Check if armour has custom armour points.
     * @param {object} source Source data to check
     * @returns {boolean}
     */
    static #hasCustomArmourPoints(source: Record<string, unknown>): boolean {
        return Object.values(source.armourPoints ?? {}).some((value) => Number(value) > 0);
    }

    _hasCustomArmourPoints(): any {
        return Object.values(this.armourPoints ?? {}).some((value) => Number(value) > 0);
    }

    /**
     * Parse legacy locations field.
     * @param {object} source Source data
     * @returns {Set|null}
     */
    static #parseLegacyLocations(source: Record<string, unknown>): Set<string> | null {
        const rawLocations = source.locations;
        if (!rawLocations || typeof rawLocations !== 'string') return null;

        const normalized = rawLocations.toLowerCase();
        if (normalized.includes('all')) {
            return new Set(['all']);
        }

        const coverage = new Set<string>();
        const tokens = normalized
            .split(',')
            .map((token) => token.trim())
            .filter(Boolean);
        for (const token of tokens) {
            if (token.includes('head')) {
                coverage.add('head');
            }
            if (token.includes('body') || token.includes('chest') || token.includes('torso')) {
                coverage.add('body');
            }
            if (token.includes('arm')) {
                coverage.add('leftArm');
                coverage.add('rightArm');
            }
            if (token.includes('leg')) {
                coverage.add('leftLeg');
                coverage.add('rightLeg');
            }
        }

        return coverage.size ? coverage : null;
    }

    _parseLegacyLocations(): any {
        const rawLocations = this._getLegacyField('locations');
        if (!rawLocations || typeof rawLocations !== 'string') return null;

        const normalized = rawLocations.toLowerCase();
        if (normalized.includes('all')) {
            return new Set(['all']);
        }

        const coverage = new Set();
        const tokens = normalized
            .split(',')
            .map((token) => token.trim())
            .filter(Boolean);
        for (const token of tokens) {
            if (token.includes('head')) {
                coverage.add('head');
            }
            if (token.includes('body') || token.includes('chest') || token.includes('torso')) {
                coverage.add('body');
            }
            if (token.includes('arm')) {
                coverage.add('leftArm');
                coverage.add('rightArm');
            }
            if (token.includes('leg')) {
                coverage.add('leftLeg');
                coverage.add('rightLeg');
            }
        }

        return coverage.size ? coverage : null;
    }

    /**
     * Parse legacy AP field.
     * @param {object} source Source data
     * @returns {object|null}
     */
    static #parseLegacyAP(source: Record<string, unknown>): any {
        const rawAp = source.ap;
        if (rawAp === null || rawAp === undefined) return null;

        // Handle "Special" or narrative AP
        if (rawAp === 'Special' || (typeof rawAp === 'string' && rawAp.toLowerCase().includes('psy'))) {
            return { special: true };
        }

        // Handle percentage (force fields)
        if (typeof rawAp === 'string' && rawAp.includes('%')) {
            const percent = parseFloat(rawAp) / 100;
            return { special: true, percentage: percent };
        }

        // Handle decimal (force fields as decimal)
        if (typeof rawAp === 'number' && rawAp < 1 && rawAp > 0) {
            return { special: true, percentage: rawAp };
        }

        // Handle single number
        if (typeof rawAp === 'number') {
            return { defaultValue: rawAp };
        }

        if (typeof rawAp !== 'string') {
            return null;
        }

        // Try to parse as single number
        const values = rawAp.match(/-?\d+(?:\.\d+)?/g);
        if (!values) return null;

        const parsed = values.map((value) => Number(value));
        if (parsed.length === 1) {
            return { defaultValue: parsed[0] };
        }

        // Handle pattern "H/B/A/L"
        if (parsed.length === 4) {
            return {
                pointsByLocation: {
                    head: parsed[0],
                    body: parsed[1],
                    leftArm: parsed[2],
                    rightArm: parsed[2],
                    leftLeg: parsed[3],
                    rightLeg: parsed[3],
                },
            };
        }

        return null;
    }

    _parseLegacyAP(): any {
        const rawAp = this._getLegacyField('ap');
        if (rawAp === null || rawAp === undefined) return null;

        if (typeof rawAp === 'number') {
            return { defaultValue: rawAp };
        }

        if (typeof rawAp !== 'string') {
            return null;
        }

        const values = rawAp.match(/-?\d+(?:\.\d+)?/g);
        if (!values) return null;

        const parsed = values.map((value) => Number(value));
        if (parsed.length === 1) {
            return { defaultValue: parsed[0] };
        }

        if (parsed.length === 4) {
            return {
                pointsByLocation: {
                    head: parsed[0],
                    body: parsed[1],
                    leftArm: parsed[2],
                    rightArm: parsed[2],
                    leftLeg: parsed[3],
                    rightLeg: parsed[3],
                },
            };
        }

        return null;
    }

    _getLegacyArmourProfile(): any {
        const ap = this._parseLegacyAP();
        if (!ap) return null;

        return {
            coverage: this._parseLegacyLocations(),
            ...ap,
        };
    }

    _getEffectiveCoverage(): any {
        if (!this._hasCustomArmourPoints()) {
            const legacyCoverage = this._parseLegacyLocations();
            if (legacyCoverage?.size) return legacyCoverage;
        }

        const inferred = new Set();
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
    getAPForLocation(location): number {
        if (!this._hasCustomArmourPoints()) {
            const legacy = this._getLegacyArmourProfile();
            if (legacy) {
                if (legacy.coverage && !legacy.coverage.has('all') && !legacy.coverage.has(location)) {
                    return 0;
                }
                if (legacy.pointsByLocation) {
                    return legacy.pointsByLocation[location] ?? 0;
                }
                return legacy.defaultValue ?? 0;
            }
        }

        const coverage = this._getEffectiveCoverage();
        if (coverage.has('all')) return this.armourPoints[location] ?? 0;
        if (coverage.size && !coverage.has(location)) return 0;
        return this.armourPoints[location] ?? 0;
    }

    /**
     * Get a summary of AP by location.
     * @type {string}
     */
    get apSummary(): string {
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        const abbrs = { head: 'H', body: 'B', leftArm: 'LA', rightArm: 'RA', leftLeg: 'LL', rightLeg: 'RL' };
        const coverage = this._getEffectiveCoverage();
        const coveredLocations = coverage.has('all') || !coverage.size ? locations : locations.filter((loc) => coverage.has(loc));

        const values = coveredLocations.map((loc) => this.getEffectiveAPForLocation(loc));
        const same = values.length && values.every((value) => value === values[0]);
        if (same && coveredLocations.length === locations.length) {
            return `All: ${values[0]}`;
        }

        return coveredLocations.map((loc) => `${abbrs[loc]}: ${this.getEffectiveAPForLocation(loc)}`).join(', ');
    }

    /**
     * How many modification slots are available?
     * @type {number}
     */
    get availableModSlots() {
        return this.modificationSlots - this.modifications.length;
    }

    /* -------------------------------------------- */
    /*  Display Properties                          */
    /* -------------------------------------------- */

    /**
     * Get icon class for armour type.
     * @type {string}
     */
    get typeIcon() {
        const icons = {
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
        return icons[this.type] ?? 'fa-shield-halved';
    }

    /**
     * Get protection level category for styling.
     * @type {string}
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
     * @type {number}
     */
    get averageAP(): number {
        const coverage = this._getEffectiveCoverage();
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        const coveredLocs = coverage.has('all') ? locations : locations.filter((loc) => coverage.has(loc));

        if (coveredLocs.length === 0) return 0;

        const total = coveredLocs.reduce((sum, loc) => sum + this.getEffectiveAPForLocation(loc), 0);
        return Math.round(total / coveredLocs.length);
    }

    /**
     * Get max armour points across all locations.
     * @type {number}
     */
    get maxAP(): number {
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        return Math.max(...locations.map((loc) => this.getEffectiveAPForLocation(loc)));
    }

    /**
     * Get max base armour points across all locations (before modifications).
     * @type {number}
     */
    get maxBaseAP(): number {
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        return Math.max(...locations.map((loc) => this.getAPForLocation(loc)));
    }

    /**
     * Get the count of locations with AP > 0.
     * @type {number}
     */
    get locationCount() {
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        return locations.filter((loc) => this.getAPForLocation(loc) > 0).length;
    }

    /**
     * Get armour points as an array of location objects for visual display.
     * @type {Array<{location: string, label: string, abbr: string, ap: number, covered: boolean, icon: string}>}
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
            ap: this.getEffectiveAPForLocation(loc.location),
            covered: coversAll || coverage.has(loc.location),
        }));
    }

    /**
     * Get properties as array of objects with labels and descriptions.
     * @type {Array<{id: string, label: string, description: string}>}
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
     * @type {string}
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
     * @type {string}
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
     * @type {string}
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
     * @type {object}
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
    getEffectiveAPForLocation(location): any {
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
    getEffectiveAPAgainstWeapon(location, weapon = null): any {
        let ap = this.getEffectiveAPForLocation(location);

        // Primitive armour vs non-primitive weapon: halve AP (round up)
        if (this.primitive && weapon && !weapon.primitive) {
            ap = Math.ceil(ap / 2);
        }

        return ap;
    }

    /**
     * Get effective weight including craftsmanship modifier.
     * @type {number}
     */
    get effectiveWeight(): number {
        const craftMods = this.craftsmanshipModifiers;
        return Math.round(this.weight * craftMods.weight * 10) / 10; // Round to 1 decimal
    }

    /**
     * Check if armour has craftsmanship-derived effects.
     * @type {boolean}
     */
    get hasCraftsmanshipEffects() {
        const craft = this.craftsmanship ?? 'common';
        return craft !== 'common';
    }

    /**
     * Check if armour is heavy enough to impose stealth penalties.
     * Any location with AP > 7 causes -30 to Concealment/Silent Move.
     * @type {boolean}
     */
    get imposesStealthPenalty() {
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        return locations.some((loc) => this.getEffectiveAPForLocation(loc) > 7);
    }

    /**
     * Get the stealth penalty value (0 or -30).
     * @type {number}
     */
    get stealthPenalty() {
        return this.imposesStealthPenalty ? -30 : 0;
    }

    /**
     * Check if this armour has any special properties.
     * @type {boolean}
     */
    get hasProperties(): boolean {
        return this.properties.size > 0;
    }

    /**
     * Check if armour is currently equipped.
     * @type {boolean}
     */
    get isWorn(): boolean {
        return this.equipped === true;
    }

    /**
     * Get weight display string.
     * @type {string}
     */
    get weightLabel() {
        return this.weight ? `${this.effectiveWeight} kg` : '-';
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        // @ts-expect-error - TS2339
        const props = [...PhysicalItemTemplate.prototype.chatProperties.call(this)];

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

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            type: this.typeLabel,
            ap: this.apSummary,
            coverage: this.coverageLabel,
            maxAg: this.maxAgility ?? '-',
        };
    }
}
