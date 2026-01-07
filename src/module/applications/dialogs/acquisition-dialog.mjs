/**
 * @file AcquisitionDialog - Profit Factor test dialog for acquiring items
 * ApplicationV2 dialog for Rogue Trader acquisition tests
 * 
 * Features:
 * - Auto-calculate availability modifiers
 * - Common modifier checkboxes
 * - Custom modifier input
 * - Live target calculation
 * - Drag-drop items to auto-fill
 * - Acquisition history tracking
 * - Critical failure PF reduction
 * - Success adds item to inventory
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class AcquisitionDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "acquisition-dialog-{id}",
        classes: ["rogue-trader", "acquisition-dialog"],
        tag: "form",
        window: {
            title: "RT.Acquisition.Title",
            icon: "fa-solid fa-coins",
            minimizable: false,
            resizable: false
        },
        position: {
            width: 480,
            height: "auto"
        },
        form: {
            handler: AcquisitionDialog.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        },
        actions: {
            toggleModifier: AcquisitionDialog.#toggleModifier,
            roll: AcquisitionDialog.#roll
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/dialog/acquisition-dialog.hbs"
        }
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The actor making the acquisition
     * @type {Actor}
     */
    actor = null;

    /**
     * The item being acquired (optional)
     * @type {object|null}
     */
    item = null;

    /**
     * Selected common modifiers
     * @type {Set<string>}
     */
    selectedModifiers = new Set();

    /**
     * Custom modifier value
     * @type {number}
     */
    customModifier = 0;

    /**
     * Resolve function for promise
     * @type {Function|null}
     */
    #resolve = null;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    /**
     * Create acquisition dialog
     * @param {Actor} actor  The actor
     * @param {object} options  Additional options
     */
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this.item = options.item || null;
    }

    /* -------------------------------------------- */

    /** @override */
    get title() {
        return this.item 
            ? `Acquire: ${this.item.name}` 
            : "Profit Factor Acquisition Test";
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Profit Factor
        const pf = this.actor.system.rogueTrader?.profitFactor || { current: 0, starting: 0 };
        context.profitFactor = {
            current: pf.current,
            starting: pf.starting
        };

        // Item data
        if (this.item) {
            context.item = {
                name: this.item.name,
                img: this.item.img,
                type: this.item.type,
                availability: this.item.system?.availability || "Common",
                craftsmanship: this.item.system?.craftsmanship || "Common",
                cost: this.item.system?.cost || 0
            };

            // Calculate availability modifier
            context.availabilityModifier = this._getAvailabilityModifier(context.item.availability);
            context.craftsmanshipModifier = this._getCraftsmanshipModifier(context.item.craftsmanship);
        } else {
            context.item = null;
            context.availabilityModifier = 0;
            context.craftsmanshipModifier = 0;
        }

        // Common modifiers
        context.commonModifiers = [
            { key: "haggling", label: "Haggling Successful", value: 10, selected: this.selectedModifiers.has("haggling") },
            { key: "rushed", label: "Rushed Purchase", value: -10, selected: this.selectedModifiers.has("rushed") },
            { key: "supplier", label: "Known Supplier", value: 5, selected: this.selectedModifiers.has("supplier") },
            { key: "bulk", label: "Bulk Purchase", value: -5, selected: this.selectedModifiers.has("bulk") },
            { key: "rare", label: "Rare Market", value: -10, selected: this.selectedModifiers.has("rare") }
        ];

        // Calculate totals
        context.baseModifier = context.availabilityModifier + context.craftsmanshipModifier;
        
        let commonTotal = 0;
        for (const mod of context.commonModifiers) {
            if (mod.selected) commonTotal += mod.value;
        }
        context.commonTotal = commonTotal;
        
        context.customModifier = this.customModifier;
        context.totalModifier = context.baseModifier + commonTotal + this.customModifier;
        context.finalTarget = pf.current + context.totalModifier;

        // Recent acquisitions
        context.recentAcquisitions = this._getRecentAcquisitions();

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Get availability modifier
     * @param {string} availability  Availability rating
     * @returns {number}  Modifier value
     * @private
     */
    _getAvailabilityModifier(availability) {
        const modifiers = {
            "Abundant": 30,
            "Plentiful": 20,
            "Common": 10,
            "Average": 0,
            "Scarce": -10,
            "Rare": -20,
            "Very Rare": -30,
            "Extremely Rare": -40,
            "Near Unique": -50,
            "Unique": -60
        };
        return modifiers[availability] || 0;
    }

    /* -------------------------------------------- */

    /**
     * Get craftsmanship modifier
     * @param {string} craftsmanship  Craftsmanship quality
     * @returns {number}  Modifier value
     * @private
     */
    _getCraftsmanshipModifier(craftsmanship) {
        const modifiers = {
            "Poor": 10,
            "Common": 0,
            "Good": -10,
            "Best": -20
        };
        return modifiers[craftsmanship] || 0;
    }

    /* -------------------------------------------- */

    /**
     * Get recent acquisitions from actor flags
     * @returns {Array}  Recent acquisitions
     * @private
     */
    _getRecentAcquisitions() {
        const history = this.actor.getFlag("rogue-trader", "acquisitionHistory") || [];
        return history.slice(-5).reverse(); // Last 5, most recent first
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Toggle a common modifier
     * @this {AcquisitionDialog}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #toggleModifier(event, target) {
        const key = target.dataset.modifier;
        
        if (this.selectedModifiers.has(key)) {
            this.selectedModifiers.delete(key);
        } else {
            this.selectedModifiers.add(key);
        }

        await this.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Handle form submission
     * @this {AcquisitionDialog}
     * @param {Event} event
     * @param {HTMLFormElement} form
     * @param {FormDataExtended} formData
     */
    static async #onSubmit(event, form, formData) {
        // Get custom modifier
        this.customModifier = parseInt(formData.object.customModifier) || 0;
        
        // This will trigger roll
        return true;
    }

    /* -------------------------------------------- */

    /**
     * Roll the acquisition test
     * @this {AcquisitionDialog}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #roll(event, target) {
        event.preventDefault();

        // Get form data
        const form = this.element;
        const formData = new FormDataExtended(form);
        this.customModifier = parseInt(formData.object.customModifier) || 0;

        // Calculate final target
        const context = await this._prepareContext({});
        const finalTarget = context.finalTarget;

        // Roll d100
        const roll = await new Roll("1d100").evaluate();
        const success = roll.total <= finalTarget;
        const dos = Math.floor((finalTarget - roll.total) / 10);

        // Log acquisition
        await this._logAcquisition({
            item: this.item,
            roll: roll.total,
            target: finalTarget,
            success,
            dos,
            timestamp: Date.now()
        });

        // Create chat message
        await this._createAcquisitionMessage({
            roll,
            target: finalTarget,
            success,
            dos,
            item: this.item,
            modifiers: {
                base: context.baseModifier,
                common: context.commonTotal,
                custom: this.customModifier
            }
        });

        // On success, add item to inventory
        if (success && this.item) {
            await this.actor.createEmbeddedDocuments("Item", [this.item]);
            ui.notifications.info(`Acquired ${this.item.name}`);
        }

        // Critical failure: reduce PF
        if (dos <= -3) {
            const newPF = Math.max(0, this.actor.system.rogueTrader.profitFactor.current - 1);
            await this.actor.update({ "system.rogueTrader.profitFactor.current": newPF });
            ui.notifications.warn(`Critical failure! Profit Factor reduced to ${newPF}`);
        }

        // Resolve and close
        if (this.#resolve) {
            this.#resolve({
                success,
                dos,
                roll: roll.total,
                target: finalTarget
            });
        }

        await this.close();
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Log acquisition to actor flags
     * @param {object} data  Acquisition data
     * @private
     */
    async _logAcquisition(data) {
        const history = this.actor.getFlag("rogue-trader", "acquisitionHistory") || [];
        history.push(data);
        
        // Keep last 20
        if (history.length > 20) history.shift();
        
        await this.actor.setFlag("rogue-trader", "acquisitionHistory", history);
    }

    /* -------------------------------------------- */

    /**
     * Create acquisition chat message
     * @param {object} data  Message data
     * @private
     */
    async _createAcquisitionMessage(data) {
        const content = await renderTemplate(
            "systems/rogue-trader/templates/chat/acquisition-test.hbs",
            {
                actor: this.actor,
                item: data.item,
                roll: data.roll.total,
                target: data.target,
                success: data.success,
                dos: data.dos,
                modifiers: data.modifiers
            }
        );

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content,
            flavor: "Profit Factor Acquisition Test",
            type: CONST.CHAT_MESSAGE_TYPES.ROLL,
            rolls: [data.roll]
        });
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Wait for dialog to complete
     * @returns {Promise<object|null>}  Result or null if cancelled
     */
    async wait() {
        return new Promise((resolve) => {
            this.#resolve = resolve;
        });
    }

    /* -------------------------------------------- */

    /** @override */
    async close(options = {}) {
        if (this.#resolve && !options._skipResolve) {
            this.#resolve(null);
        }
        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Static Helper                               */
    /* -------------------------------------------- */

    /**
     * Show acquisition dialog for actor
     * @param {Actor} actor  The actor
     * @param {object} item  Optional item to acquire
     * @returns {Promise<object|null>}  Result or null
     * @static
     */
    static async show(actor, item = null) {
        const dialog = new AcquisitionDialog(actor, { item });
        dialog.render(true);
        return dialog.wait();
    }
}
