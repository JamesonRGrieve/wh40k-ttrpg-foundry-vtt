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

import ApplicationV2Mixin from "../api/application-v2-mixin.mjs";
import { getDegree, roll1d100, sendActionDataToChat } from "../../rolls/roll-helpers.mjs";
import { RANGE_BRACKETS, calculateTokenDistance } from "../../utils/range-calculator.mjs";

const { ApplicationV2 } = foundry.applications.api;

/**
 * Unified dialog for configuring all roll types.
 */
export default class UnifiedRollDialog extends ApplicationV2Mixin(ApplicationV2) {
    /**
     * @param {ActionData} actionData  Any ActionData subclass (SimpleSkillData, WeaponActionData, etc.)
     * @param {object} [options={}]    Dialog options.
     */
    constructor(actionData, options = {}) {
        super(options);
        this.actionData = actionData;
        this._selectedDifficultyIndex = this.constructor.DIFFICULTIES.findIndex(d => d.default);
        this._situationalModifiers = {};
        this._customModifier = 0;
        this._manualRollTens = null;
        this._manualRollUnits = null;
        this._diceInputMode = "two-dice";
        this._singleRollValue = null;
        this._rollResult = null;
        this._difficultyPickerOpen = false;
        this._showCustomModifier = false;
        this._contextExpanded = true;
        this._previousTarget = null;
        this._selectedRangeBracket = null;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["rogue-trader", "dialog", "unified-roll-dialog", "standard-form"],
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
            cancel: UnifiedRollDialog.#onCancel
        },
        form: {
            handler: UnifiedRollDialog.#onFormSubmit,
            submitOnChange: true,
            closeOnSubmit: false
        },
        position: {
            width: 460,
            height: "auto"
        },
        window: {
            title: "Roll Test",
            minimizable: false
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        header: {
            template: "systems/rogue-trader/templates/prompt/unified/header.hbs"
        },
        targetDisplay: {
            template: "systems/rogue-trader/templates/prompt/unified/target-display.hbs"
        },
        modifiers: {
            template: "systems/rogue-trader/templates/prompt/unified/modifiers.hbs"
        },
        contextPanel: {
            template: "systems/rogue-trader/templates/prompt/unified/context-panel.hbs"
        },
        diceInput: {
            template: "systems/rogue-trader/templates/prompt/unified/dice-input.hbs"
        },
        footer: {
            template: "systems/rogue-trader/templates/prompt/unified/footer.hbs"
        }
    };

    /* -------------------------------------------- */
    /*  Constants                                    */
    /* -------------------------------------------- */

    static DIFFICULTIES = [
        { key: "trivial", label: "Trivial", modifier: 60, icon: "fa-smile", description: "Automatic success unless complications" },
        { key: "easy", label: "Easy", modifier: 30, icon: "fa-grin", description: "Simple tasks with no pressure" },
        { key: "routine", label: "Routine", modifier: 20, icon: "fa-meh", description: "Standard tasks with time" },
        { key: "ordinary", label: "Ordinary", modifier: 10, icon: "fa-smile-beam", description: "Typical difficulty" },
        { key: "challenging", label: "Challenging", modifier: 0, icon: "fa-grimace", description: "No modifier (baseline)", default: true },
        { key: "difficult", label: "Difficult", modifier: -10, icon: "fa-frown", description: "Complex or contested tasks" },
        { key: "hard", label: "Hard", modifier: -20, icon: "fa-dizzy", description: "Very challenging circumstances" },
        { key: "veryHard", label: "Very Hard", modifier: -30, icon: "fa-tired", description: "Exceptional difficulty" },
        { key: "hellish", label: "Hellish", modifier: -60, icon: "fa-skull", description: "Near-impossible feats" }
    ];

    static WEAPON_MODIFIERS = [
        { key: "aimHalf", label: "Aim (Half)", value: 10, description: "Half action aim bonus" },
        { key: "aimFull", label: "Aim (Full)", value: 20, description: "Full action aim bonus" }
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
        if (rd?.constructor?.name === "WeaponRollData") return "weapon";
        if (rd?.constructor?.name === "PsychicRollData") return "psychic";
        if (rd?.forceField) return "forceField";
        return "simple";
    }

    /** @returns {object} The underlying roll data (ForceFieldData IS the rollData) */
    get rollData() {
        return this.actionData.rollData ?? this.actionData;
    }

    /** Get the current difficulty preset */
    get _currentDifficulty() {
        return this.constructor.DIFFICULTIES[this._selectedDifficultyIndex];
    }

    /** Get the applicable modifier list for the current roll type */
    get _applicableModifiers() {
        return this._cachedSituationalModifiers || [];
    }

