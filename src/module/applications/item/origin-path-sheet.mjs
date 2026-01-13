/**
 * @file OriginPathSheet - ApplicationV2 sheet for origin path items
 * Opens the OriginDetailDialog for viewing/editing origin path items
 */

import OriginDetailDialog from "../character-creation/origin-detail-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Sheet for origin path items - opens detail dialog instead of traditional sheet
 * @extends ApplicationV2
 */
export default class OriginPathSheet extends HandlebarsApplicationMixin(ApplicationV2) {
    
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["rogue-trader", "origin-path-sheet"],
        tag: "div",
        window: {
            title: "Origin Path",
            icon: "fa-solid fa-route",
            resizable: true,
            minimizable: true
        },
        position: {
            width: 700,
            height: 600
        }
    };

    /** @override */
    static PARTS = {
        content: {
            template: "systems/rogue-trader/templates/character-creation/origin-detail-dialog.hbs",
            scrollable: [""]
        }
    };

    /**
     * @param {Item} item - The origin path item
     * @param {object} options - Sheet options
     */
    constructor(item, options = {}) {
        // Merge options but set document
        const mergedOptions = foundry.utils.mergeObject({
            document: item
        }, options);
        super(mergedOptions);
        
        /**
         * The origin path item
         * @type {Item}
         */
        this.item = item;
    }
    
    /** @override */
    get title() {
        return this.item?.name || "Origin Path";
    }
    
    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const system = this.item.system;
        const grants = system?.grants || {};
        const modifiers = system?.modifiers?.characteristics || {};

        context.origin = this.item;
        context.allowSelection = false;
        context.isSelected = false;

        // Basic info
        context.name = this.item.name;
        context.img = this.item.img;
        context.step = system?.step;
        context.stepLabel = this._getStepLabel(system?.step);
        context.xpCost = system?.xpCost || 0;
        context.isAdvanced = system?.isAdvancedOrigin || false;

        // Description
        context.description = system?.description?.value || "";
        context.hasDescription = !!context.description;

        // Source info
        context.source = system?.source || {};
        context.hasSource = !!(context.source.book || context.source.page);

        // Characteristic modifiers
        context.characteristics = [];
        for (const [key, value] of Object.entries(modifiers)) {
            if (value !== 0) {
                context.characteristics.push({
                    key: key,
                    label: this._getCharacteristicLabel(key),
                    short: this._getCharacteristicShort(key),
                    value: value,
                    positive: value > 0
                });
            }
        }
        context.hasCharacteristics = context.characteristics.length > 0;

        // Wounds/Fate formulas
        context.woundsFormula = grants.woundsFormula || null;
        context.fateFormula = grants.fateFormula || null;
        context.hasFormulas = !!(context.woundsFormula || context.fateFormula);

        // Skills
        context.skills = (grants.skills || []).map(skill => ({
            name: skill.name,
            specialization: skill.specialization || null,
            level: skill.level || "trained",
            levelLabel: this._getTrainingLabel(skill.level),
            displayName: skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name
        }));
        context.hasSkills = context.skills.length > 0;

        // Talents
        context.talents = (grants.talents || []).map(talent => ({
            name: talent.name,
            specialization: talent.specialization || null,
            uuid: talent.uuid || null,
            hasItem: !!talent.uuid
        }));
        context.hasTalents = context.talents.length > 0;

        // Traits
        context.traits = (grants.traits || []).map(trait => ({
            name: trait.name,
            level: trait.level || null,
            uuid: trait.uuid || null,
            hasItem: !!trait.uuid
        }));
        context.hasTraits = context.traits.length > 0;

        // Equipment
        context.equipment = (grants.equipment || []).map(item => ({
            name: item.name || item,
            quantity: item.quantity || 1,
            uuid: item.uuid || null
        }));
        context.hasEquipment = context.equipment.length > 0;

        // Special Abilities
        context.specialAbilities = grants.specialAbilities || [];
        context.hasSpecialAbilities = context.specialAbilities.length > 0;

        // Choices
        context.choices = (grants.choices || []).map(choice => ({
            type: choice.type,
            typeLabel: this._getChoiceTypeLabel(choice.type),
            label: choice.label,
            count: choice.count || 1,
            options: choice.options.map(opt => ({
                label: opt.label,
                value: opt.value,
                description: opt.description || ""
            }))
        }));
        context.hasChoices = context.choices.length > 0;

        // Requirements
        context.requirements = system?.requirements || {};
        context.hasRequirements = !!(context.requirements.text || 
            context.requirements.previousSteps?.length || 
            context.requirements.excludedSteps?.length);

        return context;
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    _getStepLabel(step) {
        if (!step) return "";
        const key = step.charAt(0).toUpperCase() + step.slice(1);
        return game.i18n.localize(`RT.OriginPath.${key}`);
    }

    _getCharacteristicLabel(key) {
        const labels = {
            weaponSkill: "Weapon Skill", ballisticSkill: "Ballistic Skill",
            strength: "Strength", toughness: "Toughness", agility: "Agility",
            intelligence: "Intelligence", perception: "Perception",
            willpower: "Willpower", fellowship: "Fellowship", influence: "Influence"
        };
        return labels[key] || key;
    }

    _getCharacteristicShort(key) {
        const shorts = {
            weaponSkill: "WS", ballisticSkill: "BS", strength: "S", toughness: "T",
            agility: "Ag", intelligence: "Int", perception: "Per", willpower: "WP",
            fellowship: "Fel", influence: "Inf"
        };
        return shorts[key] || key.substring(0, 3).toUpperCase();
    }

    _getTrainingLabel(level) {
        const labels = { trained: "Trained", plus10: "+10", plus20: "+20" };
        return labels[level] || level;
    }

    _getChoiceTypeLabel(type) {
        const labels = {
            talent: "Talent", skill: "Skill", characteristic: "Characteristic",
            equipment: "Equipment", trait: "Trait"
        };
        return labels[type] || type;
    }
}
