/**
 * @file TalentEditorDialog - Dialog for editing complex talent fields
 *
 * Provides tabbed interface for editing:
 * - Prerequisites (text, characteristics, skills, talents)
 * - Modifiers (characteristics, skills, combat, resources, other)
 * - Situational modifiers (with conditions)
 * - Grants (skills, talents, traits, special abilities)
 */

import type TalentData from '../../data/item/talent.ts';
import type ModifiersTemplate from '../../data/shared/modifiers-template.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { ApplicationV2, HandlebarsApplicationMixin } = (foundry.applications as any).api;

/**
 * Dialog for editing complex talent data fields.
 * @extends ApplicationV2
 */
export class TalentEditorDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'talent-editor-dialog',
        classes: ['wh40k-rpg', 'dialog', 'talent-editor-dialog'],
        tag: 'form',
        form: {
            handler: TalentEditorDialog.#formHandler,
            closeOnSubmit: true,
        },
        actions: {
            addItem: TalentEditorDialog.#addItem,
            removeItem: TalentEditorDialog.#removeItem,
            switchSection: TalentEditorDialog.#switchSection,
        },
        position: {
            width: 700,
            height: 650,
        },
        window: {
            title: 'Edit Talent Data',
            icon: 'fa-solid fa-pen-ruler',
            resizable: true,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/talent-editor-dialog.hbs',
            scrollable: ['.ted-content'],
        },
    };

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    /**
     * The item being edited.
     * @type {Item}
     */
    item: { name: string; system: TalentData; update: (data: Record<string, unknown>) => Promise<unknown> };

    /**
     * Current active section.
     * @type {string}
     */
    #activeSection = 'prerequisites';

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    constructor(options: Record<string, unknown> = {}) {
        super(options);
        this.item = options.item as typeof this.item;
        this.#activeSection = (options.initialSection as string) || 'prerequisites';
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get title() {
        return `Edit: ${this.item.name}`;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line @typescript-eslint/require-await
    async _prepareContext(options: Record<string, unknown>): Promise<unknown> {
        const system: TalentData = this.item.system;

        // Prepare characteristic options
        const characteristicOptions = this._getCharacteristicOptions();
        const skillOptions = this._getSkillOptions();
        const combatOptions = this._getCombatModifierOptions();
        const resourceOptions = this._getResourceOptions();
        const trainingLevelOptions = this._getTrainingLevelOptions();

        return {
            item: this.item,
            system: system,
            activeSection: this.#activeSection,

            // Section data
            prerequisites: this._preparePrerequisitesData(system),
            modifiers: this._prepareModifiersEditData(system),
            situational: this._prepareSituationalEditData(system),
            grants: this._prepareGrantsEditData(system),

            // Options for selects
            characteristicOptions,
            skillOptions,
            combatOptions,
            resourceOptions,
            trainingLevelOptions,

            // Section states
            sections: {
                prerequisites: this.#activeSection === 'prerequisites',
                modifiers: this.#activeSection === 'modifiers',
                situational: this.#activeSection === 'situational',
                grants: this.#activeSection === 'grants',
            },
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare prerequisites data for editing.
     * @param {object} system - The item's system data
     * @returns {object} Prepared prerequisites data
     * @protected
     */
    _preparePrerequisitesData(system: TalentData): Record<string, unknown> {
        const prereqs = system.prerequisites || { text: '', characteristics: {}, skills: [], talents: [] };

        // Convert characteristics object to array for template iteration
        const characteristicReqs = Object.entries(prereqs.characteristics || {})
            .filter(([_, value]) => (value as number) > 0)
            .map(([key, value]) => ({
                key,
                label: this._getCharacteristicLabel(key),
                value,
            }));

        return {
            text: prereqs.text || '',
            characteristics: characteristicReqs,
            skills: (prereqs.skills || []).map((s: string) => ({ name: s })),
            talents: (prereqs.talents || []).map((t: string) => ({ name: t })),
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare modifiers data for editing.
     * @param {object} system - The item's system data
     * @returns {object} Prepared modifiers data
     * @protected
     */
    _prepareModifiersEditData(system: TalentData): Record<string, unknown> {
        const mods = (system as TalentData & Pick<ModifiersTemplate, 'modifiers'>).modifiers || ({} as ModifiersTemplate['modifiers']);

        // Convert characteristics object to array
        const characteristics = Object.entries(mods.characteristics || {})
            .filter(([_, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._getCharacteristicLabel(key),
                value,
            }));

        // Convert skills object to array
        const skills = Object.entries(mods.skills || {})
            .filter(([_, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._formatSkillLabel(key),
                value,
            }));

        // Combat modifiers
        const combat = Object.entries(mods.combat || {})
            .filter(([_, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._getCombatLabel(key),
                value,
            }));

        // Resource modifiers
        const resources = Object.entries(mods.resources || {})
            .filter(([_, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._getResourceLabel(key),
                value,
            }));

        // Other modifiers
        const other = (mods.other || []).map((mod: { key: string; label: string; value: number; mode: string }, index: number) => ({
            index,
            key: mod.key || '',
            label: mod.label || '',
            value: mod.value || 0,
            mode: mod.mode || 'add',
        }));

        return {
            characteristics,
            skills,
            combat,
            resources,
            other,
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare situational modifiers data for editing.
     * @param {object} system - The item's system data
     * @returns {object} Prepared situational data
     * @protected
     */
    _prepareSituationalEditData(system: TalentData): Record<string, unknown> {
        const situational =
            (system as TalentData & Pick<ModifiersTemplate, 'modifiers'>).modifiers?.situational ||
            ({ characteristics: [], skills: [], combat: [] } as ModifiersTemplate['modifiers']['situational']);

        return {
            characteristics: (situational.characteristics || []).map((mod: { key: string; value: number; condition: string }, index: number) => ({
                index,
                key: mod.key || '',
                label: this._getCharacteristicLabel(mod.key),
                value: mod.value || 0,
                condition: mod.condition || '',
            })),
            skills: (situational.skills || []).map((mod: { key: string; value: number; condition: string }, index: number) => ({
                index,
                key: mod.key || '',
                label: this._formatSkillLabel(mod.key),
                value: mod.value || 0,
                condition: mod.condition || '',
            })),
            combat: (situational.combat || []).map((mod: { key: string; value: number; condition: string }, index: number) => ({
                index,
                key: mod.key || '',
                label: this._getCombatLabel(mod.key),
                value: mod.value || 0,
                condition: mod.condition || '',
            })),
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare grants data for editing.
     * @param {object} system - The item's system data
     * @returns {object} Prepared grants data
     * @protected
     */
    _prepareGrantsEditData(system: TalentData): Record<string, unknown> {
        const grants = system.grants || ({ skills: [], talents: [], traits: [], specialAbilities: [] } as TalentData['grants']);

        return {
            skills: (grants.skills || []).map((skill: { name: string; specialization: string; level: string }, index: number) => ({
                index,
                name: skill.name || '',
                specialization: skill.specialization || '',
                level: skill.level || 'trained',
            })),
            talents: (grants.talents || []).map((talent: { name: string; specialization: string; uuid: string }, index: number) => ({
                index,
                name: talent.name || '',
                specialization: talent.specialization || '',
                uuid: talent.uuid || '',
            })),
            traits: (grants.traits || []).map((trait: { name: string; level: number; uuid: string }, index: number) => ({
                index,
                name: trait.name || '',
                level: trait.level ?? null,
                uuid: trait.uuid || '',
            })),
            specialAbilities: (grants.specialAbilities || []).map((ability: { name: string; description: string }, index: number) => ({
                index,
                name: ability.name || '',
                description: ability.description || '',
            })),
        };
    }

    /* -------------------------------------------- */
    /*  Option Generators                           */
    /* -------------------------------------------- */

    /**
     * Get characteristic select options.
     * @returns {object[]}
     * @protected
     */
    _getCharacteristicOptions(): { value: string; label: string }[] {
        return [
            { value: 'weaponSkill', label: 'Weapon Skill (WS)' },
            { value: 'ballisticSkill', label: 'Ballistic Skill (BS)' },
            { value: 'strength', label: 'Strength (S)' },
            { value: 'toughness', label: 'Toughness (T)' },
            { value: 'agility', label: 'Agility (Ag)' },
            { value: 'intelligence', label: 'Intelligence (Int)' },
            { value: 'perception', label: 'Perception (Per)' },
            { value: 'willpower', label: 'Willpower (WP)' },
            { value: 'fellowship', label: 'Fellowship (Fel)' },
            { value: 'influence', label: 'Influence (Inf)' },
        ];
    }

    /**
     * Get skill select options.
     * @returns {object[]}
     * @protected
     */
    _getSkillOptions(): { value: string; label: string }[] {
        const skills = [
            'acrobatics',
            'athletics',
            'awareness',
            'barter',
            'blather',
            'carouse',
            'charm',
            'chemUse',
            'ciphers',
            'climb',
            'command',
            'commerce',
            'commonLore',
            'concealment',
            'contortionist',
            'deceive',
            'demolition',
            'disguise',
            'dodge',
            'drive',
            'evaluate',
            'forbiddenLore',
            'gamble',
            'inquiry',
            'interrogation',
            'intimidate',
            'invocation',
            'lipReading',
            'literacy',
            'logic',
            'medicae',
            'navigation',
            'parry',
            'performer',
            'pilot',
            'psyniscience',
            'scholasticLore',
            'scrutiny',
            'search',
            'secretTongue',
            'security',
            'shadowing',
            'silentMove',
            'sleightOfHand',
            'speakLanguage',
            'stealth',
            'survival',
            'swim',
            'techUse',
            'tracking',
            'trade',
            'wrangling',
        ];
        return skills.map((s) => ({
            value: s,
            label: this._formatSkillLabel(s),
        }));
    }

    /**
     * Get combat modifier select options.
     * @returns {object[]}
     * @protected
     */
    _getCombatModifierOptions(): { value: string; label: string }[] {
        return [
            { value: 'attack', label: 'Attack Bonus' },
            { value: 'damage', label: 'Damage Bonus' },
            { value: 'penetration', label: 'Penetration' },
            { value: 'defense', label: 'Defense Bonus' },
            { value: 'initiative', label: 'Initiative' },
            { value: 'speed', label: 'Movement Speed' },
        ];
    }

    /**
     * Get resource modifier select options.
     * @returns {object[]}
     * @protected
     */
    _getResourceOptions(): { value: string; label: string }[] {
        return [
            { value: 'wounds', label: 'Wounds' },
            { value: 'fate', label: 'Fate Points' },
            { value: 'insanity', label: 'Insanity Threshold' },
            { value: 'corruption', label: 'Corruption Threshold' },
        ];
    }

    /**
     * Get training level options.
     * @returns {object[]}
     * @protected
     */
    _getTrainingLevelOptions(): { value: string; label: string }[] {
        return [
            { value: 'trained', label: 'Trained' },
            { value: 'plus10', label: '+10' },
            { value: 'plus20', label: '+20' },
        ];
    }

    /* -------------------------------------------- */
    /*  Label Helpers                               */
    /* -------------------------------------------- */

    /**
     * Get characteristic label.
     * @param {string} key - Characteristic key
     * @returns {string}
     * @protected
     */
    _getCharacteristicLabel(key: string): string {
        const labels = {
            weaponSkill: 'Weapon Skill',
            ballisticSkill: 'Ballistic Skill',
            strength: 'Strength',
            toughness: 'Toughness',
            agility: 'Agility',
            intelligence: 'Intelligence',
            perception: 'Perception',
            willpower: 'Willpower',
            fellowship: 'Fellowship',
            influence: 'Influence',
        };
        return (labels as any)[key] || key;
    }

    /**
     * Format skill key to label.
     * @param {string} key - Skill key
     * @returns {string}
     * @protected
     */
    _formatSkillLabel(key: string): string {
        if (!key) return '';
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase())
            .trim();
    }

    /**
     * Get combat modifier label.
     * @param {string} key - Combat key
     * @returns {string}
     * @protected
     */
    _getCombatLabel(key: string): string {
        const labels = {
            attack: 'Attack Bonus',
            damage: 'Damage Bonus',
            penetration: 'Penetration',
            defense: 'Defense Bonus',
            initiative: 'Initiative',
            speed: 'Movement Speed',
        };
        return (labels as any)[key] || key;
    }

    /**
     * Get resource label.
     * @param {string} key - Resource key
     * @returns {string}
     * @protected
     */
    _getResourceLabel(key: string): string {
        const labels = {
            wounds: 'Wounds',
            fate: 'Fate Points',
            insanity: 'Insanity Threshold',
            corruption: 'Corruption Threshold',
        };
        return (labels as any)[key] || key;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @override */
    async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);

        // Set up section tab handlers
        this._setupSectionTabs();
    }

    /**
     * Set up section tab click handlers.
     * @protected
     */
    _setupSectionTabs(): void {
        const el = this.element as HTMLElement;
        const tabs = el.querySelectorAll('.ted-section-tab');
        tabs.forEach((tab: Element) => {
            tab.addEventListener('click', (event: Event) => {
                event.preventDefault();
                const section = (tab as HTMLElement).dataset.section;
                if (!section) return;

                // Update active tab
                tabs.forEach((t: Element) => t.classList.remove('active'));
                tab.classList.add('active');

                // Show/hide panels
                const panels = el.querySelectorAll('.ted-section-panel');
                panels.forEach((panel: Element) => {
                    panel.classList.toggle('active', (panel as HTMLElement).dataset.section === section);
                });

                this.#activeSection = section;
            });
        });
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle form submission.
     * @this {TalentEditorDialog}
     * @param {Event} event - Form submission event
     * @param {HTMLFormElement} form - The form element
     * @param {FormDataExtended} formData - The form data
     */
    static async #formHandler(this: any, event: Event, form: HTMLFormElement, formData: Record<string, unknown>): Promise<void> {
        const data = foundry.utils.expandObject(formData.object as Record<string, unknown>) as Record<string, Record<string, unknown>>;

        // Process the form data into the proper structure
        const updateData: Record<string, unknown> = {};

        // Helper to extract entries from an indexed sub-object
        const entries = (obj: unknown): Record<string, unknown>[] => (obj && typeof obj === 'object' ? (Object.values(obj) as Record<string, unknown>[]) : []);

        // Process prerequisites
        if (data.prerequisites) {
            updateData['system.prerequisites.text'] = (data.prerequisites.text as string) || '';

            // Convert characteristics array back to object
            const charReqs: Record<string, unknown> = {};
            for (const entry of entries(data.prerequisites.characteristics)) {
                if (entry.key && entry.value) {
                    charReqs[entry.key as string] = parseInt(entry.value as string) || 0;
                }
            }
            updateData['system.prerequisites.characteristics'] = charReqs;

            // Process skills array
            const skillReqs: string[] = [];
            for (const entry of entries(data.prerequisites.skills)) {
                if (entry.name) skillReqs.push(entry.name as string);
            }
            updateData['system.prerequisites.skills'] = skillReqs;

            // Process talents array
            const talentReqs: string[] = [];
            for (const entry of entries(data.prerequisites.talents)) {
                if (entry.name) talentReqs.push(entry.name as string);
            }
            updateData['system.prerequisites.talents'] = talentReqs;
        }

        // Process modifiers
        if (data.modifiers) {
            // Characteristics
            const charMods: Record<string, unknown> = {};
            for (const entry of entries(data.modifiers.characteristics)) {
                if (entry.key) {
                    charMods[entry.key as string] = parseInt(entry.value as string) || 0;
                }
            }
            updateData['system.modifiers.characteristics'] = charMods;

            // Skills
            const skillMods: Record<string, unknown> = {};
            for (const entry of entries(data.modifiers.skills)) {
                if (entry.key) {
                    skillMods[entry.key as string] = parseInt(entry.value as string) || 0;
                }
            }
            updateData['system.modifiers.skills'] = skillMods;

            // Combat
            for (const entry of entries(data.modifiers.combat)) {
                if (entry.key) {
                    updateData[`system.modifiers.combat.${entry.key as string}`] = parseInt(entry.value as string) || 0;
                }
            }

            // Resources
            for (const entry of entries(data.modifiers.resources)) {
                if (entry.key) {
                    updateData[`system.modifiers.resources.${entry.key as string}`] = parseInt(entry.value as string) || 0;
                }
            }

            // Other modifiers
            const otherMods: Record<string, unknown>[] = [];
            for (const entry of entries(data.modifiers.other)) {
                if (entry.key) {
                    otherMods.push({
                        key: entry.key as string,
                        label: (entry.label as string) || (entry.key as string),
                        value: parseInt(entry.value as string) || 0,
                        mode: (entry.mode as string) || 'add',
                    });
                }
            }
            updateData['system.modifiers.other'] = otherMods;
        }

        // Process situational modifiers
        if (data.situational) {
            // Characteristics - icon is derived, don't save it
            const sitCharMods: Record<string, unknown>[] = [];
            for (const entry of entries(data.situational.characteristics)) {
                if (entry.key && entry.condition) {
                    sitCharMods.push({
                        key: entry.key as string,
                        value: parseInt(entry.value as string) || 0,
                        condition: entry.condition as string,
                    });
                }
            }
            updateData['system.modifiers.situational.characteristics'] = sitCharMods;

            // Skills - icon is derived, don't save it
            const sitSkillMods: Record<string, unknown>[] = [];
            for (const entry of entries(data.situational.skills)) {
                if (entry.key && entry.condition) {
                    sitSkillMods.push({
                        key: entry.key as string,
                        value: parseInt(entry.value as string) || 0,
                        condition: entry.condition as string,
                    });
                }
            }
            updateData['system.modifiers.situational.skills'] = sitSkillMods;

            // Combat - icon is derived, don't save it
            const sitCombatMods: Record<string, unknown>[] = [];
            for (const entry of entries(data.situational.combat)) {
                if (entry.key && entry.condition) {
                    sitCombatMods.push({
                        key: entry.key as string,
                        value: parseInt(entry.value as string) || 0,
                        condition: entry.condition as string,
                    });
                }
            }
            updateData['system.modifiers.situational.combat'] = sitCombatMods;
        }

        // Process grants
        if (data.grants) {
            // Skills
            const grantedSkills: Record<string, unknown>[] = [];
            for (const entry of entries(data.grants.skills)) {
                if (entry.name) {
                    grantedSkills.push({
                        name: entry.name as string,
                        specialization: (entry.specialization as string) || '',
                        level: (entry.level as string) || 'trained',
                    });
                }
            }
            updateData['system.grants.skills'] = grantedSkills;

            // Talents
            const grantedTalents: Record<string, unknown>[] = [];
            for (const entry of entries(data.grants.talents)) {
                if (entry.name) {
                    grantedTalents.push({
                        name: entry.name as string,
                        specialization: (entry.specialization as string) || '',
                        uuid: (entry.uuid as string) || '',
                    });
                }
            }
            updateData['system.grants.talents'] = grantedTalents;

            // Traits
            const grantedTraits: Record<string, unknown>[] = [];
            for (const entry of entries(data.grants.traits)) {
                if (entry.name) {
                    grantedTraits.push({
                        name: entry.name as string,
                        level: entry.level ? parseInt(entry.level as string) : null,
                        uuid: (entry.uuid as string) || '',
                    });
                }
            }
            updateData['system.grants.traits'] = grantedTraits;

            // Special Abilities
            const grantedAbilities: Record<string, unknown>[] = [];
            for (const entry of entries(data.grants.specialAbilities)) {
                if (entry.name) {
                    grantedAbilities.push({
                        name: entry.name as string,
                        description: (entry.description as string) || '',
                    });
                }
            }
            updateData['system.grants.specialAbilities'] = grantedAbilities;
        }

        // Update the item
        await this.item.update(updateData);
        ui.notifications.info(`Updated ${this.item.name}`);
    }

    /**
     * Add a new item to an array field.
     * @this {TalentEditorDialog}
     * @param {Event} event - Click event
     * @param {HTMLElement} target - The clicked button
     */
    static #addItem(this: any, event: Event, target: HTMLElement): void {
        const { category, type } = target.dataset;
        if (!category || !type) return;

        // Find the container and add a new row
        const container = this.element.querySelector(`.ted-list[data-category="${category}"][data-type="${type}"]`);
        if (!container) return;

        // Get current count for indexing
        const existingRows = container.querySelectorAll('.ted-list-row');
        const newIndex = existingRows.length;

        // Create new row based on type
        const newRow = this._createNewRow(category, type, newIndex);
        if (newRow) {
            container.insertAdjacentHTML('beforeend', newRow);
        }
    }

    /**
     * Create HTML for a new row.
     * @param {string} category - The category (prerequisites, modifiers, etc.)
     * @param {string} type - The type within category
     * @param {number} index - The index for form naming
     * @returns {string} HTML string for the new row
     * @protected
     */
    _createNewRow(category: string, type: string, index: number): string | null {
        const characteristicOptions = this._getCharacteristicOptions()
            .map((o) => `<option value="${o.value}">${o.label}</option>`)
            .join('');
        const skillOptions = this._getSkillOptions()
            .map((o) => `<option value="${o.value}">${o.label}</option>`)
            .join('');
        const combatOptions = this._getCombatModifierOptions()
            .map((o) => `<option value="${o.value}">${o.label}</option>`)
            .join('');
        const resourceOptions = this._getResourceOptions()
            .map((o) => `<option value="${o.value}">${o.label}</option>`)
            .join('');
        const trainingOptions = this._getTrainingLevelOptions()
            .map((o) => `<option value="${o.value}">${o.label}</option>`)
            .join('');

        // Build row based on category and type
        switch (`${category}.${type}`) {
            case 'prerequisites.characteristics':
                return `
                    <div class="ted-list-row">
                        <select name="prerequisites.characteristics.${index}.key">
                            <option value="">-- Select --</option>
                            ${characteristicOptions}
                        </select>
                        <input type="number" name="prerequisites.characteristics.${index}.value" value="0" min="0" placeholder="Min value" />
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            case 'prerequisites.skills':
                return `
                    <div class="ted-list-row">
                        <input type="text" name="prerequisites.skills.${index}.name" value="" placeholder="Skill name (e.g., Dodge, Parry)" />
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            case 'prerequisites.talents':
                return `
                    <div class="ted-list-row">
                        <input type="text" name="prerequisites.talents.${index}.name" value="" placeholder="Talent name" />
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            case 'modifiers.characteristics':
                return `
                    <div class="ted-list-row">
                        <select name="modifiers.characteristics.${index}.key">
                            <option value="">-- Select --</option>
                            ${characteristicOptions}
                        </select>
                        <input type="number" name="modifiers.characteristics.${index}.value" value="0" placeholder="+/-" />
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            case 'modifiers.skills':
                return `
                    <div class="ted-list-row">
                        <select name="modifiers.skills.${index}.key">
                            <option value="">-- Select --</option>
                            ${skillOptions}
                        </select>
                        <input type="number" name="modifiers.skills.${index}.value" value="0" placeholder="+/-" />
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            case 'modifiers.combat':
                return `
                    <div class="ted-list-row">
                        <select name="modifiers.combat.${index}.key">
                            <option value="">-- Select --</option>
                            ${combatOptions}
                        </select>
                        <input type="number" name="modifiers.combat.${index}.value" value="0" placeholder="+/-" />
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            case 'modifiers.resources':
                return `
                    <div class="ted-list-row">
                        <select name="modifiers.resources.${index}.key">
                            <option value="">-- Select --</option>
                            ${resourceOptions}
                        </select>
                        <input type="number" name="modifiers.resources.${index}.value" value="0" placeholder="+/-" />
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            case 'modifiers.other':
                return `
                    <div class="ted-list-row ted-list-row--wide">
                        <input type="text" name="modifiers.other.${index}.key" value="" placeholder="Key (e.g., movement)" />
                        <input type="text" name="modifiers.other.${index}.label" value="" placeholder="Label" />
                        <input type="number" name="modifiers.other.${index}.value" value="0" placeholder="+/-" />
                        <select name="modifiers.other.${index}.mode">
                            <option value="add">Add</option>
                            <option value="multiply">Multiply</option>
                            <option value="override">Override</option>
                        </select>
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            case 'situational.characteristics':
                return `
                    <div class="ted-list-row ted-list-row--stacked">
                        <div class="ted-row-inline">
                            <select name="situational.characteristics.${index}.key">
                                <option value="">-- Select --</option>
                                ${characteristicOptions}
                            </select>
                            <input type="number" name="situational.characteristics.${index}.value" value="0" placeholder="+/-" />
                            <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <textarea name="situational.characteristics.${index}.condition" rows="2" class="ted-textarea-condition" placeholder="Condition description (e.g., 'When fighting in melee combat')"></textarea>
                    </div>`;

            case 'situational.skills':
                return `
                    <div class="ted-list-row ted-list-row--stacked">
                        <div class="ted-row-inline">
                            <select name="situational.skills.${index}.key">
                                <option value="">-- Select --</option>
                                ${skillOptions}
                            </select>
                            <input type="number" name="situational.skills.${index}.value" value="0" placeholder="+/-" />
                            <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <textarea name="situational.skills.${index}.condition" rows="2" class="ted-textarea-condition" placeholder="Condition description (e.g., 'When performing acrobatic maneuvers')"></textarea>
                    </div>`;

            case 'situational.combat':
                return `
                    <div class="ted-list-row ted-list-row--stacked">
                        <div class="ted-row-inline">
                            <select name="situational.combat.${index}.key">
                                <option value="">-- Select --</option>
                                ${combatOptions}
                            </select>
                            <input type="number" name="situational.combat.${index}.value" value="0" placeholder="+/-" />
                            <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <textarea name="situational.combat.${index}.condition" rows="2" class="ted-textarea-condition" placeholder="Condition description (e.g., 'When attacking from surprise')"></textarea>
                    </div>`;

            case 'grants.skills':
                return `
                    <div class="ted-list-row ted-list-row--wide">
                        <input type="text" name="grants.skills.${index}.name" value="" placeholder="Skill name" />
                        <input type="text" name="grants.skills.${index}.specialization" value="" placeholder="Specialization (optional)" />
                        <select name="grants.skills.${index}.level">
                            ${trainingOptions}
                        </select>
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            case 'grants.talents':
                return `
                    <div class="ted-list-row ted-list-row--wide">
                        <input type="text" name="grants.talents.${index}.name" value="" placeholder="Talent name" />
                        <input type="text" name="grants.talents.${index}.specialization" value="" placeholder="Specialization (optional)" />
                        <input type="text" name="grants.talents.${index}.uuid" value="" placeholder="UUID (optional)" />
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            case 'grants.traits':
                return `
                    <div class="ted-list-row ted-list-row--wide">
                        <input type="text" name="grants.traits.${index}.name" value="" placeholder="Trait name" />
                        <input type="number" name="grants.traits.${index}.level" value="" placeholder="Level (optional)" />
                        <input type="text" name="grants.traits.${index}.uuid" value="" placeholder="UUID (optional)" />
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            case 'grants.specialAbilities':
                return `
                    <div class="ted-list-row ted-list-row--column">
                        <input type="text" name="grants.specialAbilities.${index}.name" value="" placeholder="Ability name" />
                        <textarea name="grants.specialAbilities.${index}.description" rows="2" placeholder="Description"></textarea>
                        <button type="button" class="ted-btn-remove" data-action="removeItem"><i class="fa-solid fa-trash"></i></button>
                    </div>`;

            default:
                return null;
        }
    }

    /**
     * Remove an item from an array field.
     * @this {TalentEditorDialog}
     * @param {Event} event - Click event
     * @param {HTMLElement} target - The clicked button
     */
    static #removeItem(this: any, event: Event, target: HTMLElement): void {
        const row = target.closest('.ted-list-row');
        if (row) {
            row.remove();
        }
    }

    /**
     * Switch to a different section.
     * @this {TalentEditorDialog}
     * @param {Event} event - Click event
     * @param {HTMLElement} target - The clicked button
     */
    static async #switchSection(this: any, event: Event, target: HTMLElement): Promise<void> {
        const section = target.dataset.section;
        if (!section) return;

        this.#activeSection = section;
        await this.render({ force: true });
    }
}
