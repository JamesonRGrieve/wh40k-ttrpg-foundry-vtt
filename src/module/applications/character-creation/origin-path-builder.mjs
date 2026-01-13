/**
 * Origin Path Builder - Refactored Design
 * 
 * Step-by-step character creation interface with:
 * - Click to view details, confirm to select
 * - Bidirectional navigation (Forward from Home World OR Backward from Career)
 * - Optional lineage step at the end
 * - Choice and roll management
 * - Live preview of accumulated bonuses
 */

import { OriginChartLayout } from "../../utils/origin-chart-layout.mjs";
import { OriginGrantsProcessor } from "../../utils/origin-grants-processor.mjs";
import OriginPathChoiceDialog from "./origin-path-choice-dialog.mjs";
import OriginRollDialog from "./origin-roll-dialog.mjs";
import OriginDetailDialog from "./origin-detail-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Core steps (1-6) - these are the required origin path steps
 */
const CORE_STEPS = [
    { key: "homeWorld", step: "homeWorld", icon: "fa-globe", descKey: "HomeWorldDesc", stepIndex: 1 },
    { key: "birthright", step: "birthright", icon: "fa-baby", descKey: "BirthrightDesc", stepIndex: 2 },
    { key: "lureOfTheVoid", step: "lureOfTheVoid", icon: "fa-meteor", descKey: "LureDesc", stepIndex: 3 },
    { key: "trialsAndTravails", step: "trialsAndTravails", icon: "fa-skull", descKey: "TrialsDesc", stepIndex: 4 },
    { key: "motivation", step: "motivation", icon: "fa-fire", descKey: "MotivationDesc", stepIndex: 5 },
    { key: "career", step: "career", icon: "fa-user-tie", descKey: "CareerDesc", stepIndex: 6 }
];

/**
 * Lineage step - optional, shown at the end
 */
const LINEAGE_STEP = { key: "lineage", step: "lineage", icon: "fa-crown", descKey: "LineageDesc", stepIndex: 7 };

/**
 * Direction modes for origin path creation
 */
const DIRECTION = {
    FORWARD: "forward",   // Start at Home World, end at Career
    BACKWARD: "backward"  // Start at Career, end at Home World
};

/**
 * Legacy compatibility alias - some code may reference STEPS directly
 */
const STEPS = CORE_STEPS;

