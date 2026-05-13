import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import BaseGrantData, { type GrantApplicationResult, type GrantApplyOptions, type GrantRestoreData, type GrantSummary } from './base-grant.ts';

/** Specialist-skill sub-entry on the actor schema. */
interface SkillEntry {
    name?: string;
    specialization?: string;
    trained: boolean;
    plus10: boolean;
    plus20: boolean;
    bonus: number;
}

/** Skill object on the actor schema. */
interface SkillRecord {
    label?: string;
    trained: boolean;
    plus10: boolean;
    plus20: boolean;
    entries?: SkillEntry[];
}

/** Subset of `actor.system` fields read by the skill grant. */
interface SkillActorSystem {
    skills: Partial<Record<string, SkillRecord>>;
}

const skillSystem = (actor: WH40KBaseActor): SkillActorSystem => actor.system;

/**
 * Interface for a single skill grant configuration.
 */
interface SkillGrantConfig {
    key: string;
    specialization: string;
    level: string;
    optional: boolean;
}

/**
 * Interface for the state of an applied skill grant.
 */
interface SkillAppliedState {
    schemaKey: string;
    specialization?: string;
    entryIndex?: number;
    previousLevel: string | null;
    newLevel: string;
    upgraded?: boolean;
    created?: boolean;
}

/**
 * Grant that provides skill training to an actor.
 * Can grant new skills or upgrade existing skill levels.
 *
 * @extends BaseGrantData
 */
export default class SkillGrantData extends BaseGrantData {
    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    static override TYPE = 'skill';
    static override ICON = 'icons/svg/book.svg';

    /**
     * Valid skill training levels.
     * @type {object}
     */
    static TRAINING_LEVELS: Record<string, { order: number; label: string; bonus: number } | undefined> = {
        known: { order: 1, label: 'WH40K.Skill.Level.Known', bonus: 0 },
        trained: { order: 1, label: 'WH40K.Skill.Level.Trained', bonus: 0 }, // RT/DH1e/DW rank 1 alias
        plus10: { order: 2, label: 'WH40K.Skill.Level.Plus10', bonus: 10 }, // RT/DH1e/DW rank 2 alias
        experienced: { order: 3, label: 'WH40K.Skill.Level.Experienced', bonus: 20 },
        plus20: { order: 3, label: 'WH40K.Skill.Level.Plus20', bonus: 20 }, // RT/DH1e/DW rank 3 alias
        veteran: { order: 4, label: 'WH40K.Skill.Level.Veteran', bonus: 30 },
        plus30: { order: 4, label: 'WH40K.Skill.Level.Plus30', bonus: 30 }, // DH2e/BC/OW rank 4 alias
    };

    /** Property declarations */
    declare skills: SkillGrantConfig[];
    declare applied: Record<string, SkillAppliedState>;

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // Skills to grant
            skills: new fields.ArrayField(
                new fields.SchemaField({
                    // Skill key (e.g., "athletics", "commonLore")
                    key: new fields.StringField({ required: true }),
                    // Specialization for specialist skills
                    specialization: new fields.StringField({ required: false, blank: true }),
                    // Training level to grant
                    level: new fields.StringField({
                        required: true,
                        initial: 'trained',
                        choices: Object.keys(SkillGrantData.TRAINING_LEVELS),
                    }),
                    // Can player skip this skill?
                    optional: new fields.BooleanField({ initial: false }),
                }),
                { required: true, initial: [] },
            ),

