import { prepareDamageRoll } from '../applications/prompts/damage-roll-dialog.ts';
import { prepareUnifiedRoll } from '../applications/prompts/unified-roll-dialog.ts';
import { D100Roll } from '../dice/_module.ts';
import {
    type ActionData,
    DetectionActionData,
    DosReadoutActionData,
    InterrogationActionData,
    MedicaeActionData,
    SocialBuffActionData,
    SocialInfluenceActionData,
} from '../rolls/action-data.ts';
import { ForceFieldData } from '../rolls/force-field-data.ts';
import { firstTargetedActor, promptSkillUse } from '../rolls/skill-use-picker.ts';
import { firstAidDifficultyForTier, getSkillReadout, hasSkillUses, type SkillUseDef } from '../rules/skill-uses.ts';
import { formatRemaining, gateRemaining, isGateOpen } from '../rules/world-time.ts';
import type {
    WH40KActorBio,
    WH40KActorSystemData,
    WH40KArmourLocation,
    WH40KBackpack,
    WH40KEncumbrance,
    WH40KExperience,
    WH40KFate,
    WH40KFatigue,
    WH40KPsy,
    WH40KSkill,
} from '../types/global.d.ts';
import { WH40KBaseActor } from './base-actor.ts';
import type { WH40KItem } from './item.ts';

/** Typed shape of the modifierSources object on a character actor's system data. */
interface CharacterModifierSources {
    characteristics: Record<string, Array<{ value: number }>>;
    skills: Record<string, Array<{ value: number }>>;
    combat: Record<string, Array<{ value: number }>>;
    wounds: Array<{ value: number }>;
    fate: Array<{ value: number }>;
    movement: Array<{ value: number; label?: string }>;
}

/**
 * Narrowed system-data type for character (acolyte) actors.
 * Intersects WH40KActorSystemData with the character-specific overrides so the
 * acolyte document can access required fields without undefined guards.
 * The more-specific field types shadow the optional/looser types from the base.
 */
type WH40KCharacterSystemData = WH40KActorSystemData & {
    insanity: number;
    corruption: number;
    fatigue: WH40KFatigue;
    fate: WH40KFate;
    psy: WH40KPsy;
    bio: WH40KActorBio;
    experience: WH40KExperience;
    aptitudes: string[];
    armour: Record<string, WH40KArmourLocation>;
    encumbrance: WH40KEncumbrance;
    // eslint-disable-next-line no-restricted-syntax -- boundary: backgroundEffects content varies per origin/path config
    backgroundEffects: unknown[];
    // eslint-disable-next-line no-restricted-syntax -- boundary: originPath schema varies by game system
    originPath: Record<string, unknown>;
    backpack: WH40KBackpack;
    modifierSources: CharacterModifierSources;
    totalWoundsModifier: number;
    totalFateModifier: number;
    _getTotalCharacteristicModifier: (charKey: string) => number;
    _getTotalSkillModifier: (skillKey: string) => number;
    _getTotalCombatModifier: (combatKey: string) => number;
};

/** Interface representing a resolved D100Roll result used in opposed tests. */
interface D100RollResult {
    isSuccess: boolean;
    degreesOfSuccess: number;
}

/** Interface representing a skill entry (specialist skill speciality). */
interface SkillEntry {
    name?: string;
    label?: string;
    current?: number;
    /** Effective training rank, computed in CreatureTemplate._prepareSkills. */
    rank?: number;
    trained?: boolean;
}

const SKILL_ALIASES: Record<string, string> = {
    navigate: 'navigation',
};

/**
 * Actor document for Character (Acolyte) actors.
 * Handles roll methods, actions, and API surface.
 * Data preparation is handled by the CharacterData DataModel.
 * @extends {WH40KBaseActor}
 */
export class WH40KAcolyte extends WH40KBaseActor {
    declare system: WH40KBaseActor['system'] & WH40KCharacterSystemData;

    /* -------------------------------------------- */
    /*  Getters                                     */
    /* -------------------------------------------- */

