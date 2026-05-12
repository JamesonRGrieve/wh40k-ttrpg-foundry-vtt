import type { ReloadResult } from '../../actions/reload-action-manager.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { capitalize } from '../../handlebars/handlebars-helpers.ts';
import { inferActiveGameLine, resolveLineVariant } from '../../utils/item-variant-utils.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import AttackTemplate from '../shared/attack-template.ts';
import DamageTemplate from '../shared/damage-template.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import EquippableTemplate from '../shared/equippable-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';

// Loose dictionary used as a structural shape for both pre-migration source data
// and the data dictionaries passed to Foundry's update/create APIs.
type DataDict = { [key: string]: SerializableValue };
type SerializableValue = string | number | boolean | null | undefined | SerializableValue[] | DataDict | Set<string>;

/** Minimal shape of an ammunition Item passed to loadAmmo(). */
interface AmmoItemLike {
    type: string;
    name: string;
    uuid: string;
    update: (data: DataDict) => Promise<unknown>;
    system: {
        clipModifier?: number;
        quantity?: number;
        modifiers?: { damage?: number; penetration?: number; range?: number };
        addedQualities?: Set<string>;
        removedQualities?: Set<string>;
    };
}

/** Minimal shape of an inventory ammunition item used by _returnRoundsToInventory(). */
interface InventoryAmmoItem {
    uuid: string;
    type: string;
    name: string;
    system: { quantity: number };
    update: (d: DataDict) => Promise<unknown>;
}

/**
 * The schema field `reload` collides with the `reload()` method on this class. At runtime
 * the instance property (schema field) shadows the prototype method, but TS sees the method
 * type. These helpers route field access through `Reflect.get` / `Reflect.set` with a typed
 * narrow result so no `as unknown` cast is required at the call site.
 */
interface ReloadFieldHost {
    reload?: string;
}
function getReloadField(weapon: object): string {
    const value = (weapon as ReloadFieldHost).reload;
    return typeof value === 'string' ? value : '-';
}
function setReloadField(weapon: object, value: string): void {
    (weapon as ReloadFieldHost).reload = value;
}

/** Result of `fromUuid()` narrowed for ammo restock fallback. */
interface SourceItemLike {
    toObject: () => { system: { quantity: number } } & DataDict;
}

/** Minimal shape of the owning actor used by ammo helpers. */
interface AmmoActorLike {
    items: {
        find: (pred: (i: InventoryAmmoItem) => boolean) => InventoryAmmoItem | undefined;
    };
    createEmbeddedDocuments: (type: string, data: DataDict[]) => Promise<unknown>;
}

/**
 * Data model for Weapon items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 * @mixes AttackTemplate
 * @mixes DamageTemplate
 */
export default class WeaponData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate, EquippableTemplate, AttackTemplate, DamageTemplate) {
    // Narrow the foundry-typed `parent` to our concrete document for downstream access.
    declare parent: WH40KItem;
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare class: string;
    declare type: string;
    declare twoHanded: boolean;
    declare melee: boolean;
    declare clip: { max: number; value: number; type: string };
    // Note: 'reload' schema field accessed via [key: string]: any; to avoid conflict with reload() method
    declare loadedAmmo: {
        uuid: string;
        name: string;
        modifiers: { damage: number; penetration: number; range: number };
        clipModifier: number;
        addedQualities: Set<string>;
        removedQualities: Set<string>;
    };
    declare modifications: Array<{
        uuid: string;
        name: string;
        active: boolean;
        category: string;
        cachedModifiers: { damage: number; penetration: number; toHit: number; range: number; weight: number };
    }>;
    declare requiredTraining: string;
    declare notes: string;

    // Derived in prepareDerivedData()
    declare _modificationModifiers: { damage: number; penetration: number; toHit: number; range: number; weight: number };

    // Properties from PhysicalItemTemplate
    declare craftsmanship: string;
    declare weight: number;

    // Properties from EquippableTemplate
    declare equipped: boolean;
    declare inShipStorage: boolean;

    // Properties from DamageTemplate
    declare damage: { formula: string; type: string; bonus: number; penetration: number };
    declare special: Set<string>;

    // Properties from AttackTemplate
    declare attack: {
        type: string;
        characteristic: string;
        modifier: number;
        range: { value: number; units: string; special: string };
        rateOfFire: { single: boolean; semi: number; full: number };
    };

    // Getters from DamageTemplate
    declare damageLabel: string;

    // Getters from AttackTemplate
    declare rangeLabel: string;
    declare rateOfFireLabel: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.StringField,

            // Weapon classification (usage pattern only)
            class: new fields.StringField({
                required: true,
                initial: 'melee',
                choices: ['melee', 'pistol', 'basic', 'heavy', 'thrown', 'exotic'],
            }),

