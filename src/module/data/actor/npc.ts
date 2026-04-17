import HordeTemplate from './mixins/horde-template.ts';
import CreatureTemplate from './templates/creature.ts';

const { NumberField, SchemaField, StringField, ArrayField, HTMLField } = foundry.data.fields;

/**
 * Data model for NPC actors.
 * Extends CreatureTemplate with NPC-specific fields (threat, role, faction).
 *
 * Inherits all creature features (characteristics, skills, wounds, fate, psy, movement)
 * from CreatureTemplate, providing full parity with Characters while adding NPC-specific
 * utility features like simple weapons/armour, threat tiers, and horde mechanics.
 *
 * @extends {CreatureTemplate}
 */
/** Shape of a simple weapon entry for NPCs. */
interface NPCSimpleWeapon {
    name: string;
    damage: string;
    pen: number;
    range: string;
    rof: string;
    clip: number;
    reload: string;
    special: string;
    class: 'melee' | 'pistol' | 'basic' | 'heavy' | 'thrown' | 'launcher';
}

export default class NPCData extends HordeTemplate(CreatureTemplate) {
    // Typed property declarations matching defineSchema()
    declare faction: string;
    declare subfaction: string;
    declare allegiance: string;
    declare role: 'bruiser' | 'sniper' | 'caster' | 'support' | 'commander' | 'specialist';
    declare type: 'troop' | 'elite' | 'master' | 'horde' | 'swarm' | 'creature' | 'daemon' | 'xenos';
    declare threatLevel: number;
    declare weapons: {
        mode: 'simple' | 'embedded';
        simple: NPCSimpleWeapon[];
    };
    declare simpleArmour: {
        mode: 'simple' | 'embedded';
        total: number;
    };
    declare specialAbilities: string;
    declare pinnedAbilities: string[];
    declare template: string;
    declare quickNotes: string;
    declare tags: string[];
    declare personality: {
        demeanor: string;
        goals: string;
        fears: string;
        quirks: string;
    };
    declare description: string;
    declare tactics: string;
    declare source: string;

    // From HordeTemplate mixin
    declare horde: {
        enabled: boolean;
        magnitude: {
            max: number;
            current: number;
        };
        magnitudeLog: Array<{
            amount: number;
            source: string;
            timestamp: number;
        }>;
        traits: string[];
        damageMultiplier: number;
        sizeModifier: number;
    };

    /* -------------------------------------------- */
    /*  Model Configuration                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static _systemType = 'npc';

    /** @inheritDoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        return {
            ...super.defineSchema(),

            // ===== NPC IDENTITY =====
            faction: new StringField({ required: false, initial: '', blank: true }),
            subfaction: new StringField({ required: false, initial: '', blank: true }),
            allegiance: new StringField({ required: false, initial: '', blank: true }),

            role: new StringField({
                required: true,
                initial: 'bruiser',
                choices: ['bruiser', 'sniper', 'caster', 'support', 'commander', 'specialist'],
            }),

            type: new StringField({
                required: true,
                initial: 'troop',
                choices: ['troop', 'elite', 'master', 'horde', 'swarm', 'creature', 'daemon', 'xenos'],
            }),

            threatLevel: new NumberField({
                required: true,
                initial: 5,
                min: 1,
                max: 30,
                integer: true,
            }),

            // ===== SIMPLE WEAPONS (alternative to item-based) =====
            weapons: new SchemaField({
                mode: new StringField({
                    required: true,
                    initial: 'embedded',
                    choices: ['simple', 'embedded'],
                }),
                simple: new ArrayField(
                    new SchemaField({
                        name: new StringField({ required: true, initial: '' }),
                        damage: new StringField({ required: true, initial: '1d10' }),
                        pen: new NumberField({ required: true, initial: 0, integer: true }),
                        range: new StringField({ required: true, initial: 'Melee' }),
                        rof: new StringField({ required: true, initial: 'S/-/-' }),
                        clip: new NumberField({ required: true, initial: 0, integer: true }),
                        reload: new StringField({ required: true, initial: '-' }),
                        special: new StringField({ required: false, initial: '', blank: true }),
                        class: new StringField({
                            required: true,
                            initial: 'melee',
                            choices: ['melee', 'pistol', 'basic', 'heavy', 'thrown', 'launcher'],
                        }),
                    }),
                    { required: true, initial: [] },
                ),
            }),

            // ===== SIMPLE ARMOUR (alternative to item-based) =====
            simpleArmour: new SchemaField({
                mode: new StringField({
                    required: true,
                    initial: 'embedded',
                    choices: ['simple', 'embedded'],
                }),
                total: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            // ===== SPECIAL ABILITIES =====
            specialAbilities: new HTMLField({ required: false, initial: '', blank: true }),

            // ===== PINNED ABILITIES =====
            pinnedAbilities: new ArrayField(new StringField({ required: true }), { required: true, initial: [] }),

            // ===== GM UTILITIES =====
            template: new StringField({ required: false, initial: '', blank: true }),
            quickNotes: new HTMLField({ required: false, initial: '', blank: true }),
            tags: new ArrayField(new StringField({ required: true }), { required: true, initial: [] }),

            // ===== ROLEPLAY FIELDS =====
            personality: new SchemaField({
                demeanor: new StringField({ required: false, initial: '', blank: true }),
                goals: new StringField({ required: false, initial: '', blank: true }),
                fears: new StringField({ required: false, initial: '', blank: true }),
                quirks: new StringField({ required: false, initial: '', blank: true }),
            }),

            // ===== NOTES =====
            description: new HTMLField({ required: false, initial: '', blank: true }),
            tactics: new HTMLField({ required: false, initial: '', blank: true }),
            source: new StringField({ required: false, initial: '', blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static _migrateData(source: Record<string, any>): void {
        super._migrateData?.(source);
        NPCData.#migrateFromV2(source);
        NPCData.#migrateSimpleArmour(source);
        NPCData.#migrateThreatLevel(source);
    }

    /**
     * Migrate from NPCDataV2 format if trainedSkills exist.
     * @param {object} source - The source data
     */
    static #migrateFromV2(source: Record<string, any>): void {
        // Migrate trainedSkills to full skills format
        if (source.trainedSkills && source.skills) {
            for (const [skillName, skillData] of Object.entries(source.trainedSkills)) {
                if (source.skills[skillName]) {
                    // @ts-expect-error - dynamic property access
                    source.skills[skillName].trained = skillData.trained || false;
                    // @ts-expect-error - dynamic property access
                    source.skills[skillName].plus10 = skillData.plus10 || false;
                    // @ts-expect-error - dynamic property access
                    source.skills[skillName].plus20 = skillData.plus20 || false;
                    // @ts-expect-error - dynamic property access
                    source.skills[skillName].bonus = skillData.bonus || 0;
                }
            }
            delete source.trainedSkills;
        }