    get backpack(): WH40KBackpack {
        return this.system.backpack;
    }
    get skills(): Record<string, WH40KSkill> {
        return this.system.skills;
    }
    get fatigue(): WH40KFatigue {
        return this.system.fatigue;
    }
    get fate(): WH40KFate {
        return this.system.fate;
    }
    get psy(): WH40KPsy {
        return this.system.psy;
    }
    get bio(): WH40KActorBio {
        return this.system.bio;
    }
    get experience(): WH40KExperience {
        return this.system.experience;
    }
    get insanity(): number {
        return this.system.insanity;
    }
    get corruption(): number {
        return this.system.corruption;
    }
    get aptitudes(): string[] {
        return this.system.aptitudes;
    }
    get armour(): Record<string, WH40KArmourLocation> {
        return this.system.armour;
    }
    get encumbrance(): WH40KEncumbrance {
        return this.system.encumbrance;
    }
    // eslint-disable-next-line no-restricted-syntax -- boundary: forwards backgroundEffects from system data
    get backgroundEffects(): unknown[] {
        return this.system.backgroundEffects;
    }
    // eslint-disable-next-line no-restricted-syntax -- boundary: forwards originPath record from system data
    get originPath(): Record<string, unknown> {
        return this.system.originPath;
    }
    get originPathItems(): WH40KItem[] {
        return this.items.filter((item: WH40KItem) => item.isOriginPath);
    }
    get navigatorPowers(): WH40KItem[] {
        return this.items.filter((item: WH40KItem) => item.isNavigatorPower);
    }
    get shipRoles(): WH40KItem[] {
        return this.items.filter((item: WH40KItem) => item.isShipRole);
    }
    get conditions(): WH40KItem[] {
        return this.items.filter((item: WH40KItem) => item.isCondition);
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /**
     * Prepare data for the actor.
     * The DataModel handles base calculations via prepareDerivedData().
     * This method triggers item-based calculations via prepareEmbeddedData().
     * @override
     */
    override prepareData(): void {
        // Initialize defaults before DataModel runs (cast through unknown for legacy migration paths)
        // eslint-disable-next-line no-restricted-syntax -- boundary: legacy migration path writes through to system data
        const sys = this.system as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- legacy migration: ??= would mask schema default-init bugs
        if (sys['corruption'] === undefined || sys['corruption'] === null) sys['corruption'] = 0;
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- legacy migration: ??= would mask schema default-init bugs
        if (sys['insanity'] === undefined || sys['insanity'] === null) sys['insanity'] = 0;

        // Let the DataModel do base preparation first
        super.prepareData();

        // Now run item-based calculations (DataModel has access to this.parent.items)
        this._runEmbeddedDataPrep();
    }

    /* -------------------------------------------- */
    /*  Modifier Getters (delegate to DataModel)    */
    /* -------------------------------------------- */

    /**
     * Get the total modifier for a characteristic from all sources.
     * @param {string} charKey - The characteristic key
     * @returns {number} The total modifier
     */
    getTotalCharacteristicModifier(charKey: string): number {
        return this.system._getTotalCharacteristicModifier(charKey);
    }

    /**
     * Get the total modifier for a skill from all sources.
     * @param {string} skillKey - The skill key
     * @returns {number} The total modifier
     */
    getTotalSkillModifier(skillKey: string): number {
        return this.system._getTotalSkillModifier(skillKey);
    }

    /**
     * Get the total modifier for a combat stat from all sources.
     * @param {string} combatKey - The combat stat key
     * @returns {number} The total modifier
     */
    getTotalCombatModifier(combatKey: string): number {
        return this.system._getTotalCombatModifier(combatKey);
    }

    /**
     * Get total wounds modifier from all sources.
     * @returns {number} The total wounds modifier
     */
    getTotalWoundsModifier(): number {
        return this.system.totalWoundsModifier;
    }

    /**
     * Get total fate modifier from all sources.
     * @returns {number} The total fate modifier
     */
    getTotalFateModifier(): number {
        return this.system.totalFateModifier;
    }

    /**
     * Get total movement modifier from all sources.
     * @returns {number} The total movement modifier
     */
    getTotalMovementModifier(): number {
        const sources = this.system.modifierSources.movement;
        return sources.reduce((total: number, src: { value: number }) => total + src.value, 0);
    }

    /* -------------------------------------------- */
    /*  Situational Modifiers                       */
    /* -------------------------------------------- */

    /**
     * Collect all situational modifiers from items that apply to a specific type.
     * @param {"characteristics"|"skills"|"combat"} type - The type of situational modifier
     * @param {string} [key] - Optional key to filter by (e.g., "weaponSkill", "dodge", "attack")
     * @returns {Array<{key: string, value: number, condition: string, icon: string, source: string, itemId: string}>}
     */
    getSituationalModifiers(
        type: 'characteristics' | 'skills' | 'combat',
        key: string | null = null,
    ): Array<{ key: string; value: number; condition: string; icon: string; source: string; itemId: string; appliesToVariant?: string }> {
        type SituationalEntry = { key: string; value: number; condition: string; icon?: string; appliesToVariant?: string };
        const modifiers: Array<{ key: string; value: number; condition: string; icon: string; source: string; itemId: string; appliesToVariant?: string }> = [];

        // Collect from all modifier-providing items
        const modifierItems = this.items.filter((item: WH40KItem) => {
            const doc = item;
            return (
                doc.isTalent ||
                doc.isTrait ||
                doc.isCondition ||
                (item.type === 'armour' && item.system.state.equipped === true) ||
                (item.type === 'cybernetic' && item.system.state.equipped === true) ||
                (item.type === 'gear' && item.system.state.equipped === true)
            );
        });

        for (const item of modifierItems) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: per-item modifier blocks vary in shape across systems
            const situationalModifiers = (item.system.modifiers as Record<string, unknown> | undefined)?.['situational'] as Record<string, unknown> | undefined;
            const situational = situationalModifiers?.[type];
            if (!Array.isArray(situational)) continue;

            for (const mod of situational as SituationalEntry[]) {
                // Skip if key filter is provided and doesn't match
                if (key !== null && mod.key !== key) continue;

                modifiers.push({
                    key: mod.key,
                    value: mod.value,
                    condition: mod.condition,
                    icon: mod.icon ?? 'fa-solid fa-exclamation-triangle',
                    source: item.name,
                    itemId: item.id,
                    // Propagate the test-variant tag (#246/#440) so the dialog can gate
                    // a sense-scoped modifier (an auspex tagged "Visual") to its channel.
                    ...(mod.appliesToVariant !== undefined && mod.appliesToVariant !== '' ? { appliesToVariant: mod.appliesToVariant } : {}),
                });
            }
        }

        return modifiers;
    }

