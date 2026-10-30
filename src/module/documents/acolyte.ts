import { acquisitionLadderFor, itemRepairRulesFor, SystemConfigRegistry, weaponModificationRulesFor } from '../config/game-systems/index.ts';
import type { GameSystemId } from '../config/game-systems/types.ts';
// Direct, not via dice/_module.ts: that barrel also re-exports
// RollConfigurationDialog, so importing it drags the applications layer into
// every document that just wants a roll class.
import { SYSTEM_ID } from '../constants.ts';
import type { SituationalModifierRow } from '../data/shared/modifiers-template.ts';
import type D100Roll from '../dice/d100-roll.ts';
import { characteristicFromAbbrev, characteristicLabel } from '../helpers/characteristic-labels.ts';
import { t } from '../i18n/t.ts';
import {
    type ChemLike,
    ChemUseActionData,
    type CoatableWeapon,
    PalmActionData,
    ObjectStateActionData,
    DemolitionActionData,
    type ExplosiveItem,
    type StatefulItem,
    DosReadoutActionData,
    MalignancyTestActionData,
    type SimpleSkillData,
    type SkillRollOptions,
    SkillUseActionData,
    type SkillUseItemSource,
    XenosLoreActionData,
} from '../rolls/action-data.ts';
import { EvasionActionData } from '../rolls/evasion-action-data.ts';
import type { EvasionPromptContext } from '../rolls/evasion-flow.ts';
import { ForceFieldActionData } from '../rolls/force-field-data.ts';
import { resolveGainedMalignancy } from '../rolls/malignancy-outcome.ts';
import { openDamagePrompt, openRollPrompt } from '../rolls/roll-prompt.ts';
import { firstTargetedActor, promptItemChoice } from '../rolls/skill-use-picker.ts';
import {
    FitModificationActionData,
    type ModifiableWeapon,
    type ModificationParts,
    RemoveModificationActionData,
} from '../rolls/weapon-modification-action-data.ts';
import { TWISTED_FLESH_FLAG } from '../rules/chaos-backgrounds.ts';
import { formulaWithBonus } from '../rules/damage-profile.ts';
import type { EvasionSkill } from '../rules/evasion.ts';
import { isForceFieldItem } from '../rules/force-field-protection.ts';
import { isGrenadeWeapon } from '../rules/grenade-weapon.ts';
import { craftsmanshipRepairModifier } from '../rules/item-repair.ts';
import { corruptionTrackModifier, malignancyTestsQueued } from '../rules/malignancy-test.ts';
import { activeFailureConsequence, type CollectedSituationalModifier, failureConsequenceField } from '../rules/situational-limits.ts';
import {
    dispatchItemChoiceUse,
    getSkillReadout,
    hasSkillUses,
    type ItemChoiceHandlers,
    type SkillUseDef,
    type SkillUseItemChoice,
    skillUseItemCandidates,
} from '../rules/skill-uses.ts';
import { printedSpecialisationTest } from '../rules/specialist-skill-test.ts';
import { testedSkillBaseLabel, testedSkillLabel } from '../rules/tested-skill-label.ts';
import {
    MODIFICATION_BLOCKER_KEYS,
    type ModifiableWeaponSystem,
    modificationAvailabilityModifier,
    modificationBlocker,
    modificationEntry,
    type ModificationSkill,
    type ModificationSource,
    partsSourceUuid,
} from '../rules/weapon-modification.ts';
import { isXenosEquipment, readXenosRepairInsight, XENOS_REPAIR_INSIGHT_FLAG, xenosRepairModifiers, type XenosRepairRules } from '../rules/xenos-equipment.ts';
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
    gameSystem: GameSystemId;
    insanity: number;
    corruption: number;
    malignancyTestsPending: number;
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

/** The slice of a candidate character update the Malignancy queue reads and writes. */
interface CorruptionChange {
    system?: { corruption?: number; malignancyTestsPending?: number };
}

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

