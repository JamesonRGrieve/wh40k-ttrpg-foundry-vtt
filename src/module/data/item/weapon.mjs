import ItemDataModel from '../abstract/item-data-model.mjs';
import DescriptionTemplate from '../shared/description-template.mjs';
import PhysicalItemTemplate from '../shared/physical-item-template.mjs';
import EquippableTemplate from '../shared/equippable-template.mjs';
import AttackTemplate from '../shared/attack-template.mjs';
import DamageTemplate from '../shared/damage-template.mjs';
import FormulaField from '../fields/formula-field.mjs';
import IdentifierField from '../fields/identifier-field.mjs';

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
    /** @inheritdoc */
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }),

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
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritdoc */
    static migrateData(source) {
        super.migrateData(source);

        // Ensure special is an array for SetField compatibility
        if (!Array.isArray(source.special)) {
            source.special = source.special ? Array.from(source.special) : [];
        }

        // Migrate old class values (chain, power, shock, force) to type field
        // These were incorrectly stored in class field before the schema cleanup
        const techTypeValues = ['chain', 'power', 'shock', 'force'];
        if (source.class && techTypeValues.includes(source.class)) {
            // Move the tech type to type field
            source.type = source.class;
            // Set class to melee (default for these tech types)
            source.class = 'melee';
        }

        // Migrate proficiency -> requiredTraining
        if (source.proficiency !== undefined) {
            source.requiredTraining = source.proficiency;
            delete source.proficiency;
        }

        return source;
    }

    /** @inheritdoc */
    prepareDerivedData() {
        super.prepareDerivedData();

        // Auto-derive twoHanded for heavy weapons (if not explicitly set)
        // This provides a sensible default while allowing manual override
        if (this.class === 'heavy' && !this.twoHanded) {
            // Note: This is derived at runtime, not stored in source data
            // Heavy weapons are typically two-handed unless explicitly marked otherwise
        }

        // Aggregate modifiers from modifications (when they're active)
        this._aggregateModificationModifiers();
    }

    /**
     * Aggregate cached modifiers from active modifications.
     * @private
     */
    _aggregateModificationModifiers() {
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
            if (mod.active && mod.cachedModifiers) {
                this._modificationModifiers.damage += mod.cachedModifiers.damage ?? 0;
                this._modificationModifiers.penetration += mod.cachedModifiers.penetration ?? 0;
                this._modificationModifiers.toHit += mod.cachedModifiers.toHit ?? 0;
                this._modificationModifiers.range += mod.cachedModifiers.range ?? 0;
                this._modificationModifiers.weight += mod.cachedModifiers.weight ?? 0;
            }
        }

        // Add loaded ammunition modifiers
        if (this.loadedAmmo?.uuid && this.loadedAmmo.modifiers) {
            this._modificationModifiers.damage += this.loadedAmmo.modifiers.damage ?? 0;
            this._modificationModifiers.penetration += this.loadedAmmo.modifiers.penetration ?? 0;
            this._modificationModifiers.range += this.loadedAmmo.modifiers.range ?? 0;
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get isRollable() {
        return true;
    }

    /**
     * Is this a ranged weapon?
     * @type {boolean}
     */
    get isRangedWeapon() {
        return ['pistol', 'basic', 'heavy', 'launcher'].includes(this.class);
    }

    /**
     * Is this a melee weapon?
     * @type {boolean}
     */
    get isMeleeWeapon() {
        return this.class === 'melee' || this.melee;
    }

    /**
     * Does this weapon use ammunition?
     * @type {boolean}
     */
    get usesAmmo() {
        return this.clip.max > 0;
    }

    /**
     * Is the weapon jammed or out of ammo?
     * @type {boolean}
     */
    get isOutOfAmmo() {
        return this.usesAmmo && this.clip.value <= 0;
    }

    /**
     * Get effective qualities (base + craftsmanship-derived + ammo).
     * Applies Rogue Trader craftsmanship rules for ranged weapons:
     * - Poor: Gain Unreliable (or jam on any miss if already Unreliable)
     * - Good: Gain Reliable (or cancel Unreliable)
     * - Best: Never jams or overheats (gain Reliable, remove Overheats)
     *
     * @type {Set<string>}
     */
    get effectiveSpecial() {
        const qualities = new Set(this.special || []);

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
            }
        }

        // Apply loaded ammunition quality modifications
        if (this.loadedAmmo?.uuid) {
            // Add qualities from ammo
            if (this.loadedAmmo.addedQualities) {
                for (const quality of this.loadedAmmo.addedQualities) {
                    qualities.add(quality);
                }
            }
            // Remove qualities blocked by ammo
            if (this.loadedAmmo.removedQualities) {
                for (const quality of this.loadedAmmo.removedQualities) {
                    qualities.delete(quality);
                }
            }
        }

        return qualities;
    }

    /**
     * Get craftsmanship-derived stat modifiers.
     * Applies Rogue Trader craftsmanship rules:
     *
     * MELEE WEAPONS:
     * - Poor: -10 to attack and parry
     * - Good: +5 to attack
     * - Best: +10 to attack, +1 damage
     *
     * RANGED WEAPONS:
     * - Qualities handled in effectiveSpecial getter
     *
     * @type {object}
     */
    get craftsmanshipModifiers() {
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
            }
        }

        return mods;
    }

    /**
     * Check if weapon has any craftsmanship-derived qualities.
     * Only ranged weapons with non-common craftsmanship.
     * @type {boolean}
     */
    get hasCraftsmanshipQualities() {
        if (this.melee || this.isMeleeWeapon) return false;
        return ['poor', 'good', 'best'].includes(this.craftsmanship);
    }

    /**
     * Get effective damage formula (base + modifications).
     * NOTE: This does NOT include Strength Bonus, which is added dynamically at roll time.
     * Strength Bonus is applied in the actor's rollWeaponDamage() method.
     * @type {string}
     */
    get effectiveDamageFormula() {
        const baseDamage = this.damage.formula || '1d10';
        const baseBonus = this.damage.bonus || 0;
        const craftBonus = this.craftsmanshipModifiers.damage;
        const modBonus = this._modificationModifiers?.damage ?? 0;

        const totalBonus = baseBonus + craftBonus + modBonus;

        if (totalBonus === 0) return baseDamage;
        return `${baseDamage}${totalBonus > 0 ? '+' : ''}${totalBonus}`;
    }

    /**
     * Get effective penetration (base + modifications).
     * @type {number}
     */
    get effectivePenetration() {
        const basePen = this.damage.penetration || 0;
        const modPen = this._modificationModifiers?.penetration ?? 0;
        return basePen + modPen;
    }

    /**
     * Get effective to-hit modifier (craftsmanship + modifications).
     * @type {number}
     */
    get effectiveToHit() {
        const craftMod = this.craftsmanshipModifiers.toHit;
        const modMod = this._modificationModifiers?.toHit ?? 0;
        return craftMod + modMod;
    }

    /**
     * Get effective range (base + modifications).
     * For ranged weapons only.
     * @type {object}
     */
    get effectiveRange() {
        if (!this.attack?.range) return null;

        const baseRange = this.attack.range.value || 0;
        const rangeModifier = this._modificationModifiers?.range ?? 0;

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
    get effectiveWeight() {
        const baseWeight = this.weight || 0;
        const modWeight = this._modificationModifiers?.weight ?? 0;
        return baseWeight + modWeight;
    }

    /**
     * Check if actor has the required training for this weapon.
     * @param {Actor} actor - The actor to check
     * @returns {boolean} - True if actor has required training (or no training required)
     */
    hasRequiredTraining(actor) {
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
    get availableFireModes() {
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
    getEffectiveRoF(mode) {
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
    get reloadLabel() {
        const labels = {
            '-': '-',
            'free': game.i18n.localize('RT.Reload.Free'),
            'half': game.i18n.localize('RT.Reload.Half'),
            'full': game.i18n.localize('RT.Reload.Full'),
            '2-full': game.i18n.localize('RT.Reload.2Full'),
            '3-full': game.i18n.localize('RT.Reload.3Full'),
        };
        return labels[this.reload] ?? this.reload;
    }

    /**
     * Get effective reload time accounting for Customised quality.
     * Customised quality halves reload time.
     * @type {string}
     */
    get effectiveReloadTime() {
        const baseReload = this.reload;
        
        // Check for Customised quality
        if (!this.effectiveSpecial?.has('customised')) {
            return baseReload;
        }

        // Customised halves reload time
        const reloadMap = {
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
    get effectiveReloadLabel() {
        const labels = {
            '-': '-',
            'free': game.i18n.localize('RT.Reload.Free'),
            'half': game.i18n.localize('RT.Reload.Half'),
            'full': game.i18n.localize('RT.Reload.Full'),
            '2-full': game.i18n.localize('RT.Reload.2Full'),
            '3-full': game.i18n.localize('RT.Reload.3Full'),
        };
        return labels[this.effectiveReloadTime] ?? this.effectiveReloadTime;
    }

    /**
     * Get the weapon class label.
     * @type {string}
     */
    get classLabel() {
        return game.i18n.localize(`RT.WeaponClass.${this.class.capitalize()}`);
    }

    /**
     * Get the weapon type label.
     * @type {string}
     */
    get typeLabel() {
        return game.i18n.localize(
            `RT.WeaponType.${this.type
                .split('-')
                .map((s) => s.capitalize())
                .join('')}`,
        );
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties() {
        const props = [
            ...PhysicalItemTemplate.prototype.chatProperties.call(this),
            ...AttackTemplate.prototype.chatProperties.call(this),
            ...DamageTemplate.prototype.chatProperties.call(this),
        ];

        props.unshift(`${this.classLabel} (${this.typeLabel})`);

        if (this.usesAmmo) {
            props.push(`Clip: ${this.clip.value}/${this.clip.max}`);
            props.push(`Reload: ${this.reloadLabel}`);
        }

        // Show effective qualities (including craftsmanship)
        if (this.effectiveSpecial?.size) {
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
    get headerLabels() {
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
    get classIcon() {
        const icons = {
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
    get typeIcon() {
        const icons = {
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
     * Get ammunition percentage for visual display.
     * @type {number}
     */
    get ammoPercentage() {
        if (!this.usesAmmo || this.clip.max === 0) return 100;
        return Math.round((this.clip.value / this.clip.max) * 100);
    }

    /**
     * Get ammunition status class for styling.
     * @type {string}
     */
    get ammoStatus() {
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
    get jamThreshold() {
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
    get compendiumSummary() {
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
    get statLine() {
        const parts = [];
        parts.push(`${this.classLabel}`);
        if (this.isRangedWeapon) {
            parts.push(`${this.rangeLabel}`);
            parts.push(`RoF: ${this.rateOfFireLabel}`);
        }
        parts.push(`${this.damageLabel}`);
        parts.push(`Pen: ${this.damage.penetration}`);
        if (this.usesAmmo) parts.push(`Clip: ${this.clip.max}`);
        return parts.join(' | ');
    }

    /**
     * Get qualities as array of objects with labels and descriptions.
     * @type {Array<{id: string, label: string, description: string, level: number|null}>}
     */
    get qualitiesArray() {
        const qualities = [];
        const config = CONFIG.ROGUE_TRADER?.weaponQualities ?? {};

        for (const qualityId of this.effectiveSpecial) {
            // Parse level from quality ID (e.g., "blast-3" -> "blast", 3)
            const match = qualityId.match(/^(.+?)-(\d+)$/);
            const baseId = match ? match[1] : qualityId;
            const level = match ? parseInt(match[2]) : null;

            const definition = config[baseId] || config[qualityId];

            qualities.push({
                id: qualityId,
                baseId: baseId,
                label: definition?.label ? game.i18n.localize(definition.label) : qualityId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
                description: definition?.description ? game.i18n.localize(definition.description) : '',
                level: level,
                hasLevel: definition?.hasLevel ?? false,
            });
        }

        return qualities;
    }

    /**
     * Check if weapon is two-handed.
     * @type {boolean}
     */
    get isTwoHanded() {
        return this.twoHanded || this.class === 'heavy';
    }

    /**
     * Get hands required string.
     * @type {string}
     */
    get handsLabel() {
        return this.isTwoHanded ? game.i18n.localize('RT.Weapon.TwoHanded') : game.i18n.localize('RT.Weapon.OneHanded');
    }

    /**
     * Check if weapon has loaded ammunition.
     * @type {boolean}
     */
    get hasLoadedAmmo() {
        return !!this.loadedAmmo?.uuid;
    }

    /**
     * Get loaded ammunition display name.
     * @type {string}
     */
    get loadedAmmoLabel() {
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
    async fire(shots = 1) {
        if (!this.usesAmmo) return this.parent;
        const newValue = Math.max(0, this.clip.value - shots);
        return this.parent?.update({ 'system.clip.value': newValue });
    }

    /**
     * Reload the weapon using the ReloadActionManager.
     * This method validates action economy and handles Customised quality.
     * @param {object} options - Reload options
     * @param {boolean} options.skipValidation - Skip action economy validation
     * @param {boolean} options.force - Force reload even if already full
     * @returns {Promise<{success: boolean, message: string, actionsSpent: object}>}
     */
    async reload(options = {}) {
        // Dynamic import to avoid circular dependency
        const { ReloadActionManager } = await import('../../actions/reload-action-manager.mjs');
        return ReloadActionManager.reloadWeapon(this.parent, options);
    }

    /**
     * Simple reload (legacy method for backward compatibility).
     * Reloads to max without validation.
     * @param {number} [amount]   Amount to reload (defaults to full).
     * @returns {Promise<Item>}
     * @deprecated Use reload() instead for full action economy support
     */
    async reloadSimple(amount = null) {
        if (!this.usesAmmo) return this.parent;
        const newValue = amount ?? this.clip.max;
        return this.parent?.update({ 'system.clip.value': Math.min(newValue, this.clip.max) });
    }
}

    /**
     * Load ammunition into the weapon.
     * @param {Item} ammoItem - The ammunition item to load
     * @returns {Promise<Item>} - The updated weapon
     */
    async loadAmmo(ammoItem) {
        if (!ammoItem || ammoItem.type !== 'ammunition') {
            ui.notifications.warn('Invalid ammunition item');
            return this.parent;
        }

        // Cache ammunition modifiers
        const loadedAmmoData = {
            uuid: ammoItem.uuid,
            name: ammoItem.name,
            modifiers: {
                damage: ammoItem.system.modifiers?.damage ?? 0,
                penetration: ammoItem.system.modifiers?.penetration ?? 0,
                range: ammoItem.system.modifiers?.range ?? 0,
            },
            addedQualities: ammoItem.system.addedQualities || new Set(),
            removedQualities: ammoItem.system.removedQualities || new Set(),
        };

        await this.parent?.update({
            'system.loadedAmmo': loadedAmmoData,
            'system.clip.value': this.clip.max, // Reload on ammo change
        });

        ui.notifications.info(`${ammoItem.name} loaded into ${this.parent.name}`);
        return this.parent;
    }

    /**
     * Eject loaded ammunition from the weapon.
     * @returns {Promise<Item>} - The updated weapon
     */
    async ejectAmmo() {
        if (!this.hasLoadedAmmo) {
            ui.notifications.warn('No ammunition loaded');
            return this.parent;
        }

        await this.parent?.update({
            'system.loadedAmmo': {
                uuid: '',
                name: '',
                modifiers: { damage: 0, penetration: 0, range: 0 },
                addedQualities: new Set(),
                removedQualities: new Set(),
            },
            'system.clip.value': 0, // Empty clip on eject
        });

        ui.notifications.info(`Ammunition ejected from ${this.parent.name}`);
        return this.parent;
    }
}
