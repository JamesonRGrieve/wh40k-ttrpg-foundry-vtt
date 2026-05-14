import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import ActorDataModel from '../abstract/actor-data-model.ts';
import HordeTemplate, { type HordeData } from './mixins/horde-template.ts';

const { NumberField, SchemaField, StringField, BooleanField, ArrayField, ObjectField, HTMLField } = foundry.data.fields;

/**
 * Data model for NPC V2 actors.
 * Independent model architecture - does NOT extend CreatureTemplate.
 *
 * Designed for GM-centric workflow with:
 * - Minimal complexity (no XP, origin paths, acquisitions)
 * - Horde mechanics via mixin
 * - Manual stat overrides
 * - Simple weapon/armour modes
 *
 * @extends {ActorDataModel}
 */
/** Shape of a single characteristic in NPCData (no advance field). */
interface NPCCharacteristicData {
    label: string;
    short: string;
    base: number;
    modifier: number;
    unnatural: number;
    total: number;
    bonus: number;
}

/** Shape of a simple weapon entry for NPC V2. */
interface NPCV2SimpleWeapon {
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

/** Shape of a trained skill entry in the sparse trainedSkills object. */
interface NPCV2TrainedSkill {
    name: string;
    characteristic: string;
    trained: boolean;
    plus10: boolean;
    plus20: boolean;
    plus30?: boolean;
    bonus: number;
}

export default class NPCData extends HordeTemplate(ActorDataModel) {
    // Typed property declarations matching defineSchema()
    declare faction: string;
    declare subfaction: string;
    declare allegiance: string;
    declare primaryUse: 'npc' | 'vehicle' | 'ship';
    declare role: 'bruiser' | 'sniper' | 'caster' | 'support' | 'commander' | 'specialist';
    declare type: 'troop' | 'elite' | 'master' | 'horde' | 'swarm' | 'creature' | 'daemon' | 'xenos';
    declare threatLevel: number;
    declare characteristics: {
        weaponSkill: NPCCharacteristicData;
        ballisticSkill: NPCCharacteristicData;
        strength: NPCCharacteristicData;
        toughness: NPCCharacteristicData;
        agility: NPCCharacteristicData;
        intelligence: NPCCharacteristicData;
        perception: NPCCharacteristicData;
        willpower: NPCCharacteristicData;
        fellowship: NPCCharacteristicData;
        influence: NPCCharacteristicData;
        [key: string]: NPCCharacteristicData;
    };
    declare wounds: {
        max: number;
        value: number;
        critical: number;
    };
    declare movement: {
        half: number;
        full: number;
        charge: number;
        run: number;
    };
    declare size: number;
    declare initiative: {
        characteristic: string;
        base: string;
        bonus: number;
    };
    declare trainedSkills: Partial<Record<string, NPCV2TrainedSkill>>;
    declare weapons: {
        mode: 'simple' | 'embedded';
        simple: NPCV2SimpleWeapon[];
    };
    declare armour: {
        mode: 'simple' | 'locations';
        total: number;
        locations: {
            head: number;
            body: number;
            leftArm: number;
            rightArm: number;
            leftLeg: number;
            rightLeg: number;
            [key: string]: number;
        };
    };
    declare specialAbilities: string;
    declare customStats: {
        enabled: boolean;
        characteristics: Record<string, number>;
        skills: Record<string, number>;
        combat: {
            initiative: number | null;
            dodge: number | null;
            parry: number | null;
        };
        wounds: number | null;
        movement: number | null;
    };
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
    declare horde: HordeData;

    /* -------------------------------------------- */
    /*  Model Configuration                         */
    /* -------------------------------------------- */

    /**
     * Characteristic schema factory.
     * @param {string} label - Display label
     * @param {string} short - Short name (e.g., "WS")
     * @returns {SchemaField}
     * @private
     */
    static _CharacteristicField(label: string, short: string): foundry.data.fields.DataField.Any {
        return new SchemaField({
            label: new StringField({ required: true, initial: label }),
            short: new StringField({ required: true, initial: short }),
            base: new NumberField({ required: true, initial: 30, integer: true }),
            modifier: new NumberField({ required: true, initial: 0, integer: true }),
            unnatural: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            // Derived values
            total: new NumberField({ required: true, initial: 30, integer: true }),
            bonus: new NumberField({ required: true, initial: 3, integer: true }),
        });
    }