    /**
     * Get situational modifiers for a characteristic roll.
     * @param {string} charKey - The characteristic key (e.g., "weaponSkill")
     * @returns {Array} Array of situational modifier objects
     */
    getCharacteristicSituationalModifiers(
        charKey: string,
    ): Array<{ key: string; value: number; condition: string; icon: string; source: string; itemId: string }> {
        return this.getSituationalModifiers('characteristics', charKey);
    }

    /**
     * Get situational modifiers for a skill roll.
     * @param {string} skillKey - The skill key (e.g., "dodge")
     * @returns {Array} Array of situational modifier objects
     */
    getSkillSituationalModifiers(skillKey: string): Array<{ key: string; value: number; condition: string; icon: string; source: string; itemId: string }> {
        return this.getSituationalModifiers('skills', skillKey);
    }

    /**
     * Get situational modifiers for combat rolls.
     * @param {string} [combatKey] - Optional combat key (e.g., "attack", "damage")
     * @returns {Array} Array of situational modifier objects
     */
    getCombatSituationalModifiers(
        combatKey: string | null = null,
    ): Array<{ key: string; value: number; condition: string; icon: string; source: string; itemId: string }> {
        return this.getSituationalModifiers('combat', combatKey);
    }

    /* -------------------------------------------- */
    /*  Roll Methods (New D100Roll System)          */
    /* -------------------------------------------- */

