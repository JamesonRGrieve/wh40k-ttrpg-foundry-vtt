import type { WH40KBaseActor } from '../documents/base-actor.ts';

// Allow custom hook names beyond fvtt-types' strict HookConfig keyof constraint.
type HooksCompat = typeof Hooks & {
    call(hook: string, ...args: unknown[]): boolean;
    callAll(hook: string, ...args: unknown[]): boolean;
};
const HooksExt = Hooks as HooksCompat;

/**
 * BasicRollWH40K - Extended Roll class for WH40K RPG VTT
 * Implements three-stage roll workflow: Configure → Evaluate → Post
 * Similar to dnd5e's modern roll architecture
 * @extends Roll
 */
export default class BasicRollWH40K extends Roll {
    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    /**
     * Default flavor text for this roll type
     * @type {string}
     */
    static defaultFlavor = 'WH40K RPG Roll';

    /**
     * Default chat template for this roll type
     * @type {string}
     */
    static chatTemplate = 'systems/wh40k-rpg/templates/chat/simple-roll-chat.hbs';

    /**
     * V13: Define EVALUATION_TEMPLATE for dice tooltip
     * @type {string}
     */
    static EVALUATION_TEMPLATE = 'systems/wh40k-rpg/templates/chat/roll-tooltip.hbs';

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    /**
     * Configuration data used to create this roll
     * @type {Record<string, unknown>}
     */
    configuration: Record<string, unknown> = {};

    /* -------------------------------------------- */
    /*  Three-Stage Build Workflow                  */
    /* -------------------------------------------- */

    /**
     * Main entry point for the three-stage roll workflow
     * Stage 1: Configure → Stage 2: Evaluate → Stage 3: Post
     * @param {Record<string, unknown>} config - Roll configuration
     * @returns {Promise<ChatMessage|null>} The created chat message, or null if cancelled
     */
    static async build(config: Record<string, unknown> = {}): Promise<ChatMessage | null> {
        // Stage 1: Configure
        const configured = await this.buildConfigure(config);
        if (configured === null) return null;

        // Stage 2: Evaluate
        const evaluated = await this.buildEvaluate(configured);

        // Stage 3: Post to chat
        return (await this.buildPost(evaluated)) ?? null;
    }

    /**
     * Stage 1: Show configuration dialog and gather roll options
     * @param {Record<string, unknown>} config - Initial configuration
     * @returns {Promise<Record<string, unknown>|null>} Final configuration, or null if cancelled
     */
    static async buildConfigure(config: Record<string, unknown>): Promise<Record<string, unknown> | null> {
        // Fire pre-roll hook - allows modules to modify or cancel the roll
        const hookResult = HooksExt.call('wh40k-rpg.preRoll', this, config);
        if (!hookResult) return null;

        // Show configuration dialog if needed
        if (config.configure !== false && config.dialog !== false) {
            const dialogResult = await this._showConfigurationDialog(config);
            if (dialogResult === null) return null; // User cancelled
            Object.assign(config, dialogResult);
        }

        // Fire post-configuration hook
        HooksExt.callAll('wh40k-rpg.postRollConfiguration', this, config);

        return config;
    }

    /**
     * Show the configuration dialog for this roll type
     * Override in subclasses to provide custom dialogs
     * @param {Record<string, unknown>} config - Roll configuration
     * @returns {Promise<Record<string, unknown>|null>} Dialog result, or null if cancelled
     * @protected
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- subclasses override with async impls
    static async _showConfigurationDialog(config: Record<string, unknown>): Promise<Record<string, unknown> | null> {
        return config;
    }

    /**
     * Stage 2: Construct and evaluate the roll
     * @param {Record<string, unknown>} config - Final configuration
     * @returns {Promise<BasicRollWH40K>} The evaluated roll
     */
    static async buildEvaluate(config: Record<string, unknown>): Promise<BasicRollWH40K> {
        // Construct roll formula
        const formula = this.constructFormula(config);

        // Create roll with clean options (only pass valid Roll options)
        const rollOptions: Record<string, unknown> = {
            flavor: config.flavor,
            ...(config.rollOptions as Record<string, unknown>),
        };
        const roll = new this(formula, ((config.data as Record<string, unknown> | undefined) ?? {}) as Record<string, never>, rollOptions);

        // Store configuration for later reference (separate from Roll options)
        roll.configuration = foundry.utils.deepClone(config);

        // Evaluate the roll
        await roll.evaluate();

        // Fire post-evaluation hook
        HooksExt.callAll('wh40k-rpg.postRollEvaluate', roll, config);

        return roll;
    }

    /**
     * Stage 3: Post the roll to chat
     * @param {BasicRollWH40K} roll - The evaluated roll
     * @returns {Promise<ChatMessage>} The created chat message
     */
    static async buildPost(roll: BasicRollWH40K): Promise<ChatMessage | null | undefined> {
        const config = roll.configuration;

        // Prepare chat message data
        const chatData = await this._prepareChatData(roll, config);

        // Apply roll mode visibility
        const rollMode = ((config.rollMode as string | undefined) ?? game.settings.get('core', 'rollMode')) as ChatMessage.PassableRollMode;
        ChatMessage.applyRollMode(chatData, rollMode);

        // Create the chat message
        const message = await ChatMessage.create(chatData);

        // Fire post-message hook
        HooksExt.callAll('wh40k-rpg.postRollPost', message, roll, config);

        return message;
    }

