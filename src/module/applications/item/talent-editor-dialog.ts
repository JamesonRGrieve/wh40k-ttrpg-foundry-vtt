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
import type { ApplicationV2Ctor, FoundryApplicationApiLike } from '../api/application-types.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's applications namespace is not natively typed; narrow to the API surface we need
const applicationAPI = (foundry.applications as unknown as { api: FoundryApplicationApiLike & { ApplicationV2: ApplicationV2Ctor } }).api;
const { ApplicationV2, HandlebarsApplicationMixin } = applicationAPI;

/** Dialog window title localization key, hoisted so the DEFAULT_OPTIONS entry references an identifier. */
const DIALOG_TITLE = 'WH40K.Talent.EditorTitle';

/** Talent system data with mixin-inherited modifiers visible to the type system. */
type TalentSystem = TalentData & Pick<ModifiersTemplate, 'modifiers'>;

/** Item shape consumed by this dialog. */
interface TalentEditorItem {
    name: string;
    system: TalentSystem;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update accepts a free-form nested update payload
    update: (data: Record<string, unknown>) => Promise<unknown>;
}

/** Select option pair. */
interface SelectOption {
    value: string;
    label: string;
}

/** Prepared prerequisites payload for the Handlebars context. */
interface PreparedPrerequisites {
    text: string;
    characteristics: Array<{ key: string; label: string; value: number }>;
    skills: Array<{ name: string }>;
    talents: Array<{ name: string }>;
}

/** Single labelled, indexed entry used in many prepared sections. */
interface LabelledEntry {
    key: string;
    label: string;
    value: number;
}

interface ModOtherEntry {
    index: number;
    key: string;
    label: string;
    value: number;
    mode: string;
}

interface PreparedModifiers {
    characteristics: LabelledEntry[];
    skills: LabelledEntry[];
    combat: LabelledEntry[];
    resources: LabelledEntry[];
    other: ModOtherEntry[];
}

interface SitEntry {
    index: number;
    key: string;
    label: string;
    value: number;
    condition: string;
}

interface PreparedSituational {
    characteristics: SitEntry[];
    skills: SitEntry[];
    combat: SitEntry[];
}

interface PreparedGrants {
    skills: Array<{ index: number; name: string; specialization: string; level: string }>;
    talents: Array<{ index: number; name: string; specialization: string; uuid: string }>;
    traits: Array<{ index: number; name: string; level: number | null; uuid: string }>;
    specialAbilities: Array<{ index: number; name: string; description: string }>;
}

interface FormOtherMod {
    key: string;
    label: string;
    value: number;
    mode: string;
}

interface FormSituationalMod {
    key: string;
    value: number;
    condition: string;
}

interface FormGrantedSkill {
    name: string;
    specialization: string;
    level: string;
}

interface FormGrantedTalent {
    name: string;
    specialization: string;
    uuid: string;
}

interface FormGrantedTrait {
    name: string;
    level: number | null;
    uuid: string;
}

interface FormGrantedAbility {
    name: string;
    description: string;
}

