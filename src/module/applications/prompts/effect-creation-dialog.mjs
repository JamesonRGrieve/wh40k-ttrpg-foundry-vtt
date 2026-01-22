/**
 * @file Effect Creation Dialog
 * Streamlined, thematic dialog for creating Active Effects in Rogue Trader
 */

const { DialogV2 } = foundry.applications.api;

export default class EffectCreationDialog extends DialogV2 {
    /** @override */
    static DEFAULT_OPTIONS = {
        window: {
            title: 'RT.ActiveEffect.CreateEffect',
            icon: 'fas fa-sparkles',
            contentClasses: ['rt-effect-creation-dialog'],
        },
        position: {
            width: 520,
            height: 'auto',
        },
        form: {
            handler: EffectCreationDialog.#formHandler,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            selectCondition: EffectCreationDialog.#onSelectCondition,
            selectCategory: EffectCreationDialog.#onSelectCategory,
        },
        buttons: [
            {
                action: 'create',
                label: 'Create Effect',
                icon: 'fas fa-check',
                default: true,
            },
            {
                action: 'cancel',
                label: 'Cancel',
                icon: 'fas fa-times',
            },
        ],
    };

    /* -------------------------------------------- */

    /**
     * Create and render the dialog
     * @param {Actor} actor     The target actor
     * @returns {Promise<ActiveEffect|null>}
     */
    static async show(actor) {
        return new Promise((resolve) => {
            new this({ actor, resolve }).render(true);
        });
    }

