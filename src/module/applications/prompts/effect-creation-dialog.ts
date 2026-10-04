/**
 * @file Effect Creation Dialog
 * Streamlined, thematic dialog for creating Active Effects in WH40K RPG
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { bearerLine, conditionEffectData, conditionPickerRows, type EffectDataInput, type EffectDuration } from '../../rules/condition-registry.ts';
import { capitalize } from '../../utils/format.ts';
import type { SupportedLineKey } from '../../utils/item-variant-utils.ts';
import DialogResolution from '../dialogs/dialog-resolution.ts';

const { DialogV2 } = foundry.applications.api;

interface EffectCreationDialogOptions {
    actor: WH40KBaseActor;
}

/**
 * Form data the effect-creation dialog collects. Exported so the unit tests assert
 * against the concrete input shape instead of redeclaring an `extends Record` clone.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: EffectCreationData extends Record for FormDataExtended compatibility; index signature is deliberate
export interface EffectCreationData extends Record<string, unknown> {
    effectType: 'condition' | 'characteristic' | 'skill' | 'combat' | 'custom';
    conditionId?: string;
    characteristic?: string;
    skill?: string;
    combatType?: string;
    customName?: string;
    modifierValue?: string;
    duration?: { rounds: string };
}

/** A single Active Effect change entry. */
interface ActiveEffectChange {
    key: string;
    mode: number;
    /** Foundry stores change values as strings or numbers; condition changes
     *  (derived from the condition documents, #495) are typed the same way. */
    value: number | string;
}

/**
 * The condition / characteristic / skill / combat effect creation payload built by
 * the modifier builders. Exported so the unit tests assert on the concrete shape
 * instead of casting from `Record<string, unknown>`.
 */
export interface EffectPayload {
    name: string;
    icon: string;
    changes: ActiveEffectChange[];
    flags: { 'wh40k-rpg': { nature: string } };
    duration?: EffectDuration | undefined;
}

/** The minimal custom-effect payload (no changes / nature flag, just a named disabled effect). */
interface CustomEffectPayload {
    name: string;
    icon: string;
    disabled: boolean;
}

export default class EffectCreationDialog extends DialogV2 {
    declare actor: WH40KBaseActor;
    declare selectedCategory: string;
    declare element: HTMLElement;
    declare submit: () => Promise<void>;