    /** Compute the manual roll total, or null if incomplete */
    get _manualRollTotal() {
        if (this._diceInputMode === "two-dice") {
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
    async _prepareContext(options) {
        // Initialize on first render
        if (!this._initialized && this.rollData.initialize) {
            this.rollData.initialize();
            this._initialized = true;
        }

        if (this.rollData.update) {
            await this.rollData.update();
        }

        const context = await super._prepareContext(options);
        const rollData = this.rollData;
        const isForceField = this.rollType === "forceField";

        // Collect situational modifiers from the actor
        if (!isForceField) {
            this._cachedSituationalModifiers = this._collectSituationalModifiers();
        }

        // Calculate modifiers (force fields have no modifiers)
        const difficultyMod = isForceField ? 0 : this._currentDifficulty.modifier;
        const situationalMod = isForceField ? 0 : this._calculateSituationalModifiers();
        const customMod = isForceField ? 0 : this._customModifier;

        const baseTarget = isForceField
            ? (rollData.protectionRating || 0)
            : (rollData.baseTarget || 0);
        const finalTarget = Math.max(0, baseTarget + difficultyMod + situationalMod + customMod);

        // Dynamic color class based on success chance
        let targetColorClass;
        if (finalTarget <= 15) targetColorClass = "urd-target__number--dire";
        else if (finalTarget <= 30) targetColorClass = "urd-target__number--poor";
        else if (finalTarget <= 45) targetColorClass = "urd-target__number--fair";
        else if (finalTarget <= 60) targetColorClass = "urd-target__number--good";
        else if (finalTarget <= 80) targetColorClass = "urd-target__number--great";
        else targetColorClass = "urd-target__number--legendary";

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
        const canStepUp = this._selectedDifficultyIndex > 0;
        const canStepDown = this._selectedDifficultyIndex < this.constructor.DIFFICULTIES.length - 1;

        // Build difficulty picker list (ordered relative to current)
        const difficultyPicker = this.constructor.DIFFICULTIES.map((d, i) => ({
            ...d,
            index: i,
            isCurrent: i === this._selectedDifficultyIndex,
            modifierLabel: d.modifier >= 0 ? `+${d.modifier}` : `${d.modifier}`
        }));

        // Situational modifiers with toggle state
        const situationalModifiers = (this._cachedSituationalModifiers || []).map(m => ({
            ...m,
            active: this._situationalModifiers[m.key + "_" + m.source] ?? false,
            toggleKey: m.key + "_" + m.source,
            valueLabel: m.value >= 0 ? `+${m.value}` : `${m.value}`
        }));
        const hasSituationalModifiers = situationalModifiers.length > 0;

        // Modifier aggregate
        const modifierAggregate = difficultyMod + situationalMod + customMod;

        // Roll type specific data
        const isWeapon = this.rollType === "weapon";
        const isPsychic = this.rollType === "psychic";
        const isSimple = this.rollType === "simple";

        // Actor info (ForceFieldData uses .actor, ActionData uses .sourceActor or .actor)
        const actor = rollData.sourceActor || rollData.actor;
        const actorName = actor?.name || "";
        const actorImg = actor?.img || "";

        // Roll name
        let rollName = isForceField
            ? (rollData.forceField?.name || "Force Field")
            : (rollData.name || rollData.nameOverride || "Test");
        const rollSubtitle = isForceField
            ? "Force Field Activation"
            : (rollData.type || rollData.action || "");

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
            isTwoDice: this._diceInputMode === "two-dice",
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
            baseChar: rollData.baseChar || ""
        };
    }

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Auto-select number inputs on focus
        this.element.querySelectorAll('input[type="number"], input[data-dtype="Number"]')
            .forEach(input => {
                input.addEventListener("focus", (e) => e.target.select());
            });

        // Set up two-dice input handlers
        const tensInput = this.element.querySelector("#manual-tens");
        const unitsInput = this.element.querySelector("#manual-units");
        if (tensInput) {
            tensInput.addEventListener("input", (e) => {
                const val = parseInt(e.target.value);
                this._manualRollTens = (val >= 0 && val <= 9) ? val : null;
                if (this._manualRollTens !== null && unitsInput) {
                    unitsInput.focus();
                    unitsInput.select();
                }
                this.render(false, { parts: ["diceInput", "footer"] });
            });
        }
        if (unitsInput) {
            unitsInput.addEventListener("input", (e) => {
                const val = parseInt(e.target.value);
                this._manualRollUnits = (val >= 0 && val <= 9) ? val : null;
                this.render(false, { parts: ["diceInput", "footer"] });
            });
        }

        // Single number input
        const singleInput = this.element.querySelector("#manual-single");
        if (singleInput) {
            singleInput.addEventListener("input", (e) => {
                const val = parseInt(e.target.value);
                this._singleRollValue = (val >= 1 && val <= 100) ? val : null;
                this.render(false, { parts: ["diceInput", "footer"] });
            });
        }

        // Custom modifier input
        const customInput = this.element.querySelector("#unified-custom-modifier");
        if (customInput) {
            customInput.addEventListener("change", (e) => {
                this._customModifier = parseInt(e.target.value) || 0;
                this.render(false, { parts: ["targetDisplay", "modifiers", "diceInput"] });
            });
        }

        // Animate target number if changed
        const targetEl = this.element.querySelector(".urd-target__number");
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
            document.removeEventListener("pointerdown", this._pickerOutsideHandler);
            this._pickerOutsideHandler = null;
        }
        if (this._difficultyPickerOpen) {
            const picker = this.element.querySelector(".urd-difficulty-picker");
            if (picker) {
                this._pickerOutsideHandler = (e) => {
                    if (!picker.contains(e.target) && !e.target.closest('[data-action="toggleDifficultyPicker"]')) {
                        this._difficultyPickerOpen = false;
                        document.removeEventListener("pointerdown", this._pickerOutsideHandler);
                        this._pickerOutsideHandler = null;
                        this.render(false, { parts: ["targetDisplay"] });
                    }
                };
                setTimeout(() => document.addEventListener("pointerdown", this._pickerOutsideHandler), 0);
            }
        }

