/**
 * @file UnifiedRollDialog - Single dialog for all roll types
 * Replaces SimpleRollDialog, EnhancedSkillDialog, WeaponAttackDialog,
 * PsychicPowerDialog, and ForceFieldDialog with a unified, modern interface.
 *
 * Features:
 * - Hero target number display with difficulty stepper
 * - Collapsible modifier toggles + roll-type-specific panels
 * - Two-die d100 manual input with instant success/failure feedback
 * - Auto Roll for digital rolling
 */

import type { ActionData } from '../../rolls/action-data.ts';
import type { RollData } from '../../rolls/roll-data.ts';
import { getDegreeForMode, resolveDegreesMethod, sendActionDataToChat } from '../../rolls/roll-helpers.ts';
import { DEFAULT_ASSISTANT_CAP, getAssistanceBonus } from '../../rules/assistance.ts';
import {
    AIM_OPTIONS,
    aggregateSituationalDamageEffects,
    getActionNameForMode,
    getAimKeyForModifier,
    getAimModifier,
    getAttackModeKeyForAction,
    getAvailableAttackModes,
    getMeleeSpecialOptions,
    getSituationalModifiers,
    isMeleeSpecialOption,
} from '../../rules/attack-options.ts';
import { getClimbingModifier, type ClimbingSurface } from '../../rules/climbing.ts';
import { resolvePsyMode, type PsyMode } from '../../rules/psychic-push.ts';
import { availableSkillVariants, filterModifiersByVariant, type SkillVariant } from '../../rules/skill-variants.ts';
import { getTryAgainAdvice, type RetryAdvice } from '../../rules/trying-again.ts';
import { resolveUntrainedTarget } from '../../rules/untrained-skill.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import { calculateTokenDistance, RANGE_BRACKETS } from '../../utils/range-calculator.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `foundry.applications` has no shipped type for the v2 api namespace
const { ApplicationV2 } = (foundry.applications as unknown as { api: { ApplicationV2: ApplicationV2Ctor } }).api;

type AttackOptionWeaponLike = WH40KItemDocument & {
    isRanged: boolean;
    system: WH40KItemDocument['system'] & {
        attack?: {
            rateOfFire?: {
                semi?: number;
                full?: number;
            };
        };
    };
};

/**
 * Shared scroll-region container for the dialog's body parts. Grouping the body
 * parts (header → diceInput) into one bounded, overflow-y-auto div keeps the
 * footer part (the Roll button) pinned below it instead of being pushed
 * off-screen when the expandable sections open. See #230.
 */
const URD_BODY_CONTAINER = {
    id: 'urd-body',
    classes: ['tw-flex', 'tw-flex-col', 'tw-min-h-0', 'tw-overflow-y-auto', 'tw-overflow-x-hidden', 'tw-max-h-[60vh]'],
};

/**
 * Unified dialog for configuring all roll types.
 */
export default class UnifiedRollDialog extends ApplicationV2Mixin(ApplicationV2) {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 close options bag
    declare close: (options?: Record<string, unknown>) => Promise<this>;
    // These members are provided by ApplicationV2 at runtime; declared here so TypeScript can resolve them.
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 render options bag and legacy v1 signature
    declare render: ((options?: Record<string, unknown>) => Promise<this>) & ((options: boolean, _options?: Record<string, unknown>) => Promise<this>);
    /** Typed access to the DOM root element (provided by ApplicationV2 base class). */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- _el matches Foundry V2 accessor naming convention used by the rest of the codebase
    private get _el(): HTMLElement {
        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 exposes `element: HTMLElement` at runtime but the mixin types it loosely.
        return (this as unknown as { element: HTMLElement }).element;
    }
    declare actionData: ActionData;
    declare _selectedDifficultyIndex: number;
    declare _situationalModifiers: Record<string, boolean>;
    declare _customModifier: number;
    declare _manualRollTens: number | null;
    declare _manualRollUnits: number | null;
    declare _diceInputMode: 'two-dice' | 'single';
    declare _singleRollValue: number | null;
    declare _rollResult: { success: boolean; dos: number; dof: number; total: number } | null;
    declare _difficultyPickerOpen: boolean;
    declare _showCustomModifier: boolean;
    declare _contextExpanded: boolean;
    declare _previousTarget: number | null;
    declare _selectedRangeBracket: string | null;
    declare _attackModeKey: string;
    /** Selected skill test variant (#246), or null when none chosen / not applicable. */
    declare _selectedSkillVariant: string | null;
    declare _aimModeKey: string;
    declare _activeCombatSituationals: Set<string>;
    declare _sizeModifierKey: string | null;
    declare _specialOptionsExpanded: boolean;
    declare _sizeExpanded: boolean;
    declare _rangeExpanded: boolean;
    declare _situationalExpanded: boolean;
    declare _initialized: boolean;
    declare _cachedSituationalModifiers: Array<{ key: string; source: string; value: number; label: string; appliesToVariant?: string }> | null;
    declare _pickerOutsideHandler: ((e: PointerEvent) => void) | null;
    declare _psyMode: PsyMode;
    declare _pushLevel: number;
    /** Number of assistants helping the active character (#60 — +10 per, capped by `DEFAULT_ASSISTANT_CAP`). */
    declare _assistantCount: number;
    /** Extended-test toggle (#59) — when true, rolled DoS accumulate against `_extendedThreshold`. */
    declare _extended: boolean;
    /** Threshold of cumulative DoS the extended test must reach (#59). */
    declare _extendedThreshold: number;
    /** Alt-characteristic override for skill rolls (#61). `null` = use the skill's listed characteristic. */
    declare _charOverride: string | null;
    /** Climbing-surface modifier for Athletics rolls (#146). Defaults to 'standard' (no modifier). */
    declare _climbSurface: ClimbingSurface;

