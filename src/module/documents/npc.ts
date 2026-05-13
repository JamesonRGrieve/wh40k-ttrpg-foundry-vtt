import { DHTargetedActionManager } from '../actions/targeted-action-manager.ts';
import { prepareUnifiedRoll } from '../applications/prompts/unified-roll-dialog.ts';
import { SYSTEM_ID } from '../constants.ts';
import type NPCData from '../data/actor/npc.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { WH40KBaseActor } from './base-actor.ts';

/**
 * Document class for npcV2 type actors.
 * Simplified NPC implementation without the full PC overhead.
 *
 * @extends {WH40KBaseActor}
 */
export class WH40KNPC extends WH40KBaseActor {
    declare system: WH40KBaseActor['system'] & NPCData;

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the NPC's faction.
     * @type {string}
     */
    get faction(): string {
        return this.system.faction;
    }

    /**
     * Get the NPC's subfaction.
     * @type {string}
     */
    get subfaction(): string {
        return this.system.subfaction;
    }

    /**
     * Get the NPC's type (troop, elite, etc.).
     * @type {string}
     */
    get npcType(): string {
        return this.system.type;
    }

    /**
     * Get the NPC's role (bruiser, sniper, etc.).
     * @type {string}
     */
    get role(): string {
        return this.system.role;
    }

    /**
     * Get the NPC's threat level.
     * @type {number}
     */
    get threatLevel(): number {
        return this.system.threatLevel;
    }

    /**
     * Check if this NPC is in horde mode.
     * @type {boolean}
     */
    get isHordeMode(): boolean {
        return this.system.horde?.enabled ?? false;
    }