    /**
     * Roll a characteristic test using the unified roll dialog
     * @param {string} charKey - The characteristic key (e.g., "weaponSkill")
     * @param {string} [flavorOverride] - Optional flavor text override
     * @param {Object} [options] - Additional roll options
     * @returns {Promise<ChatMessage|null>}
     */
    // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/require-await, @typescript-eslint/no-misused-promises -- override returns Promise; consumers may await it. Base impl is sync.
    override async rollCharacteristic(charKey: string, flavorOverride?: string, _options: Record<string, unknown> = {}): Promise<void> {
        // Issue #13: Influence is a percentile testable stat (DH2e core p. 28) regardless of
        // whether it currently lives on the Statistics panel (RAW) or the Overview > Resources
        // panel (Homebrew). The DataModel stores it as a flat 0-100 number outside the
        // `characteristics` map, so synthesize a CharacteristicField-shaped target here so
        // both surfaces dispatch through the same unified-roll pipeline.
        if (charKey === 'influence') {
            const value = Number(this.system.influence);
            const influenceRollData = this._buildSimpleSkillRoll({
                key: 'influence',
                type: 'characteristic',
                label: `${game.i18n.localize('WH40K.Characteristic.Influence')} Test`,
                target: value,
                situationalKey: 'influence',
                nameOverride: flavorOverride !== undefined && flavorOverride !== '' ? flavorOverride : undefined,
            });
            prepareUnifiedRoll(influenceRollData);
            return;
        }

        const char = this.system.characteristics[charKey] as (typeof this.system.characteristics)[string] | undefined;
        if (char === undefined) {
            ui.notifications.warn(`Characteristic "${charKey}" not found`);
            return;
        }

        const simpleSkillData = this._buildSimpleSkillRoll({
            key: charKey,
            type: 'characteristic',
            label: `${char.label} Test`,
            target: char.total,
            situationalKey: charKey,
            nameOverride: flavorOverride !== undefined && flavorOverride !== '' ? flavorOverride : undefined,
        });
        prepareUnifiedRoll(simpleSkillData);
    }

    /**
     * Roll a skill test using the unified roll dialog
     * @param {string} skillName - The skill key or name
     * @param {string} [specialityName] - Optional speciality name for specialist skills
     * @param {Object} [options] - Additional roll options
     * @returns {Promise<ChatMessage|null>}
     */
    // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/require-await -- boundary: roll options accept ad-hoc consumer-supplied fields; signature returns Promise for caller compat
    async rollSkill(skillName: string, specialityName?: string | number, _options: Record<string, unknown> = {}): Promise<void> {
        const resolvedSkillName = this._resolveSkillName(skillName);
        const skill = this.skills[resolvedSkillName] as WH40KSkill | undefined;
        if (skill === undefined) {
            ui.notifications.warn(`Unable to find skill ${skillName}`);
            return;
        }
        let label = skill.label;
        let targetValue = skill.current;
        let skillRank: number | undefined;

        // Handle specialist skills
        if (specialityName !== undefined && Array.isArray(skill.entries)) {
            const speciality = this._findSpecialistSkill(skill, specialityName);
            if (speciality) {
                const specialityLabel = speciality.name ?? speciality.label ?? specialityName;
                label = `${label}: ${specialityLabel}`;
                targetValue = speciality.current ?? skill.current;
                // Pass the specialisation entry's own effective rank so the roll dialog
                // treats a trained specialisation as trained. Specialist skills carry
                // their training per-entry; the parent skill's advance is ~0, which the
                // dialog would otherwise read as "untrained" and halve/block (#225).
                skillRank = speciality.rank ?? (speciality.trained === true ? 1 : 0);
            }
        }

        // Skill-use flow (#432): when a skill offers RAW Special Uses (e.g. Medicae),
        // let the player pick one. A target-directed use (First Aid, Surgery) prompts
        // for a target and routes through MedicaeActionData, which auto-applies the
        // healing on resolution. General / informational uses fall through to the
        // normal test below.
        if (hasSkillUses(resolvedSkillName)) {
            const use = await promptSkillUse(resolvedSkillName, label ?? resolvedSkillName);
            if (use === null) return;
            if (use.needsTarget) {
                this._rollTargetedSkillUse(use, resolvedSkillName, label ?? resolvedSkillName, targetValue, skillRank);
                return;
            }
        }

        // Skills with a degrees-of-success readout (#437 knowledge/investigation) route
        // through DosReadoutActionData, which surfaces the DoS interpretation on the card.
        const readoutFamily = getSkillReadout(resolvedSkillName);
        const simpleSkillData = this._buildSimpleSkillRoll({
            key: resolvedSkillName,
            type: 'skill',
            label: `${label} Test`,
            target: targetValue,
            situationalKey: resolvedSkillName,
            ...(readoutFamily !== null ? { instance: new DosReadoutActionData(readoutFamily) } : {}),
            ...(skillRank !== undefined ? { skillRank } : {}),
        });
        prepareUnifiedRoll(simpleSkillData);
    }

