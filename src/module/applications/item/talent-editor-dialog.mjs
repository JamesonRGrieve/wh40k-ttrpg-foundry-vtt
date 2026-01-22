/**
 * @file TalentEditorDialog - Dialog for editing complex talent fields
 *
 * Provides tabbed interface for editing:
 * - Prerequisites (text, characteristics, skills, talents)
 * - Modifiers (characteristics, skills, combat, resources, other)
 * - Situational modifiers (with conditions)
 * - Grants (skills, talents, traits, special abilities)
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
        classes: ['rogue-trader', 'dialog', 'talent-editor-dialog'],
        tag: 'form',
        form: {
            handler: this.#formHandler,
            closeOnSubmit: true,
        },
        actions: {
            addItem: this.#addItem,
            removeItem: this.#removeItem,
            switchSection: this.#switchSection,
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
            template: 'systems/rogue-trader/templates/dialogs/talent-editor-dialog.hbs',
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
    item;

    /**
     * Current active section.
     * @type {string}
     */
    #activeSection = 'prerequisites';

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    constructor(options = {}) {
        super(options);
        this.item = options.item;
        this.#activeSection = options.initialSection || 'prerequisites';
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
    async _prepareContext(options) {
        const system = this.item.system;

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
    _preparePrerequisitesData(system) {
        const prereqs = system.prerequisites || {};

        // Convert characteristics object to array for template iteration
        const characteristicReqs = Object.entries(prereqs.characteristics || {})
            .filter(([_, value]) => value > 0)
            .map(([key, value]) => ({
                key,
                label: this._getCharacteristicLabel(key),
                value,
            }));

        return {
            text: prereqs.text || '',
            characteristics: characteristicReqs,
            skills: (prereqs.skills || []).map((s) => ({ name: s })),
            talents: (prereqs.talents || []).map((t) => ({ name: t })),
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare modifiers data for editing.
     * @param {object} system - The item's system data
     * @returns {object} Prepared modifiers data
     * @protected
     */
    _prepareModifiersEditData(system) {
        const mods = system.modifiers || {};

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
        const other = (mods.other || []).map((mod, index) => ({
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
    _prepareSituationalEditData(system) {
        const situational = system.modifiers?.situational || {};

        return {
            characteristics: (situational.characteristics || []).map((mod, index) => ({
                index,
                key: mod.key || '',
                label: this._getCharacteristicLabel(mod.key),
                value: mod.value || 0,
                condition: mod.condition || '',
            })),
            skills: (situational.skills || []).map((mod, index) => ({
                index,
                key: mod.key || '',
                label: this._formatSkillLabel(mod.key),
                value: mod.value || 0,
                condition: mod.condition || '',
            })),
            combat: (situational.combat || []).map((mod, index) => ({
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
    _prepareGrantsEditData(system) {
        const grants = system.grants || {};

        return {
            skills: (grants.skills || []).map((skill, index) => ({
                index,
                name: skill.name || '',
                specialization: skill.specialization || '',
                level: skill.level || 'trained',
            })),
            talents: (grants.talents || []).map((talent, index) => ({
                index,
                name: talent.name || '',
                specialization: talent.specialization || '',
                uuid: talent.uuid || '',
            })),
            traits: (grants.traits || []).map((trait, index) => ({
                index,
                name: trait.name || '',
                level: trait.level ?? null,
                uuid: trait.uuid || '',
            })),
            specialAbilities: (grants.specialAbilities || []).map((ability, index) => ({
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
    _getCharacteristicOptions() {
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
    _getSkillOptions() {
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
    _getCombatModifierOptions() {
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
    _getResourceOptions() {
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
    _getTrainingLevelOptions() {
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
    _getCharacteristicLabel(key) {
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
        return labels[key] || key;
    }

    /**
     * Format skill key to label.
     * @param {string} key - Skill key
     * @returns {string}
     * @protected
     */
    _formatSkillLabel(key) {
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
    _getCombatLabel(key) {
        const labels = {
            attack: 'Attack Bonus',
            damage: 'Damage Bonus',
            penetration: 'Penetration',
            defense: 'Defense Bonus',
            initiative: 'Initiative',
            speed: 'Movement Speed',
        };
        return labels[key] || key;
    }

    /**
     * Get resource label.
     * @param {string} key - Resource key
     * @returns {string}
     * @protected
     */
    _getResourceLabel(key) {
        const labels = {
            wounds: 'Wounds',
            fate: 'Fate Points',
            insanity: 'Insanity Threshold',
            corruption: 'Corruption Threshold',
        };
        return labels[key] || key;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Set up section tab handlers
        this._setupSectionTabs();
    }

    /**
     * Set up section tab click handlers.
     * @protected
     */
    _setupSectionTabs() {
        const tabs = this.element.querySelectorAll('.ted-section-tab');
        tabs.forEach((tab) => {
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                const section = tab.dataset.section;
                if (!section) return;

                // Update active tab
                tabs.forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');

                // Show/hide panels
                const panels = this.element.querySelectorAll('.ted-section-panel');
                panels.forEach((panel) => {
                    panel.classList.toggle('active', panel.dataset.section === section);
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
    static async #formHandler(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);

        // Process the form data into the proper structure
        const updateData = {};

        // Process prerequisites
        if (data.prerequisites) {
            updateData['system.prerequisites.text'] = data.prerequisites.text || '';

            // Convert characteristics array back to object
            const charReqs = {};
            if (data.prerequisites.characteristics) {
                for (const entry of Object.values(data.prerequisites.characteristics)) {
                    if (entry.key && entry.value) {
                        charReqs[entry.key] = parseInt(entry.value) || 0;
                    }
                }
            }
            updateData['system.prerequisites.characteristics'] = charReqs;

            // Process skills array
            const skillReqs = [];
            if (data.prerequisites.skills) {
                for (const entry of Object.values(data.prerequisites.skills)) {
                    if (entry.name) skillReqs.push(entry.name);
                }
            }
            updateData['system.prerequisites.skills'] = skillReqs;

            // Process talents array
            const talentReqs = [];
            if (data.prerequisites.talents) {
                for (const entry of Object.values(data.prerequisites.talents)) {
                    if (entry.name) talentReqs.push(entry.name);
                }
            }
            updateData['system.prerequisites.talents'] = talentReqs;
        }

        // Process modifiers
        if (data.modifiers) {
            // Characteristics
            const charMods = {};
            if (data.modifiers.characteristics) {
                for (const entry of Object.values(data.modifiers.characteristics)) {
                    if (entry.key) {
                        charMods[entry.key] = parseInt(entry.value) || 0;
                    }
                }
            }
            updateData['system.modifiers.characteristics'] = charMods;

            // Skills
            const skillMods = {};
            if (data.modifiers.skills) {
                for (const entry of Object.values(data.modifiers.skills)) {
                    if (entry.key) {
                        skillMods[entry.key] = parseInt(entry.value) || 0;
                    }
                }
            }
            updateData['system.modifiers.skills'] = skillMods;

            // Combat
            if (data.modifiers.combat) {
                for (const entry of Object.values(data.modifiers.combat)) {
                    if (entry.key) {
                        updateData[`system.modifiers.combat.${entry.key}`] = parseInt(entry.value) || 0;
                    }
                }
            }

            // Resources
            if (data.modifiers.resources) {
                for (const entry of Object.values(data.modifiers.resources)) {
                    if (entry.key) {
                        updateData[`system.modifiers.resources.${entry.key}`] = parseInt(entry.value) || 0;
                    }
                }
            }

            // Other modifiers
            const otherMods = [];
            if (data.modifiers.other) {
                for (const entry of Object.values(data.modifiers.other)) {
                    if (entry.key) {
                        otherMods.push({
                            key: entry.key,
                            label: entry.label || entry.key,
                            value: parseInt(entry.value) || 0,
                            mode: entry.mode || 'add',
                        });
                    }
                }
            }
            updateData['system.modifiers.other'] = otherMods;
        }

        // Process situational modifiers
        if (data.situational) {
            // Characteristics - icon is derived, don't save it
            const sitCharMods = [];
            if (data.situational.characteristics) {
                for (const entry of Object.values(data.situational.characteristics)) {
                    if (entry.key && entry.condition) {
                        sitCharMods.push({
                            key: entry.key,
                            value: parseInt(entry.value) || 0,
                            condition: entry.condition,
                        });
                    }
                }
            }
            updateData['system.modifiers.situational.characteristics'] = sitCharMods;

            // Skills - icon is derived, don't save it
            const sitSkillMods = [];
            if (data.situational.skills) {
                for (const entry of Object.values(data.situational.skills)) {
                    if (entry.key && entry.condition) {
                        sitSkillMods.push({
                            key: entry.key,
                            value: parseInt(entry.value) || 0,
                            condition: entry.condition,
                        });
                    }
                }
            }
            updateData['system.modifiers.situational.skills'] = sitSkillMods;

            // Combat - icon is derived, don't save it
            const sitCombatMods = [];
            if (data.situational.combat) {
                for (const entry of Object.values(data.situational.combat)) {
                    if (entry.key && entry.condition) {
                        sitCombatMods.push({
                            key: entry.key,
                            value: parseInt(entry.value) || 0,
                            condition: entry.condition,
                        });
                    }
                }
            }
            updateData['system.modifiers.situational.combat'] = sitCombatMods;
        }

        // Process grants
        if (data.grants) {
            // Skills
            const grantedSkills = [];
            if (data.grants.skills) {
                for (const entry of Object.values(data.grants.skills)) {
                    if (entry.name) {
                        grantedSkills.push({
                            name: entry.name,
                            specialization: entry.specialization || '',
                            level: entry.level || 'trained',
                        });
                    }
                }
            }
            updateData['system.grants.skills'] = grantedSkills;

            // Talents
            const grantedTalents = [];
            if (data.grants.talents) {
                for (const entry of Object.values(data.grants.talents)) {
                    if (entry.name) {
                        grantedTalents.push({
                            name: entry.name,
                            specialization: entry.specialization || '',
                            uuid: entry.uuid || '',
                        });
                    }
                }
            }
            updateData['system.grants.talents'] = grantedTalents;

            // Traits
            const grantedTraits = [];
            if (data.grants.traits) {
                for (const entry of Object.values(data.grants.traits)) {
                    if (entry.name) {
                        grantedTraits.push({
                            name: entry.name,
                            level: entry.level ? parseInt(entry.level) : null,
                            uuid: entry.uuid || '',
                        });
                    }
                }
            }
            updateData['system.grants.traits'] = grantedTraits;

            // Special Abilities
            const grantedAbilities = [];
            if (data.grants.specialAbilities) {
                for (const entry of Object.values(data.grants.specialAbilities)) {
                    if (entry.name) {
                        grantedAbilities.push({
                            name: entry.name,
                            description: entry.description || '',
                        });
                    }
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
    static async #addItem(event, target) {
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
    _createNewRow(category, type, index) {
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
    static async #removeItem(event, target) {
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
    static async #switchSection(event, target) {
        const section = target.dataset.section;
        if (!section) return;

        this.#activeSection = section;
        await this.render({ force: true });
    }
}
