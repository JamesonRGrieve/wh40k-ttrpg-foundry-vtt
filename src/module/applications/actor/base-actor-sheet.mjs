/**
 * @file BaseActorSheet - Base actor sheet built on ApplicationV2
 * Based on dnd5e's BaseActorSheet pattern for Foundry V13+
 */

import ApplicationV2Mixin from '../api/application-v2-mixin.mjs';
import PrimarySheetMixin from '../api/primary-sheet-mixin.mjs';
import TooltipMixin from '../api/tooltip-mixin.mjs';
import VisualFeedbackMixin from '../api/visual-feedback-mixin.mjs';
import EnhancedAnimationsMixin from '../api/enhanced-animations-mixin.mjs';
import CollapsiblePanelMixin from '../api/collapsible-panel-mixin.mjs';
import ContextMenuMixin from '../api/context-menu-mixin.mjs';
import EnhancedDragDropMixin from '../api/drag-drop-visual-mixin.mjs';
import WhatIfMixin from '../api/what-if-mixin.mjs';
import ConfirmationDialog from '../dialogs/confirmation-dialog.mjs';
import EffectCreationDialog from '../prompts/effect-creation-dialog.mjs';
import { toCamelCase } from '../../handlebars/handlebars-helpers.mjs';

const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Base actor sheet built on ApplicationV2.
 * All actor sheets should extend this class.
 */
