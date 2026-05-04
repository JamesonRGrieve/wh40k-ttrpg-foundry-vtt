/**
 * @gulpfile.js Effect Creation Dialog
 * Streamlined, thematic dialog for creating Active Effects in WH40K RPG
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';

const { DialogV2 } = foundry.applications.api;

interface EffectCreationDialogOptions {
    actor: WH40KBaseActor;
    resolve: (value: ActiveEffect | null) => void;
}

interface EffectCreationData extends Record<string, unknown> {
    effectType: 'condition' | 'characteristic' | 'skill' | 'combat' | 'custom';
    conditionId?: string;
    characteristic?: string;
    skill?: string;
    combatType?: string;
    customName?: string;
    modifierValue?: string;
    duration?: { rounds: string };
}

export default class EffectCreationDialog extends DialogV2 {
    declare actor: WH40KBaseActor;
    declare resolve: (value: ActiveEffect | null) => void;
    declare selectedCategory: string;

    /** @foundry-v14-overrides.d.ts */
    static DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        classes: ['wh40k-rpg', 'wh40k-effect-creation-dialog'],
        window: {
            title: 'WH40K.ActiveEffect.CreateEffect',
            icon: 'fas fa-sparkles',
            ...({
                contentClasses: [
                    'tw-bg-gradient-to-br',
                    'tw-from-[#1a1612]',
                    'tw-to-[#2c2417]',
                    'tw-border-2',
                    'tw-border-solid',
                    'tw-border-[var(--wh40k-accent-gold)]',
                    'tw-shadow-[0_8px_32px_rgba(0,0,0,0.5)]',
                    '[&_.dialog-buttons]:tw-hidden',
                ],
            } as Record<string, unknown>),
        } as ApplicationV2Config.DefaultOptions['window'],
        position: {
            width: 520,
            height: 'auto' as unknown as number,
        },
        form: {
            handler: EffectCreationDialog.formHandler as unknown as ApplicationV2Config.FormConfiguration['handler'],
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            selectCondition: EffectCreationDialog._onSelectCondition,
            selectCategory: EffectCreationDialog._onSelectCategory,
        },
        ...({
            buttons: [
                {
                    action: 'create',
                    label: 'Create Effect',
                    icon: 'fas fa-check',
                    default: true,
                    type: 'submit',
                },
                {
                    action: 'cancel',
                    label: 'Cancel',
                    icon: 'fas fa-times',
                    type: 'button',
                },
            ],
        } as Record<string, unknown>),
    } as ApplicationV2Config.DefaultOptions;

    /* -------------------------------------------- */

    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/effect-creation-dialog.hbs',
        },
    };

    /**
     * Create and render the dialog
     * @param {WH40KBaseActor} actor     The target actor
     * @returns {Promise<ActiveEffect|null>}
     */
    static async show(actor: WH40KBaseActor): Promise<ActiveEffect | null> {
        return new Promise((resolve) => {
            new this({ actor, resolve }).render(true);
        });
    }

    constructor(options: EffectCreationDialogOptions) {
        super(options as unknown as Record<string, unknown>);
        this.actor = options.actor;
        this.resolve = options.resolve;
        this.selectedCategory = 'custom';
    }

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await (DialogV2.prototype as unknown as Record<string, (o: ApplicationV2Config.RenderOptions) => Promise<Record<string, unknown>>>)._prepareContext.call(this, options);

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
    static _onSelectCategory(this: EffectCreationDialog, event: Event, target: HTMLElement): void {
        this.selectedCategory = target.dataset.category ?? 'custom';
        void this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle quick condition selection
     */
    static _onSelectCondition(this: EffectCreationDialog, event: Event, target: HTMLElement): void {
        const conditionId = target.dataset.conditionId;
        if (!conditionId) return;

        const form = (this as unknown as Record<string, HTMLElement>).element.querySelector('form') as HTMLFormElement | null;
        if (form) {
            (form.elements.namedItem('effectType') as HTMLInputElement).value = 'condition';
            (form.elements.namedItem('conditionId') as HTMLInputElement).value = conditionId;
            void (this as unknown as Record<string, () => Promise<void>>).submit();
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle form submission
     */
    static async formHandler(this: EffectCreationDialog, event: SubmitEvent, form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        const data = formData.object as unknown as EffectCreationData;

        let effectData: Record<string, unknown> | null = null;

        // Handle based on effect type
        switch (data.effectType) {
            case 'condition':
                effectData = EffectCreationDialog._createConditionData(data);
                break;

            case 'characteristic':
                effectData = EffectCreationDialog._createCharacteristicData(data);
                break;

            case 'skill':
                effectData = EffectCreationDialog._createSkillData(data);
                break;

            case 'combat':
                effectData = EffectCreationDialog._createCombatData(data);
                break;

            case 'custom':
                effectData = EffectCreationDialog._createCustomData(data);
                break;
        }

        if (!effectData) {
            ui.notifications.warn('WH40K.ActiveEffect.InvalidData');
            return this.resolve(null);
        }

        // Create the effect
        const effects = await this.actor.createEmbeddedDocuments('ActiveEffect', [effectData as Record<string, unknown> & { name: string }]);
        return this.resolve(effects[0] as ActiveEffect);
    }

    /* -------------------------------------------- */

    /**
     * Create condition effect data
     */
    static _createConditionData(data: EffectCreationData): Record<string, unknown> | null {
        const conditionId = data.conditionId;
        if (!conditionId) return null;

        const conditions: Record<string, Record<string, unknown>> = {
            stunned: {
                name: 'Stunned',
                icon: 'icons/svg/daze.svg',
                changes: [
                    { key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                    { key: 'system.combat.attack', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                ],
                flags: { 'wh40k-rpg': { nature: 'harmful' } },
            },
            prone: {
                name: 'Prone',
                icon: 'icons/svg/falling.svg',
                changes: [{ key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }],
                flags: { 'wh40k-rpg': { nature: 'harmful' } },
            },
            blinded: {
                name: 'Blinded',
                icon: 'icons/svg/blind.svg',
                changes: [
                    { key: 'system.characteristics.ballisticSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -30 },
                    { key: 'system.characteristics.weaponSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -30 },
                ],
                flags: { 'wh40k-rpg': { nature: 'harmful' } },
            },
            deafened: {
                name: 'Deafened',
                icon: 'icons/svg/sound-off.svg',
                changes: [{ key: 'system.characteristics.perception.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }],
                flags: { 'wh40k-rpg': { nature: 'harmful' } },
            },
            grappled: {
                name: 'Grappled',
                icon: 'icons/svg/net.svg',
                changes: [
                    { key: 'system.characteristics.weaponSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                    { key: 'system.characteristics.agility.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                ],
                flags: { 'wh40k-rpg': { nature: 'harmful' } },
            },
            bleeding: {
                name: 'Bleeding',
                icon: 'icons/svg/blood.svg',
                changes: [],
                flags: { 'wh40k-rpg': { nature: 'harmful', requiresProcessing: true } },
            },
            onFire: {
                name: 'On Fire',
                icon: 'icons/svg/fire.svg',
                changes: [],
                flags: { 'wh40k-rpg': { nature: 'harmful', requiresProcessing: true } },
            },
            inspired: {
                name: 'Inspired',
                icon: 'icons/svg/upgrade.svg',
                changes: [
                    { key: 'system.characteristics.willpower.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 },
                    { key: 'system.characteristics.fellowship.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 },
                ],
                flags: { 'wh40k-rpg': { nature: 'beneficial' } },
            },
            blessed: {
                name: 'Blessed',
                icon: 'icons/svg/angel.svg',
                changes: [{ key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 }],
                flags: { 'wh40k-rpg': { nature: 'beneficial' } },
            },
        };

        const conditionData = conditions[conditionId];
        if (!conditionData) return null;

        const effectData = foundry.utils.deepClone(conditionData) as Record<string, unknown>;
        const rounds = parseInt(data.duration?.rounds ?? '0');
        if (rounds > 0) {
            const combat = game.combat;
            effectData.duration = {
                rounds,
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
    static _createCharacteristicData(data: EffectCreationData): Record<string, unknown> | null {
        const characteristic = data.characteristic;
        const value = parseInt(data.modifierValue ?? '0') || 0;

        if (!characteristic || value === 0) return null;

        const charLabel = (CONFIG as Record<string, any>).WH40K?.characteristics?.[characteristic]?.label ?? characteristic.charAt(0).toUpperCase() + characteristic.slice(1);

        const effectData: Record<string, unknown> = {
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

        const rounds = parseInt(data.duration?.rounds ?? '0');
        if (rounds > 0) {
            const combat = game.combat;
            effectData.duration = {
                rounds,
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
    static _createSkillData(data: EffectCreationData): Record<string, unknown> | null {
        const skill = data.skill;
        const value = parseInt(data.modifierValue ?? '0') || 0;

        if (!skill || value === 0) return null;

        const skillLabel = skill.charAt(0).toUpperCase() + skill.slice(1);

        const effectData: Record<string, unknown> = {
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

        const rounds = parseInt(data.duration?.rounds ?? '0');
        if (rounds > 0) {
            const combat = game.combat;
            effectData.duration = {
                rounds,
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
    static _createCombatData(data: EffectCreationData): Record<string, unknown> | null {
        const combatType = data.combatType;
        const value = parseInt(data.modifierValue ?? '0') || 0;

        if (!combatType || value === 0) return null;

        const typeLabel = combatType.charAt(0).toUpperCase() + combatType.slice(1);

        const effectData: Record<string, unknown> = {
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

        const rounds = parseInt(data.duration?.rounds ?? '0');
        if (rounds > 0) {
            const combat = game.combat;
            effectData.duration = {
                rounds,
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
    static _createCustomData(data: EffectCreationData): Record<string, unknown> | null {
        const name = data.customName?.trim();

        if (!name) return null;

        return {
            name: name,
            icon: 'icons/svg/aura.svg',
            disabled: false,
        };
    }
}
