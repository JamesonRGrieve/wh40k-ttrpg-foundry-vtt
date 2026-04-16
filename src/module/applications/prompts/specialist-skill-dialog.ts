/**
 * @file SpecialistSkillDialog - Single-page dialog with cascading dropdowns
 * for adding specialist skill specializations. Loads specialization options
 * from indexed compendium packs.
 */

import ApplicationV2Mixin, { setupNumberInputAutoSelect } from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/**
 * Dialog for adding specialist skill specializations.
 * Shows a skill type dropdown and a specialization dropdown that auto-populates
 * from compendium data when the skill selection changes.
 */
export default class SpecialistSkillDialog extends ApplicationV2Mixin(ApplicationV2) {
    [key: string]: any;

    /**
     * @param {Actor} actor                The owning actor.
     * @param {object} [options={}]        Dialog options.
     * @param {string} [options.preSelectedSkillKey]  Skill key to pre-select.
     */
    constructor(actor: any, options: Record<string, any> = {}) {
        // @ts-expect-error - argument count
        super(options);
        this.actorDoc = actor;
        this.preSelectedSkillKey = options.preSelectedSkillKey || '';
        this._specializationMap = new Map<string, string[]>();
        this._compendiumLoaded = false;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'specialist-skill', 'standard-form'],
        actions: {
            add: SpecialistSkillDialog.#onAdd,
            cancel: SpecialistSkillDialog.#onCancel,
        },
        position: {
            width: 420,
        },
        window: {
            title: 'Add Specialist Skill',
            minimizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/add-speciality-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Compendium Loading                          */
    /* -------------------------------------------- */

    /**
     * Load all specialist skill specializations from compendium packs.
     * Scans all Item packs whose name contains "skill" for entries with (X),
     * then extracts their specialization arrays into a lookup map.
     * @protected
     */
    async _loadAllSpecializations(): Promise<void> {
        this._compendiumLoaded = true;

        for (const pack of game.packs) {
            if ((pack as any).metadata.type !== 'Item') continue;
            if (!(pack as any).metadata.name.includes('skill')) continue;

            const index = await pack.getIndex();
            // @ts-expect-error - index filter
            const skillEntries = index.filter((entry) => entry.name.includes('(X)'));

            for (const entry of skillEntries) {
                const doc = await pack.getDocument(entry._id);
                // @ts-expect-error - system data access
                const specs = doc?.system?.specializations;
                if (specs?.length) {
                    // @ts-expect-error - name access
                    const baseName = entry.name.replace(/\s*\(X\)\s*$/i, '').trim();
                    this._specializationMap.set(baseName.toLowerCase(), specs);
                }
            }
        }
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        if (!this._compendiumLoaded) {
            await this._loadAllSpecializations();
        }

        const context = await super._prepareContext(options);

        // Get specialist skills from actor
        const skills = this.actorDoc.system?.skills ?? {};
        const specialistSkills = Object.entries(skills)
            .filter(([_, data]) => (data as any).entries !== undefined)
            .map(([key, data]) => ({
                key,
                label: (data as any).label || key,
                characteristic: (data as any).charShort || (data as any).characteristic,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));

        // Get specializations for pre-selected skill
        const selectedKey = this.preSelectedSkillKey;
        const selectedSkill = selectedKey ? skills[selectedKey] : null;
        const selectedLabel = selectedSkill?.label || '';
        const specializations = this._specializationMap.get(selectedLabel.toLowerCase()) || [];

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
    async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);
        setupNumberInputAutoSelect(this.element);

        // Cascading dropdown: skill selection drives specialization options
        const skillSelect = this.element.querySelector('#skill-select') as HTMLSelectElement | null;
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
        const specSelect = this.element.querySelector('#specialization-select') as HTMLSelectElement | null;
        const specGroup = this.element.querySelector('#specialization-group') as HTMLElement | null;
        if (!specSelect || !specGroup) return;

        const skills = this.actorDoc.system?.skills ?? {};
        const skill = skills[skillKey];
        const label = skill?.label || '';
        const specializations = this._specializationMap.get(label.toLowerCase()) || [];

        // Clear and repopulate
        specSelect.innerHTML = '<option value="">-- Select a specialization --</option>';
        for (const spec of specializations) {
            const option = document.createElement('option');
            option.value = spec;
            option.textContent = spec;
            specSelect.appendChild(option);
        }

        specGroup.style.display = specializations.length ? '' : 'none';
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle add button click.
     * @this {SpecialistSkillDialog}
     */
    static async #onAdd(this: any, event: Event, target: HTMLElement): Promise<void> {
        await this._addSpecialization();
    }

    /**
     * Handle cancel button click.
     * @this {SpecialistSkillDialog}
     */
    static async #onCancel(this: any, event: Event, target: HTMLElement): Promise<void> {
        await this.close();
    }

    /* -------------------------------------------- */

    /**
     * Read the form inputs and add the specialization to the actor.
     * @protected
     */
    async _addSpecialization(): Promise<void> {
        const form = this.element.querySelector('form') ?? this.element;

        const skillKey = (form.querySelector('#skill-select') as HTMLSelectElement | null)?.value;
        if (!skillKey) {
            (ui.notifications as any).warn('Please select a skill type.');
            return;
        }

        const specValue = (form.querySelector('#specialization-select') as HTMLSelectElement | null)?.value?.trim() ?? '';
        const customValue = (form.querySelector('#custom-specialization') as HTMLInputElement | null)?.value?.trim() ?? '';
        const speciality = customValue || specValue;

        if (!speciality) {
            (ui.notifications as any).warn('Please enter or select a specialization name.');
            return;
        }

        await this.actorDoc.addSpecialitySkill(skillKey, speciality);
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
export function prepareCreateSpecialistSkillPrompt(data: { actor: any; skillName?: string; [key: string]: any }) {
    const prompt = new SpecialistSkillDialog(data.actor, {
        preSelectedSkillKey: data.skillName || '',
    });
    prompt.render(true);
}