    /**
     * Resolve a target-directed skill use (#432/#434/#435): prompt for the target,
     * then route through the ActionData subclass that auto-resolves the use on roll.
     * @param {SkillUseDef} use - The chosen target-directed use
     * @param {string} skillKey - The resolved skill key (situational + roll key)
     * @param {string} skillLabel - The display label for the skill
     * @param {number} targetValue - The skill's roll target
     * @param {number} [skillRank] - The effective skill rank, when known
     */
    _rollTargetedSkillUse(use: SkillUseDef, skillKey: string, skillLabel: string, targetValue: number, skillRank?: number): void {
        const targetActor = firstTargetedActor();
        if (targetActor === null) {
            ui.notifications.warn(game.i18n.format('WH40K.SkillUse.NoTarget', { use: game.i18n.localize(use.labelKey) }));
            return;
        }
        const useLabel = game.i18n.localize(use.labelKey);
        const rollLabel = `${skillLabel}: ${useLabel}`;
        const rankOpt = skillRank !== undefined ? { skillRank } : {};

        // RAW per-target time gates (#458): a use with a cooldown is blocked while the
        // target's gate is closed — e.g. First Aid is once every 24 in-universe hours
        // per patient, and is also blocked while they are under Extended Care (DH2 p109).
        if (!this._checkSkillUseTimeGate(use, targetActor, useLabel)) return;

        // Interrogation (#435): an opposed test vs the subject's Willpower;
        // InterrogationActionData applies fatigue + surfaces the info tier.
        if (use.kind === 'interrogate') {
            const interro = new InterrogationActionData();
            this._buildSimpleSkillRoll({
                key: skillKey,
                type: 'skill',
                label: rollLabel,
                target: targetValue,
                situationalKey: skillKey,
                instance: interro,
                ...(use.difficultyMod !== 0 ? { extraModifiers: { useDifficulty: use.difficultyMod } } : {}),
                ...rankOpt,
            });
            interro.rollData.targetActor = targetActor;
            interro.rollData.isOpposed = true;
            interro.rollData.opposedChar = use.opposedChar ?? 'WP';
            prepareUnifiedRoll(interro);
            return;
        }

        // Social influence (#433): Charm/Command/Intimidate/Deceive vs the target's
        // Willpower (or Scrutiny for Deceive); a win may auto-shift disposition.
        if (use.kind === 'social') {
            const social = new SocialInfluenceActionData(use);
            this._buildSimpleSkillRoll({
                key: skillKey,
                type: 'skill',
                label: rollLabel,
                target: targetValue,
                situationalKey: skillKey,
                instance: social,
                ...rankOpt,
            });
            social.rollData.targetActor = targetActor;
            // Deceive is opposed by the target's Scrutiny SKILL, resolved inside the
            // action; the WP-opposed uses drive the shared characteristic opposition.
            if (use.opposedSkill === undefined && use.opposedChar !== undefined) {
                social.rollData.isOpposed = true;
                social.rollData.opposedChar = use.opposedChar;
            }
            prepareUnifiedRoll(social);
            return;
        }

        // Social buff/debuff (#447): Inspire/Terrify buff an ally, War Cry debuffs an
        // enemy's defence, Blather (opposed vs WP) holds a target inactive.
        if (use.kind === 'socialBuff' && (use.id === 'inspire' || use.id === 'terrify' || use.id === 'warCry' || use.id === 'blather')) {
            const socialBuff = new SocialBuffActionData(use.id);
            this._buildSimpleSkillRoll({
                key: skillKey,
                type: 'skill',
                label: rollLabel,
                target: targetValue,
                situationalKey: skillKey,
                instance: socialBuff,
                ...rankOpt,
            });
            socialBuff.rollData.targetActor = targetActor;
            if (use.opposedChar !== undefined) {
                socialBuff.rollData.isOpposed = true;
                socialBuff.rollData.opposedChar = use.opposedChar;
            }
            prepareUnifiedRoll(socialBuff);
            return;
        }

        // Opposed detection (#434): Stealth/Awareness/Scrutiny/Sleight of Hand vs
        // the target's opposing characteristic; reports win/lose, no state change.
        if (use.kind === 'detect') {
            const detect = new DetectionActionData();
            this._buildSimpleSkillRoll({
                key: skillKey,
                type: 'skill',
                label: rollLabel,
                target: targetValue,
                situationalKey: skillKey,
                instance: detect,
                ...rankOpt,
            });
            detect.rollData.targetActor = targetActor;
            detect.rollData.isOpposed = true;
            detect.rollData.opposedChar = use.opposedChar ?? 'Per';
            prepareUnifiedRoll(detect);
            return;
        }

        // Medicae target uses (#432). RAW First Aid difficulty scales with how
        // hurt the patient is; other uses carry the flat MEDICAE_ACTIONS difficulty.
        const medicae = new MedicaeActionData(use.kind);
        const patientWounds = targetActor.system.wounds;
        const difficulty = use.kind === 'firstAid' ? firstAidDifficultyForTier(patientWounds.value, patientWounds.max) : use.difficultyMod;
        this._buildSimpleSkillRoll({
            key: skillKey,
            type: 'skill',
            label: rollLabel,
            target: targetValue,
            situationalKey: skillKey,
            instance: medicae,
            ...(difficulty !== 0 ? { extraModifiers: { medicaeDifficulty: difficulty } } : {}),
            ...rankOpt,
        });
        medicae.rollData.targetActor = targetActor;
        prepareUnifiedRoll(medicae);
    }

