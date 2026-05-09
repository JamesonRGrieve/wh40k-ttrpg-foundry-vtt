import RollConfigurationDialog from '../applications/dialogs/roll-configuration-dialog.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import BasicRollWH40K from './basic-roll.ts';

/**
 * D100Roll - Specialized roll class for d100 skill/characteristic tests
 * Handles success/failure calculation, degrees, and critical results
 * @extends BasicRollWH40K
 */
export default class D100Roll extends BasicRollWH40K {
    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    /**
     * Default flavor for d100 rolls
     * @type {string}
     */
    static defaultFlavor = 'Skill Test';

    /**
     * Chat template for d100 rolls
     * @type {string}
     */
    static chatTemplate = 'systems/wh40k-rpg/templates/chat/simple-roll-chat.hbs';

    /**
     * The configuration dialog class to use
     * @type {typeof RollConfigurationDialog}
     */
    static configurationDialog = RollConfigurationDialog;

    /* -------------------------------------------- */
    /*  Roll Result Properties                      */
    /* -------------------------------------------- */

    /**
     * Get the evaluated total. Rolls are always evaluated before these getters are called.
     * @type {number}
     */
    get evaluatedTotal(): number {
        return this.total as unknown as number;
    }

    /**
     * Get the target number for this roll
     * @type {number}
     */
    get target(): number {
        return (this.configuration.target as number) ?? 0;
    }

    /**
     * Check if the roll succeeded (roll <= target)
     * @type {boolean}
     */
    get isSuccess(): boolean {
        return this.evaluatedTotal <= this.target;
    }

    /**
     * Check if the roll failed (roll > target)
     * @type {boolean}
     */
    get isFailure(): boolean {
        return !this.isSuccess;
    }

    /**
     * Calculate degrees of success (if successful)
     * WH40K RPG: DoS = floor((target - roll) / 10) + 1
     * @type {number}
     */
    get degreesOfSuccess(): number {
        if (!this.isSuccess) return 0;
        return Math.floor((this.target - this.evaluatedTotal) / 10) + 1;
    }

    /**
     * Calculate degrees of failure (if failed)
     * WH40K RPG: DoF = floor((roll - target) / 10) + 1
     * @type {number}
     */
    get degreesOfFailure(): number {
        if (this.isSuccess) return 0;
        return Math.floor((this.evaluatedTotal - this.target) / 10) + 1;
    }

    /**
     * Get degrees (positive for success, negative for failure)
     * @type {number}
     */
    get degrees(): number {
        if (this.isSuccess) return this.degreesOfSuccess;
        return -this.degreesOfFailure;
    }

    /**
     * Absolute value of degrees
     * @type {number}
     */
    get absoluteDegrees(): number {
        return Math.abs(this.degrees);
    }

    /**
     * Check if roll is a critical success
     * Critical Success: Roll 01-05 OR succeed by 3+ DoS
     * @type {boolean}
     */
    get isCriticalSuccess(): boolean {
        if (!this.isSuccess) return false;
        if (this.evaluatedTotal <= 5) return true; // Natural crit (01-05)
        return this.degreesOfSuccess >= 3; // 3+ DoS
    }

    /**
     * Check if roll is a critical failure
     * Critical Failure: Roll 96-00 OR fail by 3+ DoF
     * @type {boolean}
     */
    get isCriticalFailure(): boolean {
        if (this.isSuccess) return false;
        if (this.evaluatedTotal >= 96) return true; // Natural fumble (96-00)
        return this.degreesOfFailure >= 3; // 3+ DoF
    }

    /**
     * Check if the roll doubles (11, 22, 33, etc.)
     * Important for some special rules
     * @type {boolean}
     */
    get isDoubles(): boolean {
        const total = this.evaluatedTotal;
        const tens = Math.floor(total / 10);
        const ones = total % 10;
        return tens === ones;
    }

    /**
     * For weapon attacks: check if doubles on a success triggers Righteous Fury
     * @type {boolean}
     */
    get triggersRighteousFury(): boolean {
        return this.isSuccess && this.isDoubles;
    }

    /* -------------------------------------------- */
    /*  Configuration Dialog                        */
    /* -------------------------------------------- */

    /**
     * Show the configuration dialog for this roll type
     * @param {Object} config - Roll configuration
     * @returns {Promise<Object|null>} Dialog result, or null if cancelled
     * @override
     */
    static override async _showConfigurationDialog(config: Record<string, unknown>): Promise<Record<string, unknown> | null> {
        // Use the configured dialog class
        const DialogClass = this.configurationDialog;
        if (DialogClass === undefined) return config;

        return (await DialogClass.configure(config)) as Record<string, unknown>;
    }