export default class OriginPathBuilder extends HandlebarsApplicationMixin(ApplicationV2) {

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "origin-path-builder",
        classes: ["rogue-trader", "origin-path-builder"],
        tag: "div",
        window: {
            title: "RT.OriginPath.BuilderTitle",
            icon: "fa-solid fa-route",
            resizable: true,
            minimizable: true
        },
        position: {
            width: 1100,
            height: 800
        },
        actions: {
            randomize: OriginPathBuilder.#randomize,
            reset: OriginPathBuilder.#reset,
            export: OriginPathBuilder.#export,
            import: OriginPathBuilder.#import,
            setMode: OriginPathBuilder.#setMode,
            setDirection: OriginPathBuilder.#setDirection,
            goToStep: OriginPathBuilder.#goToStep,
            selectOriginCard: OriginPathBuilder.#previewOriginCard,  // Changed: preview instead of select
            viewOriginCard: OriginPathBuilder.#viewOriginCard,
            viewOrigin: OriginPathBuilder.#viewOrigin,
            confirmSelection: OriginPathBuilder.#confirmSelection,  // New: confirm and advance
            clearOrigin: OriginPathBuilder.#clearOrigin,
            editChoice: OriginPathBuilder.#editChoice,
            rollStat: OriginPathBuilder.#rollStat,
            manualStat: OriginPathBuilder.#manualStat,
            goToLineage: OriginPathBuilder.#goToLineage,
            skipLineage: OriginPathBuilder.#skipLineage,
            commit: OriginPathBuilder.#commit,
            openItem: OriginPathBuilder.#openItem
        }
    };

    /** @override */
    static PARTS = {
        main: {
            template: "systems/rogue-trader/templates/character-creation/origin-path-builder.hbs"
        }
    };

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * @param {Actor} actor - The character actor
     * @param {object} options - Application options
     */
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this.currentStepIndex = 0;
        this.guidedMode = true;
        this.direction = DIRECTION.FORWARD; // Forward or backward
        this.showLineage = false; // Whether we're on the lineage step
        this.selections = new Map(); // step -> Item (confirmed selections)
        this.previewedOrigin = null; // Currently previewed origin (unconfirmed)
        this.lineageSelection = null; // Separate storage for lineage
        this.allOrigins = []; // All origins from compendium (excluding lineage)
        this.lineageOrigins = []; // Lineage origins (stepIndex: 7)
        
        // Initialize from actor's existing origin paths
        this._initializeFromActor();
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get title() {
        return game.i18n.format("RT.OriginPath.BuilderTitle", { name: this.actor.name });
    }

    /**
     * Get the current ordered steps based on direction
     * @type {Array}
     */
    get orderedSteps() {
        if (this.direction === DIRECTION.BACKWARD) {
            return [...CORE_STEPS].reverse();
        }
        return CORE_STEPS;
    }

    /**
     * Get the current step config
     * @type {object}
     */
    get currentStep() {
        if (this.showLineage) {
            return LINEAGE_STEP;
        }
        return this.orderedSteps[this.currentStepIndex];
    }

    /* -------------------------------------------- */
    /*  Factory Method                              */
    /* -------------------------------------------- */

    /**
     * Show the Origin Path Builder for an actor
     * @param {Actor} actor - The actor to build origin path for
     * @param {object} options - Additional options
     * @returns {OriginPathBuilder} The builder instance
     */
    static show(actor, options = {}) {
        const builder = new OriginPathBuilder(actor, options);
        builder.render(true);
        return builder;
    }

    /* -------------------------------------------- */
    /*  Initialization                              */
    /* -------------------------------------------- */

    /**
     * Initialize selections from actor's existing origin paths
     * Converts Items to plain data objects for safe manipulation
     * @private
     */
    _initializeFromActor() {
        const originItems = this.actor.items.filter(i => i.type === "originPath");
        for (const item of originItems) {
            const step = item.system?.step;
            // Store as plain data objects with metadata for tracking
            const originData = this._itemToSelectionData(item);
            if (step === "lineage") {
                this.lineageSelection = originData;
            } else if (step) {
                this.selections.set(step, originData);
            }
        }
        
        // Set current step to first incomplete based on direction
        const steps = this.orderedSteps;
        for (let i = 0; i < steps.length; i++) {
            if (!this.selections.has(steps[i].step)) {
                this.currentStepIndex = i;
                break;
            }
        }
    }

    /**
     * Convert an Item or compendium entry to a selection data object
     * @param {Item} item - The item to convert
     * @returns {object} - Plain data object for selection storage
     * @private
     */
    _itemToSelectionData(item) {
        const data = item.toObject ? item.toObject() : foundry.utils.deepClone(item);
        // Store original uuid for reference to compendium item
        data._sourceUuid = item.uuid || data._sourceUuid;
        // Store actor item id if this is an existing actor item
        data._actorItemId = item.parent === this.actor ? item.id : null;
        // Ensure we have the system data in a mutable form
        if (!data.system) data.system = {};
        if (!data.system.selectedChoices) data.system.selectedChoices = {};
        if (!data.system.rollResults) data.system.rollResults = {};
        return data;
    }

    /**
     * Get system data from a selection (handles both Item and plain object)
     * @param {Item|object} selection - The selection (Item or data object)
     * @returns {object} - The system data
     * @private
     */
    _getSelectionSystem(selection) {
        if (!selection) return {};
        // For Item instances
        if (selection.system) return selection.system;
        // For plain data objects
        return selection.system || {};
    }

    /**
     * Load all origins from compendium
     * @private
     */
    async _loadOrigins() {
        if (this.allOrigins.length > 0 && this.lineageOrigins.length > 0) return;
        
        // Find origin path compendium
        const pack = game.packs.find(p => p.metadata.name === "rt-items-origin-path");
        if (!pack) {
            console.warn("Origin path compendium not found");
            return;
        }
        
        const documents = await pack.getDocuments();
        const allOriginPaths = documents.filter(d => d.type === "originPath");
        
        // Separate lineage origins (stepIndex: 7) from core origins
        this.allOrigins = allOriginPaths.filter(o => o.system?.stepIndex !== 7);
        this.lineageOrigins = allOriginPaths.filter(o => o.system?.stepIndex === 7);
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        await this._loadOrigins();
        
        const currentStep = this.currentStep;
        const orderedSteps = this.orderedSteps;
        
        // Get origins for current step
        let currentOrigins = [];
        let selectedItem = null;
        
        if (this.showLineage) {
            // Show all lineage options (they can pick any regardless of path)
            currentOrigins = this._prepareLineageOrigins();
            selectedItem = this.lineageSelection;
        } else {
            // Use chart layout for core steps - pass direction for correct connectivity
            const chartLayout = OriginChartLayout.computeFullChart(
                this.allOrigins,
                this.selections,
                this.guidedMode,
                this.direction  // Pass direction for bidirectional navigation support
            );
            
            // Find the step layout matching current step
            const stepIndex = CORE_STEPS.findIndex(s => s.key === currentStep.key);
            const stepLayout = chartLayout.steps[stepIndex];
            currentOrigins = this._prepareOriginsForStep(stepLayout);
            // Use previewed origin if available, otherwise use confirmed selection
            selectedItem = this.previewedOrigin || this.selections.get(currentStep.step);
        }
        
        const selectedOrigin = selectedItem ? await this._prepareSelectedOrigin(selectedItem) : null;
        
        return {
            actor: this.actor,
            guidedMode: this.guidedMode,
            direction: this.direction,
            isForward: this.direction === DIRECTION.FORWARD,
            isBackward: this.direction === DIRECTION.BACKWARD,
            showLineage: this.showLineage,
            currentStepIndex: this.currentStepIndex,
            
            // Direction labels
            directionLabels: {
                forward: game.i18n.localize("RT.OriginPath.DirectionForward"),
                backward: game.i18n.localize("RT.OriginPath.DirectionBackward")
            },
            
            // Step navigation
            steps: this._prepareStepNavigation(),
            
            // Current step content
            currentStep: {
                index: this.currentStepIndex,
                key: currentStep.key,
                label: this._getLocalizedStepLabel(currentStep.key),
                icon: currentStep.icon,
                description: this._getLocalizedStepDescription(currentStep.descKey),
                origins: currentOrigins,
                isLineage: this.showLineage
            },
            
            // Selected origin details
            selectedOrigin: selectedOrigin,
            
            // Lineage info
            hasLineageSelection: !!this.lineageSelection,
            lineageSelection: this.lineageSelection ? {
                name: this.lineageSelection.name,
                img: this.lineageSelection.img
            } : null,
            
            // Total preview
            preview: await this._calculatePreview(),
            
            // Status
            status: this._calculateStatus()
        };
    }

    /**
     * Get localized step label
     * @param {string} key
     * @returns {string}
     * @private
     */
    _getLocalizedStepLabel(key) {
        const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
        return game.i18n.localize(`RT.OriginPath.${capitalizedKey}`);
    }

    /**
     * Get localized step description
     * @param {string} descKey
     * @returns {string}
     * @private
     */
    _getLocalizedStepDescription(descKey) {
        if (!descKey) return "";
        return game.i18n.localize(`RT.OriginPath.${descKey}`);
    }

    /**
     * Prepare lineage origins (no position restrictions)
     * @returns {Array}
     * @private
     */
    _prepareLineageOrigins() {
        return this.lineageOrigins.map(origin => {
            const description = origin.system?.description?.value || "";
            const shortDesc = this._stripHtml(description).substring(0, 150);
            
            return {
                id: origin.id,
                uuid: origin.uuid,
                name: origin.name,
                img: origin.img,
                shortDescription: shortDesc + (shortDesc.length >= 150 ? "..." : ""),
                isSelected: this.lineageSelection?.id === origin.id,
                isDisabled: false,
                isValidNext: true, // All lineage options are always valid
                hasChoices: origin.system?.hasChoices || origin.system?.grants?.choices?.length > 0,
                isAdvanced: origin.system?.isAdvancedOrigin || false,
                xpCost: origin.system?.xpCost || 0,
                badges: true
            };
        });
    }

    /**
     * Strip HTML tags from text
     * @param {string} html
     * @returns {string}
     * @private
     */
    _stripHtml(html) {
        const div = document.createElement("div");
        div.innerHTML = html;
        return div.textContent || div.innerText || "";
    }

    /**
     * Prepare step navigation data
     * @returns {Array}
     * @private
     */
    _prepareStepNavigation() {
        const orderedSteps = this.orderedSteps;
        
        return orderedSteps.map((step, index) => {
            const hasSelection = this.selections.has(step.step);
            const isAccessible = this._isStepAccessible(index);
            const selection = hasSelection ? this.selections.get(step.step) : null;
            
            return {
                index: index,
                key: step.key,
                label: this._getLocalizedStepLabel(step.key),
                shortLabel: this._getShortLabel(step.key),
                icon: step.icon,
                isActive: !this.showLineage && index === this.currentStepIndex,
                isComplete: hasSelection,
                isDisabled: this.guidedMode && !isAccessible,
                selection: selection ? {
                    name: selection.name,
                    img: selection.img
                } : null
            };
        });
    }

    /**
     * Check if a step is accessible in guided mode
     * @param {number} stepIndex
     * @returns {boolean}
     * @private
     */
    _isStepAccessible(stepIndex) {
        if (!this.guidedMode) return true;
        if (stepIndex === 0) return true;
        
        const orderedSteps = this.orderedSteps;
        const prevStep = orderedSteps[stepIndex - 1];
        return this.selections.has(prevStep.step);
    }

    /**
     * Get short label for step
     * @param {string} key
     * @returns {string}
     * @private
     */
    _getShortLabel(key) {
        const labels = {
            homeWorld: "World",
            birthright: "Birth",
            lureOfTheVoid: "Lure",
            trialsAndTravails: "Trials",
            motivation: "Motive",
            career: "Career",
            lineage: "Lineage"
        };
        return labels[key] || key;
    }

    /**
     * Prepare origins for current step
     * @param {object} stepLayout - Layout data from OriginChartLayout
     * @returns {Array}
     * @private
     */
    _prepareOriginsForStep(stepLayout) {
        if (!stepLayout?.cards) return [];
        
        return stepLayout.cards.map(card => {
            const origin = card.origin;
            const description = origin.system?.description?.value || "";
            const shortDesc = this._stripHtml(description).substring(0, 100);
            
            return {
                id: origin.id,
                uuid: origin.uuid,
                name: origin.name,
                img: origin.img,
                shortDescription: shortDesc + (shortDesc.length >= 100 ? "..." : ""),
                isSelected: card.isSelected,
                isDisabled: card.isDisabled,
                isValidNext: card.isValidNext && !card.isSelected,
                hasChoices: card.hasChoices || origin.system?.grants?.choices?.length > 0,
                isAdvanced: card.isAdvanced,
                xpCost: card.xpCost,
                badges: card.hasChoices || card.isAdvanced || card.xpCost > 0
            };
        });
    }

    /**
     * Prepare selected origin for detail panel
     * @param {Item|object} item - Item instance or plain data object
     * @returns {Promise<object>}
     * @private
     */
    async _prepareSelectedOrigin(item) {
        // Handle both Item instances and plain data objects
        const system = this._getSelectionSystem(item);
        const grants = system?.grants || {};
        const modifiers = system?.modifiers?.characteristics || {};
        
        // Prepare characteristics with proper labels
        const charLabels = {
            weaponSkill: { label: "Weapon Skill", short: "WS" },
            ballisticSkill: { label: "Ballistic Skill", short: "BS" },
            strength: { label: "Strength", short: "S" },
            toughness: { label: "Toughness", short: "T" },
            agility: { label: "Agility", short: "Ag" },
            intelligence: { label: "Intelligence", short: "Int" },
            perception: { label: "Perception", short: "Per" },
            willpower: { label: "Willpower", short: "WP" },
            fellowship: { label: "Fellowship", short: "Fel" },
            influence: { label: "Influence", short: "Inf" }
        };
        
        const characteristics = [];
        for (const [key, value] of Object.entries(modifiers)) {
            if (value !== 0) {
                const info = charLabels[key] || { label: key, short: key.substring(0, 3).toUpperCase() };
                characteristics.push({
                    key: key,
                    label: info.label,
                    short: info.short,
                    value: value,
                    positive: value > 0
                });
            }
        }
        
        // Prepare choices with detailed info
        const choices = [];
        const selectedChoices = system?.selectedChoices || {};
        if (grants.choices?.length > 0) {
            for (const choice of grants.choices) {
                const selection = selectedChoices[choice.label];
                const selectedLabels = [];
                if (selection && Array.isArray(selection)) {
                    for (const sel of selection) {
                        const option = choice.options?.find(o => o.value === sel);
                        selectedLabels.push(option?.label || sel);
                    }
                }
                choices.push({
                    type: choice.type,
                    typeLabel: this._getChoiceTypeLabel(choice.type),
                    label: choice.label,
                    count: choice.count || 1,
                    options: choice.options || [],
                    isComplete: selection && selection.length >= (choice.count || 1),
                    selection: selectedLabels.length > 0 ? selectedLabels.join(", ") : null
                });
            }
        }
        
        // Prepare rolls with manual input support
        const rolls = {};
        const rollResults = system?.rollResults || {};
        
        if (grants.woundsFormula) {
            const hasRolled = rollResults.wounds?.rolled !== undefined && rollResults.wounds?.rolled !== null;
            rolls.wounds = {
                formula: grants.woundsFormula,
                hasValue: hasRolled,
                value: rollResults.wounds?.rolled,
                breakdown: rollResults.wounds?.breakdown || ""
            };
        }
        
        if (grants.fateFormula) {
            const hasRolled = rollResults.fate?.rolled !== undefined && rollResults.fate?.rolled !== null;
            rolls.fate = {
                formula: grants.fateFormula,
                hasValue: hasRolled,
                value: rollResults.fate?.rolled,
                breakdown: rollResults.fate?.breakdown || ""
            };
        }
        
        // Prepare skills with tooltips and UUIDs
        const skills = [];
        for (const skill of (grants.skills || [])) {
            const displayName = skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name;
            skills.push({
                name: skill.name,
                specialization: skill.specialization || null,
                displayName: displayName,
                level: skill.level || "trained",
                levelLabel: this._getTrainingLabel(skill.level),
                uuid: await this._findSkillUuid(skill.name, skill.specialization)
            });
        }
        
        // Prepare talents with item lookup for tooltips
        const talents = await this._prepareTalentsWithTooltips(grants.talents || []);
        
        // Prepare traits with item lookup
        const traits = await this._prepareTraitsWithTooltips(grants.traits || []);
        
        // Check if this is a confirmed selection or just previewed
        // Handle both Item instances and plain data objects
        const currentStep = this.currentStep;
        const itemId = item._id || item.id;
        let isConfirmed = false;
        if (this.showLineage) {
            const lineageId = this.lineageSelection?._id || this.lineageSelection?.id;
            isConfirmed = lineageId === itemId;
        } else {
            const selection = this.selections.get(currentStep.step);
            const selectionId = selection?._id || selection?.id;
            isConfirmed = selectionId === itemId;
        }
        
        return {
            id: itemId,
            uuid: item.uuid || item._sourceUuid,
            name: item.name,
            img: item.img,
            description: system?.description?.value || "",
            isConfirmed: isConfirmed,  // Track if confirmed vs previewed
            hasChoices: choices.length > 0,
            choices: choices,
            hasRolls: Object.keys(rolls).length > 0,
            rolls: rolls,
            grants: {
                characteristics: characteristics,
                hasCharacteristics: characteristics.length > 0,
                skills: skills,
                hasSkills: skills.length > 0,
                talents: talents,
                hasTalents: talents.length > 0,
                traits: traits,
                hasTraits: traits.length > 0,
                equipment: grants.equipment || [],
                hasEquipment: (grants.equipment || []).length > 0
            }
        };
    }

    /**
     * Prepare talents with tooltip information
     * @param {Array} talents
     * @returns {Promise<Array>}
     * @private
     */
    async _prepareTalentsWithTooltips(talents) {
        const prepared = [];
        for (const talent of talents) {
            let tooltipText = talent.name;
            let hasItem = false;
            
            if (talent.uuid) {
                try {
                    const item = await fromUuid(talent.uuid);
                    if (item) {
                        hasItem = true;
                        const desc = item.system?.description?.value;
                        if (desc) {
                            tooltipText = this._stripHtml(desc).substring(0, 200);
                            if (tooltipText.length >= 200) tooltipText += "...";
                        }
                    }
                } catch (e) {
                    // Item not found, use name
                }
            }
            
            prepared.push({
                name: talent.name,
                specialization: talent.specialization || null,
                uuid: talent.uuid || null,
                tooltip: tooltipText,
                hasItem: hasItem
            });
        }
        return prepared;
    }

    /**
     * Prepare traits with tooltip information
     * @param {Array} traits
     * @returns {Promise<Array>}
     * @private
     */
    async _prepareTraitsWithTooltips(traits) {
        const prepared = [];
        for (const trait of traits) {
            let tooltipText = trait.name;
            let hasItem = false;
            
            if (trait.uuid) {
                try {
                    const item = await fromUuid(trait.uuid);
                    if (item) {
                        hasItem = true;
                        const desc = item.system?.description?.value;
                        if (desc) {
                            tooltipText = this._stripHtml(desc).substring(0, 200);
                            if (tooltipText.length >= 200) tooltipText += "...";
                        }
                    }
                } catch (e) {
                    // Item not found
                }
            }
            
            prepared.push({
                name: trait.name,
                level: trait.level || null,
                uuid: trait.uuid || null,
                tooltip: tooltipText,
                hasItem: hasItem
            });
        }
        return prepared;
    }

    /**
     * Get training level label
     * @param {string} level
     * @returns {string}
     * @private
     */
    _getTrainingLabel(level) {
        const labels = { trained: "Trained", plus10: "+10", plus20: "+20" };
        return labels[level] || level || "Trained";
    }

    /**
     * Get choice type label
     * @param {string} type
     * @returns {string}
     * @private
     */
    _getChoiceTypeLabel(type) {
        const labels = {
            talent: "Talent",
            skill: "Skill",
            characteristic: "Characteristic",
            equipment: "Equipment",
            trait: "Trait"
        };
        return labels[type] || type || "Choice";
    }

    /**
     * Calculate total preview of all selections
     * @returns {object}
     * @private
     */
    async _calculatePreview() {
        const preview = {
            characteristics: [],
            skills: [],
            talents: [],
            traits: [],
            equipment: [],
            wounds: null,
            fate: null
        };
        
        const charTotals = {};
        const skillMap = new Map(); // name -> {name, uuid}
        const talentMap = new Map(); // name -> {name, uuid}
        const traitMap = new Map(); // name -> {name, uuid}
        const equipmentList = [];
        
        for (const [step, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            const grants = system?.grants || {};
            const modifiers = system?.modifiers?.characteristics || {};
            const selectedChoices = system?.selectedChoices || {};
            
            // Accumulate base characteristics from modifiers
            for (const [key, value] of Object.entries(modifiers)) {
                if (value !== 0) {
                    charTotals[key] = (charTotals[key] || 0) + value;
                }
            }
            
            // Collect base skills with UUIDs
            if (grants.skills) {
                for (const skill of grants.skills) {
                    const skillName = skill.specialization 
                        ? `${skill.name} (${skill.specialization})`
                        : (skill.name || skill);
                    if (!skillMap.has(skillName)) {
                        skillMap.set(skillName, {
                            name: skillName,
                            uuid: await this._findSkillUuid(skill.name, skill.specialization)
                        });
                    }
                }
            }
            
            // Collect base talents with UUIDs
            if (grants.talents) {
                for (const talent of grants.talents) {
                    const talentName = talent.name || talent;
                    if (!talentMap.has(talentName)) {
                        talentMap.set(talentName, {
                            name: talentName,
                            uuid: talent.uuid || null
                        });
                    }
                    
                    // Look up talent modifiers from UUID if available
                    if (talent.uuid) {
                        await this._addTalentModifiers(talent.uuid, charTotals, skillMap);
                    }
                }
            }
            
            // Collect base traits with UUIDs
            if (grants.traits) {
                for (const trait of grants.traits) {
                    const traitName = trait.name || trait;
                    if (!traitMap.has(traitName)) {
                        traitMap.set(traitName, {
                            name: traitName,
                            uuid: trait.uuid || null
                        });
                    }
                }
            }
            
            // Collect base equipment
            if (grants.equipment) {
                for (const item of grants.equipment) {
                    equipmentList.push(item.name || item);
                }
            }
            
            // Process choice grants
            if (grants.choices && grants.choices.length > 0) {
                for (const choice of grants.choices) {
                    const selectedValues = selectedChoices[choice.label] || [];
                    for (const selectedValue of selectedValues) {
                        const option = choice.options?.find(o => o.value === selectedValue);
                        if (!option?.grants) continue;
                        
                        const choiceGrants = option.grants;
                        
                        // Choice characteristic bonuses
                        if (choiceGrants.characteristics) {
                            for (const [key, value] of Object.entries(choiceGrants.characteristics)) {
                                if (value !== 0) {
                                    charTotals[key] = (charTotals[key] || 0) + value;
                                }
                            }
                        }
                        
                        // Choice skills with UUIDs
                        if (choiceGrants.skills) {
                            for (const skill of choiceGrants.skills) {
                                const skillName = skill.specialization 
                                    ? `${skill.name} (${skill.specialization})`
                                    : (skill.name || skill);
                                if (!skillMap.has(skillName)) {
                                    skillMap.set(skillName, {
                                        name: skillName,
                                        uuid: await this._findSkillUuid(skill.name, skill.specialization),
                                        fromChoice: true
                                    });
                                }
                            }
                        }
                        
                        // Choice talents with UUIDs
                        if (choiceGrants.talents) {
                            for (const talent of choiceGrants.talents) {
                                const talentName = talent.name || talent;
                                if (!talentMap.has(talentName)) {
                                    talentMap.set(talentName, {
                                        name: talentName,
                                        uuid: talent.uuid || null,
                                        fromChoice: true
                                    });
                                }
                                
                                // Look up talent modifiers from UUID if available
                                if (talent.uuid) {
                                    await this._addTalentModifiers(talent.uuid, charTotals, skillMap);
                                }
                            }
                        }
                        
                        // Choice traits with UUIDs
                        if (choiceGrants.traits) {
                            for (const trait of choiceGrants.traits) {
                                const traitName = trait.name || trait;
                                if (!traitMap.has(traitName)) {
                                    traitMap.set(traitName, {
                                        name: traitName,
                                        uuid: trait.uuid || null,
                                        fromChoice: true
                                    });
                                }
                            }
                        }
                        
                        // Choice equipment
                        if (choiceGrants.equipment) {
                            for (const item of choiceGrants.equipment) {
                                equipmentList.push(item.name || item);
                            }
                        }
                    }
                }
            }
            
            // Get wounds/fate from roll results
            const rollResults = system?.rollResults || {};
            if (rollResults.wounds?.rolled !== undefined && rollResults.wounds?.rolled !== null) {
                preview.wounds = (preview.wounds || 0) + rollResults.wounds.rolled;
            }
            if (rollResults.fate?.rolled !== undefined && rollResults.fate?.rolled !== null) {
                preview.fate = (preview.fate || 0) + rollResults.fate.rolled;
            }
        }
        
        // Convert char totals to array
        const charShorts = {
            weaponSkill: "WS", ballisticSkill: "BS", strength: "S", toughness: "T",
            agility: "Ag", intelligence: "Int", perception: "Per", willpower: "WP",
            fellowship: "Fel", influence: "Inf"
        };
        
        for (const [key, value] of Object.entries(charTotals)) {
            preview.characteristics.push({
                key: key,
                short: charShorts[key] || key.substring(0, 3).toUpperCase(),
                value: value
            });
        }
        
        // Convert maps to arrays (preserving UUIDs)
        preview.skills = Array.from(skillMap.values());
        preview.talents = Array.from(talentMap.values());
        preview.traits = Array.from(traitMap.values());
        preview.equipment = equipmentList.map(name => ({ name }));
        
        return preview;
    }
    
    /**
     * Find skill UUID by looking up in compendium
     * @param {string} skillName
     * @param {string} specialization
     * @returns {Promise<string|null>}
     * @private
     */
    async _findSkillUuid(skillName, specialization = null) {
        try {
            const skillPack = game.packs.find(p => p.metadata.name === "rt-items-skills");
            if (!skillPack) return null;
            
            const index = skillPack.index;
            const searchName = specialization ? `${skillName} (${specialization})` : skillName;
            
            // Try exact match first
            for (const [id, entry] of index.entries()) {
                if (entry.name === searchName || entry.name === skillName) {
                    return `Compendium.${skillPack.metadata.id}.${id}`;
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Look up a talent by UUID and add its modifiers to the totals
     * @param {string} uuid - Compendium UUID for the talent
     * @param {object} charTotals - Characteristic totals accumulator
     * @param {Map} skillMap - Skill map accumulator (name -> {name, uuid})
     * @returns {Promise<void>}
     * @private
     */
    async _addTalentModifiers(uuid, charTotals, skillMap) {
        try {
            const talent = await fromUuid(uuid);
            if (!talent) return;
            
            const talentSystem = talent.system;
            
            // Add characteristic modifiers from talent
            const charMods = talentSystem?.modifiers?.characteristics || {};
            for (const [key, value] of Object.entries(charMods)) {
                if (value !== 0) {
                    charTotals[key] = (charTotals[key] || 0) + value;
                }
            }
            
            // Add skill modifiers from talent grants (e.g., nested skills)
            const talentGrants = talentSystem?.grants || {};
            if (talentGrants.skills) {
                for (const skill of talentGrants.skills) {
                    const skillName = skill.specialization 
                        ? `${skill.name} (${skill.specialization})`
                        : (skill.name || skill);
                    if (!skillMap.has(skillName)) {
                        skillMap.set(skillName, {
                            name: skillName,
                            uuid: await this._findSkillUuid(skill.name, skill.specialization)
                        });
                    }
                }
            }
            
            // Recursively process nested talents (e.g., Enemy grants from Hunted talent)
            if (talentGrants.talents) {
                for (const nestedTalent of talentGrants.talents) {
                    if (nestedTalent.uuid) {
                        await this._addTalentModifiers(nestedTalent.uuid, charTotals, skillMap);
                    }
                }
            }
        } catch (error) {
            console.warn(`OriginPathBuilder | Failed to resolve talent UUID ${uuid}:`, error);
        }
    }

    /**
     * Calculate status for footer
     * @returns {object}
     * @private
     */
    _calculateStatus() {
        let stepsCount = this.selections.size;
        let pendingChoices = 0;
        let pendingRolls = 0;
        
        for (const [step, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            const grants = system?.grants || {};
            const selectedChoices = system?.selectedChoices || {};
            const rollResults = system?.rollResults || {};
            
            // Count pending choices
            if (grants.choices?.length > 0) {
                for (const choice of grants.choices) {
                    const selection = selectedChoices[choice.label];
                    if (!selection || selection.length < (choice.count || 1)) {
                        pendingChoices++;
                    }
                }
            }
            
            // Count pending rolls
            if (grants.woundsFormula && (rollResults.wounds?.rolled === undefined || rollResults.wounds?.rolled === null)) {
                pendingRolls++;
            }
            if (grants.fateFormula && (rollResults.fate?.rolled === undefined || rollResults.fate?.rolled === null)) {
                pendingRolls++;
            }
        }
        
        return {
            stepsCount: stepsCount,
            stepsComplete: stepsCount === 6,
            choicesComplete: pendingChoices === 0,
            pendingChoices: pendingChoices,
            pendingRolls: pendingRolls,
            canCommit: stepsCount === 6 && pendingChoices === 0
        };
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Randomize all selections
     */
    static async #randomize(event, target) {
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("RT.OriginPath.Randomize"),
            content: game.i18n.localize("RT.OriginPath.RandomizeConfirm")
        });
        
        if (!confirmed) return;
        
        // Clear and randomize
        this.selections.clear();
        
        const chartLayout = OriginChartLayout.computeFullChart(this.allOrigins, this.selections, false);
        
        for (let i = 0; i < STEPS.length; i++) {
            const stepLayout = chartLayout.steps[i];
            const validOrigins = stepLayout.cards.filter(c => c.isSelectable);
            
            if (validOrigins.length > 0) {
                const randomIndex = Math.floor(Math.random() * validOrigins.length);
                const selected = validOrigins[randomIndex];
                
                // Store as plain data object (not Item instance)
                const originData = this._itemToSelectionData(selected.origin);
                this.selections.set(STEPS[i].step, originData);
            }
        }
        
        this.currentStepIndex = 0;
        this.render();
    }

    /**
     * Reset all selections
     */
    static async #reset(event, target) {
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("RT.OriginPath.Reset"),
            content: game.i18n.localize("RT.OriginPath.ConfirmReset")
        });
        
        if (!confirmed) return;
        
        this.selections.clear();
        this.currentStepIndex = 0;
        this.render();
    }

    /**
     * Export path configuration
     */
    static async #export(event, target) {
        const data = {
            version: 1,
            selections: {}
        };
        
        for (const [step, selection] of this.selections) {
            const system = this._getSelectionSystem(selection);
            data.selections[step] = {
                uuid: selection.uuid || selection._sourceUuid,
                name: selection.name,
                selectedChoices: system?.selectedChoices || {},
                rollResults: system?.rollResults || {}
            };
        }
        
        const filename = `${this.actor.name}-origin-path.json`;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        
        URL.revokeObjectURL(url);
        ui.notifications.info(game.i18n.localize("RT.OriginPath.ExportSuccess"));
    }

    /**
     * Import path configuration
     */
    static async #import(event, target) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        
        input.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (data.version !== 1) {
                    throw new Error("Unsupported version");
                }
                
                this.selections.clear();
                
                for (const [step, selData] of Object.entries(data.selections)) {
                    const origin = await fromUuid(selData.uuid);
                    if (origin) {
                        // Store as plain data object (not Item instance)
                        const originData = this._itemToSelectionData(origin);
                        originData.system.selectedChoices = selData.selectedChoices;
                        originData.system.rollResults = selData.rollResults;
                        this.selections.set(step, originData);
                    }
                }
                
                this.currentStepIndex = 0;
                this.render();
                ui.notifications.info(game.i18n.localize("RT.OriginPath.ImportSuccess"));
            } catch (err) {
                console.error("Import failed:", err);
                ui.notifications.error(game.i18n.localize("RT.OriginPath.ImportFailed"));
            }
        });
        
        input.click();
    }

    /**
     * Set guided/free mode
     */
    static async #setMode(event, target) {
        const value = target.value || target.closest("[data-action]")?.querySelector("input")?.value;
        this.guidedMode = value === "guided";
        this.render();
    }

    /**
     * Set direction (forward/backward)
     */
    static async #setDirection(event, target) {
        const value = target.value || target.dataset.direction;
        if (value === "forward" || value === "backward") {
            const oldDirection = this.direction;
            this.direction = value;
            
            // If direction changed and we have selections, warn about reset
            if (oldDirection !== this.direction && this.selections.size > 0) {
                const confirmed = await Dialog.confirm({
                    title: game.i18n.localize("RT.OriginPath.DirectionChange"),
                    content: game.i18n.localize("RT.OriginPath.DirectionChangeWarning")
                });
                
                if (!confirmed) {
                    this.direction = oldDirection;
                    this.render();
                    return;
                }
                
                // Reset selections when changing direction
                this.selections.clear();
                this.currentStepIndex = 0;
            }
            
            this.render();
        }
    }

    /**
     * Navigate to a step
     */
    static async #goToStep(event, target) {
        const stepIndex = parseInt(target.dataset.stepIndex);
        if (isNaN(stepIndex)) return;
        
        // Turn off lineage mode when navigating to main steps
        this.showLineage = false;
        
        // Check if accessible in guided mode
        if (this.guidedMode && !this._isStepAccessible(stepIndex)) {
            ui.notifications.warn(game.i18n.localize("RT.OriginPath.CompletePreviousStep"));
            return;
        }
        
        // If going back to a previous step, warn about cascade reset
        const oldIndex = this.currentStepIndex;
        if (stepIndex < oldIndex && this.guidedMode) {
            const stepsToReset = this.orderedSteps.slice(stepIndex + 1);
            const hasSelections = stepsToReset.some(s => this.selections.has(s.step));
            
            if (hasSelections) {
                const confirmed = await Dialog.confirm({
                    title: game.i18n.localize("RT.OriginPath.GoBack"),
                    content: game.i18n.localize("RT.OriginPath.GoBackWarning")
                });
                
                if (confirmed) {
                    // Reset subsequent steps
                    for (const step of stepsToReset) {
                        this.selections.delete(step.step);
                    }
                }
            }
        }
        
        this.currentStepIndex = stepIndex;
        this.render();
    }

    /**
     * Preview origin card (NEW behavior - single click shows in panel, doesn't select)
     * This is the new primary preview method - clicking a card just shows it in the panel
     */
    static async #previewOriginCard(event, target) {
        const originId = target.dataset.originId;
        const originUuid = target.dataset.originUuid;
        
        if (!originId && !originUuid) return;
        
        // Check if disabled
        if (target.classList.contains("disabled")) {
            ui.notifications.warn(game.i18n.localize("RT.OriginPath.OriginNotAvailable"));
            return;
        }
        
        // Find the origin (check both main and lineage origins)
        let origin = this.allOrigins.find(o => o.id === originId);
        if (!origin) {
            origin = this.lineageOrigins.find(o => o.id === originId);
        }
        if (!origin) return;
        
        // Store as plain data object (not Item instance)
        this.previewedOrigin = this._itemToSelectionData(origin);
        
        // Re-render to show in selection panel
        this.render();
    }

    /**
     * Confirm the currently previewed selection and advance to next step
     */
    static async #confirmSelection(event, target) {
        if (!this.previewedOrigin) {
            ui.notifications.warn(game.i18n.localize("RT.OriginPath.NoPreviewedOrigin"));
            return;
        }
        
        // Now actually select and confirm
        await this._selectOrigin(this.previewedOrigin);
        
        // Clear preview
        this.previewedOrigin = null;
        
        // Re-render
        this.render();
    }

    /**
     * View origin card details (eye icon button - preview only)
     * This is now the preview/detail view - does NOT select
     */
    static async #viewOriginCard(event, target) {
        // Stop propagation so parent card click doesn't fire
        event.stopPropagation();
        
        const originId = target.dataset.originId;
        const originUuid = target.dataset.originUuid;
        
        if (!originId && !originUuid) return;
        
        // Find the origin (check both main and lineage origins)
        let origin = this.allOrigins.find(o => o.id === originId);
        if (!origin) {
            origin = this.lineageOrigins.find(o => o.id === originId);
        }
        if (!origin) return;
        
        // Get current selection to check if already selected
        const currentStep = this.currentStep;
        let isSelected = false;
        if (this.showLineage) {
            isSelected = this.lineageSelection?.id === originId;
        } else {
            isSelected = this.selections.get(currentStep.step)?.id === originId;
        }
        
        // Show detail dialog for PREVIEW ONLY (no selection)
        await OriginDetailDialog.show(origin, {
            allowSelection: false,  // Changed to false - preview only
            isSelected: isSelected
        });
    }

    /**
     * Internal method to select an origin after confirmation
     * @param {Item|object} origin - The origin to select (Item or plain data object)
     * @private
     */
    async _selectOrigin(origin) {
        const currentStep = this.currentStep;
        
        // Convert to plain data object if it's an Item
        const originData = origin.toObject ? this._itemToSelectionData(origin) : foundry.utils.deepClone(origin);
        
        if (this.showLineage) {
            // Lineage selection
            this.lineageSelection = originData;
        } else {
            // Check if changing selection - need to reset subsequent steps
            if (this.guidedMode && this.selections.has(currentStep.step)) {
                // Clear subsequent steps when changing a selection
                const currentIndex = this.orderedSteps.findIndex(s => s.key === currentStep.key);
                const stepsToReset = this.orderedSteps.slice(currentIndex + 1);
                for (const step of stepsToReset) {
                    this.selections.delete(step.step);
                }
            }
            
            // Store selection as plain data object
            this.selections.set(currentStep.step, originData);
            
            // Auto-advance to next step if in guided mode
            if (this.guidedMode && this.currentStepIndex < CORE_STEPS.length - 1) {
                this.currentStepIndex++;
            }
        }
        
        this.render();
    }

    /**
     * View origin sheet (for selected origin in detail panel)
     */
    static async #viewOrigin(event, target) {
        const currentStep = this.currentStep;
        let selection = null;
        
        if (this.showLineage) {
            selection = this.lineageSelection || this.previewedOrigin;
        } else {
            // Check confirmed selection first, then previewed
            selection = this.selections.get(currentStep.step) || this.previewedOrigin;
        }
        
        if (selection) {
            // For plain data objects, we need to get the original item from compendium
            const uuid = selection.uuid || selection._sourceUuid;
            let originItem = uuid ? await fromUuid(uuid) : null;
            
            // If we can't find the original, create a temporary display item
            if (!originItem) {
                originItem = {
                    name: selection.name,
                    img: selection.img,
                    system: this._getSelectionSystem(selection),
                    uuid: uuid
                };
            }
            
            // Open the detail dialog
            await OriginDetailDialog.show(originItem, {
                allowSelection: false,
                isSelected: !!this.selections.get(currentStep.step)
            });
        }
    }

    /**
     * Clear current origin selection
     */
    static async #clearOrigin(event, target) {
        if (this.showLineage) {
            this.lineageSelection = null;
        } else {
            const currentStep = this.currentStep;
            
            // In guided mode, also clear subsequent steps
            if (this.guidedMode) {
                const currentIndex = this.orderedSteps.findIndex(s => s.key === currentStep.key);
                const stepsToReset = this.orderedSteps.slice(currentIndex);
                for (const step of stepsToReset) {
                    this.selections.delete(step.step);
                }
            } else {
                this.selections.delete(currentStep.step);
            }
        }
        this.render();
    }

    /**
     * Edit a choice - properly invoke OriginPathChoiceDialog
     */
    static async #editChoice(event, target) {
        const choiceLabel = target.dataset.choiceLabel;
        let selection = null;
        
        if (this.showLineage) {
            selection = this.lineageSelection || this.previewedOrigin;
        } else {
            const currentStep = this.currentStep;
            // Check previewed origin first, then confirmed selection
            selection = this.previewedOrigin || this.selections.get(currentStep.step);
        }
        
        if (!selection || !choiceLabel) return;
        
        const system = this._getSelectionSystem(selection);
        const choices = system?.grants?.choices || [];
        const choice = choices.find(c => c.label === choiceLabel);
        if (!choice) return;
        
        // Create a temporary wrapper for the dialog that behaves like an Item
        const itemLike = {
            name: selection.name,
            img: selection.img,
            system: system,
            uuid: selection.uuid || selection._sourceUuid
        };
        
        const result = await OriginPathChoiceDialog.show(itemLike, this.actor);
        
        if (result) {
            // Always directly mutate the plain data object
            if (!selection.system) selection.system = {};
            if (!selection.system.selectedChoices) selection.system.selectedChoices = {};
            for (const [label, selections] of Object.entries(result)) {
                selection.system.selectedChoices[label] = selections;
            }
            
            this.render();
        }
    }

    /**
     * Roll a stat using the roll dialog
     */
    static async #rollStat(event, target) {
        const statType = target.dataset.statType;
        let selection = null;
        
        if (this.showLineage) {
            selection = this.lineageSelection || this.previewedOrigin;
        } else {
            const currentStep = this.currentStep;
            selection = this.previewedOrigin || this.selections.get(currentStep.step);
        }
        
        if (!selection || !statType) return;
        
        const system = this._getSelectionSystem(selection);
        const grants = system?.grants || {};
        const formula = statType === "wounds" ? grants.woundsFormula : grants.fateFormula;
        
        if (!formula) return;
        
        // Create a wrapper for the roll dialog
        const itemLike = {
            name: selection.name,
            img: selection.img,
            system: system,
            uuid: selection.uuid || selection._sourceUuid
        };
        
        const result = await OriginRollDialog.show(statType, formula, {
            actor: this.actor,
            originItem: itemLike
        });
        
        if (result) {
            const rollData = {
                formula: formula,
                rolled: result.total,
                breakdown: result.breakdown,
                timestamp: Date.now()
            };
            
            // Always directly mutate the plain data object
            if (!selection.system) selection.system = {};
            if (!selection.system.rollResults) selection.system.rollResults = {};
            selection.system.rollResults[statType] = rollData;
            
            this.render();
        }
    }

    /**
     * Manually set a stat value (alternative to rolling)
     */
    static async #manualStat(event, target) {
        const statType = target.dataset.statType;
        let selection = null;
        
        if (this.showLineage) {
            selection = this.lineageSelection || this.previewedOrigin;
        } else {
            const currentStep = this.currentStep;
            selection = this.previewedOrigin || this.selections.get(currentStep.step);
        }
        
        if (!selection || !statType) return;
        
        const system = this._getSelectionSystem(selection);
        const grants = system?.grants || {};
        const formula = statType === "wounds" ? grants.woundsFormula : grants.fateFormula;
        
        if (!formula) return;
        
        // Show a simple input dialog
        const result = await Dialog.prompt({
            title: game.i18n.localize(`RT.OriginPath.Enter${statType.charAt(0).toUpperCase() + statType.slice(1)}`),
            content: `
                <form>
                    <div class="form-group">
                        <label>${game.i18n.localize("RT.OriginPath.ManualValue")}</label>
                        <input type="number" name="value" value="" min="1" autofocus />
                        <p class="notes">${game.i18n.localize("RT.OriginPath.FormulaHint")}: ${formula}</p>
                    </div>
                </form>
            `,
            callback: (html) => {
                const form = html[0]?.querySelector("form") || html.querySelector?.("form");
                return parseInt(form?.value?.value || form?.querySelector("[name=value]")?.value) || null;
            },
            rejectClose: false
        });
        
        if (result) {
            const rollData = {
                formula: formula,
                rolled: result,
                breakdown: `Manual: ${result}`,
                timestamp: Date.now()
            };
            
            // Always directly mutate the plain data object
            if (!selection.system) selection.system = {};
            if (!selection.system.rollResults) selection.system.rollResults = {};
            selection.system.rollResults[statType] = rollData;
            
            this.render();
        }
    }

    /**
     * Go to lineage selection
     */
    static async #goToLineage(event, target) {
        this.showLineage = true;
        this.render();
    }

    /**
     * Skip lineage selection
     */
    static async #skipLineage(event, target) {
        this.lineageSelection = null;
        this.showLineage = false;
        this.render();
    }

    /**
     * Open an item sheet (for talents, skills, etc.)
     */
    static async #openItem(event, target) {
        const uuid = target.dataset.uuid;
        if (!uuid) return;
        
        try {
            const item = await fromUuid(uuid);
            if (item?.sheet) {
                item.sheet.render(true);
            }
        } catch (e) {
            ui.notifications.warn(game.i18n.localize("RT.OriginPath.ItemNotFound"));
        }
    }

    /**
     * Commit path to character
     */
    static async #commit(event, target) {
        const status = this._calculateStatus();
        
        if (!status.canCommit) {
            if (!status.stepsComplete) {
                ui.notifications.warn(game.i18n.localize("RT.OriginPath.CompleteAllSteps"));
            } else if (!status.choicesComplete) {
                ui.notifications.warn(game.i18n.localize("RT.OriginPath.CompleteAllChoices"));
            }
            return;
        }
        
        // Confirm
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("RT.OriginPath.CommitToCharacter"),
            content: game.i18n.localize("RT.OriginPath.ConfirmCommit")
        });
        
        if (!confirmed) return;
        
        try {
            // Process all grants
            const allGrants = {
                characteristics: {},
                itemsToCreate: [],
                woundsBonus: 0,
                fateBonus: 0,
                corruptionBonus: 0,
                insanityBonus: 0
            };
            
            for (const [step, selection] of this.selections) {
                // Create a wrapper object for OriginGrantsProcessor that behaves like an Item
                const itemLike = {
                    name: selection.name,
                    img: selection.img,
                    system: this._getSelectionSystem(selection),
                    uuid: selection.uuid || selection._sourceUuid,
                    toObject: () => foundry.utils.deepClone(selection)
                };
                const result = await OriginGrantsProcessor.processOriginGrants(itemLike, this.actor);
                
                // Merge characteristics
                for (const [key, value] of Object.entries(result.characteristics)) {
                    allGrants.characteristics[key] = (allGrants.characteristics[key] || 0) + value;
                }
                
                // Merge items
                allGrants.itemsToCreate.push(...result.itemsToCreate);
                
                // Merge bonuses
                allGrants.woundsBonus += result.woundsBonus;
                allGrants.fateBonus += result.fateBonus;
                allGrants.corruptionBonus += result.corruptionBonus;
                allGrants.insanityBonus += result.insanityBonus;
            }
            
            // Apply to actor
            const updates = {};
            
            // Apply characteristic advances
            for (const [key, value] of Object.entries(allGrants.characteristics)) {
                const current = this.actor.system.characteristics[key]?.advance || 0;
                updates[`system.characteristics.${key}.advance`] = current + value;
            }
            
            // Apply wounds/fate
            if (allGrants.woundsBonus > 0) {
                const currentMax = this.actor.system.wounds?.max || 0;
                updates["system.wounds.max"] = currentMax + allGrants.woundsBonus;
                updates["system.wounds.value"] = currentMax + allGrants.woundsBonus;
            }
            
            if (allGrants.fateBonus > 0) {
                const currentMax = this.actor.system.fate?.max || 0;
                updates["system.fate.max"] = currentMax + allGrants.fateBonus;
                updates["system.fate.value"] = currentMax + allGrants.fateBonus;
            }
            
            // Apply corruption/insanity
            if (allGrants.corruptionBonus > 0) {
                const current = this.actor.system.corruption?.value || 0;
                updates["system.corruption.value"] = current + allGrants.corruptionBonus;
            }
            
            if (allGrants.insanityBonus > 0) {
                const current = this.actor.system.insanity?.value || 0;
                updates["system.insanity.value"] = current + allGrants.insanityBonus;
            }
            
            // Update actor
            await this.actor.update(updates);
            
            // Create items (talents, skills, traits, etc.)
            if (allGrants.itemsToCreate.length > 0) {
                await this.actor.createEmbeddedDocuments("Item", allGrants.itemsToCreate);
            }
            
            // Create origin path items on actor (for reference)
            const originItems = [];
            for (const [step, selection] of this.selections) {
                // For plain data objects, use them directly (they are already in the right format)
                const itemData = selection.toObject ? selection.toObject() : foundry.utils.deepClone(selection);
                // Remove internal tracking properties
                delete itemData._sourceUuid;
                delete itemData._actorItemId;
                originItems.push(itemData);
            }
            await this.actor.createEmbeddedDocuments("Item", originItems);
            
            // Success
            ui.notifications.info(game.i18n.localize("RT.OriginPath.CommitSuccess"));
            this.close();
            
        } catch (err) {
            console.error("Failed to commit origin path:", err);
            ui.notifications.error(game.i18n.localize("RT.OriginPath.CommitFailed"));
        }
    }
}