        // Keyboard: Enter submits, Escape closes picker
        this.element.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this._difficultyPickerOpen) {
                e.preventDefault();
                this._difficultyPickerOpen = false;
                this.render(false, { parts: ["targetDisplay"] });
                return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this._submitToChat();
            }
        });
    }

    /* -------------------------------------------- */
    /*  Context Helpers                              */
    /* -------------------------------------------- */

    _getWeaponContext() {
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

        // Build range bracket list for UI
        const rangeBrackets = rd.weapon?.isRanged ? Object.entries(RANGE_BRACKETS).map(([key, b]) => ({
            key,
            label: b.label,
            modifier: b.modifier,
            modifierLabel: b.modifier >= 0 ? `+${b.modifier}` : `${b.modifier}`,
            description: b.description,
            isSelected: (this._selectedRangeBracket ?? rd.rangeBracket) === key
        })) : [];

        return {
            weapons: rd.weapons || [],
            weapon: rd.weapon,
            weaponSelect: rd.weaponSelect,
            actions: rd.actions || {},
            currentAction: rd.action,
            fireRate: rd.fireRate,
            isCalledShot: rd.isCalledShot,
            calledShotLocation: rd.calledShotLocation,
            locations: rd.locations,
            isLasWeapon: rd.isLasWeapon,
            lasMode: rd.lasMode,
            lasModes: rd.lasModes,
            hasEyeOfVengeanceAvailable: rd.hasEyeOfVengeanceAvailable,
            eyeOfVengeance: rd.eyeOfVengeance,
            canAim: rd.canAim,
            aims: rd.aims,
            usesAmmo: rd.usesAmmo,
            ammoText: rd.ammoText,
            rangeName: rd.rangeName,
            rangeBonus: rd.rangeBonus,
            maxRange: rd.maxRange,
            rangeBrackets,
            selectedRangeBracket: this._selectedRangeBracket ?? rd.rangeBracket,
            rangeModifiedBy: rd.rangeModifiedBy,
            isMeltaRange: rd.isMeltaRange,
            difficulties: rd.difficulties
        };
    }

    _getPsychicContext() {
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
            difficulties: rd.difficulties
        };
    }

    _getForceFieldContext() {
        const rd = this.rollData;
        return {
            forceField: rd.forceField,
            protectionRating: rd.protectionRating
        };
    }

    /* -------------------------------------------- */
    /*  Helper Methods                               */
    /* -------------------------------------------- */

    _collectSituationalModifiers() {
        const actor = this.rollData.sourceActor || this.rollData.actor;
        if (!actor?.getSituationalModifiers) return [];
        const rd = this.rollData;
        const type = rd.type === 'Skill' ? 'skills' : rd.type === 'Characteristic' ? 'characteristics' : 'combat';
        const key = rd.rollKey || null;
        return actor.getSituationalModifiers(type, key);
    }

    _calculateSituationalModifiers() {
        let total = 0;
        for (const mod of (this._cachedSituationalModifiers || [])) {
            const toggleKey = mod.key + "_" + mod.source;
            if (this._situationalModifiers[toggleKey]) total += mod.value;
        }
        return total;
    }

    _stepDifficulty(direction) {
        const newIndex = this._selectedDifficultyIndex + direction;
        if (newIndex < 0 || newIndex >= this.constructor.DIFFICULTIES.length) return;
        this._selectedDifficultyIndex = newIndex;
        this._difficultyPickerOpen = false;
        this.render(false, { parts: ["targetDisplay", "modifiers", "diceInput"] });
    }

    /**
     * Animate the target number counting from old to new value.
     */
    _animateTargetNumber(el, from, to) {
        const duration = 400;
        const start = performance.now();
        const diff = to - from;
        const step = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            const current = Math.round(from + diff * eased);
            el.textContent = current;
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        // Flash color
        el.classList.remove("urd-target-increase", "urd-target-decrease");
        void el.offsetWidth; // force reflow
        el.classList.add(to > from ? "urd-target-increase" : "urd-target-decrease");
    }

    /**
     * Play a subtle tick sound when target changes.
     */
    _playTickSound() {
        const src = "sounds/dice.wav";
        foundry.audio.AudioHelper.play({ src, volume: 0.15, autoplay: true, loop: false }, false);
    }

    /* -------------------------------------------- */
    /*  Form Handler                                 */
    /* -------------------------------------------- */

    static async #onFormSubmit(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);
        // Update roll data fields from form
        if (this.rollData) {
            foundry.utils.mergeObject(this.rollData, data, { recursive: true });
            if (this.rollData.update) {
                await this.rollData.update();
            }
            // Re-render dependent parts (e.g., Called Shot location dropdown, range info)
            await this.render(false, { parts: ["contextPanel", "targetDisplay", "diceInput"] });
        }
    }

    /* -------------------------------------------- */
    /*  Action Handlers                              */
    /* -------------------------------------------- */

    static async #onToggleDifficultyPicker(event, target) {
        this._difficultyPickerOpen = !this._difficultyPickerOpen;
        await this.render(false, { parts: ["targetDisplay"] });
    }

    static async #onSelectDifficulty(event, target) {
        const index = parseInt(target.dataset.difficultyIndex);
        if (Number.isInteger(index) && index >= 0 && index < this.constructor.DIFFICULTIES.length) {
            this._selectedDifficultyIndex = index;
            this._difficultyPickerOpen = false;
            await this.render(false, { parts: ["targetDisplay", "modifiers", "diceInput"] });
        }
    }

    static async #onToggleSituational(event, target) {
        const key = target.dataset.toggleKey;
        if (!key) return;
        this._situationalModifiers[key] = !this._situationalModifiers[key];
        await this.render(false, { parts: ["targetDisplay", "modifiers", "diceInput"] });
    }

    static async #onCustomModUp(event, target) {
        this._customModifier += 5;
        await this.render(false, { parts: ["targetDisplay", "modifiers", "diceInput"] });
    }

    static async #onCustomModDown(event, target) {
        this._customModifier -= 5;
        await this.render(false, { parts: ["targetDisplay", "modifiers", "diceInput"] });
    }

    static async #onToggleCustomModifier(event, target) {
        this._showCustomModifier = !this._showCustomModifier;
        if (!this._showCustomModifier) this._customModifier = 0;
        await this.render(false, { parts: ["targetDisplay", "modifiers", "diceInput"] });
    }

    static async #onSubmitToChat(event, target) {
        await this._submitToChat();
    }

    static async #onSystemRoll(event, target) {
        await this._systemRoll();
    }

    static async #onClearManualRoll(event, target) {
        this._manualRollTens = null;
        this._manualRollUnits = null;
        this._singleRollValue = null;
        this._rollResult = null;
        await this.render(false, { parts: ["diceInput", "footer"] });
    }

    static async #onToggleDiceMode(event, target) {
        this._diceInputMode = this._diceInputMode === "two-dice" ? "single" : "two-dice";
        this._manualRollTens = null;
        this._manualRollUnits = null;
        this._singleRollValue = null;
        this._rollResult = null;
        await this.render(false, { parts: ["diceInput", "footer"] });
    }

    static async #onToggleContextSection(event, target) {
        this._contextExpanded = !this._contextExpanded;
        await this.render(false, { parts: ["contextPanel"] });
    }

    static async #onSelectWeapon(event, target) {
        const weaponId = target.dataset.weaponId || target.name;
        if (this.rollData.selectWeapon) {
            this.rollData.selectWeapon(weaponId);
            if (this.rollData.update) await this.rollData.update();
            await this.render();
        }
    }

    static async #onSelectPower(event, target) {
        const powerId = target.dataset.powerId || target.name;
        if (this.rollData.selectPower) {
            this.rollData.selectPower(powerId);
            if (this.rollData.update) await this.rollData.update();
            await this.render();
        }
    }

    static async #onCancel(event, target) {
        await this.close();
    }

    static async #onSelectRangeBracket(event, target) {
        const bracket = target.dataset.bracket;
        if (!bracket) return;
        this._selectedRangeBracket = bracket;
        const bracketData = RANGE_BRACKETS[bracket];
        if (bracketData) {
            this.rollData.rangeName = bracketData.label;
            this.rollData.rangeBonus = bracketData.modifier;
            this.rollData.rangeBracket = bracket;
        }
        await this.render(false, { parts: ["contextPanel", "targetDisplay", "diceInput"] });
    }

    static async #onSelectTarget(event, target) {
        // Get source token
        const actor = this.rollData.sourceActor;
        if (!actor) return;
        const sourceToken = actor.token ?? actor.getActiveTokens()[0];
        if (!sourceToken) {
            ui.notifications.warn("No token found for the attacking actor.");
            return;
        }

        // Check for existing target
        const targets = game.user.targets;
        if (targets.size === 0) {
            ui.notifications.info("Target a token first, then click Select Target.");
            return;
        }
        const targetToken = [...targets.values()][0];
        if (!targetToken) return;

        // Calculate distance
        const distance = calculateTokenDistance(sourceToken, targetToken);
        this.rollData.distance = distance;
        this.rollData.targetActor = targetToken.actor;

        // Recalculate range with new distance
        if (this.rollData.update) await this.rollData.update();

        // Clear manual bracket override so calculated bracket takes effect
        this._selectedRangeBracket = null;
        await this.render(false, { parts: ["contextPanel", "targetDisplay", "diceInput"] });
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                 */
    /* -------------------------------------------- */

    /**
     * Submit the roll to chat - either with manual roll or just target info.
     */
    async _submitToChat() {
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

        if (rollType === "weapon") {
            await this._submitWeaponRoll(manualTotal);
        } else if (rollType === "psychic") {
            await this._submitPsychicRoll(manualTotal);
        } else if (rollType === "forceField") {
            await this._submitForceFieldRoll(manualTotal);
        } else {
            await this._submitSimpleRoll(manualTotal);
        }

        await this.close();
    }

    /**
     * Use Foundry's digital roll.
     */
    async _systemRoll() {
        this._applyModifiersToRollData();

        const rollType = this.rollType;
        if (rollType === "weapon") {
            if (!this._validateWeaponRoll()) return;
            await this.rollData.finalize();
            await this.actionData.performActionAndSendToChat();
        } else if (rollType === "psychic") {
            await this.rollData.finalize();
            await this.actionData.performActionAndSendToChat();
        } else if (rollType === "forceField") {
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

    _applyModifiersToRollData() {
        const rd = this.rollData;
        if (!rd.modifiers) return;
        rd.modifiers["difficulty"] = this._currentDifficulty.modifier;
        rd.modifiers["situational"] = this._calculateSituationalModifiers();
        rd.modifiers["modifier"] = this._customModifier;
    }

    async _submitSimpleRoll(manualTotal) {
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

    async _submitWeaponRoll(manualTotal) {
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
            this.rollData.render = "";
            this.rollData.template = this.actionData.template;
            await sendActionDataToChat(this.actionData);
        }
    }

    async _submitPsychicRoll(manualTotal) {
        if (manualTotal !== null) {
            await this.rollData.finalize();
            this.rollData.isManualRoll = true;
            await this.actionData.performActionAndSendToChat();
        } else {
            await this.rollData.finalize();
            this.rollData.isTargetOnly = true;
            this.rollData.render = "";
            this.rollData.template = this.actionData.template;
            await sendActionDataToChat(this.actionData);
        }
    }

    async _submitForceFieldRoll(manualTotal) {
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

    _validateWeaponRoll() {
        if (this.rollData.fireRate === 0) {
            ui.notifications.warn("Not enough ammo to perform action. Do you need to reload?");
            return false;
        }
        return true;
    }

    _validateForceFieldRoll() {
        if (!this.rollData.forceField?.system?.activated) {
            ui.notifications.warn("Force Field not activated!");
            return false;
        }
        if (this.rollData.forceField?.system?.overloaded) {
            ui.notifications.warn("Force Field currently overloaded!");
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
export async function prepareUnifiedRoll(actionData) {
    const prompt = new UnifiedRollDialog(actionData);
    prompt.render(true);
}