    /* -------------------------------------------- */
    /*  Formula Construction                        */
    /* -------------------------------------------- */

    /**
     * Construct the d100 roll formula
     * @param {Object} config - Roll configuration
     * @returns {string} The roll formula (always "1d100")
     * @override
     */
    static override constructFormula(_config: Record<string, unknown>): string {
        // d100 rolls don't add modifiers to the roll itself
        // Modifiers affect the target number instead
        return '1d100';
    }

    /* -------------------------------------------- */
    /*  Template Data                               */
    /* -------------------------------------------- */

    /**
     * Prepare template data for chat rendering
     * @param {D100Roll} roll - The evaluated roll
     * @param {Object} config - Roll configuration
     * @returns {Promise<Object>} Template data
     * @override
     */
    static override async _prepareTemplateData(roll: BasicRollWH40K, config: Record<string, unknown>): Promise<Record<string, unknown>> {
        const baseData = await super._prepareTemplateData(roll, config);

        // Calculate modifiers for display
        const activeModifiers: Record<string, unknown> = {};
        const modifiersCfg = config.modifiers as Record<string, unknown> | undefined;
        if (modifiersCfg !== undefined) {
            for (const [key, value] of Object.entries(modifiersCfg)) {
                if (value !== 0) {
                    activeModifiers[key.toUpperCase()] = value;
                }
            }
        }

        const d100Roll = roll as D100Roll;
        return {
            ...baseData,
            rollData: {
                ...(baseData.rollData as Record<string, unknown>),
                name: config.name ?? config.flavor ?? this.defaultFlavor,
                baseTarget: config.baseTarget ?? config.target,
                modifiedTarget: config.target,
                activeModifiers: activeModifiers,
                success: d100Roll.isSuccess,
                dos: d100Roll.degreesOfSuccess,
                dof: d100Roll.degreesOfFailure,
                isCriticalSuccess: d100Roll.isCriticalSuccess,
                isCriticalFailure: d100Roll.isCriticalFailure,
                isDoubles: d100Roll.isDoubles,
                triggersRighteousFury: d100Roll.triggersRighteousFury,
                sheetName: (config.actor as { name?: string })?.name ?? (config.speaker as { alias?: string })?.alias ?? '',
            },
        };
    }

    /**
     * Prepare chat message data with roll flags
     * @param {D100Roll} roll - The evaluated roll
     * @param {Object} config - Roll configuration
     * @returns {Promise<Object>} Chat message data
     * @override
     */
    static override async _prepareChatData(roll: BasicRollWH40K, config: Record<string, unknown>): Promise<Record<string, unknown>> {
        const chatData = await super._prepareChatData(roll, config);
        const d100Roll = roll as D100Roll;

        // Add d100-specific flags
        const flags = chatData.flags as Record<string, unknown>;
        const existingFlags = (flags['wh40k-rpg'] as Record<string, unknown>) ?? {};
        flags['wh40k-rpg'] = {
            ...existingFlags,
            target: config.target,
            baseTarget: config.baseTarget ?? config.target,
            success: d100Roll.isSuccess,
            degrees: d100Roll.degrees,
            degreesOfSuccess: d100Roll.degreesOfSuccess,
            degreesOfFailure: d100Roll.degreesOfFailure,
            isCriticalSuccess: d100Roll.isCriticalSuccess,
            isCriticalFailure: d100Roll.isCriticalFailure,
            isDoubles: d100Roll.isDoubles,
        };

        return chatData;
    }

    /* -------------------------------------------- */
    /*  Tooltip Rendering                           */
    /* -------------------------------------------- */

