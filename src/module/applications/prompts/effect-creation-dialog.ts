/**
 * @file Effect Creation Dialog
 * Streamlined, thematic dialog for creating Active Effects in WH40K RPG
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';

const { DialogV2 } = foundry.applications.api;

interface EffectCreationDialogOptions {
    actor: WH40KBaseActor;
    resolve: (value: ActiveEffect | null) => void;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: EffectCreationData extends Record for FormDataExtended compatibility; index signature is deliberate
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
    declare element: HTMLElement;
    declare submit: () => Promise<void>;

    /** @override */
    static DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        classes: ['wh40k-rpg', 'wh40k-effect-creation-dialog'],
        window: {
            title: 'WH40K.ActiveEffect.CreateEffect',
            icon: 'fas fa-sparkles',
        },
        position: {
            width: 520,
            // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2Config position.height type is number but 'auto' is a valid runtime value
            height: 'auto' as unknown as number,
        },
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- boundary: exactOptionalPropertyTypes TS2375: cast required because FormConfiguration has optional booleans that conflict with literal false/true under exactOptionalPropertyTypes
        form: {
            // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/unbound-method -- boundary: handler cast required for FormConfiguration type; unbound-method fires on static method reference
            handler: EffectCreationDialog.formHandler as unknown as ApplicationV2Config.FormConfiguration['handler'],
            submitOnChange: false,
            closeOnSubmit: true,
        } as ApplicationV2Config.FormConfiguration,
        actions: {
            /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 action map binds this at click-time */
            selectCondition: EffectCreationDialog._onSelectCondition,
            selectCategory: EffectCreationDialog._onSelectCategory,
            /* eslint-enable @typescript-eslint/unbound-method */
        },
        // DialogV2-specific buttons config (not in the shared DefaultOptions type)
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
        } as Partial<ApplicationV2Config.DefaultOptions>),
    };

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
            // eslint-disable-next-line @typescript-eslint/no-floating-promises -- render returns a Promise but the dialog lifecycle is managed via the resolve callback
            new this({ actor, resolve }).render(true);
        });
    }

    constructor(options: EffectCreationDialogOptions) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2 constructor accepts Record<string,unknown>; EffectCreationDialogOptions is structurally compatible
        super(options as unknown as Record<string, unknown>);
        this.actor = options.actor;
        this.resolve = options.resolve;
        this.selectedCategory = 'custom';
    }

    /* -------------------------------------------- */

    /** @override */
    /* eslint-disable no-restricted-syntax -- boundary: _prepareContext signature uses Record<string,unknown> as the ApplicationV2 override shape */
    // eslint-disable-next-line @typescript-eslint/require-await -- _prepareContext must be async per ApplicationV2 contract even when no internal awaits are needed
    async _prepareContext(_options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context: Record<string, unknown> = {};
        /* eslint-enable no-restricted-syntax */

        context['actor'] = this.actor;
        context['selectedCategory'] = this.selectedCategory;

        // Predefined conditions
        context['conditions'] = [
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
        context['characteristics'] = [
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
        context['skills'] = [
            { id: 'dodge', label: 'Dodge' },
            { id: 'parry', label: 'Parry' },
            { id: 'awareness', label: 'Awareness' },
            { id: 'stealth', label: 'Stealth' },
            { id: 'charm', label: 'Charm' },
            { id: 'deceive', label: 'Deceive' },
            { id: 'intimidate', label: 'Intimidate' },
        ];

        // Combat modifiers
        context['combatTypes'] = [
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
    static _onSelectCategory(this: EffectCreationDialog, _event: Event, target: HTMLElement): void {
        this.selectedCategory = target.dataset['category'] ?? 'custom';
        void this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle quick condition selection
     */
    static _onSelectCondition(this: EffectCreationDialog, _event: Event, target: HTMLElement): void {
        const conditionId = target.dataset['conditionId'];
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- conditionId is string|undefined from dataset; falsy check covers both undefined and ''
        if (!conditionId) return;

        const form = this.element.querySelector('form');
        if (form) {
            (form.elements.namedItem('effectType') as HTMLInputElement).value = 'condition';
            (form.elements.namedItem('conditionId') as HTMLInputElement).value = conditionId;
            void this.submit();
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle form submission
     */
    static async formHandler(this: EffectCreationDialog, _event: SubmitEvent, _form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        const data = formData.object as EffectCreationData;

        // eslint-disable-next-line no-restricted-syntax -- boundary: effectData is an ActiveEffect creation payload; Record<string,unknown> is the Foundry createEmbeddedDocuments API shape
        let effectData: Record<string, unknown> | null = null;

        const Ctor = this.constructor as typeof EffectCreationDialog;
        // Handle based on effect type
        switch (data.effectType) {
            case 'condition':
                effectData = Ctor._createConditionData(data);
                break;

            case 'characteristic':
                effectData = Ctor._createCharacteristicData(data);
                break;

            case 'skill':
                effectData = Ctor._createSkillData(data);
                break;

            case 'combat':
                effectData = Ctor._createCombatData(data);
                break;

            case 'custom':
                effectData = Ctor._createCustomData(data);
                break;
        }

        if (!effectData) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40K.ActiveEffect.InvalidData is a localization key, not a hardcoded string; lint rule cannot distinguish
            ui.notifications.warn('WH40K.ActiveEffect.InvalidData');
            return this.resolve(null);
        }

        // Create the effect
        // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments requires {name:string}&Record<string,unknown>; effectData is known-valid at this point
        const effects = await this.actor.createEmbeddedDocuments('ActiveEffect', [effectData as Record<string, unknown> & { name: string }]);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- noUncheckedIndexedAccess: effects[0] is Document|undefined; cast to ActiveEffect|null after null-coalescing guard
        return this.resolve((effects[0] ?? null) as ActiveEffect | null);
    }

    /* -------------------------------------------- */

    /**
     * Create condition effect data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is Foundry ActiveEffect creation payload; Record<string,unknown> is the API shape
    static _createConditionData(data: EffectCreationData): Record<string, unknown> | null {
        const conditionId = data.conditionId;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- conditionId is string|undefined from EffectCreationData; falsy check covers both undefined and ''
        if (!conditionId) return null;

        // eslint-disable-next-line no-restricted-syntax -- boundary: conditions map holds Foundry ActiveEffect creation payloads; Record<string,unknown> is the API shape
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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- noUncheckedIndexedAccess: index access on Record may return undefined; guard is required at runtime
        if (!conditionData) return null;

        const effectData = foundry.utils.deepClone(conditionData);
        const rounds = parseInt(data.duration?.rounds ?? '0', 10);
        if (rounds > 0) {
            const combat = game.combat;
            effectData['duration'] = {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is Foundry ActiveEffect creation payload; Record<string,unknown> is the API shape
    static _createCharacteristicData(data: EffectCreationData): Record<string, unknown> | null {
        const characteristic = data.characteristic;
        const value = parseInt(data.modifierValue ?? '0', 10) || 0;

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- characteristic is string|undefined from EffectCreationData; falsy check covers both undefined and ''
        if (!characteristic || value === 0) return null;

        /* eslint-disable no-restricted-syntax -- boundary: CONFIG.wh40k is not on shipped foundry types; double-cast required */
        const charLabel =
            (CONFIG as unknown as { WH40K?: { characteristics?: Record<string, { label?: string }> } }).WH40K?.characteristics?.[characteristic]?.label ??
            /* eslint-enable no-restricted-syntax */
            characteristic.charAt(0).toUpperCase() + characteristic.slice(1);

        // eslint-disable-next-line no-restricted-syntax -- boundary: effectData is a Foundry ActiveEffect creation payload; Record<string,unknown> is the createEmbeddedDocuments API shape
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

        const rounds = parseInt(data.duration?.rounds ?? '0', 10);
        if (rounds > 0) {
            const combat = game.combat;
            effectData['duration'] = {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is Foundry ActiveEffect creation payload; Record<string,unknown> is the API shape
    static _createSkillData(data: EffectCreationData): Record<string, unknown> | null {
        const skill = data.skill;
        const value = parseInt(data.modifierValue ?? '0', 10) || 0;

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- skill is string|undefined from EffectCreationData; falsy check covers both undefined and ''
        if (!skill || value === 0) return null;

        const skillLabel = skill.charAt(0).toUpperCase() + skill.slice(1);

        // eslint-disable-next-line no-restricted-syntax -- boundary: effectData is a Foundry ActiveEffect creation payload; Record<string,unknown> is the createEmbeddedDocuments API shape
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

        const rounds = parseInt(data.duration?.rounds ?? '0', 10);
        if (rounds > 0) {
            const combat = game.combat;
            effectData['duration'] = {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is Foundry ActiveEffect creation payload; Record<string,unknown> is the API shape
    static _createCombatData(data: EffectCreationData): Record<string, unknown> | null {
        const combatType = data.combatType;
        const value = parseInt(data.modifierValue ?? '0', 10) || 0;

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- combatType is string|undefined from EffectCreationData; falsy check covers both undefined and ''
        if (!combatType || value === 0) return null;

        const typeLabel = combatType.charAt(0).toUpperCase() + combatType.slice(1);

        // eslint-disable-next-line no-restricted-syntax -- boundary: effectData is a Foundry ActiveEffect creation payload; Record<string,unknown> is the createEmbeddedDocuments API shape
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

        const rounds = parseInt(data.duration?.rounds ?? '0', 10);
        if (rounds > 0) {
            const combat = game.combat;
            effectData['duration'] = {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is Foundry ActiveEffect creation payload; Record<string,unknown> is the API shape
    static _createCustomData(data: EffectCreationData): Record<string, unknown> | null {
        const name = data.customName?.trim();

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- name is string|undefined after optional chain + trim; falsy check covers both undefined and ''
        if (!name) return null;

        return {
            name: name,
            icon: 'icons/svg/aura.svg',
            disabled: false,
        };
    }
}