    /**
     * Enforce a use's RAW per-target time gate before the roll (#458). Returns false
     * (and warns with the reason + time remaining) when the target is still inside a
     * cooldown window — First Aid's own 24-hour gate, or the Extended Care state that
     * RAW also forbids treating through (DH2 p109). Uses with no `timeGate` pass.
     */
    _checkSkillUseTimeGate(use: SkillUseDef, targetActor: WH40KBaseActor, useLabel: string): boolean {
        const gate = use.timeGate;
        if (gate === undefined) return true;
        const now = Number(game.time.worldTime);

        // The use's own cooldown, plus (for First Aid) the RAW Extended Care exclusion.
        const blockingKeys = gate.key === 'firstAid' ? [gate.key, 'extendedCare'] : [gate.key];
        for (const key of blockingKeys) {
            const expiry = targetActor.getTimeGate(key);
            if (isGateOpen(expiry, now)) continue;
            const remaining = formatRemaining(gateRemaining(expiry, now));
            const messageKey = key === 'extendedCare' && gate.key !== 'extendedCare' ? 'WH40K.SkillUse.GateExtendedCare' : 'WH40K.SkillUse.GateCooldown';
            ui.notifications.warn(game.i18n.format(messageKey, { use: useLabel, target: targetActor.name, remaining }));
            return false;
        }
        return true;
    }