    /** Promise-resolution plumbing (#287); dismissal without a submit resolves null. */
    readonly #resolution = new DialogResolution<ActiveEffect | null>(null);

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
                    label: 'WH40K.Effects.Create',
                    icon: 'fas fa-check',
                    default: true,
                    type: 'submit',
                },
                {
                    action: 'cancel',
                    label: 'WH40K.Cancel',
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
        const dialog = new this({ actor });
        // Track resolution before rendering; resolved on submit, or null via close()→resolveDefault() on dismiss.
        const result = dialog.#resolution.track();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- render returns a Promise but the dialog lifecycle is awaited via #resolution
        dialog.render(true);
        return result;
    }

    constructor(options: EffectCreationDialogOptions) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2 constructor accepts Record<string,unknown>; EffectCreationDialogOptions is structurally compatible
        super(options as unknown as Record<string, unknown>);
        this.actor = options.actor;
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

        // Conditions come from the condition compendium documents (#495), resolved
        // for this actor's line — the same catalog the token HUD and crit riders
        // apply from, so a condition picked here is the same document.
        context['conditions'] = conditionPickerRows(bearerLine(this.actor));

        // Characteristics
        context['characteristics'] = [
            { id: 'weaponSkill', label: game.i18n.localize('WH40K.Characteristic.WeaponSkill') },
            { id: 'ballisticSkill', label: game.i18n.localize('WH40K.Characteristic.BallisticSkill') },
            { id: 'strength', label: game.i18n.localize('WH40K.Characteristic.Strength') },
            { id: 'toughness', label: game.i18n.localize('WH40K.Characteristic.Toughness') },
            { id: 'agility', label: game.i18n.localize('WH40K.Characteristic.Agility') },
            { id: 'intelligence', label: game.i18n.localize('WH40K.Characteristic.Intelligence') },
            { id: 'perception', label: game.i18n.localize('WH40K.Characteristic.Perception') },
            { id: 'willpower', label: game.i18n.localize('WH40K.Characteristic.Willpower') },
            { id: 'fellowship', label: game.i18n.localize('WH40K.Characteristic.Fellowship') },
        ];

        // Common skills
        context['skills'] = [
            { id: 'dodge', label: game.i18n.localize('WH40K.Combat.Dodge') },
            { id: 'parry', label: game.i18n.localize('WH40K.Combat.Parry') },
            { id: 'awareness', label: game.i18n.localize('WH40K.Dialog.EffectCreation.Awareness') },
            { id: 'stealth', label: game.i18n.localize('WH40K.Dialog.EffectCreation.Stealth') },
            { id: 'charm', label: game.i18n.localize('WH40K.SkillUse.Social.Charm') },
            { id: 'deceive', label: game.i18n.localize('WH40K.SkillUse.Social.Deceive') },
            { id: 'intimidate', label: game.i18n.localize('WH40K.SkillUse.Social.Intimidate') },
        ];

        // Combat modifiers
        context['combatTypes'] = [
            { id: 'attack', label: game.i18n.localize('WH40K.Dialog.EffectCreation.AttackRolls') },
            { id: 'damage', label: game.i18n.localize('WH40K.Weapon.Damage') },
            { id: 'defense', label: game.i18n.localize('WH40K.Dialog.EffectCreation.Defense') },
            { id: 'initiative', label: game.i18n.localize('WH40K.Combat.Initiative') },
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

        let effectData: EffectPayload | EffectDataInput | CustomEffectPayload | null = null;

        const Ctor = this.constructor as typeof EffectCreationDialog;
        // Handle based on effect type
        if (data.effectType === 'condition') {
            effectData = Ctor._createConditionData(data, bearerLine(this.actor));
        } else if (data.effectType === 'characteristic') {
            effectData = Ctor._createCharacteristicData(data);
        } else if (data.effectType === 'skill') {
            effectData = Ctor._createSkillData(data);
        } else if (data.effectType === 'combat') {
            effectData = Ctor._createCombatData(data);
        } else {
            // data.effectType === 'custom'
            effectData = Ctor._createCustomData(data);
        }

        if (effectData === null) {
            ui.notifications.warn(game.i18n.localize('WH40K.ActiveEffect.InvalidData'));
            this.#resolution.resolve(null);
            return;
        }

        // Create the effect
        // eslint-disable-next-line no-restricted-syntax -- boundary: ActiveEffect.createEmbeddedDocuments accepts Record<string,unknown>; EffectPayload/CustomEffectPayload are structurally valid creation payloads but the framework method is untyped
        const effects = await this.actor.createEmbeddedDocuments('ActiveEffect', [effectData as unknown as Record<string, unknown> & { name: string }]);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- noUncheckedIndexedAccess: effects[0] is Document|undefined; cast to ActiveEffect|null after null-coalescing guard
        this.#resolution.resolve((effects[0] ?? null) as ActiveEffect | null);
    }

    /* -------------------------------------------- */

    /**
     * Resolve the pending promise with the cancelled default (null) if no submit
     * fired first, so a dismissed dialog never leaves `show()` awaiting forever.
     * `DialogResolution` guards against a double-resolve after a submit.
     * @override
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2.close() accepts untyped options; signature must match the framework override
    override async close(options: Record<string, unknown> = {}): Promise<this> {
        this.#resolution.resolveDefault();
        await super.close(options);
        return this;
    }

    /* -------------------------------------------- */

    /**
     * Build the effect payload for a picked condition, from its compendium
     * document resolved for the actor's line (#495) — the same builder the token
     * HUD and crit riders use, so a condition applied from this dialog is the
     * same document, with the same token status and the same `changes`.
     * @param {EffectCreationData} data  The submitted dialog form data.
     * @param {SupportedLineKey} line  The actor's game line.
     * @returns {EffectDataInput | null}  The creation payload, or null for an unknown id.
     */
    static _createConditionData(data: EffectCreationData, line: SupportedLineKey): EffectDataInput | null {
        const conditionId = data.conditionId ?? '';
        if (conditionId === '') return null;
        const payload = conditionEffectData(conditionId, line);
        return payload === null ? null : this._applyDuration(payload, data);
    }

    /* -------------------------------------------- */

    /**
     * Build a single-change active-effect creation payload (name, icon, one
     * `changes[]` entry, the wh40k nature flag, and the shared duration block).
     * The characteristic/skill/combat builders are thin callers that differ
     * only in `label` / `changeKey` / `icon`.
     */
    static _buildEffectData({
        label,
        changeKey,
        value,
        icon,
        data,
    }: {
        label: string;
        changeKey: string;
        value: number;
        icon: string;
        data: EffectCreationData;
    }): EffectPayload {
        const effectData: EffectPayload = {
            name: `${label} ${value > 0 ? '+' : ''}${value}`,
            icon,
            changes: [
                {
                    key: changeKey,
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

        return this._applyDuration(effectData, data);
    }

    /* -------------------------------------------- */

    /**
     * Apply the combat-anchored duration block to an effect payload when a
     * positive round count is supplied. Shared by every effect builder so the
     * duration shape lives in exactly one place.
     */
    static _applyDuration<T extends { duration?: EffectDuration | undefined }>(effectData: T, data: EffectCreationData): T {
        const rounds = parseInt(data.duration?.rounds ?? '0', 10);
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
    static _createCharacteristicData(data: EffectCreationData): EffectPayload | null {
        const characteristic = data.characteristic;
        const value = parseInt(data.modifierValue ?? '0', 10) || 0;

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- characteristic is string|undefined from EffectCreationData; falsy check covers both undefined and ''
        if (!characteristic || value === 0) return null;

        /* eslint-disable no-restricted-syntax -- boundary: CONFIG.wh40k is not on shipped foundry types; double-cast required */
        const charLabel =
            (CONFIG as unknown as { WH40K?: { characteristics?: Record<string, { label?: string }> } }).WH40K?.characteristics?.[characteristic]?.label ??
            /* eslint-enable no-restricted-syntax */
            capitalize(characteristic);

        return this._buildEffectData({
            label: charLabel,
            changeKey: `system.characteristics.${characteristic}.modifier`,
            value,
            icon: 'icons/svg/upgrade.svg',
            data,
        });
    }

    /* -------------------------------------------- */

    /**
     * Create skill modifier data
     */
    static _createSkillData(data: EffectCreationData): EffectPayload | null {
        const skill = data.skill;
        const value = parseInt(data.modifierValue ?? '0', 10) || 0;

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- skill is string|undefined from EffectCreationData; falsy check covers both undefined and ''
        if (!skill || value === 0) return null;

        const skillLabel = capitalize(skill);

        return this._buildEffectData({
            label: skillLabel,
            changeKey: `system.skills.${skill}.bonus`,
            value,
            icon: 'icons/svg/upgrade.svg',
            data,
        });
    }

    /* -------------------------------------------- */

    /**
     * Create combat modifier data
     */
    static _createCombatData(data: EffectCreationData): EffectPayload | null {
        const combatType = data.combatType;
        const value = parseInt(data.modifierValue ?? '0', 10) || 0;

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- combatType is string|undefined from EffectCreationData; falsy check covers both undefined and ''
        if (!combatType || value === 0) return null;

        const typeLabel = capitalize(combatType);

        return this._buildEffectData({
            label: typeLabel,
            changeKey: `system.combat.${combatType}`,
            value,
            icon: 'icons/svg/combat.svg',
            data,
        });
    }

    /* -------------------------------------------- */

    /**
     * Create custom effect data
     */
    static _createCustomData(data: EffectCreationData): CustomEffectPayload | null {
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
