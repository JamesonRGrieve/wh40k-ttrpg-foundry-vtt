/**
 * @file TalentSheet - ApplicationV2 sheet for talent items
 *
 * Features:
 * - Modern tabbed interface following origin-path-sheet patterns
 * - Edit mode toggle for character-owned talents
 * - Complete coverage of all TalentData model fields
 * - Font Awesome 6 Pro icons throughout
 * - Translucent gothic styling
 */

import type TalentData from '../../data/item/talent.ts';
import type DescriptionTemplate from '../../data/shared/description-template.ts';
import type ModifiersTemplate from '../../data/shared/modifiers-template.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import BaseItemSheet from './base-item-sheet.ts';

/** Tab label localization keys, hoisted so the static TABS entries reference identifiers. */
const TAB_LABEL_OVERVIEW = 'WH40K.Tabs.Overview';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';
const TAB_LABEL_PROPERTIES = 'WH40K.Tabs.Properties';
const TAB_LABEL_DESCRIPTION = 'WH40K.Tabs.Description';

/** TalentData with mixin-inherited fields visible to the type system. */
type TalentSystem = TalentData & Pick<ModifiersTemplate, 'modifiers'> & Pick<DescriptionTemplate, 'description' | 'source'>;

/** Talent item document narrowed to its DataModel. */
type TalentItem = WH40KItemDocument & { system: TalentSystem };

/* -------------------------------------------- */
/*  Prepared context shapes                     */
/* -------------------------------------------- */

interface TalentDisplayData {
    identifier: string;
    category: string;
    categoryLabel: string;
    tier: number;
    tierLabel: string;
    cost: number;
    isPassive: boolean;
    isRollable: boolean;
    stackable: boolean;
    rank: number;
    hasSpecialization: boolean;
    specialization: string;
    notes: string;
    source: string;
    sourceBook: string;
    sourcePage: string;
    aptitudes: string[];
    hasAptitudes: boolean;
    benefit: string;
    hasBenefit: boolean;
    fullName: string;
}

interface PrerequisiteCharRow {
    key: string;
    label: string;
    short: string;
    value: number;
}

interface PrerequisitesDisplayData {
    text: string;
    hasText: boolean;
    characteristics: PrerequisiteCharRow[];
    hasCharacteristics: boolean;
    skills: string[];
    hasSkills: boolean;
    talents: string[];
    hasTalents: boolean;
    hasAny: boolean;
    label: string;
}

interface ModifierRow {
    key: string;
    label: string;
    short?: string;
    value: number;
    positive: boolean;
}

interface OtherModifierRow {
    key: string;
    label: string;
    value: number;
    mode: string;
    positive: boolean;
}

interface ModifiersDisplayData {
    characteristics: ModifierRow[];
    hasCharacteristics: boolean;
    skills: ModifierRow[];
    hasSkills: boolean;
    combat: ModifierRow[];
    hasCombat: boolean;
    resources: ModifierRow[];
    hasResources: boolean;
    other: OtherModifierRow[];
    hasOther: boolean;
    hasAny: boolean;
}

interface GrantsSkillRow {
    name: string;
    specialization: string | null;
    level: string;
    levelLabel: string;
    displayName: string;
}

interface GrantsTalentRow {
    name: string;
    specialization: string | null;
    uuid: string | null;
    hasLink: boolean;
}

interface GrantsTraitRow {
    name: string;
    level: number | null;
    uuid: string | null;
    hasLink: boolean;
}

interface GrantsSpecialAbilityRow {
    name: string;
    description: string;
}

interface GrantsDisplayData {
    skills: GrantsSkillRow[];
    hasSkills: boolean;
    talents: GrantsTalentRow[];
    hasTalents: boolean;
    traits: GrantsTraitRow[];
    hasTraits: boolean;
    specialAbilities: GrantsSpecialAbilityRow[];
    hasSpecialAbilities: boolean;
    hasAny: boolean;
}

interface SituationalRow {
    key: string;
    label: string;
    value: number;
    condition: string;
    icon: string;
    positive: boolean;
}

interface SituationalDisplayData {
    characteristics: SituationalRow[];
    hasCharacteristics: boolean;
    skills: SituationalRow[];
    hasSkills: boolean;
    combat: SituationalRow[];
    hasCombat: boolean;
    hasAny: boolean;
}