    /**
     * Roll weapon damage
     * @param {Item} weapon - The weapon item
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- signature returns Promise for caller compat
    async rollWeaponDamage(weapon: WH40KItem): Promise<void> {
        if (weapon.system.state.equipped !== true) {
            // eslint-disable-next-line no-restricted-syntax -- TODO: WH40K.Acolyte.WeaponNotEquipped localization key not yet in en.json
            ui.notifications.warn('Actor must have weapon equipped!');
            return;
        }

        // Calculate damage with Strength Bonus for melee/thrown weapons
        const isMelee = weapon.system.melee === true || weapon.system.isMeleeWeapon === true;
        const isThrown = weapon.system.class === 'thrown';
        const special = weapon.system['special'] as string | string[] | undefined;
        const isGrenade = Array.isArray(special) ? special.includes('grenade') : typeof special === 'string' && special.includes('grenade');

        // Add SB for melee weapons and thrown weapons (except grenades)
        const includeStrengthBonus = isMelee || (isThrown && !isGrenade);
        const strengthBonus = includeStrengthBonus ? this.system.characteristics.strength.bonus : 0;

        // Build damage object with SB included
        // weapon.system.damage can be a string formula or an object with formula/bonus fields
        const rawDamage = weapon.system.damage as { formula?: string; value?: string; bonus?: number } | string | undefined;
        const damageFormula = typeof rawDamage === 'string' ? rawDamage : rawDamage?.formula ?? rawDamage?.value ?? '';
        const damageBonus = typeof rawDamage === 'object' ? rawDamage.bonus ?? 0 : 0;
        const damageData = {
            formula: damageFormula,
            bonus: damageBonus + strengthBonus,
        };

        prepareDamageRoll({
            name: weapon.name,
            damage: damageData,
            damageType: weapon.system['damageType'],
            penetration: weapon.system.penetration,
            targetActor: () => {
                const targetedObjects = game.user.targets;
                if (targetedObjects.size > 0) {
                    const target = targetedObjects.values().next().value;
                    return target?.actor;
                }
                return undefined;
            },
        });
    }

    /**
     * Roll psychic power damage
     * @param {Item} power - The psychic power item
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- signature returns Promise for caller compat
    async rollPsychicPowerDamage(power: WH40KItem): Promise<void> {
        prepareDamageRoll({
            psychicPower: true,
            pr: this.psy.rating,
            name: power.name,
            damage: power.system.damage,
            damageType: power.system['damageType'],
            penetration: power.system.penetration,
        });
    }

    /**
     * Roll/use an item
     * @param {string} itemId - The item ID
     */
    override async rollItem(itemId: string): Promise<void> {
        game.wh40k.log('RollItem', itemId);
        const item = this.items.get(itemId);
        if (!item) return;

        // PC-only branch: force fields must be equipped AND activated.
        if (item.type === 'forceField') {
            if (item.system.state.equipped !== true || item.system.state.activated !== true) {
                // eslint-disable-next-line no-restricted-syntax -- TODO: WH40K.Acolyte.ForceFieldNotReady localization key not yet in en.json
                ui.notifications.warn('Actor must have force field equipped and activated!');
                return;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: ForceFieldData ctor accepts the item document via per-system-typed slot
            prepareUnifiedRoll(new ForceFieldData(this, item as unknown as ConstructorParameters<typeof ForceFieldData>[1]) as unknown as ActionData);
            return;
        }

        // Weapon / psychic / default-vocalize dispatch is shared with NPCs; PCs enforce the equipped check.
        await this._dispatchItemRoll(item, { enforceEquipped: true });
    }

    /** PCs expose their psy rating to vocalized-item enrichHTML (`@pr`). */
    protected override _rollPsyRating(): number | undefined {
        return this.psy.rating;
    }

    /**
     * Roll damage for an item
     * @param {string} itemId - The item ID
     */
    async damageItem(itemId: string): Promise<void> {
        const item = this.items.get(itemId);
        if (!item) return;
        if (item.type === 'weapon') {
            await this.rollWeaponDamage(item);
            return;
        }
        if (item.type === 'psychicPower') {
            await this.rollPsychicPowerDamage(item);
            return;
        }
        ui.notifications.warn(`No actions implemented for item type: ${item.type}`);
    }

    /* -------------------------------------------- */
    /*  Quick Roll Methods (no dialog)              */
    /* -------------------------------------------- */

    /**
     * Perform a quick characteristic check without dialog
     * @param {string} characteristic - The characteristic key
     * @returns {Promise<D100RollResult|null>} The evaluated roll
     */
    override async rollCharacteristicCheck(characteristic: string): Promise<D100RollResult | null> {
        const char = this.getCharacteristicFuzzy(characteristic);
        if (!char) {
            game.wh40k.error('Unable to perform characteristic test. Could not find provided characteristic.', characteristic);
            return null;
        }

        // Quick roll without dialog
        const roll = await D100Roll.evaluate({
            actor: this,
            target: char.total,
            configure: false,
        });

        return roll as D100RollResult | null;
    }

    /**
     * Perform a quick skill check without dialog — used by opposed skill contests
     * (e.g. Deceive vs the target's Scrutiny, #433).
     * @param {string} skillKey - The skill key
     * @returns {Promise<D100RollResult|null>} The evaluated roll
     */
    override async rollSkillCheck(skillKey: string): Promise<D100RollResult | null> {
        const skill = this.getSkillFuzzy(skillKey) as WH40KSkill | undefined;
        if (skill === undefined) {
            game.wh40k.error('Unable to perform skill test. Could not find provided skill.', skillKey);
            return null;
        }

        const roll = await D100Roll.evaluate({
            actor: this,
            target: skill.current,
            configure: false,
        });

        return roll as D100RollResult | null;
    }

    /**
     * Perform a quick d100 check against a target number
     * @param {number} targetNumber - The target number
     * @returns {Promise<D100RollResult|null>} The evaluated roll
     */
    async rollCheck(targetNumber: number): Promise<D100RollResult | null> {
        const roll = await D100Roll.evaluate({
            actor: this,
            target: targetNumber,
            configure: false,
        });

        return roll as D100RollResult | null;
    }

    /**
     * Perform an opposed characteristic test
     * @param {Actor} targetActor - The opposing actor
     * @param {string} characteristic - The characteristic to test
     * @returns {Promise<Object>} The opposed test result
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: opposed test result is a structural shape consumed by chat templates
    async opposedCharacteristicTest(targetActor: Actor | null, characteristic: string): Promise<unknown> {
        const sourceRoll = await this.rollCharacteristicCheck(characteristic);
        // eslint-disable-next-line no-restricted-syntax -- boundary: target Actor narrowed to WH40KAcolyte for opposed test API
        const wh40kTarget = targetActor as unknown as WH40KAcolyte | null;
        const targetRoll = wh40kTarget ? await wh40kTarget.rollCharacteristicCheck(characteristic) : null;
        return this.opposedTest(sourceRoll, targetRoll);
    }

    /**
     * Compare two roll results for opposed tests
     * @param {D100Roll} rollCheckSource - The source actor's roll
     * @param {D100Roll} rollCheckTarget - The target actor's roll
     * @returns {Object} The opposed test result
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: opposed test result is a structural shape consumed by chat templates
    opposedTest(rollCheckSource: D100RollResult | null | undefined, rollCheckTarget: D100RollResult | null | undefined): unknown {
        if (!rollCheckSource) return null;

        if (rollCheckTarget) {
            let success = false;
            if (rollCheckSource.isSuccess) {
                if (!rollCheckTarget.isSuccess) {
                    success = true;
                } else {
                    success = rollCheckSource.degreesOfSuccess >= rollCheckTarget.degreesOfSuccess;
                }
            }
            return {
                source: rollCheckSource,
                target: rollCheckTarget,
                success: success,
            };
        } else {
            return {
                source: rollCheckSource,
                success: rollCheckSource.isSuccess,
            };
        }
    }

    /* -------------------------------------------- */
    /*  Skill Helpers                               */
    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: fuzzy lookup returns a per-system skill record shape
    getSkillFuzzy(skillName: string): unknown {
        const resolvedSkillName = this._resolveSkillName(skillName);
        const skill = this.skills[resolvedSkillName] as WH40KSkill | undefined;
        if (skill !== undefined) return skill;

        for (const [name, foundSkill] of Object.entries(this.skills)) {
            if (skillName.toUpperCase() === name.toUpperCase()) {
                return foundSkill;
            }
        }
        return undefined;
    }

    _findSpecialistSkill(skill: WH40KSkill, specialityName: string | number): SkillEntry | undefined {
        if (!Array.isArray(skill.entries)) return undefined;
        const entries = skill.entries as SkillEntry[];
        if (Number.isInteger(specialityName)) return entries[specialityName as number];

        const index = Number.parseInt(String(specialityName), 10);
        if (!Number.isNaN(index) && (entries[index] as SkillEntry | undefined) !== undefined) return entries[index];

        return entries.find((entry) => entry.name?.toLowerCase() === `${specialityName}`.toLowerCase());
    }

    _resolveSkillName(skillName: string): string {
        if (skillName === '') return skillName;
        if ((this.skills[skillName] as WH40KSkill | undefined) !== undefined) return skillName;

        const alias = SKILL_ALIASES[skillName.toLowerCase()] as string | undefined;
        if (alias !== undefined && (this.skills[alias] as WH40KSkill | undefined) !== undefined) {
            return alias;
        }

        return skillName;
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
                        if (!t.name.includes(word)) return false;
                    }
                    return true;
                }) !== undefined
        );
    }

    /* -------------------------------------------- */
    /*  Fate Actions                                */
    /* -------------------------------------------- */

    override async spendFate(): Promise<void> {
        await this.update({
            system: { fate: { value: this.system.fate.value - 1 } },
        });
    }
}
