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

import { getDegree, sendActionDataToChat } from '../../rolls/roll-helpers.ts';
import {
    getAvailableAttackModes,
    getMeleeSpecialOptions,
    getSituationalModifiers,
    getActionNameForMode,
    getAimModifier,
    getAttackModeKeyForAction,
    getAimKeyForModifier,
    isMeleeSpecialOption,
    AIM_OPTIONS,
} from '../../rules/attack-options.ts';
import { RANGE_BRACKETS, calculateTokenDistance } from '../../utils/range-calculator.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/**
 * Unified dialog for configuring all roll types.
 */
export default class UnifiedRollDialog extends (ApplicationV2Mixin(ApplicationV2) as any) {
    declare render: any;
    declare close: any;
    declare position: any;

    /**
     * @param {ActionData} actionData  Any ActionData subclass (SimpleSkillData, WeaponActionData, etc.)
     * @param {object} [options={}]    Dialog options.
     */
    constructor(actionData, options = {}) {
        super(options as any);
        this.actionData = actionData;
        this._selectedDifficultyIndex = (this.constructor as any).DIFFICULTIES.findIndex((d) => d.default);
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
        this._aimModeKey = 'none';
        this._activeCombatSituationals = new Set();
        this._sizeModifierKey = null; // null = use target actor size, string = user override
        this._specialOptionsExpanded = false;
        this._sizeExpanded = false;
        this._rangeExpanded = false;
        this._situationalExpanded = false;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'unified-roll-dialog', 'standard-form'],
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
            selectAttackMode: UnifiedRollDialog.#onSelectAttackMode,
            selectAimMode: UnifiedRollDialog.#onSelectAimMode,
            toggleCombatSituational: UnifiedRollDialog.#onToggleCombatSituational,
            selectSizeModifier: UnifiedRollDialog.#onSelectSizeModifier,
            toggleSpecialOptions: UnifiedRollDialog.#onToggleSpecialOptions,
            toggleSizeSection: UnifiedRollDialog.#onToggleSizeSection,
            toggleRangeSection: UnifiedRollDialog.#onToggleRangeSection,
            toggleSituationalSection: UnifiedRollDialog.#onToggleSituationalSection,
            cancel: UnifiedRollDialog.#onCancel,
        },
        form: {
            handler: UnifiedRollDialog.#onFormSubmit,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        position: {
            width: 460,
            height: 'auto' as const,
        },
        window: {
            title: 'Roll Test',
            minimizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        header: {
            template: 'systems/wh40k-rpg/templates/prompt/unified/header.hbs',
        },
        targetDisplay: {
            template: 'systems/wh40k-rpg/templates/prompt/unified/target-display.hbs',
        },
        modifiers: {
            template: 'systems/wh40k-rpg/templates/prompt/unified/modifiers.hbs',
        },
        contextPanel: {
            template: 'systems/wh40k-rpg/templates/prompt/unified/context-panel.hbs',
        },
        diceInput: {
            template: 'systems/wh40k-rpg/templates/prompt/unified/dice-input.hbs',
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
        { key: 'easy', label: 'Easy', modifier: 30, icon: 'fa-grin', description: 'Simple tasks with no pressure' },
        { key: 'routine', label: 'Routine', modifier: 20, icon: 'fa-meh', description: 'Standard tasks with time' },
        { key: 'ordinary', label: 'Ordinary', modifier: 10, icon: 'fa-smile-beam', description: 'Typical difficulty' },
        { key: 'challenging', label: 'Challenging', modifier: 0, icon: 'fa-grimace', description: 'No modifier (baseline)', default: true },
        { key: 'difficult', label: 'Difficult', modifier: -10, icon: 'fa-frown', description: 'Complex or contested tasks' },
        { key: 'hard', label: 'Hard', modifier: -20, icon: 'fa-dizzy', description: 'Very challenging circumstances' },
        { key: 'veryHard', label: 'Very Hard', modifier: -30, icon: 'fa-tired', description: 'Exceptional difficulty' },
        { key: 'hellish', label: 'Hellish', modifier: -60, icon: 'fa-skull', description: 'Near-impossible feats' },
    ];

    static WEAPON_MODIFIERS = [
        { key: 'aimHalf', label: 'Aim (Half)', value: 10, description: 'Half action aim bonus' },
        { key: 'aimFull', label: 'Aim (Full)', value: 20, description: 'Full action aim bonus' },
    ];

    /* -------------------------------------------- */
    /*  Properties                                   */
    /* -------------------------------------------- */

    /** @type {ActionData} */
    actionData;

    /** Whether the roll data has been initialized */
    _initialized = false;

    /**
     * Detect the roll type from the action data.
     * @returns {"simple"|"weapon"|"psychic"|"forceField"}
     */
    get rollType() {
        const rd = this.rollData;
        if (rd?.constructor?.name === 'WeaponRollData') return 'weapon';
        if (rd?.constructor?.name === 'PsychicRollData') return 'psychic';
        if (rd?.forceField) return 'forceField';
        return 'simple';
    }

    /** @returns {object} The underlying roll data (ForceFieldData IS the rollData) */
    get rollData() {
        return this.actionData.rollData ?? this.actionData;
    }

    /** Get the current difficulty preset */
    get _currentDifficulty() {
        return (this.constructor as any).DIFFICULTIES[this._selectedDifficultyIndex];
    }

    /** Get the applicable modifier list for the current roll type */
    get _applicableModifiers() {
        return this._cachedSituationalModifiers || [];
    }

    /** Compute the manual roll total, or null if incomplete */
    get _manualRollTotal() {
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
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        // Initialize on first render
        if (!this._initialized && this.rollData.initialize) {
            this.rollData.initialize();
            this._initialized = true;

            // Sync card state with initial rollData
            if (this.rollType === 'weapon') {
                const isRanged = !!this.rollData.weapon?.isRanged;
                this._attackModeKey = getAttackModeKeyForAction(this.rollData.action, isRanged);
                this._aimModeKey = getAimKeyForModifier(this.rollData.modifiers?.aim ?? 0);
            }
        }

        if (this.rollData.update) {
            await this.rollData.update();
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

        const baseTarget = isForceField ? rollData.protectionRating || 0 : rollData.baseTarget || 0;

        // Sum weapon/combat modifiers already on rollData (exclude dialog-managed keys and range)
        const dialogManagedKeys = new Set(['difficulty', 'situational', 'modifier', 'range', 'combat-situational']);
        const weaponModSum = !isForceField
            ? Object.entries(rollData.modifiers || {})
                  .filter(([k]) => !dialogManagedKeys.has(k))
                  .reduce((sum, [, v]) => sum + (parseInt(v as string) || 0), 0) + (rollData.rangeBonus || 0)
            : 0;

        const finalTarget = Math.max(0, baseTarget + weaponModSum + difficultyMod + situationalMod + customMod + combatSitMod);

        // Build target breakdown tooltip
        const tooltipParts = [`Base: ${baseTarget}`];
        if (weaponModSum !== 0) tooltipParts.push(`Weapon/Combat: ${weaponModSum >= 0 ? '+' : ''}${weaponModSum}`);
        if (difficultyMod !== 0) tooltipParts.push(`Difficulty: ${difficultyMod >= 0 ? '+' : ''}${difficultyMod}`);
        if (situationalMod !== 0) tooltipParts.push(`Situational: ${situationalMod >= 0 ? '+' : ''}${situationalMod}`);
        if (customMod !== 0) tooltipParts.push(`Custom: ${customMod >= 0 ? '+' : ''}${customMod}`);
        if (combatSitMod !== 0) tooltipParts.push(`Combat Mods: ${combatSitMod >= 0 ? '+' : ''}${combatSitMod}`);
        tooltipParts.push(`= ${finalTarget}`);
        const targetBreakdownTooltip = tooltipParts.join('\n');

        // Dynamic color class based on success chance
        let targetColorClass;
        if (finalTarget <= 15) targetColorClass = 'urd-target__number--dire';
        else if (finalTarget <= 30) targetColorClass = 'urd-target__number--poor';
        else if (finalTarget <= 45) targetColorClass = 'urd-target__number--fair';
        else if (finalTarget <= 60) targetColorClass = 'urd-target__number--good';
        else if (finalTarget <= 80) targetColorClass = 'urd-target__number--great';
        else targetColorClass = 'urd-target__number--legendary';

        // Track previous target for animation
        this._previousTarget = this._previousTarget ?? finalTarget;

        // Calculate roll result if manual roll is complete
        let rollResult = null;
        const manualTotal = this._manualRollTotal;
        if (manualTotal !== null) {
            const success = manualTotal === 1 || (manualTotal <= finalTarget && manualTotal !== 100);
            if (success) {
                const dos = 1 + getDegree(finalTarget, manualTotal);
                rollResult = { success: true, dos, dof: 0, total: manualTotal };
            } else {
                const dof = 1 + getDegree(manualTotal, finalTarget);
                rollResult = { success: false, dos: 0, dof, total: manualTotal };
            }
        }
        this._rollResult = rollResult;

        // Difficulty data
        const difficulty = this._currentDifficulty;

        // Build difficulty picker list (ordered relative to current)
        const difficultyPicker = (this.constructor as any).DIFFICULTIES.map((d, i) => ({
            ...d,
            index: i,
            isCurrent: i === this._selectedDifficultyIndex,
            modifierLabel: d.modifier >= 0 ? `+${d.modifier}` : `${d.modifier}`,
        }));

        // Situational modifiers with toggle state
        const situationalModifiers = (this._cachedSituationalModifiers || []).map((m) => ({
            ...m,
            active: this._situationalModifiers[`${m.key}_${m.source}`] ?? false,
            toggleKey: `${m.key}_${m.source}`,
            valueLabel: m.value >= 0 ? `+${m.value}` : `${m.value}`,
        }));
        const hasSituationalModifiers = situationalModifiers.length > 0;

        // Modifier aggregate
        const modifierAggregate = difficultyMod + situationalMod + customMod + combatSitMod;

        // Roll type specific data
        const isWeapon = this.rollType === 'weapon';
        const isPsychic = this.rollType === 'psychic';
        const isSimple = this.rollType === 'simple';

        // Actor info (ForceFieldData uses .actor, ActionData uses .sourceActor or .actor)
        const actor = rollData.sourceActor || rollData.actor;
        const actorName = actor?.name || '';
        const actorImg = actor?.img || '';

        // Roll name
        const rollName = isForceField ? rollData.forceField?.name || 'Force Field' : rollData.name || rollData.nameOverride || 'Test';
        const rollSubtitle = isForceField ? 'Force Field Activation' : rollData.type || rollData.action || '';

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
            showCustomModifier: this._showCustomModifier || this._customModifier !== 0,
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
            isSimple,
            hasContextPanel: isWeapon || isPsychic || isForceField,
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
    async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);

        // Auto-select number inputs on focus
        this.element.querySelectorAll('input[type="number"], input[data-dtype="Number"]').forEach((input) => {
            input.addEventListener('focus', (e) => e.target.select());
        });

        // Set up two-dice input handlers
        const tensInput = this.element.querySelector('#manual-tens');
        const unitsInput = this.element.querySelector('#manual-units');
        if (tensInput) {
            tensInput.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this._manualRollTens = val >= 0 && val <= 9 ? val : null;
                if (this._manualRollTens !== null && unitsInput) {
                    unitsInput.focus();
                    unitsInput.select();
                }
                this.render(false, { parts: ['diceInput', 'footer'] });
            });
        }
        if (unitsInput) {
            unitsInput.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this._manualRollUnits = val >= 0 && val <= 9 ? val : null;
                this.render(false, { parts: ['diceInput', 'footer'] });
            });
        }

        // Single number input
        const singleInput = this.element.querySelector('#manual-single');
        if (singleInput) {
            singleInput.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this._singleRollValue = val >= 1 && val <= 100 ? val : null;
                this.render(false, { parts: ['diceInput', 'footer'] });
            });
        }

        // Custom modifier input
        const customInput = this.element.querySelector('#unified-custom-modifier');
        if (customInput) {
            customInput.addEventListener('change', (e) => {
                this._customModifier = parseInt(e.target.value) || 0;
                this.render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
            });
        }

        // Animate target number if changed
        const targetEl = this.element.querySelector('.urd-target__number');
        if (targetEl && this._previousTarget !== null) {
            const newTarget = parseInt(targetEl.dataset.value) || 0;
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
            const picker = this.element.querySelector('.urd-difficulty-picker');
            if (picker) {
                this._pickerOutsideHandler = (e) => {
                    if (!picker.contains(e.target) && !e.target.closest('[data-action="toggleDifficultyPicker"]')) {
                        this._difficultyPickerOpen = false;
                        document.removeEventListener('pointerdown', this._pickerOutsideHandler);
                        this._pickerOutsideHandler = null;
                        this.render(false, { parts: ['targetDisplay'] });
                    }
                };
                setTimeout(() => document.addEventListener('pointerdown', this._pickerOutsideHandler), 0);
            }
        }

        // Keyboard: Enter submits, Escape closes picker
        this.element.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._difficultyPickerOpen) {
                e.preventDefault();
                this._difficultyPickerOpen = false;
                this.render(false, { parts: ['targetDisplay'] });
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

    _getWeaponContext(): any {
        const rd = this.rollData;

        // Apply range bracket override if user selected one
        if (this._selectedRangeBracket && rd.weapon?.isRanged) {
            const bracket = RANGE_BRACKETS[this._selectedRangeBracket];
            if (bracket) {
                rd.rangeName = bracket.label;
                rd.rangeBonus = bracket.modifier;
                rd.rangeBracket = this._selectedRangeBracket;
            }
        }

        // Build range bracket list for UI with meter values
        const maxRange = rd.maxRange || 0;
        const rangeBrackets = rd.weapon?.isRanged
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
                      isSelected: (this._selectedRangeBracket ?? rd.rangeBracket) === key,
                  };
              })
            : [];

        // Card-based attack modes
        const isRanged = !!rd.weapon?.isRanged;
        const attackModes = rd.weapon
            ? getAvailableAttackModes(rd.weapon).map((m) => ({
                  ...m,
                  isSelected: this._attackModeKey === m.key,
                  modifierLabel: m.modifier >= 0 ? `+${m.modifier}` : `${m.modifier}`,
              }))
            : [];

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
        const canAim = rd.canAim !== false;
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
              }))
            : [];

        // Size modifiers from config (values are plain strings like "Average (4)")
        const sizes = CONFIG.wh40k?.sizes || {};
        const currentSizeMod = this._sizeModifierKey ?? this._getDefaultSizeKey(rd);
        const sizeOptions = Object.entries(sizes).map(([key, label]) => {
            const modifier = (parseInt(key) - 4) * 10;
            return {
                key,
                label,
                modifier,
                modifierLabel: modifier >= 0 ? `+${modifier}` : `${modifier}`,
                isSelected: key === currentSizeMod,
            };
        });

        // Selected range summary for collapsed header
        const currentRangeKey = this._selectedRangeBracket ?? rd.rangeBracket;
        const currentRangeBracket = rangeBrackets.find((b) => b.key === currentRangeKey) || rangeBrackets.find((b) => b.key === 'standard') || rangeBrackets[0];
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
        const currentSizeOption = sizeOptions.find((s) => s.isSelected) || sizeOptions.find((s) => s.key === '4');
        const selectedSizeSummary = currentSizeOption
            ? { label: currentSizeOption.label, modifier: currentSizeOption.modifier, modifierLabel: currentSizeOption.modifierLabel }
            : { label: 'Average (4)', modifier: 0, modifierLabel: '+0' };

        return {
            weapons: rd.weapons || [],
            weapon: rd.weapon,
            weaponSelect: rd.weaponSelect,
            isRanged,
            isMelee: !isRanged,
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
            selectedRangeBracket: this._selectedRangeBracket ?? rd.rangeBracket,
            rangeModifiedBy: rd.rangeModifiedBy,
            isMeltaRange: rd.isMeltaRange,
            maxRange,
            // Existing data we still need
            fireRate: rd.fireRate,
            usesAmmo: rd.usesAmmo,
            ammoText: rd.ammoText,
            isCalledShot: rd.isCalledShot,
            calledShotLocation: rd.calledShotLocation,
            locations: rd.locations,
            actions: rd.actions || {},
            currentAction: rd.action,
        };
    }

    /**
     * Determine the default size key based on target actor.
     * @param {WeaponRollData} rd
     * @returns {string} Size key (e.g. "4" for Average)
     */
    _getDefaultSizeKey(rd: any): any {
        if (rd.targetActor?.system?.size) {
            return String(rd.targetActor.system.size);
        }
        return '4'; // Average
    }

    _getPsychicContext(): any {
        const rd = this.rollData;
        return {
            psychicPowers: rd.psychicPowers || [],
            power: rd.power,
            powerSelect: rd.powerSelect,
            pr: rd.pr,
            maxPr: rd.maxPr,
            hasFocus: rd.hasFocus,
            hasDamage: rd.hasDamage,
            distance: rd.distance,
            rangeName: rd.rangeName,
            maxRange: rd.maxRange,
            difficulties: rd.difficulties,
        };
    }

    _getForceFieldContext(): any {
        const rd = this.rollData;
        return {
            forceField: rd.forceField,
            protectionRating: rd.protectionRating,
        };
    }

    /* -------------------------------------------- */
    /*  Helper Methods                               */
    /* -------------------------------------------- */

    _collectSituationalModifiers(): any {
        const actor = this.rollData.sourceActor || this.rollData.actor;
        if (!actor?.getSituationalModifiers) return [];
        const rd = this.rollData;
        const type = rd.type === 'Skill' ? 'skills' : rd.type === 'Characteristic' ? 'characteristics' : 'combat';
        const key = rd.rollKey || null;
        return actor.getSituationalModifiers(type, key);
    }

    _calculateSituationalModifiers(): any {
        let total = 0;
        for (const mod of this._cachedSituationalModifiers || []) {
            const toggleKey = `${mod.key}_${mod.source}`;
            if (this._situationalModifiers[toggleKey]) total += mod.value;
        }
        return total;
    }

    /**
     * Calculate sum of active combat situational card modifiers.
     * @returns {number}
     */
    _calculateCombatSituationalModifiers(): any {
        if (this._activeCombatSituationals.size === 0) return 0;
        const isRanged = !!this.rollData.weapon?.isRanged;
        const situationals = getSituationalModifiers(isRanged);
        let total = 0;
        for (const s of situationals) {
            if (this._activeCombatSituationals.has(s.key)) {
                total += s.modifier;
            }
        }
        return total;
    }

    _stepDifficulty(direction: number): any {
        const newIndex = this._selectedDifficultyIndex + direction;
        if (newIndex < 0 || newIndex >= (this.constructor as any).DIFFICULTIES.length) return;
        this._selectedDifficultyIndex = newIndex;
        this._difficultyPickerOpen = false;
        this.render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    /**
     * Animate the target number counting from old to new value.
     */
    _animateTargetNumber(el: HTMLElement, from: number, to: number): void {
        const duration = 400;
        const start = performance.now();
        const diff = to - from;
        const step = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            const current = Math.round(from + diff * eased);
            // @ts-expect-error - type assignment
            el.textContent = current;
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
        // @ts-expect-error - type assignment
        void foundry.audio.AudioHelper.play({ src, volume: 0.15, autoplay: true, loop: false }, false);
    }

    /* -------------------------------------------- */
    /*  Form Handler                                 */
    /* -------------------------------------------- */

    static async #onFormSubmit(event: Event, form: HTMLFormElement, formData: Record<string, unknown>): Promise<void> {
        const data = foundry.utils.expandObject(formData.object);
        // Update roll data fields from form
        if ((this as any).rollData) {
            foundry.utils.mergeObject((this as any).rollData, data, { recursive: true });
            if ((this as any).rollData.update) {
                await (this as any).rollData.update();
            }
            // Re-render dependent parts (e.g., Called Shot location dropdown, range info)
            await (this as any).render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
        }
    }

    /* -------------------------------------------- */
    /*  Action Handlers                              */
    /* -------------------------------------------- */

    static async #onToggleDifficultyPicker(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._difficultyPickerOpen = !(this as any)._difficultyPickerOpen;
        await (this as any).render(false, { parts: ['targetDisplay'] });
    }

    static async #onSelectDifficulty(event: Event, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset.difficultyIndex);
        if (Number.isInteger(index) && index >= 0 && index < (this.constructor as any).DIFFICULTIES.length) {
            (this as any)._selectedDifficultyIndex = index;
            (this as any)._difficultyPickerOpen = false;
            await (this as any).render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
        }
    }

    static async #onToggleSituational(event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset.toggleKey;
        if (!key) return;
        (this as any)._situationalModifiers[key] = !(this as any)._situationalModifiers[key];
        await (this as any).render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    static async #onCustomModUp(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._customModifier += 5;
        await (this as any).render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    static async #onCustomModDown(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._customModifier -= 5;
        await (this as any).render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    static async #onToggleCustomModifier(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._showCustomModifier = !(this as any)._showCustomModifier;
        if (!(this as any)._showCustomModifier) (this as any)._customModifier = 0;
        await (this as any).render(false, { parts: ['targetDisplay', 'modifiers', 'diceInput'] });
    }

    static async #onSubmitToChat(event: Event, target: HTMLElement): Promise<void> {
        await (this as any)._submitToChat();
    }

    static async #onSystemRoll(event: Event, target: HTMLElement): Promise<void> {
        await (this as any)._systemRoll();
    }

    static async #onClearManualRoll(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._manualRollTens = null;
        (this as any)._manualRollUnits = null;
        (this as any)._singleRollValue = null;
        (this as any)._rollResult = null;
        await (this as any).render(false, { parts: ['diceInput', 'footer'] });
    }

    static async #onToggleDiceMode(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._diceInputMode = (this as any)._diceInputMode === 'two-dice' ? 'single' : 'two-dice';
        (this as any)._manualRollTens = null;
        (this as any)._manualRollUnits = null;
        (this as any)._singleRollValue = null;
        (this as any)._rollResult = null;
        await (this as any).render(false, { parts: ['diceInput', 'footer'] });
    }

    static async #onToggleContextSection(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._contextExpanded = !(this as any)._contextExpanded;
        await (this as any).render(false, { parts: ['contextPanel'] });
    }

    static async #onSelectWeapon(event: Event, target: HTMLElement): Promise<void> {
        const weaponId = target.dataset.weaponId || (target as HTMLInputElement).name;
        if ((this as any).rollData.selectWeapon) {
            (this as any).rollData.selectWeapon(weaponId);
            if ((this as any).rollData.update) await (this as any).rollData.update();
            await (this as any).render();
        }
    }

    static async #onSelectPower(event: Event, target: HTMLElement): Promise<void> {
        const powerId = target.dataset.powerId || (target as HTMLInputElement).name;
        if ((this as any).rollData.selectPower) {
            (this as any).rollData.selectPower(powerId);
            if ((this as any).rollData.update) await (this as any).rollData.update();
            await (this as any).render();
        }
    }

    static async #onCancel(event: Event, target: HTMLElement): Promise<void> {
        await (this as any).close();
    }

    /* ---- Card-based Weapon Panel Handlers ---- */

    static async #onSelectAttackMode(event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset.modeKey;
        if (!key) return;
        (this as any)._attackModeKey = key;

        // Map card key to combat action name and set on rollData
        const isRanged = !!(this as any).rollData.weapon?.isRanged;
        const actionName = getActionNameForMode(key, isRanged);
        if (actionName) {
            (this as any).rollData.action = actionName;
        }

        // If selecting a special option, auto-expand that section
        if (isMeleeSpecialOption(key)) {
            (this as any)._specialOptionsExpanded = true;
        }

        // If aim is disabled by this mode (e.g., All Out Attack), reset aim
        if ((this as any).rollData.update) await (this as any).rollData.update();
        if (!(this as any).rollData.canAim && (this as any)._aimModeKey !== 'none') {
            (this as any)._aimModeKey = 'none';
            (this as any).rollData.modifiers['aim'] = 0;
        }

        await (this as any).render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    static async #onSelectAimMode(event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset.aimKey;
        if (!key) return;
        (this as any)._aimModeKey = key;
        (this as any).rollData.modifiers['aim'] = getAimModifier(key);
        if ((this as any).rollData.update) await (this as any).rollData.update();
        await (this as any).render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    static async #onToggleCombatSituational(event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset.situationalKey;
        if (!key) return;
        if ((this as any)._activeCombatSituationals.has(key)) {
            (this as any)._activeCombatSituationals.delete(key);
        } else {
            (this as any)._activeCombatSituationals.add(key);
        }
        await (this as any).render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    static async #onSelectSizeModifier(event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset.sizeKey;
        if (!key) return;
        (this as any)._sizeModifierKey = key;
        (this as any).rollData.modifiers['target-size'] = (parseInt(key) - 4) * 10;
        await (this as any).render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    static async #onToggleSpecialOptions(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._specialOptionsExpanded = !(this as any)._specialOptionsExpanded;
        await (this as any).render(false, { parts: ['contextPanel'] });
    }

    static async #onToggleSizeSection(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._sizeExpanded = !(this as any)._sizeExpanded;
        await (this as any).render(false, { parts: ['contextPanel'] });
    }

    static async #onToggleRangeSection(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._rangeExpanded = !(this as any)._rangeExpanded;
        await (this as any).render(false, { parts: ['contextPanel'] });
    }

    static async #onToggleSituationalSection(event: Event, target: HTMLElement): Promise<void> {
        (this as any)._situationalExpanded = !(this as any)._situationalExpanded;
        await (this as any).render(false, { parts: ['contextPanel'] });
    }

    static async #onSelectRangeBracket(event: Event, target: HTMLElement): Promise<void> {
        const bracket = target.dataset.bracket;
        if (!bracket) return;
        (this as any)._selectedRangeBracket = bracket;
        const bracketData = RANGE_BRACKETS[bracket];
        if (bracketData) {
            (this as any).rollData.rangeName = bracketData.label;
            (this as any).rollData.rangeBonus = bracketData.modifier;
            (this as any).rollData.rangeBracket = bracket;
        }
        await (this as any).render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
    }

    static async #onSelectTarget(event: Event, target: HTMLElement): Promise<void> {
        // Get source token
        const actor = (this as any).rollData.sourceActor;
        if (!actor) return;
        const sourceToken = actor.token ?? actor.getActiveTokens()[0];
        if (!sourceToken) {
            ui.notifications.warn('No token found for the attacking actor.');
            return;
        }

        // Check for existing target
        const targets = game.user.targets;
        if (targets.size === 0) {
            ui.notifications.info('Target a token first, then click Select Target.');
            return;
        }
        const targetToken = [...targets.values()][0];
        if (!targetToken) return;

        // Calculate distance
        const distance = calculateTokenDistance(sourceToken, targetToken);
        (this as any).rollData.distance = distance;
        (this as any).rollData.targetActor = targetToken.actor;

        // Recalculate range with new distance
        if ((this as any).rollData.update) await (this as any).rollData.update();

        // Clear manual bracket override so calculated bracket takes effect
        (this as any)._selectedRangeBracket = null;
        await (this as any).render(false, { parts: ['contextPanel', 'targetDisplay', 'diceInput'] });
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
            this.rollData.isManualRoll = true;
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
            await this.rollData.finalize();
            await this.actionData.performActionAndSendToChat();
        } else if (rollType === 'psychic') {
            await this.rollData.finalize();
            await this.actionData.performActionAndSendToChat();
        } else if (rollType === 'forceField') {
            if (!this._validateForceFieldRoll()) return;
            await this.rollData.finalize();
            await this.rollData.performActionAndSendToChat();
        } else {
            await this.rollData.calculateTotalModifiers();
            await this.actionData.calculateSuccessOrFailure();
            await sendActionDataToChat(this.actionData);
        }

        await this.close();
    }

    _applyModifiersToRollData(): void {
        const rd = this.rollData;
        if (!rd.modifiers) return;
        rd.modifiers['difficulty'] = this._currentDifficulty.modifier;
        rd.modifiers['situational'] = this._calculateSituationalModifiers();
        rd.modifiers['modifier'] = this._customModifier;

        // Apply combat situational card modifiers (weapon panel)
        if (this.rollType === 'weapon' && this._activeCombatSituationals.size > 0) {
            const isRanged = !!rd.weapon?.isRanged;
            const situationals = getSituationalModifiers(isRanged);
            let combatSitTotal = 0;
            for (const s of situationals) {
                if (this._activeCombatSituationals.has(s.key)) {
                    combatSitTotal += s.modifier;
                }
            }
            rd.modifiers['combat-situational'] = combatSitTotal;
        }
    }

    async _submitSimpleRoll(manualTotal: number): Promise<void> {
        await this.rollData.calculateTotalModifiers();

        if (manualTotal !== null) {
            // Manual roll - skip _calculateHit, compute success ourselves
            const target = this.rollData.modifiedTarget;
            this.rollData.success = manualTotal === 1 || (manualTotal <= target && manualTotal !== 100);
            if (this.rollData.success) {
                this.rollData.dof = 0;
                this.rollData.dos = 1 + getDegree(target, manualTotal);
            } else {
                this.rollData.dos = 0;
                this.rollData.dof = 1 + getDegree(manualTotal, target);
            }
            this.rollData.render = await this.rollData.roll.render();
        } else {
            // No roll entered - post target info only
            this.rollData.isTargetOnly = true;
        }

        await sendActionDataToChat(this.actionData);
    }

    async _submitWeaponRoll(manualTotal: number): Promise<void> {
        if (!this._validateWeaponRoll()) return;

        if (manualTotal !== null) {
            await this.rollData.finalize();
            this.rollData.isManualRoll = true;
            // Let the normal flow handle it - _calculateHit will check isManualRoll
            await this.actionData.performActionAndSendToChat();
        } else {
            // Target-only post
            await this.rollData.finalize();
            this.rollData.isTargetOnly = true;
            this.rollData.render = '';
            this.rollData.template = this.actionData.template;
            await sendActionDataToChat(this.actionData);
        }
    }

    async _submitPsychicRoll(manualTotal: number): Promise<void> {
        if (manualTotal !== null) {
            await this.rollData.finalize();
            this.rollData.isManualRoll = true;
            await this.actionData.performActionAndSendToChat();
        } else {
            await this.rollData.finalize();
            this.rollData.isTargetOnly = true;
            this.rollData.render = '';
            this.rollData.template = this.actionData.template;
            await sendActionDataToChat(this.actionData);
        }
    }

    async _submitForceFieldRoll(manualTotal: number): Promise<void> {
        if (!this._validateForceFieldRoll()) return;
        const rd = this.rollData;

        if (manualTotal !== null) {
            // Manual roll - compute results without finalize() (which calls roll1d100)
            // rd.roll is already set by _submitToChat() as a fake Roll object
            rd.success = rd.roll.total <= rd.protectionRating;
            rd.overload = rd.roll.total <= rd.overloadRating;
            rd.isManualRoll = true;
        } else {
            // Target-only - no roll, no finalize
            rd.isTargetOnly = true;
        }

        await rd.performActionAndSendToChat();
    }

    _validateWeaponRoll(): boolean {
        if (this.rollData.fireRate === 0) {
            ui.notifications.warn('Not enough ammo to perform action. Do you need to reload?');
            return false;
        }
        return true;
    }

    _validateForceFieldRoll(): boolean {
        if (!this.rollData.forceField?.system?.activated) {
            ui.notifications.warn('Force Field not activated!');
            return false;
        }
        if (this.rollData.forceField?.system?.overloaded) {
            ui.notifications.warn('Force Field currently overloaded!');
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
export function prepareUnifiedRoll(actionData) {
    const prompt = new UnifiedRollDialog(actionData);
    prompt.render(true);
}
