/**
 * @file SpecialistSkillDialog - Single-page dialog with cascading dropdowns
 * for adding specialist skill specializations.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin, { setupNumberInputAutoSelect } from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Precise type for ApplicationV2 action handlers bound with a `this` context. */
type ActionHandler = (this: SpecialistSkillDialog, event: Event, target: HTMLElement) => Promise<void>;

/** Extended options bag for SpecialistSkillDialog — adds the skill pre-selection field. */
interface SpecialistSkillDialogOptions extends ApplicationV2Config.DefaultOptions {
    preSelectedSkillKey?: string;
}

/**
 * Dialog for adding specialist skill specializations.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class SpecialistSkillDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare actorDoc: WH40KBaseActor;
    declare preSelectedSkillKey: string;
    declare _specializationMap: Map<string, string[]>;
    declare _compendiumLoaded: boolean;

    /**
     * @param {WH40KBaseActor} actor                The owning actor.
     * @param {SpecialistSkillDialogOptions} [options={}]        Dialog options.
     */
    constructor(actor: WH40KBaseActor, options: SpecialistSkillDialogOptions = {}) {
        super(options);
        this.actorDoc = actor;
        this.preSelectedSkillKey = options.preSelectedSkillKey ?? '';
        this._specializationMap = new Map<string, string[]>();
        this._compendiumLoaded = false;
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'specialist-skill', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/unbound-method
            add: SpecialistSkillDialog.#onAdd as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/unbound-method
            cancel: SpecialistSkillDialog.#onCancel as ActionHandler,
        },
        position: {
            width: 420,
        },
        window: {
            // eslint-disable-next-line no-restricted-syntax -- i18n: WH40K localization key resolved at runtime; rule fires on any literal in this position
            title: 'WH40K.Skills.AddSpecialistSkillTitle',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/add-speciality-prompt.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Compendium Loading                          */
    /* -------------------------------------------- */

    /**
     * Load all specialist skill specializations from compendium packs.
     * @protected
     */
    async _loadAllSpecializations(): Promise<void> {
        this._compendiumLoaded = true;

        type AnyPack = {
            metadata: { type: string; name: string };
            getIndex(): Promise<foundry.utils.Collection<{ _id: string; name: string }>>;
            // eslint-disable-next-line no-restricted-syntax -- boundary: compendium doc type varies by pack; validated via shape check below
            getDocument(id: string): Promise<unknown>;
        };

        // Filter skill packs up front, then fan-out all index fetches in parallel.
        // eslint-disable-next-line no-restricted-syntax -- boundary: game.packs type is framework-internal; cast through unknown to AnyPack[] for safe iteration
        const skillPacks = (game.packs as unknown as AnyPack[]).filter((p) => p.metadata.type === 'Item' && p.metadata.name.includes('skill'));

        await Promise.all(
            skillPacks.map(async (pack) => {
                const index = await pack.getIndex();
                const skillEntries = index.filter((entry) => entry.name.includes('(X)'));

                await Promise.all(
                    skillEntries.map(async (entry) => {
                        const doc = (await pack.getDocument(entry._id)) as { system?: { specializations?: string[] } } | null;
                        const specs = doc?.system?.specializations;
                        if (specs !== undefined && specs.length > 0) {
                            const baseName = entry.name.replace(/\s*\(X\)\s*$/i, '').trim();
                            this._specializationMap.set(baseName.toLowerCase(), specs);
                        }
                    }),
                );
            }),
        );
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        if (!this._compendiumLoaded) {
            await this._loadAllSpecializations();
        }

        const context = await super._prepareContext(options);

        // Get specialist skills from actor
        // eslint-disable-next-line no-restricted-syntax -- boundary: base actor's skills field varies by system and may be absent
        const skills = (this.actorDoc.system as { skills?: Record<string, unknown> }).skills ?? {};
        const specialistSkills = Object.entries(skills)
            .filter(([_key, data]) => (data as { entries?: object }).entries !== undefined)
            .map(([key, data]) => ({
                key,
                label: (data as { label?: string }).label ?? key,
                characteristic:
                    (data as { charShort?: string; characteristic?: string }).charShort ??
                    (data as { charShort?: string; characteristic?: string }).characteristic,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));

        // Get specializations for pre-selected skill
        const selectedKey = this.preSelectedSkillKey;
        // eslint-disable-next-line no-restricted-syntax -- boundary: skills is Record<string, unknown>; narrowed to labeled skill shape for pre-selected lookup
        const selectedSkill = selectedKey.length > 0 ? (skills as Record<string, { label?: string }>)[selectedKey] : null;
        const selectedLabel = selectedSkill?.label ?? '';
        const specializations = this._specializationMap.get(selectedLabel.toLowerCase()) ?? [];

        return {
            ...context,
            actor: this.actorDoc,
            specialistSkills,
            preSelectedSkillKey: selectedKey,
            specializations,
        };
    }

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context type matches base class signature
    override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);
        setupNumberInputAutoSelect(this.element);

        // Cascading dropdown: skill selection drives specialization options
        const skillSelect = this.element.querySelector<HTMLSelectElement>('#skill-select');
        if (skillSelect) {
            skillSelect.addEventListener('change', () => {
                this._updateSpecializationDropdown(skillSelect.value);
            });
        }

        // Button listeners for V1-style templates
        this.element.querySelector("[data-action='add']")?.addEventListener('click', (e: Event) => {
            e.preventDefault();
            void this._addSpecialization();
        });
        this.element.querySelector("[data-action='cancel']")?.addEventListener('click', (e: Event) => {
            e.preventDefault();
            void this.close();
        });
    }

    /* -------------------------------------------- */

    /**
     * Update the specialization dropdown when the skill selection changes.
     * @param {string} skillKey  The selected skill key.
     * @protected
     */
    _updateSpecializationDropdown(skillKey: string): void {
        const specSelect = this.element.querySelector<HTMLSelectElement>('#specialization-select');
        const specGroup = this.element.querySelector<HTMLElement>('#specialization-group');
        if (!specSelect || !specGroup) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: base actor's skills field varies by system and may be absent
        const skills = (this.actorDoc.system as { skills?: Record<string, { label?: string }> }).skills ?? {};
        const skill = skills[skillKey];
        const label = skill?.label ?? ''; // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- skills is Record<string, V>; indexing returns V not V|undefined without noUncheckedIndexedAccess
        const specializations = this._specializationMap.get(label.toLowerCase()) ?? [];

        // Clear and repopulate
        specSelect.innerHTML = '<option value="">-- Select a specialization --</option>';
        for (const spec of specializations) {
            const option = document.createElement('option');
            option.value = spec;
            option.textContent = spec;
            specSelect.appendChild(option);
        }

        specGroup.classList.toggle('tw-hidden', specializations.length === 0);
    }

    /* -------------------------------------------- */

    /**
     * Read the form inputs and add the specialization to the actor.
     * @protected
     */
    async _addSpecialization(): Promise<void> {
        const form = this.element.querySelector('form') ?? this.element;

        const skillKey = form.querySelector<HTMLSelectElement>('#skill-select')?.value;
        if (skillKey === undefined || skillKey.length === 0) {
            // eslint-disable-next-line no-restricted-syntax -- TODO: WH40K.Skills.SelectSkillTypeRequired localization key pending
            ui.notifications.warn('Please select a skill type.');
            return;
        }

        const specValue = form.querySelector<HTMLSelectElement>('#specialization-select')?.value.trim() ?? '';
        const customValue = form.querySelector<HTMLInputElement>('#custom-specialization')?.value.trim() ?? '';
        const speciality = customValue.length > 0 ? customValue : specValue;

        if (speciality.length === 0) {
            // eslint-disable-next-line no-restricted-syntax -- TODO: WH40K.Skills.SelectSpecializationRequired localization key pending
            ui.notifications.warn('Please enter or select a specialization name.');
            return;
        }

        await this.actorDoc.addSpecialitySkill(skillKey, speciality);
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle the "Add" action button.
     * @private
     */
    static async #onAdd(this: SpecialistSkillDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this._addSpecialization();
    }

    /**
     * Handle the "Cancel" action button.
     * @private
     */
    static async #onCancel(this: SpecialistSkillDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a specialist skill dialog.
 * @param {object} data  Dialog data — must include `actor`, may include `skillName`.
 */
export function prepareCreateSpecialistSkillPrompt(data: { actor: WH40KBaseActor; skillName?: string }): void {
    const prompt = new SpecialistSkillDialog(data.actor, {
        preSelectedSkillKey: data.skillName ?? '',
    });
    void prompt.render({ force: true });
}