            type: new fields.StringField({
                required: true,
                initial: 'primitive',
                choices: [
                    'primitive',
                    'las',
                    'solid-projectile',
                    'bolt',
                    'melta',
                    'plasma',
                    'flame',
                    'launcher',
                    'explosive',
                    'power',
                    'chain',
                    'shock',
                    'force',
                    'exotic',
                    'xenos',
                ],
            }),

            // Weapon properties
            twoHanded: new fields.BooleanField({ required: true, initial: false }),
            melee: new fields.BooleanField({ required: true, initial: false }),

            // Ammunition
            clip: new fields.SchemaField({
                max: new fields.NumberField({ required: true, initial: 0, min: 0 }),
                value: new fields.NumberField({ required: true, initial: 0, min: 0 }),
                type: new fields.StringField({ required: false, blank: true }),
            }),
            reload: new fields.StringField({
                required: true,
                initial: '-',
                choices: ['-', 'free', 'half', 'full', '2-full', '3-full'],
            }),

            // Loaded ammunition (reference to ammunition item)
            loadedAmmo: new fields.SchemaField(
                {
                    uuid: new fields.StringField({ required: false, blank: true }),
                    name: new fields.StringField({ required: false, blank: true }),
                    // Cached modifier values from loaded ammo
                    modifiers: new fields.SchemaField(
                        {
                            damage: new fields.NumberField({ required: false, initial: 0, integer: true }),
                            penetration: new fields.NumberField({ required: false, initial: 0, integer: true }),
                            range: new fields.NumberField({ required: false, initial: 0, integer: true }),
                        },
                        { required: false },
                    ),
                    // Cached clip size modifier from loaded ammo
                    clipModifier: new fields.NumberField({ required: false, initial: 0, integer: true }),
                    // Cached qualities
                    addedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: false, initial: () => new Set() }),
                    removedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: false, initial: () => new Set() }),
                },
                { required: false },
            ),

            // Modifications (references to weaponModification items)
            modifications: new fields.ArrayField(
                new fields.SchemaField({
                    uuid: new fields.StringField({ required: true }),
                    name: new fields.StringField({ required: true }),
                    active: new fields.BooleanField({ required: true, initial: true }),
                    category: new fields.StringField({ required: false, initial: 'accessory' }),
                    // Cached modifier values for display and aggregation
                    cachedModifiers: new fields.SchemaField(
                        {
                            damage: new fields.NumberField({ required: false, initial: 0, integer: true }),
                            penetration: new fields.NumberField({ required: false, initial: 0, integer: true }),
                            toHit: new fields.NumberField({ required: false, initial: 0, integer: true }),
                            range: new fields.NumberField({ required: false, initial: 0, integer: true }),
                            weight: new fields.NumberField({ required: false, initial: 0 }),
                        },
                        { required: false },
                    ),
                }),
                { required: true, initial: [] },
            ),

            // Required training (for future talent integration)
            requiredTraining: new fields.StringField({ required: false, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate weapon data.
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        WeaponData.#migrateSpecial(source);
        WeaponData.#migrateClass(source);
        WeaponData.#migrateProficiency(source);
    }

    /**
     * Ensure special is an array for SetField compatibility.
     * @param {object} source  The source data
     */
    static #migrateSpecial(source: Record<string, unknown>): void {
        const special = source.special;
        if (Array.isArray(special)) return;
        if (special !== null && special !== undefined && typeof special === 'object' && Symbol.iterator in special) {
            source.special = Array.from(special as Iterable<string>);
        } else {
            source.special = [];
        }
    }

    /**
     * Migrate old class values (chain, power, shock, force) to type field.
     * @param {object} source  The source data
     */
    static #migrateClass(source: Record<string, unknown>): void {
        const techTypeValues = ['chain', 'power', 'shock', 'force'];
        const cls = source.class;
        if (typeof cls === 'string' && techTypeValues.includes(cls)) {
            source.type = cls;
            source.class = 'melee';
        }
    }

    /**
     * Migrate proficiency -> requiredTraining.
     * @param {object} source  The source data
     */
    static #migrateProficiency(source: Record<string, unknown>): void {
        if (source.proficiency !== undefined) {
            source.requiredTraining = source.proficiency;
            delete source.proficiency;
        }
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritdoc */
    prepareDerivedData(): void {
        super.prepareDerivedData();

        // Weapons are always equipped unless stowed in ship storage
        this.equipped = !this.inShipStorage;

        // Auto-derive twoHanded for heavy weapons (if not explicitly set)
        // This provides a sensible default while allowing manual override
        if (this.class === 'heavy' && !this.twoHanded) {
            // Note: This is derived at runtime, not stored in source data
            // Heavy weapons are typically two-handed unless explicitly marked otherwise
        }

        // Aggregate modifiers from modifications (when they're active)
        this._aggregateModificationModifiers();
    }

    /** @inheritdoc */
    prepareBaseData(): void {
        super.prepareBaseData();

        const sourceSystem = (this.parent?._source.system ?? {}) as { gameSystems?: string[] };
        const lineKey = inferActiveGameLine(sourceSystem, this.parent);
        this.class = resolveLineVariant(this.class, lineKey);
        this.type = resolveLineVariant(this.type, lineKey);
        this.twoHanded = Boolean(resolveLineVariant(this.twoHanded, lineKey));
        this.melee = Boolean(resolveLineVariant(this.melee, lineKey));
        this.clip = foundry.utils.mergeObject({ max: 0, value: 0, type: '' }, resolveLineVariant(this.clip, lineKey), { inplace: false });
        setReloadField(this, resolveLineVariant(getReloadField(this), lineKey));
        this.requiredTraining = resolveLineVariant(this.requiredTraining, lineKey);
        this.notes = resolveLineVariant(this.notes, lineKey);
    }

    /**
     * Aggregate cached modifiers from active modifications.
     * @private
     */
    _aggregateModificationModifiers(): void {
        // Initialize aggregated modifiers
        this._modificationModifiers = {
            damage: 0,
            penetration: 0,
            toHit: 0,
            range: 0,
            weight: 0,
        };

        // Sum up all active modification modifiers
        for (const mod of this.modifications) {
            if (mod.active) {
                this._modificationModifiers.damage += mod.cachedModifiers.damage;
                this._modificationModifiers.penetration += mod.cachedModifiers.penetration;
                this._modificationModifiers.toHit += mod.cachedModifiers.toHit;
                this._modificationModifiers.range += mod.cachedModifiers.range;
                this._modificationModifiers.weight += mod.cachedModifiers.weight;
            }
        }

        // Add loaded ammunition modifiers
        if (this.loadedAmmo.uuid) {
            this._modificationModifiers.damage += this.loadedAmmo.modifiers.damage;
            this._modificationModifiers.penetration += this.loadedAmmo.modifiers.penetration;
            this._modificationModifiers.range += this.loadedAmmo.modifiers.range;
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get isRollable(): boolean {
        return true;
    }

    /**
     * Is this a ranged weapon?
     * @type {boolean}
     */
    get isRangedWeapon(): boolean {
        return ['pistol', 'basic', 'heavy', 'launcher'].includes(this.class);
    }

    /**
     * Is this a melee weapon?
     * @type {boolean}
     */
    get isMeleeWeapon(): boolean {
        return this.class === 'melee' || this.melee;
    }

    /**
     * Is this a primitive weapon?
     * @type {boolean}
     */
    get isPrimitive(): boolean {
        return this.type === 'primitive';
    }

    /**
     * Alias for isPrimitive (for consistency with armour API).
     * @type {boolean}
     */
    get primitive(): boolean {
        return this.isPrimitive;
    }

    /**
     * Does this weapon use ammunition?
     * @type {boolean}
     */
    get usesAmmo(): boolean {
        return this.clip.max > 0;
    }

    /**
     * Is the weapon jammed or out of ammo?
     * @type {boolean}
     */
    get isOutOfAmmo(): boolean {
        return this.usesAmmo && this.clip.value <= 0;
    }

    /**
     * Get effective qualities (base + craftsmanship-derived + ammo).
     * Applies WH40K RPG craftsmanship rules for ranged weapons:
     * - Poor: Gain Unreliable (or jam on any miss if already Unreliable)
     * - Good: Gain Reliable (or cancel Unreliable)
     * - Best: Never jams or overheats (gain Reliable, remove Overheats)
     * - Exceptional (Astartes): Gain Reliable (or cancel Unreliable)
     * - Master (Astartes): Never jams or overheats (like Best)
     *
     * @type {Set<string>}
     */
    get effectiveSpecial(): Set<string> {
        const qualities = new Set<string>(this.special);

        // Add craftsmanship-derived qualities for RANGED weapons only
        // Melee weapons get toHit/damage modifiers instead
        if (!this.melee && !this.isMeleeWeapon) {
            const hasUnreliable = qualities.has('unreliable');

            switch (this.craftsmanship) {
                case 'poor':
                    // Poor: Gain Unreliable quality
                    // NOTE: If already Unreliable, jams on any miss (handled in roll logic, not here)
                    qualities.add('unreliable');
                    break;

                case 'good':
                    // Good: Gain Reliable OR cancel Unreliable
                    if (hasUnreliable) {
                        qualities.delete('unreliable');
                    } else {
                        qualities.add('reliable');
                    }
                    break;

                case 'best':
                    // Best: Never jams or overheats
                    // Add Reliable quality and remove Overheats
                    qualities.add('reliable');
                    qualities.delete('unreliable');
                    qualities.delete('overheats');
                    break;

                case 'exceptional':
                    // Exceptional (Astartes): Gain Reliable OR cancel Unreliable
                    if (hasUnreliable) {
                        qualities.delete('unreliable');
                    } else {
                        qualities.add('reliable');
                    }
                    break;

                case 'master':
                    // Master (Astartes): Never jams or overheats (like Best)
                    qualities.add('reliable');
                    qualities.delete('unreliable');
                    qualities.delete('overheats');
                    break;
            }
        }

        // Apply loaded ammunition quality modifications
        if (this.loadedAmmo.uuid) {
            // Add qualities from ammo
            for (const quality of this.loadedAmmo.addedQualities) {
                qualities.add(quality);
            }
            // Remove qualities blocked by ammo
            for (const quality of this.loadedAmmo.removedQualities) {
                qualities.delete(quality);
            }
        }

        return qualities;
    }

    /**
     * Get craftsmanship-derived stat modifiers.
     * Applies WH40K RPG craftsmanship rules:
     *
     * MELEE WEAPONS:
     * - Poor: -10 to attack and parry
     * - Good: +5 to attack
     * - Best: +10 to attack, +1 damage
     * - Exceptional (Astartes): +5 to attack, +1 damage
     * - Master (Astartes): +10 to attack, +2 damage
     *
     * RANGED WEAPONS:
     * - Qualities handled in effectiveSpecial getter
     * - Exceptional (Astartes): Gain Reliable (or cancel Unreliable)
     * - Master (Astartes): Never jams or overheats (like Best)
     *
     * @type {object}
     */
    get craftsmanshipModifiers(): { toHit: number; damage: number; weight: number } {
        const mods = {
            toHit: 0, // WS/BS modifier
            damage: 0, // Damage bonus
            weight: 1.0, // Weight multiplier (for future use)
        };

        // Apply modifiers for MELEE weapons only
        // Ranged weapons get quality changes instead (see effectiveSpecial)
        if (this.melee || this.isMeleeWeapon) {
            switch (this.craftsmanship) {
                case 'poor':
                    mods.toHit = -10; // -10 to attack and parry
                    break;
                case 'good':
                    mods.toHit = 5; // +5 to attack
                    break;
                case 'best':
                    mods.toHit = 10; // +10 to attack
                    mods.damage = 1; // +1 damage
                    break;
                case 'exceptional': // Astartes-grade
                    mods.toHit = 5; // +5 to attack
                    mods.damage = 1; // +1 damage
                    break;
                case 'master': // Master-crafted Astartes
                    mods.toHit = 10; // +10 to attack
                    mods.damage = 2; // +2 damage
                    break;
            }
        }

        return mods;
    }

    /**
     * Check if weapon has any craftsmanship-derived qualities.
     * Only ranged weapons with non-common craftsmanship.
     * @type {boolean}
     */
    get hasCraftsmanshipQualities(): boolean {
        if (this.melee || this.isMeleeWeapon) return false;
        return ['poor', 'good', 'best', 'exceptional', 'master'].includes(this.craftsmanship);
    }

    /**
     * Get effective damage formula (base + modifications).
     * NOTE: This does NOT include Strength Bonus, which is added dynamically at roll time.
     * Strength Bonus is applied in the actor's rollWeaponDamage() method.
     * @type {string}
     */
    get effectiveDamageFormula(): string {
        const baseDamage = this.damage.formula || '1d10';
        const baseBonus = this.damage.bonus || 0;
        const craftBonus = this.craftsmanshipModifiers.damage;
        const modBonus = this._modificationModifiers.damage;

        const totalBonus = baseBonus + craftBonus + modBonus;

        if (totalBonus === 0) return baseDamage;
        return `${baseDamage}${totalBonus > 0 ? '+' : ''}${totalBonus}`;
    }

    /**
     * Get full damage formula for display, including +SB indicator for melee weapons.
     * This is intended for UI display to show users what the complete damage formula will be.
     * @type {string}
     */
    get fullDamageFormula(): string {
        const baseFormula = this.effectiveDamageFormula;

        // Melee weapons add Strength Bonus to damage
        if (this.isMeleeWeapon) {
            return `${baseFormula}+SB`;
        }

        return baseFormula;
    }

    /**
     * Get effective penetration (base + modifications).
     * @type {number}
     */
    get effectivePenetration(): number {
        const basePen = this.damage.penetration || 0;
        const modPen = this._modificationModifiers.penetration;
        return basePen + modPen;
    }

    /**
     * Get effective to-hit modifier (craftsmanship + modifications).
     * @type {number}
     */
    get effectiveToHit(): number {
        const craftMod = this.craftsmanshipModifiers.toHit;
        const modMod = this._modificationModifiers.toHit;
        return craftMod + modMod;
    }

    /**
     * Get effective range (base + modifications).
     * For ranged weapons only.
     * @type {object}
     */
    get effectiveRange(): { value: number; units: string; special: string } {
        const baseRange = this.attack.range.value || 0;
        const rangeModifier = this._modificationModifiers.range;

        return {
            value: baseRange + rangeModifier,
            units: this.attack.range.units || 'm',
            special: this.attack.range.special || '',
        };
    }

    /**
     * Get effective weight (base + modifications).
     * @type {number}
     */
    get effectiveWeight(): number {
        const baseWeight = this.weight || 0;
        const modWeight = this._modificationModifiers.weight;
        return baseWeight + modWeight;
    }

    /**
     * Check if actor has the required training for this weapon.
     * @param {Actor} actor - The actor to check
     * @returns {boolean} - True if actor has required training (or no training required)
     */
    hasRequiredTraining(_actor: object | null): boolean {
        // If no training requirement, always return true
        if (!this.requiredTraining) return true;

        // TODO: Implement talent-based training check when talent integration is ready
        // For now, return true to not block usage
        // Future implementation should check actor.items for matching talent
        // e.g., "Weapon Training (Las)" talent

        return true;
    }

    /**
     * Get available fire modes for this weapon.
     * Returns an array of {mode, label, rof, modifier, description} objects.
     * @type {Array<{mode: string, label: string, rof: number, modifier: number, description: string, actionType: string}>}
     */
    get availableFireModes(): Array<{ mode: string; label: string; rof: number; modifier: number; description: string; actionType: string }> {
        if (!this.isRangedWeapon) return [];

        const modes = [];
        const rof = this.attack.rateOfFire;
        const hasStorm = this.effectiveSpecial.has('storm');

        // Single Shot - always available for ranged weapons
        if (rof.single) {
            modes.push({
                mode: 'single',
                label: 'Single Shot',
                rof: 1,
                modifier: 0,
                description: 'Fire a single shot',
                actionType: 'half',
            });
        }

        // Semi-Auto - available if semi > 0
        if (rof.semi > 0) {
            const semiRof = hasStorm ? rof.semi * 2 : rof.semi;
            modes.push({
                mode: 'semi',
                label: `Semi-Auto (${semiRof})`,
                rof: semiRof,
                modifier: 0,
                description: 'Additional hit per 2 DoS',
                actionType: 'half',
            });
        }

        // Full-Auto - available if full > 0
        if (rof.full > 0) {
            const fullRof = hasStorm ? rof.full * 2 : rof.full;
            modes.push({
                mode: 'full',
                label: `Full-Auto (${fullRof})`,
                rof: fullRof,
                modifier: -10,
                description: 'Additional hit per DoS',
                actionType: 'half',
            });
        }

        return modes;
    }

    /**
     * Get the effective RoF for a fire mode (accounting for Storm quality).
     * @param {string} mode - Fire mode: 'single', 'semi', or 'full'
     * @returns {number} - Effective rate of fire
     */
    getEffectiveRoF(mode: string): number {
        const rof = this.attack.rateOfFire;
        const hasStorm = this.effectiveSpecial.has('storm');

        switch (mode) {
            case 'single':
                return 1;
            case 'semi':
                return hasStorm ? rof.semi * 2 : rof.semi;
            case 'full':
                return hasStorm ? rof.full * 2 : rof.full;
            default:
                return 1;
        }
    }

    /**
     * Get the reload time label.
     * @type {string}
     */
    get reloadLabel(): string {
        const labels: Record<string, string> = {
            '-': '-',
            'free': game.i18n.localize('WH40K.Reload.Free'),
            'half': game.i18n.localize('WH40K.Reload.Half'),
            'full': game.i18n.localize('WH40K.Reload.Full'),
            '2-full': game.i18n.localize('WH40K.Reload.2Full'),
            '3-full': game.i18n.localize('WH40K.Reload.3Full'),
        };
        // Access schema field via the typed helper — at runtime the instance property
        // (schema field) shadows the prototype method, but TS sees the method.
        const reloadTime = getReloadField(this);
        return labels[reloadTime] ?? reloadTime;
    }

    /**
     * Get effective reload time accounting for Customised quality.
     * Customised quality halves reload time.
     * @type {string}
     */
    get effectiveReloadTime(): string {
        // Access schema field via the typed helper — see reloadLabel comment
        const baseReload = getReloadField(this);

        // Check for Customised quality
        if (!this.effectiveSpecial.has('customised')) {
            return baseReload;
        }

        // Customised halves reload time
        const reloadMap: Record<string, string> = {
            '3-full': '2-full',
            '2-full': 'full',
            'full': 'half',
            'half': 'half', // Already minimum
            'free': 'free',
            '-': '-',
        };

        return reloadMap[baseReload] || baseReload;
    }

    /**
     * Get effective reload time label.
     * @type {string}
     */
    get effectiveReloadLabel(): string {
        const labels: Record<string, string> = {
            '-': '-',
            'free': game.i18n.localize('WH40K.Reload.Free'),
            'half': game.i18n.localize('WH40K.Reload.Half'),
            'full': game.i18n.localize('WH40K.Reload.Full'),
            '2-full': game.i18n.localize('WH40K.Reload.2Full'),
            '3-full': game.i18n.localize('WH40K.Reload.3Full'),
        };
        return labels[this.effectiveReloadTime] ?? this.effectiveReloadTime;
    }

    /**
     * Get the weapon class label.
     * @type {string}
     */
    get classLabel(): string {
        return game.i18n.localize(`WH40K.WeaponClass.${capitalize(this.class)}`);
    }

    /**
     * Get the weapon type label.
     * @type {string}
     */
    get typeLabel(): string {
        return game.i18n.localize(
            `WH40K.WeaponType.${this.type
                .split('-')
                .map((s) => capitalize(s))
                .join('')}`,
        );
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [
            ...((Object.getOwnPropertyDescriptor(PhysicalItemTemplate.prototype, 'chatProperties')?.get?.call(this) as string[] | undefined) ?? []),
            ...((Object.getOwnPropertyDescriptor(AttackTemplate.prototype, 'chatProperties')?.get?.call(this) as string[] | undefined) ?? []),
            ...((Object.getOwnPropertyDescriptor(DamageTemplate.prototype, 'chatProperties')?.get?.call(this) as string[] | undefined) ?? []),
        ];

        props.unshift(`${this.classLabel} (${this.typeLabel})`);

        if (this.usesAmmo) {
            props.push(`Clip: ${this.clip.value}/${this.effectiveClipMax}`);
            props.push(`Reload: ${this.reloadLabel}`);
        }

        // Show effective qualities (including craftsmanship)
        if (this.effectiveSpecial.size > 0) {
            props.push(`Qualities: ${Array.from(this.effectiveSpecial).join(', ')}`);
        }

        // Show craftsmanship modifiers if any
        const craftMods = this.craftsmanshipModifiers;
        if (craftMods.toHit !== 0 || craftMods.damage !== 0) {
            const modParts = [];
            if (craftMods.toHit !== 0) modParts.push(`${craftMods.toHit > 0 ? '+' : ''}${craftMods.toHit} Hit`);
            if (craftMods.damage !== 0) modParts.push(`+${craftMods.damage} Dmg`);
            props.push(`Craftsmanship: ${modParts.join(', ')}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): { class: string; type: string; damage: string; pen: number; range: string; rof: string } {
        return {
            class: this.classLabel,
            type: this.typeLabel,
            damage: this.damageLabel,
            pen: this.damage.penetration,
            range: this.rangeLabel,
            rof: this.rateOfFireLabel,
        };
    }

    /* -------------------------------------------- */
    /*  Display Properties                          */
    /* -------------------------------------------- */

    /**
     * Get icon class for weapon class.
     * @type {string}
     */
    get classIcon(): string {
        const icons: Record<string, string> = {
            melee: 'fa-sword',
            pistol: 'fa-gun',
            basic: 'fa-crosshairs',
            heavy: 'fa-bullseye',
            thrown: 'fa-hand',
            exotic: 'fa-atom',
        };
        return icons[this.class] ?? 'fa-crosshairs';
    }

    /**
     * Get icon class for weapon type.
     * @type {string}
     */
    get typeIcon(): string {
        const icons: Record<string, string> = {
            'primitive': 'fa-axe',
            'las': 'fa-laser-pointer',
            'solid-projectile': 'fa-crosshairs',
            'bolt': 'fa-meteor',
            'melta': 'fa-fire-flame-curved',
            'plasma': 'fa-sun',
            'flame': 'fa-fire',
            'launcher': 'fa-rocket',
            'explosive': 'fa-bomb',
            'power': 'fa-bolt-lightning',
            'chain': 'fa-link-slash',
            'shock': 'fa-bolt',
            'force': 'fa-wand-magic-sparkles',
            'exotic': 'fa-alien',
            'xenos': 'fa-alien',
        };
        return icons[this.type] ?? 'fa-crosshairs';
    }

    /**
     * Get effective clip max, accounting for loaded ammo's clip modifier.
     * @type {number}
     */
    get effectiveClipMax(): number {
        const base = this.clip.max;
        const ammoMod = this.loadedAmmo.clipModifier;
        return Math.max(1, base + ammoMod);
    }

    /**
     * Get ammunition percentage for visual display.
     * @type {number}
     */
    get ammoPercentage(): number {
        if (!this.usesAmmo || this.clip.max === 0) return 100;
        return Math.round((this.clip.value / this.effectiveClipMax) * 100);
    }

    /**
     * Get ammunition status class for styling.
     * @type {string}
     */
    get ammoStatus(): string {
        const pct = this.ammoPercentage;
        if (pct === 0) return 'empty';
        if (pct <= 25) return 'critical';
        if (pct <= 50) return 'low';
        return 'good';
    }

    /**
     * Get jam threshold for ranged weapons.
     * @type {number|null}
     */
    get jamThreshold(): number | null {
        if (this.isMeleeWeapon) return null;

        const qualities = this.effectiveSpecial;
        if (qualities.has('never-jam')) return null;
        if (qualities.has('reliable')) return 100; // Only jams on natural 100
        if (qualities.has('unreliable-2')) return 91; // Jams on 91+
        if (qualities.has('unreliable')) return 96; // Jams on 96+
        if (qualities.has('overheats')) return 91; // Overheats on 91+
        return 96; // Default jam on 96+
    }

    /**
     * Get a compact summary string for compendium/list display.
     * @type {string}
     */
    get compendiumSummary(): string {
        const parts = [];
        parts.push(this.damageLabel || '-');
        if (this.damage.penetration > 0) parts.push(`Pen ${this.damage.penetration}`);
        if (this.isRangedWeapon && this.rangeLabel !== '-') parts.push(this.rangeLabel);
        return parts.join(' • ');
    }

    /**
     * Get full stat line for display.
     * @type {string}
     */
    get statLine(): string {
        const parts = [];
        parts.push(`${this.classLabel}`);
        if (this.isRangedWeapon) {
            parts.push(`${this.rangeLabel}`);
            parts.push(`RoF: ${this.rateOfFireLabel}`);
        }
        parts.push(`${this.damageLabel}`);
        parts.push(`Pen: ${this.damage.penetration}`);
        if (this.usesAmmo) parts.push(`Clip: ${this.effectiveClipMax}`);
        return parts.join(' | ');
    }

    /**
     * Get qualities as array of objects with labels and descriptions.
     * @type {Array<{id: string, label: string, description: string, level: number|null}>}
     */
    get qualitiesArray(): Array<{ id: string; baseId: string; label: string; description: string; level: number | null; hasLevel: boolean }> {
        const qualities = [];
        const config = CONFIG.WH40K.weaponQualities;

        for (const qualityId of this.effectiveSpecial) {
            // Parse level from quality ID (e.g., "blast-3" -> "blast", 3)
            const match = qualityId.match(/^(.+?)-(\d+)$/);
            const baseId = match ? match[1] : qualityId;
            const level = match ? parseInt(match[2]) : null;

            // `config` is typed Record<string, WeaponQualityConfig>, so index access never
            // returns undefined at the type level. Read via Object.hasOwn to check presence
            // at runtime; missing entries fall back to the title-cased quality id.
            const hasBase = Object.hasOwn(config, baseId);
            const hasFull = Object.hasOwn(config, qualityId);
            const definition = hasBase ? config[baseId] : hasFull ? config[qualityId] : null;

            const fallbackLabel = qualityId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
            qualities.push({
                id: qualityId,
                baseId: baseId,
                label: definition !== null && definition.label !== '' ? game.i18n.localize(definition.label) : fallbackLabel,
                description: definition !== null && definition.description !== '' ? game.i18n.localize(definition.description) : '',
                level: level,
                hasLevel: definition !== null ? definition.hasLevel : false,
            });
        }

        return qualities;
    }

    /**
     * Check if weapon is two-handed.
     * @type {boolean}
     */
    get isTwoHanded(): boolean {
        return this.twoHanded || this.class === 'heavy';
    }

    /**
     * Get hands required string.
     * @type {string}
     */
    get handsLabel(): string {
        return this.isTwoHanded ? game.i18n.localize('WH40K.Weapon.TwoHanded') : game.i18n.localize('WH40K.Weapon.OneHanded');
    }

    /**
     * Check if weapon has loaded ammunition.
     * @type {boolean}
     */
    get hasLoadedAmmo(): boolean {
        return this.loadedAmmo.uuid !== '';
    }

    /**
     * Get loaded ammunition display name.
     * @type {string}
     */
    get loadedAmmoLabel(): string {
        if (!this.hasLoadedAmmo) return 'Standard';
        return this.loadedAmmo.name || 'Unknown';
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Fire the weapon, consuming ammunition.
     * @param {number} [shots=1]   Number of shots to fire.
     * @returns {Promise<Item>}
     */
    fire(shots = 1): WH40KItem | null | Promise<WH40KItem | undefined> {
        if (!this.usesAmmo) return this.parent;
        const newValue = Math.max(0, this.clip.value - shots);
        return this.parent?.update({ 'system.clip.value': newValue }) as Promise<WH40KItem | undefined>;
    }

    /**
     * Reload the weapon using the ReloadActionManager.
     * This method validates action economy and handles Customised quality.
     * @param {object} options - Reload options
     * @param {boolean} options.skipValidation - Skip action economy validation
     * @param {boolean} options.force - Force reload even if already full
     * @returns {Promise<{success: boolean, message: string, actionsSpent: object}>}
     */
    async reload(options: { skipValidation?: boolean; force?: boolean } = {}): Promise<ReloadResult> {
        // Dynamic import to avoid circular dependency
        const { ReloadActionManager } = await import('../../actions/reload-action-manager.ts');
        if (this.parent === null) {
            return { success: false, message: '', actionsSpent: { half: 0, full: 0, label: '' } };
        }
        return ReloadActionManager.reloadWeapon(this.parent, options);
    }

    /**
     * Load ammunition into the weapon.
     * @param {Item} ammoItem - The ammunition item to load
     * @returns {Promise<Item>} - The updated weapon
     */
    async loadAmmo(ammoItem: AmmoItemLike): Promise<WH40KItem | null> {
        if (ammoItem.type !== 'ammunition') {
            ui.notifications.warn('Invalid ammunition item');
            return this.parent;
        }

        const actor: AmmoActorLike | null = (this.parent?.actor as AmmoActorLike | null | undefined) ?? null;

        // Eject current ammo first (return remaining rounds to inventory)
        if (this.clip.value > 0 && this.hasLoadedAmmo && actor !== null) {
            await this._returnRoundsToInventory(actor, this.clip.value);
        }

        // Cache ammunition modifiers — destructure with defaults so the schema-optional
        // fields are surfaced as concrete values without `??` paper-overs at each call site.
        const {
            clipModifier: clipMod = 0,
            modifiers = {},
            addedQualities = new Set<string>(),
            removedQualities = new Set<string>(),
            quantity,
        } = ammoItem.system;
        const { damage: ammoDamageMod = 0, penetration: ammoPenMod = 0, range: ammoRangeMod = 0 } = modifiers;
        const effectiveMax = Math.max(1, this.clip.max + clipMod);
        const loadedAmmoData = {
            uuid: ammoItem.uuid,
            name: ammoItem.name,
            modifiers: { damage: ammoDamageMod, penetration: ammoPenMod, range: ammoRangeMod },
            clipModifier: clipMod,
            addedQualities,
            removedQualities,
        };

        // Deduct rounds from inventory
        const availableQuantity = quantity ?? effectiveMax;
        const roundsToLoad = actor !== null ? Math.min(effectiveMax, availableQuantity) : effectiveMax;
        if (actor !== null && quantity !== undefined) {
            await ammoItem.update({ 'system.quantity': quantity - roundsToLoad });
        }

        await this.parent?.update({
            'system.loadedAmmo': loadedAmmoData,
            'system.clip.value': roundsToLoad,
        });

        ui.notifications.info(`${ammoItem.name} loaded into ${this.parent?.name ?? ''} (${roundsToLoad} rounds)`);
        return this.parent;
    }

    /**
     * Eject loaded ammunition from the weapon.
     * @returns {Promise<Item>} - The updated weapon
     */
    async ejectAmmo(): Promise<WH40KItem | null> {
        if (!this.hasLoadedAmmo) {
            ui.notifications.warn('No ammunition loaded');
            return this.parent;
        }

        // Return remaining rounds to inventory
        const actor: AmmoActorLike | null = (this.parent?.actor as AmmoActorLike | null | undefined) ?? null;
        if (this.clip.value > 0 && actor !== null) {
            await this._returnRoundsToInventory(actor, this.clip.value);
        }

        await this.parent?.update({
            'system.loadedAmmo': {
                uuid: '',
                name: '',
                modifiers: { damage: 0, penetration: 0, range: 0 },
                clipModifier: 0,
                addedQualities: new Set(),
                removedQualities: new Set(),
            },
            'system.clip.value': 0,
        });

        ui.notifications.info(`Ammunition ejected from ${this.parent?.name ?? ''}`);
        return this.parent;
    }

    /**
     * Return remaining rounds to the actor's inventory.
     * Finds the ammo item by UUID, then by name as fallback.
     * @param {Actor} actor - The owning actor
     * @param {number} rounds - Number of rounds to return
     * @returns {Promise<void>}
     * @private
     */
    async _returnRoundsToInventory(actor: AmmoActorLike, rounds: number): Promise<void> {
        if (rounds <= 0 || !this.loadedAmmo.uuid) return;

        // Try to find the ammo item by UUID first, then fall back to name+type.
        const ammoItem =
            actor.items.find((i) => i.uuid === this.loadedAmmo.uuid) ?? actor.items.find((i) => i.type === 'ammunition' && i.name === this.loadedAmmo.name);

        if (ammoItem) {
            await ammoItem.update({ 'system.quantity': ammoItem.system.quantity + rounds });
        } else {
            // Last resort: create a new ammo item with the returned rounds
            try {
                const sourceItem = (await fromUuid(this.loadedAmmo.uuid)) as SourceItemLike | null;
                if (sourceItem) {
                    const itemData = sourceItem.toObject();
                    itemData.system.quantity = rounds;
                    await actor.createEmbeddedDocuments('Item', [itemData]);
                }
            } catch {
                console.warn(`wh40k-rpg | Could not return ${rounds} rounds of ${this.loadedAmmo.name} to inventory`);
            }
        }
    }
}
