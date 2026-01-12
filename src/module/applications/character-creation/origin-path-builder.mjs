/**
 * Origin Path Visual Builder
 * 
 * Complete rebuild for Foundry V13 with full drag-drop support,
 * choice dialogs, compendium browser, and bonus calculation.
 * 
 * This application allows players to visually build their character's
 * lifepath through six steps: Home World → Birthright → Lure → Trials → Motivation → Career
 */

import ConfirmationDialog from "../dialogs/confirmation-dialog.mjs";
import OriginPathChoiceDialog from "./origin-path-choice-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class OriginPathBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
    
    /** @override */
    static DEFAULT_OPTIONS = {
        id: "origin-path-builder-{id}",
        classes: ["rogue-trader", "origin-path-builder"],
        tag: "form",
        window: {
            title: "RT.OriginPath.BuilderTitle",
            icon: "fa-solid fa-route",
            minimizable: true,
            resizable: true
        },
        position: {
            width: 1000,
            height: 800
        },
        actions: {
            clearSlot: OriginPathBuilder.#clearSlot,
            randomize: OriginPathBuilder.#randomize,
            reset: OriginPathBuilder.#reset,
            export: OriginPathBuilder.#export,
            import: OriginPathBuilder.#import,
            openCompendium: OriginPathBuilder.#openCompendium,
            viewItem: OriginPathBuilder.#viewItem,
            commitPath: OriginPathBuilder.#commitPath
        },
        dragDrop: [{ 
            dragSelector: ".origin-step-slot.filled",
            dropSelector: ".origin-step-slot"
        }],
        form: {
            handler: OriginPathBuilder.#onFormSubmit,
            submitOnChange: false
        }
    };

    /** @override */
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/character-creation/origin-path-builder.hbs",
            scrollable: [".path-canvas", ".preview-content"]
        }
    };

    /**
     * Origin path step configuration
     * @type {Array<{key: string, step: string, icon: string}>}
     */
    static STEPS = [
        { key: "homeWorld", step: "homeWorld", icon: "fa-globe" },
        { key: "birthright", step: "birthright", icon: "fa-baby" },
        { key: "lureOfTheVoid", step: "lureOfTheVoid", icon: "fa-rocket" },
        { key: "trialsAndTravails", step: "trialsAndTravails", icon: "fa-skull" },
        { key: "motivation", step: "motivation", icon: "fa-heart" },
        { key: "career", step: "career", icon: "fa-briefcase" }
    ];

    /* -------------------------------------------- */

    /**
     * @param {Actor} actor - The character actor
     * @param {object} [options={}] - Additional options
     */
    constructor(actor, options = {}) {
        super(options);
        
        /**
         * The character actor being built
         * @type {Actor}
         */
        this.actor = actor;

        /**
         * Current selections: Map<stepKey, Item>
         * @type {Map<string, object>}
         */
        this.selections = new Map();

        /**
         * Compendium pack cache
         * @type {CompendiumCollection|null}
         * @private
         */
        this._originPack = null;

        // Initialize selections from actor's existing items
        this._initializeFromActor();
    }

    /* -------------------------------------------- */

    /**
     * The unique identifier for this builder instance
     * @type {string}
     */
    get id() {
        return `origin-path-builder-${this.actor.id}`;
    }

    /** @override */
    get title() {
        return game.i18n.format("RT.OriginPath.BuilderTitle", { name: this.actor.name });
    }

    /**
     * Get the origin path compendium pack
     * @type {CompendiumCollection|null}
     */
    get originPack() {
        if (!this._originPack) {
            this._originPack = game.packs.get("rogue-trader.rt-items-origin-path");
        }
        return this._originPack;
    }

    /* -------------------------------------------- */
    /*  Initialization                              */
    /* -------------------------------------------- */

    /**
     * Initialize selections from actor's existing origin path items
     * @private
     */
    _initializeFromActor() {
        const originItems = this.actor.items.filter(i => i.type === "originPath");
        
        for (const item of originItems) {
            const stepKey = item.system.step;
            if (stepKey && OriginPathBuilder.STEPS.some(s => s.step === stepKey)) {
                this.selections.set(stepKey, item);
            }
        }
    }

    /* -------------------------------------------- */
    /*  Drag & Drop Permissions                     */
    /* -------------------------------------------- */

    /**
     * Can the user start a drag operation?
     * @param {string} selector - The selector being dragged
     * @returns {boolean}
     * @protected
     */
    _canDragStart(selector) {
        return this.isEditable;
    }

    /**
     * Can the user drop on this application?
     * @param {string} selector - The selector being dropped on
     * @returns {boolean}
     * @protected
     */
    _canDragDrop(selector) {
        return this.isEditable;
    }

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Prepare steps with current selections
        context.steps = await this._prepareSteps();

        // Calculate total bonuses from all selected origins
        context.preview = this._calculateBonuses();

        // Determine if path is complete (all 6 steps filled)
        context.isComplete = this.selections.size === 6;

        // Check if path has changed from actor's current path
        context.hasChanges = this._hasChanges();

        return context;
    }

    /**
     * Prepare step data for template
     * @returns {Promise<Array>}
     * @private
     */
    async _prepareSteps() {
        const steps = [];

        for (const stepConfig of OriginPathBuilder.STEPS) {
            const item = this.selections.get(stepConfig.step);

            steps.push({
                key: stepConfig.key,
                label: game.i18n.localize(`RT.OriginPath.${stepConfig.key.capitalize()}`),
                step: stepConfig.step,
                icon: stepConfig.icon,
                item: item ? this._prepareItemData(item) : null,
                isEmpty: !item
            });
        }

        return steps;
    }

    /**
     * Prepare item data for template
     * @param {object} item - Item document
     * @returns {object}
     * @private
     */
    _prepareItemData(item) {
        return {
            id: item.id,
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            description: item.system?.description?.value || "",
            bonuses: this._extractItemBonuses(item),
            hasChoices: item.system?.hasChoices || false,
            choicesComplete: item.system?.choicesComplete || false
        };
    }

    /**
     * Extract and format bonuses from an item for display
     * @param {object} item - Item document
     * @returns {Array<{type: string, label: string, value: string}>}
     * @private
     */
    _extractItemBonuses(item) {
        const bonuses = [];

        // Characteristic modifiers
        const charMods = item.system?.modifiers?.characteristics || {};
        for (const [char, value] of Object.entries(charMods)) {
            if (value !== 0) {
                const config = CONFIG.rt.characteristics[char];
                const label = config?.abbreviation || char;
                bonuses.push({
                    type: "characteristic",
                    label: label,
                    value: value > 0 ? `+${value}` : `${value}`
                });
            }
        }

        // Wounds
        if (item.system?.grants?.wounds) {
            const value = item.system.grants.wounds;
            bonuses.push({
                type: "wounds",
                label: "Wounds",
                value: value > 0 ? `+${value}` : `${value}`
            });
        }

        // Fate
        if (item.system?.grants?.fateThreshold) {
            bonuses.push({
                type: "fate",
                label: "Fate",
                value: `+${item.system.grants.fateThreshold}`
            });
        }

        // Skills
        const skills = item.system?.grants?.skills || [];
        if (skills.length > 0) {
            bonuses.push({
                type: "skills",
                label: "Skills",
                value: skills.map(s => s.name).join(", ")
            });
        }

        // Talents
        const talents = item.system?.grants?.talents || [];
        if (talents.length > 0) {
            bonuses.push({
                type: "talents",
                label: "Talents",
                value: talents.map(t => t.name).join(", ")
            });
        }

        // Traits
        const traits = item.system?.grants?.traits || [];
        if (traits.length > 0) {
            bonuses.push({
                type: "traits",
                label: "Traits",
                value: traits.map(t => t.name).join(", ")
            });
        }

        return bonuses;
    }

    /**
     * Calculate aggregate bonuses from all selected origins
     * @returns {object}
     * @private
     */
    _calculateBonuses() {
        const preview = {
            characteristics: {},
            skills: [],
            talents: [],
            traits: [],
            aptitudes: [],
            specialAbilities: []
        };

        // Iterate over all selections
        for (const [stepKey, item] of this.selections) {
            if (!item) continue;

            // Characteristic modifiers
            const charMods = item.system?.modifiers?.characteristics || {};
            for (const [char, value] of Object.entries(charMods)) {
                if (value !== 0) {
                    preview.characteristics[char] = (preview.characteristics[char] || 0) + value;
                }
            }

            // Grants
            const grants = item.system?.grants || {};

            // Wounds
            if (grants.wounds) {
                preview.characteristics.wounds = (preview.characteristics.wounds || 0) + grants.wounds;
            }

            // Fate
            if (grants.fateThreshold) {
                preview.characteristics.fate = (preview.characteristics.fate || 0) + grants.fateThreshold;
            }

            // Skills
            if (grants.skills) {
                for (const skill of grants.skills) {
                    if (!preview.skills.some(s => s.name === skill.name)) {
                        preview.skills.push(skill);
                    }
                }
            }

            // Talents
            if (grants.talents) {
                for (const talent of grants.talents) {
                    if (!preview.talents.some(t => t.name === talent.name)) {
                        preview.talents.push(talent);
                    }
                }
            }

            // Traits
            if (grants.traits) {
                for (const trait of grants.traits) {
                    if (!preview.traits.some(t => t.name === trait.name)) {
                        preview.traits.push(trait);
                    }
                }
            }

            // Aptitudes
            if (grants.aptitudes) {
                for (const aptitude of grants.aptitudes) {
                    if (!preview.aptitudes.includes(aptitude)) {
                        preview.aptitudes.push(aptitude);
                    }
                }
            }

            // Special abilities
            if (grants.specialAbilities) {
                for (const ability of grants.specialAbilities) {
                    preview.specialAbilities.push({
                        source: item.name,
                        name: ability.name,
                        description: ability.description
                    });
                }
            }
        }

        return preview;
    }

    /**
     * Check if current selections differ from actor's items
     * @returns {boolean}
     * @private
     */
    _hasChanges() {
        const actorOriginItems = this.actor.items.filter(i => i.type === "originPath");
        
        // Different count?
        if (this.selections.size !== actorOriginItems.length) {
            return true;
        }

        // Check each selection
        for (const [stepKey, item] of this.selections) {
            const actorItem = actorOriginItems.find(i => i.system.step === stepKey);
            if (!actorItem || actorItem.id !== item.id) {
                return true;
            }
        }

        return false;
    }

    /* -------------------------------------------- */
    /*  Drag & Drop Handlers                        */
    /* -------------------------------------------- */

    /** @override */
    _onDragStart(event) {
        const slot = event.currentTarget;
        const stepData = slot.closest(".origin-step")?.dataset;
        if (!stepData?.step) return;

        const item = this.selections.get(stepData.step);
        if (!item) return;

        // Set drag data
        const dragData = {
            type: "Item",
            uuid: item.uuid
        };

        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    /** @override */
    async _onDrop(event) {
        event.preventDefault();
        
        // Get drop data
        const data = TextEditor.getDragEventData(event);
        if (data.type !== "Item") return;

        // Get dropped item
        const item = await fromUuid(data.uuid);
        if (!item) {
            ui.notifications.warn("Invalid item.");
            return;
        }

        // Validate item type
        if (item.type !== "originPath") {
            ui.notifications.warn(game.i18n.localize("RT.OriginPath.InvalidStep"));
            return;
        }

        // Get target slot
        const slot = event.currentTarget;
        const targetStepData = slot.closest(".origin-step")?.dataset;
        if (!targetStepData?.step) return;

        const targetStep = targetStepData.step;

        // Validate step matches
        if (item.system.step !== targetStep) {
            ui.notifications.warn(game.i18n.localize("RT.OriginPath.InvalidStep"));
            return;
        }

        // Handle item with choices
        if (item.system.hasChoices && !item.system.choicesComplete) {
            await this._handleItemWithChoices(item, targetStep);
        } else {
            // Set selection directly
            await this._setSelection(targetStep, item);
        }
    }

    /**
     * Handle dropping an item that requires choices
     * @param {object} item - The origin path item
     * @param {string} stepKey - The target step key
     * @private
     */
    async _handleItemWithChoices(item, stepKey) {
        // Show choice dialog
        const selectedChoices = await OriginPathChoiceDialog.show(item, this.actor);
        
        if (!selectedChoices) {
            // User cancelled
            return;
        }

        // Create a modified copy of the item with choices applied
        const itemData = item.toObject();
        itemData.system.selectedChoices = selectedChoices;
        
        // Calculate active modifiers from choices (if needed)
        // This would involve parsing the selected options and applying them
        // For now, just store the selections

        // If item is already on actor, update it
        const existingItem = this.actor.items.find(i => 
            i.type === "originPath" && i.system.step === stepKey
        );

        if (existingItem) {
            await existingItem.update({ "system.selectedChoices": selectedChoices });
            this.selections.set(stepKey, existingItem);
        } else {
            // Create new item on actor
            const [createdItem] = await this.actor.createEmbeddedDocuments("Item", [itemData]);
            this.selections.set(stepKey, createdItem);
        }

        await this.render();
    }

    /**
     * Set selection for a step
     * @param {string} stepKey - Step key
     * @param {object} item - Item document
     * @private
     */
    async _setSelection(stepKey, item) {
        this.selections.set(stepKey, item);
        await this.render();
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Clear a step slot
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Target element
     * @private
     */
    static async #clearSlot(event, target) {
        const stepData = target.closest(".origin-step")?.dataset;
        if (!stepData?.step) return;

        this.selections.delete(stepData.step);
        await this.render();
    }

    /**
     * Randomize entire origin path
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Target element
     * @private
     */
    static async #randomize(event, target) {
        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize("RT.OriginPath.Randomize"),
            content: game.i18n.localize("RT.OriginPath.RandomizeHint"),
            confirmLabel: game.i18n.localize("RT.Confirm"),
            cancelLabel: game.i18n.localize("RT.Cancel")
        });

        if (!confirmed) return;

        if (!this.originPack) {
            ui.notifications.error("Origin Path compendium not found.");
            return;
        }

        // Load all items from pack
        const documents = await this.originPack.getDocuments();

        // Randomize each step
        for (const stepConfig of OriginPathBuilder.STEPS) {
            const stepItems = documents.filter(doc => doc.system.step === stepConfig.step);
            
            if (stepItems.length > 0) {
                const randomItem = stepItems[Math.floor(Math.random() * stepItems.length)];
                this.selections.set(stepConfig.step, randomItem);
            }
        }

        await this.render();
        ui.notifications.info(game.i18n.localize("RT.OriginPath.Randomize") + " complete!");
    }

    /**
     * Reset all selections
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Target element
     * @private
     */
    static async #reset(event, target) {
        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize("RT.OriginPath.Reset"),
            content: game.i18n.localize("RT.OriginPath.ConfirmReset"),
            confirmLabel: game.i18n.localize("RT.Confirm"),
            cancelLabel: game.i18n.localize("RT.Cancel")
        });

        if (!confirmed) return;

        this.selections.clear();
        await this.render();
    }

    /**
     * Export path configuration
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Target element
     * @private
     */
    static async #export(event, target) {
        const exportData = {
            actorId: this.actor.id,
            actorName: this.actor.name,
            selections: {}
        };

        for (const [stepKey, item] of this.selections) {
            exportData.selections[stepKey] = {
                uuid: item.uuid,
                name: item.name,
                selectedChoices: item.system.selectedChoices || {}
            };
        }

        const filename = `origin-path-${this.actor.name.slugify()}.json`;
        saveDataToFile(JSON.stringify(exportData, null, 2), "application/json", filename);
        
        ui.notifications.info("Origin path exported!");
    }

    /**
     * Import path configuration
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Target element
     * @private
     */
    static async #import(event, target) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const text = await file.text();
            let data;
            
            try {
                data = JSON.parse(text);
            } catch (err) {
                ui.notifications.error("Invalid JSON file.");
                return;
            }

            // Load items from UUIDs
            this.selections.clear();
            
            for (const [stepKey, selection] of Object.entries(data.selections || {})) {
                const item = await fromUuid(selection.uuid);
                if (item && item.type === "originPath") {
                    this.selections.set(stepKey, item);
                }
            }

            await this.render();
            ui.notifications.info("Origin path imported!");
        };

        input.click();
    }

    /**
     * Open compendium browser for a specific step
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Target element
     * @private
     */
    static async #openCompendium(event, target) {
        const stepData = target.closest(".origin-step")?.dataset;
        if (!stepData?.step) return;

        const targetStep = stepData.step;

        if (!this.originPack) {
            ui.notifications.error("Origin Path compendium not found.");
            return;
        }

        // Open the compendium
        this.originPack.render(true);
        
        // TODO: If we add a custom compendium browser, we could filter by step here
        ui.notifications.info(`Drag an origin from the compendium into the ${targetStep} slot.`);
    }

    /**
     * View item details
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Target element
     * @private
     */
    static async #viewItem(event, target) {
        const stepData = target.closest(".origin-step")?.dataset;
        if (!stepData?.step) return;

        const item = this.selections.get(stepData.step);
        if (!item) return;

        item.sheet.render(true);
    }

    /**
     * Commit the selected origin path to the character
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Target element
     * @private
     */
    static async #commitPath(event, target) {
        // Validate path is complete
        if (this.selections.size !== 6) {
            ui.notifications.warn("Complete all 6 origin path steps before applying.");
            return;
        }

        // Confirm action
        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize("RT.OriginPath.CommitToCharacter"),
            content: game.i18n.localize("RT.OriginPath.ConfirmCommit"),
            confirmLabel: game.i18n.localize("RT.Confirm"),
            cancelLabel: game.i18n.localize("RT.Cancel")
        });

        if (!confirmed) return;

        // Remove existing origin path items from actor
        const existingOrigins = this.actor.items.filter(i => i.type === "originPath");
        const deleteIds = existingOrigins.map(i => i.id);
        
        if (deleteIds.length > 0) {
            await this.actor.deleteEmbeddedDocuments("Item", deleteIds);
        }

        // Add new origin path items
        const itemDataArray = Array.from(this.selections.values()).map(item => item.toObject());
        const createdItems = await this.actor.createEmbeddedDocuments("Item", itemDataArray);

        // Apply characteristic advances
        const charUpdates = {};
        for (const item of createdItems) {
            const charMods = item.system?.modifiers?.characteristics || {};
            for (const [char, value] of Object.entries(charMods)) {
                if (value !== 0) {
                    const currentAdvance = this.actor.system.characteristics[char]?.advance || 0;
                    const currentTotal = this.actor.system.characteristics[char]?.total || 0;
                    // Add to base rather than advance to preserve purchased advances
                    charUpdates[`system.characteristics.${char}.base`] = 
                        (this.actor.system.characteristics[char]?.base || 0) + value;
                }
            }
        }

        // Apply updates
        if (Object.keys(charUpdates).length > 0) {
            await this.actor.update(charUpdates);
        }

        // Apply skills, talents, traits grants
        const grantedItems = [];
        
        for (const item of createdItems) {
            const grants = item.system?.grants || {};

            // Skills - create or upgrade existing
            for (const skillGrant of grants.skills || []) {
                // Check if skill already exists
                const existingSkill = this.actor.items.find(i => 
                    i.type === "skill" && 
                    i.name.toLowerCase() === skillGrant.name.toLowerCase()
                );

                if (existingSkill) {
                    // Upgrade existing skill
                    const updates = {};
                    if (skillGrant.level === "trained") updates["system.trained"] = true;
                    if (skillGrant.level === "plus10") updates["system.plus10"] = true;
                    if (skillGrant.level === "plus20") updates["system.plus20"] = true;
                    
                    if (Object.keys(updates).length > 0) {
                        await existingSkill.update(updates);
                    }
                } else {
                    // Create new skill item
                    grantedItems.push({
                        type: "skill",
                        name: skillGrant.name,
                        system: {
                            trained: skillGrant.level === "trained" || skillGrant.level === "plus10" || skillGrant.level === "plus20",
                            plus10: skillGrant.level === "plus10" || skillGrant.level === "plus20",
                            plus20: skillGrant.level === "plus20"
                        }
                    });
                }
            }

            // Talents - fetch from compendium if UUID provided
            for (const talentGrant of grants.talents || []) {
                if (talentGrant.uuid) {
                    const doc = await fromUuid(talentGrant.uuid);
                    if (doc) {
                        grantedItems.push(doc.toObject());
                    }
                } else {
                    // Create basic talent item
                    grantedItems.push({
                        type: "talent",
                        name: talentGrant.name,
                        system: {
                            specialization: talentGrant.specialization || ""
                        }
                    });
                }
            }

            // Traits - similar to talents
            for (const traitGrant of grants.traits || []) {
                if (traitGrant.uuid) {
                    const doc = await fromUuid(traitGrant.uuid);
                    if (doc) {
                        grantedItems.push(doc.toObject());
                    }
                } else {
                    grantedItems.push({
                        type: "trait",
                        name: traitGrant.name
                    });
                }
            }

            // Equipment - fetch from compendium
            for (const equipGrant of grants.equipment || []) {
                if (equipGrant.uuid) {
                    const doc = await fromUuid(equipGrant.uuid);
                    if (doc) {
                        const itemData = doc.toObject();
                        if (equipGrant.quantity > 1) {
                            itemData.system.quantity = equipGrant.quantity;
                        }
                        grantedItems.push(itemData);
                    }
                }
            }
        }

        // Create granted items
        if (grantedItems.length > 0) {
            await this.actor.createEmbeddedDocuments("Item", grantedItems);
        }

        ui.notifications.info(game.i18n.localize("RT.OriginPath.CommitSuccess"));
        this.close();
    }

    /**
     * Form submit handler (if needed)
     * @param {Event} event - The form submit event
     * @param {HTMLFormElement} form - The form element
     * @param {FormDataExtended} formData - The form data
     * @private
     */
    static async #onFormSubmit(event, form, formData) {
        // No-op for now
    }

    /* -------------------------------------------- */
    /*  Factory Methods                             */
    /* -------------------------------------------- */

    /**
     * Show the origin path builder for an actor
     * @param {Actor} actor - The character actor
     * @returns {OriginPathBuilder}
     */
    static show(actor) {
        // Check if builder already exists for this actor
        const existingBuilder = Object.values(ui.windows).find(
            w => w instanceof OriginPathBuilder && w.actor.id === actor.id
        );

        if (existingBuilder) {
            existingBuilder.bringToFront();
            return existingBuilder;
        }

        // Create new builder
        const builder = new OriginPathBuilder(actor);
        builder.render(true);
        return builder;
    }

    /**
     * Close origin path builder for an actor
     * @param {Actor} actor - The character actor
     */
    static close(actor) {
        const existingBuilder = Object.values(ui.windows).find(
            w => w instanceof OriginPathBuilder && w.actor.id === actor.id
        );
        
        if (existingBuilder) {
            existingBuilder.close();
        }
    }

    /**
     * Toggle origin path builder for an actor
     * @param {Actor} actor - The character actor
     * @returns {OriginPathBuilder|null}
     */
    static toggle(actor) {
        const existingBuilder = Object.values(ui.windows).find(
            w => w instanceof OriginPathBuilder && w.actor.id === actor.id
        );

        if (existingBuilder) {
            existingBuilder.close();
            return null;
        } else {
            return OriginPathBuilder.show(actor);
        }
    }
}