        // Migrate legacy customStats
        if (source.customStats) {
            delete source.customStats;
        }

        // Migrate legacy primaryUse
        if (source.primaryUse) {
            delete source.primaryUse;
        }
    }

    /**
     * Migrate simple armour field.
     * @param {object} source - The source data
     */
    static #migrateSimpleArmour(source: Record<string, any>): void {
        source.simpleArmour ??= { mode: 'embedded', total: 0 };
        if (source.simpleArmour.total !== undefined) {
            source.simpleArmour.total = parseInt(source.simpleArmour.total) || 0;
        }
    }

    /**
     * Migrate threat level to ensure valid range.
     * @param {object} source - The source data
     */
    static #migrateThreatLevel(source: Record<string, any>): void {
        if (source.threatLevel !== undefined) {
            source.threatLevel = parseInt(source.threatLevel) || 5;
            if (source.threatLevel < 1) source.threatLevel = 1;
            if (source.threatLevel > 30) source.threatLevel = 30;
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the NPC type label.
     * @type {string}
     */
    get typeLabel(): string {
        const key = `WH40K.NPCType.${this.type.charAt(0).toUpperCase()}${this.type.slice(1)}`;
        return game.i18n.localize(key);
    }

    /**
     * Get threat level description.
     * @type {string}
     */
    get threatDescription(): string {
        if (this.threatLevel <= 5) return game.i18n.localize('WH40K.Threat.Low');
        if (this.threatLevel <= 10) return game.i18n.localize('WH40K.Threat.Moderate');
        if (this.threatLevel <= 15) return game.i18n.localize('WH40K.Threat.Dangerous');
        if (this.threatLevel <= 20) return game.i18n.localize('WH40K.Threat.Deadly');
        return game.i18n.localize('WH40K.Threat.Apocalyptic');
    }

    /**
     * Get a threat summary string.
     * @type {string}
     */
    get threatSummary(): string {
        return `${this.typeLabel} (Threat ${this.threatLevel})`;
    }

    /**
     * Is this a horde-type NPC?
     * @type {boolean}
     */
    get isHorde(): boolean {
        return this.type === 'horde' || this.type === 'swarm';
    }

    /**
     * Is this a significant threat (elite or above)?
     * @type {boolean}
     */
    get isElite(): boolean {
        return this.type === 'elite' || this.type === 'master';
    }

    /**
     * Get role label.
     * @type {string}
     */
    get roleLabel(): string {
        const key = `WH40K.NPCRole.${this.role.charAt(0).toUpperCase()}${this.role.slice(1)}`;
        return game.i18n.localize(key);
    }

    /**
     * Get threat tier info with color and label.
     * @type {Object}
     */
    get threatTier(): { key: string; label: string; color: string } {
        const t = this.threatLevel;
        if (t <= 5) return { key: 'minor', label: 'Hereticus Minoris', color: '#4caf50' };
        if (t <= 10) return { key: 'standard', label: 'Hereticus Medius', color: '#2196f3' };
        if (t <= 15) return { key: 'tough', label: 'Hereticus Gravis', color: '#ff9800' };
        if (t <= 20) return { key: 'elite', label: 'Hereticus Extremis', color: '#f44336' };
        return { key: 'boss', label: 'Hereticus Maximus', color: '#9c27b0' };
    }

    /* -------------------------------------------- */
    /*  Simple Weapon Methods                       */
    /* -------------------------------------------- */

    /**
     * Switch weapon mode between simple and embedded.
     * @param {string} mode - The mode to switch to
     * @returns {Promise<Actor>}
     */
    switchWeaponMode(mode: string): any {
        if (!['simple', 'embedded'].includes(mode)) return this.parent;
        return this.parent.update({ 'system.weapons.mode': mode });
    }

    /**
     * Add a simple weapon.
     * @param {Object} data - Weapon data
     * @returns {Promise<Actor>}
     */
    addSimpleWeapon(data: Record<string, any> = {}): any {
        const weapons = foundry.utils.deepClone(this.weapons.simple || []);
        weapons.push({
            name: data.name || 'New Weapon',
            damage: data.damage || '1d10',
            pen: data.pen || 0,
            range: data.range || 'Melee',
            rof: data.rof || 'S/-/-',
            clip: data.clip || 0,
            reload: data.reload || '-',
            special: data.special || '',
            class: data.class || 'melee',
        });
        return this.parent.update({ 'system.weapons.simple': weapons });
    }

    /**
     * Remove a simple weapon by index.
     * @param {number} index - The weapon index
     * @returns {Promise<Actor>}
     */
    removeSimpleWeapon(index: number): any {
        const weapons = foundry.utils.deepClone(this.weapons.simple || []);
        if (index < 0 || index >= weapons.length) return this.parent;
        weapons.splice(index, 1);
        return this.parent.update({ 'system.weapons.simple': weapons });
    }

    /* -------------------------------------------- */
    /*  Simple Armour Methods                       */
    /* -------------------------------------------- */

    /**
     * Switch armour mode between simple and embedded.
     * @param {string} mode - The mode to switch to
     * @returns {Promise<Actor>}
     */
    switchArmourMode(mode: string): any {
        if (!['simple', 'embedded'].includes(mode)) return this.parent;
        return this.parent.update({ 'system.simpleArmour.mode': mode });
    }

    /**
     * Get armour value for a specific location.
     * Uses simple armour total if in simple mode, otherwise uses calculated location armour.
     * @param {string} location - The location key
     * @returns {number}
     */
    getArmourForLocation(location: string): number {
        if (this.simpleArmour.mode === 'simple') {
            return this.simpleArmour.total;
        }
        return this.armour?.[location] ?? 0;
    }

    /* -------------------------------------------- */
    /*  Pinned Abilities                            */
    /* -------------------------------------------- */

    /**
     * Pin an ability to show on overview.
     * @param {string} itemId - The item ID to pin
     * @returns {Promise<Actor>}
     */
    pinAbility(itemId: string): any {
        const pinned = foundry.utils.deepClone(this.pinnedAbilities || []);
        if (!pinned.includes(itemId)) {
            pinned.push(itemId);
            return this.parent.update({ 'system.pinnedAbilities': pinned });
        }
        return this.parent;
    }

    /**
     * Unpin an ability from overview.
     * @param {string} itemId - The item ID to unpin
     * @returns {Promise<Actor>}
     */
    unpinAbility(itemId: string): any {
        const pinned = foundry.utils.deepClone(this.pinnedAbilities || []);
        const idx = pinned.indexOf(itemId);
        if (idx >= 0) {
            pinned.splice(idx, 1);
            return this.parent.update({ 'system.pinnedAbilities': pinned });
        }
        return this.parent;
    }

    /**
     * Toggle pin state for an ability.
     * @param {string} itemId - The item ID to toggle
     * @returns {Promise<Actor>}
     */
    togglePinAbility(itemId: string): any {
        const pinned = this.pinnedAbilities || [];
        return pinned.includes(itemId) ? this.unpinAbility(itemId) : this.pinAbility(itemId);
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritDoc */
    prepareDerivedData(): void {
        super.prepareDerivedData();

        // Auto-enable horde mode if NPC type is horde or swarm
        if (this.isHorde && !this.horde.enabled) {
            this.horde.enabled = true;
        }
    }

    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /** @override */
    getRollData(): Record<string, unknown> {
        const data = super.getRollData?.() ?? {};

        // Add NPC-specific roll data
        data.threatLevel = this.threatLevel;

        // Add horde data if enabled
        if (this.horde?.enabled) {
            data.magnitude = this.horde.magnitude?.current ?? 0;
            data.magnitudeMax = this.horde.magnitude?.max ?? 0;
            data.hordeDamageMultiplier = this.horde.damageMultiplier ?? 1;
        }

        return data;
    }
}
