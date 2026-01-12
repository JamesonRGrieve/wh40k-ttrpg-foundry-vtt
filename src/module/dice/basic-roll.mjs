/**
 * BasicRollRT - Extended Roll class for Rogue Trader VTT
 * Implements three-stage roll workflow: Configure → Evaluate → Post
 * Similar to dnd5e's modern roll architecture
 * @extends Roll
 */
export default class BasicRollRT extends Roll {

    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    /**
     * Default flavor text for this roll type
     * @type {string}
     */
    static defaultFlavor = "Rogue Trader Roll";

    /**
     * Default chat template for this roll type
     * @type {string}
     */
    static chatTemplate = "systems/rogue-trader/templates/chat/simple-roll-chat.hbs";

    /**
     * V13: Define EVALUATION_TEMPLATE for dice tooltip
     * @type {string}
     */
    static EVALUATION_TEMPLATE = "systems/rogue-trader/templates/chat/roll-tooltip.hbs";

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    /**
     * Configuration data used to create this roll
     * @type {Object}
     */
    configuration = {};

    /* -------------------------------------------- */
    /*  Three-Stage Build Workflow                  */
    /* -------------------------------------------- */

    /**
     * Main entry point for the three-stage roll workflow
     * Stage 1: Configure → Stage 2: Evaluate → Stage 3: Post
     * @param {Object} config - Roll configuration
     * @param {Actor} [config.actor] - The actor performing the roll
     * @param {string} [config.flavor] - Roll flavor text
     * @param {boolean} [config.configure=true] - Whether to show configuration dialog
     * @param {string} [config.rollMode] - The roll visibility mode
     * @param {Object} [config.speaker] - Chat message speaker data
     * @param {Object} [config.data] - Roll data for formula evaluation
     * @returns {Promise<ChatMessage|null>} The created chat message, or null if cancelled
     */
    static async build(config = {}) {
        // Stage 1: Configure
        const configured = await this.buildConfigure(config);
        if (!configured) return null;

        // Stage 2: Evaluate
        const evaluated = await this.buildEvaluate(configured);

        // Stage 3: Post to chat
        return this.buildPost(evaluated);
    }

    /**
     * Stage 1: Show configuration dialog and gather roll options
     * @param {Object} config - Initial configuration
     * @returns {Promise<Object|null>} Final configuration, or null if cancelled
     */
    static async buildConfigure(config) {
        // Fire pre-roll hook - allows modules to modify or cancel the roll
        const hookResult = Hooks.call("rogue-trader.preRoll", this, config);
        if (hookResult === false) return null;

        // Show configuration dialog if needed
        if (config.configure !== false && config.dialog !== false) {
            // Dialog handling would go here - for now we pass through
            // Subclasses can override this to show their own dialogs
            const dialogResult = await this._showConfigurationDialog(config);
            if (dialogResult === null) return null; // User cancelled
            Object.assign(config, dialogResult);
        }

        // Fire post-configuration hook
        Hooks.callAll("rogue-trader.postRollConfiguration", this, config);

        return config;
    }

    /**
     * Show the configuration dialog for this roll type
     * Override in subclasses to provide custom dialogs
     * @param {Object} config - Roll configuration
     * @returns {Promise<Object|null>} Dialog result, or null if cancelled
     * @protected
     */
    static async _showConfigurationDialog(config) {
        // Base implementation just returns the config unchanged
        // Subclasses override this to show actual dialogs
        return config;
    }

    /**
     * Stage 2: Construct and evaluate the roll
     * @param {Object} config - Final configuration
     * @returns {Promise<BasicRollRT>} The evaluated roll
     */
    static async buildEvaluate(config) {
        // Construct roll formula
        const formula = this.constructFormula(config);
        
        // Create roll with clean options (only pass valid Roll options)
        const rollOptions = {
            flavor: config.flavor,
            ...config.rollOptions
        };
        const roll = new this(formula, config.data || {}, rollOptions);

        // Store configuration for later reference (separate from Roll options)
        roll.configuration = foundry.utils.deepClone(config);

        // Evaluate the roll
        await roll.evaluate();

        // Fire post-evaluation hook
        Hooks.callAll("rogue-trader.postRollEvaluate", roll, config);

        return roll;
    }