            // Applied state - tracks what was granted
            // Format: { "skillKey:specialization": { itemId, previousLevel } }
            applied: new fields.ObjectField({ required: true, initial: {} }),
        };
    }

    /* -------------------------------------------- */
    /*  Grant Application Methods                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _applyGrant(actor: WH40KBaseActor, data: GrantRestoreData, options: GrantApplyOptions, result: GrantApplicationResult): Promise<void> {
        const selectedSkills = Array.isArray(data['selected']) ? (data['selected'] as string[]) : this.skills.map((s) => this._getSkillKey(s));
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document.update payload
        const updates: Record<string, unknown> = {};

        for (const skillConfig of this.skills) {
            const skillKey = this._getSkillKey(skillConfig);

            if (!selectedSkills.includes(skillKey)) {
                if (!skillConfig.optional && !this.optional) result.errors.push(`Required skill ${skillKey} not selected`);
                continue;
            }

            const schemaKey = this._getSchemaSkillKey(skillConfig.key);
            const specialization = skillConfig.specialization;

            if (schemaKey === null) {
                result.errors.push(`Unknown skill: ${skillConfig.key}`);
                continue;
            }

            const currentSkill = skillSystem(actor).skills[schemaKey];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety: actor data may lack key
            if (currentSkill === undefined) {
                result.errors.push(`Skill not found on actor: ${schemaKey}`);
                continue;
            }

            const upgradeResult =
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: legacy data may lack specialization
                specialization !== '' && Array.isArray(currentSkill.entries)
                    ? this._applySpecialistSkillUpgrade(actor, schemaKey, specialization, skillConfig.level, updates, result)
                    : this._applyStandardSkillUpgrade(actor, schemaKey, skillConfig.level, updates, result);

            if (upgradeResult) {
                result.applied[skillKey] = upgradeResult;
            }
        }

        await this._applyUpdates(actor, updates, options);
    }

    /**
     * Apply upgrade to a standard (non-specialist) skill.
     * @private
     */
    _applyStandardSkillUpgrade(
        actor: WH40KBaseActor,
        schemaKey: string,
        targetLevel: string,
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document.update payload
        updates: Record<string, unknown>,
        result: GrantApplicationResult,
    ): SkillAppliedState | null {
        const ctor = this.constructor as typeof SkillGrantData;
        const currentSkill = skillSystem(actor).skills[schemaKey];
        if (currentSkill === undefined) return null;
        const currentLevel = this._getSchemaSkillLevel(currentSkill);
        const currentOrder = ctor.TRAINING_LEVELS[currentLevel]?.order ?? 0;
        const targetOrder = ctor.TRAINING_LEVELS[targetLevel]?.order ?? 0;

        if (targetOrder <= currentOrder) {
            result.notifications.push(`${currentSkill.label ?? schemaKey} already at or above ${targetLevel}`);
            return null;
        }

        // Apply the upgrade
        const levelUpdates = this._getLevelUpdates(targetLevel);
        for (const [field, value] of Object.entries(levelUpdates)) {
            updates[`system.skills.${schemaKey}.${field}`] = value;
        }

        const levelLabel = game.i18n.localize(ctor.TRAINING_LEVELS[targetLevel]?.label ?? targetLevel);
        result.notifications.push(`${currentSkill.label ?? schemaKey}: ${levelLabel}`);

        return {
            schemaKey,
            previousLevel: currentLevel,
            newLevel: targetLevel,
            upgraded: true,
        };
    }

    /**
     * Apply upgrade to a specialist skill entry.
     * @private
     */
    _applySpecialistSkillUpgrade(
        actor: WH40KBaseActor,
        schemaKey: string,
        specialization: string,
        targetLevel: string,
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document.update payload
        updates: Record<string, unknown>,
        result: GrantApplicationResult,
    ): SkillAppliedState | null {
        const ctor = this.constructor as typeof SkillGrantData;
        const currentSkill = skillSystem(actor).skills[schemaKey];
        if (currentSkill === undefined) return null;
        const entries: SkillEntry[] = currentSkill.entries ?? [];

        // Find existing entry with this specialization
        const entryIndex = entries.findIndex(
            (e) => (e.name ?? '').toLowerCase() === specialization.toLowerCase() || (e.specialization ?? '').toLowerCase() === specialization.toLowerCase(),
        );

        if (entryIndex >= 0) {
            // Upgrade existing entry
            const entry = entries[entryIndex];
            const currentLevel = this._getSchemaSkillLevel(entry);
            const currentOrder = ctor.TRAINING_LEVELS[currentLevel]?.order ?? 0;
            const targetOrder = ctor.TRAINING_LEVELS[targetLevel]?.order ?? 0;

            if (targetOrder <= currentOrder) {
                result.notifications.push(`${currentSkill.label ?? schemaKey} (${specialization}) already at or above ${targetLevel}`);
                return null;
            }

            // Update the entry
            const levelUpdates = this._getLevelUpdates(targetLevel);
            for (const [field, value] of Object.entries(levelUpdates)) {
                updates[`system.skills.${schemaKey}.entries.${entryIndex}.${field}`] = value;
            }

            const levelLabel = game.i18n.localize(ctor.TRAINING_LEVELS[targetLevel]?.label ?? targetLevel);
            result.notifications.push(`${currentSkill.label ?? schemaKey} (${specialization}): ${levelLabel}`);

            return {
                schemaKey,
                specialization,
                entryIndex,
                previousLevel: currentLevel,
                newLevel: targetLevel,
                upgraded: true,
            };
        } else {
            // Create new entry
            const newEntry = {
                name: specialization,
                specialization: specialization,
                trained: targetLevel !== 'known',
                plus10: targetLevel === 'plus10' || targetLevel === 'plus20',
                plus20: targetLevel === 'plus20',
                bonus: 0,
            };

            // Add to entries array
            const newEntries = [...entries, newEntry];
            updates[`system.skills.${schemaKey}.entries`] = newEntries;

            const levelLabel = game.i18n.localize(ctor.TRAINING_LEVELS[targetLevel]?.label ?? targetLevel);
            result.notifications.push(`${currentSkill.label ?? schemaKey} (${specialization}): ${levelLabel} (new)`);

            return {
                schemaKey,
                specialization,
                entryIndex: newEntries.length - 1,
                previousLevel: null,
                newLevel: targetLevel,
                created: true,
            };
        }
    }

    /**
     * Get the schema skill key from various input formats.
     * @private
     */
    _getSchemaSkillKey(key: string): string | null {
        if (!key) return null;

        // Normalize the key
        const normalized = key.toLowerCase().replace(/[\s-]/g, '');

        // Map of common variants to schema keys
        const keyMap: Record<string, string | undefined> = {
            // Standard skills
            'acrobatics': 'acrobatics',
            'awareness': 'awareness',
            'barter': 'barter',
            'blather': 'blather',
            'carouse': 'carouse',
            'charm': 'charm',
            'chemuse': 'chemUse',
            'chem-use': 'chemUse',
            'climb': 'climb',
            'command': 'command',
            'commerce': 'commerce',
            'concealment': 'concealment',
            'contortionist': 'contortionist',
            'deceive': 'deceive',
            'demolition': 'demolition',
            'disguise': 'disguise',
            'dodge': 'dodge',
            'evaluate': 'evaluate',
            'gamble': 'gamble',
            'inquiry': 'inquiry',
            'interrogation': 'interrogation',
            'intimidate': 'intimidate',
            'invocation': 'invocation',
            'literacy': 'literacy',
            'logic': 'logic',
            'medicae': 'medicae',
            'psyniscience': 'psyniscience',
            'scrutiny': 'scrutiny',
            'search': 'search',
            'security': 'security',
            'shadowing': 'shadowing',
            'silentmove': 'silentMove',
            'silent move': 'silentMove',
            'sleightofhand': 'sleightOfHand',
            'sleight of hand': 'sleightOfHand',
            'survival': 'survival',
            'swim': 'swim',
            'tracking': 'tracking',
            'wrangling': 'wrangling',
            // Specialist skills
            'ciphers': 'ciphers',
            'cipher': 'ciphers',
            'commonlore': 'commonLore',
            'common lore': 'commonLore',
            'drive': 'drive',
            'forbiddenlore': 'forbiddenLore',
            'forbidden lore': 'forbiddenLore',
            'navigation': 'navigation',
            'performer': 'performer',
            'pilot': 'pilot',
            'scholasticlore': 'scholasticLore',
            'scholastic lore': 'scholasticLore',
            'secrettongue': 'secretTongue',
            'secret tongue': 'secretTongue',
            'speaklanguage': 'speakLanguage',
            'speak language': 'speakLanguage',
            'techuse': 'techUse',
            'tech-use': 'techUse',
            'trade': 'trade',
        };

        return keyMap[normalized] ?? keyMap[key.toLowerCase()] ?? null;
    }

    /**
     * Get current training level from a schema skill object.
     * @private
     */
    _getSchemaSkillLevel(skill: SkillRecord | SkillEntry | undefined): string {
        if (skill?.plus20 === true) return 'plus20';
        if (skill?.plus10 === true) return 'plus10';
        if (skill?.trained === true) return 'trained';
        return 'known';
    }

    /** @inheritDoc */
    /* eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update payload + per-skill restore record */
    override async reverse(actor: WH40KBaseActor, appliedState: Record<string, SkillAppliedState>): Promise<{ skills: Array<Record<string, unknown>> }> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: per-skill restore record shape varies
        const restoreData: { skills: Array<Record<string, unknown>> } = { skills: [] };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document.update payload
        const updates: Record<string, unknown> = {};
        const system = skillSystem(actor);

        for (const [key, state] of Object.entries(appliedState)) {
            if (!state.schemaKey) continue;

            if (state.created === true && state.specialization !== undefined) {
                // Remove created specialist entry
                const currentSkill = system.skills[state.schemaKey];
                if (currentSkill?.entries !== undefined && state.entryIndex !== undefined) {
                    const newEntries: SkillEntry[] = [...currentSkill.entries];
                    newEntries.splice(state.entryIndex, 1);
                    updates[`system.skills.${state.schemaKey}.entries`] = newEntries;
                    restoreData.skills.push({ key, removed: true, specialization: state.specialization });
                }
            } else if (state.upgraded === true && state.previousLevel !== null && state.previousLevel !== '') {
                // Revert to previous level
                const levelUpdates = this._getLevelUpdates(state.previousLevel);

                if (state.specialization !== undefined && state.entryIndex !== undefined) {
                    // Specialist skill entry
                    for (const [field, value] of Object.entries(levelUpdates)) {
                        updates[`system.skills.${state.schemaKey}.entries.${state.entryIndex}.${field}`] = value;
                    }
                } else {
                    // Standard skill
                    for (const [field, value] of Object.entries(levelUpdates)) {
                        updates[`system.skills.${state.schemaKey}.${field}`] = value;
                    }
                }
                restoreData.skills.push({ key, reverted: true, previousLevel: state.previousLevel });
            }
        }

        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
        }

        return restoreData;
    }

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: payload feeds into apply() data
    override getAutomaticValue(): Record<string, unknown> | false {
        if (this.optional) return false;
        if (this.skills.some((s) => s.optional)) return false;
        return { selected: this.skills.map((s) => this._getSkillKey(s)) };
    }

    /** @inheritDoc */
    override async getSummary(): Promise<GrantSummary> {
        const ctor = this.constructor as typeof SkillGrantData;
        const summary = await super.getSummary();
        summary.icon = ctor.ICON;

        for (const skillConfig of this.skills) {
            const levelLabel = game.i18n.localize(ctor.TRAINING_LEVELS[skillConfig.level]?.label ?? skillConfig.level);

            let skillLabel = skillConfig.key;
            if (skillConfig.specialization) {
                skillLabel = `${skillConfig.key} (${skillConfig.specialization})`;
            }

            summary.details.push({
                label: skillLabel,
                value: levelLabel,
                optional: skillConfig.optional,
            });
        }

        return summary;
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Get a unique key for a skill config.
     * @param {object} skillConfig
     * @returns {string}
     * @private
     */
    _getSkillKey(skillConfig: SkillGrantConfig): string {
        if (skillConfig.specialization) {
            return `${skillConfig.key}:${skillConfig.specialization}`;
        }
        return skillConfig.key;
    }

    /**
     * Get update data for a training level.
     * @param {string} level
     * @returns {object}
     * @private
     */
    _getLevelUpdates(level: string): Record<string, boolean> {
        const updates: Record<string, boolean> = {
            trained: false,
            plus10: false,
            plus20: false,
        };

        switch (level) {
            case 'plus20':
                updates['plus20'] = true;
                updates['plus10'] = true;
                updates['trained'] = true;
                break;
            case 'plus10':
                updates['plus10'] = true;
                updates['trained'] = true;
                break;
            case 'trained':
                updates['trained'] = true;
                break;
        }

        return updates;
    }

    /** @inheritDoc */
    override validateGrant(): string[] {
        const ctor = this.constructor as typeof SkillGrantData;
        const errors = super.validateGrant();

        if (this.skills.length === 0) {
            errors.push('Skill grant has no skills configured');
        }

        for (const skill of this.skills) {
            if (skill.key === '') {
                errors.push('Skill grant entry missing key');
            }
            if (ctor.TRAINING_LEVELS[skill.level] === undefined) {
                errors.push(`Invalid training level: ${skill.level}`);
            }
        }

        return errors;
    }
}
