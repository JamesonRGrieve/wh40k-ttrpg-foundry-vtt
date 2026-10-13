import { acquisitionLadderFor, itemRepairRulesFor, SystemConfigRegistry, weaponModificationRulesFor } from '../config/game-systems/index.ts';
import type { GameSystemId } from '../config/game-systems/types.ts';
// Direct, not via dice/_module.ts: that barrel also re-exports
// RollConfigurationDialog, so importing it drags the applications layer into
// every document that just wants a roll class.
import { SYSTEM_ID } from '../constants.ts';
import type D100Roll from '../dice/d100-roll.ts';
import { t } from '../i18n/t.ts';
import {
    type ActionData,
    applySkillUseToRollData,
    buildSkillUseDelegate,
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
    type SkillRollOptions,
    SkillUseActionData,
    XenosLoreActionData,
} from '../rolls/action-data.ts';
import { EvasionActionData } from '../rolls/evasion-action-data.ts';
import type { EvasionPromptContext } from '../rolls/evasion-flow.ts';
import { ForceFieldData } from '../rolls/force-field-data.ts';
import { resolveGainedMalignancy } from '../rolls/malignancy-outcome.ts';
import { openDamagePrompt, openRollPrompt } from '../rolls/roll-prompt.ts';
import { firstTargetedActor, promptItemChoice } from '../rolls/skill-use-picker.ts';
import { TWISTED_FLESH_FLAG } from '../rules/chaos-backgrounds.ts';
import {
    FitModificationActionData,
    type ModifiableWeapon,
    type ModificationParts,
    RemoveModificationActionData,
} from '../rolls/weapon-modification-action-data.ts';
import type { EvasionSkill } from '../rules/evasion.ts';
import { craftsmanshipRepairModifier } from '../rules/item-repair.ts';
import { corruptionTrackModifier, malignancyTestsQueued } from '../rules/malignancy-test.ts';
import { getSkillReadout, hasSkillUses, type SkillUseDef } from '../rules/skill-uses.ts';
import { isXenosEquipment, readXenosRepairInsight, XENOS_REPAIR_INSIGHT_FLAG, xenosRepairModifiers, type XenosRepairRules } from '../rules/xenos-equipment.ts';
import type {
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

const SKILL_ALIASES: Record<string, string> = {
    navigate: 'navigation',
/** A weapon Item read through the personal-modification surface (#136): its fitted list, qualities, class / type and their labels. */
type FittableWeapon = ModifiableWeapon & StatefulItem & { system: ModifiableWeaponSystem & { classLabel: string; typeLabel: string } };

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
    ): Array<{ key: string; value: number; condition: string; icon: string; source: string; sourceType: string; itemId: string; appliesToVariant?: string }> {
        type SituationalEntry = { key: string; value: number; condition: string; icon?: string; appliesToVariant?: string };
        const modifiers: Array<{
            key: string;
            value: number;
            condition: string;
            icon: string;
            source: string;
            sourceType: string;
            itemId: string;
            appliesToVariant?: string;
        }> = [];

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

    /** Whether the Mutant background's Twisted Flesh bonus applies (within.md p. 32). */
    get hasTwistedFlesh(): boolean {
        return this.getFlag(SYSTEM_ID, TWISTED_FLESH_FLAG) === true;
    }

    /**
     * Roll one owed Malignancy Test. No-op when no test is owed. A Twisted Flesh
     * Mutant is first offered RAW's choice to fail it (within.md p. 32: "can
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
        // A caller-supplied action (an evasion, #414) owns the outcome, so the
        // skill's Special Uses and readout are not offered.
        if (
            options.instance === undefined &&
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
            label: game.i18n.format('WH40K.Roll.TestLabel', { name: label ?? resolvedSkillName }),
            target: targetValue,
            situationalKey: resolvedSkillName,
            ...(instance !== undefined ? { instance } : {}),
            ...(skillRank !== undefined ? { skillRank } : {}),
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
        return this.rollSkill(skill, undefined, { instance: EvasionActionData.forActor(this, prompt, skill) });
    }

    /**
     * Dispatch a skill roll to the flow its chosen use needs (#432 and its consumers).
     * Returns true when a use handled the roll, false when the choice falls through to
     * the normal test below.
     *
     * Two paths, decided by whether the skill's uses can be chosen INSIDE the roll
     * dialog:
     * - **Inline** (the default, and every target-directed family): the Roll Test
     *   dialog opens straight away with the use picker — and, for a target-directed
     *   use, the target picker — rendered in it. No pre-dialog pop-up, and the
     *   concrete action data is not built until the roll resolves.
     * - **Pre-roll picker** (Chem-Use, Sleight of Hand, Tech-Use, Security,
     *   Demolition, Athletics): these uses need a SECOND choice — which chem, which
     *   item, which charge — before their action data can be constructed at all, so
     *   they keep the pop-up that gathers it.
     */
    _dispatchSkillUse(skillKey: string, skillLabel: string, targetValue: number, skillRank?: number): boolean {
        const action = new SkillUseActionData(skillKey, skillLabel);
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
     * Resolve a target-directed skill use on the PRE-ROLL picker path (#432/#434/#435).
     * Only reachable for skills whose use list also contains an item-choice family
     * (Sleight of Hand's Notice contest is the live case) — every other target-directed
     * use is chosen inside the dialog now.
     *
     * The per-use wiring is NOT duplicated here: `buildSkillUseDelegate` picks the same
     * action subclass the inline path builds, and `applySkillUseToRollData` applies the
     * same label / RAW difficulty / opposition, so the two paths cannot drift.
     *
     * RAW per-target time gates (#458) are deliberately NOT checked here — they are
     * enforced at roll RESOLUTION, against the final target.
     */
    _rollTargetedSkillUse(use: SkillUseDef, skillKey: string, skillLabel: string, targetValue: number, skillRank?: number): void {
        const targetActor = firstTargetedActor();
        if (targetActor === null) {
            ui.notifications.warn(game.i18n.format('WH40K.SkillUse.NoTarget', { use: game.i18n.localize(use.labelKey) }));
            return;
        }
        const action = buildSkillUseDelegate(use);
        if (action === null) return;
        this._buildSimpleSkillRoll({
            key: skillKey,
            type: 'skill',
            label: `${skillLabel}: ${game.i18n.localize(use.labelKey)}`,
            target: targetValue,
            situationalKey: skillKey,
            instance: action,
            ...(skillRank !== undefined ? { skillRank } : {}),
        });
        action.rollData.targetActor = targetActor;
        applySkillUseToRollData(action.rollData, use, skillLabel);
        openRollPrompt(action);
    }

    /**
     * Chem-Use (#441): pick the chem to administer (and the weapon to coat), then
     * route through ChemUseActionData, which applies the dose to the TARGET on
     * success — or to the applicant on a botch (OW/BC RAW). Chems are the carried
     * drug/consumable items that still have a dose left and declare an effect.
     */
    async _rollChemUse(use: SkillUseDef, skillKey: string, skillLabel: string, targetValue: number, skillRank?: number): Promise<void> {
        const useLabel = game.i18n.localize(use.labelKey);
        const chems = this.items.filter((item: WH40KItem) => {
            if (item.type !== 'drug' && item.type !== 'consumable' && item.type !== 'gear') return false;
            // eslint-disable-next-line no-restricted-syntax -- boundary: Item#system is the per-type DataModel union; narrow to the gear dose slots this reads
            const sys = item.system as unknown as { uses?: { value?: number }; grants?: { activeEffects?: unknown[] } };
            return (sys.uses?.value ?? 0) > 0 && (sys.grants?.activeEffects?.length ?? 0) > 0;
            // eslint-disable-next-line no-restricted-syntax -- boundary: the filtered items satisfy ChemLike structurally (dose payload + update)
        }) as unknown as ChemLike[];
        const chem = await promptItemChoice(
            chems,
            game.i18n.format('WH40K.SkillUse.Chem.PickTitle', { use: useLabel }),
            game.i18n.localize('WH40K.SkillUse.Chem.PickHint'),
        );
        if (chem === null) {
            ui.notifications.warn(game.i18n.localize('WH40K.SkillUse.Chem.NoChem'));
            return;
        }

        let weapon: CoatableWeapon | null = null;
        let targetActor: WH40KBaseActor | null = null;
        if (use.kind === 'coatWeapon') {
            // eslint-disable-next-line no-restricted-syntax -- boundary: filtered weapon Items satisfy CoatableWeapon structurally (id/name/update)
            const weapons = this.items.filter((item: WH40KItem) => item.type === 'weapon') as unknown as CoatableWeapon[];
            weapon = await promptItemChoice(
                weapons,
                game.i18n.localize('WH40K.SkillUse.Chem.PickWeaponTitle'),
                game.i18n.localize('WH40K.SkillUse.Chem.PickWeaponHint'),
            );
            if (weapon === null) return;
        } else {
            targetActor = firstTargetedActor();
            if (targetActor === null) {
                ui.notifications.warn(game.i18n.format('WH40K.SkillUse.NoTarget', { use: useLabel }));
                return;
            }
        }

        const chemAction = new ChemUseActionData(use.kind === 'coatWeapon' ? 'coatWeapon' : 'applyChem', chem, weapon);
        this._buildSimpleSkillRoll({
            key: skillKey,
            type: 'skill',
            label: `${skillLabel}: ${useLabel} (${chem.name})`,
            target: targetValue,
            situationalKey: skillKey,
            instance: chemAction,
            ...(skillRank !== undefined ? { skillRank } : {}),
        });
        chemAction.rollData.targetActor = targetActor;
        openRollPrompt(chemAction);
    }

    /**
     * Sleight of Hand plant/steal (#442): pick the item to move — from the target's
     * carried items when stealing, from the actor's own when planting — then route
     * through PalmActionData, which transfers it on a winning opposed roll.
     */
    async _rollPalm(use: SkillUseDef, skillKey: string, skillLabel: string, targetValue: number, skillRank?: number): Promise<void> {
        const useLabel = game.i18n.localize(use.labelKey);
        const targetActor = firstTargetedActor();
        if (targetActor === null) {
            ui.notifications.warn(game.i18n.format('WH40K.SkillUse.NoTarget', { use: useLabel }));
            return;
        }
        // Steal from the target's inventory; plant from your own. Physical items only
        // (something you can actually palm), so skip talents/skills/conditions/etc.
        const source = use.kind === 'steal' ? targetActor : this;
        const carried = source.items.filter(
            (item: WH40KItem) =>
                (item.isWeapon || item.isArmour || item.isGear || item.type === 'cybernetic' || item.type === 'ammunition') && item.id !== null,
        );
        const pickable = carried.map((i: WH40KItem) => ({ id: i.id as string, name: i.name }));
        const chosen = await promptItemChoice(
            pickable,
            game.i18n.format('WH40K.SkillUse.Palm.PickTitle', { use: useLabel }),
            game.i18n.localize('WH40K.SkillUse.Palm.PickHint'),
        );
        if (chosen === null) {
            ui.notifications.warn(game.i18n.localize('WH40K.SkillUse.Palm.NoItem'));
            return;
        }

        const palm = new PalmActionData(use.kind === 'steal' ? 'steal' : 'plant', chosen.id);
        this._buildSimpleSkillRoll({
            key: skillKey,
            type: 'skill',
            label: `${skillLabel}: ${useLabel} (${chosen.name})`,
            target: targetValue,
            situationalKey: skillKey,
            instance: palm,
            ...(skillRank !== undefined ? { skillRank } : {}),
        });
        palm.rollData.targetActor = targetActor;
        palm.rollData.isOpposed = true;
        palm.rollData.opposedChar = use.opposedChar ?? 'Per';
        openRollPrompt(palm);
    }

    /**
     * Object-interaction appliers (#443/#444/#448): pick the item to act on — a broken
     * or jammed device to repair, a locked one to open, or an intact one to smash —
     * from your own carried items or a targeted actor's, then route through
     * ObjectStateActionData, which writes the state on success. Candidate items are
     * gathered by the state the use targets.
     */
    async _rollObjectState(use: SkillUseDef, skillKey: string, skillLabel: string, targetValue: number, skillRank?: number): Promise<void> {
        const useLabel = game.i18n.localize(use.labelKey);
        const mode = use.kind === 'repair' ? 'repair' : use.kind === 'bypassLock' ? 'bypassLock' : 'breakObject';
        const target = firstTargetedActor();
        const pools: WH40KItem[][] = [this.items.contents];
        if (target !== null) pools.push(target.items.contents);
        const candidates = pools.flat().filter((item: WH40KItem) => {
            if (!item.isWeapon && !item.isArmour && !item.isGear) return false;
            // eslint-disable-next-line no-restricted-syntax -- boundary: Item#system is the per-type DataModel union; narrow to the runtime state slots this reads
            const sys = item.system as unknown as { state?: { broken?: boolean; locked?: boolean; destroyed?: boolean }; jammed?: boolean };
            const broken = (sys.state?.broken ?? false) || sys.jammed === true;
            // A destroyed item can never be repaired (DH2 core p. 142, #444).
            const repairable = broken && sys.state?.destroyed !== true;
            // Repair → broken/jammed; bypass → locked; break → an intact item to smash.
            const flagged = mode === 'repair' ? repairable : mode === 'bypassLock' ? sys.state?.locked ?? false : !broken;
            return flagged && item.id !== null;
        });
        const pickable = candidates.map((i: WH40KItem) => ({ id: i.id as string, name: i.name }));
        const hintKey =
            mode === 'repair'
                ? 'WH40K.SkillUse.Object.PickRepairHint'
                : mode === 'bypassLock'
                ? 'WH40K.SkillUse.Object.PickLockHint'
                : 'WH40K.SkillUse.Object.PickBreakHint';
        const chosen = await promptItemChoice(pickable, game.i18n.format('WH40K.SkillUse.Object.PickTitle', { use: useLabel }), game.i18n.localize(hintKey));
        if (chosen === null) {
            const noneKey =
                mode === 'repair'
                    ? 'WH40K.SkillUse.Object.NoBroken'
                    : mode === 'bypassLock'
                    ? 'WH40K.SkillUse.Object.NoLocked'
                    : 'WH40K.SkillUse.Object.NoBreakable';
            ui.notifications.warn(game.i18n.localize(noneKey));
            return;
        }
        const owner = target?.items.get(chosen.id) !== undefined ? target : this;
        const chosenItem = owner.items.get(chosen.id);
        if (chosenItem === undefined) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: the resolved Item satisfies StatefulItem structurally (id/name/update)
        const statefulItem = chosenItem as unknown as StatefulItem;

        // The line's printed repair rule (#444): DH2 applies the Table 5-2 craftsmanship
        // modifier and destroys the item on 4+ DoF; other lines keep the plain test.
        const repairRules = mode === 'repair' ? itemRepairRulesFor(this.system.gameSystem) : null;
        let extraModifiers: Record<string, number> = {};
        let consumesXenosInsight = false;
        if (repairRules !== null) {
            const xenos = await this._xenosAttemptModifiers(repairRules.xenos, chosenItem, statefulItem);
            if (xenos === null) return;
            extraModifiers = { 'craftsmanship-repair': craftsmanshipRepairModifier(repairRules, chosenItem.system.craftsmanship), ...xenos.modifiers };
            consumesXenosInsight = xenos.consumesInsight;
        }

        const objectAction = new ObjectStateActionData(mode, statefulItem, { rules: repairRules, consumesXenosInsight });
        this._buildSimpleSkillRoll({
            key: skillKey,
            type: 'skill',
            label: `${skillLabel}: ${useLabel} (${chosen.name})`,
            target: targetValue,
            situationalKey: skillKey,
            instance: objectAction,
            extraModifiers,
            ...(skillRank !== undefined ? { skillRank } : {}),
        });
        openRollPrompt(objectAction);
    }

    /**
     * The xenos step before repairing or modifying an item (DH2 Enemies Without
     * p. 42, #136). A non-xenos item, or a line without the rule, adds nothing.
     * A xenos item needs the roller's Forbidden Lore insight first: without one
     * this rolls that lore test instead and returns null. With one it returns the
     * −20 alien-nature and +5-per-DoS rows, and the attempt spends the insight.
     */
    async _xenosAttemptModifiers(
        rules: XenosRepairRules | null,
        item: WH40KItem,
        statefulItem: StatefulItem,
    ): Promise<{ modifiers: Record<string, number>; consumesInsight: boolean } | null> {
        if (rules === null || !isXenosEquipment(item)) return { modifiers: {}, consumesInsight: false };
        const insight = this.uuid === null ? null : readXenosRepairInsight(item.getFlag(SYSTEM_ID, XENOS_REPAIR_INSIGHT_FLAG), this.uuid);
        if (insight === null) {
            await this._rollXenosRepairLore(statefulItem, item.name, rules);
            return null;
        }
        const xenos = xenosRepairModifiers(rules, insight.degrees);
        return { modifiers: { 'xenos-repair': xenos.alienNature, 'xenos-lore-insight': xenos.loreInsight }, consumesInsight: true };
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
        const entry = this._findSpecialistSkill(skill, ref.specialisation);
        if (entry === undefined) return { key, label: `${skillLabel}: ${ref.specialisation}`, target: skill.current, skillRank: 0 };
        return {
            key,
            label: `${skillLabel}: ${entry.name ?? entry.label ?? ref.specialisation}`,
            target: entry.current ?? skill.current,
            skillRank: entry.rank ?? (entry.trained === true ? 1 : 0),
        };
    }

    /**
     * Fit a weapon modification personally (#136): DH2 core p. 162's Trade
     * (Armourer) test, or the plain test DH1 / RT / OW print. The parts are a
     * weapon modification the Acolyte carries. On DH2 the test takes the
     * modification's Availability, and a xenos weapon first needs the Forbidden
     * Lore step (Enemies Without p. 42).
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
     * core p. 162 "Removing and Re-using Modifications"): Tech-Use at the
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
     * The Forbidden Lore step before repairing or modifying a xenos item (DH2
     * Enemies Without p. 42, #136). If the race that built the item is unknown it
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
     * Demolition (#445): pick the explosive to place (an unarmed charge you carry) or
     * defuse (an armed charge on you or a targeted actor), then route through
     * DemolitionActionData, which arms it with the setter's degrees on a placement or
     * resolves the opposed defuse against those recorded degrees.
     */
    async _rollDemolition(use: SkillUseDef, skillKey: string, skillLabel: string, targetValue: number, skillRank?: number): Promise<void> {
        const useLabel = game.i18n.localize(use.labelKey);
        const isPlace = use.kind === 'placeCharge';
        const target = firstTargetedActor();
        // Place from your own carried charges; defuse an armed charge on you or the target.
        const pools: WH40KItem[][] = isPlace ? [this.items.contents] : target !== null ? [this.items.contents, target.items.contents] : [this.items.contents];
        const candidates = pools.flat().filter((item: WH40KItem) => {
            if (!item.isWeapon && !item.isGear) return false;
            // eslint-disable-next-line no-restricted-syntax -- boundary: Item#system is the per-type DataModel union; narrow to the armed state slot this reads
            const armed = (item.system as unknown as { state?: { armed?: { active?: boolean } } }).state?.armed?.active ?? false;
            return armed !== isPlace && item.id !== null;
        });
        const pickable = candidates.map((i: WH40KItem) => ({ id: i.id as string, name: i.name }));
        const chosen = await promptItemChoice(
            pickable,
            game.i18n.format('WH40K.SkillUse.Demo.PickTitle', { use: useLabel }),
            game.i18n.localize(isPlace ? 'WH40K.SkillUse.Demo.PickPlaceHint' : 'WH40K.SkillUse.Demo.PickDefuseHint'),
        );
        if (chosen === null) {
            ui.notifications.warn(game.i18n.localize(isPlace ? 'WH40K.SkillUse.Demo.NoCharge' : 'WH40K.SkillUse.Demo.NoArmed'));
            return;
        }
        const owner = !isPlace && target?.items.get(chosen.id) !== undefined ? target : this;
        // eslint-disable-next-line no-restricted-syntax -- boundary: the resolved Item satisfies ExplosiveItem structurally (id/name/update + armed state)
        const explosive = owner.items.get(chosen.id) as unknown as ExplosiveItem;

        const demo = new DemolitionActionData(
            isPlace ? 'placeCharge' : 'defuse',
            explosive,
            isPlace ? game.i18n.localize('WH40K.SkillUse.Demo.DefaultTrigger') : '',
        );
        this._buildSimpleSkillRoll({
            key: skillKey,
            type: 'skill',
            label: `${skillLabel}: ${useLabel} (${chosen.name})`,
            target: targetValue,
            situationalKey: skillKey,
            instance: demo,
            ...(skillRank !== undefined ? { skillRank } : {}),
        });
        openRollPrompt(demo);
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

        openDamagePrompt({
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
        if (item.type === 'forceField') {
            if (item.system.state.equipped !== true || item.system.state.activated !== true) {
                ui.notifications.warn(game.i18n.localize('WH40K.Notify.Acolyte.ForceFieldNotReady'));
                return;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: ForceFieldData ctor accepts the item document via per-system-typed slot
            openRollPrompt(new ForceFieldData(this, item as unknown as ConstructorParameters<typeof ForceFieldData>[1]) as unknown as ActionData);
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