    /**
     * @param {ActionData} actionData  Any ActionData subclass (SimpleSkillData, WeaponActionData, etc.)
     * @param {object} [options={}]    Dialog options.
     */
    constructor(actionData: ActionData, options: Partial<ApplicationV2Config.DefaultOptions> = {}) {
        super(options);
        this.actionData = actionData;
        this._selectedDifficultyIndex = UnifiedRollDialog.DIFFICULTIES.findIndex((d) => d.default === true);
        this._situationalModifiers = {};
        this._customModifier = 0;
        this._manualRollTens = null;
        this._manualRollUnits = null;
        this._diceInputMode = 'two-dice';
        this._singleRollValue = null;
        this._rollResult = null;
        this._difficultyPickerOpen = false;
        this._showCustomModifier = false;
        this._contextExpanded = true;
        this._previousTarget = null;
        this._selectedRangeBracket = null;

        // Card-based weapon panel state
        this._attackModeKey = 'standard';
        this._selectedSkillVariant = null;
        this._aimModeKey = 'none';
        this._activeCombatSituationals = new Set();
        this._sizeModifierKey = null; // null = use target actor size, string = user override
        this._specialOptionsExpanded = false;
        this._sizeExpanded = false;
        this._rangeExpanded = false;
        this._situationalExpanded = false;
        this._initialized = false;
        this._cachedSituationalModifiers = null;
        this._pickerOutsideHandler = null;
        this._psyMode = 'unfettered';
        this._pushLevel = 1;
        this._assistantCount = 0;
        this._extended = false;
        this._extendedThreshold = 5;
        this._charOverride = null;
        this._climbSurface = 'standard';
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'unified-roll-dialog', 'standard-form'],
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            toggleDifficultyPicker: UnifiedRollDialog.#onToggleDifficultyPicker,
            selectDifficulty: UnifiedRollDialog.#onSelectDifficulty,
            toggleSituational: UnifiedRollDialog.#onToggleSituational,
            customModUp: UnifiedRollDialog.#onCustomModUp,
            customModDown: UnifiedRollDialog.#onCustomModDown,
            toggleCustomModifier: UnifiedRollDialog.#onToggleCustomModifier,
            submitToChat: UnifiedRollDialog.#onSubmitToChat,
            systemRoll: UnifiedRollDialog.#onSystemRoll,
            clearManualRoll: UnifiedRollDialog.#onClearManualRoll,
            toggleDiceMode: UnifiedRollDialog.#onToggleDiceMode,
            toggleContextSection: UnifiedRollDialog.#onToggleContextSection,
            selectWeapon: UnifiedRollDialog.#onSelectWeapon,
            selectPower: UnifiedRollDialog.#onSelectPower,
            selectRangeBracket: UnifiedRollDialog.#onSelectRangeBracket,
            selectTarget: UnifiedRollDialog.#onSelectTarget,
            selectSkillVariant: UnifiedRollDialog.#onSelectSkillVariant,
            selectAttackMode: UnifiedRollDialog.#onSelectAttackMode,
            selectAimMode: UnifiedRollDialog.#onSelectAimMode,
            toggleCombatSituational: UnifiedRollDialog.#onToggleCombatSituational,
            selectSizeModifier: UnifiedRollDialog.#onSelectSizeModifier,
            toggleSpecialOptions: UnifiedRollDialog.#onToggleSpecialOptions,
            toggleSizeSection: UnifiedRollDialog.#onToggleSizeSection,
            toggleRangeSection: UnifiedRollDialog.#onToggleRangeSection,
            toggleSituationalSection: UnifiedRollDialog.#onToggleSituationalSection,
            setPsyMode: UnifiedRollDialog.#onSetPsyMode,
            incrementPushLevel: UnifiedRollDialog.#onIncrementPushLevel,
            decrementPushLevel: UnifiedRollDialog.#onDecrementPushLevel,
            incrementAssistant: UnifiedRollDialog.#onIncrementAssistant,
            decrementAssistant: UnifiedRollDialog.#onDecrementAssistant,
            setCharacteristicOverride: UnifiedRollDialog.#onSetCharacteristicOverride,
            setClimbSurface: UnifiedRollDialog.#onSetClimbSurface,
            toggleExtended: UnifiedRollDialog.#onToggleExtended,
            setExtendedThreshold: UnifiedRollDialog.#onSetExtendedThreshold,
            cancel: UnifiedRollDialog.#onCancel,
        },
        form: {
            handler: UnifiedRollDialog.#onFormSubmit,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
        position: {
            width: 460,
            // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 position.height accepts 'auto' at runtime but is typed as number
            height: 'auto' as unknown as number,
        },
        window: {
            title: 'WH40K.Roll.Title' as const,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        header: {
            template: 'systems/wh40k-rpg/templates/prompt/unified/header.hbs',
            container: URD_BODY_CONTAINER,
        },
        targetDisplay: {
            template: 'systems/wh40k-rpg/templates/prompt/unified/target-display.hbs',
            container: URD_BODY_CONTAINER,
        },
        modifiers: {
            template: 'systems/wh40k-rpg/templates/prompt/unified/modifiers.hbs',
            container: URD_BODY_CONTAINER,
        },
        contextPanel: {
            template: 'systems/wh40k-rpg/templates/prompt/unified/context-panel.hbs',
            container: URD_BODY_CONTAINER,
        },
        diceInput: {
            template: 'systems/wh40k-rpg/templates/prompt/unified/dice-input.hbs',
            container: URD_BODY_CONTAINER,
        },
        footer: {
            template: 'systems/wh40k-rpg/templates/prompt/unified/footer.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Constants                                    */
    /* -------------------------------------------- */

    static DIFFICULTIES = [
        { key: 'trivial', label: 'Trivial', modifier: 60, icon: 'fa-smile', description: 'Automatic success unless complications' },
        { key: 'elementary', label: 'Elementary', modifier: 50, icon: 'fa-smile-beam', description: 'Almost trivial with minor effort' },
        { key: 'simple', label: 'Simple', modifier: 40, icon: 'fa-grin-beam', description: 'Easy tasks under no pressure' },
        { key: 'easy', label: 'Easy', modifier: 30, icon: 'fa-grin', description: 'Simple tasks with no pressure' },
        { key: 'routine', label: 'Routine', modifier: 20, icon: 'fa-meh', description: 'Standard tasks with time' },
        { key: 'ordinary', label: 'Ordinary', modifier: 10, icon: 'fa-smile-beam', description: 'Typical difficulty' },
        { key: 'challenging', label: 'Challenging', modifier: 0, icon: 'fa-grimace', description: 'No modifier (baseline)', default: true },
        { key: 'difficult', label: 'Difficult', modifier: -10, icon: 'fa-frown', description: 'Complex or contested tasks' },
        { key: 'hard', label: 'Hard', modifier: -20, icon: 'fa-dizzy', description: 'Very challenging circumstances' },
        { key: 'veryHard', label: 'Very Hard', modifier: -30, icon: 'fa-tired', description: 'Exceptional difficulty' },
        { key: 'arduous', label: 'Arduous', modifier: -40, icon: 'fa-sad-tear', description: 'Punishing odds against success' },
        { key: 'punishing', label: 'Punishing', modifier: -50, icon: 'fa-sad-cry', description: 'Verging on impossible' },
        { key: 'hellish', label: 'Hellish', modifier: -60, icon: 'fa-skull', description: 'Near-impossible feats' },
    ];

    static WEAPON_MODIFIERS = [
        { key: 'aimHalf', label: 'Aim (Half)', value: 10, description: 'Half action aim bonus' },
        { key: 'aimFull', label: 'Aim (Full)', value: 20, description: 'Full action aim bonus' },
    ];

    /* -------------------------------------------- */
    /*  Properties                                   */
    /* -------------------------------------------- */

    /**
     * Detect the roll type from the action data.
     * @returns {"simple"|"weapon"|"psychic"|"forceField"}
     */
    get rollType(): 'simple' | 'weapon' | 'psychic' | 'forceField' {
        const rd = this.rollData;
        if (rd.constructor.name === 'WeaponRollData') return 'weapon';
        if (rd.constructor.name === 'PsychicRollData') return 'psychic';
        if (rd['forceField'] !== undefined && rd['forceField'] !== false && rd['forceField'] !== null) return 'forceField';
        return 'simple';
    }

    /** @returns {object} The underlying roll data (ForceFieldData IS the rollData) */
    // eslint-disable-next-line no-restricted-syntax -- boundary: rollData carries roll-type-specific extension fields read by templates
    get rollData(): RollData & Record<string, unknown> {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-restricted-syntax -- rollData may be absent on subclasses at runtime; cast is boundary: heterogeneous roll data bag
        return (this.actionData.rollData ?? this.actionData) as RollData & Record<string, unknown>;
    }

    /** Get the current difficulty preset */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- leading underscore is Foundry V2 convention for accessor-like members
    get _currentDifficulty(): (typeof UnifiedRollDialog.DIFFICULTIES)[number] {
        const ctor = this.constructor as typeof UnifiedRollDialog;
        const difficulty = ctor.DIFFICULTIES[this._selectedDifficultyIndex] ?? ctor.DIFFICULTIES[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: DIFFICULTIES[0] may be undefined; guard is required at runtime
        if (difficulty === undefined) throw new Error('DIFFICULTIES is empty');
        return difficulty;
    }

    /** Get the applicable modifier list for the current roll type */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- leading underscore is Foundry V2 convention for accessor-like members
    get _applicableModifiers(): Array<{ key: string; source: string; value: number; label: string }> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: _cachedSituationalModifiers is nullable state initialized to null, not a DataModel field
        return this._cachedSituationalModifiers ?? [];
    }

    /** Compute the manual roll total, or null if incomplete */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- leading underscore is Foundry V2 convention for accessor-like members
    get _manualRollTotal(): number | null {
        if (this._diceInputMode === 'two-dice') {
            if (this._manualRollTens === null || this._manualRollUnits === null) return null;
            const total = this._manualRollTens * 10 + this._manualRollUnits;
            return total === 0 ? 100 : total;
        } else {
            return this._singleRollValue;
        }
    }

    /* -------------------------------------------- */
    /*  Rendering                                    */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax, complexity -- boundary: ApplicationV2 _prepareContext has a loose Foundry signature; method is a single context-assembly pass that cannot be easily split
    override async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        // Initialize on first render
        if (!this._initialized && typeof this.rollData['initialize'] === 'function') {
            (this.rollData['initialize'] as () => void)();
            this._initialized = true;

            // Sync card state with initial rollData
            if (this.rollType === 'weapon') {
                const isRanged = this.rollData.weapon?.isRanged === true;
                this._attackModeKey = getAttackModeKeyForAction(this.rollData.action, isRanged);
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- rollData.modifiers may be absent at runtime on uninitialised weapon roll data
                this._aimModeKey = getAimKeyForModifier(this.rollData.modifiers?.['aim'] ?? 0);
                // Auto-calculate range from the user's current target (#233): if a ranged
                // weapon roll opens with a target already selected, resolve the distance from
                // the token positions so the range band/bonus are correct on open — the player
                // no longer has to press "select target" first. No-ops when nothing is targeted.
                if (isRanged) {
                    this.#applyTargetDistance(false);
                }
            }
        }

        if (typeof this.rollData['update'] === 'function') {
            await (this.rollData['update'] as () => Promise<void>)();
        }

        const context = await super._prepareContext(options);
        const rollData = this.rollData;
        const isForceField = this.rollType === 'forceField';

        // Collect situational modifiers from the actor
        if (!isForceField) {
            this._cachedSituationalModifiers = this._collectSituationalModifiers();
        }

        // Calculate modifiers (force fields have no modifiers)
        const difficultyMod = isForceField ? 0 : this._currentDifficulty.modifier;
        const situationalMod = isForceField ? 0 : this._calculateSituationalModifiers();
        const customMod = isForceField ? 0 : this._customModifier;
        const combatSitMod = !isForceField && this.rollType === 'weapon' ? this._calculateCombatSituationalModifiers() : 0;
        const psyMod =
            this.rollType === 'psychic'
                ? resolvePsyMode({ mode: this._psyMode, basePR: Number(rollData['pr']) || 0, pushLevel: this._pushLevel }).focusModifier
                : 0;
        const assistanceMod = isForceField ? 0 : getAssistanceBonus(this._assistantCount);

        // Try-Again advisory (#62) — only for Skill rolls with a known rollKey.
        // Reads actor.flags.wh40k['try-again'][rollKey] (a Record<string, number>)
        // populated by chat-card emission. Surfaces a soft warning and pre-applies
        // the cumulative penalty for CUMULATIVE_PENALTY_SKILLS.
        let tryAgainAdvice: RetryAdvice | null = null;
        let tryAgainPenalty = 0;
        if (!isForceField && rollData['type'] === 'Skill') {
            const skillKey = (rollData['rollKey'] as string | null | undefined) ?? null;
            // eslint-disable-next-line no-restricted-syntax -- boundary: rollData carries a heterogeneous actor handle (sourceActor or legacy 'actor'); getFlag is Foundry Document API
            const actorRef = (rollData.sourceActor ?? rollData['actor']) as { getFlag?: (scope: string, key: string) => unknown } | null | undefined;
            if (skillKey !== null && typeof actorRef?.getFlag === 'function') {
                const flagBag = actorRef.getFlag('wh40k-rpg', 'try-again');
                // eslint-disable-next-line no-restricted-syntax -- boundary: getFlag returns unknown; the per-skill counter bag is Record<string, number> by construction
                const attempts = flagBag != null && typeof flagBag === 'object' ? Number((flagBag as Record<string, unknown>)[skillKey] ?? 0) : 0;
                if (attempts > 0) {
                    const advice = getTryAgainAdvice(skillKey, attempts);
                    if (advice.blocksByConvention || advice.cumulativePenalty !== 0) {
                        tryAgainAdvice = advice;
                        tryAgainPenalty = advice.cumulativePenalty;
                    }
                }
            }
        }

        // Skill panel — alt-characteristic dropdown + untrained-halving indicator (#61).
        // Reads `altCharacteristics` from the matching compendium/world skill item on the
        // source actor, then runs `resolveUntrainedTarget` so the dialog can swap the
        // characteristic and surface halving / blocked-advanced advisories. The override
        // characteristic mutates `baseTarget` so every downstream modifier ramp re-computes.
        let skillPanel: {
            visible: boolean;
            characteristic: string;
            characteristicLabel: string;
            altOptions: Array<{ value: string; label: string; isCurrent: boolean }>;
            halved: boolean;
            untrainedAdvanced: boolean;
        } | null = null;
        let skillBaseOverride: number | null = null;
        if (this.rollType === 'simple' && rollData['type'] === 'Skill') {
            const sourceActor = (rollData.sourceActor ?? rollData['actor']) as
                | {
                      // eslint-disable-next-line no-restricted-syntax -- boundary: per-actor skill / characteristic bags are typed loosely on WH40KBaseActor; structural read suffices
                      skills?: Record<string, { advance?: number; characteristic?: string; current?: number; basic?: boolean }>;
                      characteristics?: Record<string, { total?: number; label?: string; short?: string }>;
                      // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry items.find returns the matched document with `unknown` until cast at use site
                      items?: { find?: (cb: (i: { type?: string; name?: string; system?: { identifier?: string } }) => boolean) => unknown };
                  }
                | null
                | undefined;
            const rollKey = (rollData['rollKey'] as string | null | undefined) ?? null;
            const actorSkill = rollKey !== null ? sourceActor?.skills?.[rollKey] : undefined;
            const listedChar = actorSkill?.characteristic ?? '';
            // Specialist-skill rolls target one entry; the document passes that entry's
            // effective rank + current via rollData.skillRank/baseTarget. Prefer those so
            // a trained specialisation isn't read as the parent skill's ~0 advance and
            // halved/blocked as "untrained" (#225). Falls back to the parent skill for
            // non-specialist rolls (skillRank absent).
            const rolledRank = rollData['skillRank'];
            const advance = rolledRank === undefined ? Number(actorSkill?.advance ?? 0) : Number(rolledRank);
            const skillCurrent = rolledRank === undefined ? Number(actorSkill?.current ?? rollData.baseTarget) : Number(rollData.baseTarget);
            const listedCharTotal = Number(sourceActor?.characteristics?.[listedChar]?.total ?? 0);
            const trainingBonus = skillCurrent - listedCharTotal;

            // Locate the matching skill item to read altCharacteristics off its DataModel.
            // eslint-disable-next-line no-restricted-syntax -- boundary: items.find is typed as returning unknown; per-system skill item schema is asserted via altCharacteristics presence
            const skillItem = sourceActor?.items?.find?.((i) => i.type === 'skill' && (i.system?.identifier === rollKey || i.name === rollKey)) as
                | { system?: { altCharacteristics?: string[]; isBasic?: boolean } }
                | undefined;
            const altCharacteristics = Array.isArray(skillItem?.system?.altCharacteristics) ? skillItem.system.altCharacteristics : [];
            const isBasic = skillItem?.system?.isBasic ?? actorSkill?.basic ?? false;

            const charOverride = this._charOverride;
            const effectiveChar = charOverride ?? listedChar;
            const usingAlt = this._charOverride !== null && this._charOverride !== listedChar;
            const altCharTotal = usingAlt ? Number(sourceActor?.characteristics?.[effectiveChar]?.total ?? 0) : 0;

            // The aptitude/career family (DH2 + DH1e/BC/DW/OW/IM) lets any
            // skill be attempted untrained — the -20 penalty is already
            // baked into skillCurrent at actor prepare time (creature.ts
            // line 999, `usesAptitudes === true ? charTotal - 20 : …`).
            // Only RT/legacy systems block untrained Advanced skills.
            const actorGameSystem = (sourceActor as { system?: { gameSystem?: string } } | null | undefined)?.system?.gameSystem ?? '';
            const isAptitudeSystem =
                actorGameSystem === 'dh2' ||
                actorGameSystem === 'dh1' ||
                actorGameSystem === 'bc' ||
                actorGameSystem === 'dw' ||
                actorGameSystem === 'ow' ||
                actorGameSystem === 'im';

            const resolved = resolveUntrainedTarget({
                advance,
                isBasic,
                characteristicTotal: listedCharTotal + trainingBonus,
                ...(usingAlt ? { altCharacteristicTotal: altCharTotal + trainingBonus } : {}),
                halveOnNonBasic: advance === 0 && !isBasic,
                allowUntrainedAdvanced: isAptitudeSystem,
            });
            // Only override base target when we changed the characteristic or fired the halving rule.
            // Otherwise leave rollData.baseTarget untouched so unrelated rolls behave identically.
            if (usingAlt || resolved.halved || resolved.untrainedAdvanced) {
                skillBaseOverride = resolved.target;
            }

            const charLabel = (c: string): string => {
                if (c === '') return '';
                const key = `WH40K.Characteristic.${c.charAt(0).toUpperCase()}${c.slice(1)}`;
                const localized = game.i18n.localize(key);
                return localized === key ? c : localized;
            };
            const altOptions: Array<{ value: string; label: string; isCurrent: boolean }> = [];
            altOptions.push({
                value: listedChar,
                label: game.i18n.format('WH40K.UntrainedSkill.DefaultOption', { name: charLabel(listedChar) }),
                isCurrent: !usingAlt,
            });
            for (const alt of altCharacteristics) {
                if (alt === listedChar) continue;
                altOptions.push({ value: alt, label: charLabel(alt), isCurrent: this._charOverride === alt });
            }

            const showPanel = altCharacteristics.length > 0 || resolved.halved || resolved.untrainedAdvanced;
            skillPanel = {
                visible: showPanel,
                characteristic: effectiveChar,
                characteristicLabel: charLabel(effectiveChar),
                altOptions,
                halved: resolved.halved,
                untrainedAdvanced: resolved.untrainedAdvanced,
            };
        }

        const baseTarget = isForceField ? Number(rollData['protectionRating']) || 0 : (skillBaseOverride ?? rollData.baseTarget) || 0;

        // Sum weapon/combat modifiers already on rollData (exclude dialog-managed keys and range)
        const dialogManagedKeys = new Set(['difficulty', 'situational', 'modifier', 'range', 'combat-situational', 'psy-mode', 'assistance']);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- rollData.modifiers always present per type; runtime data may be uninitialised; ?? {} is defensive
        const safeModifiers = rollData.modifiers ?? {};
        const weaponModSum = !isForceField
            ? Object.entries(safeModifiers)
                  .filter(([k]) => !dialogManagedKeys.has(k))
                  .reduce((sum, [, v]) => sum + (Number(v) || 0), 0) + (Number(rollData.rangeBonus) || 0)
            : 0;

        // Climbing surface modifier (#146 — errata L113). Only applied on Athletics rolls.
        const rollKeyValue = (rollData['rollKey'] as string | null | undefined) ?? null;
        const isAthletics = this.rollType === 'simple' && rollData['type'] === 'Skill' && rollKeyValue === 'athletics';
        const climbMod = isAthletics ? getClimbingModifier({ surfaceType: this._climbSurface }) : 0;

        const finalTarget = Math.max(
            0,
            baseTarget + weaponModSum + difficultyMod + situationalMod + customMod + combatSitMod + psyMod + assistanceMod + tryAgainPenalty + climbMod,
        );

        // Build target breakdown tooltip
        const tooltipParts = [`Base: ${baseTarget}`];
        if (weaponModSum !== 0) tooltipParts.push(`Weapon/Combat: ${weaponModSum >= 0 ? '+' : ''}${weaponModSum}`);
        if (difficultyMod !== 0) tooltipParts.push(`Difficulty: ${difficultyMod >= 0 ? '+' : ''}${difficultyMod}`);
        if (situationalMod !== 0) tooltipParts.push(`Situational: ${situationalMod >= 0 ? '+' : ''}${situationalMod}`);
        if (customMod !== 0) tooltipParts.push(`Custom: ${customMod >= 0 ? '+' : ''}${customMod}`);
        if (combatSitMod !== 0) tooltipParts.push(`Combat Mods: ${combatSitMod >= 0 ? '+' : ''}${combatSitMod}`);
        if (psyMod !== 0) tooltipParts.push(`Psy Mode: ${psyMod >= 0 ? '+' : ''}${psyMod}`);
        if (assistanceMod !== 0) tooltipParts.push(`Assistance: +${assistanceMod}`);
        if (tryAgainPenalty !== 0) tooltipParts.push(`Try-Again: ${tryAgainPenalty}`);
        if (climbMod !== 0) tooltipParts.push(`Climb Surface: ${climbMod >= 0 ? '+' : ''}${climbMod}`);
        tooltipParts.push(`= ${finalTarget}`);
        const targetBreakdownTooltip = tooltipParts.join('\n');

        // Dynamic color class based on success chance (tw-* arbitrary values for color + text-shadow)
        let targetColorClass: string;
        if (finalTarget <= 15) targetColorClass = 'tw-text-[#dc2626] tw-[text-shadow:0_0_20px_rgba(220,38,38,0.5),0_2px_8px_rgba(0,0,0,0.6)]';
        else if (finalTarget <= 30) targetColorClass = 'tw-text-[#f87171] tw-[text-shadow:0_0_20px_rgba(248,113,113,0.4),0_2px_8px_rgba(0,0,0,0.6)]';
        else if (finalTarget <= 45) targetColorClass = 'tw-text-[#fbbf24] tw-[text-shadow:0_0_25px_rgba(251,191,36,0.4),0_2px_8px_rgba(0,0,0,0.6)]';
        else if (finalTarget <= 60) targetColorClass = 'tw-text-gold tw-[text-shadow:0_0_30px_rgba(201,162,39,0.4),0_2px_8px_rgba(0,0,0,0.6)]';
        else if (finalTarget <= 80) targetColorClass = 'tw-text-[#4ade80] tw-[text-shadow:0_0_30px_rgba(74,222,128,0.5),0_2px_8px_rgba(0,0,0,0.6)]';
        else targetColorClass = 'tw-text-[#22d3ee] tw-[text-shadow:0_0_35px_rgba(34,211,238,0.5),0_0_60px_rgba(34,211,238,0.2),0_2px_8px_rgba(0,0,0,0.6)]';

        // Track previous target for animation
        // eslint-disable-next-line no-restricted-syntax -- boundary: _previousTarget is dialog state (number | null), not a DataModel field; null signals "first render"
        this._previousTarget = this._previousTarget ?? finalTarget;

        // Calculate roll result if manual roll is complete
        let rollResult = null;
        const manualTotal = this._manualRollTotal;
        if (manualTotal !== null) {
            const method = resolveDegreesMethod((this.rollData.sourceActor?.system as { gameSystem?: string } | undefined)?.gameSystem);
            const success = manualTotal === 1 || (manualTotal <= finalTarget && manualTotal !== 100);
            if (success) {
                const dos = 1 + getDegreeForMode(method, finalTarget, manualTotal);
                rollResult = { success: true, dos, dof: 0, total: manualTotal };
            } else {
                const dof = 1 + getDegreeForMode(method, manualTotal, finalTarget);
                rollResult = { success: false, dos: 0, dof, total: manualTotal };
            }
        }
        this._rollResult = rollResult;

        // Difficulty data
        const difficulty = this._currentDifficulty;

        // Build difficulty picker list (ordered relative to current)
        const ctor = this.constructor as typeof UnifiedRollDialog;
        const difficultyPicker = ctor.DIFFICULTIES.map((d, i) => ({
            ...d,
            index: i,
            isCurrent: i === this._selectedDifficultyIndex,
            modifierLabel: d.modifier >= 0 ? `+${d.modifier}` : `${d.modifier}`,
        }));

        // Situational modifiers with toggle state
        // eslint-disable-next-line no-restricted-syntax -- boundary: _cachedSituationalModifiers is dialog state (null = not yet collected), not a DataModel field
        const situationalModifiers = (this._cachedSituationalModifiers ?? []).map((m) => ({
            ...m,
            active: this._situationalModifiers[`${m.key}_${m.source}`] ?? false,
            toggleKey: `${m.key}_${m.source}`,
            valueLabel: m.value >= 0 ? `+${m.value}` : `${m.value}`,
        }));
        const hasSituationalModifiers = situationalModifiers.length > 0;

        // Test variants (#246) — homebrew-gated skill sub-tests.
        const skillVariants = this._getSkillVariants();

        // Modifier aggregate
        const modifierAggregate = difficultyMod + situationalMod + customMod + combatSitMod + psyMod + assistanceMod + tryAgainPenalty + climbMod;

        // Roll type specific data
        const isWeapon = this.rollType === 'weapon';
        const isPsychic = this.rollType === 'psychic';
        const isSimple = this.rollType === 'simple';

        // Actor info (ForceFieldData uses .actor, ActionData uses .sourceActor or .actor)
        const actor = (rollData.sourceActor ?? rollData['actor']) as { name?: string; img?: string } | null | undefined;
        const actorName = actor?.name ?? '';
        const actorImg = actor?.img ?? '';

        // Roll name
        /* eslint-disable @typescript-eslint/no-unnecessary-condition -- forceField and rollData.name may be absent at runtime; optional chain + ?? is defensive */
        const rollName = isForceField
            ? ((rollData['forceField'] as { name?: string } | null | undefined)?.name ?? '') || 'Force Field'
            : (rollData.name ?? '') || (rollData.nameOverride ?? '') || 'Test';
        /* eslint-enable @typescript-eslint/no-unnecessary-condition */
        /* eslint-disable @typescript-eslint/no-unnecessary-condition -- rollData.action may be absent at runtime on uninitialised roll data despite its type */
        const rollSubtitle = isForceField
            ? 'Force Field Activation'
            : (typeof rollData['type'] === 'string' && rollData['type'].length > 0 ? rollData['type'] : null) ?? rollData.action ?? '';
        /* eslint-enable @typescript-eslint/no-unnecessary-condition */

        return {
            ...context,
            rollData,
            actorName,
            actorImg,
            rollName,
            rollSubtitle,
            baseTarget,
            finalTarget,
            targetColorClass,
            targetBreakdownTooltip,
            previousTarget: this._previousTarget,
            difficulty,
            difficultyMod,
            situationalMod,
            customMod: this._customModifier,
            modifierAggregate,
            difficultyPicker,
            difficultyPickerOpen: this._difficultyPickerOpen,
            situationalModifiers,
            hasSituationalModifiers,
            skillVariants,
            hasSkillVariants: skillVariants.length > 0,
            selectedSkillVariant: this._selectedSkillVariant,
            showCustomModifier: this._showCustomModifier || this._customModifier !== 0,
            assistantCount: this._assistantCount,
            assistanceBonus: assistanceMod,
            assistantMax: DEFAULT_ASSISTANT_CAP,
            canIncrementAssistant: this._assistantCount < DEFAULT_ASSISTANT_CAP,
            canDecrementAssistant: this._assistantCount > 0,
            extended: this._extended,
            extendedThreshold: this._extendedThreshold,
            tryAgainAdvice,
            tryAgainPenalty,
            tryAgainPenaltyLabel: tryAgainPenalty < 0 ? `${tryAgainPenalty}` : tryAgainPenalty > 0 ? `+${tryAgainPenalty}` : '0',
            rollResult,
            manualRollTens: this._manualRollTens,
            manualRollUnits: this._manualRollUnits,
            singleRollValue: this._singleRollValue,
            diceInputMode: this._diceInputMode,
            isTwoDice: this._diceInputMode === 'two-dice',
            hasManualRoll: manualTotal !== null,
            manualRollTotal: manualTotal,
            contextExpanded: this._contextExpanded,
            // Roll type flags
            isWeapon,
            isPsychic,
            isForceField,
            // Skill alt-characteristic panel (#61)
            skillPanel,
            hasSkillPanel: skillPanel?.visible === true,
            isSimple,
            // Climbing-surface picker (#146 — errata L113). Visible only on Athletics rolls.
            isAthletics,
            climbSurface: this._climbSurface,
            climbSurfaceOptions: [
                { value: 'standard', label: game.i18n.localize('WH40K.Climbing.Standard'), isCurrent: this._climbSurface === 'standard' },
                { value: 'sheer', label: game.i18n.localize('WH40K.Climbing.Sheer'), isCurrent: this._climbSurface === 'sheer' },
                { value: 'easy', label: game.i18n.localize('WH40K.Climbing.Easy'), isCurrent: this._climbSurface === 'easy' },
            ],
            climbMod,
            hasContextPanel: isWeapon || isPsychic || isForceField || isAthletics || skillPanel?.visible === true,
            // Weapon data
            ...(isWeapon ? this._getWeaponContext() : {}),
            // Psychic data
            ...(isPsychic ? this._getPsychicContext() : {}),
            // Force field data
            ...(isForceField ? this._getForceFieldContext() : {}),
            // Base char
            baseChar: rollData.baseChar || '',
        };
    }

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender has a loose Foundry signature with unknown options bag
    override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);

        // Auto-select number inputs on focus
        this._el.querySelectorAll('input[type="number"], input[data-dtype="Number"]').forEach((input) => {
            input.addEventListener('focus', (e) => (e.target as HTMLInputElement).select());
        });

        // Set up two-dice input handlers
        const tensInput = this._el.querySelector<HTMLInputElement>('#manual-tens');
        const unitsInput = this._el.querySelector<HTMLInputElement>('#manual-units');
        if (tensInput) {
            tensInput.addEventListener('input', (e) => {
                const val = parseInt((e.target as HTMLInputElement).value, 10);
                this._manualRollTens = val >= 0 && val <= 9 ? val : null;
                if (this._manualRollTens !== null && unitsInput) {
                    unitsInput.focus();
                    unitsInput.select();
                }
                void this.render(false, { parts: ['diceInput', 'footer'] });
            });
        }
        if (unitsInput) {
            unitsInput.addEventListener('input', (e) => {
                const val = parseInt((e.target as HTMLInputElement).value, 10);
                this._manualRollUnits = val >= 0 && val <= 9 ? val : null;
                void this.render(false, { parts: ['diceInput', 'footer'] });
            });
        }

        // Single number input
        const singleInput = this._el.querySelector<HTMLInputElement>('#manual-single');
        if (singleInput) {
            singleInput.addEventListener('input', (e) => {
                const val = parseInt((e.target as HTMLInputElement).value, 10);
                this._singleRollValue = val >= 1 && val <= 100 ? val : null;
                void this.render(false, { parts: ['diceInput', 'footer'] });
            });
        }

        // Custom modifier input
        const customInput = this._el.querySelector<HTMLInputElement>('#unified-custom-modifier');
        if (customInput) {
            customInput.addEventListener('change', (e) => {
                this._customModifier = parseInt((e.target as HTMLInputElement).value, 10) || 0;
                void this.render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
            });
        }

        // Animate target number if changed
        const targetEl = this._el.querySelector<HTMLElement>('.urd-target__number');
        if (targetEl && this._previousTarget !== null) {
            const newTarget = parseInt(targetEl.dataset['value'] ?? '', 10) || 0;
            if (this._previousTarget !== newTarget) {
                this._animateTargetNumber(targetEl, this._previousTarget, newTarget);
                this._playTickSound();
            }
            this._previousTarget = newTarget;
        }

        // Click-outside to close difficulty picker
        if (this._pickerOutsideHandler) {
            document.removeEventListener('pointerdown', this._pickerOutsideHandler);
            this._pickerOutsideHandler = null;
        }
        if (this._difficultyPickerOpen) {
            const picker = this._el.querySelector('.urd-difficulty-picker');
            if (picker) {
                const handler: (e: PointerEvent) => void = (e) => {
                    const eTarget = e.target as Node | null;
                    if (!picker.contains(eTarget) && !(eTarget as HTMLElement | null)?.closest('[data-action="toggleDifficultyPicker"]')) {
                        this._difficultyPickerOpen = false;
                        document.removeEventListener('pointerdown', handler);
                        this._pickerOutsideHandler = null;
                        void this.render(false, { parts: ['targetDisplay'] });
                    }
                };
                this._pickerOutsideHandler = handler;
                setTimeout(() => document.addEventListener('pointerdown', handler), 0);
            }
        }

        // Keyboard: Enter submits, Escape closes picker
        this._el.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._difficultyPickerOpen) {
                e.preventDefault();
                this._difficultyPickerOpen = false;
                void this.render(false, { parts: ['targetDisplay'] });
                return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void this._submitToChat();
            }
        });
    }

    /* -------------------------------------------- */
    /*  Context Helpers                              */
    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: context bag returned to Handlebars template; keys are heterogeneous by design
    _getWeaponContext(): Record<string, unknown> {
        const rd = this.rollData;

        // Apply range bracket override if user selected one
        if (this._selectedRangeBracket !== null && rd.weapon?.isRanged === true) {
            const bracket = RANGE_BRACKETS[this._selectedRangeBracket];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- bracket may be undefined due to noUncheckedIndexedAccess
            if (bracket) {
                rd.rangeName = bracket.label;
                rd.rangeBonus = bracket.modifier;
                rd['rangeBracket'] = this._selectedRangeBracket;
            }
        }

        // Build range bracket list for UI with meter values
        const maxRange = rd.maxRange || 0;
        const rangeBrackets =
            rd.weapon?.isRanged === true
                ? Object.entries(RANGE_BRACKETS).map(([key, b]) => {
                      let rangeText = '';
                      if (maxRange > 0) {
                          if (key === 'pointBlank') rangeText = '≤2m';
                          else if (key === 'short') rangeText = `≤${Math.floor(maxRange * 0.5)}m`;
                          else if (key === 'standard') rangeText = `≤${maxRange * 2}m`;
                          else if (key === 'long') rangeText = `≤${maxRange * 3}m`;
                          else if (key === 'extreme') rangeText = `>${maxRange * 3}m`;
                      }
                      return {
                          key,
                          label: b.label,
                          modifier: b.modifier,
                          modifierLabel: b.modifier >= 0 ? `+${b.modifier}` : `${b.modifier}`,
                          rangeText,
                          // eslint-disable-next-line no-restricted-syntax -- boundary: _selectedRangeBracket is dialog state (string | null), not a DataModel field
                          isSelected: (this._selectedRangeBracket ?? rd['rangeBracket']) === key,
                      };
                  })
                : [];

        // Card-based attack modes
        const isRanged = rd.weapon?.isRanged === true;
        /* eslint-disable no-restricted-syntax -- boundary: rd.weapon cast is boundary; weapon roll data typing does not match AttackOptionWeaponLike exactly */
        const attackModes = rd.weapon
            ? getAvailableAttackModes(rd.weapon as unknown as AttackOptionWeaponLike).map((m) => ({
                  ...m,
                  isSelected: this._attackModeKey === m.key,
                  modifierLabel: m.modifier >= 0 ? `+${m.modifier}` : `${m.modifier}`,
              }))
            : [];
        /* eslint-enable no-restricted-syntax */

        // Melee special options
        const meleeSpecialOptions =
            !isRanged && rd.weapon
                ? getMeleeSpecialOptions().map((m) => ({
                      ...m,
                      isSelected: this._attackModeKey === m.key,
                      modifierLabel: m.modifier >= 0 ? `+${m.modifier}` : `${m.modifier}`,
                  }))
                : [];

        // Aim options
        const canAim = rd['canAim'] !== false;
        const aimOptions = AIM_OPTIONS.map((a) => ({
            ...a,
            isSelected: this._aimModeKey === a.key,
            modifierLabel: a.modifier >= 0 ? `+${a.modifier}` : `${a.modifier}`,
            disabled: !canAim && a.key !== 'none',
        }));

        // Combat situational modifiers
        const combatSituationals = rd.weapon
            ? getSituationalModifiers(isRanged).map((s) => ({
                  ...s,
                  isActive: this._activeCombatSituationals.has(s.key),
                  modifierLabel: s.modifier >= 0 ? `+${s.modifier}` : `${s.modifier}`,
                  // Cover doesn't penalise the to-hit roll — it adds Armour at the hit
                  // location. Surface that AP instead of a misleading "+0" (#232).
                  coverAP: s.damageEffect?.coverAP ?? null,
              }))
            : [];

        // Size modifiers from config (values are plain strings like "Average (4)")
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- CONFIG.wh40k may be absent on early initialization
        const sizes = CONFIG.wh40k?.sizes ?? {};
        // eslint-disable-next-line no-restricted-syntax -- boundary: _sizeModifierKey is dialog state (string | null); null means "derive from target actor"
        const currentSizeMod = this._sizeModifierKey ?? this._getDefaultSizeKey(rd);
        const sizeOptions = Object.entries(sizes).map(([key, label]) => {
            const modifier = (parseInt(key, 10) - 4) * 10;
            return {
                key,
                label,
                modifier,
                modifierLabel: modifier >= 0 ? `+${modifier}` : `${modifier}`,
                isSelected: key === currentSizeMod,
            };
        });

        // Selected range summary for collapsed header
        // eslint-disable-next-line no-restricted-syntax -- boundary: _selectedRangeBracket is dialog state (string | null), not a DataModel field
        const currentRangeKey = this._selectedRangeBracket ?? rd['rangeBracket'];
        const currentRangeBracket = rangeBrackets.find((b) => b.key === currentRangeKey) ?? rangeBrackets.find((b) => b.key === 'standard') ?? rangeBrackets[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- currentRangeBracket may be undefined due to noUncheckedIndexedAccess
        const selectedRangeSummary = currentRangeBracket
            ? { label: currentRangeBracket.label, modifier: currentRangeBracket.modifier, modifierLabel: currentRangeBracket.modifierLabel }
            : { label: 'Standard', modifier: 0, modifierLabel: '+0' };

        // Selected situational summary for collapsed header
        const activeSituationals = combatSituationals.filter((s) => s.isActive);
        const sitTotal = activeSituationals.reduce((sum, s) => sum + s.modifier, 0);
        const selectedSituationalSummary = {
            hasActive: activeSituationals.length > 0,
            label: activeSituationals.length > 0 ? activeSituationals.map((s) => s.label).join(', ') : 'None',
            total: sitTotal,
            totalLabel: sitTotal >= 0 ? `+${sitTotal}` : `${sitTotal}`,
        };

        // Selected size summary for collapsed header
        const currentSizeOption = sizeOptions.find((s) => s.isSelected) ?? sizeOptions.find((s) => s.key === '4');
        const selectedSizeSummary = currentSizeOption
            ? { label: currentSizeOption.label, modifier: currentSizeOption.modifier, modifierLabel: currentSizeOption.modifierLabel }
            : { label: 'Average (4)', modifier: 0, modifierLabel: '+0' };

        // Current Foundry-native target (#250) — surfaced so the attacker can see
        // and pick the defender; `selectTarget` reads game.user.targets.
        const targetActorForDisplay = rd.targetActor as { name?: string } | null | undefined;

        return {
            weapons: Array.isArray(rd['weapons']) ? rd['weapons'] : [],
            weapon: rd.weapon,
            weaponSelect: rd['weaponSelect'],
            isRanged,
            isMelee: !isRanged,
            targetName: targetActorForDisplay?.name ?? null,
            hasTarget: targetActorForDisplay != null,
            // Card data
            attackModes,
            meleeSpecialOptions,
            specialOptionsExpanded: this._specialOptionsExpanded,
            aimOptions,
            combatSituationals,
            hasCombatSituationals: combatSituationals.length > 0,
            sizeOptions,
            sizeExpanded: this._sizeExpanded,
            rangeExpanded: this._rangeExpanded,
            situationalExpanded: this._situationalExpanded,
            // Collapsed section summaries
            selectedRangeSummary,
            selectedSituationalSummary,
            selectedSizeSummary,
            // Range data
            rangeBrackets,
            // eslint-disable-next-line no-restricted-syntax -- boundary: _selectedRangeBracket is dialog state (string | null), not a DataModel field
            selectedRangeBracket: this._selectedRangeBracket ?? rd['rangeBracket'],
            rangeModifiedBy: rd['rangeModifiedBy'],
            isMeltaRange: rd['isMeltaRange'],
            maxRange,
            // Existing data we still need
            fireRate: rd['fireRate'],
            usesAmmo: rd['usesAmmo'],
            ammoText: rd['ammoText'],
            isCalledShot: rd['isCalledShot'],
            calledShotLocation: rd['calledShotLocation'],
            locations: rd.locations,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- rd.actions may be absent at runtime on uninitialised roll data despite its type
            actions: rd.actions ?? {},
            currentAction: rd.action,
        };
    }

    /**
     * Determine the default size key based on target actor.
     * @param {WeaponRollData} rd
     * @returns {string} Size key (e.g. "4" for Average)
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: rd is heterogeneous weapon roll data bag passed from Handlebars context
    _getDefaultSizeKey(rd: Record<string, unknown>): string {
        const targetActor = rd['targetActor'] as { system?: { size?: string | number | null } } | null | undefined;
        const size = targetActor?.system?.size;
        if (typeof size === 'string') return size;
        if (typeof size === 'number') return String(size);
        return '4'; // Average
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: context bag returned to Handlebars template; keys are heterogeneous by design
    _getPsychicContext(): Record<string, unknown> {
        const rd = this.rollData;
        const basePR = Number(rd['pr']) || 0;
        const psyModeBreakdown = resolvePsyMode({ mode: this._psyMode, basePR, pushLevel: this._pushLevel });
        return {
            psychicPowers: Array.isArray(rd['psychicPowers']) ? rd['psychicPowers'] : [],
            power: rd.power,
            powerSelect: rd['powerSelect'],
            pr: rd['pr'],
            maxPr: rd['maxPr'],
            hasFocus: rd['hasFocus'],
            hasDamage: rd['hasDamage'],
            distance: rd.distance,
            rangeName: rd.rangeName,
            maxRange: rd.maxRange,
            difficulties: rd.difficulties,
            psyMode: this._psyMode,
            pushLevel: this._pushLevel,
            isFettered: this._psyMode === 'fettered',
            isUnfettered: this._psyMode === 'unfettered',
            isPush: this._psyMode === 'push',
            psyModeBreakdown,
        };
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: context bag returned to Handlebars template; keys are heterogeneous by design
    _getForceFieldContext(): Record<string, unknown> {
        const rd = this.rollData;
        return {
            forceField: rd['forceField'],
            protectionRating: rd['protectionRating'],
        };
    }

    /* -------------------------------------------- */
    /*  Helper Methods                               */
    /* -------------------------------------------- */

    _collectSituationalModifiers(): Array<{ key: string; source: string; value: number; label: string; appliesToVariant?: string }> {
        /* eslint-disable no-restricted-syntax -- boundary: rollData is a heterogeneous bag; actor may be on sourceActor or the legacy 'actor' key */
        const actor = this.rollData.sourceActor ?? (this.rollData as Record<string, unknown>)['actor'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: actor is unknown; cast + type-guard pattern; optional chain guards real runtime possibility
        if (typeof (actor as { getSituationalModifiers?: unknown })?.getSituationalModifiers !== 'function') return [];
        /* eslint-enable no-restricted-syntax */
        const rd = this.rollData;
        const type = rd['type'] === 'Skill' ? 'skills' : rd['type'] === 'Characteristic' ? 'characteristics' : 'combat';
        const key = (rd['rollKey'] as string | null) ?? null;
        return (
            actor as {
                getSituationalModifiers: (
                    type: string,
                    key: string | null,
                ) => Array<{ key: string; source: string; value: number; label: string; appliesToVariant?: string }>;
            }
        ).getSituationalModifiers(type, key);
    }

    /**
     * Test variants available for this roll (#246): a skill roll's declared
     * variants, surfaced only when homebrew refinements are on. Empty otherwise,
     * which keeps the selector hidden in RAW mode.
     */
    _getSkillVariants(): SkillVariant[] {
        const rd = this.rollData;
        if (rd['type'] !== 'Skill') return [];
        const rollKey = (rd['rollKey'] as string | null | undefined) ?? null;
        if (rollKey === null) return [];
        // eslint-disable-next-line no-restricted-syntax -- boundary: rollData carries a heterogeneous actor handle; per-system skill item schema is read structurally
        const sourceActor = (rd.sourceActor ?? rd['actor']) as
            | { items?: Iterable<{ type?: string; name?: string; system?: { identifier?: string; variants?: SkillVariant[] } }> }
            | null
            | undefined;
        let variants: SkillVariant[] = [];
        for (const item of sourceActor?.items ?? []) {
            if (item.type === 'skill' && (item.system?.identifier === rollKey || item.name === rollKey)) {
                if (Array.isArray(item.system?.variants)) variants = item.system.variants;
                break;
            }
        }
        return availableSkillVariants(variants, WH40KSettings.isHomebrew());
    }

    _calculateSituationalModifiers(): number {
        let total = 0;
        // Active, then gated by the selected test variant (#246): a variant-tagged
        // modifier only counts when its variant is the one being rolled.
        // eslint-disable-next-line no-restricted-syntax -- boundary: _cachedSituationalModifiers is dialog state (null = not yet collected), not a DataModel field
        const active = (this._cachedSituationalModifiers ?? []).filter((mod) => this._situationalModifiers[`${mod.key}_${mod.source}`]);
        for (const mod of filterModifiersByVariant(active, this._selectedSkillVariant)) {
            total += mod.value;
        }
        return total;
    }

    /**
     * Calculate sum of active combat situational card modifiers.
     * @returns {number}
     */
    _calculateCombatSituationalModifiers(): number {
        if (this._activeCombatSituationals.size === 0) return 0;
        const isRanged = this.rollData.weapon?.isRanged === true;
        const situationals = getSituationalModifiers(isRanged);
        let total = 0;
        for (const s of situationals) {
            if (this._activeCombatSituationals.has(s.key)) {
                total += s.modifier;
            }
        }
        return total;
    }

    _stepDifficulty(direction: number): void {
        const newIndex = this._selectedDifficultyIndex + direction;
        const ctor = this.constructor as typeof UnifiedRollDialog;
        if (newIndex < 0 || newIndex >= ctor.DIFFICULTIES.length) return;
        this._selectedDifficultyIndex = newIndex;
        this._difficultyPickerOpen = false;
        void this.render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    /**
     * Animate the target number counting from old to new value.
     */
    _animateTargetNumber(el: HTMLElement, from: number, to: number): void {
        const duration = 400;
        const start = performance.now();
        const diff = to - from;
        const step = (now: number): void => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - (1 - progress) ** 3; // ease-out cubic
            const current = Math.round(from + diff * eased);
            el.textContent = String(current);
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        // Flash color
        el.classList.remove('urd-target-increase', 'urd-target-decrease');
        void el.offsetWidth; // force reflow
        el.classList.add(to > from ? 'urd-target-increase' : 'urd-target-decrease');
    }

    /**
     * Play a subtle tick sound when target changes.
     */
    _playTickSound(): void {
        const src = 'sounds/dice.wav';
        void foundry.audio.AudioHelper.play({ src, volume: 0.15, loop: false }, false);
    }

    /* -------------------------------------------- */
    /*  Form Handler                                 */
    /* -------------------------------------------- */

    static async #onFormSubmit(this: UnifiedRollDialog, _event: SubmitEvent, _form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: FormDataExtended.object is typed loosely by Foundry; cast is the documented pattern
        const data = foundry.utils.expandObject((formData as unknown as { object: Record<string, unknown> }).object);
        // Update roll data fields from form
        const rd = this.rollData;
        foundry.utils.mergeObject(rd, data, { recursive: true });
        if (typeof rd['update'] === 'function') {
            await (rd['update'] as () => Promise<void>)();
        }
        // Re-render dependent parts (e.g., Called Shot location dropdown, range info)
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    /* -------------------------------------------- */
    /*  Action Handlers                              */
    /* -------------------------------------------- */

    static async #onToggleDifficultyPicker(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this._difficultyPickerOpen = !this._difficultyPickerOpen;
        await this.render(false, { parts: ['targetDisplay'] });
    }

    static async #onSelectDifficulty(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset['difficultyIndex'] ?? '', 10);
        const ctor = this.constructor as typeof UnifiedRollDialog;
        if (Number.isInteger(index) && index >= 0 && index < ctor.DIFFICULTIES.length) {
            this._selectedDifficultyIndex = index;
            this._difficultyPickerOpen = false;
            await this.render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
        }
    }

    static async #onToggleSituational(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset['toggleKey'];
        if (key === undefined) return;
        this._situationalModifiers[key] = !this._situationalModifiers[key];
        await this.render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    static async #onCustomModUp(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this._customModifier += 5;
        await this.render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    static async #onCustomModDown(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this._customModifier -= 5;
        await this.render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    static async #onToggleCustomModifier(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this._showCustomModifier = !this._showCustomModifier;
        if (!this._showCustomModifier) this._customModifier = 0;
        await this.render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    static async #onSubmitToChat(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        await this._submitToChat();
    }

    static async #onSystemRoll(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        await this._systemRoll();
    }

    static async #onClearManualRoll(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this._manualRollTens = null;
        this._manualRollUnits = null;
        this._singleRollValue = null;
        this._rollResult = null;
        await this.render(false, { parts: ['diceInput', 'footer'] });
    }

    static async #onToggleDiceMode(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this._diceInputMode = this._diceInputMode === 'two-dice' ? 'single' : 'two-dice';
        this._manualRollTens = null;
        this._manualRollUnits = null;
        this._singleRollValue = null;
        this._rollResult = null;
        await this.render(false, { parts: ['diceInput', 'footer'] });
    }

    static async #onToggleContextSection(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this._contextExpanded = !this._contextExpanded;
        await this.render(false, { parts: ['contextPanel'] });
    }

    static async #onSelectWeapon(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const weaponId = target.dataset['weaponId'] ?? (target as HTMLInputElement).name;
        const rd = this.rollData;
        if (typeof rd['selectWeapon'] === 'function') {
            (rd['selectWeapon'] as (id: string) => void)(weaponId);
            if (typeof rd['update'] === 'function') await (rd['update'] as () => Promise<void>)();
            await this.render();
        }
    }

    static async #onSelectPower(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const powerId = target.dataset['powerId'] ?? (target as HTMLInputElement).name;
        const rd = this.rollData;
        if (typeof rd['selectPower'] === 'function') {
            (rd['selectPower'] as (id: string) => void)(powerId);
            if (typeof rd['update'] === 'function') await (rd['update'] as () => Promise<void>)();
            await this.render();
        }
    }

    static async #onCancel(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        await this.close();
    }

    /* ---- Psychic Push / Fettered / Unfettered selector handlers (#69) ---- */

    static async #onSetPsyMode(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const mode = target.dataset['psyMode'];
        if (mode !== 'fettered' && mode !== 'unfettered' && mode !== 'push') return;
        this._psyMode = mode;
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'modifiers', 'diceInput'] });
    }

    static async #onIncrementPushLevel(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        if (this._pushLevel >= 3) return;
        this._pushLevel += 1;
        if (this._psyMode !== 'push') this._psyMode = 'push';
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'modifiers', 'diceInput'] });
    }

    static async #onDecrementPushLevel(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        if (this._pushLevel <= 1) return;
        this._pushLevel -= 1;
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'modifiers', 'diceInput'] });
    }

    /* ---- Assistance stepper (#60) ----                                                  */
    /* +10 per assistant up to DEFAULT_ASSISTANT_CAP (core.md §"Assistance", p. 25).        */

    static async #onIncrementAssistant(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        if (this._assistantCount >= DEFAULT_ASSISTANT_CAP) return;
        this._assistantCount += 1;
        await this.render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    static async #onDecrementAssistant(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        if (this._assistantCount <= 0) return;
        this._assistantCount -= 1;
        await this.render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    /* ---- Alternate characteristic override for skill rolls (#61) ---- */

    static async #onSetCharacteristicOverride(this: UnifiedRollDialog, event: Event, _target: HTMLElement): Promise<void> {
        const select = event.target as HTMLSelectElement | null;
        const value = select?.value ?? '';
        // Empty string sentinel means "no override" — fall back to the skill's listed characteristic.
        this._charOverride = value === '' ? null : value;
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'modifiers', 'diceInput'] });
    }

    /* ---- Climbing surface picker for Athletics rolls (#146) ----              */
    /* Errata p. 113 — sheer surfaces add Hard (-20) to the Athletics test.      */

    static async #onSetClimbSurface(this: UnifiedRollDialog, event: Event, _target: HTMLElement): Promise<void> {
        const select = event.target as HTMLSelectElement | null;
        const value = select?.value ?? 'standard';
        const next: ClimbingSurface = value === 'sheer' || value === 'easy' ? value : 'standard';
        if (next === this._climbSurface) return;
        this._climbSurface = next;
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'modifiers', 'diceInput'] });
    }

    /* ---- Extended Test toggle (#59) ----                                                 */
    /* When enabled, the rolled DoS feeds into an ExtendedTestData ladder on the chat card. */

    static async #onToggleExtended(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        // Action may fire from either the checkbox itself or a wrapper label/button.
        const checkbox = target instanceof HTMLInputElement ? target : target.querySelector<HTMLInputElement>('input[type="checkbox"]');
        this._extended = checkbox?.checked ?? !this._extended;
        await this.render(false, { parts: ['modifiers'] });
    }

    static async #onSetExtendedThreshold(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const input = target instanceof HTMLInputElement ? target : target.querySelector<HTMLInputElement>('input[type="number"]');
        const raw = input?.valueAsNumber;
        const next = Number.isFinite(raw) ? Math.max(1, Math.trunc(raw as number)) : this._extendedThreshold;
        if (next === this._extendedThreshold) return;
        this._extendedThreshold = next;
        await this.render(false, { parts: ['modifiers'] });
    }

    /* ---- Card-based Weapon Panel Handlers ---- */

    static async #onSelectAttackMode(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset['modeKey'];
        if (key === undefined) return;
        this._attackModeKey = key;

        // Map card key to combat action name and set on rollData
        const rd = this.rollData;
        const isRanged = rd.weapon?.isRanged === true;
        const actionName = getActionNameForMode(key, isRanged);
        if (actionName !== null) {
            rd.action = actionName;
        }

        // If selecting a special option, auto-expand that section
        if (isMeleeSpecialOption(key)) {
            this._specialOptionsExpanded = true;
        }

        // If aim is disabled by this mode (e.g., All Out Attack), reset aim
        if (typeof rd['update'] === 'function') await (rd['update'] as () => Promise<void>)();
        if (rd['canAim'] === false && this._aimModeKey !== 'none') {
            this._aimModeKey = 'none';
            rd.modifiers['aim'] = 0;
        }

        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    static async #onSelectAimMode(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset['aimKey'];
        if (key === undefined) return;
        this._aimModeKey = key;
        const rd = this.rollData;
        rd.modifiers['aim'] = getAimModifier(key);
        if (typeof rd['update'] === 'function') await (rd['update'] as () => Promise<void>)();
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    static async #onToggleCombatSituational(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset['situationalKey'];
        if (key === undefined) return;
        if (this._activeCombatSituationals.has(key)) {
            this._activeCombatSituationals.delete(key);
        } else {
            this._activeCombatSituationals.add(key);
        }
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    static async #onSelectSizeModifier(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset['sizeKey'];
        if (key === undefined) return;
        this._sizeModifierKey = key;
        this.rollData.modifiers['target-size'] = (parseInt(key, 10) - 4) * 10;
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    static async #onToggleSpecialOptions(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this._specialOptionsExpanded = !this._specialOptionsExpanded;
        await this.render(false, { parts: ['contextPanel'] });
    }

    static async #onToggleSizeSection(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this._sizeExpanded = !this._sizeExpanded;
        await this.render(false, { parts: ['contextPanel'] });
    }

    static async #onToggleRangeSection(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this._rangeExpanded = !this._rangeExpanded;
        await this.render(false, { parts: ['contextPanel'] });
    }

    static async #onToggleSituationalSection(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this._situationalExpanded = !this._situationalExpanded;
        await this.render(false, { parts: ['contextPanel'] });
    }

    static async #onSelectRangeBracket(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const bracket = target.dataset['bracket'];
        if (bracket === undefined) return;
        this._selectedRangeBracket = bracket;
        const bracketData = RANGE_BRACKETS[bracket];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- bracketData may be undefined due to noUncheckedIndexedAccess
        if (bracketData) {
            const rd = this.rollData;
            rd.rangeName = bracketData.label;
            rd.rangeBonus = bracketData.modifier;
            rd['rangeBracket'] = bracket;
        }
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    /**
     * Resolve the distance to the user's current target from the source token and
     * write it (plus the target actor) onto rollData so the range band/bonus
     * recompute (#233). Returns false when there is no source token or no target;
     * when `notify` is true the player is told why (the manual "select target"
     * button passes true — the auto-calc on dialog open stays silent).
     */
    #applyTargetDistance(notify: boolean): boolean {
        const rd = this.rollData;
        const actor = rd.sourceActor;
        if (!actor) return false;
        type ActorToken = foundry.canvas.placeables.Token;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor exposes loose token accessors not yet in typings.
        const actorWithTokens = actor as unknown as { token?: ActorToken | null; getActiveTokens: () => ActorToken[] };
        const sourceToken: ActorToken | undefined = actorWithTokens.token ?? actorWithTokens.getActiveTokens()[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- sourceToken may be undefined at runtime (noUncheckedIndexedAccess); guard is defensive
        if (!sourceToken) {
            if (notify) ui.notifications.warn(game.i18n.localize('WH40K.Roll.NoTokenForActor'));
            return false;
        }
        const targets = game.user.targets;
        if (targets.size === 0) {
            if (notify) ui.notifications.info(game.i18n.localize('WH40K.Roll.TargetFirst'));
            return false;
        }
        const targetToken = [...targets.values()][0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- noUncheckedIndexedAccess: [0] may be undefined; guard is defensive
        if (!targetToken) return false;
        rd.distance = calculateTokenDistance(sourceToken, targetToken);
        rd.targetActor = targetToken.actor;
        return true;
    }

    static async #onSelectTarget(this: UnifiedRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        if (!this.#applyTargetDistance(true)) return;
        const rd = this.rollData;
        // Recalculate range with the new distance, then clear any manual bracket
        // override so the calculated bracket takes effect.
        if (typeof rd['update'] === 'function') await (rd['update'] as () => Promise<void>)();
        this._selectedRangeBracket = null;
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    static async #onSelectSkillVariant(this: UnifiedRollDialog, _event: Event, target: HTMLElement): Promise<void> {
        const variant = target.dataset['variant'] ?? null;
        // Re-selecting the active variant clears it (back to the un-gated test).
        this._selectedSkillVariant = variant !== null && variant === this._selectedSkillVariant ? null : variant;
        await this.render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                 */
    /* -------------------------------------------- */

    /**
     * Submit the roll to chat - either with manual roll or just target info.
     */
    async _submitToChat(): Promise<void> {
        const rollType = this.rollType;

        // Apply modifiers to roll data
        this._applyModifiersToRollData();

        const manualTotal = this._manualRollTotal;

        if (manualTotal !== null) {
            // Create a fake Roll object for manual rolls
            const fakeRoll = new Roll(`${manualTotal}`);
            await fakeRoll.evaluate();
            this.rollData.roll = fakeRoll;
            this.rollData['isManualRoll'] = true;
        }

        if (rollType === 'weapon') {
            await this._submitWeaponRoll(manualTotal);
        } else if (rollType === 'psychic') {
            await this._submitPsychicRoll(manualTotal);
        } else if (rollType === 'forceField') {
            await this._submitForceFieldRoll(manualTotal);
        } else {
            await this._submitSimpleRoll(manualTotal);
        }

        await this.close();
    }

    /**
     * Use Foundry's digital roll.
     */
    async _systemRoll(): Promise<void> {
        this._applyModifiersToRollData();

        const rollType = this.rollType;
        if (rollType === 'weapon') {
            if (!this._validateWeaponRoll()) return;
            await (this.rollData['finalize'] as () => Promise<void>)();
            await this.actionData.performActionAndSendToChat();
        } else if (rollType === 'psychic') {
            await (this.rollData['finalize'] as () => Promise<void>)();
            await this.actionData.performActionAndSendToChat();
        } else if (rollType === 'forceField') {
            if (!this._validateForceFieldRoll()) return;
            await (this.rollData['finalize'] as () => Promise<void>)();
            await (this.rollData['performActionAndSendToChat'] as () => Promise<void>)();
        } else {
            await this.rollData.calculateTotalModifiers();
            await this.actionData.calculateSuccessOrFailure();
            await sendActionDataToChat(this.actionData);
        }

        await this.close();
    }

    _applyModifiersToRollData(): void {
        const rd = this.rollData;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- rd.modifiers may be absent at runtime on uninitialised roll data despite its type
        if (!rd.modifiers) return;
        rd.modifiers['difficulty'] = this._currentDifficulty.modifier;
        rd.modifiers['situational'] = this._calculateSituationalModifiers();
        rd.modifiers['modifier'] = this._customModifier;
        // Assistance modifier (#60). +10 per assistant up to DEFAULT_ASSISTANT_CAP.
        // Surfaces on chat cards via RollData.activeModifiers; key is uppercased
        // for the modifier-breakdown partial, so "ASSISTANCE +N" appears in the
        // chat-card row list when assistantCount > 0.
        rd.modifiers['assistance'] = getAssistanceBonus(this._assistantCount);

        // Apply psychic Push / Fettered / Unfettered selector (#69)
        if (this.rollType === 'psychic') {
            const basePR = Number(rd['pr']) || 0;
            const breakdown = resolvePsyMode({ mode: this._psyMode, basePR, pushLevel: this._pushLevel });
            rd.modifiers['psy-mode'] = breakdown.focusModifier;
            rd['psyMode'] = this._psyMode;
            rd['psyEffectivePR'] = breakdown.effectivePR;
            rd['psyForcePhenomena'] = breakdown.forcePhenomena;
            rd['psyPhenomenaModifier'] = breakdown.phenomenaModifier;
            if (this._psyMode === 'push') rd['psyPushLevel'] = this._pushLevel;
        }

        // Apply combat situational card modifiers (weapon panel)
        if (this.rollType === 'weapon') {
            const isRanged = rd.weapon?.isRanged === true;
            const situationals = getSituationalModifiers(isRanged);
            let combatSitTotal = 0;
            for (const s of situationals) {
                if (this._activeCombatSituationals.has(s.key)) {
                    combatSitTotal += s.modifier;
                }
            }
            rd.modifiers['combat-situational'] = combatSitTotal;

            // Propagate damage-side effects (Cover AP, forced hit location)
            // from active situationals onto WeaponRollData so AssignDamageData
            // sees them at apply time.
            const damage = aggregateSituationalDamageEffects(this._activeCombatSituationals, isRanged);
            const weaponRollData = rd as { coverAP?: number; isCalledShot?: boolean; calledShotLocation?: string };
            weaponRollData.coverAP = damage.coverAP ?? 0;
            if (damage.forceLocation !== undefined) {
                weaponRollData.isCalledShot = true;
                weaponRollData.calledShotLocation = damage.forceLocation;
            }
        }
    }

    async _submitSimpleRoll(manualTotal: number | null): Promise<void> {
        await this.rollData.calculateTotalModifiers();

        if (manualTotal !== null) {
            // Manual roll - skip _calculateHit, compute success ourselves
            const target = this.rollData.modifiedTarget;
            const method = resolveDegreesMethod((this.rollData.sourceActor?.system as { gameSystem?: string } | undefined)?.gameSystem);
            this.rollData.success = manualTotal === 1 || (manualTotal <= target && manualTotal !== 100);
            if (this.rollData.success) {
                this.rollData.dof = 0;
                this.rollData.dos = 1 + getDegreeForMode(method, target, manualTotal);
            } else {
                this.rollData.dos = 0;
                this.rollData.dof = 1 + getDegreeForMode(method, manualTotal, target);
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Roll.render() is not typed in the system typings; cast is required
            this.rollData.render = await (this.rollData.roll as unknown as { render: () => Promise<string> }).render();
        } else {
            // No roll entered - post target info only
            this.rollData['isTargetOnly'] = true;
        }

        await sendActionDataToChat(this.actionData);
    }

    async _submitWeaponRoll(manualTotal: number | null): Promise<void> {
        if (!this._validateWeaponRoll()) return;

        if (manualTotal !== null) {
            await (this.rollData['finalize'] as () => Promise<void>)();
            this.rollData['isManualRoll'] = true;
            // Let the normal flow handle it - _calculateHit will check isManualRoll
            await this.actionData.performActionAndSendToChat();
        } else {
            // Target-only post
            await (this.rollData['finalize'] as () => Promise<void>)();
            this.rollData['isTargetOnly'] = true;
            this.rollData.render = '';
            this.rollData.template = this.actionData.template;
            await sendActionDataToChat(this.actionData);
        }
    }

    async _submitPsychicRoll(manualTotal: number | null): Promise<void> {
        if (manualTotal !== null) {
            await (this.rollData['finalize'] as () => Promise<void>)();
            this.rollData['isManualRoll'] = true;
            await this.actionData.performActionAndSendToChat();
        } else {
            await (this.rollData['finalize'] as () => Promise<void>)();
            this.rollData['isTargetOnly'] = true;
            this.rollData.render = '';
            this.rollData.template = this.actionData.template;
            await sendActionDataToChat(this.actionData);
        }
    }

    async _submitForceFieldRoll(manualTotal: number | null): Promise<void> {
        if (!this._validateForceFieldRoll()) return;
        const rd = this.rollData;

        if (manualTotal !== null) {
            // Manual roll - compute results without finalize() (which calls roll1d100)
            // rd.roll is already set by _submitToChat() as a fake Roll object
            const rollTotal = (rd.roll as Roll).total ?? 0;
            rd.success = rollTotal <= (rd['protectionRating'] as number);
            rd['overload'] = rollTotal <= (rd['overloadRating'] as number);
            rd['isManualRoll'] = true;
        } else {
            // Target-only - no roll, no finalize
            rd['isTargetOnly'] = true;
        }

        await (rd['performActionAndSendToChat'] as () => Promise<void>)();
    }

    _validateWeaponRoll(): boolean {
        if (this.rollData['fireRate'] === 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.Roll.NotEnoughAmmo'));
            return false;
        }
        return true;
    }

    _validateForceFieldRoll(): boolean {
        const ff = this.rollData['forceField'] as { system?: { state?: { activated?: boolean; overloaded?: boolean } } } | null | undefined;
        if (ff?.system?.state?.activated !== true) {
            ui.notifications.warn(game.i18n.localize('WH40K.Roll.ForceFieldNotActivated'));
            return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ff is cast as (obj | null | undefined); optional chains guard against null/absent forceField at runtime
        if (ff?.system?.state?.overloaded === true) {
            ui.notifications.warn(game.i18n.localize('WH40K.Roll.ForceFieldOverloaded'));
            return false;
        }
        return true;
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a unified roll dialog.
 * @param {ActionData} actionData  Any ActionData subclass.
 */
export function prepareUnifiedRoll(actionData: ActionData): void {
    const prompt = new UnifiedRollDialog(actionData);
    void prompt.render({ force: true });
}