    /**
     * Stage 3: Post the roll to chat
     * @param {BasicRollRT} roll - The evaluated roll
     * @returns {Promise<ChatMessage>} The created chat message
     */
    static async buildPost(roll) {
        const config = roll.configuration;

        // Prepare chat message data
        const chatData = await this._prepareChatData(roll, config);

        // Apply roll mode visibility
        const rollMode = config.rollMode || game.settings.get("core", "rollMode");
        ChatMessage.applyRollMode(chatData, rollMode);

        // Create the chat message
        const message = await ChatMessage.create(chatData);

        // Fire post-message hook
        Hooks.callAll("rogue-trader.postRollPost", message, roll, config);

        return message;
    }

    /**
     * Prepare chat message data for the roll
     * @param {BasicRollRT} roll - The evaluated roll
     * @param {Object} config - Roll configuration
     * @returns {Promise<Object>} Chat message data
     * @protected
     */
    static async _prepareChatData(roll, config) {
        // Get speaker data
        const speaker = config.speaker || ChatMessage.getSpeaker({ actor: config.actor });

        // Render the chat template - V13: use namespaced renderTemplate
        const templateData = await this._prepareTemplateData(roll, config);
        const content = await foundry.applications.handlebars.renderTemplate(this.chatTemplate, templateData);

        // V13: Don't specify type - provide rolls directly and Foundry handles it
        return {
            rolls: [roll],
            speaker: speaker,
            content: content,
            flavor: config.flavor || this.defaultFlavor,
            flags: {
                "rogue-trader": {
                    rollType: this.name,
                    target: config.target,
                    ...config.flags
                }
            }
        };
    }

    /**
     * Prepare template data for rendering the chat message
     * @param {BasicRollRT} roll - The evaluated roll
     * @param {Object} config - Roll configuration
     * @returns {Promise<Object>} Template data
     * @protected
     */
    static async _prepareTemplateData(roll, config) {
        return {
            roll: roll,
            rollData: {
                name: config.flavor || this.defaultFlavor,
                roll: roll,
                render: await roll.render(),
                ...config
            }
        };
    }

    /**
     * Construct the roll formula from configuration
     * Override in subclasses for different roll types
     * @param {Object} config - Roll configuration
     * @returns {string} The roll formula
     */
    static constructFormula(config) {
        const parts = [config.base || "1d100"];

        // Add flat modifier
        if (config.modifier) {
            const mod = parseInt(config.modifier);
            if (mod !== 0) {
                parts.push(mod > 0 ? `+ ${mod}` : `- ${Math.abs(mod)}`);
            }
        }

        return parts.join(" ");
    }

    /* -------------------------------------------- */
    /*  Convenience Methods                         */
    /* -------------------------------------------- */

    /**
     * Quick roll without showing configuration dialog
     * @param {Object} config - Roll configuration
     * @returns {Promise<ChatMessage|null>}
     */
    static async roll(config = {}) {
        config.configure = false;
        return this.build(config);
    }

    /**
     * Roll without posting to chat
     * @param {Object} config - Roll configuration
     * @returns {Promise<BasicRollRT>} The evaluated roll
     */
    static async evaluate(config = {}) {
        const configured = await this.buildConfigure(config);
        if (!configured) return null;
        return this.buildEvaluate(configured);
    }

    /* -------------------------------------------- */
    /*  Serialization                               */
    /* -------------------------------------------- */

    /**
     * Serialize the roll to JSON, including configuration
     * @returns {Object}
     * @override
     */
    toJSON() {
        const json = super.toJSON();
        json.configuration = this.configuration;
        return json;
    }

    /**
     * Recreate a roll from serialized data
     * @param {Object} data - Serialized roll data
     * @returns {BasicRollRT}
     * @override
     */
    static fromData(data) {
        try {
            // Let parent class handle core roll reconstruction
            const roll = super.fromData(data);
            
            // Restore our custom configuration
            if (data.configuration) {
                roll.configuration = data.configuration;
            }
            
            return roll;
        } catch (error) {
            console.warn(`Failed to recreate ${this.name} from data:`, error);
            // Return a basic roll as fallback
            return super.fromData(data);
        }
    }
}
