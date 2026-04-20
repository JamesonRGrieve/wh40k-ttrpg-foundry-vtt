/**
 * @file Effect Creation Dialog
 * Streamlined, thematic dialog for creating Active Effects in WH40K RPG
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';

const { DialogV2 } = foundry.applications.api;

export default class EffectCreationDialog extends (DialogV2 as any) {
    /** @override */
    static DEFAULT_OPTIONS = {
        window: {
            title: 'WH40K.ActiveEffect.CreateEffect',
            icon: 'fas fa-sparkles',
            contentClasses: ['wh40k-effect-creation-dialog'],
        },
        position: {
            width: 520,
            height: 'auto' as const,
        },
        form: {
            handler: EffectCreationDialog.formHandler,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            selectCondition: EffectCreationDialog._onSelectCondition,
            selectCategory: EffectCreationDialog._onSelectCategory,
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
    static async show(actor: WH40KBaseActor): Promise<unknown> {
        return new Promise((resolve) => {
            new this({ actor, resolve }).render(true);
        });
    }

    /* -------------------------------------------- */

    constructor(options: Record<string, unknown> = {}) {
        super(options);
        this.actor = options.actor;
        this.resolve = options.resolve;
        this.selectedCategory = 'custom'; // custom, condition, characteristic, skill, combat
    }

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/effect-creation-dialog.hbs',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: Record<string, unknown>): Promise<unknown> {
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
    static _onSelectCategory(event: Event, target: HTMLElement): void {
        this.selectedCategory = target.dataset.category;
        this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle quick condition selection
     */
    static _onSelectCondition(event: Event, target: HTMLElement): void {
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
    static async formHandler(event: Event, form: HTMLFormElement, formData: Record<string, unknown>): Promise<void> {
        const data = foundry.utils.expandObject(formData.object) as any;

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
            ui.notifications.warn('WH40K.ActiveEffect.InvalidData');
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
    static _createConditionData(data: Record<string, unknown>): Record<string, unknown> | null {
        const conditionId = data.conditionId;

        // Use the helper function
        const conditions = {
            stunned: {
                name: 'Stunned',
                icon: 'systems/wh40k-rpg/assets/icons/conditions/stunned.webp',
                changes: [
                    { key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                    { key: 'system.combat.attack', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                ],
                flags: { 'wh40k-rpg': { nature: 'harmful' } },
            },
            prone: {
                name: 'Prone',
                icon: 'systems/wh40k-rpg/assets/icons/conditions/prone.webp',
                changes: [{ key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }],
                flags: { 'wh40k-rpg': { nature: 'harmful' } },
            },
            blinded: {
                name: 'Blinded',
                icon: 'systems/wh40k-rpg/assets/icons/conditions/blinded.webp',
                changes: [
                    { key: 'system.characteristics.ballisticSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -30 },
                    { key: 'system.characteristics.weaponSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -30 },
                ],
                flags: { 'wh40k-rpg': { nature: 'harmful' } },
            },
            deafened: {
                name: 'Deafened',
                icon: 'systems/wh40k-rpg/assets/icons/conditions/deafened.webp',
                changes: [{ key: 'system.characteristics.perception.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }],
                flags: { 'wh40k-rpg': { nature: 'harmful' } },
            },
            grappled: {
                name: 'Grappled',
                icon: 'systems/wh40k-rpg/assets/icons/conditions/grappled.webp',
                changes: [
                    { key: 'system.characteristics.weaponSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                    { key: 'system.characteristics.agility.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                ],
                flags: { 'wh40k-rpg': { nature: 'harmful' } },
            },
            bleeding: {
                name: 'Bleeding',
                icon: 'systems/wh40k-rpg/assets/icons/conditions/bleeding.webp',
                changes: [],
                flags: { 'wh40k-rpg': { nature: 'harmful', requiresProcessing: true } },
            },
            onFire: {
                name: 'On Fire',
                icon: 'systems/wh40k-rpg/assets/icons/conditions/on-fire.webp',
                changes: [],
                flags: { 'wh40k-rpg': { nature: 'harmful', requiresProcessing: true } },
            },
            inspired: {
                name: 'Inspired',
                icon: 'systems/wh40k-rpg/assets/icons/conditions/inspired.webp',
                changes: [
                    { key: 'system.characteristics.willpower.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 },
                    { key: 'system.characteristics.fellowship.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 },
                ],
                flags: { 'wh40k-rpg': { nature: 'beneficial' } },
            },
            blessed: {
                name: 'Blessed',
                icon: 'systems/wh40k-rpg/assets/icons/conditions/blessed.webp',
                changes: [{ key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 }],
                flags: { 'wh40k-rpg': { nature: 'beneficial' } },
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
    static _createCharacteristicData(data: Record<string, unknown>): Record<string, unknown> | null {
        const characteristic = data.characteristic;
        const value = parseInt(data.modifierValue) || 0;

        if (!characteristic || value === 0) return null;

        const charLabel = CONFIG.WH40K?.characteristics?.[characteristic] ?? characteristic.charAt(0).toUpperCase() + characteristic.slice(1);

        const effectData: unknown = {
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
                'wh40k-rpg': {
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
    static _createSkillData(data: Record<string, unknown>): Record<string, unknown> | null {
        const skill = data.skill;
        const value = parseInt(data.modifierValue) || 0;

        if (!skill || value === 0) return null;

        const skillLabel = skill.charAt(0).toUpperCase() + skill.slice(1);

        const effectData: unknown = {
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
                'wh40k-rpg': {
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
    static _createCombatData(data: Record<string, unknown>): Record<string, unknown> | null {
        const combatType = data.combatType;
        const value = parseInt(data.modifierValue) || 0;

        if (!combatType || value === 0) return null;

        const typeLabel = combatType.charAt(0).toUpperCase() + combatType.slice(1);

        const effectData: unknown = {
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
                'wh40k-rpg': {
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
    static _createCustomData(data: Record<string, unknown>): Record<string, unknown> | null {
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