    /**
     * Check if this NPC type supports horde mode.
     * @type {boolean}
     */
    get isHordeType(): boolean {
        return this.system.isHorde;
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    protected override async _preCreate(data: never, options: never, user: User.Internal.Implementation): Promise<boolean | void> {
        await super._preCreate(data, options, user);
        const createData = data as Record<string, unknown>;

        // Configure token defaults for NPC V2
        const initData: Record<string, unknown> = {
            'token.bar1': { attribute: 'wounds' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.HOSTILE,
            'token.name': createData.name,
        };

        // If horde type, show magnitude instead of wounds
        const systemData = createData.system as Record<string, unknown> | undefined;
        if (systemData !== undefined && (systemData['type'] === 'horde' || systemData['type'] === 'swarm')) {
            initData['token.bar1'] = { attribute: 'horde.magnitude' };
        }

        this.updateSource(initData);
    }

    /* -------------------------------------------- */
    /*  Talent Helpers                              */
    /* -------------------------------------------- */

    hasTalent(talent: string): boolean {
        return this.items.filter((i) => i.type === 'talent').find((t) => t.name === talent) !== undefined;
    }

    hasTalentFuzzyWords(words: string[]): boolean {
        return (
            this.items
                .filter((i) => i.type === 'talent')
                .find((t) => {
                    for (const word of words) {
                        if (!(t.name ?? '').includes(word)) return false;
                    }
                    return true;
                }) !== undefined
        );
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /**
     * Roll a characteristic test for this NPC.
     * @param {string} characteristicKey - The characteristic key (e.g., "weaponSkill").
     * @param {string} [flavor] - Optional flavor text.
     * @returns {Promise<Roll>}
     */
    override async rollCharacteristic(characteristicKey: string, flavor?: string): Promise<void> {
        const char = this.system.characteristics[characteristicKey];
        if (char === undefined) {
            ui.notifications.warn(`Unknown characteristic: ${characteristicKey}`);
            return;
        }

        const simpleSkillData = this._buildSimpleSkillRoll({
            key: characteristicKey,
            type: 'characteristic',
            label: `${char.label} Test`,
            target: char.total,
            nameOverride: flavor !== undefined && flavor !== '' ? flavor : undefined,
        });
        prepareUnifiedRoll(simpleSkillData);
    }

    /**
     * Roll a simple weapon attack for this NPC.
     * @param {number} weaponIndex - Index of the weapon in the simple weapons array.
     * @returns {Promise<Roll>}
     */
    async rollSimpleWeapon(weaponIndex: number): Promise<void> {
        const weapons = this.system.weapons?.simple ?? [];
        const weapon = weapons[weaponIndex];
        if (weapon === undefined) {
            ui.notifications.warn(`No weapon at index ${weaponIndex}`);
            return;
        }

        // Determine attack characteristic
        const attackCharKey = weapon.class === 'melee' ? 'weaponSkill' : 'ballisticSkill';
        const char = this.system.characteristics[attackCharKey];
        if (char === undefined) return;

        const simpleSkillData = this._buildSimpleSkillRoll({
            key: attackCharKey,
            type: 'simpleWeapon',
            label: `${weapon.name} Attack`,
            target: char.total,
        });
        prepareUnifiedRoll(simpleSkillData);
    }

    /**
     * Roll an embedded item (weapon, psychic power, etc.).
     * NPCs skip equipped checks since they're GM-controlled.
     * @param {string} itemId - The embedded item ID.
     * @returns {Promise}
     */
    override async rollItem(itemId: string): Promise<void> {
        const item = this.items.get(itemId);
        if (item === undefined) return;

        switch (item.type) {
            case 'weapon': {
                if (game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.simpleAttackRolls)) {
                    const charKey = item.system.isMeleeWeapon ? 'weaponSkill' : 'ballisticSkill';
                    this.rollCharacteristic(charKey, item.name ?? undefined);
                } else {
                    await DHTargetedActionManager.performWeaponAttack(this, null, item);
                }
                return;
            }
            case 'psychicPower': {
                if (game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.simplePsychicRolls)) {
                    this.rollCharacteristic('willpower', item.name ?? undefined);
                } else {
                    await DHTargetedActionManager.performPsychicAttack(this, null, item);
                }
                return;
            }
            default: {
                const { DHBasicActionManager } = await import('../actions/basic-action-manager.ts');
                const rawBenefit = item.system.benefit;
                const rawDescription = item.system.description;
                const htmlContent = typeof rawBenefit === 'string' ? rawBenefit : typeof rawDescription === 'string' ? rawDescription : '';
                await DHBasicActionManager.sendItemVocalizeChat({
                    actor: this.name ?? '',
                    name: item.name ?? '',
                    type: item.type.toUpperCase(),
                    description: await TextEditor.enrichHTML(htmlContent, {
                        rollData: { actor: this, item },
                    }),
                });
            }
        }
    }

    /**
     * Roll a skill test for this NPC.
     * @param {string} skillName - The skill key (e.g., "awareness", "dodge").
     * @param {string} [flavor] - Optional flavor text.
     * @returns {Promise<Roll>}
     */
    async rollSkill(skillName: string, flavor?: string): Promise<void> {
        const target = this.system.getSkillTarget(skillName);
        const skill = this.system.trainedSkills[skillName];
        const skillLabel = skill?.name !== undefined && skill.name !== '' ? skill.name : skillName;

        const simpleSkillData = this._buildSimpleSkillRoll({
            key: skillName,
            type: 'skill',
            label: `${skillLabel} Test`,
            target,
            nameOverride: flavor !== undefined && flavor !== '' ? flavor : undefined,
        });
        prepareUnifiedRoll(simpleSkillData);
    }

    /* -------------------------------------------- */
    /*  Damage Methods                              */
    /* -------------------------------------------- */

    /**
     * Apply damage to this NPC.
     * For horde-type NPCs, this reduces magnitude instead of wounds.
     * @param {number} amount - Amount of damage to apply.
     * @param {string} [location] - Hit location (for location-based armour).
     * @param {Object} [options] - Additional options.
     * @param {boolean} [options.ignoreArmour=false] - Whether to ignore armour.
     * @param {boolean} [options.ignoreToughness=false] - Whether to ignore toughness bonus.
     * @returns {Promise<Actor>}
     */
    async applyDamage(amount: number, location = 'body', options: Record<string, unknown> = {}): Promise<unknown> {
        const { ignoreArmour = false, ignoreToughness = false } = options;

        // Mark actor as hit this round (for Good armour bonus tracking)
        await this.setFlag('wh40k-rpg' as never, 'hitThisRound' as never, true as never);

        // Calculate damage reduction
        let reduction = 0;

        if (!ignoreArmour) {
            reduction += this.system.getArmourForLocation(location);
        }

        if (!ignoreToughness) {
            reduction += this.system.characteristics.toughness?.bonus ?? 0;
        }

        const finalDamage = Math.max(0, amount - reduction);

        // For horde-type NPCs, apply to magnitude
        if (this.isHordeMode) {
            return this.applyMagnitudeDamage(finalDamage, location);
        }

        // For regular NPCs, apply to wounds
        const newWounds = Math.max(0, this.system.wounds.value - finalDamage);
        const critical = newWounds === 0 ? this.system.wounds.critical + (this.system.wounds.value - newWounds) : this.system.wounds.critical;

        return this.update({
            'system.wounds.value': newWounds,
            'system.wounds.critical': critical,
        });
    }

    /**
     * Heal wounds on this NPC.
     * @param {number} amount - Amount of wounds to heal.
     * @returns {Promise<Actor>}
     */
    healWounds(amount: number): unknown {
        const newWounds = Math.min(this.system.wounds.max, this.system.wounds.value + amount);
        return this.update({ 'system.wounds.value': newWounds });
    }

    /* -------------------------------------------- */
    /*  Threat Scaling Methods                      */
    /* -------------------------------------------- */

    /**
     * Scale this NPC's stats to a new threat level.
     * @param {number} newThreatLevel - The new threat level (1-30).
     * @returns {Promise<Actor>}
     */
    scaleToThreat(newThreatLevel: number): unknown {
        const currentThreat = this.threatLevel;
        const diff = newThreatLevel - currentThreat;

        // Calculate scaling factor
        const scaleFactor = 1 + diff * 0.05; // 5% per threat level

        return this.adjustStatsByPercent(scaleFactor);
    }

    /**
     * Adjust all stats by a percentage.
     * @param {number} factor - The scaling factor (e.g., 1.2 for +20%, 0.8 for -20%).
     * @returns {Promise<Actor>}
     */
    adjustStatsByPercent(factor: number): void {
        const updates: Record<string, unknown> = {};

        // Scale characteristics
        for (const [key, char] of Object.entries(this.system.characteristics)) {
            const newBase = Math.round((char.base ?? 0) * factor);
            updates[`system.characteristics.${key}.base`] = Math.max(1, Math.min(99, newBase));
        }

        // Scale wounds
        const newWoundsMax = Math.round(this.system.wounds.max * factor);
        updates['system.wounds.max'] = Math.max(1, newWoundsMax);
        updates['system.wounds.value'] = Math.max(1, newWoundsMax);

        // Update threat level based on factor
        const newThreat = Math.round(this.threatLevel * factor);
        updates['system.threatLevel'] = Math.max(1, Math.min(30, newThreat));

        // Scale armour
        if (this.system.armour.mode === 'simple') {
            const newArmour = Math.round(this.system.armour.total * factor);
            updates['system.armour.total'] = Math.max(0, newArmour);
        } else {
            for (const [loc, value] of Object.entries(this.system.armour.locations)) {
                const newArmour = Math.round(value * factor);
                updates[`system.armour.locations.${loc}`] = Math.max(0, newArmour);
            }
        }

        // Scale horde magnitude if enabled
        if (this.isHordeMode) {
            const newMag = Math.round(this.system.horde.magnitude.max * factor);
            updates['system.horde.magnitude.max'] = Math.max(1, newMag);
            updates['system.horde.magnitude.current'] = Math.max(1, newMag);
        }

        return this.update(updates) as unknown as void;
    }

    /**
     * Convert a horde to a single enemy when magnitude drops too low.
     * Disables horde mode and adjusts stats.
     * @returns {Promise<Actor>}
     */
    convertToSingleEnemy(): unknown {
        if (!this.isHordeMode) return this;

        return this.update({
            'system.horde.enabled': false,
            'system.type': this.system.type === 'swarm' ? 'creature' : 'elite',
        });
    }

    /* -------------------------------------------- */
    /*  Utility Methods                             */
    /* -------------------------------------------- */

    /**
     * Duplicate this NPC with optional modifications.
     * @param {Object} [options] - Duplication options.
     * @param {string} [options.name] - New name for the duplicate.
     * @param {boolean} [options.randomize] - Whether to randomize stats slightly.
     * @returns {Promise<Actor>} The created duplicate.
     */
    duplicate(options: Record<string, unknown> = {}): unknown {
        const data = this.toObject() as Record<string, unknown>;

        // Modify name
        if (typeof options.name === 'string' && options.name !== '') {
            data['name'] = options.name;
        } else {
            data['name'] = `${this.name ?? ''} (Copy)`;
        }

        // Randomize stats slightly if requested
        if (options.randomize === true) {
            const systemData = data['system'] as Record<string, unknown> | undefined;
            const characteristics = systemData?.['characteristics'] as Record<string, Record<string, number>> | undefined;
            if (characteristics !== undefined) {
                for (const key of Object.keys(characteristics)) {
                    const variance = Math.floor(Math.random() * 11) - 5; // -5 to +5
                    const entry = characteristics[key];
                    if (entry !== undefined) {
                        entry['base'] = Math.max(1, Math.min(99, (entry['base'] ?? 0) + variance));
                    }
                }
            }
        }

        // Clear the ID to create a new actor
        delete data['_id'];

        return Actor.create(data as unknown as Actor.CreateData);
    }

    /**
     * Export this NPC as a stat block string.
     * @returns {string} Formatted stat block.
     */
    exportStatBlock(): string {
        const s = this.system;
        let block = `=== ${this.name ?? ''} ===\n`;
        block += `${s.typeLabel} | Threat ${s.threatLevel} | ${s.roleLabel}\n`;
        if (s.faction !== '') block += `Faction: ${s.faction}\n`;
        block += `\n`;

        // Characteristics
        block += `--- Characteristics ---\n`;
        for (const [, char] of Object.entries(s.characteristics)) {
            const unnat = (char.unnatural ?? 0) >= 2 ? ` (×${char.unnatural})` : '';
            block += `${char.short}: ${char.total}${unnat}\n`;
        }
        block += `\n`;

        // Combat
        block += `--- Combat ---\n`;
        block += `Wounds: ${s.wounds.value}/${s.wounds.max}\n`;
        block += `Armour: ${s.armour.mode === 'simple' ? s.armour.total : 'By Location'}\n`;
        block += `Movement: ${s.movement.half}/${s.movement.full}/${s.movement.charge}/${s.movement.run}\n`;
        block += `\n`;

        // Skills
        if (Object.keys(s.trainedSkills).length > 0) {
            block += `--- Skills ---\n`;
            for (const [key, skill] of Object.entries(s.trainedSkills)) {
                const level = skill.plus20 ? '+20' : skill.plus10 ? '+10' : '';
                block += `${skill.name !== undefined && skill.name !== '' ? skill.name : key}${level}: ${s.getSkillTarget(key)}\n`;
            }
            block += `\n`;
        }

        // Weapons
        if ((s.weapons.simple?.length ?? 0) > 0) {
            block += `--- Weapons ---\n`;
            for (const w of s.weapons.simple) {
                block += `${w.name}: ${w.damage}, Pen ${w.pen}`;
                if (w.range !== 'Melee') block += `, ${w.range}, RoF ${w.rof}`;
                if (w.special !== '' && w.special !== undefined) block += ` [${w.special}]`;
                block += `\n`;
            }
            block += `\n`;
        }

        // Talents & Traits
        const talents = this.items.filter((i) => i.type === 'talent');
        const traits = this.items.filter((i) => i.type === 'trait');

        if (talents.length > 0) {
            block += `--- Talents ---\n`;
            block += `${talents.map((t) => t.name).join(', ')}\n\n`;
        }

        if (traits.length > 0) {
            block += `--- Traits ---\n`;
            block += `${traits.map((t) => t.name).join(', ')}\n\n`;
        }

        // Special Abilities
        if (s.specialAbilities !== '' && s.specialAbilities !== undefined) {
            block += `--- Special Abilities ---\n`;
            // Strip HTML tags for plain text export
            block += `${s.specialAbilities.replace(/<[^>]*>/g, '')}\n`;
        }

        return block;
    }

    /* -------------------------------------------- */
    /*  Horde Methods                               */
    /* -------------------------------------------- */

    /**
     * Apply magnitude damage to this NPC (if in horde mode).
     * Delegates to the data model.
     * @param {number} amount - Amount of magnitude to reduce.
     * @param {string} [source] - Source of the damage.
     * @returns {Promise<Actor>}
     */
    applyMagnitudeDamage(amount: number, source = ''): unknown {
        if (typeof this.system.applyMagnitudeDamage === 'function') {
            return this.system.applyMagnitudeDamage(amount, source);
        }
        return this;
    }

    /**
     * Restore magnitude to this NPC (if in horde mode).
     * Delegates to the data model.
     * @param {number} amount - Amount of magnitude to restore.
     * @param {string} [source] - Source of the restoration.
     * @returns {Promise<Actor>}
     */
    restoreMagnitude(amount: number, source = ''): unknown {
        if (typeof this.system.restoreMagnitude === 'function') {
            return this.system.restoreMagnitude(amount, source);
        }
        return this;
    }

    /**
     * Toggle horde mode on/off.
     * Delegates to the data model.
     * @returns {Promise<Actor>}
     */
    toggleHordeMode(): unknown {
        if (typeof this.system.toggleHordeMode === 'function') {
            return this.system.toggleHordeMode();
        }
        return this;
    }
}