    /**
     * Prepare chat message data for the roll
     * @param {BasicRollWH40K} roll - The evaluated roll
     * @param {Record<string, unknown>} config - Roll configuration
     * @returns {Promise<Record<string, unknown>>} Chat message data
     * @protected
     */
    static async _prepareChatData(roll: BasicRollWH40K, config: Record<string, unknown>): Promise<Record<string, unknown>> {
        // Get speaker data
        const speaker = config.speaker ?? ChatMessage.getSpeaker({ actor: config.actor as WH40KBaseActor });

        // Render the chat template - V13: use namespaced renderTemplate
        const templateData = await this._prepareTemplateData(roll, config);
        const content = await foundry.applications.handlebars.renderTemplate(this.chatTemplate, templateData);

        // V13: Don't specify type - provide rolls directly and Foundry handles it
        return {
            rolls: [roll],
            speaker: speaker,
            content: content,
            flavor: config.flavor ?? this.defaultFlavor,
            flags: {
                'wh40k-rpg': {
                    rollType: this.name,
                    target: config.target,
                    ...(config.flags as Record<string, unknown>),
                },
            },
        };
    }

    /**
     * Prepare template data for rendering the chat message
     * @param {BasicRollWH40K} roll - The evaluated roll
     * @param {Record<string, unknown>} config - Roll configuration
     * @returns {Promise<Record<string, unknown>>} Template data
     * @protected
     */
    static async _prepareTemplateData(roll: BasicRollWH40K, config: Record<string, unknown>): Promise<Record<string, unknown>> {
        return {
            roll: roll,
            rollData: {
                name: (config.flavor as string | undefined) ?? this.defaultFlavor,
                roll: roll,
                render: await roll.render(),
                ...config,
            },
        };
    }

    /**
     * Construct the roll formula from configuration
     * Override in subclasses for different roll types
     * @param {Record<string, unknown>} config - Roll configuration
     * @returns {string} The roll formula
     */
    static constructFormula(config: Record<string, unknown>): string {
        const parts = [(config.base as string | undefined) ?? '1d100'];

        // Add flat modifier
        if (config.modifier !== undefined && config.modifier !== null && config.modifier !== '') {
            const mod = parseInt(config.modifier as string);
            if (mod !== 0) {
                parts.push(mod > 0 ? `+ ${mod}` : `- ${Math.abs(mod)}`);
            }
        }

        return parts.join(' ');
    }

    /* -------------------------------------------- */
    /*  Convenience Methods                         */
    /* -------------------------------------------- */

    /**
     * Quick roll without showing configuration dialog
     * @param {Record<string, unknown>} config - Roll configuration
     * @returns {Promise<ChatMessage|null>}
     */
    static async roll(config: Record<string, unknown> = {}): Promise<ChatMessage | null> {
        config.configure = false;
        return this.build(config);
    }

    /**
     * Roll without posting to chat
     * @param {Record<string, unknown>} config - Roll configuration
     * @returns {Promise<BasicRollWH40K|null>} The evaluated roll
     */
    static async evaluate(config: Record<string, unknown> = {}): Promise<BasicRollWH40K | null> {
        const configured = await this.buildConfigure(config);
        if (configured === null) return null;
        return this.buildEvaluate(configured);
    }

    /* -------------------------------------------- */
    /*  Serialization                               */
    /* -------------------------------------------- */

    /**
     * Serialize the roll to JSON, including configuration
     * @returns {Record<string, unknown>}
     * @override
     */
    toJSON(): ReturnType<Roll['toJSON']> & { configuration?: Record<string, unknown> } {
        const json: ReturnType<Roll['toJSON']> & { configuration?: Record<string, unknown> } = super.toJSON();
        json.configuration = this.configuration;
        return json;
    }

    /**
     * Recreate a roll from serialized data
     * @param {Roll.Data} data - Serialized roll data
     * @returns {BasicRollWH40K}
     * @override
     */
    static fromData<T extends Roll.Internal.AnyConstructor>(this: T, data: Roll.Data): ReturnType<typeof Roll.fromData<T>> {
        const dataWithConfig = data as Roll.Data & { configuration?: Record<string, unknown> };
        try {
            // Let parent class handle core roll reconstruction
            const roll = super.fromData(data);

            // Restore our custom configuration
            if (dataWithConfig.configuration !== undefined) {
                (roll as BasicRollWH40K).configuration = dataWithConfig.configuration;
            }

            return roll as ReturnType<typeof Roll.fromData<T>>;
        } catch (error) {
            console.warn(`Failed to recreate roll from data:`, error);
            // Return a basic roll as fallback
            return super.fromData(data) as ReturnType<typeof Roll.fromData<T>>;
        }
    }
}
