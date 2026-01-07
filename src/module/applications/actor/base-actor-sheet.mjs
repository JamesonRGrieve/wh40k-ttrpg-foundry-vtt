/**
 * @file BaseActorSheet - Base actor sheet built on ApplicationV2
 * Based on dnd5e's BaseActorSheet pattern for Foundry V13+
 */

import ApplicationV2Mixin from "../api/application-v2-mixin.mjs";
import PrimarySheetMixin from "../api/primary-sheet-mixin.mjs";
import TooltipMixin from "../api/tooltip-mixin.mjs";
import VisualFeedbackMixin from "../api/visual-feedback-mixin.mjs";
import CollapsiblePanelMixin from "../api/collapsible-panel-mixin.mjs";
import ContextMenuMixin from "../api/context-menu-mixin.mjs";
import EnhancedDragDropMixin from "../api/enhanced-drag-drop-mixin.mjs";
import WhatIfMixin from "../api/what-if-mixin.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Base actor sheet built on ApplicationV2.
 * All actor sheets should extend this class.
 */
export default class BaseActorSheet extends WhatIfMixin(EnhancedDragDropMixin(ContextMenuMixin(CollapsiblePanelMixin(VisualFeedbackMixin(TooltipMixin(PrimarySheetMixin(
    ApplicationV2Mixin(ActorSheetV2)
))))))) {
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
            cancelWhatIf: BaseActorSheet.#cancelWhatIf
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

        // Prepare skills
        await this._prepareSkills(context);

        // Prepare items by category
        await this._prepareItems(context);

        return context;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onRender(context, options) {
        super._onRender(context, options);
        
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
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onClose(options) {
        super._onClose(options);
        
        // Clean up hook listener
        if (this._updateListener) {
            Hooks.off("updateActor", this._updateListener);
            this._updateListener = null;
        }
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
     * Handle toggling section visibility.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleSection(event, target) {
        const sectionName = target.dataset.toggle;
        if (!sectionName) return;

        // Get current expanded state from actor flags
        const expanded = this.actor.getFlag("rogue-trader", "ui.expanded") || [];
        const isCurrentlyExpanded = expanded.includes(sectionName);

        // Toggle the state
        const newExpanded = isCurrentlyExpanded
            ? expanded.filter(name => name !== sectionName)
            : [...expanded, sectionName];

        // Update actor flags
        await this.actor.setFlag("rogue-trader", "ui.expanded", newExpanded);
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
}