    /**
     * Render enhanced tooltip with target and degrees
     * @returns {Promise<string>} Tooltip HTML
     * @override
     */
    override async getTooltip(): Promise<string> {
        const html = await super.getTooltip();
        const target = this.target;

        // Only enhance if we have a target number
        if (target === undefined) return html;

        // Parse the HTML and add our summary
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const diceTotal = doc.querySelector('.dice-total');

        if (diceTotal !== null) {
            const summary = document.createElement('div');
            summary.className =
                'wh40k-dice-summary tw-mt-2 tw-p-2 tw-bg-[var(--wh40k-panel-bg-translucent)] tw-rounded-md tw-text-[0.85rem] tw-leading-relaxed';

            // Target info
            const targetDiv = document.createElement('div');
            targetDiv.className = 'wh40k-dice-target tw-text-[var(--wh40k-text-muted)] tw-font-medium';
            targetDiv.textContent = `Target: ${target}`;
            summary.appendChild(targetDiv);

            // Result info
            const resultDiv = document.createElement('div');
            resultDiv.className = this.isSuccess
                ? 'wh40k-dice-success tw-text-[var(--wh40k-success-secondary)] tw-font-semibold'
                : 'wh40k-dice-failure tw-text-[var(--wh40k-danger-secondary)] tw-font-semibold';
            const degrees = this.isSuccess ? this.degreesOfSuccess : this.degreesOfFailure;
            const degreeLabel = this.isSuccess ? 'DoS' : 'DoF';
            resultDiv.textContent = `${this.isSuccess ? 'Success' : 'Failure'}: ${degrees} ${degreeLabel}`;
            summary.appendChild(resultDiv);

            // Critical indicator
            if (this.isCriticalSuccess) {
                const critDiv = document.createElement('div');
                critDiv.className = 'wh40k-dice-critical tw-text-[var(--wh40k-gold-bright)] tw-font-bold tw-[text-shadow:0_0_6px_rgba(255,215,0,0.5)]';
                critDiv.textContent = '⚡ Critical Success!';
                summary.appendChild(critDiv);
            } else if (this.isCriticalFailure) {
                const critDiv = document.createElement('div');
                critDiv.className = 'wh40k-dice-fumble tw-text-[var(--wh40k-red-bright)] tw-font-bold tw-[text-shadow:0_0_6px_rgba(255,68,68,0.5)]';
                critDiv.textContent = '💀 Critical Failure!';
                summary.appendChild(critDiv);
            }

            // Doubles indicator (for Righteous Fury)
            if (this.isDoubles && this.isSuccess) {
                const doublesDiv = document.createElement('div');
                doublesDiv.className = 'wh40k-dice-doubles tw-text-[var(--wh40k-warning-primary)] tw-font-semibold tw-italic';
                doublesDiv.textContent = '🔥 Doubles! (Righteous Fury?)';
                summary.appendChild(doublesDiv);
            }

            diceTotal.after(summary);
        }

        return doc.body.innerHTML;
    }

    /* -------------------------------------------- */
    /*  Convenience Methods                         */
    /* -------------------------------------------- */

    /**
     * Create and roll a d100 test against a target number
     * @param {Object} options - Roll options
     * @param {number} options.target - Target number to roll against
     * @param {string} [options.flavor] - Roll flavor text
     * @param {Actor} [options.actor] - The actor making the test
     * @param {Object} [options.modifiers] - Named modifiers affecting the target
     * @param {boolean} [options.configure=true] - Whether to show configuration
     * @returns {Promise<ChatMessage|null>}
     */
    static async test(options: Record<string, unknown> = {}): Promise<ChatMessage | null> {
        return this.build({
            ...options,
            baseTarget: options['baseTarget'] ?? options['target'],
        });
    }

    /**
     * Perform a quick characteristic test
     * @param {Actor} actor - The actor making the test
     * @param {string} characteristic - The characteristic key (e.g., "weaponSkill")
     * @param {Object} [options] - Additional options
     * @returns {Promise<ChatMessage|null>}
     */
    static async characteristicTest(actor: WH40KBaseActor, characteristic: string, options: Record<string, unknown> = {}): Promise<ChatMessage | null> {
        const system = actor.system as { characteristics?: Record<string, { total: number; label?: string }> };
        const charData = system.characteristics?.[characteristic];
        if (charData === undefined) {
            ui.notifications.warn(`Characteristic "${characteristic}" not found`);
            return null;
        }

        return this.test({
            actor: actor,
            target: charData.total,
            baseTarget: charData.total,
            flavor: `${charData.label ?? characteristic} Test`,
            speaker: ChatMessage.getSpeaker({ actor }),
            ...options,
        });
    }

    /**
     * Perform a quick skill test
     * @param {Actor} actor - The actor making the test
     * @param {string} skill - The skill key (e.g., "dodge")
     * @param {Object} [options] - Additional options
     * @returns {Promise<ChatMessage|null>}
     */
    static async skillTest(actor: WH40KBaseActor, skill: string, options: Record<string, unknown> = {}): Promise<ChatMessage | null> {
        const system = actor.system as { skills?: Record<string, { current: number; label?: string }> };
        const skillData = system.skills?.[skill];
        if (skillData === undefined) {
            ui.notifications.warn(`Skill "${skill}" not found`);
            return null;
        }

        return this.test({
            actor: actor,
            target: skillData.current,
            baseTarget: skillData.current,
            flavor: `${skillData.label ?? skill} Test`,
            speaker: ChatMessage.getSpeaker({ actor }),
            ...options,
        });
    }
}