interface RollConfigDisplayData {
    characteristic: string;
    characteristicLabel: string;
    skill: string;
    skillLabel: string;
    modifier: number;
    description: string;
    isConfigured: boolean;
}

interface SelectOption {
    value: string | number;
    label: string;
    selected: boolean;
}

interface FromUuidResult {
    sheet?: { render: (force: boolean) => void } | null;
}

type RollSkillFn = (key: string) => Promise<void>;

/**
 * Redesigned sheet for talent items with modern ApplicationV2 patterns.
 * @extends BaseItemSheet
 */
// @ts-expect-error - TS2417 static side inheritance
export default class TalentSheet extends BaseItemSheet {
    override get item(): TalentItem {
        return super.item as TalentItem;
    }

    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
    static override DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'talent-sheet'],
        actions: {
            ...super.DEFAULT_OPTIONS.actions,
            rollTalent: TalentSheet.#rollTalent,
            postToChat: TalentSheet.#postToChat,
            viewGrantedItem: TalentSheet.#viewGrantedItem,
            adjustRank: TalentSheet.#adjustRank,
            openTalentEditor: TalentSheet.#openTalentEditor,
        },
        position: {
            width: 650,
            height: 700,
        },
        window: {
            resizable: true,
            icon: 'fa-solid fa-star',
        },
    };
    /* eslint-enable @typescript-eslint/unbound-method */

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/talent-sheet.hbs',
            scrollable: ['.wh40k-talent-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override TABS = [
        { tab: 'overview', group: 'primary', label: TAB_LABEL_OVERVIEW },
        { tab: 'effects', group: 'primary', label: TAB_LABEL_EFFECTS },
        { tab: 'properties', group: 'primary', label: TAB_LABEL_PROPERTIES },
        { tab: 'description', group: 'primary', label: TAB_LABEL_DESCRIPTION },
    ];

    /* -------------------------------------------- */

    /** @override */
    override tabGroups = {
        primary: 'overview',
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _prepareContext returns free-form template context; Record<string, unknown> is the required base shape
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        const system = this.item.system;

        // Tab state
        context['tabs'] = this._getTabs();
        context['activeTab'] = this.tabGroups['primary'];

        // Prepare structured data for template
        const modifiersData = this._prepareModifiersData(system);
        const situationalData = this._prepareSituationalData(system);
        const grantsData = this._prepareGrantsData(system);

        context['talentData'] = this._prepareTalentData(system);
        context['prerequisitesData'] = this._preparePrerequisitesData(system);
        context['modifiersData'] = modifiersData;
        context['grantsData'] = grantsData;
        context['situationalData'] = situationalData;
        context['rollConfigData'] = this._prepareRollConfigData(system);

        // Category options for select
        context['categoryOptions'] = this._getCategoryOptions(system.category);
        context['tierOptions'] = this._getTierOptions(system.tier);

        // Determine effects tab section order (sections with data first)
        context['effectsSectionOrder'] = this._getEffectsSectionOrder(modifiersData, situationalData, grantsData);

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare core talent data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared talent data
     * @protected
     */
    _prepareTalentData(system: TalentSystem): TalentDisplayData {
        const sourceBook = system.source.book;
        const sourcePage = system.source.page;
        const aptitudes = system.aptitudes;

        return {
            identifier: system.identifier,
            category: system.category,
            categoryLabel: system.categoryLabel,
            tier: system.tier,
            tierLabel: system.tierLabel,
            cost: system.cost,
            isPassive: system.isPassive,
            isRollable: system.isRollable,
            stackable: system.stackable,
            rank: system.rank,
            hasSpecialization: system.hasSpecialization,
            specialization: system.specialization,
            notes: system.notes,
            // Source fields
            source: sourceBook !== '' ? `${sourceBook} p.${sourcePage}` : '',
            sourceBook: sourceBook,
            sourcePage: sourcePage,
            // Benefit field
            aptitudes,
            hasAptitudes: aptitudes.length > 0,
            benefit: system.benefit,
            hasBenefit: system.benefit.trim() !== '',
            fullName: system.fullName,
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare prerequisites data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared prerequisites data
     * @protected
     */
    _preparePrerequisitesData(system: TalentSystem): PrerequisitesDisplayData {
        const prereqs = system.prerequisites;
        const chars = prereqs.characteristics;
        const skills = prereqs.skills;
        const talents = prereqs.talents;

        // Format characteristics requirements
        const characteristicReqs: PrerequisiteCharRow[] = Object.entries(chars)
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
            .map(([key, value]) => ({
                key,
                label: this._getCharacteristicLabel(key),
                short: this._getCharacteristicShort(key),
                value,
            }));

        const filteredSkills = skills.filter((s) => s !== '');
        const filteredTalents = talents.filter((t) => t !== '');

        return {
            text: prereqs.text,
            hasText: prereqs.text.trim() !== '',
            characteristics: characteristicReqs,
            hasCharacteristics: characteristicReqs.length > 0,
            skills: filteredSkills,
            hasSkills: filteredSkills.length > 0,
            talents: filteredTalents,
            hasTalents: filteredTalents.length > 0,
            hasAny: system.hasPrerequisites,
            label: system.prerequisitesLabel,
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare modifiers data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared modifiers data
     * @protected
     */
    _prepareModifiersData(system: TalentSystem): ModifiersDisplayData {
        const mods = system.modifiers;

        // Characteristic modifiers (free-form Record<string, unknown>)
        const charMods: ModifierRow[] = Object.entries(mods.characteristics)
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] !== 0)
            .map(([key, value]) => ({
                key,
                label: this._getCharacteristicLabel(key),
                short: this._getCharacteristicShort(key),
                value,
                positive: value > 0,
            }));

        // Skill modifiers (free-form Record<string, unknown>)
        const skillMods: ModifierRow[] = Object.entries(mods.skills)
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] !== 0)
            .map(([key, value]) => ({
                key,
                label: this._formatSkillLabel(key),
                value,
                positive: value > 0,
            }));

        // Combat modifiers
        const combatMods: ModifierRow[] = Object.entries(mods.combat)
            .filter(([_, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._formatCombatLabel(key),
                value,
                positive: value > 0,
            }));

        // Resource modifiers
        const resourceMods: ModifierRow[] = Object.entries(mods.resources)
            .filter(([_, value]) => value !== 0)
            .map(([key, value]) => ({
                key,
                label: this._formatResourceLabel(key),
                value,
                positive: value > 0,
            }));

        // Other modifiers
        const otherMods: OtherModifierRow[] = mods.other.map((mod) => ({
            ...mod,
            positive: mod.value > 0,
        }));

        const hasAny = charMods.length > 0 || skillMods.length > 0 || combatMods.length > 0 || resourceMods.length > 0 || otherMods.length > 0;

        return {
            characteristics: charMods,
            hasCharacteristics: charMods.length > 0,
            skills: skillMods,
            hasSkills: skillMods.length > 0,
            combat: combatMods,
            hasCombat: combatMods.length > 0,
            resources: resourceMods,
            hasResources: resourceMods.length > 0,
            other: otherMods,
            hasOther: otherMods.length > 0,
            hasAny,
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare grants data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared grants data
     * @protected
     */
    _prepareGrantsData(system: TalentSystem): GrantsDisplayData {
        const grants = system.grants;

        const skills = grants.skills.map((skill) => ({
            name: skill.name,
            specialization: skill.specialization !== '' ? skill.specialization : null,
            level: skill.level !== '' ? skill.level : 'trained',
            levelLabel: this._getTrainingLabel(skill.level),
            displayName: skill.specialization !== '' ? `${skill.name} (${skill.specialization})` : skill.name,
        }));

        const talents = grants.talents.map((talent) => ({
            name: talent.name,
            specialization: talent.specialization !== '' ? talent.specialization : null,
            uuid: talent.uuid !== '' ? talent.uuid : null,
            hasLink: talent.uuid !== '',
        }));

        const traits = grants.traits.map((trait) => ({
            name: trait.name,
            level: trait.level !== 0 ? trait.level : null,
            uuid: trait.uuid !== '' ? trait.uuid : null,
            hasLink: trait.uuid !== '',
        }));

        const specialAbilities = grants.specialAbilities.map((ability) => ({
            name: ability.name,
            description: ability.description,
        }));

        const hasAny = skills.length > 0 || talents.length > 0 || traits.length > 0 || specialAbilities.length > 0;

        return {
            skills,
            hasSkills: skills.length > 0,
            talents,
            hasTalents: talents.length > 0,
            traits,
            hasTraits: traits.length > 0,
            specialAbilities,
            hasSpecialAbilities: specialAbilities.length > 0,
            hasAny,
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare situational modifiers data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared situational data
     * @protected
     */
    _prepareSituationalData(system: TalentSystem): SituationalDisplayData {
        const situational = system.modifiers.situational;

        const characteristics = situational.characteristics.map((mod) => ({
            key: mod.key,
            label: this._getCharacteristicLabel(mod.key),
            value: mod.value,
            condition: mod.condition,
            icon: this._getCharacteristicIcon(mod.key),
            positive: mod.value > 0,
        }));

        const skills = situational.skills.map((mod) => ({
            key: mod.key,
            label: this._formatSkillLabel(mod.key),
            value: mod.value,
            condition: mod.condition,
            icon: this._getSkillIcon(mod.key),
            positive: mod.value > 0,
        }));

        const combat = situational.combat.map((mod) => ({
            key: mod.key,
            label: this._formatCombatLabel(mod.key),
            value: mod.value,
            condition: mod.condition,
            icon: this._getCombatIcon(mod.key),
            positive: mod.value > 0,
        }));

        const hasAny = characteristics.length > 0 || skills.length > 0 || combat.length > 0;

        return {
            characteristics,
            hasCharacteristics: characteristics.length > 0,
            skills,
            hasSkills: skills.length > 0,
            combat,
            hasCombat: combat.length > 0,
            hasAny,
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare roll configuration data for display.
     * @param {object} system - The item's system data
     * @returns {object} Prepared roll config data
     * @protected
     */
    _prepareRollConfigData(system: TalentSystem): RollConfigDisplayData {
        const config = system.rollConfig;
        return {
            characteristic: config.characteristic,
            characteristicLabel: config.characteristic !== '' ? this._getCharacteristicLabel(config.characteristic) : '',
            skill: config.skill,
            skillLabel: config.skill !== '' ? this._formatSkillLabel(config.skill) : '',
            modifier: config.modifier,
            description: config.description,
            isConfigured: config.characteristic !== '' || config.skill !== '',
        };
    }

    /* -------------------------------------------- */

    /**
     * Get category select options.
     * @param {string} currentCategory - Current category value
     * @returns {object[]} Category options for select
     * @protected
     */
    _getCategoryOptions(currentCategory: string | undefined): SelectOption[] {
        const categories = [
            { value: '', label: 'General' },
            { value: 'general', label: 'General' },
            { value: 'combat', label: 'Combat' },
            { value: 'social', label: 'Social' },
            { value: 'investigation', label: 'Investigation' },
            { value: 'psychic', label: 'Psychic' },
            { value: 'navigator', label: 'Navigator' },
            { value: 'tech', label: 'Tech' },
            { value: 'leadership', label: 'Leadership' },
            { value: 'career', label: 'Career' },
            { value: 'unique', label: 'Unique' },
        ];

        return categories.map((cat) => ({
            ...cat,
            selected: cat.value === currentCategory,
        }));
    }

    /* -------------------------------------------- */

    /**
     * Get tier select options.
     * @param {number} currentTier - Current tier value
     * @returns {object[]} Tier options for select
     * @protected
     */
    _getTierOptions(currentTier: number | undefined): SelectOption[] {
        return [
            { value: 0, label: '—', selected: currentTier === 0 },
            { value: 1, label: 'Tier 1', selected: currentTier === 1 },
            { value: 2, label: 'Tier 2', selected: currentTier === 2 },
            { value: 3, label: 'Tier 3', selected: currentTier === 3 },
        ];
    }

    /* -------------------------------------------- */

    /**
     * Determine the order of sections in the Effects tab.
     * Sections with data appear first, empty sections last.
     * @param {object} modifiersData - Prepared modifiers data
     * @param {object} situationalData - Prepared situational data
     * @param {object} grantsData - Prepared grants data
     * @returns {string[]} Ordered array of section IDs
     * @protected
     */
    _getEffectsSectionOrder(modifiersData: ModifiersDisplayData, situationalData: SituationalDisplayData, grantsData: GrantsDisplayData): string[] {
        const sections = [
            { id: 'modifiers', hasData: modifiersData.hasAny },
            { id: 'situational', hasData: situationalData.hasAny },
            { id: 'grants', hasData: grantsData.hasAny },
        ];

        // Sort: sections with data first, then empty sections
        sections.sort((a, b) => {
            if (a.hasData && !b.hasData) return -1;
            if (!a.hasData && b.hasData) return 1;
            return 0; // Maintain relative order for sections with same status
        });

        return sections.map((s) => s.id);
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Get characteristic full label.
     * @param {string} key - Characteristic key
     * @returns {string} Full label
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
     * Get characteristic short label.
     * @param {string} key - Characteristic key
     * @returns {string} Short label
     * @protected
     */
    _getCharacteristicShort(key: string): string {
        const shorts: Record<string, string> = {
            weaponSkill: 'WS',
            ballisticSkill: 'BS',
            strength: 'S',
            toughness: 'T',
            agility: 'Ag',
            intelligence: 'Int',
            perception: 'Per',
            willpower: 'WP',
            fellowship: 'Fel',
            influence: 'Inf',
        };
        return shorts[key] ?? key.substring(0, 3).toUpperCase();
    }

    /**
     * Format skill key to label.
     * @param {string} key - Skill key
     * @returns {string} Formatted label
     * @protected
     */
    _formatSkillLabel(key: string): string {
        // Convert camelCase to Title Case
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase())
            .trim();
    }

    /**
     * Format combat modifier key to label.
     * @param {string} key - Combat key
     * @returns {string} Formatted label
     * @protected
     */
    _formatCombatLabel(key: string): string {
        const labels: Record<string, string> = {
            attack: 'Attack Bonus',
            damage: 'Damage Bonus',
            penetration: 'Penetration',
            defense: 'Defense Bonus',
            initiative: 'Initiative',
            speed: 'Movement Speed',
        };
        return labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
    }

    /**
     * Format resource key to label.
     * @param {string} key - Resource key
     * @returns {string} Formatted label
     * @protected
     */
    _formatResourceLabel(key: string): string {
        const labels: Record<string, string> = {
            wounds: 'Wounds',
            fate: 'Fate Points',
            insanity: 'Insanity Threshold',
            corruption: 'Corruption Threshold',
        };
        return labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
    }

    /**
     * Get training level label.
     * @param {string} level - Training level
     * @returns {string} Formatted label
     * @protected
     */
    _getTrainingLabel(level: string): string {
        const labels: Record<string, string> = {
            trained: 'Trained',
            plus10: '+10',
            plus20: '+20',
        };
        return labels[level] ?? level;
    }

    /**
     * Get icon for a characteristic key.
     * @param {string} key - Characteristic key
     * @returns {string} Font Awesome icon class
     * @protected
     */
    _getCharacteristicIcon(key: string): string {
        const icons: Record<string, string> = {
            weaponSkill: 'fa-solid fa-sword',
            ballisticSkill: 'fa-solid fa-crosshairs',
            strength: 'fa-solid fa-dumbbell',
            toughness: 'fa-solid fa-shield',
            agility: 'fa-solid fa-person-running',
            intelligence: 'fa-solid fa-brain',
            perception: 'fa-solid fa-eye',
            willpower: 'fa-solid fa-head-side-brain',
            fellowship: 'fa-solid fa-people-group',
            influence: 'fa-solid fa-crown',
        };
        return icons[key] ?? 'fa-solid fa-star';
    }

    /**
     * Get icon for a skill key.
     * @param {string} key - Skill key
     * @returns {string} Font Awesome icon class
     * @protected
     */
    _getSkillIcon(key: string): string {
        const icons: Record<string, string> = {
            // Combat skills
            dodge: 'fa-solid fa-shield-halved',
            parry: 'fa-solid fa-shield',

            // Physical skills
            acrobatics: 'fa-solid fa-person-running',
            athletics: 'fa-solid fa-dumbbell',
            climb: 'fa-solid fa-mountain',
            swim: 'fa-solid fa-person-swimming',
            contortionist: 'fa-solid fa-user-tie',

            // Stealth/infiltration
            concealment: 'fa-solid fa-user-ninja',
            disguise: 'fa-solid fa-mask',
            shadowing: 'fa-solid fa-user-secret',
            silentMove: 'fa-solid fa-shoe-prints',
            sleightOfHand: 'fa-solid fa-hand-sparkles',
            stealth: 'fa-solid fa-user-ninja',

            // Social skills
            barter: 'fa-solid fa-handshake',
            carouse: 'fa-solid fa-champagne-glasses',
            charm: 'fa-solid fa-face-smile-beam',
            command: 'fa-solid fa-bullhorn',
            deceive: 'fa-solid fa-mask',
            gamble: 'fa-solid fa-dice',
            intimidate: 'fa-solid fa-skull',
            interrogation: 'fa-solid fa-gavel',
            blather: 'fa-solid fa-comment-dots',

            // Knowledge skills
            awareness: 'fa-solid fa-eye',
            scrutiny: 'fa-solid fa-magnifying-glass',
            search: 'fa-solid fa-magnifying-glass-plus',
            inquiry: 'fa-solid fa-clipboard-question',
            literacy: 'fa-solid fa-book',
            logic: 'fa-solid fa-brain',
            commonLore: 'fa-solid fa-book-open',
            forbiddenLore: 'fa-solid fa-book-skull',
            scholasticLore: 'fa-solid fa-graduation-cap',
            ciphers: 'fa-solid fa-key',
            secretTongue: 'fa-solid fa-lock',
            speakLanguage: 'fa-solid fa-language',

            // Tech/craft skills
            techUse: 'fa-solid fa-screwdriver-wrench',
            security: 'fa-solid fa-lock-open',
            demolition: 'fa-solid fa-bomb',
            chemUse: 'fa-solid fa-flask',
            medicae: 'fa-solid fa-kit-medical',
            trade: 'fa-solid fa-hammer',

            // Vehicle skills
            drive: 'fa-solid fa-car',
            pilot: 'fa-solid fa-jet-fighter',

            // Misc skills
            evaluate: 'fa-solid fa-scale-balanced',
            commerce: 'fa-solid fa-coins',
            performer: 'fa-solid fa-music',
            tracking: 'fa-solid fa-paw',
            survival: 'fa-solid fa-compass',
            wrangling: 'fa-solid fa-horse',
            navigation: 'fa-solid fa-compass',

            // Psychic skills
            psyniscience: 'fa-solid fa-eye-evil',
            invocation: 'fa-solid fa-hand-sparkles',
        };
        return icons[key] ?? 'fa-solid fa-graduation-cap';
    }

    /**
     * Get icon for a combat modifier key.
     * @param {string} key - Combat key
     * @returns {string} Font Awesome icon class
     * @protected
     */
    _getCombatIcon(key: string): string {
        const icons: Record<string, string> = {
            attack: 'fa-solid fa-crosshairs',
            damage: 'fa-solid fa-burst',
            penetration: 'fa-solid fa-arrow-up-right-dots',
            defense: 'fa-solid fa-shield-halved',
            initiative: 'fa-solid fa-gauge-high',
            speed: 'fa-solid fa-person-running',
        };
        return icons[key] ?? 'fa-solid fa-swords';
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _onRender context is free-form template context passed by Foundry ApplicationV2
    override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        // Set up custom tab handling
        this._setupTalentTabs();
    }

    /* -------------------------------------------- */

    /**
     * Set up tab click listeners.
     * @protected
     */
    _setupTalentTabs(): void {
        const tabs = this.element.querySelectorAll('.wh40k-talent-tabs .wh40k-talent-tab');
        const switchTab = (tabName: string | undefined): void => {
            if (tabName === undefined || tabName === '') return;

            // Update active tab button
            tabs.forEach((t) => {
                t.classList.toggle('active', (t as HTMLElement).dataset['tab'] === tabName);
            });

            // Show/hide panels
            const panels = this.element.querySelectorAll('.wh40k-talent-panel');
            panels.forEach((panel) => {
                panel.classList.toggle('active', (panel as HTMLElement).dataset['tab'] === tabName);
            });

            // Update tab group state
            this.tabGroups['primary'] = tabName;
        };

        // Tab button clicks
        tabs.forEach((tab) => {
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                switchTab((tab as HTMLElement).dataset['tab']);
            });
        });

        // Effects banner link click
        const bannerLink = this.element.querySelector('.wh40k-effects-banner__link');
        if (bannerLink) {
            bannerLink.addEventListener('click', (event) => {
                event.preventDefault();
                switchTab((bannerLink as HTMLElement).dataset['tab']);
            });
        }
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Roll the talent if it has a roll configuration.
     * @this {TalentSheet}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #rollTalent(this: TalentSheet, _event: Event, _target: HTMLElement): Promise<void> {
        if (!this.item.system.isRollable) {
            ui.notifications.warn(game.i18n.localize('WH40K.Talent.NotRollable'));
            return;
        }

        const actor = this.item.actor;
        if (actor === null) {
            ui.notifications.warn(game.i18n.localize('WH40K.Talent.MustBeOnActor'));
            return;
        }

        const config = this.item.system.rollConfig;
        if (config.characteristic !== '') {
            actor.rollCharacteristic(config.characteristic, this.item.name);
        } else if (config.skill !== '') {
            const rollSkill = Reflect.get(actor, 'rollSkill') as RollSkillFn | undefined;
            if (rollSkill !== undefined) await rollSkill.call(actor, config.skill);
        }
    }

    /* -------------------------------------------- */

    /**
     * Post the talent to chat.
     * @this {TalentSheet}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #postToChat(this: TalentSheet, _event: Event, _target: HTMLElement): Promise<void> {
        await this.item.system.toChat();
        await this._postTalentToChat();
    }

    /* -------------------------------------------- */

    /**
     * View a granted item.
     * @this {TalentSheet}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #viewGrantedItem(this: TalentSheet, _event: Event, target: HTMLElement): Promise<void> {
        const uuid = target.dataset['uuid'];
        if (uuid === undefined || uuid === '') return;

        try {
            const item = (await fromUuid(uuid)) as FromUuidResult | null;
            if (item?.sheet !== undefined && item.sheet !== null) {
                item.sheet.render(true);
            }
        } catch (err) {
            console.warn(`Could not load item from UUID: ${uuid}`, err);
        }
    }

    /* -------------------------------------------- */

    /**
     * Adjust talent rank for stackable talents.
     * @this {TalentSheet}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #adjustRank(this: TalentSheet, _event: Event, target: HTMLElement): Promise<void> {
        if (!this.item.system.stackable) return;

        const delta = parseInt(target.dataset['delta'] ?? '', 10);
        if (Number.isNaN(delta)) return;

        const currentRank = this.item.system.rank;
        const newRank = Math.max(1, currentRank + delta);

        await this.item.update({ 'system.rank': newRank });
    }

    /* -------------------------------------------- */

    /**
     * Open the talent editor dialog for complex field editing.
     * @this {TalentSheet}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #openTalentEditor(this: TalentSheet, _event: Event, target: HTMLElement): Promise<void> {
        const section = target.dataset['section'];
        if (section === undefined || section === '') return;

        // Import and render the TalentEditorDialog
        const { TalentEditorDialog } = await import('./talent-editor-dialog.ts');
        const dialog = new TalentEditorDialog({
            item: this.item,
            initialSection: section,
        });
        await dialog.render({ force: true });
    }

    /* -------------------------------------------- */

    /**
     * Post a simple talent card to chat.
     * @protected
     */
    async _postTalentToChat(): Promise<void> {
        const content = `
            <div class="talent-chat-card">
                <h3>${this.item.name}</h3>
                <p><strong>Type:</strong> ${this.item.system.isPassive ? 'Passive' : 'Active'}</p>
                ${this.item.system.tier ? `<p><strong>Tier:</strong> ${this.item.system.tier}</p>` : ''}
                ${this.item.system.cost ? `<p><strong>Cost:</strong> ${this.item.system.cost} XP</p>` : ''}
                <hr>
                <div>${this.item.system.benefit !== '' ? this.item.system.benefit : this.item.system.description.value}</div>
            </div>
        `;

        await ChatMessage.create({
            content,
            speaker: ChatMessage.getSpeaker({ actor: this.item.actor ?? undefined }),
        });
    }
}
