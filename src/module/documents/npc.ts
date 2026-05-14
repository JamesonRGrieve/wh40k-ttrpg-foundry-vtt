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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- horde may be undefined per noUncheckedIndexedAccess; ?? false guard is intentional
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
    // biome-ignore lint/suspicious/noConfusingVoidType: Foundry _preCreate contract — returning false cancels creation; void means proceed
    protected override async _preCreate(data: never, options: never, user: User.Internal.Implementation): Promise<boolean | void> {
        await super._preCreate(data, options, user);
        // eslint-disable-next-line no-restricted-syntax -- boundary: _preCreate data param is typed as never; cast to Record is necessary to access fields
        const createData = data as Record<string, unknown>;

        // Configure token defaults for NPC V2
        // eslint-disable-next-line no-restricted-syntax -- boundary: token init data passed to updateSource; Record<string, unknown> is the correct boundary type
        const initData: Record<string, unknown> = {
            'token.bar1': { attribute: 'wounds' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.HOSTILE,
            'token.name': createData['name'],
        };

        // If horde type, show magnitude instead of wounds
        // eslint-disable-next-line no-restricted-syntax -- boundary: createData['system'] is untyped from _preCreate; cast is necessary
        const systemData = createData['system'] as Record<string, unknown> | undefined;
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
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- t.name may be null per noUncheckedIndexedAccess; ?? guard is intentional
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
    override rollCharacteristic(characteristicKey: string, flavor?: string): void {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics[key] may be undefined
        const char = this.system.characteristics[characteristicKey];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guard for noUncheckedIndexedAccess; char may be undefined at runtime
        if (char === undefined) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
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
    rollSimpleWeapon(weaponIndex: number): void {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- weapons.simple may be undefined per noUncheckedIndexedAccess
        const weapons = this.system.weapons?.simple ?? [];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: weapons[index] may be undefined
        const weapon = weapons[weaponIndex];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guard for noUncheckedIndexedAccess; weapon may be undefined at runtime
        if (weapon === undefined) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
            ui.notifications.warn(`No weapon at index ${weaponIndex}`);
            return;
        }

        // Determine attack characteristic
        const attackCharKey = weapon.class === 'melee' ? 'weaponSkill' : 'ballisticSkill';
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics[key] may be undefined
        const char = this.system.characteristics[attackCharKey];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guard for noUncheckedIndexedAccess; char may be undefined at runtime
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

        // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- default branch handles all non-weapon/psychicPower item types via vocalize chat
        switch (item.type) {
            case 'weapon': {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- game.settings.get returns unknown at runtime; coercion is intentional
                if (game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.simpleAttackRolls)) {
                    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- isMeleeWeapon is typed as boolean | undefined; coercion is intentional
                    const charKey = item.system.isMeleeWeapon ? 'weaponSkill' : 'ballisticSkill';
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- item.name may be null per fvtt-types; ?? guard is intentional
                    this.rollCharacteristic(charKey, item.name ?? undefined);
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- performWeaponAttack is fire-and-forget in item context
                    DHTargetedActionManager.performWeaponAttack(this, null, item);
                }
                return;
            }
            case 'psychicPower': {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- game.settings.get returns unknown at runtime; coercion is intentional
                if (game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.simplePsychicRolls)) {
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- item.name may be null per fvtt-types; ?? guard is intentional
                    this.rollCharacteristic('willpower', item.name ?? undefined);
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- performPsychicAttack is fire-and-forget in item context
                    DHTargetedActionManager.performPsychicAttack(this, null, item);
                }
                return;
            }
            default: {
                const { DHBasicActionManager } = await import('../actions/basic-action-manager.ts');
                const rawBenefit = item.system['benefit'];
                const rawDescription = item.system.description;
                const htmlContent = typeof rawBenefit === 'string' ? rawBenefit : typeof rawDescription === 'string' ? rawDescription : '';
                await DHBasicActionManager.sendItemVocalizeChat({
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-restricted-syntax -- this.name is a Foundry document property that may be null; boundary: ?? is necessary here, not a DataModel schema gap
                    actor: this.name ?? '',
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- item.name may be null per fvtt-types; ?? guard is intentional
                    name: item.name ?? '',
                    type: item.type.toUpperCase(),
                    // eslint-disable-next-line @typescript-eslint/no-deprecated -- TextEditor is the V14 global; migration to foundry.applications.ux.TextEditor tracked separately
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
    rollSkill(skillName: string, flavor?: string): void {
        const target = this.system.getSkillTarget(skillName);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: trainedSkills[key] may be undefined
        const skill = this.system.trainedSkills[skillName];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- skill may be undefined per noUncheckedIndexedAccess; optional chain is intentional
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: options is an untyped caller-supplied map; Record<string, unknown> is the correct boundary type
    async applyDamage(amount: number, location = 'body', options: Record<string, unknown> = {}): Promise<unknown> {
        const { ignoreArmour = false, ignoreToughness = false } = options;

        // Mark actor as hit this round (for Good armour bonus tracking)
        // eslint-disable-next-line @typescript-eslint/await-thenable -- setFlag may return a thenable in some Foundry builds; await is safe
        await this.setFlag('wh40k-rpg' as never, 'hitThisRound' as never, true as never);

        // Calculate damage reduction
        let reduction = 0;

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- ignoreArmour is typed as unknown from options destructuring; boolean coercion is intentional
        if (!ignoreArmour) {
            reduction += this.system.getArmourForLocation(location);
        }

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- ignoreToughness is typed as unknown from options destructuring; boolean coercion is intentional
        if (!ignoreToughness) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- toughness.bonus may be undefined per noUncheckedIndexedAccess; ?? 0 guard is intentional
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: update() return type is opaque; unknown is the correct boundary type for this utility method
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: delegates to adjustStatsByPercent which returns Promise<void>; unknown is the utility method boundary type
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
    async adjustStatsByPercent(factor: number): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: updates passed to actor.update(); Record<string, unknown> is the correct boundary type
        const updates: Record<string, unknown> = {};

        // Scale characteristics
        for (const [key, char] of Object.entries(this.system.characteristics)) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- char.base may be undefined per noUncheckedIndexedAccess; ?? 0 guard is intentional
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

        await this.update(updates);
    }

    /**
     * Convert a horde to a single enemy when magnitude drops too low.
     * Disables horde mode and adjusts stats.
     * @returns {Promise<Actor>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: update() return type is opaque; unknown is the correct boundary type for this utility method
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
    /* eslint-disable no-restricted-syntax -- boundary: options and data are untyped caller-supplied maps; Actor.create accepts Actor.CreateData cast from unknown */
    duplicate(options: Record<string, unknown> = {}): unknown {
        const data = this.toObject() as Record<string, unknown>;

        // Modify name
        if (typeof options['name'] === 'string' && options['name'] !== '') {
            data['name'] = options['name'];
        } else {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-restricted-syntax -- this.name is a Foundry document property that may be null; boundary: ?? guard is necessary
            data['name'] = `${this.name ?? ''} (Copy)`;
        }

        // Randomize stats slightly if requested
        if (options['randomize'] === true) {
            const systemData = data['system'] as Record<string, unknown> | undefined;
            const characteristics = systemData?.['characteristics'] as Record<string, Record<string, number>> | undefined;
            if (characteristics !== undefined) {
                for (const key of Object.keys(characteristics)) {
                    const variance = Math.floor(Math.random() * 11) - 5; // -5 to +5
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics[key] may be undefined
                    const entry = characteristics[key];
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guard for noUncheckedIndexedAccess; entry may be undefined at runtime
                    if (entry !== undefined) {
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: entry['base'] may be undefined; ?? 0 guard is intentional
                        entry['base'] = Math.max(1, Math.min(99, (entry['base'] ?? 0) + variance));
                    }
                }
            }
        }

        // Clear the ID to create a new actor
        delete data['_id'];

        return Actor.create(data as unknown as Actor.CreateData);
    }
    /* eslint-enable no-restricted-syntax */

    /**
     * Export this NPC as a stat block string.
     * @returns {string} Formatted stat block.
     */
    exportStatBlock(): string {
        const s = this.system;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-restricted-syntax -- this.name is a Foundry document property that may be null; boundary: ?? guard is necessary
        let block = `=== ${this.name ?? ''} ===\n`;
        block += `${s.typeLabel} | Threat ${s.threatLevel} | ${s.roleLabel}\n`;
        if (s.faction !== '') block += `Faction: ${s.faction}\n`;
        block += `\n`;

        // Characteristics
        block += `--- Characteristics ---\n`;
        for (const [, char] of Object.entries(s.characteristics)) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- char.unnatural may be undefined per noUncheckedIndexedAccess; ?? 0 guard is intentional
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
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- skill.name may be undefined per noUncheckedIndexedAccess; check is intentional
                const level = skill.plus20 ? '+20' : skill.plus10 ? '+10' : '';
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- skill.name may be undefined per noUncheckedIndexedAccess; check is intentional
                block += `${skill.name !== undefined && skill.name !== '' ? skill.name : key}${level}: ${s.getSkillTarget(key)}\n`;
            }
            block += `\n`;
        }

        // Weapons
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- weapons.simple may be undefined per noUncheckedIndexedAccess; ?? 0 guard is intentional
        if ((s.weapons.simple?.length ?? 0) > 0) {
            block += `--- Weapons ---\n`;
            for (const w of s.weapons.simple) {
                block += `${w.name}: ${w.damage}, Pen ${w.pen}`;
                if (w.range !== 'Melee') block += `, ${w.range}, RoF ${w.rof}`;
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- w.special may be undefined per noUncheckedIndexedAccess; check is intentional
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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- specialAbilities may be undefined per noUncheckedIndexedAccess; check is intentional
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: applyMagnitudeDamage return type is opaque system extension; unknown is the correct boundary type
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: restoreMagnitude return type is opaque system extension; unknown is the correct boundary type
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: toggleHordeMode return type is opaque system extension; unknown is the correct boundary type
    toggleHordeMode(): unknown {
        if (typeof this.system.toggleHordeMode === 'function') {
            return this.system.toggleHordeMode();
        }
        return this;
    }
}
