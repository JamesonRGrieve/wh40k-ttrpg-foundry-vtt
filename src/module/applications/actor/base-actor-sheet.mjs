/**
 * @file BaseActorSheet - Base actor sheet built on ApplicationV2
 * Based on dnd5e's BaseActorSheet pattern for Foundry V13+
 */

import ApplicationV2Mixin from "../api/application-v2-mixin.mjs";
import PrimarySheetMixin from "../api/primary-sheet-mixin.mjs";
import TooltipMixin from "../api/tooltip-mixin.mjs";
import VisualFeedbackMixin from "../api/visual-feedback-mixin.mjs";
import EnhancedAnimationsMixin from "../api/enhanced-animations-mixin.mjs";
import CollapsiblePanelMixin from "../api/collapsible-panel-mixin.mjs";
import ContextMenuMixin from "../api/context-menu-mixin.mjs";
import EnhancedDragDropMixin from "../api/enhanced-drag-drop-mixin.mjs";
import WhatIfMixin from "../api/what-if-mixin.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Base actor sheet built on ApplicationV2.
 * All actor sheets should extend this class.
 */
export default class BaseActorSheet extends WhatIfMixin(EnhancedDragDropMixin(ContextMenuMixin(CollapsiblePanelMixin(EnhancedAnimationsMixin(VisualFeedbackMixin(TooltipMixin(PrimarySheetMixin(
    ApplicationV2Mixin(ActorSheetV2)
)))))))) {
    constructor(options = {}) {
        super(options);
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        actions: {
            editImage: BaseActorSheet.#onEditImage,
            roll: BaseActorSheet.#roll,
            itemRoll: BaseActorSheet.#itemRoll,
            itemEdit: BaseActorSheet.#itemEdit,
            itemDelete: BaseActorSheet.#itemDelete,
            itemCreate: BaseActorSheet.#itemCreate,
            effectCreate: BaseActorSheet.#effectCreate,
            effectEdit: BaseActorSheet.#effectEdit,
            effectDelete: BaseActorSheet.#effectDelete,
            effectToggle: BaseActorSheet.#effectToggle,
            toggleSection: BaseActorSheet.#toggleSection,
            toggleTraining: BaseActorSheet.#toggleTraining,
            addSpecialistSkill: BaseActorSheet.#addSpecialistSkill,
            deleteSpecialization: BaseActorSheet.#deleteSpecialization,
            togglePanel: BaseActorSheet._onTogglePanel,
            applyPreset: BaseActorSheet._onApplyPreset,
            enterWhatIf: BaseActorSheet.#enterWhatIf,
            commitWhatIf: BaseActorSheet.#commitWhatIf,
            cancelWhatIf: BaseActorSheet.#cancelWhatIf,
            spendXPAdvance: BaseActorSheet.#spendXPAdvance,
            editCharacteristic: BaseActorSheet.#editCharacteristic
        },
        classes: ["rogue-trader", "sheet", "actor"],
        form: {
            submitOnChange: true
        },
        position: {
            width: 1050,
            height: 800
        },
        window: {
            resizable: true
        }
    };

    /* -------------------------------------------- */

    /**
     * A set of item types that should be prevented from being dropped on this type of actor sheet.
     * @type {Set<string>}
     */
    static unsupportedItemTypes = new Set();

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    /**
     * Filter state for equipment panel.
     * @type {{ search: string, type: string, status: string }}
     */
    _equipmentFilter = { search: "", type: "", status: "" };

    /**
     * Filter state for skills panel.
     * @type {{ search: string, characteristic: string, training: string }}
     */
    _skillsFilter = { search: "", characteristic: "", training: "" };

    /**
     * Scroll positions for scrollable containers.
     * @type {Map<string, number>}
     */
    _scrollPositions = new Map();

    /**
     * Whether state has been restored for this sheet instance.
     * @type {boolean}
     * @private
     */
    _stateRestored = false;

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Convenience access to the actor.
     * @type {Actor}
     */
    get actor() {
        return this.document;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = {
            ...await super._prepareContext(options),
            actor: this.actor,
            system: this.actor.system,
            source: this.isEditable ? this.actor.system._source : this.actor.system,
            fields: this.actor.system.schema?.fields ?? {},
            effects: this.actor.getEmbeddedCollection("ActiveEffect").contents,
            items: Array.from(this.actor.items),
            limited: this.actor.limited,
            rollableClass: this.isEditable ? "rollable" : ""
        };

        // Prepare characteristics with HUD data
        this._prepareCharacteristicsHUD(context);

        // Prepare skills
        await this._prepareSkills(context);

        // Prepare items by category
        await this._prepareItems(context);

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare characteristics with progress ring calculations.
     * @param {object} context  Context being prepared.
     * @protected
     */
    _prepareCharacteristicsHUD(context) {
        const characteristics = this.actor.system.characteristics || {};
        
        for (const [key, char] of Object.entries(characteristics)) {
            // Calculate advancement progress (0-5)
            const advanceProgress = (char.advance || 0) / 5; // 0.0 to 1.0
            
            // SVG circle calculations (circumference = 2 * π * r, where r=52)
            const radius = 52;
            const circumference = 2 * Math.PI * radius; // ≈ 327
            char.progressCircumference = circumference;
            char.progressOffset = circumference * (1 - advanceProgress);
            char.advanceProgress = Math.round(advanceProgress * 100); // Percentage
            
            // Calculate XP cost for next advance (follows RT progression)
            // Simple: 100, Intermediate: 250, Trained: 500, Proficient: 750, Expert: 1000
            const advanceCosts = [100, 250, 500, 750, 1000];
            const nextAdvance = char.advance || 0;
            char.nextAdvanceCost = nextAdvance < 5 ? advanceCosts[nextAdvance] : 0;
            
            // Prepare tooltip data if not already present
            if (!char.tooltipData) {
                char.tooltipData = this.prepareCharacteristicTooltip(key, char);
            }

            // HUD display formatting - hudMod is the characteristic bonus (tens digit)
            char.hudMod = char.bonus ?? Math.floor((char.total ?? 0) / 10);
            char.hudTotal = char.total;

            // HUD State flags for visual styling (used by V1 HUD)
            char.hasBonus = (char.modifier || 0) > 0;
            char.hasPenalty = (char.modifier || 0) < 0;
            char.isMaxed = (char.advance || 0) >= 5;

            // Calculate unnatural bonus if applicable
            const unnaturalMult = char.unnatural || 1;
            if (unnaturalMult > 1) {
                const baseBonus = Math.floor((char.total || 0) / 10);
                char.unnaturalBonus = baseBonus * unnaturalMult;
            }
        }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onClose(options) {
        // Save state before closing
        this._saveSheetState();
        
        super._onClose(options);
        
        // Clean up hook listener
        if (this._updateListener) {
            Hooks.off("updateActor", this._updateListener);
            this._updateListener = null;
        }

        // Clean up click-outside handler
        if (this._clickOutsideHandler) {
            document.removeEventListener("click", this._clickOutsideHandler);
            this._clickOutsideHandler = null;
        }
    }

    /* -------------------------------------------- */
    /*  State Persistence                           */
    /* -------------------------------------------- */

    /**
     * Save current sheet state to actor flags.
     * Captures scroll positions, filter states, search terms, and window size.
     * @protected
     */
    _saveSheetState() {
        // Capture scroll positions before saving
        this._captureScrollPositions();

        const state = {
            scrollPositions: Object.fromEntries(this._scrollPositions),
            equipmentFilter: this._equipmentFilter,
            skillsFilter: this._skillsFilter,
            windowSize: {
                width: this.position?.width,
                height: this.position?.height
            }
        };

        // Use setFlag - this is async but we don't await it on close
        this.actor.setFlag("rogue-trader", "sheetState", state);
    }

    /**
     * Restore sheet state from actor flags.
     * Called after first render to restore previous state.
     * @returns {Promise<void>}
     * @protected
     */
    async _restoreSheetState() {
        if (this._stateRestored) return;
        this._stateRestored = true;

        const state = this.actor.getFlag("rogue-trader", "sheetState");
        if (!state) return;

        // Restore filter states
        if (state.equipmentFilter) {
            this._equipmentFilter = { ...this._equipmentFilter, ...state.equipmentFilter };
        }
        if (state.skillsFilter) {
            this._skillsFilter = { ...this._skillsFilter, ...state.skillsFilter };
        }

        // Restore scroll positions
        if (state.scrollPositions) {
            this._scrollPositions = new Map(Object.entries(state.scrollPositions));
        }

        // Restore window size if different from default
        if (state.windowSize?.width && state.windowSize?.height) {
            const defaultPos = this.constructor.DEFAULT_OPTIONS.position;
            if (state.windowSize.width !== defaultPos?.width || 
                state.windowSize.height !== defaultPos?.height) {
                this.setPosition({
                    width: state.windowSize.width,
                    height: state.windowSize.height
                });
            }
        }

        // Apply filter states to DOM after a brief delay to ensure elements exist
        setTimeout(() => this._applyRestoredState(), 50);
    }

    /**
     * Apply restored state to DOM elements.
     * @protected
     */
    _applyRestoredState() {
        // Apply equipment filters
        if (this._equipmentFilter) {
            const searchInput = this.element?.querySelector(".rt-equipment-search");
            const typeFilter = this.element?.querySelector(".rt-equipment-type-filter");
            const statusFilter = this.element?.querySelector(".rt-equipment-status-filter");

            if (searchInput && this._equipmentFilter.search) {
                searchInput.value = this._equipmentFilter.search;
            }
            if (typeFilter && this._equipmentFilter.type) {
                typeFilter.value = this._equipmentFilter.type;
            }
            if (statusFilter && this._equipmentFilter.status) {
                statusFilter.value = this._equipmentFilter.status;
            }

            // Trigger filter if any values are set
            if (this._equipmentFilter.search || this._equipmentFilter.type || this._equipmentFilter.status) {
                searchInput?.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }

        // Apply skills filters
        if (this._skillsFilter) {
            const searchInput = this.element?.querySelector(".rt-skills-search");
            const charFilter = this.element?.querySelector(".rt-skills-char-filter");
            const trainingFilter = this.element?.querySelector(".rt-skills-training-filter");

            if (searchInput && this._skillsFilter.search) {
                searchInput.value = this._skillsFilter.search;
            }
            if (charFilter && this._skillsFilter.characteristic) {
                charFilter.value = this._skillsFilter.characteristic;
            }
            if (trainingFilter && this._skillsFilter.training) {
                trainingFilter.value = this._skillsFilter.training;
            }

            // Trigger filter if any values are set
            if (this._skillsFilter.search || this._skillsFilter.characteristic || this._skillsFilter.training) {
                searchInput?.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }

        // Apply scroll positions
        this._applyScrollPositions();
    }

    /**
     * Capture current scroll positions of scrollable containers.
     * @protected
     */
    _captureScrollPositions() {
        if (!this.element) return;

        // Common scrollable containers
        const scrollableSelectors = [
            ".rt-body",
            ".rt-skills-columns",
            ".rt-all-items-grid",
            ".rt-talents-grid",
            ".scrollable",
            "[data-scrollable]"
        ];

        scrollableSelectors.forEach(selector => {
            const elements = this.element.querySelectorAll(selector);
            elements.forEach((el, index) => {
                const key = `${selector}-${index}`;
                if (el.scrollTop > 0) {
                    this._scrollPositions.set(key, el.scrollTop);
                }
            });
        });
    }

    /**
     * Apply saved scroll positions to scrollable containers.
     * @protected
     */
    _applyScrollPositions() {
        if (!this.element || this._scrollPositions.size === 0) return;

        const scrollableSelectors = [
            ".rt-body",
            ".rt-skills-columns",
            ".rt-all-items-grid",
            ".rt-talents-grid",
            ".scrollable",
            "[data-scrollable]"
        ];

        scrollableSelectors.forEach(selector => {
            const elements = this.element.querySelectorAll(selector);
            elements.forEach((el, index) => {
                const key = `${selector}-${index}`;
                const savedPosition = this._scrollPositions.get(key);
                if (savedPosition !== undefined) {
                    el.scrollTop = savedPosition;
                }
            });
        });
    }

    /* -------------------------------------------- */

    /**
     * Prepare skills for display.
     * @param {object} context  Context being prepared.
     * @protected
     */
    async _prepareSkills(context) {
        const skills = Object.entries(this.actor.skills ?? {});
        const visibleSkills = skills.filter(([, data]) => !data.hidden);
        
        const getSkillLabel = (key, data) => {
            if (data?.label) return String(data.label);
            if (data?.name) return String(data.name);
            if (key) return String(key);
            return "";
        };
        
        visibleSkills.sort((a, b) => {
            const labelA = getSkillLabel(a[0], a[1]);
            const labelB = getSkillLabel(b[0], b[1]);
            return labelA.localeCompare(labelB);
        });

        const trainingLevel = (skill) => {
            if (skill.plus20) return 3;
            if (skill.plus10) return 2;
            if (skill.trained) return 1;
            return 0;
        };

        context.skillLists = {
            standard: visibleSkills.filter(([, data]) => !Array.isArray(data.entries)),
            specialist: visibleSkills.filter(([, data]) => Array.isArray(data.entries))
        };

        // Add characteristic short names
        const characteristicShorts = {};
        Object.entries(this.actor.characteristics ?? {}).forEach(([key, value]) => {
            if (value?.short) characteristicShorts[key] = value.short;
        });

        // Add training info and tooltip data to standard skills
        const characteristics = this.actor.characteristics ?? {};
        context.skillLists.standard.forEach(([key, data]) => {
            data.trainingLevel = trainingLevel(data);
            data.charShort = characteristicShorts[data.characteristic] ?? data.characteristic ?? "";
            data.tooltipData = this.prepareSkillTooltip(key, data, characteristics);
            
            // Calculate breakdown for tooltip
            const char = characteristics[data.characteristic];
            const charTotal = char?.total ?? 0;
            const level = data.trainingLevel;
            const baseValue = level > 0 ? charTotal : Math.floor(charTotal / 2);
            const trainingBonus = level >= 3 ? 20 : level >= 2 ? 10 : 0;
            const bonus = data.bonus || 0;
            
            let breakdownParts = [];
            if (level > 0) {
                breakdownParts.push(`${char?.short || data.characteristic}: ${charTotal}`);
            } else {
                breakdownParts.push(`${char?.short || data.characteristic}: ${charTotal}/2 = ${baseValue}`);
            }
            if (trainingBonus > 0) breakdownParts.push(`Training: +${trainingBonus}`);
            if (bonus !== 0) breakdownParts.push(`Bonus: ${bonus >= 0 ? '+' : ''}${bonus}`);
            data.breakdown = breakdownParts.join(', ');
        });

        // Split standard skills into columns
        const standardSkills = context.skillLists.standard;
        const splitIndex = Math.ceil(standardSkills.length / 2);
        context.skillLists.standardColumns = [
            standardSkills.slice(0, splitIndex),
            standardSkills.slice(splitIndex)
        ];

        // Add training info and tooltip data to specialist skills
        context.skillLists.specialist.forEach(([key, data]) => {
            data.tooltipData = this.prepareSkillTooltip(key, data, characteristics);
            data.entries?.forEach((entry) => {
                entry.trainingLevel = trainingLevel(entry);
                
                // Calculate breakdown for specialist entries
                const entryChar = entry.characteristic ? characteristics[entry.characteristic] : characteristics[data.characteristic];
                const entryCharTotal = entryChar?.total ?? 0;
                const entryLevel = entry.trainingLevel;
                const entryBaseValue = entryLevel > 0 ? entryCharTotal : Math.floor(entryCharTotal / 2);
                const entryTrainingBonus = entryLevel >= 3 ? 20 : entryLevel >= 2 ? 10 : 0;
                const entryBonus = entry.bonus || 0;
                
                let entryBreakdownParts = [];
                if (entryLevel > 0) {
                    entryBreakdownParts.push(`${entryChar?.short || entry.characteristic || data.characteristic}: ${entryCharTotal}`);
                } else {
                    entryBreakdownParts.push(`${entryChar?.short || entry.characteristic || data.characteristic}: ${entryCharTotal}/2 = ${entryBaseValue}`);
                }
                if (entryTrainingBonus > 0) entryBreakdownParts.push(`Training: +${entryTrainingBonus}`);
                if (entryBonus !== 0) entryBreakdownParts.push(`Bonus: ${entryBonus >= 0 ? '+' : ''}${entryBonus}`);
                entry.breakdown = entryBreakdownParts.join(', ');
            });
        });
    }

    /* -------------------------------------------- */

    /**
     * Prepare items display across the sheet.
     * @param {object} context  Context being prepared.
     * @protected
     */
    async _prepareItems(context) {
        context.itemsByType = {};
        
        for (const item of this.actor.items) {
            const type = item.type;
            context.itemsByType[type] ??= [];
            context.itemsByType[type].push(item);
        }

        // Sort each category
        for (const items of Object.values(context.itemsByType)) {
            items.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
        }

        // Create common item categories
        context.weapons = context.itemsByType.weapon ?? [];
        context.armourItems = context.itemsByType.armour ?? [];
        context.talents = context.itemsByType.talent ?? [];
        context.traits = context.itemsByType.trait ?? [];
        context.gearItems = context.itemsByType.gear ?? [];
        context.psychicPowers = context.itemsByType.psychicPower ?? [];
        context.cybernetics = context.itemsByType.cybernetic ?? [];
        context.conditions = context.itemsByType.condition ?? [];
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Restore sheet state on first render
        if (!this._stateRestored) {
            await this._restoreSheetState();
        }

        // Add rt-sheet class to the form element for CSS styling
        const form = this.element.querySelector("form");
        if (form) {
            form.classList.add("rt-sheet");
        }

        // Setup document update listener for visual feedback
        if (!this._updateListener) {
            this._updateListener = (document, changes, options, userId) => {
                // Only animate changes from other users or from form submission
                if (document.id === this.actor.id && userId !== game.userId) {
                    this.visualizeChanges(changes);
                }
            };
            Hooks.on("updateActor", this._updateListener);
        }

        // Detect stat changes and trigger animations
        this._detectAndAnimateChanges();

        // Handle delta inputs for numeric fields
        if (this.isEditable) {
            this.element.querySelectorAll('input[type="text"][data-dtype="Number"]')
                .forEach(i => i.addEventListener("change", this._onChangeInputDelta.bind(this)));
        }

        // Set up drag handlers for items
        this.element.querySelectorAll("[data-item-id]").forEach(el => {
            if (el.dataset.itemId) {
                el.setAttribute("draggable", true);
                el.addEventListener("dragstart", this._onDragItem.bind(this), false);
            }
        });

        // Legacy panel toggle handlers for V1 templates
        // These use .sheet-control__hide-control class with data-toggle attribute
        this.element.querySelectorAll(".sheet-control__hide-control").forEach(el => {
            el.addEventListener("click", this._onLegacyPanelToggle.bind(this));
        });

        // Click-outside handler to close characteristic HUD dropdowns
        this._setupClickOutsideHandler();
    }

    /* -------------------------------------------- */

    /**
     * Setup click-outside handler to close characteristic HUD dropdowns.
     * @protected
     */
    _setupClickOutsideHandler() {
        // Remove any existing handler to avoid duplicates
        if (this._clickOutsideHandler) {
            document.removeEventListener("click", this._clickOutsideHandler);
        }

        this._clickOutsideHandler = (event) => {
            // Check if click was outside any dropdown or toggle button
            const clickedDropdown = event.target.closest(".rt-char-hud-details");
            const clickedToggle = event.target.closest(".rt-char-hud-toggle");

            // If clicked outside dropdowns and toggle buttons, close all dropdowns
            if (!clickedDropdown && !clickedToggle) {
                this.element?.querySelectorAll(".rt-char-hud-details.expanded").forEach(el => {
                    el.classList.remove("expanded");
                    const toggleIcon = el.closest(".rt-char-hud-item")?.querySelector(".rt-char-hud-toggle-icon");
                    if (toggleIcon) toggleIcon.classList.remove("active");
                });
            }
        };

        document.addEventListener("click", this._clickOutsideHandler);
    }

    /* -------------------------------------------- */

    /**
     * Detect stat changes and trigger appropriate animations.
     * Compares current state with previous state captured during last render.
     * @protected
     */
    _detectAndAnimateChanges() {
        if (!this._previousState) return;
        
        const current = this.document.system;
        const previous = this._previousState;
        
        // Check wounds
        if (current.wounds?.value !== previous.wounds) {
            this.animateWoundsChange?.(previous.wounds, current.wounds.value);
        }
        
        // Check XP
        if (current.experience?.total !== previous.experience) {
            this.animateXPGain?.(previous.experience, current.experience.total);
        }
        
        // Check characteristics
        for (const [key, char] of Object.entries(current.characteristics || {})) {
            const prevChar = previous.characteristics[key];
            if (!prevChar) continue;
            
            // Check total change
            if (char.total !== prevChar.total) {
                this.animateCharacteristicChange?.(key, prevChar.total, char.total);
            }
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle legacy panel toggle clicks from V1 templates.
     * Uses the data-toggle attribute to identify which section to expand/collapse.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onLegacyPanelToggle(event) {
        event.preventDefault();
        const target = event.currentTarget.dataset.toggle;
        if (!target) return;

        // Get current expanded state from actor flags
        const expanded = this.actor.getFlag("rogue-trader", "ui.expanded") || [];
        const isCurrentlyExpanded = expanded.includes(target);

        // Toggle the state
        const newExpanded = isCurrentlyExpanded
            ? expanded.filter(name => name !== target)
            : [...expanded, target];

        // Update actor flags - this will trigger a re-render
        await this.actor.setFlag("rogue-trader", "ui.expanded", newExpanded);
    }

    /* -------------------------------------------- */

    /**
     * Handle input changes to numeric form fields, allowing them to accept delta-typed inputs.
     * @param {Event} event  Triggering event.
     * @protected
     */
    _onChangeInputDelta(event) {
        const input = event.target;
        const value = input.value;
        if (["+", "-"].includes(value[0])) {
            const current = foundry.utils.getProperty(this.actor, input.name) ?? 0;
            const delta = parseFloat(value);
            input.value = current + delta;
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle beginning a drag-drop operation on an Item.
     * @param {DragEvent} event  The originating drag event.
     * @protected
     */
    _onDragItem(event) {
        const itemId = event.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) {
            event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an image via the file browser.
     * @this {BaseActorSheet}
     * @param {PointerEvent} event  The triggering event.
     * @param {HTMLElement} target  The action target.
     */
    static async #onEditImage(event, target) {
        const attr = target.dataset.edit ?? "img";
        const current = foundry.utils.getProperty(this.document._source, attr);
        const fp = new CONFIG.ux.FilePicker({
            current,
            type: "image",
            callback: path => this.document.update({ [attr]: path }),
            position: {
                top: this.position.top + 40,
                left: this.position.left + 10
            }
        });
        await fp.browse();
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling from the sheet.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #roll(event, target) {
        const rollType = target.dataset.rollType;
        const rollTarget = target.dataset.rollTarget;
        const specialty = target.dataset.specialty;

        // Add rolling animation for characteristic rolls
        if (rollType === "characteristic") {
            target.classList.add("rolling");
            target.addEventListener("animationend", () => {
                target.classList.remove("rolling");
            }, { once: true });
        }

        switch (rollType) {
            case "characteristic":
                return this.actor.rollCharacteristic?.(rollTarget);
            case "skill":
                return this.actor.rollSkill?.(rollTarget, specialty);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #itemRoll(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        if (itemId) await this.actor.rollItem?.(itemId);
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #itemEdit(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        item?.sheet.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #itemDelete(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        if (!itemId) return;

        const confirmed = await Dialog.confirm({
            title: "Confirm Delete",
            content: "<p>Are you sure you would like to delete this?</p>",
            defaultYes: false
        });
        
        if (confirmed) {
            await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle creating an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #itemCreate(event, target) {
        const itemType = target.dataset.type ?? "gear";
        const data = {
            name: `New ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`,
            type: itemType
        };
        await this.actor.createEmbeddedDocuments("Item", [data], { renderSheet: true });
    }

    /* -------------------------------------------- */

    /**
     * Handle creating an effect.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #effectCreate(event, target) {
        await this.actor.createEmbeddedDocuments("ActiveEffect", [{
            name: "New Effect",
            icon: "icons/svg/aura.svg",
            origin: this.actor.uuid,
            disabled: true
        }], { renderSheet: true });
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an effect.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #effectEdit(event, target) {
        const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
        const effect = this.actor.effects.get(effectId);
        effect?.sheet.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting an effect.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #effectDelete(event, target) {
        const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
        const effect = this.actor.effects.get(effectId);
        await effect?.delete();
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling an effect.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #effectToggle(event, target) {
        const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
        const effect = this.actor.effects.get(effectId);
        await effect?.update({ disabled: !effect.disabled });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling section visibility (characteristic HUD dropdowns).
     * Uses CSS class toggling for immediate feedback without re-render.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleSection(event, target) {
        event.stopPropagation();
        const sectionName = target.dataset.toggle;
        if (!sectionName) return;

        // Find the dropdown panel element
        const dropdown = this.element.querySelector(`.rt-char-hud-details.${sectionName}`);
        if (!dropdown) return;

        // Close all other dropdowns first
        this.element.querySelectorAll(".rt-char-hud-details.expanded").forEach(el => {
            if (el !== dropdown) {
                el.classList.remove("expanded");
                // Also remove active class from the toggle icon
                const toggleIcon = el.closest(".rt-char-hud-item")?.querySelector(".rt-char-hud-toggle-icon");
                if (toggleIcon) toggleIcon.classList.remove("active");
            }
        });

        // Toggle this dropdown
        const isExpanded = dropdown.classList.toggle("expanded");

        // Toggle the chevron icon
        const toggleIcon = target.querySelector(".rt-char-hud-toggle-icon");
        if (toggleIcon) {
            toggleIcon.classList.toggle("active", isExpanded);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle skill training button clicks.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleTraining(event, target) {
        const field = target.dataset.field;
        const skillKey = target.dataset.skill;
        const level = target.dataset.level ? parseInt(target.dataset.level) : null;
        const specialty = target.dataset.specialty ?? target.dataset.index;

        // Pattern 1: Simple field toggle
        if (field) {
            const currentValue = target.dataset.value === "true";
            await this.actor.update({ [field]: !currentValue });
            return;
        }

        // Pattern 2: Level-based training
        if (skillKey && level !== null) {
            const basePath = specialty != null
                ? `system.skills.${skillKey}.entries.${specialty}`
                : `system.skills.${skillKey}`;

            // Get current training level
            const skill = specialty != null
                ? this.actor.system.skills?.[skillKey]?.entries?.[specialty]
                : this.actor.system.skills?.[skillKey];

            const currentLevel = skill?.plus20 ? 3 : skill?.plus10 ? 2 : skill?.trained ? 1 : 0;

            // Toggle logic: if clicking the current level, reduce by 1; otherwise set to clicked level
            const newLevel = (level === currentLevel) ? level - 1 : level;

            const updateData = {
                [`${basePath}.trained`]: newLevel >= 1,
                [`${basePath}.plus10`]: newLevel >= 2,
                [`${basePath}.plus20`]: newLevel >= 3
            };

            await this.actor.update(updateData);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle adding a specialist skill.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #addSpecialistSkill(event, target) {
        const skillKey = target.dataset.skill;
        const skill = this.actor.system.skills?.[skillKey];
        if (!skill) {
            ui.notifications.warn("Skill not specified.");
            return;
        }

        // Import and call the specialist skill prompt
        const { prepareCreateSpecialistSkillPrompt } = await import("../../prompts/simple-prompt.mjs");
        await prepareCreateSpecialistSkillPrompt({
            actor: this.actor,
            skill: skill,
            skillName: skillKey
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting a skill specialization.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #deleteSpecialization(event, target) {
        const skillName = target.dataset.skill;
        const index = parseInt(target.dataset.index);

        const skill = this.actor.system.skills[skillName];
        if (!skill || !Array.isArray(skill.entries)) return;

        const entries = [...skill.entries];
        const deletedName = entries[index]?.name || "this specialization";

        const confirmed = await Dialog.confirm({
            title: "Delete Specialization",
            content: `<p>Delete "${deletedName}"?</p>`,
            defaultYes: false
        });

        if (confirmed) {
            entries.splice(index, 1);
            await this.actor.update({ [`system.skills.${skillName}.entries`]: entries });
        }
    }

    /* -------------------------------------------- */
    /*  Drag & Drop                                 */
    /* -------------------------------------------- */

    /** @override */
    async _onDropItem(event, item) {
        if (!this.actor.isOwner) return;

        // Check if this item type is supported
        if (this.constructor.unsupportedItemTypes.has(item.type)) {
            ui.notifications.warn(game.i18n.format("RT.Warning.InvalidItem", {
                itemType: game.i18n.localize(CONFIG.Item.typeLabels[item.type]),
                actorType: game.i18n.localize(CONFIG.Actor.typeLabels[this.actor.type])
            }));
            return false;
        }

        // Check if item already exists on actor (for move operations)
        if (this.actor.items.get(item.id)) {
            return this._onSortItem(event, item);
        }

        // Create the item
        return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
    }

    /* -------------------------------------------- */

    /**
     * Handle sorting an item within the actor's inventory.
     * @param {DragEvent} event  The drop event.
     * @param {Item} item        The item being sorted.
     * @returns {Promise}
     * @protected
     */
    async _onSortItem(event, item) {
        const items = this.actor.items;
        const source = items.get(item.id);

        // Confirm the drop target
        const dropTarget = event.target.closest("[data-item-id]");
        if (!dropTarget) return;
        const target = items.get(dropTarget.dataset.itemId);
        if (source.id === target.id) return;

        // Identify sibling items based on adjacent HTML elements
        const siblings = [];
        for (const element of dropTarget.parentElement.children) {
            const siblingId = element.dataset.itemId;
            if (siblingId && (siblingId !== source.id)) {
                siblings.push(items.get(element.dataset.itemId));
            }
        }

        // Perform the sort
        const sortUpdates = foundry.utils.performIntegerSort(source, { target, siblings });
        const updateData = sortUpdates.map(u => {
            const update = u.update;
            update._id = u.target._id;
            return update;
        });

        return this.actor.updateEmbeddedDocuments("Item", updateData);
    }

    /* -------------------------------------------- */
    /*  What-If Mode Actions                        */
    /* -------------------------------------------- */

    /**
     * Enter What-If preview mode
     * @this {BaseActorSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #enterWhatIf(event, target) {
        await this.enterWhatIfMode();
    }

    /**
     * Commit What-If changes
     * @this {BaseActorSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #commitWhatIf(event, target) {
        await this.commitWhatIfChanges();
    }

    /**
     * Cancel What-If mode
     * @this {BaseActorSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #cancelWhatIf(event, target) {
        await this.cancelWhatIfChanges();
    }

    /* -------------------------------------------- */

    /**
     * Handle spending XP to advance a characteristic.
     * @param {Event} event         Triggering click event
     * @param {HTMLElement} target  The button element clicked
     * @protected
     */
    static async #spendXPAdvance(event, target) {
        const charKey = target.dataset.characteristic;
        const char = this.actor.system.characteristics[charKey];
        
        if (!char) {
            ui.notifications.error("Invalid characteristic!");
            return;
        }
        
        const cost = char.nextAdvanceCost;
        const available = this.actor.system.experience?.available || 0;
        
        // Check if enough XP
        if (available < cost) {
            ui.notifications.warn(`Not enough XP! Need ${cost}, have ${available}.`);
            return;
        }
        
        // Check if already maxed
        if ((char.advance || 0) >= 5) {
            ui.notifications.warn(`${char.label} is already at maximum advancement!`);
            return;
        }
        
        // Confirm spending
        const confirmed = await Dialog.confirm({
            title: `Advance ${char.label}?`,
            content: `<p>Spend <strong>${cost} XP</strong> to advance ${char.label} from ${char.total} to ${char.total + 5}?</p>
                     <p><em>Available XP: ${available}</em></p>`,
            yes: () => true,
            no: () => false,
            defaultYes: true
        });
        
        if (!confirmed) return;

        // Capture old values for animation
        const oldTotal = char.total;
        const oldBonus = char.bonus;
        const oldAdvance = char.advance || 0;

        // Update actor
        const newAdvance = oldAdvance + 1;
        const newSpent = (this.actor.system.experience?.spent || 0) + cost;

        await this.actor.update({
            [`system.characteristics.${charKey}.advance`]: newAdvance,
            "system.experience.spent": newSpent
        });

        // Calculate new values
        const newTotal = char.base + (newAdvance * 5) + (char.modifier || 0);
        const newBonus = Math.floor(newTotal / 10) * (char.unnatural || 1);

        // Success notification
        ui.notifications.info(`${char.label} advanced to ${newTotal}! (−${cost} XP)`);

        // Trigger characteristic change animation
        if (this.animateCharacteristicChange) {
            this.animateCharacteristicChange(charKey, oldTotal, newTotal);
        }

        // Trigger bonus change animation if bonus changed
        if (oldBonus !== newBonus && this.animateCharacteristicBonus) {
            this.animateCharacteristicBonus(charKey, oldBonus, newBonus);
        }

        // Animate circle for V1 HUD (bonus display)
        const circleElement = this.element.querySelector(
            `[data-characteristic="${charKey}"] .rt-char-hud-circle`
        );
        if (circleElement) {
            circleElement.classList.add('value-changed');
            setTimeout(() => circleElement.classList.remove('value-changed'), 500);
        }

        // Add value-changed animation to mod display for V1 HUD
        const modElement = this.element.querySelector(
            `[data-characteristic="${charKey}"] .rt-char-hud-mod`
        );
        if (modElement) {
            modElement.classList.add('value-changed');
            setTimeout(() => modElement.classList.remove('value-changed'), 500);
        }

        // Update the border progress indicator
        const charBox = this.element.querySelector(
            `[data-characteristic="${charKey}"]`
        );
        if (charBox) {
            charBox.style.setProperty('--advance-progress', newAdvance / 5);
            charBox.dataset.advance = newAdvance;
        }
    }

    /* -------------------------------------------- */

    /**
     * Open edit dialog for a characteristic.
     * @param {Event} event         Triggering event
     * @param {HTMLElement} target  Button clicked
     * @protected
     */
    static async #editCharacteristic(event, target) {
        const charKey = target.closest('[data-characteristic]')?.dataset.characteristic;
        if (!charKey) return;

        const char = this.actor.system.characteristics[charKey];
        if (!char) {
            ui.notifications.error("Invalid characteristic!");
            return;
        }

        // Calculate current values
        const currentBase = char.base || 0;
        const currentAdvance = char.advance || 0;
        const currentModifier = char.modifier || 0;
        const currentUnnatural = char.unnatural || 1;

        // Create edit dialog using DialogV2
        const result = await foundry.applications.api.DialogV2.wait({
            window: {
                title: `Edit ${char.label}`,
                icon: "fas fa-edit"
            },
            content: `
                <div class="rt-char-edit-dialog">
                    <div class="form-group">
                        <label>Base Value</label>
                        <input type="number" name="base" value="${currentBase}" min="0" max="100" />
                    </div>
                    <div class="form-group">
                        <label>Advances (0-5)</label>
                        <input type="number" name="advance" value="${currentAdvance}" min="0" max="5" />
                    </div>
                    <div class="form-group">
                        <label>Modifier</label>
                        <input type="number" name="modifier" value="${currentModifier}" min="-100" max="100" />
                    </div>
                    <div class="form-group">
                        <label>Unnatural Multiplier</label>
                        <input type="number" name="unnatural" value="${currentUnnatural}" min="1" max="10" />
                    </div>
                    <hr/>
                    <div class="rt-char-preview">
                        <p><strong>Total:</strong> <span class="preview-total">${char.total}</span></p>
                        <p><strong>Bonus:</strong> <span class="preview-bonus">${char.bonus}</span></p>
                    </div>
                </div>
            `,
            buttons: [
                {
                    action: "save",
                    label: "Save",
                    icon: "fas fa-save",
                    default: true,
                    callback: (event, button, dialog) => {
                        const formData = new FormDataExtended(button.form).object;
                        return formData;
                    }
                },
                {
                    action: "cancel",
                    label: "Cancel",
                    icon: "fas fa-times"
                }
            ],
            close: () => null
        });

        // Update actor with new values if saved
        if (result) {
            await this.actor.update({
                [`system.characteristics.${charKey}.base`]: parseInt(result.base) || 0,
                [`system.characteristics.${charKey}.advance`]: parseInt(result.advance) || 0,
                [`system.characteristics.${charKey}.modifier`]: parseInt(result.modifier) || 0,
                [`system.characteristics.${charKey}.unnatural`]: parseInt(result.unnatural) || 1
            });

            ui.notifications.info(`${char.label} updated successfully!`);
        }
    }
}