export default class BaseActorSheet extends WhatIfMixin(
    EnhancedDragDropMixin(
        ContextMenuMixin(
            CollapsiblePanelMixin(EnhancedAnimationsMixin(VisualFeedbackMixin(TooltipMixin(PrimarySheetMixin(ApplicationV2Mixin(ActorSheetV2)))))),
        ),
    ),
) {
    constructor(options = {}) {
        super(options);
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        actions: {
            editImage: BaseActorSheet.#onEditImage,
            roll: BaseActorSheet.#roll,
            itemRoll: BaseActorSheet.#itemRoll,
            itemEdit: BaseActorSheet.#itemEdit,
            itemDelete: BaseActorSheet.#itemDelete,
            itemVocalize: BaseActorSheet.#itemVocalize,
            itemCreate: BaseActorSheet.#itemCreate,
            effectCreate: BaseActorSheet.#effectCreate,
            effectEdit: BaseActorSheet.#effectEdit,
            effectDelete: BaseActorSheet.#effectDelete,
            effectToggle: BaseActorSheet.#effectToggle,
            toggleSection: BaseActorSheet.#toggleSection,
            toggleTraining: BaseActorSheet.#toggleTraining,
            addSpecialistSkill: BaseActorSheet.#addSpecialistSkill,
            deleteSpecialization: BaseActorSheet.#deleteSpecialization,
            viewSkillInfo: BaseActorSheet.#viewSkillInfo,
            togglePanel: BaseActorSheet._onTogglePanel,
            applyPreset: BaseActorSheet._onApplyPreset,
            enterWhatIf: BaseActorSheet.#enterWhatIf,
            commitWhatIf: BaseActorSheet.#commitWhatIf,
            cancelWhatIf: BaseActorSheet.#cancelWhatIf,
            spendXPAdvance: BaseActorSheet.#spendXPAdvance,
            editCharacteristic: BaseActorSheet.#editCharacteristic,
        },
        classes: ['rogue-trader', 'sheet', 'actor'],
        form: {
            submitOnChange: true,
        },
        position: {
            width: 1050,
            height: 800,
        },
        window: {
            resizable: true,
        },
    };

    /* -------------------------------------------- */

    /**
     * A set of item types that should be prevented from being dropped on this type of actor sheet.
     * @type {Set<string>}
     */
    static unsupportedItemTypes = new Set();

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    /**
     * Filter state for equipment panel.
     * @type {{ search: string, type: string, status: string }}
     */
    _equipmentFilter = { search: '', type: '', status: '' };

    /**
     * Filter state for skills panel.
     * @type {{ search: string, characteristic: string, training: string }}
     */
    _skillsFilter = { search: '', characteristic: '', training: '' };

    /**
     * Scroll positions for scrollable containers.
     * @type {Map<string, number>}
     */
    _scrollPositions = new Map();

    /**
     * Whether state has been restored for this sheet instance.
     * @type {boolean}
     * @private
     */
    _stateRestored = false;

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Convenience access to the actor.
     * @type {Actor}
     */
    get actor() {
        return this.document;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = {
            ...(await super._prepareContext(options)),
            actor: this.actor,
            system: this.actor.system,
            source: this.isEditable ? this.actor.system._source : this.actor.system,
            fields: this.actor.system.schema?.fields ?? {},
            effects: this.actor.getEmbeddedCollection('ActiveEffect').contents,
            items: Array.from(this.actor.items),
            limited: this.actor.limited,
            editable: this.isEditable,
            rollableClass: this.isEditable ? 'rollable' : '',
        };

        // Prepare characteristics with HUD data
        this._prepareCharacteristicsHUD(context);

        // Prepare skills
        await this._prepareSkills(context);

        // Prepare items by category
        await this._prepareItems(context);

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare characteristics with progress ring calculations.
     * @param {object} context  Context being prepared.
     * @protected
     */
    _prepareCharacteristicsHUD(context) {
        const characteristics = this.actor.system.characteristics || {};

        for (const [key, char] of Object.entries(characteristics)) {
            // Calculate advancement progress (0-5)
            const advanceProgress = (char.advance || 0) / 5; // 0.0 to 1.0

            // SVG circle calculations (circumference = 2 * π * r, where r=52)
            const radius = 52;
            const circumference = 2 * Math.PI * radius; // ≈ 327
            char.progressCircumference = circumference;
            char.progressOffset = circumference * (1 - advanceProgress);
            char.advanceProgress = Math.round(advanceProgress * 100); // Percentage

            // Calculate XP cost for next advance (follows RT progression)
            // Simple: 100, Intermediate: 250, Trained: 500, Proficient: 750, Expert: 1000
            const advanceCosts = [100, 250, 500, 750, 1000];
            const nextAdvance = char.advance || 0;
            char.nextAdvanceCost = nextAdvance < 5 ? advanceCosts[nextAdvance] : 0;

            // Prepare tooltip data if not already present
            if (!char.tooltipData) {
                char.tooltipData = this.prepareCharacteristicTooltip(key, char);
            }

            // HUD display formatting - hudMod is the characteristic bonus (tens digit)
            char.hudMod = char.bonus ?? Math.floor((char.total ?? 0) / 10);
            char.hudTotal = char.total;

            // HUD State flags for visual styling (used by V1 HUD)
            char.hasBonus = (char.modifier || 0) > 0;
            char.hasPenalty = (char.modifier || 0) < 0;
            char.isMaxed = (char.advance || 0) >= 5;

            // Calculate unnatural bonus if applicable
            const unnaturalMult = char.unnatural || 1;
            if (unnaturalMult > 1) {
                const baseBonus = Math.floor((char.total || 0) / 10);
                char.unnaturalBonus = baseBonus * unnaturalMult;
            }
        }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onClose(options) {
        // Save state before closing
        this._saveSheetState();

        super._onClose(options);

        // Clean up hook listener
        if (this._updateListener) {
            Hooks.off('updateActor', this._updateListener);
            this._updateListener = null;
        }

        // Clean up click-outside handler
        if (this._clickOutsideHandler) {
            document.removeEventListener('click', this._clickOutsideHandler);
            this._clickOutsideHandler = null;
        }

        // Clean up resize observer
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
    }

    /* -------------------------------------------- */
    /*  State Persistence                           */
    /* -------------------------------------------- */

    /**
     * Save current sheet state to actor flags.
     * Captures scroll positions, filter states, search terms, and window size.
     * @protected
     */
    _saveSheetState() {
        // Capture scroll positions before saving
        this._captureScrollPositions();

        const state = {
            scrollPositions: Object.fromEntries(this._scrollPositions),
            equipmentFilter: this._equipmentFilter,
            skillsFilter: this._skillsFilter,
            windowSize: {
                width: this.position?.width,
                height: this.position?.height,
            },
        };

        // Use setFlag - this is async but we don't await it on close
        this.actor.setFlag('rogue-trader', 'sheetState', state);
    }

    /**
     * Restore sheet state from actor flags.
     * Called after first render to restore previous state.
     * @returns {Promise<void>}
     * @protected
     */
    async _restoreSheetState() {
        if (this._stateRestored) return;
        this._stateRestored = true;

        const state = this.actor.getFlag('rogue-trader', 'sheetState');
        if (!state) return;

        // Restore filter states
        if (state.equipmentFilter) {
            this._equipmentFilter = { ...this._equipmentFilter, ...state.equipmentFilter };
        }
        if (state.skillsFilter) {
            this._skillsFilter = { ...this._skillsFilter, ...state.skillsFilter };
        }

        // Restore scroll positions
        if (state.scrollPositions) {
            this._scrollPositions = new Map(Object.entries(state.scrollPositions));
        }

        // Restore window size if different from default
        if (state.windowSize?.width && state.windowSize?.height) {
            const defaultPos = this.constructor.DEFAULT_OPTIONS.position;
            if (state.windowSize.width !== defaultPos?.width || state.windowSize.height !== defaultPos?.height) {
                this.setPosition({
                    width: state.windowSize.width,
                    height: state.windowSize.height,
                });
            }
        }

        // Apply filter states to DOM after a brief delay to ensure elements exist
        setTimeout(() => this._applyRestoredState(), 50);
    }

    /**
     * Apply restored state to DOM elements.
     * @protected
     */
    _applyRestoredState() {
        // Apply equipment filters
        if (this._equipmentFilter) {
            const searchInput = this.element?.querySelector('.rt-equipment-search');
            const typeFilter = this.element?.querySelector('.rt-equipment-type-filter');
            const statusFilter = this.element?.querySelector('.rt-equipment-status-filter');

            if (searchInput && this._equipmentFilter.search) {
                searchInput.value = this._equipmentFilter.search;
            }
            if (typeFilter && this._equipmentFilter.type) {
                typeFilter.value = this._equipmentFilter.type;
            }
            if (statusFilter && this._equipmentFilter.status) {
                statusFilter.value = this._equipmentFilter.status;
            }

            // Trigger filter if any values are set
            if (this._equipmentFilter.search || this._equipmentFilter.type || this._equipmentFilter.status) {
                searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        // Apply skills filters
        if (this._skillsFilter) {
            const searchInput = this.element?.querySelector('.rt-skills-search');
            const charFilter = this.element?.querySelector('.rt-skills-char-filter');
            const trainingFilter = this.element?.querySelector('.rt-skills-training-filter');

            if (searchInput && this._skillsFilter.search) {
                searchInput.value = this._skillsFilter.search;
            }
            if (charFilter && this._skillsFilter.characteristic) {
                charFilter.value = this._skillsFilter.characteristic;
            }
            if (trainingFilter && this._skillsFilter.training) {
                trainingFilter.value = this._skillsFilter.training;
            }

            // Trigger filter if any values are set
            if (this._skillsFilter.search || this._skillsFilter.characteristic || this._skillsFilter.training) {
                searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        // Apply scroll positions
        this._applyScrollPositions();
    }

    /**
     * Capture current scroll positions of scrollable containers.
     * @protected
     */
    _captureScrollPositions() {
        if (!this.element) return;

        // Common scrollable containers
        const scrollableSelectors = ['.rt-body', '.rt-skills-columns', '.rt-all-items-grid', '.rt-talents-grid', '.scrollable', '[data-scrollable]'];

        scrollableSelectors.forEach((selector) => {
            const elements = this.element.querySelectorAll(selector);
            elements.forEach((el, index) => {
                const key = `${selector}-${index}`;
                if (el.scrollTop > 0) {
                    this._scrollPositions.set(key, el.scrollTop);
                }
            });
        });
    }

    /**
     * Apply saved scroll positions to scrollable containers.
     * @protected
     */
    _applyScrollPositions() {
        if (!this.element || this._scrollPositions.size === 0) return;

        const scrollableSelectors = ['.rt-body', '.rt-skills-columns', '.rt-all-items-grid', '.rt-talents-grid', '.scrollable', '[data-scrollable]'];

        scrollableSelectors.forEach((selector) => {
            const elements = this.element.querySelectorAll(selector);
            elements.forEach((el, index) => {
                const key = `${selector}-${index}`;
                const savedPosition = this._scrollPositions.get(key);
                if (savedPosition !== undefined) {
                    el.scrollTop = savedPosition;
                }
            });
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle input changes manually - updates actor when input changes.
     * @param {Event} event  The change event
     * @returns {Promise<void>}
     * @private
     */
    async _onInputChange(event) {
        const input = event.currentTarget;
        if (!input.name) return;

        // Get the value based on input type
        let value = input.value;
        if (input.type === 'checkbox') {
            value = input.checked;
        } else if (input.type === 'number' || input.dataset.dtype === 'Number') {
            value = parseFloat(value) || 0;
        }

        // Update the actor
        try {
            await this.document.update({ [input.name]: value });
        } catch (error) {
            console.error('Failed to update actor:', error);
            ui.notifications.error('Failed to save changes');
        }
    }

    /* -------------------------------------------- */

    /**
     * Prepare skills for display.
     * @param {object} context  Context being prepared.
     * @protected
     */
    async _prepareSkills(context) {
        this._prepareSkillsContext(context);
    }

    /**
     * Prepare skills context for rendering.
     * @param {object} context  Context being prepared.
     * @protected
     */
    _prepareSkillsContext(context) {
        const skills = this.actor.system.skills ?? {};
        const characteristics = this.actor.system.characteristics ?? {};

        // Apply filters
        const filters = this._skillsFilter;
        let visibleSkills = Object.entries(skills).filter(([key, data]) => {
            if (data.hidden) return false;

            // Search filter
            if (filters.search) {
                const searchLower = filters.search.toLowerCase();
                const label = (data.label || key).toLowerCase();
                if (!label.includes(searchLower)) return false;
            }

            // Characteristic filter
            if (filters.characteristic && data.characteristic !== filters.characteristic) {
                return false;
            }

            // Training filter
            if (filters.training) {
                const level = this._getTrainingLevel(data);
                if (filters.training === 'trained' && level < 1) return false;
                if (filters.training === 'untrained' && level > 0) return false;
            }

            return true;
        });

        // Sort by label
        visibleSkills.sort((a, b) => {
            const labelA = a[1].label || a[0];
            const labelB = b[1].label || b[0];
            return labelA.localeCompare(labelB, game.i18n.lang);
        });

        // Split into categories
        const standard = [];
        const specialist = [];

        for (const [key, data] of visibleSkills) {
            // Augment with computed properties
            this._augmentSkillData(key, data, characteristics);

            if (data.entries !== undefined) {
                // Specialist skill - process entries
                const entryList = Array.isArray(data.entries) ? data.entries : data.entries ? Object.values(data.entries) : [];
                const plainEntries = entryList.map((entry) => {
                    if (typeof entry === 'string') {
                        return {
                            name: entry,
                            slug: toCamelCase(entry),
                            characteristic: data.characteristic,
                            advanced: data.advanced,
                            basic: !data.advanced,
                            trained: false,
                            plus10: false,
                            plus20: false,
                            bonus: 0,
                            notes: '',
                            cost: 0,
                            current: 0,
                        };
                    }

                    const normalized = { ...entry };
                    const entryName = normalized.name || normalized.label || normalized.slug || '';
                    normalized.name = entryName;
                    if (!normalized.slug && entryName) {
                        normalized.slug = toCamelCase(entryName);
                    }
                    if (!normalized.characteristic) {
                        normalized.characteristic = data.characteristic;
                    }
                    if (normalized.advanced === undefined) {
                        normalized.advanced = data.advanced;
                    }
                    if (normalized.basic === undefined) {
                        normalized.basic = !data.advanced;
                    }
                    return normalized;
                });
                plainEntries.forEach((entry) => {
                    this._augmentSkillData(key, entry, characteristics, data);
                });

                // Get suggested specializations from compendium for autocomplete
                data.suggestedSpecializations = this._getSkillSuggestions(key);

                // Create plain object with converted entries
                specialist.push([key, { ...data, entries: plainEntries }]);
            } else {
                // Standard skill
                standard.push([key, data]);
            }
        }

        // Split standard into columns
        const splitIndex = Math.ceil(standard.length / 2);
        const standardColumns = [standard.slice(0, splitIndex), standard.slice(splitIndex)];

        context.skillLists = { standard, specialist, standardColumns };
    }

    /**
     * Map characteristic short names to full keys.
     * @param {string} short  Short name (e.g., "Ag", "WS")
     * @returns {string}  Full characteristic key (e.g., "agility", "weaponSkill")
     * @private
     */
    _charShortToKey(short) {
        // Use the same map as CommonTemplate for consistency
        const map = {
            WS: 'weaponSkill',
            BS: 'ballisticSkill',
            S: 'strength',
            T: 'toughness',
            Ag: 'agility',
            Int: 'intelligence',
            Per: 'perception',
            WP: 'willpower',
            Fel: 'fellowship',
            Inf: 'influence',
        };
        return map[short] || short.toLowerCase();
    }

    /**
     * Augment skill data with computed display properties.
     * @param {string} key  Skill key
     * @param {object} data  Skill or entry data
     * @param {object} characteristics  Actor characteristics
     * @param {object} [parentSkill]  Parent skill for specialist entries
     * @protected
     */
    _augmentSkillData(key, data, characteristics, parentSkill = null) {
        const charShort = data.characteristic || parentSkill?.characteristic || 'S';
        const charKey = this._charShortToKey(charShort);
        const char = characteristics[charKey];

        // Training level (0-3)
        data.trainingLevel = this._getTrainingLevel(data);

        // Characteristic short name
        data.charShort = char?.short || charKey;

        // Breakdown string for tooltip/title
        data.breakdown = this._getSkillBreakdown(data, char);

        // Tooltip data (JSON string)
        data.tooltipData = this.prepareSkillTooltip(key, data, characteristics);

        // Check if skill is favorite
        const favorites = this.actor.getFlag('rogue-trader', 'favoriteSkills') || [];
        data.isFavorite = favorites.includes(key);

        // Check if advanced skill is granted (for locking)
        data.isGranted = this._isSkillGranted(key, data);
    }

    /**
     * Get training level from skill data.
     * @param {object} skill  Skill or entry data
     * @returns {number}  Training level (0-3)
     * @protected
     */
    _getTrainingLevel(skill) {
        if (skill.plus20) return 3;
        if (skill.plus10) return 2;
        if (skill.trained) return 1;
        return 0;
    }

    /**
     * Get skill breakdown string for display.
     * @param {object} skill  Skill data
     * @param {object} char  Characteristic data
     * @returns {string}  Breakdown string
     * @protected
     */
    _getSkillBreakdown(skill, char) {
        const charTotal = char?.total ?? 0;
        const level = this._getTrainingLevel(skill);
        const baseValue = level > 0 ? charTotal : Math.floor(charTotal / 2);
        const trainingBonus = level >= 3 ? 20 : level >= 2 ? 10 : 0;
        const bonus = skill.bonus || 0;

        const parts = [];
        if (level > 0) {
            parts.push(`${char?.short || skill.characteristic}: ${charTotal}`);
        } else {
            parts.push(`${char?.short || skill.characteristic}: ${charTotal}/2 = ${baseValue}`);
        }
        if (trainingBonus > 0) parts.push(`Training: +${trainingBonus}`);
        if (bonus !== 0) parts.push(`Bonus: ${bonus >= 0 ? '+' : ''}${bonus}`);

        return parts.join(', ');
    }

    /**
     * Get suggested specializations for a skill from the compendium.
     * @param {string} skillKey  Skill key (e.g., "commonLore", "trade")
     * @returns {string[]}  Array of suggested specialization names
     * @protected
     */
    _getSkillSuggestions(skillKey) {
        // Access the tooltip system's cached skill descriptions
        const tooltips = game.rt?.tooltips;
        if (!tooltips) return [];

        // Get skill description from compendium cache
        const skillDesc = tooltips.getSkillDescription(skillKey);
        if (!skillDesc) return [];

        // Return specializations array if it exists
        return skillDesc.specializations || [];
    }

    /**
     * Check if skill is granted by talents, traits, or origin paths.
     * Basic skills are always granted. Advanced skills need explicit grants.
     * @param {string} skillKey  Skill key
     * @param {object} skillData  Skill data object
     * @returns {boolean}  True if skill is granted (or is basic)
     * @protected
     */
    _isSkillGranted(skillKey, skillData) {
        // Basic skills are always granted
        if (!skillData.advanced) return true;

        // Advanced skills need to check for grants
        // Check if any training level is set (means granted at some point)
        if (skillData.trained || skillData.plus10 || skillData.plus20) return true;

        // Check if granted by talents/traits/origin paths
        // This is a simplified check - a more complete implementation would scan
        // all talents, traits, and origin paths for skill grants
        const items = this.actor.items;
        for (const item of items) {
            if (!item.system?.grants?.skills) continue;

            const skillGrants = item.system.grants.skills || [];
            for (const grant of skillGrants) {
                const grantName = grant.name || grant;
                if (grantName.toLowerCase() === skillData.label?.toLowerCase()) {
                    return true;
                }
            }
        }

        return false;
    }

    /* -------------------------------------------- */
    /*  Talents Preparation                         */
    /* -------------------------------------------- */

    /**
     * Prepare talents context for rendering.
     * @returns {Object} Talents data with filtering and grouping
     * @protected
     */
    _prepareTalentsContext() {
        const talents = this.actor.items.filter((i) => i.type === 'talent');
        const traits = this.actor.items.filter((i) => i.type === 'trait');

        // Get filter state (if exists)
        const filter = this._talentsFilter || {};

        // Apply filters
        let filteredTalents = talents;
        if (filter.search) {
            const search = filter.search.toLowerCase();
            filteredTalents = filteredTalents.filter((t) => t.name.toLowerCase().includes(search));
        }
        if (filter.category && filter.category !== '') {
            filteredTalents = filteredTalents.filter((t) => t.system.category === filter.category);
        }
        if (filter.tier && filter.tier !== '') {
            const tierNum = parseInt(filter.tier);
            filteredTalents = filteredTalents.filter((t) => t.system.tier === tierNum);
        }

        // Augment with display properties
        const augmentedTalents = filteredTalents.map((t) => this._augmentTalentData(t));
        const augmentedTraits = traits.map((t) => this._augmentTraitData(t));

        // Group by tier
        const groupedByTier = this._groupTalentsByTier(augmentedTalents);

        // Extract unique categories
        const categories = this._getTalentCategories(talents);

        return {
            talents: augmentedTalents,
            traits: augmentedTraits,
            groupedByTier,
            categories,
            tiers: [1, 2, 3],
            talentsCount: talents.length,
            traitsCount: traits.length,
            filter,
        };
    }

    /**
     * Augment talent with display properties.
     * @param {Item} talent  Talent item
     * @returns {Object} Augmented talent data
     * @protected
     */
    _augmentTalentData(talent) {
        // Check if this talent is favorited
        const favorites = this.actor.getFlag('rogue-trader', 'favoriteTalents') || [];
        const isFavorite = favorites.includes(talent.id);

        return {
            id: talent.id,
            _id: talent._id,
            name: talent.name,
            img: talent.img,
            type: talent.type,
            system: talent.system,
            tierLabel: talent.system.tierLabel,
            categoryLabel: talent.system.categoryLabel,
            fullName: talent.system.fullName,
            aptitudesLabel: this._formatAptitudes(talent.system.aptitudes),
            prerequisitesLabel: talent.system.prerequisitesLabel,
            hasPrerequisites: talent.system.hasPrerequisites,
            costLabel: talent.system.cost > 0 ? `${talent.system.cost} XP` : '—',
            isFavorite: isFavorite,
            flags: talent.flags,
        };
    }

    /**
     * Augment trait with display properties.
     * @param {Item} trait  Trait item
     * @returns {Object} Augmented trait data
     * @protected
     */
    _augmentTraitData(trait) {
        return {
            id: trait.id,
            _id: trait._id,
            name: trait.name,
            img: trait.img,
            type: trait.type,
            system: trait.system,
            fullName: trait.system.fullName,
            categoryLabel: trait.system.categoryLabel,
            hasLevel: trait.system.hasLevel,
            levelLabel: trait.system.level > 0 ? `(${trait.system.level})` : '',
            isVariable: trait.system.isVariable,
            categoryIcon: this._getTraitIcon(trait.system.category),
            categoryColor: this._getTraitCategoryColor(trait.system.category),
        };
    }

    /**
     * Group talents by tier for display.
     * @param {Object[]} talents  Array of talent objects
     * @returns {Object[]} Array of tier groups
     * @protected
     */
    _groupTalentsByTier(talents) {
        const groups = {};

        for (const talent of talents) {
            const tier = talent.system.tier || 0;
            groups[tier] ??= {
                tier,
                tierLabel: talent.tierLabel || `Tier ${tier}`,
                talents: [],
            };
            groups[tier].talents.push(talent);
        }

        // Convert to sorted array
        return Object.values(groups).sort((a, b) => a.tier - b.tier);
    }

    /**
     * Extract unique categories from talents.
     * @param {Item[]} talents  Array of talent items
     * @returns {string[]} Sorted unique categories
     * @protected
     */
    _getTalentCategories(talents) {
        const categories = new Set();
        for (const talent of talents) {
            if (talent.system.category) {
                categories.add(talent.system.category);
            }
        }
        return Array.from(categories).sort();
    }

    /**
     * Format aptitudes array as readable string.
     * @param {string[]} aptitudes  Array of aptitude names
     * @returns {string} Formatted string
     * @protected
     */
    _formatAptitudes(aptitudes) {
        if (!aptitudes || aptitudes.length === 0) return '—';
        return aptitudes.join(', ');
    }

    /* -------------------------------------------- */
    /*  Traits Preparation Methods                  */
    /* -------------------------------------------- */

    /**
     * Prepare context data for traits tab/panel.
     * @param {object} context  Base context
     * @returns {object} Augmented context with traits data
     * @protected
     */
    _prepareTraitsContext(context) {
        const traits = context.items.filter((i) => i.type === 'trait');

        // Apply filters if present
        let filteredTraits = traits;
        const filter = this._traitsFilter || {};

        if (filter.search) {
            const search = filter.search.toLowerCase();
            filteredTraits = filteredTraits.filter((t) => t.name.toLowerCase().includes(search));
        }

        if (filter.category && filter.category !== 'all') {
            filteredTraits = filteredTraits.filter((t) => t.system.category === filter.category);
        }

        if (filter.hasLevel) {
            filteredTraits = filteredTraits.filter((t) => t.system.hasLevel);
        }

        // Augment with display properties
        const augmentedTraits = filteredTraits.map((t) => this._augmentTraitData(t));

        // Group by category
        const groupedByCategory = this._groupTraitsByCategory(augmentedTraits);

        // Extract unique categories
        const categories = this._getTraitCategories(traits);

        return {
            ...context,
            traits: augmentedTraits,
            groupedByCategory,
            categories,
            traitsCount: traits.length,
            filter: filter,
        };
    }

    /**
     * Group traits by category for display.
     * @param {Object[]} traits  Array of trait objects
     * @returns {Object[]} Array of category groups
     * @protected
     */
    _groupTraitsByCategory(traits) {
        const groups = {
            creature: { category: 'creature', categoryLabel: 'Creature', traits: [] },
            character: { category: 'character', categoryLabel: 'Character', traits: [] },
            elite: { category: 'elite', categoryLabel: 'Elite', traits: [] },
            unique: { category: 'unique', categoryLabel: 'Unique', traits: [] },
            origin: { category: 'origin', categoryLabel: 'Origin Path', traits: [] },
            general: { category: 'general', categoryLabel: 'General', traits: [] },
        };

        for (const trait of traits) {
            const category = trait.system.category || 'general';
            if (groups[category]) {
                groups[category].traits.push(trait);
            } else {
                groups.general.traits.push(trait);
            }
        }

        // Convert to array and filter out empty groups
        return Object.values(groups).filter((group) => group.traits.length > 0);
    }

    /**
     * Get unique trait categories from traits list.
     * @param {Array<Item>} traits  Trait items
     * @returns {Array<Object>} Category options
     * @protected
     */
    _getTraitCategories(traits) {
        const categories = new Set();
        for (const trait of traits) {
            categories.add(trait.system.category || 'general');
        }

        return Array.from(categories)
            .sort()
            .map((cat) => ({
                value: cat,
                label: this._getCategoryLabel(cat),
            }));
    }

    /**
     * Get icon for trait category.
     * @param {string} category  Trait category
     * @returns {string} Font Awesome icon class
     * @protected
     */
    _getTraitIcon(category) {
        const icons = {
            creature: 'fa-paw',
            character: 'fa-user-shield',
            elite: 'fa-star',
            unique: 'fa-gem',
            origin: 'fa-route',
            general: 'fa-shield-alt',
        };
        return icons[category] || 'fa-shield-alt';
    }

    /**
     * Get color class for trait category.
     * @param {string} category  Trait category
     * @returns {string} CSS class
     * @protected
     */
    _getTraitCategoryColor(category) {
        const colors = {
            creature: 'trait-creature',
            character: 'trait-character',
            elite: 'trait-elite',
            unique: 'trait-unique',
            origin: 'trait-origin',
            general: 'trait-general',
        };
        return colors[category] || 'trait-general';
    }

    /**
     * Get label for category.
     * @param {string} category  Category key
     * @returns {string} Human-readable label
     * @protected
     */
    _getCategoryLabel(category) {
        const labels = {
            creature: 'Creature',
            character: 'Character',
            elite: 'Elite',
            unique: 'Unique',
            origin: 'Origin Path',
            general: 'General',
        };
        return labels[category] || 'General';
    }

    /* -------------------------------------------- */

    /**
     * Prepare items display across the sheet.
     * @param {object} context  Context being prepared.
     * @protected
     */
    async _prepareItems(context) {
        context.itemsByType = {};

        for (const item of this.actor.items) {
            const type = item.type;
            context.itemsByType[type] ??= [];
            context.itemsByType[type].push(item);
        }

        // Sort each category
        for (const items of Object.values(context.itemsByType)) {
            items.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
        }

        // Create common item categories
        context.weapons = context.itemsByType.weapon ?? [];
        context.armourItems = context.itemsByType.armour ?? [];
        context.talents = context.itemsByType.talent ?? [];
        context.traits = context.itemsByType.trait ?? [];
        context.gearItems = context.itemsByType.gear ?? [];
        context.psychicPowers = context.itemsByType.psychicPower ?? [];
        context.cybernetics = context.itemsByType.cybernetic ?? [];
        context.conditions = context.itemsByType.condition ?? [];
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /**
     * Handle form submission - override from ApplicationV2.
     * @param {FormDataExtended} formData   The parsed form data
     * @param {SubmitEvent} event           The form submission event
     * @returns {Promise<void>}
     * @override
     * @protected
     */
    async _onSubmitForm(formData, event) {
        // Update the actor with the form data
        await this.document.update(formData.object);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Restore sheet state on first render
        if (!this._stateRestored) {
            await this._restoreSheetState();
        }

        // Add rt-sheet class to the form element for CSS styling
        const form = this.element.querySelector('form');
        if (form) {
            form.classList.add('rt-sheet');
        }

        // Setup document update listener for visual feedback
        if (!this._updateListener) {
            this._updateListener = (document, changes, options, userId) => {
                // Only animate changes from other users or from form submission
                if (document.id === this.actor.id && userId !== game.userId) {
                    this.visualizeChanges(changes);
                }
            };
            Hooks.on('updateActor', this._updateListener);
        }

        // Detect stat changes and trigger animations
        this._detectAndAnimateChanges();

        // Handle delta inputs for numeric fields
        if (this.isEditable) {
            this.element
                .querySelectorAll('input[type="text"][data-dtype="Number"]')
                .forEach((i) => i.addEventListener('change', this._onChangeInputDelta.bind(this)));
        }

        // Auto-select number input values on focus for easy editing
        this.element.querySelectorAll('input[type="number"], input[data-dtype="Number"]').forEach((input) => {
            input.addEventListener('focus', (event) => {
                event.target.select();
            });
        });

        // Set up drag handlers for items
        this.element.querySelectorAll('[data-item-id]').forEach((el) => {
            if (el.dataset.itemId) {
                el.setAttribute('draggable', true);
                el.addEventListener('dragstart', this._onDragItem.bind(this), false);
            }
        });

        // MANUAL FORM HANDLING: Add change listeners to all inputs with names
        if (this.isEditable) {
            this.element.querySelectorAll('input[name], select[name], textarea[name]').forEach((input) => {
                input.addEventListener('change', this._onInputChange.bind(this));
            });
        }

        // Legacy item action handlers for V1 templates
        // These use .item-edit, .item-delete, .item-vocalize classes
        this.element.querySelectorAll('.item-edit').forEach((el) => {
            el.addEventListener('click', (event) => {
                const itemId = event.currentTarget.dataset.itemId || event.currentTarget.closest('[data-item-id]')?.dataset.itemId;
                if (itemId) BaseActorSheet.#itemEdit.call(this, event, event.currentTarget);
            });
        });

        this.element.querySelectorAll('.item-delete').forEach((el) => {
            el.addEventListener('click', (event) => {
                const itemId = event.currentTarget.dataset.itemId || event.currentTarget.closest('[data-item-id]')?.dataset.itemId;
                if (itemId) BaseActorSheet.#itemDelete.call(this, event, event.currentTarget);
            });
        });

        this.element.querySelectorAll('.item-vocalize').forEach((el) => {
            el.addEventListener('click', (event) => {
                const itemId = event.currentTarget.dataset.itemId || event.currentTarget.closest('[data-item-id]')?.dataset.itemId;
                if (itemId) BaseActorSheet.#itemVocalize.call(this, event, event.currentTarget);
            });
        });

        // Legacy panel toggle handlers for V1 templates
        // These use .sheet-control__hide-control class with data-toggle attribute
        this.element.querySelectorAll('.sheet-control__hide-control').forEach((el) => {
            el.addEventListener('click', this._onLegacyPanelToggle.bind(this));
        });

        // Click-outside handler to close characteristic HUD dropdowns
        this._setupClickOutsideHandler();

        // Setup responsive column management via ResizeObserver
        this._setupResponsiveColumns();
    }

    /* -------------------------------------------- */

    /**
     * Setup responsive column management using ResizeObserver.
     * Adjusts --rt-columns CSS variable based on sheet width.
     * @protected
     */
    _setupResponsiveColumns() {
        // Only setup once per sheet instance
        if (this._resizeObserver) return;

        this._resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                const columns = width < 700 ? 1 : width < 900 ? 2 : 3;
                if (this.element) {
                    this.element.style.setProperty('--rt-columns', columns);
                }
            }
        });

        if (this.element) {
            this._resizeObserver.observe(this.element);
        }
    }

    /* -------------------------------------------- */

    /**
     * Setup click-outside handler to close characteristic HUD dropdowns.
     * @protected
     */
    _setupClickOutsideHandler() {
        // Remove any existing handler to avoid duplicates
        if (this._clickOutsideHandler) {
            document.removeEventListener('click', this._clickOutsideHandler);
        }

        this._clickOutsideHandler = (event) => {
            // Check if click was outside any dropdown or toggle button
            const clickedDropdown = event.target.closest('.rt-char-hud-details');
            const clickedToggle = event.target.closest('.rt-char-hud-toggle');

            // If clicked outside dropdowns and toggle buttons, close all dropdowns
            if (!clickedDropdown && !clickedToggle) {
                this.element?.querySelectorAll('.rt-char-hud-details.expanded').forEach((el) => {
                    el.classList.remove('expanded');
                    const toggleIcon = el.closest('.rt-char-hud-item')?.querySelector('.rt-char-hud-toggle-icon');
                    if (toggleIcon) toggleIcon.classList.remove('active');
                });
            }
        };

        document.addEventListener('click', this._clickOutsideHandler);
    }

    /* -------------------------------------------- */

    /**
     * Detect stat changes and trigger appropriate animations.
     * Compares current state with previous state captured during last render.
     * @protected
     */
    _detectAndAnimateChanges() {
        if (!this._previousState) return;

        const current = this.document.system;
        const previous = this._previousState;

        // Check wounds
        if (current.wounds?.value !== previous.wounds) {
            this.animateWoundsChange?.(previous.wounds, current.wounds.value);
        }

        // Check XP
        if (current.experience?.total !== previous.experience) {
            this.animateXPGain?.(previous.experience, current.experience.total);
        }

        // Check characteristics
        for (const [key, char] of Object.entries(current.characteristics || {})) {
            const prevChar = previous.characteristics[key];
            if (!prevChar) continue;

            // Check total change
            if (char.total !== prevChar.total) {
                this.animateCharacteristicChange?.(key, prevChar.total, char.total);
            }
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle legacy panel toggle clicks from V1 templates.
     * Uses the data-toggle attribute to identify which section to expand/collapse.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onLegacyPanelToggle(event) {
        event.preventDefault();
        const target = event.currentTarget.dataset.toggle;
        if (!target) return;

        // Get current expanded state from actor flags
        const expanded = this.actor.getFlag('rogue-trader', 'ui.expanded') || [];
        const isCurrentlyExpanded = expanded.includes(target);

        // Toggle the state
        const newExpanded = isCurrentlyExpanded ? expanded.filter((name) => name !== target) : [...expanded, target];

        // Update actor flags - this will trigger a re-render
        await this.actor.setFlag('rogue-trader', 'ui.expanded', newExpanded);
    }

    /* -------------------------------------------- */

    /**
     * Handle input changes to numeric form fields, allowing them to accept delta-typed inputs.
     * Supports +N (add), -N (subtract), =N (set absolute value) notation.
     * @param {Event} event  Triggering event.
     * @protected
     */
    _onChangeInputDelta(event) {
        const input = event.target;
        const value = input.value.trim();
        if (!value) return;

        const firstChar = value[0];
        if (firstChar === '=') {
            // Set absolute value
            const absolute = parseFloat(value.slice(1));
            if (!isNaN(absolute)) input.value = absolute;
        } else if (['+', '-'].includes(firstChar)) {
            // Add or subtract delta
            const current = foundry.utils.getProperty(this.actor, input.name) ?? 0;
            const delta = parseFloat(value);
            if (!isNaN(delta)) input.value = current + delta;
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle beginning a drag-drop operation on an Item.
     * @param {DragEvent} event  The originating drag event.
     * @protected
     */
    _onDragItem(event) {
        const itemId = event.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) {
            event.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an image via the file browser.
     * @this {BaseActorSheet}
     * @param {PointerEvent} event  The triggering event.
     * @param {HTMLElement} target  The action target.
     */
    static async #onEditImage(event, target) {
        const attr = target.dataset.edit ?? 'img';
        const current = foundry.utils.getProperty(this.document._source, attr);
        const fp = new CONFIG.ux.FilePicker({
            current,
            type: 'image',
            callback: (path) => this.document.update({ [attr]: path }),
            position: {
                top: this.position.top + 40,
                left: this.position.left + 10,
            },
        });
        await fp.browse();
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling from the sheet.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #roll(event, target) {
        const rollType = target.dataset.rollType;
        const rollTarget = target.dataset.rollTarget;
        const specialty = target.dataset.specialty;

        // Add rolling animation for characteristic rolls
        if (rollType === 'characteristic') {
            target.classList.add('rolling');
            target.addEventListener(
                'animationend',
                () => {
                    target.classList.remove('rolling');
                },
                { once: true },
            );
        }

        switch (rollType) {
            case 'characteristic':
                return this.actor.rollCharacteristic?.(rollTarget);
            case 'skill':
                return this.actor.rollSkill?.(rollTarget, specialty);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #itemRoll(event, target) {
        const itemId = target.dataset.itemId || target.closest('[data-item-id]')?.dataset.itemId;
        if (itemId) await this.actor.rollItem?.(itemId);
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #itemEdit(event, target) {
        console.log('RT | itemEdit action triggered', { target, dataset: target.dataset });
        const itemId = target.dataset.itemId || target.closest('[data-item-id]')?.dataset.itemId;
        console.log('RT | itemEdit itemId:', itemId);
        if (!itemId) {
            console.warn('RT | itemEdit: No itemId found', target);
            return;
        }
        const item = this.actor.items.get(itemId);
        console.log('RT | itemEdit item:', item);
        if (!item) {
            console.warn('RT | itemEdit: Item not found with ID', itemId);
            return;
        }
        item.sheet.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #itemDelete(event, target) {
        console.log('RT | itemDelete action triggered', { target, dataset: target.dataset });
        const itemId = target.dataset.itemId || target.closest('[data-item-id]')?.dataset.itemId;
        console.log('RT | itemDelete itemId:', itemId);
        if (!itemId) {
            console.warn('RT | itemDelete: No itemId found', target);
            return;
        }

        const item = this.actor.items.get(itemId);
        console.log('RT | itemDelete item:', item);
        if (!item) {
            console.warn('RT | itemDelete: Item not found with ID', itemId);
            return;
        }

        const confirmed = await ConfirmationDialog.confirm({
            title: 'Confirm Delete',
            content: `Are you sure you want to delete ${item.name}?`,
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
        });

        console.log('RT | itemDelete confirmed:', confirmed);
        if (confirmed) {
            try {
                await this.actor.deleteEmbeddedDocuments('Item', [itemId]);
                console.log('RT | itemDelete: Successfully deleted item', itemId);
            } catch (err) {
                console.error('RT | itemDelete: Error deleting item', err);
                ui.notifications.error(`Failed to delete ${item.name}`);
            }
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle sending an item to chat (vocalize/display).
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #itemVocalize(event, target) {
        console.log('RT | itemVocalize action triggered', { target, dataset: target.dataset });
        const itemId = target.dataset.itemId || target.closest('[data-item-id]')?.dataset.itemId;
        console.log('RT | itemVocalize itemId:', itemId);
        if (!itemId) {
            console.warn('RT | itemVocalize: No item ID found', target);
            return;
        }

        const item = this.actor.items.get(itemId);
        console.log('RT | itemVocalize item:', item);
        if (!item) {
            console.warn(`RT | itemVocalize: Item ${itemId} not found on actor`);
            return;
        }

        try {
            console.log('RT | itemVocalize: Calling item.sendToChat()');
            await item.sendToChat();
            console.log('RT | itemVocalize: Successfully sent to chat');
        } catch (err) {
            console.error('RT | itemVocalize: Error sending item to chat', err);
            ui.notifications.error(`Failed to send ${item.name} to chat`);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle creating an item.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #itemCreate(event, target) {
        const itemType = target.dataset.type ?? 'gear';
        const data = {
            name: `New ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`,
            type: itemType,
        };

        // Add type-specific defaults for array/Set fields to prevent validation errors
        if (itemType === 'armour') {
            data.system = {
                coverage: ['body'], // Default array for SetField
                properties: [], // Default empty array for SetField
            };
        } else if (itemType === 'cybernetic') {
            data.system = {
                locations: ['internal'], // Default for cybernetics
            };
        }

        await this.actor.createEmbeddedDocuments('Item', [data], { renderSheet: true });
    }

    /* -------------------------------------------- */

    /**
     * Handle creating an effect.
     * Opens a streamlined, thematic effect creation dialog.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #effectCreate(event, target) {
        const effect = await EffectCreationDialog.show(this.actor);
        if (effect) {
            ui.notifications.info(`Created effect: ${effect.name}`);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle editing an effect.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #effectEdit(event, target) {
        const effectId = target.closest('[data-effect-id]')?.dataset.effectId;
        const effect = this.actor.effects.get(effectId);
        effect?.sheet.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting an effect.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #effectDelete(event, target) {
        const effectId = target.closest('[data-effect-id]')?.dataset.effectId;
        const effect = this.actor.effects.get(effectId);
        await effect?.delete();
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling an effect.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #effectToggle(event, target) {
        const effectId = target.closest('[data-effect-id]')?.dataset.effectId;
        const effect = this.actor.effects.get(effectId);
        await effect?.update({ disabled: !effect.disabled });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling section visibility (characteristic HUD dropdowns).
     * Uses CSS class toggling for immediate feedback without re-render.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleSection(event, target) {
        event.stopPropagation();
        const sectionName = target.dataset.toggle;
        if (!sectionName) return;

        // Find the dropdown panel element
        const dropdown = this.element.querySelector(`.rt-char-hud-details.${sectionName}`);
        if (!dropdown) return;

        // Close all other dropdowns first
        this.element.querySelectorAll('.rt-char-hud-details.expanded').forEach((el) => {
            if (el !== dropdown) {
                el.classList.remove('expanded');
                // Also remove active class from the toggle icon
                const toggleIcon = el.closest('.rt-char-hud-item')?.querySelector('.rt-char-hud-toggle-icon');
                if (toggleIcon) toggleIcon.classList.remove('active');
            }
        });

        // Toggle this dropdown
        const isExpanded = dropdown.classList.toggle('expanded');

        // Toggle the chevron icon
        const toggleIcon = target.querySelector('.rt-char-hud-toggle-icon');
        if (toggleIcon) {
            toggleIcon.classList.toggle('active', isExpanded);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle skill training button clicks.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleTraining(event, target) {
        const field = target.dataset.field;
        const skillKey = target.dataset.skill;
        const level = target.dataset.level ? parseInt(target.dataset.level) : null;
        const specialty = target.dataset.specialty ?? target.dataset.index;

        // Pattern 1: Simple field toggle
        if (field) {
            const currentValue = target.dataset.value === 'true';
            await this.actor.update({ [field]: !currentValue });
            return;
        }

        // Pattern 2: Level-based training
        if (skillKey && level !== null) {
            const basePath = specialty != null ? `system.skills.${skillKey}.entries.${specialty}` : `system.skills.${skillKey}`;

            // Get current training level
            const skill = specialty != null ? this.actor.system.skills?.[skillKey]?.entries?.[specialty] : this.actor.system.skills?.[skillKey];

            const currentLevel = skill?.plus20 ? 3 : skill?.plus10 ? 2 : skill?.trained ? 1 : 0;

            // Toggle logic: if clicking the current level, reduce by 1; otherwise set to clicked level
            const newLevel = level === currentLevel ? level - 1 : level;

            const updateData = {
                [`${basePath}.trained`]: newLevel >= 1,
                [`${basePath}.plus10`]: newLevel >= 2,
                [`${basePath}.plus20`]: newLevel >= 3,
            };

            await this.actor.update(updateData);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle adding a specialist skill.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #addSpecialistSkill(event, target) {
        const skillKey = target.dataset.skill;
        const skill = this.actor.system.skills?.[skillKey];
        if (!skill) {
            ui.notifications.warn('Skill not specified.');
            return;
        }

        // Check if skill is specialist type
        if (!Array.isArray(skill.entries)) {
            ui.notifications.error(`${skill.label} is not a specialist skill.`);
            return;
        }

        // Get name from dropdown value or prompt user
        let name = '';
        if (target.tagName === 'SELECT') {
            name = target.value;
            if (!name) return; // "-- Add Specialization --" selected

            // Reset dropdown
            target.selectedIndex = 0;
        } else {
            // Use the existing specialist skill dialog
            const { prepareCreateSpecialistSkillPrompt } = await import('../prompts/specialist-skill-dialog.mjs');
            await prepareCreateSpecialistSkillPrompt({
                actor: this.actor,
                skill: skill,
                skillName: skillKey,
            });
            return;
        }

        // For dropdown selection, add directly
        // Check if specialization already exists
        const existing = skill.entries.find((e) => e.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            ui.notifications.warn(`${skill.label} (${name}) already exists.`);
            return;
        }

        // Add new entry
        const entries = foundry.utils.deepClone(skill.entries);
        entries.push({
            name: name,
            slug: name.slugify(),
            characteristic: skill.characteristic,
            trained: false,
            plus10: false,
            plus20: false,
            bonus: 0,
            notes: '',
            cost: 0,
            current: 0,
        });

        await this.actor.update({
            [`system.skills.${skillKey}.entries`]: entries,
        });

        ui.notifications.info(`Added ${skill.label} (${name}) specialization.`);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting a skill specialization.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #deleteSpecialization(event, target) {
        const skillName = target.dataset.skill;
        const index = parseInt(target.dataset.index);

        const skill = this.actor.system.skills[skillName];
        if (!skill || !Array.isArray(skill.entries)) return;

        const entries = [...skill.entries];
        const deletedName = entries[index]?.name || 'this specialization';

        const confirmed = await ConfirmationDialog.confirm({
            title: 'Delete Specialization',
            content: `Delete "${deletedName}"?`,
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
        });

        if (confirmed) {
            entries.splice(index, 1);
            await this.actor.update({ [`system.skills.${skillName}.entries`]: entries });
        }
    }

    /**
     * View skill information from compendium.
     * Opens the skill item sheet from the skills compendium in read-only mode.
     * @this {BaseActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Element that was clicked.
     */
    static async #viewSkillInfo(event, target) {
        event.preventDefault();
        event.stopPropagation();

        const skillKey = target.dataset.skill || target.dataset.rollTarget;
        const specialty = target.dataset.specialty;

        if (!skillKey) {
            console.warn('RT | viewSkillInfo: No skill key found');
            return;
        }

        const skill = this.actor.system.skills?.[skillKey];
        if (!skill) {
            console.warn(`RT | viewSkillInfo: Skill ${skillKey} not found`);
            return;
        }

        // Try to find the skill item in the compendium
        const pack = game.packs.get('rogue-trader.rt-items-skills');
        if (!pack) {
            ui.notifications.warn('Skills compendium not found.');
            return;
        }

        // Search for the skill by label
        const searchLabel = skill.label.toLowerCase().replace(/[^a-z0-9]/g, '');
        const index = await pack.getIndex();
        const entry = index.find((i) => {
            const indexName = i.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return indexName === searchLabel;
        });

        if (!entry) {
            ui.notifications.info(`No compendium entry found for ${skill.label}.`);
            return;
        }

        // Load and render the skill item sheet
        const skillItem = await pack.getDocument(entry._id);
        if (skillItem) {
            skillItem.sheet.render(true, { editable: false });
        }
    }

    /* -------------------------------------------- */
    /*  Drag & Drop                                 */
    /* -------------------------------------------- */

    /** @override */
    async _onDropItem(event, item) {
        if (!this.actor.isOwner) return;

        // Check if this item type is supported
        if (this.constructor.unsupportedItemTypes.has(item.type)) {
            ui.notifications.warn(
                game.i18n.format('RT.Warning.InvalidItem', {
                    itemType: game.i18n.localize(CONFIG.Item.typeLabels[item.type]),
                    actorType: game.i18n.localize(CONFIG.Actor.typeLabels[this.actor.type]),
                }),
            );
            return false;
        }

        // Check if item already exists on actor (for move operations)
        if (this.actor.items.get(item.id)) {
            return this._onSortItem(event, item);
        }

        // Create the item
        return this.actor.createEmbeddedDocuments('Item', [item.toObject()]);
    }

    /* -------------------------------------------- */

    /**
     * Handle sorting an item within the actor's inventory.
     * @param {DragEvent} event  The drop event.
     * @param {Item} item        The item being sorted.
     * @returns {Promise}
     * @protected
     */
    async _onSortItem(event, item) {
        const items = this.actor.items;
        const source = items.get(item.id);

        // Confirm the drop target
        const dropTarget = event.target.closest('[data-item-id]');
        if (!dropTarget) return;
        const target = items.get(dropTarget.dataset.itemId);
        if (source.id === target.id) return;

        // Identify sibling items based on adjacent HTML elements
        const siblings = [];
        for (const element of dropTarget.parentElement.children) {
            const siblingId = element.dataset.itemId;
            if (siblingId && siblingId !== source.id) {
                siblings.push(items.get(element.dataset.itemId));
            }
        }

        // Perform the sort
        const sortUpdates = foundry.utils.performIntegerSort(source, { target, siblings });
        const updateData = sortUpdates.map((u) => {
            const update = u.update;
            update._id = u.target._id;
            return update;
        });

        return this.actor.updateEmbeddedDocuments('Item', updateData);
    }

    /* -------------------------------------------- */
    /*  What-If Mode Actions                        */
    /* -------------------------------------------- */

    /**
     * Enter What-If preview mode
     * @this {BaseActorSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #enterWhatIf(event, target) {
        await this.enterWhatIfMode();
    }

    /**
     * Commit What-If changes
     * @this {BaseActorSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #commitWhatIf(event, target) {
        await this.commitWhatIfChanges();
    }

    /**
     * Cancel What-If mode
     * @this {BaseActorSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #cancelWhatIf(event, target) {
        await this.cancelWhatIfChanges();
    }

    /* -------------------------------------------- */

    /**
     * Handle spending XP to advance a characteristic.
     * @param {Event} event         Triggering click event
     * @param {HTMLElement} target  The button element clicked
     * @protected
     */
    static async #spendXPAdvance(event, target) {
        const charKey = target.dataset.characteristic;
        const char = this.actor.system.characteristics[charKey];

        if (!char) {
            ui.notifications.error('Invalid characteristic!');
            return;
        }

        const cost = char.nextAdvanceCost;
        const available = this.actor.system.experience?.available || 0;

        // Check if enough XP
        if (available < cost) {
            ui.notifications.warn(`Not enough XP! Need ${cost}, have ${available}.`);
            return;
        }

        // Check if already maxed
        if ((char.advance || 0) >= 5) {
            ui.notifications.warn(`${char.label} is already at maximum advancement!`);
            return;
        }

        // Confirm spending
        const confirmed = await ConfirmationDialog.confirm({
            title: `Advance ${char.label}?`,
            content: `<p>Spend <strong>${cost} XP</strong> to advance ${char.label} from ${char.total} to ${char.total + 5}?</p>
                     <p><em>Available XP: ${available}</em></p>`,
            confirmLabel: 'Advance',
            cancelLabel: 'Cancel',
        });

        if (!confirmed) return;

        // Capture old values for animation
        const oldTotal = char.total;
        const oldBonus = char.bonus;
        const oldAdvance = char.advance || 0;

        // Update actor
        const newAdvance = oldAdvance + 1;
        const newSpent = (this.actor.system.experience?.spent || 0) + cost;

        await this.actor.update({
            [`system.characteristics.${charKey}.advance`]: newAdvance,
            'system.experience.spent': newSpent,
        });

        // Calculate new values
        const newTotal = char.base + newAdvance * 5 + (char.modifier || 0);
        const newBonus = Math.floor(newTotal / 10) * (char.unnatural || 1);

        // Success notification
        ui.notifications.info(`${char.label} advanced to ${newTotal}! (−${cost} XP)`);

        // Trigger characteristic change animation
        if (this.animateCharacteristicChange) {
            this.animateCharacteristicChange(charKey, oldTotal, newTotal);
        }

        // Trigger bonus change animation if bonus changed
        if (oldBonus !== newBonus && this.animateCharacteristicBonus) {
            this.animateCharacteristicBonus(charKey, oldBonus, newBonus);
        }

        // Animate circle for V1 HUD (bonus display)
        const circleElement = this.element.querySelector(`[data-characteristic="${charKey}"] .rt-char-hud-circle`);
        if (circleElement) {
            circleElement.classList.add('value-changed');
            setTimeout(() => circleElement.classList.remove('value-changed'), 500);
        }

        // Add value-changed animation to mod display for V1 HUD
        const modElement = this.element.querySelector(`[data-characteristic="${charKey}"] .rt-char-hud-mod`);
        if (modElement) {
            modElement.classList.add('value-changed');
            setTimeout(() => modElement.classList.remove('value-changed'), 500);
        }

        // Update the border progress indicator
        const charBox = this.element.querySelector(`[data-characteristic="${charKey}"]`);
        if (charBox) {
            charBox.style.setProperty('--advance-progress', newAdvance / 5);
            charBox.dataset.advance = newAdvance;
        }
    }

    /* -------------------------------------------- */

    /**
     * Open edit dialog for a characteristic.
     * @param {Event} event         Triggering event
     * @param {HTMLElement} target  Button clicked
     * @protected
     */
    static async #editCharacteristic(event, target) {
        const charKey = target.closest('[data-characteristic]')?.dataset.characteristic;
        if (!charKey) return;

        const char = this.actor.system.characteristics[charKey];
        if (!char) {
            ui.notifications.error('Invalid characteristic!');
            return;
        }

        // Calculate current values
        const currentBase = char.base || 0;
        const currentAdvance = char.advance || 0;
        const currentModifier = char.modifier || 0;
        const currentUnnatural = char.unnatural || 1;

        // Create edit dialog using DialogV2
        const result = await foundry.applications.api.DialogV2.wait({
            window: {
                title: `Edit ${char.label}`,
                icon: 'fas fa-edit',
            },
            content: `
                <div class="rt-char-edit-dialog">
                    <div class="form-group">
                        <label>Base Value</label>
                        <input type="number" name="base" value="${currentBase}" min="0" max="100" />
                    </div>
                    <div class="form-group">
                        <label>Advances (0-5)</label>
                        <input type="number" name="advance" value="${currentAdvance}" min="0" max="5" />
                    </div>
                    <div class="form-group">
                        <label>Modifier</label>
                        <input type="number" name="modifier" value="${currentModifier}" min="-100" max="100" />
                    </div>
                    <div class="form-group">
                        <label>Unnatural Multiplier</label>
                        <input type="number" name="unnatural" value="${currentUnnatural}" min="1" max="10" />
                    </div>
                    <hr/>
                    <div class="rt-char-preview">
                        <p><strong>Total:</strong> <span class="preview-total">${char.total}</span></p>
                        <p><strong>Bonus:</strong> <span class="preview-bonus">${char.bonus}</span></p>
                    </div>
                </div>
            `,
            buttons: [
                {
                    action: 'save',
                    label: 'Save',
                    icon: 'fas fa-save',
                    default: true,
                    callback: (event, button, dialog) => {
                        const formData = new FormDataExtended(button.form).object;
                        return formData;
                    },
                },
                {
                    action: 'cancel',
                    label: 'Cancel',
                    icon: 'fas fa-times',
                },
            ],
            close: () => null,
        });

        // Update actor with new values if saved
        if (result) {
            await this.actor.update({
                [`system.characteristics.${charKey}.base`]: parseInt(result.base) || 0,
                [`system.characteristics.${charKey}.advance`]: parseInt(result.advance) || 0,
                [`system.characteristics.${charKey}.modifier`]: parseInt(result.modifier) || 0,
                [`system.characteristics.${charKey}.unnatural`]: parseInt(result.unnatural) || 1,
            });

            ui.notifications.info(`${char.label} updated successfully!`);
        }
    }
}