    /** @inheritDoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        return {
            ...super.defineSchema(),

            // === CORE IDENTITY ===
            faction: new StringField({ required: false, initial: '', blank: true }),
            subfaction: new StringField({ required: false, initial: '', blank: true }),
            allegiance: new StringField({ required: false, initial: '', blank: true }),

            // Primary use: determines optimal sheet layout
            primaryUse: new StringField({
                required: true,
                initial: 'npc',
                choices: ['npc', 'vehicle', 'ship'],
                label: 'WH40K.NPC.PrimaryUse',
            }),

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

            // === CHARACTERISTICS ===
            characteristics: new SchemaField({
                weaponSkill: this._CharacteristicField('Weapon Skill', 'WS'),
                ballisticSkill: this._CharacteristicField('Ballistic Skill', 'BS'),
                strength: this._CharacteristicField('Strength', 'S'),
                toughness: this._CharacteristicField('Toughness', 'T'),
                agility: this._CharacteristicField('Agility', 'Ag'),
                intelligence: this._CharacteristicField('Intelligence', 'Int'),
                perception: this._CharacteristicField('Perception', 'Per'),
                willpower: this._CharacteristicField('Willpower', 'WP'),
                fellowship: this._CharacteristicField('Fellowship', 'Fel'),
                influence: this._CharacteristicField('Influence', 'Inf'),
            }),

            // === WOUNDS ===
            wounds: new SchemaField({
                max: new NumberField({ required: true, initial: 10, min: 0, integer: true }),
                value: new NumberField({ required: true, initial: 10, min: 0, integer: true }),
                critical: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            // === MOVEMENT ===
            movement: new SchemaField({
                half: new NumberField({ required: true, initial: 3, min: 0 }),
                full: new NumberField({ required: true, initial: 6, min: 0 }),
                charge: new NumberField({ required: true, initial: 9, min: 0 }),
                run: new NumberField({ required: true, initial: 18, min: 0 }),
            }),

            size: new NumberField({ required: true, initial: 4, min: 1, max: 10, integer: true }),

            // === INITIATIVE ===
            initiative: new SchemaField({
                characteristic: new StringField({ required: true, initial: 'agility' }),
                base: new StringField({ required: true, initial: '1d10' }),
                bonus: new NumberField({ required: true, initial: 0, integer: true }),
            }),

            // === TRAINED SKILLS (SPARSE) ===
            // Only store skills the NPC actually has, not all 48
            trainedSkills: new ObjectField({
                required: true,
                initial: {},
                // Format: { "awareness": { trained: true, plus10: false, plus20: false, bonus: 10 } }
            }),

            // === WEAPONS (SIMPLE MODE) ===
            // NPCs use simple inline weapons, not full item-based weapons
            weapons: new SchemaField({
                mode: new StringField({
                    required: true,
                    initial: 'simple',
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

            // === ARMOUR (SIMPLE MODE) ===
            armour: new SchemaField({
                mode: new StringField({
                    required: true,
                    initial: 'simple',
                    choices: ['simple', 'locations'],
                }),
                total: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                // Location-based (if mode is "locations")
                locations: new SchemaField({
                    head: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    body: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    leftArm: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    rightArm: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    leftLeg: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    rightLeg: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                }),
            }),

            // === SPECIAL ABILITIES ===
            specialAbilities: new HTMLField({ required: false, initial: '', blank: true }),

            // === CUSTOM STATS (MANUAL OVERRIDES) ===
            // Allows GM to manually override any calculated value
            customStats: new SchemaField({
                enabled: new BooleanField({ required: true, initial: false }),
                characteristics: new ObjectField({ initial: {} }), // { "strength": 42 }
                skills: new ObjectField({ initial: {} }), // { "awareness": 65 }
                combat: new SchemaField({
                    initiative: new NumberField({ required: false, nullable: true }),
                    dodge: new NumberField({ required: false, nullable: true }),
                    parry: new NumberField({ required: false, nullable: true }),
                }),
                wounds: new NumberField({ required: false, nullable: true }),
                movement: new NumberField({ required: false, nullable: true }),
            }),

            // === PINNED ABILITIES ===
            // Track which abilities are pinned for overview display
            pinnedAbilities: new ArrayField(new StringField({ required: true }), { required: true, initial: [] }),

            // === GM UTILITIES ===
            template: new StringField({ required: false, initial: '', blank: true }), // UUID of source template
            quickNotes: new HTMLField({ required: false, initial: '', blank: true }), // GM-only tactical notes
            tags: new ArrayField(new StringField({ required: true }), { required: true, initial: [] }),

            // === ROLEPLAY FIELDS ===
            personality: new SchemaField({
                demeanor: new StringField({ required: false, initial: '', blank: true }),
                goals: new StringField({ required: false, initial: '', blank: true }),
                fears: new StringField({ required: false, initial: '', blank: true }),
                quirks: new StringField({ required: false, initial: '', blank: true }),
            }),

            // === NOTES ===
            description: new HTMLField({ required: false, initial: '', blank: true }),
            tactics: new HTMLField({ required: false, initial: '', blank: true }),
            source: new StringField({ required: false, initial: '', blank: true }), // Book reference
        };
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
     * Get toughness bonus.
     * @type {number}
     */
    get toughnessBonus(): number {
        return this.characteristics.toughness.bonus;
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

    /**
     * Get effective stats with custom overrides applied.
     * @type {Object}
     */
    get effectiveStats(): {
        characteristics: Record<string, number>;
        skills: Record<string, number>;
        combat: { initiative: number; dodge: number; parry: number };
        wounds: number;
        movement: number;
    } {
        const characteristics: Record<string, number> = {};
        const skills: Record<string, number> = {};
        const stats = {
            characteristics,
            skills,
            combat: {
                initiative: this.initiative.bonus,
                dodge: this.getSkillTarget('dodge'),
                parry: this.getSkillTarget('parry'),
            },
            wounds: this.wounds.max,
            movement: this.movement.half,
        };

        // Copy characteristics
        for (const [key, char] of Object.entries(this.characteristics)) {
            stats.characteristics[key] = char.total;
        }

        // Copy trained skills
        for (const key of Object.keys(this.trainedSkills)) {
            stats.skills[key] = this.getSkillTarget(key);
        }

        // Apply custom overrides if enabled
        if (this.customStats.enabled) {
            // Override characteristics (always number, no null check needed)
            for (const [key, value] of Object.entries(this.customStats.characteristics)) {
                stats.characteristics[key] = value;
            }
            // Override skills (always number, no null check needed)
            for (const [key, value] of Object.entries(this.customStats.skills)) {
                stats.skills[key] = value;
            }
            // Override combat stats (number | null — null means "use derived value")
            if (this.customStats.combat.initiative !== null) {
                stats.combat.initiative = this.customStats.combat.initiative;
            }
            if (this.customStats.combat.dodge !== null) {
                stats.combat.dodge = this.customStats.combat.dodge;
            }
            if (this.customStats.combat.parry !== null) {
                stats.combat.parry = this.customStats.combat.parry;
            }
            // Override wounds
            if (this.customStats.wounds !== null) {
                stats.wounds = this.customStats.wounds;
            }
            // Override movement
            if (this.customStats.movement !== null) {
                stats.movement = this.customStats.movement;
            }
        }

        return stats;
    }

    /**
     * Get the list of trained skills as an array for display.
     * @type {Array<Object>}
     */
    get trainedSkillsList(): Array<{
        key: string;
        name: string;
        characteristic: string;
        trained: boolean;
        plus10: boolean;
        plus20: boolean;
        bonus: number;
        target: number;
    }> {
        const list: Array<{
            key: string;
            name: string;
            characteristic: string;
            trained: boolean;
            plus10: boolean;
            plus20: boolean;
            bonus: number;
            target: number;
        }> = [];
        for (const [key, skill] of Object.entries(this.trainedSkills)) {
            if (skill === undefined) continue;
            list.push({
                key,
                name: skill.name !== '' ? skill.name : key,
                characteristic: skill.characteristic !== '' ? skill.characteristic : 'Per',
                trained: skill.trained,
                plus10: skill.plus10,
                plus20: skill.plus20,
                bonus: skill.bonus,
                target: this.getSkillTarget(key),
            });
        }
        return list.sort((a, b) => a.name.localeCompare(b.name));
    }

    /* -------------------------------------------- */
    /*  Characteristic Mapping                      */
    /* -------------------------------------------- */

    /**
     * Map characteristic short names to full keys.
     * @type {Object<string, string>}
     */
    static CHARACTERISTIC_MAP: Record<string, string> = {
        WS: 'weaponSkill',
        BS: 'ballisticSkill',
        S: 'strength',
        T: 'toughness',
        Ag: 'agility',
        Int: 'intelligence',
        Per: 'perception',
        WP: 'willpower',
        Fel: 'fellowship',
        Inf: 'influence',
    };

    /**
     * Get a characteristic by its short name or full key.
     * @param {string} key - Short name (e.g., "Ag") or full key (e.g., "agility")
     * @returns {object|null}
     */
    getCharacteristic(key: string): NPCCharacteristicData | null {
        if (key in this.characteristics) {
            return this.characteristics[key] ?? null;
        }
        const fullKey = NPCData.CHARACTERISTIC_MAP[key];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: Record index access may be undefined at runtime
        if (fullKey == null || !(fullKey in this.characteristics)) {
            return null;
        }
        return this.characteristics[fullKey] ?? null;
    }

    /* -------------------------------------------- */
    /*  Skill Methods                               */
    /* -------------------------------------------- */

    /**
     * Default skill-to-characteristic mapping.
     * @type {Object<string, string>}
     */
    static SKILL_CHARACTERISTIC_MAP: Record<string, string> = {
        acrobatics: 'agility',
        athletics: 'strength',
        awareness: 'perception',
        charm: 'fellowship',
        command: 'fellowship',
        commerce: 'fellowship',
        commonLore: 'intelligence',
        deceive: 'fellowship',
        dodge: 'agility',
        evaluate: 'intelligence',
        forbiddenLore: 'intelligence',
        inquiry: 'fellowship',
        interrogation: 'willpower',
        intimidate: 'strength',
        linguistics: 'intelligence',
        logic: 'intelligence',
        medicae: 'intelligence',
        navigate: 'intelligence',
        operate: 'agility',
        parry: 'weaponSkill',
        psyniscience: 'perception',
        scholasticLore: 'intelligence',
        scrutiny: 'perception',
        security: 'intelligence',
        sleightOfHand: 'agility',
        stealth: 'agility',
        survival: 'perception',
        techUse: 'intelligence',
        trade: 'intelligence',
    };

    /**
     * Calculate the target number for a skill test.
     * @param {string} skillName - The skill key (e.g., "awareness", "dodge")
     * @returns {number} The target number for the skill test.
     */
    getSkillTarget(skillName: string): number {
        const skill = this.trainedSkills[skillName];
        const charKey =
            (skill?.characteristic !== undefined && skill.characteristic !== '' ? skill.characteristic : null) ??
            (skillName in NPCData.SKILL_CHARACTERISTIC_MAP ? NPCData.SKILL_CHARACTERISTIC_MAP[skillName] : null) ??
            'perception';
        const char = this.getCharacteristic(charKey);
        if (char === null) return 0;

        const gameSystem = (this.constructor as { gameSystem?: string }).gameSystem;
        const systemConfig = gameSystem !== undefined ? SystemConfigRegistry.getOrNull(gameSystem) : null;
        let target = char.total;

        // Apply training bonuses
        if (skill !== undefined) {
            // trained baseline: no bonus
            if (skill.plus10) target += 10;
            if (skill.plus20) target += 10; // cumulative: plus10 + plus20 = +20
            if (skill.plus30 === true) target += 10; // cumulative: plus10 + plus20 + plus30 = +30 (DH2e Veteran)
            target += skill.bonus !== 0 ? skill.bonus : 0;
        } else {
            // Untrained: flat -20 in DH2e (Known/Trained/Experienced/Veteran ladder),
            // half characteristic for career-based systems.
            target = systemConfig?.usesAptitudes === true ? char.total - 20 : Math.floor(char.total / 2);
        }

        // Apply custom override if enabled
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: Record<string,number> index access may be undefined at runtime
        if (this.customStats.enabled && this.customStats.skills[skillName] != null) {
            return this.customStats.skills[skillName];
        }

        return target;
    }

    /**
     * Add a trained skill to this NPC.
     * @param {string} name - The skill key
     * @param {string} characteristic - The characteristic key
     * @param {string} level - Training level: "trained", "plus10", or "plus20"
     * @param {number} bonus - Additional bonus
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because this.parent.update returns an untyped Foundry Promise
    addTrainedSkill(name: string, characteristic: string | null = null, level = 'trained', bonus = 0): unknown {
        const skills = foundry.utils.deepClone(this.trainedSkills);

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: Record index access may be undefined at runtime
        const charKey = characteristic ?? NPCData.SKILL_CHARACTERISTIC_MAP[name] ?? 'perception';

        skills[name] = {
            name: name,
            characteristic: charKey,
            trained: true,
            plus10: level === 'plus10' || level === 'plus20',
            plus20: level === 'plus20',
            bonus: bonus,
        };

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        return this.parent.update({ 'system.trainedSkills': skills });
    }

    /**
     * Remove a trained skill from this NPC.
     * @param {string} name - The skill key
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because this.parent.update returns an untyped Foundry Promise
    removeSkill(name: string): unknown {
        const skills = foundry.utils.deepClone(this.trainedSkills);
        delete skills[name];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        return this.parent.update({ 'system.trainedSkills': skills });
    }

    /**
     * Update a trained skill's properties.
     * @param {string} name - The skill key
     * @param {Object} updates - Properties to update
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: updates object contains caller-provided data; Record<string,unknown> is the documented pattern here
    updateSkill(name: string, updates: Record<string, unknown>): unknown {
        const skills = foundry.utils.deepClone(this.trainedSkills);
        if (skills[name] === undefined) return this.parent;

        Object.assign(skills[name], updates);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        return this.parent.update({ 'system.trainedSkills': skills });
    }

    /* -------------------------------------------- */
    /*  Weapon Methods                              */
    /* -------------------------------------------- */

    /**
     * Switch weapon mode between simple and embedded.
     * @param {string} mode - The mode to switch to: "simple" or "embedded"
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because this.parent.update returns an untyped Foundry Promise
    switchWeaponMode(mode: string): unknown {
        if (!['simple', 'embedded'].includes(mode)) return this.parent;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        return this.parent.update({ 'system.weapons.mode': mode });
    }

    /**
     * Add a simple weapon.
     * @param {Object} data - Weapon data
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: data is caller-supplied weapon data; Record<string,unknown> is the documented pattern; return is untyped Foundry Promise
    addSimpleWeapon(data: Record<string, unknown> = {}): unknown {
        const weapons = foundry.utils.deepClone(this.weapons.simple);
        const weaponClass = (data['class'] as NPCV2SimpleWeapon['class'] | undefined) ?? 'melee';
        weapons.push({
            name: (data['name'] as string) || 'New Weapon',
            damage: (data['damage'] as string) || '1d10',
            pen: (data['pen'] as number) || 0,
            range: (data['range'] as string) || 'Melee',
            rof: (data['rof'] as string) || 'S/-/-',
            clip: (data['clip'] as number) || 0,
            reload: (data['reload'] as string) || '-',
            special: (data['special'] as string) || '',
            class: weaponClass,
        });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        return this.parent.update({ 'system.weapons.simple': weapons });
    }

    /**
     * Remove a simple weapon by index.
     * @param {number} index - The weapon index
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because this.parent.update returns an untyped Foundry Promise
    removeSimpleWeapon(index: number): unknown {
        const weapons = foundry.utils.deepClone(this.weapons.simple);
        if (index < 0 || index >= weapons.length) return this.parent;
        weapons.splice(index, 1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        return this.parent.update({ 'system.weapons.simple': weapons });
    }

    /**
     * Promote a simple weapon to an embedded weapon item.
     * @param {number} index - The simple weapon index to promote
     * @returns {Promise<Item|null>} The created weapon item, or null on failure
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because createEmbeddedDocuments returns an untyped Foundry Document
    async promoteSimpleWeapon(index: number): Promise<unknown> {
        const weapons = this.weapons.simple;
        const weapon = weapons[index];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: array index access may be undefined at runtime
        if (weapon == null) return null;

        // Create the weapon item
        const itemData = {
            name: weapon.name,
            type: 'weapon',
            system: {
                damage: weapon.damage,
                penetration: weapon.pen,
                range: weapon.range,
                rateOfFire: weapon.rof,
                clip: weapon.clip,
                reload: weapon.reload,
                special: weapon.special,
                class: weapon.class,
            },
        };

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, no-restricted-syntax -- boundary: this.parent is any-typed Foundry document; result array holds untyped Document
        const [createdItem] = (await this.parent.createEmbeddedDocuments('Item', [itemData])) as [unknown];

        // Remove from simple weapons
        if (createdItem !== null) {
            await this.removeSimpleWeapon(index);
        }

        return createdItem;
    }

    /* -------------------------------------------- */
    /*  Armour Methods                              */
    /* -------------------------------------------- */

    /**
     * Switch armour mode between simple and locations.
     * @param {string} mode - The mode to switch to: "simple" or "locations"
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because this.parent.update returns an untyped Foundry Promise
    switchArmourMode(mode: string): unknown {
        if (!['simple', 'locations'].includes(mode)) return this.parent;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        return this.parent.update({ 'system.armour.mode': mode });
    }

    /**
     * Get armour value for a specific location.
     * @param {string} location - The location key (head, body, leftArm, etc.)
     * @returns {number} The armour value
     */
    getArmourForLocation(location: string): number {
        if (this.armour.mode === 'simple') {
            return this.armour.total;
        }
        return this.armour.locations[location] ?? 0;
    }

    /* -------------------------------------------- */
    /*  Favorite Skills & Talents                   */
    /* -------------------------------------------- */

    /**
     * Toggle favorite status for a skill.
     * @param {string} skillKey - The skill key to toggle
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because this.parent.setFlag returns an untyped Foundry Promise
    toggleFavoriteSkill(skillKey: string): unknown {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        const flagValue = this.parent.getFlag('wh40k-rpg', 'favoriteSkills') as string[] | null | undefined;
        const favorites = [...(flagValue ?? [])];
        const index = favorites.indexOf(skillKey);
        if (index >= 0) favorites.splice(index, 1);
        else favorites.push(skillKey);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        return this.parent.setFlag('wh40k-rpg', 'favoriteSkills', favorites);
    }

    /**
     * Toggle favorite status for a talent.
     * @param {string} itemId - The talent item ID to toggle
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because this.parent.setFlag returns an untyped Foundry Promise
    toggleFavoriteTalent(itemId: string): unknown {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        const flagValue = this.parent.getFlag('wh40k-rpg', 'favoriteTalents') as string[] | null | undefined;
        const favorites = [...(flagValue ?? [])];
        const index = favorites.indexOf(itemId);
        if (index >= 0) favorites.splice(index, 1);
        else favorites.push(itemId);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        return this.parent.setFlag('wh40k-rpg', 'favoriteTalents', favorites);
    }

    /**
     * Get list of favorite skill keys.
     * @type {Array<string>}
     */
    get favoriteSkills(): string[] {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        return (this.parent.getFlag('wh40k-rpg', 'favoriteSkills') as string[] | null | undefined) ?? [];
    }

    /**
     * Get list of favorite talent IDs.
     * @type {Array<string>}
     */
    get favoriteTalents(): string[] {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
        return (this.parent.getFlag('wh40k-rpg', 'favoriteTalents') as string[] | null | undefined) ?? [];
    }

    /* -------------------------------------------- */
    /*  Pinned Abilities                            */
    /* -------------------------------------------- */

    /**
     * Pin an ability (talent/trait) to show on overview.
     * @param {string} itemId - The item ID to pin
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because this.parent.update returns an untyped Foundry Promise
    pinAbility(itemId: string): unknown {
        const pinned = foundry.utils.deepClone(this.pinnedAbilities);
        if (!pinned.includes(itemId)) {
            pinned.push(itemId);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
            return this.parent.update({ 'system.pinnedAbilities': pinned });
        }
        return this.parent;
    }

    /**
     * Unpin an ability from overview.
     * @param {string} itemId - The item ID to unpin
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because this.parent.update returns an untyped Foundry Promise
    unpinAbility(itemId: string): unknown {
        const pinned = foundry.utils.deepClone(this.pinnedAbilities);
        const idx = pinned.indexOf(itemId);
        if (idx >= 0) {
            pinned.splice(idx, 1);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- boundary: this.parent is any-typed Foundry document
            return this.parent.update({ 'system.pinnedAbilities': pinned });
        }
        return this.parent;
    }

    /**
     * Toggle pin state for an ability.
     * @param {string} itemId - The item ID to toggle
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because pinAbility/unpinAbility return untyped Foundry Promises
    togglePinAbility(itemId: string): unknown {
        const pinned = this.pinnedAbilities;
        if (pinned.includes(itemId)) {
            return this.unpinAbility(itemId);
        }
        return this.pinAbility(itemId);
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override prepareBaseData(): void {
        super.prepareBaseData();
    }

    /** @inheritDoc */
    override prepareDerivedData(): void {
        super.prepareDerivedData();
        this._prepareCharacteristics();
        this._prepareMovement();
        this._prepareInitiative();

        // Auto-enable horde mode if NPC type is horde or swarm
        if (this.isHorde && !this.horde.enabled) {
            this.horde.enabled = true;
        }
    }

    /**
     * Prepare characteristic totals and bonuses.
     * @protected
     */
    _prepareCharacteristics(): void {
        for (const [, char] of Object.entries(this.characteristics)) {
            // Total = base + modifier
            char.total = char.base + char.modifier;

            // Base bonus is tens digit
            const baseBonus = Math.floor(char.total / 10);

            // Unnatural multiplies the bonus (0 = no unnatural, 2+ = multiplier)
            const unnaturalLevel = char.unnatural || 0;
            char.bonus = unnaturalLevel >= 2 ? baseBonus * unnaturalLevel : baseBonus;
        }
    }

    /**
     * Prepare movement values based on agility bonus and size.
     * @protected
     */
    _prepareMovement(): void {
        const agility = this.characteristics.agility;
        const ab = agility.bonus;
        const baseMove = ab + this.size - 4;

        this.movement.half = Math.max(1, baseMove);
        this.movement.full = Math.max(2, baseMove * 2);
        this.movement.charge = Math.max(3, baseMove * 3);
        this.movement.run = Math.max(6, baseMove * 6);
    }

    /**
     * Prepare initiative bonus.
     * @protected
     */
    _prepareInitiative(): void {
        const initChar = this.characteristics[this.initiative.characteristic];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: dynamic key access on characteristics may return undefined at runtime
        this.initiative.bonus = initChar?.bonus ?? 0;
    }

    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: getRollData must return Record<string,unknown> to match the base class signature
    override getRollData(): Record<string, unknown> {
        const data = super.getRollData();

        // Add characteristic values and bonuses for formulas
        for (const [key, char] of Object.entries(this.characteristics)) {
            data[char.short] = char.total;
            data[`${char.short}B`] = char.bonus;
            data[key] = char.total;
        }

        // Add common roll data
        data['threatLevel'] = this.threatLevel;
        data['size'] = this.size;

        // Add horde data if enabled
        if (this.horde.enabled) {
            data['magnitude'] = this.horde.magnitude.current;
            data['magnitudeMax'] = this.horde.magnitude.max;
            data['magnitudePercent'] = this.magnitudePercent;
            data['hordeDamageMultiplier'] = this.hordeDamageMultiplier;
        }

        return data;
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Convert a value to an integer, handling strings and edge cases.
     * @param {*} value - The value to convert
     * @param {number} fallback - Fallback value if conversion fails
     * @returns {number}
     * @private
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: value is untyped migration source data; unknown is intentional here as the entry point of conversion
    static _toInt(value: unknown, fallback = 0): number {
        if (value === null || value === undefined || value === '') return fallback;
        const num = Number(value);
        if (Number.isNaN(num)) return fallback;
        return Math.floor(num);
    }

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _migrateData receives untyped Foundry source data before schema validation
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        NPCData.#migrateSize(source);
        NPCData.#migrateWounds(source);
        NPCData.#migrateThreatLevel(source);
    }

    /**
     * Migrate size to integer.
     * @param {object} source - The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helpers receive untyped Foundry source data
    static #migrateSize(source: Record<string, unknown>): void {
        if (source['size'] !== undefined) {
            const sizeInt = this._toInt(source['size'], 4);
            source['size'] = sizeInt < 1 ? 1 : sizeInt > 10 ? 10 : sizeInt;
        }
    }

    /**
     * Migrate wounds values to integers.
     * @param {object} source - The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helpers receive untyped Foundry source data
    static #migrateWounds(source: Record<string, unknown>): void {
        if (typeof source['wounds'] === 'object' && source['wounds'] !== null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: source['wounds'] is untyped legacy migration data
            const wounds = source['wounds'] as Record<string, unknown>;
            if (wounds['max'] !== undefined) {
                wounds['max'] = this._toInt(wounds['max'], 10);
            }
            if (wounds['value'] !== undefined) {
                wounds['value'] = this._toInt(wounds['value'], 10);
            }
            if (wounds['critical'] !== undefined) {
                wounds['critical'] = this._toInt(wounds['critical'], 0);
            }
        }
    }

    /**
     * Migrate threat level to integer.
     * @param {object} source - The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helpers receive untyped Foundry source data
    static #migrateThreatLevel(source: Record<string, unknown>): void {
        if (source['threatLevel'] !== undefined) {
            source['threatLevel'] = this._toInt(source['threatLevel'], 5);
        }
    }
}