/** A weapon Item read through the personal-modification surface (#136): its fitted list, qualities, class / type and their labels. */
type FittableWeapon = ModifiableWeapon & StatefulItem & { system: ModifiableWeaponSystem & { classLabel: string; typeLabel: string } };

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
    getSituationalModifiers(type: 'characteristics' | 'skills' | 'combat', key: string | null = null): CollectedSituationalModifier[] {
        type SituationalEntry = Pick<SituationalModifierRow, 'key' | 'value' | 'condition'> &
            Partial<Pick<SituationalModifierRow, 'icon' | 'appliesToVariant' | 'oncePerRound' | 'failureConsequence'>>;
        const modifiers: CollectedSituationalModifier[] = [];

        // Collect from all modifier-providing items
        const modifierItems = this.items.filter((item: WH40KItem) => {
            const doc = item;
            return (
                doc.isTalent ||
                doc.isTrait ||
                doc.isCondition ||
                // Origin paths (homeworld/background/role/...) carry scoped situational
                // skill bonuses — e.g. Hive World "+20 Navigate(Surface) in enclosed
                // spaces". Always present (no equipped state), so they surface as roll
                // toggles like talent/trait situationals (#432 origin wiring).
                doc.isOriginPath ||
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
                    // Carries the owning item's document type so the roll dialog can
                    // group gear-sourced modifiers (equipped armour / cybernetics /
                    // gear) into their own labelled chip group, distinct from the
                    // talent / trait / condition ones (#480). Eligibility itself stays
                    // data-driven off the modifier's own `key`, never the item name.
                    sourceType: item.type,
                    itemId: item.id,
                    // Propagate the test-variant tag (#246/#440) so the dialog can gate
                    // a sense-scoped modifier (an auspex tagged "Visual") to its channel.
                    ...(mod.appliesToVariant !== undefined && mod.appliesToVariant !== '' ? { appliesToVariant: mod.appliesToVariant } : {}),
                    // A printed use limit and failure risk ride on the row (#101),
                    // so the dialog enforces them from data, never from the item name.
                    ...(mod.oncePerRound === true ? { oncePerRound: true } : {}),
                    ...failureConsequenceField(activeFailureConsequence(mod.failureConsequence)),
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
    /*  Malignancy Tests                            */
    /* -------------------------------------------- */

    /** Whether this character's line forces a Malignancy Test per 10 Corruption gained. */
    get usesMalignancyTest(): boolean {
        return SystemConfigRegistry.getOrNull(this.system.gameSystem)?.usesMalignancyTest === true;
    }

    /** Whether this character's line charges Corruption for a successful Malefic Daemonology cast. */
    get chargesMaleficCorruption(): boolean {
        return SystemConfigRegistry.getOrNull(this.system.gameSystem)?.maleficCorruptionOnManifest === true;
    }

    /**
     * Queue a Malignancy Test for every 10-CP threshold a Corruption gain
     * crosses, in the same write, so the owed tests survive until rolled however
     * the Corruption arrived (sheet edit, power cost, GM macro). An update that
     * sets the queue explicitly is left alone.
     * @param {never} changed  The candidate update (typed `never` by the framework).
     * @param {never} options  Update options.
     * @param {never} user  The requesting user.
     * @returns {Promise<boolean | undefined>}  `false` aborts the update.
     */
    protected override async _preUpdate(changed: never, options: never, user: never): Promise<boolean | undefined> {
        const allowed = await super._preUpdate(changed, options, user);
        if (allowed === false) return false;

        const delta: CorruptionChange = changed;
        const corruption = delta.system?.corruption;
        if (corruption === undefined || delta.system === undefined || delta.system.malignancyTestsPending !== undefined) return undefined;
        if (!this.usesMalignancyTest) return undefined;
        const pending = this.system.malignancyTestsPending;
        const queued = malignancyTestsQueued(pending, this.system.corruption, corruption);
        if (queued !== pending) delta.system.malignancyTestsPending = queued;
        return undefined;
    }

    /** Whether the Mutant background's Twisted Flesh bonus applies (a DH2 supplement). */
    get hasTwistedFlesh(): boolean {
        return this.getFlag(SYSTEM_ID, TWISTED_FLESH_FLAG) === true;
    }

    /**
     * Roll one owed Malignancy Test. No-op when no test is owed. A Twisted Flesh
     * Mutant is first offered RAW's choice to fail it ("can
     * always choose to fail any test associated with resisting malignancy").
     */
    rollMalignancyTest(): void {
        if (!this.usesMalignancyTest || this.system.malignancyTestsPending <= 0) return;
        if (this.hasTwistedFlesh) {
            void this.#offerTwistedFleshFailure();
            return;
        }
        this.#openMalignancyTest();
    }

    /**
     * Open the Malignancy Test: a Willpower test through the unified roll
     * pipeline, with the Corruption Track modifier as its own named row on the
     * card. Rolling spends a queued test; a failure draws on the line's
     * Malignancies table (or, with Twisted Flesh, Mutations if chosen).
     */
    #openMalignancyTest(): void {
        const willpower = this.characteristics['willpower'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics[key] may be undefined at runtime
        if (willpower === undefined) return;

        const ledger = {
            consume: async (): Promise<void> => this.#adjustMalignancyTests(-1),
            refund: async (): Promise<void> => this.#adjustMalignancyTests(1),
        };
        const rollData = this._buildSimpleSkillRoll({
            key: 'willpower',
            type: 'characteristic',
            label: t('WH40K.Malignancy.TestLabel'),
            target: willpower.total,
            situationalKey: 'willpower',
            extraModifiers: { 'corruption-track': corruptionTrackModifier(this.system.corruption) },
            instance: new MalignancyTestActionData(ledger, this.system.gameSystem, this.hasTwistedFlesh),
        });
        openRollPrompt(rollData);
    }

    /**
     * Twisted Flesh: resist with the Willpower test as normal, or choose to fail
     * it. Choosing to fail spends the owed test with no roll and resolves the
     * gained Malignancy straight away, where the Mutant may take a Mutation
     * instead. Dismissing the choice spends nothing.
     */
    async #offerTwistedFleshFailure(): Promise<void> {
        const choice = await promptItemChoice(
            [
                { id: 'resist', name: t('WH40K.Malignancy.TwistedFlesh.Resist') },
                { id: 'fail', name: t('WH40K.Malignancy.TwistedFlesh.ChooseFail') },
            ],
            t('WH40K.Malignancy.TwistedFlesh.Title'),
            t('WH40K.Malignancy.TwistedFlesh.ResistHint'),
        );
        if (choice === null) return;
        if (choice.id === 'resist') {
            this.#openMalignancyTest();
            return;
        }
        await this.#adjustMalignancyTests(-1);
        await resolveGainedMalignancy(this.system.gameSystem, true);
    }

    /** Move the owed-test queue by `delta`, never below zero. */
    async #adjustMalignancyTests(delta: number): Promise<void> {
        await this.update({ 'system.malignancyTestsPending': Math.max(0, this.system.malignancyTestsPending + delta) });
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
        // Issue #13: Influence is a percentile testable stat (DH2 RAW) regardless of
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
            openRollPrompt(influenceRollData);
            return;
        }

        const char = this.system.characteristics[charKey] as (typeof this.system.characteristics)[string] | undefined;
        if (char === undefined) {
            ui.notifications.warn(game.i18n.format('WH40K.Notify.Acolyte.CharacteristicNotFound', { characteristic: charKey }));
            return;
        }

        const simpleSkillData = this._buildSimpleSkillRoll({
            key: charKey,
            type: 'characteristic',
            label: game.i18n.format('WH40K.Roll.TestLabel', { name: char.label }),
            target: char.total,
            situationalKey: charKey,
            nameOverride: flavorOverride !== undefined && flavorOverride !== '' ? flavorOverride : undefined,
        });
        openRollPrompt(simpleSkillData);
    }

    /**
     * Roll a skill test using the unified roll dialog
     * @param {string} skillName - The skill key or name
     * @param {string} [specialityName] - Optional speciality name for specialist skills
     * @param {Object} [options] - Additional roll options
     * @param {SimpleSkillData} [options.instance] - Route the test through this action subclass (e.g. an evasion, #414)
     * @returns {Promise<ChatMessage|null>}
     */
    async rollSkill(skillName: string, specialityName?: string | number, options: SkillRollOptions = {}): Promise<void> {
        const resolvedSkillName = this._resolveSkillName(skillName);
        const skill = this.skills[resolvedSkillName] as WH40KSkill | undefined;
        if (skill === undefined) {
            ui.notifications.warn(game.i18n.format('WH40K.Notify.Acolyte.SkillNotFound', { skill: skillName }));
            return Promise.resolve();
        }
        let label = skill.label;
        let targetValue = skill.current;
        let skillRank: number | undefined;

        // Handle specialist skills. A rule-named specialisation (a vehicle's driving
        // skill) is that one or untrained; a sheet's speciality is the clicked entry.
        const speciality = specialityName === undefined ? undefined : this._findSpecialistSkill(skill, specialityName);
        let specialityLabel: string | undefined;
        if (options.specialisation !== undefined) {
            const printed = printedSpecialisationTest(
                label ?? resolvedSkillName,
                skill.current,
                this._findSpecialistSkill(skill, options.specialisation),
                options.specialisation,
            );
            label = printed.label;
            targetValue = printed.target;
            skillRank = printed.skillRank;
        } else if (speciality !== undefined) {
            specialityLabel = String(speciality.name ?? speciality.label ?? specialityName);
            label = `${label}: ${specialityLabel}`;
            targetValue = speciality.current ?? skill.current;
            // Pass the specialisation entry's own effective rank so the roll dialog
            // treats a trained specialisation as trained. Specialist skills carry
            // their training per-entry; the parent skill's advance is ~0, which the
            // dialog would otherwise read as "untrained" and halve/block (#225).
            skillRank = speciality.rank ?? (speciality.trained === true ? 1 : 0);
        }

        // Skill-use flow (#432): when a skill offers RAW Special Uses (e.g. Medicae),
        // let the player pick one. A target-directed use (First Aid, Surgery) prompts
        // for a target and routes through MedicaeActionData, which auto-applies the
        // healing on resolution. General / informational uses fall through to the
        // normal test below.
        // A caller-supplied action (an evasion, #414) owns the outcome, so the
        // skill's Special Uses and readout are not offered.
        if (
            options.instance === undefined &&
            options.sourcedModifiers === undefined &&
            hasSkillUses(resolvedSkillName) &&
            this._dispatchSkillUse(resolvedSkillName, label ?? resolvedSkillName, targetValue, skillRank)
        ) {
            return Promise.resolve();
        }

        // Skills with a degrees-of-success readout (#437 knowledge/investigation) route
        // through DosReadoutActionData, which surfaces the DoS interpretation on the card.
        const readoutFamily = getSkillReadout(resolvedSkillName);
        const instance = options.instance ?? (readoutFamily !== null ? new DosReadoutActionData(readoutFamily) : undefined);
        const simpleSkillData = this._buildSimpleSkillRoll({
            key: resolvedSkillName,
            type: 'skill',
            label: options.label ?? game.i18n.format('WH40K.Roll.TestLabel', { name: label ?? resolvedSkillName }),
            target: targetValue,
            situationalKey: resolvedSkillName,
            ...(instance !== undefined ? { instance } : {}),
            ...(skillRank !== undefined ? { skillRank } : {}),
            sourcedModifiers: options.sourcedModifiers,
            // A test titled after something else (a vehicle's trait test) names the skill it rolled (#677).
            tested:
                options.label === undefined
                    ? undefined
                    : this.#testedSkill(skill, resolvedSkillName, options.specialisation ?? specialityLabel ?? null, skillRank),
        });
        openRollPrompt(simpleSkillData);
        return Promise.resolve();
    }

    /**
     * Roll this character's Dodge or Parry against the attack a prompt names (#414),
     * through the normal skill pipeline: the card shows every modifier with its source,
     * then scores the result against the attack.
     * @param {EvasionPromptContext} prompt  The attack being evaded.
     * @param {EvasionSkill} skill  The evasion skill.
     */
    async rollEvasionTest(prompt: EvasionPromptContext, skill: EvasionSkill): Promise<void> {
        return this.rollSkill(skill, undefined, { instance: await EvasionActionData.forActor(this, prompt, skill) });
    }

    /**
     * Open the Roll Test dialog for a skill with Special Uses (#432). Returns true:
     * the dialog owns the roll. Every choice the roll needs is made inside that one
     * dialog: the use, the target for a target-directed use, and the item(s) for an
     * item-choice use (#535). The concrete action is built when the roll resolves,
     * from whatever the player finally picked.
     */
    _dispatchSkillUse(skillKey: string, skillLabel: string, targetValue: number, skillRank?: number): boolean {
        const action = new SkillUseActionData(skillKey, skillLabel, undefined, this._skillUseItemSource());
        this._buildSimpleSkillRoll({
            key: skillKey,
            type: 'skill',
            label: game.i18n.format('WH40K.Roll.TestLabel', { name: skillLabel }),
            target: targetValue,
            situationalKey: skillKey,
            instance: action,
            ...(skillRank !== undefined ? { skillRank } : {}),
        });
        action.rollData.targetActor = firstTargetedActor();
        action.syncSkillUse();
        openRollPrompt(action);
        return true;
    }

    /**
     * The inventory the roll dialog's item pickers draw on (#535): this actor's
     * carried items and the target's. Confirming a pick dispatches to the use
     * family's handler below, which builds the concrete action.
     */
    _skillUseItemSource(): SkillUseItemSource {
        const handlersFor = (target: WH40KBaseActor | null): ItemChoiceHandlers<SimpleSkillData | null> => ({
            chem: (use, chemId, weaponId) => this._chemUseAction(use, chemId, weaponId),
            palm: (use, itemId) => this._palmAction(use, itemId),
            objectState: (use, itemId) => this._objectStateAction(use, itemId, target),
            demolition: (use, itemId) => this._demolitionAction(use, itemId, target),
        });
        return {
            candidates: (use, slot, target) =>
                skillUseItemCandidates(use, slot, this.items.contents, target?.items.contents ?? null).flatMap((item) =>
                    item.id === null ? [] : [{ id: item.id, name: item.name }],
                ),
            modifiers: (use, choice, target) => this._skillUseItemModifiers(use, choice, target),
            beforeRoll: async (use, choice, target) => this._beforeItemUseRoll(use, choice, target),
            build: (use, choice, target) => dispatchItemChoiceUse(use, choice, handlersFor(target)),
        };
    }

    /** The picked item, from the target's inventory when it is there, else this actor's. */
    _skillUseItem(itemId: string, target: WH40KBaseActor | null): WH40KItem | null {
        return target?.items.get(itemId) ?? this.items.get(itemId) ?? null;
    }

    /**
     * Chem-Use (#441): ChemUseActionData applies a dose of the picked chem to the
     * TARGET on success, or to the applicant on a botch (OW/BC RAW). Coating puts it
     * on the picked weapon instead.
     */
    _chemUseAction(use: SkillUseDef, chemId: string, weaponId: string | null): ChemUseActionData | null {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Item#system is the per-type DataModel union; a carried chem Item satisfies ChemLike structurally (dose payload + update)
        const chem = this.items.get(chemId) as unknown as ChemLike | undefined;
        if (chem === undefined) return null;
        if (use.kind !== 'coatWeapon') return new ChemUseActionData('applyChem', chem);
        // eslint-disable-next-line no-restricted-syntax -- boundary: a weapon Item satisfies CoatableWeapon structurally (id/name/update)
        const weapon = weaponId === null ? undefined : (this.items.get(weaponId) as unknown as CoatableWeapon | undefined);
        return weapon === undefined ? null : new ChemUseActionData('coatWeapon', chem, weapon);
    }

    /** Sleight of Hand (#442): PalmActionData moves the picked item on a winning opposed roll. */
    _palmAction(use: SkillUseDef, itemId: string): PalmActionData {
        return new PalmActionData(use.kind === 'steal' ? 'steal' : 'plant', itemId);
    }

    /**
     * Repair / Bypass Lock / Break (#443/#444/#448): ObjectStateActionData writes the
     * picked item's state on success. A repair carries the line's printed repair rule
     * (DH2 destroys the item on 4+ DoF) and spends a xenos lore insight (#136).
     */
    _objectStateAction(use: SkillUseDef, itemId: string, target: WH40KBaseActor | null): ObjectStateActionData | null {
        const item = this._skillUseItem(itemId, target);
        if (item === null) return null;
        const mode = use.kind === 'repair' ? 'repair' : use.kind === 'bypassLock' ? 'bypassLock' : 'breakObject';
        const rules = mode === 'repair' ? itemRepairRulesFor(this.system.gameSystem) : null;
        const consumesXenosInsight = rules !== null && (this._xenosInsightModifiers(rules.xenos, item)?.consumesInsight ?? false);
        // eslint-disable-next-line no-restricted-syntax -- boundary: the resolved Item satisfies StatefulItem structurally (id/name/update)
        return new ObjectStateActionData(mode, item as unknown as StatefulItem, { rules, consumesXenosInsight });
    }

    /**
     * The target modifiers the picked item brings (#535), shown in the dialog before
     * the roll: a repair's craftsmanship row (#444), and the xenos rows when
     * the roller holds a Forbidden Lore insight on the item (#136).
     */
    _skillUseItemModifiers(use: SkillUseDef, choice: SkillUseItemChoice, target: WH40KBaseActor | null): Record<string, number> {
        if (use.kind !== 'repair' || choice.item === undefined) return {};
        const rules = itemRepairRulesFor(this.system.gameSystem);
        const item = this._skillUseItem(choice.item, target);
        if (rules === null || item === null) return {};
        const xenos = this._xenosInsightModifiers(rules.xenos, item);
        return { 'craftsmanship-repair': craftsmanshipRepairModifier(rules, item.system.craftsmanship), ...(xenos?.modifiers ?? {}) };
    }

    /**
     * Before a repair's dice (#136): a xenos item needs the roller's Forbidden Lore
     * insight first. Without one this opens that lore test instead and resolves false,
     * so the repair is not rolled.
     */
    async _beforeItemUseRoll(use: SkillUseDef, choice: SkillUseItemChoice, target: WH40KBaseActor | null): Promise<boolean> {
        if (use.kind !== 'repair' || choice.item === undefined) return true;
        const rules = itemRepairRulesFor(this.system.gameSystem);
        const item = this._skillUseItem(choice.item, target);
        if (rules === null || item === null) return true;
        // eslint-disable-next-line no-restricted-syntax -- boundary: the resolved Item satisfies StatefulItem structurally (id/name/update)
        return (await this._xenosAttemptModifiers(rules.xenos, item, item as unknown as StatefulItem)) !== null;
    }

    /**
     * The xenos rows for repairing or modifying an item (a DH2 supplement,
     * #136). A non-xenos item, or a line without the rule, adds nothing. A xenos item
     * gets the −20 alien-nature and +5-per-DoS rows when the roller holds a Forbidden
     * Lore insight on it, and the attempt spends it. Null when they hold none yet.
     */
    _xenosInsightModifiers(rules: XenosRepairRules | null, item: WH40KItem): { modifiers: Record<string, number>; consumesInsight: boolean } | null {
        if (rules === null || !isXenosEquipment(item)) return { modifiers: {}, consumesInsight: false };
        const insight = this.uuid === null ? null : readXenosRepairInsight(item.getFlag(SYSTEM_ID, XENOS_REPAIR_INSIGHT_FLAG), this.uuid);
        if (insight === null) return null;
        const xenos = xenosRepairModifiers(rules, insight.degrees);
        return { modifiers: { 'xenos-repair': xenos.alienNature, 'xenos-lore-insight': xenos.loreInsight }, consumesInsight: true };
    }

    /**
     * The xenos step before repairing or modifying an item (#136). Without the
     * roller's Forbidden Lore insight on a xenos item, this rolls that lore test
     * instead and returns null. Otherwise it returns the rows to apply.
     */
    async _xenosAttemptModifiers(
        rules: XenosRepairRules | null,
        item: WH40KItem,
        statefulItem: StatefulItem,
    ): Promise<{ modifiers: Record<string, number>; consumesInsight: boolean } | null> {
        const xenos = this._xenosInsightModifiers(rules, item);
        if (xenos === null && rules !== null) await this._rollXenosRepairLore(statefulItem, item.name, rules);
        return xenos;
    }

    /**
     * The test target for a skill a line's modification rule names, narrowed to
     * the named specialisation when the actor has it. Without the specialisation
     * the parent skill is rolled untrained, as `rollSkill` does.
     */
    _modificationSkillTest(ref: ModificationSkill): { key: string; label: string; target: number; skillRank?: number } | null {
        const key = this._resolveSkillName(ref.skill);
        const skill = this.skills[key] as WH40KSkill | undefined;
        if (skill === undefined) return null;
        const skillLabel = skill.label ?? key;
        if (ref.specialisation === null) return { key, label: skillLabel, target: skill.current };
        return { key, ...printedSpecialisationTest(skillLabel, skill.current, this._findSpecialistSkill(skill, ref.specialisation), ref.specialisation) };
    }

    /**
     * Fit a weapon modification personally (#136): DH2's Trade
     * (Armourer) test, or the plain test DH1 / RT / OW print. The parts are a
     * weapon modification the Acolyte carries. On DH2 the test takes the
     * modification's Availability, and a xenos weapon first needs the Forbidden
     * Lore step (a DH2 supplement).
     */
    async rollFitWeaponModification(weaponId: string, partsId: string): Promise<void> {
        const rules = weaponModificationRulesFor(this.system.gameSystem);
        const weaponItem = this.items.get(weaponId);
        const partsItem = this.items.get(partsId);
        if (rules === null || weaponItem?.type !== 'weapon' || partsItem?.type !== 'weaponModification') return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Item#system is the per-type DataModel union; a `weapon` Item's system is WeaponData, read through the fitting surface
        const weapon = weaponItem as unknown as FittableWeapon;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Item#system is the per-type DataModel union; a `weaponModification` Item's system is WeaponModificationData, read through the parts surface
        const parts = partsItem as unknown as ModificationParts & ModificationSource;
        const sourceUuid = partsSourceUuid(partsItem);
        const blocker = modificationBlocker(weapon.system, parts, sourceUuid);
        if (blocker !== null) {
            ui.notifications.warn(
                game.i18n.format(MODIFICATION_BLOCKER_KEYS[blocker], {
                    name: parts.name,
                    classLabel: weapon.system.classLabel,
                    typeLabel: weapon.system.typeLabel,
                }),
            );
            return;
        }
        const test = this._modificationSkillTest(rules.fitSkill);
        if (test === null) return;
        const xenos = await this._xenosAttemptModifiers(rules.xenos, weaponItem, weapon);
        if (xenos === null) return;
        const availability = modificationAvailabilityModifier(rules, acquisitionLadderFor(this.system.gameSystem), partsItem.system.availability);
        const action = new FitModificationActionData(weapon, parts, modificationEntry(parts, sourceUuid), rules, xenos.consumesInsight);
        this._buildSimpleSkillRoll({
            key: test.key,
            type: 'skill',
            label: game.i18n.format('WH40K.WeaponModification.FitRollLabel', { skill: test.label, modification: parts.name, weapon: weapon.name }),
            target: test.target,
            situationalKey: test.key,
            instance: action,
            extraModifiers: { ...(availability !== null ? { 'modification-availability': availability } : {}), ...xenos.modifiers },
            ...(test.skillRank !== undefined ? { skillRank: test.skillRank } : {}),
        });
        openRollPrompt(action);
    }

    /**
     * Remove a fitted weapon modification and try to keep its parts (#136, DH2
     * core "Removing and Re-using Modifications"): Tech-Use at the
     * modification's Availability. Only a line that prints the removal test
     * offers it; elsewhere the GM detaches modifications freely.
     */
    async rollRemoveWeaponModification(weaponId: string, modificationUuid: string): Promise<void> {
        const rules = weaponModificationRulesFor(this.system.gameSystem);
        const weaponItem = this.items.get(weaponId);
        if (rules?.removalSkill == null || weaponItem?.type !== 'weapon') return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Item#system is the per-type DataModel union; a `weapon` Item's system is WeaponData, read through the fitting surface
        const weapon = weaponItem as unknown as ModifiableWeapon & StatefulItem;
        const entry = weapon.system.modifications.find((mod) => mod.uuid === modificationUuid);
        if (entry === undefined) return;
        const test = this._modificationSkillTest(rules.removalSkill);
        if (test === null) return;
        const xenos = await this._xenosAttemptModifiers(rules.xenos, weaponItem, weapon);
        if (xenos === null) return;
        // The parts come back from the document the fitted entry points at.
        const source = await fromUuid(entry.uuid);
        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid (Foundry) returns the broad document union; the fitted entry's source is a weaponModification Item
        const sourceItem = source instanceof Item ? (source as unknown as WH40KItem) : null;
        const availability = modificationAvailabilityModifier(rules, acquisitionLadderFor(this.system.gameSystem), sourceItem?.system.availability);
        const recoverParts = async (): Promise<boolean> => {
            if (sourceItem === null) return false;
            await this.createEmbeddedDocuments('Item', [sourceItem.toObject()]);
            return true;
        };
        const action = new RemoveModificationActionData(weapon, entry, recoverParts, xenos.consumesInsight);
        this._buildSimpleSkillRoll({
            key: test.key,
            type: 'skill',
            label: game.i18n.format('WH40K.WeaponModification.RemoveRollLabel', { skill: test.label, modification: entry.name, weapon: weapon.name }),
            target: test.target,
            situationalKey: test.key,
            instance: action,
            extraModifiers: { ...(availability !== null ? { 'modification-availability': availability } : {}), ...xenos.modifiers },
            ...(test.skillRank !== undefined ? { skillRank: test.skillRank } : {}),
        });
        openRollPrompt(action);
    }

    /**
     * The Forbidden Lore step before repairing or modifying a xenos item (a DH2
     * supplement, #136). If the race that built the item is unknown it
     * cannot be repaired or modified at all, which is a GM ruling made here.
     * Otherwise the Acolyte picks the Forbidden Lore specialisation that covers
     * that race and rolls it at Hard (−20); success records the insight their
     * next repair or modification attempt reads.
     */
    async _rollXenosRepairLore(item: StatefulItem, itemName: string, rules: XenosRepairRules): Promise<void> {
        const makerKnown = await foundry.applications.api.DialogV2.confirm({
            window: { title: t('WH40K.SkillUse.Object.XenosMakerTitle') },
            content: `<p>${foundry.utils.escapeHTML(game.i18n.format('WH40K.SkillUse.Object.XenosMakerQuestion', { item: itemName }))}</p>`,
        });
        if (!makerKnown) {
            ui.notifications.warn(game.i18n.format('WH40K.SkillUse.Object.XenosTooAlien', { item: itemName }));
            return;
        }
        const loreKey = this._resolveSkillName('forbiddenLore');
        const lore = this.skills[loreKey] as WH40KSkill | undefined;
        const entries = (lore?.entries ?? []) as SkillEntry[];
        const pickable = entries.map((lorEntry, index) => ({ id: String(index), name: lorEntry.name ?? lorEntry.label ?? '' })).filter((e) => e.name !== '');
        if (lore === undefined || pickable.length === 0 || this.uuid === null) {
            ui.notifications.warn(t('WH40K.SkillUse.Object.XenosNoLore'));
            return;
        }
        const chosen = await promptItemChoice(pickable, t('WH40K.SkillUse.Object.XenosLorePickTitle'), t('WH40K.SkillUse.Object.XenosLorePickHint'));
        if (chosen === null) return;
        const entry = entries.at(Number(chosen.id));
        if (entry === undefined) return;
        const loreAction = new XenosLoreActionData(item, this.uuid);
        this._buildSimpleSkillRoll({
            key: loreKey,
            type: 'skill',
            label: `${lore.label ?? loreKey}: ${chosen.name} (${itemName})`,
            target: entry.current ?? lore.current,
            situationalKey: loreKey,
            instance: loreAction,
            extraModifiers: { 'xenos-lore': rules.loreModifier },
            skillRank: entry.rank ?? (entry.trained === true ? 1 : 0),
        });
        openRollPrompt(loreAction);
    }

    /**
     * Demolition (#445): DemolitionActionData arms the picked charge with the setter's
     * degrees on a placement, or resolves the opposed defuse against those recorded
     * degrees. A charge is placed from your own items; an armed one may be defused on
     * you or on the target.
     */
    _demolitionAction(use: SkillUseDef, itemId: string, target: WH40KBaseActor | null): DemolitionActionData | null {
        const isPlace = use.kind === 'placeCharge';
        const item = isPlace ? this.items.get(itemId) ?? null : this._skillUseItem(itemId, target);
        if (item === null) return null;
        // eslint-disable-next-line no-restricted-syntax -- boundary: the resolved Item satisfies ExplosiveItem structurally (id/name/update + armed state)
        const explosive = item as unknown as ExplosiveItem;
        return isPlace
            ? new DemolitionActionData('placeCharge', explosive, game.i18n.localize('WH40K.SkillUse.Demo.DefaultTrigger'))
            : new DemolitionActionData('defuse', explosive);
    }

    /**
     * Roll weapon damage
     * @param {Item} weapon - The weapon item
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- signature returns Promise for caller compat
    async rollWeaponDamage(weapon: WH40KItem): Promise<void> {
        if (weapon.system.state.equipped !== true) {
            ui.notifications.warn(game.i18n.localize('WH40K.Warning.WeaponNotEquipped'));
            return;
        }
        if (weapon.system['dealsDamage'] === false) {
            ui.notifications.info(t('WH40K.Weapon.NoDamageNotice', { name: weapon.name }));
            return;
        }
        // A range band, table draw or borrowed weapon needs the attack to resolve it (#608).
        if (weapon.system['hasContextualDamage'] === true) {
            ui.notifications.info(t('WH40K.Weapon.ContextualDamageNotice', { name: weapon.name }));
            return;
        }

        // Calculate damage with Strength Bonus for melee/thrown weapons
        const isMelee = weapon.system.melee === true || weapon.system.isMeleeWeapon === true;
        const isThrown = weapon.system.class === 'thrown';
        // Add SB for melee weapons and thrown weapons, except grenades (#619)
        const includeStrengthBonus = isMelee || (isThrown && !isGrenadeWeapon(weapon.system));
        const strengthBonus = includeStrengthBonus ? this.system.characteristics.strength.bonus : 0;

        // The prompt takes the formula, type and penetration as its fields show them.
        // weapon.system.damage can be a string formula or an object with formula/bonus fields;
        // the prompt was handed that object whole, so it showed "[object Object]" (#619).
        const rawDamage = weapon.system.damage as
            | { formula?: string; value?: string; bonus?: number; type?: string; penetration?: number }
            | string
            | undefined;
        const damageFormula = typeof rawDamage === 'string' ? rawDamage : rawDamage?.formula ?? rawDamage?.value ?? '';
        const damageBonus = typeof rawDamage === 'object' ? rawDamage.bonus ?? 0 : 0;

        openDamagePrompt({
            name: weapon.name,
            damage: formulaWithBonus(damageFormula, damageBonus + strengthBonus),
            // The prompt's type select lists the capitalised names (`rules/config.ts` damage_types).
            damageType: typeof rawDamage === 'object' ? rawDamage.type?.capitalize() : undefined,
            penetration: typeof rawDamage === 'object' ? rawDamage.penetration : undefined,
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
        openDamagePrompt({
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
        if (isForceFieldItem(item)) {
            if (!item.system.state.equipped || !item.system.state.activated) {
                ui.notifications.warn(game.i18n.localize('WH40K.Notify.Acolyte.ForceFieldNotReady'));
                return;
            }
            openRollPrompt(new ForceFieldActionData(this, item));
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
        ui.notifications.warn(game.i18n.format('WH40K.Vehicle.Errors.NoActionForItemType', { type: item.type }));
    }

    /* -------------------------------------------- */
    /*  Quick Roll Methods (no dialog)              */
    /* -------------------------------------------- */

    /**
     * Perform a quick skill check without dialog — used by opposed skill contests
     * (e.g. Deceive vs the target's Scrutiny, #433).
     * @param {string} skillKey - The skill key
     * @returns {Promise<D100Roll|null>} The evaluated roll
     */
    override async rollSkillCheck(skillKey: string): Promise<D100Roll | null> {
        const skill = this.getSkillFuzzy(skillKey) as WH40KSkill | undefined;
        if (skill === undefined) {
            game.wh40k.error('Unable to perform skill test. Could not find provided skill.', skillKey);
            return null;
        }
        return this.rollCheck(skill.current);
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

    /**
     * What a test titled after something else rolled (#677): the skill, its
     * specialisation and whether it is untrained, and the base row's provenance.
     * @param skill  The skill rolled.
     * @param key  Its key, the label when it has none.
     * @param specialisation  The specialisation rolled, or null.
     * @param skillRank  The rolled entry's rank, when the test set one.
     */
    #testedSkill(skill: WH40KSkill, key: string, specialisation: string | null, skillRank: number | undefined): { skill: string; baseLabel: string } {
        const format = (k: string, data: Record<string, string>): string => game.i18n.format(k, data);
        const untrained = (skillRank ?? (skill.trained ? 1 : 0)) === 0;
        const tested = testedSkillLabel({ skill: game.i18n.localize(skill.label ?? key), specialisation, untrained }, format);
        const characteristic = characteristicLabel(characteristicFromAbbrev(skill.characteristic) ?? skill.characteristic);
        return { skill: tested, baseLabel: testedSkillBaseLabel(characteristic, tested, format) };
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
        return this.items.filter((i) => i.type === 'talent').find((owned) => owned.name === talent) !== undefined;
    }

    hasTalentFuzzyWords(words: string[]): boolean {
        return (
            this.items
                .filter((i) => i.type === 'talent')
                .find((owned) => {
                    for (const word of words) {
                        if (!owned.name.includes(word)) return false;
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
