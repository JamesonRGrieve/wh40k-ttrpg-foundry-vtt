/**
 * @file EnhancedSkillDialog - Enhanced V2 dialog for skill/characteristic rolls
 * Showcase feature demonstrating ApplicationV2 capabilities with:
 * - Visual difficulty presets with icons
 * - Common modifier checkboxes
 * - Live target calculation
 * - Recent rolls memory
 * - Animated feedback
 */

import { sendActionDataToChat } from '../../rolls/roll-helpers.ts';
import ApplicationV2Mixin, { setupNumberInputAutoSelect } from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

interface DifficultyPreset {
    key: string;
    label: string;
    modifier: number;
    icon: string;
    description: string;
}

interface CommonModifierPreset {
    key: string;
    label: string;
    value: number;
    description: string;
}

interface EnhancedSkillDialogData {
    name?: string;
    rollData?: {
        name?: string;
        baseTarget?: number;
        modifiers: Record<string, number>;
        calculateTotalModifiers: () => Promise<void>;
    };
}

/**
 * Enhanced dialog for configuring skill or characteristic rolls.
 */
export default class EnhancedSkillDialog extends ApplicationV2Mixin(ApplicationV2) {
    /**
     * @param {EnhancedSkillDialogData} simpleSkillData  The skill data.
     * @param {ApplicationV2Config.DefaultOptions} [options={}]     Dialog options.
     */
    constructor(simpleSkillData: EnhancedSkillDialogData = {}, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.simpleSkillData = simpleSkillData;
        this._selectedDifficulty = 0;
        this._commonModifiers = {};
        this._customModifier = 0;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'enhanced-skill-roll', 'standard-form'],
        actions: {
            selectDifficulty: EnhancedSkillDialog.#onSelectDifficulty as unknown as ApplicationV2Config.DefaultOptions['actions'],
            toggleModifier: EnhancedSkillDialog.#onToggleModifier as unknown as ApplicationV2Config.DefaultOptions['actions'],
            updateCustom: EnhancedSkillDialog.#onUpdateCustom as unknown as ApplicationV2Config.DefaultOptions['actions'],
            roll: EnhancedSkillDialog.#onRoll as unknown as ApplicationV2Config.DefaultOptions['actions'],
            rollRepeat: EnhancedSkillDialog.#onRollRepeat as unknown as ApplicationV2Config.DefaultOptions['actions'],
            cancel: EnhancedSkillDialog.#onCancel as unknown as ApplicationV2Config.DefaultOptions['actions'],
        },
        form: {
            submitOnChange: false,
            closeOnSubmit: false,
        },
        position: {
            width: 450,
            height: 'auto',
        },
        window: {
            title: 'Skill Test',
            minimizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/enhanced-skill-roll.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Difficulty Presets                          */
    /* -------------------------------------------- */

    static DIFFICULTIES: DifficultyPreset[] = [
        { key: 'trivial', label: 'Trivial', modifier: 60, icon: 'fa-smile', description: 'Automatic success unless complications' },
        { key: 'easy', label: 'Easy', modifier: 30, icon: 'fa-grin', description: 'Simple tasks with no pressure' },
        { key: 'routine', label: 'Routine', modifier: 20, icon: 'fa-meh', description: 'Standard tasks with time' },
        { key: 'ordinary', label: 'Ordinary', modifier: 10, icon: 'fa-smile-beam', description: 'Typical difficulty' },
        { key: 'challenging', label: 'Challenging', modifier: 0, icon: 'fa-grimace', description: 'No modifier (baseline)' },
        { key: 'difficult', label: 'Difficult', modifier: -10, icon: 'fa-frown', description: 'Complex or contested tasks' },
        { key: 'hard', label: 'Hard', modifier: -20, icon: 'fa-dizzy', description: 'Very challenging circumstances' },
        { key: 'veryHard', label: 'Very Hard', modifier: -30, icon: 'fa-tired', description: 'Exceptional difficulty' },
        { key: 'hellish', label: 'Hellish', modifier: -60, icon: 'fa-skull', description: 'Near-impossible feats' },
    ];

    static COMMON_MODIFIERS: CommonModifierPreset[] = [
        { key: 'goodTools', label: 'Good Tools', value: 10, description: 'Quality equipment aids the task' },
        { key: 'poorTools', label: 'Poor Tools', value: -10, description: 'Inadequate or damaged equipment' },
        { key: 'rushed', label: 'Rushed', value: -10, description: 'Insufficient time to work carefully' },
        { key: 'extraTime', label: 'Extra Time', value: 10, description: 'Taking time to work methodically' },
        { key: 'assistance', label: 'Assistance', value: 10, description: '+10 per helper (max +30)' },
    ];

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The skill data.
     * @type {object}
     */
    simpleSkillData;

    /**
     * Currently selected difficulty modifier.
     * @type {number}
     * @private
     */
    _selectedDifficulty = 0;

    /**
     * Active common modifiers.
     * @type {Record<string, boolean>}
     * @private
     */
    _commonModifiers = {};

    /**
     * Custom modifier value.
     * @type {number}
     * @private
     */
    _customModifier = 0;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<unknown> {
        const context = (await super._prepareContext(options)) as Record<string, unknown>;
        const rollData = this.simpleSkillData.rollData;

        // Calculate total modifier
        const difficultyMod = this._selectedDifficulty;
        const commonMod = this._calculateCommonModifiers();
        const customMod = this._customModifier;
        const totalModifier = difficultyMod + commonMod + customMod;

        // Prepare difficulty buttons
        const difficulties = EnhancedSkillDialog.DIFFICULTIES.map((d) => ({
            ...d,
            selected: d.modifier === this._selectedDifficulty,
            cssClass: d.modifier === this._selectedDifficulty ? 'selected' : '',
        }));

        // Prepare common modifiers
        const commonModifiers = EnhancedSkillDialog.COMMON_MODIFIERS.map((m) => ({
            ...m,
            checked: this._commonModifiers[m.key] || false,
        }));

        // Get recent rolls from user flags
        const recentRolls = this._getRecentRolls();

        return {
            ...context,
            skillName: this.simpleSkillData.name ?? rollData?.name ?? 'Test',
            baseTarget: rollData?.baseTarget ?? 0,
            finalTarget: (rollData?.baseTarget ?? 0) + totalModifier,
            difficulties,
            commonModifiers,
            customModifier: this._customModifier,
            totalModifier,
            difficultyMod,
            commonMod,
            recentRolls,
            hasRecentRolls: recentRolls.length > 0,
        };
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context: unknown, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        setupNumberInputAutoSelect(this.element);

        // Focus custom modifier input
        const customInput = this.element.querySelector('#customModifier') as HTMLInputElement | null;
        customInput?.addEventListener('input', (e: Event) => {
            const input = e.target as HTMLInputElement;
            this._customModifier = parseInt(input.value, 10) || 0;
            void this.render(false, { parts: ['form'] });
        });

        // Add keyboard shortcut (Enter to roll)
        this.element.addEventListener('keydown', (e: Event) => {
            const ke = e as KeyboardEvent;
            if (ke.key === 'Enter' && !ke.shiftKey) {
                ke.preventDefault();
                void this._performRoll();
            }
        });
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Calculate total from common modifiers.
     * @returns {number}
     * @private
     */
    _calculateCommonModifiers(): number {
        let total = 0;
        for (const [key, active] of Object.entries(this._commonModifiers)) {
            if (!active) continue;
            const modifier = EnhancedSkillDialog.COMMON_MODIFIERS.find((m) => m.key === key);
            if (modifier) total += modifier.value;
        }
        return total;
    }

    /* -------------------------------------------- */

    /**
     * Get recent rolls from user flags.
     * @returns {Array<{name: string, modifier: number, timestamp: number}>}
     * @private
     */
    _getRecentRolls(): Array<{ name: string; modifier: number; timestamp: number }> {
        const recent = (game.user as any).getFlag('wh40k-rpg', 'recentRolls') as Array<{ name: string; modifier: number; timestamp: number }> | undefined;
        return recent?.slice(0, 3) ?? [];
    }

    /* -------------------------------------------- */

    /**
     * Save this roll to recent rolls.
     * @param {number} modifier  Total modifier used.
     * @private
     */
    async _saveToRecentRolls(modifier: number): Promise<void> {
        const recent =
            ((game.user as any).getFlag('wh40k-rpg', 'recentRolls') as Array<{ name: string; modifier: number; timestamp: number }> | undefined) ?? [];
        recent.unshift({
            name: this.simpleSkillData.name ?? 'Test',
            modifier,
            timestamp: Date.now(),
        });

        const trimmed = recent.slice(0, 10);
        await (game.user as any).setFlag('wh40k-rpg', 'recentRolls', trimmed);
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle difficulty button click.
     */
    static async #onSelectDifficulty(this: EnhancedSkillDialog, event: Event, target: HTMLElement): Promise<void> {
        const modifier = parseInt(target.dataset.modifier ?? '0', 10);
        this._selectedDifficulty = modifier;

        // Animate selection
        target.classList.add('flash-select');
        setTimeout(() => target.classList.remove('flash-select'), 300);

        await this.render(false, { parts: ['form'] });
    }

    /* -------------------------------------------- */

    /**
     * Handle common modifier checkbox toggle.
     */
    static async #onToggleModifier(this: EnhancedSkillDialog, event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset.modifierKey;
        if (key) {
            this._commonModifiers[key] = (target as HTMLInputElement).checked;
            await this.render(false, { parts: ['form'] });
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle custom modifier input change.
     */
    static async #onUpdateCustom(this: EnhancedSkillDialog, event: Event, target: HTMLElement): Promise<void> {
        this._customModifier = parseInt((target as HTMLInputElement).value) || 0;
        await this.render(false, { parts: ['form'] });
    }

    /* -------------------------------------------- */

    /**
     * Handle roll button click.
     */
    static async #onRoll(this: EnhancedSkillDialog, event: Event, target: HTMLElement): Promise<void> {
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle repeat last roll button click.
     */
    static async #onRollRepeat(this: EnhancedSkillDialog, event: Event, target: HTMLElement): Promise<void> {
        const modifier = parseInt(target.dataset.modifier ?? '0', 10);

        // Apply the modifier directly
        this._customModifier = modifier - this._selectedDifficulty;

        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     */
    static async #onCancel(this: EnhancedSkillDialog, event: Event, target: HTMLElement): Promise<void> {
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /**
     * Perform the skill roll.
     * @protected
     */
    async _performRoll(): Promise<void> {
        const rollData = this.simpleSkillData.rollData;
        if (!rollData) return;

        // Calculate total modifier
        const totalModifier = this._selectedDifficulty + this._calculateCommonModifiers() + this._customModifier;

        // Apply to roll data
        rollData.modifiers['difficulty'] = this._selectedDifficulty;
        rollData.modifiers['common'] = this._calculateCommonModifiers();
        rollData.modifiers['modifier'] = this._customModifier;

        // Save to recent rolls
        await this._saveToRecentRolls(totalModifier);

        // Execute roll
        await rollData.calculateTotalModifiers();
        await (this.simpleSkillData as any).calculateSuccessOrFailure?.();
        await sendActionDataToChat(this.simpleSkillData as any);

        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open an enhanced skill roll dialog.
 * @param {object} simpleSkillData  The skill data.
 */
export function prepareEnhancedSkillRoll(simpleSkillData) {
    const prompt = new EnhancedSkillDialog(simpleSkillData);
    prompt.render(true);
}