interface PreparedContext {
    item: TalentEditorItem;
    system: TalentSystem;
    activeSection: string;
    prerequisites: PreparedPrerequisites;
    modifiers: PreparedModifiers;
    situational: PreparedSituational;
    grants: PreparedGrants;
    characteristicOptions: SelectOption[];
    skillOptions: SelectOption[];
    combatOptions: SelectOption[];
    resourceOptions: SelectOption[];
    trainingLevelOptions: SelectOption[];
    sections: { prerequisites: boolean; modifiers: boolean; situational: boolean; grants: boolean };
}

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
            title: DIALOG_TITLE,
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
    item: TalentEditorItem;

    /**
     * Current active section.
     * @type {string}
     */
    #activeSection = 'prerequisites';

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 constructor options are a free-form payload passed through to super
    constructor(options: Record<string, unknown> = {}) {
        super(options);
        this.item = options['item'] as TalentEditorItem;
        const initialSection = options['initialSection'];
        this.#activeSection = typeof initialSection === 'string' && initialSection !== '' ? initialSection : 'prerequisites';
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    override get title(): string {
        return `Edit: ${this.item.name}`;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line @typescript-eslint/require-await, no-restricted-syntax, @typescript-eslint/no-unused-vars -- boundary: ApplicationV2 _prepareContext options is a framework-defined free-form payload
    override async _prepareContext(_options: Record<string, unknown>): Promise<PreparedContext> {
        const system: TalentSystem = this.item.system;

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
    _preparePrerequisitesData(system: TalentSystem): PreparedPrerequisites {
        const prereqs = system.prerequisites;

        // Convert characteristics object to array for template iteration
        const characteristicReqs: PreparedPrerequisites['characteristics'] = Object.entries(prereqs.characteristics).flatMap(([key, value]) =>
            typeof value === 'number' && value > 0 ? [{ key, label: this._getCharacteristicLabel(key), value }] : [],
        );

        return {
            text: prereqs.text,
            characteristics: characteristicReqs,
            skills: prereqs.skills.map((s) => ({ name: s })),
            talents: prereqs.talents.map((t) => ({ name: t })),
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare modifiers data for editing.
     * @param {object} system - The item's system data
     * @returns {object} Prepared modifiers data
     * @protected
     */
    _prepareModifiersEditData(system: TalentSystem): PreparedModifiers {
        const mods = system.modifiers;

        // Convert characteristics object to array
        const characteristics: LabelledEntry[] = Object.entries(mods.characteristics).flatMap(([key, value]) =>
            typeof value === 'number' && value !== 0 ? [{ key, label: this._getCharacteristicLabel(key), value }] : [],
        );

        // Convert skills object to array
        const skills: LabelledEntry[] = Object.entries(mods.skills).flatMap(([key, value]) =>
            typeof value === 'number' && value !== 0 ? [{ key, label: this._formatSkillLabel(key), value }] : [],
        );

        // Combat modifiers
        const combat: LabelledEntry[] = Object.entries(mods.combat)
            .filter(([, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._getCombatLabel(key),
                value,
            }));

        // Resource modifiers
        const resources: LabelledEntry[] = Object.entries(mods.resources)
            .filter(([, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._getResourceLabel(key),
                value,
            }));

        // Other modifiers
        const other = mods.other.map((mod, index) => ({
            index,
            key: mod.key,
            label: mod.label,
            value: mod.value,
            mode: mod.mode,
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
    _prepareSituationalEditData(system: TalentSystem): PreparedSituational {
        const situational = system.modifiers.situational;

        return {
            characteristics: situational.characteristics.map((mod, index) => ({
                index,
                key: mod.key,
                label: this._getCharacteristicLabel(mod.key),
                value: mod.value,
                condition: mod.condition,
            })),
            skills: situational.skills.map((mod, index) => ({
                index,
                key: mod.key,
                label: this._formatSkillLabel(mod.key),
                value: mod.value,
                condition: mod.condition,
            })),
            combat: situational.combat.map((mod, index) => ({
                index,
                key: mod.key,
                label: this._getCombatLabel(mod.key),
                value: mod.value,
                condition: mod.condition,
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
    _prepareGrantsEditData(system: TalentSystem): PreparedGrants {
        const grants = system.grants;

        return {
            skills: grants.skills.map((skill, index) => ({
                index,
                name: skill.name,
                specialization: skill.specialization,
                level: skill.level !== '' ? skill.level : 'trained',
            })),
            talents: grants.talents.map((talent, index) => ({
                index,
                name: talent.name,
                specialization: talent.specialization,
                uuid: talent.uuid,
            })),
            traits: grants.traits.map((trait, index) => ({
                index,
                name: trait.name,
                level: trait.level !== 0 ? trait.level : null,
                uuid: trait.uuid,
            })),
            specialAbilities: grants.specialAbilities.map((ability, index) => ({
                index,
                name: ability.name,
                description: ability.description,
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
        const labels: Record<string, string> = {
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
        return labels[key] ?? key;
    }

    /**
     * Format skill key to label.
     * @param {string} key - Skill key
     * @returns {string}
     * @protected
     */
    _formatSkillLabel(key: string): string {
        if (key === '') return '';
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
        const labels: Record<string, string> = {
            attack: 'Attack Bonus',
            damage: 'Damage Bonus',
            penetration: 'Penetration',
            defense: 'Defense Bonus',
            initiative: 'Initiative',
            speed: 'Movement Speed',
        };
        return labels[key] ?? key;
    }

    /**
     * Get resource label.
     * @param {string} key - Resource key
     * @returns {string}
     * @protected
     */
    _getResourceLabel(key: string): string {
        const labels: Record<string, string> = {
            wounds: 'Wounds',
            fate: 'Fate Points',
            insanity: 'Insanity Threshold',
            corruption: 'Corruption Threshold',
        };
        return labels[key] ?? key;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender context/options are framework-defined free-form payloads
    override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);

        // Set up section tab handlers
        this._setupSectionTabs();
    }

    /**
     * Set up section tab click handlers.
     * @protected
     */
    _setupSectionTabs(): void {
        const el = this.element;
        const tabs = el.querySelectorAll('.ted-section-tab');
        tabs.forEach((tab: Element) => {
            tab.addEventListener('click', (event: Event) => {
                event.preventDefault();
                const section = (tab as HTMLElement).dataset['section'];
                if (section === undefined || section === '') return;

                // Update active tab
                tabs.forEach((t: Element) => t.classList.remove('active'));
                tab.classList.add('active');

                // Show/hide panels
                const panels = el.querySelectorAll('.ted-section-panel');
                panels.forEach((panel: Element) => {
                    panel.classList.toggle('active', (panel as HTMLElement).dataset['section'] === section);
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
    // eslint-disable-next-line complexity, no-restricted-syntax -- boundary: form data is a free-form nested payload; coercion happens row-by-row below
    static async #formHandler(this: TalentEditorDialog, _event: Event, _form: HTMLFormElement, formData: { object: Record<string, unknown> }): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry expandObject yields a free-form nested structure shaped by template field names
        const data = foundry.utils.expandObject(formData.object) as Record<string, Record<string, unknown> | undefined>;

        // Process the form data into the proper structure
        // eslint-disable-next-line no-restricted-syntax -- boundary: updateData is fed directly to Foundry Document.update which accepts a free-form payload
        const updateData: Record<string, unknown> = {};

        // Helper to extract entries from an indexed sub-object
        /* eslint-disable-next-line no-restricted-syntax --
           boundary: type-guard helper that narrows a free-form expandObject sub-object into row records */
        const entries = (obj: unknown): Record<string, unknown>[] =>
            // eslint-disable-next-line no-restricted-syntax -- boundary: see helper signature above
            obj !== null && obj !== undefined && typeof obj === 'object' ? (Object.values(obj) as Record<string, unknown>[]) : [];

        // Helper to coerce a form field to a non-empty string, returning '' otherwise.
        // eslint-disable-next-line no-restricted-syntax -- boundary: type-guard helper called immediately on free-form form data
        const str = (v: unknown): string => (typeof v === 'string' ? v : '');
        // Helper to coerce to integer, defaulting to 0.
        // eslint-disable-next-line no-restricted-syntax -- boundary: type-guard helper called immediately on free-form form data
        const int = (v: unknown): number => {
            const n = parseInt(String(v), 10);
            return isNaN(n) ? 0 : n;
        };

        // Process prerequisites
        const prerequisites = data['prerequisites'];
        if (prerequisites !== undefined) {
            updateData['system.prerequisites.text'] = str(prerequisites['text']);

            // Convert characteristics array back to object
            const charReqs: Record<string, number> = {};
            for (const entry of entries(prerequisites['characteristics'])) {
                const key = str(entry['key']);
                if (key !== '' && entry['value'] !== undefined && entry['value'] !== '') {
                    charReqs[key] = int(entry['value']);
                }
            }
            updateData['system.prerequisites.characteristics'] = charReqs;

            // Process skills array
            const skillReqs: string[] = [];
            for (const entry of entries(prerequisites['skills'])) {
                const name = str(entry['name']);
                if (name !== '') skillReqs.push(name);
            }
            updateData['system.prerequisites.skills'] = skillReqs;

            // Process talents array
            const talentReqs: string[] = [];
            for (const entry of entries(prerequisites['talents'])) {
                const name = str(entry['name']);
                if (name !== '') talentReqs.push(name);
            }
            updateData['system.prerequisites.talents'] = talentReqs;
        }

        // Process modifiers
        const modifiers = data['modifiers'];
        if (modifiers !== undefined) {
            // Characteristics
            const charMods: Record<string, number> = {};
            for (const entry of entries(modifiers['characteristics'])) {
                const key = str(entry['key']);
                if (key !== '') charMods[key] = int(entry['value']);
            }
            updateData['system.modifiers.characteristics'] = charMods;

            // Skills
            const skillMods: Record<string, number> = {};
            for (const entry of entries(modifiers['skills'])) {
                const key = str(entry['key']);
                if (key !== '') skillMods[key] = int(entry['value']);
            }
            updateData['system.modifiers.skills'] = skillMods;

            // Combat
            for (const entry of entries(modifiers['combat'])) {
                const key = str(entry['key']);
                if (key !== '') updateData[`system.modifiers.combat.${key}`] = int(entry['value']);
            }

            // Resources
            for (const entry of entries(modifiers['resources'])) {
                const key = str(entry['key']);
                if (key !== '') updateData[`system.modifiers.resources.${key}`] = int(entry['value']);
            }

            // Other modifiers
            const otherMods: FormOtherMod[] = [];
            for (const entry of entries(modifiers['other'])) {
                const key = str(entry['key']);
                if (key !== '') {
                    const label = str(entry['label']);
                    const mode = str(entry['mode']);
                    otherMods.push({
                        key,
                        label: label !== '' ? label : key,
                        value: int(entry['value']),
                        mode: mode !== '' ? mode : 'add',
                    });
                }
            }
            updateData['system.modifiers.other'] = otherMods;
        }

        // Process situational modifiers
        const situational = data['situational'];
        if (situational !== undefined) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: type-guard helper called immediately on free-form form data
            const collect = (entriesIn: unknown): FormSituationalMod[] => {
                const out: FormSituationalMod[] = [];
                for (const entry of entries(entriesIn)) {
                    const key = str(entry['key']);
                    const condition = str(entry['condition']);
                    if (key !== '' && condition !== '') {
                        out.push({ key, value: int(entry['value']), condition });
                    }
                }
                return out;
            };
            updateData['system.modifiers.situational.characteristics'] = collect(situational['characteristics']);
            updateData['system.modifiers.situational.skills'] = collect(situational['skills']);
            updateData['system.modifiers.situational.combat'] = collect(situational['combat']);
        }

        // Process grants
        const grants = data['grants'];
        if (grants !== undefined) {
            // Skills
            const grantedSkills: FormGrantedSkill[] = [];
            for (const entry of entries(grants['skills'])) {
                const name = str(entry['name']);
                if (name !== '') {
                    const level = str(entry['level']);
                    grantedSkills.push({
                        name,
                        specialization: str(entry['specialization']),
                        level: level !== '' ? level : 'trained',
                    });
                }
            }
            updateData['system.grants.skills'] = grantedSkills;

            // Talents
            const grantedTalents: FormGrantedTalent[] = [];
            for (const entry of entries(grants['talents'])) {
                const name = str(entry['name']);
                if (name !== '') {
                    grantedTalents.push({
                        name,
                        specialization: str(entry['specialization']),
                        uuid: str(entry['uuid']),
                    });
                }
            }
            updateData['system.grants.talents'] = grantedTalents;

            // Traits
            const grantedTraits: FormGrantedTrait[] = [];
            for (const entry of entries(grants['traits'])) {
                const name = str(entry['name']);
                if (name !== '') {
                    const level = str(entry['level']);
                    grantedTraits.push({
                        name,
                        level: level !== '' ? parseInt(level, 10) : null,
                        uuid: str(entry['uuid']),
                    });
                }
            }
            updateData['system.grants.traits'] = grantedTraits;

            // Special Abilities
            const grantedAbilities: FormGrantedAbility[] = [];
            for (const entry of entries(grants['specialAbilities'])) {
                const name = str(entry['name']);
                if (name !== '') {
                    grantedAbilities.push({
                        name,
                        description: str(entry['description']),
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
    static #addItem(this: TalentEditorDialog, _event: Event, target: HTMLElement): void {
        const { category, type } = target.dataset;
        if (category === undefined || category === '' || type === undefined || type === '') return;

        // Find the container and add a new row
        const container = this.element.querySelector(`.ted-list[data-category="${category}"][data-type="${type}"]`);
        if (container === null) return;

        // Get current count for indexing
        const existingRows = container.querySelectorAll('.ted-list-row');
        const newIndex = existingRows.length;

        // Create new row based on type
        const newRow = this._createNewRow(category, type, newIndex);
        if (newRow !== null) {
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
    static #removeItem(this: TalentEditorDialog, _event: Event, target: HTMLElement): void {
        const row = target.closest('.ted-list-row');
        if (row !== null) {
            row.remove();
        }
    }

    /**
     * Switch to a different section.
     * @this {TalentEditorDialog}
     * @param {Event} event - Click event
     * @param {HTMLElement} target - The clicked button
     */
    static async #switchSection(this: TalentEditorDialog, _event: Event, target: HTMLElement): Promise<void> {
        const section = target.dataset['section'];
        if (section === undefined || section === '') return;

        this.#activeSection = section;
        await this.render({ force: true });
    }
}