    /* -------------------------------------------- */

    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.resolve = options.resolve;
        this.selectedCategory = 'custom'; // custom, condition, characteristic, skill, combat
    }

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/rogue-trader/templates/dialogs/effect-creation-dialog.hbs',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        context.actor = this.actor;
        context.selectedCategory = this.selectedCategory;

        // Predefined conditions
        context.conditions = [
            { id: 'stunned', name: 'Stunned', icon: 'fas fa-dizzy', nature: 'harmful' },
            { id: 'prone', name: 'Prone', icon: 'fas fa-person-falling', nature: 'harmful' },
            { id: 'blinded', name: 'Blinded', icon: 'fas fa-eye-slash', nature: 'harmful' },
            { id: 'deafened', name: 'Deafened', icon: 'fas fa-volume-xmark', nature: 'harmful' },
            { id: 'grappled', name: 'Grappled', icon: 'fas fa-hand-fist', nature: 'harmful' },
            { id: 'bleeding', name: 'Bleeding', icon: 'fas fa-droplet', nature: 'harmful' },
            { id: 'onFire', name: 'On Fire', icon: 'fas fa-fire', nature: 'harmful' },
            { id: 'inspired', name: 'Inspired', icon: 'fas fa-lightbulb', nature: 'beneficial' },
            { id: 'blessed', name: 'Blessed', icon: 'fas fa-hand-sparkles', nature: 'beneficial' },
        ];

        // Characteristics
        context.characteristics = [
            { id: 'weaponSkill', label: 'Weapon Skill' },
            { id: 'ballisticSkill', label: 'Ballistic Skill' },
            { id: 'strength', label: 'Strength' },
            { id: 'toughness', label: 'Toughness' },
            { id: 'agility', label: 'Agility' },
            { id: 'intelligence', label: 'Intelligence' },
            { id: 'perception', label: 'Perception' },
            { id: 'willpower', label: 'Willpower' },
            { id: 'fellowship', label: 'Fellowship' },
        ];

        // Common skills
        context.skills = [
            { id: 'dodge', label: 'Dodge' },
            { id: 'parry', label: 'Parry' },
            { id: 'awareness', label: 'Awareness' },
            { id: 'stealth', label: 'Stealth' },
            { id: 'charm', label: 'Charm' },
            { id: 'deceive', label: 'Deceive' },
            { id: 'intimidate', label: 'Intimidate' },
        ];

        // Combat modifiers
        context.combatTypes = [
            { id: 'attack', label: 'Attack Rolls' },
            { id: 'damage', label: 'Damage' },
            { id: 'defense', label: 'Defense' },
            { id: 'initiative', label: 'Initiative' },
        ];

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Handle category selection
     */
    static #onSelectCategory(event, target) {
        this.selectedCategory = target.dataset.category;
        this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle quick condition selection
     */
    static #onSelectCondition(event, target) {
        const conditionId = target.dataset.conditionId;

        // Set form values for the selected condition
        const form = this.element.querySelector('form');
        form.querySelector("[name='effectType']").value = 'condition';
        form.querySelector("[name='conditionId']").value = conditionId;

        // Auto-submit
        this.submit();
    }

    /* -------------------------------------------- */

    /**
     * Handle form submission
     */
    static async #formHandler(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);

        let effectData = null;

        // Handle based on effect type
        switch (data.effectType) {
            case 'condition':
                effectData = await this._createConditionData(data);
                break;

            case 'characteristic':
                effectData = await this._createCharacteristicData(data);
                break;

            case 'skill':
                effectData = await this._createSkillData(data);
                break;

            case 'combat':
                effectData = await this._createCombatData(data);
                break;

            case 'custom':
                effectData = await this._createCustomData(data);
                break;
        }

        if (!effectData) {
            ui.notifications.warn('RT.ActiveEffect.InvalidData');
            return this.resolve(null);
        }

        // Create the effect
        const effects = await this.options.actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
        return this.resolve(effects[0]);
    }

    /* -------------------------------------------- */

    /**
     * Create condition effect data
     */
    static async _createConditionData(data) {
        const conditionId = data.conditionId;

        // Use the helper function
        const conditions = {
            stunned: {
                name: 'Stunned',
                icon: 'systems/rogue-trader/assets/icons/conditions/stunned.webp',
                changes: [
                    { key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                    { key: 'system.combat.attack', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                ],
                flags: { 'rogue-trader': { nature: 'harmful' } },
            },
            prone: {
                name: 'Prone',
                icon: 'systems/rogue-trader/assets/icons/conditions/prone.webp',
                changes: [{ key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }],
                flags: { 'rogue-trader': { nature: 'harmful' } },
            },
            blinded: {
                name: 'Blinded',
                icon: 'systems/rogue-trader/assets/icons/conditions/blinded.webp',
                changes: [
                    { key: 'system.characteristics.ballisticSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -30 },
                    { key: 'system.characteristics.weaponSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -30 },
                ],
                flags: { 'rogue-trader': { nature: 'harmful' } },
            },
            deafened: {
                name: 'Deafened',
                icon: 'systems/rogue-trader/assets/icons/conditions/deafened.webp',
                changes: [{ key: 'system.characteristics.perception.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }],
                flags: { 'rogue-trader': { nature: 'harmful' } },
            },
            grappled: {
                name: 'Grappled',
                icon: 'systems/rogue-trader/assets/icons/conditions/grappled.webp',
                changes: [
                    { key: 'system.characteristics.weaponSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                    { key: 'system.characteristics.agility.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                ],
                flags: { 'rogue-trader': { nature: 'harmful' } },
            },
            bleeding: {
                name: 'Bleeding',
                icon: 'systems/rogue-trader/assets/icons/conditions/bleeding.webp',
                changes: [],
                flags: { 'rogue-trader': { nature: 'harmful', requiresProcessing: true } },
            },
            onFire: {
                name: 'On Fire',
                icon: 'systems/rogue-trader/assets/icons/conditions/on-fire.webp',
                changes: [],
                flags: { 'rogue-trader': { nature: 'harmful', requiresProcessing: true } },
            },
            inspired: {
                name: 'Inspired',
                icon: 'systems/rogue-trader/assets/icons/conditions/inspired.webp',
                changes: [
                    { key: 'system.characteristics.willpower.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 },
                    { key: 'system.characteristics.fellowship.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 },
                ],
                flags: { 'rogue-trader': { nature: 'beneficial' } },
            },
            blessed: {
                name: 'Blessed',
                icon: 'systems/rogue-trader/assets/icons/conditions/blessed.webp',
                changes: [{ key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 }],
                flags: { 'rogue-trader': { nature: 'beneficial' } },
            },
        };

        const conditionData = conditions[conditionId];
        if (!conditionData) return null;

        // Add duration if specified
        const effectData = foundry.utils.deepClone(conditionData);
        if (data.duration?.rounds > 0) {
            const combat = game.combat;
            effectData.duration = {
                rounds: parseInt(data.duration.rounds),
                startRound: combat?.round ?? 0,
                startTurn: combat?.turn ?? 0,
            };
        }

        return effectData;
    }

    /* -------------------------------------------- */

    /**
     * Create characteristic modifier data
     */
    static async _createCharacteristicData(data) {
        const characteristic = data.characteristic;
        const value = parseInt(data.modifierValue) || 0;

        if (!characteristic || value === 0) return null;

        const charLabel = CONFIG.ROGUE_TRADER.characteristics[characteristic] ?? characteristic.charAt(0).toUpperCase() + characteristic.slice(1);

        const effectData = {
            name: `${charLabel} ${value > 0 ? '+' : ''}${value}`,
            icon: 'icons/svg/upgrade.svg',
            changes: [
                {
                    key: `system.characteristics.${characteristic}.modifier`,
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                    value: value,
                },
            ],
            flags: {
                'rogue-trader': {
                    nature: value > 0 ? 'beneficial' : 'harmful',
                },
            },
        };

        // Add duration if specified
        if (data.duration?.rounds > 0) {
            const combat = game.combat;
            effectData.duration = {
                rounds: parseInt(data.duration.rounds),
                startRound: combat?.round ?? 0,
                startTurn: combat?.turn ?? 0,
            };
        }

        return effectData;
    }

    /* -------------------------------------------- */

    /**
     * Create skill modifier data
     */
    static async _createSkillData(data) {
        const skill = data.skill;
        const value = parseInt(data.modifierValue) || 0;

        if (!skill || value === 0) return null;

        const skillLabel = skill.charAt(0).toUpperCase() + skill.slice(1);

        const effectData = {
            name: `${skillLabel} ${value > 0 ? '+' : ''}${value}`,
            icon: 'icons/svg/upgrade.svg',
            changes: [
                {
                    key: `system.skills.${skill}.bonus`,
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                    value: value,
                },
            ],
            flags: {
                'rogue-trader': {
                    nature: value > 0 ? 'beneficial' : 'harmful',
                },
            },
        };

        // Add duration
        if (data.duration?.rounds > 0) {
            const combat = game.combat;
            effectData.duration = {
                rounds: parseInt(data.duration.rounds),
                startRound: combat?.round ?? 0,
                startTurn: combat?.turn ?? 0,
            };
        }

        return effectData;
    }

    /* -------------------------------------------- */

    /**
     * Create combat modifier data
     */
    static async _createCombatData(data) {
        const combatType = data.combatType;
        const value = parseInt(data.modifierValue) || 0;

        if (!combatType || value === 0) return null;

        const typeLabel = combatType.charAt(0).toUpperCase() + combatType.slice(1);

        const effectData = {
            name: `${typeLabel} ${value > 0 ? '+' : ''}${value}`,
            icon: 'icons/svg/combat.svg',
            changes: [
                {
                    key: `system.combat.${combatType}`,
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                    value: value,
                },
            ],
            flags: {
                'rogue-trader': {
                    nature: value > 0 ? 'beneficial' : 'harmful',
                },
            },
        };

        // Add duration
        if (data.duration?.rounds > 0) {
            const combat = game.combat;
            effectData.duration = {
                rounds: parseInt(data.duration.rounds),
                startRound: combat?.round ?? 0,
                startTurn: combat?.turn ?? 0,
            };
        }

        return effectData;
    }

    /* -------------------------------------------- */

    /**
     * Create custom effect data
     */
    static async _createCustomData(data) {
        const name = data.customName?.trim();

        if (!name) return null;

        return {
            name: name,
            icon: 'icons/svg/aura.svg',
            origin: this.options.actor.uuid,
            disabled: false,
        };
    }
}
